/**
 * Tests for the zoom preference in ui-dialogs.js: a persisted on-screen
 * reading preference (mirrors initTheme) stepped across DA_CONSTANTS.ZOOM_LEVELS.
 * Covers stepping/clamping at the ends, persistence round-trip, corrupt/missing
 * localStorage falling back to the default, and getZoomFactor's conversion.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

/** A fake documentElement with a real style.setProperty so applyZoom's CSS
 *  var write can be asserted on, plus the two id-lookups updateZoomButtonText
 *  reads (getElementById already returns null by default for the rest). */
function setup() {
  const rootStyle = {};
  const sb = createSandbox({
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){}, contains: () => false }, setAttribute(){}, appendChild(){}, addEventListener(){} }),
      addEventListener: () => {},
      readyState: 'complete',
      documentElement: {
        style: { setProperty: (k, v) => { rootStyle[k] = v; } },
        getAttribute: () => null,
        setAttribute: () => {},
      },
    },
  });
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/ui-dialogs.js');
  return { sb, rootStyle };
}

test('initZoom falls back to the default with nothing in localStorage', () => {
  const { sb, rootStyle } = setup();
  sb.DA_UI.initZoom();
  assert.equal(sb.DA_STATE.zoomLevel, 100);
  assert.equal(rootStyle['--da-zoom'], '1');
});

test('initZoom loads a previously saved level', () => {
  const { sb, rootStyle } = setup();
  sb.localStorage.setItem(sb.DA_CONSTANTS.ZOOM_KEY, '125');
  sb.DA_UI.initZoom();
  assert.equal(sb.DA_STATE.zoomLevel, 125);
  assert.equal(rootStyle['--da-zoom'], '1.25');
});

test('initZoom ignores a corrupt/unrecognized saved value and falls back to default', () => {
  const { sb } = setup();
  sb.localStorage.setItem(sb.DA_CONSTANTS.ZOOM_KEY, 'not-a-number');
  sb.DA_UI.initZoom();
  assert.equal(sb.DA_STATE.zoomLevel, 100);

  const { sb: sb2 } = setup();
  sb2.localStorage.setItem(sb2.DA_CONSTANTS.ZOOM_KEY, '999'); // not one of ZOOM_LEVELS
  sb2.DA_UI.initZoom();
  assert.equal(sb2.DA_STATE.zoomLevel, 100);
});

test('initZoom does not persist or trigger a render (init is a one-time load, not a user action)', () => {
  const { sb } = setup();
  let rendered = false;
  sb.window.renderAll = () => { rendered = true; };
  sb.DA_UI.initZoom();
  assert.equal(sb.localStorage.getItem(sb.DA_CONSTANTS.ZOOM_KEY), null);
  assert.equal(rendered, false);
});

test('zoomIn/zoomOut step through ZOOM_LEVELS in order and persist', () => {
  const { sb, rootStyle } = setup();
  sb.DA_UI.initZoom(); // 100
  sb.DA_UI.zoomIn();
  assert.equal(sb.DA_STATE.zoomLevel, 110);
  assert.equal(rootStyle['--da-zoom'], '1.1');
  assert.equal(sb.localStorage.getItem(sb.DA_CONSTANTS.ZOOM_KEY), '110');

  sb.DA_UI.zoomOut();
  sb.DA_UI.zoomOut();
  assert.equal(sb.DA_STATE.zoomLevel, 90);
});

test('zoomOut clamps at the lowest level instead of wrapping or going negative', () => {
  const { sb } = setup();
  sb.DA_UI.setZoomLevel(75); // lowest defined level
  sb.DA_UI.zoomOut();
  sb.DA_UI.zoomOut();
  assert.equal(sb.DA_STATE.zoomLevel, 75);
});

test('zoomIn clamps at the highest level', () => {
  const { sb } = setup();
  sb.DA_UI.setZoomLevel(150); // highest defined level
  sb.DA_UI.zoomIn();
  sb.DA_UI.zoomIn();
  assert.equal(sb.DA_STATE.zoomLevel, 150);
});

test('setZoomLevel rejects a level not in ZOOM_LEVELS (no-op)', () => {
  const { sb } = setup();
  sb.DA_UI.setZoomLevel(100);
  sb.DA_UI.setZoomLevel(83); // not a defined step
  assert.equal(sb.DA_STATE.zoomLevel, 100);
});

test('resetZoom returns to the default from any level', () => {
  const { sb } = setup();
  sb.DA_UI.setZoomLevel(150);
  sb.DA_UI.resetZoom();
  assert.equal(sb.DA_STATE.zoomLevel, 100);
});

test('getZoomFactor converts the percent level to a plain multiplier', () => {
  const { sb } = setup();
  sb.DA_UI.setZoomLevel(75);
  assert.equal(sb.DA_UI.getZoomFactor(), 0.75);
  sb.DA_UI.setZoomLevel(150);
  assert.equal(sb.DA_UI.getZoomFactor(), 1.5);
});

test('applyZoom with { persist: false } changes state/CSS without touching localStorage (export capture path)', () => {
  const { sb, rootStyle } = setup();
  sb.DA_UI.setZoomLevel(125);
  sb.DA_UI.applyZoom(100, { persist: false, rerender: false });
  assert.equal(sb.DA_STATE.zoomLevel, 100, 'in-memory value changed');
  assert.equal(rootStyle['--da-zoom'], '1', 'CSS var changed');
  assert.equal(sb.localStorage.getItem(sb.DA_CONSTANTS.ZOOM_KEY), '125', 'persisted preference untouched');
});

test('applyZoom triggers a re-render by default (so bracket geometry follows the new size)', () => {
  const { sb } = setup();
  let rendered = 0;
  sb.window.renderAll = () => { rendered++; };
  sb.DA_UI.zoomIn();
  assert.equal(rendered, 1);
});
