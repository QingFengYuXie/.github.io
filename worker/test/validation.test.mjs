import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, normalizeColor, normalizeMusicInput, normalizeMusicUrl, normalizeOpenMode, normalizeUrl } from '../src/validation.js';
import { normalizeFolderInput, normalizeLinkInput } from '../src/validation.js';

test('accepts internal, https and mail links', () => {
  assert.equal(normalizeUrl('/dynamic/'), '/dynamic/');
  assert.equal(normalizeUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(normalizeUrl('mailto:test@example.com'), 'mailto:test@example.com');
});

test('rejects executable and protocol-relative links', () => {
  assert.throws(() => normalizeUrl('javascript:alert(1)'), HttpError);
  assert.throws(() => normalizeUrl('data:text/html,hello'), HttpError);
  assert.throws(() => normalizeUrl('//evil.example.com'), HttpError);
});

test('normalizes supported visual settings', () => {
  assert.equal(normalizeColor('#E8D9DC'), '#e8d9dc');
  assert.equal(normalizeOpenMode('new'), 'new');
  assert.throws(() => normalizeColor('red'), HttpError);
  assert.throws(() => normalizeOpenMode('_blank'), HttpError);
});

test('requires names and URLs when creating records', () => {
  assert.throws(() => normalizeFolderInput({}), HttpError);
  assert.throws(() => normalizeLinkInput({ color: '#e8d9dc' }), HttpError);
  assert.throws(() => normalizeMusicInput({}), HttpError);
});

test('accepts safe music URLs and rejects non-media protocols', () => {
  assert.equal(normalizeMusicUrl('/music/demo.mp3'), '/music/demo.mp3');
  assert.equal(normalizeMusicUrl('https://example.com/demo.m4a'), 'https://example.com/demo.m4a');
  assert.throws(() => normalizeMusicUrl('mailto:test@example.com'), HttpError);
  assert.throws(() => normalizeMusicUrl('javascript:alert(1)'), HttpError);
  assert.throws(() => normalizeMusicUrl('//evil.example.com/demo.mp3'), HttpError);
  assert.deepEqual(normalizeMusicInput({ title: ' Demo ', url: '/demo.mp3' }), {
    title: 'Demo',
    url: '/demo.mp3'
  });
});
