import assert from 'node:assert/strict';
import { test } from 'node:test';
import { binaryMatches, lineCount, polishedOriginalSize } from '../../scripts/audit-compare.mjs';

test('line counts ignore CRLF vs LF and a trailing newline', () => {
  assert.equal(lineCount('a\r\nb\r\n'), lineCount('a\nb'));
  assert.equal(lineCount('a\nb\nc\n'), 3);
});

test('a binary file matches when the bytes served are the same length', () => {
  assert.equal(binaryMatches({ servedBytes: 5432, localBytes: 5432, polished: null }), true);
});

test('a CDN-recompressed image matches when its reported original size is ours', () => {
  assert.equal(binaryMatches({ servedBytes: 4703, localBytes: 5432, polished: 'ok, orig_size=5432' }), true);
});

test('a recompressed image of a DIFFERENT original does not match (negative)', () => {
  assert.equal(binaryMatches({ servedBytes: 4703, localBytes: 5432, polished: 'ok, orig_size=6000' }), false);
});

test('a smaller file with no recompression header does not match (negative)', () => {
  assert.equal(binaryMatches({ servedBytes: 4703, localBytes: 5432, polished: null }), false);
});

test('the original size is read only from a well-formed header', () => {
  assert.equal(polishedOriginalSize('ok, orig_size=5432'), 5432);
  assert.equal(polishedOriginalSize('degrade, orig_size=12816'), 12816);
  assert.equal(polishedOriginalSize('ok'), null);
  assert.equal(polishedOriginalSize(null), null);
});
