/**
 * Tests for the Logical Relationships Guide (ui-dialogs.js).
 *
 * Regression: the guide read DA_CONSTANTS directly (e.g. "Ac/Mn*", "Id/Exp*")
 * while brackets render through the active notation profile (Josiah:
 * "Ac* / Mn", "Id* / Exp"), so the guide contradicted the diagram — reported
 * by a professor whose students saw the star on different arms. It also
 * cached the table on first open, so a profile switch never showed up.
 */
const { test } = require('node:test');
// Non-strict assert: sandbox values live in another realm (see editor-logic.test.js).
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

/** Just enough DOM for populateReferenceGuide: elements that record children
 *  and text, and two ids (the table body and the title). */
function fakeDom() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(),
    children: [],
    textContent: '',
    className: '',
    colSpan: 1,
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); },
    replaceChildren() { this.children = []; },
    setAttribute() {},
    addEventListener() {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  });
  const tbody = make('tbody');
  const title = make('h2');
  const byId = { referenceTableBody: tbody, referenceGuideTitle: title };
  return {
    tbody, title,
    document: {
      getElementById: (id) => byId[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: make,
      addEventListener() {},
      readyState: 'complete',
    },
  };
}

function setup() {
  const dom = fakeDom();
  const sb = createSandbox({ document: dom.document });
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/profiles.js');
  load(sb, 'js/utils/render-labels.js');
  load(sb, 'js/utils/ui-dialogs.js');
  return { sb, dom };
}

/** Flatten sections into { type: row } for easy lookup. */
function rowsByType(sb) {
  const out = {};
  sb.DA_UI.referenceGuideSections().forEach((s) => s.rows.forEach((r) => { out[r.type] = r; }));
  return out;
}

/** Visible text of each table row, cell by cell (strong-wrapped names unwrapped). */
function tableText(tbody) {
  const text = (td) => (td.children.length ? td.children.map((c) => c.textContent).join('') : td.textContent);
  return tbody.children.map((tr) => tr.children.map(text));
}

test('abbreviations follow the active profile, matching what brackets draw', () => {
  const { sb } = setup();
  sb.DA_PROFILES.setActiveById('josiah');
  let rows = rowsByType(sb);
  assert.equal(rows['action-manner'].abbr, 'Ac* / Mn');
  assert.equal(rows['idea-explanation'].abbr, 'Id* / Exp');
  assert.equal(rows.inference.abbr, '∴ / *');
  assert.equal(rows.series.abbr, 'S');

  sb.DA_PROFILES.setActiveById('biblearc');
  rows = rowsByType(sb);
  assert.equal(rows['idea-explanation'].abbr, 'Id / Exp*');
});

test('profile renames show in the guide (Gurtner: Cause-Effect, not Action-Result)', () => {
  const { sb } = setup();
  sb.DA_PROFILES.setActiveById('gurtner');
  const rows = rowsByType(sb);
  assert.equal(rows['action-result'].name, 'Cause-Effect');
  assert.equal(rows['action-result'].abbr, 'C / E*');
});

test('dominance off strips stars from the guide too (Schreiner)', () => {
  const { sb } = setup();
  sb.DA_PROFILES.setActiveById('schreiner');
  const rows = rowsByType(sb);
  assert.equal(rows['action-manner'].abbr, 'Ac / Mn');
  assert.ok(Object.values(rows).every((r) => !r.abbr.includes('*')), 'no star anywhere');
});

test('only the profile\'s own relationships are listed, and empty groups drop', () => {
  const { sb } = setup();
  sb.DA_PROFILES.setActiveById('josiah');
  let rows = rowsByType(sb);
  assert.ok(!rows['both-and'], 'Josiah has no Both-And');
  assert.ok(!rows['double-ground'], 'Josiah has no Double Ground');

  sb.DA_PROFILES.setActiveById('schreiner');
  rows = rowsByType(sb);
  assert.ok(rows['double-ground'], 'Schreiner has Double Ground');
  // A top-level group may be a bare header over its subgroups, but every
  // subgroup that survives must have rows.
  const sections = sb.DA_UI.referenceGuideSections();
  assert.ok(sections.filter((s) => s.subgroup).every((s) => s.rows.length > 0));
  sections.forEach((s, i) => {
    if (!s.subgroup && !s.rows.length) assert.ok(sections[i + 1] && sections[i + 1].subgroup, `${s.name} has content`);
  });
});

test('keywords and definitions still come from the shared definitions', () => {
  const { sb } = setup();
  const rows = rowsByType(sb);
  assert.equal(rows.ground.keywords, sb.DA_CONSTANTS.RELATIONSHIP_DEFINITIONS.ground.keywords);
  assert.equal(rows.ground.definition, sb.DA_CONSTANTS.RELATIONSHIP_DEFINITIONS.ground.definition);
});

test('a custom profile\'s unknown types land in a trailing Other section', () => {
  const { sb } = setup();
  sb.DA_PROFILES.setActive({ name: 'Custom', types: ['series', 'mystery-type'] });
  const sections = sb.DA_UI.referenceGuideSections();
  const last = sections[sections.length - 1];
  assert.equal(last.name, 'OTHER RELATIONSHIPS');
  assert.deepEqual(last.rows.map((r) => r.type), ['mystery-type']);
});

test('the table rebuilds on every open, so a profile switch shows up', () => {
  const { sb, dom } = setup();
  sb.DA_PROFILES.setActiveById('josiah');
  sb.populateReferenceGuide();
  const josiahRows = tableText(dom.tbody);
  assert.ok(josiahRows.some((r) => r[1] === 'Id* / Exp'));
  assert.match(dom.title.textContent, /Josiah$/);

  sb.DA_PROFILES.setActiveById('biblearc');
  sb.populateReferenceGuide();
  const arcRows = tableText(dom.tbody);
  assert.ok(arcRows.some((r) => r[1] === 'Id / Exp*'));
  assert.ok(!arcRows.some((r) => r[1] === 'Id* / Exp'), 'old rows were cleared, not appended to');
  assert.match(dom.title.textContent, /BibleArc$/);
});

test('profile-supplied text is written as text, never parsed as HTML', () => {
  const { sb, dom } = setup();
  const evil = '<img src=x onerror=alert(1)>';
  sb.DA_PROFILES.setActive({ name: 'X', types: ['ground'], labels: { ground: { name: evil, abbr: '* / G' } } });
  sb.populateReferenceGuide();
  const rows = tableText(dom.tbody);
  assert.ok(rows.some((r) => r[0] === evil), 'the name appears verbatim as text');
  assert.ok(dom.tbody.children.every((tr) => !('innerHTML' in tr)), 'no innerHTML writes');
});
