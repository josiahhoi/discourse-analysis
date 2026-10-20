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

test('pwHash is salted with the profile key (same password ≠ same hash)', async () => {
  const { sb, store } = setup();
  await sb.DA_PROFILES.publishToCloud(profile('Class A'), 'secret');
  await sb.DA_PROFILES.publishToCloud(profile('Class B'), 'secret');
  assert.notEqual(store.class_a.pwHash, store.class_b.pwHash);
  // And it is not the bare sha256 of the password either.
  assert.notEqual(store.class_a.pwHash, await sb.DA_PROFILES.sha256Hex('secret'));
});

test('legacy unsalted pwHash still authorizes an update and is upgraded', async () => {
  const { sb, store } = setup();
  // Simulate a profile published before salting: bare sha256(password).
  store.class_a = { name: 'Class A', pwHash: await sb.DA_PROFILES.sha256Hex('secret') };
  const created = await sb.DA_PROFILES.publishToCloud(profile('Class A'), 'secret');
  assert.equal(created, false);
  // Rewritten with the salted scheme.
  assert.equal(store.class_a.pwHash, await sb.DA_PROFILES.sha256Hex('class_a:secret'));
  // Wrong password is still rejected.
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

// ── ?profile= share links ───────────────────────────────────────────────────

/** Sandbox with what the link code touches: URL (not an ECMAScript built-in,
 *  so the vm context lacks it), history.replaceState and the status toast. */
function linkSetup(href) {
  const cloud = fakeCloud();
  const replaced = [];
  const statuses = [];
  const sb = createSandbox({
    db: cloud.db, firebase: cloud.firebase, URL,
    history: { state: null, replaceState: (_s, _t, url) => replaced.push(String(url)) },
    DA_UI: { showStatus: (msg, kind) => statuses.push({ msg, kind }) },
  });
  sb.history = sb.window.history;
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/profiles.js');
  const loc = href ? new URL(href) : null;
  return { sb, replaced, statuses, loc };
}

test('shareLink points at this page on the web, and at the public site from the desktop app', () => {
  const { sb } = linkSetup();
  const web = new URL('https://josiahhoi.github.io/discourse-analysis/?project=ABC');
  assert.equal(sb.DA_PROFILES.shareLink('Reformation Bible College', web),
    'https://josiahhoi.github.io/discourse-analysis/?profile=reformation_bible_college');
  const local = new URL('http://localhost:8765/index.html');
  assert.equal(sb.DA_PROFILES.shareLink('RBC', local), 'http://localhost:8765/index.html?profile=rbc');
  const desktop = new URL('file:///Applications/Discourse%20Analysis.app/index.html');
  assert.equal(sb.DA_PROFILES.shareLink('RBC', desktop), sb.DA_CONSTANTS.WEB_APP_URL + '?profile=rbc');
  assert.equal(sb.DA_PROFILES.shareLink('  ', web), '');
});

test('opening a ?profile= link loads that profile, keeps it active, and cleans the URL', async () => {
  const { sb, replaced, statuses, loc } = linkSetup('https://example.org/app/?profile=class_a&project=XYZ');
  await sb.DA_PROFILES.publishToCloud(profile('Class A', { dominance: { default: false, perType: {} } }), 'pw');
  sb.DA_PROFILES.setActiveById('josiah');

  const loaded = await sb.DA_PROFILES.loadFromUrl(loc);
  assert.equal(loaded.name, 'Class A');
  assert.equal(sb.DA_PROFILES.getActive().name, 'Class A');
  // Persisted like a manual Load, so it survives a reload.
  assert.equal(JSON.parse(sb.localStorage.getItem('da_active_profile')).name, 'Class A');
  // Only the profile param is removed; anything else (a project code) stays.
  assert.deepEqual(replaced, ['https://example.org/app/?project=XYZ']);
  assert.equal(statuses.at(-1).kind, 'success');
});

test('a ?profile= link to a missing profile reports it and leaves the active profile alone', async () => {
  const { sb, replaced, statuses, loc } = linkSetup('https://example.org/?profile=nope');
  sb.DA_PROFILES.setActiveById('biblearc');
  assert.equal(await sb.DA_PROFILES.loadFromUrl(loc), null);
  assert.equal(sb.DA_PROFILES.getActive().id, 'biblearc');
  assert.deepEqual(replaced, ['https://example.org/']);
  assert.equal(statuses.at(-1).kind, 'error');
});

test('a ?profile= link that fails to reach the cloud keeps the param so a refresh can retry', async () => {
  const { sb, replaced, statuses, loc } = linkSetup('https://example.org/?profile=class_a');
  sb.db.collection = () => ({ doc: () => ({ get: async () => { throw new Error('offline'); } }) });
  assert.equal(await sb.DA_PROFILES.loadFromUrl(loc), null);
  assert.deepEqual(replaced, []);
  assert.match(statuses.at(-1).msg, /offline/);
});

test('no ?profile= param: nothing happens', async () => {
  const { sb, replaced, statuses, loc } = linkSetup('https://example.org/?project=XYZ');
  assert.equal(await sb.DA_PROFILES.loadFromUrl(loc), null);
  assert.deepEqual(replaced, []);
  assert.deepEqual(statuses, []);
});
