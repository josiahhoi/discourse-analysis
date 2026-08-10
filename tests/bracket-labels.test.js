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

// ── Jump-over type list ──────────────────────────────────────────────────────
// JUMP_OVER_TYPES is the single canonical list the label picker offers for a
// bracket spanning non-adjacent dots. The picker intersects it with the active
// profile's vocabulary, so a profile edit that drops one of these silently
// shrinks the picker — these two tests make that fail loudly instead.

test('every jump-over type is a real relationship with a name and color', () => {
  const sb = setup();
  sb.DA_CONSTANTS.JUMP_OVER_TYPES.forEach((type) => {
    assert.ok(sb.DA_CONSTANTS.RELATIONSHIP_LABELS[type], `${type} has a menu name`);
    assert.ok(sb.DA_CONSTANTS.RELATIONSHIP_COLORS[type], `${type} has a color`);
    assert.ok(sb.DA_CONSTANTS.BRACKET_LABELS[type], `${type} has an abbreviation`);
  });
});

test('series and progression are jump-over-capable in every built-in profile', () => {
  const sb = setup();
  assert.ok(sb.DA_CONSTANTS.JUMP_OVER_TYPES.includes('progression'));
  for (const id of ['josiah', 'biblearc', 'gurtner', 'beale', 'schreiner']) {
    sb.DA_PROFILES.setActiveById(id);
    const visible = sb.DA_PROFILES.getVisibleTypes();
    // Guarantees the jump-over picker always offers at least these two.
    assert.ok(visible.includes('series'), `${id} has series`);
    assert.ok(visible.includes('progression'), `${id} has progression`);
  }
});

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

// ── Star-only arms can't flip ───────────────────────────────────────────────
// In labels like "* / G" or "P / *" one whole arm IS the dominance star, so
// moving the star off it would leave that side of the bracket blank. Those
// flips are refused outright and the picker hides Switch Stars for them
// (Swap carries the star along with the label, which is the move that
// applies there).

test('canFlipDominance is false when one arm is nothing but the star', () => {
  const sb = setup();
  // Josiah: ground "* / G", inference "∴ / *", progression "P / *", …
  for (const type of ['ground', 'inference', 'temporal', 'locative', 'comparison', 'concessive', 'progression']) {
    assert.equal(sb.DA_RENDERER.canFlipDominance(type), false, `${type} must not offer Switch Stars`);
  }
  // Both arms carry their own vocabulary — flipping is meaningful.
  for (const type of ['action-result', 'negative-positive', 'conditional', 'question-answer']) {
    assert.equal(sb.DA_RENDERER.canFlipDominance(type), true, `${type} should offer Switch Stars`);
  }
  // Single-arm labels have no second arm to flip against.
  assert.equal(sb.DA_RENDERER.canFlipDominance('series'), false);
});

test('a stored dominanceFlipped on a star-only arm renders unchanged, not blank', () => {
  const sb = setup();
  // Regression: this used to yield { top: '', bottom: 'G*' } — a bracket with
  // one arm labelled and the other empty. Old files carrying the flag must
  // render sensibly too, so the engine ignores the flip rather than trusting it.
  const flat = labels(sb, 'ground', false, false);
  const flipped = labels(sb, 'ground', false, true);
  assert.deepEqual({ top: flipped.top, bottom: flipped.bottom }, { top: flat.top, bottom: flat.bottom });
  assert.equal(flipped.top, '*');
  assert.equal(flipped.bottom, 'G');
});

test('flipping never empties an arm, for any type in any built-in profile', () => {
  const sb = setup();
  const types = Object.keys(sb.DA_CONSTANTS.RELATIONSHIP_LABELS);
  for (const id of ['josiah', 'biblearc', 'gurtner', 'beale', 'schreiner']) {
    sb.DA_PROFILES.setActiveById(id);
    for (const type of types) {
      for (const swapped of [false, true]) {
        const flat = labels(sb, type, swapped, false);
        if (flat.single !== undefined) continue; // single-arm label, nothing to flip
        const flipped = labels(sb, type, swapped, true);
        const where = `${id}/${type}${swapped ? ' (swapped)' : ''}`;
        // A bare "*" arm is legitimate — it's the dominance mark. What must
        // never happen is an arm that HAD something coming back with nothing.
        if (flat.top.trim()) assert.ok(flipped.top.trim(), `${where}: top arm went blank when flipped`);
        if (flat.bottom.trim()) assert.ok(flipped.bottom.trim(), `${where}: bottom arm went blank when flipped`);
      }
    }
  }
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
