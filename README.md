# Bible Arc

A Bible study tool for diagramming the logical structure of Scripture using **arcing** — splitting passages into propositions and drawing logic arcs between them. Similar to [BibleArc](https://biblearc.com).

## Features

- **ESV API integration** — Fetch passages directly from the ESV (English Standard Version) Bible
- **SBL Greek NT** — Fetch Greek text from the SBLGNT (no API key required)
- **Proposition splitting** — Automatic initial split by logical connectors (for, therefore, but, etc.); refine manually
- **Logic brackets** — Draw visible brackets between propositions to show relationships (all 18 BibleArc logical relationship types)
- **Import text** — Paste your own passage and split by lines or `/` characters
- **Export/Import** — Save your arc to a JSON file and load it later

## Setup

1. Get a free ESV API key at [api.esv.org/account/create-application/](https://api.esv.org/account/create-application/)
2. Open `index.html` in your browser (or serve it locally)
3. Enter your API key (stored in browser localStorage only)

## Usage

### Fetch a passage

1. Select **ESV** or **SBL Greek NT** from the dropdown (ESV requires an API key)
2. Enter a reference (e.g. `John 1:1-5`, `Romans 8:28-30`)
3. Click **Fetch Passage**
4. The text is split into propositions. Edit any block to refine the split.
5. Press **Enter** inside a proposition to split it into two at the cursor.

### Draw logic brackets

1. Select a relationship type from the sidebar (all 18 from [BibleArc's system](https://s3.amazonaws.com/cdn.gospelpaths.com/tenants/5/1738104708694-The18LogicalRelationshipsEngnewlogo.pdf))
2. Click the first proposition
3. Click the second proposition
4. A visible bracket is drawn, grouping the two propositions with a labeled relationship
5. Click a bracket to delete it; use **Clear All Brackets** to remove everything

### Save and load your work

- **Save** (Ctrl/Cmd+S) — Saves to the current file. First time: choose where to save. After using **Open**, Save overwrites that file. (Requires Chrome/Edge; elsewhere falls back to Export.)
- **Export** — Downloads a new JSON file each time
- **Open** — Opens a JSON file and links it for Save (use Open → edit → Save to update the file)
- **Import file** — Loads a JSON file without linking (use when you just want to load, not overwrite)

### Import pasted text

1. Expand **Or paste text to arc**
2. Paste your passage
3. Use newlines or ` / ` to separate propositions
4. Click **Import & Split**

## Logical relationships (BibleArc’s 18 types)

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
| ✓ | Negative-Positive | Support by Restatement |
| Id/Exp | Idea-Explanation | Support by Restatement |
| Q/A | Question-Answer | Support by Restatement |
| Csv | Concessive | Support by Contrary |
| Sit/R | Situation-Response | Support by Contrary |

See the [full PDF](https://s3.amazonaws.com/cdn.gospelpaths.com/tenants/5/1738104708694-The18LogicalRelationshipsEngnewlogo.pdf) for definitions and examples.

## Tech

Plain HTML, CSS, and JavaScript — no build step. Works offline for arc drawing; ESV API and SBLGNT fetch require network.

## License

MIT. ESV text © Crossway. SBLGNT © SBL/Logos, [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [ESV API terms](https://api.esv.org).
