function _hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Relationship types that may be created by "jumping over" intermediate
// propositions (flat multi-member units whose interior dots/nodes are hidden).
// Read from the single canonical list in constants.js at use time — a
// module-load snapshot here once drifted from the picker's copy.
function _isJumpOverType(t) {
  return DA_CONSTANTS.JUMP_OVER_TYPES.includes(t);
}

/**
 * Create an SVG text element with the given label, rendering stars in a larger
 * font-size (20px at 100% zoom) for better visibility of dominance marking.
 * These sizes are set as inline attributes/styles specifically so the CSS
 * .bracket-label rule can't override them (see comment below) — which also
 * means CSS custom properties can't reach them, so zoom is applied here in JS
 * via the same getZoomFactor() the bracket-gutter geometry uses.
 */
function createLabelText(label, attrs = {}) {
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  for (const [key, value] of Object.entries(attrs)) {
    text.setAttribute(key, value);
  }
  const z = _zoom();

  if (!label || !label.includes('*')) {
    // Inference symbol is tiny at the default 11px — use inline style (beats CSS).
    if (label === '∴') text.setAttribute('style', `font-size: ${30 * z}px`);
    text.textContent = label;
    return text;
  }

  // Star is always rendered as a tspan so its 20px size isn't overridden by the
  // CSS .bracket-label { font-size: 11px } rule (CSS beats presentation attrs on
  // the same element, but not on child tspans that lack the class).
  // Mixed label (e.g. "E*"): render the star in a larger tspan so it stands out.
  const parts = label.split('*');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) {
      const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.textContent = parts[i];
      text.appendChild(span);
    }

    // Add star between parts (except after the last part)
    if (i < parts.length - 1) {
      const star = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      star.setAttribute('font-size', `${20 * z}px`);
      star.textContent = '*';
      text.appendChild(star);
    }
  }

  return text;
}

/**
 * Creates an SVG element with specified attributes.
 * @param {string} tag - The SVG tag name (e.g., 'path', 'g', 'polygon').
 * @param {Object} attrs - Attribute key-value pairs.
 * @returns {SVGElement}
 */
function createSVG(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'dataset') {
      for (const [dKey, dValue] of Object.entries(value)) {
        el.dataset[dKey] = dValue;
      }
    } else {
      el.setAttribute(key, value);
    }
  }
  return el;
}
let _slotForIdx = {};
let _maxSlot = 0;
let isRenderingPropositions = false;

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

let _delegatedListenersAttached = false;

function renderPropositions() {
  const container = document.getElementById('propositions');
  if (!container) return;

  if (DA_STATE.propositions.length === 0) {
    container.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.id = 'propositionEditor';
    ta.placeholder = 'Fetch or import a passage to start. Click in the text and press Enter to split it into a new line. Click the dots to create brackets and logical relationships.';
    ta.className = 'proposition-editor';
    container.appendChild(ta);
    const svg = document.getElementById('bracketCanvas');
    if (svg) svg.innerHTML = '';
    return;
  }

  isRenderingPropositions = true;

  const dynamicPaddingLeft = getGutterPadding();
  // In RTL the bracket gutter mirrors to the right side, so pad on the right
  // instead of the left (and clear the opposite side when switching modes).
  if (DA_STATE.isRTL) {
    container.style.paddingRight = `${dynamicPaddingLeft + 20}px`;
    container.style.paddingLeft = '';
  } else {
    container.style.paddingLeft = `${dynamicPaddingLeft + 20}px`;
    container.style.paddingRight = '';
  }

  while (DA_STATE.verseRefs.length < DA_STATE.propositions.length) DA_STATE.verseRefs.push(String(DA_STATE.verseRefs.length + 1));
  if (DA_STATE.verseRefs.length > DA_STATE.propositions.length) DA_STATE.verseRefs.length = DA_STATE.propositions.length;
  // verseBreaks is parallel to propositions, like verseRefs above.
  if (!Array.isArray(DA_STATE.verseBreaks)) DA_STATE.verseBreaks = [];
  while (DA_STATE.verseBreaks.length < DA_STATE.propositions.length) DA_STATE.verseBreaks.push([]);
  if (DA_STATE.verseBreaks.length > DA_STATE.propositions.length) DA_STATE.verseBreaks.length = DA_STATE.propositions.length;

  // Attach delegated listeners once
  if (!_delegatedListenersAttached) {
    _delegatedListenersAttached = true;
    attachPropositionDelegatedListeners(container);
  }

  // Remove textarea editor if switching from empty to populated state
  const existingEditor = container.querySelector('#propositionEditor');
  if (existingEditor) existingEditor.remove();

  // --- Differential rendering ---
  const existingBlocks = Array.from(container.querySelectorAll('.proposition-block'));
  const targetCount = DA_STATE.propositions.length;

  // Calculate hidden indices from collapsed brackets (getCollapseInfo is the
  // shared row/arm decision). _hiddenBy remembers which bracket(s) hid each row
  // so the fold-gap indicator can expand exactly those on click.
  const hiddenIndices = new Set();
  const _hiddenBy = new Map();
  DA_STATE.brackets.forEach((b, idx) => {
    if (!b.isCollapsed) return;
    getCollapseInfo(idx).hiddenRows.forEach((k) => {
      hiddenIndices.add(k);
      const owners = _hiddenBy.get(k) || [];
      owners.push(idx);
      _hiddenBy.set(k, owners);
    });
  });

  // Interior members of a series read as one unit with the ends, so their
  // standalone dots are hidden. This includes lines that are endpoints of a
  // nested sub-bracket: that sub-bracket carries its own visual connection
  // (its vertical line + label), so the bare dot would just be noise.
  const seriesMemberIndices = new Set();
  DA_STATE.brackets.forEach((b, idx) => {
    const t = b.type && b.type.toLowerCase();
    if (b.isJumpOver && _isJumpOverType(t)) {
      const ext = getBracketExtent(idx);
      for (let k = ext.from + 1; k <= ext.to - 1; k++) {
        seriesMemberIndices.add(k);
      }
    }
  });

  // Remove excess blocks
  while (existingBlocks.length > targetCount) {
    existingBlocks.pop().remove();
  }

  const _verseSuffixMap = precomputeVerseSuffixes(DA_STATE.verseRefs);
  // Highlight extents once per pass, not once per block (each resolution is an
  // id lookup + recursive extent walk).
  const _hlForPass = computeHighlightEntries();

  // Parallel column (Alternate Views): a second, editable text column stored
  // per-row in DA_STATE.parallelTexts. null when the column is off or hidden
  // (hiding conceals the cells but keeps the data).
  const _parallelCells = (DA_STATE.parallelLabel && !DA_STATE.parallelHidden) ? DA_STATE.parallelTexts : null;
  container.classList.toggle('has-parallel', _parallelCells !== null);
  const _parallelBadge = document.getElementById('parallelBadge');
  if (_parallelBadge) {
    _parallelBadge.style.display = _parallelCells !== null ? '' : 'none';
    _parallelBadge.textContent = _parallelCells !== null ? `+ ${DA_STATE.parallelLabel}` : '';
  }

  // Update existing or create new blocks
  DA_STATE.propositions.forEach((text, i) => {
    let block = existingBlocks[i];
    if (!block) {
      block = createPropositionBlock(text, i, _verseSuffixMap[i], _hlForPass, _parallelCells);
      container.appendChild(block);
    }

    // Toggle visibility based on folding
    block.classList.toggle('folded-hidden', hiddenIndices.has(i));
    block.classList.toggle('series-member', seriesMemberIndices.has(i));
    updatePropositionBlock(block, text, i, _verseSuffixMap[i], _hlForPass, _parallelCells);
  });

  // Remove stale gap indicators then re-insert for current hidden runs
  container.querySelectorAll('.fold-gap').forEach(el => el.remove());

  if (hiddenIndices.size > 0) {
    const sorted = [...hiddenIndices].sort((a, b) => a - b);
    const runs = [];
    let runStart = sorted[0], runEnd = sorted[0];
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k] === runEnd + 1) { runEnd = sorted[k]; }
      else { runs.push({ start: runStart, end: runEnd }); runStart = runEnd = sorted[k]; }
    }
    runs.push({ start: runStart, end: runEnd });

    runs.forEach(({ start, end }) => {
      const count = end - start + 1;
      const gap = document.createElement('div');
      gap.className = 'fold-gap';
      gap.textContent = `··· ${count} row${count !== 1 ? 's' : ''} collapsed ···`;

      // Clicking (or Enter/Space on) the gap expands every collapsed bracket
      // that hides a row in this run. Gaps are rebuilt each render, so the
      // owner indices captured here can't go stale.
      const owners = new Set();
      for (let k = start; k <= end; k++) (_hiddenBy.get(k) || []).forEach((bi) => owners.add(bi));
      gap.setAttribute('role', 'button');
      gap.tabIndex = 0;
      gap.title = 'Click to expand';
      gap.setAttribute('aria-label', `Expand ${count} collapsed row${count !== 1 ? 's' : ''}`);
      const expandRun = () => {
        DA_STATE.pushUndo('expand section');
        owners.forEach((bi) => { const b = DA_STATE.brackets[bi]; if (b) b.isCollapsed = false; });
        if (window.renderAll) window.renderAll();
      };
      gap.addEventListener('click', expandRun);
      gap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expandRun(); }
      });

      if (start === 0) {
        container.insertBefore(gap, container.querySelector('.proposition-block'));
      } else {
        const anchor = container.querySelector(`.proposition-block[data-index="${start - 1}"]`);
        if (anchor) anchor.after(gap);
      }
    });
  }

  isRenderingPropositions = false;
}

