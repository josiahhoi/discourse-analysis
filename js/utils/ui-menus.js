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
  const hasComment = !!getCommentForBracket(bracketIdx);

  const pastels = [
    { val: '#FFF9C4', name: 'Yellow' },
    { val: '#BBDEFB', name: 'Blue' },
    { val: '#C8E6C9', name: 'Green' },
    { val: '#F8BBD0', name: 'Pink' },
    { val: '#E1BEE7', name: 'Lavender' }
  ];

  const isMainPoint = !!bracket.isMainPoint;

  // Collapsing a bracket whose endpoints are its only rows hides nothing (e.g.
  // a 2-row coordinate bracket) — offer the item disabled instead of a no-op.
  const foldWouldHide = bracket.isCollapsed
    || (window.DA_RENDERER?.getCollapseInfo && DA_RENDERER.getCollapseInfo(bracketIdx).hiddenRows.length > 0);

  popover.innerHTML = `
    <div class="menu-item${foldWouldHide ? '' : ' disabled'}" data-action="fold"${foldWouldHide ? '' : ' title="Nothing to fold — both endpoints stay visible"'}>${bracket.isCollapsed ? 'Expand Section' : 'Collapse Section'}</div>
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
    const removed = DA_EDITOR.deleteBracket(bracketIdx);
    clearAndDismiss();
    if (removed > 0) {
      showStatus(removed > 1 ? `${removed} brackets removed.` : 'Bracket removed.', 'success');
    }
  });

  popover.querySelector('[data-action="fold"]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!foldWouldHide) return;
    DA_EDITOR.toggleBracketCollapse(bracketIdx);
    clearAndDismiss();
  });

  popover.querySelector('[data-action="select"]').addEventListener('click', (e) => {
    e.stopPropagation();
    DA_STATE.firstBracketPoint = bracket.id;
    DA_STATE.bracketSelectStep = 1;
    document.getElementById('bracketCanvas')?.classList.add('connect-mode');
    showStatus('Bracket selected. Click a node or dot to connect.', 'info');
    clearAndDismiss();
  });

  popover.querySelector('[data-action="comment"]').addEventListener('click', (e) => {
    e.stopPropagation();
    showCommentPopoverForBracket(bracketIdx);
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
        delete DA_STATE.bracketHighlights[bracket.id];
      } else {
        DA_STATE.bracketHighlights[bracket.id] = color;
      }
      clearAndDismiss();
      if (window.renderAll) window.renderAll();
    });
  });

  manageDialogFocus(popover);
  setupClickOutside(popover, () => popover.remove());
}

function showTextContextMenu(propIndex, start, end, centerY, centerX, pcol) {
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
  // Comments are primary-text-only; a parallel-cell selection gets colors only.
  menu.innerHTML = `
    ${pcol ? '' : `<div class="menu-item" data-action="add-comment">Add Comment</div>
    <div class="menu-divider"></div>`}
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

  menu.querySelector('[data-action="add-comment"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.remove();
    showCommentPopoverForText(propIndex, start, end);
  });

  menu.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = btn.dataset.color;
      
      DA_STATE.pushUndo('color text');

      // Replace, don't layer: drop any existing color tag on this line's SAME
      // COLUMN whose range overlaps the selection (half-open [start, end)
      // overlap test), then add the new one. This also drives "clear" —
      // selecting a range and clearing removes every color touching it,
      // instead of only an exact match.
      DA_STATE.formatTags = DA_STATE.formatTags.filter(t =>
        !(t.type === 'color' && t.propIndex === propIndex && !!t.pcol === !!pcol && t.start < end && start < t.end)
      );

      if (color !== 'clear') {
        const tag = { propIndex, start, end, type: 'color', color };
        if (pcol) tag.pcol = true;
        DA_STATE.formatTags.push(tag);
      }
      
      menu.remove();
      if (window.renderAll) window.renderAll();
    });
  });

  manageDialogFocus(menu);
  setupClickOutside(menu, () => menu.remove());
}

