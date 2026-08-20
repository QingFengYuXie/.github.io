import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceFiles = [
  'static/os/index.html',
  'static/os/script.js',
  'static/admin/index.html',
  'static/admin/admin.js',
  'static/site-nav.js'
];

test('system UI uses the self-hosted Lightwind icon registry', async () => {
  const registry = await readFile(path.join(projectRoot, 'static/icons.js'), 'utf8');
  assert.match(registry, /window\.LightwindIcons/);
  assert.match(registry, /Search:/);
  assert.match(registry, /Pause:/);
  assert.match(registry, /SkipBack:/);
  assert.match(registry, /SkipForward:/);
  assert.doesNotMatch(registry, /https?:\/\/.*(?:lucide|cdnjs|unpkg|jsdelivr)/i);

  const source = (await Promise.all(sourceFiles.map((file) => readFile(path.join(projectRoot, file), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /\$_|↗|✉|⌘|♫|▰|⠿/);
  assert.doesNotMatch(source, /<svg\b/i);
});
