import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, assertWallpaperType, ICON_NAMES, LEGACY_ICON_MAP, normalizeColor, normalizeIconName, normalizeMusicInput, normalizeMusicUrl, normalizeOpenMode, normalizePageInput, normalizeUrl, wallpaperExtension, WALLPAPER_MAX_BYTES } from '../src/validation.js';
import { normalizeFolderInput, normalizeLinkInput } from '../src/validation.js';

test('accepts supported wallpaper formats and rejects unsafe uploads', () => {
  assert.equal(assertWallpaperType('image/jpeg'), 'image/jpeg');
  assert.equal(wallpaperExtension('image/webp'), 'webp');
  assert.equal(wallpaperExtension('image/avif'), 'avif');
  assert.equal(WALLPAPER_MAX_BYTES, 30 * 1024 * 1024);
  assert.throws(() => assertWallpaperType('image/svg+xml'), HttpError);
  assert.throws(() => assertWallpaperType('application/octet-stream'), HttpError);
});
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

test('normalizes legacy desktop icons into the Lucide allowlist', () => {
  assert.ok(ICON_NAMES.includes('Folder'));
  assert.ok(ICON_NAMES.includes('Link2'));
  assert.equal(LEGACY_ICON_MAP['$_'], 'Terminal');
  assert.equal(normalizeIconName('▰', 'Link2'), 'Folder');
  assert.equal(normalizeIconName('⌘', 'Link2'), 'Command');
  assert.equal(normalizeIconName('not-a-real-icon', 'Link2'), 'Link2');
  assert.equal(normalizeFolderInput({ name: '工具', icon: '▰', color: '#f4c84a' }).icon, 'Folder');
  assert.equal(normalizeLinkInput({ title: '动态', url: '/dynamic/', icon: '↗', color: '#e8d9dc' }).icon, 'ArrowUpRight');
});

test('requires names and URLs when creating records', () => {
  assert.throws(() => normalizeFolderInput({}), HttpError);
  assert.throws(() => normalizeLinkInput({ color: '#e8d9dc' }), HttpError);
  assert.throws(() => normalizeMusicInput({}), HttpError);
});

test('accepts desktop page names and rejects empty or oversized values', () => {
  assert.deepEqual(normalizePageInput({ name: ' 工作 ' }), { name: '工作' });
  assert.deepEqual(normalizePageInput({}, { name: '主页' }), { name: '主页' });
  assert.throws(() => normalizePageInput({ name: '' }), HttpError);
  assert.throws(() => normalizePageInput({ name: '页'.repeat(41) }), HttpError);
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
