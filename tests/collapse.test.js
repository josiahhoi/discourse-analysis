/**
 * Tests for getCollapseInfo — the single decision for what collapsing a bracket
 * hides and what shape its arms take. renderPropositions (row hiding),
 * renderBrackets (arm drawing), and the bracket-actions menu (disabling a no-op
 * "Collapse Section") all consume this, so its branches are the collapse
 * feature's contract: subordinate with one starred arm → keep the dominant end;
 * coordinate / no-star / ambiguous → keep both ends, hide the middle.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup(brackets, propCount = 5) {
  const sb = createSandbox();
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/render-model.js');
  load(sb, 'js/utils/render-labels.js'); // getBracketLabels
  sb.DA_STATE.propositions = Array.from({ length: propCount }, (_, i) => `line ${i}`);
  sb.DA_STATE.brackets = brackets;
  return sb;
}

test('subordinate, star on top (ground */G): keeps the from-row, hides the rest', () => {
  const sb = setup([
    { id: 'b1', from: 'p0', to: 'p2', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(0);
  assert.deepEqual(info.hiddenRows, [1, 2]);
  assert.equal(info.isCoordinateShape, false);
  assert.equal(info.dominantId, 'p0');
});

test('subordinate, star on bottom (action-purpose Ac/Pur*): keeps the to-row', () => {
  const sb = setup([
    { id: 'b1', from: 'p0', to: 'p2', type: 'action-purpose', labelsSwapped: false, dominanceFlipped: false },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(0);
  assert.deepEqual(info.hiddenRows, [0, 1]);
  assert.equal(info.isCoordinateShape, false);
  assert.equal(info.dominantId, 'p2');
});

test('dominanceFlipped moves the kept row to the other end', () => {
  const sb = setup([
    { id: 'b1', from: 'p0', to: 'p2', type: 'ground', labelsSwapped: false, dominanceFlipped: true },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(0);
  assert.deepEqual(info.hiddenRows, [0, 1]);
  assert.equal(info.dominantId, 'p2');
});

test('coordinate (alternative): keeps both ends, hides the middle', () => {
  const sb = setup([
    { id: 'b1', from: 'p1', to: 'p4', type: 'alternative', labelsSwapped: false, dominanceFlipped: false },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(0);
  assert.deepEqual(info.hiddenRows, [2, 3]);
  assert.equal(info.isCoordinateShape, true);
});

test('2-row coordinate bracket: nothing to hide (menu disables Collapse Section)', () => {
  const sb = setup([
    { id: 'b1', from: 'p3', to: 'p4', type: 'alternative', labelsSwapped: false, dominanceFlipped: false },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(0);
  assert.deepEqual(info.hiddenRows, []);
});

test('unknown/no-star subordinate label: coordinate shape, both ends kept (rows and arms agree)', () => {
  // Falls back to a starless two-char label — previously the rows kept both
  // ends while the arms drew only one, leaving a dangling endpoint row.
  const sb = setup([
    { id: 'b1', from: 'p0', to: 'p2', type: 'mystery', labelsSwapped: false, dominanceFlipped: false },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(0);
  assert.equal(info.isCoordinateShape, true);
  assert.deepEqual(info.hiddenRows, [1]);
});

test('nested endpoint: the dominant side resolves through the sub-bracket recursively', () => {
  // b2 = action-purpose(b1 -> p2), star bottom → dominant is p2; the whole
  // extent of b1 (rows 0-1) folds away.
  const sb = setup([
    { id: 'b1', from: 'p0', to: 'p1', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
    { id: 'b2', from: 'b1', to: 'p2', type: 'action-purpose', labelsSwapped: false, dominanceFlipped: false },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(1);
  assert.deepEqual(info.hiddenRows, [0, 1]);
  assert.equal(info.dominantId, 'p2');
});

test('nested coordinate: representative ends follow each sub-bracket dominant row', () => {
  // alternative(b1 -> p3) over rows 0-3: b1 (ground, star top) represents
  // itself by row 0, so rows 1-2 hide and rows 0 & 3 stay.
  const sb = setup([
    { id: 'b1', from: 'p0', to: 'p1', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
    { id: 'b2', from: 'b1', to: 'p3', type: 'alternative', labelsSwapped: false, dominanceFlipped: false },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(1);
  assert.deepEqual(info.hiddenRows, [1, 2]);
  assert.equal(info.isCoordinateShape, true);
});
