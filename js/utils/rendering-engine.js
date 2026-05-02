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
  container.style.paddingLeft = `${dynamicPaddingLeft + 20}px`;

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
  DA_STATE.brackets.forEach((b, idx) => {
    if (b.isCollapsed) {
      const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
      const rangeFrom = getExtent(b.from);
      const rangeTo = getExtent(b.to);
      const fullRange = getBracketExtent(idx);
      
      const hasStarTop = (labels.top && labels.top.includes('*')) || labels.single === '*';
      const hasStarBottom = (labels.bottom && labels.bottom.includes('*'));

      if (hasStarTop && !hasStarBottom) {
        // Show Dominant TOP (from), hide the rest
        for (let k = fullRange.from; k <= fullRange.to; k++) {
          if (k < rangeFrom.from || k > rangeFrom.to) hiddenIndices.add(k);
        }
      } else if (hasStarBottom && !hasStarTop) {
        // Show Dominant BOTTOM (to), hide the rest
        for (let k = fullRange.from; k <= fullRange.to; k++) {
          if (k < rangeTo.from || k > rangeTo.to) hiddenIndices.add(k);
        }
      } else {
        // Coordinate: Show both ends, hide the "middle" (if any)
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

  // Update existing or create new blocks
  DA_STATE.propositions.forEach((text, i) => {
    let block = existingBlocks[i];
    if (!block) {
      block = createPropositionBlock(text, i);
      container.appendChild(block);
    }
    
    // Toggle visibility based on folding
    block.classList.toggle('folded-hidden', hiddenIndices.has(i));
    updatePropositionBlock(block, text, i);
  });

  isRenderingPropositions = false;
}

function attachPropositionDelegatedListeners(container) {
  container.addEventListener('focusin', (e) => {
    const block = e.target.closest('.proposition-block');
    if (!block) return;
    const i = parseInt(block.dataset.index, 10);
    block._textBeforeEdit = DA_STATE.propositions[i];
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

    let extractedText = '';
    let newFormatTags = [];
    const textSpanEl = block.querySelector('.proposition-text');

    if (textSpanEl) {
      function traverse(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          extractedText += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BR') extractedText += '\n';
          else if (node.tagName === 'DIV' && extractedText.length > 0 && !extractedText.endsWith('\n')) extractedText += '\n';
          let start = extractedText.length;
          node.childNodes.forEach(traverse);
          let end = extractedText.length;
          if (start < end) {
            let type = null;
            if (node.tagName === 'B' || node.tagName === 'STRONG') type = 'bold';
            else if (node.tagName === 'U') type = 'underline';
            if (type) newFormatTags.push({ type, propIndex: i, start, end });
          }
        }
      }
      textSpanEl.childNodes.forEach(traverse);
    }

    let currentText = extractedText;
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

    if (block._textBeforeEdit !== undefined && block._textBeforeEdit !== null && currentText !== block._textBeforeEdit) {
      DA_STATE.pushUndo('text edit');
    }
    DA_STATE.propositions[i] = currentText;
    DA_STATE.formatTags = DA_STATE.formatTags.filter(f => f.propIndex !== i).concat(newFormatTags);
  });
}

function createPropositionBlock(text, i) {
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

  updatePropositionBlock(block, text, i);
  return block;
}

function updatePropositionBlock(block, text, i) {
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

  // Update verse ref
  const refSpan = block.querySelector('.verse-ref');
  if (refSpan) {
    const vd = computeVerseDisplay(i);
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
    if (wa.fromProp === i) textArrows.push({ start: wa.fromStart, end: wa.fromEnd, type: 'arrow-anchor', id: `arrow-${idx}-from` });
    if (wa.toProp === i) textArrows.push({ start: wa.toStart, end: wa.toEnd, type: 'arrow-anchor', id: `arrow-${idx}-to` });
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
  
  computeSlotAssignments();
  
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
    const x = getBracketX(i);

    if (bracket.isCollapsed) {
      // For subordinate relationships, snap everything to the starred (visible) proposition
      const labels = getBracketLabels(bracket.type, bracket.labelsSwapped, bracket.dominanceFlipped);
      const isTopStar = labels.top.includes('*');
      const isBottomStar = labels.bottom.includes('*');

      if (isTopStar && !isBottomStar) {
        bottomY = topY;
        bottomLeft = topLeft;
      } else if (isBottomStar && !isTopStar) {
        topY = bottomY;
        topLeft = bottomLeft;
      } else {
        // Fallback for coordinate or no star: just use the mid-point or top
        bottomY = topY;
        bottomLeft = topLeft;
      }
      
      // If the resulting coordinate is 0 (source is hidden), find the nearest visible extent
      if (topY === 0 || bottomY === 0) {
        const extent = getBracketExtent(i);
        // Find any proposition in this range that isn't hidden
        for (let j = extent.from; j <= extent.to; j++) {
            const pos = dotPositions[j];
            if (pos && pos.top > 0) {
                topY = bottomY = pos.top + (pos.height / 2);
                topLeft = bottomLeft = pos.left;
                break;
            }
        }
      }
    }
    
    // Create Group for Hovering and Selection
    const isBracketSelected = DA_STATE.firstBracketPoint === `b${i}`;
    const isActiveTarget = DA_STATE.activeCommentTarget && DA_STATE.activeCommentTarget.type === 'bracket' && DA_STATE.activeCommentTarget.bracketIdx === i;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', `bracket-group ${bracket.type} ${bracket.isCollapsed ? 'is-collapsed' : ''} ${isBracketSelected ? 'is-selected' : ''} ${isActiveTarget ? 'is-active-target' : ''}`);
    group.dataset.index = i;
    svg.appendChild(group);

    const labels = getBracketLabels(bracket.type, bracket.labelsSwapped, bracket.dominanceFlipped);
    
    // Background highlight path for comments
    if (DA_STATE.showCommentsEnabled) {
      const bComments = DA_STATE.comments.filter(c => c.type === 'bracket' && c.target && c.target.bracketIdx === i);
      if (bComments.length > 0) {
          group.classList.add('has-comment');
          // Draw a path that traces the bracket (arms + vertical)
          let d;
          if (bracket.isCollapsed) {
            d = `M ${x} ${topY} V ${topY}`; // vertical point
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

    // Main Vertical Line or Collapsed Indicator
    group.appendChild(createSVG('line', {
      x1: x, y1: topY, 
      x2: x, y2: (bracket.isCollapsed ? topY : bottomY),
      class: 'bracket-line'
    }));

    if (bracket.isCollapsed) {
      // Single L-shaped path to connect node to summary label
      group.appendChild(createSVG('path', {
        d: `M ${x - 15} ${topY} L ${x - 15} ${topY - 14} L ${x + 5} ${topY - 14}`,
        class: 'bracket-line collapsed-indicator',
        fill: 'none'
      }));
    }

    // Hitbox
    group.appendChild(createSVG('line', {
      x1: x, y1: topY, 
      x2: x, y2: (bracket.isCollapsed ? topY : bottomY),
      class: 'bracket-hitbox',
      dataset: { index: i }
    }));
    
    // Top Arm
    if (!bracket.isCollapsed) {
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
    }
    
    // Bottom Arm
    if (!bracket.isCollapsed) {
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
    
    // Connection Node (Recursive Dot)
    let nodeY = (topY + bottomY) / 2;
    if (!labels.single) {
      if (labels.top && labels.top.includes('*')) nodeY = topY;
      else if (labels.bottom && labels.bottom.includes('*')) nodeY = bottomY;
    }
    
    group.appendChild(createSVG('circle', {
      cx: x - 15,
      cy: nodeY,
      r: 5,
      class: `${(DA_STATE.bracketSelectStep === 1 && DA_STATE.firstBracketPoint === `b${i}`) ? 'connection-node active-node' : 'connection-node'} ${bracket.isCollapsed ? 'collapsed' : ''}`,
      dataset: { bracketIdx: i }
    }));
    
    if (bracket.isCollapsed) {
      group.appendChild(createSVG('text', {
        x: x + 8,
        y: topY - 14,
        'dominant-baseline': 'middle',
        class: 'bracket-label collapsed-summary',
        dataset: { index: i }
      })).textContent = `${labels.summary} [...]`;
    } else if (labels.single) {
      group.appendChild(createSVG('text', {
        x: x + 5,
        y: (topY + bottomY) / 2,
        'text-anchor': 'start',
        'dominant-baseline': 'middle',
        class: 'bracket-label single-label',
        dataset: { index: i }
      })).textContent = labels.single;
    } else {
      group.appendChild(createSVG('text', {
        x: x + 5,
        y: topY - 5,
        'text-anchor': 'start',
        class: 'bracket-label',
        dataset: { index: i, pos: 'top' }
      })).textContent = labels.top;
      
      group.appendChild(createSVG('text', {
        x: x + 5,
        y: bottomY - 5,
        'text-anchor': 'start',
        class: 'bracket-label',
        dataset: { index: i, pos: 'bottom' }
      })).textContent = labels.bottom;
    }
  });
}

function getExtent(id) {
  if (typeof id === 'number') return { from: id, to: id };
  if (id === null || id === undefined) return { from: 0, to: 0 };
  if (id.startsWith('p')) {
    const idx = parseInt(id.slice(1), 10);
    return { from: idx, to: idx };
  }
  if (id.startsWith('b')) {
    const bIdx = parseInt(id.slice(1), 10);
    const b = DA_STATE.brackets[bIdx];
    if (!b) return { from: 0, to: 0 }; 
    const eFrom = getExtent(b.from);
    const eTo = getExtent(b.to);
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

function getConnectionPoints(fromId, toId, dotPositions, excludeBracketIdx = -1) {
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
      const b = DA_STATE.brackets[bIdx];
      if (!b) return 0; // SAFETY
      const points = getConnectionPoints(b.from, b.to, dotPositions, bIdx);
      
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
      return getBracketX(bIdx) - 15; // Point at the connection-node
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
  const wrapper = document.getElementById('propositions');
  const wrapperRect = wrapper.getBoundingClientRect();
  
  DA_STATE.wordArrows.forEach((wa, idx) => {
    const fromEl = wrapper.querySelector(`.arrow-anchor[data-arrow-id="arrow-${idx}-from"]`);
    const toEl = wrapper.querySelector(`.arrow-anchor[data-arrow-id="arrow-${idx}-to"]`);
    if (!fromEl || !toEl) return;

    const fromR = fromEl.getBoundingClientRect();
    const toR = toEl.getBoundingClientRect();

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

    // Start Offset: push x1/y1 away from the word edge
    const sOff = 4;
    let finalX1 = x1;
    let finalY1 = y1;

    if (tM < fM - 10) {
      if (x1 === fL) finalX1 -= sOff;
      else if (x1 === fR) finalX1 += sOff;
    } else if (tM > fM + 10) {
      finalY1 += sOff;
    } else {
      if (x1 === fL) finalX1 -= sOff;
      else if (x1 === fR) finalX1 += sOff;
    }

    // Shorten the line slightly so the tip of the arrowhead is clear
    let finalX2 = x2;
    let finalY2 = y2;
    const offset = 1.5;
    if (isLastHorizontal) {
      if (x2 < x1) finalX2 += offset;
      else finalX2 -= offset;
    } else {
      if (y2 < y1) finalY2 += offset;
      else finalY2 -= offset;
    }

    const d = (isLastHorizontal && y1 !== y2)
      ? `M ${finalX1} ${finalY1} V ${y2} H ${finalX2}`
      : `M ${finalX1} ${finalY1} H ${x2} V ${finalY2}`;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'word-arrow-group');
    g.dataset.index = idx;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'word-arrow-path');
    path.style.strokeLinecap = 'butt'; // Cleaner tip
    g.appendChild(path);

    // Manual Arrowhead (Polygon)
    let points = '';
    const hL = 8; // head length
    const hW = 4;  // head half-width
    if (isLastHorizontal) {
      if (x2 < x1) points = `${x2},${y2} ${x2 + hL},${y2 - hW} ${x2 + hL},${y2 + hW}`; // Left
      else points = `${x2},${y2} ${x2 - hL},${y2 - hW} ${x2 - hL},${y2 + hW}`; // Right
    } else {
      if (y2 < y1) points = `${x2},${y2} ${x2 - hW},${y2 + hL} ${x2 + hW},${y2 + hL}`; // Up
      else points = `${x2},${y2} ${x2 - hW},${y2 - hL} ${x2 + hW},${y2 - hL}`; // Down
    }
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    head.setAttribute('points', points);
    head.setAttribute('fill', 'var(--accent)');
    head.setAttribute('class', 'word-arrow-head');
    g.appendChild(head);

    svg.appendChild(g);
  });
}

function renderCommentPreviews() {
  const container = document.getElementById('commentsPreview');
  if (!container) return;
  
  container.innerHTML = '';
  if (!DA_STATE.showCommentsEnabled) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  DA_STATE.comments.forEach(comment => {
    const card = document.createElement('div');
    card.className = 'comments-preview-card';
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
      targetDesc = `Bracket (${fullRef}): ${b ? formatBracketType(b.type) : 'Unknown'}`;
    }

    card.innerHTML = `
      <div class="comment-card-header">
        <span class="comment-target">${DA_UI.escapeHtml(targetDesc)}</span>
      </div>
      <div class="comment-author">${DA_UI.escapeHtml(comment.author)}</div>
      <div class="comment-text">${DA_UI.escapeHtml(comment.text)}</div>
      <div class="comment-replies">
        ${(comment.replies || []).map(r => `
          <div class="reply">
            <span class="reply-author">${DA_UI.escapeHtml(r.author)}:</span> 
            <span class="reply-text">${DA_UI.escapeHtml(r.text)}</span>
          </div>
        `).join('')}
      </div>
      <div class="reply-input-row">
        <input type="text" placeholder="Reply..." class="reply-input" data-id="${comment.id}">
        <button class="send-reply-btn" data-id="${comment.id}" title="Send reply">→</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function getPointExtent(id) {
  if (typeof id === 'number') return { from: id, to: id };
  if (!id) return { from: 0, to: 0 };
  const sId = id.toString();
  if (sId.startsWith('p')) {
      const idx = parseInt(sId.slice(1), 10);
      return { from: idx, to: idx };
  }
  if (sId.startsWith('b')) {
      const bIdx = parseInt(sId.slice(1), 10);
      return getBracketExtent(bIdx);
  }
  return { from: 0, to: 0 };
}

function getPointExtent(id) {
  return getExtent(id);
}

window.DA_RENDERER = {
    renderAll, renderPropositions, renderBrackets, renderWordArrows, renderCommentPreviews,
    computeSlotAssignments, getBracketX, getConnectionPoints, getBracketLabels,
    getPointExtent, getBracketExtent, updateBracketPositions, scheduleVisualUpdate,
    computeVerseDisplay
};
