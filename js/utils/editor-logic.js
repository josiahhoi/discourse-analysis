function splitPropositionAtOffset(i, offset) {
  DA_STATE.pushUndo('split');
  const text = DA_STATE.propositions[i];
  const partsRef = (DA_STATE.verseRefs[i] || '').split('-');
  const startRef = partsRef[0];
  const endRef = partsRef[partsRef.length - 1];

  // Count markers with fuzziness (±2 characters)
  const nearbyStart = Math.max(0, offset - 2);
  const nearbyEnd = Math.min(text.length, offset + 2);
  const nearbyText = text.slice(nearbyStart, nearbyEnd);
  
  let markersBefore = (text.slice(0, offset).match(/\u200B/g) || []).length;
  let isCleanBreak = false;
  let markerIndexInText = -1;
  
  if (nearbyText.includes('\u200B')) {
    isCleanBreak = true;
    markerIndexInText = text.indexOf('\u200B', nearbyStart);
    markersBefore = (text.slice(0, markerIndexInText + 1).match(/\u200B/g) || []).length;
  }

  // Set the final text for both parts
  if (isCleanBreak) {
    DA_STATE.propositions[i] = text.slice(0, markerIndexInText).trimEnd();
    DA_STATE.propositions.splice(i + 1, 0, text.slice(markerIndexInText + 1).trimStart());
  } else {
    DA_STATE.propositions[i] = text.slice(0, offset).trimEnd();
    DA_STATE.propositions.splice(i + 1, 0, text.slice(offset).trimStart());
  }

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
  
  // Adjust brackets
  DA_STATE.brackets.forEach(b => {
    if (b.from > i) b.from++;
    if (b.to > i) b.to++;
    else if (b.to === i && b.from <= i) {
        // Bracket ends at the split proposition - it should now include the new one?
        // Usually, splitting a proposition means the bracket should extend to include the new block.
        b.to++;
    }
  });
  
  // Adjust word arrows
  DA_STATE.wordArrows.forEach(wa => {
    if (wa.fromProp > i) wa.fromProp++;
    if (wa.toProp > i) wa.toProp++;
  });
}

