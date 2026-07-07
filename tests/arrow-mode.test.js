/**
 * Tests for arrow mode's state lifecycle — the pieces that regressed silently
 * when this state lived on window.*: a pending arrow start must not survive
 * leaving the mode, and completing an arrow must reject duplicates but allow
 * the reverse direction (arrows are directional).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function noop() {}

function modeSandbox() {
  const calls = { hideArrowHighlight: 0 };
  const sb = createSandbox({
    DA_UI: { showStatus: noop, clearPropositionHighlights: noop },
    DA_MOUSE: { hideArrowHighlight: () => { calls.hideArrowHighlight++; } },
  });
  // toggleTextEditMode toggles a class on document.body.
  sb.document.body = { classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/mode-service.js');
  return { sb, calls };
}

test('exiting arrow mode discards a pending arrow start and hides the overlay', () => {
  const { sb, calls } = modeSandbox();
  sb.DA_MODES.toggleArrowMode(true);
  sb.DA_STATE.pendingArrowStart = { propIndex: 0, start: 4, end: 7 };

  sb.DA_MODES.toggleArrowMode(false);

  assert.equal(sb.DA_STATE.arrowMode, false);
  assert.equal(sb.DA_STATE.pendingArrowStart, null);
  assert.ok(calls.hideArrowHighlight >= 1);
});

test('entering text edit mode also discards a pending arrow start', () => {
  const { sb } = modeSandbox();
  sb.DA_MODES.toggleArrowMode(true);
  sb.DA_STATE.pendingArrowStart = { propIndex: 1, start: 0, end: 3 };

  sb.DA_MODES.toggleTextEditMode(); // turns arrow mode off on its way in

  assert.equal(sb.DA_STATE.arrowMode, false);
  assert.equal(sb.DA_STATE.pendingArrowStart, null);
});

test('switching to RTL (Hebrew) discards a pending arrow start', () => {
  const { sb } = modeSandbox();
  sb.DA_MODES.toggleArrowMode(true);
  sb.DA_STATE.pendingArrowStart = { propIndex: 0, start: 0, end: 2 };

  sb.DA_MODES.setRTL(true);

  assert.equal(sb.DA_STATE.arrowMode, false);
  assert.equal(sb.DA_STATE.pendingArrowStart, null);
});

function mouseSandbox() {
  const sb = createSandbox({ DA_UI: { showStatus: noop } });
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/mouse-handler.js');
  return sb;
}

test('completeArrow: creates a directional arrow and consumes the pending start', () => {
  const sb = mouseSandbox();
  sb.DA_STATE.pendingArrowStart = { propIndex: 0, start: 4, end: 7 };

  const outcome = sb.DA_MOUSE.completeArrow(
    { propIndex: 0, start: 4, end: 7 },
    { propIndex: 2, start: 10, end: 15 }
  );

  assert.equal(outcome, 'created');
  assert.equal(sb.DA_STATE.pendingArrowStart, null);
  assert.deepEqual(sb.DA_STATE.wordArrows, [
    { fromProp: 0, fromStart: 4, fromEnd: 7, toProp: 2, toStart: 10, toEnd: 15 },
  ]);
});

test('completeArrow: clicking the start word again cancels', () => {
  const sb = mouseSandbox();
  const word = { propIndex: 3, start: 8, end: 12 };

  const outcome = sb.DA_MOUSE.completeArrow(word, { ...word });

  assert.equal(outcome, 'cancelled');
  assert.equal(sb.DA_STATE.wordArrows.length, 0);
});

test('completeArrow: an identical arrow is rejected, the reverse is allowed', () => {
  const sb = mouseSandbox();
  const a = { propIndex: 0, start: 4, end: 7 };
  const b = { propIndex: 2, start: 10, end: 15 };

  assert.equal(sb.DA_MOUSE.completeArrow(a, b), 'created');
  assert.equal(sb.DA_MOUSE.completeArrow(a, b), 'duplicate');
  assert.equal(sb.DA_STATE.wordArrows.length, 1);

  // Direction matters: b -> a is a different relationship.
  assert.equal(sb.DA_MOUSE.completeArrow(b, a), 'created');
  assert.equal(sb.DA_STATE.wordArrows.length, 2);
});
