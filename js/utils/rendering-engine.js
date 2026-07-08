/**
 * rendering-engine — the render orchestrator: renderAll (full pass) and
 * scheduleVisualUpdate (rAF-coalesced bracket/arrow repaint).
 *
 * The actual rendering lives in sibling classic scripts that merge themselves
 * onto window.DA_RENDERER (loaded after this file in index.html):
 *   render-model.js        — pure extent/collapse/verse math
 *   render-propositions.js — proposition block DOM + inline content + listeners
 *   render-brackets.js     — SVG bracket diagram + slot/gutter geometry
 *   render-labels.js       — bracket label / dominance string engine
 *   render-arrows.js       — word-arrow overlay layer
 *   render-comments.js     — comment preview sidebar cards
 */

let _rafId = null;

/**
 * Schedules a batched visual update for SVG elements (brackets + arrows).
 * Multiple calls within the same frame are coalesced into one repaint.
 */
function scheduleVisualUpdate() {
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = null;
    computeSlotAssignments();
    renderBrackets();
    renderWordArrows();
  });
}

/**
 * Main render function
 */
function renderAll() {
  computeSlotAssignments(); // Calculate bracket slots first so we know the required padding
  renderPropositions();
  renderWordArrows();
  renderBrackets();
  renderCommentPreviews();
}

function updateBracketPositions() {
  scheduleVisualUpdate();
}

// The split-out renderers above add the rest of the namespace via Object.assign.
window.DA_RENDERER = Object.assign(window.DA_RENDERER || {}, {
    renderAll, scheduleVisualUpdate, updateBracketPositions
});