/**
 * After a free-form text edit changes a proposition's length, shift the stored
 * character offsets of its word arrows and text comments so they keep pointing at
 * the same words. Format tags are re-derived from the DOM so they don't need this.
 *
 * Uses a common-prefix/suffix diff: offsets before the change stay, offsets after
 * it shift by the length delta, offsets inside the changed region clamp to its
 * start. Handles the common cases (indenting/typing/deleting at a point) — e.g.
 * tabbing a line right shifts every anchor on it so an arrow at "apart" follows it.
 */
/**
 * Resolve an arrow anchor to a single word within `text`. Arrows are word-level,
 * but offset remapping through heavy edits (inserting blank lines, deletions) can
 * stretch a stored [start,end) across whitespace until the anchor spans whole
 * blank regions and the arrow tail balloons. Whenever the span isn't already a
 * clean single token, re-derive the word at/after start. Idempotent and safe to
 * run on every render, remap, and import, so corruption self-heals everywhere.
 */
function clampToWordAnchor(text, start, end) {
  if (typeof text !== 'string') return [start, end];
  const n = text.length;
  let s = Math.max(0, Math.min(start | 0, n));
  let e = Math.max(s, Math.min(end | 0, n));
  // Already a non-empty single token not starting on whitespace → keep as-is.
  if (e > s && !/\s/.test(text[s]) && !/\s/.test(text.slice(s, e))) return [s, e];
  // Otherwise advance past whitespace to a word, then take to the next whitespace.
  while (s < n && /\s/.test(text[s])) s++;
  let e2 = s;
  while (e2 < n && !/\s/.test(text[e2])) e2++;
  if (e2 > s) return [s, e2];
  return [Math.min(start | 0, n), Math.min(end | 0, n)];
}

function remapPropositionAnchors(i, oldText, newText) {
  if (oldText === newText) return;
  const oLen = oldText.length, nLen = newText.length;
  let p = 0;
  while (p < oLen && p < nLen && oldText[p] === newText[p]) p++;
  let s = 0;
  while (s < (oLen - p) && s < (nLen - p) && oldText[oLen - 1 - s] === newText[nLen - 1 - s]) s++;
  const oldChangeEnd = oLen - s;
  const delta = nLen - oLen;
  const map = (o) => (o < p) ? o : (o >= oldChangeEnd ? o + delta : p);

  DA_STATE.wordArrows.forEach(wa => {
    // Shift, then re-clamp to a single word so edits can't stretch the anchor.
    if (wa.fromProp === i) { [wa.fromStart, wa.fromEnd] = clampToWordAnchor(newText, map(wa.fromStart), map(wa.fromEnd)); }
    if (wa.toProp === i) { [wa.toStart, wa.toEnd] = clampToWordAnchor(newText, map(wa.toStart), map(wa.toEnd)); }
  });
  DA_STATE.comments.forEach(c => {
    if (c.type === 'text' && c.target && c.target.propIndex === i) {
      // Comments may legitimately span a phrase, so only shift — don't clamp.
      c.target.start = map(c.target.start);
      c.target.end = map(c.target.end);
    }
  });
  // Verse boundaries ride along with the same diff-shift, then are cleaned:
  // dropped if the edit pushed them out of range, deduped if two collapsed.
  const vb = DA_STATE.verseBreaks && DA_STATE.verseBreaks[i];
  if (vb && vb.length) {
    DA_STATE.verseBreaks[i] = [...new Set(vb.map(map))]
      .filter((b) => b > 0 && b < nLen)
      .sort((a, b) => a - b);
  }
}