/**
 * Label picker placement. Preferred: underneath the clicked bracket's own
 * last line (the row its lower arm attaches to), keeping the bracket and the
 * lines it directly relates visible above the picker. When the picker
 * doesn't fit below — bracket ends near the screen bottom — it flips whole
 * to ABOVE the bracket's first line instead of getting truncated. Only when
 * neither side holds the full picker does it take the roomier side height-
 * capped (the relationship list scrolls internally); and when even that
 * side can't fit the fixed chrome (title/search/info panel/footer ≈ 270px —
 * a bracket spanning the whole screen), it overlays from the top margin.
 * left = attached to the bracket's gutter edge (mirrored in RTL), viewport-
 * clamped. Returns maxH with left/top because the above-side cap ends at
 * the bracket's top line, not the viewport bottom. Pure rect math
 * (viewport space) so it's testable.
 */
function computeLabelPickerPosition({ anchorTop, anchorBottom, aRect, pw, ph, vw, vh, isRTL }) {
  const GAP = 10;
  const MARGIN = 5;
  const MIN_USABLE = 380; // below this the list under the fixed chrome is invisible
  const belowSpace = vh - MARGIN - (anchorBottom + GAP);
  const aboveSpace = anchorTop - GAP - MARGIN;
  let top, maxH;
  if (ph <= belowSpace) {
    top = anchorBottom + GAP;
    maxH = belowSpace;
  } else if (ph <= aboveSpace) {
    top = anchorTop - GAP - ph;
    maxH = ph;
  } else if (Math.max(belowSpace, aboveSpace) >= MIN_USABLE) {
    if (belowSpace >= aboveSpace) {
      top = anchorBottom + GAP;
      maxH = belowSpace;
    } else {
      top = MARGIN;
      maxH = aboveSpace;
    }
  } else {
    top = MARGIN;
    maxH = vh - 2 * MARGIN;
  }
  const left = Math.max(MARGIN, Math.min(isRTL ? aRect.right - pw : aRect.left, vw - pw - MARGIN));
  return { left, top, maxH };
}

/**
 * Corner drag-handle resizing for the label picker (same affordance as the
 * comment popover). A user-driven size takes over from the automatic
 * maxHeight/max-width caps; both dimensions stay viewport-clamped so the
 * footer can't be dragged off-screen.
 */
