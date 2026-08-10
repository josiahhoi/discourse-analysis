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
  // action-purpose is "Ac / Pur*" — both arms carry vocabulary, so the star
  // can move between them. (Star-only labels like ground's "* / G" can't; see
  // the next test.)
  const sb = setup([
    { id: 'b1', from: 'p0', to: 'p2', type: 'action-purpose', labelsSwapped: false, dominanceFlipped: true },
  ]);
  const info = sb.DA_RENDERER.getCollapseInfo(0);
  assert.deepEqual(info.hiddenRows, [1, 2]);
  assert.equal(info.dominantId, 'p0');
});

test('on a star-only label, swapping (not flipping) moves the kept row', () => {
  // ground is "* / G": the star IS the top arm. Flipping would take it off an
  // arm that has nothing else, so the label engine refuses and the picker
  // hides Switch Stars — a stored flag from before that stays inert.
  const flipped = setup([
    { id: 'b1', from: 'p0', to: 'p2', type: 'ground', labelsSwapped: false, dominanceFlipped: true },
  ]).DA_RENDERER.getCollapseInfo(0);
  assert.deepEqual(flipped.hiddenRows, [1, 2], 'flip is a no-op');
  assert.equal(flipped.dominantId, 'p0');

  // Swap carries the star along with the label, so it does move the dominant
  // end — and leaves both arms labelled ("G" on top, "*" on the bottom).
  const swapped = setup([
    { id: 'b1', from: 'p0', to: 'p2', type: 'ground', labelsSwapped: true, dominanceFlipped: false },
  ]).DA_RENDERER.getCollapseInfo(0);
  assert.deepEqual(swapped.hiddenRows, [0, 1]);
  assert.equal(swapped.dominantId, 'p2');
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

// ── Recursive spine (collapse shows dominant structure, not bare rows) ──────

/** James 1:19-25-shaped fixture: subordinate → coordinate → subordinate chain.
 *  E=ground(p0,p1) star-top, A2=ground(p3,p4) star-top, F=series(p2,A2),
 *  G=action-purpose(E,F) star-bottom, M=ground(G,p5) star-top. */
function jamesShape() {
  return setup([
    { id: 'bE', from: 'p0', to: 'p1', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
    { id: 'bA', from: 'p3', to: 'p4', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
    { id: 'bF', from: 'p2', to: 'bA', type: 'series', labelsSwapped: false, dominanceFlipped: false },
    { id: 'bG', from: 'bE', to: 'bF', type: 'action-purpose', labelsSwapped: false, dominanceFlipped: false },
    { id: 'bM', from: 'bG', to: 'p5', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
  ], 6);
}

test('deep chain: collapsing the outer bracket keeps the series members\' spine rows', () => {
  const sb = jamesShape();
  const info = sb.DA_RENDERER.getCollapseInfo(4); // bM
  // Old behavior kept row 4 too (series exposed its full extent). The series
  // member bA now reduces to its own dominant row 3.
  assert.deepEqual(info.hiddenRows, [0, 1, 4, 5]);
  assert.equal(info.isCoordinateShape, false);
  assert.equal(info.dominantId, 'bG');
});

test('getSpineRows: recursive dominant-spine row sets', () => {
  const sb = jamesShape();
  const spine = (id) => Array.from(sb.DA_RENDERER.getSpineRows(id)).sort();
  assert.deepEqual(spine('bE'), [0]);
  assert.deepEqual(spine('bF'), [2, 3]); // series: both members, each reduced
  assert.deepEqual(spine('bG'), [2, 3]); // follows its starred side into bF
});

test('non-contiguous spine: coordinate of two starred sub-brackets keeps separated rows', () => {
  const sb = setup([
    { id: 'bX', from: 'p0', to: 'p1', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
    { id: 'bY', from: 'p2', to: 'p4', type: 'action-purpose', labelsSwapped: false, dominanceFlipped: false },
    { id: 'bALT', from: 'bX', to: 'bY', type: 'alternative', labelsSwapped: false, dominanceFlipped: false },
    { id: 'bP', from: 'bALT', to: 'p5', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
  ], 6);
  const info = sb.DA_RENDERER.getCollapseInfo(3); // bP
  // Spine of bALT is {0, 4} — a range-based keep would wrongly retain 1-3.
  assert.deepEqual(info.hiddenRows, [1, 2, 3, 5]);
});

test('getRepresentativeRange returns spine bounds, not the sub-bracket\'s full extent', () => {
  const sb = jamesShape();
  assert.deepEqual(sb.DA_RENDERER.getRepresentativeRange('bG'), { from: 2, to: 3 }); // old: {2, 4}
});

test('coordinate type beats its star (progression P/*): both members survive a parent collapse', () => {
  const sb = setup([
    { id: 'bPROG', from: 'p0', to: 'p3', type: 'progression', labelsSwapped: false, dominanceFlipped: false },
    { id: 'bP2', from: 'bPROG', to: 'p5', type: 'ground', labelsSwapped: false, dominanceFlipped: false },
  ], 6);
  const info = sb.DA_RENDERER.getCollapseInfo(1); // bP2
  assert.deepEqual(info.hiddenRows, [1, 2, 4, 5]); // rows 0 AND 3 kept
});

test('computeCollapsedRows: per-row ownership across overlapping collapses', () => {
  const sb = jamesShape();
  sb.DA_STATE.brackets[4].isCollapsed = true; // bM hides 0,1,4,5
  sb.DA_STATE.brackets[2].isCollapsed = true; // bF hides 4
  const { hiddenRows, hiddenBy } = sb.DA_RENDERER.computeCollapsedRows();
  assert.deepEqual(Array.from(hiddenRows).sort(), [0, 1, 4, 5]);
  assert.deepEqual(hiddenBy.get(4).sort(), [2, 4]); // both brackets own row 4
  assert.deepEqual(hiddenBy.get(0), [4]);           // rows 0/1 owned by bM only
});
