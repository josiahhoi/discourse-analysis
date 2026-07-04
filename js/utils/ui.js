/**
 * Discourse Analysis UI Utilities
 */

function showStatus(message, type = 'info') {
    const existing = document.querySelector('.status');
    if (existing) existing.remove();
  
    const el = document.createElement('div');
    el.className = `status ${type}`;
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

function getCommentForBracket(bracketIdx) {
  return DA_STATE.comments.find(c => c.type === 'bracket' && c.target?.bracketIdx === bracketIdx);
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

      left = Math.max(0, Math.min(left, rect.width - popRect.width));
      top = Math.max(0, Math.min(top, rect.height - popRect.height));

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
  showStatus, updateCloudUI, escapeHtml, renderCommentText, clampToViewport, makePopupDraggable, makeFixedDraggable, setupClickOutside, clearPropositionHighlights, getCommentForBracket, makeCommentPopoverDraggableAndResizable
});
