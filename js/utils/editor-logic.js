/**
 * Walks a contenteditable text span and extracts plain text + format tags
 * (bold / underline / color). Used by the focusout handler and Ctrl+B/U shortcut
 * to sync DOM formatting back to state. Color must be captured here too:
 * focusout rebuilds a line's formatTags entirely from this result, so any type
 * not extracted is silently dropped on the next focus change.
 *
 * `pcol` marks the extracted tags as belonging to the row's PARALLEL cell
 * (the second text column) instead of the primary text — the same formatTags
 * array holds both, discriminated by the tag's `pcol` flag (absent = primary,
 * so every pre-existing file/tag stays valid).
 */
function extractFormatTags(textSpan, propIndex, pcol) {
  let text = '';
  const tags = [];
  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Strip zero-width characters (legacy verse markers, BOM, joiners) so
      // pasted text can't smuggle invisible state back into the model. Offsets
      // are computed from this accumulated text, so tags stay consistent.
      text += node.textContent.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'BR') text += '\n';
      else if (node.tagName === 'DIV' && text.length > 0 && !text.endsWith('\n')) text += '\n';
      const start = text.length;
      node.childNodes.forEach(traverse);
      const end = text.length;
      if (start < end) {
        /** @type {{type: string, propIndex: number, start: number, end: number, color?: string, pcol?: boolean} | null} */
        let tag = null;
        if (node.tagName === 'B' || node.tagName === 'STRONG') {
          tag = { type: 'bold', propIndex, start, end };
        } else if (node.tagName === 'U') {
          tag = { type: 'underline', propIndex, start, end };
        } else if (node.classList && node.classList.contains('color-text')) {
          // Prefer the verbatim value stashed in data-color; fall back to the
          // computed style for spans rendered before data-color existed.
          const color = node.dataset.color || node.style.color;
          if (color) tag = { type: 'color', color, propIndex, start, end };
        }
        if (tag) {
          if (pcol) tag.pcol = true;
          tags.push(tag);
        }
      }
    }
  }
  textSpan.childNodes.forEach(traverse);
  return { text, tags };
}

/** Shift a 'pN' bracket endpoint up by one for rows below an inserted row.
 *  (Stable 'br…' ids pass through untouched.) */
function shiftPropRef(ref, splitIdx) {
  if (typeof ref === 'string' && ref.startsWith('p')) {
    const idx = parseInt(ref.slice(1), 10);
    if (idx > splitIdx) return 'p' + (idx + 1);
  }
  return ref;
}

/**
 * True when rows a and b are the same "split family": identical single-verse
 * refs (1a/1b/1c rows all carry ref '1'). Flow-splits and cell-merges only
 * operate inside a family; ranged refs ('3-5') route through the insert /
 * row-merge paths, whose verse-renumbering machinery handles them.
 */
function sameRefFamily(a, b) {
  const ra = DA_STATE.verseRefs[a] || '';
  const rb = DA_STATE.verseRefs[b] || '';
  return !!ra && ra === rb && !ra.includes('-');
}

/**
 * Redistribute row i's `col`-column format tags across a split at `splitAt`:
 * tags in the second half move to row `target` (offsets shifted by
 * `secondCut`), boundary-spanning tags split in two, the rest clamp to the
 * trimmed first half. The OTHER column's tags are untouched — its text
 * didn't move.
 */
function redistributeColumnTags(col, i, target, splitAt, secondCut, firstLen) {
  const wantPcol = col !== 'primary';
  const newTags = [];
  DA_STATE.formatTags.forEach(f => {
    if (f.propIndex !== i || !!f.pcol !== wantPcol) return;
    if (f.start >= splitAt) {
      f.propIndex = target;
      f.start = Math.max(0, f.start - secondCut);
      f.end = Math.max(0, f.end - secondCut);
    } else if (f.end > splitAt) {
      const t = { type: f.type, propIndex: target, start: 0, end: Math.max(0, f.end - secondCut) };
      if (f.color) t.color = f.color;
      if (wantPcol) t.pcol = true;
      newTags.push(t);
      f.end = firstLen;
    } else {
      f.end = Math.min(f.end, firstLen);
    }
  });
  if (newTags.length > 0) DA_STATE.formatTags.push(...newTags);
}

/**
 * Flow-split (owner-specified): when the next row is the same verse family
 * and its same-column cell is EMPTY, a split's second half flows into it
 * instead of inserting a row — this is how the two columns re-align after
 * being split independently (English 1a/1b + Chinese split in 1a → the
 * Chinese second half lands in 1b). Row structure, verse refs and brackets
 * are untouched; only the split column's anchors move.
 */
function flowSplit(col, i, offset) {
  const isPrimary = col === 'primary';
  const store = isPrimary ? DA_STATE.propositions : DA_STATE.parallelTexts;
  const text = store[i];

  DA_STATE.pushUndo(isPrimary ? 'split' : 'split parallel', String(i));

  const rawSecond = text.slice(offset);
  const secondCut = offset + (rawSecond.length - rawSecond.trimStart().length);
  store[i] = text.slice(0, offset).trimEnd();
  store[i + 1] = rawSecond.trimStart();
  const firstLen = store[i].length;

  if (isPrimary) {
    // verseBreaks, arrows and comments anchor the primary text: second-half
    // anchors move into row i+1's coordinate space (same math as the insert
    // split, minus the index shifting — the row already exists).
    const breaks = (DA_STATE.verseBreaks[i] || []).slice().sort((a, b) => a - b);
    const secondLen = store[i + 1].length;
    DA_STATE.verseBreaks[i] = breaks.filter(b => b < offset && b > 0 && b < firstLen);
    DA_STATE.verseBreaks[i + 1] = breaks
      .filter(b => b >= offset)
      .map(b => b - secondCut)
      .filter(b => b > 0 && b < secondLen);

    DA_STATE.wordArrows.forEach(wa => {
      if (wa.fromProp === i) {
        if (wa.fromStart >= offset) {
          wa.fromProp = i + 1;
          wa.fromStart = Math.max(0, wa.fromStart - secondCut);
          wa.fromEnd = Math.max(0, wa.fromEnd - secondCut);
        } else {
          wa.fromEnd = Math.min(wa.fromEnd, firstLen);
        }
      }
      if (wa.toProp === i) {
        if (wa.toStart >= offset) {
          wa.toProp = i + 1;
          wa.toStart = Math.max(0, wa.toStart - secondCut);
          wa.toEnd = Math.max(0, wa.toEnd - secondCut);
        } else {
          wa.toEnd = Math.min(wa.toEnd, firstLen);
        }
      }
    });
    DA_STATE.comments.forEach(c => {
      if (c.type === 'text' && c.target && c.target.propIndex === i) {
        if (c.target.start >= offset) {
          c.target.propIndex = i + 1;
          c.target.start = Math.max(0, c.target.start - secondCut);
          c.target.end = Math.max(0, c.target.end - secondCut);
        } else {
          c.target.end = Math.min(c.target.end, firstLen);
        }
      }
    });
  }

  redistributeColumnTags(col, i, i + 1, offset, secondCut, firstLen);
}