function attachPropositionDelegatedListeners(container) {
  container.addEventListener('focusin', (e) => {
    const block = e.target.closest('.proposition-block');
    if (!block) return;
    const i = parseInt(block.dataset.index, 10);
    if (e.target.closest('.parallel-text')) block._parallelBeforeEdit = DA_STATE.parallelTexts[i];
    else block._textBeforeEdit = DA_STATE.propositions[i];
  });

  // Gate text editing to Text Edit mode. Outside it, propositions stay
  // contentEditable (so you can place a caret and press Enter to split, or click
  // dots for brackets) but character changes are blocked. Enter/Backspace are
  // handled in keydown with preventDefault, so they never reach beforeinput;
  // formatting (bold/underline) is non-destructive, so it's allowed through.
  container.addEventListener('beforeinput', (e) => {
    if (DA_STATE.textEditMode) return;
    if (!e.target.closest('.proposition-block')) return;
    if (e.inputType && e.inputType.startsWith('format')) return;
    e.preventDefault();
  });

  container.addEventListener('input', (e) => {
    const block = e.target.closest('.proposition-block');
    if (!block) return;
    scheduleVisualUpdate();
  });

  container.addEventListener('focusout', (e) => {
    const block = e.target.closest('.proposition-block');
    if (!block || isRenderingPropositions || !block.isConnected || !container.contains(block)) return;
    const i = parseInt(block.dataset.index, 10);
    if (isNaN(i)) return;

    // Parallel-cell commit: same shape as the primary commit below, minus the
    // arrow/comment anchor remapping (annotations are primary-text-only) and
    // the '(empty)' placeholder (an empty cell is meaningful).
    const pSpanEl = e.target.closest('.parallel-text');
    if (pSpanEl) {
      if (!DA_STATE.parallelLabel) return;
      const result = DA_EDITOR.extractFormatTags(pSpanEl, i, true);
      let cellText = result.text;
      const newCellTags = result.tags;
      if (DA_STATE.textEditMode) {
        cellText = cellText.replace(/\n$/, '');
      } else {
        const trimmedLead = cellText.trimStart();
        const diff = cellText.length - trimmedLead.length;
        cellText = trimmedLead.trimEnd();
        if (diff > 0) {
          newCellTags.forEach(f => {
            f.start = Math.max(0, f.start - diff);
            f.end = Math.max(0, f.end - diff);
          });
        }
      }
      const cellChanged = cellText !== (DA_STATE.parallelTexts[i] || '');
      if (cellChanged && block._parallelBeforeEdit !== undefined && block._parallelBeforeEdit !== null && cellText !== block._parallelBeforeEdit) {
        DA_STATE.pushUndo('text edit parallel', String(i));
      }
      DA_STATE.parallelTexts[i] = cellText;
      DA_STATE.formatTags = DA_STATE.formatTags
        .filter(f => !(f.propIndex === i && f.pcol))
        .concat(newCellTags);
      return;
    }

    const textSpanEl = block.querySelector('.proposition-text');
    let currentText = '';
    let newFormatTags = [];

    if (textSpanEl) {
      const result = DA_EDITOR.extractFormatTags(textSpanEl, i);
      currentText = result.text;
      newFormatTags = result.tags;
    }
    if (DA_STATE.textEditMode) {
      currentText = currentText.replace(/\n$/, '') || '(empty)';
    } else {
      const trimmed = currentText.trimStart();
      const diff = currentText.length - trimmed.length;
      currentText = trimmed.trim() || '(empty)';
      if (diff > 0) {
        newFormatTags.forEach(f => {
          f.start = Math.max(0, f.start - diff);
          f.end = Math.max(0, f.end - diff);
        });
      }
    }

    // Only record a 'text edit' undo if the text actually differs from what's
    // already stored. After a split/merge the state was updated programmatically
    // and propositions[i] already matches the DOM — pushing here would add a
    // redundant snapshot of the post-split state, so the first Undo click would
    // appear to do nothing (it reverts that no-op) and only the second would
    // undo the split. Comparing against the current stored value avoids that.
    const changedFromStored = currentText !== DA_STATE.propositions[i];
    let didFreeformEdit = false;
    if (changedFromStored && block._textBeforeEdit !== undefined && block._textBeforeEdit !== null && currentText !== block._textBeforeEdit) {
      DA_STATE.pushUndo('text edit', String(i));
      // A genuine free-form edit changed this line's length — shift arrow/comment
      // anchors so they keep pointing at the same words (split/merge skip this via
      // changedFromStored, since they update state programmatically and already remap).
      remapPropositionAnchors(i, block._textBeforeEdit, currentText);
      didFreeformEdit = true;
    }
    DA_STATE.propositions[i] = currentText;
    // Rebuild only this row's PRIMARY tags — its parallel-cell tags (pcol)
    // belong to the other span and must survive a primary commit.
    DA_STATE.formatTags = DA_STATE.formatTags
      .filter(f => !(f.propIndex === i && !f.pcol))
      .concat(newFormatTags);

    // If this line carries arrow/comment anchors, their on-screen spans are stale
    // after the edit (built from the old offsets/positions). Rebuild from the
    // remapped state so the arrows/marks snap to the words instead of drawing to
    // where the text used to be. Deferred so it runs after focus has settled.
    if (didFreeformEdit) {
      const hasAnchors = DA_STATE.wordArrows.some(w => w.fromProp === i || w.toProp === i)
        || DA_STATE.comments.some(c => c.type === 'text' && c.target && c.target.propIndex === i);
      if (hasAnchors) requestAnimationFrame(() => { if (window.renderAll) window.renderAll(); });
    }
  });

  let _glowPropIdx = null;
  let _currentMarkId = null;

  const _clearBracketGlow = () => {
    document.querySelectorAll('.bracket-group.bracket-highlight-active').forEach(el => {
      el.classList.remove('bracket-highlight-active');
      el.style.removeProperty('--glow-color');
    });
  };

  const _clearCommentCardActive = () => {
    document.querySelectorAll('.comments-preview-card.comment-hover-active')
      .forEach(el => el.classList.remove('comment-hover-active'));
  };

  const _activateCommentCard = (commentId) => {
    const card = document.querySelector(`.comments-preview-card[data-comment-id="${commentId}"]`);
    if (!card) return;
    card.classList.add('comment-hover-active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  container.addEventListener('mouseover', (e) => {
    // Bracket highlight glow: update only when entering a new proposition block
    const block = e.target.closest('.proposition-block');
    const i = block ? parseInt(block.dataset.index, 10) : null;
    if (i !== _glowPropIdx) {
      _glowPropIdx = i;
      _clearBracketGlow();
      if (i !== null && !isNaN(i) && Object.keys(DA_STATE.bracketHighlights).length) {
        Object.entries(DA_STATE.bracketHighlights).forEach(([bracketId, color]) => {
          const bIdx = DA_STATE.bracketIndexById(bracketId);
          if (bIdx === -1) return;
          const extent = getBracketExtent(bIdx);
          if (i >= extent.from && i <= extent.to) {
            const group = document.querySelector(`.bracket-group[data-index="${bIdx}"]`);
            if (group) {
              group.style.setProperty('--glow-color', color);
              group.classList.add('bracket-highlight-active');
            }
          }
        });
      }
    }

    // Text mark → comment card: activate on mark entry/exit
    const mark = e.target.closest('mark.comment-highlight');
    const markId = mark?.dataset.commentId ?? null;
    if (markId !== _currentMarkId) {
      _currentMarkId = markId;
      _clearCommentCardActive();
      if (markId) _activateCommentCard(markId);
    }
  });

  container.addEventListener('mouseleave', () => {
    _glowPropIdx = null;
    _clearBracketGlow();
    _currentMarkId = null;
    _clearCommentCardActive();
  });
}

/** Resolve every row highlight (id-keyed) to its color + covered extent. */
function computeHighlightEntries() {
  const out = [];
  Object.entries(DA_STATE.bracketHighlights).forEach(([bracketId, color]) => {
    const bIdx = DA_STATE.bracketIndexById(bracketId);
    if (bIdx === -1) return;
    out.push({ bIdx, color, extent: getBracketExtent(bIdx) });
  });
  return out;
}

/**
 * Per-render map of row index → parallel-column cell text, or null when the
 * column is off. Parallel text is keyed by VERSE (split/merge-proof); a verse's
 * text appears once, on the FIRST row where that verse begins — later rows of
 * the same verse get an empty cell. A merged '3-5' row shows verses 3–5 joined.
 */
/**
 * Expand a verse ref ('7', '3-5') into its verse-number strings; [] for empty
 * or non-numeric refs (e.g. '3:14' from pasted markers, which can't map to
 * Bolls verse numbers). The ONE ref-expansion rule shared by the parallel
 * fetch filter (ui-menus.js showParallelDialog) and the cell mapper below —
 * if these two ever disagree, the fetch keeps verses the renderer won't show.
 */
function versesInRef(ref) {
  if (!ref) return [];
  const parts = String(ref).split('-');
  const startN = parseInt(parts[0], 10);
  const endN = parseInt(parts[parts.length - 1], 10);
  if (isNaN(startN) || isNaN(endN)) return [];
  const out = [];
  for (let v = startN; v <= endN; v++) out.push(String(v));
  return out;
}

/**
 * One-time distribution when the parallel column is (re)fetched: map a
 * chapter's { verseNum: text } onto the current rows. Each verse's text lands
 * on the first row of that verse (later split rows get ''); a merged '3-5'
 * row joins its verses. From then on the cells live in
 * DA_STATE.parallelTexts as ordinary per-row editable text.
 */
function distributeVersesToRows(chapterMap) {
  const seen = new Set();
  return DA_STATE.verseRefs.map((ref) => {
    const texts = [];
    versesInRef(ref).forEach((key) => {
      if (seen.has(key)) return;
      seen.add(key);
      if (chapterMap[key]) texts.push(chapterMap[key]);
    });
    return texts.join(' ');
  });
}

function createPropositionBlock(text, i, verseDisplay, highlightEntries, parallelCells) {
  const block = document.createElement('div');
  block.className = 'proposition-block';
  block.dataset.index = i;

  const dot = document.createElement('div');
  dot.className = 'prop-dot';
  dot.dataset.index = i;
  // Keyboard target: Tab (or ArrowUp/Down between dots) + Enter/Space acts
  // like a click. aria-label is kept current in updatePropositionBlock.
  dot.tabIndex = 0;
  dot.setAttribute('role', 'button');
  block.appendChild(dot);

  const refSpan = document.createElement('span');
  refSpan.className = 'verse-ref';
  refSpan.contentEditable = 'false';
  block.appendChild(refSpan);

  const textSpan = document.createElement('span');
  textSpan.className = 'proposition-text';
  textSpan.contentEditable = 'true';
  textSpan.spellcheck = false;
  block.appendChild(textSpan);

  updatePropositionBlock(block, text, i, verseDisplay, highlightEntries, parallelCells);
  return block;
}

