export interface AppState {
  paused: boolean;
  connectedCount: number;
  totalPhrases: number;
  totalWords: number;
  relayStatus: 'disabled' | 'connecting' | 'connected' | 'error';
  phoneStates?: Map<string, any>;
  language?: string;
}

export interface LogEntry {
  time: string;
  text: string;
  type: 'phrase' | 'command' | 'connect' | 'disconnect' | 'warn' | 'auth' | 'info';
}

export interface QRInfo {
  displayUrl: string;
  mode: 'local' | 'relay' | 'relay-pending';
  localUrl?: string;
  qrCode?: string;
}
