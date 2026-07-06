/**
 * Walks a contenteditable text span and extracts plain text + format tags
 * (bold / underline / color). Used by the focusout handler and Ctrl+B/U shortcut
 * to sync DOM formatting back to state. Color must be captured here too:
 * focusout rebuilds a line's formatTags entirely from this result, so any type
 * not extracted is silently dropped on the next focus change.
 */
function extractFormatTags(textSpan, propIndex) {
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
        if (node.tagName === 'B' || node.tagName === 'STRONG') {
          tags.push({ type: 'bold', propIndex, start, end });
        } else if (node.tagName === 'U') {
          tags.push({ type: 'underline', propIndex, start, end });
        } else if (node.classList && node.classList.contains('color-text')) {
          // Prefer the verbatim value stashed in data-color; fall back to the
          // computed style for spans rendered before data-color existed.
          const color = node.dataset.color || node.style.color;
          if (color) tags.push({ type: 'color', color, propIndex, start, end });
        }
      }
    }
  }
  textSpan.childNodes.forEach(traverse);
  return { text, tags };
}

function splitPropositionAtOffset(i, offset) {
  const text = DA_STATE.propositions[i];
  if (!text || offset <= 0 || offset >= text.length || text.slice(offset).trim().length === 0) return;

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

  // Adjust brackets — references are strings like "p0", "b2"
  const shiftRef = (ref, splitIdx) => {
    if (typeof ref === 'string' && ref.startsWith('p')) {
      const idx = parseInt(ref.slice(1), 10);
      if (idx > splitIdx) return 'p' + (idx + 1);
    }
    return ref;
  };
  
  const targetPropId = 'p' + i;
  // Capture which brackets reference this proposition BY INDEX before shiftRef mutates them
  const referencingIndices = [];
  DA_STATE.brackets.forEach((b, idx) => {
    const refersFrom = b.from === targetPropId;
    const refersTo = b.to === targetPropId;
    if (refersFrom || refersTo) referencingIndices.push({ idx, refersFrom, refersTo });
  });

  DA_STATE.brackets.forEach(b => {
    b.from = shiftRef(b.from, i);
    b.to = shiftRef(b.to, i);
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

  // Adjust format tags
  const newTags = [];
  DA_STATE.formatTags.forEach(f => {
    if (f.propIndex > i) {
      f.propIndex++;
    } else if (f.propIndex === i) {
      if (f.start >= secondStart) {
        f.propIndex++;
        f.start = Math.max(0, f.start - secondCut);
        f.end = Math.max(0, f.end - secondCut);
      } else if (f.end > secondStart) {
        // Spans the boundary — keep the first-half portion, copy the rest over.
        newTags.push({
          type: f.type,
          propIndex: i + 1,
          start: 0,
          end: Math.max(0, f.end - secondCut)
        });
        f.end = firstLen;
      } else {
        f.end = Math.min(f.end, firstLen);
      }
    }
  });
  if (newTags.length > 0) DA_STATE.formatTags.push(...newTags);
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
  
  DA_STATE.propositions.splice(i, 1);
  DA_STATE.verseRefs.splice(i, 1);
  DA_STATE.indentation.splice(i, 1);

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

  // Adjust format tags
  DA_STATE.formatTags.forEach(f => {
    if (f.propIndex > i) {
      f.propIndex--;
    } else if (f.propIndex === i) {
      f.propIndex = i - 1;
      f.start += prevLen;
      f.end += prevLen;
    }
  });
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

function deleteBracket(bracketIdx) {
  const bToDelete = DA_STATE.brackets[bracketIdx];
  if (!bToDelete) return;

  DA_STATE.pushUndo('delete bracket');

  // Any bracket pointing to THIS one (by id) should now point to its children.
  // References are stable ids, so nothing else needs renumbering.
  DA_STATE.brackets.forEach((b, i) => {
    if (i === bracketIdx) return;
    if (b.from === bToDelete.id) b.from = bToDelete.from;
    if (b.to === bToDelete.id) b.to = bToDelete.to;
  });

  DA_STATE.brackets.splice(bracketIdx, 1);
  DA_STATE.comments = DA_STATE.comments.filter((c) => c.type !== 'bracket' || c.target?.bracketId !== bToDelete.id);
  delete DA_STATE.bracketHighlights[bToDelete.id];

  if (window.DA_RENDERER) DA_RENDERER.renderAll();
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
    // in between. This is allowed only as a SERIES — the line(s) in the gap become
    // implicit members of one flat series (their dots are hidden at render time).
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

    // CONSTRAINT: Brackets cannot cross each other.
    const crosses = DA_STATE.brackets.some((b, i) => {
        const otherRange = DA_RENDERER.getBracketExtent(i);
        const startOverlap = Math.max(proposedMin, otherRange.from);
        const endOverlap = Math.min(proposedMax, otherRange.to);
        
        if (startOverlap < endOverlap) {
            const newContainsOld = (proposedMin <= otherRange.from && proposedMax >= otherRange.to);
            const oldContainsNew = (otherRange.from <= proposedMin && otherRange.to >= proposedMax);
            
            if (!newContainsOld && !oldContainsNew) {
                const e1 = DA_RENDERER.getPointExtent(b.from);
                const e2 = DA_RENDERER.getPointExtent(b.to);
                const e1Inside = (e1.from >= proposedMin && e1.to <= proposedMax);
                const e2Inside = (e2.from >= proposedMin && e2.to <= proposedMax);
                
                if (e1Inside || e2Inside) return false;
                return true;
            }
        }
        return false;
    });

    if (crosses) {
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

    const newBracket = {
      id: DA_STATE.newBracketId(),
      from: finalP1,
      to: finalP2,
      type: isSeriesJumpOver ? 'series' : (DA_STATE.currentRelationshipType || 'unspecified'),
      labelsSwapped: false,
      dominanceFlipped: false,
      ...(isSeriesJumpOver && { isJumpOver: true })
    };

    DA_STATE.brackets.push(newBracket);
    const newIdx = DA_STATE.brackets.length - 1;
    const newRange = DA_RENDERER.getBracketExtent(newIdx);

    DA_STATE.brackets.forEach((oldB, i) => {
        if (i === newIdx) return;
        const oldRange = DA_RENDERER.getBracketExtent(i);
        if (newRange.from <= oldRange.from && newRange.to >= oldRange.to) return;

        const fromRange = DA_RENDERER.getPointExtent(oldB.from);
        if (fromRange.from >= newRange.from && fromRange.to <= newRange.to) oldB.from = newBracket.id;

        const toRange = DA_RENDERER.getPointExtent(oldB.to);
        if (toRange.from >= newRange.from && toRange.to <= newRange.to) oldB.to = newBracket.id;
    });

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
    splitPropositionAtOffset, mergePropositions, changeIndentation, setSelectionByGlobalOffset,
    deleteBracket, findBestAttachment, handleDotClick, toggleBracketCollapse, extractFormatTags
};