function splitPropositionAtOffset(i, offset) {
  const text = DA_STATE.propositions[i];
  if (!text || offset <= 0 || offset >= text.length || text.slice(offset).trim().length === 0) return;

  // Flow case: the next row is this verse's continuation with an empty
  // primary cell (created by a parallel-column split) — fill it instead of
  // inserting a row. Can't trigger without a parallel column, so classic
  // documents keep the exact historical split behavior.
  if (sameRefFamily(i, i + 1) && !(DA_STATE.propositions[i + 1] || '').trim()) {
    return flowSplit('primary', i, offset);
  }

  DA_STATE.pushUndo('split', String(i));
  const partsRef = (DA_STATE.verseRefs[i] || '').split('-');
  const startRef = partsRef[0];
  const endRef = partsRef[partsRef.length - 1];

  // Verse boundaries are structured data (verseBreaks[i]: offsets where a later
  // verse begins), not characters hidden in the text. A cursor within ±2 chars
  // of a recorded boundary snaps to it — the split then falls exactly at the
  // verse transition and renumbering is exact (same fuzziness the old invisible
  // markers had).
  const breaks = (DA_STATE.verseBreaks[i] || []).slice().sort((a, b) => a - b);
  const snapped = breaks.find(b => Math.abs(b - offset) <= 2);
  const isCleanBreak = snapped !== undefined;

  // How many verse boundaries lie at/before the split point — drives the verse
  // renumbering below (same semantics as the old marker count).
  const markersBefore = isCleanBreak
    ? breaks.indexOf(snapped) + 1
    : breaks.filter(b => b <= offset).length;

  // Where the second half's raw slice begins.
  const splitAt = isCleanBreak ? snapped : offset;

  // Set the final text for both parts
  DA_STATE.propositions[i] = text.slice(0, splitAt).trimEnd();
  DA_STATE.propositions.splice(i + 1, 0, text.slice(splitAt).trimStart());

  const interpolateRef = (base, offset) => {
    const num = parseInt(base, 10);
    if (!isNaN(num)) return (num + offset).toString();
    return base;
  };

  let firstPartEndRef, secondPartStartRef;

  if (isCleanBreak) {
    // Split happens exactly at a verse transition
    firstPartEndRef = interpolateRef(startRef, Math.max(0, markersBefore - 1));
    secondPartStartRef = interpolateRef(startRef, markersBefore);
  } else {
    // Split happens inside a verse
    firstPartEndRef = interpolateRef(startRef, markersBefore);
    secondPartStartRef = interpolateRef(startRef, markersBefore);
  }

  const firstPartRef = startRef === firstPartEndRef ? startRef : `${startRef}-${firstPartEndRef}`;
  const secondPartRef = secondPartStartRef === endRef ? endRef : `${secondPartStartRef}-${endRef}`;

  DA_STATE.verseRefs[i] = firstPartRef;
  DA_STATE.verseRefs.splice(i + 1, 0, secondPartRef);
  DA_STATE.indentation.splice(i + 1, 0, DA_STATE.indentation[i] || 0);
  // The parallel cell (if any) stays whole on the first row; the new row
  // starts with an empty cell (owner-specified split semantics).
  DA_STATE.parallelTexts.splice(i + 1, 0, '');

  const targetPropId = 'p' + i;
  // Capture which brackets reference this proposition BY INDEX before shiftRef mutates them
  const referencingIndices = [];
  DA_STATE.brackets.forEach((b, idx) => {
    const refersFrom = b.from === targetPropId;
    const refersTo = b.to === targetPropId;
    if (refersFrom || refersTo) referencingIndices.push({ idx, refersFrom, refersTo });
  });

  DA_STATE.brackets.forEach(b => {
    b.from = shiftPropRef(b.from, i);
    b.to = shiftPropRef(b.to, i);
  });

  if (referencingIndices.length > 0) {
    const newBracket = {
      id: DA_STATE.newBracketId(),
      from: 'p' + i,
      to: 'p' + (i + 1),
      type: 'unspecified'
    };
    DA_STATE.brackets.push(newBracket);
    referencingIndices.forEach(({ idx, refersFrom, refersTo }) => {
      const b = DA_STATE.brackets[idx];
      if (refersFrom) b.from = newBracket.id;
      if (refersTo) b.to = newBracket.id;
    });
  }
  
  // Offset math for anchor adjustment. The second half is text.slice(secondStart)
  // with its leading whitespace trimmed, so the real number of characters removed
  // from the front of the second half is `secondCut` (= secondStart + that trimmed
  // leading whitespace). Using plain `offset` here is what caused anchors to drift
  // right by the trimmed-whitespace length. `firstLen` is the length of the
  // (trimEnd'd) first half, used to clamp anchors that fall in its trimmed tail.
  const secondStart = splitAt;
  const _rawSecond = text.slice(secondStart);
  const secondCut = secondStart + (_rawSecond.length - _rawSecond.trimStart().length);
  const firstLen = DA_STATE.propositions[i].length;

  // Distribute the verse boundaries between the halves. A snapped boundary is
  // consumed by the split itself (it becomes the seam between the two lines);
  // earlier ones stay with the first half, later ones move to the second half
  // shifted into its coordinate space. Out-of-range results are dropped.
  const secondLen = DA_STATE.propositions[i + 1].length;
  DA_STATE.verseBreaks[i] = breaks.filter(b => b < secondStart && b > 0 && b < firstLen);
  DA_STATE.verseBreaks.splice(i + 1, 0, breaks
    .filter(b => b >= secondStart)
    .map(b => b - secondCut)
    .filter(b => b > 0 && b < secondLen));

  // Adjust word arrows
  DA_STATE.wordArrows.forEach(wa => {
    // From anchor
    if (wa.fromProp > i) {
      wa.fromProp++;
    } else if (wa.fromProp === i) {
      if (wa.fromStart >= secondStart) {
        wa.fromProp = i + 1;
        wa.fromStart = Math.max(0, wa.fromStart - secondCut);
        wa.fromEnd = Math.max(0, wa.fromEnd - secondCut);
      } else {
        wa.fromEnd = Math.min(wa.fromEnd, firstLen);
      }
    }
    // To anchor
    if (wa.toProp > i) {
      wa.toProp++;
    } else if (wa.toProp === i) {
      if (wa.toStart >= secondStart) {
        wa.toProp = i + 1;
        wa.toStart = Math.max(0, wa.toStart - secondCut);
        wa.toEnd = Math.max(0, wa.toEnd - secondCut);
      } else {
        wa.toEnd = Math.min(wa.toEnd, firstLen);
      }
    }
  });

  // Adjust comments
  DA_STATE.comments.forEach(c => {
    if (c.type === 'text' && c.target) {
      if (c.target.propIndex > i) {
        c.target.propIndex++;
      } else if (c.target.propIndex === i) {
        if (c.target.start >= secondStart) {
          c.target.propIndex++;
          c.target.start = Math.max(0, c.target.start - secondCut);
          c.target.end = Math.max(0, c.target.end - secondCut);
        } else {
          // Stays in first half; clamp the end into the trimmed first half.
          c.target.end = Math.min(c.target.end, firstLen);
        }
      }
    }
  });

  // Adjust format tags: rows below shift down one (both columns' tags — the
  // whole row moved); row i's PRIMARY tags redistribute across the split,
  // while its parallel-cell tags stay put with the unmoved cell text.
  DA_STATE.formatTags.forEach(f => {
    if (f.propIndex > i) f.propIndex++;
  });
  redistributeColumnTags('primary', i, i + 1, secondStart, secondCut, firstLen);
}

