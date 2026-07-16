const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let pendingFilePath = null; // file path received before window was ready

/**
 * Minimal .env reader (no dependency — just KEY=VALUE lines, # comments, blank
 * lines skipped). Only used for secrets that must stay out of the renderer/
 * DevTools, e.g. the ESV API key — see the fetch-esv-passage handler below.
 */
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  const out = {};
  try {
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch (_) {
    // No .env file — fine, ESV_API_KEY just stays unset and the renderer falls
    // back to the keyless Bolls source (see js/services/bible-service.js).
  }
  return out;
}

const ENV = loadDotEnv();

/**
 * Fetch ESV passage text ourselves (main process) rather than handing the API
 * key to the renderer: contextIsolation + sandbox mean the renderer never sees
 * it, even via DevTools. Query params match the app's existing Bolls-sourced
 * text shape (inline "[N]" verse markers, no headings/footnotes/references) so
 * the renderer's parser (parseBollsText) works unchanged on either source.
 */
ipcMain.handle('fetch-esv-passage', async (_event, query) => {
  if (!ENV.ESV_API_KEY) return { ok: false, noKey: true };
  try {
    // include-short-copyright is deliberately false: when true, the API appends
    // " (ESV)" directly onto the last verse's text, which then flows straight
    // into the diagrammed content (see parseBollsText in bible-service.js — it
    // has no marker to split on, so it lands inside the last proposition). The
    // app already shows its own copyright badge (bible-service.js's
    // fetchFromESVApi hardcodes copyright: '(ESV)'), so the API's copy isn't
    // needed at all.
    const url = `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(query)}`
      + '&include-headings=false&include-footnotes=false&include-verse-numbers=true'
      + '&include-short-copyright=false&include-passage-references=false';
    const res = await fetch(url, { headers: { Authorization: `Token ${ENV.ESV_API_KEY}` } });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    if (!data.passages || !data.passages[0]) return { ok: false, status: 404 };
    return { ok: true, text: data.passages[0], canonical: data.canonical };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

/**
 * NASB via API.Bible (api.scripture.api.bible) — same pattern as the ESV
 * handler above: the key stays in the main process. The web build's Firebase
 * Cloud Function proxy (functions/index.js) mirrors this handler; keep the
 * two in sync. The bibleId for the NASB edition on this key is discovered
 * once and cached (the free plan only exposes the bibles picked at signup);
 * API_BIBLE_NASB_ID in .env skips discovery.
 */
let cachedNasbBibleId = null;
async function resolveNasbBibleId() {
  if (ENV.API_BIBLE_NASB_ID) return ENV.API_BIBLE_NASB_ID;
  if (cachedNasbBibleId) return cachedNasbBibleId;
  const res = await fetch('https://rest.api.bible/v1/bibles', {
    headers: { 'api-key': ENV.API_BIBLE_KEY }
  });
  if (!res.ok) throw new Error(`API.Bible bibles list error (${res.status})`);
  const list = (await res.json()).data || [];
  const label = (b) => `${b.abbreviation} ${b.abbreviationLocal} ${b.name}`;
  const nasb = list.find(b => /nasb.*(19)?95/i.test(label(b))) || list.find(b => /nasb/i.test(label(b)));
  if (!nasb) throw new Error('No NASB bible available on this API.Bible key.');
  cachedNasbBibleId = nasb.id;
  return cachedNasbBibleId;
}

ipcMain.handle('fetch-nasb-passage', async (_event, passageId) => {
  if (!ENV.API_BIBLE_KEY) return { ok: false, noKey: true };
  try {
    const bibleId = await resolveNasbBibleId();
    // content-type=text with include-verse-numbers gives inline "[N]" markers —
    // the same shape as Bolls/ESV text, so parseBollsText works unchanged.
    const url = `https://rest.api.bible/v1/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}`
      + '?content-type=text&include-verse-numbers=true&include-titles=false'
      + '&include-notes=false&include-chapter-numbers=false';
    const res = await fetch(url, { headers: { 'api-key': ENV.API_BIBLE_KEY } });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    if (!data.data || !data.data.content) return { ok: false, status: 404 };
    return { ok: true, text: data.data.content, canonical: data.data.reference };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Discourse Analysis',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-finish-load', () => {
    // Send any file that was passed via command line or double-click
    if (pendingFilePath) {
      sendFileToRenderer(pendingFilePath);
      pendingFilePath = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

function sendFileToRenderer(filePath) {
  if (!mainWindow || !filePath) return;
  try {
    if (!filePath.endsWith('.json')) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('open-file', content);
  } catch (err) {
    console.error('Could not read file:', err);
  }
}

// macOS: file opened via double-click or "Open With" while app is running
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && mainWindow.webContents) {
    sendFileToRenderer(filePath);
  } else {
    pendingFilePath = filePath;
  }
});

// Windows/Linux: file path passed as command-line argument
const fileArg = process.argv.find((arg) => arg.endsWith('.json') && !arg.startsWith('-'));
if (fileArg) {
  pendingFilePath = path.resolve(fileArg);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
