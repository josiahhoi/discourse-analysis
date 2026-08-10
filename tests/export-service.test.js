/**
 * Tests for the export geometry.
 *
 * Background: exports were silently cropped to whatever fitted on screen. The
 * capture canvas was sized to the full content (correct), but html2canvas
 * paints an element clipped to its own overflow box, and .workspace is a
 * scroll container — so everything past the visible area came out blank. The
 * PDF had a second, independent defect: jsPDF's 'px' unit writes a MediaBox
 * 4/3x larger than the pixel count, turning a normal diagram into a ~33in
 * poster that print dialogs tiled across hundreds of sheets.
 *
 * The clipping half is a rendering behavior and is covered by the e2e spec
 * (it needs a real browser). The page-size half is pure geometry and lives
 * here.
 */
const { test } = require('node:test');
// Non-strict assert: sandbox values live in another realm (see editor-logic.test.js).
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup() {
  const sb = createSandbox();
  load(sb, 'js/services/export-service.js');
  return sb;
}

const pageSize = (sb, w, h) => sb.DA_EXPORT.getPdfPageSize({ width: w, height: h });

test('PDF page is the diagram natural size: 2x canvas px -> pt at 0.75 pt/px', () => {
  const sb = setup();
  // A 1498x1174 CSS-px diagram captured at 2x -> 2996x2347 canvas.
  const p = pageSize(sb, 2996, 2347);
  assert.equal(p.width, 1123.5);   // 1498 css px * 0.75
  assert.equal(p.height, 880.125); // 1173.5 css px * 0.75
  // Sanity: ~15.6 x 12.2 inches, NOT the ~33 x 30in the old unit:'px' produced.
  assert.ok(p.width / 72 < 20 && p.height / 72 < 20, 'page stays a sane physical size');
});

test('a square canvas yields a square page (no orientation skew)', () => {
  const sb = setup();
  const p = pageSize(sb, 1000, 1000);
  assert.equal(p.width, p.height);
  assert.equal(p.width, 375); // 500 css px * 0.75
});

test('oversized diagrams scale down to fit jsPDF 14400pt cap, keeping aspect', () => {
  const sb = setup();
  // Past 14400pt jsPDF clamps the MediaBox but addImage keeps drawing at the
  // requested size, so the overflow would be lost outright. Scale instead.
  const p = pageSize(sb, 80000, 40000);
  assert.ok(p.width <= 14400 && p.height <= 14400, 'both dimensions within the cap');
  assert.equal(Math.round(p.width), 14400, 'the long edge sits exactly at the cap');
  assert.ok(Math.abs((p.width / p.height) - 2) < 1e-9, 'aspect ratio preserved');
});

test('a page already within the cap is never rescaled', () => {
  const sb = setup();
  const p = pageSize(sb, 2996, 2347);
  assert.equal(p.width, (2996 / 2) * 0.75, 'no scaling applied below the cap');
});
