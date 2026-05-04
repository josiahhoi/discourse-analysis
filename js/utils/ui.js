/**
 * Discourse Analysis UI Utilities
 */

function showStatus(message, type = 'info') {
    const existing = document.querySelector('.status');
    if (existing) existing.remove();
  
    const el = document.createElement('div');
    el.className = `status ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
  
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 3000);
}

function updateCloudUI(isActive, projectId = '') {
    const badge = document.getElementById('cloudHeaderStatus');
    const idSpan = document.getElementById('headerProjectId');
    
    if (isActive) {
      if (badge) badge.style.display = 'flex';
      if (idSpan) idSpan.textContent = projectId;
    } else {
      if (badge) badge.style.display = 'none';
    }
}

function isGurtnerMode() {
  const reviewerNameInput = document.getElementById('reviewerName');
  const name = (reviewerNameInput?.value || '').trim().toLowerCase();
  return name.includes('gurtner');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


function setupClickOutside(el, onDismiss) {
  const dismiss = (e) => {
    // If the element has been removed from the DOM already, stop
    if (!el.parentNode) {
      document.removeEventListener('click', dismiss);
      return;
    }
    // Check if click was outside
    if (!el.contains(e.target)) {
      onDismiss();
      document.removeEventListener('click', dismiss);
    }
  };
  // Timeout ensures the trigger click doesn't immediately close it
  setTimeout(() => document.addEventListener('click', dismiss), 10);
  return dismiss; // Return the function so it can be manually removed if needed
}

function clearPropositionHighlights() {
  document.querySelectorAll('.proposition-block').forEach(block => {
    block.classList.remove('highlight', 'searching');
  });
}

function getCommentForBracket(bracketIdx) {
  return DA_STATE.comments.find(c => c.type === 'bracket' && c.target?.bracketIdx === bracketIdx);
}

function showCommentPopover(config) {
  const { propIndex, start, end, bracketIdx, existingCommentId, anchorX, anchorY, options = {} } = config;
  const isBracket = bracketIdx !== undefined;
  
  const existing = document.getElementById('commentPopover');
  if (existing) {
    existing.remove();
    DA_STATE.activeCommentTarget = null;
  }

  // Set active target for highlighting while popover is open
  DA_STATE.activeCommentTarget = isBracket 
    ? { type: 'bracket', bracketIdx } 
    : { type: 'text', propIndex, start, end };
  if (window.renderAll) window.renderAll();

  const popover = document.createElement('div');
  popover.id = 'commentPopover';
  popover.className = 'comment-popover';
  popover.style.width = '640px'; 
  
  let comment = existingCommentId ? DA_STATE.comments.find(c => c.id === existingCommentId) : null;
  
  const formatDate = (ts) => {
    if (!ts) return 'Unknown Date';
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 'Unknown Date' : d.toLocaleString();
  };

  // Calculate target description for the header
  let targetDesc = isBracket ? 'Bracket Comment' : 'Text Comment';
  const chapterMatch = (DA_STATE.passageRef || '').match(/(\d+):/);
  const chapter = chapterMatch ? chapterMatch[1] : '';

  if (isBracket) {
    const b = DA_STATE.brackets[bracketIdx];
    const extent = DA_RENDERER.getBracketExtent(bracketIdx);
    const v1 = DA_RENDERER.computeVerseDisplay(extent.from) || '?';
    const v2 = DA_RENDERER.computeVerseDisplay(extent.to) || '?';
    const vsRange = v1 === v2 ? v1 : `${v1}-${v2}`;
    const fullRef = chapter ? `${chapter}:${vsRange}` : vsRange;
    targetDesc = `Bracket (${fullRef}): ${b ? formatBracketType(b.type) : 'Unknown'}`;
  } else if (propIndex !== undefined) {
    const verse = DA_RENDERER.computeVerseDisplay(propIndex) || '?';
    const fullRef = chapter ? `${chapter}:${verse}` : verse;
    const text = DA_STATE.propositions[propIndex] || '';
    const snippet = text.substring(start, end);
    targetDesc = `${fullRef}: "${snippet}"`;
  }

  const renderContent = () => {
    popover.innerHTML = `
      <div class="popover-header">
        <span class="popover-title">${escapeHtml(targetDesc)}</span>
        <div class="header-actions">
          <button class="close-btn icon-btn" title="Close">&times;</button>
        </div>
      </div>
      <div class="popover-body">
        ${comment ? `
          <div class="comment-display">
            <div class="comment-meta">
              <div class="meta-left">
                <span class="comment-author">${escapeHtml(comment.author || 'Anonymous')}</span>
                <span class="comment-time">${formatDate(comment.timestamp || comment.createdAt)}</span>
              </div>
              <div class="action-buttons">
                <button class="edit-btn action-btn">Edit</button>
                <button class="delete-btn action-btn">Delete</button>
              </div>
            </div>
            <div class="comment-text">${escapeHtml(comment.text)}</div>
          </div>
          <div class="comment-edit-area" style="display:none">
            <textarea placeholder="Edit comment...">${escapeHtml(comment.text)}</textarea>
            <div class="edit-actions">
              <button class="save-btn">Save</button>
              <button class="cancel-btn">Cancel</button>
            </div>
          </div>
          <div class="replies-section">
            <div class="replies-list">
              ${(comment.replies || []).map((r, rIdx) => `
                <div class="reply-item" data-idx="${rIdx}">
                  <div class="comment-meta">
                    <div class="meta-left">
                      <span class="comment-author">${escapeHtml(r.author)}</span>
                      <span class="comment-time">${formatDate(r.timestamp || r.createdAt)}</span>
                    </div>
                    <div class="action-buttons">
                      <button class="edit-reply-btn action-btn">Edit</button>
                      <button class="delete-reply-btn action-btn">Delete</button>
                    </div>
                  </div>
                  <div class="comment-text">${escapeHtml(r.text)}</div>
                  <div class="reply-edit-area" style="display:none">
                    <textarea>${escapeHtml(r.text)}</textarea>
                    <div class="edit-actions">
                      <button class="save-reply-btn">Save</button>
                      <button class="cancel-reply-btn">Cancel</button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="reply-input-row">
              <input type="text" class="reply-input" placeholder="Reply...">
              <button class="send-reply-btn" title="Send reply">→</button>
            </div>
          </div>
        ` : `
          <textarea placeholder="Add a comment..."></textarea>
          <div class="comment-actions">
            <button class="save-new-btn">Add Comment</button>
          </div>
        `}
      </div>
    `;
    attachListeners();
  };

  const attachListeners = () => {
    popover.querySelector('.close-btn').onclick = () => {
      DA_STATE.activeCommentTarget = null;
      if (window.renderAll) window.renderAll();
      popover.remove();
    };

    if (!comment) {
      popover.querySelector('.save-new-btn').onclick = () => {
        const text = popover.querySelector('textarea').value.trim();
        if (!text) return;
        DA_STATE.pushUndo('add comment');
        const newComment = {
          id: Date.now().toString(),
          author: localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || 'Anonymous',
          text,
          timestamp: Date.now(),
          type: isBracket ? 'bracket' : 'text',
          target: isBracket ? { bracketIdx } : { propIndex, start, end },
          replies: []
        };
        DA_STATE.comments.push(newComment);
        comment = newComment;
        renderContent();
        if (window.renderAll) window.renderAll();
      };
    } else {
      const display = popover.querySelector('.comment-display');
      const editArea = popover.querySelector('.comment-edit-area');
      
      popover.querySelector('.edit-btn').onclick = () => {
        display.style.display = 'none';
        editArea.style.display = 'block';
      };
      
      popover.querySelector('.cancel-btn').onclick = () => {
        display.style.display = 'block';
        editArea.style.display = 'none';
      };
      
      popover.querySelector('.save-btn').onclick = () => {
        const text = editArea.querySelector('textarea').value.trim();
        if (!text) return;
        DA_STATE.pushUndo('edit comment');
        comment.text = text;
        comment.timestamp = Date.now();
        renderContent();
        if (window.renderAll) window.renderAll();
      };
      
      popover.querySelector('.delete-btn').onclick = () => {
        if (!confirm('Delete this comment?')) return;
        DA_STATE.pushUndo('delete comment');
        DA_STATE.comments = DA_STATE.comments.filter(c => c.id !== comment.id);
        DA_STATE.activeCommentTarget = null;
        popover.remove();
        if (window.renderAll) window.renderAll();
      };
      
      const replyInput = popover.querySelector('.reply-input');
      const sendBtn = popover.querySelector('.send-reply-btn');
      
      const submitReply = () => {
        const text = replyInput.value.trim();
        if (!text) return;
        DA_STATE.pushUndo('reply to comment');
        comment.replies = comment.replies || [];
        comment.replies.push({
          author: localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || 'Anonymous',
          text,
          timestamp: Date.now()
        });
        renderContent();
        if (window.renderAll) window.renderAll();
      };

      if (sendBtn) sendBtn.onclick = submitReply;
      if (replyInput) {
        replyInput.onkeydown = (e) => {
          if (e.key === 'Enter') submitReply();
        };
      }

      popover.querySelectorAll('.reply-item').forEach(item => {
        const idx = parseInt(item.dataset.idx, 10);
        const reply = comment.replies[idx];
        const rDisplay = item.querySelector('.comment-text');
        const rEditArea = item.querySelector('.reply-edit-area');

        item.querySelector('.edit-reply-btn').onclick = () => {
          rDisplay.style.display = 'none';
          rEditArea.style.display = 'block';
        };

        item.querySelector('.cancel-reply-btn').onclick = () => {
          rDisplay.style.display = 'block';
          rEditArea.style.display = 'none';
        };

        item.querySelector('.save-reply-btn').onclick = () => {
          const newText = rEditArea.querySelector('textarea').value.trim();
          if (!newText) return;
          DA_STATE.pushUndo('edit reply');
          reply.text = newText;
          reply.timestamp = Date.now();
          renderContent();
          if (window.renderAll) window.renderAll();
        };

        item.querySelector('.delete-reply-btn').onclick = () => {
          if (!confirm('Delete this reply?')) return;
          DA_STATE.pushUndo('delete reply');
          comment.replies.splice(idx, 1);
          renderContent();
          if (window.renderAll) window.renderAll();
        };
      });
    }
  };

  const wrapper = document.getElementById('propositionsContainer')?.parentElement || document.body;
  const rect = wrapper.getBoundingClientRect();
  
  // Standardize position for all comment popovers: always center horizontally, 
  // and set to a consistent vertical position (28% is slightly lower than the old 20%).
  popover.style.left = '50%';
  popover.style.top = '28%';
  popover.style.transform = 'translateX(-50%)';

  renderContent();
  wrapper.appendChild(popover);
  makePopupDraggable(popover, '.popover-header');
  if (typeof makeCommentPopoverDraggableAndResizable === 'function') {
    makeCommentPopoverDraggableAndResizable(popover);
  }
  setupClickOutside(popover, () => {
    DA_STATE.activeCommentTarget = null;
    if (window.renderAll) window.renderAll();
    popover.remove();
  });
}