/**
 * Split the PARALLEL cell of row i at `offset` (owner-specified semantics).
 * Flow into the next row's empty cell when it's the same verse family;
 * otherwise insert a new row carrying the second half with an EMPTY primary
 * cell and a duplicated verse ref (the a/b/c display suffixes come from
 * repeated refs). The primary text never moves, and brackets/arrows/comments
 * anchor primary text — so an insert only shifts their row indices; no
 * auto-bracket is created (documented simplification).
 */
function splitParallelAtOffset(i, offset) {
  const text = DA_STATE.parallelTexts[i] || '';
  if (!text || offset <= 0 || offset >= text.length || text.slice(offset).trim().length === 0) return;

  if (sameRefFamily(i, i + 1) && !(DA_STATE.parallelTexts[i + 1] || '').trim()) {
    return flowSplit('parallel', i, offset);
  }

  DA_STATE.pushUndo('split parallel', String(i));

  const rawSecond = text.slice(offset);
  const secondCut = offset + (rawSecond.length - rawSecond.trimStart().length);
  DA_STATE.parallelTexts[i] = text.slice(0, offset).trimEnd();
  const firstLen = DA_STATE.parallelTexts[i].length;

  DA_STATE.propositions.splice(i + 1, 0, '');
  DA_STATE.parallelTexts.splice(i + 1, 0, rawSecond.trimStart());
  DA_STATE.verseRefs.splice(i + 1, 0, DA_STATE.verseRefs[i]);
  DA_STATE.verseBreaks.splice(i + 1, 0, []); // breaks anchor primary text, which stayed put
  DA_STATE.indentation.splice(i + 1, 0, DA_STATE.indentation[i] || 0);

  // A row was inserted: shift every row-indexed reference below it.
  DA_STATE.brackets.forEach(b => {
    b.from = shiftPropRef(b.from, i);
    b.to = shiftPropRef(b.to, i);
  });
  DA_STATE.wordArrows.forEach(wa => {
    if (wa.fromProp > i) wa.fromProp++;
    if (wa.toProp > i) wa.toProp++;
  });
  DA_STATE.comments.forEach(c => {
    if (c.type === 'text' && c.target && c.target.propIndex > i) c.target.propIndex++;
  });
  DA_STATE.formatTags.forEach(f => {
    if (f.propIndex > i) f.propIndex++;
  });
  redistributeColumnTags('parallel', i, i + 1, offset, secondCut, firstLen);
}

function mergePropositions(i) {
  if (i <= 0) return;
  DA_STATE.pushUndo('merge', String(i));
  
  const prevText = DA_STATE.propositions[i - 1];
  const currText = DA_STATE.propositions[i];
  
  const refA = DA_STATE.verseRefs[i - 1] || '';
  const refB = DA_STATE.verseRefs[i] || '';
  
  const endA = refA.split('-').pop();
  const startB = refB.split('-')[0];
  
  // Join with a single visible space. Keep prevText intact \u2014 only trim
  // currText's leading whitespace and the combined trailing whitespace. Trimming
  // the *front* of the combined string (as a plain .trim() did) would drop
  // prevText's leading whitespace and silently shift all of prop i-1's existing
  // anchors; not trimming the front keeps them valid.
  //
  // When the join crosses a verse boundary, that boundary is recorded as
  // structured data in verseBreaks (the offset where currText's verse begins in
  // the merged string) \u2014 previously an invisible \u200B character was hidden in
  // the text here, which any retype could silently destroy. Bonus: merged
  // verses are now separated by a real space instead of being jammed together.
  const isVerseTransition = !!(endA && startB && endA !== startB);
  const _currLeadingWS = currText.length - currText.replace(/^\s+/, '').length;
  DA_STATE.propositions[i - 1] = (prevText + ' ' + currText.replace(/^\s+/, '')).replace(/\s+$/, '');

  // currText's content begins here in the merged string (see prevLen below).
  const _currStartsAt = prevText.length + 1;
  const mergedBreaks = (DA_STATE.verseBreaks[i - 1] || []).slice();
  if (isVerseTransition) mergedBreaks.push(_currStartsAt);
  (DA_STATE.verseBreaks[i] || []).forEach((b) => {
    mergedBreaks.push(b + _currStartsAt - _currLeadingWS);
  });
  const _mergedLen = DA_STATE.propositions[i - 1].length;
  DA_STATE.verseBreaks[i - 1] = [...new Set(mergedBreaks)]
    .filter((b) => b > 0 && b < _mergedLen)
    .sort((a, b) => a - b);
  DA_STATE.verseBreaks.splice(i, 1);
  
  if (refA && refB && refA !== refB) {
    const partsA = refA.split('-');
    const partsB = refB.split('-');
    const start = partsA[0];
    const end = partsB[partsB.length - 1];
    // If they merge 21-22 and 22, endA == startB, so no marker, but we still update ref
    DA_STATE.verseRefs[i - 1] = start === end ? start : `${start}-${end}`;
  } else {
    DA_STATE.verseRefs[i - 1] = refA || refB;
  }
  
  // Join the parallel cells the same way (keep the upper cell intact, trim
  // the lower one's leading whitespace, single-space joiner). pPrevLen is
  // where row i's cell text lands in the joined cell — the shift for its
  // parallel-column tags (which live in their own coordinate space).
  const pPrev = DA_STATE.parallelTexts[i - 1] || '';
  const pCurr = DA_STATE.parallelTexts[i] || '';
  const pCurrTrimmed = pCurr.replace(/^\s+/, '');
  const pLeadWS = pCurr.length - pCurrTrimmed.length;
  DA_STATE.parallelTexts[i - 1] = (pPrev && pCurrTrimmed
    ? pPrev + ' ' + pCurrTrimmed
    : pPrev || pCurrTrimmed).replace(/\s+$/, '');
  const pPrevLen = (pPrev ? pPrev.length + 1 : 0) - pLeadWS;

  DA_STATE.propositions.splice(i, 1);
  DA_STATE.verseRefs.splice(i, 1);
  DA_STATE.indentation.splice(i, 1);
  DA_STATE.parallelTexts.splice(i, 1);

  // Adjust brackets — shift pN references down for indices >= i
  const unshiftRef = (ref, mergeIdx) => {
    if (typeof ref === 'string' && ref.startsWith('p')) {
      const idx = parseInt(ref.slice(1), 10);
      if (idx >= mergeIdx) return 'p' + (idx - 1);
    }
    return ref;
  };
  DA_STATE.brackets.forEach(b => {
    b.from = unshiftRef(b.from, i);
    b.to = unshiftRef(b.to, i);
  });

  // Remove degenerate brackets where from === to (e.g., auto-created brackets
  // whose halves merged back). Brackets are referenced by stable id, so removal
  // needs no renumbering — just reparent references and drop the id's comments
  // and highlight.
  for (let j = DA_STATE.brackets.length - 1; j >= 0; j--) {
    const b = DA_STATE.brackets[j];
    if (b.from === b.to) {
      // Reparent: any bracket pointing to this one should now point to its child
      DA_STATE.brackets.forEach((other, k) => {
        if (k === j) return;
        if (other.from === b.id) other.from = b.from;
        if (other.to === b.id) other.to = b.to;
      });
      DA_STATE.brackets.splice(j, 1);
      DA_STATE.comments = DA_STATE.comments.filter(c => c.type !== 'bracket' || c.target?.bracketId !== b.id);
      delete DA_STATE.bracketHighlights[b.id];
    }
  }
  
  // Where currText's content now begins in the merged string: prevText is kept
  // whole, plus the 1-char space joiner, minus the leading whitespace we trimmed
  // off currText (so anchors that were after that whitespace land correctly).
  const prevLen = _currStartsAt - _currLeadingWS;

  // Adjust word arrows
  DA_STATE.wordArrows.forEach(wa => {
    // From anchor
    if (wa.fromProp > i) {
      wa.fromProp--;
    } else if (wa.fromProp === i) {
      wa.fromProp = i - 1;
      wa.fromStart += prevLen;
      wa.fromEnd += prevLen;
    }
    // To anchor
    if (wa.toProp > i) {
      wa.toProp--;
    } else if (wa.toProp === i) {
      wa.toProp = i - 1;
      wa.toStart += prevLen;
      wa.toEnd += prevLen;
    }
  });

  // Adjust comments
  DA_STATE.comments.forEach(c => {
    if (c.type === 'text' && c.target) {
      if (c.target.propIndex > i) {
        c.target.propIndex--;
      } else if (c.target.propIndex === i) {
        c.target.propIndex = i - 1;
        c.target.start += prevLen;
        c.target.end += prevLen;
      }
    }
  });

  // Adjust format tags. A row's primary tags shift by where its primary text
  // landed (prevLen); its parallel-cell tags by where its CELL text landed
  // (pPrevLen) — the two columns join independently.
  DA_STATE.formatTags.forEach(f => {
    if (f.propIndex > i) {
      f.propIndex--;
    } else if (f.propIndex === i) {
      f.propIndex = i - 1;
      const shift = f.pcol ? pPrevLen : prevLen;
      f.start += shift;
      f.end += shift;
    }
  });
}

