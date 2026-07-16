/**
 * End-to-end browser test (Playwright). Exercises the paths the unit tests
 * structurally can't reach — real DOM rendering, keyboard handling, SVG
 * output, downloads — through the same UI a user drives:
 *
 *   import text → split a line (Enter) → create a bracket (dot clicks) →
 *   pick a relationship → comment the bracket → export JSON (real download) →
 *   reload → re-import (real file input) → assert nothing was lost.
 *
 * Run with `npm run test:e2e` (starts its own static server on :8766).
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');

/** Read a PNG's pixel dimensions straight from its IHDR chunk (width/height
 *  are big-endian uint32s at fixed byte offsets 16/20) — no image library
 *  needed, just enough to compare two exports' sizes. */
function pngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Console/page errors collected per test; network failures (fonts/Firebase CDN
// blocked or offline) are expected in a test environment and not counted.
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/ERR_|Failed to load resource|net::/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  // Block third-party requests (fonts, Firebase CDN, bible APIs): the app
  // degrades gracefully without them, and a slow CDN otherwise hangs the page
  // "load" event long enough to flake page.goto's timeout.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  // Pre-seed identity so the first-run welcome modal doesn't appear, and pin
  // the theme so rendering is deterministic.
  await page.addInitScript(() => {
    localStorage.setItem('biblebracket_reviewer_name', 'E2E Tester');
    localStorage.setItem('biblebracket_comment_author', 'E2E Tester');
    localStorage.setItem('biblebracket_welcome_seen', 'true');
    localStorage.setItem('biblebracket_theme', 'light');
  });
});

/** Import a two-verse passage through the paste box, like a user would. */
async function importPassage(page) {
  await page.goto('/');
  await page.getByText('Or paste text to bracket or import').click();
  await page.locator('#pasteText').fill(
    '[1] In the beginning God created the heavens [2] And the earth was without form'
  );
  await page.locator('#importPassageRef').fill('Genesis 1:1-2');
  await page.locator('#importBtn').click();
  await expect(page.locator('.proposition-block')).toHaveCount(2);
  await expect(page.locator('#passageRef')).toHaveText('Genesis 1:1-2');
}

/** Place the caret at `offset` inside proposition `index` (precise caret
 *  placement isn't reliable via mouse), then the actual key press is real. */
async function setCaret(page, index, offset) {
  await page.evaluate(({ index, offset }) => {
    const span = document.querySelectorAll('.proposition-block .proposition-text')[index];
    span.focus();
    const range = document.createRange();
    range.setStart(span.firstChild, offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, { index, offset });
}

test('full lifecycle: import → split → bracket → comment → export → re-import', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);

  // ── Split verse 1 before "God" with a real Enter key press ──
  const text = 'In the beginning God created the heavens';
  await setCaret(page, 0, text.indexOf('God'));
  await page.keyboard.press('Enter');
  await expect(page.locator('.proposition-block')).toHaveCount(3);
  // Both halves share verse 1, so they render as 1a / 1b.
  await expect(page.locator('.verse-ref').nth(0)).toHaveText(/1a\s*/);
  await expect(page.locator('.verse-ref').nth(1)).toHaveText(/1b\s*/);

  // ── Create a bracket between the two halves via their dots ──
  await page.locator('.prop-dot').nth(0).click();
  await page.locator('.prop-dot').nth(1).click();
  await expect(page.locator('#labelPicker')).toBeVisible();
  await page.locator('#labelPicker button.ground').click();
  await expect(page.locator('#labelPicker')).toHaveCount(0);
  await expect(page.locator('.bracket-group.ground')).toHaveCount(1);

  // ── Comment the bracket (right-click → Add Comment) ──
  // force: a vertical SVG <line> has a zero-width bounding box, which fails
  // Playwright's visibility heuristic even though the stroked line is clickable.
  await page.locator('.bracket-hitbox').first().click({ button: 'right', force: true });
  await expect(page.locator('#bracketActions')).toBeVisible();
  await page.locator('#bracketActions [data-action="comment"]').click();
  const popover = page.locator('#commentPopover');
  await expect(popover).toBeVisible();
  await popover.locator('.new-comment-area textarea').fill('The ground of creation.');
  await popover.locator('.save-new-btn').click();
  await expect(popover.locator('.comment-text')).toContainText('The ground of creation.');
  await popover.locator('.popover-header .close-btn').click();

  // ── Comment shows up in the sidebar when comments are toggled on ──
  await page.locator('#toggleCommentsBtn').click();
  await expect(page.locator('.comments-preview-card')).toContainText('The ground of creation.');

  // ── Export the project as a real JSON download ──
  await page.locator('#exportMenuBtn').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportMenu [data-action="json"]').click();
  const download = await downloadPromise;
  const filePath = await download.path();

  // ── Fresh page, re-import the downloaded file through the file input ──
  await page.goto('/');
  await page.locator('#importFileInput').setInputFiles(filePath);

  await expect(page.locator('.proposition-block')).toHaveCount(3);
  await expect(page.locator('.proposition-block').nth(0)).toContainText('In the beginning');
  await expect(page.locator('.proposition-block').nth(1)).toContainText('God created the heavens');
  await expect(page.locator('.verse-ref').nth(0)).toHaveText(/1a\s*/);
  await expect(page.locator('#passageRef')).toHaveText('Genesis 1:1-2');
  await expect(page.locator('.bracket-group.ground')).toHaveCount(1);

  // The bracket comment survived the round trip, still attached by stable id.
  await page.locator('#toggleCommentsBtn').click();
  await expect(page.locator('.comments-preview-card')).toContainText('The ground of creation.');

  expect(errors).toEqual([]);
});

