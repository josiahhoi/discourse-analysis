function _hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Create an SVG text element with the given label, rendering stars in a larger
 * font-size (20px) for better visibility of dominance marking.
 */
function createLabelText(label, attrs = {}) {
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  for (const [key, value] of Object.entries(attrs)) {
    text.setAttribute(key, value);
  }

  if (!label || !label.includes('*')) {
    text.textContent = label;
    return text;
  }

  // Split on star and create tspan elements with different font sizes
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
      star.setAttribute('font-size', '20px');
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

  const { GAP, BRACKET_WIDTH, SLOT_WIDTH, BASE_PADDING } = DA_CONSTANTS.BRACKET_GEO;
  const dynamicPaddingLeft = Math.max(200, DA_STATE.brackets.length
    ? BASE_PADDING + GAP + BRACKET_WIDTH + (_maxSlot + 1) * SLOT_WIDTH
    : BASE_PADDING);
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

  // Calculate hidden indices from collapsed brackets
  const hiddenIndices = new Set();
  const _coordinateTypes = new Set(DA_CONSTANTS.RELATIONSHIP_GROUPS_HIERARCHY[0].types);
  DA_STATE.brackets.forEach((b, idx) => {
    if (b.isCollapsed) {
      const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
      const rangeFrom = getRepresentativeRange(b.from);
      const rangeTo = getRepresentativeRange(b.to);
      const fullRange = getBracketExtent(idx);

      const isCoordinate = _coordinateTypes.has(b.type.toLowerCase());
      const hasStarTop = (labels.top && labels.top.includes('*')) || labels.single === '*';
      const hasStarBottom = (labels.bottom && labels.bottom.includes('*'));

      if (!isCoordinate && hasStarTop && !hasStarBottom) {
        // Show Dominant TOP (from), hide the rest
        for (let k = fullRange.from; k <= fullRange.to; k++) {
          if (k < rangeFrom.from || k > rangeFrom.to) hiddenIndices.add(k);
        }
      } else if (!isCoordinate && hasStarBottom && !hasStarTop) {
        // Show Dominant BOTTOM (to), hide the rest
        for (let k = fullRange.from; k <= fullRange.to; k++) {
          if (k < rangeTo.from || k > rangeTo.to) hiddenIndices.add(k);
        }
      } else {
        // Coordinate (or ambiguous): show both ends, hide the middle
        for (let k = fullRange.from; k <= fullRange.to; k++) {
          const isAtFrom = k >= rangeFrom.from && k <= rangeFrom.to;
          const isAtTo = k >= rangeTo.from && k <= rangeTo.to;
          if (!isAtFrom && !isAtTo) hiddenIndices.add(k);
        }
      }
    }
  });

  // Remove excess blocks
  while (existingBlocks.length > targetCount) {
    existingBlocks.pop().remove();
  }

  const _verseSuffixMap = precomputeVerseSuffixes(DA_STATE.verseRefs);

  // Update existing or create new blocks
  DA_STATE.propositions.forEach((text, i) => {
    let block = existingBlocks[i];
    if (!block) {
      block = createPropositionBlock(text, i, _verseSuffixMap[i]);
      container.appendChild(block);
    }

    // Toggle visibility based on folding
    block.classList.toggle('folded-hidden', hiddenIndices.has(i));
    updatePropositionBlock(block, text, i, _verseSuffixMap[i]);
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
}

function attachPropositionDelegatedListeners(container) {
  container.addEventListener('focusin', (e) => {
    const block = e.target.closest('.proposition-block');
    if (!block) return;
    const i = parseInt(block.dataset.index, 10);
    block._textBeforeEdit = DA_STATE.propositions[i];
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
    DA_STATE.formatTags = DA_STATE.formatTags.filter(f => f.propIndex !== i).concat(newFormatTags);

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
        Object.entries(DA_STATE.bracketHighlights).forEach(([bIdxStr, color]) => {
          const bIdx = parseInt(bIdxStr, 10);
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

function createPropositionBlock(text, i, verseDisplay) {
  const block = document.createElement('div');
  block.className = 'proposition-block';
  block.dataset.index = i;

  const dot = document.createElement('div');
  dot.className = 'prop-dot';
  dot.dataset.index = i;
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

  updatePropositionBlock(block, text, i, verseDisplay);
  return block;
}

function updatePropositionBlock(block, text, i, verseDisplay) {
  block.dataset.index = i;
  const dot = block.querySelector('.prop-dot');
  if (dot) dot.dataset.index = i;

  const isDirectPropSelection = DA_STATE.firstBracketPoint === `p${i}`;
  let isRangeSelected = isDirectPropSelection;
  
  // If a bracket is selected, highlight all propositions in its range for context
  if (DA_STATE.firstBracketPoint && DA_STATE.firstBracketPoint.startsWith('b')) {
    const bIdx = parseInt(DA_STATE.firstBracketPoint.slice(1), 10);
    const range = getBracketExtent(bIdx);
    if (i >= range.from && i <= range.to) {
      isRangeSelected = true;
    }
  }

  block.classList.toggle('selected-for-bracket', isRangeSelected);
  if (dot) dot.classList.toggle('active-node', isDirectPropSelection);

  block.style.marginLeft = `${(DA_STATE.indentation[i] || 0) * 20}px`;

  // Collect highlight colors and bracket indices covering this proposition
  const _highlightEntries = [];
  Object.entries(DA_STATE.bracketHighlights).forEach(([bIdxStr, color]) => {
    const bIdx = parseInt(bIdxStr, 10);
    const extent = getBracketExtent(bIdx);
    if (i >= extent.from && i <= extent.to) _highlightEntries.push({ bIdx, color, extent });
  });
  const _highlightColors = _highlightEntries.map(e => e.color);

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

function computeVerseDisplay(i) {
  const currentRef = DA_STATE.verseRefs[i];
  if (!currentRef) return '';

  const checkNeedsSuffix = (verse, idx) => {
    return DA_STATE.verseRefs.some((r, rIdx) => {
      if (rIdx === idx) return false;
      return r === verse || r.startsWith(verse + '-') || r.endsWith('-' + verse) || r.includes('-' + verse + '-');
    });
  };

  const getSuffix = (verse, idx) => {
    let count = 0;
    for (let j = 0; j < DA_STATE.verseRefs.length; j++) {
      const ref = DA_STATE.verseRefs[j];
      if (!ref) continue;
      const isMatch = ref === verse || ref.startsWith(verse + '-') || ref.endsWith('-' + verse) || ref.includes('-' + verse + '-');
      if (isMatch) {
        if (j === idx) return String.fromCharCode(97 + count);
        count++;
      }
    }
    return '';
  };

  const getFullDisplay = (ref, idx) => {
    if (!ref.includes('-')) {
      return checkNeedsSuffix(ref, idx) ? ref + getSuffix(ref, idx) : ref;
    }
    const parts = ref.split('-');
    const start = parts[0];
    const end = parts[parts.length - 1];
    const startDisplay = checkNeedsSuffix(start, idx) ? start + getSuffix(start, idx) : start;
    const endDisplay = checkNeedsSuffix(end, idx) ? end + getSuffix(end, idx) : end;
    return `${startDisplay}-${endDisplay}`;
  };

  return getFullDisplay(currentRef, i);
}

function renderInlineContent(textSpan, text, i) {
  const textComments = DA_STATE.showCommentsEnabled
    ? DA_STATE.comments.filter((c) => c.type === 'text' && c.target && c.target.propIndex === i)
    : [];
  const textFormats = DA_STATE.formatTags.filter((f) => f.propIndex === i);
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

  let wrapper = null, currentInner = null;
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
  const order = [];
  const visited = new Set();
  
  const visit = (idx) => {
    if (visited.has(idx)) return;
    visited.add(idx);
    DA_STATE.brackets.forEach((a, i) => {
      if (bracketContainsForSlot(DA_STATE.brackets[idx], idx, a, i)) visit(i);
    });
    order.push(idx);
  };
  
  DA_STATE.brackets.forEach((_, i) => visit(i));
  
  order.forEach((idx) => {
    const bracket = DA_STATE.brackets[idx];
    const contained = DA_STATE.brackets
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => bracketContainsForSlot(bracket, idx, a, i));
      
    if (contained.length === 0) {
      _slotForIdx[idx] = 0;
    } else {
      _slotForIdx[idx] = 1 + Math.max(...contained.map(({ i }) => _slotForIdx[i]));
    }
  });
  
  _maxSlot = DA_STATE.brackets.length ? Math.max(...Object.values(_slotForIdx)) : 0;
}

function bracketContainsForSlot(outer, outerIdx, inner, innerIdx) {
  if (outerIdx === innerIdx) return false;
  const eOuter = getBracketExtent(outerIdx);
  const eInner = getBracketExtent(innerIdx);
  
  if (eInner.from >= eOuter.from && eInner.to <= eOuter.to) {
    if (eInner.from === eOuter.from && eInner.to === eOuter.to) {
      return innerIdx < outerIdx;
    }
    return true;
  }
  return false;
}

// Canvas width captured each renderBrackets pass, used to mirror computed gutter
// X coordinates in RTL mode. Shared so getConnectionPoints can mirror too.
let _bracketCanvasW = 0;
function _mirrorGutterX(xv) {
  return DA_STATE.isRTL ? _bracketCanvasW - xv : xv;
}

function getBracketX(bracketIdx) {
  const slot = _slotForIdx[bracketIdx] ?? 0;
  const { GAP, BRACKET_WIDTH, SLOT_WIDTH, BASE_PADDING } = DA_CONSTANTS.BRACKET_GEO;
  const dynamicPaddingLeft = Math.max(200, DA_STATE.brackets.length
    ? BASE_PADDING + GAP + BRACKET_WIDTH + (_maxSlot + 1) * SLOT_WIDTH
    : BASE_PADDING);
  return dynamicPaddingLeft - GAP - BRACKET_WIDTH - slot * SLOT_WIDTH;
}

function renderBrackets() {
  const svg = document.getElementById('bracketCanvas');
  if (!svg) return;
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
      DA_STATE.comments.forEach(c => {
        if (c.type === 'bracket' && c.target?.bracketIdx === newIdx) {
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

  const _coordTypes = new Set(DA_CONSTANTS.RELATIONSHIP_GROUPS_HIERARCHY[0].types);

  // --- RTL mirroring ---
  // In right-to-left mode the bracket gutter is on the right, so every *computed*
  // gutter X (the spine, connection node, star, and label offsets) is mirrored
  // around the canvas width. The arm endpoints (topLeft/bottomLeft) are measured
  // from the already-mirrored DOM, so they are used as-is and not mirrored here.
  const _rtl = DA_STATE.isRTL;
  _bracketCanvasW = svg.getBoundingClientRect().width;
  const MX = _mirrorGutterX;                        // mirror a computed gutter X
  const _labelDX = _rtl ? -5 : 5;                   // label sits toward the text
  const _labelAnchor = _rtl ? 'end' : 'start';
  const _nodeDX = _rtl ? 15 : -15;                  // node sits away from the text
  const _starDX = _rtl ? 12 : -12;
  const _starAnchor = _rtl ? 'start' : 'end';

  DA_STATE.brackets.forEach((bracket, i) => {
    // 1. Hide brackets that are inside a collapsed parent
    const isInsideCollapsed = DA_STATE.brackets.some((otherB, otherIdx) => {
      if (otherIdx === i || !otherB.isCollapsed) return false;
      const outerRange = getBracketExtent(otherIdx);
      const innerRange = getBracketExtent(i);
      return innerRange.from >= outerRange.from && innerRange.to <= outerRange.to;
    });
    if (isInsideCollapsed) return;

    let { topY, topLeft, bottomY, bottomLeft } = getConnectionPoints(bracket.from, bracket.to, dotPositions, i);
    const x = MX(getBracketX(i));

    const isCollapsedCoord = bracket.isCollapsed && _coordTypes.has(bracket.type.toLowerCase());

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
          const extent = getBracketExtent(i);
          for (let j = extent.from; j <= extent.to; j++) {
            const pos = dotPositions[j];
            if (pos && pos.midY > 0) { topY = bottomY = pos.midY; topLeft = bottomLeft = pos.left; break; }
          }
        }
      } else {
        // Subordinate collapsed: snap to the representative dot of the dominant endpoint.
        // Use getRepresentativeRange so that bN refs resolve to the actual proposition dot
        // rather than the bracket node x position (which may be hidden/unrendered).
        const labelsC = getBracketLabels(bracket.type, bracket.labelsSwapped, bracket.dominanceFlipped);
        const isTopStar = labelsC.top && labelsC.top.includes('*');
        const isBottomStar = labelsC.bottom && labelsC.bottom.includes('*');
        const dominantId = (isBottomStar && !isTopStar) ? bracket.to : bracket.from;
        const repDominant = getRepresentativeRange(dominantId);
        const dominantPos = dotPositions[repDominant.from];
        if (dominantPos && dominantPos.midY > 0) {
          topY = bottomY = dominantPos.midY;
          topLeft = bottomLeft = dominantPos.left;
        } else {
          // Fallback: find first visible prop in the bracket's full extent
          const extent = getBracketExtent(i);
          for (let j = extent.from; j <= extent.to; j++) {
            const pos = dotPositions[j];
            if (pos && pos.midY > 0) { topY = bottomY = pos.midY; topLeft = bottomLeft = pos.left; break; }
          }
        }
      }
    }

    // Create Group for Hovering and Selection
    const isBracketSelected = DA_STATE.firstBracketPoint === `b${i}`;
    const isActiveTarget = DA_STATE.activeCommentTarget && DA_STATE.activeCommentTarget.type === 'bracket' && DA_STATE.activeCommentTarget.bracketIdx === i;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const color = DA_CONSTANTS.RELATIONSHIP_COLORS[bracket.type] || DA_CONSTANTS.RELATIONSHIP_COLORS.unspecified;
    group.setAttribute('style', `--bracket-color: ${color};`);
    group.setAttribute('class', `bracket-group ${bracket.type} ${bracket.isCollapsed ? 'is-collapsed' : ''} ${isCollapsedCoord ? 'is-collapsed-coord' : ''} ${isBracketSelected ? 'is-selected' : ''} ${isActiveTarget ? 'is-active-target' : ''}`);
    group.dataset.index = i;
    svg.appendChild(group);

    const labels = getBracketLabels(bracket.type, bracket.labelsSwapped, bracket.dominanceFlipped);

    // Background highlight path for comments
    if (DA_STATE.showCommentsEnabled) {
      const bComments = DA_STATE.comments.filter(c => c.type === 'bracket' && c.target && c.target.bracketIdx === i);
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

    // Hitbox
    group.appendChild(createSVG('line', {
      x1: x, y1: topY,
      x2: x, y2: ((bracket.isCollapsed && !isCollapsedCoord) ? topY : bottomY),
      class: 'bracket-hitbox',
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
        'font-size': '50px',
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
      r: 5,
      class: `${(DA_STATE.bracketSelectStep === 1 && DA_STATE.firstBracketPoint === `b${i}`) ? 'connection-node active-node' : 'connection-node'} ${bracket.isCollapsed ? 'collapsed' : ''}`,
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
      group.appendChild(createLabelText(labels.top, {
        x: x + _labelDX,
        y: topY - 5,
        'text-anchor': _labelAnchor,
        class: 'bracket-label',
        dataset: { index: i, pos: 'top' }
      }));

      group.appendChild(createLabelText(labels.bottom, {
        x: x + _labelDX,
        y: bottomY - 5,
        'text-anchor': _labelAnchor,
        class: 'bracket-label',
        dataset: { index: i, pos: 'bottom' }
      }));
    }
  });
}

function getExtent(id, _seen) {
  if (typeof id === 'number') return { from: id, to: id };
  if (id === null || id === undefined) return { from: 0, to: 0 };
  if (id.startsWith('p')) {
    const idx = parseInt(id.slice(1), 10);
    return { from: idx, to: idx };
  }
  if (id.startsWith('b')) {
    if (!_seen) _seen = new Set();
    if (_seen.has(id)) return { from: 0, to: 0 };
    _seen.add(id);
    const bIdx = parseInt(id.slice(1), 10);
    const b = DA_STATE.brackets[bIdx];
    if (!b) return { from: 0, to: 0 };
    const eFrom = getExtent(b.from, _seen);
    const eTo = getExtent(b.to, _seen);
    return { from: Math.min(eFrom.from, eTo.from), to: Math.max(eFrom.to, eTo.to) };
  }
  return { from: 0, to: 0 };
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
  if (typeof id === 'number' || id.startsWith('p')) {
    const idx = typeof id === 'number' ? id : parseInt(id.slice(1), 10);
    return { from: idx, to: idx };
  }
  const bIdx = parseInt(id.slice(1), 10);
  if (!_seen) _seen = new Set();
  if (_seen.has(bIdx)) return { from: 0, to: 0 };
  _seen.add(bIdx);
  const b = DA_STATE.brackets[bIdx];
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
    return getBracketExtent(bIdx);
  }
}

function getConnectionPoints(fromId, toId, dotPositions, excludeBracketIdx = -1, _seen) {
  // Guard against cyclic bracket references (a bracket reachable from itself via
  // from/to). getExtent/getRepresentativeRange already carry such guards; without
  // one here a cycle recurses forever and the whole diagram dies on render.
  if (!_seen) _seen = new Set();

  const extentFrom = getExtent(fromId);
  const extentTo = getExtent(toId);
  const totalFrom = Math.min(extentFrom.from, extentTo.from);
  const totalTo = Math.max(extentFrom.to, extentTo.to);

  // Helper to get Y coordinate for a point
  const getY = (id, bracketIdx) => {
    if (typeof id === 'number' || id.startsWith('p')) {
      const idx = typeof id === 'number' ? id : parseInt(id.slice(1), 10);
      return dotPositions[idx]?.midY || 0;
    }
    if (id.startsWith('b')) {
      const bIdx = parseInt(id.slice(1), 10);
      if (_seen.has(bIdx)) return 0; // cycle — bail
      _seen.add(bIdx);
      const b = DA_STATE.brackets[bIdx];
      if (!b) return 0; // SAFETY
      const points = getConnectionPoints(b.from, b.to, dotPositions, bIdx, _seen);
      
      // NEW: Check for stars to determine connection point
      const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
      if (labels.single) return (points.topY + points.bottomY) / 2;
      
      if (labels.top && labels.top.includes('*')) {
        return points.topY;
      }
      if (labels.bottom && labels.bottom.includes('*')) {
        return points.bottomY;
      }
      
      return (points.topY + points.bottomY) / 2;
    }
    return 0;
  };

  // Helper to get X coordinate for a point
  const getX = (id) => {
    if (typeof id === 'number' || id.startsWith('p')) {
      const idx = typeof id === 'number' ? id : parseInt(id.slice(1), 10);
      return dotPositions[idx]?.left || 0;
    }
    if (id.startsWith('b')) {
      const bIdx = parseInt(id.slice(1), 10);
      // Point at the connection-node, mirrored to the right gutter in RTL (the
      // node offset flips sign just like in renderBrackets: -15 LTR, +15 RTL).
      return _mirrorGutterX(getBracketX(bIdx)) + (DA_STATE.isRTL ? 15 : -15);
    }
    return 0;
  };

  return {
    topY: getY(fromId, excludeBracketIdx),
    topLeft: getX(fromId),
    bottomY: getY(toId, excludeBracketIdx),
    bottomLeft: getX(toId)
  };
}

function getBracketLabels(type, labelsSwapped = false, dominanceFlipped = false) {
  const typeKey = type.toLowerCase();
  let labelStr = DA_CONSTANTS.BRACKET_LABELS[typeKey];
  
  // Check for custom label in project state or saved bank
  if (!labelStr && typeKey.startsWith('cl_')) {
    const custom = DA_STATE.customLabels.find(cl => cl.id === typeKey) || 
                   DA_STATE.savedCustomLabels.find(cl => cl.id === typeKey);
    if (custom) labelStr = custom.label;
  }
  
  if (!labelStr) labelStr = type.slice(0, 2);
  
  if (DA_UI.isGurtnerMode() && DA_CONSTANTS.GURTNER_LABELS[typeKey]) labelStr = DA_CONSTANTS.GURTNER_LABELS[typeKey];
  
  if (DA_CONSTANTS.SINGLE_LABEL_TYPES.has(typeKey)) {
    return { single: labelStr, summary: labelStr };
  }

  let top = '', bottom = '';
  
  // Robust parsing for labels like "*/Id/Exp" or "C/E/*"
  const parts = labelStr.split('/');
  if (parts.length === 3) {
    // Format: Ornament/TopLabel/BottomLabel
    if (parts[0] === '*') {
      top = parts[1] + '*';
      bottom = parts[2];
    } else if (parts[2] === '*') {
      top = parts[0];
      bottom = parts[1] + '*';
    } else {
      top = parts[0]; bottom = parts[1]; // fallback
    }
  } else if (parts.length === 2) {
    top = parts[0] || '';
    bottom = parts[1] || '';
    // If it's a 2-part label but no side has a star yet, add one to the bottom
    if (!top.includes('*') && !bottom.includes('*')) {
      bottom += '*';
    }
  } else {
    top = labelStr;
    bottom = '*'; // Default star on bottom if no slash
  }

  if (labelsSwapped) {
    [top, bottom] = [bottom, top];
  }

  if (dominanceFlipped) {
    // Correctly move the star from one side to the other
    const hasStarTop = top.includes('*');
    const hasStarBottom = bottom.includes('*');

    if (hasStarTop && !hasStarBottom) {
      top = top.replace('*', '');
      bottom += '*';
    } else if (hasStarBottom && !hasStarTop) {
      bottom = bottom.replace('*', '');
      top += '*';
    } else if (!hasStarTop && !hasStarBottom) {
      top += '*';
    }
  }

  // Create a clean summary using the canonical order (ignoring swaps for the name)
  const canonical = DA_CONSTANTS.RELATIONSHIP_LABELS[typeKey] || type;
  // If it's a known short-code pair, use it, otherwise use a shortened version of the label name
  const summary = canonical.includes('-') 
    ? canonical.split('-').map(s => s.trim().substring(0,3)).join('/') 
    : (canonical.length > 6 ? canonical.substring(0, 4) : canonical);

  return { top: top.trim(), bottom: bottom.trim(), summary };
}

function renderWordArrows() {
  const svg = document.getElementById('wordArrowsSvg');
  if (!svg) return;
  svg.innerHTML = '';
  // Word arrows are not supported in right-to-left mode (their collision-aware
  // routing assumes LTR glyph positions), so skip rendering them entirely.
  if (DA_STATE.isRTL) return;
  const wrapper = document.getElementById('propositions');
  if (!wrapper) return;
  const wrapperRect = wrapper.getBoundingClientRect();

  const _hL = 8, _hW = 4;
  const makeHead = (x, y, dir) => {
    if (dir === 'up') return `${x},${y} ${x - _hW},${y + _hL} ${x + _hW},${y + _hL}`;
    if (dir === 'down') return `${x},${y} ${x - _hW},${y - _hL} ${x + _hW},${y - _hL}`;
    if (dir === 'left') return `${x},${y} ${x + _hL},${y - _hW} ${x + _hL},${y + _hW}`;
    return `${x},${y} ${x - _hL},${y - _hW} ${x - _hL},${y + _hW}`; // right
  };

  // Returns true if a wrapper-relative point sits on a visible glyph. Used so we
  // only reroute a horizontal leg into the gutter when it would actually cross
  // text — legs that run through empty space (e.g. an indented sub-line's left
  // margin) keep the original routing.
  const pointOnGlyph = (xWrap, yWrap) => {
    if (!document.caretRangeFromPoint) return false;
    const xc = xWrap + wrapperRect.left, yc = yWrap + wrapperRect.top;
    const r = document.caretRangeFromPoint(xc, yc);
    if (!r || !r.startContainer || r.startContainer.nodeType !== 3) return false;
    const s = r.startContainer.textContent || '';
    for (let k = 0; k < 2; k++) {
      const a = k === 0 ? r.startOffset : r.startOffset - 1, b = a + 1;
      if (a < 0 || b > s.length || !/\S/.test(s[a])) continue;
      const cr = document.createRange(); cr.setStart(r.startContainer, a); cr.setEnd(r.startContainer, b);
      const rect = cr.getBoundingClientRect();
      if (xc >= rect.left && xc <= rect.right && yc >= rect.top && yc <= rect.bottom) return true;
    }
    return false;
  };
  const legHitsText = (yWrap, xa, xb) => {
    const lo = Math.min(xa, xb) + 2, hi = Math.max(xa, xb) - 2;
    for (let x = lo; x <= hi; x += 8) if (pointOnGlyph(x, yWrap)) return true;
    return false;
  };

  // Measure an anchor by its non-whitespace text, not the full span box. While
  // editing in Text Edit mode, inserted indentation (e.g. tabbed spaces) lands
  // INSIDE the anchor span, so its bounding box would left-extend and drag the
  // arrow off the word; a trimmed range keeps the arrow on the actual word.
  const anchorRect = (el) => {
    const tn = el.firstChild;
    if (tn && tn.nodeType === 3 && el.childNodes.length === 1) {
      const t = tn.textContent;
      const start = t.length - t.replace(/^\s+/, '').length;
      const end = t.replace(/\s+$/, '').length;
      if (end > start && (start > 0 || end < t.length)) {
        const rng = document.createRange();
        rng.setStart(tn, start); rng.setEnd(tn, end);
        const r = rng.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) return r;
      }
    }
    return el.getBoundingClientRect();
  };

  DA_STATE.wordArrows.forEach((wa, idx) => {
    const fromEl = wrapper.querySelector(`.arrow-anchor[data-arrow-id="arrow-${idx}-from"]`);
    const toEl = wrapper.querySelector(`.arrow-anchor[data-arrow-id="arrow-${idx}-to"]`);
    if (!fromEl || !toEl) return;

    const fromR = anchorRect(fromEl);
    const toR = anchorRect(toEl);

    // word boundaries relative to wrapper
    const fL = fromR.left - wrapperRect.left;
    const fR = fromR.right - wrapperRect.left;
    const fM = fromR.top + fromR.height / 2 - wrapperRect.top;

    const tL = toR.left - wrapperRect.left;
    const tR = toR.right - wrapperRect.left;
    const tM = toR.top + toR.height / 2 - wrapperRect.top;
    const tT = toR.top - wrapperRect.top;
    const tB = toR.bottom - wrapperRect.top;
    const tC = toR.left + toR.width / 2 - wrapperRect.left;

    const fC = fromR.left + fromR.width / 2 - wrapperRect.left;
    const fT = fromR.top - wrapperRect.top;
    const fB = fromR.bottom - wrapperRect.top;

    const tBeg = tL + 5; // Beginning of word (first letter area)
    const fBeg = fL + 5;

    let x1, y1, x2, y2, isLastHorizontal;

    if (tM < fM - 10) {
      // UPWARDS: Horizontal then Vertical (Arrival at bottom edge)
      x1 = (tBeg < fL) ? fL : (tBeg > fR ? fR : fBeg);
      y1 = fM;
      x2 = tBeg;
      y2 = tB + 2;
      isLastHorizontal = false;
    } else if (tM > fM + 10) {
      // DOWNWARDS: Vertical then Horizontal (Arrival at side)
      x1 = fBeg;
      y1 = fB;
      y2 = tM;
      x2 = (fBeg > tC) ? tR + 2 : tL - 2;
      isLastHorizontal = true;
    } else {
      // SAME LINE: Horizontal only
      x1 = (tBeg < fBeg) ? fL : fR;
      y1 = fM;
      x2 = (tBeg < fBeg) ? tR + 2 : tL - 2;
      y2 = fM;
      isLastHorizontal = true;
    }

    // Collision-aware routing: keep the original geometry, but if the horizontal
    // leg would cross a word, lift it into the inter-line gap (and drop straight
    // down/up onto the target's center) instead of striking through text.
    const isUp = tM < fM - 10, isDown = tM > fM + 10;
    const legY = isDown ? y2 : y1; // the horizontal leg's y in the base routing
    const wordH = Math.max(fromR.height, toR.height);
    const gutter = Math.min(12, Math.max(5, wordH * 0.4));

    // Sink the arrowhead a few px into the target word so it clearly points at the
    // word rather than sitting in the gap beneath it.
    const tIn = Math.min(6, toR.height * 0.3);

    let d, points;
    if (legHitsText(legY, x1, x2)) {
      if (isUp) {
        // Route the horizontal in the gap above the source line. If a fixed gutter
        // would overshoot past the target line (e.g. the target is the wrapped line
        // directly above, only a couple px away), use the midpoint of the actual
        // gap so the leg sits between the lines instead of striking the one above.
        const gy = (fT - gutter < tB) ? (tB + fT) / 2 : (fT - gutter);
        const tipY = tB - tIn;
        d = `M ${fC} ${fT} V ${gy} H ${tC} V ${tipY}`;
        points = makeHead(tC, tipY, 'up');
      } else if (isDown) {
        const gy = (tT - gutter < fB) ? (fB + tT) / 2 : (tT - gutter);
        const tipY = tT + tIn;
        d = `M ${fC} ${fB} V ${gy} H ${tC} V ${tipY}`;
        points = makeHead(tC, tipY, 'down');
      } else {
        const gy = fB + gutter; // dip into the gap below this line
        const tipY = tB - tIn;
        d = `M ${fC} ${fB} V ${gy} H ${tC} V ${tipY}`;
        points = makeHead(tC, tipY, 'up');
      }
    } else {
      // No collision — original routing.
      const sOff = 4;
      let finalX1 = x1, finalY1 = y1;
      if (isUp) { if (x1 === fL) finalX1 -= sOff; else if (x1 === fR) finalX1 += sOff; }
      else if (isDown) { finalY1 += sOff; }
      else { if (x1 === fL) finalX1 -= sOff; else if (x1 === fR) finalX1 += sOff; }

      let finalX2 = x2, finalY2 = y2;
      const offset = 1.5;
      if (isLastHorizontal) { if (x2 < x1) finalX2 += offset; else finalX2 -= offset; }
      else { if (y2 < y1) finalY2 += offset; else finalY2 -= offset; }

      d = (isLastHorizontal && y1 !== y2)
        ? `M ${finalX1} ${finalY1} V ${y2} H ${finalX2}`
        : `M ${finalX1} ${finalY1} H ${x2} V ${finalY2}`;

      if (isLastHorizontal) {
        points = (x2 < x1) ? makeHead(x2, y2, 'left') : makeHead(x2, y2, 'right');
      } else {
        points = (y2 < y1) ? makeHead(x2, y2, 'up') : makeHead(x2, y2, 'down');
      }
    }

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'word-arrow-group');
    g.dataset.index = idx;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'word-arrow-path');
    path.style.strokeLinecap = 'butt'; // Cleaner tip
    g.appendChild(path);
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    head.setAttribute('points', points);
    head.setAttribute('fill', 'var(--text)');
    head.setAttribute('class', 'word-arrow-head');
    g.appendChild(head);

    svg.appendChild(g);
  });
}

function renderCommentPreviews() {
  const sidebar = document.getElementById('commentsPreview');
  const list = document.getElementById('commentsPreviewList');
  if (!sidebar || !list) return;

  if (!DA_STATE.showCommentsEnabled) {
    sidebar.style.display = 'none';
    return;
  }
  sidebar.style.display = 'flex';
  
  const existingCards = Array.from(list.children);
  const targetCount = DA_STATE.comments.length;

  // Remove excess cards
  while (existingCards.length > targetCount) {
    existingCards.pop().remove();
  }

  DA_STATE.comments.forEach((comment, i) => {
    let card = existingCards[i];
    if (!card) {
      card = document.createElement('div');
      card.className = 'comments-preview-card';
      list.appendChild(card);
    }
    card.dataset.commentId = comment.id;
    
    const chapterMatch = (DA_STATE.passageRef || '').match(/(\d+):/);
    const chapter = chapterMatch ? chapterMatch[1] : '';

    let targetDesc = '';
    if (comment.type === 'text') {
      const propIdx = comment.target.propIndex;
      const verse = computeVerseDisplay(propIdx) || '?';
      const fullRef = chapter ? `${chapter}:${verse}` : verse;
      const text = DA_STATE.propositions[propIdx] || '';
      const snippet = text.substring(comment.target.start, comment.target.end);
      targetDesc = `${fullRef}: "${snippet}"`;
    } else {
      const bIdx = comment.target.bracketIdx;
      const b = DA_STATE.brackets[bIdx];
      const extent = getBracketExtent(bIdx);
      const v1 = computeVerseDisplay(extent.from) || '?';
      const v2 = computeVerseDisplay(extent.to) || '?';
      const vsRange = v1 === v2 ? v1 : `${v1}-${v2}`;
      const fullRef = chapter ? `${chapter}:${vsRange}` : vsRange;
      targetDesc = `Bracket (${fullRef}): ${b ? DA_UI.formatBracketType(b.type) : 'Unknown'}`;
    }

    const newHtml = `
      <div class="comment-card-header">
        <span class="comment-target">${DA_UI.escapeHtml(targetDesc)}</span>
      </div>
      <div class="comment-author">${DA_UI.escapeHtml(comment.author)}</div>
      <div class="comment-text">${DA_UI.renderCommentText(comment.text)}</div>
      <div class="comment-replies">
        ${(comment.replies || []).map(r => `
          <div class="reply">
            <span class="reply-author">${DA_UI.escapeHtml(r.author)}:</span>
            <span class="reply-text">${DA_UI.renderCommentText(r.text)}</span>
          </div>
        `).join('')}
      </div>
      <div class="reply-input-row">
        <input type="text" placeholder="Reply..." class="reply-input" data-id="${comment.id}">
        <button class="send-reply-btn" data-id="${comment.id}" title="Send reply">→</button>
      </div>
    `;
    
    if (card._lastHtml !== newHtml) {
      card.innerHTML = newHtml;
      card._lastHtml = newHtml;
    }
  });

  // Card hover → corresponding highlight glow (set up once on the list container)
  if (!list._commentCardHoverListenersAttached) {
    list._commentCardHoverListenersAttached = true;
    let _hoveredCardId = null;

    const _clearHighlightHover = () => {
      document.querySelectorAll('mark.comment-highlight.comment-highlight-card-hover')
        .forEach(el => el.classList.remove('comment-highlight-card-hover'));
      document.querySelectorAll('.bracket-group.comment-card-hover')
        .forEach(el => el.classList.remove('comment-card-hover'));
    };

    list.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.comments-preview-card');
      const newId = card?.dataset.commentId ?? null;
      if (newId === _hoveredCardId) return;
      _hoveredCardId = newId;
      _clearHighlightHover();
      if (!newId) return;
      const comment = DA_STATE.comments.find(c => c.id === newId);
      if (!comment) return;
      if (comment.type === 'text') {
        document.querySelectorAll(`mark.comment-highlight[data-comment-id="${newId}"]`)
          .forEach(el => el.classList.add('comment-highlight-card-hover'));
      } else {
        const bracketIdx = comment.target?.bracketIdx;
        if (bracketIdx !== undefined) {
          const group = document.querySelector(`.bracket-group[data-index="${bracketIdx}"]`);
          if (group) group.classList.add('comment-card-hover');
        }
      }
    });

    list.addEventListener('mouseleave', () => {
      _hoveredCardId = null;
      _clearHighlightHover();
    });
  }
}

function getPointExtent(id) {
  return getExtent(id);
}

window.DA_RENDERER = {
    renderAll, renderPropositions, renderBrackets, renderWordArrows, renderCommentPreviews,
    computeSlotAssignments, getBracketX, getConnectionPoints, getBracketLabels,
    getPointExtent, getBracketExtent, getRepresentativeRange, updateBracketPositions,
    scheduleVisualUpdate, computeVerseDisplay, clampToWordAnchor,
    getBracketSlots: () => ({ ..._slotForIdx })
};
