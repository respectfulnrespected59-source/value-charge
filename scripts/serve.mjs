// Local static server for previews and the Playwright tests.
// Serves public/ with the same headers Render uses. No dependencies.
// Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS, cacheControlFor } from './headers.mjs';

const ROOT = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 4174);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Map a URL path to a file inside ROOT, or null if it would escape ROOT.
export function resolveInRoot(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const rel = normalize(decoded).replace(/^[/\\]+/, '');
  const full = resolve(join(ROOT, rel || 'index.html'));
  return full === ROOT || full.startsWith(ROOT + sep) ? full : null;
}

async function handle(req, res) {
  const headers = { ...SECURITY_HEADERS };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end();
    return;
  }
  let file = resolveInRoot(req.url);
  if (file && (await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
  const body = file ? await readFile(file).catch(() => null) : null;
  if (!body) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  const urlPath = '/' + file.slice(ROOT.length + 1).split(sep).join('/');
  res.writeHead(200, {
    ...headers,
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
    'Cache-Control': cacheControlFor(urlPath),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

// realpath both sides: through a junction or with different drive-letter casing the
// plain paths differ and the server would silently never start.
const samePath = (a, b) => {
  try { return realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase(); } catch { return false; }
};
const isMain = Boolean(process.argv[1]) && samePath(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  createServer((req, res) =>
    handle(req, res).catch((err) => {
      console.error('serve error', req.url, err);
      if (!res.headersSent) res.writeHead(500).end('Server error');
    }),
  ).listen(PORT, '127.0.0.1', () => console.log(`VALUE CHARGE on http://127.0.0.1:${PORT}`));
}
