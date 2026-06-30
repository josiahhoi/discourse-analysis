/**
 * Tests for the cloud sharing layer of DA_PROFILES against a fake Firestore.
 * Covers first-come name claiming, the password gate on updates, public load by
 * name, and that pwHash never leaks back into a loaded profile.
 */
const { test } = require('node:test');
// Non-strict assert: sandbox values live in another realm (see editor-logic.test.js).
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

/** Minimal in-memory stand-in for the Firestore API surface profiles.js uses. */
function fakeCloud() {
  const store = {};
  const docRef = (id) => ({
    id,
    get: async () => ({ exists: id in store, data: () => store[id] }),
    set: async (d) => { store[id] = d; }
  });
  const db = {
    _store: store,
    collection: () => ({ doc: docRef }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ({ exists: ref.id in store, data: () => store[ref.id] }),
      set: (ref, d) => { store[ref.id] = d; }
    })
  };
  const firebase = { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } };
  return { db, firebase, store };
}

function setup() {
  const cloud = fakeCloud();
  const sb = createSandbox({ db: cloud.db, firebase: cloud.firebase });
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/profiles.js');
  return { sb, store: cloud.store };
}

const profile = (name, over = {}) => ({
  name, dominance: { default: true, perType: {} }, labels: {}, ...over
});

test('nameKey normalizes case, spaces, and punctuation', () => {
  const { sb } = setup();
  assert.equal(sb.DA_PROFILES.nameKey("Dr. Gurtner's Method"), 'dr_gurtners_method');
  assert.equal(sb.DA_PROFILES.nameKey('  Spaced  Out  '), 'spaced_out');
});

test('publish claims a free name and stores a password hash', async () => {
  const { sb, store } = setup();
  const created = await sb.DA_PROFILES.publishToCloud(profile('Class A'), 'secret');
  assert.equal(created, true);
  assert.ok(store.class_a, 'doc stored under normalized key');
  assert.ok(store.class_a.pwHash, 'password hash stored');
  assert.equal(store.class_a.name, 'Class A');
  assert.equal(store.class_a.builtin, false);
});

test('load by name returns the profile and never leaks the password hash', async () => {
  const { sb } = setup();
  await sb.DA_PROFILES.publishToCloud(profile('Class A', { dominance: { default: false, perType: {} } }), 'secret');
  const loaded = await sb.DA_PROFILES.loadFromCloud('class a'); // case-insensitive
  assert.equal(loaded.name, 'Class A');
  assert.equal(loaded.dominance.default, false);
  assert.equal('pwHash' in loaded, false);
  assert.equal(sb.DA_PROFILES.getActive().name, 'Class A'); // became active
});

test('updating with the correct password succeeds (returns false = not new)', async () => {
  const { sb } = setup();
  await sb.DA_PROFILES.publishToCloud(profile('Class A'), 'secret');
  const created = await sb.DA_PROFILES.publishToCloud(
    profile('Class A', { dominance: { default: false, perType: {} } }), 'secret');
  assert.equal(created, false);
});

test('updating with the wrong password is rejected', async () => {
  const { sb } = setup();
  await sb.DA_PROFILES.publishToCloud(profile('Class A'), 'secret');
  await assert.rejects(
    () => sb.DA_PROFILES.publishToCloud(profile('Class A'), 'wrong'),
    /password does not match/
  );
});

test('loading a name that does not exist returns null', async () => {
  const { sb } = setup();
  const loaded = await sb.DA_PROFILES.loadFromCloud('nope');
  assert.equal(loaded, null);
});

test('publish requires a name and a password', async () => {
  const { sb } = setup();
  await assert.rejects(() => sb.DA_PROFILES.publishToCloud(profile(''), 'pw'), /name/);
  await assert.rejects(() => sb.DA_PROFILES.publishToCloud(profile('X'), ''), /password/);
});
