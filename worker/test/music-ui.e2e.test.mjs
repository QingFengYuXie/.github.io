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
  items: [{ id: 'link-one', type: 'link', title: '示例', url: 'https://example.com', icon: '', color: '#e8d9dc', openMode: 'new' }]
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
  if (pathname === '/dynamic/') {
    return `<div class="title-left"><span class="mobile-page-mark" aria-hidden="true"></span><strong>轻风雨斜 OS</strong></div><div class="title-right"><a href="/search.html" id="buttonSearch" class="btn btn-invisible circle" title="搜索"><svg width="16" height="16"></svg></a><a href="/rss.xml" id="buttonRSS" class="btn btn-invisible circle" title="RSS"><svg width="16" height="16"></svg></a><a class="btn btn-invisible circle" onclick="modeSwitch()" title="切换主题"><svg width="16" height="16"></svg></a></div>`;
  }
  if (pathname === '/about.html') {
    return `<h1 class="postTitle">关于</h1><div class="title-right"><a href="/" id="buttonHome" class="btn btn-invisible circle" title="首页"><svg width="16" height="16"></svg></a><a href="https://github.com/example/issues/3" class="btn btn-invisible circle" title="Issue"><svg width="16" height="16"></svg></a><a class="btn btn-invisible circle" onclick="modeSwitch()" title="切换主题"><svg width="16" height="16"></svg></a></div>`;
  }
  return `<div class="title-right"><a class="btn btn-invisible circle" onclick="modeSwitch()" title="切换主题"><svg width="16" height="16"></svg></a></div>`;
}

