/** Display/search adapter. DA_PROFILES remains the raw-data authority. */
(function () {
  const extraNames = {
    'action-manner': ['Way-End'],
    'action-purpose': ['Means-End'],
    'action-result': ['cause-effect'],
    concessive: ['Adversative']
  };
  const groupKeys = {
    'MY PRESET LABELS': 's.S0547',
    'PROJECT-SPECIFIC LABELS': 's.S0548',
    'COORDINATE RELATIONSHIPS': 'group.coordinate',
    'SUBORDINATE RELATIONSHIPS': 'group.subordinate',
    'Support by Restatement': 'group.restatement',
    'Support by Distinct Statement': 'group.distinct',
    'Support by Contrary Statement': 'group.contrary',
    'OTHER RELATIONSHIPS': 'group.other'
  };
  const bare = (name) => name.replace(/\s*\([^)]*\)\s*$/, '').trim();

  function variant(type) {
    const t = DA_PROFILES.effectiveType(type);
    const name = bare(DA_PROFILES.getName(t));
    return (extraNames[t] || []).find((candidate) => candidate === name ||
      candidate === 'cause-effect' && name === 'Cause-Effect') || t;
  }

  function profileLabels(locale = DA_I18N.getLocale()) {
    const active = DA_PROFILES.getActive();
    return active.builtin && DA_PROFILES.builtins()[active.id]
      ? window.DA_I18N_PROFILE_LABELS?.[locale]?.[active.id] : null;
  }

  function translatedName(type) {
    const key = 'relationship.name.' + variant(type);
    const english = window.DA_I18N_CATALOGS.en[key];
    const override = profileLabels()?.names[type];
    return override && english ? override + ' ' + english : DA_I18N.t(key);
  }

  function getName(type) {
    const t = DA_PROFILES.effectiveType(type);
    const raw = DA_PROFILES.getName(t);
    if (t.startsWith('cl_')) {
      const custom = [...(DA_STATE.customLabels || []), ...(DA_STATE.savedCustomLabels || [])].find((item) => item.id === t);
      return custom ? `${custom.name} (${custom.label})` : raw;
    }
    const active = DA_PROFILES.getActive();
    const builtin = active.builtin && DA_PROFILES.builtins()[active.id];
    if (!builtin) return raw;
    const original = builtin.labels[t]?.name || DA_CONSTANTS.RELATIONSHIP_LABELS[t];
    // An imported or manually modified builtin flag must not translate a rename.
    if (!original || raw !== original) return raw;
    const key = 'relationship.name.' + variant(t);
    if (!Object.prototype.hasOwnProperty.call(window.DA_I18N_CATALOGS.en, key)) return raw;
    return translatedName(t) + raw.slice(bare(raw).length);
  }

  function getDefinition(type) {
    const original = DA_CONSTANTS.RELATIONSHIP_DEFINITIONS[type]?.definition || '';
    const key = 'relationship.definition.' + variant(type);
    return Object.prototype.hasOwnProperty.call(window.DA_I18N_CATALOGS.en, key)
      ? DA_I18N.t(key) : original;
  }

  /** Display only: the raw profile abbreviation is never rewritten or stored. */
  function selectorPresentation(type) {
    const t = DA_PROFILES.effectiveType(type);
    const full = getName(type);
    const active = DA_PROFILES.getActive();
    const builtin = active.builtin && DA_PROFILES.builtins()[active.id];
    const original = builtin && (builtin.labels[t]?.name || DA_CONSTANTS.RELATIONSHIP_LABELS[t]);
    const compact = ['zh-CN', 'zh-Hant'].includes(DA_I18N.getLocale()) && !t.startsWith('cl_')
      && !!original && DA_PROFILES.getName(t) === original;
    const key = 'relationship.name.' + variant(t);
    const english = window.DA_I18N_CATALOGS.en[key];
    if (!compact || !english) return { compact: false, full, name: full, abbr: '' };
    const translated = translatedName(t);
    const name = translated.endsWith(' ' + english)
      ? translated.slice(0, -english.length - 1) : translated;
    const abbr = DA_PROFILES.getAbbr(t);
    return { compact: true, name, abbr, full: `${translated}（${abbr}）` };
  }

  function getKeywords(type) {
    const key = 'relationship.keywords.' + DA_PROFILES.effectiveType(type);
    const original = DA_CONSTANTS.RELATIONSHIP_DEFINITIONS[type]?.keywords || '';
    return Object.hasOwn(window.DA_I18N_CATALOGS.en, key) ? DA_I18N.t(key) : original;
  }

  function searchTerms(type) {
    const names = [type, ...(extraNames[type] || [])];
    return ['en', 'zh-CN', 'zh-Hant'].flatMap(locale => {
      const catalog = window.DA_I18N_CATALOGS[locale] || {};
      return [...names.map(name => catalog['relationship.name.' + name]),
        profileLabels(locale)?.names[type]].filter(Boolean);
    });
  }

  function searchKeywords(type) {
    return ['en', 'zh-CN', 'zh-Hant'].flatMap(locale => {
      const catalog = window.DA_I18N_CATALOGS[locale] || {};
      return [type, ...(extraNames[type] || [])]
        .flatMap(name => [catalog['relationship.definition.' + name], catalog['relationship.keywords.' + name]])
        .filter(Boolean);
    });
  }

  window.DA_RELATIONSHIPS = {
    getName, getDefinition, getKeywords, selectorPresentation, searchTerms, searchKeywords,
    getGroupName: (name) => groupKeys[name]
      ? profileLabels()?.groups[groupKeys[name]] || DA_I18N.t(groupKeys[name]) : name
  };
})();
