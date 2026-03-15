'use strict';

const crypto = require('crypto');
const WebSocket = require('ws');
const OpLog = require('./oplog');
const { getVoiceCommands } = require('./voice-commands');
const { safeSend, runCmd, safeKey, applyReplacements, escape } = require('../utils');
const { keyCmd, pasteCmd, toClipboard, compoundCmd } = require('../utils/input');
const { aiSummarize } = require('../ai');
const VirtualWS = require('../relay/virtual-ws');

const LOCAL_MAX_CLIENTS = 5;
const LOCAL_REG_TIMEOUT = 120000;
const VIRTUAL_MAX_CLIENTS = 10;
const MSG_RATE_WINDOW = 1000;
const MSG_RATE_MAX    = 30;

/**
 * Create a connection handler bound to the app's shared state.
 * Returns { handleConnection, broadcast, phoneStates }.
 */
function createConnectionHandler(ctx) {
  const phoneStates = new Map();
  let connectedCount = 0;

  function getConnectedCount() { return connectedCount; }
  function setConnectedCount(n) { connectedCount = n; if (ctx.onCountChange) ctx.onCountChange(n); }

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    ctx.wss.clients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) { try { c.send(data); } catch {} }
    });
    if (ctx.relayClient) ctx.relayClient.broadcast(msg);
  }

  function handleConnection(ws) {
    const isVirtual = ws instanceof VirtualWS;

    if (!isVirtual && ctx.wss.clients.size > LOCAL_MAX_CLIENTS) {
      safeSend(ws, { type: 'error', reason: 'room-full' });
      ws.terminate();
      return;
    }

    phoneStates.set(ws, {
      language: ctx.config.language,
      pttMode: false,
      clipboardMode: ctx.config.clipboardMode,
      authed: false,
      deviceToken: null,
    });

    // Drop connections that never authenticate
    const regTimeout = isVirtual ? LOCAL_REG_TIMEOUT * 2 : LOCAL_REG_TIMEOUT;
    const regTimer = setTimeout(() => {
      const state = phoneStates.get(ws);
      if (state && !state.authed) ws.terminate();
    }, regTimeout);
    ws.once('close', () => clearTimeout(regTimer));

    // Keepalive for local sockets
    if (!isVirtual) {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; clearTimeout(ws._pongTimeout); });
      ws._pingTimer = setInterval(() => {
        if (!ws.isAlive) { clearInterval(ws._pingTimer); ws.terminate(); return; }
        ws.isAlive = false;
        ws.ping();
        ws._pongTimeout = setTimeout(() => { if (!ws.isAlive) ws.terminate(); }, 10000);
      }, 25000);
      ws.on('close', () => { clearInterval(ws._pingTimer); clearTimeout(ws._pongTimeout); });
    }

    ws.on('message', (data) => {
      // Per-socket rate limiting
      const now = Date.now();
      if (!ws._msgCount) { ws._msgCount = 0; ws._msgWindowStart = now; }
      if (now - ws._msgWindowStart > MSG_RATE_WINDOW) { ws._msgCount = 0; ws._msgWindowStart = now; }
      ws._msgCount++;
      if (ws._msgCount > MSG_RATE_MAX) {
        safeSend(ws, { type: 'error', reason: 'rate-limited' });
        ws.terminate();
        return;
      }

      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      const state = phoneStates.get(ws) || {};

      // ── Auth handshake ──
      if (msg.type === 'auth') {
        if (state.authed) return;
        if (msg.deviceToken && typeof msg.deviceToken === 'string' && /^[a-f0-9]{32}$/.test(msg.deviceToken) && ctx.sessions[msg.deviceToken]?.approved === true) {
          ctx.sessions[msg.deviceToken].lastSeen = Date.now();
          ctx.saveSessions(ctx.sessions);
          state.authed = true;
          state.deviceToken = msg.deviceToken;
          phoneStates.set(ws, state);
          connectedCount++;
          if (ctx.onCountChange) ctx.onCountChange(connectedCount);
          safeSend(ws, { type: 'auth', status: 'approved', deviceToken: msg.deviceToken });
          safeSend(ws, { type: 'paused', value: ctx.getPaused() });
          safeSend(ws, { type: 'aiEnabled', value: ctx.config.aiEnabled });
          ctx.logFn('Known device reconnected', 'connect');
          ctx.updateStatus();
          return;
        }
        const pin = String(crypto.randomInt(100000, 1000000));
        safeSend(ws, { type: 'auth', status: 'pin', pin });
        ctx.logFn(`New device — PIN: ${pin}`, 'auth');
        ctx.showPinPrompt(pin, ws);
        return;
      }

      if (!state.authed) { safeSend(ws, { type: 'auth', status: 'required' }); return; }

      // ── Config updates ──
      if (msg.type === 'config') {
        if (typeof msg.clipboardMode === 'boolean') { state.clipboardMode = msg.clipboardMode; ctx.config.clipboardMode = msg.clipboardMode; ctx.saveConfig(ctx.config); ctx.logFn(`Clipboard: ${msg.clipboardMode ? 'on' : 'off'}`, 'command'); }
        if (typeof msg.pttMode === 'boolean')       { state.pttMode = msg.pttMode; ctx.logFn(`PTT: ${msg.pttMode ? 'on' : 'off'}`, 'command'); }
        if (typeof msg.language === 'string' && /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/.test(msg.language)) { state.language = msg.language; ctx.logFn(`Language: ${msg.language}`, 'command'); }
        if (typeof msg.paused === 'boolean')        { ctx.setPaused(msg.paused); broadcast({ type: 'paused', value: msg.paused }); ctx.logFn(msg.paused ? 'Paused from phone' : 'Resumed from phone', 'command'); }
        if (typeof msg.aiEnabled === 'boolean')     { ctx.config.aiEnabled = msg.aiEnabled; ctx.saveConfig(ctx.config); ctx.logFn(`AI: ${msg.aiEnabled ? 'enabled' : 'disabled'}`, 'command'); ctx.updateStatus(); }
        phoneStates.set(ws, state);
        ctx.updateStatus();
        return;
      }

      if (ctx.getPaused() || !msg.text) return;
      if (typeof msg.text !== 'string' || msg.text.length > 2000) return;

      // Initialize ScreenBuffer per socket
      if (!ws._oplog) ws._oplog = new OpLog();
      const buf = ws._oplog;

      function execOp(cmd, cb) { runCmd(cmd, cb, ctx.logFn); }

      // ── Clipboard mode: paste whole text, skip buffer ──
      function clipSend(text) {
        toClipboard(text, (err) => { if (!err) require('child_process').exec(pasteCmd()); });
      }

      // ── Interim ──
      if (msg.type === 'interim') {
        ctx.setLive(msg.text, false);

        if (state.clipboardMode) return; // don't type interims in clipboard mode

        // Queue target state — coalesces with previous interims automatically
        buf.queueState(msg.text, true);
        buf.drain(execOp);

      // ── Final ──
      } else if (msg.type === 'final') {
        ctx.setLive(msg.text, true);

        // Check voice commands
        const vcmds = getVoiceCommands(ctx.config);
        const cmd = msg.text.trim().toLowerCase();
        if (Object.hasOwn(vcmds, cmd)) {
          const vc = vcmds[cmd];
          if (!vc || typeof vc !== 'object') return;

          // Cancel any pending ops and clear what's on screen from this phrase
          buf.cancelQueued();
          const onScreen = buf.onScreen();
          if (onScreen.length > 0) {
            buf.queueState('', false);
          }

          if (vc.action === 'scratch') {
            const phrase = buf.popPhrase();
            if (phrase && phrase.len > 0) {
              // Delete the previous phrase from screen using compound command
              runCmd(compoundCmd(phrase.len, '', escape), () => {}, ctx.logFn);
              ctx.logFn(`Scratched: "${phrase.text}"`, 'command');
            }
          }
          else if (vc.action === 'key' && typeof vc.key === 'string') {
            runCmd(keyCmd(vc.key, safeKey), () => {}, ctx.logFn);
            ctx.logFn(`\u2318 ${cmd}`, 'command');
          }
          else if (vc.action === 'type' && typeof vc.text === 'string') {
            if (state.clipboardMode) {
              clipSend(vc.text.slice(0, 2000));
            } else {
              buf.queueState(vc.text.slice(0, 2000), false, true);
            }
            ctx.logFn(`\u2318 ${cmd} \u2192 "${vc.text}"`, 'command');
          }

          buf.reset();
          buf.drain(execOp);
          return;
        }

        const finalText = applyReplacements(msg.text, ctx.config.wordReplacements);
        const fullTyped = finalText + ' ';

        if (state.clipboardMode) {
          clipSend(fullTyped);
        } else {
          // Cancel stale interims, queue the final text + trailing space
          buf.cancelInterims();
          buf.queueState(fullTyped, false, true);
        }

        ctx.totalPhrases++; ctx.totalWords += finalText.trim().split(/\s+/).filter(Boolean).length;
        ctx.logFn(finalText, 'phrase');
        ctx.updateStatus();

        // Record phrase in history for scratch-that (with 2-min TTL)
        buf.pushPhrase(finalText, fullTyped.length);

        // AI summarize
        if (ctx.config.aiEnabled && require('../ai').getAiApiKey()) {
          ws._aiSeq = (ws._aiSeq || 0) + 1;
          const seq = ws._aiSeq;
          aiSummarize(finalText, ctx.config, ctx.logFn).then(improved => {
            if (improved === finalText) return;
            if (ws.readyState !== WebSocket.OPEN) return;
            if (ws._aiSeq !== seq) return;
            const safeImproved = improved.trimStart().slice(0, 4000) + ' ';
            // Delete everything we own on screen, type the AI version
            const onScreenLen = buf.screenLength();
            if (onScreenLen > 0) {
              runCmd(compoundCmd(onScreenLen, safeImproved, escape), () => {}, ctx.logFn);
            } else {
              runCmd(compoundCmd(0, safeImproved, escape), () => {}, ctx.logFn);
            }
            buf.setScreenLength(safeImproved.length);
            // Update the last phrase in history so scratch-that removes the AI version
            const lastPhrase = buf.peekPhrase();
            if (lastPhrase) { lastPhrase.text = improved; lastPhrase.len = safeImproved.length; }
            ctx.logFn(`AI (${ctx.config.aiProvider}): ${improved}`, 'command');
          }).catch(() => {});
        }

        // Reset buffer for next phrase (after current ops drain)
        buf.queueState('', false);
        buf.drain(execOp);
      }
    });

    ws.on('close', () => {
      const state = phoneStates.get(ws);
      if (state && state.authed) { connectedCount = Math.max(0, connectedCount - 1); if (ctx.onCountChange) ctx.onCountChange(connectedCount); }
      phoneStates.delete(ws);
      if (ws._oplog) ws._oplog.reset();
      ctx.logFn('Phone disconnected', 'disconnect');
      ctx.updateStatus();
    });
  }

  return { handleConnection, broadcast, phoneStates, getConnectedCount, setConnectedCount };
}

module.exports = { createConnectionHandler, LOCAL_MAX_CLIENTS, VIRTUAL_MAX_CLIENTS };
