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

function makePagedDesktop() {
  const page = (id, name, items, position) => ({
    id,
    name,
    position,
    items: items.map((item, itemPosition) => ({ ...item, pageId: id, position: itemPosition }))
  });
  return {
    version: 7,
    updatedAt: Date.now(),
    pages: [
      page('desktop-page-home', '主页', [
        { id: 'link-page-home', type: 'link', title: '主页链接', url: '/dynamic/', icon: '首', color: '#e8d9dc', openMode: 'same' }
      ], 0),
      page('desktop-page-work', '工作', [
        {
          id: 'folder-page-work', type: 'folder', title: '工作资料', icon: '▰', color: '#f4c84a',
          links: [
            { id: 'link-page-work-child', type: 'link', pageId: 'desktop-page-work', title: '工作文档', url: '/about.html', icon: '文', color: '#e8d9dc', openMode: 'same', position: 0 }
          ]
        },
        { id: 'link-page-work', type: 'link', title: '工作链接', url: '/about.html', icon: '工', color: '#e8d9dc', openMode: 'same' }
      ], 1),
      page('desktop-page-life', '生活', [
        { id: 'link-page-life', type: 'link', title: '生活链接', url: '/dynamic/', icon: '生', color: '#e8d9dc', openMode: 'same' }
      ], 2)
    ]
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
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      const pathname = requestUrl.pathname;
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
      } else if (pathname === '/api/v1/admin/pages/layout' && request.method === 'PUT') {
        const body = await readBody(request);
        state.pageRequests.push({ action: 'layout', body });
        if (body.version !== state.desktop.version) {
          result = json({ code: 'DESKTOP_VERSION_CONFLICT', message: '桌面数据已更新。' }, 409);
        } else {
          const pagesById = new Map(state.desktop.pages.map((page) => [page.id, page]));
          state.desktop = {
            ...state.desktop,
            version: state.desktop.version + 1,
            updatedAt: Date.now(),
            pages: body.ids.map((id, position) => ({ ...pagesById.get(id), position }))
          };
          result = json({ ok: true, desktop: state.desktop });
        }
      } else if (pathname === '/api/v1/admin/pages' && request.method === 'POST') {
        const body = await readBody(request);
        const page = {
          id: `desktop-page-admin-${state.nextPageId++}`,
          name: String(body.name || '').trim(),
          position: state.desktop.pages.length,
          items: []
        };
        state.pageRequests.push({ action: 'create', body });
        state.desktop = {
          ...state.desktop,
          version: state.desktop.version + 1,
          updatedAt: Date.now(),
          pages: [...state.desktop.pages, page]
        };
        result = json({ ok: true, desktop: state.desktop });
      } else if (/^\/api\/v1\/admin\/pages\/[^/]+$/.test(pathname) && request.method === 'PATCH') {
        const body = await readBody(request);
        const pageId = decodeURIComponent(pathname.split('/').at(-1));
        state.pageRequests.push({ action: 'rename', pageId, body });
        state.desktop = {
          ...state.desktop,
          version: state.desktop.version + 1,
          updatedAt: Date.now(),
          pages: state.desktop.pages.map((page) => page.id === pageId ? { ...page, name: String(body.name || '').trim() } : page)
        };
        result = json({ ok: true, desktop: state.desktop });
      } else if (/^\/api\/v1\/admin\/pages\/[^/]+$/.test(pathname) && request.method === 'DELETE') {
        const pageId = decodeURIComponent(pathname.split('/').at(-1));
        const targetPageId = requestUrl.searchParams.get('targetPageId');
        const source = state.desktop.pages.find((page) => page.id === pageId);
        state.pageRequests.push({ action: 'delete', pageId, targetPageId });
        state.desktop = {
          ...state.desktop,
          version: state.desktop.version + 1,
          updatedAt: Date.now(),
          pages: state.desktop.pages
            .filter((page) => page.id !== pageId)
            .map((page, position) => page.id === targetPageId
              ? { ...page, position, items: [...page.items, ...(source?.items || [])] }
              : { ...page, position })
        };
        result = json({ ok: true, desktop: state.desktop });
      } else if (pathname === '/api/v1/admin/folders' && request.method === 'POST') {
        const body = await readBody(request);
        const folder = {
          id: `folder-admin-${state.nextFolderId++}`,
          type: 'folder',
          pageId: body.pageId,
          title: String(body.name || '').trim(),
          icon: body.icon || '▰',
          color: body.color || '#f4c84a',
          position: 0,
          links: []
        };
        state.pageRequests.push({ action: 'create-folder', body });
        state.desktop = {
          ...state.desktop,
          version: state.desktop.version + 1,
          updatedAt: Date.now(),
          pages: state.desktop.pages.map((page) => page.id === body.pageId
            ? { ...page, items: [...page.items, { ...folder, position: page.items.length }] }
            : page)
        };
        result = json({ ok: true, desktop: state.desktop });
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
    pageRequests: [],
    nextPageId: 1,
    nextFolderId: 1,
    activeFaviconRequests: 0,
    maxActiveFaviconRequests: 0,
    faviconRequests: [],
    faviconFallbackIds: new Set()
  };
  const { chromium } = await import('playwright-core');
  const { server, origin } = await startServer(state);
  const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true });

  try {
    await t.test('mobile boot log stays clear of progress on short screens', async () => {
      const mobileContext = await browser.newContext({ viewport: { width: 320, height: 568 } });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(`${origin}/os/`, { waitUntil: 'domcontentloaded' });
      await mobilePage.waitForFunction(() => document.querySelectorAll('#bootLog p').length === 10);
      const mobileBoot = await mobilePage.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, height: box.height };
        };
        const log = document.querySelector('#bootLog');
        return {
          bootScreen: rect('#bootScreen'),
          progressStatus: rect('#bootProgressStatus'),
          log: rect('#bootLog'),
          lastLine: rect('#bootLog p:last-child'),
          logFontSize: getComputedStyle(log).fontSize,
          lineWhiteSpace: getComputedStyle(log.querySelector('p')).whiteSpace,
          documentScrollTop: document.documentElement.scrollTop,
          bodyScrollTop: document.body.scrollTop
        };
      });

      assert.ok(mobileBoot.log.top >= mobileBoot.progressStatus.bottom + 8);
      assert.ok(mobileBoot.lastLine.bottom <= mobileBoot.log.bottom + 1);
      assert.equal(mobileBoot.logFontSize, '9px');
      assert.equal(mobileBoot.lineWhiteSpace, 'nowrap');
      assert.equal(mobileBoot.bootScreen.top, 0);
      assert.equal(mobileBoot.documentScrollTop, 0);
      assert.equal(mobileBoot.bodyScrollTop, 0);
      await mobileContext.close();

      const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const desktopPage = await desktopContext.newPage();
      await desktopPage.goto(`${origin}/os/`, { waitUntil: 'domcontentloaded' });
      const desktopBoot = await desktopPage.evaluate(() => ({
        logFontSize: getComputedStyle(document.querySelector('#bootLog')).fontSize,
        logoDisplay: getComputedStyle(document.querySelector('.linux-boot-logo')).display
      }));
      assert.equal(desktopBoot.logFontSize, '12px');
      assert.notEqual(desktopBoot.logoDisplay, 'none');
      await desktopContext.close();
    });

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

    await t.test('desktop pages switch by sidebar, wheel and mobile swipe without leaking overlays', async () => {
      state.desktop = makePagedDesktop();

      const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const desktopPage = await desktopContext.newPage();
      const desktopErrors = [];
      desktopPage.on('pageerror', (error) => desktopErrors.push(error.message));
      await desktopPage.goto(`${origin}/os/`, { waitUntil: 'load' });
      await desktopPage.waitForFunction(() => document.querySelectorAll('#desktopPageSidebarList [data-page-index]').length === 3);
      assert.deepEqual(
        await desktopPage.locator('#desktopPageSidebarList [data-page-index]').allTextContents(),
        ['01主页', '02工作', '03生活']
      );
      assert.notEqual(await desktopPage.locator('#desktopPageSidebar').evaluate((element) => getComputedStyle(element).display), 'none');

      await desktopPage.locator('[data-page-index="1"]').click();
      await desktopPage.waitForFunction(() => document.body.dataset.page === '1');
      assert.equal(await desktopPage.locator('[data-navigation-id="link-page-work"]').isVisible(), true);
      assert.equal(await desktopPage.locator('[data-page-id="desktop-page-home"]').getAttribute('aria-hidden'), 'true');
      assert.equal(await desktopPage.locator('[data-page-id="desktop-page-home"]').evaluate((element) => element.inert), true);

      await desktopPage.locator('[data-navigation-id="folder-page-work"]').click();
      await desktopPage.waitForSelector('#navigationFolder:not([hidden])');
      assert.equal(await desktopPage.locator('#navigationFolderTitle').textContent(), '工作资料');
      assert.match(await desktopPage.locator('#navigationFolderGrid').textContent(), /工作文档/);
      await desktopPage.locator('#closeNavigationFolder').click();

      await desktopPage.locator('[data-page-id="desktop-page-work"] .terminal-icon').click();
      await desktopPage.waitForSelector('#terminalWindow:not([hidden])');
      const overlayPlacement = await desktopPage.evaluate(() => ({
        windowInViewport: document.querySelector('#terminalWindow').parentElement === document.querySelector('#pageViewport'),
        windowInTrack: document.querySelector('#pageTrack').contains(document.querySelector('#terminalWindow')),
        folderInViewport: document.querySelector('#navigationFolder').parentElement === document.querySelector('#pageViewport')
      }));
      assert.deepEqual(overlayPlacement, { windowInViewport: true, windowInTrack: false, folderInViewport: true });
      await desktopPage.locator('#terminalWindow .close-button').click();

      await desktopPage.mouse.move(640, 400);
      await desktopPage.mouse.wheel(0, 420);
      await desktopPage.waitForFunction(() => document.body.dataset.page === '2');
      assert.equal(await desktopPage.locator('#desktopPageSidebarList [data-page-index="2"]').getAttribute('aria-current'), 'true');
      await desktopPage.waitForTimeout(650);
      await desktopPage.mouse.wheel(0, -420);
      await desktopPage.waitForFunction(() => document.body.dataset.page === '1');
      assert.deepEqual(desktopErrors, []);
      await desktopContext.close();

      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const mobilePage = await mobileContext.newPage();
      const mobileErrors = [];
      mobilePage.on('pageerror', (error) => mobileErrors.push(error.message));
      await mobilePage.goto(`${origin}/os/`, { waitUntil: 'load' });
      await mobilePage.waitForFunction(() => document.querySelectorAll('#pageTrack > .site-page').length === 3);
      assert.equal(await mobilePage.locator('#desktopPageSidebar').evaluate((element) => getComputedStyle(element).display), 'none');

      const swipe = (fromX, fromY, toX, toY, pointerId) => mobilePage.evaluate(
        ({ fromX, fromY, toX, toY, pointerId }) => {
          const viewport = document.querySelector('#pageViewport');
          const dispatch = (type, clientX, clientY) => viewport.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: 'touch',
            isPrimary: true,
            clientX,
            clientY
          }));
          dispatch('pointerdown', fromX, fromY);
          dispatch('pointermove', toX, toY);
          dispatch('pointerup', toX, toY);
        },
        { fromX, fromY, toX, toY, pointerId }
      );

      await swipe(370, 300, 80, 304, 41);
      await mobilePage.waitForFunction(() => document.body.dataset.page === '1');
      assert.equal(await mobilePage.locator('[data-navigation-id="link-page-work"]').isVisible(), true);
      await swipe(6, 520, 8, 250, 42);
      await mobilePage.waitForTimeout(100);
      assert.equal(await mobilePage.evaluate(() => document.body.dataset.page), '1');
      await swipe(370, 320, 80, 322, 43);
      await mobilePage.waitForFunction(() => document.body.dataset.page === '2');
      assert.equal(await mobilePage.locator('[data-navigation-id="link-page-life"]').isVisible(), true);
      assert.deepEqual(mobileErrors, []);
      await mobileContext.close();
    });

    await t.test('mobile home removes status and intro without changing the desktop header', async () => {
      state.desktop = makeDesktop(Array.from({ length: 12 }, (_, index) => ({
        id: `link-mobile-home-${index + 1}`,
        type: 'link',
        title: `移动首页 ${index + 1}`,
        url: `https://mobile-home-${index + 1}.example`,
        icon: String(index + 1),
        color: '#e8d9dc',
        openMode: 'new'
      })));
      state.faviconFallbackIds.clear();

      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 667 } });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(`${origin}/os/`, { waitUntil: 'load' });
      await mobilePage.waitForSelector('[data-navigation-id="link-mobile-home-12"]');
      await mobilePage.waitForSelector('.site-global-nav');
      await mobilePage.waitForFunction(() => document.body.classList.contains('is-launched'));
      await mobilePage.waitForTimeout(700);
      await mobilePage.locator('[data-navigation-id="link-mobile-home-12"]').scrollIntoViewIfNeeded();
      const mobileLayout = await mobilePage.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
        };
        const navigation = document.querySelector('.site-global-nav');
        const navigationLink = navigation.querySelector('a');
        const navigationLinkStyle = getComputedStyle(navigationLink);
        const surface = (selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          return {
            opacity: style.opacity,
            borderColor: style.borderColor,
            borderRadius: style.borderRadius,
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            boxShadow: style.boxShadow,
            backdropFilter: style.backdropFilter,
            webkitBackdropFilter: style.webkitBackdropFilter
          };
        };
        const icons = document.querySelector('.desktop-icons');
        const iconsStyle = getComputedStyle(icons);
        const lastIcon = document.querySelector('[data-navigation-id="link-mobile-home-12"]');
        const lastIconBox = lastIcon.getBoundingClientRect();
        const lastIconHit = document.elementFromPoint(
          lastIconBox.left + lastIconBox.width / 2,
          lastIconBox.top + lastIconBox.height / 2
        )?.closest('.desktop-icon');
        const musicControls = [...document.querySelectorAll('.site-music-controls [data-music-action]')].map((control) => ({
          action: control.dataset.musicAction,
          iconTag: control.firstElementChild?.tagName || '',
          iconText: control.textContent.trim(),
          width: control.getBoundingClientRect().width,
          height: control.getBoundingClientRect().height
        }));
        return {
          headingCount: document.querySelectorAll('.mobile-home-heading').length,
          topbar: rect('.desktop-topbar'),
          clockControlsDisplay: getComputedStyle(document.querySelector('.desktop-clock-controls')).display,
          search: rect('.desktop-web-search'),
          music: rect('.site-music-player'),
          searchSurface: surface('.desktop-web-search'),
          musicSurface: surface('.site-music-player'),
          musicControls,
          icons: rect('.desktop-icons'),
          iconsOverflowY: iconsStyle.overflowY,
          iconColumns: iconsStyle.gridTemplateColumns.split(' ').length,
          lastIcon: rect('[data-navigation-id="link-mobile-home-12"]'),
          lastIconHitId: lastIconHit?.dataset.navigationId || '',
          navigation: rect('.site-global-nav'),
          navigationAfterContent: getComputedStyle(navigation, '::after').content,
          navigationLabels: [...navigation.querySelectorAll('a')].map((link) => link.textContent.trim()),
          navigationLink: {
            ...rect('.site-global-nav a'),
            display: navigationLinkStyle.display,
            fontSize: navigationLinkStyle.fontSize,
            borderRadius: navigationLinkStyle.borderRadius,
            beforeContent: getComputedStyle(navigationLink, '::before').content
          }
        };
      });

      assert.equal(mobileLayout.headingCount, 0);
      assert.equal(mobileLayout.topbar.height, 0);
      assert.equal(mobileLayout.clockControlsDisplay, 'none');
      assert.ok(mobileLayout.search.top >= 0);
      assert.equal(mobileLayout.search.top, mobileLayout.music.top);
      assert.equal(mobileLayout.search.height, mobileLayout.music.height);
      assert.equal(mobileLayout.search.height, 42);
      assert.ok(mobileLayout.search.width < 390 - 100);
      assert.ok(mobileLayout.search.width > 180);
      assert.ok(mobileLayout.search.right + 7 <= mobileLayout.music.left);
      assert.ok(mobileLayout.music.left - mobileLayout.search.right <= 10);
      assert.ok(mobileLayout.music.right <= 390);
      assert.ok(mobileLayout.search.bottom + 8 <= mobileLayout.icons.top);
      assert.ok(mobileLayout.icons.top < 100);
      assert.ok(mobileLayout.icons.bottom <= mobileLayout.navigation.top - 7);
      assert.ok(mobileLayout.icons.bottom >= mobileLayout.navigation.top - 10);
      assert.equal(mobileLayout.iconsOverflowY, 'auto');
      assert.equal(mobileLayout.iconColumns, 4);
      assert.ok(mobileLayout.lastIcon.top >= mobileLayout.icons.top);
      assert.ok(mobileLayout.lastIcon.bottom <= mobileLayout.icons.bottom);
      assert.equal(mobileLayout.lastIconHitId, 'link-mobile-home-12');
      assert.deepEqual(mobileLayout.musicSurface, mobileLayout.searchSurface);
      assert.deepEqual(mobileLayout.navigationLabels, ['动态', '我的 OS', '关于']);
      assert.equal(mobileLayout.navigationAfterContent, 'none');
      assert.equal(mobileLayout.navigationLink.beforeContent, 'none');
      assert.equal(mobileLayout.navigationLink.display, 'block');
      assert.equal(mobileLayout.navigationLink.fontSize, '13px');
      await mobileContext.close();

      const compactMobileContext = await browser.newContext({ viewport: { width: 320, height: 568 } });
      const compactMobilePage = await compactMobileContext.newPage();
      await compactMobilePage.goto(`${origin}/os/`, { waitUntil: 'load' });
      await compactMobilePage.waitForSelector('.site-global-nav');
      await compactMobilePage.waitForSelector('[data-navigation-id="link-mobile-home-12"]');
      await compactMobilePage.waitForFunction(() => document.body.classList.contains('is-launched'));
      await compactMobilePage.waitForTimeout(700);
      await compactMobilePage.locator('[data-navigation-id="link-mobile-home-12"]').scrollIntoViewIfNeeded();
      const compactMobileLayout = await compactMobilePage.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
        };
        const icons = document.querySelector('.desktop-icons');
        const lastIcon = document.querySelector('[data-navigation-id="link-mobile-home-12"]');
        const lastIconBox = lastIcon.getBoundingClientRect();
        const lastIconHit = document.elementFromPoint(
          lastIconBox.left + lastIconBox.width / 2,
          lastIconBox.top + lastIconBox.height / 2
        )?.closest('.desktop-icon');
        return {
          search: rect('.desktop-web-search'),
          music: rect('.site-music-player'),
          icons: rect('.desktop-icons'),
          iconColumns: getComputedStyle(icons).gridTemplateColumns.split(' ').length,
          lastIcon: rect('[data-navigation-id="link-mobile-home-12"]'),
          lastIconHitId: lastIconHit?.dataset.navigationId || '',
          navigation: rect('.site-global-nav')
        };
      });
      assert.equal(compactMobileLayout.search.top, compactMobileLayout.music.top);
      assert.equal(compactMobileLayout.search.height, compactMobileLayout.music.height);
      assert.equal(compactMobileLayout.search.height, 42);
      assert.ok(compactMobileLayout.search.left >= 0);
      assert.ok(compactMobileLayout.search.right + 7 <= compactMobileLayout.music.left);
      assert.ok(compactMobileLayout.music.right <= 320);
      assert.ok(compactMobileLayout.icons.bottom <= compactMobileLayout.navigation.top - 7);
      assert.ok(compactMobileLayout.icons.bottom >= compactMobileLayout.navigation.top - 10);
      assert.equal(compactMobileLayout.iconColumns, 4);
      assert.ok(compactMobileLayout.lastIcon.top >= compactMobileLayout.icons.top);
      assert.ok(compactMobileLayout.lastIcon.bottom <= compactMobileLayout.icons.bottom);
      assert.equal(compactMobileLayout.lastIconHitId, 'link-mobile-home-12');
      assert.ok(compactMobileLayout.navigation.left >= 0);
      assert.ok(compactMobileLayout.navigation.right <= 320);
      await compactMobileContext.close();

      const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const desktopPage = await desktopContext.newPage();
      await desktopPage.goto(`${origin}/os/`, { waitUntil: 'load' });
      await desktopPage.waitForSelector('.site-global-nav');
      await desktopPage.waitForFunction(() => document.body.classList.contains('is-launched'));
      await desktopPage.waitForTimeout(700);
      const desktopLayout = await desktopPage.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
        };
        const navigationLink = document.querySelector('.site-global-nav a');
        const navigationLinkStyle = getComputedStyle(navigationLink);
        const musicControls = [...document.querySelectorAll('.site-music-controls [data-music-action]')].map((control) => ({
          action: control.dataset.musicAction,
          iconTag: control.firstElementChild?.tagName || '',
          iconText: control.textContent.trim(),
          width: control.getBoundingClientRect().width,
          height: control.getBoundingClientRect().height
        }));
        return {
          topbarHeight: document.querySelector('.desktop-topbar').getBoundingClientRect().height,
          clockControlsDisplay: getComputedStyle(document.querySelector('.desktop-clock-controls')).display,
          search: rect('.desktop-web-search'),
          music: rect('.site-music-player'),
          musicControls,
          navigation: rect('.site-global-nav'),
          navigationLink: {
            ...rect('.site-global-nav a'),
            display: navigationLinkStyle.display,
            fontSize: navigationLinkStyle.fontSize,
            borderRadius: navigationLinkStyle.borderRadius,
            beforeContent: getComputedStyle(navigationLink, '::before').content
          }
        };
      });
      assert.ok(desktopLayout.topbarHeight >= 48);
      assert.notEqual(desktopLayout.clockControlsDisplay, 'none');
      assert.equal(desktopLayout.search.width, 340);
      assert.equal(desktopLayout.search.height, 34);
      assert.equal(desktopLayout.music.width, 110);
      assert.equal(desktopLayout.music.height, 36);
      assert.deepEqual(mobileLayout.musicControls, desktopLayout.musicControls);
      assert.ok(Math.abs(mobileLayout.navigation.width - desktopLayout.navigation.width) <= 1);
      assert.ok(Math.abs(mobileLayout.navigation.height - desktopLayout.navigation.height) <= 1);
      assert.ok(Math.abs(mobileLayout.navigationLink.width - desktopLayout.navigationLink.width) <= 1);
      assert.ok(Math.abs(mobileLayout.navigationLink.height - desktopLayout.navigationLink.height) <= 1);
      assert.equal(mobileLayout.navigationLink.display, desktopLayout.navigationLink.display);
      assert.equal(mobileLayout.navigationLink.fontSize, desktopLayout.navigationLink.fontSize);
      assert.equal(mobileLayout.navigationLink.borderRadius, desktopLayout.navigationLink.borderRadius);
      assert.equal(mobileLayout.navigationLink.beforeContent, desktopLayout.navigationLink.beforeContent);
      await desktopContext.close();
    });

    await t.test('mobile Rem pet stays visible, interactive and above navigation', async () => {
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 667 }, hasTouch: true });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(`${origin}/os/`, { waitUntil: 'load' });
      await mobilePage.waitForSelector('.site-global-nav');
      await mobilePage.waitForFunction(() => document.body.classList.contains('is-launched'));
      await mobilePage.waitForTimeout(700);
      await mobilePage.waitForFunction(() => document.querySelector('#desktopPet')?.dataset.petFrame !== undefined);

      const mobilePet = await mobilePage.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
        };
        const pet = document.querySelector('#desktopPet');
        const sprite = document.querySelector('.desktop-pet-sprite');
        return {
          pet: rect('#desktopPet'),
          sprite: rect('.desktop-pet-sprite'),
          navigation: rect('.site-global-nav'),
          display: getComputedStyle(pet).display,
          backgroundImage: getComputedStyle(sprite).backgroundImage,
          backgroundSize: getComputedStyle(sprite).backgroundSize
        };
      });

      assert.equal(mobilePet.display, 'grid');
      assert.ok(mobilePet.pet.width >= 95 && mobilePet.pet.width <= 97);
      assert.ok(mobilePet.pet.height >= 121 && mobilePet.pet.height <= 123);
      assert.equal(mobilePet.sprite.width, 96);
      assert.equal(mobilePet.sprite.height, 104);
      assert.match(mobilePet.backgroundImage, /spritesheet-optimized\.webp/);
      assert.equal(mobilePet.backgroundSize, '768px 936px');
      assert.ok(mobilePet.pet.bottom <= mobilePet.navigation.top - 8);

      await mobilePage.locator('#desktopPet').tap();
      await mobilePage.waitForSelector('#petSpeech:not([hidden])');
      const speech = await mobilePage.locator('#petSpeech').boundingBox();
      assert.ok(speech);
      assert.ok(speech.x >= 0 && speech.x + speech.width <= 390);
      assert.ok(speech.y >= 0 && speech.y + speech.height <= 667);

      const petBeforeDrag = await mobilePage.locator('#desktopPet').boundingBox();
      await mobilePage.mouse.move(petBeforeDrag.x + petBeforeDrag.width / 2, petBeforeDrag.y + petBeforeDrag.height / 2);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(389, 666, { steps: 6 });
      await mobilePage.mouse.up();
      await mobilePage.waitForTimeout(100);
      const petAfterDrag = await mobilePage.locator('#desktopPet').boundingBox();
      const navigationAfterDrag = await mobilePage.locator('.site-global-nav').boundingBox();
      assert.ok(petAfterDrag.x + petAfterDrag.width <= 390 - 8);
      assert.ok(petAfterDrag.y + petAfterDrag.height <= navigationAfterDrag.y - 9);
      await mobileContext.close();

      const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const desktopPage = await desktopContext.newPage();
      await desktopPage.goto(`${origin}/os/`, { waitUntil: 'domcontentloaded' });
      await desktopPage.waitForFunction(() => document.body.classList.contains('is-launched'));
      await desktopPage.waitForTimeout(700);
      const desktopPet = await desktopPage.locator('#desktopPet').boundingBox();
      const desktopSprite = await desktopPage.locator('.desktop-pet-sprite').boundingBox();
      assert.equal(desktopPet.width, 144);
      assert.equal(desktopPet.height, 182);
      assert.equal(desktopSprite.width, 144);
      assert.equal(desktopSprite.height, 156);
      await desktopContext.close();
    });

    await t.test('mobile navigation folders stay in the upper safe viewport', async () => {
      state.desktop = makeDesktop([{
        id: 'folder-mobile',
        type: 'folder',
        title: '移动导航',
        icon: '▰',
        color: '#f4c84a',
        links: Array.from({ length: 12 }, (_, index) => ({
          id: `mobile-link-${index}`,
          type: 'link',
          title: `导航 ${index + 1}`,
          url: `https://mobile-${index}.example`,
          icon: String(index + 1),
          color: '#e8d9dc',
          openMode: 'new',
          position: index
        }))
      }]);
      state.faviconFallbackIds.clear();
      const context = await browser.newContext({ viewport: { width: 390, height: 667 } });
      const page = await context.newPage();
      await page.goto(`${origin}/os/`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.classList.contains('is-launched'));
      await page.waitForTimeout(700);
      await page.locator('[data-navigation-id="folder-mobile"]').click();
      await page.waitForSelector('#navigationFolder.is-open');
      await page.waitForTimeout(250);

      const panel = await page.locator('.navigation-folder-panel').boundingBox();
      assert.ok(panel);
      assert.ok(panel.y >= 52);
      assert.ok(panel.y <= 667 * 0.25);
      assert.ok(panel.y + panel.height <= 667 - 70);
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

    await t.test('admin creates, renames, reorders and migration-deletes desktop pages', async () => {
      state.authenticated = true;
      state.failDesktop = false;
      state.desktop = makePagedDesktop();
      state.pageRequests = [];
      const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/admin/`);
      await page.waitForFunction(() => document.querySelectorAll('#desktopPageManagerList [data-page-id]').length === 3);

      await page.locator('[data-page-id="desktop-page-work"] [data-action="select-page"]').click();
      await page.waitForSelector('[data-manager-id="folder-page-work"]');
      assert.match(await page.locator('#desktopContentTitle').textContent(), /工作/);
      assert.equal(await page.locator('[data-manager-id="link-page-home"]').count(), 0);

      await page.locator('#addDesktopPageButton').click();
      await page.locator('#pageName').fill('临时页面');
      await page.locator('#pageForm [type="submit"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('#desktopPageManagerList [data-page-id]')]
        .some((element) => element.textContent.includes('临时页面')));
      const temporaryPageId = state.desktop.pages.find((entry) => entry.name === '临时页面')?.id;
      assert.ok(temporaryPageId);
      assert.equal(await page.locator(`[data-page-id="${temporaryPageId}"]`).evaluate((element) => element.classList.contains('is-selected')), true);

      await page.locator('#addFolderButton').click();
      await page.locator('#itemName').fill('待迁移文件夹');
      await page.locator('#itemForm [type="submit"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-manager-id]')]
        .some((element) => element.textContent.includes('待迁移文件夹')));
      const folderRequest = state.pageRequests.find((request) => request.action === 'create-folder');
      assert.equal(folderRequest?.body.pageId, temporaryPageId);

      await page.locator(`[data-page-id="${temporaryPageId}"] [data-action="rename-page"]`).click();
      await page.locator('#pageName').fill('迁移测试页');
      await page.locator('#pageForm [type="submit"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('#desktopPageManagerList [data-page-id]')]
        .some((element) => element.textContent.includes('迁移测试页')));

      await page.locator(`[data-page-id="${temporaryPageId}"] [data-action="move-page-up"]`).click();
      await page.waitForFunction(() => document.querySelector('#saveStatus')?.textContent.startsWith('已保存'));
      assert.equal(state.pageRequests.some((request) => request.action === 'layout'), true);

      await page.locator(`[data-page-id="${temporaryPageId}"] [data-action="delete-page"]`).click();
      await page.locator('#deletePageTarget').selectOption('desktop-page-home');
      await page.locator('#deletePageForm [type="submit"]').click();
      await page.waitForFunction((pageId) => !document.querySelector(`[data-page-id="${pageId}"]`), temporaryPageId);
      assert.equal(state.desktop.pages.some((entry) => entry.id === temporaryPageId), false);
      assert.equal(
        state.desktop.pages.find((entry) => entry.id === 'desktop-page-home').items.some((item) => item.title === '待迁移文件夹'),
        true
      );
      assert.deepEqual(state.pageRequests.at(-1), {
        action: 'delete',
        pageId: temporaryPageId,
        targetPageId: 'desktop-page-home'
      });
      assert.deepEqual(errors, []);
      await context.close();

      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(`${origin}/admin/`);
      await mobilePage.waitForFunction(() => document.querySelectorAll('#desktopPageManagerList [data-page-id]').length === 3);
      const mobileLayout = await mobilePage.evaluate(() => ({
        columns: getComputedStyle(document.querySelector('#desktopPageManagerList')).gridTemplateColumns.split(' ').length,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      }));
      assert.equal(mobileLayout.columns, 1);
      assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth);
      await mobileContext.close();
    });

    await t.test('post-login load errors stay visible and retryable', async () => {
      state.desktop = makeDesktop([
        { id: 'link-a', type: 'link', title: '第一项', url: 'https://a.example', icon: 'A', color: '#e8d9dc', openMode: 'new' }
      ]);
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