function showCommentPopoverForText(propIndex, start, end, existingCommentId = null, options = {}) {
  showCommentPopover({ propIndex, start, end, existingCommentId, options });
}

function showCommentPopoverForBracket(bracketIdx, centerY, centerX, options = {}) {
  const comment = getCommentForBracket(bracketIdx);
  showCommentPopover({ 
    bracketIdx, 
    existingCommentId: comment?.id, 
    anchorX: centerX, 
    anchorY: centerY, 
    options 
  });
}

function showBracketActions(bracketIdx, centerY, centerX) {
  const existing = document.getElementById('bracketActions');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'bracketActions';
  popover.className = 'context-menu'; // Use standard context menu styling
  const bracket = DA_STATE.brackets[bracketIdx];
  const hasTwoLabels = !DA_CONSTANTS.SINGLE_LABEL_TYPES.has(bracket.type);
  const hasComment = !!getCommentForBracket(bracketIdx);
  
  popover.innerHTML = `
    <div class="menu-item" data-action="fold">${bracket.isCollapsed ? 'Expand Section' : 'Collapse Section'}</div>
    <div class="menu-item" data-action="comment">${hasComment ? 'View Comment' : 'Add Comment'}</div>
    <div class="menu-item" data-action="select">Connect to...</div>
    <hr>
    <div class="menu-item danger" data-action="delete">Delete Bracket</div>
  `;

  const propositionsContainer = document.getElementById('propositionsContainer');
  const wrapper = propositionsContainer?.parentElement || document.body;

  popover.style.left = `${centerX}px`;
  popover.style.top = `${centerY}px`;
  document.body.appendChild(popover);

  const clearAndDismiss = () => popover.remove();

  popover.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    DA_EDITOR.deleteBracket(bracketIdx);
    clearAndDismiss();
    showStatus('Bracket removed.', 'success');
  });


  popover.querySelector('[data-action="fold"]').addEventListener('click', (e) => {
    e.stopPropagation();
    DA_EDITOR.toggleBracketCollapse(bracketIdx);
    clearAndDismiss();
  });

  if (hasTwoLabels) {
    // These actions are now moved to the label picker
  }

  popover.querySelector('[data-action="select"]').addEventListener('click', (e) => {
    e.stopPropagation();
    DA_STATE.firstBracketPoint = `b${bracketIdx}`;
    DA_STATE.bracketSelectStep = 1;
    document.getElementById('bracketCanvas')?.classList.add('connect-mode');
    showStatus('Bracket selected. Click a node or dot to connect.', 'info');
    clearAndDismiss();
  });

  popover.querySelector('[data-action="comment"]').addEventListener('click', (e) => {
    e.stopPropagation();
    showCommentPopoverForBracket(bracketIdx, centerY, centerX);
    clearAndDismiss();
  });

  setupClickOutside(popover, () => popover.remove());
}