function mergePropositions(i) {
  if (i <= 0) return;
  DA_STATE.pushUndo('merge');
  
  const prevText = DA_STATE.propositions[i - 1];
  const currText = DA_STATE.propositions[i];
  
  const refA = DA_STATE.verseRefs[i - 1] || '';
  const refB = DA_STATE.verseRefs[i] || '';
  
  const endA = refA.split('-').pop();
  const startB = refB.split('-')[0];
  
  // Only insert the invisible marker if we are transitioning to a NEW verse
  if (endA && startB && endA !== startB) {
    DA_STATE.propositions[i - 1] = (prevText + '\u200B' + currText).trim();
  } else {
    DA_STATE.propositions[i - 1] = (prevText + ' ' + currText).trim();
  }
  
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
  
  // Adjust brackets
  DA_STATE.brackets.forEach((b, bIdx) => {
    if (b.from >= i) b.from--;
    if (b.to >= i) b.to--;
  });
  
  // Remove brackets that now have from > to
  DA_STATE.brackets = DA_STATE.brackets.filter(b => b.from <= b.to);
  
  // Adjust word arrows
  DA_STATE.wordArrows.forEach(wa => {
    if (wa.fromProp >= i) wa.fromProp--;
    if (wa.toProp >= i) wa.toProp--;
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
  }
}

function deleteBracket(bracketIdx) {
  const bToDelete = DA_STATE.brackets[bracketIdx];
  if (!bToDelete) return;

  DA_STATE.pushUndo('delete bracket');

  const bRef = 'b' + bracketIdx;

  // 1. Any bracket pointing to THIS one should now point to its children
  DA_STATE.brackets.forEach((b, i) => {
    if (i === bracketIdx) return;
    if (b.from === bRef) b.from = bToDelete.from;
    if (b.to === bRef) b.to = bToDelete.to;
  });

  // 2. Remove the bracket from state
  DA_STATE.brackets.splice(bracketIdx, 1);

  // 3. Fix indices in ALL 'bN' references because they just shifted
  DA_STATE.brackets.forEach((b) => {
    const fix = (val) => {
      if (typeof val === 'string' && val.startsWith('b')) {
        const idx = parseInt(val.slice(1), 10);
        if (idx > bracketIdx) return 'b' + (idx - 1);
      }
      return val;
    };
    b.from = fix(b.from);
    b.to = fix(b.to);
  });

  // 4. Update comments references
  DA_STATE.comments = DA_STATE.comments.filter((c) => c.type !== 'bracket' || c.target?.bracketIdx !== bracketIdx);
  DA_STATE.comments.forEach((c) => {
    if (c.type === 'bracket' && c.target?.bracketIdx > bracketIdx) c.target.bracketIdx--;
  });

  if (window.DA_RENDERER) DA_RENDERER.renderAll();
}

function findBestAttachment(pId, proposedMin, proposedMax) {
    if (pId.toString().startsWith('b')) return pId;
    
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
                    bestB = 'b' + i;
                }
            }
        }
    });
    
    return bestB || pId;
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
      DA_STATE.bracketSelectStep = 0;
      DA_STATE.firstBracketPoint = null;
      bracketCanvas?.classList.remove('connect-mode');
      if (window.DA_RENDERER) DA_RENDERER.renderAll();
      return;
    }

    DA_STATE.pushUndo('add bracket');
    
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

    if (firstEnd + 1 !== secondStart) {
        DA_UI.showStatus('Brackets must connect adjacent items. No "jumping over" allowed.', 'error');
        DA_STATE.bracketSelectStep = 0;
        DA_STATE.firstBracketPoint = null;
        bracketCanvas?.classList.remove('connect-mode');
        if (window.DA_RENDERER) DA_RENDERER.renderAll();
        return;
    }

    // If both resolve to the same target, block creation
    if (finalP1 === finalP2) {
      DA_UI.showStatus('Bracket already exists for this exact range', 'warning');
      DA_STATE.bracketSelectStep = 0;
      DA_STATE.firstBracketPoint = null;
      bracketCanvas?.classList.remove('connect-mode');
      if (window.DA_RENDERER) DA_RENDERER.renderAll();
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
        DA_STATE.bracketSelectStep = 0;
        DA_STATE.firstBracketPoint = null;
        bracketCanvas?.classList.remove('connect-mode');
        if (window.DA_RENDERER) DA_RENDERER.renderAll();
        return;
    }

    const p1AlreadyBusy = DA_STATE.brackets.some(b => b.from === p1 || b.to === p1);
    const p2AlreadyBusy = DA_STATE.brackets.some(b => b.from === p2 || b.to === p2);
    const finalP1IsNode = finalP1.toString().startsWith('p');
    const finalP2IsNode = finalP2.toString().startsWith('p');

    if (finalP1IsNode && finalP2IsNode && p1AlreadyBusy && p2AlreadyBusy) {
        DA_UI.showStatus('Cannot connect two nodes that are already bracketed. Connect their dots instead.', 'error');
        DA_STATE.bracketSelectStep = 0;
        DA_STATE.firstBracketPoint = null;
        bracketCanvas?.classList.remove('connect-mode');
        if (window.DA_RENDERER) DA_RENDERER.renderAll();
        return;
    }

    const exists = DA_STATE.brackets.some(b => 
      (b.from === finalP1 && b.to === finalP2) || 
      (b.from === finalP2 && b.to === finalP1)
    );
    if (exists) {
      DA_UI.showStatus('Bracket already exists between these nodes', 'warning');
      DA_STATE.bracketSelectStep = 0;
      DA_STATE.firstBracketPoint = null;
      bracketCanvas?.classList.remove('connect-mode');
      if (window.DA_RENDERER) DA_RENDERER.renderAll();
      return;
    }

    const newBracket = {
      id: Date.now().toString(),
      from: finalP1,
      to: finalP2,
      type: DA_STATE.currentRelationshipType || 'unspecified',
      labelsSwapped: false,
      dominanceFlipped: false
    };

    DA_STATE.brackets.push(newBracket);
    const newIdx = DA_STATE.brackets.length - 1;
    const newBracketId = `b${newIdx}`;
    const newRange = DA_RENDERER.getBracketExtent(newIdx);

    DA_STATE.brackets.forEach((oldB, i) => {
        if (i === newIdx) return;
        const oldRange = DA_RENDERER.getBracketExtent(i);
        if (newRange.from <= oldRange.from && newRange.to >= oldRange.to) return;

        const fromRange = DA_RENDERER.getPointExtent(oldB.from);
        if (fromRange.from >= newRange.from && fromRange.to <= newRange.to) oldB.from = newBracketId;

        const toRange = DA_RENDERER.getPointExtent(oldB.to);
        if (toRange.from >= newRange.from && toRange.to <= newRange.to) oldB.to = newBracketId;
    });

    DA_UI.showStatus('Bracket created', 'success');
    DA_STATE.bracketSelectStep = 0;
    DA_STATE.firstBracketPoint = null;
    bracketCanvas?.classList.remove('connect-mode');
    
    if (window.DA_RENDERER) DA_RENDERER.renderAll();
    
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
    deleteBracket, findBestAttachment, handleDotClick, toggleBracketCollapse
};
