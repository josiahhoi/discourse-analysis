# Tests

Run with:

```sh
npm test
```

Uses Node's built-in test runner (`node --test`) and `node:assert` — **no
dependencies, no build step**, matching the rest of the app.

## How it works

The app ships as plain `<script>` files that assign to `window.DA_*` globals.
To exercise that code in Node, [`helpers/harness.js`](helpers/harness.js)
evaluates each source file inside a `vm` context whose global object *is* its own
`window`, so `window.DA_STATE = …` becomes a global `DA_STATE` for later files —
exactly like a browser. Only the DOM/timer globals touched at load time are
stubbed; everything else is the real ECMAScript built-in.

```js
const { createSandbox, load } = require('./helpers/harness');
const sb = createSandbox();
load(sb, 'js/services/state.js');
load(sb, 'js/utils/editor-logic.js');
sb.DA_EDITOR.splitPropositionAtOffset(0, 5);
```

Tests use the **non-strict** `node:assert`: values created inside the sandbox
live in a different realm, so `deepStrictEqual`'s prototype check would fail on
structurally-identical arrays/objects.

## Coverage

| File | What it covers |
|------|----------------|
| `editor-logic.test.js` | Proposition split/merge: verse renumbering, indentation, and re-anchoring of brackets, word arrows, and format tags as the proposition array shifts. |
| `state.test.js` | Undo stack: deep-copy snapshots, restore (incl. `customLabels`), debounce, 50-entry cap. |
| `persistence.test.js` | `normalizeBracketData` import migration: verse-ref normalization and legacy numeric → `pN`/`bN` bracket upgrade. |
| `bible-service.test.js` | `parsePassageReference` (book/chapter/verse, numbered books, whole chapters, unparseable input) and `parseBollsText` ([n] verse-marker splitting). |
| `bracket-labels.test.js` | `getBracketLabels` star/dominance engine: single vs top/bottom labels, `labelsSwapped`, `dominanceFlipped`, per-type/profile dominance (goal #1), renames, Gurtner (now a profile), and custom (`cl_`) labels. |
| `profiles.test.js` | Notation-profile module: built-ins, active-profile preference + persistence, `normalize`, and the abbr/name/color/dominance resolution helpers. |
| `cloud-profiles.test.js` | Cloud sharing (against a fake Firestore): first-come name claiming, the password gate on updates, public load by name, and that `pwHash` never leaks into a loaded profile. |

These target the pure, logic-heavy core. DOM rendering, fetching, and export are
better verified in the browser preview.

Some tested functions (e.g. `parsePassageReference`, `getBracketLabels`) are
sloppy-mode top-level `function` declarations rather than members of a `DA_*`
export object — the harness exposes them as sandbox globals (`sb.parseBollsText`),
and `getBracketLabels` is also reachable via `sb.DA_RENDERER.getBracketLabels`.
