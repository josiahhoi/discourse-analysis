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
        if (DA_STATE.commentMode) toggleCommentMode(false);
        DA_UI.showStatus('Arrow mode on. Click a word to start.', 'success');
    } else {
        if (forceState === undefined) DA_UI.showStatus('Arrow mode off.', 'success');
    }
}

window.DA_MODES = {
    toggleTextEditMode, toggleArrowMode
};