test('undo: Ctrl+Z reverts a split', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);

  const text = 'In the beginning God created the heavens';
  await setCaret(page, 0, text.indexOf('God'));
  await page.keyboard.press('Enter');
  await expect(page.locator('.proposition-block')).toHaveCount(3);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.proposition-block')).toHaveCount(2);
  await expect(page.locator('.proposition-block').nth(0)).toContainText(
    'In the beginning God created the heavens'
  );

  expect(errors).toEqual([]);
});

test('redo: Ctrl+Y restores an undone split; the Redo button and Ctrl+Shift+Z also work', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);

  const text = 'In the beginning God created the heavens';
  await setCaret(page, 0, text.indexOf('God'));
  await page.keyboard.press('Enter');
  await expect(page.locator('.proposition-block')).toHaveCount(3);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.proposition-block')).toHaveCount(2);

  await page.keyboard.press('Control+y');
  await expect(page.locator('.proposition-block')).toHaveCount(3);
  await expect(page.locator('.proposition-block').nth(0)).toContainText('In the beginning');
  await expect(page.locator('.proposition-block').nth(1)).toContainText('God created the heavens');

  // The Redo button does the same thing as the shortcut (test via undo/redo again).
  await page.keyboard.press('Control+z');
  await expect(page.locator('.proposition-block')).toHaveCount(2);
  await page.locator('#redoBtn').click();
  await expect(page.locator('.proposition-block')).toHaveCount(3);

  // Ctrl+Shift+Z is the alternate redo chord.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.proposition-block')).toHaveCount(2);
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.locator('.proposition-block')).toHaveCount(3);

  // A new action after an undo clears the redo branch — Redo has nothing left.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.proposition-block')).toHaveCount(2);
  const secondLineText = 'And the earth was without form';
  await setCaret(page, 1, secondLineText.indexOf('earth'));
  await page.keyboard.press('Enter'); // a genuinely different split — new branch
  await expect(page.locator('.proposition-block')).toHaveCount(3);
  await page.locator('#redoBtn').click();
  await expect(page.locator('.status.info')).toContainText('Nothing to redo');

  expect(errors).toEqual([]);
});

/** Color a word (global offsets) via the real right-click → swatch menu. */
async function colorWord(page, lineIndex, start, end, colorHex) {
  await page.evaluate(({ lineIndex, start, end }) => {
    const span = document.querySelectorAll('.proposition-block .proposition-text')[lineIndex];
    span.focus();
    // Multi-node-aware selection (the line may already contain colored spans).
    window.DA_EDITOR.setSelectionByGlobalOffset(span, start, end);
    const range = window.getSelection().getRangeAt(0);
    const rect = range.getBoundingClientRect();
    span.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    }));
  }, { lineIndex, start, end });
  await page.locator(`#textContextMenu .color-swatch[data-color="${colorHex}"]`).click();
}

test('color-coding two words keeps both colors (focusout does not wipe the first)', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);
  // line 0: "In the beginning God created the heavens" — "God" at 17..20
  // line 1: "And the earth was without form"          — "earth" at 8..13

  await colorWord(page, 0, 17, 20, '#1E88E5'); // "God" blue
  await expect(page.locator('.color-text')).toHaveText(['God']);

  // Coloring a word on the OTHER line fires focusout on line 0 — the exact
  // moment the first color used to be discarded.
  await colorWord(page, 1, 8, 13, '#1E88E5'); // "earth" blue

  // Both survive, and an extra focus round-trip doesn't drop them either.
  await page.locator('.proposition-text').nth(0).click();
  await page.locator('#passageRef').click();
  await expect(page.locator('.color-text')).toHaveText(['God', 'earth']);

  expect(errors).toEqual([]);
});

