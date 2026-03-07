# AirMic

Turn your phone into a wireless microphone that types speech directly into your desktop. Your phone handles speech recognition, and the text is typed into whatever window is focused — no drivers, no Bluetooth, no pairing headaches.

```
Phone (browser) → WebSocket → Desktop (types into focused window)
```

## How it works

1. Run `npx airmic` or `airmic` — a setup wizard runs on first launch
2. A TUI appears with a QR code
3. Scan the QR code with your phone's camera
4. Approve the device via 6-digit PIN
5. Tap the mic button and start talking
6. Text appears in your focused desktop window in real-time

Works over your local WiFi network, or over the internet via a relay server.

## Install

```bash
# Run directly (no install)
npx airmic

# Or install globally
npm install -g airmic
airmic
```

On first run, a setup wizard asks for connection mode (local/relay/both), port, network interface, and optional AI config. Run `airmic setup` anytime to reconfigure.

## Platform support

| Component | Linux (X11) | Linux (Wayland/TTY) | macOS | Windows |
|-----------|-------------|---------------------|-------|---------|
| Desktop typing | ✅ xdotool | ✅ ydotool | ✅ osascript | ✅ PowerShell |
| Clipboard mode | ✅ xclip | ✅ wl-copy | ✅ pbcopy | ✅ Set-Clipboard |
| Phone UI (browser) | ✅ | ✅ | ✅ | ✅ |
| Relay server | ✅ | ✅ | ✅ | ✅ |

The input backend is auto-detected at startup. AirMic picks the best available tool for your platform and display server.

### Requirements

**Linux (X11):** `sudo apt install xdotool xclip`
**Linux (Wayland/TTY):** `sudo apt install ydotool` + `sudo ydotoold &`
**macOS:** Works out of the box (osascript + pbcopy)
**Windows:** Works out of the box (PowerShell + SendKeys)

Node.js 18+ required on all platforms.

## Headless mode (daemon)

Run as a background daemon — useful for servers, SSH sessions, or headless machines:

```bash
airmic headless on relay    # Start daemon in relay mode
airmic headless on local    # Start daemon in local-only mode
airmic headless on          # Start daemon (uses config)
airmic headless off         # Stop daemon
airmic status               # Show status, URLs, pending PINs
airmic approve <PIN>        # Approve a new device by PIN
```

The daemon prints a QR code and relay URL on startup, then detaches. Approve devices from another terminal with `airmic approve`.

## Phone UI

The phone gets a clean, mobile-optimized web app with:

- Large mic button — tap to start/stop, or use push-to-talk (Hold) mode
- Live transcript display with interim results
- Pause, Clipboard, AI, and Hold toggle buttons
- Language selector (13 languages)
- History of sent phrases with resend

No app install needed — it's just a web page served over HTTPS.

## Connection modes

### Local network (same WiFi)

The default. Your phone connects directly to your desktop over your local network. Lowest latency, no internet required.

### Relay server (internet)

For when your phone isn't on the same network as your desktop (mobile data, different WiFi, etc.). A relay server on a VPS brokers the WebSocket connection.

AirMic Cloud is included as a default relay. To use it, press `Ctrl+K` → Relay Servers → select AirMic Cloud.

The phone will automatically try a direct local connection first and fall back to the relay if your desktop isn't reachable locally.

## Voice commands

Say these phrases and they'll be executed instead of typed:

| Command | Action |
|---------|--------|
| "scratch that" | Delete the last phrase |
| "undo" / "undo that" | Ctrl+Z |
| "redo" / "redo that" | Ctrl+Y |
| "new line" / "enter" | Enter key |
| "new paragraph" | Double Enter |
| "tab" | Tab key |
| "select all" | Ctrl+A |
| "copy" / "cut" / "paste" | Ctrl+C / Ctrl+X / Ctrl+V |
| "delete" / "backspace" | Delete / BackSpace key |
| "go up/down/left/right" | Arrow keys |
| "go home" / "go end" | Home / End keys |
| "period" / "comma" / "question mark" | Punctuation |
| "open bracket" / "close bracket" | ( ) |
| "open quote" / "close quote" | " " |
| "dash" / "colon" / "semicolon" | Punctuation |
| "hashtag" / "at sign" / "dollar sign" | Symbols |

Plus many more — see `src/connection/voice-commands.js` for the full list.

### Custom voice commands

Add your own in `config.json`:

```json
{
  "voiceCommandsExtra": {
    "sign off": { "action": "type", "text": "Best regards,\nJohn" },
    "save file": { "action": "key", "key": "ctrl+s" }
  }
}
```

Actions: `type` (insert text), `key` (press key combo), `scratch` (delete last phrase).

## TUI keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+K` | Command palette (access all actions) |
| `Ctrl+P` | Pause / resume |
| `Ctrl+E` | Relay server manager |
| `Ctrl+A` | AI settings |
| `Ctrl+R` | Add word replacement |
| `Ctrl+D` | Delete word replacement |
| `Ctrl+L` | Clear log |
| `Ctrl+Q` | Quit |

