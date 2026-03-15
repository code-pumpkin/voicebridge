'use strict';

const { escape } = require('../utils');
const { compoundCmd } = require('../utils/input');

const PHRASE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * ScreenBuffer — tracks what we've typed on screen and executes
 * compound delete+type commands to reach target states.
 *
 * Instead of replaying a chain of micro-ops, we maintain:
 *   _onScreen  — string we believe is currently on screen (our text)
 *   _queue     — target states to reach [{text, interim, final}]
 *   _busy      — whether a command is currently executing
 *
 * Interims coalesce: if multiple interims queue while one executes,
 * only the latest survives. Each drain step = 1 shell exec.
 */
class OpLog {
  constructor() {
    this._onScreen = '';      // what we believe is typed on screen
    this._queue = [];         // [{text, interim, final}]
    this._busy = false;
    this._phraseHistory = []; // [{text, len, ts}] for scratch-that + screen tracking
  }

  /**
   * Queue a target state. If interim, coalesces with previous queued interims.
   * @param {string} text - target text to show on screen
   * @param {boolean} interim - true if this is an interim (can be coalesced/cancelled)
   * @param {boolean} isFinal - true if this is a final commit
   */
  queueState(text, interim = false, isFinal = false) {
    if (interim) {
      // Coalesce: drop all queued interims, keep only this one
      this._queue = this._queue.filter(q => !q.interim);
    }
    this._queue.push({ text, interim, final: isFinal });
  }

  /** Cancel all queued interim states (not yet executing). */
  cancelInterims() {
    this._queue = this._queue.filter(q => !q.interim);
  }

  /** Cancel ALL queued states. */
  cancelQueued() {
    this._queue = [];
  }

  /** What we believe is currently on screen. */
  onScreen() { return this._onScreen; }

  /**
   * Drain the queue — execute the next target state.
   * @param {function} execFn - (cmd, callback) to run shell command
   */
  drain(execFn) {
    if (this._busy) return;
    if (this._queue.length === 0) return;

    // If multiple items queued, skip stale interims (keep latest interim + any finals)
    this._coalesceQueue();

    const target = this._queue.shift();
    if (!target) return;

    const current = this._onScreen;
    const goal = target.text;

    // Compute minimal diff
    let common = 0;
    while (common < current.length && common < goal.length && current[common] === goal[common]) common++;

    const toDelete = current.length - common;
    const toType = goal.slice(common);

    // Nothing to do — screen already matches
    if (toDelete === 0 && toType === '') {
      this._onScreen = goal;
      // Continue draining
      this.drain(execFn);
      return;
    }

    this._busy = true;
    const cmd = compoundCmd(toDelete, toType, escape);

    execFn(cmd, () => {
      this._onScreen = goal;
      this._busy = false;
      this.drain(execFn);
    });
  }

  /** Drop stale queued interims — only keep the latest interim if multiple exist. */
  _coalesceQueue() {
    if (this._queue.length <= 1) return;
    // Find the last interim index
    let lastInterimIdx = -1;
    for (let i = this._queue.length - 1; i >= 0; i--) {
      if (this._queue[i].interim) { lastInterimIdx = i; break; }
    }
    if (lastInterimIdx <= 0) return;
    // Remove all earlier interims
    this._queue = this._queue.filter((q, i) => !q.interim || i === lastInterimIdx);
  }

  /**
   * Commit a final phrase — clears the screen buffer for the next phrase
   * and records the phrase in history.
   * Call AFTER queueing the final state + space.
   * @param {string} text - the raw phrase text
   * @param {number} len - chars typed on screen (including trailing space)
   */
  commitPhrase(text, len) {
    this._pruneHistory();
    this._phraseHistory.push({ text, len, ts: Date.now() });
    if (this._phraseHistory.length > 50) this._phraseHistory.shift();
  }

  /**
   * After the final's queued ops drain, reset _onScreen to empty
   * so the next phrase starts fresh. Called via a sentinel in the queue.
   */
  queueReset() {
    this._queue.push({ text: '', interim: false, final: false, reset: true });
  }

  /**
   * Hard reset — on disconnect or voice-command clear.
   */
  reset() {
    this._onScreen = '';
    this._queue = [];
    this._busy = false;
  }

  // ── Phrase history with TTL ──

  _pruneHistory() {
    const cutoff = Date.now() - PHRASE_TTL;
    this._phraseHistory = this._phraseHistory.filter(p => p.ts > cutoff);
  }

  /** Total chars we own on screen across all recent phrases. */
  screenLength() {
    this._pruneHistory();
    return this._phraseHistory.reduce((sum, p) => sum + p.len, 0);
  }

  /** Manually set screen length — adjusts the latest phrase entry. */
  setScreenLength(n) {
    this._pruneHistory();
    const currentTotal = this._phraseHistory.reduce((sum, p) => sum + p.len, 0);
    const diff = n - currentTotal;
    if (this._phraseHistory.length > 0) {
      this._phraseHistory[this._phraseHistory.length - 1].len += diff;
    } else if (n > 0) {
      this._phraseHistory.push({ text: '', len: n, ts: Date.now() });
    }
  }

  /** Push a completed phrase onto the history stack. */
  pushPhrase(text, len) {
    this.commitPhrase(text, len);
  }

  /** Pop the most recent phrase from history. Returns { text, len } or null. */
  popPhrase() {
    this._pruneHistory();
    return this._phraseHistory.pop() || null;
  }

  /** Peek at the most recent phrase without removing it. */
  peekPhrase() {
    this._pruneHistory();
    return this._phraseHistory.length > 0 ? this._phraseHistory[this._phraseHistory.length - 1] : null;
  }

  /** How many chars are projected on screen (current buffer). */
  projectedLength() {
    // Walk the queue to find what _onScreen will be after all ops
    let text = this._onScreen;
    for (const q of this._queue) {
      text = q.text;
    }
    return text.length;
  }
}

module.exports = OpLog;
