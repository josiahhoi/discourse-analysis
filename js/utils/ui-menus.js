/**
 * ui-menus — context menus & pickers (bracket actions, text menu, label/custom-label picker, export/open menus).
 *
 * Split out of ui.js. Classic (non-module) script: top-level functions stay
 * global like the rest of the app; the public ones are added to window.DA_UI
 * via Object.assign. Loaded after ui.js in index.html.
 */

function showBracketActions(bracketIdx, centerY, centerX) {
  const existing = document.getElementById('bracketActions');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'bracketActions';
  popover.className = 'context-menu';
  const bracket = DA_STATE.brackets[bracketIdx];
  const hasTwoLabels = window.DA_PROFILES
    ? DA_PROFILES.isTwoArm(bracket.type)
    : !DA_CONSTANTS.SINGLE_LABEL_TYPES.has(bracket.type);
  const hasComment = !!getCommentForBracket(bracketIdx);

  const pastels = [
    { val: '#FFF9C4', name: 'Yellow' },
    { val: '#BBDEFB', name: 'Blue' },
    { val: '#C8E6C9', name: 'Green' },
    { val: '#F8BBD0', name: 'Pink' },
    { val: '#E1BEE7', name: 'Lavender' }
  ];

  const isMainPoint = !!bracket.isMainPoint;

  popover.innerHTML = `
    <div class="menu-item" data-action="fold">${bracket.isCollapsed ? 'Expand Section' : 'Collapse Section'}</div>
    <div class="menu-item" data-action="comment">${hasComment ? 'View Comment' : 'Add Comment'}</div>
    <div class="menu-item" data-action="select">Connect to...</div>
    <div class="menu-item${isMainPoint ? ' active' : ''}" data-action="main-point">${isMainPoint ? '★ Unmark Passage Main Point' : '☆ Mark Passage Main Point'}</div>
    <div class="menu-divider"></div>
    <div class="color-palette-title">Highlight Rows</div>
    <div class="color-palette">
      ${pastels.map(c => `<button class="color-swatch" data-color="${c.val}" title="${c.name}" style="background-color: ${c.val}"></button>`).join('')}
      <button class="color-swatch clear-color" data-color="clear" title="Clear Highlight">✕</button>
    </div>
    <div class="menu-divider"></div>
    <div class="menu-item danger" data-action="delete">Delete Bracket</div>
  `;

  popover.style.left = `${centerX}px`;
  popover.style.top = `${centerY}px`;
  document.body.appendChild(popover);
  clampToViewport(popover);

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

  popover.querySelector('[data-action="main-point"]').addEventListener('click', (e) => {
    e.stopPropagation();
    DA_STATE.pushUndo('main point');
    // Only one bracket can be the main point at a time — clear any existing one first.
    DA_STATE.brackets.forEach((b, idx) => { if (idx !== bracketIdx) b.isMainPoint = false; });
    bracket.isMainPoint = !bracket.isMainPoint;
    clearAndDismiss();
    if (window.renderAll) window.renderAll();
  });

  popover.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = btn.dataset.color;
      DA_STATE.pushUndo('highlight rows');
      if (color === 'clear') {
        delete DA_STATE.bracketHighlights[bracketIdx];
      } else {
        DA_STATE.bracketHighlights[bracketIdx] = color;
      }
      clearAndDismiss();
      if (window.renderAll) window.renderAll();
    });
  });

  setupClickOutside(popover, () => popover.remove());
}