test('relationship picker: type-to-filter narrows, cross-profile terms match, Enter picks', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);

  // Open the picker by creating a bracket; focus lands in the search box.
  await page.locator('.prop-dot').nth(0).click();
  await page.locator('.prop-dot').nth(1).click();
  await expect(page.locator('#labelPicker .picker-search')).toBeFocused();

  const visibleButtons = page.locator('#labelPicker .picker-btn-wrapper:not(.search-hidden) button');

  // "act" narrows to the Action-* family (multiple, but fewer than all ~18).
  await page.keyboard.type('act');
  const actCount = await visibleButtons.count();
  expect(actCount).toBeGreaterThan(1);
  expect(actCount).toBeLessThan(6);

  // "cause" is Gurtner/Beale vocabulary — the active (Josiah) profile shows it
  // as Action-Result, and the button carries an "Also called" tooltip.
  await page.locator('#labelPicker .picker-search').fill('cause');
  await expect(visibleButtons).toHaveCount(1);
  await expect(visibleButtons.first()).toContainText('Action-Result');
  await expect(visibleButtons.first()).toHaveAttribute('title', /Also called Cause-Effect/);

  // A key word: "because" surfaces Ground (keyword-tier match).
  await page.locator('#labelPicker .picker-search').fill('because');
  await expect(visibleButtons.first()).toContainText('Ground');

  // Nonsense shows the empty state; clearing restores everything.
  await page.locator('#labelPicker .picker-search').fill('zzzz');
  await expect(page.locator('#labelPicker .picker-no-matches')).toBeVisible();
  await page.locator('#labelPicker .picker-search').fill('cause');

  // Enter applies the top match.
  await page.keyboard.press('Enter');
  await expect(page.locator('#labelPicker')).toHaveCount(0);
  await expect(page.locator('.bracket-group.action-result')).toHaveCount(1);

  expect(errors).toEqual([]);
});

test('keyboard-only bracket creation: focus dot → Enter → ArrowDown → Enter → type → Enter', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);

  // Land on the first dot (Tab order includes it now), then do the whole flow
  // without the mouse.
  await page.locator('.prop-dot').nth(0).focus();
  await page.keyboard.press('Enter'); // first point selected
  await expect(page.locator('.proposition-block').nth(0)).toHaveClass(/selected-for-bracket/);

  await page.keyboard.press('ArrowDown'); // jump to the next line's dot
  await expect(page.locator('.prop-dot').nth(1)).toBeFocused();

  await page.keyboard.press('Enter'); // second point → picker opens, search focused
  await expect(page.locator('#labelPicker .picker-search')).toBeFocused();
  await page.keyboard.type('ground');
  await page.keyboard.press('Enter');
  await expect(page.locator('.bracket-group.ground')).toHaveCount(1);

  // The bracket's line is itself a keyboard target: Enter reopens the picker.
  await page.locator('.bracket-hitbox[tabindex]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#labelPicker')).toBeVisible();
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
});

test('bracket creation: clicking the later line first still puts the earlier one on top', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page); // line 0 = verse 1, line 1 = verse 2

  // Click line 1's dot FIRST, then line 0's dot — reversed from text order.
  await page.locator('.prop-dot').nth(1).click();
  await page.locator('.prop-dot').nth(0).click();
  await expect(page.locator('#labelPicker')).toBeVisible();
  await page.locator('#labelPicker button.ground').click(); // Ground: "* / G"
  await expect(page.locator('.bracket-group.ground')).toHaveCount(1);

  // Ground's dominance star ("*") is the TOP label regardless of click order —
  // it must sit above the "G" label, i.e. render for the earlier line (verse 1).
  const labels = page.locator('.bracket-group.ground .bracket-label');
  await expect(labels).toHaveCount(2);
  const [topY, bottomY] = await labels.evaluateAll((els) =>
    els.map((el) => parseFloat(el.getAttribute('y')))
  );
  const [topText, bottomText] = await labels.evaluateAll((els) => els.map((el) => el.textContent));
  expect(topY).toBeLessThan(bottomY);
  expect(topText).toContain('*');
  expect(bottomText).toBe('G');

  expect(errors).toEqual([]);
});

