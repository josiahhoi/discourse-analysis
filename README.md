# Discourse Analysis

A Bible study tool for diagramming the logical structure of Scripture using **bracketing** — splitting passages into propositions and drawing logic brackets between them. Similar to [BibleArc](https://biblearc.com), built for speed, portability, and collaboration.

## Features

### 1. Bible Text Sources
- **ESV** — the official Crossway API on desktop (with a free key), falling back automatically to [bolls.life](https://bolls.life) everywhere else.
- **NASB (1995)** — via bolls.life.
- **Greek** — SBLGNT for the New Testament, Septuagint (LXX) for the Old Testament, with native Greek rendering.
- **Hebrew (WLC)** — Westminster Leningrad Codex with **automatic right-to-left layout**: the text, bracket gutter, and diagram all mirror correctly.
- **Smart reference parsing** — abbreviations (`Rom`, `1 Cor`, `Ps`), full chapters (`Eph 1`), verse ranges, and even en-dash references pasted from other apps.
- **Paste your own text** — paste any passage or translation; verse markers like `[1]` or `[2:1]` are detected, and **Magic Paste** recognizes bracket data ("Discourse DNA") on the clipboard and restores the whole project.

### 2. The Bracketing Engine
- **20+ logical relationships** organized in the standard discourse-analysis hierarchy (Coordinate, Support by Distinct Statement / Restatement / Contrary Statement).
- **Split & merge with exact renumbering** — press **Enter** to split a proposition at the cursor, **Backspace** at the start of a line to merge; verse suffixes (1a, 1b) renumber automatically. Verse boundaries are tracked as structured data, so retyping text can never corrupt them.
- **Logical main point marking** — the asterisk (`*`) marks the main point; swap labels or switch stars per bracket from the label picker.
- **Jump-over brackets** — connect non-adjacent propositions as a flat **Series**, **Bilateral**, or **Double Ground** unit; intermediate lines become implicit members.
- **Structural folding** — collapse a sub-structure to its dominant line to simplify large diagrams; a fold gap shows how many rows are hidden and expands on click.
- **Cascade deletion** — deleting a bracket that others are built on removes the dependent brackets too (with confirmation), so the diagram can never be left in a nonsense state. Undo restores everything.
- **Integrity validation** — "no crossing" and adjacency rules enforced in real time; dynamic re-parenting when grouping existing structures.
- **Type-to-filter picker** — just start typing in the relationship picker; it matches names, other systems' vocabulary ("cause" finds Action-Result), and key words ("because" finds Ground).
- **Custom labels** — create your own relationship labels per project, and save favorites to a personal bank.
- **Passage main point** — mark the passage's main point with a large red star.
- **Full undo/redo** — Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Ctrl/Cmd+Shift+Z), with toolbar buttons.

### 3. Notation Profiles
- **Five presets** — Josiah (default), BibleArc, Gurtner, Beale, and Schreiner — each with its own abbreviations, renames (e.g. Cause-Effect vs Action-Result), and dominance conventions.
- **Fully editable** — rename any relationship, change its label or color, and toggle dominance stars per relationship or globally (Settings → Notation). Edits fork into a personal Custom profile; built-ins are never modified.
- **Cloud sharing for classrooms** — a professor publishes a profile under a name (password-protected); students load it by typing that name. Brackets created under one system display correctly under another (e.g. General-Specific ↔ Idea-Explanation aliasing).
- **Import/export** — profiles also travel as small `.daprofile.json` files.

### 4. Views
- **Parallel translation column** (Alternate Views) — show a second translation beside the text, matched verse-by-verse: Chinese (CUV/CUNPS), Korean, Spanish (RV1960), German (Luther), Portuguese (NVI), ESV, NASB, Greek, or Hebrew. View-only, so splits and merges never disturb it.
- **Block diagram view** — render the passage's logical structure as an indented, color-coded block outline.
- **Zoom** — 75–150% steps that scale the text and bracket diagram together; a personal preference that never affects exports (always captured at 100%).
- **Dark and light themes.**

### 5. Collaboration
- **Real-time cloud sync** — share a 6-digit project code (Firebase-backed); everyone in the session sees changes live. A header badge shows sync state, with click-to-copy code and a manual Sync button.
- **Threaded comments** — attach notes to text selections or brackets, with authors, timestamps, editing, and threaded replies for peer review. A comments sidebar previews everything.
- **Word color-coding** — select text and right-click to color words.
- **Word arrows** — draw orthogonal arrows between specific words to show grammatical or lexical connections; arrows route around text instead of striking through it.

### 6. Persistence & Export
- **Metadata "stenography"** — the full project is embedded invisibly in exported **PNG** and **PDF** files; drop any exported file (JSON, PNG, or PDF) back onto the app to resume work instantly.
- **Draft recovery** — autosave every 30 seconds with a restore banner after unexpected exits; one clean startup prompt (cloud reconnect takes priority over local drafts).
- **Recent projects list** and drag-and-drop loading.
- **Export options** — project JSON, high-quality PNG, PDF, or copy the diagram straight to the clipboard.

### 7. Keyboard & Accessibility
- **Single-key mode shortcuts** — **T** (Text Edit), **A** (Add Arrows), **B** (Block Diagram), **C** (Comments; with text selected, comments on the selection).
- **Keyboard-only bracketing** — Tab to a proposition dot, **Enter/Space** to select it, arrow keys between dots; Enter on a bracket opens its label picker.
- **Escape backs out one layer at a time** — dialogs, menus, modes, views.
- **Screen-reader support** — focus management in dialogs, ARIA labels on brackets and dots, live status announcements.
- Ctrl/Cmd+**S** save, Ctrl/Cmd+**B**/**U** bold/underline, **Tab**/Shift+Tab for Word-style indentation in Text Edit mode.

## Setup & Desktop Apps

### Desktop (Recommended)
1. Download the latest release for your platform from the GitHub Releases page (or build locally with `npm run build` — output lands in `dist/`).
   - **Windows**: `Discourse Analysis 3.1.0 x64 Portable.exe` (no installation required)
   - **macOS**: `Discourse Analysis-3.1.0-arm64-mac.zip`
2. Run the application directly. (The macOS build is unsigned, so Gatekeeper may warn on first open — right-click → Open.)

### ESV & NASB text sources
Selecting **ESV** or **NASB** tries the official API first — ESV via
[api.esv.org](https://api.esv.org), NASB via [API.Bible](https://api.bible) —
and quietly falls back to the keyless [bolls.life](https://bolls.life) source when
no key is reachable (the status toast says "via Bolls" when that happens).
The keys never reach the browser page:

- **Desktop**: keys live in a `.env` file next to the app source (copy
  `.env.example`) and are read by the Electron main process only.
- **Web**: a Firebase Cloud Function proxy (`functions/index.js`) holds the same
  keys as deployed secrets and forwards passage requests; the static page calls
  the proxy, never the keyed APIs. Deploy once with:
  ```
  npm --prefix functions install
  npx firebase-tools login
  npx firebase-tools functions:secrets:set ESV_API_KEY    # name only — paste the key at the prompt
  npx firebase-tools functions:secrets:set API_BIBLE_KEY  # (a value on the command line errors)
  npx firebase-tools deploy --only functions
  ```
  (Requires the Blaze plan on the Firebase project; effectively $0 at this
  volume. The deployed URL must match `WEB_PROXY_BASE` in `js/utils/constants.js`
  and the CSP in `index.html`.)

There is no in-app key field. Without keys everything still works via Bolls.

### Web / Development
1. Serve the folder statically (e.g. `node tests/e2e/serve.js`) or open `index.html` in a modern browser.
2. ESV/NASB text comes through the key-holding proxy when deployed, otherwise from the Bolls fallback automatically — no key needed.
3. Dev checks: `npm run check` (ESLint + type-check + unit tests), `npm run test:e2e` (Playwright browser tests).

## Usage

### 1. Fetch a Passage
- Select **ESV**, **NASB (1995)**, **Greek (SBLGNT / LXX)**, or **Hebrew (WLC)** from the dropdown.
- Enter a reference (e.g., `John 1:1-5`, `Genesis 1:1`, `Eph 1`) and click **Fetch Passage**.
- The text is split into one proposition per verse; refine the split yourself — **Enter** splits at the cursor, **Backspace** at the start of a line merges upward.

### 2. Draw Logic Brackets
- Click the first proposition dot, then the second — the bracket is drawn and the **Relationship Picker** opens (type to filter it).
- **Click** a bracket to change its relationship, swap labels, or switch stars.
- **Right-click** a bracket for the actions menu: collapse/expand, comment, connect to another bracket, mark as main point, row highlight colors, delete.
- Click two **non-adjacent** dots to create a jump-over Series/Progression/Bilateral/Double-Ground unit.

### 3. Pick Your Notation
- **Settings → Notation profile**: choose Josiah, BibleArc, Gurtner, Beale, or Schreiner — or edit any name, abbreviation, color, or dominance star to build your own.
- Professors: publish your profile to the cloud under a name; students load it by typing that name.

### 4. Alternate Views
- **Alternate Views → Block Diagram (B)** for the indented outline view.
- **Alternate Views → Show Parallel Column…** to add a second translation beside the text.
- Zoom with the − / + controls in the sidebar.

### 5. Word Arrows, Comments, & Colors
- Toggle **Add Arrows (A)** and click two words to connect them.
- **Right-click** any selected text to add threaded **Comments** or **color-code** the selection.

### 6. Cloud Collaboration
- **Export As… → Turn Cloud Sync ON** to start sharing; the header shows your 6-digit project code (click to copy).
- Collaborators use **Open… → Join cloud session** and enter the code.
- The badge turns orange when you have unpushed changes — click **Sync** to publish them.

## Logical Relationships

Abbreviations below are the defaults (Josiah profile); notation profiles can rename, recolor, or restyle any of them.

| Abbrev | Type | Category |
|--------|------|----------|
| S | Series | Coordinate |
| P | Progression | Coordinate |
| A | Alternative | Coordinate |
| B-A | Both-And | Coordinate |
| An/Fl | Anticipation-Fulfillment | Coordinate |
| G | Ground | Support by Distinct Statement |
| DG | Double Ground | Support by Distinct Statement |
| ∴ | Inference | Support by Distinct Statement |
| BL | Bilateral | Support by Distinct Statement |
| Ac/Res | Action-Result | Support by Distinct Statement |
| Ac/Pur | Action-Purpose | Support by Distinct Statement |
| If/Th | Conditional | Support by Distinct Statement |
| T | Temporal | Support by Distinct Statement |
| L | Locative | Support by Distinct Statement |
| Ac/Mn | Action-Manner | Support by Restatement |
| Cf | Comparison | Support by Restatement |
| -/+ | Negative-Positive | Support by Restatement |
| Id/Exp | Idea-Explanation | Support by Restatement |
| Q/A | Question-Answer | Support by Restatement |
| Gen/Sp | General-Specific | Support by Restatement |
| Ft/In | Fact-Interpretation | Support by Restatement |
| Csv | Concessive | Support by Contrary |
| Sit/R | Situation-Response | Support by Contrary |

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, and JavaScript — no framework, no build step, no CDNs (all libraries vendored).
- **Desktop**: Electron (the ESV API key stays in the main process, never the page).
- **Database**: Firebase Firestore (cloud sync and shared notation profiles).
- **Libraries**: `html2canvas` and `jsPDF` for exports, `LZ-String` for data compression.
- **Quality**: ESLint + TypeScript `checkJs`, 155 unit tests (`node --test`), 16 Playwright end-to-end tests.

## Changelog

### Version 3.1.0
- **Parallel Translation Column**: view a second translation (Chinese, Korean, Spanish, German, Portuguese, English, Greek, Hebrew) beside the text, matched by verse.
- **Zoom Control**: 75–150% steps scaling text and diagram together; exports always capture at 100%.
- **Cascade Bracket Deletion**: deleting a load-bearing bracket removes its dependents with confirmation instead of leaving orphans.
- **Temporal/Locative Defaults Swapped**: the dominance star now sits on the earlier proposition by default.
- **Review Hardening**: fixed post-export diagram misalignment at non-100% zoom, bracket arms missing connection nodes when zoomed, undo/redo not flagging unsynced cloud changes, Escape not closing the Alternate Views menu, and profile publish mutating local settings on failure.

### Version 3.0.0
- **Notation Profiles**: five scholar presets (Josiah, BibleArc, Gurtner, Beale, Schreiner) with editable names, abbreviations, colors, and dominance — plus password-protected cloud publishing so classes can share a professor's notation.
- **Hebrew (WLC) with automatic RTL layout** and mirrored bracket diagram.
- **ESV API on Desktop**: official Crossway text with the key held safely in the Electron main process; keyless Bolls fallback everywhere.
- **Jump-Over Brackets**: Series/Bilateral/Double-Ground units spanning non-adjacent propositions.
- **Redo** (Ctrl/Cmd+Y), **type-to-filter relationship picker**, single startup recovery prompt, and a first-run welcome.
- **Verse Boundaries as Structured Data**: replaced invisible in-text markers that retyping could silently destroy; older files migrate automatically on load.
- **Keyboard & Screen-Reader Accessibility**: keyboard-only bracketing, T/A/B/C mode shortcuts, focus-managed dialogs, ARIA labels.
- **Engineering**: split the UI monolith into focused modules, vendored all CDN libraries, added ESLint + type checking and a 155-test unit suite plus 16 Playwright end-to-end tests.

### Version 2.9.3
- **Word-Style Tab Stops**: **Tab** and **Shift-Tab** now snap to tab stops (column multiples of 8) instead of inserting/removing a flat block of spaces.
- **Snappier Arrows**: Word arrows redraw immediately when un-indenting (Backspace/Shift-Tab), with no lag.
- **Rock-Solid Arrow Anchors**: Arrow anchors stay locked to their word across edits, tabbing, splits, and merges — no more drift or "ballooning" across blank lines.
- **Collision-Aware Arrow Routing**: Orthogonal word arrows reroute around text instead of striking through it; arrowheads point cleanly into the target word.
- **Gated Text Editing**: Proposition text can only be altered in **Text Edit** mode, preventing accidental edits while bracketing.
- **Keyboard Undo Parity**: **Cmd/Ctrl+Z** now undoes structural actions (splits, merges) just like the Undo button.

### Version 2.9.2
- **Mark Passage Main Point**: Right-click a bracket to mark the passage's main point with a large red star.
- **Comparison Relabeled**: The Comparison relationship now uses `//` (single-arm) instead of `Cf`.
- **Click-to-Copy Project Code**: Click the cloud project code to copy the 6-digit ID to the clipboard.
- **Stability Fixes**: Undo now reverts a split in one click; verse renumbering on split is correct; the app confirms before auto-reconnecting to a cloud project on reload.

### Version 2.9.1
- **Silent Data-Loss & Sync Fixes**: Hardened cloud sync against silent overwrites and stale-session writes; loading a new passage cleanly exits any active cloud session.
- **Block Diagram Polish**: Block diagram labels are color-coded to match their bracket relationships.

### Version 2.9.0
- **Block Diagram View**: New view that renders the passage's logical structure as an indented block diagram.
- **Richer Comments**: Comment rich-text formatting with viewport-clamped popups.
- **Bible Service Refactor**: Restructured fetching with NASB (1995) support.

### Version 2.7.2
- **Maintenance Update**: Finalized color-coding and UI streamline fixes.

### Version 2.7.1
- **Color-Coding**: Highlight text and right-click to color-code words.
- **UI Streamlining**: Context menus replace deprecated modes and double-click interactions.
- **Rendering Optimization**: Differential rendering for brackets and highlights.

### Version 2.6.0
- **Structural Folding Engine**: Collapse complex bracket sections into clean summary labels.
- **Enhanced Export Service**: Included project metadata (ref, author, cloud code) in all exports.
- **Cloud Sync Persistence**: Cloud IDs are now "baked" into project data for seamless resumption.
- **Full-Structure Exports**: Automatically expands folded sections during capture.

### Version 2.5.1
- **Enhanced Bracketing Logic**: Implemented strict validation to prevent illegitimate bracket structures (crossing brackets, jumping over intermediate nodes).
- **Intelligent Re-parenting**: Refined logic to allow grouping of already-bracketed items by automatically re-parenting existing structures to the new parent group.
- **Stability Fixes**: Fixed a bug where deleting a parent bracket could cause children to disappear or trigger UI crashes.

## License

MIT. ESV text © Crossway. SBLGNT © SBL/Logos, [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [ESV API terms](https://api.esv.org).
