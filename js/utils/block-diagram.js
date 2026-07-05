/**
 * Block Diagram View
 * ------------------
 * An alternate, read-only visualization of the bracket structure. Instead of
 * drawing brackets, it shows the logical hierarchy through indentation:
 *   - Subordinate statements are indented one level under their dominant
 *     (starred) counterpart.
 *   - Coordinate statements (series, progression, alternative, both-and,
 *     anticipation-fulfillment) share the same indentation level, regardless
 *     of dominance.
 * Each line shows the verse ref, the text, and a label to the right naming the
 * relationship(s) the statement participates in (e.g. "ground to verse 3a",
 * "series with verses 2, 4").
 *
 * This module reads from DA_STATE + DA_RENDERER helpers and never mutates state.
 * Namespace: window.DA_BLOCK
 */
(function () {
  const INDENT_PX = 40;
  let _active = false;

  function coordinateTypeSet() {
    // Group 0 of the hierarchy is the canonical list of coordinate relationships.
    return new Set(DA_CONSTANTS.RELATIONSHIP_GROUPS_HIERARCHY[0].types);
  }

  /** Human-readable, lowercase relationship name, e.g. "ground", "action-purpose". */
  function friendlyRelName(type) {
    const key = String(type).toLowerCase();
    // Resolve through the active notation profile (handles renames + Gurtner).
    const name = window.DA_PROFILES
      ? DA_PROFILES.getName(key)
      : (DA_CONSTANTS.RELATIONSHIP_LABELS[key] || type);
    // Strip a trailing " (ABBR)" suffix, then lowercase.
    return name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
  }

  /**
   * Classify a bracket as coordinate, or determine its dominant / subordinate
   * endpoints. The dominant endpoint is the one carrying the star (*); top maps
   * to `from`, bottom maps to `to` (matches the bracket renderer's convention).
   */
  function classifyBracket(b) {
    const isCoord = coordinateTypeSet().has(String(b.type).toLowerCase());
    if (isCoord) return { coordinate: true };

    const labels = DA_RENDERER.getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
    const hasStarTop = (labels.top && labels.top.includes('*')) || labels.single === '*';
    const hasStarBottom = labels.bottom && labels.bottom.includes('*');

    if (hasStarBottom && !hasStarTop) {
      return { coordinate: false, dominantId: b.to, subordinateId: b.from };
    }
    // Default: top/`from` is dominant (covers a top star and the ambiguous case).
    return { coordinate: false, dominantId: b.from, subordinateId: b.to };
  }

  function refOf(idx) {
    return DA_RENDERER.computeVerseDisplay(idx) || String(idx + 1);
  }

  function refOfRange(range) {
    if (!range) return '';
    if (range.from === range.to) return refOf(range.from);
    return `${refOf(range.from)}–${refOf(range.to)}`; // en dash
  }

  function versePhrase(refs) {
    const list = refs.filter(Boolean);
    if (list.length === 0) return '';
    return (list.length === 1 ? 'verse ' : 'verses ') + list.join(', ');
  }

  /**
   * Compute an indentation level for each proposition.
   * Brackets are processed outermost -> innermost (by nesting slot) so that a
   * subordinate side can be placed one level deeper than its dominant side's
   * already-finalized level. This makes indentation transitive across chains.
   */
  function computeLevels() {
    DA_RENDERER.computeSlotAssignments();
    const slots = DA_RENDERER.getBracketSlots();
    const n = DA_STATE.propositions.length;
    const levels = new Array(n).fill(0);

    const order = DA_STATE.brackets.map((_, i) => i).sort((a, c) => {
      const sa = slots[a] ?? 0, sc = slots[c] ?? 0;
      if (sc !== sa) return sc - sa;                 // higher slot (outer) first
      const ea = DA_RENDERER.getBracketExtent(a);
      const ec = DA_RENDERER.getBracketExtent(c);
      const wa = ea.to - ea.from, wc = ec.to - ec.from;
      if (wc !== wa) return wc - wa;                 // wider extent first
      return a - c;
    });

    const clampRange = (r) => ({
      from: Math.max(0, Math.min(n - 1, r.from)),
      to: Math.max(0, Math.min(n - 1, r.to))
    });

    order.forEach((i) => {
      const b = DA_STATE.brackets[i];
      if (!b) return;
      const info = classifyBracket(b);

      if (info.coordinate) {
        const r1 = clampRange(DA_RENDERER.getRepresentativeRange(b.from));
        const r2 = clampRange(DA_RENDERER.getRepresentativeRange(b.to));
        let lvl = 0;
        for (let p = r1.from; p <= r1.to; p++) lvl = Math.max(lvl, levels[p] || 0);
        for (let p = r2.from; p <= r2.to; p++) lvl = Math.max(lvl, levels[p] || 0);
        for (let p = r1.from; p <= r1.to; p++) levels[p] = lvl;
        for (let p = r2.from; p <= r2.to; p++) levels[p] = lvl;
      } else {
        const domRange = clampRange(DA_RENDERER.getRepresentativeRange(info.dominantId));
        const subRange = clampRange(DA_RENDERER.getRepresentativeRange(info.subordinateId));
        const domLevel = levels[domRange.from] || 0;
        for (let p = subRange.from; p <= subRange.to; p++) {
          levels[p] = Math.max(levels[p] || 0, domLevel + 1);
        }
      }
    });

    return levels;
  }

  /**
   * Build the right-hand relationship labels for each proposition.
   * Returns, per proposition, an array of { type, text } fragments so each can
   * be colored to match its relationship's bracket color.
   */
  function computeLabels() {
    const n = DA_STATE.propositions.length;
    const inRange = (p) => p >= 0 && p < n;
    const subFrags = Array.from({ length: n }, () => []);     // [{ type, text }]
    const coordFrags = Array.from({ length: n }, () => ({})); // { relType: [{idx, ref}] }

    DA_STATE.brackets.forEach((b) => {
      if (!b) return;
      const info = classifyBracket(b);

      if (info.coordinate) {
        const key = String(b.type).toLowerCase();
        const r1 = DA_RENDERER.getRepresentativeRange(b.from);
        const r2 = DA_RENDERER.getRepresentativeRange(b.to);
        if (inRange(r1.from)) {
          (coordFrags[r1.from][key] = coordFrags[r1.from][key] || []).push({ idx: r2.from, ref: refOfRange(r2) });
        }
        if (inRange(r2.from)) {
          (coordFrags[r2.from][key] = coordFrags[r2.from][key] || []).push({ idx: r1.from, ref: refOfRange(r1) });
        }
      } else {
        const domRange = DA_RENDERER.getRepresentativeRange(info.dominantId);
        const subRange = DA_RENDERER.getRepresentativeRange(info.subordinateId);
        if (inRange(subRange.from)) {
          subFrags[subRange.from].push({
            type: String(b.type).toLowerCase(),
            text: `${friendlyRelName(b.type)} to ${versePhrase([refOfRange(domRange)])}`
          });
        }
      }
    });

    return DA_STATE.propositions.map((_, i) => {
      const frags = [];
      // Coordinate fragments: one merged label per relationship type.
      Object.keys(coordFrags[i]).forEach((key) => {
        const seen = new Set();
        const partners = coordFrags[i][key]
          .sort((a, c) => a.idx - c.idx)
          .map(x => x.ref)
          .filter(r => r && !seen.has(r) && seen.add(r));
        frags.push({ type: key, text: `${friendlyRelName(key)} with ${versePhrase(partners)}` });
      });
      // Subordinate fragments.
      subFrags[i].forEach(f => frags.push(f));
      return frags; // [{ type, text }]
    });
  }

  /** Flatten a proposition's internal phrase formatting into one clean line. */
  function cleanText(text) {
    return String(text || '').replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function render() {
    const container = document.getElementById('blockDiagram');
    if (!container) return;
    container.innerHTML = '';

    if (DA_STATE.propositions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bd-empty';
      empty.textContent = 'No passage loaded. Fetch or import a passage first.';
      container.appendChild(empty);
      return;
    }

    const levels = computeLevels();
    const labels = computeLabels();

    DA_STATE.propositions.forEach((text, i) => {
      const line = document.createElement('div');
      line.className = 'bd-line';
      line.dataset.index = i;

      const ref = document.createElement('span');
      ref.className = 'bd-ref';
      ref.textContent = refOf(i);
      line.appendChild(ref);

      const txt = document.createElement('span');
      txt.className = 'bd-text';
      txt.style.paddingLeft = `${(levels[i] || 0) * INDENT_PX}px`;
      txt.textContent = cleanText(text);
      line.appendChild(txt);

      if (labels[i] && labels[i].length) {
        const lab = document.createElement('span');
        lab.className = 'bd-label';
        labels[i].forEach((frag, fi) => {
          if (fi > 0) {
            const sep = document.createElement('span');
            sep.className = 'bd-label-sep';
            sep.textContent = ', ';
            lab.appendChild(sep);
          }
          const fragEl = document.createElement('span');
          fragEl.className = 'bd-label-frag';
          // Resolve through the active notation profile so recolors apply here
          // just like they do to the brackets.
          fragEl.style.color = (window.DA_PROFILES
            ? DA_PROFILES.getColor(frag.type)
            : DA_CONSTANTS.RELATIONSHIP_COLORS[frag.type])
            || DA_CONSTANTS.RELATIONSHIP_COLORS.unspecified;
          fragEl.textContent = frag.text;
          lab.appendChild(fragEl);
        });
        line.appendChild(lab);
      }

      container.appendChild(line);
    });
  }

  function setActive(on) {
    _active = !!on;
    const wrapper = document.querySelector('.bracket-canvas-wrapper');
    if (wrapper) wrapper.classList.toggle('block-diagram-active', _active);
    const btn = document.getElementById('blockDiagramBtn');
    if (btn) {
      btn.classList.toggle('active', _active);
      btn.textContent = _active ? 'Bracket View' : 'Block Diagram';
    }
    if (_active) {
      render();
    } else {
      // Returning to the bracket view — recompute bracket geometry.
      DA_RENDERER.updateBracketPositions();
    }
  }

  function toggle() { setActive(!_active); }
  function isActive() { return _active; }

  function init() {
    const btn = document.getElementById('blockDiagramBtn');
    if (btn) btn.addEventListener('click', toggle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DA_BLOCK = { render, toggle, isActive, setActive, computeLevels, computeLabels };
})();