test('mode shortcuts: T/A/B/C toggle, Escape exits, typing is never hijacked', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);
  await page.locator('#passageInput').blur(); // make sure nothing has focus

  // T toggles Text Edit; Escape exits.
  await page.keyboard.press('t');
  await expect(page.locator('#textEditModeBtn')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#textEditModeBtn')).not.toHaveClass(/active/);

  // B toggles Block Diagram; Escape returns to bracket view.
  await page.keyboard.press('b');
  await expect(page.locator('.bracket-canvas-wrapper')).toHaveClass(/block-diagram-active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.bracket-canvas-wrapper')).not.toHaveClass(/block-diagram-active/);

  // C toggles the comments panel; Escape hides it.
  await page.keyboard.press('c');
  await expect(page.locator('#commentsPreview')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#commentsPreview')).toBeHidden();

  // Typing guard: "t" typed into the passage-reference field stays a "t".
  await page.locator('#passageInput').fill('');
  await page.locator('#passageInput').type('t');
  await expect(page.locator('#passageInput')).toHaveValue('t');
  await expect(page.locator('#textEditModeBtn')).not.toHaveClass(/active/);

  // C with selected text opens the comment popover instead of toggling the panel.
  await page.evaluate(() => {
    const span = document.querySelectorAll('.proposition-block .proposition-text')[0];
    span.focus();
    window.DA_EDITOR.setSelectionByGlobalOffset(span, 7, 16); // "beginning"
  });
  await page.keyboard.press('c');
  await expect(page.locator('#commentPopover')).toBeVisible();
  await expect(page.locator('#commentPopover .popover-title')).toContainText('beginning');
  await page.keyboard.press('Escape');
  await expect(page.locator('#commentPopover')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('startup recovery: only the cloud banner shows when both a draft and a project code exist', async ({ page }) => {
  const errors = collectErrors(page);
  // Seed a local draft, then load WITH a cloud project code. Previously this
  // stacked a native "reconnect?" confirm on top of the draft banner.
  await page.addInitScript(() => {
    localStorage.setItem('biblebracket_draft', JSON.stringify({
      passageRef: 'Draft Passage', propositions: ['saved line'], verseRefs: ['1'],
    }));
  });
  await page.goto('/?project=ABC123');

  const banners = page.locator('.draft-recovery-banner');
  await expect(banners).toHaveCount(1);
  await expect(banners).toContainText('cloud project ABC123');
  await expect(page.locator('[data-action="restore"]')).toHaveCount(0); // no draft banner

  // "Start Fresh" is one-and-done: drops the param, no second prompt appears.
  await page.locator('[data-action="dismiss"]').click();
  await expect(page.locator('.draft-recovery-banner')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('project')).toBeNull();

  expect(errors).toEqual([]);
});

test('startup recovery: the draft banner shows when there is no cloud project', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('biblebracket_draft', JSON.stringify({
      passageRef: 'Draft Passage', propositions: ['saved line'], verseRefs: ['1'],
    }));
  });
  await page.goto('/');

  const banners = page.locator('.draft-recovery-banner');
  await expect(banners).toHaveCount(1);
  await expect(banners).toContainText('Unsaved work');

  expect(errors).toEqual([]);
});

test('New bracket forgets the remembered cloud project and old undo/redo history', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);

  // Simulate a remembered (stopped) cloud session + some undo/redo history.
  await page.evaluate(() => { window.DA_STATE.activeProjectId = 'OLD999'; });
  const text = 'In the beginning God created the heavens';
  await setCaret(page, 0, text.indexOf('God'));
  await page.keyboard.press('Enter'); // split (undoable)
  await page.keyboard.press('Control+z'); // undo → redoStack now holds the split
  await expect(page.locator('.proposition-block')).toHaveCount(2);

  // New → Discard current work.
  await page.locator('#newBracketBtn').click();
  await page.locator('.new-bracket-dialog [data-action="discard"]').click();
  await expect(page.locator('.proposition-block')).toHaveCount(0);

  // No spurious "Cloud Sync stopped" toast for a non-live session.
  await expect(page.locator('.status')).toHaveText(/New bracket started/);

  const state = await page.evaluate(() => ({
    activeProjectId: window.DA_STATE.activeProjectId,
    redoLen: window.DA_STATE.redoStack.length,
    undoLen: window.DA_STATE.undoStack.length,
  }));
  // The old project id is forgotten — "Turn Cloud Sync ON" later can't offer to
  // resume (and overwrite) the previous project with this new bracket.
  expect(state.activeProjectId).toBeNull();
  // And redo can't resurrect the previous passage into the fresh workspace.
  expect(state.redoLen).toBe(0);
  expect(state.undoLen).toBe(0);

  expect(errors).toEqual([]);
});

test('verse boundaries: merge joins with a visible space, survives export/import, re-split renumbers', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page); // verse 1 + verse 2

  // Merge verse 2 up into verse 1 with a real Backspace at the start of line 2.
  await setCaret(page, 1, 0);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.proposition-block')).toHaveCount(1);

  const merged = await page.evaluate(() => ({
    text: window.DA_STATE.propositions[0],
    refs: window.DA_STATE.verseRefs.slice(),
    breaks: window.DA_STATE.verseBreaks.map(a => a.slice()),
  }));
  expect(merged.text).toBe('In the beginning God created the heavens And the earth was without form');
  expect(merged.text).not.toContain('\u200B'); // no invisible characters in content
  expect(merged.refs).toEqual(['1-2']);
  expect(merged.breaks).toEqual([[41]]); // "And..." (verse 2) begins at offset 41

  // The boundary survives a real export → re-import round trip.
  await page.locator('#exportMenuBtn').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportMenu [data-action="json"]').click();
  const filePath = await (await downloadPromise).path();
  await page.goto('/');
  await page.locator('#importFileInput').setInputFiles(filePath);
  await expect(page.locator('.proposition-block')).toHaveCount(1);
  const reimported = await page.evaluate(() => window.DA_STATE.verseBreaks.map(a => a.slice()));
  expect(reimported).toEqual([[41]]);

  // Re-split at the recorded boundary (Enter with the caret on "And") — the
  // original verse numbering comes back exactly.
  await setCaret(page, 0, 41);
  await page.keyboard.press('Enter');
  await expect(page.locator('.proposition-block')).toHaveCount(2);
  const after = await page.evaluate(() => ({
    props: window.DA_STATE.propositions.slice(),
    refs: window.DA_STATE.verseRefs.slice(),
    breaks: window.DA_STATE.verseBreaks.map(a => a.slice()),
  }));
  expect(after.props).toEqual(['In the beginning God created the heavens', 'And the earth was without form']);
  expect(after.refs).toEqual(['1', '2']);
  expect(after.breaks).toEqual([[], []]);

  expect(errors).toEqual([]);
});

