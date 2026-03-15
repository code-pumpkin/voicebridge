import { useState } from 'react';
import { useKeyboard, useRenderer } from '@opentui/react';
import { Theme } from './theme';
import { AppState, LogEntry, QRInfo } from './types';
import { RelayManager, AISettings, AddReplacement, DeleteReplacement } from './dialogs';

interface AppProps {
  theme: Theme;
  config: any;
  appState: AppState;
  logs: LogEntry[];
  liveText: string;
  liveFinal: boolean;
  qrInfo: QRInfo | null;
  showQR: boolean;
  onCommand?: (cmd: string) => void;
  onClearLogs?: () => void;
}

type Tab = 'status' | 'devices' | 'settings' | 'logs';

export function App({ 
  theme, 
  config, 
  appState, 
  logs, 
  liveText, 
  liveFinal, 
  qrInfo, 
  showQR, 
  onCommand,
  onClearLogs
}: AppProps) {
  const renderer = useRenderer();
  const [startTime] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [activeDialog, setActiveDialog] = useState<string | null>(null);

  // Keyboard shortcuts
  useKeyboard((key) => {
    if (key.ctrl && key.name === 'q') {
      renderer.destroy();
    } else if (key.name === 'tab' && !key.shift) {
      const tabs: Tab[] = ['status', 'devices', 'settings', 'logs'];
      const idx = tabs.indexOf(activeTab);
      setActiveTab(tabs[(idx + 1) % tabs.length]);
    } else if (key.name === 'tab' && key.shift) {
      const tabs: Tab[] = ['status', 'devices', 'settings', 'logs'];
      const idx = tabs.indexOf(activeTab);
      setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
    } else if (key.name === '1') {
      setActiveTab('status');
    } else if (key.name === '2') {
      setActiveTab('devices');
    } else if (key.name === '3') {
      setActiveTab('settings');
    } else if (key.name === '4') {
      setActiveTab('logs');
    } else if (key.ctrl && key.name === 'p') {
      onCommand?.('pause');
    } else if (key.ctrl && key.name === 'l') {
      onClearLogs?.();
    } else if (key.name === 'escape' && activeDialog) {
      setActiveDialog(null);
    } else if (activeTab === 'settings') {
      // Settings tab shortcuts
      if (key.name === 'a') {
        setActiveDialog('ai');
      } else if (key.name === 'r') {
        setActiveDialog('relay');
      } else if (key.name === '+' || key.name === '=') {
        setActiveDialog('add-replacement');
      } else if (key.name === '-' || key.name === '_') {
        setActiveDialog('delete-replacement');
      }
    }
  });

  // Format uptime
  const formatUptime = () => {
    const s = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  const renderTabBar = () => {
    const tabs: { id: Tab; label: string; key: string }[] = [
      { id: 'status', label: 'Status', key: '1' },
      { id: 'devices', label: 'Devices', key: '2' },
      { id: 'settings', label: 'Settings', key: '3' },
      { id: 'logs', label: 'Logs', key: '4' },
    ];

    return (
      <box height={1} width="100%" backgroundColor={theme.bgPanel}>
        <text fg={theme.text}>
          {'  '}
          {tabs.map((tab, i) => (
            <>
              {i > 0 && <span fg={theme.border}>  </span>}
              <span 
                fg={activeTab === tab.id ? theme.primary : theme.textDim}
                bold={activeTab === tab.id}
              >
                {activeTab === tab.id && '▸ '}
                {tab.label}
                <span fg={theme.textDim}> ({tab.key})</span>
              </span>
            </>
          ))}
        </text>
      </box>
    );
  };

  const renderStatusTab = () => (
    <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={2}>
      {/* Connection Status */}
      <box flexDirection="column" paddingBottom={2}>
        <text fg={theme.primary} bold>Connection</text>
        <box height={1} />
        <text fg={theme.text}>
          {'  '}
          {appState.connectedCount > 0 ? (
            <>
              <span fg={theme.green}>●</span>
              {' '}
              <strong>{appState.connectedCount}</strong> device{appState.connectedCount > 1 ? 's' : ''} connected
            </>
          ) : (
            <>
              <span fg={theme.textDim}>○</span>
              {' '}
              Waiting for devices...
            </>
          )}
        </text>
        {appState.relayStatus !== 'disabled' && (
          <text fg={theme.text}>
            {'  '}
            <span fg={appState.relayStatus === 'connected' ? theme.green : theme.yellow}>
              {appState.relayStatus === 'connected' ? '▲' : '◐'}
            </span>
            {' '}
            Relay: <strong>{appState.relayStatus}</strong>
          </text>
        )}
      </box>

      {/* QR Code */}
      {showQR && qrInfo && (
        <box flexDirection="column" paddingBottom={2}>
          <text fg={theme.primary} bold>Scan to Connect</text>
          <box height={1} />
          <text fg={theme.textDim}>
            URL: <span fg={theme.text}>{qrInfo.displayUrl}</span>
          </text>
          <text fg={theme.textDim}>
            Mode: <span fg={qrInfo.mode === 'relay' ? theme.green : theme.cyan}>{qrInfo.mode}</span>
          </text>
          <box height={1} />
          {qrInfo.qrCode && (
            <text fg="#e8dcc8">{qrInfo.qrCode}</text>
          )}
        </box>
      )}

      {/* Live Preview */}
      <box flexDirection="column" flexGrow={1}>
        <text fg={theme.primary} bold>Live Transcript</text>
        <box height={1} />
        <box 
          flexGrow={1} 
          width="100%" 
          backgroundColor={theme.bgPanel} 
          paddingLeft={2} 
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={liveFinal ? theme.text : theme.textMuted}>
            {liveFinal ? <strong>{liveText}</strong> : <em>{liveText}</em>}
          </text>
        </box>
      </box>

      {/* Stats */}
      <box height={3} paddingTop={1}>
        <text fg={theme.textDim}>
          Uptime: <span fg={theme.text}>{formatUptime()}</span>
          {'  '}
          Words: <span fg={theme.text}>{appState.totalWords}</span>
          {'  '}
          Phrases: <span fg={theme.text}>{appState.totalPhrases}</span>
          {appState.paused && (
            <>
              {'  '}
              <span fg={theme.red}>■ PAUSED</span>
            </>
          )}
        </text>
      </box>
    </box>
  );

  const renderDevicesTab = () => (
    <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={2}>
      <text fg={theme.primary} bold>Connected Devices</text>
      <box height={1} />
      {appState.connectedCount > 0 ? (
        <text fg={theme.text}>
          {'  '}
          <span fg={theme.green}>●</span>
          {' '}
          {appState.connectedCount} device{appState.connectedCount > 1 ? 's' : ''} active
        </text>
      ) : (
        <text fg={theme.textDim}>
          {'  '}
          No devices connected. Scan the QR code to connect.
        </text>
      )}
      <box height={2} />
      <text fg={theme.textDim}>
        Press <span fg={theme.primary}>1</span> to view Status with QR code
      </text>
    </box>
  );

  const renderSettingsTab = () => (
    <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={2}>
      <text fg={theme.primary} bold>Settings</text>
      <box height={2} />

      {/* AI Settings */}
      <box flexDirection="column" paddingBottom={2}>
        <text fg={theme.text}>
          <span fg={theme.cyan}>●</span>
          {' '}
          <strong>AI Cleanup</strong>
          {'  '}
          <span fg={config.aiEnabled ? theme.green : theme.textDim}>
            {config.aiEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </text>
        {config.aiEnabled && (
          <text fg={theme.textDim}>
            {'    '}
            Provider: <span fg={theme.text}>{config.aiProvider}</span>
            {'  '}
            Model: <span fg={theme.text}>{config.aiModel || 'default'}</span>
          </text>
        )}
        <text fg={theme.textDim}>
          {'    '}
          Press <span fg={theme.primary}>A</span> to configure AI settings
        </text>
      </box>

      {/* Relay Settings */}
      <box flexDirection="column" paddingBottom={2}>
        <text fg={theme.text}>
          <span fg={theme.yellow}>▲</span>
          {' '}
          <strong>Relay Server</strong>
          {'  '}
          <span fg={appState.relayStatus !== 'disabled' ? theme.green : theme.textDim}>
            {appState.relayStatus !== 'disabled' ? appState.relayStatus : 'Not configured'}
          </span>
        </text>
        {config.relayUrl && (
          <text fg={theme.textDim}>
            {'    '}
            URL: <span fg={theme.text}>{config.relayUrl}</span>
          </text>
        )}
        <text fg={theme.textDim}>
          {'    '}
          Press <span fg={theme.primary}>R</span> to manage relay servers
        </text>
      </box>

      {/* Word Replacements */}
      <box flexDirection="column" paddingBottom={2}>
        <text fg={theme.text}>
          <span fg={theme.purple}>◆</span>
          {' '}
          <strong>Word Replacements</strong>
          {'  '}
          <span fg={theme.textDim}>
            {Object.keys(config.wordReplacements || {}).length} active
          </span>
        </text>
        <text fg={theme.textDim}>
          {'    '}
          Press <span fg={theme.primary}>+</span> to add, <span fg={theme.primary}>-</span> to remove
        </text>
      </box>

      {/* Other Settings */}
      <box flexDirection="column">
        <text fg={theme.text}>
          <span fg={theme.textDim}>◇</span>
          {' '}
          <strong>General</strong>
        </text>
        <text fg={theme.textDim}>
          {'    '}
          Language: <span fg={theme.text}>{config.language || 'en-US'}</span>
        </text>
        <text fg={theme.textDim}>
          {'    '}
          Clipboard mode: <span fg={theme.text}>{config.clipboardMode ? 'Yes' : 'No'}</span>
        </text>
        <text fg={theme.textDim}>
          {'    '}
          Port: <span fg={theme.text}>{config.port || 4000}</span>
        </text>
      </box>
    </box>
  );

  const renderLogsTab = () => (
    <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <text fg={theme.primary} bold>Activity Log</text>
        <text fg={theme.textDim}>
          Ctrl+L to clear
        </text>
      </box>
      <box flexDirection="column" flexGrow={1}>
        {logs.length === 0 ? (
          <text fg={theme.textDim}>No activity yet...</text>
        ) : (
          logs.slice(-30).map((log, i) => (
            <text key={i} fg={theme.text}>
              <span fg={theme.textDim}>{log.time}</span>
              {'  '}
              <span fg={getLogColor(log.type, theme)}>{getLogIcon(log.type)}</span>
              {' '}
              {log.text}
            </text>
          ))
        )}
      </box>
    </box>
  );

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.bg}>
      {/* Header */}
      <box height={1} width="100%" backgroundColor={theme.bgElement}>
        <text fg={theme.text}>
          {'  '}
          <strong>
            <span fg={theme.primary}>◉ AirMic</span>
          </strong>
          {'  '}
          <span fg={theme.textDim}>{formatUptime()}</span>
          {appState.paused && (
            <>
              {'  '}
              <span fg={theme.red}>■ PAUSED</span>
            </>
          )}
        </text>
      </box>

      {/* Tab Bar */}
      {renderTabBar()}

      {/* Tab Content */}
      {activeTab === 'status' && renderStatusTab()}
      {activeTab === 'devices' && renderDevicesTab()}
      {activeTab === 'settings' && renderSettingsTab()}
      {activeTab === 'logs' && renderLogsTab()}

      {/* Footer */}
      <box height={1} width="100%" backgroundColor={theme.bgElement}>
        <text fg={theme.textDim}>
          {'  '}
          Tab: switch  •  Ctrl+P: pause  •  Ctrl+Q: quit
          {activeTab === 'settings' && '  •  A: AI  •  R: relay  •  +/-: replacements'}
        </text>
      </box>

      {/* Dialogs */}
      {activeDialog === 'relay' && (
        <RelayManager theme={theme} config={config} onClose={() => setActiveDialog(null)}
          onSave={(cfg) => { setActiveDialog(null); onCommand?.('save-config'); }} />
      )}
      {activeDialog === 'ai' && (
        <AISettings theme={theme} config={config} onClose={() => setActiveDialog(null)}
          onSave={(cfg) => { setActiveDialog(null); onCommand?.('save-config'); }} />
      )}
      {activeDialog === 'add-replacement' && (
        <AddReplacement theme={theme} onClose={() => setActiveDialog(null)}
          onSave={(from, to) => { setActiveDialog(null); onCommand?.('add-replacement'); }} />
      )}
      {activeDialog === 'delete-replacement' && (
        <DeleteReplacement theme={theme} replacements={config.wordReplacements || {}}
          onClose={() => setActiveDialog(null)}
          onDelete={(key) => { setActiveDialog(null); onCommand?.('delete-replacement'); }} />
      )}
    </box>
  );
}

function getLogColor(type: string, theme: Theme): string {
  const colors: Record<string, string> = {
    phrase: theme.text,
    command: theme.primary,
    connect: theme.green,
    disconnect: theme.red,
    warn: theme.red,
    auth: theme.purple,
    info: theme.textMuted,
  };
  return colors[type] || theme.textMuted;
}

function getLogIcon(type: string): string {
  const icons: Record<string, string> = {
    phrase: '  ',
    command: '› ',
    connect: '+ ',
    disconnect: '- ',
    warn: '! ',
    auth: '# ',
    info: '  ',
  };
  return icons[type] || '  ';
}
