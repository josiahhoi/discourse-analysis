/**
 * Key-holding proxy for the static web build (GitHub Pages can't hold
 * secrets). Mirrors the Electron main-process handlers in ../main.js — same
 * { ok, text, canonical } result shape — so js/services/bible-service.js
 * consumes desktop IPC and this proxy interchangeably. Keep the two in sync.
 *
 * Routes (GET only):
 *   /esv?q=Rom+3:21-26            → api.esv.org (ESV_API_KEY)
 *   /nasb?passage=ROM.3.21-ROM.3.26 → rest.api.bible (API_BIBLE_KEY)
 *
 * One-time setup (needs the Blaze plan on the Firebase project):
 *   npx firebase-tools login
 *   npx firebase-tools functions:secrets:set ESV_API_KEY
 *   npx firebase-tools functions:secrets:set API_BIBLE_KEY
 * Deploy:
 *   npx firebase-tools deploy --only functions
 * The deployed URL must match WEB_PROXY_BASE in js/utils/constants.js and the
 * connect-src list in index.html's CSP.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const ESV_API_KEY = defineSecret('ESV_API_KEY');
const API_BIBLE_KEY = defineSecret('API_BIBLE_KEY');

// Browsers enforce this list via CORS. It keeps other sites from quietly
// spending the API quotas; direct curl access is still possible (as with any
// public proxy) — maxInstances below caps the blast radius.
const ALLOWED_ORIGINS = [
  'https://josiahhoi.github.io',
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

async function handleEsv(req, res) {
  const query = String(req.query.q || '');
  if (!query) return res.status(400).json({ ok: false, error: 'Missing q' });
  // Reject rather than truncate: a silent slice can cut mid-reference (wrong
  // passage reported as success) or split a surrogate pair.
  if (query.length > 300) return res.status(400).json({ ok: false, error: 'Query too long' });
  // Same params as main.js's fetch-esv-passage handler: inline "[N]" verse
  // markers, no headings/footnotes, no appended copyright (the app shows its
  // own badge).
  const url = `https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(query)}`
    + '&include-headings=false&include-footnotes=false&include-verse-numbers=true'
    + '&include-short-copyright=false&include-passage-references=false';
  const upstream = await fetch(url, { headers: { Authorization: `Token ${ESV_API_KEY.value()}` } });
  if (!upstream.ok) return res.json({ ok: false, status: upstream.status });
  const data = await upstream.json();
  if (!data.passages || !data.passages[0]) return res.json({ ok: false, status: 404 });
  return res.json({ ok: true, text: data.passages[0], canonical: data.canonical });
}

// The bibleId for the NASB edition on this key is discovered once per warm
// instance (the free plan only exposes the bibles picked at signup). The
// API_BIBLE_NASB_ID env var (functions/.env, optional — same name as the
// desktop .env pin; NASB_BIBLE_ID is accepted as a legacy alias) skips
// discovery.
let cachedNasbBibleId = null;
async function resolveNasbBibleId() {
  const pinned = process.env.API_BIBLE_NASB_ID || process.env.NASB_BIBLE_ID;
  if (pinned) return pinned;
  if (cachedNasbBibleId) return cachedNasbBibleId;
  const res = await fetch('https://rest.api.bible/v1/bibles', {
    headers: { 'api-key': API_BIBLE_KEY.value() }
  });
  if (!res.ok) throw new Error(`API.Bible bibles list error (${res.status})`);
  const list = (await res.json()).data || [];
  const label = (b) => `${b.abbreviation} ${b.abbreviationLocal} ${b.name}`;
  const nasb = list.find(b => /nasb.*(19)?95/i.test(label(b))) || list.find(b => /nasb/i.test(label(b)));
  if (!nasb) throw new Error('No NASB bible available on this API.Bible key.');
  cachedNasbBibleId = nasb.id;
  return cachedNasbBibleId;
}

async function handleNasb(req, res) {
  // Passage ids look like ROM.3 or ROM.3.21-ROM.3.26 — nothing else needed.
  const passageId = String(req.query.passage || '').slice(0, 40);
  if (!/^[1-3]?[A-Z]{2,3}\.\d{1,3}(\.\d{1,3}(-[1-3]?[A-Z]{2,3}\.\d{1,3}\.\d{1,3})?)?$/.test(passageId)) {
    return res.status(400).json({ ok: false, error: 'Bad passage id' });
  }
  const bibleId = await resolveNasbBibleId();
  const url = `https://rest.api.bible/v1/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}`
    + '?content-type=text&include-verse-numbers=true&include-titles=false'
    + '&include-notes=false&include-chapter-numbers=false';
  const upstream = await fetch(url, { headers: { 'api-key': API_BIBLE_KEY.value() } });
  if (!upstream.ok) return res.json({ ok: false, status: upstream.status });
  const data = await upstream.json();
  if (!data.data || !data.data.content) return res.json({ ok: false, status: 404 });
  return res.json({ ok: true, text: data.data.content, canonical: data.data.reference });
}

exports.bibleProxy = onRequest(
  {
    cors: ALLOWED_ORIGINS,
    secrets: [ESV_API_KEY, API_BIBLE_KEY],
    region: 'us-central1',
    maxInstances: 3, // passage fetches are tiny and bursty; this caps runaway cost
  },
  async (req, res) => {
    try {
      if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
      if (req.path.endsWith('/esv')) return await handleEsv(req, res);
      if (req.path.endsWith('/nasb')) return await handleNasb(req, res);
      return res.status(404).json({ ok: false, error: 'Unknown route' });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err && err.message || err) });
    }
  }
);
