import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const edgeExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../static');

function makeDesktop(items, version = 1) {
  return {
    version,
    updatedAt: Date.now(),
    items: items.map((item, position) => ({ ...item, position }))
  };
}

function json(payload, status = 200) {
  return { status, body: JSON.stringify(payload), type: 'application/json; charset=utf-8' };
}

async function readBody(request) {
  let value = '';
  for await (const chunk of request) value += chunk;
  return value ? JSON.parse(value) : {};
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml; charset=utf-8';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.jpg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function startServer(state) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      let result = null;
      if (pathname === '/api/v1/auth/session') {
        result = json(state.authenticated
          ? { authenticated: true, csrfToken: 'test-csrf' }
          : { authenticated: false });
      } else if (pathname === '/api/v1/auth/login' && request.method === 'POST') {
        state.authenticated = true;
        result = json({ ok: true, csrfToken: 'test-csrf' });
      } else if (pathname === '/api/v1/desktop') {
        result = state.failDesktop
          ? json({ message: 'D1 暂时不可用。' }, 503)
          : json(state.desktop);
      } else if (pathname === '/api/v1/music') {
        result = json({ version: 1, updatedAt: 1, tracks: [] });
      } else if (/^\/api\/v1\/favicons\/[a-zA-Z0-9_-]+$/.test(pathname)) {
        const linkId = pathname.split('/').at(-1);
        state.activeFaviconRequests += 1;
        state.maxActiveFaviconRequests = Math.max(state.maxActiveFaviconRequests, state.activeFaviconRequests);
        state.faviconRequests.push(pathname);
        await new Promise((resolve) => setTimeout(resolve, 120));
        state.activeFaviconRequests -= 1;
        result = state.faviconFallbackIds.has(linkId)
          ? { status: 204, body: '', type: 'image/png' }
          : {
              status: 200,
              body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#f4c84a"/></svg>',
              type: 'image/svg+xml; charset=utf-8'
            };
      } else if (pathname === '/api/v1/admin/layout' && request.method === 'PUT') {
        const body = await readBody(request);
        state.activeLayoutRequests += 1;
        state.maxActiveLayoutRequests = Math.max(state.maxActiveLayoutRequests, state.activeLayoutRequests);
        state.layoutRequests.push(body);
        if (state.layoutRequests.length === 1) {
          await new Promise((resolve) => setTimeout(resolve, 140));
        }
        if (body.version !== state.desktop.version) {
          result = json({ code: 'DESKTOP_VERSION_CONFLICT', message: '桌面数据已更新。' }, 409);
        } else {
          const byId = new Map(state.desktop.items.map((item) => [item.id, item]));
          state.desktop = makeDesktop(body.topLevel.map((item) => byId.get(item.id)), state.desktop.version + 1);
          result = json({ ok: true, desktop: state.desktop });
        }
        state.activeLayoutRequests -= 1;
      }

      if (result) {
        response.writeHead(result.status, { 'content-type': result.type, 'cache-control': 'no-store' });
        response.end(result.body);
        return;
      }

      let relativePath = pathname.replace(/^\/+/, '');
      if (pathname === '/os/' || pathname === '/os') relativePath = 'os/index.html';
      if (pathname === '/admin/' || pathname === '/admin') relativePath = 'admin/index.html';
      const filePath = path.resolve(staticRoot, relativePath);
      if (!filePath.startsWith(staticRoot)) throw new Error('Unsafe test path');
      const file = await readFile(filePath);
      response.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store' });
      response.end(file);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const canRunEdge = process.platform === 'win32' && existsSync(edgeExecutable);

test('Edge navigation and admin hardening regression', { skip: !canRunEdge }, async (t) => {
  const state = {
    authenticated: false,
    failDesktop: false,
    desktop: makeDesktop([
      { id: 'link-a', type: 'link', title: '实时导航', url: 'https://a.example', icon: 'A', color: '#e8d9dc', openMode: 'new' },
      { id: 'link-b', type: 'link', title: '第二项', url: 'https://b.example', icon: 'B', color: '#e8d9dc', openMode: 'new' },
      { id: 'link-c', type: 'link', title: '第三项', url: 'https://c.example', icon: 'C', color: '#e8d9dc', openMode: 'new' }
    ]),
    activeLayoutRequests: 0,
    maxActiveLayoutRequests: 0,
    layoutRequests: [],
    activeFaviconRequests: 0,
    maxActiveFaviconRequests: 0,
    faviconRequests: [],
    faviconFallbackIds: new Set()
  };
  const { chromium } = await import('playwright-core');
  const { server, origin } = await startServer(state);
  const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true });

  try {
    await t.test('live navigation renders when cache writes are blocked', async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(() => {
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function setItem(key, value) {
          if (key === 'lightwind-navigation-cache-v1') throw new DOMException('Storage blocked', 'QuotaExceededError');
          return originalSetItem.call(this, key, value);
        };
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/os/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-navigation-id="link-a"]');
      assert.match(await page.locator('[data-navigation-id="link-a"]').textContent(), /实时导航/);
      assert.equal(await page.locator('#desktopIcons').evaluate((element) => element.classList.contains('uses-cached-navigation')), false);
      assert.deepEqual(errors, []);
      await context.close();
    });

    await t.test('favicons start after load and stay same-origin with bounded concurrency', async () => {
      state.desktop = makeDesktop([
        { id: 'link-a', type: 'link', title: '第一项', url: 'https://a.example', icon: 'A', color: '#e8d9dc', openMode: 'new' },
        { id: 'link-b', type: 'link', title: '第二项', url: 'https://b.example', icon: 'B', color: '#e8d9dc', openMode: 'new' },
        { id: 'link-c', type: 'link', title: '第三项', url: 'https://c.example', icon: 'C', color: '#e8d9dc', openMode: 'new' },
        { id: 'link-d', type: 'link', title: '第四项', url: 'https://d.example', icon: 'D', color: '#e8d9dc', openMode: 'new' },
        { id: 'link-e', type: 'link', title: 'Gemini', url: 'https://e.example', icon: '', color: '#e8d9dc', openMode: 'new' }
      ]);
      state.activeFaviconRequests = 0;
      state.maxActiveFaviconRequests = 0;
      state.faviconRequests = [];
      state.faviconFallbackIds = new Set(['link-e']);
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const externalImages = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (request.resourceType() === 'image' && url.origin !== origin) externalImages.push(request.url());
      });

      await page.goto(`${origin}/os/`, { waitUntil: 'load' });
      assert.equal(await page.evaluate(() => document.readyState), 'complete');
      await page.waitForFunction(() => document.querySelectorAll('.navigation-favicon img').length >= 4);
      await page.waitForFunction(() => performance.getEntriesByType('resource')
        .filter((entry) => entry.name.includes('/api/v1/favicons/')).length >= 5);
      const failedFavicon = page.locator('[data-navigation-id="link-e"] .navigation-favicon');
      assert.equal(await failedFavicon.textContent(), 'Ge');
      assert.equal(await failedFavicon.locator('img').count(), 0);
      assert.equal(await failedFavicon.evaluate((element) => element.classList.contains('is-text-fallback')), true);
      const timing = await page.evaluate(() => {
        const navigationRequests = performance.getEntriesByType('resource')
          .filter((entry) => entry.name.includes('/api/v1/favicons/'));
        return {
          loadEventEnd: performance.getEntriesByType('navigation')[0].loadEventEnd,
          requestStarts: navigationRequests.map((entry) => entry.startTime)
        };
      });

      assert.ok(timing.loadEventEnd > 0);
      assert.ok(timing.requestStarts.length >= 5);
      assert.ok(timing.requestStarts.every((startTime) => startTime >= timing.loadEventEnd));
      assert.ok(state.maxActiveFaviconRequests <= 3);
      assert.ok(state.faviconRequests.length >= 5);
      assert.deepEqual(externalImages, []);
      state.faviconFallbackIds.clear();
      await context.close();
    });

    await t.test('post-login load errors stay visible and retryable', async () => {
      state.authenticated = false;
      state.failDesktop = true;
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/admin/`);
      await page.locator('#loginPassword').fill('test-password');
      await page.locator('#loginForm [type="submit"]').click();
      await page.waitForSelector('#dashboardAlert:not([hidden])');
      assert.equal(await page.locator('#dashboardView').isVisible(), true);
      assert.match(await page.locator('#dashboardAlertMessage').textContent(), /D1 暂时不可用/);

      state.failDesktop = false;
      await page.locator('#retryDashboardButton').click();
      await page.waitForFunction(() => document.querySelector('#dashboardAlert')?.hidden === true);
      await page.waitForSelector('[data-manager-id="link-a"]');
      assert.deepEqual(errors, []);
      await context.close();
    });

    await t.test('rapid layout changes are serialized and save the newest order', async () => {
      state.authenticated = true;
      state.failDesktop = false;
      state.desktop = makeDesktop([
        { id: 'link-a', type: 'link', title: '第一项', url: 'https://a.example', icon: 'A', color: '#e8d9dc', openMode: 'new' },
        { id: 'link-b', type: 'link', title: '第二项', url: 'https://b.example', icon: 'B', color: '#e8d9dc', openMode: 'new' },
        { id: 'link-c', type: 'link', title: '第三项', url: 'https://c.example', icon: 'C', color: '#e8d9dc', openMode: 'new' }
      ]);
      state.layoutRequests = [];
      state.activeLayoutRequests = 0;
      state.maxActiveLayoutRequests = 0;
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${origin}/admin/`);
      await page.waitForSelector('[data-manager-id="link-a"]');
      await page.locator('[data-manager-id="link-a"] [data-action="move-down"]').click();
      await page.locator('[data-manager-id="link-a"] [data-action="move-down"]').click();
      await page.waitForFunction(() => document.querySelector('#saveStatus')?.textContent.startsWith('已保存'));

      assert.equal(state.maxActiveLayoutRequests, 1);
      assert.equal(state.layoutRequests.length, 2);
      assert.deepEqual(state.layoutRequests.map((request) => request.version), [1, 2]);
      assert.deepEqual(state.desktop.items.map((item) => item.id), ['link-b', 'link-c', 'link-a']);
      await context.close();
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});