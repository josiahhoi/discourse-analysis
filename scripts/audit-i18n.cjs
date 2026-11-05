/** Catalog parity, interpolation and source-literal regression guard. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'i18n-source-baseline.json');
const LANGUAGES = ['en', 'zh-CN', 'zh-Hant'];
// Chinese fixed units replace these English grammatical unit parameters.
const grammarUnitExceptions = {
  's.S0017': ['verses'], 's.S0026': ['verses'], 's.S0029': ['verses'],
  's.S0422': ['rows'], 's.S0425': ['rows'],
  'confirm.deleteDependents': ['brackets'], 'block.verses': ['unit']
};
const intentionalFallback = []; // All shipped locales have complete catalogs.
function filesUnder(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(e =>
    e.isDirectory() ? filesUnder(dir + '/' + e.name) : [dir + '/' + e.name]);
}
function sourceFiles() {
  return ['app.js', 'main.js', 'preload.js', 'index.html', 'styles.css', ...filesUnder('js'), ...filesUnder('functions')]
    .filter(f => !f.includes('/vendor/') && !/i18n\/(en|zh-CN|zh-Hant)\.js$/.test(f) && /\.(?:js|cjs|html|css)$/.test(f));
}
function catalogs() {
  const s = { window: {} };
  vm.createContext(s);
  for (const lang of LANGUAGES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/i18n/' + lang + '.js'), 'utf8'), s);
  return s.window.DA_I18N_CATALOGS;
}
function literals(file, source) {
  const out = [];
  function add(kind, text, start) {
    if (!/[A-Za-z]/.test(text)) return;
    const id = crypto.createHash('sha256').update(file + '\0' + kind + '\0' + text).digest('hex').slice(0, 20);
    out.push({ id, file, line: source.slice(0, start).split('\n').length, kind, text });
  }
  if (/\.(js|cjs)$/.test(file)) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(n) {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add('literal', n.text, n.getStart(tree));
      else if (ts.isTemplateExpression(n)) {
        add('template', n.head.text + n.templateSpans.map(x => '{' + x.expression.getText(tree) + '}' + x.literal.text).join(''), n.getStart(tree));
        n.templateSpans.forEach(x => visit(x.expression));
        return;
      }
      ts.forEachChild(n, visit);
    }
    visit(tree);
  } else if (file.endsWith('.css')) {
    for (const m of source.matchAll(/\bcontent\s*:\s*(['"])(.*?)\1/g)) add('css-content', m[2], m.index);
  } else {
    const html = source.replace(/<!--[^]*?-->/g, m => ' '.repeat(m.length));
    for (const m of html.matchAll(/>\s*([^<>]+?)\s*</g)) add('html-text', m[1], m.index);
    for (const m of html.matchAll(/\b(title|placeholder|aria-label|data-placeholder|data-drop-label)="([^"]*)"/g)) add('html-' + m[1], m[2], m.index);
  }
  return out;
}
function collect() {
  const rows = new Map();
  for (const f of sourceFiles()) for (const r of literals(f, fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
    if (rows.has(r.id)) rows.get(r.id).occurrences++;
    else rows.set(r.id, { ...r, occurrences: 1 });
  }
  return [...rows.values()];
}
function compareSnapshot(actual, expected) {
  const known = new Map(expected.map(x => [x.id, x]));
  return actual.filter(x => !known.has(x.id) || x.occurrences > known.get(x.id).occurrences);
}
// Fingerprints cover every extracted literal and occurrence, without storing a
// large inventory of source text. Ordering and line-number changes are ignored.
function fingerprints(rows = collect()) {
  const grouped = {};
  for (const row of rows) (grouped[row.file] ||= []).push([row.id, row.occurrences]);
  return Object.fromEntries(Object.entries(grouped).sort().map(([file, values]) =>
    [file, crypto.createHash('sha256').update(JSON.stringify(values.sort())).digest('hex')]));
}
function check({ dict = catalogs(), baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) } = {}) {
  const issues = [];
  const parameters = value => [...new Set([...JSON.stringify(value ?? '').matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
  for (const locale of LANGUAGES) {
    for (const key of Object.keys(dict.en)) {
      const entry = dict[locale][key];
      if (!entry || typeof entry !== 'string' && !entry.other) issues.push('Missing/empty translation: ' + locale + ':' + key);
      const omitted = parameters(dict.en[key]).filter(p => !parameters(entry).includes(p));
      if (JSON.stringify(omitted) !== JSON.stringify(locale === 'en' ? [] : grammarUnitExceptions[key] || []))
        issues.push('Unapproved parameter omission: ' + locale + ':' + key);
      if (entry && parameters(entry).some(p => !parameters(dict.en[key]).includes(p))) issues.push('Unknown parameter: ' + locale + ':' + key);
      if (locale === 'zh-Hant' && JSON.stringify(parameters(entry)) !== JSON.stringify(parameters(dict['zh-CN'][key])))
        issues.push('Chinese parameter mismatch: ' + key);
    }
    for (const key of Object.keys(dict[locale])) if (!Object.hasOwn(dict.en, key)) issues.push('No English baseline: ' + locale + ':' + key);
  }
  const used = new Set();
  for (const f of sourceFiles()) {
    const source = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of source.matchAll(/data-i18n(?:-[a-z-]+)?=["']([^"']+)["']/g)) {
      if (!m[1].includes('${') && !m[1].includes(' ') && !['live', 'args'].includes(m[1])) used.add(m[1]);
    }
    for (const m of source.matchAll(/DA_I18N\.(?:t|bindText)\(\s*['"]([^'"]+)['"]/g)) if (!m[1].endsWith('.')) used.add(m[1]);
    // Keys passed through status/binding helpers are still covered.
    for (const r of literals(f, source)) if (r.kind === 'literal' && /^(?:s\.S\d{4}|action\..+)$/.test(r.text)) used.add(r.text);
  }
  for (const k of used) if (!Object.hasOwn(dict.en, k)) issues.push('Unknown key: ' + k);
  const rows = collect();
  const actual = fingerprints(rows);
  for (const file of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    if (actual[file] !== baseline[file]) issues.push('Review changed source literals: ' + file);
  }
  return { issues, englishKeys: Object.keys(dict.en).length, chineseKeys: Object.keys(dict['zh-CN']).length,
    traditionalKeys: Object.keys(dict['zh-Hant']).length,
    approvedGrammarUnitExceptions: Object.keys(grammarUnitExceptions).length,
    traditionalMissingKeys: Object.keys(dict.en).filter(k => !dict['zh-Hant'][k]).length,
    explicitKeysChecked: used.size, sourceFiles: sourceFiles().length, sourceRecords: rows.length, intentionalFallback };
}
if (require.main === module) {
  if (process.argv.includes('--write-snapshot')) {
    throw new Error('Review and classify source literals explicitly; automatic snapshot replacement is disabled.');
  }
  if (process.argv.includes('--fingerprints')) {
    console.log(JSON.stringify(fingerprints(), null, 2));
  } else {
    const result = check();
    console.log(JSON.stringify(result, null, 2));
    if (result.issues.length) process.exitCode = 1;
  }
}
module.exports = { check, collect, catalogs, compareSnapshot, literals, fingerprints, intentionalFallback };
