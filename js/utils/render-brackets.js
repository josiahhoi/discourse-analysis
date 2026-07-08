/**
 * render-brackets — the SVG bracket diagram, slot/gutter/connection-point
 * geometry, and SVG element helpers (renderBrackets). Owns the per-pass render
 * state (_slotForIdx/_maxSlot, _bracketCanvasW, _connCache), so everything
 * that reads it lives here too.
 *
 * Extracted from rendering-engine.js. This is a classic (non-module) script:
 * its top-level functions stay in the global scope like the rest of the app, and
 * it contributes its public function(s) to the shared window.DA_RENDERER
 * namespace. Loaded after rendering-engine.js in index.html.
 */

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

window.DA_RENDERER = Object.assign(window.DA_RENDERER || {}, {
    renderBrackets, computeSlotAssignments, getBracketX, getConnectionPoints,
    getBracketSlots: () => ({ ..._slotForIdx })
});
