/**
 * Notation Profiles
 * -----------------
 * A profile is a *sparse overlay* on the built-in defaults (DA_CONSTANTS) that
 * controls how relationships are presented:
 *   - dominance.default        whether the dominance star (*) is shown at all
 *   - dominance.perType[type]  per-relationship override of the above
 *   - labels[type].{abbr,name,color}  rename / recolor a relationship
 *
 * Storing only deltas keeps profiles tiny, shareable, and forward-compatible:
 * relationships added to the app later still render even if a profile predates
 * them. The active profile is a global preference (localStorage).
 *
 * Built-ins: Standard (pure defaults), No Dominance (default off), and Gurtner
 * (the alternate label set — this replaces the old reviewer-name "gurtner" hack).
 *
 * Namespace: window.DA_PROFILES
 */
(function () {
  const ACTIVE_KEY = 'da_active_profile';
  const SCHEMA = 1;

  const DEFAULT_ID = 'josiah';

  // Foreign-type display aliases. When the active profile doesn't include a
  // type but does include its alias, the type is rendered AS the alias. This
  // lets a General-Specific or Fact-Interpretation bracket (created in Gurtner/
  // Beale) appear as Idea-Explanation when read in a system that uses it.
  const ALIASES = {
    'general-specific': 'idea-explanation',
    'fact-interpretation': 'idea-explanation'
  };

  // Relationship types that may be created by "jumping over" intermediate
  // propositions (flat multi-member units). A profile offers whichever of these
  // it actually includes.
  const JUMP_OVER_TYPES = ['series', 'bilateral', 'double-ground'];

  // Compact per-system definitions, transcribed from the notation spreadsheet.
  // Each entry is [type, abbr, name?]. The abbr string is the single source of
  // structure: "/" splits the two arms, "*" marks dominance, and a literal "//"
  // is the comparison glyph (never auto-add a star — the data is explicit).
  // `name` overrides the menu label only where a system renames a relationship.
  const PROFILE_DEFS = {
    josiah: {
      name: 'Josiah', dominance: true,
      entries: [
        ['series', 'S'], ['progression', 'P / *'], ['alternative', 'A'],
        ['action-manner', 'Ac* / Mn'], ['comparison', 'Cf / *'],
        ['negative-positive', '- / +*'], ['idea-explanation', 'Id* / Exp'],
        ['question-answer', 'Q / A*'], ['ground', '* / G'], ['inference', '∴ / *'],
        ['action-result', 'Ac / Res*'], ['conditional', 'If / Th*'],
        ['action-purpose', 'Ac / Pur*'], ['temporal', 'T / *'], ['locative', 'L / *'],
        ['bilateral', 'BL'], ['concessive', 'Csv / *'], ['situation-response', 'Sit / R*']
      ]
    },
    biblearc: {
      name: 'BibleArc', dominance: true,
      entries: [
        ['series', 'S'], ['progression', 'P'], ['alternative', 'A'],
        ['action-manner', 'Ac* / Mn'], ['comparison', 'Cf / *'],
        ['negative-positive', '- / +*'], ['idea-explanation', 'Id / Exp*'],
        ['question-answer', 'Q / A*'], ['ground', '* / G'], ['inference', '∴ / *'],
        ['action-result', 'Ac / Res*'], ['conditional', 'If / Th*'],
        ['action-purpose', 'Ac / Pur*'], ['temporal', 'T / *'], ['locative', 'L / *'],
        ['bilateral', 'BL'], ['concessive', 'Csv / *'], ['situation-response', 'Sit / R*']
      ]
    },
    gurtner: {
      name: 'Gurtner', dominance: true,
      entries: [
        ['series', 'S'], ['progression', 'P / *'], ['alternative', 'A'],
        ['action-manner', 'W / Ed*', 'Way-End (W/Ed)'], ['comparison', '//'],
        ['negative-positive', '- / +*'], ['general-specific', 'Gn / Sp*'],
        ['fact-interpretation', 'Ft / In*'], ['question-answer', 'Q / A*'],
        ['ground', '* / G'], ['inference', '∴ / *'],
        ['action-result', 'C / E*', 'Cause-Effect (C/E)'],
        ['conditional', 'C? / E*', 'Conditional (C?/E)'],
        ['action-purpose', 'M / Ed*', 'Means-End (M/Ed)'],
        ['temporal', 'T / *'], ['locative', 'L / *'],
        ['concessive', 'Adv / *', 'Adversative (Adv)'],
        ['situation-response', 'S / R*', 'Situation-Response (S/R)'],
        ['anticipation-fulfillment', 'A / F*'], ['both-and', 'B-A']
      ]
    },
    beale: {
      name: 'Beale', dominance: true,
      entries: [
        ['series', 'S'], ['progression', 'P'], ['alternative', 'A'],
        ['comparison', '// / *'], ['negative-positive', '- / +*'],
        ['general-specific', 'Gn / Sp*'], ['fact-interpretation', 'Ft / In*'],
        ['question-answer', 'Q / A*'], ['ground', '* / G'], ['inference', '∴ / *'],
        ['action-result', 'C / E*', 'Cause-Effect (C/E)'],
        ['conditional', 'C? / E*', 'Conditional (C?/E)'],
        ['action-purpose', 'M / Ed*', 'Means-End (M/Ed)'],
        ['temporal', 'T / *'], ['locative', 'L / *'],
        ['concessive', 'Adv / *', 'Adversative (Adv)'],
        ['situation-response', 'S / R*', 'Situation-Response (S/R)']
      ]
    },
    schreiner: {
      name: 'Schreiner', dominance: false,
      entries: [
        ['series', 'S'], ['progression', 'P'], ['alternative', 'A'],
        ['action-manner', 'Ac / Mn'], ['comparison', 'Cf'],
        ['negative-positive', '- / +'], ['idea-explanation', 'Id / Exp'],
        ['question-answer', 'Q / A'], ['ground', 'G'], ['inference', '∴'],
        ['action-result', 'Ac / Res'], ['conditional', 'If / Th'],
        ['action-purpose', 'Ac / Pur'], ['temporal', 'T'], ['locative', 'L'],
        ['bilateral', 'BL'], ['double-ground', 'DG', 'Double Ground (DG)'],
        ['concessive', 'Csv'], ['situation-response', 'Sit / R']
      ]
    }
  };

  function buildProfile(id, def) {
    const labels = {};
    const types = [];
    def.entries.forEach(([type, abbr, name]) => {
      types.push(type);
      const o = {};
      if (abbr != null) o.abbr = abbr;
      if (name) o.name = name;
      if (Object.keys(o).length) labels[type] = o;
    });
    return {
      schemaVersion: SCHEMA, id, name: def.name, builtin: true,
      dominance: { default: def.dominance !== false, perType: {} },
      labels, types
    };
  }

  let _builtins = null;
  function builtins() {
    if (!_builtins) {
      _builtins = {};
      // Josiah first → it is the default selection for new users.
      ['josiah', 'biblearc', 'gurtner', 'beale', 'schreiner'].forEach((id) => {
        _builtins[id] = buildProfile(id, PROFILE_DEFS[id]);
      });
    }
    return _builtins;
  }

  // Flat, canonical type order (used when a profile doesn't scope its types,
  // e.g. legacy/custom profiles loaded from storage or the cloud).
  let _allCanonical = null;
  function allCanonicalTypes() {
    if (!_allCanonical) {
      const out = [];
      (DA_CONSTANTS.RELATIONSHIP_GROUPS_HIERARCHY || []).forEach((g) => {
        if (g.types) out.push(...g.types);
        if (g.subgroups) g.subgroups.forEach((sg) => out.push(...sg.types));
      });
      _allCanonical = out;
    }
    return _allCanonical;
  }

  /** The ordered relationship types a profile exposes; null means "all". */
  function profileTypes(p) {
    return Array.isArray(p && p.types) && p.types.length ? p.types : null;
  }

  /** Active profile's visible types, in order (falls back to all canonical). */
  function getVisibleTypes() {
    return profileTypes(getActive()) || allCanonicalTypes();
  }

  /**
   * Map a stored type to how the ACTIVE profile should display it:
   *  - the profile includes it          → unchanged
   *  - it has an alias the profile has   → the alias (e.g. general-specific → idea-explanation)
   *  - otherwise                         → unchanged (renders via built-in fallback = "foreign")
   */
  function effectiveType(type, p) {
    const t = String(type).toLowerCase();
    const list = profileTypes(p || getActive());
    if (!list) return t;                       // unscoped profile: no remapping
    if (list.indexOf(t) !== -1) return t;
    const alias = ALIASES[t];
    if (alias && list.indexOf(alias) !== -1) return alias;
    return t;
  }

  /** Whether the resolved label is a two-arm bracket (slash present, "//" aside). */
  function isTwoArm(type) {
    return getAbbr(type).replace(/\/\//g, '').indexOf('/') !== -1;
  }

  /** Coerce a labels map so every entry's fields are primitives, not objects. */
  function normalizeLabels(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    Object.keys(raw).forEach((t) => {
      const entry = raw[t];
      if (!entry || typeof entry !== 'object') return;
      const clean = {};
      if (typeof entry.abbr === 'string' && entry.abbr) clean.abbr = entry.abbr;
      if (typeof entry.name === 'string' && entry.name) clean.name = entry.name;
      if (typeof entry.color === 'string' && entry.color) clean.color = entry.color;
      if (Object.keys(clean).length) out[t] = clean;
    });
    return out;
  }

  /** Coerce arbitrary (possibly imported) data into a valid profile shape. */
  function normalize(p) {
    if (!p || typeof p !== 'object') return builtins()[DEFAULT_ID];
    const out = {
      schemaVersion: p.schemaVersion || SCHEMA,
      id: p.id || 'custom',
      name: p.name || 'Custom',
      builtin: !!p.builtin,
      author: p.author || '',
      dominance: {
        default: p.dominance ? p.dominance.default !== false : true, // default true
        perType: (p.dominance && p.dominance.perType && typeof p.dominance.perType === 'object')
          ? { ...p.dominance.perType } : {}
      },
      labels: normalizeLabels(p.labels)
    };
    // Preserve the type scope (which relationships the profile exposes) when present.
    if (Array.isArray(p.types) && p.types.length) {
      out.types = p.types.filter((t) => typeof t === 'string');
    }
    return out;
  }

  let _active = null;

  function getActive() {
    if (_active) return _active;
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      if (raw) { _active = normalize(JSON.parse(raw)); return _active; }
    } catch (_) { /* fall through to default */ }
    _active = builtins()[DEFAULT_ID];
    return _active;
  }

  function setActive(profile, persist = true) {
    _active = normalize(profile);
    if (persist) {
      try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(_active)); } catch (_) { }
    }
    if (window.renderAll) window.renderAll();
    return _active;
  }

  function setActiveById(id) {
    const b = builtins()[id];
    return b ? setActive(b) : null;
  }

  // ── Resolution helpers (the rendering/UI layers go through these) ──────────

  /** Bracket abbreviation/label string (may contain "/" and "*"). */
  function getAbbr(type) {
    const t = effectiveType(type);
    const o = getActive().labels[t];
    if (o && o.abbr) return o.abbr;
    if (DA_CONSTANTS.BRACKET_LABELS[t]) return DA_CONSTANTS.BRACKET_LABELS[t];
    if (t.startsWith('cl_')) {
      const c = (DA_STATE.customLabels || []).find((cl) => cl.id === t)
        || (DA_STATE.savedCustomLabels || []).find((cl) => cl.id === t);
      if (c) return c.label;
    }
    return String(type).slice(0, 2);
  }

  /** Full display name, "Name (ABBR)" form, used by menus/summaries. */
  function getName(type) {
    const t = effectiveType(type);
    const o = getActive().labels[t];
    if (o && o.name) return o.name;
    return DA_CONSTANTS.RELATIONSHIP_LABELS[t] || type;
  }

  function getColor(type) {
    const t = effectiveType(type);
    const o = getActive().labels[t];
    if (o && o.color) return o.color;
    return DA_CONSTANTS.RELATIONSHIP_COLORS[t] || DA_CONSTANTS.RELATIONSHIP_COLORS.unspecified;
  }

  /** Whether the dominance star should be drawn for this relationship type. */
  function isDominanceShown(type) {
    const t = effectiveType(type);
    const p = getActive();
    if (Object.prototype.hasOwnProperty.call(p.dominance.perType, t)) {
      return !!p.dominance.perType[t];
    }
    return p.dominance.default !== false;
  }

  // ── Type-to-filter search (relationship picker) ────────────────────────────

  /**
   * Normalize text for picker search. Returns [spaced, squashed] lowercase
   * variants ("Q/A*" → ["q a", "qa"]) so queries match with or without
   * punctuation, or [] for empty/no-alphanumeric input.
   */
  function searchNorm(s) {
    const spaced = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return spaced ? [spaced, spaced.replace(/ /g, '')] : [];
  }

  /**
   * Search metadata for one relationship type, for the picker's filter box.
   *  - nameBlob:    the type key + its name/abbr in the ACTIVE profile, the
   *                 canonical defaults, and EVERY built-in profile — so typing
   *                 another system's vocabulary ("cause", "means") still finds
   *                 the active profile's equivalent button. Alias sources that
   *                 display as this type (general-specific → idea-explanation)
   *                 contribute their names too.
   *  - keywordBlob: key words + definition text ("because" finds Ground).
   *  - altHint:     "Also called …" tooltip text listing names other built-in
   *                 systems use, so the cross-profile match is explainable.
   * Blobs are newline-joined normalized terms; test with matchesSearch().
   */
  function searchIndexFor(type) {
    const t = String(type).toLowerCase();
    const nameTerms = new Set();
    const kwTerms = new Set();
    const add = (s, into) => searchNorm(s).forEach((v) => into.add(v));

    add(t, nameTerms);
    add(getName(t), nameTerms);
    add(getAbbr(t), nameTerms);
    add(DA_CONSTANTS.RELATIONSHIP_LABELS[t], nameTerms);
    add(DA_CONSTANTS.BRACKET_LABELS[t], nameTerms);

    if (t.startsWith('cl_')) {
      const c = (DA_STATE.customLabels || []).find((cl) => cl.id === t)
        || (DA_STATE.savedCustomLabels || []).find((cl) => cl.id === t);
      if (c) { add(c.name, nameTerms); add(c.label, nameTerms); }
    }

    // The type itself plus any alias sources that currently display AS it.
    const sourceTypes = [t];
    Object.keys(ALIASES).forEach((src) => {
      if (ALIASES[src] === t && effectiveType(src) === t) sourceTypes.push(src);
    });

    const activeName = getName(t);
    const altByName = new Map(); // display name -> [profile names]
    sourceTypes.forEach((src) => {
      if (src !== t) {
        add(src, nameTerms);
        add(DA_CONSTANTS.RELATIONSHIP_LABELS[src], nameTerms);
        add(DA_CONSTANTS.BRACKET_LABELS[src], nameTerms);
      }
      Object.values(builtins()).forEach((p) => {
        const o = p.labels[src];
        if (!o) return;
        if (o.name) add(o.name, nameTerms);
        if (o.abbr) add(o.abbr, nameTerms);
        if (o.name && o.name !== activeName) {
          if (!altByName.has(o.name)) altByName.set(o.name, []);
          altByName.get(o.name).push(p.name);
        }
      });
      const def = DA_CONSTANTS.RELATIONSHIP_DEFINITIONS[src];
      if (def) { add(def.keywords, kwTerms); add(def.definition, kwTerms); }
    });

    const altHint = altByName.size
      ? 'Also called ' + Array.from(altByName.entries())
          .map(([n, ps]) => `${n.replace(/\s*\([^)]*\)\s*$/, '')} (${ps.join(', ')})`)
          .join(', ')
      : '';

    return {
      nameBlob: Array.from(nameTerms).join('\n'),
      keywordBlob: Array.from(kwTerms).join('\n'),
      altHint
    };
  }

  /** True if the normalized query hits the given blob (spaced or squashed form). */
  function matchesSearch(blob, rawQuery) {
    const [spaced, squashed] = searchNorm(rawQuery);
    if (!spaced) return true; // empty query matches everything
    return blob.includes(spaced) || blob.includes(squashed);
  }

  // ── Cloud sharing (free plan: public read, in-app password to write) ───────
  //
  // Profiles live in the Firestore `profiles` collection keyed by a normalized
  // name, so a name is claimed first-come (enforced in a transaction). Anyone can
  // load a profile by name (public read). Editing requires the password set at
  // publish time — checked here, not in security rules, so it's accident-
  // prevention, not hardened auth (documented tradeoff). The student LOAD path
  // never needs a password.

  function nameKey(name) {
    return String(name || '')
      .trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '');
  }

  async function sha256Hex(str) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      // Non-secure context (rare): fall back to a simple non-crypto hash. The
      // gate is accident-prevention either way, so this is acceptable.
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
      return 'x' + (h >>> 0).toString(16);
    }
  }

  /** Strip cloud-only fields and return a clean, normalized profile object. */
  function fromCloud(data) {
    const { pwHash, updatedAt, ...config } = data || {};
    return normalize(config);
  }

  /**
   * Publish the given profile to the cloud under its name. Claims the name if
   * free; otherwise requires the matching password. Returns true if newly
   * created, false if it updated an existing one. Throws on wrong password.
   *
   * The stored hash is salted with the profile key so identical passwords on
   * different profiles hash differently and a leaked pwHash can't be checked
   * against a plain SHA-256 dictionary. Profiles published before salting hold
   * a bare sha256(password); those are accepted once and re-written salted.
   */
  async function publishToCloud(profile, password) {
    if (!window.db) throw new Error('Cloud is not available.');
    if (!password) throw new Error('A password is required to publish.');
    const key = nameKey(profile && profile.name);
    if (!key) throw new Error('Enter a profile name first.');

    const saltedHash = await sha256Hex(`${key}:${password}`);
    const legacyHash = await sha256Hex(password); // pre-salt scheme
    const ref = db.collection('profiles').doc(key);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().pwHash !== saltedHash && snap.data().pwHash !== legacyHash) {
        throw new Error('That name is taken and the password does not match.');
      }
      tx.set(ref, {
        ...normalize(profile),
        builtin: false,
        pwHash: saltedHash,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return !snap.exists;
    });
  }

  /** Load a profile by name and make it active. Returns the profile, or null. */
  async function loadFromCloud(name) {
    if (!window.db) throw new Error('Cloud is not available.');
    const key = nameKey(name);
    if (!key) throw new Error('Enter a profile name.');
    const snap = await db.collection('profiles').doc(key).get();
    if (!snap.exists) return null;
    return setActive(fromCloud(snap.data()));
  }

  /**
   * If the given name contains "gurtner" (any variation), automatically switch
   * to the Gurtner profile — but only when the current profile is the Standard
   * built-in, so an explicit choice by the user is never overridden.
   */
  function maybeApplyGurtnerProfile(name) {
    if (!name || !String(name).toLowerCase().includes('gurtner')) return;
    if (getActive().id === DEFAULT_ID) setActiveById('gurtner');
  }

  window.DA_PROFILES = {
    SCHEMA, DEFAULT_ID, ALIASES, JUMP_OVER_TYPES, builtins, normalize,
    getActive, setActive, setActiveById,
    getAbbr, getName, getColor, isDominanceShown,
    effectiveType, isTwoArm, profileTypes, getVisibleTypes,
    searchNorm, searchIndexFor, matchesSearch,
    nameKey, sha256Hex, publishToCloud, loadFromCloud,
    maybeApplyGurtnerProfile
  };
})();
