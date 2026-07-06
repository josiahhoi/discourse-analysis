/**
 * ui-dialogs — modal dialogs & app chrome (save/restore, magic-paste, theme, settings, welcome, reference guide, new-passage/new-bracket flow).
 *
 * Split out of ui.js. Classic (non-module) script: top-level functions stay
 * global like the rest of the app; the public ones are added to window.DA_UI
 * via Object.assign. Loaded after ui.js in index.html.
 */

function saveState() {
  const propositionsContainer = document.getElementById('propositions');
  const state = {
    scroll: { x: window.scrollX, y: window.scrollY, scrollables: [] },
    focus: null
  };
  
  // Save scroll
  let el = propositionsContainer;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight) {
      state.scroll.scrollables.push({ el, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop });
    }
    el = el.parentElement;
  }

  // Save focus
  const sel = window.getSelection();
  if (sel?.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const textSpan = range.startContainer.parentElement?.closest('.proposition-text');
    if (textSpan) {
      const block = textSpan.closest('.proposition-block');
      const propIndex = parseInt(block.dataset.index, 10);
      const preRange = document.createRange();
      preRange.setStart(textSpan, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      const offset = preRange.toString().length;
      state.focus = { propIndex, offset };
    }
  }
  
  return state;
}

function restoreState(state) {
  if (!state) return;

  // Restore scroll
  window.scrollTo(state.scroll.x, state.scroll.y);
  (state.scroll.scrollables || []).forEach(({ el, scrollLeft, scrollTop }) => {
    if (el && el.scrollTo) { el.scrollLeft = scrollLeft; el.scrollTop = scrollTop; }
  });

  // Restore focus
  if (state.focus) {
    const block = document.querySelector(`.proposition-block[data-index="${state.focus.propIndex}"]`);
    if (block) {
      const textSpan = block.querySelector('.proposition-text');
      if (textSpan) {
        textSpan.focus();
        DA_EDITOR.setSelectionByGlobalOffset(textSpan, state.focus.offset);
      }
    }
  }
}

function showMagicPasteBanner(data, messagePrefix) {
  if (DA_STATE.passageRef && data.passageRef === DA_STATE.passageRef) return;
  document.querySelector('.magic-paste-banner')?.remove();

  const wrapper = document.querySelector('.bracket-canvas-wrapper') || document.body;
  const banner = document.createElement('div');
  banner.className = 'magic-paste-banner';
  const label = data.passageRef || 'bracket data';
  banner.innerHTML = `
    <span class="draft-recovery-text">${messagePrefix} <strong>${escapeHtml(label)}</strong></span>
    <div class="draft-recovery-actions">
      <button type="button" data-action="import">Import</button>
      <button type="button" data-action="dismiss" class="secondary">Dismiss</button>
    </div>
  `;
  wrapper.prepend(banner);

  banner.querySelector('[data-action="import"]').addEventListener('click', () => {
    banner.remove();
    DA_PERSISTENCE.importBracket(data);
  });
  banner.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
    banner.remove();
  });
}

function initTheme() {
    const saved = localStorage.getItem(DA_CONSTANTS.THEME_KEY);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    updateThemeButtonText();
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(DA_CONSTANTS.THEME_KEY, next);
    updateThemeButtonText();
}

function updateThemeButtonText() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.textContent = current === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.style.display = 'flex';
        if (window.DA_NOTATION) DA_NOTATION.renderEditor();
        modal._releaseFocus = manageDialogFocus(modal);
    }
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.style.display = 'none';
        if (modal._releaseFocus) { modal._releaseFocus(); modal._releaseFocus = null; }
    }
}

/**
 * First-run identity prompt. Shows a one-time welcome modal asking for the
 * user's name when no identity is saved yet (neither the reviewer name nor the
 * legacy comment-author key). The name becomes "Reviewing As" and seeds
 * "Project Owner" for the current blank passage. Skippable — once dismissed or
 * saved, a saved name (or empty-but-touched key) keeps it from showing again.
 */
