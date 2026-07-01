/**
 * render-arrows — word-arrow overlay layer (renderWordArrows).
 *
 * Extracted from rendering-engine.js. This is a classic (non-module) script:
 * its top-level functions stay in the global scope like the rest of the app, and
 * it contributes its public function(s) to the shared window.DA_RENDERER
 * namespace. Loaded after rendering-engine.js in index.html.
 */

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

window.DA_RENDERER = Object.assign(window.DA_RENDERER || {}, { renderWordArrows });
