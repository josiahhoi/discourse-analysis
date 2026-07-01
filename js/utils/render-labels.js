/**
 * render-labels — bracket label / dominance string engine (getBracketLabels).
 *
 * Extracted from rendering-engine.js. This is a classic (non-module) script:
 * its top-level functions stay in the global scope like the rest of the app, and
 * it contributes its public function(s) to the shared window.DA_RENDERER
 * namespace. Loaded after rendering-engine.js in index.html.
 */

// Sentinel that stands in for the literal "//" comparison glyph while we split
// the label on "/" — so the double-slash is never mistaken for two separators.
const _GLYPH_DBLSLASH = '';

function _twoArmSummary(typeKey, type) {
  const canonical = window.DA_PROFILES ? DA_PROFILES.getName(typeKey)
    : (DA_CONSTANTS.RELATIONSHIP_LABELS[typeKey] || type);
  return canonical.includes('-')
    ? canonical.split('-').map((s) => s.trim().substring(0, 3)).join('/')
    : (canonical.length > 6 ? canonical.substring(0, 4) : canonical);
}

function getBracketLabels(type, labelsSwapped = false, dominanceFlipped = false) {
  const typeKey = type.toLowerCase();
  // The active notation profile resolves the label (with any rename/alias/custom
  // cl_ override) and whether dominance is marked. Falls back to defaults when
  // the profile module isn't present (e.g. isolated tests).
  const labelStr = window.DA_PROFILES
    ? DA_PROFILES.getAbbr(typeKey)
    : (DA_CONSTANTS.BRACKET_LABELS[typeKey] || type.slice(0, 2));
  const showDominance = window.DA_PROFILES ? DA_PROFILES.isDominanceShown(typeKey) : true;

  // Structure is read straight from the string — no per-type tables, no auto
  // stars. "/" splits the two arms, "*" marks dominance, and "//" is a literal
  // comparison glyph (protected from the split, then restored).
  const restore = (s) => s.split(_GLYPH_DBLSLASH).join('//').trim();
  const parts = labelStr.replace(/\/\//g, _GLYPH_DBLSLASH).split('/').map(restore);

  // Single arm (no separator): one centered label, no dominance star.
  if (parts.length === 1) {
    const single = parts[0];
    return { single, summary: single };
  }

  let top, bottom;
  if (parts.length === 2) {
    top = parts[0];
    bottom = parts[1];
  } else {
    // 3-part ornament form "*/Top/Bot" or "Top/Bot/*" (legacy/built-in labels).
    if (parts[0] === '*') { top = parts[1] + '*'; bottom = parts[2]; }
    else if (parts[2] === '*') { top = parts[0]; bottom = parts[1] + '*'; }
    else { top = parts[0]; bottom = parts[1]; }
  }

  if (labelsSwapped) { const t = top; top = bottom; bottom = t; }

  if (dominanceFlipped && showDominance) {
    const st = top.includes('*');
    const sb = bottom.includes('*');
    if (st && !sb) { top = top.replace('*', ''); bottom += '*'; }
    else if (sb && !st) { bottom = bottom.replace('*', ''); top += '*'; }
    else if (!st && !sb) { top += '*'; }
  }

  // Dominance off for this relationship: drop the star from both arms. Every
  // downstream consumer (the star renderer, getConnectionPoints, the block
  // diagram) keys off whether the label contains "*", so removing it here also
  // routes parent→child joins to the vertical middle — the "no dominance" look.
  if (!showDominance) {
    top = top.replace(/\*/g, '');
    bottom = bottom.replace(/\*/g, '');
  }

  return { top: top.trim(), bottom: bottom.trim(), summary: _twoArmSummary(typeKey, type) };
}

window.DA_RENDERER = Object.assign(window.DA_RENDERER || {}, { getBracketLabels });
