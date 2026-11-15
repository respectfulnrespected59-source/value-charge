// How audit_live decides a served file is the file we built.

// CRLF checkout vs LF server: compare line counts, not bytes.
export const lineCount = (text) => text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;

// Render's CDN (Cloudflare Polish) recompresses images and says so: `cf-polished: ok, orig_size=5432`.
export function polishedOriginalSize(header) {
  const match = /(?:^|[\s,])orig_size=(\d+)(?:$|[\s,])/.exec(header || '');
  return match ? Number(match[1]) : null;
}

// Same bytes, or a recompressed copy whose ORIGINAL is exactly our file's size.
export function binaryMatches({ servedBytes, localBytes, polished }) {
  if (servedBytes === localBytes) return true;
  return polishedOriginalSize(polished) === localBytes;
}