test('zoom: scales text and bracket diagram together, clamps, persists, and exports at 100% regardless of current zoom', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);

  // Create a bracket so we have something in the SVG gutter to check too.
  await page.locator('.prop-dot').nth(0).click();
  await page.locator('.prop-dot').nth(1).click();
  await page.locator('#labelPicker button.ground').click();
  await expect(page.locator('.bracket-group.ground')).toHaveCount(1);

  const textFontSize = () => page.locator('.proposition-text').first().evaluate(
    (el) => parseFloat(getComputedStyle(el).fontSize)
  );
  const labelFontSize = () => page.locator('.bracket-label').first().evaluate(
    (el) => parseFloat(getComputedStyle(el).fontSize)
  );
  const gutterX = () => page.locator('.bracket-line').first().evaluate((el) => parseFloat(el.getAttribute('x1')));
  const propositionsWidth = () => page.locator('#propositions').evaluate(
    (el) => parseFloat(getComputedStyle(el).width)
  );
  // Rendered line boxes of the first proposition (unique line tops), so we can
  // assert zoom never moves wrap points — the column width scales with the font.
  const lineCount = () => page.locator('.proposition-text').first().evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set();
    for (const r of range.getClientRects()) {
      if (r.width > 0) tops.add(Math.round(r.top));
    }
    return tops.size;
  });

  const base = { text: await textFontSize(), label: await labelFontSize(), width: await propositionsWidth(), lines: await lineCount() };
  await expect(page.locator('#zoomLevelBtn')).toHaveText('100%');

  // Zoom in: text, SVG label CSS, and gutter geometry all grow proportionally.
  await page.locator('#zoomInBtn').click();
  await expect(page.locator('#zoomLevelBtn')).toHaveText('110%');
  expect(await textFontSize()).toBeCloseTo(base.text * 1.1, 0);
  expect(await labelFontSize()).toBeCloseTo(base.label * 1.1, 0);

  await page.locator('#zoomInBtn').click(); // 125%
  await page.locator('#zoomInBtn').click(); // 150% (top of ZOOM_LEVELS)
  await expect(page.locator('#zoomLevelBtn')).toHaveText('150%');
  expect(await textFontSize()).toBeCloseTo(base.text * 1.5, 0);
  const gutterAt150 = await gutterX();

  // The text column widens with the font, so wrap points never move: same
  // number of rendered lines at 150% as at 100%, and the column is 1.5× wide.
  expect(await propositionsWidth()).toBeCloseTo(base.width * 1.5, 0);
  expect(await lineCount()).toBe(base.lines);

  // Clamped at the top: the + button disables itself rather than wrapping or
  // erroring. (Not clicked again here — Playwright refuses to click a
  // genuinely disabled control, which would just hang; the data-level
  // "one more step does nothing" case is covered by the unit tests.)
  await expect(page.locator('#zoomInBtn')).toBeDisabled();

  // Clicking the readout resets straight to 100%.
  await page.locator('#zoomLevelBtn').click();
  await expect(page.locator('#zoomLevelBtn')).toHaveText('100%');
  expect(await textFontSize()).toBeCloseTo(base.text, 0);
  expect(await gutterX()).not.toBeCloseTo(gutterAt150, 0);

  // Zoom out past the bottom clamps at 75% and disables the − button.
  await page.locator('#zoomOutBtn').click(); // 90%
  await page.locator('#zoomOutBtn').click(); // 75% (bottom of ZOOM_LEVELS)
  await expect(page.locator('#zoomLevelBtn')).toHaveText('75%');
  await expect(page.locator('#zoomOutBtn')).toBeDisabled();

  // Persists across a reload, like theme.
  await page.reload();
  await expect(page.locator('#zoomLevelBtn')).toHaveText('75%');

  // ── Export normalization: always 100%, regardless of current zoom ──
  await page.locator('#zoomLevelBtn').click(); // back to 100% for a clean baseline export
  await expect(page.locator('#zoomLevelBtn')).toHaveText('100%');
  await page.locator('#exportMenuBtn').click();
  let dlPromise = page.waitForEvent('download');
  await page.locator('#exportMenu [data-action="png"]').click();
  const baselinePath = await (await dlPromise).path();
  const baselineDims = pngDimensions(baselinePath);

  await page.locator('#zoomInBtn').click(); // 110%
  await page.locator('#zoomInBtn').click(); // 125%
  await page.locator('#zoomInBtn').click(); // 150%
  await expect(page.locator('#zoomLevelBtn')).toHaveText('150%');
  await page.locator('#exportMenuBtn').click();
  dlPromise = page.waitForEvent('download');
  await page.locator('#exportMenu [data-action="png"]').click();
  const zoomedPath = await (await dlPromise).path();
  const zoomedDims = pngDimensions(zoomedPath);

  expect(zoomedDims.width).toBe(baselineDims.width);
  expect(zoomedDims.height).toBe(baselineDims.height);

  // The export restores the user's actual on-screen zoom afterward — it
  // shouldn't be stuck at 100% just because that's what got exported.
  await expect(page.locator('#zoomLevelBtn')).toHaveText('150%');

  expect(errors).toEqual([]);
});

