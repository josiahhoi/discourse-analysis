/**
 * Tests for the notation-profile module: built-ins, the active-profile
 * preference, normalize(), and the resolution helpers that the rendering/UI
 * layers depend on.
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
  return sb;
}

test('defaults to the Josiah profile', () => {
  const sb = setup();
  assert.equal(sb.DA_PROFILES.getActive().id, 'josiah');
});

test('ships the five notation-system built-ins', () => {
  const sb = setup();
  const b = sb.DA_PROFILES.builtins();
  assert.deepEqual(Object.keys(b).sort(), ['beale', 'biblearc', 'gurtner', 'josiah', 'schreiner']);
});

test('Josiah marks dominance; Schreiner does not', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('josiah');
  assert.equal(sb.DA_PROFILES.isDominanceShown('ground'), true);
  sb.DA_PROFILES.setActiveById('schreiner');
  assert.equal(sb.DA_PROFILES.isDominanceShown('ground'), false);
});

test('a profile only exposes its own relationship types', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('schreiner');
  const types = sb.DA_PROFILES.getVisibleTypes();
  assert.ok(types.includes('double-ground'), 'Schreiner has Double Ground');
  assert.ok(!types.includes('anticipation-fulfillment'), 'Schreiner lacks Anticipation-Fulfillment');
});

test('effectiveType aliases General-Specific to Idea-Explanation in BibleArc', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('biblearc');
  assert.equal(sb.DA_PROFILES.effectiveType('general-specific'), 'idea-explanation');
  // but Gurtner keeps it as itself (it's a native type there)
  sb.DA_PROFILES.setActiveById('gurtner');
  assert.equal(sb.DA_PROFILES.effectiveType('general-specific'), 'general-specific');
});

test('isTwoArm is derived from the resolved label string', () => {
  const sb = setup();
  sb.DA_PROFILES.setActiveById('josiah');
  assert.equal(sb.DA_PROFILES.isTwoArm('ground'), true);   // "* / G"
  assert.equal(sb.DA_PROFILES.isTwoArm('series'), false);  // "S"
  sb.DA_PROFILES.setActiveById('gurtner');
  assert.equal(sb.DA_PROFILES.isTwoArm('comparison'), false); // "//" glyph, single arm
});

test('per-type override beats the profile default', () => {
  const sb = setup();
  sb.DA_PROFILES.setActive({
    name: 'X', dominance: { default: true, perType: { ground: false } }, labels: {}
  });
  assert.equal(sb.DA_PROFILES.isDominanceShown('ground'), false);
  assert.equal(sb.DA_PROFILES.isDominanceShown('cause-effect'), true);
});

test('setActive persists to localStorage and reloads', () => {
  const sb = setup();
  sb.DA_PROFILES.setActive({ name: 'Saved', dominance: { default: false, perType: {} }, labels: {} });
  // Simulate a fresh page load against the same storage.
  const sb2 = createSandbox({ localStorage: sb.localStorage });
  load(sb2, 'js/utils/constants.js');
  load(sb2, 'js/services/state.js');
  load(sb2, 'js/services/profiles.js');
  assert.equal(sb2.DA_PROFILES.getActive().name, 'Saved');
  assert.equal(sb2.DA_PROFILES.isDominanceShown('ground'), false);
});

test('getAbbr resolves override > builtin > custom > fallback', () => {
  const sb = setup();
  // builtin default (Josiah)
  assert.equal(sb.DA_PROFILES.getAbbr('ground'), '* / G');
  // override wins
  sb.DA_PROFILES.setActive({ name: 'O', dominance: { default: true, perType: {} }, labels: { ground: { abbr: 'Gr' } } });
  assert.equal(sb.DA_PROFILES.getAbbr('ground'), 'Gr');
  // custom cl_ from state
  sb.DA_STATE.customLabels = [{ id: 'cl_x', label: 'Zz' }];
  assert.equal(sb.DA_PROFILES.getAbbr('cl_x'), 'Zz');
  // unknown fallback = first two chars
  assert.equal(sb.DA_PROFILES.getAbbr('qqqq'), 'qq');
});

test('getName returns Gurtner names when the Gurtner profile is active', () => {
  const sb = setup();
  assert.equal(sb.DA_PROFILES.getName('action-purpose'), 'Action-Purpose (Ac/Pur)');
  sb.DA_PROFILES.setActiveById('gurtner');
  assert.equal(sb.DA_PROFILES.getName('action-purpose'), 'Means-End (M/Ed)');
});

test('normalize coerces junk into a valid profile (default dominance on)', () => {
  const sb = setup();
  const p = sb.DA_PROFILES.normalize({ name: 'Half' });
  assert.equal(p.dominance.default, true);
  assert.deepEqual(p.dominance.perType, {});
  assert.deepEqual(p.labels, {});
});