// ── Add passage (extend the document at either edge) ─────────────────────────

/** Parse the first or last dash-segment of a verse ref into
 *  { chapter|null, verse }: "20-22" side 'last' → 22; "3:23a" → {3, 23}. */
function _refVerse(ref, side) {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const parts = ref.split('-');
  const seg = parts[side === 'first' ? 0 : parts.length - 1].trim();
  const m = seg.match(/^(?:(\d+):)?(\d+)/);
  return m ? { chapter: m[1] ? parseInt(m[1], 10) : null, verse: parseInt(m[2], 10) } : null;
}

/** Chapter+verse at both edges of a verseRefs array. Chapters may be null —
 *  refs are only chapter-qualified at transitions ('4:1'), so the end chapter
 *  is taken from the nearest qualified ref scanning backward. */
function _edgeInfo(refs) {
  const list = (refs || []).filter(r => typeof r === 'string' && r.trim());
  if (!list.length) return null;
  const first = _refVerse(list[0], 'first');
  const last = _refVerse(list[list.length - 1], 'last');
  if (!first || !last) return null;
  let endChapter = last.chapter;
  for (let i = list.length - 1; i >= 0 && endChapter === null; i--) {
    const v = _refVerse(list[i], 'first');
    if (v && v.chapter !== null) endChapter = v.chapter;
  }
  return { firstVerse: first.verse, lastVerse: last.verse, startChapter: first.chapter, endChapter };
}

/** Resolve a caller-supplied ref context (parseRefRange or DA_BIBLE
 *  parsePassageReference output — both shapes accepted) to start/end chapters. */
function _ctxChapters(ctx) {
  if (!ctx) return { start: null, end: null };
  const start = ctx.startChapter ?? ctx.chapter ?? null;
  return { start, end: ctx.endChapter ?? start };
}

/** Compare two chapter:verse positions; null chapters compare as equal
 *  (single-chapter documents never carry chapter numbers in their refs). */
function _cmpChapterVerse(chA, vA, chB, vB) {
  if (chA !== null && chB !== null && chA !== chB) return chA - chB;
  return vA - vB;
}

/** Same Bible book? Resolves aliases ("Gal" == "Galatians") through the
 *  BOLLS_BOOKS id table when constants are loaded; string equality otherwise. */
function _sameBook(a, b) {
  const key = (s) => String(s || '').toLowerCase().replace(/[.\s]+/g, '');
  const ka = key(a), kb = key(b);
  if (!ka || !kb) return false;
  const books = (typeof DA_CONSTANTS !== 'undefined' && DA_CONSTANTS.BOLLS_BOOKS) || {};
  if (books[ka] != null && books[kb] != null) return books[ka] === books[kb];
  return ka === kb;
}

/**
 * Parse a passage label like "Galatians 3:15-4:7" (any dash flavor) into its
 * parts. Unlike DA_BIBLE's PASSAGE_REF_REGEX this understands cross-chapter
 * ends. Returns null for unparseable labels ("Imported text", "—").
 */
function parseRefRange(ref) {
  const norm = String(ref || '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-') // hyphens, en/em dashes, minus
    .replace(/\u00A0/g, ' ') // non-breaking space
    .trim();
  const m = norm.match(/^(.+?)\s+(\d+)(?::(\d+))?(?:\s*-\s*(?:(\d+)\s*:\s*)?(\d+))?$/);
  if (!m) return null;
  const startChapter = parseInt(m[2], 10);
  const startVerse = m[3] ? parseInt(m[3], 10) : null;
  return {
    book: m[1].trim(),
    startChapter,
    startVerse,
    endChapter: m[4] ? parseInt(m[4], 10) : startChapter,
    endVerse: m[5] ? parseInt(m[5], 10) : startVerse
  };
}

/**
 * Which edge of the document does an incoming batch of verses belong to?
 * 'end' is the safe fallback for every ambiguous case (different book,
 * unparseable refs, overlapping range): appending needs no anchor remapping,
 * and checkContiguity's note plus one undo covers a wrong guess.
 * docCtx/addCtx are optional parsed refs supplying chapter/book context the
 * verse refs alone may lack.
 */
function detectAddPosition(docCtx, existingRefs, addCtx, newRefs) {
  if (docCtx && addCtx) {
    const docBook = docCtx.book ?? docCtx.bookName;
    const addBook = addCtx.book ?? addCtx.bookName;
    if (docBook && addBook && !_sameBook(docBook, addBook)) return 'end';
  }
  const doc = _edgeInfo(existingRefs);
  const add = _edgeInfo(newRefs);
  if (!doc || !add) return 'end';
  const docCh = _ctxChapters(docCtx);
  const addCh = _ctxChapters(addCtx);
  const docStartCh = doc.startChapter ?? docCh.start;
  const docEndCh = doc.endChapter ?? docCh.end ?? docStartCh;
  const addStartCh = add.startChapter ?? addCh.start;
  const addEndCh = add.endChapter ?? addCh.end ?? addStartCh;
  if (_cmpChapterVerse(addStartCh, add.firstVerse, docEndCh, doc.lastVerse) > 0) return 'end';
  if (_cmpChapterVerse(addEndCh, add.lastVerse, docStartCh, doc.firstVerse) < 0) return 'start';
  return 'end';
}

