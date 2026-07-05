/**
 * Discourse Analysis Mode Service
 * Handles switching between Edit, Comment, and Arrow modes
 */

function toggleTextEditMode() {
    DA_STATE.textEditMode = !DA_STATE.textEditMode;
    const btn = document.getElementById('textEditModeBtn');
    btn?.classList.toggle('active', DA_STATE.textEditMode);
    document.body.classList.toggle('text-edit-mode-active', DA_STATE.textEditMode);

    if (btn) {
        btn.title = DA_STATE.textEditMode
            ? 'Text edit mode on: edit text directly, use Tab for indent, Enter for newlines.'
            : 'Toggle text edit mode: edit text freely with newlines and indentation.';
    }

    if (DA_STATE.textEditMode) {
        // Turn off other modes
        if (DA_STATE.arrowMode) toggleArrowMode(false);

        document.getElementById('bracketCanvas')?.classList.remove('connect-mode');
        DA_STATE.bracketSelectStep = 0;
        DA_STATE.firstBracketPoint = null;
        DA_UI.clearPropositionHighlights();
        DA_UI.showStatus('Text Edit mode on. Brackets disabled.', 'success');
    } else {
        DA_UI.showStatus('Text Edit mode off.', 'success');
    }
}

function toggleArrowMode(forceState) {
    const isExplicit = typeof forceState === 'boolean';
    DA_STATE.arrowMode = isExplicit ? forceState : !DA_STATE.arrowMode;
    const btn = document.getElementById('arrowModeBtn');
    btn?.classList.toggle('active', DA_STATE.arrowMode);

    if (DA_STATE.arrowMode) {
        if (DA_STATE.textEditMode) toggleTextEditMode();
        DA_UI.showStatus('Arrow mode on. Click a word to start.', 'success');
    } else {
        if (forceState === undefined) DA_UI.showStatus('Arrow mode off.', 'success');
    }
}

/**
 * Set right-to-left / Hebrew mode. Called automatically by fetchPassage() —
 * true when Hebrew (WLC) is loaded, false for all other languages.
 * Word arrows are not supported in RTL, so enabling it exits arrow mode and
 * hides its button.
 *
 * @param {boolean} isRTL
 */
function setRTL(isRTL) {
    DA_STATE.isRTL = !!isRTL;
    document.body.classList.toggle('rtl-mode', DA_STATE.isRTL);

    const arrowBtn = document.getElementById('arrowModeBtn');
    if (DA_STATE.isRTL) {
        if (DA_STATE.arrowMode) toggleArrowMode(false);
        if (arrowBtn) arrowBtn.style.display = 'none';
    } else if (arrowBtn) {
        arrowBtn.style.display = '';
    }

    if (window.renderAll) window.renderAll();
}

/**
 * Restore script classes and RTL state from a saved/cloud data object.
 * Falls back to copyright-string sniffing for files predating the explicit flags.
 * Used by both importBracket (persistence.js) and handleCloudData (cloud-sync.js).
 */
function applyScriptDirection(data) {
  const propsEl = document.getElementById('propositions');
  const copyright = data.copyrightLabel || '';
  const isGreek = data.isGreek ?? (copyright.includes('SBL') || copyright.includes('LXX'));
  const isHebrew = data.isHebrew ?? copyright.includes('WLC');
  if (propsEl) {
    propsEl.classList.toggle('greek-text', !!isGreek);
    propsEl.classList.toggle('hebrew-text', !!isHebrew);
  }
  setRTL(data.isRTL ?? isHebrew);
}

window.DA_MODES = {
    toggleTextEditMode, toggleArrowMode, setRTL, applyScriptDirection
};
