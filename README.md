# Discourse Analysis

A powerful Bible study tool for diagramming the logical structure of Scripture using **bracketing** — splitting passages into propositions and drawing logic brackets between them. Similar to [BibleArc](https://biblearc.com), built for speed, portability, and collaboration.

## Features

### 1. Biblical Text & Multi-Source Integration
- **Direct API Fetching**:
    - **ESV Integration**: Fetches directly from Crossway (requires API key).
    - **NASB (1995)**: Support for classic English translations via bolls.life.
    - **Greek NT & LXX**: Fetch Greek text from SBLGNT or Septuagint with native rendering.
- **Intelligent Text Parser**: 
    - **Magic Paste**: Automatically detects bracket data or "Discourse DNA" on the clipboard.
    - **Differential Splitting**: Press **Enter** to split propositions; the engine handles verse suffixes (e.g., 1a, 1b) and markers like `[1]` or `[2:1]` automatically.

### 2. The Bracketing & Structural Engine
- **18 Standard Logical Relationships**: Full support for the standard discourse analysis hierarchy (Coordinate, Support, etc.).
- **Nomenclature "Modes"**:
    - **Standard**: Classic abbreviations (G, S, Ac/Res).
    - **Dan Gurtner Mode**: Academic preset with specialized nomenclature (e.g., Means-End, Way-End) and Iowan Old Style typography.
    - **Brian Kim Mode**: Technical preset with Roboto Mono typography.
- **Structural Folding (Nesting)**: Collapse complex sub-structures into a single summary label to simplify large-scale diagrams.
- **Dynamic Re-parenting**: Automatically adjusts parent-child relationships when grouping existing bracketed structures.
- **Integrity Validation**: Real-time enforcement of "No Crossing" and "Adjacency" rules.

### 3. Collaboration & Synchronization
- **Real-time Cloud Sync**: Join live sessions via a 6-digit Project ID powered by Firebase.
- **Threaded Commenting**: Attach notes to text spans or specific bracket arms with support for replies and reviewer identification.
- **Word Arrows**: Draw orthogonal (90-degree) arrows between specific words to show grammatical or lexical connections.

### 4. Persistence & Metadata "Stenography"
- **Metadata Embedding**: Projects are embedded directly into the metadata of exported **PNG** and **PDF** files. 
- **Drag-and-Drop Loading**: Drop any previously exported project file (JSON, PNG, or PDF) back into the app to resume work instantly.
- **Draft Recovery**: Auto-saves work every 30 seconds to local storage with a restoration banner for unexpected exits.
- **Themes**: Toggle between sleek Dark Mode and high-contrast Light Mode.
- **Export Options**: Save to JSON, or export high-quality images and PDFs with project metadata included.

## Setup & Desktop Apps

### Desktop (Recommended)
1. Download the latest release for your platform from the `dist/` folder or the Releases page.
   - **Windows**: `Discourse Analysis 2.6.0 x64 Portable.exe` (No installation required)
   - **macOS**: `Discourse Analysis-2.6.0-arm64-mac.zip`
2. Run the application directly.

### Web / Development
1. Open `index.html` in a modern browser.
2. For ESV fetching, get a free API key at [api.esv.org](https://api.esv.org/account/create-application/).
3. Enter your API key in the settings (stored in browser `localStorage` only).

## Usage

### 1. Fetch a Passage
- Select **ESV**, **NASB (1995)**, or **Greek (LXX / SBLGNT)** from the dropdown.
- Enter a reference (e.g., `John 1:1-5`, `Genesis 1:1`, `Eph 1`).
- The app handles abbreviations and full chapter fetches automatically.
- Click **Fetch Passage**.
- The text is split into propositions. You can refine the split manually.
- **Pro-tip**: Press **Enter** inside a proposition block to split it into two at your cursor.

### 2. Draw Logic Brackets
- Select a relationship type (e.g., Ground, Series) from the sidebar.
- Click the first proposition dot, then the second.
- A bracket is drawn. **Double-click** a bracket to change its relationship or **Double-click** a label to switch dominance (the asterisk).
- **Right-click** a bracket to delete it.

### 3. Word Arrows & Comments
- Toggle **Add Arrows** mode to draw orthogonal arrows between words.
- Toggle **Comment** mode to add notes to specific highlights or brackets.
- Comments support author names and threaded replies for peer review.

### 4. Cloud Collaboration
- Click **Open...** → **Join cloud session**.
- Enter a Project ID to sync your workspace with a collaborator.
- Changes are updated in real-time for everyone in the session.

## Logical Relationships

| Abbrev | Type | Category |
|--------|------|----------|
| S | Series | Coordinate |
| P | Progression | Coordinate |
| A | Alternative | Coordinate |
| G | Ground | Support by Distinct Statement |
| I | Inference | Support by Distinct Statement |
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
| Csv | Concessive | Support by Contrary |
| Sit/R | Situation-Response | Support by Contrary |

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, and JavaScript.
- **Desktop**: Electron.
- **Database**: Firebase Firestore (for Cloud Sync).
- **Libraries**: `html2canvas` and `jsPDF` for exports, `LZ-String` for data compression.

## Changelog

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
