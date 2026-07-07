// Minimal static file server for the Playwright e2e tests (no deps).
// Serves the repo root so the app runs exactly as the web build does.
// Port comes from argv so the test server can't clash with a dev preview
// server on the default port: `node tests/e2e/serve.js 8766`.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = parseInt(process.argv[2], 10) || 8765;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
