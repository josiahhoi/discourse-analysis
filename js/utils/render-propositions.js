/**
 * render-propositions — proposition block DOM, inline text/format/anchor
 * rendering, the parallel-column cells, and the delegated edit/hover listeners
 * (renderPropositions).
 *
 * Extracted from rendering-engine.js. This is a classic (non-module) script:
 * its top-level functions stay in the global scope like the rest of the app, and
 * it contributes its public function(s) to the shared window.DA_RENDERER
 * namespace. Loaded after rendering-engine.js in index.html.
 */

function _hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

let isRenderingPropositions = false;

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
  // The gutter-to-text gap scales with zoom like the gutter itself does.
  const _gutterGap = 20 * _zoom();
  // In RTL the bracket gutter mirrors to the right side, so pad on the right
  // instead of the left (and clear the opposite side when switching modes).
  if (DA_STATE.isRTL) {
    container.style.paddingRight = `${dynamicPaddingLeft + _gutterGap}px`;
    container.style.paddingLeft = '';
  } else {
    container.style.paddingLeft = `${dynamicPaddingLeft + _gutterGap}px`;
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

window.DA_RENDERER = Object.assign(window.DA_RENDERER || {}, {
    renderPropositions, clampToWordAnchor
});