function updatePropositionBlock(block, text, i, verseDisplay, highlightEntries, parallelCells) {
  block.dataset.index = i;
  const dot = block.querySelector('.prop-dot');
  if (dot) {
    dot.dataset.index = i;
    const vd = verseDisplay !== undefined ? verseDisplay : computeVerseDisplay(i);
    dot.setAttribute('aria-label', `Verse ${vd || i + 1}: select for bracket`);
  }

  const isDirectPropSelection = DA_STATE.firstBracketPoint === `p${i}`;
  let isRangeSelected = isDirectPropSelection;

  // If a bracket is selected, highlight all propositions in its range for context
  if (DA_STATE.firstBracketPoint && !DA_STATE.isPropRef(DA_STATE.firstBracketPoint)) {
    const bIdx = DA_STATE.bracketIndexById(DA_STATE.firstBracketPoint);
    if (bIdx !== -1) {
      const range = getBracketExtent(bIdx);
      if (i >= range.from && i <= range.to) {
        isRangeSelected = true;
      }
    }
  }

  block.classList.toggle('selected-for-bracket', isRangeSelected);
  if (dot) dot.classList.toggle('active-node', isDirectPropSelection);

  block.style.marginLeft = `${(DA_STATE.indentation[i] || 0) * 20}px`;

  // Highlight colors of brackets covering this proposition. The resolved
  // entries are computed once per render pass by the caller; the fallback keeps
  // standalone calls correct.
  const _hlAll = highlightEntries !== undefined ? highlightEntries : computeHighlightEntries();
  const _highlightColors = _hlAll
    .filter(e => i >= e.extent.from && i <= e.extent.to)
    .map(e => e.color);

  // --- Left accent bar ---
  let _bar = block.querySelector('.section-highlight-bar');
  if (_highlightColors.length === 0) {
    if (_bar) _bar.remove();
    block.style.background = '';
  } else {
    if (!_bar) {
      _bar = document.createElement('div');
      _bar.className = 'section-highlight-bar';
      block.appendChild(_bar);
    }
    if (_highlightColors.length === 1) {
      _bar.style.background = _hexToRgba(_highlightColors[0], 0.9);
      block.style.background = _hexToRgba(_highlightColors[0], 0.2);
    } else {
      const seg = 100 / _highlightColors.length;
      const barStops = _highlightColors.flatMap((c, idx) =>
        [`${_hexToRgba(c, 0.9)} ${(idx * seg).toFixed(1)}%`, `${_hexToRgba(c, 0.9)} ${((idx + 1) * seg).toFixed(1)}%`]
      );
      _bar.style.background = `linear-gradient(to bottom, ${barStops.join(', ')})`;
      const size = 14;
      const bgStops = _highlightColors.flatMap((c, idx) =>
        [`${_hexToRgba(c, 0.2)} ${idx * size}px`, `${_hexToRgba(c, 0.2)} ${(idx + 1) * size}px`]
      );
      block.style.background = `repeating-linear-gradient(-45deg, ${bgStops.join(', ')})`;
    }
  }


  // Update verse ref
  const refSpan = block.querySelector('.verse-ref');
  if (refSpan) {
    const vd = verseDisplay !== undefined ? verseDisplay : computeVerseDisplay(i);
    const refText = vd ? `${vd} ` : '';
    if (refSpan.textContent !== refText) refSpan.textContent = refText;
  }

  // Update text — skip if this block has focus (user is actively editing)
  // UNLESS: (a) the text in the DOM doesn't match state (structural change like merge/split),
  //      or (b) we are in arrow mode (clicks on words are selection, not editing — no cursor at risk)
  const textSpan = block.querySelector('.proposition-text');
  if (textSpan) {
    const isFocused = textSpan.contains(document.activeElement) || document.activeElement === textSpan;
    const domText = textSpan.innerText.trim();
    const stateText = text.trim();
    const forceUpdate = DA_STATE._forceNextRender || DA_STATE.shiftModeActive || DA_STATE.arrowMode || DA_STATE.activeCommentTarget || domText !== stateText;

    if (!isFocused || forceUpdate) {
      renderInlineContent(textSpan, text, i);
    }
  }

  // Parallel column cell (editable; the differential renderer reuses blocks,
  // so the span must be added/removed when the column toggles mid-session).
  const cells = parallelCells !== undefined
    ? parallelCells
    : ((DA_STATE.parallelLabel && !DA_STATE.parallelHidden) ? DA_STATE.parallelTexts : null);
  let pSpan = block.querySelector('.parallel-text');
  if (cells === null) {
    if (pSpan) pSpan.remove();
  } else {
    if (!pSpan) {
      pSpan = document.createElement('span');
      pSpan.className = 'parallel-text';
      // Editable exactly like .proposition-text: always contentEditable so the
      // caret can be placed for Enter-splits; character input is gated to Text
      // Edit mode by the shared beforeinput handler.
      pSpan.contentEditable = 'true';
      pSpan.spellcheck = false;
      // dir=auto: e.g. Chinese must render LTR inside its cell even when the
      // primary passage is Hebrew and the whole row is direction: rtl.
      pSpan.setAttribute('dir', 'auto');
      block.appendChild(pSpan);
    }
    const cellText = cells[i] || '';
    // Mirror the primary span's guard: never rewrite the DOM under an active
    // caret unless state and DOM genuinely disagree (structural change).
    const pFocused = pSpan.contains(document.activeElement) || document.activeElement === pSpan;
    const pForce = DA_STATE._forceNextRender || pSpan.innerText.trim() !== cellText.trim();
    if (!pFocused || pForce) renderParallelCellContent(pSpan, cellText, i);
  }
}

/**
 * Render a parallel cell: plain text plus this row's parallel-column format
 * tags (bold / underline / color). A slim sibling of renderInlineContent —
 * comments, arrows and shift ghosts don't exist in the second column.
 */
function renderParallelCellContent(pSpan, text, i) {
  const cellTags = DA_STATE.formatTags.filter(f => f.propIndex === i && f.pcol);
  pSpan.innerHTML = '';
  if (cellTags.length === 0) {
    pSpan.textContent = text;
    return;
  }
  const allTags = cellTags.map(f => ({ ...f, tag: f }));
  const events = [];
  allTags.forEach((t, tid) => {
    events.push({ pos: Math.max(0, t.start), type: 'start', tid });
    events.push({ pos: Math.min(text.length, t.end), type: 'end', tid });
  });
  events.sort((a, b) => a.pos === b.pos ? (a.type === b.type ? 0 : (a.type === 'start' ? 1 : -1)) : a.pos - b.pos);
  let pos = 0;
  const activeTags = new Set();
  events.forEach(e => {
    if (e.pos > pos) {
      appendChunk(pSpan, text.slice(pos, e.pos), pos, i, activeTags, allTags);
      pos = e.pos;
    }
    if (e.type === 'start') activeTags.add(e.tid);
    else activeTags.delete(e.tid);
  });
  if (pos < text.length) appendChunk(pSpan, text.slice(pos), pos, i, new Set(), allTags);
}

function precomputeVerseSuffixes(verseRefs) {
  const verseGroups = new Map();
  verseRefs.forEach((ref, idx) => {
    if (!ref) return;
    ref.split('-').forEach(v => {
      if (!verseGroups.has(v)) verseGroups.set(v, []);
      const arr = verseGroups.get(v);
      if (!arr.includes(idx)) arr.push(idx);
    });
  });
  return verseRefs.map((ref, idx) => {
    if (!ref) return '';
    const getVerseDisplay = (verse) => {
      const group = verseGroups.get(verse);
      if (!group || group.length <= 1) return verse;
      const pos = group.indexOf(idx);
      return pos < 0 ? verse : verse + String.fromCharCode(97 + pos);
    };
    if (!ref.includes('-')) return getVerseDisplay(ref);
    const parts = ref.split('-');
    return `${getVerseDisplay(parts[0])}-${getVerseDisplay(parts[parts.length - 1])}`;
  });
}

// Single-index convenience over precomputeVerseSuffixes, so the suffix logic
// (which propositions share a verse → a/b/c letters) lives in exactly one place.
function computeVerseDisplay(i) {
  return precomputeVerseSuffixes(DA_STATE.verseRefs)[i] || '';
}

