import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { App } from './App';
import { getTheme } from './theme';
import { AppState, LogEntry, QRInfo } from './types';
import QRCode from 'qrcode';

export interface TUIInstance {
  logPhrase: (text: string, type?: string) => void;
  setLive: (text: string, isFinal?: boolean) => void;
  updateStatus: (state?: Partial<AppState>) => void;
  renderQR: (displayUrl: string, mode: string, localUrl?: string) => Promise<void>;
  showQR: () => void;
  hideQR: () => void;
  destroy: () => void;
  setAppState: (state: Partial<AppState>) => void;
  // Legacy compatibility
  blessed?: any;
  screen?: any;
  T?: any;
  headless?: boolean;
}

export async function createTUI(config: any, opts: { headless?: boolean } = {}): Promise<TUIInstance> {
  if (opts.headless) {
    return createHeadlessTUI();
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  const theme = getTheme(config.theme);
  
  let appState: AppState = {
    paused: false,
    connectedCount: 0,
    totalPhrases: 0,
    totalWords: 0,
    relayStatus: 'disabled',
  };
  
  let logs: LogEntry[] = [];
  let liveText = 'Waiting for speech...';
  let liveFinal = false;
  let qrInfo: QRInfo | null = null;
  let showQR = true;

  const root = createRoot(renderer);
  
  const render = () => {
    root.render(
      <App
        theme={theme}
        config={config}
        appState={appState}
        logs={logs}
        liveText={liveText}
        liveFinal={liveFinal}
        qrInfo={qrInfo}
        showQR={showQR}
        onCommand={(cmd) => {
          // Handle commands from keyboard shortcuts
          if (cmd === 'pause') {
            appState.paused = !appState.paused;
            render();
          }
        }}
        onClearLogs={() => {
          logs = [];
          render();
        }}
      />
    );
  };

  render();

  return {
    logPhrase: (text: string, type = 'info') => {
      const time = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      logs.push({ time, text, type: type as any });
      if (logs.length > 100) logs = logs.slice(-100);
      render();
    },

    setLive: (text: string, isFinal = false) => {
      liveText = text;
      liveFinal = isFinal;
      render();
    },

    updateStatus: (state?: Partial<AppState>) => {
      if (state) Object.assign(appState, state);
      render();
    },

    renderQR: async (displayUrl: string, mode: string, localUrl?: string) => {
      if (mode === 'relay-pending') {
        qrInfo = { displayUrl, mode: 'relay-pending' };
        render();
        return;
      }

      const qrCode = await QRCode.toString(displayUrl, {
        type: 'terminal',
        small: true,
        errorCorrectionLevel: 'M',
      });

      qrInfo = { displayUrl, mode: mode as any, localUrl, qrCode };
      render();
    },

    showQR: () => {
      showQR = true;
      render();
    },

    hideQR: () => {
      showQR = false;
      render();
    },

    destroy: () => {
      renderer.destroy();
    },

    setAppState: (state: Partial<AppState>) => {
      Object.assign(appState, state);
      render();
    },

    // Legacy compatibility stubs
    blessed: null,
    screen: {
      render: () => render(),
      key: () => {},
      unkey: () => {},
      destroy: () => renderer.destroy(),
    },
    T: theme,
    headless: false,
  };
}

function createHeadlessTUI(): TUIInstance {
  return {
    logPhrase: (text: string, type?: string) => {
      console.log(`[${type || 'info'}] ${text}`);
    },
    setLive: () => {},
    updateStatus: () => {},
    renderQR: async () => {},
    showQR: () => {},
    hideQR: () => {},
    destroy: () => {},
    setAppState: () => {},
    blessed: null,
    screen: {
      render: () => {},
      key: () => {},
      unkey: () => {},
      destroy: () => {},
    },
    T: {},
    headless: true,
  };
}
