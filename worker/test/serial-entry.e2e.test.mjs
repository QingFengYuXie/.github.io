import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const edgeExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticRoot = path.resolve(workerRoot, '../static');
const canRunEdge = process.platform === 'win32' && existsSync(edgeExecutable);

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (pathname.startsWith('/api/')) {
        const body = pathname === '/api/v1/music'
          ? { version: 1, updatedAt: 1, tracks: [] }
          : pathname === '/api/v1/desktop'
            ? { version: 1, updatedAt: 1, pages: [{ id: 'desktop-page-home', name: '主页', position: 0, items: [] }] }
            : { configured: false, authenticated: false };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
        return;
      }
      if (pathname === '/dynamic/' || pathname === '/about.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/site-nav.css"></head><body><header id="header"><h1>Page</h1><div class="title-right"><a onclick="modeSwitch()">Theme</a></div></header><script src="/site-nav.js"></script></body></html>');
        return;
      }
      let relativePath = pathname.replace(/^\/+/, '');
      if (pathname === '/' || pathname === '/os/') relativePath = 'os/index.html';
      if (pathname === '/serial/') relativePath = 'serial/index.html';
      const filePath = path.resolve(staticRoot, relativePath);
      if (!filePath.startsWith(`${staticRoot}${path.sep}`)) throw new Error('Unsafe test path');
      const body = await readFile(filePath);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(filePath)] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('OS serial entry stays beside music on desktop and hidden on mobile', { skip: !canRunEdge }, async () => {
  const { chromium } = await import('playwright-core');
  const { server, origin } = await startServer();
  const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  try {
    assert.equal((await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForSelector('#bootScreen.hidden', { state: 'attached' });
    await page.waitForTimeout(700);
    const entry = page.locator('.site-serial-entry');
    assert.equal(await entry.getAttribute('href'), '/serial/');
    assert.equal(await entry.getAttribute('target'), null);
    assert.equal(await entry.textContent(), '串口终端');
    assert.equal(await entry.locator('svg[aria-hidden="true"]').count(), 1);
    const snapshotDirectory = path.join(workerRoot, '.wrangler/serial-entry');
    await mkdir(snapshotDirectory, { recursive: true });

    for (const width of [1440, 1280, 1024, 801, 800, 390, 800, 801, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('.desktop-web-search input').blur();
      await page.waitForTimeout(250);
      const musicBox = await page.locator('.site-music-player').boundingBox();
      assert.ok(musicBox && musicBox.x >= 0 && musicBox.x + musicBox.width <= width, `music bounds at ${width}`);
      assert.equal(await page.locator('.site-music-control:visible').count(), 4);
      if (width <= 800) {
        assert.equal(await entry.isVisible(), false, `hidden at ${width}`);
        assert.equal(await page.locator('.site-os-tools').evaluate((element) => getComputedStyle(element).display), 'contents');
        assert.ok(Math.abs(musicBox.width - 112) < 1);
        continue;
      }
      assert.equal(await entry.isVisible(), true, `shown at ${width}`);
      const entryBox = await entry.boundingBox();
      assert.ok(Math.abs(musicBox.width - 130) < 1, `music width at ${width}`);
      assert.ok(Math.abs(entryBox.y - musicBox.y) < 1 && Math.abs(entryBox.height - musicBox.height) < 1, `aligned heights at ${width}`);
      assert.ok(Math.abs(musicBox.x - entryBox.x - entryBox.width - 8) < 1, `8px gap at ${width}`);
      assert.ok(Math.abs(width - musicBox.x - musicBox.width - 24) < 1, `24px right edge at ${width}`);
      const topLinksBox = await page.locator('.top-links').boundingBox();
      for (const focused of [false, true]) {
        if (focused) {
          await page.locator('.desktop-web-search input').focus();
          await page.waitForTimeout(250);
        }
        const searchBox = await page.locator('.desktop-web-search').boundingBox();
        const details = JSON.stringify({ width, focused, entryBox, searchBox, topLinksBox });
        assert.equal(overlaps(entryBox, searchBox), false, `entry overlaps search: ${details}`);
        assert.equal(overlaps(entryBox, topLinksBox), false, `entry overlaps top links: ${details}`);
        assert.equal(overlaps(searchBox, topLinksBox), false, `search overlaps top links: ${details}`);
      }
      if (width === 1440 || width === 801) await page.screenshot({ path: path.join(snapshotDirectory, `os-${width}.png`) });
    }

    const responsePromise = page.waitForResponse((response) => response.url() === `${origin}/serial/`);
    await entry.click();
    assert.equal((await responsePromise).status(), 200);
    await page.waitForURL(`${origin}/serial/`);
    assert.equal(context.pages().length, 1, 'entry navigates in the current tab');
    assert.match(await page.title(), /串口调试/);
    assert.equal((await page.reload()).status(), 200, 'direct serial page reload works');

    for (const route of ['/dynamic/', '/about.html']) {
      await page.goto(`${origin}${route}`);
      await page.waitForSelector('.site-music-player');
      assert.equal(await page.locator('.site-serial-entry, .site-os-tools').count(), 0, `entry only belongs to OS: ${route}`);
    }
    await page.goto(`${origin}/os/`);
    await page.waitForSelector('#bootScreen.hidden', { state: 'attached' });
    assert.equal(await entry.count(), 1, '/os/ has exactly one serial entry');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
