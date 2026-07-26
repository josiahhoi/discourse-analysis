/**
 * Discourse Analysis UI Utilities
 */

function showStatus(message, type = 'info') {
    const existing = document.querySelector('.status');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = `status ${type}`;
    // Announce to screen readers — the toast narrates multi-step flows
    // ("Select second node to create bracket") and mode toggles.
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = message;
    document.body.appendChild(el);
  
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 3000);
}

function updateCloudUI(isActive, projectId = '') {
    const badge = document.getElementById('cloudHeaderStatus');
    const idSpan = document.getElementById('headerProjectId');
    
    if (isActive) {
      if (badge) badge.style.display = 'flex';
      if (idSpan) idSpan.textContent = projectId;
      if (window.DA_CLOUD && DA_CLOUD.updateSyncUI) DA_CLOUD.updateSyncUI();
    } else {
      if (badge) badge.style.display = 'none';
    }
}


function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderCommentText(text) {
    let s = escapeHtml(text);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    s = s.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    s = s.replace(/\n/g, '<br>');
    return s;
}

function applyFormatting(textarea, syntax) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const selected = val.substring(start, end);
    const replacement = syntax + selected + syntax;
    textarea.value = val.substring(0, start) + replacement + val.substring(end);
    textarea.selectionStart = selected ? start : start + syntax.length;
    textarea.selectionEnd = selected ? start + replacement.length : start + syntax.length;
    textarea.focus();
}

function setupClickOutside(el, onDismiss) {
  let _mouseDownWasInside = false;

  const onMouseDown = (e) => {
    _mouseDownWasInside = el.contains(e.target);
  };

  const dismiss = (e) => {
    if (!el.parentNode) {
      document.removeEventListener('click', dismiss);
      document.removeEventListener('mousedown', onMouseDown);
      return;
    }
    // Ignore clicks that result from a drag starting inside (e.g. text selection)
    if (_mouseDownWasInside) return;
    if (!el.contains(e.target)) {
      onDismiss();
      document.removeEventListener('click', dismiss);
      document.removeEventListener('mousedown', onMouseDown);
    }
  };

  document.addEventListener('mousedown', onMouseDown);
  // Timeout ensures the trigger click doesn't immediately close it
  setTimeout(() => document.addEventListener('click', dismiss), 10);
  return dismiss;
}

function clearPropositionHighlights() {
  document.querySelectorAll('.proposition-block').forEach(block => {
    block.classList.remove('highlight', 'searching');
  });
}

/**
 * If the current DOM selection is a non-collapsed range inside a proposition,
 * return it as { propIndex, start, end } character offsets — the shape comment
 * targets use. Shared by the right-click text menu and the "C" shortcut.
 */
function getPropositionSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  let startNode = range.startContainer;
  if (startNode.nodeType === Node.TEXT_NODE) startNode = startNode.parentElement;

  // A selection can live in either column: the primary text or the parallel
  // cell. `pcol` tells callers which one (colors apply to either; comments
  // stay primary-only).
  const textSpan = startNode.closest?.('.proposition-text') || startNode.closest?.('.parallel-text');
  if (!textSpan) return null;
  const pcol = textSpan.classList.contains('parallel-text');

  const block = textSpan.closest('.proposition-block');
  const propIndex = parseInt(block.dataset.index, 10);

  const preStart = document.createRange();
  preStart.setStart(textSpan, 0);
  preStart.setEnd(range.startContainer, range.startOffset);
  const start = preStart.toString().length;

  const preEnd = document.createRange();
  preEnd.setStart(textSpan, 0);
  preEnd.setEnd(range.endContainer, range.endOffset);
  const fullText = textSpan.textContent || '';
  const end = Math.min(preEnd.toString().length, fullText.length);

  if (start >= end) return null;
  return { propIndex, start, end, pcol };
}

function getCommentForBracket(bracketIdx) {
  const b = DA_STATE.brackets[bracketIdx];
  if (!b) return undefined;
  return DA_STATE.comments.find(c => c.type === 'bracket' && c.target?.bracketId === b.id);
}

/**
 * Append a reply (authored by the current reviewer) to a comment and re-render.
 * Shared by the comment popover and the sidebar's reply inputs.
 * Returns true if the reply was added.
 */
function addReplyToComment(comment, text) {
  const trimmed = (text || '').trim();
  if (!comment || !trimmed) return false;
  DA_STATE.pushUndo('add reply');
  comment.replies = comment.replies || [];
  comment.replies.push({
    author: localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || 'Anonymous',
    text: trimmed,
    timestamp: Date.now()
  });
  if (window.renderAll) window.renderAll();
  return true;
}


/**
 * Focus management for popovers/dialogs (accessibility):
 *  - moves focus into the dialog on open (prefers a text field, else the first
 *    focusable control, else the dialog itself),
 *  - keeps Tab / Shift+Tab cycling inside the dialog instead of escaping to the
 *    page behind it,
 *  - restores focus to the element that opened the dialog when it closes —
 *    but only when focus would otherwise be dropped on <body> (a click-outside
 *    dismissal that landed on another control keeps that control's focus).
 *
 * Removal-based dialogs (popovers built with .remove()) are released
 * automatically via a MutationObserver on the parent. Display-toggled modals
 * must call the returned release() from their close path.
 */
