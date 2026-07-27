/**
 * computeLabelPickerPosition (js/utils/ui-menus.js) — the label picker opens
 * underneath the clicked bracket's last line (anchorBottom = that row's
 * bottom, resolved by the caller); when it doesn't fit below it flips WHOLE
 * to above the bracket's first line (anchorTop = that row's top) instead of
 * being truncated; only when neither side fits does it take the roomier
 * side height-capped, or overlay from the top margin when even that side
 * can't hold the fixed chrome. left attaches to the bracket's gutter edge
 * (mirrored in RTL). GAP = 10, MARGIN = 5, MIN_USABLE = 380.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function place(args) {
  const sb = createSandbox();
  load(sb, 'js/utils/ui-menus.js');
  return sb.DA_UI.computeLabelPickerPosition(args);
}

const base = {
  anchorTop: 200, anchorBottom: 300, aRect: { left: 600, right: 660 },
  pw: 450, ph: 500, vw: 1800, vh: 900, isRTL: false,
};

test('fits below → GAP under the last line, left-attached to the bracket (LTR)', () => {
  const { left, top, maxH } = place(base);
  assert.equal(top, 300 + 10);
  assert.equal(left, 600);
  assert.equal(maxH, 900 - 5 - 310); // capped at the viewport bottom
});

test('RTL: the picker\'s right edge attaches to the bracket edge', () => {
  const { left } = place({ ...base, isRTL: true, aRect: { left: 1200, right: 1260 } });
  assert.equal(left, 1260 - 450);
});

test('no room below → flips whole above the bracket\'s first line, untruncated', () => {
  const { top, maxH } = place({ ...base, anchorTop: 600, anchorBottom: 700 });
  // belowSpace = 900−5−710 = 185 < ph; aboveSpace = 600−10−5 = 585 ≥ ph.
  assert.equal(top, 600 - 10 - 500); // picker bottom lands at anchorTop − GAP
  assert.equal(maxH, 500);           // its own height — nothing shaved off
});

test('neither side fits whole → roomier side, height-capped (list scrolls)', () => {
  // belowSpace = 900−5−660 = 235; aboveSpace = 500−10−5 = 485 → above wins.
  const { top, maxH } = place({ ...base, anchorTop: 500, anchorBottom: 650, ph: 600 });
  assert.equal(top, 5);
  assert.equal(maxH, 485);
});

test('bracket spans the whole screen → overlay from the top margin', () => {
  // aboveSpace = 85, belowSpace = 55 — both under MIN_USABLE (380).
  const { top, maxH } = place({ ...base, anchorTop: 100, anchorBottom: 830, ph: 600 });
  assert.equal(top, 5);
  assert.equal(maxH, 900 - 10);
});

test('horizontal viewport clamps on both sides', () => {
  assert.equal(place({ ...base, aRect: { left: -80, right: -20 } }).left, 5);
  assert.equal(place({ ...base, aRect: { left: 1700, right: 1760 } }).left, 1800 - 450 - 5);
  assert.equal(
    place({ ...base, isRTL: true, aRect: { left: 100, right: 160 } }).left,
    5 // RTL right-attach would go negative → clamped to the margin
  );
});