/**
 * Gentle sanity note for an add — never blocks (adding is undoable, and paste
 * sources legitimately skip verses). Returns a warning string or null when the
 * seam is clean: consecutive verses, or a chapter rollover onto verse 1 of the
 * very next chapter (chapter lengths aren't known, so other cross-chapter
 * seams only flag the definite cases).
 */
function checkContiguity(existingRefs, newRefs, position, docCtx, addCtx) {
  const doc = _edgeInfo(existingRefs);
  const add = _edgeInfo(newRefs);
  if (!doc || !add) return null;
  const docCh = _ctxChapters(docCtx);
  const addCh = _ctxChapters(addCtx);
  const docStartCh = doc.startChapter ?? docCh.start;
  const docEndCh = doc.endChapter ?? docCh.end ?? docStartCh;
  const addStartCh = add.startChapter ?? addCh.start;
  const addEndCh = add.endChapter ?? addCh.end ?? addStartCh;
  // The seam: [before] existing end → added start (append), or added end →
  // existing start (prepend).
  const before = position === 'start' ? { ch: addEndCh, v: add.lastVerse } : { ch: docEndCh, v: doc.lastVerse };
  const after = position === 'start' ? { ch: docStartCh, v: doc.firstVerse } : { ch: addStartCh, v: add.firstVerse };
  if (before.ch !== null && after.ch !== null && before.ch !== after.ch) {
    if (after.ch === before.ch + 1 && after.v === 1) return null;
    if (after.ch > before.ch) return 'Note: there is a gap between the existing passage and the added verses.';
    return 'Note: the added verses overlap the existing passage.';
  }
  if (after.v === before.v + 1) return null;
  if (after.v <= before.v) return 'Note: the added verses overlap the existing passage.';
  return `Note: gap between verse ${before.v} and verse ${after.v}.`;
}

/**
 * Extend the passage label across an add: "Galatians 3:15-22" + verses 23-25
 * → "Galatians 3:15-25"; prepending 3:26-29 to "Galatians 4:1-7" →
 * "Galatians 3:26-4:7". Pure string logic (unit-testable). Unparseable or
 * different-book labels get a compound "A + B" the user can hand-edit in the
 * contenteditable header. Always emits an ASCII hyphen — every consumer
 * normalizes dashes anyway.
 */
function extendPassageRef(currentRef, newPassageRef, addedRefs, position) {
  const cur = parseRefRange(currentRef);
  const compound = () => {
    const label = String(newPassageRef || '').trim() || 'added verses';
    if (!String(currentRef || '').trim()) return label;
    return position === 'start' ? `${label} + ${currentRef}` : `${currentRef} + ${label}`;
  };
  if (!cur) return compound();
  const added = parseRefRange(newPassageRef);
  if (added && !_sameBook(cur.book, added.book)) return compound();
  if (cur.startVerse === null) return currentRef; // whole-chapter label — leave it
  const info = _edgeInfo(addedRefs);
  if (position === 'end') {
    const endV = info ? info.lastVerse : (added ? (added.endVerse ?? added.startVerse) : null);
    if (endV === null || endV === undefined) return currentRef;
    const endCh = (info && info.endChapter !== null ? info.endChapter : null)
      ?? (added ? added.endChapter : null) ?? cur.endChapter;
    return endCh !== cur.startChapter
      ? `${cur.book} ${cur.startChapter}:${cur.startVerse}-${endCh}:${endV}`
      : `${cur.book} ${cur.startChapter}:${cur.startVerse}-${endV}`;
  }
  const startV = info ? info.firstVerse : (added ? added.startVerse : null);
  if (startV === null || startV === undefined) return currentRef;
  const startCh = (info && info.startChapter !== null ? info.startChapter : null)
    ?? (added ? added.startChapter : null) ?? cur.startChapter;
  const endV = cur.endVerse ?? cur.startVerse;
  return cur.endChapter !== startCh
    ? `${cur.book} ${startCh}:${startV}-${cur.endChapter}:${endV}`
    : `${cur.book} ${startCh}:${startV}-${endV}`;
}

/** Shift a 'pN' endpoint by k — the whole-document analogue of shiftPropRef
 *  above (stable 'br…' ids pass through untouched). */
function _shiftPropRefBy(ref, k) {
  if (typeof ref === 'string' && /^p\d+$/.test(ref)) {
    return 'p' + (parseInt(ref.slice(1), 10) + k);
  }
  return ref;
}

/**
 * Add whole verses at one edge of the document.
 *
 * Appending is remap-free by construction: new rows only occupy indices >=
 * oldLength, so every existing 'pN' bracket ref, propIndex, fromProp/toProp
 * and comment target stays valid untouched. Prepending shifts every one of
 * those anchors by exactly k = rows added — the uniform version of the
 * per-row shift each split already performs.
 *
 * @param {{propositions: string[], verseRefs?: string[], passageRef?: string,
 *          qualifyExistingWithChapter?: number, docRefCtx?: object,
 *          addRefCtx?: object}} data
 *        qualifyExistingWithChapter: on a cross-chapter prepend the existing
 *        unqualified refs silently meant this chapter — rewrite them '4:15'
 *        style so the new first chapter can own the bare numbers.
 *        docRefCtx/addRefCtx: optional parsed refs for chapter context in the
 *        contiguity note.
 * @param {'start'|'end'} position
 * @returns {{added: number, warning: string|null}} Throws an Error with a
 *          user-facing message on empty input / empty document.
 *
 * Touches ONLY the five row-parallel arrays, the positional anchors (prepend),
 * and passageRef — never bracket ids/structure, highlights, custom labels,
 * the parallel column config, the cloud session, or the DOM. No render call:
 * callers render, exactly like splitPropositionAtOffset.
 */