function makePickerResizable(picker) {
  const handle = document.createElement('div');
  handle.className = 'picker-resize-handle';
  handle.setAttribute('aria-label', 'Resize');
  picker.appendChild(handle);
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // preventDefault only — the event must still propagate so
    // setupClickOutside records that this press started INSIDE the picker;
    // otherwise a resize drag whose pointer ends past the picker's edge
    // (e.g. the height hit its viewport clamp) dismisses the picker on
    // release.
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = picker.offsetWidth;
    const startH = picker.offsetHeight;
    const rect = picker.getBoundingClientRect();
    const maxW = window.innerWidth - rect.left - 5;
    const maxH = window.innerHeight - rect.top - 5;
    picker.style.maxWidth = 'none';
    picker.style.maxHeight = 'none';
    const onMove = (e2) => {
      picker.style.width = `${Math.max(320, Math.min(maxW, startW + e2.clientX - startX))}px`;
      picker.style.height = `${Math.max(320, Math.min(maxH, startH + e2.clientY - startY))}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
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
    <div class="picker-search-row">
      <input type="text" class="picker-search" placeholder="Type to filter… (e.g. 'act', 'cause', 'because')" aria-label="Filter relationships">
    </div>
    <div class="relationship-picker-content"></div>
    <div class="picker-info-panel">
      <div class="info-hint">Hover over a relationship to see its definition.</div>
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

    // Search metadata for the type-to-filter box: names from every built-in
    // profile (so "cause" finds Action-Result under Josiah), plus key words.
    if (window.DA_PROFILES && DA_PROFILES.searchIndexFor) {
      const idx = DA_PROFILES.searchIndexFor(typeKey);
      wrapper.dataset.searchNames = idx.nameBlob;
      wrapper.dataset.searchKeywords = idx.keywordBlob;
      if (idx.altHint) btn.title = `${labelText} — ${idx.altHint}`;
    }

    const defData = DA_CONSTANTS.RELATIONSHIP_DEFINITIONS?.[typeKey];
    if (defData) {
      btn.addEventListener('mouseenter', () => {
        // Fill the fixed info slot — never toggle the panel's display.
        // Expanding it on hover reflowed the height-capped picker, shifting
        // the relationship buttons under the cursor mid-click (real
        // misclicks). The last-hovered definition simply stays shown.
        const hint = infoPanel.querySelector('.info-hint');
        if (hint) hint.style.display = 'none';
        infoPanel.querySelector('.info-name').textContent = labelText;
        infoPanel.querySelector('.info-name').style.color = color;
        infoPanel.querySelector('.info-def').textContent = defData.definition;
        infoPanel.querySelector('.info-keywords').textContent = defData.keywords ? 'Key words: ' + defData.keywords : '';
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
    const jumpTypes = DA_CONSTANTS.JUMP_OVER_TYPES.filter(isVisibleType);
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

  // ── Type-to-filter ──────────────────────────────────────────────────────
  // The search input is the picker's first focusable, so manageDialogFocus
  // lands focus in it on open — "just start typing" works immediately.
  // Name matches (any built-in profile's vocabulary) rank above key-word/
  // definition matches: keyword hits only show when no name matches the query.
  const searchRow = picker.querySelector('.picker-search-row');
  const searchInput = picker.querySelector('.picker-search');
  if (bracket.isJumpOver || !window.DA_PROFILES) {
    // Two or three fixed choices (or no profile module) — no filter needed.
    if (searchRow) searchRow.remove();
  } else if (searchInput) {
    const applyFilter = () => {
      const q = searchInput.value;
      const wrappers = Array.from(content.querySelectorAll('.picker-btn-wrapper'));
      const hits = wrappers.map((w) => ({
        w,
        name: DA_PROFILES.matchesSearch(w.dataset.searchNames || '', q),
        keyword: DA_PROFILES.matchesSearch(w.dataset.searchKeywords || '', q)
      }));
      const anyName = hits.some((h) => h.name);
      hits.forEach((h) => {
        const show = anyName ? h.name : h.keyword;
        h.w.classList.toggle('search-hidden', !show);
      });
      // Hide groups/subgroups that filtered down to nothing.
      content.querySelectorAll('.picker-subgroup').forEach((sg) => {
        sg.classList.toggle('search-hidden', !sg.querySelector('.picker-btn-wrapper:not(.search-hidden)'));
      });
      content.querySelectorAll('.picker-group').forEach((g) => {
        g.classList.toggle('search-hidden', !g.querySelector('.picker-btn-wrapper:not(.search-hidden)'));
      });
      // Empty-state note.
      let note = content.querySelector('.picker-no-matches');
      const none = !content.querySelector('.picker-btn-wrapper:not(.search-hidden)');
      if (none && !note) {
        note = document.createElement('p');
        note.className = 'picker-no-matches';
        note.textContent = 'No matches — try a name like "ground", another system\'s term like "cause", or a key word like "because".';
        content.appendChild(note);
      } else if (!none && note) {
        note.remove();
      }
    };
    searchInput.addEventListener('input', applyFilter);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = content.querySelector('.picker-btn-wrapper:not(.search-hidden) button');
        if (first) first.click();
      }
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
    const removed = DA_EDITOR.deleteBracket(bracketIdx);
    picker.remove();
    if (removed > 0) {
      showStatus(removed > 1 ? `${removed} brackets removed.` : 'Bracket removed.', 'success');
    }
  });

  picker.classList.add('relationship-picker-fixed');
  document.body.appendChild(picker);

  const pw = picker.offsetWidth || 450;
  const ph = picker.offsetHeight;
  // Anchor underneath the clicked bracket's own last line: the row its lower
  // arm attaches to. For a bracket-to-bracket connection that's the
  // sub-bracket's attachment row (star-dominance point), not the bottom of
  // everything it subsumes — the structure above stays visible, and covering
  // the sub-group's later rows is the accepted trade-off.
  const canvas = document.getElementById('bracketCanvas');
  const group = document.querySelector(`#bracketCanvas .bracket-group[data-index="${bracketIdx}"]`);
  const aRect = group ? group.getBoundingClientRect() : { left: centerX, right: centerX };
  let anchorBottom = centerY; // degenerate fallback: the click point
  let anchorTop = centerY;
  if (bracket && canvas && DA_STATE.dotPositions?.length) {
    const pts = DA_RENDERER.getConnectionPoints(bracket.from, bracket.to, DA_STATE.dotPositions, bracketIdx);
    const canvasTop = canvas.getBoundingClientRect().top;
    const yLow = canvasTop + Math.max(pts.topY, pts.bottomY); // lower arm
    const yHigh = canvasTop + Math.min(pts.topY, pts.bottomY); // upper arm
    // The arms land mid-row: anchor below the lower arm's row (preferred
    // placement) and above the upper arm's row (the flip side).
    anchorBottom = yLow + 16;
    anchorTop = yHigh - 16;
    for (const row of document.querySelectorAll('.proposition-block')) {
      const r = row.getBoundingClientRect();
      if (yLow >= r.top && yLow <= r.bottom) anchorBottom = r.bottom;
      if (yHigh >= r.top && yHigh <= r.bottom) anchorTop = r.top;
    }
  }
  const { left, top, maxH } = computeLabelPickerPosition({
    anchorTop, anchorBottom, aRect, pw, ph,
    vw: window.innerWidth, vh: window.innerHeight, isRTL: !!DA_STATE.isRTL
  });
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
  // Cap so the footer (Delete Bracket) always stays reachable — the
  // relationship list scrolls internally. For an above-the-bracket flip the
  // cap ends at the bracket's top line rather than the viewport bottom.
  picker.style.maxHeight = `${maxH}px`;

  makeFixedDraggable(picker, '.picker-title');
  makePickerResizable(picker);

  manageDialogFocus(picker);
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
    <div class="menu-item" data-action="cloud-toggle">${DA_CLOUD.isLive() ? 'Turn Cloud Sync OFF' : 'Turn Cloud Sync ON'}</div>
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
          if (DA_CLOUD.isLive()) {
              DA_CLOUD.stopCloudSync();
          } else {
              DA_CLOUD.startCloudSync();
          }
      }
      menu.remove();
    });
  });

  manageDialogFocus(menu);
  setupClickOutside(menu, () => menu.remove());
}

