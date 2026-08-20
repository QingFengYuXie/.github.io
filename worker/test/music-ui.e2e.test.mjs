import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const edgeExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../static');

const desktop = {
  version: 1,
  updatedAt: 1,
  pages: [
    {
      id: 'desktop-page-home',
      name: '主页',
      position: 0,
      items: [{ id: 'link-one', type: 'link', title: '示例', url: 'https://example.com', icon: '', color: '#e8d9dc', openMode: 'new' }]
    },
    {
      id: 'desktop-page-notes',
      name: '笔记',
      position: 1,
      items: [{ id: 'link-two', type: 'link', title: '示例二', url: 'https://example.org', icon: '', color: '#e8d9dc', openMode: 'new' }]
    }
  ]
};

let music = makeMusic([
  { id: 'track-a', title: '第一首', url: 'https://audio.test/one.mp3' },
  { id: 'track-b', title: '第二首', url: 'https://audio.test/two.mp3' }
]);

function makeMusic(tracks, version = 1) {
  return {
    version,
    updatedAt: Date.now(),
    tracks: tracks.map((track, position) => ({ ...track, position }))
  };
}

function json(response, status = 200) {
  return { status, body: JSON.stringify(response), type: 'application/json; charset=utf-8' };
}

async function readBody(request) {
  let value = '';
  for await (const chunk of request) value += chunk;
  return value ? JSON.parse(value) : {};
}

async function apiResponse(request, pathname) {
  if (pathname === '/api/v1/music' && request.method === 'GET') return json(music);
  if (pathname === '/api/v1/desktop' && request.method === 'GET') return json(desktop);
  if (pathname === '/api/v1/wallpaper/meta' && request.method === 'GET') {
    return json({ configured: true, url: '/api/v1/wallpaper/image' });
  }
  if (pathname === '/api/v1/wallpaper/image' && request.method === 'GET') {
    return { status: 200, body: '', type: 'image/webp' };
  }
  if (pathname === '/api/v1/auth/session' && request.method === 'GET') {
    return json({ authenticated: true, csrfToken: 'test-csrf' });
  }
  if (pathname.startsWith('/api/v1/admin/music') && request.headers['x-csrf-token'] !== 'test-csrf') {
    return json({ message: 'CSRF 校验失败。' }, 403);
  }
  if (pathname === '/api/v1/admin/music' && request.method === 'POST') {
    const body = await readBody(request);
    music = makeMusic([...music.tracks, { id: `track-${music.tracks.length + 1}`, title: body.title, url: body.url }], music.version + 1);
    return json({ ok: true, music });
  }
  if (pathname === '/api/v1/admin/music/layout' && request.method === 'PUT') {
    const body = await readBody(request);
    const byId = new Map(music.tracks.map((track) => [track.id, track]));
    music = makeMusic(body.ids.map((id) => byId.get(id)), music.version + 1);
    return json({ ok: true, music });
  }
  const trackMatch = pathname.match(/^\/api\/v1\/admin\/music\/([^/]+)$/);
  if (trackMatch && request.method === 'PATCH') {
    const body = await readBody(request);
    music = makeMusic(music.tracks.map((track) => track.id === trackMatch[1] ? { ...track, ...body } : track), music.version + 1);
    return json({ ok: true, music });
  }
  if (trackMatch && request.method === 'DELETE') {
    music = makeMusic(music.tracks.filter((track) => track.id !== trackMatch[1]), music.version + 1);
    return json({ ok: true, music });
  }
  if (pathname === '/api/v1/auth/logout' && request.method === 'POST') return json({ ok: true });
  return null;
}

function titleActionsFixture(pathname) {
  if (pathname === '/dynamic' || pathname === '/dynamic/' || /^\/(?:dynamic\/)?(?:page\d+|tag|search)(?:\.html)?$/.test(pathname)) {
    return `<div class="title-left"><span class="mobile-page-mark" aria-hidden="true"></span><strong>轻风雨斜 OS</strong></div><div class="title-right"><a href="/search.html" id="buttonSearch" class="btn btn-invisible circle" title="搜索"><svg width="16" height="16"></svg></a><a href="/about.html" class="btn btn-invisible circle" title="关于" style="display:none"><svg width="16" height="16"></svg></a><a href="/rss.xml" id="buttonRSS" class="btn btn-invisible circle" title="RSS"><svg width="16" height="16"></svg></a><a class="btn btn-invisible circle" onclick="modeSwitch()" title="切换主题"><svg width="16" height="16"></svg></a></div>`;
  }
  if (/^\/(?:dynamic\/)?post\//.test(pathname)) {
    return `<h1 class="postTitle">测试动态</h1><div class="title-right"><a href="/" id="buttonHome" class="btn btn-invisible circle" title="首页"><svg width="16" height="16"></svg></a><a href="https://github.com/example/issues/3" class="btn btn-invisible circle" title="Issue"><svg width="16" height="16"></svg></a><a class="btn btn-invisible circle" onclick="modeSwitch()" title="切换主题"><svg width="16" height="16"></svg></a></div>`;
  }
  if (pathname === '/about' || pathname === '/about.html' || pathname === '/dynamic/about' || pathname === '/dynamic/about.html') {
    return `<h1 class="postTitle">关于</h1><div class="title-right"><a href="/" id="buttonHome" class="btn btn-invisible circle" title="首页"><svg width="16" height="16"></svg></a><a href="https://github.com/example/issues/3" class="btn btn-invisible circle" title="Issue"><svg width="16" height="16"></svg></a><a class="btn btn-invisible circle" onclick="modeSwitch()" title="切换主题"><svg width="16" height="16"></svg></a></div>`;
  }
  return `<div class="title-right"><a class="btn btn-invisible circle" onclick="modeSwitch()" title="切换主题"><svg width="16" height="16"></svg></a></div>`;
}