function showTextContextMenu(propIndex, start, end, centerY, centerX, anchorRect) {
  const existing = document.getElementById('textContextMenu');
  if (existing) existing.remove();

  const colors = [
    { val: '#E53935', name: 'Red' },
    { val: '#1E88E5', name: 'Blue' },
    { val: '#43A047', name: 'Green' },
    { val: '#FB8C00', name: 'Orange' },
    { val: '#8E24AA', name: 'Purple' }
  ];

  const menu = document.createElement('div');
  menu.id = 'textContextMenu';
  menu.className = 'context-menu';
  menu.innerHTML = `
    <div class="menu-item" data-action="add-comment">Add Comment</div>
    <div class="menu-divider"></div>
    <div class="color-palette-title">Color Code</div>
    <div class="color-palette">
      ${colors.map(c => `<button class="color-swatch" data-color="${c.val}" title="${c.name}" style="background-color: ${c.val}"></button>`).join('')}
      <button class="color-swatch clear-color" data-color="clear" title="Clear Color">✕</button>
    </div>
  `;

  menu.style.left = `${centerX}px`;
  menu.style.top = `${centerY}px`;
  document.body.appendChild(menu);
  clampToViewport(menu);

  menu.querySelector('[data-action="add-comment"]').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.remove();
    showCommentPopoverForText(propIndex, start, end, null, { anchorRect });
  });

  menu.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = btn.dataset.color;
      
      DA_STATE.pushUndo('color text');
      
      // Remove any overlapping color tags
      DA_STATE.formatTags = DA_STATE.formatTags.filter(t => 
        !(t.type === 'color' && t.propIndex === propIndex && t.start === start && t.end === end)
      );
      
      if (color !== 'clear') {
        DA_STATE.formatTags.push({ propIndex, start, end, type: 'color', color });
      }
      
      menu.remove();
      if (window.renderAll) window.renderAll();
    });
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
  const hasTwoLabels = window.DA_PROFILES
    ? DA_PROFILES.isTwoArm(bracket.type)
    : !DA_CONSTANTS.SINGLE_LABEL_TYPES.has(bracket.type);
  // Switch Stars is meaningless when the active profile doesn't mark dominance
  // for this relationship, so hide it in that case.
  const showStars = !window.DA_PROFILES || DA_PROFILES.isDominanceShown(bracket.type);
  const RELATIONSHIP_LABELS = DA_CONSTANTS.RELATIONSHIP_LABELS;

  picker.innerHTML = `
    <div class="picker-title">
      <span>Choose Relationship</span>
      <div class="picker-header-tools">
        <button class="tool-btn" data-action="add-custom" title="Add Custom Label">Custom Label</button>
        ${hasTwoLabels ? '<button class="tool-btn" data-action="swap" title="Swap Labels">⇅ Swap</button>' : ''}
        ${hasTwoLabels && showStars ? '<button class="tool-btn" data-action="flip-dominance" title="Switch Stars">★ Switch Stars</button>' : ''}
      </div>
    </div>
    <div class="relationship-picker-content"></div>
    <div class="picker-info-panel" style="display: none;">
      <strong class="info-name"></strong>
      <div class="info-def"></div>
      <div class="info-keywords"></div>
    </div>
    <div class="picker-footer">
      <button class="delete-btn">Delete Bracket</button>
    </div>
  `;

  const content = picker.querySelector('.relationship-picker-content');
  const infoPanel = picker.querySelector('.picker-info-panel');


  const RELATIONSHIP_GROUPS_LIST = [...DA_CONSTANTS.RELATIONSHIP_GROUPS_HIERARCHY];

  // The picker only offers the active profile's relationships (plus the bracket's
  // current type, so a foreign type loaded from another system stays selectable).
  // Custom cl_ labels are always allowed. A foreign type whose display already
  // aliases to a visible type (e.g. general-specific → idea-explanation) is NOT
  // re-added — that would render a second, identically-labeled button.
  const visibleTypes = new Set(window.DA_PROFILES ? DA_PROFILES.getVisibleTypes() : []);
  const effectiveBracketType = window.DA_PROFILES
    ? DA_PROFILES.effectiveType(bracket.type) : bracket.type;
  if (!visibleTypes.has(effectiveBracketType)) visibleTypes.add(bracket.type);
  const isVisibleType = (t) => !window.DA_PROFILES || t.startsWith('cl_') || visibleTypes.has(t);

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
    const isCustom = typeKey.startsWith('cl_');
    // Resolve through the active profile (handles renames + Gurtner). getName
    // returns the bare typeKey when it has no entry, which we treat as "unknown".
    let labelText = window.DA_PROFILES ? DA_PROFILES.getName(typeKey) : RELATIONSHIP_LABELS[typeKey];
    if ((!labelText || labelText === typeKey) && isCustom) {
      const custom = (DA_STATE.customLabels || []).find(cl => cl.id === typeKey) ||
                     (DA_STATE.savedCustomLabels || []).find(cl => cl.id === typeKey);
      if (custom) labelText = `${custom.name} (${custom.label})`;
    }

    if (!labelText || labelText === typeKey) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'picker-btn-wrapper';

    const btn = document.createElement('button');
    btn.textContent = labelText;
    btn.title = labelText;
    btn.className = typeKey;
    if (isCustom) btn.classList.add('custom-label-btn');

    // Apply relationship color
    const color = (window.DA_PROFILES ? DA_PROFILES.getColor(typeKey) : DA_CONSTANTS.RELATIONSHIP_COLORS[typeKey]) || DA_CONSTANTS.RELATIONSHIP_COLORS.unspecified;
    btn.style.setProperty('--bracket-color', color);
    btn.style.borderColor = color;
    btn.style.color = color;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      DA_STATE.pushUndo('change label');
      DA_STATE.brackets[bracketIdx].type = typeKey;
      picker.remove();
      if (window.renderAll) window.renderAll();
      showStatus(`Label changed to ${labelText}`, 'success');
    });

    const defData = DA_CONSTANTS.RELATIONSHIP_DEFINITIONS?.[typeKey];
    if (defData) {
      btn.addEventListener('mouseenter', () => {
        infoPanel.style.display = 'block';
        infoPanel.querySelector('.info-name').textContent = labelText;
        infoPanel.querySelector('.info-name').style.color = color;
        infoPanel.querySelector('.info-def').textContent = defData.definition;
        infoPanel.querySelector('.info-keywords').textContent = defData.keywords ? 'Key words: ' + defData.keywords : '';
      });
      btn.addEventListener('mouseleave', () => {
        infoPanel.style.display = 'none';
      });
    }

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
      group.types.filter(isVisibleType).forEach(typeKey => {
        const btn = createButton(typeKey);
        if (btn) btnContainer.appendChild(btn);
      });
      // Skip an empty group entirely (none of its types are in this profile).
      if (!btnContainer.children.length) return null;
      groupDiv.appendChild(btnContainer);
    }

    if (group.subgroups) {
      group.subgroups.forEach(sub => {
        const visible = sub.types.filter(isVisibleType);
        if (!visible.length) return;

        const subDiv = document.createElement('div');
        subDiv.className = 'picker-subgroup';

        const subHeader = document.createElement('h5');
        subHeader.className = 'picker-subgroup-header';
        subHeader.textContent = sub.name;
        subDiv.appendChild(subHeader);

        const btnContainer = document.createElement('div');
        btnContainer.className = 'picker-btn-container';
        visible.forEach(typeKey => {
          const btn = createButton(typeKey);
          if (btn) btnContainer.appendChild(btn);
        });
        subDiv.appendChild(btnContainer);
        groupDiv.appendChild(subDiv);
      });
    }

    return groupDiv;
  };

  if (bracket.isJumpOver) {
    // Offer only the jump-over-capable types the active profile actually has
    // (always at least Series), since the bracket spans multiple members.
    const jumpTypes = (window.DA_PROFILES ? DA_PROFILES.JUMP_OVER_TYPES : ['series', 'bilateral'])
      .filter(isVisibleType);
    const names = jumpTypes.map(t => (window.DA_PROFILES ? DA_PROFILES.getName(t)
      : DA_CONSTANTS.RELATIONSHIP_LABELS[t] || t).replace(/\s*\([^)]*\)\s*$/, '').trim());
    const note = document.createElement('p');
    note.className = 'picker-jump-note';
    note.textContent = `Jump-over bracket — choose ${names.join(' or ')}.`;
    content.appendChild(note);
    const container = document.createElement('div');
    container.className = 'picker-btn-container';
    jumpTypes.forEach(type => {
      const btn = createButton(type);
      if (btn) container.appendChild(btn);
    });
    content.appendChild(container);
  } else {
    RELATIONSHIP_GROUPS_LIST.forEach(group => {
      const el = createGroup(group);
      if (el) content.appendChild(el);
    });
  }

  // Setup header tools
  picker.querySelector('[data-action="add-custom"]').addEventListener('click', (e) => {
    e.stopPropagation();
    showCustomLabelDialog(bracketIdx, centerY, centerX, picker);
  });

  if (hasTwoLabels) {
    picker.querySelector('[data-action="swap"]').addEventListener('click', (e) => {
      e.stopPropagation();
      DA_STATE.pushUndo('swap labels');
      bracket.labelsSwapped = !bracket.labelsSwapped;
      if (window.renderAll) window.renderAll();
      picker.remove();
    });
    // The flip-dominance button is only rendered when dominance is shown.
    const flipBtn = picker.querySelector('[data-action="flip-dominance"]');
    if (flipBtn) flipBtn.addEventListener('click', (e) => {
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

  picker.classList.add('relationship-picker-fixed');
  document.body.appendChild(picker);

  const pw = picker.offsetWidth || 450;
  const ph = picker.offsetHeight;
  const left = Math.max(5, Math.min(centerX - pw / 2, window.innerWidth - pw - 5));
  const top = Math.max(5, Math.min(centerY - 150, window.innerHeight - ph - 5));
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;

  makeFixedDraggable(picker, '.picker-title');

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
    { label: '📂 Open local file', action: openBracketFile, inline: false },
    { label: '🔗 Join cloud session', inline: true, action: (btnEl) => {
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
      if (opt.inline) {
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

window.DA_UI = Object.assign(window.DA_UI || {}, {
  showBracketActions, showTextContextMenu, showLabelPicker, showExportMenu, showOpenMenu
});
