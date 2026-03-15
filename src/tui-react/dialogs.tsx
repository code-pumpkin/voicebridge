import { useState } from 'react';
import { Theme } from './theme';

interface DialogProps {
  theme: Theme;
  onClose: () => void;
}

// Command Palette
interface CommandPaletteProps extends DialogProps {
  onCommand: (cmd: string) => void;
}

export function CommandPalette({ theme, onClose, onCommand }: CommandPaletteProps) {
  const items = [
    { label: 'Toggle Pause', action: 'pause' },
    { label: 'Relay Servers', action: 'relay' },
    { label: 'AI Settings', action: 'ai' },
    { label: 'Add Word Replace', action: 'replace' },
    { label: 'Delete Word Replace', action: 'delreplace' },
    { label: 'Clear Log', action: 'clear' },
    { label: 'Quit', action: 'quit' },
  ];

  const [selected, setSelected] = useState(0);

  return (
    <box position="absolute" top="center" left="center" width={36} height={items.length + 2}
      border borderColor={theme.border} backgroundColor={theme.bgPanel}>
      {items.map((item, i) => (
        <text key={i} fg={i === selected ? theme.bg : theme.textMuted}
          backgroundColor={i === selected ? theme.primary : theme.bgPanel}>
          {'  '}{item.label}
        </text>
      ))}
    </box>
  );
}

// Relay Manager
interface RelayManagerProps extends DialogProps {
  config: any;
  onSave: (config: any) => void;
}

export function RelayManager({ theme, config, onClose, onSave }: RelayManagerProps) {
  const [selected, setSelected] = useState(0);
  const servers = config.relayServers || [];

  return (
    <box position="absolute" top="center" left="center" width={60} height={20}
      border borderColor={theme.border} backgroundColor={theme.bgPanel}
      paddingLeft={2} paddingRight={2}>
      <box flexDirection="column">
        <text fg={theme.purple}><strong>Relay Servers</strong></text>
        <text fg={theme.textDim}>Select, add, or remove relay servers</text>
        <box height={1} />
        {servers.map((s: any, i: number) => {
          const active = s.url === config.relayUrl ? ` ● ` : '   ';
          return (
            <text key={i} fg={i === selected ? theme.text : theme.textMuted}
              backgroundColor={i === selected ? theme.bgElement : theme.bgPanel}>
              {'  '}{s.name || s.url.slice(0, 35)}{active}
            </text>
          );
        })}
        <text fg={theme.cyan}>  + Add custom server</text>
        <text fg={theme.red}>  - Remove a server</text>
        <text fg={theme.yellow}>  × Disable relay</text>
        <box flexGrow={1} />
        <text fg={theme.textDim}>Enter to select · Esc to cancel</text>
      </box>
    </box>
  );
}

// AI Settings
interface AISettingsProps extends DialogProps {
  config: any;
  onSave: (config: any) => void;
}

export function AISettings({ theme, config, onClose, onSave }: AISettingsProps) {
  const [provider, setProvider] = useState(config.aiProvider || 'openai');
  const [enabled, setEnabled] = useState(config.aiEnabled || false);

  return (
    <box position="absolute" top="center" left="center" width={60} height={18}
      border borderColor={theme.border} backgroundColor={theme.bgPanel}
      paddingLeft={2} paddingRight={2}>
      <box flexDirection="column">
        <text fg={theme.green}><strong>AI Settings</strong></text>
        <box height={1} />
        <text fg={theme.textMuted}>Provider: <span fg={theme.green}>{provider}</span> <span fg={theme.textDim}>[←/→]</span></text>
        <box height={1} />
        <text fg={theme.textMuted}>API Key (saved to .env):</text>
        <box height={1} backgroundColor={theme.bgElement} paddingLeft={1}>
          <text fg={theme.text}>••••••</text>
        </box>
        <box height={1} />
        <text fg={theme.textMuted}>Model (blank = default):</text>
        <box height={1} backgroundColor={theme.bgElement} paddingLeft={1}>
          <text fg={theme.text}>{config.aiModel || ''}</text>
        </box>
        <box height={1} />
        <text fg={theme.textMuted}>AI: <span fg={enabled ? theme.green : theme.red}>{enabled ? 'enabled' : 'disabled'}</span> <span fg={theme.textDim}>[Ctrl+T]</span></text>
        <box flexGrow={1} />
        <text fg={theme.textDim}>Tab fields · Enter save · Esc cancel</text>
      </box>
    </box>
  );
}

// Word Replacement Add
interface AddReplacementProps extends DialogProps {
  onSave: (from: string, to: string) => void;
}

export function AddReplacement({ theme, onClose, onSave }: AddReplacementProps) {
  return (
    <box position="absolute" top="center" left="center" width={50} height={10}
      border borderColor={theme.border} backgroundColor={theme.bgPanel}
      paddingLeft={2} paddingRight={2}>
      <box flexDirection="column">
        <text fg={theme.yellow}><strong>Add Replacement</strong></text>
        <box height={1} />
        <text fg={theme.textMuted}>Say this:</text>
        <box height={1} backgroundColor={theme.bgElement} paddingLeft={1}>
          <text fg={theme.text}></text>
        </box>
        <box height={1} />
        <text fg={theme.textMuted}>Type this:</text>
        <box height={1} backgroundColor={theme.bgElement} paddingLeft={1}>
          <text fg={theme.text}></text>
        </box>
        <box flexGrow={1} />
        <text fg={theme.textDim}>Tab switch · Enter save · Esc cancel</text>
      </box>
    </box>
  );
}

// Word Replacement Delete
interface DeleteReplacementProps extends DialogProps {
  replacements: Record<string, string>;
  onDelete: (key: string) => void;
}

export function DeleteReplacement({ theme, replacements, onClose, onDelete }: DeleteReplacementProps) {
  const [selected, setSelected] = useState(0);
  const keys = Object.keys(replacements);

  return (
    <box position="absolute" top="center" left="center" width={50} height={Math.min(keys.length + 4, 20)}
      border borderColor={theme.red} backgroundColor={theme.bgPanel}>
      <box flexDirection="column" paddingLeft={2} paddingRight={2}>
        <text fg={theme.red}><strong>Remove Replacement</strong></text>
        <box height={1} />
        {keys.map((k, i) => (
          <text key={i} fg={i === selected ? theme.text : theme.textMuted}
            backgroundColor={i === selected ? '#3a1a1a' : theme.bgPanel}>
            {'  '}{k}  →  {replacements[k]}
          </text>
        ))}
      </box>
    </box>
  );
}
