/**
 * Test harness for the browser-side DA_* modules.
 *
 * The app ships as plain <script> files that assign to `window.DA_*` and read
 * bare globals (DA_STATE, DA_CONSTANTS, …). There's no build step and no module
 * system, so to test them in Node we evaluate each file inside a `vm` context
 * whose global object *is* its own `window`. That way `window.DA_STATE = …`
 * creates a global `DA_STATE` visible to later-loaded files, exactly like a
 * browser. Only the DOM/timer globals the files touch at load time are stubbed;
 * everything else is the real ECMAScript built-in provided by the vm context.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

function noop() {}

/** A do-nothing DOM element good enough for load-time `document` calls. */
function fakeEl() {
  return {
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop,
    appendChild: noop,
    addEventListener: noop,
    value: '',
    textContent: '',
  };
}

/**
 * Build a fresh sandbox. Each test should call this so suites don't share
 * mutable DA_STATE. `extra` is merged onto the global for stubbing specific
 * collaborators (e.g. a fake DA_RENDERER).
 */
function createSandbox(extra = {}) {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };

  const sandbox = {
    console,
    localStorage,
    // Load-time side effects we want to neutralize, not exercise.
    setInterval: () => 0,
    clearInterval: noop,
    setTimeout: () => 0,
    clearTimeout: noop,
    requestAnimationFrame: () => 0,
    navigator: { clipboard: { readText: async () => '' } },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: fakeEl,
      addEventListener: noop,
      readyState: 'complete',
    },
    ...extra,
  };

  // The sandbox is its own window/global (mirrors the browser).
  sandbox.window = sandbox;
  sandbox.window.addEventListener = noop;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

/** Evaluate a source file (path relative to repo root) inside the sandbox. */
function load(sandbox, relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  vm.runInContext(code, sandbox, { filename: relPath });
}

module.exports = { createSandbox, load, ROOT };