function manageDialogFocus(dialog, opts = {}) {
  let opener = document.activeElement;
  if (!(opener instanceof HTMLElement) || opener === document.body) opener = null;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), '
    + 'select:not([disabled]), textarea:not([disabled]), '
    + '[tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
  const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const focusables = () => Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(isVisible);

  // The dialog itself is a programmatic focus target when it has no controls.
  if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
  const initial = opts.initialFocus
    || focusables().find((el) => el.matches('textarea, input, select'))
    || focusables()[0]
    || dialog;
  initial.focus();

  const onKeydown = (e) => {
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (list.length === 0) { e.preventDefault(); dialog.focus(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  };
  dialog.addEventListener('keydown', onKeydown);

  let observer = null;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    dialog.removeEventListener('keydown', onKeydown);
    if (observer) observer.disconnect();
    const active = document.activeElement;
    const focusWasLost = !active || active === document.body || dialog.contains(active);
    if (opener && opener.isConnected && focusWasLost) opener.focus();
  };

  if (dialog.parentNode) {
    observer = new MutationObserver(() => { if (!dialog.isConnected) release(); });
    observer.observe(dialog.parentNode, { childList: true });
  }
  return release;
}

function clampToViewport(el) {
  const r = el.getBoundingClientRect();
  const maxLeft = window.innerWidth - r.width - 5;
  const maxTop = window.innerHeight - r.height - 5;
  if (r.right > window.innerWidth - 5) el.style.left = `${Math.max(5, maxLeft)}px`;
  if (r.bottom > window.innerHeight - 5) el.style.top = `${Math.max(5, maxTop)}px`;
  if (r.left < 5) el.style.left = '5px';
  if (r.top < 5) el.style.top = '5px';
}

function makeFixedDraggable(popover, handleSelector) {
  const handle = handleSelector ? popover.querySelector(handleSelector) : popover;
  if (!handle) return;
  handle.style.cursor = 'grab';
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const r = popover.getBoundingClientRect();
    const startLeft = r.left;
    const startTop = r.top;
    popover.style.transform = 'none';
    popover.style.left = startLeft + 'px';
    popover.style.top = startTop + 'px';
    handle.style.cursor = 'grabbing';
    const onMove = (e2) => {
      const pr = popover.getBoundingClientRect();
      const left = Math.max(5, Math.min(startLeft + e2.clientX - startX, window.innerWidth - pr.width - 5));
      const top = Math.max(5, Math.min(startTop + e2.clientY - startY, window.innerHeight - pr.height - 5));
      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
    };
    const onUp = () => {
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function makePopupDraggable(popover, handleSelector) {
  const wrapper = popover.parentElement;
  if (!wrapper) return;
  const handle = handleSelector ? popover.querySelector(handleSelector) : popover;
  if (!handle) return;

  handle.style.cursor = 'grab';
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'BUTTON') return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    
    // Get current visual position relative to parent to handle % or transform positions
    const wrapperRect = wrapper.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const startLeft = popRect.left - wrapperRect.left;
    const startTop = popRect.top - wrapperRect.top;

    // Reset styles to pixel-based absolute position to prevent jumping
    popover.style.transform = 'none';
    popover.style.left = startLeft + 'px';
    popover.style.top = startTop + 'px';

    handle.style.cursor = 'grabbing';

    const onMove = (e2) => {
      const dx = e2.clientX - startX;
      const dy = e2.clientY - startY;
      const rect = wrapper.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();

      let left = startLeft + dx;
      let top = startTop + dy;

      // Clamp to the wrapper, but never past the popup's own starting point:
      // an anchored popup can legitimately open slightly outside the wrapper
      // (e.g. just below its last line) — it can be dragged back in, but must
      // not snap on the first pixel of movement.
      left = Math.max(Math.min(0, startLeft), Math.min(left, Math.max(rect.width - popRect.width, startLeft)));
      top = Math.max(Math.min(0, startTop), Math.min(top, Math.max(rect.height - popRect.height, startTop)));

      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
    };

    const onUp = () => {
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function makeCommentPopoverDraggableAndResizable(popover) {
  const wrapper = popover.parentElement;
  if (!wrapper) return;

  makePopupDraggable(popover, '.comment-popover-title');

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'comment-popover-resize-handle';
  resizeHandle.setAttribute('aria-label', 'Resize');
  popover.appendChild(resizeHandle);
  const minW = 260;
  const maxW = Math.min(1200, Math.max(360, wrapper.getBoundingClientRect().width * 0.9));
  const minH = 200;
  const maxH = Math.min(window.innerHeight * 0.85, wrapper.getBoundingClientRect().height);
  resizeHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = popover.offsetWidth;
    const startH = popover.offsetHeight;
    const onMove = (e2) => {
      const dw = e2.clientX - startX;
      const dh = e2.clientY - startY;
      let w = Math.max(minW, Math.min(maxW, startW + dw));
      let h = Math.max(minH, Math.min(maxH, startH + dh));
      popover.style.width = w + 'px';
      popover.style.height = h + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}





window.DA_UI = Object.assign(window.DA_UI || {}, {
  showStatus, updateCloudUI, escapeHtml, renderCommentText, applyFormatting, clampToViewport, makePopupDraggable, makeFixedDraggable, setupClickOutside, clearPropositionHighlights, getCommentForBracket, getPropositionSelection, addReplyToComment, makeCommentPopoverDraggableAndResizable, manageDialogFocus
});