function pageFixture(pathname) {
  return `<!doctype html><html lang="zh-CN" data-color-mode="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pathname}</title><link rel="stylesheet" href="/site-nav.css"><style>body{box-sizing:border-box;min-width:200px;max-width:900px;margin:20px auto;padding:45px;font:16px/1.25 sans-serif}#header{display:flex;padding-bottom:8px;border-bottom:1px solid #d0d7de;margin-bottom:16px}.title-left{display:flex;align-items:center;gap:8px;white-space:nowrap}.mobile-page-mark{width:40px;height:40px;border-radius:50%;background:#d0d7de}.postTitle{margin:auto 0;font-size:40px}.title-right{display:flex;margin:auto 0 0 auto}.title-right .circle{box-sizing:border-box;padding:14px 16px;margin-right:8px}.title-right svg{display:block}@media(max-width:600px){body{padding:8px}.title-left strong{display:none}.postTitle{font-size:24px}}</style></head><body><header id="header">${titleActionsFixture(pathname)}</header><main id="content"><h2>${pathname}</h2></main><span id="busuanzi_value_site_pv" hidden>12345</span><script>function modeSwitch(){}</script><script src="/site-nav.js"></script></body></html>`;
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

      if (pathname === '/dynamic/' || pathname === '/about.html' || pathname === '/search.html' || pathname.startsWith('/dynamic/post/')) {
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
      assert.deepEqual(await page.locator('.title-right').evaluate((actions) => [...actions.children].map((element) => {
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
      assert.ok((await page.locator('.site-music-player').boundingBox()).width <= 120);
      assert.equal(await page.locator('.site-music-copy').evaluate((element) => getComputedStyle(element).display), 'none');
      assert.equal(await page.locator('.site-music-play').evaluate((element) => getComputedStyle(element).borderColor), 'rgb(9, 105, 218)');
      assert.equal(await page.locator('.site-music-play-icon').count(), 0);
      assert.equal(await page.locator('.site-music-play > span').count(), 1);
      assert.equal(await page.locator('.site-music-play > span').evaluate((element) => getComputedStyle(element).animationName), 'site-music-play-rotate');
      await page.locator('[data-music-action="play"]').click();
      await page.waitForSelector('.site-music-player[data-music-state="paused"]');
      assert.equal(await page.locator('.site-music-play > span').evaluate((element) => getComputedStyle(element).animationName), 'none');
      await page.locator('[data-music-action="play"]').click();
      await page.waitForSelector('.site-music-player[data-music-state="playing"]');

      await page.locator('[data-music-action="next"]').click();
      await waitForTrack(page, 'track-b');
      await page.locator('[data-music-action="next"]').click();
      await waitForTrack(page, 'track-a');
      await page.locator('[data-music-action="previous"]').click();
      await waitForTrack(page, 'track-b');
      await page.locator('.site-background-audio').evaluate((audio) => { audio.currentTime = 37.5; });
      await page.locator('.site-global-nav a[href="/about.html"]').click();
      await waitForTrack(page, 'track-b');
      await page.waitForFunction(() => Math.abs(document.querySelector('.site-background-audio').currentTime - 37.5) < 0.1);
      assert.deepEqual(await page.locator('.title-right').evaluate((actions) => [...actions.children].map((element) => {
        if (element.id === 'buttonHome') return 'home';
        if (element.getAttribute('title') === 'Issue') return 'issue';
        if (element.matches('[onclick*="modeSwitch"]')) return 'theme';
        if (element.classList.contains('site-music-player')) return 'music';
        return 'other';
      })), ['home', 'issue', 'theme', 'music']);
      assert.equal(await page.locator('.site-music-player').evaluate((element) => element.parentElement?.classList.contains('title-right')), true);
      assert.equal(await page.locator('.title-right a[onclick*="modeSwitch"]').count(), 1);

      for (const route of ['/search.html', '/dynamic/post/test.html']) {
        await page.goto(`${origin}${route}`);
        await waitForTrack(page, 'track-b');
        assert.equal(await page.locator('.site-music-player').evaluate((element) => getComputedStyle(element).left), '72px');
      }

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

      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 667 }]) {
        await page.setViewportSize(viewport);
        for (const route of ['/dynamic/', '/about.html']) {
          await page.goto(`${origin}${route}`);
          await waitForTrack(page, 'track-b');
          await page.waitForFunction(() => document.querySelector('.site-visit-count')?.textContent === '12345');
          const layout = await page.evaluate(() => {
            const actions = document.querySelector('.title-right');
            const header = document.querySelector('#header');
            const player = document.querySelector('.site-music-player');
            const stats = document.querySelector('.site-visit-stats');
            const theme = document.querySelector('.title-right a[onclick*="modeSwitch"]');
            const rect = (element) => {
              const box = element.getBoundingClientRect();
              return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
            };
            return {
              actions: rect(actions),
              header: rect(header),
              player: rect(player),
              stats: rect(stats),
              theme: rect(theme),
              firstElementIsStats: document.body.firstElementChild === stats,
              playerParentIsActions: player.parentElement === actions,
              playerPosition: getComputedStyle(player).position,
              themePosition: getComputedStyle(theme).position,
              statsWhiteSpace: getComputedStyle(stats).whiteSpace,
              statsFits: stats.scrollWidth <= stats.clientWidth,
              themeCount: document.querySelectorAll('.title-right a[onclick*="modeSwitch"]').length,
              viewportWidth: window.innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              order: [...actions.children].map((element) => {
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
          const expectedOrder = route === '/dynamic/'
            ? ['search', 'rss', 'theme', 'music']
            : ['home', 'issue', 'theme', 'music'];
          assert.deepEqual(layout.order, expectedOrder, `${route} ${viewport.width}px action order`);
          assert.equal(layout.themeCount, 1);
          assert.equal(layout.playerParentIsActions, true);
          assert.equal(layout.playerPosition, 'static');
          assert.equal(layout.themePosition, 'static');
          assert.equal(layout.statsWhiteSpace, 'nowrap');
          assert.equal(layout.statsFits, true);
          assert.equal(layout.firstElementIsStats, true);
          assert.ok(layout.stats.top <= 4.5, `${route} ${viewport.width}px stats top ${layout.stats.top}`);
          assert.ok(layout.stats.bottom <= layout.header.top, `${route} ${viewport.width}px stats overlap header`);
          assert.ok(layout.actions.left >= -0.5 && layout.actions.right <= layout.viewportWidth + 0.5, `${route} ${viewport.width}px actions overflow`);
          assert.ok(layout.player.left > layout.theme.left, `${route} ${viewport.width}px player order`);
          assert.ok(layout.documentWidth <= layout.viewportWidth, `${route} ${viewport.width}px horizontal overflow`);
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
      music = makeMusic([{ id: 'track-a', title: '第一首', url: 'https://audio.test/one.mp3' }], 14);
      await page.goto(`${origin}/os/`, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.getByText('BOOT SEQUENCE', { exact: true }).count(), 0);
      assert.equal(await page.locator('.boot-progress-row #bootProgressValue').count(), 1);
      assert.equal(await page.locator('.boot-progress-row #bootProgressValue').evaluate((element) => element.previousElementSibling?.classList.contains('boot-progress-track')), true);
      assert.ok((await page.locator('.boot-progress-pet-sprite').boundingBox()).width < 72);
      await page.waitForFunction(() => document.querySelector('.boot-progress-pet-sprite')?.dataset.bootPetFrame !== undefined);
      const firstBootPetFrame = await page.locator('.boot-progress-pet-sprite').getAttribute('data-boot-pet-frame');
      await page.waitForTimeout(130);
      const nextBootPetFrame = await page.locator('.boot-progress-pet-sprite').getAttribute('data-boot-pet-frame');
      assert.notEqual(nextBootPetFrame, firstBootPetFrame);
      await waitForTrack(page, 'track-a');
      const playerBox = await page.locator('.site-music-player').boundingBox();
      assert.ok(playerBox.x > 1100);
      assert.ok(playerBox.y < 60);
      assert.ok(playerBox.width <= 114);
      assert.equal(await page.locator('.site-music-play-icon').count(), 0);
      assert.equal(await page.locator('.site-music-play > span').count(), 1);
      const brandBox = await page.locator('.os-brand').boundingBox();
      assert.ok(playerBox.x + playerBox.width < brandBox.x);
      assert.equal(await page.locator('.site-music-copy').evaluate((element) => getComputedStyle(element).display), 'none');
      assert.equal(await page.locator('.site-music-play > span').evaluate((element) => getComputedStyle(element).animationName), 'site-music-play-rotate');
      assert.equal(await page.locator('.os-brand-music').count(), 0);
      assert.equal(await page.getByText('轻风雨@universe ~ echo "welcome to my little system"', { exact: true }).count(), 0);
      assert.equal(await page.locator('#desktopPet').count(), 1);
      assert.equal(await page.locator('.site-global-nav').count(), 1);

      await page.setViewportSize({ width: 390, height: 844 });
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