test('deleting a nested bracket cascades (with confirm) instead of leaving a nonsense bracket', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);
  // Third line so we can nest: split verse 2.
  await setCaret(page, 1, 'And the earth'.length);
  await page.keyboard.press('Enter');
  await expect(page.locator('.proposition-block')).toHaveCount(3);

  // Inner bracket: lines 2+3.
  await page.locator('.prop-dot').nth(1).click();
  await page.locator('.prop-dot').nth(2).click();
  await page.locator('#labelPicker button.ground').click();
  // Outer bracket: line 1 → the inner bracket's connection node.
  await page.locator('.prop-dot').nth(0).click();
  await page.locator('.connection-node').first().click({ force: true });
  await page.locator('#labelPicker button.series').click();
  await expect(page.locator('.bracket-group')).toHaveCount(2);

  // Cancel first: everything stays.
  page.once('dialog', (d) => d.dismiss());
  await page.locator('.bracket-group.ground .bracket-hitbox').first().click({ force: true });
  await page.locator('#labelPicker .delete-btn').click();
  await expect(page.locator('.bracket-group')).toHaveCount(2);

  // Accept: inner AND the outer built on it are both removed — no orphan.
  page.once('dialog', (d) => {
    expect(d.message()).toContain('1 larger bracket');
    d.accept();
  });
  await page.locator('.bracket-group.ground .bracket-hitbox').first().click({ force: true });
  await page.locator('#labelPicker .delete-btn').click();
  await expect(page.locator('.bracket-group')).toHaveCount(0);
  await expect(page.locator('.status')).toHaveText(/2 brackets removed/);

  // Undo brings the whole structure back.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.bracket-group')).toHaveCount(2);

  expect(errors).toEqual([]);
});

test('Escape cancels an in-progress bracket selection', async ({ page }) => {
  const errors = collectErrors(page);
  await importPassage(page);

  await page.locator('.prop-dot').nth(0).click();
  await expect(page.locator('.proposition-block').nth(0)).toHaveClass(/selected-for-bracket/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.proposition-block').nth(0)).not.toHaveClass(/selected-for-bracket/);
  await expect(page.locator('.bracket-group')).toHaveCount(0);

  expect(errors).toEqual([]);
});

/** Place the caret at `offset` inside the PARALLEL cell of row `index`.
 *  Waits two frames first: a just-performed split focuses its new row in a
 *  requestAnimationFrame, which would otherwise race this caret and steal it. */
async function setParallelCaret(page, index, offset) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(({ index, offset }) => {
    const span = document.querySelectorAll('.proposition-block .parallel-text')[index];
    span.focus();
    window.DA_EDITOR.setSelectionByGlobalOffset(span, offset, offset);
  }, { index, offset });
}

