window.DA_KEYBOARD = {
  initGlobalShortcuts: function() {
    document.addEventListener('keydown', (e) => {
      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const el = document.activeElement;
        const block = el && el.closest ? el.closest('.proposition-block') : null;

        if (block) {
          // Focus is in a proposition. If there's uncommitted typing in this field,
          // let the browser's native field-level undo handle it (so we don't wipe
          // the in-progress edit, which only commits to state on focusout). But if
          // the field matches state (e.g. focus landed here after a split/merge),
          // there's nothing to undo natively — run the same document-level undo as
          // the Undo button, so structural actions are undoable from the keyboard.
          const i = parseInt(block.dataset.index, 10);
          const span = block.querySelector('.proposition-text');
          let hasUncommitted = false;
          if (span && !isNaN(i) && window.DA_EDITOR && DA_EDITOR.extractFormatTags) {
            hasUncommitted = DA_EDITOR.extractFormatTags(span, i).text !== DA_STATE.propositions[i];
          }
          if (hasUncommitted) return; // native undo for the live edit
          e.preventDefault();
          if (el.blur) el.blur(); // leave the field so renderAll can rebuild cleanly
          if (typeof undoLastAction === 'function') undoLastAction();
          return;
        }

        // Other text fields (comment box, reply, passage ref, inputs): leave the
        // browser's native undo alone rather than hijacking it for a document undo.
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
          return;
        }
        e.preventDefault();
        if (typeof undoLastAction === 'function') undoLastAction();
      }
      
      // Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (typeof saveBracket === 'function') saveBracket();
      }

      // Escape key handlers
      if (e.key === 'Escape') {
        // 1. Cancel in-progress bracket or arrow creation
        if (DA_STATE.bracketSelectStep === 1) {
          DA_STATE.bracketSelectStep = 0;
          DA_STATE.firstBracketPoint = null;
          DA_UI.clearPropositionHighlights();
          document.getElementById('bracketCanvas')?.classList.remove('connect-mode');
          DA_UI.showStatus('Bracket selection cancelled.', 'info');
          if (window.renderAll) window.renderAll();
          return;
        }
        if (DA_STATE.arrowMode && window.pendingArrowStart) {
          window.pendingArrowStart = null;
          if (window.arrowHighlight) window.arrowHighlight.style.display = 'none';
          DA_UI.showStatus('Arrow selection cancelled.', 'info');
          return;
        }

        // 2. Dismiss any active popovers
        const labelPicker = document.getElementById('labelPicker');
        const bracketActions = document.getElementById('bracketActions');
        const commentPopover = document.getElementById('commentPopover');
        const settingsModal = document.getElementById('settingsModal');
        
        if (labelPicker || bracketActions || commentPopover || (settingsModal && settingsModal.style.display === 'flex')) {
          if (labelPicker) labelPicker.remove();
          if (bracketActions) {
            bracketActions.remove();
            DA_UI.clearPropositionHighlights();
          }
          if (commentPopover) commentPopover.remove();
          if (settingsModal) DA_UI.closeSettings();
          return;
        }

        // 3. Exit active modes (Text Edit, Arrow, or Comment)
        if (DA_STATE.textEditMode) {
          document.getElementById('textEditModeBtn')?.click();
          return;
        }
        if (DA_STATE.arrowMode) {
          document.getElementById('arrowModeBtn')?.click();
          return;
        }
        if (DA_STATE.commentMode) {
          document.getElementById('commentModeBtn')?.click();
          return;
        }

        if (DA_STATE.selectedArrowIdx !== null) {
          DA_STATE.selectedArrowIdx = null;
          if (window.renderAll) window.renderAll();
          return;
        }
      }

      // Delete/Backspace globally
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const activeNode = document.activeElement;
        if (activeNode.tagName === 'INPUT' || activeNode.tagName === 'TEXTAREA' || activeNode.isContentEditable) return;

        if (DA_STATE.selectedArrowIdx !== null && DA_STATE.selectedArrowIdx < DA_STATE.wordArrows.length) {
          DA_STATE.pushUndo('delete arrow');
          DA_STATE.wordArrows.splice(DA_STATE.selectedArrowIdx, 1);
          DA_STATE.selectedArrowIdx = null;
          if (window.renderAll) window.renderAll();
          DA_UI.showStatus('Arrow removed.', 'success');
        }
      }
    }, true);
  },

  initEditorShortcuts: function(container) {
    if (!container) return;

    container.addEventListener('keydown', (e) => {
      const block = e.target.closest('.proposition-block');
      if (!block) return;
      const i = parseInt(block.dataset.index, 10);
      const textSpan = block.querySelector('.proposition-text') || block;

      const sel = window.getSelection();
      const hasSelection = sel && !sel.isCollapsed;
      const isArrowKey = e.key.startsWith('Arrow');
      
      // --- BOLD / UNDERLINE SHORTCUTS ---
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'u')) {
        e.preventDefault();
        const command = e.key === 'b' ? 'bold' : 'underline';
        document.execCommand(command, false, null);
        
        if (textSpan) {
          const result = DA_EDITOR.extractFormatTags(textSpan, i);
          DA_STATE.formatTags = DA_STATE.formatTags.filter(f => f.propIndex !== i).concat(result.tags);
        }
        return;
      }
      
      // --- TEXT SHIFTING ---
      if (hasSelection && isArrowKey && !e.shiftKey) {
        const range = sel.getRangeAt(0);
        if (textSpan.contains(range.commonAncestorContainer) || textSpan === range.commonAncestorContainer) {
            e.preventDefault();
            
            const shiftText = sel.toString();
            const srcText = DA_STATE.propositions[i];
            
            const preRange = document.createRange();
            preRange.setStart(textSpan, 0);
            preRange.setEnd(range.startContainer, range.startOffset);
            const startOffset = preRange.toString().length;

            let lines = srcText.split('\n');
            let currentPos = 0;
            let lineIdx = -1;
            let offsetInLine = -1;
            
            for (let j = 0; j < lines.length; j++) {
                const lineEnd = currentPos + lines[j].length;
                if (startOffset >= currentPos && startOffset <= lineEnd) {
                    lineIdx = j;
                    offsetInLine = startOffset - currentPos;
                    break;
                }
                currentPos += lines[j].length + 1; // +1 for \n
            }

            if (lineIdx === -1) return;

            DA_STATE.pushUndo('shift text', String(i));

            const lineLeading = lines[lineIdx].match(/^ +/)?.[0] || "";
            const lineContent = lines[lineIdx].substring(lineLeading.length);
            const lineOffset = Math.max(0, offsetInLine - lineLeading.length);
            
            const beforeRem = lineContent.substring(0, lineOffset);
            const afterRem = lineContent.substring(lineOffset + shiftText.length);
            lines[lineIdx] = lineLeading + (beforeRem + afterRem).replace(/\s+$/, '');

            let targetLineIdx = lineIdx;
            let newOffsetInLine = 0;

            if (e.key === 'ArrowDown') {
                targetLineIdx = lineIdx + 1;
                if (targetLineIdx >= lines.length) lines.push("");
                
                const leadingSpaces = lines[targetLineIdx].match(/^ +/)?.[0] || "";
                const rest = lines[targetLineIdx].substring(leadingSpaces.length);
                const hasContent = rest.trim().length > 0;
                lines[targetLineIdx] = leadingSpaces + shiftText + (hasContent ? "        " + rest.replace(/^\s+/, '') : "");
                newOffsetInLine = leadingSpaces.length;
            } else if (e.key === 'ArrowUp') {
                targetLineIdx = lineIdx - 1;
                if (targetLineIdx < 0) {
                    const rest = lines[0];
                    const hasContent = rest.trim().length > 0;
                    lines[0] = shiftText + (hasContent ? "        " + rest.replace(/^\s+/, '') : "");
                    targetLineIdx = 0;
                    newOffsetInLine = 0;
                } else {
                    const hasContent = lines[targetLineIdx].trim().length > 0;
                    lines[targetLineIdx] = lines[targetLineIdx].replace(/\s+$/, '') + (hasContent ? "        " : "") + shiftText;
                    newOffsetInLine = lines[targetLineIdx].length - shiftText.length;
                }
            } else if (e.key === 'ArrowLeft') {
                targetLineIdx = lineIdx;
                const leadingSpaces = lines[targetLineIdx].match(/^ +/)?.[0] || "";
                const rest = lines[targetLineIdx].substring(leadingSpaces.length);
                const hasContent = rest.trim().length > 0;
                lines[targetLineIdx] = leadingSpaces + shiftText + (hasContent ? "        " + rest.replace(/^\s+/, '') : "");
                newOffsetInLine = leadingSpaces.length;
            } else if (e.key === 'ArrowRight') {
                targetLineIdx = lineIdx;
                const leadingSpaces = lines[targetLineIdx].match(/^ +/)?.[0] || "";
                const rest = lines[targetLineIdx].substring(leadingSpaces.length);
                const hasContent = rest.trim().length > 0;
                lines[targetLineIdx] = leadingSpaces + rest.replace(/\s+$/, '') + (hasContent ? "        " : "") + shiftText;
                newOffsetInLine = lines[targetLineIdx].length - shiftText.length;
            }

            DA_STATE.propositions[i] = lines.join('\n');
            
            DA_STATE._forceNextRender = true;
            if (window.renderAll) window.renderAll();
            DA_STATE._forceNextRender = false;
            
            let newGlobalOffset = 0;
            for (let j = 0; j < targetLineIdx; j++) {
                newGlobalOffset += lines[j].length + 1;
            }
            newGlobalOffset += newOffsetInLine;

            requestAnimationFrame(() => {
                const targetBlock = container.querySelector(`.proposition-block[data-index="${i}"]`);
                const newTextSpan = targetBlock?.querySelector('.proposition-text');
                if (newTextSpan) {
                    newTextSpan.focus();
                    DA_EDITOR.setSelectionByGlobalOffset(newTextSpan, newGlobalOffset, newGlobalOffset + shiftText.length);
                }
            });
            return;
        }
      }

      // --- BACKSPACE / MERGE ---
      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel?.rangeCount) {
          const range = sel.getRangeAt(0);
          if (range.collapsed) {
            const preRange = document.createRange();
            preRange.setStart(textSpan, 0);
            preRange.setEnd(range.startContainer, range.startOffset);
            const preText = preRange.toString();

            const currentLine = preText.split('\n').pop();
            const trailingSpaces = (currentLine.match(/ +$/) || [''])[0].length;
            if (trailingSpaces > 0) {
              e.preventDefault();
              const toRemove = Math.min(8, trailingSpaces);
              const newRange = document.createRange();
              newRange.setStart(range.startContainer, range.startOffset - toRemove);
              newRange.setEnd(range.startContainer, range.startOffset);
              newRange.deleteContents();
              // deleteContents() doesn't fire an 'input' event, so redraw arrows
              // now instead of waiting for the next render (avoids a visible lag).
              DA_RENDERER.scheduleVisualUpdate();
              return;
            }

            if (preText.length === 0 && i > 0) {
              e.preventDefault();

              const prevBlock = container.querySelector(`.proposition-block[data-index="${i - 1}"]`);
              const prevTextSpan = prevBlock?.querySelector('.proposition-text');

              // Commit this block's current text before merging — edits otherwise
              // only commit on focusout, so a merge would run on stale text.
              const _c = DA_EDITOR.extractFormatTags(textSpan, i);
              DA_STATE.propositions[i] = _c.text;
              DA_STATE.formatTags = DA_STATE.formatTags.filter(f => f.propIndex !== i).concat(_c.tags);

              const prevLen = DA_STATE.propositions[i - 1].length;
              DA_EDITOR.mergePropositions(i);
              if (window.renderAll) window.renderAll();
              requestAnimationFrame(() => {
                const prevBlock = container.querySelector(`.proposition-block[data-index="${i - 1}"]`);
                const prevTextSpan = prevBlock?.querySelector('.proposition-text');
                if (prevTextSpan) {
                  prevTextSpan.focus();
                  DA_EDITOR.setSelectionByGlobalOffset(prevTextSpan, prevLen, prevLen);
                }
              });
              return;
            }
          }
        }
      }

      // --- TEXT EDIT MODE SPECIFIC ---
      if (DA_STATE.textEditMode) {
        if (e.key === 'Tab') {
          e.preventDefault();
          const sel = window.getSelection();
          const range = sel.getRangeAt(0);

          if (e.shiftKey) {
            const preRange = document.createRange();
            preRange.setStart(textSpan, 0);
            preRange.setEnd(range.startContainer, range.startOffset);
            const preText = preRange.toString();
            const currentLine = preText.split('\n').pop();
            
            if (currentLine.startsWith(' ')) {
              const spaces = currentLine.match(/^ +/)[0].length;
              const toRemove = Math.min(8, spaces);
              const newRange = document.createRange();
              newRange.setStart(range.startContainer, range.startOffset - currentLine.length);
              newRange.setEnd(range.startContainer, range.startOffset - currentLine.length + toRemove);
              newRange.deleteContents();
              // deleteContents() doesn't fire an 'input' event, so redraw arrows
              // now instead of waiting for the next render (avoids a visible lag).
              DA_RENDERER.scheduleVisualUpdate();
            }
          } else {
            document.execCommand('insertText', false, '        ');
          }
          return;
        }
        
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          
          const sel = window.getSelection();
          const range = sel.getRangeAt(0);
          const preRange = document.createRange();
          preRange.setStart(textSpan, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const preText = preRange.toString();
          
          const lines = preText.split('\n');
          const currentLine = lines[lines.length - 1];
          const match = currentLine.match(/^ +/);
          const indentation = match ? match[0] : '';
          
          document.execCommand('insertText', false, '\n' + indentation);
          return;
        }
      }

      // --- ENTER FOR SPLITTING ---
      if (e.key === 'Enter' && !e.shiftKey && !DA_STATE.textEditMode) {
        e.preventDefault();
        const sel = window.getSelection();
        if (sel?.rangeCount) {
          const range = sel.getRangeAt(0);
          const preRange = document.createRange();
          preRange.setStart(textSpan, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const offset = preRange.toString().length;
          // Commit this block's current text before splitting — edits otherwise
          // only commit on focusout, so the split would run on stale text (and the
          // length guard could even make Enter silently do nothing).
          const _c = DA_EDITOR.extractFormatTags(textSpan, i);
          DA_STATE.propositions[i] = _c.text;
          DA_STATE.formatTags = DA_STATE.formatTags.filter(f => f.propIndex !== i).concat(_c.tags);
          DA_EDITOR.splitPropositionAtOffset(i, offset);

          if (window.renderAll) window.renderAll();
          
          requestAnimationFrame(() => {
            const newBlock = container.querySelector(`.proposition-block[data-index="${i + 1}"]`);
            const newTextSpan = newBlock?.querySelector('.proposition-text');
            if (newTextSpan) {
              newTextSpan.focus();
              DA_EDITOR.setSelectionByGlobalOffset(newTextSpan, 0, 0);
            }
          });
        }
      }
    });
  }
};