function addPassage(data, position = 'end') {
  const props = (data && data.propositions) || [];
  if (!props.length) throw new Error('Nothing to add.');
  if (!DA_STATE.propositions.length) throw new Error('No document loaded to add to.');
  DA_STATE.pushUndo('add passage');

  const oldLen = DA_STATE.propositions.length;
  // Pad EVERY row-parallel array to oldLen first so an inserted row's entry
  // can never land at an old row's index. verseRefs/verseBreaks mirror the
  // renderer's defensive pads; parallelTexts has NO renderer pad and
  // indentation may legitimately be short (read as `[i] || 0`) — their
  // neutral values preserve semantics exactly.
  while (DA_STATE.verseRefs.length < oldLen) DA_STATE.verseRefs.push(String(DA_STATE.verseRefs.length + 1));
  while (DA_STATE.verseBreaks.length < oldLen) DA_STATE.verseBreaks.push([]);
  while (DA_STATE.parallelTexts.length < oldLen) DA_STATE.parallelTexts.push('');
  while (DA_STATE.indentation.length < oldLen) DA_STATE.indentation.push(0);

  const warning = checkContiguity(
    DA_STATE.verseRefs, data.verseRefs || [], position, data.docRefCtx, data.addRefCtx);

  const k = props.length;
  if (position === 'start') {
    DA_STATE.brackets.forEach(b => {
      b.from = _shiftPropRefBy(b.from, k);
      b.to = _shiftPropRefBy(b.to, k);
    });
    DA_STATE.formatTags.forEach(f => { f.propIndex += k; });
    DA_STATE.wordArrows.forEach(w => { w.fromProp += k; w.toProp += k; });
    DA_STATE.comments.forEach(c => {
      if (c.target && typeof c.target.propIndex === 'number') c.target.propIndex += k;
    });
    // An in-progress bracket selection may hold a now-stale 'pN' (same cleanup
    // as bracket deletion).
    DA_STATE.bracketSelectStep = 0;
    DA_STATE.firstBracketPoint = null;
    if (data.qualifyExistingWithChapter != null) {
      const ch = data.qualifyExistingWithChapter;
      DA_STATE.verseRefs = DA_STATE.verseRefs.map(r =>
        (typeof r === 'string' && r.trim() && !r.includes(':')) ? `${ch}:${r}` : r);
    }
  }

  // Fallback refs only matter when a caller supplies bare text with no verse
  // numbers at all; continue counting from the touched edge.
  const edge = _refVerse(position === 'end' ? DA_STATE.verseRefs[oldLen - 1] : DA_STATE.verseRefs[0],
    position === 'end' ? 'last' : 'first');
  const fallbackRef = (j) => {
    if (!edge) return String(j + 1);
    return String(position === 'end' ? edge.verse + 1 + j : Math.max(1, edge.verse - k + j));
  };
  const texts = props.map(p => String(p));
  const refs = texts.map((_, j) => {
    const r = data.verseRefs && data.verseRefs[j];
    return (typeof r === 'string' && r.trim()) ? r : fallbackRef(j);
  });

  if (position === 'end') {
    DA_STATE.propositions.push(...texts);
    DA_STATE.verseRefs.push(...refs);
    DA_STATE.verseBreaks.push(...texts.map(() => []));
    DA_STATE.parallelTexts.push(...texts.map(() => ''));
    DA_STATE.indentation.push(...texts.map(() => 0));
  } else {
    DA_STATE.propositions.splice(0, 0, ...texts);
    DA_STATE.verseRefs.splice(0, 0, ...refs);
    DA_STATE.verseBreaks.splice(0, 0, ...texts.map(() => []));
    DA_STATE.parallelTexts.splice(0, 0, ...texts.map(() => ''));
    DA_STATE.indentation.splice(0, 0, ...texts.map(() => 0));
  }

  DA_STATE.passageRef = extendPassageRef(DA_STATE.passageRef, data.passageRef, refs, position);
  return { added: k, warning };
}

/**
 * Backspace-at-start of a cell — the merge mirror of the split rules. The
 * cell's text joins the same column's cell above. The row itself is removed
 * only when that leaves it empty on BOTH sides (with no parallel column
 * that's every time, i.e. exactly the historical row merge) or when the rows
 * are different verses (cross-verse merges always row-merge so verse-ref
 * recombination stays in mergePropositions).
 * Returns { removed, seam } for caret restoration, or null if nothing to do.
 */
function mergeCellIntoPrevious(col, i) {
  if (i <= 0) return null;
  const isPrimary = col === 'primary';
  const store = isPrimary ? DA_STATE.propositions : DA_STATE.parallelTexts;
  const other = isPrimary ? DA_STATE.parallelTexts : DA_STATE.propositions;

  const prev = store[i - 1] || '';
  const curr = store[i] || '';
  const currTrimmed = curr.replace(/^\s+/, '');
  const leadWS = curr.length - currTrimmed.length;

  const otherEmpty = !(other[i] || '').trim();
  if (otherEmpty || !sameRefFamily(i - 1, i)) {
    // Full row merge (both columns join). Seam mirrors mergePropositions'
    // internal math: primary always gets the ' ' joiner; the parallel join
    // skips it when the upper cell is empty.
    const seam = isPrimary
      ? prev.length + 1 - leadWS
      : (prev ? prev.length + 1 : 0) - leadWS;
    mergePropositions(i);
    return { removed: true, seam: Math.max(0, seam) };
  }

  if (!currTrimmed) return null; // empty cell; the row is still carrying the other column

  // Cell-level merge: the row stays (its other column has content).
  DA_STATE.pushUndo(isPrimary ? 'merge' : 'merge parallel', String(i));
  const joined = (prev && currTrimmed ? prev + ' ' + currTrimmed : prev || currTrimmed).replace(/\s+$/, '');
  const prevLen = (prev ? prev.length + 1 : 0) - leadWS;
  store[i - 1] = joined;
  store[i] = '';

  if (isPrimary) {
    // verseBreaks / arrows / comments anchor the primary text — follow it up.
    // (Same verse family, so no verse-transition break at the seam.)
    const mergedBreaks = (DA_STATE.verseBreaks[i - 1] || []).slice();
    (DA_STATE.verseBreaks[i] || []).forEach(b => mergedBreaks.push(b + prevLen));
    DA_STATE.verseBreaks[i - 1] = [...new Set(mergedBreaks)]
      .filter(b => b > 0 && b < joined.length)
      .sort((a, b) => a - b);
    DA_STATE.verseBreaks[i] = [];
    DA_STATE.wordArrows.forEach(wa => {
      if (wa.fromProp === i) { wa.fromProp = i - 1; wa.fromStart += prevLen; wa.fromEnd += prevLen; }
      if (wa.toProp === i) { wa.toProp = i - 1; wa.toStart += prevLen; wa.toEnd += prevLen; }
    });
    DA_STATE.comments.forEach(c => {
      if (c.type === 'text' && c.target && c.target.propIndex === i) {
        c.target.propIndex = i - 1;
        c.target.start += prevLen;
        c.target.end += prevLen;
      }
    });
  }
  const wantPcol = !isPrimary;
  DA_STATE.formatTags.forEach(f => {
    if (f.propIndex === i && !!f.pcol === wantPcol) {
      f.propIndex = i - 1;
      f.start += prevLen;
      f.end += prevLen;
    }
  });
  return { removed: false, seam: Math.max(0, prevLen) };
}

function changeIndentation(i, delta) {
  if (!DA_STATE.indentation[i]) DA_STATE.indentation[i] = 0;
  DA_STATE.indentation[i] = Math.max(0, DA_STATE.indentation[i] + delta);
}