/**
 * "Alternate Views" toolbar dropdown: Block Diagram (existing view toggle) and
 * the Parallel Column — a second, fully editable text column stored per-row in
 * DA_STATE.parallelTexts and saved with the project.
 */
function showAlternateViewsMenu(e) {
  const existing = document.getElementById('alternateViewsMenu');
  if (existing) { existing.remove(); return; }

  const blockActive = !!(window.DA_BLOCK && DA_BLOCK.isActive());
  const hasColumn = !!DA_STATE.parallelLabel;
  const columnVisible = hasColumn && !DA_STATE.parallelHidden;

  // Three column states: none yet (fetch via dialog), visible (hide = conceal,
  // data kept), hidden (unhide restores the previous work without refetching).
  // Only "Change translation" replaces the cells.
  const menu = document.createElement('div');
  menu.id = 'alternateViewsMenu';
  menu.className = 'context-menu';
  menu.innerHTML = `
    <div class="menu-item${blockActive ? ' active' : ''}" data-action="block-diagram">${blockActive ? 'Bracket View (B)' : 'Block Diagram (B)'}</div>
    <hr>
    ${!hasColumn ? `
      <div class="menu-item" data-action="parallel-fetch">Show Parallel Column…</div>
    ` : columnVisible ? `
      <div class="menu-item" data-action="parallel-hide">Hide Parallel Column</div>
      <div class="menu-item" data-action="parallel-change">Change Parallel Translation… (${DA_UI.escapeHtml(DA_STATE.parallelLabel)})</div>
    ` : `
      <div class="menu-item" data-action="parallel-unhide">Show Parallel Column (${DA_UI.escapeHtml(DA_STATE.parallelLabel)})</div>
      <div class="menu-item" data-action="parallel-change">Change Parallel Translation… (${DA_UI.escapeHtml(DA_STATE.parallelLabel)})</div>
    `}
  `;

  document.body.appendChild(menu);
  const menuW = menu.offsetWidth || 200;
  const menuH = menu.offsetHeight || 120;
  let left = e.clientX;
  let top = e.clientY;
  if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 10;
  if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 10;
  menu.style.left = `${Math.max(5, left)}px`;
  menu.style.top = `${Math.max(5, top)}px`;

  menu.querySelectorAll('.menu-item').forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      menu.remove();
      if (action === 'block-diagram') DA_BLOCK.toggle();
      if (action === 'parallel-fetch' || action === 'parallel-change') showParallelDialog();
      if (action === 'parallel-hide') {
        // Non-destructive: conceal the cells, keep the text/formatting. The
        // column keeps following splits/merges while hidden.
        DA_STATE.parallelHidden = true;
        if (window.renderAll) window.renderAll();
        showStatus('Parallel column hidden — its text is kept with the project.', 'info');
      }
      if (action === 'parallel-unhide') {
        DA_STATE.parallelHidden = false;
        if (window.DA_BLOCK && DA_BLOCK.isActive()) DA_BLOCK.setActive(false);
        if (window.renderAll) window.renderAll();
        showStatus(`Parallel column: ${DA_STATE.parallelLabel}.`, 'success');
      }
    });
  });

  manageDialogFocus(menu);
  setupClickOutside(menu, () => menu.remove());
}

