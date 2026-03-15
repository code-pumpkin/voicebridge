// CommonJS entry point for the TUI
// Detects runtime and loads appropriate TUI implementation

async function createTUI(config, opts = {}) {
  // Check if running under Bun (which can handle TypeScript/JSX)
  if (typeof Bun !== 'undefined') {
    try {
      const { createTUI: createOpenTUI } = await import('./index.tsx');
      return await createOpenTUI(config, opts);
    } catch (err) {
      console.error('Failed to load OpenTUI:', err.message);
      console.log('Falling back to blessed TUI...');
    }
  }
  
  // Fall back to blessed TUI for Node.js
  const { createTUI: createBlessedTUI } = require('../tui');
  return createBlessedTUI(config, opts);
}

module.exports = { createTUI };