## AI summarize

Spoken text is typed immediately, then silently replaced with an AI-cleaned version in the background. Useful for turning rambling speech into clean prose.

Supports OpenAI, Anthropic, and Google AI.

### Setup

Run `airmic setup` and enable AI when prompted, or configure interactively with `Ctrl+A` in the TUI.

API keys are stored in `~/.airmic/.env`:

```bash
AIRMIC_AI_KEY=sk-your-key-here
```

Toggle AI on/off from the TUI (`Ctrl+A`) or from the phone's AI button.

| Provider | Default model |
|----------|--------------|
| OpenAI | gpt-4o-mini |
| Anthropic | claude-3-7-haiku-latest |
| Google | gemini-2.5-flash |

You can override the model and system prompt in AI settings.

## Word replacements

Auto-replace words or phrases as they're typed. Useful for fixing consistent misrecognitions or expanding abbreviations.

- `Ctrl+R` to add a replacement (e.g., "gonna" → "going to")
- `Ctrl+D` to remove one

Replacements are saved to config and apply to all future transcriptions.

## Config

Config is stored in `~/.airmic/config.json` (auto-generated on first run or via `airmic setup`).

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `4000` | Local HTTPS port |
| `bindAddress` | `""` | Bind to specific IP (blank = auto-detect) |
| `language` | `en-US` | Speech recognition language (BCP 47) |
| `clipboardMode` | `false` | Paste via clipboard instead of keystroke injection |
| `wordReplacements` | `{}` | Auto-replace map (e.g., `{"gonna": "going to"}`) |
| `voiceCommandsExtra` | `{}` | Custom voice commands |
| `relayUrl` | `""` | Active relay server URL |
| `relaySecret` | `""` | Must match `RELAY_SECRET` on the relay |
| `relayServers` | `[...]` | Saved relay server list |
| `aiEnabled` | `false` | Enable AI text cleanup |
| `aiProvider` | `openai` | `openai`, `anthropic`, or `google` |
| `aiModel` | `""` | Blank = provider default |
| `aiPrompt` | *(built-in)* | System prompt for AI rewriting |

API keys are stored in `~/.airmic/.env`. See `.env.example`.

## Self-hosting a relay server

### 1. Provision a VPS

Any VPS with Node.js 18+ works. AWS Lightsail $3.50/month (512MB) is plenty. Open port 4001 in the firewall.

### 2. Deploy

```bash
# On your VPS (as root)
git clone https://github.com/code-pumpkin/airmic.git /tmp/wmic
cd /tmp/wmic/relay
bash deploy.sh
```

`deploy.sh` installs Node, copies files to `/opt/wireless-mic-relay`, generates a self-signed cert, and starts a systemd service.

### 3. Set a relay secret (recommended)

Edit `/etc/systemd/system/wireless-mic-relay.service`:

```ini
Environment=RELAY_SECRET=your-strong-secret-here
```

```bash
systemctl daemon-reload && systemctl restart wireless-mic-relay
```

### 4. Use a real TLS cert (recommended)

```bash
apt install certbot
certbot certonly --standalone -d yourdomain.com
```

In the service file:

```ini
Environment=CERT_DIR=/etc/letsencrypt/live/yourdomain.com
```

### 5. Connect your desktop

Press `Ctrl+K` → Relay Servers → Add custom server. Enter your relay URL (`wss://yourdomain.com:4001`) and secret.

## Security

- All connections are TLS-encrypted (HTTPS + WSS)
- Phone access requires a random URL token (shared via QR code)
- New devices must be approved via 6-digit PIN confirmation on the desktop
- Returning devices are remembered via cryptographic device tokens
- Per-socket message rate limiting (30 msg/sec)
- Connection rate limiting with bot detection (IPs that never register get blocked)
- Security headers: HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy
- Control characters stripped before typing
- API keys stored in `~/.airmic/.env`, not in config
- Sessions auto-expire after 90 days

## Troubleshooting

**Phone can't connect / cert error**
Accept the self-signed certificate warning in your phone's browser. On some phones you need to visit the HTTPS URL directly first, accept the warning, then reload.

**"Speech recognition not supported"**
Use Chrome or Safari. Firefox doesn't support the Web Speech API.

**Text not appearing on desktop (Linux X11)**
Make sure `xdotool` is installed and you're running X11. Check that the target window is focused.

**Text not appearing on desktop (Linux TTY/Wayland)**
Install `ydotool` and start the daemon: `sudo ydotoold &`. AirMic auto-detects it.

**Text not appearing on desktop (macOS/Windows)**
Should work out of the box. If not, set `clipboardMode: true` in config.

**Android "pyramid" effect (repeated text)**
This is handled automatically — AirMic uses single-shot recognition mode on Android with auto-restart.

**Relay connection fails**
Check that port 4001 is open on the VPS, the relay secret matches, and the service is running (`systemctl status wireless-mic-relay`).

**"No input backend found"**
Install `xdotool` (X11), `ydotool` (Wayland/TTY), or run on macOS/Windows.

## License

MIT