function pageFixture(pathname) {
  return `<!doctype html><html lang="zh-CN" data-color-mode="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pathname}</title><link rel="stylesheet" href="/site-nav.css"><style>body{box-sizing:border-box;min-width:200px;max-width:900px;margin:20px auto;padding:45px;font:16px/1.25 sans-serif}#header{display:flex;padding-bottom:8px;border-bottom:1px solid #d0d7de;margin-bottom:16px}.title-left{display:flex;align-items:center;gap:8px;white-space:nowrap}.mobile-page-mark{width:40px;height:40px;border-radius:50%;background:#d0d7de}.postTitle{margin:auto 0;font-size:40px}.title-right{display:flex;margin:auto 0 0 auto}.title-right .circle{box-sizing:border-box;padding:14px 16px;margin-right:8px}.title-right svg{display:block}.SideNav{min-width:360px}@media(max-width:600px){body{padding:8px}.title-left strong{display:none}.postTitle{font-size:24px}}</style></head><body><header id="header">${titleActionsFixture(pathname)}</header><main id="content"><h2>${pathname}</h2>${pathname === '/dynamic/' ? '<nav class="SideNav"></nav><div class="pagination"><a class="next_page" rel="next" href="/dynamic/page2.html">下一页</a></div>' : ''}</main><span id="busuanzi_value_site_pv" hidden>12345</span><script>function modeSwitch(){}</script><script src="/site-nav.js"></script></body></html>`;
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.jpg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      const api = await apiResponse(request, pathname);
      if (api) {
        response.writeHead(api.status, { 'content-type': api.type, 'cache-control': 'no-store' });
        response.end(api.body);
        return;
      }

      if (pathname === '/dynamic/page2.html') {
        response.writeHead(308, { location: '/dynamic/page2', 'cache-control': 'no-store' });
        response.end();
        return;
      }

      if (pathname === '/dynamic' || pathname === '/dynamic/' || /^\/(?:dynamic\/)?(?:page\d+|tag|search)(?:\.html)?$/.test(pathname) || pathname === '/about' || pathname === '/about.html' || pathname === '/dynamic/about' || pathname === '/dynamic/about.html' || /^\/(?:dynamic\/)?post\//.test(pathname)) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(pageFixture(pathname));
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

async function installMediaShim(context) {
  await context.addInitScript(() => {
    const mediaState = new WeakMap();
    document.addEventListener('pointerdown', () => localStorage.removeItem('__blockAudioOnce'), { capture: true });
    const stateFor = (media) => {
      if (!mediaState.has(media)) mediaState.set(media, { paused: true, currentTime: 0, duration: 240, src: '' });
      return mediaState.get(media);
    };
    for (const [name, descriptor] of Object.entries({
      paused: { get() { return stateFor(this).paused; } },
      currentTime: { get() { return stateFor(this).currentTime; }, set(value) { stateFor(this).currentTime = Number(value) || 0; } },
      duration: { get() { return stateFor(this).duration; } },
      readyState: { get() { return 4; } },
      ended: { get() { return false; } },
      src: { get() { return stateFor(this).src; }, set(value) { stateFor(this).src = String(value || ''); } }
    })) {
      try { Object.defineProperty(HTMLMediaElement.prototype, name, { configurable: true, ...descriptor }); } catch { /* Edge version fallback. */ }
    }
    HTMLMediaElement.prototype.load = function load() {
      queueMicrotask(() => {
        this.dispatchEvent(new Event('loadedmetadata'));
        this.dispatchEvent(new Event('canplay'));
      });
    };
    HTMLMediaElement.prototype.play = function play() {
      const media = stateFor(this);
      if (localStorage.getItem('__blockAudioOnce') === '1') {
        media.paused = true;
        return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
      }
      media.paused = false;
      queueMicrotask(() => this.dispatchEvent(new Event('play')));
      if (media.src.includes('broken')) setTimeout(() => this.dispatchEvent(new Event('error')), 0);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      const media = stateFor(this);
      if (media.paused) return;
      media.paused = true;
      this.dispatchEvent(new Event('pause'));
    };
  });
}

async function waitForTrack(page, trackId) {
  await page.waitForFunction((id) => document.querySelector('.site-music-player')?.dataset.trackId === id, trackId);
}

const canRunEdge = process.platform === 'win32' && existsSync(edgeExecutable);

test('Edge music player and admin library regression', { skip: !canRunEdge }, async (t) => {
  const { chromium } = await import('playwright-core');
  const { server, origin } = await startServer();
  const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installMediaShim(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());

  try {
    await t.test('title action players stay adjacent and restore track and progress across pages', async () => {
      music = makeMusic([
        { id: 'track-a', title: '第一首', url: 'https://audio.test/one.mp3' },
        { id: 'track-b', title: '第二首', url: 'https://audio.test/two.mp3' }
      ], 10);
      music.tracks[0].title = 'A very long song title that should scroll inside the compact player';
      await page.goto(`${origin}/dynamic/`);
      await waitForTrack(page, 'track-a');
      await page.waitForSelector('.site-music-player[data-music-state="playing"]');
      assert.equal(await page.locator('.site-music-player').evaluate((element) => getComputedStyle(element).position), 'static');
      assert.equal(await page.locator('.site-music-player').evaluate((element) => element.parentElement?.classList.contains('title-right')), true);
      assert.equal(await page.locator('.title-right a[onclick*="modeSwitch"]').evaluate((element) => getComputedStyle(element).position), 'static');
      assert.equal(await page.locator('.title-right a[onclick*="modeSwitch"]').count(), 1);
      assert.equal(await page.locator('.title-right a[title="关于"]').evaluate((element) => getComputedStyle(element).display), 'none');
      assert.deepEqual(await page.locator('.title-right').evaluate((actions) => [...actions.children].filter((element) => getComputedStyle(element).display !== 'none').map((element) => {
        if (element.id === 'buttonSearch') return 'search';
        if (element.id === 'buttonRSS') return 'rss';
        if (element.matches('[onclick*="modeSwitch"]')) return 'theme';
        if (element.classList.contains('site-music-player')) return 'music';
        return 'other';
      })), ['search', 'rss', 'theme', 'music']);
      assert.equal(await page.locator('.site-music-controls [data-music-action]').count(), 4);
      assert.equal(await page.locator('.site-music-player').getAttribute('data-playback-mode'), 'sequence');
      assert.equal(await page.locator('[data-music-action="mode"]').getAttribute('data-music-mode'), 'sequence');
      assert.equal(await page.locator('.site-music-disc').count(), 0);
      const titlePlayerLayout = await page.locator('.site-music-player').evaluate((player) => {
        const playerBox = player.getBoundingClientRect();
        const controls = [...player.querySelectorAll('.site-music-control')];
        const playerStyle = getComputedStyle(player);
        return {
          width: playerBox.width,
          clientWidth: player.clientWidth,
          scrollWidth: player.scrollWidth,
          backgroundColor: playerStyle.backgroundColor,
          borderStyle: playerStyle.borderStyle,
          boxShadow: playerStyle.boxShadow,
          controlColor: getComputedStyle(controls[0]).color,
          controlsUseNativeClasses: controls.every((control) => control.matches('.btn.btn-invisible.circle')),
          controlsResetGmeekSpacing: controls.every((control) => {
            const style = getComputedStyle(control);
            return style.margin === '0px' && style.padding === '0px';
          }),
          controlsFit: controls.every((control) => {
            const box = control.getBoundingClientRect();
            return box.left >= playerBox.left - .5 && box.right <= playerBox.right + .5;
          })
        };
      });
      assert.ok(titlePlayerLayout.width <= 120);
      assert.ok(titlePlayerLayout.scrollWidth <= titlePlayerLayout.clientWidth);
      assert.equal(titlePlayerLayout.backgroundColor, 'rgba(0, 0, 0, 0)');
      assert.equal(titlePlayerLayout.borderStyle, 'none');
      assert.equal(titlePlayerLayout.boxShadow, 'none');
      assert.equal(titlePlayerLayout.controlColor, 'rgb(9, 105, 218)');
      assert.equal(titlePlayerLayout.controlsUseNativeClasses, true);
      assert.equal(titlePlayerLayout.controlsResetGmeekSpacing, true);
      assert.equal(titlePlayerLayout.controlsFit, true);
      assert.equal(await page.locator('.site-music-copy').evaluate((element) => getComputedStyle(element).display), 'none');
      assert.equal(await page.locator('.site-music-play-icon').count(), 0);
      assert.equal(await page.locator('.site-music-play > svg').count(), 1);
      assert.equal(await page.locator('.site-music-play path').getAttribute('d'), 'M8 5v14M16 5v14');
      await page.locator('[data-music-action="play"]').click();
      await page.waitForSelector('.site-music-player[data-music-state="paused"]');
      assert.equal(await page.locator('.site-music-play path').getAttribute('d'), 'm8 5 11 7-11 7Z');
      await page.locator('[data-music-action="play"]').click();
      await page.waitForSelector('.site-music-player[data-music-state="playing"]');

      await page.locator('[data-music-action="next"]').click();
      await waitForTrack(page, 'track-b');
      await page.locator('[data-music-action="next"]').click();
      await waitForTrack(page, 'track-a');
      await page.locator('[data-music-action="previous"]').click();
      await waitForTrack(page, 'track-b');
      await page.locator('.site-background-audio').evaluate((audio) => { audio.currentTime = 37.5; });
      await page.locator('.pagination .next_page').click();
      await page.waitForURL(`${origin}/dynamic/page2`);
      assert.equal(new URL(page.url()).pathname, '/dynamic/page2');
      await waitForTrack(page, 'track-b');
      assert.equal(await page.locator('.site-music-player').evaluate((element) => element.parentElement?.classList.contains('title-right')), true);
      assert.equal(await page.locator('.title-right a[onclick*="modeSwitch"]').count(), 1);

      await page.locator('.site-global-nav a[href="/about.html"]').click();
      await waitForTrack(page, 'track-b');
      await page.waitForFunction(() => Math.abs(document.querySelector('.site-background-audio').currentTime - 37.5) < 0.1);
      assert.deepEqual(await page.locator('.title-right').evaluate((actions) => [...actions.children].filter((element) => getComputedStyle(element).display !== 'none').map((element) => {
        if (element.id === 'buttonHome') return 'home';
        if (element.getAttribute('title') === 'Issue') return 'issue';
        if (element.matches('[onclick*="modeSwitch"]')) return 'theme';
        if (element.classList.contains('site-music-player')) return 'music';
        return 'other';
      })), ['home', 'issue', 'theme', 'music']);
      assert.equal(await page.locator('.site-music-player').evaluate((element) => element.parentElement?.classList.contains('title-right')), true);
      assert.equal(await page.locator('.title-right a[onclick*="modeSwitch"]').count(), 1);

      await page.goto(`${origin}/search.html`);
      await waitForTrack(page, 'track-b');
      assert.equal(await page.locator('.site-music-player').evaluate((element) => getComputedStyle(element).position), 'static');
      assert.equal(await page.locator('.site-music-player').evaluate((element) => element.parentElement?.classList.contains('title-right')), true);

      await page.locator('[data-music-action="mode"]').click();
      assert.equal(await page.locator('.site-music-player').getAttribute('data-playback-mode'), 'shuffle');
      assert.equal(await page.evaluate(() => localStorage.getItem('lightwind-background-music-mode-v1')), 'shuffle');
      await page.locator('[data-music-action="next"]').click();
      await waitForTrack(page, 'track-a');
      await page.locator('[data-music-action="previous"]').click();
      await waitForTrack(page, 'track-b');
      await page.reload();
      await waitForTrack(page, 'track-b');
      assert.equal(await page.locator('.site-music-player').getAttribute('data-playback-mode'), 'shuffle');
      await page.locator('[data-music-action="mode"]').click();
      assert.equal(await page.locator('.site-music-player').getAttribute('data-playback-mode'), 'sequence');

      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 667 }, { width: 1280, height: 800 }]) {
        await page.setViewportSize(viewport);
        for (const route of ['/dynamic', '/dynamic/', '/dynamic/page2', '/dynamic/page2.html', '/dynamic/page3', '/dynamic/page3.html', '/page2', '/page2.html', '/page3', '/page3.html', '/tag', '/tag.html', '/dynamic/tag', '/dynamic/tag.html', '/search', '/search.html', '/dynamic/post/------%2020.html', '/dynamic/post/------%2020', '/post/------%2020.html', '/post/------%2020', '/about.html', '/about', '/dynamic/about.html', '/dynamic/about']) {
          await page.goto(`${origin}${route}`);
          await waitForTrack(page, 'track-b');
          await page.waitForFunction(() => document.querySelector('.site-visit-count')?.textContent === '12345');
          const layout = await page.evaluate(() => {
            const actions = document.querySelector('.title-right');
            const header = document.querySelector('#header');
            const title = document.querySelector('.postTitle');
            const back = document.querySelector('.site-article-back');
            const player = document.querySelector('.site-music-player');
            const stats = document.querySelector('.site-visit-stats');
            const theme = document.querySelector('.title-right a[onclick*="modeSwitch"]');
            const visibleActions = [...actions.children].filter((element) => getComputedStyle(element).display !== 'none');
            const iconActions = visibleActions.filter((element) => element.matches('a'));
            const iconSvgs = [
              ...iconActions.map((action) => action.querySelector('svg')),
              ...player.querySelectorAll('.site-music-control > svg')
            ];
            const rect = (element) => {
              const box = element.getBoundingClientRect();
              return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
            };
            const centerY = (element) => {
              const box = element.getBoundingClientRect();
              return box.top + box.height / 2;
            };
            const spacingActions = visibleActions.filter((element) => !element.classList.contains('site-article-back'));
            const actionRects = spacingActions.map(rect);
            const actionCenters = spacingActions.map(centerY);
            const iconCenters = iconSvgs.map(centerY);
            const adjacentGaps = actionRects.slice(1).map((box, index) => box.left - actionRects[index].right);
            return {
              actions: rect(actions),
              header: rect(header),
              title: title ? rect(title) : null,
              back: back ? rect(back) : null,
              backParentIsActions: back?.parentElement === actions,
              backPosition: back ? getComputedStyle(back).position : null,
              backBorderStyle: back ? getComputedStyle(back).borderStyle : null,
              backBackground: back ? getComputedStyle(back).backgroundColor : null,
              backBoxShadow: back ? getComputedStyle(back).boxShadow : null,
              player: rect(player),
              stats: rect(stats),
              theme: rect(theme),
              firstElementIsStats: document.body.firstElementChild === stats,
              playerParentIsActions: player.parentElement === actions,
              playerPosition: getComputedStyle(player).position,
              playerBackground: getComputedStyle(player).backgroundColor,
              playerBorderStyle: getComputedStyle(player).borderStyle,
              playerBoxShadow: getComputedStyle(player).boxShadow,
              playerFitsContent: player.scrollWidth <= player.clientWidth,
              controlsFitPlayer: [...player.querySelectorAll('.site-music-control')].every((control) => {
                const playerBox = player.getBoundingClientRect();
                const controlBox = control.getBoundingClientRect();
                return controlBox.left >= playerBox.left - .5 && controlBox.right <= playerBox.right + .5;
              }),
              actionCenterSpread: Math.max(...actionCenters) - Math.min(...actionCenters),
              iconCenterSpread: Math.max(...iconCenters) - Math.min(...iconCenters),
              adjacentGaps,
              expectedGap: Number.parseFloat(getComputedStyle(actions).columnGap),
              iconActionsUseSharedClass: iconActions.every((action) => action.classList.contains('site-title-icon-action')),
              iconActionsCentered: iconActions.every((action) => Math.abs(centerY(action) - centerY(action.querySelector('svg'))) <= .5),
              iconActionSizes: iconActions.map((action) => rect(action).width),
              actionColors: [...iconActions, ...player.querySelectorAll('.site-music-control')].map((element) => getComputedStyle(element).color),
              themePosition: getComputedStyle(theme).position,
              statsWhiteSpace: getComputedStyle(stats).whiteSpace,
              statsFits: stats.scrollWidth <= stats.clientWidth,
              bodyPaddingTop: getComputedStyle(document.body).paddingTop,
              statsHeaderGap: rect(header).top - rect(stats).bottom,
              themeCount: document.querySelectorAll('.title-right a[onclick*="modeSwitch"]').length,
              activeNavigationHref: document.querySelector('.site-global-nav [aria-current="page"]')?.getAttribute('href'),
              viewportWidth: window.innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              order: [...actions.children].filter((element) => getComputedStyle(element).display !== 'none').map((element) => {
                if (element.classList.contains('site-article-back')) return 'back';
                if (element.id === 'buttonSearch') return 'search';
                if (element.id === 'buttonRSS') return 'rss';
                if (element.id === 'buttonHome') return 'home';
                if (element.getAttribute('title') === 'Issue') return 'issue';
                if (element.matches('[onclick*="modeSwitch"]')) return 'theme';
                if (element.classList.contains('site-music-player')) return 'music';
                return 'other';
              })
            };
          });
          const isFeedRoute = route === '/dynamic' || route === '/dynamic/' || /^\/(?:dynamic\/)?(?:page\d+|tag|search)(?:\.html)?$/.test(route);
          const isArticleRoute = /^\/(?:dynamic\/)?post\//.test(route);
          const isAboutRoute = ['/about', '/about.html', '/dynamic/about', '/dynamic/about.html'].includes(route);
          const expectedOrder = isFeedRoute
            ? ['search', 'rss', 'theme', 'music']
            : isArticleRoute
              ? ['back', 'home', 'issue', 'theme', 'music']
              : ['home', 'issue', 'theme', 'music'];
          assert.deepEqual(layout.order, expectedOrder, `${route} ${viewport.width}px action order`);
          const expectedNavigationHref = ['/about', '/about.html', '/dynamic/about', '/dynamic/about.html'].includes(route)
            ? '/about.html'
            : '/dynamic/';
          assert.equal(layout.activeNavigationHref, expectedNavigationHref, `${route} ${viewport.width}px active navigation`);
          assert.equal(layout.themeCount, 1);
          if (isArticleRoute) {
            assert.equal(layout.backParentIsActions, true);
            assert.equal(layout.backPosition, viewport.width <= 600 ? 'static' : 'fixed');
          }
          if ((isArticleRoute || isAboutRoute) && viewport.width <= 600) {
            assert.ok(layout.actions.bottom <= layout.title.top, `${route} ${viewport.width}px action bar should precede title`);
          }
          if (isArticleRoute && viewport.width <= 600) {
            assert.ok(layout.back.left <= layout.actions.left + .5, `${route} ${viewport.width}px back button should start the action bar`);
            assert.equal(layout.backBorderStyle, 'none');
            assert.equal(layout.backBackground, 'rgba(0, 0, 0, 0)');
            assert.equal(layout.backBoxShadow, 'none');
            assert.ok(Math.abs(layout.back.width - layout.theme.width) <= .5, `${route} ${viewport.width}px back icon size should match the action icons`);
          }
          assert.equal(layout.playerParentIsActions, true);
          assert.equal(layout.playerPosition, 'static');
          assert.equal(layout.playerBackground, 'rgba(0, 0, 0, 0)');
          assert.equal(layout.playerBorderStyle, 'none');
          assert.equal(layout.playerBoxShadow, 'none');
          assert.equal(layout.playerFitsContent, true);
          assert.equal(layout.controlsFitPlayer, true);
          assert.ok(layout.actionCenterSpread <= .5, `${route} ${viewport.width}px action center spread ${layout.actionCenterSpread}`);
          assert.ok(layout.iconCenterSpread <= .5, `${route} ${viewport.width}px icon center spread ${layout.iconCenterSpread}`);
          assert.equal(layout.iconActionsUseSharedClass, true);
          assert.equal(layout.iconActionsCentered, true);
          assert.ok(layout.iconActionSizes.every((size) => Math.abs(size - layout.theme.width) <= .5), `${route} ${viewport.width}px inconsistent icon action sizes`);
          assert.ok(layout.iconActionSizes.every((size) => Math.abs(size - layout.player.height) <= .5), `${route} ${viewport.width}px action and player heights differ`);
          assert.ok(layout.adjacentGaps.every((gap) => Math.abs(gap - layout.expectedGap) <= .5), `${route} ${viewport.width}px inconsistent action gaps ${layout.adjacentGaps}`);
          assert.equal(new Set(layout.actionColors).size, 1, `${route} ${viewport.width}px inconsistent action colors`);
          assert.equal(layout.themePosition, 'static');
          assert.equal(layout.statsWhiteSpace, 'nowrap');
          assert.equal(layout.statsFits, true);
          assert.equal(layout.firstElementIsStats, true);
          const maximumStatsTop = viewport.width <= 600 ? 4.5 : 8.5;
          const expectedBodyPaddingTop = viewport.width <= 600 ? '8px' : '12px';
          const minimumStatsHeaderGap = viewport.width <= 600 ? 9 : 5;
          const maximumStatsHeaderGap = viewport.width <= 600 ? 12 : 8;
          assert.ok(layout.stats.top <= maximumStatsTop, `${route} ${viewport.width}px stats top ${layout.stats.top}`);
          assert.equal(layout.bodyPaddingTop, expectedBodyPaddingTop, `${route} ${viewport.width}px body top padding`);
          assert.ok(layout.statsHeaderGap >= minimumStatsHeaderGap, `${route} ${viewport.width}px stats/header gap ${layout.statsHeaderGap}`);
          assert.ok(layout.statsHeaderGap <= maximumStatsHeaderGap, `${route} ${viewport.width}px excessive stats/header gap ${layout.statsHeaderGap}`);
          assert.ok(layout.stats.bottom <= layout.header.top, `${route} ${viewport.width}px stats overlap header`);
          assert.ok(layout.actions.left >= -0.5 && layout.actions.right <= layout.viewportWidth + 0.5, `${route} ${viewport.width}px actions overflow`);
          assert.ok(layout.player.left > layout.theme.left, `${route} ${viewport.width}px player order`);
          assert.ok(layout.documentWidth <= layout.viewportWidth, `${route} ${viewport.width}px horizontal overflow`);

          for (const colorMode of ['light', 'dark', 'auto']) {
            await page.evaluate((mode) => document.documentElement.setAttribute('data-color-mode', mode), colorMode);
            await page.waitForTimeout(300);
            const themedLayout = await page.evaluate(() => {
              const actions = document.querySelector('.site-title-actions');
              const player = actions.querySelector('.site-music-player');
              const elements = [...actions.querySelectorAll(':scope > a'), ...player.querySelectorAll('.site-music-control')]
                .filter((element) => getComputedStyle(element).display !== 'none');
              const centerY = (element) => {
                const box = element.getBoundingClientRect();
                return box.top + box.height / 2;
              };
              const iconCenters = [
                ...[...actions.children]
                  .filter((element) => element.matches('a') && getComputedStyle(element).display !== 'none')
                  .map((element) => element.querySelector('svg')),
                ...player.querySelectorAll('.site-music-control > svg')
              ].map(centerY);
              return {
                colors: elements.map((element) => getComputedStyle(element).color),
                iconCenterSpread: Math.max(...iconCenters) - Math.min(...iconCenters)
              };
            });
            assert.equal(new Set(themedLayout.colors).size, 1, `${route} ${viewport.width}px ${colorMode} action colors`);
            assert.ok(themedLayout.iconCenterSpread <= .5, `${route} ${viewport.width}px ${colorMode} icon center spread ${themedLayout.iconCenterSpread}`);
          }
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await t.test('autoplay block, single track, empty library and failed library states', async () => {
      await page.evaluate(() => localStorage.setItem('__blockAudioOnce', '1'));
      await page.reload();
      await page.waitForSelector('.site-music-player[data-music-state="blocked"]');
      await page.locator('#content').dispatchEvent('pointerdown', { pointerType: 'mouse', isPrimary: true });
      await page.waitForTimeout(120);
      const autoplayState = await page.evaluate(() => ({
        state: document.querySelector('.site-music-player')?.dataset.musicState,
        paused: document.querySelector('.site-background-audio')?.paused,
        source: document.querySelector('.site-background-audio')?.src,
        blockFlag: localStorage.getItem('__blockAudioOnce')
      }));
      assert.equal(autoplayState.state, 'playing', JSON.stringify(autoplayState));

      music = makeMusic([{ id: 'only', title: '单曲', url: 'https://audio.test/only.mp3' }], 11);
      await page.reload();
      await waitForTrack(page, 'only');
      assert.equal(await page.locator('[data-music-action="previous"]').isDisabled(), true);
      assert.equal(await page.locator('[data-music-action="next"]').isDisabled(), true);

      music = makeMusic([
        { id: 'working', title: 'working', url: 'https://audio.test/working.mp3' },
        { id: 'manual-broken', title: 'manual broken', url: 'https://audio.test/manual-broken.mp3' },
        { id: 'should-not-jump', title: 'should not jump', url: 'https://audio.test/should-not-jump.mp3' }
      ], 115);
      await page.reload();
      await waitForTrack(page, 'working');
      await page.locator('[data-music-action="next"]').click();
      await waitForTrack(page, 'manual-broken');
      await page.waitForSelector('.site-music-player[data-music-state="error"]');
      assert.equal(await page.locator('.site-music-player').getAttribute('data-track-id'), 'manual-broken');

      music = makeMusic([], 12);
      await page.reload();
      await page.waitForSelector('.site-music-player[data-music-state="empty"]');
      assert.equal(await page.locator('.site-music-title').textContent(), '暂无音乐');

      music = makeMusic([
        { id: 'broken-a', title: '损坏一', url: 'https://audio.test/broken-a.mp3' },
        { id: 'broken-b', title: '损坏二', url: 'https://audio.test/broken-b.mp3' }
      ], 13);
      await page.reload();
      await page.waitForSelector('.site-music-player[data-music-state="error"]');
      assert.equal(await page.locator('.site-music-title').textContent(), '音乐暂时无法播放');
    });

    await t.test('OS player layout and existing desktop features do not regress', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      music = makeMusic([{ id: 'track-a', title: '第一首', url: 'https://audio.test/one.mp3' }], 14);
      await page.goto(`${origin}/os/`, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.getByText('BOOT SEQUENCE', { exact: true }).count(), 0);
      assert.equal(await page.locator('.boot-progress-row #bootProgressValue').count(), 1);
      assert.equal(await page.locator('.boot-progress-row #bootProgressValue').evaluate((element) => element.previousElementSibling?.classList.contains('boot-progress-track')), true);
      assert.ok((await page.locator('.boot-progress-pet-sprite').boundingBox()).width < 72);
      await page.waitForFunction(() => document.querySelector('.boot-progress-pet-sprite')?.dataset.bootPetFrame !== undefined);
      const firstBootPetFrame = await page.locator('.boot-progress-pet-sprite').getAttribute('data-boot-pet-frame');
      await page.waitForFunction((previousFrame) => {
        const currentFrame = document.querySelector('.boot-progress-pet-sprite')?.dataset.bootPetFrame;
        return currentFrame !== undefined && currentFrame !== previousFrame;
      }, firstBootPetFrame, { timeout: 2000 });
      const nextBootPetFrame = await page.locator('.boot-progress-pet-sprite').getAttribute('data-boot-pet-frame');
      assert.notEqual(nextBootPetFrame, firstBootPetFrame);
      await waitForTrack(page, 'track-a');
      await page.waitForSelector('#bootScreen.hidden');
      const playerBox = await page.locator('.site-music-player').boundingBox();
      assert.ok(playerBox.x > 1100);
      assert.ok(playerBox.y < 60);
      assert.ok(playerBox.width >= 129 && playerBox.width <= 131);
      assert.equal(await page.locator('.site-music-play-icon').count(), 0);
      assert.equal(await page.locator('.site-music-play > svg').count(), 1);
      const brandBox = await page.locator('.os-brand').boundingBox();
      const aboutBox = await page.locator('.top-links button').first().boundingBox();
      assert.ok(brandBox.x < aboutBox.x);
      assert.ok(brandBox.x + brandBox.width < aboutBox.x);
      assert.ok(playerBox.x + playerBox.width <= 1440 - 20);
      assert.equal(await page.locator('.site-music-copy').evaluate((element) => getComputedStyle(element).display), 'none');
      assert.deepEqual(
        await page.locator('.site-music-control').evaluateAll((controls) => [...new Set(controls.map((control) => getComputedStyle(control).color))]),
        ['rgb(255, 255, 255)']
      );
      assert.equal(await page.locator('.site-music-play > svg').evaluate((element) => getComputedStyle(element).animationName), 'site-music-play-rotate');
      const osSurfaces = await page.evaluate(() => {
        const surface = (selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            backdropFilter: style.backdropFilter
          };
        };
        const indicator = document.querySelector('#desktopPageSidebar .desktop-page-sidebar-item[aria-current="true"]');
        const indicatorStyle = getComputedStyle(indicator, '::after');
        return {
          search: surface('.desktop-web-search'),
          player: surface('.site-music-player'),
          playButton: surface('.site-music-play'),
          sidebar: surface('#desktopPageSidebar'),
          clock: surface('.desktop-clock'),
          speech: surface('#petSpeech'),
          indicator: {
            backgroundColor: indicatorStyle.backgroundColor,
            boxShadow: indicatorStyle.boxShadow
          }
        };
      });
      assert.deepEqual(osSurfaces.player, osSurfaces.search);
      assert.deepEqual(osSurfaces.sidebar, osSurfaces.search);
      assert.deepEqual(osSurfaces.clock, osSurfaces.search);
      assert.deepEqual(osSurfaces.speech, osSurfaces.search);
      assert.equal(osSurfaces.player.backgroundImage.includes('linear-gradient'), true);
      assert.equal(osSurfaces.playButton.backgroundColor.includes('255'), true);
      assert.equal(osSurfaces.playButton.backgroundImage, 'none');
      assert.equal(osSurfaces.indicator.backgroundColor.includes('255'), true);
      assert.equal(osSurfaces.indicator.boxShadow.includes('255'), true);
      assert.equal(await page.locator('.os-brand-music').count(), 0);
      assert.equal(await page.getByText('轻风雨@universe ~ echo "welcome to my little system"', { exact: true }).count(), 0);
      assert.equal(await page.locator('#desktopPet').count(), 1);
      assert.equal(await page.locator('.site-global-nav').count(), 1);

      const wallpaperState = await page.locator('.desktop').evaluate((element) => {
        const before = getComputedStyle(element, '::before');
        const after = getComputedStyle(element, '::after');
        return {
          backgroundImage: getComputedStyle(element).backgroundImage,
          beforeDisplay: before.display,
          afterDisplay: after.display,
          starsDisplay: getComputedStyle(element.querySelector('.stars')).display,
          auroraDisplay: getComputedStyle(element.querySelector('.aurora')).display
        };
      });
      assert.equal(wallpaperState.backgroundImage.includes('/api/v1/wallpaper/image'), true);
      assert.deepEqual(wallpaperState, {
        backgroundImage: wallpaperState.backgroundImage,
        beforeDisplay: 'none',
        afterDisplay: 'none',
        starsDisplay: 'none',
        auroraDisplay: 'none'
      });

      await page.evaluate(() => document.querySelector('#pageViewport').dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true, cancelable: true })));
      await page.waitForFunction(() => document.body.dataset.page === '1');
      assert.equal(await page.locator('#pageTrack').evaluate((element) => element.style.transform), 'translate3d(0px, -100%, 0px)');
      await page.waitForTimeout(700);
      await page.evaluate(() => document.querySelector('#pageViewport').dispatchEvent(new WheelEvent('wheel', { deltaY: -600, bubbles: true, cancelable: true })));
      await page.waitForFunction(() => document.body.dataset.page === '0');

      const pet = page.locator('#desktopPet');
      const petBox = await pet.boundingBox();
      const petHit = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        const petStyle = getComputedStyle(document.querySelector('#desktopPet'));
        return {
          target: element ? `${element.tagName}#${element.id}.${element.className}` : null,
          isPet: element?.closest('#desktopPet') !== null,
          petPointerEvents: petStyle.pointerEvents,
          petPosition: petStyle.position,
          petRect: document.querySelector('#desktopPet').getBoundingClientRect().toJSON()
        };
      }, {
        x: petBox.x + petBox.width / 2,
        y: petBox.y + petBox.height / 2
      });
      assert.equal(petHit.isPet, true, JSON.stringify(petHit));
      await page.mouse.move(petBox.x + petBox.width / 2, petBox.y + petBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(0, 0, { steps: 5 });
      await page.waitForFunction(() => document.querySelector('#desktopPet')?.dataset.petDragged === 'true');
      await page.mouse.up();
      await page.waitForFunction(() => localStorage.getItem('lightwind-rem-pet-position-v2') === JSON.stringify({ x: 8, y: 54 }));
      assert.deepEqual(await pet.evaluate((element) => ({ left: element.style.left, top: element.style.top })), { left: '8px', top: '54px' });
      const mobilePlayer = await page.locator('.site-music-player').boundingBox();
      const mobileNav = await page.locator('.site-global-nav').boundingBox();
      assert.ok(mobilePlayer.y + mobilePlayer.height < mobileNav.y);
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await t.test('admin manages, previews and reorders the music library', async () => {
      music = makeMusic([
        { id: 'track-a', title: '第一首', url: 'https://audio.test/one.mp3' },
        { id: 'track-b', title: '第二首', url: 'https://audio.test/two.mp3' }
      ], 20);
      await page.goto(`${origin}/admin/`);
      await page.locator('[data-admin-tab="music"]').click();
      await page.waitForSelector('#musicManagerView:not([hidden])');
      assert.equal(await page.locator('[data-music-id]').count(), 2);
      assert.equal(await page.locator('#musicCount').textContent(), '2');

      await page.locator('[data-music-id="track-b"]').dragTo(page.locator('[data-music-id="track-a"]'));
      await page.waitForFunction(() => document.querySelector('[data-music-id]')?.dataset.musicId === 'track-b');

      await page.locator('#addMusicButton').click();
      await page.locator('#musicTitle').fill('第三首');
      await page.locator('#musicUrl').fill('https://audio.test/three.mp3');
      await page.locator('#musicForm [type="submit"]').click();
      await page.waitForFunction(() => document.querySelectorAll('[data-music-id]').length === 3);

      const lastTrack = page.locator('[data-music-id]').last();
      await lastTrack.locator('[data-action="move-music-up"]').click();
      await page.waitForFunction(() => document.querySelectorAll('[data-music-id]')[1]?.dataset.musicId === 'track-3');
      await page.locator('[data-music-id="track-3"] [data-action="preview-music"]').click();
      await page.waitForSelector('#musicPreviewCard[data-preview-state="playing"]');

      await page.locator('[data-music-id="track-3"] [data-action="edit-music"]').click();
      await page.locator('#musicTitle').fill('第三首（已编辑）');
      await page.locator('#musicForm [type="submit"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-music-id] strong')].some((node) => node.textContent === '第三首（已编辑）'));

      await page.locator('[data-music-id="track-3"] [data-action="delete-music"]').click();
      await page.waitForFunction(() => document.querySelectorAll('[data-music-id]').length === 2);
      assert.equal(await page.locator('#musicCount').textContent(), '2');
    });
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