function renderInlineContent(textSpan, text, i) {
  const textComments = DA_STATE.showCommentsEnabled
    ? DA_STATE.comments.filter((c) => c.type === 'text' && c.target && c.target.propIndex === i)
    : [];
  const textFormats = DA_STATE.formatTags.filter((f) => f.propIndex === i && !f.pcol);
  const textArrows = [];
  DA_STATE.wordArrows.forEach((wa, idx) => {
    // Clamp each anchor to a single word so a corrupted/stretched offset range can
    // never render a span across blank lines (which balloons the arrow tail).
    if (wa.fromProp === i) {
      const [s, e] = clampToWordAnchor(text, wa.fromStart, wa.fromEnd);
      textArrows.push({ start: s, end: e, type: 'arrow-anchor', id: `arrow-${idx}-from` });
    }
    if (wa.toProp === i) {
      const [s, e] = clampToWordAnchor(text, wa.toStart, wa.toEnd);
      textArrows.push({ start: s, end: e, type: 'arrow-anchor', id: `arrow-${idx}-to` });
    }
  });

  textSpan.innerHTML = '';

  const isActiveProp = DA_STATE.activeCommentTarget && DA_STATE.activeCommentTarget.type === 'text' && DA_STATE.activeCommentTarget.propIndex === i;

  if (textComments.length === 0 && textFormats.length === 0 && textArrows.length === 0 && !isActiveProp) {
    textSpan.textContent = text;
    return;
  }

  const allTags = [];
  textComments.forEach(c => allTags.push({ ...c.target, type: 'comment', tag: c }));
  textFormats.forEach(f => allTags.push({ ...f, tag: f }));
  textArrows.forEach(a => allTags.push({ ...a, tag: a }));
  
  if (DA_STATE.activeCommentTarget && DA_STATE.activeCommentTarget.type === 'text' && DA_STATE.activeCommentTarget.propIndex === i) {
    allTags.push({ ...DA_STATE.activeCommentTarget, type: 'comment', tag: { id: 'active-comment-target' } });
  }

  if (DA_STATE.shiftModeActive && i === DA_STATE.shiftSourceIndex) {
    allTags.push({
      start: DA_STATE.shiftSourceStartOffset,
      end: DA_STATE.shiftSourceEndOffset,
      type: 'shift-source',
      tag: { id: 'shift-source' }
    });
  }

  let events = [];
  allTags.forEach((t, tid) => {
    events.push({ pos: Math.max(0, t.start), type: 'start', tid });
    events.push({ pos: Math.min(text.length, t.end), type: 'end', tid });
  });
  events.sort((a, b) => a.pos === b.pos ? (a.type === b.type ? 0 : (a.type === 'start' ? 1 : -1)) : a.pos - b.pos);

  let pos = 0;
  let activeTags = new Set();

  events.forEach(e => {
    if (e.pos > pos) {
      appendChunk(textSpan, text.slice(pos, e.pos), pos, i, activeTags, allTags);
      pos = e.pos;
    }
    if (e.type === 'start') activeTags.add(e.tid);
    else activeTags.delete(e.tid);
  });

  if (pos < text.length) {
    appendChunk(textSpan, text.slice(pos), pos, i, new Set(), allTags);
  }

  if (DA_STATE.shiftModeActive && i === DA_STATE.shiftTargetIndex) {
    const ghostSpan = document.createElement('span');
    ghostSpan.className = 'shift-target-ghost';
    ghostSpan.textContent = DA_STATE.shiftText;
    
    if (DA_STATE.shiftTargetPosition === 'end') {
      if (textSpan.textContent.length > 0) {
        textSpan.appendChild(document.createTextNode(' '));
      }
      textSpan.appendChild(ghostSpan);
    } else {
      if (textSpan.textContent.length > 0) {
        ghostSpan.textContent += ' ';
      }
      textSpan.insertBefore(ghostSpan, textSpan.firstChild);
    }
  }
}

function appendChunk(textSpan, chunk, startPos, propIdx, activeTags, allTags) {
  let node = document.createTextNode(chunk);

  /** @type {HTMLElement|null} */ let wrapper = null;
  /** @type {HTMLElement|null} */ let currentInner = null;
  const activeIds = Array.from(activeTags);

  activeIds.forEach(id => {
    const t = allTags[id];
    if (t.type === 'bold' || t.type === 'underline') {
      const el = document.createElement(t.type === 'underline' ? 'u' : 'b');
      if (!wrapper) wrapper = currentInner = el;
      else { currentInner.appendChild(el); currentInner = el; }
    } else if (t.type === 'color') {
      const el = document.createElement('span');
      el.className = 'color-text';
      el.style.color = t.tag.color;
      // Keep the original value (e.g. hex) so extractFormatTags can recover it
      // verbatim on focusout — style.color reads back as rgb(), which would
      // otherwise drift the stored color away from the swatch value.
      el.dataset.color = t.tag.color;
      if (!wrapper) wrapper = currentInner = el;
      else { currentInner.appendChild(el); currentInner = el; }
    }
  });
  activeIds.forEach(id => {
    const t = allTags[id];
    if (t.type === 'comment') {
      const mark = document.createElement('mark');
      mark.className = 'comment-highlight';
      mark.dataset.commentId = t.tag.id;
      if (!wrapper) wrapper = currentInner = mark;
      else { currentInner.appendChild(mark); currentInner = mark; }
    }
  });
  activeIds.forEach(id => {
    const t = allTags[id];
    if (t.type === 'arrow-anchor') {
      const span = document.createElement('span');
      span.className = 'arrow-anchor';
      span.dataset.arrowId = t.tag.id;
      
      const arrowIdx = parseInt(t.tag.id.split('-')[1]);
      if (arrowIdx === DA_STATE.selectedArrowIdx) {
        span.classList.add('active-anchor');
      }
      if (!wrapper) wrapper = currentInner = span;
      else { currentInner.appendChild(span); currentInner = span; }
    }
  });
  activeIds.forEach(id => {
    const t = allTags[id];
    if (t.type === 'shift-source') {
      const span = document.createElement('span');
      span.className = 'shift-source-text';
      if (!wrapper) wrapper = currentInner = span;
      else { currentInner.appendChild(span); currentInner = span; }
    }
  });

  if (currentInner) {
    currentInner.appendChild(node);
    textSpan.appendChild(wrapper);
  } else {
    textSpan.appendChild(node);
  }
}

// getBracketExtent is defined once at the bottom of the file (with getPointExtent)

function computeSlotAssignments() {
  _slotForIdx = {};
  const n = DA_STATE.brackets.length;
  if (n === 0) { _maxSlot = 0; return; }

  // Extents are computed ONCE up front. The containment check runs over every
  // bracket pair (O(n²)), so recomputing recursive extents inside it made deep
  // nestings O(n³) — the main reason chapter-length passages froze per frame.
  const extents = DA_STATE.brackets.map((_, i) => getBracketExtent(i));

  const contains = (outerIdx, innerIdx) => {
    if (outerIdx === innerIdx) return false;
    const eOuter = extents[outerIdx];
    const eInner = extents[innerIdx];
    if (eInner.from >= eOuter.from && eInner.to <= eOuter.to) {
      if (eInner.from === eOuter.from && eInner.to === eOuter.to) {
        return innerIdx < outerIdx;
      }
      return true;
    }
    return false;
  };

  const order = [];
  const visited = new Set();
  const visit = (idx) => {
    if (visited.has(idx)) return;
    visited.add(idx);
    for (let i = 0; i < n; i++) {
      if (contains(idx, i)) visit(i);
    }
    order.push(idx);
  };
  for (let i = 0; i < n; i++) visit(i);

  _maxSlot = 0;
  order.forEach((idx) => {
    let slot = 0;
    for (let i = 0; i < n; i++) {
      if (contains(idx, i)) slot = Math.max(slot, _slotForIdx[i] + 1);
    }
    _slotForIdx[idx] = slot;
    if (slot > _maxSlot) _maxSlot = slot;
  });
}

// Canvas width captured each renderBrackets pass, used to mirror computed gutter
// X coordinates in RTL mode. Shared so getConnectionPoints can mirror too.
let _bracketCanvasW = 0;

// Per-pass memo for getConnectionPoints, keyed "from|to". Only non-null while
// renderBrackets is mid-pass (dot positions are frozen then); always reset to
// null afterwards so no stale geometry survives between frames.
let _connCache = null;
function _mirrorGutterX(xv) {
  return DA_STATE.isRTL ? _bracketCanvasW - xv : xv;
}

// Width of the bracket gutter (text padding) given the current nesting depth.
// Shared by renderPropositions (as padding) and getBracketX (as the origin).
// BRACKET_GEO is defined in raw px for 100% zoom. Everything computed from it
// is scaled by the current zoom factor so the gutter/nesting geometry stays
// proportionate to the (CSS-scaled) text instead of looking cramped or
// oversized at any zoom level besides 100%. Falls back to 1 (no scaling) when
// DA_UI isn't loaded, e.g. isolated unit tests.
function _zoom() {
  return (window.DA_UI && DA_UI.getZoomFactor) ? DA_UI.getZoomFactor() : 1;
}

/**
 * Connection-node offset from the bracket spine (positive = right, so RTL
 * flips the sign), zoom-scaled. The ONE definition of where a bracket's node
 * sits — used by both the node renderer (renderBrackets) and arm targeting
 * (getConnectionPoints.getX); keeping them in one place is what guarantees a
 * parent's arm actually lands on the child's node circle at every zoom level.
 */
