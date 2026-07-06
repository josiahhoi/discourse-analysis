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