test('parallel column: editable cells — flow/insert splits (1a/1b/1c), edits, colors, undo, save round-trip, hide', async ({ page }) => {
  const errors = collectErrors(page);

  // The suite's beforeEach aborts all non-localhost requests; this route is
  // registered later so it wins for Bolls, serving a fake chapter instead.
  await page.route(/bolls\.life\/get-text\//, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([
      { verse: 1, text: '起初，上帝創造天地。' },
      { verse: 2, text: '地是空虛混沌。' },
      { verse: 3, text: 'should never appear (not on screen)' },
    ]),
  }));

  await importPassage(page); // Genesis 1:1-2, refs 1 and 2

  // Alternate Views → Show Parallel Column… → CUV → Show.
  await page.locator('#alternateViewsBtn').click();
  await page.locator('#alternateViewsMenu .menu-item', { hasText: 'Show Parallel Column' }).click();
  await page.locator('#parallelTranslationSelect').selectOption('CUV');
  await page.locator('#parallelShowBtn').click();

  await expect(page.locator('.parallel-text')).toHaveCount(2);
  await expect(page.locator('.parallel-text').nth(0)).toHaveText('起初，上帝創造天地。');
  await expect(page.locator('#propositions')).toHaveClass(/has-parallel/);
  await expect(page.locator('#parallelBadge')).toHaveText('+ CUV');

  // Cells are editable spans, but typing is gated to Text Edit mode exactly
  // like the primary text (beforeinput blocks it elsewhere).
  await expect(page.locator('.parallel-text').nth(0)).toHaveAttribute('contenteditable', 'true');
  await page.locator('.parallel-text').nth(0).click();
  await page.keyboard.type('XXX');
  await expect(page.locator('.parallel-text').nth(0)).toHaveText('起初，上帝創造天地。');

  // Arrow mode refuses parallel-cell words with a clear message — and stores
  // nothing (clicks used to record arrows with garbage primary-text offsets).
  await page.locator('#arrowModeBtn').click();
  await page.locator('.parallel-text').nth(0).click();
  await expect(page.locator('.status.warning')).toContainText('not supported in the parallel column');
  expect(await page.evaluate(() => window.DA_STATE.wordArrows.length)).toBe(0);
  await page.locator('#arrowModeBtn').click(); // leave arrow mode

  // 1. Split English v1 → 1a/1b. The Chinese stays whole on 1a (insert case).
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await setCaret(page, 0, 'In the beginning God'.length);
  await page.keyboard.press('Enter');
  await expect(page.locator('.proposition-block')).toHaveCount(3);
  await expect(page.locator('.parallel-text').nth(0)).toHaveText('起初，上帝創造天地。');
  await expect(page.locator('.parallel-text').nth(1)).toHaveText('');

  // 2. Split the Chinese in 1a → FLOWS into 1b's empty cell; no new row.
  await setParallelCaret(page, 0, 2);
  await page.keyboard.press('Enter');
  await expect(page.locator('.proposition-block')).toHaveCount(3);
  await expect(page.locator('.parallel-text').nth(0)).toHaveText('起初');
  await expect(page.locator('.parallel-text').nth(1)).toHaveText('，上帝創造天地。');

  // 3. Split the Chinese again in 1b → next row is verse 2 → INSERT 1c with an
  //    empty English cell.
  await setParallelCaret(page, 1, 4);
  await page.keyboard.press('Enter');
  await expect(page.locator('.proposition-block')).toHaveCount(4);
  await expect(page.locator('.proposition-block').nth(2).locator('.verse-ref')).toHaveText('1c ');
  await expect(page.locator('.parallel-text').nth(1)).toHaveText('，上帝創');
  await expect(page.locator('.parallel-text').nth(2)).toHaveText('造天地。');
  await expect(page.locator('.proposition-block').nth(2).locator('.proposition-text')).toHaveText('');

  // Undo/redo walk the split back and forward (blur to a neutral spot first).
  await page.locator('h1').first().click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.proposition-block')).toHaveCount(3);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.proposition-block')).toHaveCount(4);
  await expect(page.locator('.parallel-text').nth(2)).toHaveText('造天地。');

  // 4. Text Edit mode: typing in a cell commits on blur; Ctrl+Z reverts it.
  await page.locator('#textEditModeBtn').click();
  await page.locator('.parallel-text').nth(0).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' AMEN');
  await page.locator('h1').first().click(); // blur → commit
  await expect(page.locator('.parallel-text').nth(0)).toHaveText('起初 AMEN');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.parallel-text').nth(0)).toHaveText('起初');
  await page.locator('#textEditModeBtn').click(); // leave Text Edit mode

  // 5. Colors work in cells via the same right-click menu — but Add Comment is
  //    absent there (comments stay primary-only).
  await page.evaluate(() => {
    const span = document.querySelectorAll('.proposition-block .parallel-text')[0];
    span.focus();
    window.DA_EDITOR.setSelectionByGlobalOffset(span, 0, 2);
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    span.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    }));
  });
  await expect(page.locator('#textContextMenu')).toBeVisible();
  await expect(page.locator('#textContextMenu .menu-item', { hasText: 'Add Comment' })).toHaveCount(0);
  await page.locator('#textContextMenu .color-swatch[data-color="#1E88E5"]').click();
  await expect(page.locator('.parallel-text .color-text')).toHaveText(['起初']);

  // 6. The saved project carries the column: texts, label, and the pcol tag.
  const saved = await page.evaluate(() => window.DA_EXPORT.buildBracketData());
  expect(saved.parallelLabel).toBe('CUV');
  expect(saved.parallelTexts).toEqual(['起初', '，上帝創', '造天地。', '地是空虛混沌。']);
  expect(saved.formatTags.some((f) => f.pcol && f.type === 'color')).toBe(true);

  // 7. Hide conceals the column but KEEPS its data (a hidden column still
  //    saves with the project); the menu's "Show Parallel Column (CUV)"
  //    restores the previous work without refetching.
  await page.locator('#alternateViewsBtn').click();
  await page.locator('#alternateViewsMenu .menu-item', { hasText: 'Hide Parallel Column' }).click();
  await expect(page.locator('.parallel-text')).toHaveCount(0);
  await expect(page.locator('#parallelBadge')).toBeHidden();
  const hiddenSave = await page.evaluate(() => window.DA_EXPORT.buildBracketData());
  expect(hiddenSave.parallelTexts).toEqual(['起初', '，上帝創', '造天地。', '地是空虛混沌。']);
  expect(hiddenSave.parallelLabel).toBe('CUV');
  expect(hiddenSave.parallelHidden).toBe(true);
  await page.locator('#alternateViewsBtn').click();
  await page.locator('#alternateViewsMenu .menu-item', { hasText: 'Show Parallel Column (CUV)' }).click();
  await expect(page.locator('.parallel-text')).toHaveCount(4);
  await expect(page.locator('#parallelBadge')).toHaveText('+ CUV');
  await expect(page.locator('.parallel-text .color-text')).toHaveText(['起初']);

  // 8. A real import round-trip restores the column (and its formatting).
  await page.evaluate((data) => window.DA_PERSISTENCE.importBracket(data), saved);
  await expect(page.locator('.parallel-text')).toHaveCount(4);
  await expect(page.locator('.parallel-text').nth(0)).toHaveText('起初');
  await expect(page.locator('.parallel-text .color-text')).toHaveText(['起初']);

  // Block Diagram still toggles from the same dropdown, and flips back.
  await page.locator('#alternateViewsBtn').click();
  await page.locator('#alternateViewsMenu .menu-item', { hasText: 'Block Diagram' }).click();
  await expect(page.locator('.bracket-canvas-wrapper')).toHaveClass(/block-diagram-active/);
  await page.locator('#alternateViewsBtn').click();
  await page.locator('#alternateViewsMenu .menu-item', { hasText: 'Bracket View' }).click();
  await expect(page.locator('.bracket-canvas-wrapper')).not.toHaveClass(/block-diagram-active/);

  expect(errors).toEqual([]);
});

