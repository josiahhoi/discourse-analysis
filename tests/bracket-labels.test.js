/**
 * Tests for getBracketLabels — the label/dominance engine. Structure is read
 * straight from the resolved abbr string: "/" splits the two arms, "*" marks
 * dominance, and a literal "//" is the comparison glyph. There are no per-type
 * single-vs-two-arm tables and no auto-added stars — the active notation profile
 * (DA_PROFILES) supplies the string. Default profile is Josiah.
 */
const { test } = require('node:test');
// Non-strict assert: sandbox values live in another realm (see editor-logic.test.js).
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup() {
  const sb = createSandbox();
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/profiles.js');
  // getBracketLabels now lives in its own focused module (split out of
  // rendering-engine.js); load just that — it needs no other render code.
  load(sb, 'js/utils/render-labels.js');
  return sb;
}

const labels = (sb, ...args) => sb.DA_RENDERER.getBracketLabels(...args);

test('single-label type returns one label, no top/bottom', () => {
  const sb = setup();
  const out = labels(sb, 'series'); // "S"
  assert.equal(out.single, 'S');
  assert.equal(out.top, undefined);
});

test('two-arm label keeps the star on the side the string specifies', () => {
  const sb = setup();
  const out = labels(sb, 'action-result'); // Josiah: "Ac / Res*"
  assert.equal(out.top, 'Ac');
  assert.equal(out.bottom, 'Res*');
});

test('a starless two-arm label gets NO auto star (dominance is explicit)', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('schreiner'); // negative-positive: "- / +", no star
  const out = labels(sb, 'negative-positive');
  assert.equal(out.top, '-');
  assert.equal(out.bottom, '+');
});

test('labelsSwapped swaps top and bottom', () => {
  const sb = setup();
  const out = labels(sb, 'action-result', true);
  assert.equal(out.top, 'Res*');
  assert.equal(out.bottom, 'Ac');
});

test('dominanceFlipped moves the star to the opposite side', () => {
  const sb = setup();
  const out = labels(sb, 'action-result', false, true); // star starts on bottom
  assert.equal(out.top.includes('*'), true);
  assert.equal(out.bottom.includes('*'), false);
});

// ── The comparison "//" glyph ───────────────────────────────────────────────

test('Gurtner comparison is a single-arm "//" glyph (not two empty arms)', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('gurtner');
  const out = labels(sb, 'comparison'); // "//"
  assert.equal(out.single, '//');
  assert.equal(out.top, undefined);
});

test('Beale comparison is two arms: "//" on top, dominant star on bottom', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('beale');
  const out = labels(sb, 'comparison'); // "// / *"
  assert.equal(out.top, '//');
  assert.equal(out.bottom, '*');
});

// ── Profiles ────────────────────────────────────────────────────────────────

test('Gurtner profile substitutes the alternate label set', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('gurtner'); // action-purpose -> "M / Ed*"
  const out = labels(sb, 'action-purpose');
  assert.equal(out.top, 'M');
  assert.equal(out.bottom, 'Ed*');
});

test('Schreiner turns dominance off — two arms kept, stars stripped', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('schreiner');
  const out = labels(sb, 'action-result'); // "Ac / Res", no star anyway
  assert.equal(out.top, 'Ac');
  assert.equal(out.bottom, 'Res');
});

test('Schreiner renders a single-label relationship with no slash', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('schreiner');
  assert.equal(labels(sb, 'ground').single, 'G');
});

test('General-Specific aliases to Idea-Explanation when read in BibleArc', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('biblearc'); // no general-specific; has idea-explanation
  const out = labels(sb, 'general-specific'); // -> "Id / Exp*"
  assert.equal(out.top, 'Id');
  assert.equal(out.bottom, 'Exp*');
});

// ── Custom (cl_) labels ─────────────────────────────────────────────────────

test('custom (cl_) label with a slash but no star: two arms, no dominance', () => {
  const sb = setup();
  sb.DA_STATE.customLabels = [{ id: 'cl_demo', label: 'Foo/Bar' }];
  const out = labels(sb, 'cl_demo');
  assert.equal(out.top, 'Foo');
  assert.equal(out.bottom, 'Bar');
});

test('custom (cl_) label with a star routes connection to the starred end', () => {
  const sb = setup();
  sb.DA_STATE.customLabels = [{ id: 'cl_star', label: 'A/B*' }];
  const out = labels(sb, 'cl_star');
  assert.equal(out.top, 'A');
  assert.equal(out.bottom, 'B*');
});

test('custom (cl_) label with no slash is a single label', () => {
  const sb = setup();
  sb.DA_STATE.customLabels = [{ id: 'cl_plain', label: 'MyRel' }];
  const out = labels(sb, 'cl_plain');
  assert.equal(out.single, 'MyRel');
});

test('unknown type falls back to a two-letter single label', () => {
  const sb = setup();
  const out = labels(sb, 'zzz'); // no slash in fallback -> single
  assert.equal(out.single, 'zz');
});

// ── Dominance overrides ─────────────────────────────────────────────────────

test('per-type dominance override strips the star for one relationship', () => {
  const sb = setup();
  sb.DA_PROFILES.setActive({
    name: 'Mixed', dominance: { default: true, perType: { 'action-result': false } }, labels: {}
  });
  // action-result resolves to the built-in "Ac/Res*"; dominance off -> star gone
  assert.equal(labels(sb, 'action-result').bottom, 'Res');
});

test('dominanceFlipped is ignored when the profile hides dominance', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('schreiner');
  const out = labels(sb, 'action-result', false, true);
  assert.equal(out.top.includes('*'), false);
  assert.equal(out.bottom.includes('*'), false);
});

test('a profile label override renames a relationship abbreviation (no auto star)', () => {
  const sb = setup();
  sb.DA_PROFILES.setActive({
    name: 'Renamed', dominance: { default: true, perType: {} },
    labels: { ground: { abbr: 'Gr/Bd', name: 'Ground/Basis' } }
  });
  const out = labels(sb, 'ground');
  assert.equal(out.top, 'Gr');
  assert.equal(out.bottom, 'Bd'); // starless override stays starless
});
