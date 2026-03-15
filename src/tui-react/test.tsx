import { createTUI } from './index';

const config = {
  theme: 'opencode',
  aiEnabled: false,
  aiProvider: 'openai',
  language: 'en-US',
};

async function main() {
  const tui = await createTUI(config);

  // Test logging
  tui.logPhrase('AirMic started', 'info');
  tui.logPhrase('Waiting for connections...', 'info');

  // Test QR code
  await tui.renderQR('https://example.com/test', 'local');

  // Simulate some activity after 2 seconds
  setTimeout(() => {
    tui.logPhrase('Device connected', 'connect');
    tui.updateStatus({ connectedCount: 1 });
    tui.setLive('Testing speech recognition...', false);
  }, 2000);

  setTimeout(() => {
    tui.setLive('Hello world!', true);
    tui.logPhrase('Hello world!', 'phrase');
    tui.updateStatus({ totalPhrases: 1, totalWords: 2 });
  }, 4000);
}

main().catch(console.error);
