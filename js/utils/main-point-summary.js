/**
 * main-point-summary — the written-out main point summary shown below the
 * diagram (DA_STATE.mainPointSummary).
 *
 * One plain-text document field: saved with the project, undo-tracked, and
 * included in PNG/PDF exports when non-empty. While empty it collapses to a
 * quiet "+ Add main point summary" button (never exported).
 *
 * Editing writes straight through to state on every input, so save/autosave/
 * cloud always see the current text. The first change of each edit session
 * pushes one undo step (captured before the write, so it holds the old text);
 * further typing in the same session is covered by the field's native undo.
 *
 * Comments: select text in the summary and right-click → Add Comment. They
 * are ordinary DA_STATE.comments entries with type 'summary' and a
 * { start, end } character range into the summary text, drawn as the same
 * comment-highlight marks as proposition comments. Every edit remaps those
 * ranges so they keep covering the same words.
 *
 * Lives outside #propositions on purpose: none of the proposition editor's
 * split/merge/format/Text-Edit-mode handling applies here, and the global
 * shortcuts already stand down for any focused contentEditable.
 *
 * Classic (non-module) script. Namespace: window.DA_SUMMARY
 */
(function () {
  let _open = false;          // user clicked "+ Add" and hasn't left the box yet
  let _beforeEdit = null;     // text when the current edit session began
  let _undoPushed = false;
  let _drawnSig = null;       // text + highlights the box was last built from

  const $ = (id) => document.getElementById(id);
  const section = () => $('mainPointSummary');
  const ACTIVE_ID = 'active-comment-target'; // same sentinel as proposition marks

  /** Read the box as plain text. With contenteditable="plaintext-only" line
   *  breaks are literal "\n" characters, so this matches character offsets. */
  function readBox(box) {
    return (box.innerText || '').replace(/\r\n?/g, '\n');
  }

  // ── Pure helpers (unit-tested) ─────────────────────────────────────────────

  /**
   * Where an anchored range lands after the text changes from oldText to
   * newText. The edit is located by the longest common prefix and suffix;
   * positions before it stay, positions after it shift by the length change,
   * and positions inside the replaced span snap to its edges. So typing before
   * a comment moves it along, typing inside it grows it, and deleting the
   * commented words collapses it (start === end) rather than moving it onto
   * unrelated text.
   */
  function remapRange(oldText, newText, start, end) {
    if (oldText === newText) return { start, end };
    const max = Math.min(oldText.length, newText.length);
    let p = 0;
    while (p < max && oldText[p] === newText[p]) p++;
    let s = 0;
    while (s < max - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
    const oldEditEnd = oldText.length - s;
    const newEditEnd = newText.length - s;
    const delta = newText.length - oldText.length;
    const mapStart = (x) => (x <= p ? x : x >= oldEditEnd ? x + delta : p);
    const mapEnd = (x) => (x <= p ? x : x >= oldEditEnd ? x + delta : newEditEnd);
    const ns = mapStart(start);
    return { start: ns, end: Math.max(ns, mapEnd(end)) };
  }

  /**
   * Split text into runs for rendering: [{ text, id }] where id is the comment
   * covering that run (null = plain). Where ranges overlap, the active
   * (being-edited) target wins, then the first comment.
   */
  function segments(text, ranges) {
    const live = ranges.filter((r) => r.end > r.start && r.start < text.length);
    const cuts = new Set([0, text.length]);
    live.forEach((r) => { cuts.add(Math.max(0, r.start)); cuts.add(Math.min(text.length, r.end)); });
    const points = Array.from(cuts).sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k], b = points[k + 1];
      if (a === b) continue;
      const covering = live.filter((r) => r.start <= a && r.end >= b);
      const hit = covering.find((r) => r.id === ACTIVE_ID) || covering[0];
      const id = hit ? hit.id : null;
      const prev = out[out.length - 1];
      if (prev && prev.id === id) prev.text += text.slice(a, b); // one mark per run
      else out.push({ text: text.slice(a, b), id });
    }
    return out;
  }

  // ── State ──────────────────────────────────────────────────────────────────

  function summaryComments() {
    return DA_STATE.comments.filter((c) => c.type === 'summary' && c.target);
  }

  /** Re-anchor every summary comment for a text change (old → new). */
  function remapComments(oldText, newText) {
    summaryComments().forEach((c) => {
      const r = remapRange(oldText, newText, c.target.start, c.target.end);
      c.target.start = r.start;
      c.target.end = r.end;
    });
  }

  /** Replace the summary text, keeping comment anchors on their words. */
  function setText(next) {
    remapComments(DA_STATE.mainPointSummary || '', next);
    DA_STATE.mainPointSummary = next;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function rangesToDraw() {
    // Exports strip reviewer notes (suppressCommentVisuals), like proposition marks.
    if (DA_STATE.suppressCommentVisuals) return [];
    const ranges = summaryComments().map((c) => ({ start: c.target.start, end: c.target.end, id: c.id }));
    const a = DA_STATE.activeCommentTarget;
    if (a && a.type === 'summary') ranges.push({ start: a.start, end: a.end, id: ACTIVE_ID });
    return ranges;
  }

  function fillBox(box, text, ranges) {
    box.replaceChildren(...segments(text, ranges).map((seg) => {
      if (!seg.id) return document.createTextNode(seg.text);
      const mark = document.createElement('mark');
      mark.className = 'comment-highlight';
      mark.dataset.commentId = seg.id;
      mark.textContent = seg.text;
      return mark;
    }));
  }

  function render() {
    const el = section();
    const box = $('summaryText');
    if (!el || !box) return;

    const text = DA_STATE.mainPointSummary || '';
    const hasDoc = DA_STATE.propositions.length > 0;
    const editing = document.activeElement === box;

    // Nothing to summarize yet → no "+ Add" button on a blank page. A summary
    // that exists is always shown, though.
    el.hidden = !hasDoc && !text;
    el.classList.toggle('is-open', !!text || _open || editing);
    el.classList.toggle('has-text', !!text);

    // Never rebuild the box under the caret — only when the text or its
    // highlights moved on without it (load, undo/redo, cloud, comment edits).
    if (editing) return;
    const ranges = rangesToDraw();
    const sig = text + '\u0000' + JSON.stringify(ranges);
    if (_drawnSig !== sig || readBox(box) !== text) {
      fillBox(box, text, ranges);
      _drawnSig = sig;
    }
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  function commitInput(box) {
    const next = readBox(box);
    if (next === DA_STATE.mainPointSummary) return;
    if (!_undoPushed && next !== _beforeEdit) {
      DA_STATE.pushUndo('edit main point summary');
      _undoPushed = true;
    } else if (window.DA_CLOUD && DA_CLOUD.markDirty) {
      // pushUndo marks a live cloud session dirty; later keystrokes in the
      // same session must too, or a sync mid-typing would drop them.
      DA_CLOUD.markDirty();
    }
    setText(next);
    section().classList.toggle('has-text', !!next);
  }

  function open() {
    _open = true;
    render();
    const box = $('summaryText');
    if (box) box.focus();
  }

  /** The current selection as { start, end } offsets into the summary text,
   *  or null when it isn't a non-empty selection inside the box. */
  function selectionOffsets(box) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!box.contains(range.startContainer) || !box.contains(range.endContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(box);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + range.toString().length;
    return end > start ? { start, end } : null;
  }

  /** `textAtSelection` is the summary text the offsets were measured in —
   *  the field may blur (and trim) before the menu click lands. */
  function showContextMenu(x, y, offsets, textAtSelection) {
    document.getElementById('textContextMenu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'textContextMenu'; // shares Escape/dismiss handling with the text menu
    menu.className = 'context-menu';
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.action = 'add-comment';
    item.textContent = 'Add Comment';
    menu.appendChild(item);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);
    clampToViewport(menu);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      // Leave the field (if the click didn't already): blur commits/trims the
      // text and lets the active-target highlight draw. Then carry the
      // offsets across any trim that happened since they were measured.
      $('summaryText').blur();
      const r = remapRange(textAtSelection, DA_STATE.mainPointSummary || '', offsets.start, offsets.end);
      if (r.end > r.start) DA_UI.showCommentPopover({ summary: r });
    });
    setupClickOutside(menu, () => menu.remove());
  }

  /** Open the popover for an existing summary comment (mark or sidebar card). */
  function openComment(comment) {
    if (!comment || !comment.target) return;
    DA_UI.showCommentPopover({
      summary: { start: comment.target.start, end: comment.target.end },
      existingCommentId: comment.id
    });
  }

  function init() {
    const box = $('summaryText');
    const addBtn = $('addSummaryBtn');
    if (!box) return;

    // plaintext-only keeps typed content free of markup where the browser
    // supports it (older ones throw); the paste handler below covers the rest.
    try { box.contentEditable = 'plaintext-only'; } catch (_) { box.contentEditable = 'true'; }

    if (addBtn) addBtn.addEventListener('click', open);

    box.addEventListener('focus', () => {
      _beforeEdit = DA_STATE.mainPointSummary || '';
      _undoPushed = false;
      section().classList.add('is-open');
    });

    box.addEventListener('input', () => commitInput(box));

    box.addEventListener('paste', (e) => {
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text == null) return;
      e.preventDefault();
      document.execCommand('insertText', false, text);
    });

    box.addEventListener('blur', () => {
      // Trailing/leading blank lines are editing noise, not content.
      const trimmed = (DA_STATE.mainPointSummary || '').trim();
      if (trimmed !== DA_STATE.mainPointSummary) {
        if (!_undoPushed && trimmed !== _beforeEdit) DA_STATE.pushUndo('edit main point summary');
        setText(trimmed);
      }
      // "+ Add" only holds the box open until the first blur; from then on
      // it's open exactly when there's text (so an undo back to empty, or
      // leaving it blank, collapses it to the button again).
      _open = false;
      _beforeEdit = null;
      _undoPushed = false;
      _drawnSig = null; // typing may have reshaped the marks — redraw from state
      render();
    });

    box.addEventListener('contextmenu', (e) => {
      const offsets = selectionOffsets(box);
      if (!offsets) return; // no selection: keep the browser's own menu (spellcheck)
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, offsets, DA_STATE.mainPointSummary || '');
    });

    // A click on a highlight opens its comment, like proposition highlights.
    box.addEventListener('click', (e) => {
      const mark = e.target.closest('mark.comment-highlight');
      if (!mark || mark.dataset.commentId === ACTIVE_ID) return;
      openComment(DA_STATE.comments.find((c) => c.id === mark.dataset.commentId));
    });

    // Highlight ↔ sidebar card, mirroring the proposition marks.
    let hovered = null;
    box.addEventListener('mouseover', (e) => {
      const id = e.target.closest('mark.comment-highlight')?.dataset.commentId ?? null;
      if (id === hovered) return;
      hovered = id;
      document.querySelectorAll('.comments-preview-card.comment-hover-active')
        .forEach((el) => el.classList.remove('comment-hover-active'));
      const card = id && document.querySelector(`.comments-preview-card[data-comment-id="${id}"]`);
      if (card) {
        card.classList.add('comment-hover-active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    box.addEventListener('mouseleave', () => {
      hovered = null;
      document.querySelectorAll('.comments-preview-card.comment-hover-active')
        .forEach((el) => el.classList.remove('comment-hover-active'));
    });
  }

  window.DA_SUMMARY = { render, init, open, openComment, remapRange, segments };
})();