function maybeShowWelcome() {
    const savedName = (localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY)
        || localStorage.getItem(DA_CONSTANTS.COMMENT_AUTHOR_KEY) || '').trim();
    if (savedName) return; // Already have an identity — nothing to prompt.
    if (localStorage.getItem(DA_CONSTANTS.WELCOME_SEEN_KEY) === 'true') return; // Skipped before.

    const modal = document.getElementById('welcomeModal');
    const input = document.getElementById('welcomeName');
    const saveBtn = document.getElementById('welcomeSaveBtn');
    const skipBtn = document.getElementById('welcomeSkipBtn');
    if (!modal || !input || !saveBtn || !skipBtn) return;

    // Mark seen on dismissal (save or skip) so the prompt never nags again.
    const close = () => {
        try { localStorage.setItem(DA_CONSTANTS.WELCOME_SEEN_KEY, 'true'); } catch (_) { }
        modal.style.display = 'none';
        if (modal._releaseFocus) { modal._releaseFocus(); modal._releaseFocus = null; }
    };

    const save = () => {
        const name = input.value.trim();
        if (!name) { close(); return; } // Empty save behaves like skip.

        try {
            localStorage.setItem(DA_CONSTANTS.REVIEWER_NAME_KEY, name);
            localStorage.setItem(DA_CONSTANTS.COMMENT_AUTHOR_KEY, name);
        } catch (_) { }

        const reviewerInput = document.getElementById('reviewerName');
        if (reviewerInput) reviewerInput.value = name;

        // Seed Project Owner for the current (blank) passage if it has none yet.
        const pageAuthorInput = document.getElementById('pageAuthor');
        const ownerEmpty = !((pageAuthorInput?.value || '').trim()
            || (localStorage.getItem(DA_CONSTANTS.PAGE_AUTHOR_KEY) || '').trim());
        if (ownerEmpty) {
            if (pageAuthorInput) pageAuthorInput.value = name;
            try { localStorage.setItem(DA_CONSTANTS.PAGE_AUTHOR_KEY, name); } catch (_) { }
            syncPassageAuthorDisplay();
            updateFontByAuthor();
        }

        if (window.DA_PROFILES) DA_PROFILES.maybeApplyGurtnerProfile(name);
        close();
        showStatus(`Welcome, ${name}!`, 'success');
    };

    saveBtn.addEventListener('click', save);
    skipBtn.addEventListener('click', close);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    modal.style.display = 'flex';
    modal._releaseFocus = manageDialogFocus(modal, { initialFocus: input });
}

function openReferenceGuide() {
    const modal = document.getElementById('referenceModal');
    if (modal) {
        populateReferenceGuide();
        modal.style.display = 'flex';
        modal._releaseFocus = manageDialogFocus(modal);
    }
}

function closeReferenceGuide() {
    const modal = document.getElementById('referenceModal');
    if (modal) {
        modal.style.display = 'none';
        if (modal._releaseFocus) { modal._releaseFocus(); modal._releaseFocus = null; }
    }
}

