
let renderCallbacks = {
  renderAll: () => {}
};

function registerCloudRenderCallbacks(callbacks) {
  Object.assign(renderCallbacks, callbacks);
}

async function startCloudSync() {
  if (!db) return DA_UI.showStatus('Firebase not initialized.', 'error');
  
  let projectId = DA_STATE.activeProjectId;
  
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
    DA_STATE.activeProjectId = projectId;
    DA_STATE.cloudDirty = false; // we just wrote the current state
    initCloudSync(projectId);
    DA_UI.updateCloudUI(true, projectId);
    
    const url = new URL(window.location);
    url.searchParams.set('project', projectId);
    window.history.pushState({}, '', url);
    
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
    
    DA_STATE.activeProjectId = projectId;
    DA_STATE.cloudDirty = false; // an incoming snapshot will define our baseline
    DA_UI.updateCloudUI(true, projectId);
    initCloudSync(projectId);
    
    const url = new URL(window.location);
    url.searchParams.set('project', projectId);
    window.history.pushState({}, '', url);
    
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
  
  DA_STATE.propositions = data.propositions || [];
  DA_STATE.verseRefs = data.verseRefs || [];
  DA_STATE.brackets = data.brackets || [];
  DA_STATE.formatTags = data.formatTags || [];
  DA_STATE.wordArrows = data.wordArrows || [];
  DA_STATE.comments = data.comments || [];
  DA_STATE.passageRef = data.passageRef || '';
  DA_STATE.customLabels = data.customLabels || [];
  DA_STATE.indentation = data.indentation || [];
  DA_STATE.bracketHighlights = (data.bracketHighlights && typeof data.bracketHighlights === 'object') ? data.bracketHighlights : {};

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
  DA_STATE.cloudDirty = false;
  updateSyncUI();
}

async function syncToCloud() {
  // Only sync when a LIVE session is active (a listener is attached). Gating on
  // cloudUnsubscribe — not just a stored activeProjectId — prevents silently
  // overwriting the wrong project: activeProjectId lingers after stopCloudSync
  // (for resume) and is also adopted from imported files, so without this guard a
  // manual sync after fetching a new passage or opening someone's file would
  // clobber a project that's no longer on screen. Returns false (no session) so
  // the caller can avoid showing a false "synced!" confirmation.
  if (!db || !DA_STATE.activeProjectId || !DA_STATE.cloudUnsubscribe || DA_STATE.isUpdatingFromCloud) {
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
  await db.collection('projects').doc(DA_STATE.activeProjectId).update(projectData);
  DA_STATE.cloudDirty = false;
  updateSyncUI();
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

  if (!DA_STATE.cloudUnsubscribe) {
    badge.classList.remove('synced', 'unsynced');
    return;
  }

  const dirty = !!DA_STATE.cloudDirty;
  badge.classList.toggle('unsynced', dirty);
  badge.classList.toggle('synced', !dirty);

  if (btn) {
    btn.disabled = !dirty;
    btn.textContent = dirty ? 'Sync' : 'Synced ✓';
    btn.title = dirty ? 'Sync your changes to the cloud' : 'All changes are synced';
  }
}

function stopCloudSync() {
  if (DA_STATE.cloudUnsubscribe) DA_STATE.cloudUnsubscribe();
  DA_STATE.cloudUnsubscribe = null;
  // We keep DA_STATE.activeProjectId so it can be resumed later
  DA_UI.updateCloudUI(false);
  
  const url = new URL(window.location);
  url.searchParams.delete('project');
  window.history.pushState({}, '', url);
  
  DA_UI.showStatus('Cloud Sync stopped.', 'info');
}

window.DA_CLOUD = {
    registerCloudRenderCallbacks, startCloudSync, joinCloudSync, initCloudSync, handleCloudData, syncToCloud, stopCloudSync, updateSyncUI
};
