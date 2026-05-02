
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
  const projectData = {
    propositions: DA_STATE.propositions,
    verseRefs: DA_STATE.verseRefs,
    brackets: DA_STATE.brackets,
    formatTags: DA_STATE.formatTags,
    wordArrows: DA_STATE.wordArrows,
    comments: DA_STATE.comments,
    passageRef: DA_STATE.passageRef,
    customLabels: DA_STATE.customLabels || [],
    author: (document.getElementById('pageAuthor')?.value || '').trim() || localStorage.getItem(DA_CONSTANTS.PAGE_AUTHOR_KEY) || 'Anonymous',
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('projects').doc(projectId).set(projectData);
    DA_STATE.activeProjectId = projectId;
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
  
  DA_STATE.propositions = data.propositions || [];
  DA_STATE.verseRefs = data.verseRefs || [];
  DA_STATE.brackets = data.brackets || [];
  DA_STATE.formatTags = data.formatTags || [];
  DA_STATE.wordArrows = data.wordArrows || [];
  DA_STATE.comments = data.comments || [];
  DA_STATE.passageRef = data.passageRef || '';
  DA_STATE.customLabels = data.customLabels || [];

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
}

async function syncToCloud() {
  if (!DA_STATE.activeProjectId || DA_STATE.isUpdatingFromCloud || !db) return;
  
  const pageAuthorInput = document.getElementById('pageAuthor');
  const currentAuthor = (pageAuthorInput?.value || '').trim() || 'Anonymous';

  const projectData = {
    propositions: DA_STATE.propositions,
    verseRefs: DA_STATE.verseRefs,
    brackets: DA_STATE.brackets,
    formatTags: DA_STATE.formatTags,
    wordArrows: DA_STATE.wordArrows,
    comments: DA_STATE.comments,
    passageRef: DA_STATE.passageRef,
    customLabels: DA_STATE.customLabels || [],
    author: currentAuthor,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('projects').doc(DA_STATE.activeProjectId).update(projectData);
  } catch (err) {
    console.error('Sync error:', err);
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
    registerCloudRenderCallbacks, startCloudSync, joinCloudSync, initCloudSync, handleCloudData, syncToCloud, stopCloudSync
};
