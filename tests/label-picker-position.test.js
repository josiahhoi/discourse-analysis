/**
 * computeLabelPickerPosition (js/utils/ui-menus.js) — the label picker opens
 * underneath the clicked bracket's own last line (anchorBottom = that row's
 * bottom edge, resolved by the caller), left-attached to the bracket's gutter
 * edge (mirrored in RTL). Pure rect math in viewport space.
 * GAP = 10, MARGIN = 5, MIN_H = 260.
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
  anchorBottom: 300, aRect: { left: 600, right: 660 },
  pw: 450, ph: 500, vw: 1800, vh: 900, isRTL: false,
};

test('opens GAP below the anchor row, left-attached to the bracket edge (LTR)', () => {
  const { left, top } = place(base);
  assert.equal(top, 300 + 10);
  assert.equal(left, 600);
});

test('RTL: right edge of the picker attaches to the bracket edge', () => {
  const { left, top } = place({ ...base, isRTL: true, aRect: { left: 1200, right: 1260 } });
  assert.equal(top, 310);
  assert.equal(left, 1260 - 450);
});

test('bracket ends near the screen bottom → pulled up so ≥ MIN_H remains below', () => {
  const { top } = place({ ...base, anchorBottom: 850 });
  assert.equal(top, 900 - 260 - 5); // 635, not 860
});

test('a naturally short picker only reserves its own height, not MIN_H', () => {
  const { top } = place({ ...base, anchorBottom: 850, ph: 200 });
  assert.equal(top, 900 - 200 - 5); // 695: fits fully without over-pulling
});

test('top is floored at MARGIN even for anchors above the viewport', () => {
  const { top } = place({ ...base, anchorBottom: -400 });
  assert.equal(top, 5);
});

test('horizontal viewport clamps on both sides', () => {
  assert.equal(place({ ...base, aRect: { left: -80, right: -20 } }).left, 5);
  assert.equal(place({ ...base, aRect: { left: 1700, right: 1760 } }).left, 1800 - 450 - 5);
  assert.equal(
    place({ ...base, isRTL: true, aRect: { left: 100, right: 160 } }).left,
    5 // RTL right-attach would go negative → clamped to the margin
  );
});