function showTextContextMenu(propIndex, start, end, centerY, centerX, anchorRect) {
  const existing = document.getElementById('textContextMenu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'textContextMenu';
  menu.className = 'context-menu';
  menu.innerHTML = `
    <div class="menu-item" data-action="add-comment">Add Comment</div>
  `;

  menu.style.left = `${centerX}px`;
  menu.style.top = `${centerY}px`;
  document.body.appendChild(menu);

  menu.querySelector('[data-action="add-comment"]').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.remove();
    showCommentPopoverForText(propIndex, start, end, null, { anchorRect });
  });

  setupClickOutside(menu, () => menu.remove());
}

function showLabelPicker(bracketIdx, centerY, centerX) {
  const existing = document.getElementById('labelPicker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'labelPicker';
  picker.className = 'label-picker';
  
  const bracket = DA_STATE.brackets[bracketIdx];
  const hasTwoLabels = !DA_CONSTANTS.SINGLE_LABEL_TYPES.has(bracket.type);
  const RELATIONSHIP_LABELS = DA_CONSTANTS.RELATIONSHIP_LABELS;
  const GURTNER_RELATIONSHIP_NAMES = DA_CONSTANTS.GURTNER_RELATIONSHIP_NAMES;

  picker.innerHTML = `
    <div class="picker-title">
      <span>Choose Relationship</span>
      <div class="picker-header-tools">
        <button class="tool-btn" data-action="add-custom" title="Add Custom Label">Custom Label</button>
        ${hasTwoLabels ? '<button class="tool-btn" data-action="swap" title="Swap Labels">⇅ Swap</button>' : ''}
        ${hasTwoLabels ? '<button class="tool-btn" data-action="flip-dominance" title="Switch Stars">★ Switch Stars</button>' : ''}
      </div>
    </div>
    <div class="relationship-picker-content"></div>
    <div class="picker-footer">
      <button class="delete-btn">Delete Bracket</button>
    </div>
  `;

  const content = picker.querySelector('.relationship-picker-content');

  const RELATIONSHIP_GROUPS_LIST = [
    {
      name: 'COORDINATE RELATIONSHIPS',
      types: ['series', 'progression', 'alternative', 'both-and', 'anticipation-fulfillment']
    },
    {
      name: 'SUBORDINATE RELATIONSHIPS',
      subgroups: [
        {
          name: 'Support by Restatement',
          types: ['action-manner', 'comparison', 'negative-positive', 'question-answer', 'idea-explanation', 'general-specific', 'fact-interpretation']
        },
        {
          name: 'Support by Distinct Statement',
          types: ['ground', 'inference', 'bilateral', 'action-result', 'action-purpose', 'conditional', 'temporal', 'locative']
        },
        {
          name: 'Support by Contrary Statement',
          types: ['concessive', 'situation-response']
        }
      ]
    }
  ];

  // Group 1: My Presets (Persistent)
  if (DA_STATE.savedCustomLabels && DA_STATE.savedCustomLabels.length > 0) {
    RELATIONSHIP_GROUPS_LIST.push({
      name: 'MY PRESET LABELS',
      types: DA_STATE.savedCustomLabels.map(cl => cl.id)
    });
  }

  // Group 2: Project Labels (Session only, not in my bank)
  const projectSpecific = (DA_STATE.customLabels || []).filter(cl => 
    !DA_STATE.savedCustomLabels.some(s => s.id === cl.id)
  );
  if (projectSpecific.length > 0) {
    RELATIONSHIP_GROUPS_LIST.push({
      name: 'PROJECT-SPECIFIC LABELS',
      types: projectSpecific.map(cl => cl.id)
    });
  }

  const createButton = (typeKey) => {
    let labelText = RELATIONSHIP_LABELS[typeKey];
    const isCustom = typeKey.startsWith('cl_');
    
    if (!labelText && isCustom) {
      const custom = (DA_STATE.customLabels || []).find(cl => cl.id === typeKey) || 
                     (DA_STATE.savedCustomLabels || []).find(cl => cl.id === typeKey);
      if (custom) labelText = `${custom.name} (${custom.label})`;
    }

    if (!labelText) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'picker-btn-wrapper';

    const btn = document.createElement('button');
    if (isGurtnerMode() && GURTNER_RELATIONSHIP_NAMES[typeKey]) {
      labelText = GURTNER_RELATIONSHIP_NAMES[typeKey];
    }
    btn.textContent = labelText;
    btn.title = labelText;
    btn.className = typeKey;
    if (isCustom) btn.classList.add('custom-label-btn');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      DA_STATE.pushUndo('change label');
      DA_STATE.brackets[bracketIdx].type = typeKey;
      picker.remove();
      if (window.renderAll) window.renderAll();
      showStatus(`Label changed to ${labelText}`, 'success');
    });

    wrapper.appendChild(btn);

    if (isCustom) {
      const isSaved = (DA_STATE.savedCustomLabels || []).some(cl => cl.id === typeKey);
      const actionBtn = document.createElement('button');
      actionBtn.className = 'picker-action-btn';
      actionBtn.innerHTML = isSaved ? '&times;' : '+';
      actionBtn.title = isSaved ? 'Remove from my bank' : 'Save to my bank';
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isSaved) {
          DA_STATE.savedCustomLabels = DA_STATE.savedCustomLabels.filter(cl => cl.id !== typeKey);
        } else {
          const custom = (DA_STATE.customLabels || []).find(cl => cl.id === typeKey);
          if (custom) DA_STATE.savedCustomLabels.push(custom);
        }
        localStorage.setItem('da_custom_labels', JSON.stringify(DA_STATE.savedCustomLabels));
        picker.remove();
        showLabelPicker(bracketIdx, centerY, centerX); // Re-open to refresh
      });
      wrapper.appendChild(actionBtn);
    }

    return wrapper;
  };

  const createGroup = (group) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'picker-group';
    
    const header = document.createElement('h4');
    header.className = 'picker-group-header';
    header.textContent = group.name;
    groupDiv.appendChild(header);

    if (group.types) {
      const btnContainer = document.createElement('div');
      btnContainer.className = 'picker-btn-container';
      group.types.forEach(typeKey => {
        const btn = createButton(typeKey);
        if (btn) btnContainer.appendChild(btn);
      });
      groupDiv.appendChild(btnContainer);
    }

    if (group.subgroups) {
      group.subgroups.forEach(sub => {
        const subDiv = document.createElement('div');
        subDiv.className = 'picker-subgroup';
        
        const subHeader = document.createElement('h5');
        subHeader.className = 'picker-subgroup-header';
        subHeader.textContent = sub.name;
        subDiv.appendChild(subHeader);

        const btnContainer = document.createElement('div');
        btnContainer.className = 'picker-btn-container';
        sub.types.forEach(typeKey => {
          const btn = createButton(typeKey);
          if (btn) btnContainer.appendChild(btn);
        });
        subDiv.appendChild(btnContainer);
        groupDiv.appendChild(subDiv);
      });
    }

    return groupDiv;
  };

  RELATIONSHIP_GROUPS_LIST.forEach(group => {
    content.appendChild(createGroup(group));
  });

  // Setup header tools
  picker.querySelector('[data-action="add-custom"]').addEventListener('click', (e) => {
    e.stopPropagation();
    showCustomLabelDialog(bracketIdx, centerY, centerX, picker);
  });

  const propositionsContainer = document.getElementById('propositions');
  const wrapper = propositionsContainer?.parentElement || document.body;
  const rect = wrapper.getBoundingClientRect();
  const relX = centerX - rect.left;
  const relY = centerY - rect.top;

  if (hasTwoLabels) {
    picker.querySelector('[data-action="swap"]').addEventListener('click', (e) => {
      e.stopPropagation();
      DA_STATE.pushUndo('swap labels');
      bracket.labelsSwapped = !bracket.labelsSwapped;
      if (window.renderAll) window.renderAll();
      picker.remove();
    });
    picker.querySelector('[data-action="flip-dominance"]').addEventListener('click', (e) => {
      e.stopPropagation();
      DA_STATE.pushUndo('switch stars');
      bracket.dominanceFlipped = !bracket.dominanceFlipped;
      if (window.renderAll) window.renderAll();
      picker.remove();
    });
  }

  picker.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    DA_EDITOR.deleteBracket(bracketIdx);
    picker.remove();
    showStatus('Bracket removed.', 'success');
  });

  picker.style.left = `${Math.max(10, Math.min(relX - 220, wrapper.offsetWidth - 450))}px`;
  picker.style.top = `${Math.max(10, relY - 150)}px`;
  wrapper.appendChild(picker);

  makePopupDraggable(picker, '.picker-title');

  setupClickOutside(picker, () => picker.remove());
}