function _nodeOffset() {
  return (DA_STATE.isRTL ? 15 : -15) * _zoom();
}

function getGutterPadding() {
  const { GAP, BRACKET_WIDTH, SLOT_WIDTH, BASE_PADDING } = DA_CONSTANTS.BRACKET_GEO;
  const z = _zoom();
  return Math.max(200 * z, DA_STATE.brackets.length
    ? BASE_PADDING * z + GAP * z + BRACKET_WIDTH * z + (_maxSlot + 1) * SLOT_WIDTH * z
    : BASE_PADDING * z);
}

function getBracketX(bracketIdx) {
  const slot = _slotForIdx[bracketIdx] ?? 0;
  const { GAP, BRACKET_WIDTH, SLOT_WIDTH } = DA_CONSTANTS.BRACKET_GEO;
  const z = _zoom();
  return getGutterPadding() - GAP * z - BRACKET_WIDTH * z - slot * SLOT_WIDTH * z;
}

function renderBrackets() {
  const svg = document.getElementById('bracketCanvas');
  if (!svg) return;

  // Keyboard-focus continuity: the SVG is rebuilt from scratch each pass, which
  // would silently drop focus (e.g. mid keyboard bracket-creation on a
  // connection node). Remember which bracket's node/line held focus and restore
  // it onto the rebuilt element at the end.
  let _refocus = null;
  const _active = document.activeElement;
  if (_active && svg.contains(_active)) {
    const _kind = _active.classList.contains('connection-node') ? 'node'
      : _active.classList.contains('bracket-hitbox') ? 'line' : null;
    const _idx = parseInt(_kind === 'node' ? _active.dataset.bracketIdx : _active.dataset.index, 10);
    if (_kind && DA_STATE.brackets[_idx]) _refocus = { kind: _kind, id: DA_STATE.brackets[_idx].id };
  }

  svg.innerHTML = '';
  if (DA_STATE.brackets.length === 0) return;
  
  const dots = document.querySelectorAll('.prop-dot');
  const dotPositions = Array.from(dots).map(dot => {
    const rect = dot.getBoundingClientRect();
    const containerRect = svg.getBoundingClientRect();
    return {
      midY: rect.top - containerRect.top + rect.height / 2,
      left: rect.left - containerRect.left + rect.width / 2
    };
  });
  
  DA_STATE.dotPositions = dotPositions;
  
  if (dotPositions.length === 0) return;

  // Bracket group hover → comment card activation (set up once on the SVG element)
  if (!svg._commentHoverListenerAttached) {
    svg._commentHoverListenerAttached = true;
    let _hoveredBracketIdx = null;
    const _clearCardActive = () => {
      document.querySelectorAll('.comments-preview-card.comment-hover-active')
        .forEach(el => el.classList.remove('comment-hover-active'));
    };
    svg.addEventListener('mouseover', (e) => {
      const group = e.target.closest('.bracket-group.has-comment');
      const newIdx = group ? parseInt(group.dataset.index, 10) : null;
      if (newIdx === _hoveredBracketIdx) return;
      _hoveredBracketIdx = newIdx;
      _clearCardActive();
      if (newIdx === null || isNaN(newIdx)) return;
      const hoveredId = DA_STATE.brackets[newIdx]?.id;
      DA_STATE.comments.forEach(c => {
        if (c.type === 'bracket' && c.target?.bracketId === hoveredId) {
          const card = document.querySelector(`.comments-preview-card[data-comment-id="${c.id}"]`);
          if (card) {
            card.classList.add('comment-hover-active');
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
    });
    svg.addEventListener('mouseleave', () => {
      _hoveredBracketIdx = null;
      _clearCardActive();
    });
  }

  // All bracket extents for this pass, computed once. Several checks below run
  // over bracket pairs; recomputing recursive extents inside those loops is
  // what made deep nestings quadratic-to-cubic per frame.
  const _extents = DA_STATE.brackets.map((_, idx) => getBracketExtent(idx));
  // Verse displays for aria-labels, one suffix computation per pass.
  const _verseMap = precomputeVerseSuffixes(DA_STATE.verseRefs);

  // --- RTL mirroring ---
  // In right-to-left mode the bracket gutter is on the right, so every *computed*
  // gutter X (the spine, connection node, star, and label offsets) is mirrored
  // around the canvas width. The arm endpoints (topLeft/bottomLeft) are measured
  // from the already-mirrored DOM, so they are used as-is and not mirrored here.
  const _rtl = DA_STATE.isRTL;
  _bracketCanvasW = svg.getBoundingClientRect().width;
  const MX = _mirrorGutterX;                        // mirror a computed gutter X
  const _z = _zoom();                               // scales the small offsets below too,
                                                      // so labels/nodes/stars don't look
                                                      // glued to the spine at high zoom
  const _labelDX = (_rtl ? -5 : 5) * _z;             // label sits toward the text
  const _labelAnchor = _rtl ? 'end' : 'start';
  const _nodeDX = _nodeOffset();                     // node sits away from the text
  const _starDX = (_rtl ? 12 : -12) * _z;
  const _starAnchor = _rtl ? 'start' : 'end';

  // Connection-nodes to suppress: a bracket "jumped over" by a series or
  // bilateral is an implicit member, so its own parent-attach anchor would just
  // dangle inside the span. We hide it. A bracket the jump-over references
  // directly (its from/to) keeps its node — the arm terminates there.
  const _hiddenNodeIdx = new Set();
  DA_STATE.brackets.forEach((s, sIdx) => {
    const _t = s.type && s.type.toLowerCase();
    if (!s.isJumpOver || !_isJumpOverType(_t)) return;
    const sExt = _extents[sIdx];
    const refs = new Set([s.from, s.to]);
    DA_STATE.brackets.forEach((b, bIdx) => {
      if (bIdx === sIdx || refs.has(b.id)) return;
      const bExt = _extents[bIdx];
      if (bExt.from >= sExt.from && bExt.to <= sExt.to &&
          !(bExt.from === sExt.from && bExt.to === sExt.to)) {
        _hiddenNodeIdx.add(bIdx);
      }
    });
  });

  // Per-pass memo for getConnectionPoints: a nested bracket's geometry is
  // otherwise recomputed recursively for every ancestor that references it.
  _connCache = new Map();
  try {

  DA_STATE.brackets.forEach((bracket, i) => {
    // 1. Hide brackets that are inside a collapsed parent
    const isInsideCollapsed = DA_STATE.brackets.some((otherB, otherIdx) => {
      if (otherIdx === i || !otherB.isCollapsed) return false;
      const outerRange = _extents[otherIdx];
      const innerRange = _extents[i];
      return innerRange.from >= outerRange.from && innerRange.to <= outerRange.to;
    });
    if (isInsideCollapsed) return;

    let { topY, topLeft, bottomY, bottomLeft } = getConnectionPoints(bracket.from, bracket.to, dotPositions, i);
    const x = MX(getBracketX(i));

    // Shared with the row hider in renderPropositions so rows and arms agree.
    const _collapseInfo = bracket.isCollapsed ? getCollapseInfo(i) : null;
    const isCollapsedCoord = !!(_collapseInfo && _collapseInfo.isCoordinateShape);

    if (bracket.isCollapsed) {
      if (isCollapsedCoord) {
        // Coordinate collapsed: resolve both visible endpoints and span the full distance
        const repFrom = getRepresentativeRange(bracket.from);
        const repTo = getRepresentativeRange(bracket.to);
        const fromPos = dotPositions[repFrom.from];
        const toPos = dotPositions[repTo.from];
        if (fromPos && fromPos.midY > 0 && toPos && toPos.midY > 0) {
          topY = fromPos.midY;
          topLeft = fromPos.left;
          bottomY = toPos.midY;
          bottomLeft = toPos.left;
        } else {
          const extent = _extents[i];
          for (let j = extent.from; j <= extent.to; j++) {
            const pos = dotPositions[j];
            if (pos && pos.midY > 0) { topY = bottomY = pos.midY; topLeft = bottomLeft = pos.left; break; }
          }
        }
      } else {
        // Subordinate collapsed: snap to the representative dot of the dominant
        // endpoint (already resolved by getCollapseInfo). getRepresentativeRange
        // makes bN refs land on the actual proposition dot rather than the
        // bracket node x position (which may be hidden/unrendered).
        const repDominant = getRepresentativeRange(_collapseInfo.dominantId);
        const dominantPos = dotPositions[repDominant.from];
        if (dominantPos && dominantPos.midY > 0) {
          topY = bottomY = dominantPos.midY;
          topLeft = bottomLeft = dominantPos.left;
        } else {
          // Fallback: find first visible prop in the bracket's full extent
          const extent = _extents[i];
          for (let j = extent.from; j <= extent.to; j++) {
            const pos = dotPositions[j];
            if (pos && pos.midY > 0) { topY = bottomY = pos.midY; topLeft = bottomLeft = pos.left; break; }
          }
        }
      }
    }

    // Create Group for Hovering and Selection
    const isBracketSelected = DA_STATE.firstBracketPoint === bracket.id;
    const isActiveTarget = DA_STATE.activeCommentTarget && DA_STATE.activeCommentTarget.type === 'bracket' && DA_STATE.activeCommentTarget.bracketId === bracket.id;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const color = (window.DA_PROFILES ? DA_PROFILES.getColor(bracket.type) : DA_CONSTANTS.RELATIONSHIP_COLORS[bracket.type]) || DA_CONSTANTS.RELATIONSHIP_COLORS.unspecified;
    group.setAttribute('style', `--bracket-color: ${color};`);
    group.setAttribute('class', `bracket-group ${bracket.type} ${bracket.isCollapsed ? 'is-collapsed' : ''} ${isCollapsedCoord ? 'is-collapsed-coord' : ''} ${isBracketSelected ? 'is-selected' : ''} ${isActiveTarget ? 'is-active-target' : ''}`);
    group.dataset.index = i;
    svg.appendChild(group);

    const labels = getBracketLabels(bracket.type, bracket.labelsSwapped, bracket.dominanceFlipped);

    // Background highlight path for comments
    if (DA_STATE.showCommentsEnabled) {
      const bComments = DA_STATE.comments.filter(c => c.type === 'bracket' && c.target && c.target.bracketId === bracket.id);
      if (bComments.length > 0) {
          group.classList.add('has-comment');
          let d;
          if (bracket.isCollapsed && !isCollapsedCoord) {
            d = `M ${x} ${topY} V ${topY}`;
          } else {
            d = `M ${topLeft} ${topY} H ${x} V ${bottomY} H ${bottomLeft}`;
          }
          group.appendChild(createSVG('path', {
            d: d,
            class: 'bracket-comment-highlight',
            fill: 'none',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
          }));
      }
    }

    // Main Vertical Line
    group.appendChild(createSVG('line', {
      x1: x, y1: topY,
      x2: x, y2: ((bracket.isCollapsed && !isCollapsedCoord) ? topY : bottomY),
      class: 'bracket-line'
    }));

    // Hitbox. The vertical one doubles as the bracket's keyboard target
    // (Enter opens the label picker via the canvas keydown handler); the arm
    // hitboxes below stay mouse-only so each bracket is a single tab stop.
    const _ext = _extents[i];
    const _typeName = window.DA_PROFILES ? DA_PROFILES.getName(bracket.type) : bracket.type;
    const _spokenType = (!_typeName || _typeName === '?') ? 'Unlabeled' : _typeName;
    const _vLabel = `${_spokenType} bracket, verses ${_verseMap[_ext.from] || _ext.from + 1}–${_verseMap[_ext.to] || _ext.to + 1}. Press Enter to edit.`;
    group.appendChild(createSVG('line', {
      x1: x, y1: topY,
      x2: x, y2: ((bracket.isCollapsed && !isCollapsedCoord) ? topY : bottomY),
      class: 'bracket-hitbox',
      tabindex: 0,
      role: 'button',
      'aria-label': _vLabel,
      dataset: { index: i }
    }));

    // Top Arm (always drawn — for subordinate collapsed this is the single arm to the dominant row)
    group.appendChild(createSVG('line', {
      x1: x, y1: topY, x2: topLeft, y2: topY,
      class: 'bracket-hitbox',
      dataset: { index: i }
    }));
    group.appendChild(createSVG('line', {
      x1: x, y1: topY, x2: topLeft, y2: topY,
      class: `bracket-arm ${bracket.type}`,
      dataset: { index: i }
    }));

    // Bottom Arm (skipped for subordinate collapsed — topY == bottomY there, so it would duplicate the top arm)
    if (!bracket.isCollapsed || isCollapsedCoord) {
      group.appendChild(createSVG('line', {
        x1: x, y1: bottomY, x2: bottomLeft, y2: bottomY,
        class: 'bracket-hitbox',
        dataset: { index: i }
      }));
      group.appendChild(createSVG('line', {
        x1: x, y1: bottomY, x2: bottomLeft, y2: bottomY,
        class: `bracket-arm ${bracket.type}`,
        dataset: { index: i }
      }));
    }

    // Main Point Star — large red ★ on the left side of the dominant arm
    if (bracket.isMainPoint) {
      const dominantY = (labels.top && labels.top.includes('*')) ? topY
                      : (labels.bottom && labels.bottom.includes('*')) ? bottomY
                      : (topY + bottomY) / 2;
      group.appendChild(createSVG('text', {
        x: x + _starDX,
        y: dominantY,
        'text-anchor': _starAnchor,
        'dominant-baseline': 'middle',
        class: 'main-point-star',
        'font-size': `${50 * _z}px`,
        fill: '#e53935',
        'pointer-events': 'none'
      })).textContent = '★';
    }

    // Connection Node (Recursive Dot)
    let nodeY = (topY + bottomY) / 2;
    if (!labels.single) {
      if (labels.top && labels.top.includes('*')) nodeY = topY;
      else if (labels.bottom && labels.bottom.includes('*')) nodeY = bottomY;
    }

    group.appendChild(createSVG('circle', {
      cx: x + _nodeDX,
      cy: nodeY,
      r: 5 * _z,
      class: `${(DA_STATE.bracketSelectStep === 1 && DA_STATE.firstBracketPoint === bracket.id) ? 'connection-node active-node' : 'connection-node'} ${bracket.isCollapsed ? 'collapsed' : ''} ${_hiddenNodeIdx.has(i) ? 'series-absorbed' : ''}`,
      tabindex: 0,
      role: 'button',
      'aria-label': bracket.isCollapsed
        ? `${_spokenType} bracket node: collapsed, press Enter to expand`
        : `${_spokenType} bracket node: select for bracket`,
      dataset: { bracketIdx: i }
    }));

    if (bracket.isCollapsed && !isCollapsedCoord) {
      // Subordinate collapsed: summary label at the dominant row arm, same position as normal top label
      group.appendChild(createLabelText(labels.summary, {
        x: x + _labelDX,
        y: topY - 5,
        'text-anchor': _labelAnchor,
        class: 'bracket-label',
        dataset: { index: i }
      }));
    } else if (labels.single) {
      group.appendChild(createLabelText(labels.single, {
        x: x + _labelDX,
        y: (topY + bottomY) / 2,
        'text-anchor': _labelAnchor,
        'dominant-baseline': 'middle',
        class: 'bracket-label single-label',
        dataset: { index: i }
      }));
    } else {
      // Standalone stars ('*' only) are centered on the bracket endpoint via
      // dominant-baseline:middle. Mixed labels ('E*') use baseline positioning
      // with a -5 offset so the text sits just above the endpoint.
      const topStarOnly = labels.top === '*';
      const bottomStarOnly = labels.bottom === '*';

      group.appendChild(createLabelText(labels.top, {
        x: x + _labelDX,
        y: topStarOnly ? topY : topY - 5,
        'text-anchor': _labelAnchor,
        ...(topStarOnly ? { 'dominant-baseline': 'middle' } : {}),
        class: 'bracket-label',
        dataset: { index: i, pos: 'top' }
      }));

      group.appendChild(createLabelText(labels.bottom, {
        x: x + _labelDX,
        y: bottomStarOnly ? bottomY : bottomY - 5,
        'text-anchor': _labelAnchor,
        ...(bottomStarOnly ? { 'dominant-baseline': 'middle' } : {}),
        class: 'bracket-label',
        dataset: { index: i, pos: 'bottom' }
      }));
    }
  });

  } finally {
    // The memo is only valid for this pass's dot positions — never leave it on.
    _connCache = null;
  }

  // Restore keyboard focus onto the rebuilt element (see top of function).
  if (_refocus) {
    const bIdx = DA_STATE.bracketIndexById(_refocus.id);
    if (bIdx !== -1) {
      const el = _refocus.kind === 'node'
        ? svg.querySelector(`.connection-node[data-bracket-idx="${bIdx}"]`)
        : svg.querySelector(`.bracket-hitbox[tabindex][data-index="${bIdx}"]`);
      if (el) el.focus();
    }
  }
}

function getExtent(id, _seen) {
  if (typeof id === 'number') return { from: id, to: id };
  if (id === null || id === undefined) return { from: 0, to: 0 };
  if (DA_STATE.isPropRef(id)) {
    const idx = parseInt(id.slice(1), 10);
    return { from: idx, to: idx };
  }
  // Anything that isn't 'pN' is a bracket id.
  if (!_seen) _seen = new Set();
  if (_seen.has(id)) return { from: 0, to: 0 };
  _seen.add(id);
  const b = DA_STATE.bracketById(id);
  if (!b) return { from: 0, to: 0 };
  const eFrom = getExtent(b.from, _seen);
  const eTo = getExtent(b.to, _seen);
  return { from: Math.min(eFrom.from, eTo.from), to: Math.max(eFrom.to, eTo.to) };
}

function getBracketExtent(bracketIdx) {
  const b = DA_STATE.brackets[bracketIdx];
  if (!b) return { from: 0, to: 0 };
  const eFrom = getExtent(b.from);
  const eTo = getExtent(b.to);
  return { from: Math.min(eFrom.from, eTo.from), to: Math.max(eFrom.to, eTo.to) };
}

// Like getExtent but follows only the dominant (starred) side of nested brackets,
// so collapsing a bracket shows only the representative proposition(s), not the
// full extent of a sub-bracket endpoint.
function getRepresentativeRange(id, _seen) {
  if (id === null || id === undefined) return { from: 0, to: 0 };
  if (typeof id === 'number' || DA_STATE.isPropRef(id)) {
    const idx = typeof id === 'number' ? id : parseInt(id.slice(1), 10);
    return { from: idx, to: idx };
  }
  if (!_seen) _seen = new Set();
  if (_seen.has(id)) return { from: 0, to: 0 };
  _seen.add(id);
  const b = DA_STATE.bracketById(id);
  if (!b) return { from: 0, to: 0 };
  const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
  const hasStarTop = (labels.top && labels.top.includes('*')) || labels.single === '*';
  const hasStarBottom = labels.bottom && labels.bottom.includes('*');
  if (hasStarTop && !hasStarBottom) {
    return getRepresentativeRange(b.from, _seen);
  } else if (hasStarBottom && !hasStarTop) {
    return getRepresentativeRange(b.to, _seen);
  } else {
    // Coordinate or ambiguous — expose the full extent of this sub-bracket
    return getBracketExtent(DA_STATE.bracketIndexById(id));
  }
}

// Lazy so this file doesn't depend on constants.js load order.
let _coordTypesCache = null;
function _coordinateTypeSet() {
  if (!_coordTypesCache) _coordTypesCache = new Set(DA_CONSTANTS.RELATIONSHIP_GROUPS_HIERARCHY[0].types);
  return _coordTypesCache;
}

/**
 * The single source of truth for what collapsing a bracket does. Both the row
 * hider (renderPropositions) and the arm drawer (renderBrackets) consume this,
 * so they can never disagree about which rows represent a collapsed bracket —
 * previously a no-star subordinate label kept both endpoint rows visible but
 * drew only one arm, leaving the other row dangling.
 *
 * A subordinate type with exactly one starred arm collapses to that dominant
 * end (isCoordinateShape false, dominantId set). Everything else — coordinate
 * types, no-star labels (e.g. dominance display off), double-star labels —
 * keeps both ends and hides the middle (isCoordinateShape true).
 */
function getCollapseInfo(bracketIdx) {
  const b = DA_STATE.brackets[bracketIdx];
  if (!b) return { hiddenRows: [], isCoordinateShape: true, dominantId: null };
  const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
  const starTop = !!((labels.top && labels.top.includes('*')) || labels.single === '*');
  const starBottom = !!(labels.bottom && labels.bottom.includes('*'));
  const isCoordinate = _coordinateTypeSet().has(b.type.toLowerCase());
  const fullRange = getBracketExtent(bracketIdx);
  const hiddenRows = [];

  if (!isCoordinate && starTop !== starBottom) {
    const dominantId = starTop ? b.from : b.to;
    const rep = getRepresentativeRange(dominantId);
    for (let k = fullRange.from; k <= fullRange.to; k++) {
      if (k < rep.from || k > rep.to) hiddenRows.push(k);
    }
    return { hiddenRows, isCoordinateShape: false, dominantId };
  }

  const repFrom = getRepresentativeRange(b.from);
  const repTo = getRepresentativeRange(b.to);
  for (let k = fullRange.from; k <= fullRange.to; k++) {
    const atFrom = k >= repFrom.from && k <= repFrom.to;
    const atTo = k >= repTo.from && k <= repTo.to;
    if (!atFrom && !atTo) hiddenRows.push(k);
  }
  return { hiddenRows, isCoordinateShape: true, dominantId: null };
}

function getConnectionPoints(fromId, toId, dotPositions, excludeBracketIdx = -1, _seen) {
  const _cacheKey = _connCache ? `${fromId}|${toId}` : null;
  if (_cacheKey && _connCache.has(_cacheKey)) return _connCache.get(_cacheKey);

  // Guard against cyclic bracket references (a bracket reachable from itself via
  // from/to). getExtent/getRepresentativeRange already carry such guards; without
  // one here a cycle recurses forever and the whole diagram dies on render.
  if (!_seen) _seen = new Set();

  // Helper to get Y coordinate for a point
  const getY = (id) => {
    if (typeof id === 'number' || DA_STATE.isPropRef(id)) {
      const idx = typeof id === 'number' ? id : parseInt(id.slice(1), 10);
      return dotPositions[idx]?.midY || 0;
    }
    // Bracket id
    if (_seen.has(id)) return 0; // cycle — bail
    _seen.add(id);
    const b = DA_STATE.bracketById(id);
    if (!b) return 0; // SAFETY
    const points = getConnectionPoints(b.from, b.to, dotPositions, -1, _seen);

    // Check for stars to determine connection point
    const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
    if (labels.single) return (points.topY + points.bottomY) / 2;

    if (labels.top && labels.top.includes('*')) {
      return points.topY;
    }
    if (labels.bottom && labels.bottom.includes('*')) {
      return points.bottomY;
    }

    return (points.topY + points.bottomY) / 2;
  };

  // Helper to get X coordinate for a point
  const getX = (id) => {
    if (typeof id === 'number' || DA_STATE.isPropRef(id)) {
      const idx = typeof id === 'number' ? id : parseInt(id.slice(1), 10);
      return dotPositions[idx]?.left || 0;
    }
    // Bracket id: point at the connection-node, mirrored to the right gutter
    // in RTL. _nodeOffset() is the same zoom-scaled offset renderBrackets
    // draws the node circle at, so the arm lands on it at every zoom level.
    const bIdx = DA_STATE.bracketIndexById(id);
    if (bIdx === -1) return 0;
    return _mirrorGutterX(getBracketX(bIdx)) + _nodeOffset();
  };

  const result = {
    topY: getY(fromId),
    topLeft: getX(fromId),
    bottomY: getY(toId),
    bottomLeft: getX(toId)
  };
  if (_cacheKey) _connCache.set(_cacheKey, result);
  return result;
}

function getPointExtent(id) {
  return getExtent(id);
}

// getBracketLabels, renderWordArrows, and renderCommentPreviews now live in
// render-labels.js / render-arrows.js / render-comments.js and add themselves to
// this namespace via Object.assign (loaded after this file in index.html).
window.DA_RENDERER = Object.assign(window.DA_RENDERER || {}, {
    renderAll, renderPropositions, renderBrackets,
    computeSlotAssignments, getBracketX, getConnectionPoints,
    getPointExtent, getBracketExtent, getRepresentativeRange, getCollapseInfo, updateBracketPositions,
    scheduleVisualUpdate, computeVerseDisplay, clampToWordAnchor, distributeVersesToRows, versesInRef,
    getBracketSlots: () => ({ ..._slotForIdx })
});
