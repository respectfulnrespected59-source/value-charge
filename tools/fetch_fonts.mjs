// Self-host the two VALUE CHARGE fonts (both SIL Open Font License).
// Downloads the Latin woff2 files for Barlow Condensed + DM Sans and writes
// public/css/fonts.css, so the site never calls Google at runtime.
// Usage: node tools/fetch_fonts.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800'
  + '&family=DM+Sans:wght@400;500;600;700&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const PUBLIC = new URL('../public/', import.meta.url);

const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();
// Each block is preceded by a /* subset */ comment; keep only /* latin */.
const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*{[^}]+})/g)]
  .filter(([, subset]) => subset === 'latin')
  .map(([, , block]) => block);
if (!blocks.length) throw new Error('No latin @font-face blocks found; Google changed its CSS format');

await mkdir(new URL('fonts/', PUBLIC), { recursive: true });
await mkdir(new URL('css/', PUBLIC), { recursive: true });
const seen = new Map();
const out = [];
for (const block of blocks) {
  const family = block.match(/font-family:\s*'([^']+)'/)[1];
  const style = block.match(/font-style:\s*(\w+)/)[1];
  const weight = block.match(/font-weight:\s*([\d ]+);/)[1].trim();
  const url = block.match(/url\((https:[^)]+\.woff2)\)/)[1];
  if (!seen.has(url)) {
    const name = `${family.toLowerCase().replace(/\s+/g, '-')}-${style}-${weight.replace(/\s+/g, '-')}.woff2`;
    const bytes = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    if (bytes.length < 5000 || bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error(`Bad font file from ${url}`);
    await writeFile(new URL(`fonts/${name}`, PUBLIC), bytes);
    seen.set(url, name);
    console.log(`fonts/${name} ${bytes.length} bytes`);
  }
  out.push(block.replace(/url\([^)]+\)/, `url(../fonts/${seen.get(url)})`));
}
const header = '/* Barlow Condensed + DM Sans, self-hosted (SIL Open Font License). Built by tools/fetch_fonts.mjs */\n';
await writeFile(new URL('css/fonts.css', PUBLIC), header + out.join('\n') + '\n');
console.log(`css/fonts.css: ${out.length} @font-face rules -> ${fileURLToPath(new URL('css/fonts.css', PUBLIC))}`);
