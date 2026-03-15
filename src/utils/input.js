'use strict';

const { exec, execSync } = require('child_process');
const os = require('os');

/**
 * Cross-platform keystroke & clipboard backend.
 *
 * Detects: Linux (X11 → xdotool, Wayland/TTY → ydotool),
 *          macOS (osascript), Windows (PowerShell).
 *
 * All functions return shell command strings (for oplog drain)
 * or execute directly (clipboard).
 */

let _backend = null;
let _logFn = null;

const BACKENDS = {
  xdotool: {
    name: 'xdotool',
    typeText: (text, esc) => `xdotool type --clearmodifiers -- '${esc(text)}'`,
    deleteChars: (n) => `xdotool key --clearmodifiers --repeat ${Math.min(n, 500)} BackSpace`,
    compound: (delCount, text, esc) => {
      const del = delCount > 0 ? `xdotool key --clearmodifiers --repeat ${Math.min(delCount, 500)} BackSpace` : null;
      const typ = text ? `xdotool type --clearmodifiers -- '${esc(text)}'` : null;
      if (del && typ) return `${del} && ${typ}`;
      return del || typ || 'true';
    },
    pressKey: (key, safeKey) => `xdotool key --clearmodifiers ${safeKey(key)}`,
    paste: () => `xdotool key --clearmodifiers ctrl+v`,
    clipboard: (text, cb) => {
      const p = exec('xclip -selection clipboard', cb);
      p.stdin.write(text);
      p.stdin.end();
    },
  },
  ydotool: {
    name: 'ydotool',
    typeText: (text, esc) => `ydotool type -- '${esc(text)}'`,
    deleteChars: (n) => {
      const cmds = [];
      let remaining = n;
      while (remaining > 0) {
        const batch = Math.min(remaining, 100);
        const keys = Array(batch).fill('14:1 14:0').join(' ');
        cmds.push(`ydotool key ${keys}`);
        remaining -= batch;
      }
      return cmds.join(' && ');
    },
    compound: (delCount, text, esc) => {
      const parts = [];
      if (delCount > 0) {
        let remaining = delCount;
        while (remaining > 0) {
          const batch = Math.min(remaining, 100);
          const keys = Array(batch).fill('14:1 14:0').join(' ');
          parts.push(`ydotool key ${keys}`);
          remaining -= batch;
        }
      }
      if (text) parts.push(`ydotool type -- '${esc(text)}'`);
      return parts.length > 0 ? parts.join(' && ') : 'true';
    },
    pressKey: (key, safeKey) => {
      const keyMap = {
        'Return': '28', 'Tab': '15', 'space': '57', 'BackSpace': '14',
        'Escape': '1', 'Up': '103', 'Down': '108', 'Left': '105', 'Right': '106',
        'Home': '102', 'End': '107', 'Delete': '111',
        'ctrl+v': '29:1 47:1 47:0 29:0', 'ctrl+c': '29:1 46:1 46:0 29:0',
        'ctrl+a': '29:1 30:1 30:0 29:0', 'ctrl+z': '29:1 44:1 44:0 29:0',
      };
      const mapped = keyMap[key] || keyMap[safeKey(key)];
      if (mapped) return `ydotool key ${mapped.includes(':') ? mapped : mapped + ':1 ' + mapped + ':0'}`;
      return `ydotool type '${key}'`;
    },
    paste: () => 'ydotool key 29:1 47:1 47:0 29:0',
    clipboard: (text, cb) => {
      const p = exec('wl-copy 2>/dev/null || xclip -selection clipboard', cb);
      p.stdin.write(text);
      p.stdin.end();
    },
  },
  osascript: {
    name: 'osascript',
    typeText: (text, esc) => {
      const safe = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `osascript -e 'tell application "System Events" to keystroke "${safe}"'`;
    },
    deleteChars: (n) => {
      const count = Math.min(n, 500);
      // Single AppleScript with repeat loop — one process, not N
      return `osascript -e 'tell application "System Events" to repeat ${count} times' -e 'key code 51' -e 'end repeat'`;
    },
    compound: (delCount, text, esc) => {
      // Single osascript: delete N then type text
      const parts = ['tell application "System Events"'];
      if (delCount > 0) {
        parts.push(`repeat ${Math.min(delCount, 500)} times`);
        parts.push('key code 51');
        parts.push('end repeat');
      }
      if (text) {
        const safe = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        parts.push(`keystroke "${safe}"`);
      }
      parts.push('end tell');
      return `osascript ${parts.map(p => `-e '${p}'`).join(' ')}`;
    },
    pressKey: (key) => {
      const keyMap = {
        'Return': 'key code 36', 'Tab': 'key code 48', 'BackSpace': 'key code 51',
        'Escape': 'key code 53', 'space': 'key code 49',
        'Up': 'key code 126', 'Down': 'key code 125', 'Left': 'key code 123', 'Right': 'key code 124',
        'Delete': 'key code 117', 'Home': 'key code 115', 'End': 'key code 119',
      };
      const mapped = keyMap[key];
      if (mapped) return `osascript -e 'tell application "System Events" to ${mapped}'`;
      if (key.startsWith('ctrl+')) {
        const ch = key.slice(5);
        return `osascript -e 'tell application "System Events" to keystroke "${ch}" using command down'`;
      }
      return `osascript -e 'tell application "System Events" to keystroke "${key}"'`;
    },
    paste: () => `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
    clipboard: (text, cb) => {
      const p = exec('pbcopy', cb);
      p.stdin.write(text);
      p.stdin.end();
    },
  },
  powershell: {
    name: 'powershell',
    typeText: (text) => {
      const safe = text.replace(/'/g, "''").replace(/`/g, '``');
      return `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safe}')"`;
    },
    deleteChars: (n) => {
      const bs = '{BS ' + Math.min(n, 500) + '}';
      return `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${bs}')"`;
    },
    compound: (delCount, text) => {
      // Single PowerShell invocation: delete then type
      const parts = [`Add-Type -AssemblyName System.Windows.Forms`];
      if (delCount > 0) {
        const bs = '{BS ' + Math.min(delCount, 500) + '}';
        parts.push(`[System.Windows.Forms.SendKeys]::SendWait('${bs}')`);
      }
      if (text) {
        const safe = text.replace(/'/g, "''").replace(/`/g, '``');
        parts.push(`[System.Windows.Forms.SendKeys]::SendWait('${safe}')`);
      }
      return `powershell -NoProfile -Command "${parts.join('; ')}"`;
    },
    pressKey: (key) => {
      const keyMap = {
        'Return': '{ENTER}', 'Tab': '{TAB}', 'BackSpace': '{BS}',
        'Escape': '{ESC}', 'space': ' ',
        'Up': '{UP}', 'Down': '{DOWN}', 'Left': '{LEFT}', 'Right': '{RIGHT}',
        'Delete': '{DEL}', 'Home': '{HOME}', 'End': '{END}',
      };
      const mapped = keyMap[key] || key;
      if (key.startsWith('ctrl+')) {
        const ch = key.slice(5);
        return `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^${ch}')"`;
      }
      return `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${mapped}')"`;
    },
    paste: () => `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
    clipboard: (text, cb) => {
      const safe = text.replace(/'/g, "''");
      exec(`powershell -NoProfile -Command "Set-Clipboard -Value '${safe}'"`, cb);
    },
  },
};

/**
 * Detect the best available backend for the current platform.
 */
function detect(logFn) {
  _logFn = logFn || (() => {});
  const platform = os.platform();

  if (platform === 'win32') {
    _backend = BACKENDS.powershell;
    _logFn(`Input backend: PowerShell (Windows)`, 'info');
    return _backend;
  }

  if (platform === 'darwin') {
    _backend = BACKENDS.osascript;
    _logFn(`Input backend: osascript (macOS)`, 'info');
    return _backend;
  }

  // Linux — check for X11 display first
  if (process.env.DISPLAY) {
    try {
      execSync('which xdotool', { stdio: 'ignore' });
      _backend = BACKENDS.xdotool;
      _logFn(`Input backend: xdotool (X11, DISPLAY=${process.env.DISPLAY})`, 'info');
      return _backend;
    } catch {}
  }

  // Wayland
  if (process.env.WAYLAND_DISPLAY) {
    try {
      execSync('which ydotool', { stdio: 'ignore' });
      _backend = BACKENDS.ydotool;
      _logFn(`Input backend: ydotool (Wayland)`, 'info');
      return _backend;
    } catch {}
  }

  // No display — try ydotool (works on TTY via uinput)
  try {
    execSync('which ydotool', { stdio: 'ignore' });
    _backend = BACKENDS.ydotool;
    _logFn(`Input backend: ydotool (TTY/headless)`, 'info');
    return _backend;
  } catch {}

  // Last resort — try xdotool anyway
  try {
    execSync('which xdotool', { stdio: 'ignore' });
    _backend = BACKENDS.xdotool;
    _logFn(`Input backend: xdotool (no DISPLAY set — may not work)`, 'warn');
    return _backend;
  } catch {}

  _backend = null;
  _logFn('No input backend found! Install xdotool, ydotool, or run on macOS/Windows.', 'warn');
  return null;
}

/** Get the current backend (call detect() first). */
function getBackend() { return _backend; }

/** Build a "type text" shell command. */
function typeCmd(text, escapeFn) {
  if (!_backend) return `echo "no input backend" >&2`;
  return _backend.typeText(text, escapeFn);
}

/** Build a "delete N chars" shell command. */
function deleteCmd(n) {
  if (!_backend) return `echo "no input backend" >&2`;
  return _backend.deleteChars(n);
}

/**
 * Build a compound "delete N then type text" command — single shell exec.
 * Uses backend-native compound if available (osascript, powershell),
 * falls back to && chaining (xdotool, ydotool).
 */
function compoundCmd(deleteCount, text, escapeFn) {
  if (!_backend) return `echo "no input backend" >&2`;
  if (_backend.compound) return _backend.compound(deleteCount, text, escapeFn);
  // Fallback: chain delete + type
  const del = deleteCount > 0 ? _backend.deleteChars(deleteCount) : null;
  const typ = text ? _backend.typeText(text, escapeFn) : null;
  if (del && typ) return `${del} && ${typ}`;
  return del || typ || 'true';
}

/** Build a "press key" shell command. */
function keyCmd(key, safeKeyFn) {
  if (!_backend) return `echo "no input backend" >&2`;
  return _backend.pressKey(key, safeKeyFn);
}

/** Build a "paste from clipboard" shell command. */
function pasteCmd() {
  if (!_backend) return `echo "no input backend" >&2`;
  return _backend.paste();
}

/** Copy text to clipboard (executes immediately). */
function toClipboard(text, cb) {
  if (!_backend) { cb && cb(new Error('no input backend')); return; }
  _backend.clipboard(text, cb);
}

module.exports = { detect, getBackend, typeCmd, deleteCmd, compoundCmd, keyCmd, pasteCmd, toClipboard, BACKENDS };
