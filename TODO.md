# Improvement Roadmap

From the full code review (July 2026). Organized by effort. Check items off as they land.

## Quick wins (hours, low risk)

- [ ] **ARIA labels on custom menus/popovers** — tag the right-click menu, label picker, and
  comment popover with `role="menu"` / `role="dialog"` and accessible names so screen
  readers announce them correctly.
- [ ] **`aria-label` on icon-only buttons** — sidebar toggle arrow, color-swatch ✕,
  reply-send →, and similar buttons that currently announce as just "button".
- [x] **Focus management in dialogs** — when a popover/modal opens, move focus into it;
  Tab cycles within it; on close, focus returns to the element that opened it.
  (Escape-to-close already worked.)
- [ ] **Audit color-only signals** — every place a relationship color appears (block-diagram
  labels, row highlights) should carry a text label too, never color alone.
- [x] **Linter + type checking** — ESLint (catches undefined variables, unused code) and
  TypeScript `checkJs` (catches type mistakes) so typos like the old
  `propositionsContainer` bug get flagged at edit time. Run with `npm run lint` /
  `npm run typecheck` (or `npm run check` for both).

## Medium effort (about a day each)

- [x] **Redo support** — a redo stack mirrors the undo stack (undo/redo each hand a
  snapshot to the other). Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z, plus a Redo button next to
  Undo. A new edit after undoing discards the now-unreachable redo branch, matching
  standard editor behavior.
- [x] **Keyboard-accessible brackets + mode shortcuts** — dots, connection nodes, and
  bracket lines are focusable buttons: Tab (or ↑/↓ between dots) + Enter/Space creates
  brackets; Enter on a bracket line opens its label picker; focus survives SVG
  rebuilds; status toasts are aria-live. Single-key shortcuts T/A/B/C toggle Text
  Edit / Arrows / Block Diagram / Comments (C also comments on selected text), with
  Escape backing out one layer at a time. Remaining for the ARIA task: the
  right-click bracket menu is still mouse-only.
- [x] **One end-to-end browser test (Playwright)** — `npm run test:e2e` drives real
  Chromium through import → split (Enter) → bracket (dot clicks) → label → comment →
  JSON download → re-import, plus undo and Escape flows. Covers the rendering/
  keyboard/export code the unit tests structurally can't reach.

## Structural projects (a session each)

- [x] **Stable IDs for bracket/comment references** — brackets referenced by position
  (`b2` = "3rd bracket in the array") meant every delete/merge had to renumber every
  reference, comment, and highlight. Now brackets are referenced by a permanent ID
  that never changes, and the renumbering passes are deleted. Old files migrate
  automatically on load (`normalizeBracketData`).
- [x] **Separate verse boundaries from text content** — verse breaks are now structured
  data (`verseBreaks[i]`: offsets where a later verse begins) instead of invisible
  `​` characters hidden inside the text. Old files migrate on load (markers
  stripped, positions recorded, all offset anchors shifted); merged verses now join
  with a visible space; boundaries follow edits and are cleanly dropped (not
  corrupted) by a full retype; incoming fetched/pasted text is sanitized of
  zero-width characters. Save format is v3.
  Deliberately NOT changed: Tab-in-Text-Edit still inserts literal spaces for
  intra-line poetry layout — those are visible, WYSIWYG content with none of the
  invisible-marker corruption risk; restructuring them into per-line indent fields
  would break the character-offset anchor model and belongs to the
  contenteditable-replacement project below.
- [ ] **Move off `contenteditable` + `execCommand`** — the text editor is built on browser
  APIs that are officially deprecated. Follows naturally after the text-model work.
- [ ] **Real cloud auth** — the profile password and project codes are checked in the app,
  not on the server, so the Firestore rules must allow public writes. If the userbase
  grows beyond people who trust each other: Firebase anonymous auth + server-side
  ownership rules.
- [x] **Consolidate cloud-session state into one service** (from an external review) —
  cloud-sync.js is now the sole owner of the session, exposed as an explicit state
  machine (inactive / remembered / live / live-dirty) with one
  `resetSessionForNewContent()` call for every content-replacing feature. Migrating
  the call sites surfaced and fixed a third instance of the old bug class: pasting
  raw text never detached a live session (the next cloud snapshot would clobber the
  paste, or a manual Sync would overwrite the project). Unit-tested against a fake
  Firestore.

## Lower priority (only if it becomes a real problem)

- [x] **Rendering performance for large passages** — the per-frame quadratic/cubic hot
  paths are gone: extents precomputed per pass, connection points memoized per pass,
  labels cached per profile, highlight extents hoisted. Benchmark (120 lines, 119
  nested brackets): full render 486ms → 27ms, keystroke frame 481ms → 7ms (under the
  16ms/60fps budget). Full SVG rebuild per frame remains — revisit only if passages
  grow far beyond chapter length.
- [ ] **Distribution polish** — code-sign/notarize the Mac build (Gatekeeper currently
  quarantines it), add auto-update, and an in-app field for the ESV API key (today the
  key only exists in the developer's local `.env`, so shipped builds always use the
  Bolls fallback).

## Done (this review cycle)

- [x] Fixed the phantom `propositionsContainer` id (scroll restore, Greek font reset,
  popover parent).
- [x] Header passage-ref edits now sync into state (were silently discarded).
- [x] Guarded the startup `JSON.parse` of custom labels (corrupt localStorage no longer
  kills the app).
- [x] Added `psalm`, `songofsolomon`, etc. to the book-name table.
- [x] Replaced the invisible U+0001 sentinel character with a visible escape sequence.
- [x] Removed dead code: old cloud panel, `commentMode`, phantom buttons/classes.
- [x] Deduplicated: verse-suffix logic, gutter-padding formula, reply submission.
- [x] Block diagram now uses profile colors.
- [x] Salted the cloud-profile password hash (with legacy migration) + reuse warning.
- [x] Tightened the CSP (no `unsafe-inline`/`unsafe-eval` for scripts).