function populateReferenceGuide() {
    const tbody = document.getElementById('referenceTableBody');
    if (!tbody || tbody.children.length > 0) return; // Already populated

    const hierarchy = DA_CONSTANTS.RELATIONSHIP_GROUPS_HIERARCHY;
    const defs = DA_CONSTANTS.RELATIONSHIP_DEFINITIONS;
    const labels = DA_CONSTANTS.RELATIONSHIP_LABELS;
    const abbrs = DA_CONSTANTS.BRACKET_LABELS;
    
    const addRow = (typeKey) => {
        const defData = defs[typeKey];
        if (!defData) return;

        const name = labels[typeKey] ? labels[typeKey].split(' (')[0] : typeKey;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${name}</strong></td>
            <td>${abbrs[typeKey] || ''}</td>
            <td class="keyword-cell">${defData.keywords || ''}</td>
            <td>${defData.definition}</td>
        `;
        tbody.appendChild(tr);
    };

    const addHeader = (text, isSubgroup = false) => {
        const tr = document.createElement('tr');
        tr.className = isSubgroup ? 'subgroup-header' : 'group-header';
        tr.innerHTML = `<td colspan="4">${text}</td>`;
        tbody.appendChild(tr);
    };

    hierarchy.forEach(group => {
        addHeader(group.name);
        if (group.types) {
            group.types.forEach(type => addRow(type));
        }
        if (group.subgroups) {
            group.subgroups.forEach(sub => {
                addHeader(sub.name, true);
                sub.types.forEach(type => addRow(type));
            });
        }
    });
}

function updateFontByAuthor() {
    const authorRaw = (document.getElementById('pageAuthor')?.value || '').trim();
    const authorLower = authorRaw.toLowerCase();
    const container = document.getElementById('propositions');
    if (!container) return;

    if (authorLower === 'brian kim') {
        container.style.fontFamily = "'Roboto Mono', monospace";
        container.style.fontSize = "14px";
    } else {
        container.style.fontFamily = "";
        container.style.fontSize = "";
    }
}

function syncPassageAuthorDisplay() {
    const input = document.getElementById('pageAuthor');
    const display = document.getElementById('passageAuthor');
    if (display && input) {
        display.textContent = input.value.trim() ? `By: ${input.value.trim()}` : '';
    }
}

function handleNewBracket() {
  const hasContent = DA_STATE.propositions.length > 0 && DA_STATE.propositions.some((p) => p && p.trim() && p !== '(empty)');
  
  if (!hasContent) {
    startNewBracket();
    return;
  }
  
  const wrapper = document.querySelector('.bracket-canvas-wrapper') || document.body;
  const dialog = document.createElement('div');
  dialog.className = 'label-picker new-bracket-dialog';
  dialog.innerHTML = `
    <p class="picker-title">Save current bracket before starting new?</p>
    <div class="new-bracket-buttons">
      <button type="button" data-action="save">Save</button>
      <button type="button" data-action="discard" class="secondary">Discard</button>
      <button type="button" data-action="cancel" class="secondary">Cancel</button>
    </div>
  `;
  
  const w = wrapper.offsetWidth || 400;
  const h = wrapper.offsetHeight || 300;
  dialog.style.left = `${Math.max(8, w / 2 - 120)}px`;
  dialog.style.top = `${Math.max(8, h / 2 - 55)}px`;
  wrapper.appendChild(dialog);

  makePopupDraggable(dialog, '.picker-title');

  setupClickOutside(dialog, () => dialog.remove());

  dialog.querySelector('[data-action="save"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    dialog.remove();
    if (window.saveBracket) {
      await window.saveBracket();
      startNewBracket();
    }
  });

  dialog.querySelector('[data-action="discard"]').addEventListener('click', (e) => {
    e.stopPropagation();
    dialog.remove();
    startNewBracket();
  });

  dialog.querySelector('[data-action="cancel"]').addEventListener('click', (e) => {
    e.stopPropagation();
    dialog.remove();
  });
}

function startNewBracket() {
  // A new bracket replaces the document: exit any live session AND forget the
  // remembered project id, in one service call (see cloud-sync.js). Carrying
  // the id forward would let a later "Turn Cloud Sync ON" offer to resume —
  // and overwrite — the OLD project with the new content.
  if (window.DA_CLOUD) DA_CLOUD.resetSessionForNewContent();

  DA_STATE.updateState({
    passageRef: '—',
    propositions: [],
    verseRefs: [],
    verseBreaks: [],
    brackets: [],
    formatTags: [],
    wordArrows: [],
    comments: [],
    indentation: [],
    undoStack: [],
    redoStack: [],
    bracketSelectStep: 0,

    firstBracketPoint: null,
    connectBracketToBracketIdx: null,
    arrowMode: false,
    selectedArrowIdx: null,
    pendingArrowStart: null
  });

  const passageRefEl = document.getElementById('passageRef');
  if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
  
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel) copyrightLabel.textContent = '(ESV)';
  
  const propositionsContainer = document.getElementById('propositions');
  if (propositionsContainer) propositionsContainer.classList.remove('greek-text', 'hebrew-text');
  
  if (window.renderAll) window.renderAll();
  
  document.getElementById('bracketActions')?.remove();
  document.getElementById('labelPicker')?.remove();
  document.getElementById('commentPopover')?.remove();
  
  DA_PERSISTENCE.clearDraft();
  
  const pageAuthorInput = document.getElementById('pageAuthor');
  if (pageAuthorInput) {
    const reviewerName = localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || '';
    if (reviewerName) {
      pageAuthorInput.value = reviewerName;
      try { localStorage.setItem(DA_CONSTANTS.PAGE_AUTHOR_KEY, reviewerName); } catch (_) { }
      syncPassageAuthorDisplay();
      updateFontByAuthor();
    }
  }
  showStatus('New bracket started.', 'success');
}

function parsePastedText(raw, defaultStartVerse = '1') {
  // Strip zero-width characters (legacy verse markers, BOM, joiners) — verse
  // boundaries are structured data now, never in-band characters.
  raw = String(raw).replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
  const verseParts = raw.split(/(?=\[\d+(?::\d+)?\])/);
  const props = [];
  const refs = [];
  let hasMarkers = false;
  for (const part of verseParts) {
    const m = part.match(/^\[(\d+)(?::(\d+))?\]\s*(.*)$/s);
    if (m) {
      hasMarkers = true;
      const num = m[2] ? `${m[1]}:${m[2]}` : m[1];
      const content = m[3].trim();
      if (content) {
        props.push(content);
        refs.push(num);
      }
    } else if (part.trim()) {
      props.push(part.trim());
      refs.push(hasMarkers || refs.length > 0 ? String(props.length) : defaultStartVerse);
    }
  }
  return { propositions: props, verseRefs: refs };
}

function formatBracketType(type) {
  return DA_CONSTANTS.RELATIONSHIP_LABELS[type] || type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
}

window.DA_UI = Object.assign(window.DA_UI || {}, {
  saveState, restoreState, showMagicPasteBanner, initTheme, toggleTheme, updateThemeButtonText, openSettings, closeSettings, openReferenceGuide, closeReferenceGuide, maybeShowWelcome, updateFontByAuthor, syncPassageAuthorDisplay, handleNewBracket, startNewBracket, parsePastedText, formatBracketType
});
