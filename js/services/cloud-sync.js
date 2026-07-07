/**
 * Cloud session service (Firestore live-share).
 *
 * The session is a small state machine over three DA_STATE storage fields
 * (activeProjectId, cloudUnsubscribe, cloudDirty). Only THIS file may write
 * those fields; everything else reads the session through sessionState()/
 * isLive()/getProjectId() and changes it through the transition functions.
 * That's what makes the historical bug class — "feature X replaced the local
 * content but forgot to reset field Y" — unrepresentable elsewhere.
 *
 * States (sessionState()):
 *   inactive    — no project id, no listener. Fresh/local-only work.
 *   remembered  — a project id is stored but no listener is attached. Reached
 *                 by stopCloudSync (so the session can be resumed later) or by
 *                 importing a file that carries its project id. Manual sync is
 *                 refused in this state: the id may belong to work that is no
 *                 longer on screen.
 *   live        — listener attached, local matches the cloud copy.
 *   live-dirty  — listener attached, local has unpushed edits.
 *
 * Transitions:
 *   startCloudSync / joinCloudSync  → live
 *   markDirty / markSynced          live ↔ live-dirty
 *   stopCloudSync                   live → remembered   (keeps the id)
 *   resetSessionForNewContent       any  → inactive     (new/fetched/imported
 *                                    content replaces the document — REQUIRED
 *                                    for every content-replacing feature)
 *   adoptRememberedProject          inactive → remembered (imported file's id)
 */

let renderCallbacks = {
  renderAll: () => {}
};

function registerCloudRenderCallbacks(callbacks) {
  Object.assign(renderCallbacks, callbacks);
}

// ── State inspection ──────────────────────────────────────────────────────────

function sessionState() {
  if (DA_STATE.cloudUnsubscribe) return DA_STATE.cloudDirty ? 'live-dirty' : 'live';
  return DA_STATE.activeProjectId ? 'remembered' : 'inactive';
}

function isLive() {
  return !!DA_STATE.cloudUnsubscribe;
}

function getProjectId() {
  return DA_STATE.activeProjectId || null;
}

// ── Transitions ───────────────────────────────────────────────────────────────

/** Local edit while live → live-dirty. No-op when no live session. */
function markDirty() {
  if (!DA_STATE.cloudUnsubscribe) return;
  DA_STATE.cloudDirty = true;
  updateSyncUI();
}

/** Successful push / adopted cloud snapshot → live (clean). */
function markSynced() {
  DA_STATE.cloudDirty = false;
  updateSyncUI();
}

/** Attach the listener and surface the session in the UI/URL. → live */
function _enterLiveSession(projectId) {
  DA_STATE.activeProjectId = projectId;
  DA_STATE.cloudDirty = false;
  // Attach the listener first so cloudUnsubscribe is set before updateCloudUI
  // calls updateSyncUI — otherwise the sync badge/button show a stale state.
  initCloudSync(projectId);
  DA_UI.updateCloudUI(true, projectId);

  const url = new URL(window.location.href);
  url.searchParams.set('project', projectId);
  window.history.pushState({}, '', url);
}

/** Detach the listener and clear the session from the UI/URL. */
function _leaveLiveSession() {
  if (DA_STATE.cloudUnsubscribe) DA_STATE.cloudUnsubscribe();
  DA_STATE.cloudUnsubscribe = null;
  DA_UI.updateCloudUI(false);

  const url = new URL(window.location.href);
  url.searchParams.delete('project');
  window.history.pushState({}, '', url);
}

/** User pressed "Turn Cloud Sync OFF". live → remembered: the id is kept so
 *  the same project can be resumed later from this same document. */
function stopCloudSync() {
  _leaveLiveSession();
  DA_UI.showStatus('Cloud Sync stopped.', 'info');
}

/**
 * The document is being REPLACED (New, fetch passage, paste import, file
 * import) → inactive. Ends any live session and forgets the remembered id:
 * new content must never be able to resume — and overwrite — the project the
 * previous content belonged to. Every content-replacing feature calls this
 * one function instead of juggling the underlying fields.
 */
function resetSessionForNewContent() {
  const wasLive = isLive();
  if (wasLive) _leaveLiveSession();
  DA_STATE.activeProjectId = null;
  DA_STATE.cloudDirty = false;
  if (wasLive) DA_UI.showStatus('Cloud Sync stopped — this new work is not connected to the old project.', 'info');
}

/** An imported file carries the project id it was shared under. inactive →
 *  remembered, so "Turn Cloud Sync ON" can offer to resume that project.
 *  (Manual sync stays refused until the user explicitly goes live.) */
function adoptRememberedProject(projectId) {
  DA_STATE.activeProjectId = projectId || null;
  DA_STATE.cloudDirty = false;
}

// ── Live session I/O ──────────────────────────────────────────────────────────

