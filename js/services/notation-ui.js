/**
 * Notation profile editor (Settings → Notation).
 * Renders the relationship grid (name / label / dominance / color), the
 * profile selector, the All-on/All-off shortcuts, and profile file import/export.
 * Edits build a personal "Custom" profile (built-ins are never mutated) and make
 * it active, which re-renders the diagram live.
 *
 * Namespace: window.DA_NOTATION
 */
(function () {
  /** The active profile's relationship types, in order (coordinate → subordinate). */
  function typeList() {
    if (window.DA_PROFILES && DA_PROFILES.getVisibleTypes) return DA_PROFILES.getVisibleTypes();
    const out = [];
    DA_CONSTANTS.RELATIONSHIP_GROUPS_HIERARCHY.forEach((group) => {
      if (group.types) out.push(...group.types);
      if (group.subgroups) group.subgroups.forEach((sg) => out.push(...sg.types));
    });
    return out;
  }

  const stripAbbr = (name) => String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

  /**
   * A mutable Custom clone of the active profile. Built-ins are shared/immutable,
   * so the first edit forks into an editable copy named "Custom".
   */
  function ensureWorking() {
    const active = DA_PROFILES.getActive();
    const clone = {
      schemaVersion: DA_PROFILES.SCHEMA,
      id: active.builtin ? 'custom' : (active.id || 'custom'),
      name: active.builtin ? 'Custom' : (active.name || 'Custom'),
      builtin: false,
      author: active.author || '',
      dominance: {
        default: active.dominance.default !== false,
        perType: { ...active.dominance.perType }
      },
      labels: JSON.parse(JSON.stringify(active.labels || {}))
    };
    if (Array.isArray(active.types) && active.types.length) clone.types = [...active.types];
    return clone;
  }

  function applyWorking(working) {
    DA_PROFILES.setActive(working); // persists + re-renders the diagram
    renderEditor();
  }

  function setOverride(working, type, key, value, fallback) {
    if (!working.labels[type]) working.labels[type] = {};
    if (value == null || value === '' || value === fallback) {
      delete working.labels[type][key];
      if (Object.keys(working.labels[type]).length === 0) delete working.labels[type];
    } else {
      working.labels[type][key] = value;
    }
  }

  function renderSelect() {
    const sel = document.getElementById('profileSelect');
    if (!sel) return;
    const active = DA_PROFILES.getActive();
    const builtins = DA_PROFILES.builtins();
    sel.innerHTML = '';
    if (!active.builtin) {
      const opt = document.createElement('option');
      opt.value = 'custom';
      opt.textContent = (active.name || 'Custom') + ' (custom)';
      sel.appendChild(opt);
    }
    Object.values(builtins).forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.value = active.builtin ? active.id : 'custom';
  }

  function renderGrid() {
    const grid = document.getElementById('notationGrid');
    if (!grid) return;
    grid.innerHTML = '';

    typeList().forEach((type) => {
      const row = document.createElement('div');
      row.className = 'notation-row';

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'notation-name';
      name.value = stripAbbr(DA_PROFILES.getName(type));
      name.title = type;
      name.addEventListener('change', () => {
        const w = ensureWorking();
        setOverride(w, type, 'name', name.value.trim(), stripAbbr(DA_CONSTANTS.RELATIONSHIP_LABELS[type]));
        applyWorking(w);
      });

      const label = document.createElement('input');
      label.type = 'text';
      label.className = 'notation-label';
      label.value = DA_PROFILES.getAbbr(type);
      label.addEventListener('change', () => {
        const w = ensureWorking();
        setOverride(w, type, 'abbr', label.value.trim(), DA_CONSTANTS.BRACKET_LABELS[type]);
        applyWorking(w);
      });

      const domWrap = document.createElement('label');
      domWrap.className = 'notation-dom';
      const dom = document.createElement('input');
      dom.type = 'checkbox';
      // Dominance only applies to two-arm brackets (derived from the label string).
      const isSingle = !DA_PROFILES.isTwoArm(type);
      dom.checked = !isSingle && DA_PROFILES.isDominanceShown(type);
      dom.disabled = isSingle; // single-arm relationships have no dominance
      dom.title = isSingle ? 'No dominance for this relationship' : 'Mark dominance with a star';
      dom.addEventListener('change', () => {
        const w = ensureWorking();
        w.dominance.perType[type] = dom.checked;
        applyWorking(w);
      });
      domWrap.appendChild(dom);

      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'notation-color';
      color.value = DA_PROFILES.getColor(type);
      color.addEventListener('change', () => {
        const w = ensureWorking();
        setOverride(w, type, 'color', color.value, DA_CONSTANTS.RELATIONSHIP_COLORS[type]);
        applyWorking(w);
      });

      row.append(name, label, domWrap, color);
      grid.appendChild(row);
    });
  }

  function renderEditor() {
    renderSelect();
    renderGrid();
    // Keep the cloud name field in sync with the active profile, unless the user
    // is mid-edit in it.
    const cloudName = document.getElementById('cloudProfileName');
    if (cloudName && document.activeElement !== cloudName) {
      const active = DA_PROFILES.getActive();
      cloudName.value = active.builtin ? '' : (active.name || '');
    }
  }

  function setAllDominance(on) {
    const w = ensureWorking();
    w.dominance.default = on;
    w.dominance.perType = {}; // a blanket choice clears per-type exceptions
    applyWorking(w);
    DA_UI.showStatus(`Dominance turned ${on ? 'on' : 'off'} for all relationships.`, 'success');
  }

  function exportProfile() {
    const p = DA_PROFILES.getActive();
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(p.name || 'profile').replace(/[^a-z0-9]+/gi, '-')}.daprofile.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    DA_UI.showStatus('Profile exported.', 'success');
  }

  function importProfileData(data) {
    if (!data || typeof data !== 'object' || (!data.dominance && !data.labels)) {
      DA_UI.showStatus('That file is not a notation profile.', 'error');
      return;
    }
    DA_PROFILES.setActive(data); // normalize() inside guards the shape
    renderEditor();
    DA_UI.showStatus(`Loaded profile "${DA_PROFILES.getActive().name}".`, 'success');
  }

  function init() {
    const sel = document.getElementById('profileSelect');
    if (sel) sel.addEventListener('change', () => {
      if (sel.value !== 'custom') DA_PROFILES.setActiveById(sel.value);
      renderEditor();
    });

    document.getElementById('domAllOnBtn')?.addEventListener('click', () => setAllDominance(true));
    document.getElementById('domAllOffBtn')?.addEventListener('click', () => setAllDominance(false));
    document.getElementById('exportProfileBtn')?.addEventListener('click', exportProfile);

    const fileInput = document.getElementById('importProfileInput');
    document.getElementById('importProfileBtn')?.addEventListener('click', () => fileInput?.click());
    if (fileInput) fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        importProfileData(JSON.parse(await file.text()));
      } catch (_) {
        DA_UI.showStatus('Could not read profile file.', 'error');
      }
      fileInput.value = '';
    });

    document.getElementById('cloudLoadBtn')?.addEventListener('click', loadFromCloud);
    document.getElementById('cloudPublishBtn')?.addEventListener('click', publishToCloud);
  }

  async function loadFromCloud() {
    const name = document.getElementById('cloudProfileName')?.value.trim();
    if (!name) return DA_UI.showStatus('Enter a profile name to load.', 'error');
    DA_UI.showStatus(`Loading "${name}"…`, 'info');
    try {
      const loaded = await DA_PROFILES.loadFromCloud(name);
      if (!loaded) return DA_UI.showStatus(`No profile named "${name}" found.`, 'error');
      renderEditor();
      DA_UI.showStatus(`Loaded profile "${loaded.name}".`, 'success');
    } catch (err) {
      DA_UI.showStatus(err.message || 'Could not load profile.', 'error');
    }
  }

  async function publishToCloud() {
    const name = document.getElementById('cloudProfileName')?.value.trim();
    const password = document.getElementById('cloudProfilePassword')?.value || '';
    if (!name) return DA_UI.showStatus('Enter a profile name to publish.', 'error');
    if (!password) return DA_UI.showStatus('Enter a password to publish.', 'error');

    // Publish the active profile under the typed name (forking a built-in into a
    // named custom profile if needed).
    const working = ensureWorking();
    working.name = name;
    DA_PROFILES.setActive(working);

    DA_UI.showStatus(`Publishing "${name}"…`, 'info');
    try {
      const created = await DA_PROFILES.publishToCloud(DA_PROFILES.getActive(), password);
      const pw = document.getElementById('cloudProfilePassword');
      if (pw) pw.value = '';
      renderEditor();
      DA_UI.showStatus(created ? `Published "${name}". Students can load it by name.`
                               : `Updated "${name}".`, 'success');
    } catch (err) {
      DA_UI.showStatus(err.message || 'Could not publish profile.', 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DA_NOTATION = { init, renderEditor, importProfileData };
})();
