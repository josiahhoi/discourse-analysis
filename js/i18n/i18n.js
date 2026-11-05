/** Small display-only i18n layer. No document state, HTML evaluation or reloads. */
(function () {
  const STORAGE_KEY = 'biblebracket_language';
  const choices = ['system', 'en', 'zh-CN', 'zh-Hant'];
  const catalogs = window.DA_I18N_CATALOGS || {};
  const listeners = new Set();
  const bindings = new WeakMap();
  const liveValues = new WeakMap();
  let systemLanguages = Array.from(navigator.languages || [navigator.language || 'en']);
  let preference = 'system';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (choices.includes(saved)) preference = saved;
  } catch (_) { /* Storage can be unavailable; the current session still works. */ }

  function resolveLocale(languages) {
    try {
      const first = String((languages || [])[0] || 'en').replace(/_/g, '-');
      const parsed = new Intl.Locale(first);
      if (parsed.language !== 'zh') return 'en';
      if (parsed.script) return ({ Hans: 'zh-CN', Hant: 'zh-Hant' })[parsed.script] || 'en';
      if (['TW', 'HK', 'MO'].includes(parsed.region)) return 'zh-Hant';
      return !parsed.region || ['CN', 'SG', 'MY'].includes(parsed.region) ? 'zh-CN' : 'en';
    } catch (_) { return 'en'; }
  }
  let locale = preference === 'system' ? resolveLocale(systemLanguages) : preference;

  function t(key, params = {}) {
    params = params && typeof params === 'object' ? params : {};
    const own = (dict) => dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
    let entry = own(catalogs[locale]);
    let messageLocale = locale;
    if (entry == null || entry === '') { entry = own(catalogs.en); messageLocale = 'en'; }
    const pick = (value, language) => {
      if (value && typeof value === 'object') {
        const rule = new Intl.PluralRules(language).select(Number(params.count));
        return value[rule] || value.other;
      }
      return value;
    };
    let message = pick(entry, messageLocale);
    if (typeof message !== 'string' || !message) message = pick(own(catalogs.en), 'en');
    if (typeof message !== 'string' || !message) message = 'Text unavailable';
    return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, name) =>
      !Object.prototype.hasOwnProperty.call(params, name) || params[name] == null ? match : String(params[name]));
  }

  // Preserve icons/keyboard elements. Prefer a marked span for mixed content.
  function writeText(el, text) {
    if (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    if (!el.children.length) {
      if (el.textContent !== text) el.textContent = text;
      return;
    }
    const node = Array.from(el.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
    if (node && node.textContent !== text) node.textContent = text;
  }

  function applyElement(el) {
    let params = {};
    try { params = JSON.parse(el.getAttribute('data-i18n-args') || '{}'); } catch (_) { /* Safe defaults. */ }
    const bound = bindings.get(el);
    if (bound) params = typeof bound.params === 'function' ? bound.params() : bound.params;
    const key = el.getAttribute('data-i18n');
    if (key) writeText(el, t(key, params));
    for (const attr of ['title', 'placeholder', 'aria-label', 'data-placeholder', 'data-drop-label']) {
      const attrKey = el.getAttribute('data-i18n-' + attr);
      if (attrKey) el.setAttribute(attr, t(attrKey, params));
    }
    liveValues.get(el)?.forEach((render, attr) => {
      const value = String(render() ?? '');
      if (attr === 'text') writeText(el, value);
      else el.setAttribute(attr, value);
    });
  }

  /** @param {Document | DocumentFragment | Element} [root] */
  function apply(root = document) {
    if (root.nodeType === 1) applyElement(root);
    root.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-data-placeholder], [data-i18n-data-drop-label], [data-i18n-live]')
      .forEach(applyElement);
    // Template contents are not descendants of the live document.
    root.querySelectorAll('template').forEach((template) => apply(template.content));
  }

  function bindText(el, key, params = {}) {
    if (!el) return;
    el.setAttribute('data-i18n', key);
    bindings.set(el, { params });
    applyElement(el);
  }

  // Display-only derived values (mode labels, dates, ARIA and current names).
  // Never bind form values, innerHTML or user-authored editable content.
  function bindValue(el, render, attr = 'text') {
    if (!el || !['text', 'title', 'placeholder', 'aria-label', 'data-placeholder'].includes(attr)) return;
    if (!liveValues.has(el)) liveValues.set(el, new Map());
    liveValues.get(el).set(attr, render);
    el.setAttribute('data-i18n-live', '');
    applyElement(el);
  }

  function refresh() {
    const previous = locale;
    locale = preference === 'system' ? resolveLocale(systemLanguages) : preference;
    if (document.documentElement) document.documentElement.lang = locale;
    apply();
    window.electronAPI?.setInterfaceLocale?.(locale);
    listeners.forEach((listener) => {
      try { listener({ locale, preference, previous }); } catch (err) { console.error('[i18n]', err); }
    });
  }

  function setPreference(value) {
    if (!choices.includes(value)) return false;
    preference = value;
    try { localStorage.setItem(STORAGE_KEY, value); } catch (_) { /* Session-only fallback. */ }
    refresh();
    // The OS may have changed while a manual language was selected.
    if (value === 'system') window.DA_I18N.ready = refreshSystemLanguages();
    return true;
  }

  async function refreshSystemLanguages() {
    let languages = Array.from(navigator.languages || [navigator.language || 'en']);
    try {
      const native = await window.electronAPI?.getSystemLanguages?.();
      if (Array.isArray(native) && native.length) languages = Array.from(native);
    } catch (_) { /* Browser locale remains a safe fallback. */ }
    systemLanguages = languages;
    if (preference === 'system') refresh();
  }

  window.DA_I18N = {
    STORAGE_KEY, t, apply, bindText, bindValue, resolveLocale, setPreference,
    getLocale: () => locale,
    getPreference: () => preference,
    getSystemLanguages: () => systemLanguages.slice(),
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    ready: null
  };
  if (document.documentElement) document.documentElement.lang = locale;
  window.electronAPI?.setInterfaceLocale?.(locale);
  window.DA_I18N.ready = refreshSystemLanguages();
  window.addEventListener('languagechange', refreshSystemLanguages);
  window.addEventListener('focus', () => { if (preference === 'system') refreshSystemLanguages(); });
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    preference = choices.includes(event.newValue) ? event.newValue : 'system';
    refresh();
  });

  function init() {
    apply();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver((changes) => {
        changes.forEach((change) => change.addedNodes.forEach((node) => {
          if (node.nodeType === 1) apply(/** @type {Element} */ (node));
        }));
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
