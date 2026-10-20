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

  const $ = (id) => document.getElementById(id);
  const section = () => $('mainPointSummary');

  /** Read the box as plain text (innerText turns line breaks into "\n"). */
  function readBox(box) {
    return (box.innerText || '').replace(/\r\n?/g, '\n');
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

    // Never rewrite the box under the caret — only when state moved on without
    // it (load, undo/redo, cloud update).
    if (!editing && readBox(box) !== text) box.textContent = text;

    // Line the summary up with the proposition text column: same gutter
    // padding (it moves with bracket depth and flips side in RTL) and the same
    // width, including the parallel column's wider layout.
    const props = $('propositions');
    if (props) {
      el.style.paddingLeft = props.style.paddingLeft;
      el.style.paddingRight = props.style.paddingRight;
      el.classList.toggle('has-parallel', props.classList.contains('has-parallel'));
    }
  }

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
    DA_STATE.mainPointSummary = next;
    section().classList.toggle('has-text', !!next);
  }

  function open() {
    _open = true;
    render();
    const box = $('summaryText');
    if (box) box.focus();
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
        DA_STATE.mainPointSummary = trimmed;
      }
      // "+ Add" only holds the box open until the first blur; from then on
      // it's open exactly when there's text (so an undo back to empty, or
      // leaving it blank, collapses it to the button again).
      _open = false;
      _beforeEdit = null;
      _undoPushed = false;
      render();
    });
  }

  window.DA_SUMMARY = { render, init, open };
})();
