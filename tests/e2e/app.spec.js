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