async function startCloudSync() {
  if (!db) return DA_UI.showStatus('Firebase not initialized.', 'error');

  let projectId = getProjectId();

  if (projectId) {
    const reuse = confirm(`This project was previously synced with code ${projectId}. \n\nWould you like to resume that session? \n(Cancel will generate a new six-digit code)`);
    if (!reuse) {
      projectId = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
  } else {
    projectId = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  const currentAuthor = (document.getElementById('pageAuthor')?.value || '').trim() || localStorage.getItem(DA_CONSTANTS.PAGE_AUTHOR_KEY) || 'Anonymous';
  const bracketData = DA_EXPORT.buildBracketData();
  const projectData = {
    ...bracketData,
    author: currentAuthor,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('projects').doc(projectId).set(projectData);
    _enterLiveSession(projectId); // we just wrote the current state → clean
    DA_UI.showStatus('Cloud Sync started!', 'success');
  } catch (err) {
    DA_UI.showStatus('Failed to start sync: ' + err.message, 'error');
  }
}

async function joinCloudSync(projectId) {
  if (!db) return DA_UI.showStatus('Firebase not initialized.', 'error');
  if (!projectId) return;

  try {
    const doc = await db.collection('projects').doc(projectId).get();
    if (!doc.exists) {
      throw new Error('Project not found.');
    }

    _enterLiveSession(projectId); // an incoming snapshot defines our baseline
    DA_UI.showStatus('Connected to project ' + projectId, 'success');
  } catch (err) {
    DA_UI.showStatus('Failed to join: ' + err.message, 'error');
  }
}

function initCloudSync(projectId) {
  if (DA_STATE.cloudUnsubscribe) DA_STATE.cloudUnsubscribe();

  DA_STATE.cloudUnsubscribe = db.collection('projects').doc(projectId).onSnapshot((doc) => {
    if (doc.exists && !DA_STATE.isUpdatingFromCloud) {
      const data = doc.data();
      handleCloudData(data);
    }
  });
}

function handleCloudData(data) {
  DA_STATE.isUpdatingFromCloud = true;

  if (window.DA_PERSISTENCE && DA_PERSISTENCE.normalizeBracketData) {
    data = DA_PERSISTENCE.normalizeBracketData(data);
  }

  // A cloud snapshot can swap the passage entirely; the local parallel column
  // (transient view state) belongs to the old passage in that case. Keep it
  // across same-passage snapshots (routine sync echoes) so a viewer's column
  // doesn't vanish mid-session.
  if ((data.passageRef || '') !== DA_STATE.passageRef) {
    DA_STATE.parallelVerses = {};
    DA_STATE.parallelLabel = '';
  }

  DA_STATE.propositions = data.propositions || [];
  DA_STATE.verseRefs = data.verseRefs || [];
  DA_STATE.verseBreaks = data.verseBreaks || []; // renderer pads to length
  DA_STATE.brackets = data.brackets || [];
  DA_STATE.formatTags = data.formatTags || [];
  DA_STATE.wordArrows = data.wordArrows || [];
  DA_STATE.comments = data.comments || [];
  DA_STATE.passageRef = data.passageRef || '';
  DA_STATE.customLabels = data.customLabels || [];
  DA_STATE.indentation = data.indentation || [];
  DA_STATE.bracketHighlights = (data.bracketHighlights && typeof data.bracketHighlights === 'object') ? data.bracketHighlights : {};

  if (window.DA_MODES) DA_MODES.applyScriptDirection(data);

  if (data.author) {
    const pageAuthorInput = document.getElementById('pageAuthor');
    if (pageAuthorInput) {
      pageAuthorInput.value = data.author;
      localStorage.setItem(DA_CONSTANTS.PAGE_AUTHOR_KEY, data.author);
      if (typeof DA_UI.updateFontByAuthor === 'function') DA_UI.updateFontByAuthor();
      if (typeof DA_UI.syncPassageAuthorDisplay === 'function') DA_UI.syncPassageAuthorDisplay();
    }
  }

  renderCallbacks.renderAll();

  DA_STATE.isUpdatingFromCloud = false;

  // We just adopted the cloud's copy verbatim, so local matches the cloud again.
  markSynced();
}

async function syncToCloud() {
  // Only a LIVE session may push. 'remembered' is deliberately refused: the
  // stored id lingers after stopCloudSync (for resume) and is adopted from
  // imported files, so pushing then could clobber a project that is no longer
  // on screen. Returns false so the caller can avoid a false "synced!" toast.
  if (!db || !sessionState().startsWith('live') || DA_STATE.isUpdatingFromCloud) {
    return false;
  }

  const pageAuthorInput = document.getElementById('pageAuthor');
  const currentAuthor = (pageAuthorInput?.value || '').trim() || 'Anonymous';

  const bracketData = DA_EXPORT.buildBracketData();
  const projectData = {
    ...bracketData,
    author: currentAuthor,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  };

  // Let real Firestore failures (e.g. the doc was deleted, so update() rejects)
  // propagate to the caller so the UI can report them instead of claiming success.
  await db.collection('projects').doc(getProjectId()).update(projectData);
  markSynced();
  return true;
}

/**
 * Reflect sync state in the header badge: a status dot (green = synced, amber =
 * unsynced) and the Sync button (disabled "Synced ✓" when clean, active "Sync"
 * when there are unpushed changes). No-ops when no live session is active.
 */
function updateSyncUI() {
  const badge = document.getElementById('cloudHeaderStatus');
  if (!badge) return;
  const btn = document.getElementById('manualSyncBtn');

  const state = sessionState();
  if (state === 'inactive' || state === 'remembered') {
    badge.classList.remove('synced', 'unsynced');
    return;
  }

  const dirty = state === 'live-dirty';
  badge.classList.toggle('unsynced', dirty);
  badge.classList.toggle('synced', !dirty);

  if (btn) {
    btn.disabled = !dirty;
    btn.textContent = dirty ? 'Sync' : 'Synced ✓';
    btn.title = dirty ? 'Sync your changes to the cloud' : 'All changes are synced';
  }
}

window.DA_CLOUD = {
    registerCloudRenderCallbacks, startCloudSync, joinCloudSync, initCloudSync, handleCloudData, syncToCloud, stopCloudSync, updateSyncUI,
    sessionState, isLive, getProjectId,
    markDirty, markSynced, resetSessionForNewContent, adoptRememberedProject
};