// Curated Bolls translation codes for the parallel column.
const PARALLEL_TRANSLATIONS = [
  { code: 'CUV', name: '中文和合本 — Chinese Union (Traditional)' },
  { code: 'CUNPS', name: '新标点和合本 — Chinese Union (Simplified)' },
  { code: 'KRV', name: '개역한글 — Korean Revised' },
  { code: 'RV1960', name: 'Reina-Valera 1960 (Español)' },
  { code: 'LUT', name: 'Luther 1912 (Deutsch)' },
  { code: 'NVIPT', name: 'Nova Versão Internacional (Português)' },
  { code: 'ESV', name: 'English Standard Version' },
  { code: 'NASB', name: 'NASB (1995)' },
  { code: 'SBLGNT', name: 'Ελληνικά — Greek NT (SBLGNT)' },
  { code: 'LXX', name: 'Ελληνικά — Greek OT (Septuagint)' },
  { code: 'WLC', name: 'עברית — Hebrew OT (Westminster Leningrad)' },
];

/** Pick a translation and fetch it into the view-only parallel column. */
function showParallelDialog() {
  const existing = document.querySelector('.parallel-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.className = 'label-picker custom-label-dialog parallel-dialog';
  dialog.style.width = '300px';
  dialog.innerHTML = `
    <div class="picker-title">Parallel Column</div>
    <div style="padding: 5px;">
      <select id="parallelTranslationSelect" aria-label="Parallel translation" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); box-sizing: border-box;">
        ${PARALLEL_TRANSLATIONS.map((t) => `<option value="${t.code}"${t.code === DA_STATE.parallelLabel ? ' selected' : ''}>${DA_UI.escapeHtml(t.name)}</option>`).join('')}
      </select>
      <div class="hint-small" style="margin: 6px 0 8px; font-size: 0.7rem;">Editable beside the text (splits with Enter in Text Edit mode) and saved with the project.</div>
      <button id="parallelShowBtn" class="series" style="width: 100%; padding: 6px;">Show</button>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.style.left = `${Math.max(8, window.innerWidth / 2 - 150)}px`;
  dialog.style.top = '25%';

  makeFixedDraggable(dialog, '.picker-title');

  dialog.querySelector('#parallelShowBtn').addEventListener('click', async () => {
    const code = dialog.querySelector('#parallelTranslationSelect').value;
    dialog.remove();

    // Replacing an existing column overwrites its (possibly edited) cells —
    // confirm first. The pushUndo below makes it recoverable either way.
    if (DA_STATE.parallelLabel
      && !confirm(`Replace the current ${DA_STATE.parallelLabel} column (including any edits) with ${code}? Ctrl+Z undoes this.`)) return;

    // The parallel column belongs to the bracket view.
    if (window.DA_BLOCK && DA_BLOCK.isActive()) DA_BLOCK.setActive(false);

    showStatus(`Fetching ${code}…`, 'info');
    try {
      const chapterMap = await DA_BIBLE.fetchParallelVerses(code, DA_STATE.passageRef || '');
      // Distribute the chapter onto the current rows ONCE (each verse's text
      // lands on its first row); from here on the cells are ordinary per-row
      // editable text in DA_STATE.parallelTexts.
      const cells = DA_RENDERER.distributeVersesToRows(chapterMap);
      if (!cells.some(t => t)) throw new Error('No matching verses found for this passage.');

      DA_STATE.pushUndo('show parallel column');
      DA_STATE.parallelTexts = cells;
      DA_STATE.parallelLabel = code;
      DA_STATE.parallelHidden = false;
      // Cell formatting belonged to the previous column's text, if any.
      DA_STATE.formatTags = DA_STATE.formatTags.filter(f => !f.pcol);
      if (window.renderAll) window.renderAll();
      showStatus(`Parallel column: ${code}.`, 'success');
    } catch (err) {
      showStatus(err.message || 'Could not fetch the parallel translation.', 'error');
    }
  });

  manageDialogFocus(dialog);
  setupClickOutside(dialog, () => dialog.remove());
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
  const rect = openMenuBtn?.getBoundingClientRect() || { top: e.clientY, right: e.clientX, left: e.clientX };
  picker.style.top = `${rect.top}px`;
  picker.style.left = `${(rect.right || rect.left) + 10}px`;

  manageDialogFocus(picker);
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
  manageDialogFocus(dialog, { initialFocus: input });

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

function showArrowActions(arrowIdx, centerY, centerX) {
  const existing = document.getElementById('arrowActions');
  if (existing) existing.remove();
  if (!DA_STATE.wordArrows[arrowIdx]) return;

  const popover = document.createElement('div');
  popover.id = 'arrowActions';
  popover.className = 'context-menu';
  popover.innerHTML = `
    <div class="menu-item danger" data-action="delete">Delete Arrow</div>
  `;

  popover.style.left = `${centerX}px`;
  popover.style.top = `${centerY}px`;
  document.body.appendChild(popover);
  clampToViewport(popover);

  const dismiss = () => {
    popover.remove();
    if (DA_STATE.selectedArrowIdx !== null) {
      DA_STATE.selectedArrowIdx = null;
      if (window.renderAll) window.renderAll();
    }
  };

  popover.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    DA_STATE.pushUndo('delete arrow');
    DA_STATE.wordArrows.splice(arrowIdx, 1);
    dismiss();
    showStatus('Arrow removed.', 'success');
  });

  setupClickOutside(popover, dismiss);
}

window.DA_UI = Object.assign(window.DA_UI || {}, {
  showBracketActions, showTextContextMenu, showLabelPicker, computeLabelPickerPosition, showExportMenu, showOpenMenu, showAlternateViewsMenu, showParallelDialog, showArrowActions
});
