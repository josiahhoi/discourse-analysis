/**
 * Tests for the cloud-session state machine in cloud-sync.js. The session is
 * one of four explicit states — inactive / remembered / live / live-dirty —
 * and every transition goes through the DA_CLOUD service. These tests drive
 * the transitions against a fake Firestore and assert the state (and the
 * listener bookkeeping) after each.
 */
const { test } = require('node:test');
// Non-strict assert: sandbox values live in another realm (see editor-logic.test.js).
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

/** Minimal fake of the Firestore surface cloud-sync.js touches. */
function fakeDb() {
  const docs = {};
  const listeners = {};
  return {
    _docs: docs,
    collection: () => ({
      doc: (id) => ({
        set: async (d) => { docs[id] = d; },
        update: async (d) => {
          if (!(id in docs)) throw new Error('No document to update');
          docs[id] = { ...docs[id], ...d };
        },
        get: async () => ({ exists: id in docs, data: () => docs[id] }),
        onSnapshot: (cb) => {
          listeners[id] = cb;
          return () => { delete listeners[id]; };
        },
      }),
    }),
    _fire: (id) => listeners[id] && listeners[id]({ exists: id in docs, data: () => docs[id] }),
    _listenerCount: () => Object.keys(listeners).length,
  };
}

function setup({ confirmAnswer = true } = {}) {
  const db = fakeDb();
  const toasts = [];
  const sb = createSandbox({
    db,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
    confirm: () => confirmAnswer,
    URL,
    location: { href: 'http://localhost/' },
    history: { pushState: () => {}, replaceState: () => {} },
    DA_UI: {
      showStatus: (msg, type) => toasts.push(`${type}:${msg}`),
      updateCloudUI: () => {},
    },
    DA_EXPORT: { buildBracketData: () => ({ propositions: ['x'], verseRefs: ['1'] }) },
  });
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/cloud-sync.js');
  return { sb, db, toasts };
}

test('starts inactive; startCloudSync goes live and writes the project doc', async () => {
  const { sb, db } = setup();
  assert.equal(sb.DA_CLOUD.sessionState(), 'inactive');

  await sb.DA_CLOUD.startCloudSync();
  assert.equal(sb.DA_CLOUD.sessionState(), 'live');
  const id = sb.DA_CLOUD.getProjectId();
  assert.ok(id, 'a project id was generated');
  assert.ok(db._docs[id], 'the project doc was written');
  assert.equal(db._listenerCount(), 1, 'a snapshot listener is attached');
});

test('markDirty/markSynced flip live ↔ live-dirty; markDirty is a no-op when not live', async () => {
  const { sb } = setup();
  sb.DA_CLOUD.markDirty(); // not live yet
  assert.equal(sb.DA_CLOUD.sessionState(), 'inactive');

  await sb.DA_CLOUD.startCloudSync();
  sb.DA_CLOUD.markDirty();
  assert.equal(sb.DA_CLOUD.sessionState(), 'live-dirty');
  sb.DA_CLOUD.markSynced();
  assert.equal(sb.DA_CLOUD.sessionState(), 'live');
});

test('stopCloudSync keeps the id (remembered); startCloudSync can resume it', async () => {
  const { sb, db } = setup({ confirmAnswer: true });
  await sb.DA_CLOUD.startCloudSync();
  const id = sb.DA_CLOUD.getProjectId();

  sb.DA_CLOUD.stopCloudSync();
  assert.equal(sb.DA_CLOUD.sessionState(), 'remembered');
  assert.equal(sb.DA_CLOUD.getProjectId(), id, 'id survives for resume');
  assert.equal(db._listenerCount(), 0, 'listener detached');

  await sb.DA_CLOUD.startCloudSync(); // confirm() = true → resume
  assert.equal(sb.DA_CLOUD.sessionState(), 'live');
  assert.equal(sb.DA_CLOUD.getProjectId(), id, 'same project resumed');
});

test('resetSessionForNewContent forgets everything, from live and from remembered', async () => {
  const { sb, db } = setup();
  await sb.DA_CLOUD.startCloudSync();
  sb.DA_CLOUD.resetSessionForNewContent();
  assert.equal(sb.DA_CLOUD.sessionState(), 'inactive');
  assert.equal(sb.DA_CLOUD.getProjectId(), null);
  assert.equal(db._listenerCount(), 0);

  sb.DA_CLOUD.adoptRememberedProject('OLD999');
  assert.equal(sb.DA_CLOUD.sessionState(), 'remembered');
  sb.DA_CLOUD.resetSessionForNewContent();
  assert.equal(sb.DA_CLOUD.sessionState(), 'inactive');
});

test('syncToCloud refuses in remembered state, pushes in live state', async () => {
  const { sb, db } = setup();
  // Remembered (e.g. imported file's id): refuse — that project may not be on screen.
  sb.DA_CLOUD.adoptRememberedProject('SOMEID');
  assert.equal(await sb.DA_CLOUD.syncToCloud(), false);

  sb.DA_CLOUD.resetSessionForNewContent();
  await sb.DA_CLOUD.startCloudSync();
  const id = sb.DA_CLOUD.getProjectId();
  sb.DA_CLOUD.markDirty();
  assert.equal(await sb.DA_CLOUD.syncToCloud(), true);
  assert.equal(sb.DA_CLOUD.sessionState(), 'live', 'clean again after push');
  assert.ok(db._docs[id].lastUpdated, 'doc updated');
});

test('joinCloudSync of a missing project stays inactive and reports the error', async () => {
  const { sb, toasts } = setup();
  await sb.DA_CLOUD.joinCloudSync('NOPE42');
  assert.equal(sb.DA_CLOUD.sessionState(), 'inactive');
  assert.ok(toasts.some((t) => t.startsWith('error:Failed to join')), 'error toast shown');
});

test('an incoming cloud snapshot lands the session back at live (clean)', async () => {
  const { sb, db } = setup();
  await sb.DA_CLOUD.startCloudSync();
  const id = sb.DA_CLOUD.getProjectId();
  sb.DA_CLOUD.markDirty();
  assert.equal(sb.DA_CLOUD.sessionState(), 'live-dirty');

  db._fire(id); // simulate the listener receiving the cloud copy
  assert.equal(sb.DA_CLOUD.sessionState(), 'live');
  assert.deepEqual(sb.DA_STATE.propositions, ['x'], 'cloud copy adopted');
});
