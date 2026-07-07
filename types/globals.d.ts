/**
 * Ambient declarations for the app's classic-script global surface, so the
 * TypeScript checker (jsconfig.json, checkJs) and editor IntelliSense know the
 * DA_* namespaces and vendored libraries exist. Everything is typed loosely
 * (any) — the goal is catching undefined names and obvious misuse, not full
 * type coverage. Tighten types incrementally as modules stabilize.
 */

// Vendored libraries (index.html <script> tags)
declare const LZString: any;
declare function html2canvas(el: HTMLElement, options?: any): Promise<HTMLCanvasElement>;
declare const jspdf: any;

// Firebase compat SDK (loaded from gstatic CDN)
declare const firebase: any;
declare var db: any;

// App namespaces — each file assigns window.DA_X; classic scripts read them bare.
declare var DA_STATE: any;
declare var DA_CONSTANTS: any;
declare var DA_PROFILES: any;
declare var DA_UI: any;
declare var DA_NOTATION: any;
declare var DA_PERSISTENCE: any;
declare var DA_MODES: any;
declare var DA_BIBLE: any;
declare var DA_CLOUD: any;
declare var DA_EDITOR: any;
declare var DA_RENDERER: any;
// (DA_EXPORT is a real top-level `const` in export-service.js, which tsc treats
// as a global script declaration — declaring it here again would conflict.)
declare var DA_KEYBOARD: any;
declare var DA_MOUSE: any;
declare var DA_BLOCK: any;

// window.* extras set by app.js / state.js / mouse-handler.js / preload.js
interface Window {
  DA_STATE: any; DA_CONSTANTS: any; DA_PROFILES: any; DA_UI: any;
  DA_NOTATION: any; DA_PERSISTENCE: any; DA_MODES: any; DA_BIBLE: any;
  DA_CLOUD: any; DA_EDITOR: any; DA_RENDERER: any; DA_EXPORT: any;
  DA_KEYBOARD: any; DA_MOUSE: any; DA_BLOCK: any;
  db: any;
  renderAll: () => void;
  scheduleVisualUpdate: () => void;
  updateBracketPositions: () => void;
  saveBracket: (forceSaveAs?: boolean) => any;
  pushUndo: (action: string, debounceKey?: string) => void;
  showLabelPicker: (bracketIdx: number, y: number, x: number) => void;
  electronAPI?: {
    onOpenFile: (cb: (content: string) => void) => void;
    fetchESV: (query: string) => Promise<any>;
  };
  arrowHighlight?: HTMLElement | null;
  pendingArrowStart?: any;
  // File System Access API (not yet in the bundled DOM lib)
  showSaveFilePicker?: (options?: any) => Promise<any>;
}
declare var arrowHighlight: HTMLElement | null | undefined;
declare var pendingArrowStart: any;

/**
 * Pragmatic DOM loosening. This codebase uses querySelector()/closest()/e.target
 * results directly as HTMLElements (~100 sites). Rather than casting each one,
 * declare the commonly-used HTMLElement/HTMLInputElement members on the base
 * types. This trades a little type safety for a zero-noise `npm run typecheck` —
 * unknown identifiers, wrong argument counts, and misspelled properties outside
 * this list still get caught. Tighten per-file later if the code moves to
 * explicit element types.
 */
interface Element {
  style: CSSStyleDeclaration;
  dataset: DOMStringMap;
  title: string;
  value: any;                       // any: HTMLLIElement declares value as number
  disabled: boolean;
  placeholder: string;
  content: DocumentFragment;        // <template>
  innerText: string;
  contentEditable: string;
  isContentEditable: boolean;
  spellcheck: boolean;
  offsetWidth: number;
  offsetHeight: number;
  onclick: ((e: MouseEvent) => void) | null;
  onkeydown: ((e: KeyboardEvent) => void) | null;
  focus(options?: any): void;
  blur(): void;
  click(): void;
  // Expando properties the app stores on DOM nodes (state that must not
  // survive the node): see rendering-engine.js and render-comments.js.
  _textBeforeEdit?: string;
  _lastHtml?: string;
  _commentHoverListenerAttached?: boolean;
  _commentCardHoverListenersAttached?: boolean;
  _releaseFocus?: (() => void) | null;
}
interface EventTarget {
  closest(selector: string): Element | null;
  classList: DOMTokenList;
  tagName: string;
  value: any;
  files: FileList | null;
  isContentEditable: boolean;
}
interface Event {
  // Drag/keyboard events arrive as plain Event through generic addEventListener
  // overloads (listeners attached to querySelector() results).
  dataTransfer?: DataTransfer | null;
  relatedTarget?: EventTarget | null;
  key?: string;
}