test('top bar folds on real scroll down, unfolds at the top, chevron toggles it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByText('Or paste text to bracket or import').click();
  // A passage tall enough that the workspace actually scrolls.
  const verses = Array.from({ length: 25 }, (_, i) => `[${i + 1}] Line ${i + 1} of a long passage`).join(' ');
  await page.locator('#pasteText').fill(verses);
  await page.locator('#importPassageRef').fill('Psalm 119:1-25');
  await page.locator('#importBtn').click();
  await expect(page.locator('.proposition-block')).toHaveCount(25);

  const header = page.locator('#appHeader');
  await expect(header).not.toHaveClass(/header-collapsed/);
  await expect(page.locator('#passageInput')).toBeVisible();

  // A real wheel scroll down in the workspace folds the header away…
  await page.locator('.proposition-block').first().hover();
  await page.mouse.wheel(0, 600);
  await expect(header).toHaveClass(/header-collapsed/);
  await expect(page.locator('#passageInput')).toBeHidden(); // folded controls leave view and tab order

  // …and returning to the very top unfolds it.
  await page.mouse.wheel(0, -3000);
  await expect(header).not.toHaveClass(/header-collapsed/);
  await expect(page.locator('#passageInput')).toBeVisible();

  // The chevron toggles it manually in both directions.
  await page.locator('#headerCollapseBtn').click();
  await expect(header).toHaveClass(/header-collapsed/);
  await expect(page.locator('#headerCollapseBtn')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#headerCollapseBtn').click();
  await expect(header).not.toHaveClass(/header-collapsed/);

  expect(errors).toEqual([]);
});

test('paste auto-detect: Logos-style flowing text with citation imports as verses', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByText('Or paste text to bracket or import').click();
  // Logos/Accordance-style paste: bare verse numbers in flowing text plus a
  // trailing citation — no [n] markers and no manual passage ref.
  await page.locator('#pasteText').fill(
    '21 But now the righteousness of God has been manifested apart from the law, ' +
    '22 even the righteousness of God through faith in Jesus Christ for all who believe. ' +
    '23 for all have sinned and fall short of the glory of God (Rom 3:21-23)'
  );
  await page.locator('#importBtn').click();

  await expect(page.locator('.proposition-block')).toHaveCount(3);
  await expect(page.locator('.verse-ref').nth(0)).toHaveText(/21/);
  await expect(page.locator('.verse-ref').nth(2)).toHaveText(/23/);
  // The citation was consumed and auto-filled the passage ref.
  await expect(page.locator('#passageRef')).toHaveText('Romans 3:21-23');
  await expect(page.locator('.proposition-block').nth(2)).not.toContainText('(Rom');

  expect(errors).toEqual([]);
});

test('sidebar folds closed and back open via its edge handle', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const sidebar = page.locator('#sidebar');
  const handle = page.locator('#toggleLeftSidebarBtn');
  await expect(sidebar).toBeVisible();

  // Collapse: the sidebar folds away (visibility: hidden at the end of the
  // shared fold animation) and the handle rides the edge to the window edge.
  await handle.click();
  await expect(sidebar).toBeHidden();
  await expect(handle).toHaveCSS('left', '0px');

  // Expand: everything comes back.
  await handle.click();
  await expect(sidebar).toBeVisible();
  await expect(handle).toHaveCSS('left', '250px');

  expect(errors).toEqual([]);
});