function showExportMenu(e) {
  const existing = document.getElementById('exportMenu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'exportMenu';
  menu.className = 'context-menu';
  menu.innerHTML = `
    <div class="menu-item" data-action="png">Export PNG Image</div>
    <div class="menu-item" data-action="pdf">Export PDF Document</div>
    <div class="menu-item" data-action="copy-img">Copy Image to Clipboard</div>
    <hr>
    <div class="menu-item" data-action="json">Download Project JSON</div>
    <div class="menu-item" data-action="copy-json">Copy Project Data (JSON)</div>
    <hr>
    <div class="menu-item" data-action="cloud-toggle">${DA_STATE.cloudUnsubscribe ? 'Turn Cloud Sync OFF' : 'Turn Cloud Sync ON'}</div>
  `;

  document.body.appendChild(menu);
  
  // Calculate best position using actual dimensions
  const menuW = menu.offsetWidth || 180;
  const menuH = menu.offsetHeight || 160;
  let left = e.clientX;
  let top = e.clientY;

  // If near right edge, flip left
  if (left + menuW > window.innerWidth) {
    left = window.innerWidth - menuW - 10;
  }
  // If near bottom edge, flip up or shift up
  if (top + menuH > window.innerHeight) {
    top = window.innerHeight - menuH - 10;
  }

  menu.style.left = `${Math.max(5, left)}px`;
  menu.style.top = `${Math.max(5, top)}px`;

  menu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      if (action === 'png') DA_EXPORT.saveImageToFile();
      if (action === 'pdf') DA_EXPORT.exportToPDF();
      if (action === 'copy-img') DA_EXPORT.copyDiagramToClipboard();
      if (action === 'json') {
          const data = JSON.stringify(DA_EXPORT.buildBracketData(), null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bracket-${DA_STATE.passageRef || 'project'}.json`;
          a.click();
      }
      if (action === 'copy-json') {
          const data = JSON.stringify(DA_EXPORT.buildBracketData(), null, 2);
          navigator.clipboard.writeText(data).then(() => showStatus('Project data copied!', 'success'));
      }
      if (action === 'cloud-toggle') {
          if (DA_STATE.cloudUnsubscribe) {
              DA_CLOUD.stopCloudSync();
          } else {
              DA_CLOUD.startCloudSync();
          }
      }
      menu.remove();
    });
  });

  setupClickOutside(menu, () => menu.remove());
}

function showOpenMenu(e) {
  const existing = document.getElementById('openPicker');
  if (existing) {
    existing.remove();
    return;
  }

  const picker = document.createElement('div');
  picker.id = 'openPicker';
  picker.className = 'label-picker relationship-picker-fixed';
  
  const options = [
    { label: '📂 Open local file', action: openBracketFile },
    { label: '🔗 Join cloud session', action: (btnEl) => {
        btnEl.innerHTML = '';
        btnEl.style.display = 'flex';
        btnEl.style.gap = '8px';
        btnEl.style.padding = '0.5rem';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Project ID';
        input.style.flex = '1';
        input.style.padding = '4px';
        input.style.textTransform = 'uppercase';
        input.onclick = (e) => e.stopPropagation();
        
        const goBtn = document.createElement('button');
        goBtn.textContent = 'Join';
        goBtn.style.padding = '2px 8px';
        goBtn.onclick = (e) => {
          e.stopPropagation();
          const id = input.value.trim().toUpperCase();
          if (id) {
            DA_CLOUD.joinCloudSync(id);
            picker.remove();
          }
        };
        
        btnEl.appendChild(input);
        btnEl.appendChild(goBtn);
        input.focus();
    }},
  ];

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.style.width = '100%';
    btn.style.textAlign = 'left';
    btn.style.padding = '0.75rem 1rem';
    btn.addEventListener('click', () => {
      if (opt.label === '🔗 Join cloud session') {
        opt.action(btn);
      } else {
        picker.remove();
        opt.action();
      }
    });
    picker.appendChild(btn);
  });

  const openMenuBtn = document.getElementById('openMenuBtn');
  document.body.appendChild(picker);
  const rect = openMenuBtn?.getBoundingClientRect() || { top: e.clientY, right: e.clientX };
  picker.style.top = `${rect.top}px`;
  picker.style.left = `${(rect.right || rect.left) + 10}px`;

  setupClickOutside(picker, () => picker.remove());
}

function openBracketFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,image/png,application/pdf';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      try {
        const text = await file.text();
        DA_PERSISTENCE.importBracket(JSON.parse(text));
      } catch (_) {
        showStatus('Could not read JSON file.', 'error');
      }
    } else if (file.type === 'image/png') {
        const data = await DA_PERSISTENCE.extractPngMetadata(file);
        if (data) DA_PERSISTENCE.importBracket(data);
        else showStatus('No bracket data found in PNG.', 'error');
    } else if (file.type === 'application/pdf') {
        const data = await DA_PERSISTENCE.extractPdfMetadata(file);
        if (data) DA_PERSISTENCE.importBracket(data);
        else showStatus('No bracket data found in PDF.', 'error');
    }
  };
  input.click();
}

function saveState() {
  const propositionsContainer = document.getElementById('propositionsContainer');
  const state = {
    scroll: { x: window.scrollX, y: window.scrollY, scrollables: [] },
    focus: null
  };
  
  // Save scroll
  let el = propositionsContainer;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight) {
      state.scroll.scrollables.push({ el, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop });
    }
    el = el.parentElement;
  }

  // Save focus
  const sel = window.getSelection();
  if (sel?.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const textSpan = range.startContainer.parentElement?.closest('.proposition-text');
    if (textSpan) {
      const block = textSpan.closest('.proposition-block');
      const propIndex = parseInt(block.dataset.index, 10);
      const preRange = document.createRange();
      preRange.setStart(textSpan, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      const offset = preRange.toString().length;
      state.focus = { propIndex, offset };
    }
  }
  
  return state;
}

function restoreState(state) {
  if (!state) return;
  const propositionsContainer = document.getElementById('propositionsContainer');
  
  // Restore scroll
  window.scrollTo(state.scroll.x, state.scroll.y);
  (state.scroll.scrollables || []).forEach(({ el, scrollLeft, scrollTop }) => {
    if (el && el.scrollTo) { el.scrollLeft = scrollLeft; el.scrollTop = scrollTop; }
  });

  // Restore focus
  if (state.focus) {
    const block = document.querySelector(`.proposition-block[data-index="${state.focus.propIndex}"]`);
    if (block) {
      const textSpan = block.querySelector('.proposition-text');
      if (textSpan) {
        textSpan.focus();
        DA_EDITOR.setSelectionByGlobalOffset(textSpan, state.focus.offset);
      }
    }
  }
}

function showMagicPasteBanner(data, messagePrefix) {
  if (DA_STATE.passageRef && data.passageRef === DA_STATE.passageRef) return;
  document.querySelector('.magic-paste-banner')?.remove();

  const wrapper = document.querySelector('.bracket-canvas-wrapper') || document.body;
  const banner = document.createElement('div');
  banner.className = 'magic-paste-banner';
  const label = data.passageRef || 'bracket data';
  banner.innerHTML = `
    <span class="draft-recovery-text">${messagePrefix} <strong>${escapeHtml(label)}</strong></span>
    <div class="draft-recovery-actions">
      <button type="button" data-action="import">Import</button>
      <button type="button" data-action="dismiss" class="secondary">Dismiss</button>
    </div>
  `;
  wrapper.prepend(banner);

  banner.querySelector('[data-action="import"]').addEventListener('click', () => {
    banner.remove();
    DA_PERSISTENCE.importBracket(data);
  });
  banner.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
    banner.remove();
  });
}

function initTheme() {
    const saved = localStorage.getItem(DA_CONSTANTS.THEME_KEY);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    updateThemeButtonText();
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(DA_CONSTANTS.THEME_KEY, next);
    updateThemeButtonText();
}

function updateThemeButtonText() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.textContent = current === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
}

function updateFontByAuthor() {
    const authorRaw = (document.getElementById('pageAuthor')?.value || '').trim();
    const authorLower = authorRaw.toLowerCase();
    const container = document.getElementById('propositions');
    if (!container) return;

    if (authorLower === 'brian kim') {
        container.style.fontFamily = "'Roboto Mono', monospace";
        container.style.fontSize = "14px";
    } else {
        container.style.fontFamily = "";
        container.style.fontSize = "";
    }
}

function syncPassageAuthorDisplay() {
    const input = document.getElementById('pageAuthor');
    const display = document.getElementById('passageAuthor');
    if (display && input) {
        display.textContent = input.value.trim() ? `By: ${input.value.trim()}` : '';
    }
}

function handleNewBracket() {
  const hasContent = DA_STATE.propositions.length > 0 && DA_STATE.propositions.some((p) => p && p.trim() && p !== '(empty)');
  
  if (!hasContent) {
    startNewBracket();
    return;
  }
  
  const wrapper = document.querySelector('.bracket-canvas-wrapper') || document.body;
  const dialog = document.createElement('div');
  dialog.className = 'label-picker new-bracket-dialog';
  dialog.innerHTML = `
    <p class="picker-title">Save current bracket before starting new?</p>
    <div class="new-bracket-buttons">
      <button type="button" data-action="save">Save</button>
      <button type="button" data-action="discard" class="secondary">Discard</button>
      <button type="button" data-action="cancel" class="secondary">Cancel</button>
    </div>
  `;
  
  const w = wrapper.offsetWidth || 400;
  const h = wrapper.offsetHeight || 300;
  dialog.style.left = `${Math.max(8, w / 2 - 120)}px`;
  dialog.style.top = `${Math.max(8, h / 2 - 55)}px`;
  wrapper.appendChild(dialog);

  makePopupDraggable(dialog, '.picker-title');

  setupClickOutside(dialog, () => dialog.remove());

  dialog.querySelector('[data-action="save"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    dialog.remove();
    if (window.saveBracket) {
      await window.saveBracket();
      startNewBracket();
    }
  });

  dialog.querySelector('[data-action="discard"]').addEventListener('click', (e) => {
    e.stopPropagation();
    dialog.remove();
    startNewBracket();
  });

  dialog.querySelector('[data-action="cancel"]').addEventListener('click', (e) => {
    e.stopPropagation();
    dialog.remove();
  });
}

function startNewBracket() {
  // If cloud sync is active, turn it off for the new project
  if (window.DA_CLOUD && window.DA_CLOUD.stopCloudSync) {
    window.DA_CLOUD.stopCloudSync();
  }

  DA_STATE.updateState({
    passageRef: '—',
    propositions: [],
    verseRefs: [],
    brackets: [],
    formatTags: [],
    wordArrows: [],
    comments: [],
    indentation: [],
    undoStack: [],
    bracketSelectStep: 0,
    bracketFrom: null,
    firstBracketPoint: null,
    connectBracketToBracketIdx: null,
    arrowMode: false,
    selectedArrowIdx: null,
    pendingArrowStart: null
  });

  const passageRefEl = document.getElementById('passageRef');
  if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
  
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel) copyrightLabel.textContent = '(ESV)';
  
  const propositionsContainer = document.getElementById('propositionsContainer');
  if (propositionsContainer) propositionsContainer.classList.remove('greek-text');
  
  if (window.renderAll) window.renderAll();
  
  document.getElementById('bracketActions')?.remove();
  document.getElementById('labelPicker')?.remove();
  document.getElementById('commentPopover')?.remove();
  
  DA_PERSISTENCE.clearDraft();
  
  const pageAuthorInput = document.getElementById('pageAuthor');
  if (pageAuthorInput) {
    const reviewerName = localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || '';
    if (reviewerName) {
      pageAuthorInput.value = reviewerName;
      try { localStorage.setItem(DA_CONSTANTS.PAGE_AUTHOR_KEY, reviewerName); } catch (_) { }
      syncPassageAuthorDisplay();
      updateFontByAuthor();
    }
  }
  showStatus('New bracket started.', 'success');
}

function parsePastedText(raw, defaultStartVerse = '1') {
  const verseParts = raw.split(/(?=\[\d+(?::\d+)?\])/);
  const props = [];
  const refs = [];
  let hasMarkers = false;
  for (const part of verseParts) {
    const m = part.match(/^\[(\d+)(?::(\d+))?\]\s*(.*)$/s);
    if (m) {
      hasMarkers = true;
      const num = m[2] ? `${m[1]}:${m[2]}` : m[1];
      const content = m[3].trim();
      if (content) {
        props.push(content);
        refs.push(num);
      }
    } else if (part.trim()) {
      props.push(part.trim());
      refs.push(hasMarkers || refs.length > 0 ? String(props.length) : defaultStartVerse);
    }
  }
  return { propositions: props, verseRefs: refs };
}

function formatBracketType(type) {
  return DA_CONSTANTS.RELATIONSHIP_LABELS[type] || type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
}

function makePopupDraggable(popover, handleSelector) {
  const wrapper = popover.parentElement;
  if (!wrapper) return;
  const handle = handleSelector ? popover.querySelector(handleSelector) : popover;
  if (!handle) return;

  handle.style.cursor = 'grab';
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'BUTTON') return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    
    // Get current visual position relative to parent to handle % or transform positions
    const wrapperRect = wrapper.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const startLeft = popRect.left - wrapperRect.left;
    const startTop = popRect.top - wrapperRect.top;

    // Reset styles to pixel-based absolute position to prevent jumping
    popover.style.transform = 'none';
    popover.style.left = startLeft + 'px';
    popover.style.top = startTop + 'px';

    handle.style.cursor = 'grabbing';

    const onMove = (e2) => {
      const dx = e2.clientX - startX;
      const dy = e2.clientY - startY;
      const rect = wrapper.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();

      let left = startLeft + dx;
      let top = startTop + dy;

      left = Math.max(0, Math.min(left, rect.width - popRect.width));
      top = Math.max(0, Math.min(top, rect.height - popRect.height));

      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
    };

    const onUp = () => {
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      popover._dragJustEnded = true;
      setTimeout(() => { popover._dragJustEnded = false; }, 0);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function makeCommentPopoverDraggableAndResizable(popover) {
  const wrapper = popover.parentElement;
  if (!wrapper) return;

  makePopupDraggable(popover, '.comment-popover-title');

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'comment-popover-resize-handle';
  resizeHandle.setAttribute('aria-label', 'Resize');
  popover.appendChild(resizeHandle);
  const minW = 260;
  const maxW = Math.min(1200, Math.max(360, wrapper.getBoundingClientRect().width * 0.9));
  const minH = 200;
  const maxH = Math.min(window.innerHeight * 0.85, wrapper.getBoundingClientRect().height);
  resizeHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = popover.offsetWidth;
    const startH = popover.offsetHeight;
    const onMove = (e2) => {
      const dw = e2.clientX - startX;
      const dh = e2.clientY - startY;
      let w = Math.max(minW, Math.min(maxW, startW + dw));
      let h = Math.max(minH, Math.min(maxH, startH + dh));
      popover.style.width = w + 'px';
      popover.style.height = h + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function setupReplies(popover, existingComment, idSuffix) {
  const repliesList = popover.querySelector('.comment-replies-list');
  const replyCountEl = popover.querySelector('.comment-replies-title');
  if (!repliesList || !replyCountEl) return;

  const updateReplies = () => {
    const replies = existingComment.replies || [];
    replyCountEl.textContent = `Replies (${replies.length})`;
    repliesList.innerHTML = '';
    replies.forEach((r, idx) => {
      const div = document.createElement('div');
      div.className = 'reply-item';
      div.innerHTML = `
        <div class="reply-meta">
          <span class="reply-author">${escapeHtml(r.author || 'Anonymous')}</span>
          <span class="reply-date">${new Date(r.timestamp).toLocaleDateString()}</span>
        </div>
        <div class="reply-text">${escapeHtml(r.text)}</div>
        <button type="button" class="delete-reply-btn" data-idx="${idx}">Delete</button>
      `;
      div.querySelector('.delete-reply-btn').addEventListener('click', () => {
        if (confirm('Delete this reply?')) {
          DA_STATE.pushUndo('delete reply');
          existingComment.replies.splice(idx, 1);
          updateReplies();
        }
      });
      repliesList.appendChild(div);
    });
  };

  updateReplies();

  const form = popover.querySelector('.reply-form');
  const input = popover.querySelector('.reply-input');
  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      DA_STATE.pushUndo('add reply');
      if (!existingComment.replies) existingComment.replies = [];
      existingComment.replies.push({
        id: 'r_' + Date.now(),
        text,
        author: localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || 'Anonymous',
        timestamp: Date.now()
      });
      input.value = '';
      updateReplies();
    });
  }
}


function showCustomLabelDialog(bracketIdx, centerY, centerX, mainPicker) {
  const dialog = document.createElement('div');
  dialog.className = 'label-picker custom-label-dialog';
  dialog.style.width = '240px';
  dialog.style.left = `${centerX}px`;
  dialog.style.top = `${centerY}px`;
  
  dialog.innerHTML = `
    <div class="picker-title">Add Custom Label</div>
    <div style="padding: 5px;">
      <input type="text" id="customInput" placeholder="e.g. MyRel or Top/Bot*" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); box-sizing: border-box;">
      <div class="hint-small" style="margin: 4px 0 8px; font-size: 0.7rem;">Use / for split, * for star</div>
      <button id="submitCustom" class="series" style="width: 100%; padding: 6px;">Apply & Save</button>
    </div>
  `;
  document.body.appendChild(dialog);
  
  makePopupDraggable(dialog, '.picker-title');

  const input = dialog.querySelector('#customInput');
  input.focus();
  
  const handleAdd = () => {
    const val = input.value.trim();
    if (!val) return;
    
    DA_STATE.pushUndo('add custom label');
    const id = 'cl_' + Date.now();
    const name = val.split('/')[0].replace('*', '');
    const newLabel = { id, name, label: val };
    
    DA_STATE.customLabels.push(newLabel);
    DA_STATE.savedCustomLabels.push(newLabel);
    localStorage.setItem('da_custom_labels', JSON.stringify(DA_STATE.savedCustomLabels));
    
    DA_STATE.brackets[bracketIdx].type = id;
    dialog.remove();
    mainPicker.remove();
    if (window.renderAll) window.renderAll();
    showStatus(`Label "${val}" created!`, 'success');
  };
  
  dialog.querySelector('#submitCustom').onclick = handleAdd;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') dialog.remove();
  };
  
  setupClickOutside(dialog, () => dialog.remove());
}

window.DA_UI = {
    showStatus, updateCloudUI, isGurtnerMode, escapeHtml, makePopupDraggable, setupClickOutside, clearPropositionHighlights,
    getCommentForBracket, showCommentPopover, showCommentPopoverForText, showCommentPopoverForBracket,
    showBracketActions, showTextContextMenu, showLabelPicker, showExportMenu, showOpenMenu, saveState, restoreState,
    showMagicPasteBanner, initTheme, toggleTheme, updateThemeButtonText, openSettings, closeSettings,
    updateFontByAuthor, syncPassageAuthorDisplay, handleNewBracket, startNewBracket, parsePastedText,
    formatBracketType, makeCommentPopoverDraggableAndResizable, setupReplies
};
