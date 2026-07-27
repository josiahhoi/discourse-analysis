/**
 * render-model — pure extent/collapse/verse math (getExtent, getBracketExtent,
 * getRepresentativeRange, getCollapseInfo, verse suffix/display, parallel-verse
 * distribution). No DOM access and no module render state — the unit-testable
 * layout core shared by the proposition renderer, the bracket renderer, and
 * the block diagram.
 *
 * Extracted from rendering-engine.js. This is a classic (non-module) script:
 * its top-level functions stay in the global scope like the rest of the app, and
 * it contributes its public function(s) to the shared window.DA_RENDERER
 * namespace. Loaded after rendering-engine.js in index.html.
 */

// Relationship types that may be created by "jumping over" intermediate
// propositions (flat multi-member units whose interior dots/nodes are hidden).
// Read from the single canonical list in constants.js at use time — a
// module-load snapshot here once drifted from the picker's copy.
function _isJumpOverType(t) {
  return DA_CONSTANTS.JUMP_OVER_TYPES.includes(t);
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

/**
 * The rows that stay visible when the structure under `id` is reduced to its
 * dominant spine — the recursive core of collapse. A subordinate bracket with
 * exactly one starred arm reduces to its dominant side only; a coordinate
 * bracket (type-set membership — checked FIRST, because e.g. progression is
 * a coordinate type whose label carries a star) or a star-symmetric label
 * keeps BOTH sides, each reduced to its own spine. The result is a Set, not
 * a range: coordinate members' spines can be non-contiguous (e.g. an
 * alternative of two starred sub-brackets keeps two separated rows).
 */
function getSpineRows(id, _seen) {
  const rows = new Set();
  if (id === null || id === undefined) return rows;
  if (typeof id === 'number' || DA_STATE.isPropRef(id)) {
    rows.add(typeof id === 'number' ? id : parseInt(id.slice(1), 10));
    return rows;
  }
  if (!_seen) _seen = new Set();
  if (_seen.has(id)) return rows; // cycle — contribute nothing
  _seen.add(id);
  const b = DA_STATE.bracketById(id);
  if (!b) return rows;
  const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
  const starTop = !!((labels.top && labels.top.includes('*')) || labels.single === '*');
  const starBottom = !!(labels.bottom && labels.bottom.includes('*'));
  const isCoordinate = _coordinateTypeSet().has(String(b.type).toLowerCase());
  if (!isCoordinate && starTop !== starBottom) {
    return getSpineRows(starTop ? b.from : b.to, _seen);
  }
  getSpineRows(b.from, _seen).forEach((r) => rows.add(r));
  getSpineRows(b.to, _seen).forEach((r) => rows.add(r));
  return rows;
}

// Range convenience over getSpineRows, used where a single anchor row is
// needed (arm snapping lands on `.from`). Unlike the old version, a
// coordinate/starless sub-bracket yields its spine's bounds rather than its
// full extent — so the anchor row is always one that survives reduction.
function getRepresentativeRange(id) {
  const s = getSpineRows(id);
  if (s.size === 0) return { from: 0, to: 0 };
  let from = Infinity, to = -Infinity;
  s.forEach((r) => { if (r < from) from = r; if (r > to) to = r; });
  return { from, to };
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
 * side's spine (isCoordinateShape false, dominantId set). Everything else —
 * coordinate types, no-star labels (e.g. dominance display off), double-star
 * labels — keeps both sides, each reduced to its own spine
 * (isCoordinateShape true).
 */
function getCollapseInfo(bracketIdx) {
  const b = DA_STATE.brackets[bracketIdx];
  if (!b) return { hiddenRows: [], isCoordinateShape: true, dominantId: null };
  const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
  const starTop = !!((labels.top && labels.top.includes('*')) || labels.single === '*');
  const starBottom = !!(labels.bottom && labels.bottom.includes('*'));
  const isCoordinate = _coordinateTypeSet().has(b.type.toLowerCase());
  const fullRange = getBracketExtent(bracketIdx);
  const isSubordinate = !isCoordinate && starTop !== starBottom;
  const dominantId = isSubordinate ? (starTop ? b.from : b.to) : null;
  // Keep-set is the recursive spine (a Set, since spines can be
  // non-contiguous), not a contiguous range: a nested coordinate structure
  // reduces each member to ITS spine instead of exposing its full extent.
  const keep = isSubordinate ? getSpineRows(dominantId) : getSpineRows(b.from);
  if (!isSubordinate) getSpineRows(b.to).forEach((r) => keep.add(r));
  const hiddenRows = [];
  for (let k = fullRange.from; k <= fullRange.to; k++) {
    if (!keep.has(k)) hiddenRows.push(k);
  }
  return { hiddenRows, isCoordinateShape: !isSubordinate, dominantId };
}

/**
 * Union of every collapsed bracket's hidden rows, with per-row ownership.
 * The ONE computation both renderers consume: the row hider uses hiddenRows
 * (and hiddenBy for fold-gap expansion); the bracket drawer uses hiddenBy to
 * decide which brackets are folded away — rows a collapsed bracket hides
 * itself must never suppress its own summary drawing, which requires knowing
 * WHO hid each row, not just that it's hidden.
 */
function computeCollapsedRows() {
  const hiddenRows = new Set();
  const hiddenBy = new Map(); // rowIdx -> [bracketIdx, ...]
  DA_STATE.brackets.forEach((b, idx) => {
    if (!b.isCollapsed) return;
    getCollapseInfo(idx).hiddenRows.forEach((k) => {
      hiddenRows.add(k);
      const owners = hiddenBy.get(k) || [];
      owners.push(idx);
      hiddenBy.set(k, owners);
    });
  });
  return { hiddenRows, hiddenBy };
}

function getPointExtent(id) {
  return getExtent(id);
}

window.DA_RENDERER = Object.assign(window.DA_RENDERER || {}, {
    getPointExtent, getBracketExtent, getRepresentativeRange, getCollapseInfo,
    getSpineRows, computeCollapsedRows,
    computeVerseDisplay, distributeVersesToRows, versesInRef
});