function setSelectionByGlobalOffset(el, start, end) {
  if (end === undefined) end = start;
  const range = document.createRange();
  const sel = window.getSelection();
  
  let currentPos = 0;
  let startNode, startOffset, endNode, endOffset;
  
  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      if (!startNode && currentPos + len >= start) {
        startNode = node;
        startOffset = start - currentPos;
      }
      if (!endNode && currentPos + len >= end) {
        endNode = node;
        endOffset = end - currentPos;
      }
      currentPos += len;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        traverse(node.childNodes[i]);
        if (startNode && endNode) break;
      }
    }
  }
  
  traverse(el);
  
  if (startNode && endNode) {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (el.firstChild) {
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * Delete a bracket, CASCADING to any brackets built on top of it.
 *
 * An outer bracket's endpoint refers to the inner bracket AS A UNIT ("v21
 * relates to [v22–23]"); once that unit is dissolved there is no honest
 * automatic answer for what the outer arm should point at — re-aiming it at
 * one member silently changes the relationship's meaning and can even produce
 * shapes the adjacency rule forbids at creation time (e.g. 21→23 skipping 22).
 * So dependents are removed with it — think of brackets as a stack of cards:
 * pull one from the middle and the ones resting on it come down. The user
 * confirms first when dependents exist, and Undo restores everything.
 *
 * Returns the number of brackets deleted (0 if the user cancelled).
 */
function deleteBracket(bracketIdx) {
  const bToDelete = DA_STATE.brackets[bracketIdx];
  if (!bToDelete) return 0;

  // Transitive closure of brackets whose from/to chain rests on the doomed one.
  const doomedIds = new Set([bToDelete.id]);
  let grew = true;
  while (grew) {
    grew = false;
    DA_STATE.brackets.forEach((b) => {
      if (doomedIds.has(b.id)) return;
      if (doomedIds.has(b.from) || doomedIds.has(b.to)) {
        doomedIds.add(b.id);
        grew = true;
      }
    });
  }

  const dependents = doomedIds.size - 1;
  if (dependents > 0) {
    const ok = confirm(
      `This bracket has ${dependents} larger bracket${dependents === 1 ? '' : 's'} built on it, ` +
      `which can't stand without it.\n\nDelete all ${doomedIds.size} brackets? (Undo restores them.)`
    );
    if (!ok) return 0;
  }

  DA_STATE.pushUndo(dependents > 0 ? 'delete brackets' : 'delete bracket');

  DA_STATE.brackets = DA_STATE.brackets.filter((b) => !doomedIds.has(b.id));
  DA_STATE.comments = DA_STATE.comments.filter((c) => c.type !== 'bracket' || !doomedIds.has(c.target?.bracketId));
  doomedIds.forEach((id) => { delete DA_STATE.bracketHighlights[id]; });

  // Clear transient references into the doomed set (mid "Connect to…" etc.).
  if (doomedIds.has(DA_STATE.firstBracketPoint)) {
    DA_STATE.firstBracketPoint = null;
    DA_STATE.bracketSelectStep = 0;
  }
  if (DA_STATE.activeCommentTarget && doomedIds.has(DA_STATE.activeCommentTarget.bracketId)) {
    DA_STATE.activeCommentTarget = null;
  }

  if (window.DA_RENDERER) DA_RENDERER.renderAll();
  return doomedIds.size;
}

function findBestAttachment(pId, proposedMin, proposedMax) {
    if (!DA_STATE.isPropRef(pId)) return pId; // already a bracket id

    let bestB = null;
    let minRange = Infinity;

    DA_STATE.brackets.forEach((b, i) => {
        const range = DA_RENDERER.getBracketExtent(i);
        if (range.from <= proposedMin && range.to >= proposedMax) {
            const size = range.to - range.from;
            if (size < minRange) {
                // If it's a bracket, we can only attach if it points directly to our target node
                if (b.from === pId || b.to === pId) {
                    minRange = size;
                    bestB = b.id;
                }
            }
        }
    });

    return bestB || pId;
}

function resetBracketSelection() {
  DA_STATE.bracketSelectStep = 0;
  DA_STATE.firstBracketPoint = null;
  document.getElementById('bracketCanvas')?.classList.remove('connect-mode');
  if (window.DA_RENDERER) DA_RENDERER.renderAll();
}

// ── Bracket-creation simulation ─────────────────────────────────────────────
// Extent math over an ARBITRARY bracket list (not DA_STATE), so a creation can
// be simulated on a clone before being committed. Mirrors render-model's
// getExtent semantics exactly (numbers, null, 'pN', cycle guard, missing id).
function _extentIn(byId, ref, _seen) {
  if (typeof ref === 'number') return { from: ref, to: ref };
  if (ref === null || ref === undefined) return { from: 0, to: 0 };
  if (DA_STATE.isPropRef(ref)) {
    const idx = parseInt(ref.slice(1), 10);
    return { from: idx, to: idx };
  }
  if (!_seen) _seen = new Set();
  if (_seen.has(ref)) return { from: 0, to: 0 };
  _seen.add(ref);
  const b = byId.get(ref);
  if (!b) return { from: 0, to: 0 };
  const eFrom = _extentIn(byId, b.from, _seen);
  const eTo = _extentIn(byId, b.to, _seen);
  return { from: Math.min(eFrom.from, eTo.from), to: Math.max(eFrom.to, eTo.to) };
}

/** First-match id map, mirroring DA_STATE.bracketById's find() semantics. */
function _bracketMap(list) {
  const byId = new Map();
  list.forEach((b) => { if (!byId.has(b.id)) byId.set(b.id, b); });
  return byId;
}

/**
 * Add a bracket to `list` and reparent existing endpoints onto it: any bracket
 * (not itself inside the new range) whose from/to endpoint's extent falls
 * fully inside the new range now points at the new bracket AS A UNIT. This is
 * the single creation rule — handleDotClick commits with it, and the crossing
 * check below runs it on a clone first, so the check can never disagree with
 * what creation would actually produce.
 */
function _applyNewBracket(list, newBracket) {
  list.push(newBracket);
  const byId = _bracketMap(list);
  const newRange = _extentIn(byId, newBracket.id);
  list.forEach((oldB) => {
    if (oldB === newBracket) return;
    const oldRange = _extentIn(byId, oldB.id);
    if (newRange.from <= oldRange.from && newRange.to >= oldRange.to) return;

    const fromRange = _extentIn(byId, oldB.from);
    if (fromRange.from >= newRange.from && fromRange.to <= newRange.to) oldB.from = newBracket.id;

    const toRange = _extentIn(byId, oldB.to);
    if (toRange.from >= newRange.from && toRange.to <= newRange.to) oldB.to = newBracket.id;
  });
}

/**
 * Would creating from→to produce crossing brackets? Judged on the tree as it
 * will exist AFTER the reparent pass, not before: absorbing an endpoint into
 * the new bracket stretches every enclosing ancestor over the new range too,
 * so e.g. binding an innermost unit to the adjacent verse is legal no matter
 * how many brackets enclose it (each one's extent grows transitively). The old
 * pre-check compared current extents one level deep, which both rejected those
 * legal chains and accepted creations that absorb the facing endpoints of two
 * sibling sub-brackets — real crossings. Simulating answers both exactly.
 *
 * Only pairs whose extent changed (or the new bracket) are validated, so a
 * pre-existing overlap in an imported document never blocks unrelated work.
 * Brackets merely touching at one shared row keep the old tolerance.
 */
function _creationWouldCross(fromRef, toRef) {
  const liveById = _bracketMap(DA_STATE.brackets);
  const before = new Map();
  DA_STATE.brackets.forEach((b) => before.set(b, _extentIn(liveById, b.id)));

  const sim = DA_STATE.brackets.map((b) => ({ ...b, _orig: b }));
  _applyNewBracket(sim, { id: '__proposed__', from: fromRef, to: toRef });

  const byId = _bracketMap(sim);
  const after = sim.map((b) => ({
    ext: _extentIn(byId, b.id),
    prev: b._orig ? before.get(b._orig) : null // null = the new bracket
  }));
  const changed = (e) => !e.prev || e.prev.from !== e.ext.from || e.prev.to !== e.ext.to;

  for (let i = 0; i < after.length; i++) {
    for (let j = i + 1; j < after.length; j++) {
      if (!changed(after[i]) && !changed(after[j])) continue;
      const a = after[i].ext, c = after[j].ext;
      if (Math.max(a.from, c.from) >= Math.min(a.to, c.to)) continue; // ≤1 shared row
      const aInC = a.from >= c.from && a.to <= c.to;
      const cInA = c.from >= a.from && c.to <= a.to;
      if (!aInC && !cInA) return true;
    }
  }
  return false;
}

function handleDotClick(pointId, x, y) {
  const bracketCanvas = document.getElementById('bracketCanvas');
  if (DA_STATE.bracketSelectStep === 0) {
    DA_STATE.firstBracketPoint = pointId;
    DA_STATE.bracketSelectStep = 1;
    
    // Visual feedback
    bracketCanvas?.classList.add('connect-mode');
    DA_UI.showStatus('Select second node to create bracket', 'success');
    
    if (window.DA_RENDERER) DA_RENDERER.renderAll();
  } else {
    const p1 = DA_STATE.firstBracketPoint;
    const p2 = pointId;
    
    // If they clicked the same node twice, cancel
    if (p1 === p2) {
      resetBracketSelection();
      return;
    }
    
    // Determine the proposed range to decide on auto-attachment direction
    const range1 = DA_RENDERER.getPointExtent(p1);
    const range2 = DA_RENDERER.getPointExtent(p2);
    const proposedMin = Math.min(range1.from, range2.from);
    const proposedMax = Math.max(range1.to, range2.to);

    // Auto-attach to existing sub-brackets only if they fit inside the new range
    const finalP1 = findBestAttachment(p1, proposedMin, proposedMax);
    const finalP2 = findBestAttachment(p2, proposedMin, proposedMax);

    // CONSTRAINT: Adjacency Rule.
    const ext1 = DA_RENDERER.getPointExtent(finalP1);
    const ext2 = DA_RENDERER.getPointExtent(finalP2);
    const firstEnd = Math.min(ext1.to, ext2.to);
    const secondStart = Math.max(ext1.from, ext2.from);

    // A forward gap between the two sides means the user "jumped over" the lines
    // in between. The line(s) in the gap become implicit members of one flat unit
    // (their dots are hidden at render time), so the label picker restricts the
    // choice to DA_CONSTANTS.JUMP_OVER_TYPES; 'series' below is just the default
    // it opens with.
    // The cross-check below still rejects anything that would truly cross out of
    // the new range. Overlap (firstEnd + 1 > secondStart) keeps the old error.
    let isSeriesJumpOver = false;
    if (firstEnd + 1 !== secondStart) {
        if (firstEnd + 1 < secondStart) {
            isSeriesJumpOver = true;
        } else {
            DA_UI.showStatus('Brackets must connect adjacent items. No "jumping over" allowed.', 'error');
            resetBracketSelection();
            return;
        }
    }

    // If both resolve to the same target, block creation
    if (finalP1 === finalP2) {
      DA_UI.showStatus('Bracket already exists for this exact range', 'warning');
      resetBracketSelection();
      return;
    }

    // CONSTRAINT: Brackets cannot cross each other — judged on the tree as it
    // will exist after creation's reparent pass (see _creationWouldCross).
    if (_creationWouldCross(finalP1, finalP2)) {
        DA_UI.showStatus('Brackets cannot cross each other', 'error');
        resetBracketSelection();
        return;
    }

    const finalP1IsNode = DA_STATE.isPropRef(finalP1);
    const finalP2IsNode = DA_STATE.isPropRef(finalP2);
    const p1AlreadyBusy = DA_STATE.brackets.some(b => b.from === finalP1 || b.to === finalP1);
    const p2AlreadyBusy = DA_STATE.brackets.some(b => b.from === finalP2 || b.to === finalP2);

    if (finalP1IsNode && finalP2IsNode && p1AlreadyBusy && p2AlreadyBusy) {
        DA_UI.showStatus('Cannot connect two nodes that are already bracketed. Connect their dots instead.', 'error');
        resetBracketSelection();
        return;
    }

    const exists = DA_STATE.brackets.some(b =>
      (b.from === finalP1 && b.to === finalP2) ||
      (b.from === finalP2 && b.to === finalP1)
    );
    if (exists) {
      DA_UI.showStatus('Bracket already exists between these nodes', 'warning');
      resetBracketSelection();
      return;
    }

    DA_STATE.pushUndo('add bracket');

    // Assign from/to by TEXT order (earlier proposition first), not click
    // order — from always renders on the top arm, so without this, whichever
    // dot the user happened to click first would silently decide which half of
    // the label lands on top (e.g. Ground's star). ext1/ext2 are already
    // resolved above for the adjacency check, so reuse them. Ties (same start)
    // fall back to .to, then to click order, so this never leaves from/to
    // undefined for an unexpected shape.
    let orderedFrom = finalP1, orderedTo = finalP2;
    if (ext1.from > ext2.from || (ext1.from === ext2.from && ext1.to > ext2.to)) {
      orderedFrom = finalP2;
      orderedTo = finalP1;
    }

    const newBracket = {
      id: DA_STATE.newBracketId(),
      from: orderedFrom,
      to: orderedTo,
      type: isSeriesJumpOver ? 'series' : (DA_STATE.currentRelationshipType || 'unspecified'),
      labelsSwapped: false,
      dominanceFlipped: false,
      ...(isSeriesJumpOver && { isJumpOver: true })
    };

    _applyNewBracket(DA_STATE.brackets, newBracket);

    resetBracketSelection();

    // Both paths open the label picker (jump-over brackets get a restricted one,
    // keyed off bracket.isJumpOver inside showLabelPicker); only the toast differs.
    DA_UI.showStatus(isSeriesJumpOver ? 'Jump-over bracket created' : 'Bracket created', 'success');
    if (x !== undefined && y !== undefined && window.showLabelPicker) {
      window.showLabelPicker(DA_STATE.brackets.length - 1, y, x);
    }
  }
}

function toggleBracketCollapse(bracketIdx) {
  const b = DA_STATE.brackets[bracketIdx];
  if (!b) return;
  DA_STATE.pushUndo(b.isCollapsed ? 'expand section' : 'collapse section');
  b.isCollapsed = !b.isCollapsed;
  if (window.DA_RENDERER) DA_RENDERER.renderAll();
}

window.DA_EDITOR = {
    splitPropositionAtOffset, splitParallelAtOffset, mergePropositions, mergeCellIntoPrevious,
    changeIndentation, setSelectionByGlobalOffset,
    deleteBracket, findBestAttachment, handleDotClick, toggleBracketCollapse, extractFormatTags,
    addPassage, extendPassageRef, checkContiguity, detectAddPosition, parseRefRange
};
