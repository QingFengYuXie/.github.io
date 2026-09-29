import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const edgeExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../static');
const settingsKey = 'lightwind-serial-settings-v1';
const canRunEdge = process.platform === 'win32' && existsSync(edgeExecutable);

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><html lang="zh-CN"><title>我的 OS</title><h1>我的 OS</h1></html>');
        return;
      }
      const relativePath = pathname === '/serial/' || pathname === '/serial'
        ? 'serial/index.html'
        : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(staticRoot, relativePath);
      if (!filePath.startsWith(`${staticRoot}${path.sep}`)) throw new Error('Unsafe test path');
      const body = await readFile(filePath);
      const extension = path.extname(filePath);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function installSerialShim(context, { unsupported = false, insecure = false, storedSettings } = {}) {
  await context.addInitScript(({ unsupported, insecure, storedSettings, settingsKey }) => {
    if (insecure) Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    if (storedSettings !== undefined && !sessionStorage.getItem('__serial_storage_seeded')) {
      localStorage.setItem(settingsKey, storedSettings);
      sessionStorage.setItem('__serial_storage_seeded', '1');
    }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { window.__copiedSerialText = value; } }
    });
    if (unsupported) {
      delete Navigator.prototype.serial;
      Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined });
      return;
    }

    class FakePort extends EventTarget {
      constructor() {
        super();
        this.readable = null;
        this.writable = null;
        this.openCalls = [];
        this.closeCalls = 0;
        this.writes = [];
        this.receiver = null;
        this.writeDelay = 0;
      }
      getInfo() { return { usbVendorId: 0x303a, usbProductId: 0x1001 }; }
      async open(options) {
        if (this.readable || this.writable) throw new DOMException('Port already open', 'InvalidStateError');
        this.openCalls.push({ ...options });
        if (window.__serial.openReject) throw new DOMException('Simulated open failure', window.__serial.openReject);
        this.readable = new ReadableStream({
          start: (controller) => { this.receiver = controller; },
          cancel: () => { this.receiver = null; }
        });
        this.writable = new WritableStream({
          write: async (bytes) => {
            if (this.writeDelay) await new Promise((resolve) => setTimeout(resolve, this.writeDelay));
            this.writes.push(Array.from(bytes));
          }
        });
      }
      async close() {
        if (this.readable?.locked || this.writable?.locked) throw new DOMException('Stream still locked', 'InvalidStateError');
        this.closeCalls += 1;
        if (window.__serial.closeReject) throw new DOMException('Simulated close failure', window.__serial.closeReject);
        this.readable = null;
        this.writable = null;
        this.receiver = null;
      }
      receive(bytes) {
        if (!this.receiver) throw new Error('Port is not reading');
        this.receiver.enqueue(Uint8Array.from(bytes));
      }
    }

    const port = new FakePort();
    const serial = new EventTarget();
    serial.getPorts = async () => [port];
    serial.requestPort = async () => {
      window.__serial.requestCalls += 1;
      if (window.__serial.cancelRequest) throw new DOMException('User cancelled', 'NotFoundError');
      return port;
    };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: serial });
    window.__serial = {
      port,
      requestCalls: 0,
      cancelRequest: false,
      openReject: null,
      closeReject: null,
      receive: (bytes) => port.receive(bytes),
      event: (type, target = port) => {
        const event = new Event(type);
        Object.defineProperty(event, 'port', { value: target });
        Object.defineProperty(event, 'target', { value: target });
        serial.dispatchEvent(event);
      }
    };
  }, { unsupported, insecure, storedSettings, settingsKey });
}

async function openPort(page) {
  await page.click('#serial-select-port');
  await page.click('#serial-open-or-close');
  await page.waitForFunction(() => !document.getElementById('serial-send').disabled);
}

async function setField(page, selector, value) {
  await page.locator(selector).fill(String(value));
  await page.locator(selector).dispatchEvent('change');
}

async function receiveText(page, text) {
  await page.evaluate((value) => window.__serial.receive(Array.from(new TextEncoder().encode(value))), text);
}

async function waitForWrites(page, count) {
  await page.waitForFunction((expected) => window.__serial.port.writes.length >= expected, count);
}

async function clearLogs(page) {
  if (await page.locator('#serial-clear').isEnabled()) await page.click('#serial-clear');
}

test('Edge serial terminal UI and simulated serial I/O', { skip: !canRunEdge, timeout: 120_000 }, async (t) => {
  const { chromium } = await import('playwright-core');
  const { server, origin } = await startServer();
  const browser = await chromium.launch({ executablePath: edgeExecutable, headless: true });

  async function withPage(options, callback) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await installSerialShim(context, options);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/serial/`);
      await page.waitForSelector('#serial-send-content');
      await callback(page, context);
      assert.deepEqual(errors, [], 'The serial page must not produce uncaught errors');
    } finally {
      await context.close();
    }
  }

  try {
    await t.test('unsupported browser explains requirements and keeps return navigation usable', async () => {
      await withPage({ unsupported: true }, async (page) => {
        await page.waitForFunction(() => document.getElementById('serial-select-port').disabled);
        assert.equal(await page.locator('#serial-send').isDisabled(), true);
        assert.match(await page.locator('body').innerText(), /Chrome|Edge|HTTPS/);
        await page.click('#serial-back');
        await page.waitForURL(`${origin}/`);
      });
    });

    await t.test('insecure context explains HTTPS without requesting or opening any port', async () => {
      await withPage({ insecure: true }, async (page) => {
        await page.waitForFunction(() => document.getElementById('serial-select-port').disabled);
        assert.equal(await page.locator('#serial-open-or-close').isDisabled(), true);
        assert.equal(await page.locator('#serial-send').isDisabled(), true);
        assert.match(await page.locator('#serial-message').innerText(), /HTTPS.*localhost/);
        assert.equal(await page.evaluate(() => window.__serial.requestCalls), 0);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 0);
      });
    });

    await t.test('damaged saved settings fall back, settings persist, and reload never opens a port', async () => {
      await withPage({ storedSettings: '{broken json' }, async (page) => {
        assert.equal(await page.locator('#serial-baud').inputValue(), '115200');
        assert.equal(await page.locator('#serial-data-bits').inputValue(), '8');
        assert.equal(await page.locator('#serial-stop-bits').inputValue(), '1');
        assert.equal(await page.locator('#serial-buffer-size').inputValue(), '1024');
        assert.equal(await page.locator('#serial-loop-send').isChecked(), false);
        assert.equal(await page.locator('#serial-loop-send').isDisabled(), true);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 0);
        await setField(page, '#serial-baud', '9600');
        await page.selectOption('#serial-data-bits', '7');
        await page.selectOption('#serial-parity', 'even');
        await page.selectOption('#serial-log-type', 'text');
        await setField(page, '#serial-send-content', '已保存的内容');
        await page.locator('#serial-add-crlf').check();
        await page.reload();
        assert.equal(await page.locator('#serial-baud').inputValue(), '9600');
        assert.equal(await page.locator('#serial-data-bits').inputValue(), '7');
        assert.equal(await page.locator('#serial-parity').inputValue(), 'even');
        assert.equal(await page.locator('#serial-log-type').inputValue(), 'text');
        assert.equal(await page.locator('#serial-send-content').inputValue(), '已保存的内容');
        assert.equal(await page.locator('#serial-add-crlf').isChecked(), true);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 0);
        assert.equal(await page.locator('#serial-tools, #serial-code-content, #serial-quick-send').count(), 0);
        assert.equal(await page.locator('script[src*="http"], link[href*="http"]').count(), 0);
      });
    });

    await t.test('opening uses settings, text and HEX send exact bytes, malformed HEX never writes', async () => {
      await withPage({}, async (page) => {
        await setField(page, '#serial-baud', '57600');
        await openPort(page);
        assert.equal(await page.evaluate(() => window.__serial.requestCalls), 1);
        assert.deepEqual(await page.evaluate(() => window.__serial.port.openCalls[0]), {
          baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none', bufferSize: 1024, flowControl: 'none'
        });
        await setField(page, '#serial-send-content', '你好');
        await page.locator('#serial-add-crlf').check();
        await page.click('#serial-send');
        await waitForWrites(page, 1);
        assert.deepEqual(await page.evaluate(() => window.__serial.port.writes[0]), [228, 189, 160, 229, 165, 189, 13, 10]);
        await page.locator('#serial-hex-send').check();
        await setField(page, '#serial-send-content', '00 ff 4A');
        await page.click('#serial-send');
        await waitForWrites(page, 2);
        assert.deepEqual(await page.evaluate(() => window.__serial.port.writes[1]), [0, 255, 74, 13, 10]);
        await setField(page, '#serial-send-content', 'abc');
        await page.click('#serial-send');
        await page.waitForFunction(() => /HEX|十六进制|偶数/.test(document.getElementById('serial-message').textContent));
        assert.equal(await page.evaluate(() => window.__serial.port.writes.length), 2);
        await page.click('#serial-open-or-close');
        await page.waitForFunction(() => document.getElementById('serial-send').disabled && window.__serial.port.closeCalls === 1);
        assert.equal(await page.evaluate(() => window.__serial.port.readable), null);
      });
    });

    await t.test('cancel and failed open recover, and connection events never reopen after failure or manual close', async () => {
      await withPage({}, async (page) => {
        await page.evaluate(() => { window.__serial.cancelRequest = true; });
        await page.click('#serial-select-port');
        await page.waitForFunction(() => document.getElementById('serial-message').textContent.includes('取消'));
        assert.equal(await page.locator('#serial-select-port').isEnabled(), true);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 0);

        await page.evaluate(() => {
          window.__serial.cancelRequest = false;
          window.__serial.openReject = 'NetworkError';
        });
        await page.click('#serial-select-port');
        await page.click('#serial-open-or-close');
        await page.waitForFunction(() => document.getElementById('serial-message').textContent.includes('无法访问串口'));
        assert.equal(await page.locator('#serial-send').isDisabled(), true);
        assert.equal(await page.locator('#serial-open-or-close').isEnabled(), true);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 1);
        await page.evaluate(() => window.__serial.event('connect'));
        await page.waitForTimeout(80);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 1);

        await page.evaluate(() => { window.__serial.openReject = null; });
        await page.click('#serial-open-or-close');
        await page.waitForFunction(() => !document.getElementById('serial-send').disabled);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 2);
        await setField(page, '#serial-send-content', 'recovered');
        await page.click('#serial-send');
        await waitForWrites(page, 1);
        await page.click('#serial-open-or-close');
        await page.waitForFunction(() => document.getElementById('serial-send').disabled && window.__serial.port.closeCalls === 1);
        await page.evaluate(() => window.__serial.event('connect'));
        await page.waitForTimeout(80);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 2);
        assert.equal(await page.locator('#serial-send').isDisabled(), true);
      });
    });

    await t.test('changing parameters while connected awaits close and reopens with saved settings', async () => {
      await withPage({}, async (page) => {
        await openPort(page);
        await setField(page, '#serial-baud', '230400');
        await page.waitForFunction(() => window.__serial.port.openCalls.length === 2 && !document.getElementById('serial-send').disabled);
        assert.equal(await page.evaluate(() => window.__serial.port.closeCalls), 1);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls[1].baudRate), 230400);
        const savedBaud = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).serialOptions.baudRate, settingsKey);
        assert.equal(savedBaud, 230400);
        await setField(page, '#serial-send-content', 'after change');
        await page.click('#serial-send');
        await waitForWrites(page, 1);
        assert.deepEqual(await page.evaluate(() => window.__serial.port.writes[0]), [...Buffer.from('after change')]);
      });
    });

    await t.test('log formats, safe ANSI, clipboard, download and clearing work without right tools', async () => {
      await withPage({}, async (page) => {
        await openPort(page);
        await setField(page, '#serial-timer-out', '0');
        for (const mode of ['hex&text', 'hex', 'text', 'ansi']) {
          await page.selectOption('#serial-log-type', mode);
          await clearLogs(page);
          const payload = mode === 'ansi' ? '\x1b[31mRED\x1b[0m<img src=x onerror="window.__serialXss=true">' : 'hello';
          await receiveText(page, payload);
          const row = page.locator('.log-entry[data-direction="rx"]').last();
          await row.waitFor();
          if (mode.includes('hex')) assert.equal(await row.locator('.log-hex').isVisible(), true);
          if (mode.includes('text') || mode === 'ansi') assert.equal(await row.locator('.log-text').isVisible(), true);
          if (mode === 'ansi') {
            assert.match(await row.innerText(), /RED<img src=x/);
            assert.equal(await row.locator('img').count(), 0);
            assert.equal(await page.evaluate(() => window.__serialXss), undefined);
            assert.ok(await row.locator('[style*="color"]').count() > 0, 'ANSI colors remain visible');
          }
        }
        await page.click('#serial-copy');
        await page.waitForFunction(() => window.__copiedSerialText?.includes('RED'));
        const downloadPromise = page.waitForEvent('download');
        await page.click('#serial-save');
        const download = await downloadPromise;
        assert.match(download.suggestedFilename(), /\.log$|\.txt$/);
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        assert.match(Buffer.concat(chunks).toString('utf8'), /RED/);
        await clearLogs(page);
        assert.equal(await page.locator('.log-entry').count(), 0);
      });
    });

    await t.test('UTF-8 survives split reads and receive timeout merges adjacent chunks', async () => {
      await withPage({}, async (page) => {
        await openPort(page);
        await page.selectOption('#serial-log-type', 'text');
        await setField(page, '#serial-timer-out', '0');
        await clearLogs(page);
        for (const bytes of [[0xe4], [0xbd], [0xa0, 0xe5], [0xa5, 0xbd]]) {
          await page.evaluate((value) => window.__serial.receive(value), bytes);
        }
        await page.waitForFunction(() => [...document.querySelectorAll('.log-entry[data-direction="rx"] .log-text')].map((item) => item.textContent).join('').includes('你好'));
        assert.doesNotMatch(await page.locator('#serial-logs').innerText(), /�/);
        await setField(page, '#serial-timer-out', '100');
        await clearLogs(page);
        await page.evaluate(() => {
          window.__serial.receive([65]);
          window.__serial.receive([66]);
        });
        await page.waitForFunction(() => document.querySelector('.log-entry[data-direction="rx"] .log-text')?.textContent.includes('AB'));
        assert.equal(await page.locator('.log-entry[data-direction="rx"]').count(), 1);
      });
    });

    await t.test('ANSI recovers from malformed and oversized unfinished sequences while preserving valid split colors', async () => {
      await withPage({}, async (page) => {
        await openPort(page);
        await page.selectOption('#serial-log-type', 'ansi');
        await setField(page, '#serial-timer-out', '0');
        await clearLogs(page);

        await receiveText(page, '\x1b[\ufffd');
        await receiveText(page, 'RECOVER');
        await page.waitForFunction(() => document.getElementById('serial-logs').textContent.includes('RECOVER'));

        await receiveText(page, `\x1b]8;;${'x'.repeat(5000)}`);
        await receiveText(page, '\x1b[32mRECOVERED\x1b[0m<img src=x>');
        await page.waitForFunction(() => [...document.querySelectorAll('.log-text [style*="color"]')].some((item) => item.textContent.includes('RECOVERED')));
        assert.match(await page.locator('#serial-logs').innerText(), /RECOVERED<img src=x>/);
        assert.equal(await page.locator('#serial-logs img').count(), 0);

        await clearLogs(page);
        await receiveText(page, '\x1b[3');
        await receiveText(page, '1mRED\x1b[0m');
        await page.waitForFunction(() => [...document.querySelectorAll('.log-text [style*="color"]')].some((item) => item.textContent === 'RED'));
        assert.match(await page.locator('#serial-logs').innerText(), /RED/);
      });
    });

    await t.test('timed sends stop on close and remain stopped when reloaded or opened again', async () => {
      await withPage({}, async (page) => {
        await openPort(page);
        await setField(page, '#serial-send-content', 'tick');
        await setField(page, '#serial-loop-send-time', '25');
        await page.locator('#serial-loop-send').check();
        await waitForWrites(page, 3);
        await page.click('#serial-open-or-close');
        await page.waitForFunction(() => document.getElementById('serial-send').disabled && window.__serial.port.closeCalls === 1);
        const count = await page.evaluate(() => window.__serial.port.writes.length);
        await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => window.__serial.port.writes.length), count);
        assert.equal(await page.locator('#serial-loop-send').isChecked(), false);
        await page.click('#serial-open-or-close');
        await page.waitForFunction(() => !document.getElementById('serial-send').disabled);
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => window.__serial.port.writes.length), count);
        await page.reload();
        assert.equal(await page.locator('#serial-loop-send').isChecked(), false);
        assert.equal(await page.evaluate(() => window.__serial.port.openCalls.length), 0);
        await page.click('#serial-back');
        await page.waitForURL(`${origin}/`);
      });
    });

    await t.test('desktop fits one viewport with sidebar heading, independently scrolling dark logs and readable ANSI', async () => {
      await withPage({}, async (page) => {
        const viewports = [
          { width: 1440, height: 900 },
          { width: 1366, height: 768 },
          { width: 1280, height: 720 },
          { width: 1024, height: 600 },
          { width: 801, height: 600 }
        ];
        async function assertCompactLayout(state) {
          const layout = await page.evaluate(() => {
            const bounds = (element) => {
              const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
              return { top, bottom, left, right, width, height };
            };
            const sidebar = document.querySelector('.settings-panel');
            const terminal = document.querySelector('.terminal-panel');
            const controls = ['serial-back', 'serial-port-list', 'serial-select-port', 'serial-baud',
              'serial-data-bits', 'serial-stop-bits', 'serial-parity', 'serial-buffer-size',
              'serial-flow-control', 'serial-open-or-close', 'serial-send-content', 'serial-send'];
            return {
              viewport: { width: innerWidth, height: innerHeight },
              documentWidth: document.documentElement.scrollWidth,
              documentHeight: document.documentElement.scrollHeight,
              documentTop: document.scrollingElement.scrollTop,
              sidebar: bounds(sidebar),
              terminal: bounds(terminal),
              sidebarOverflow: sidebar.scrollHeight - sidebar.clientHeight,
              sidebarTop: sidebar.scrollTop,
              terminalTop: terminal.scrollTop,
              headingInSidebar: ['#serial-back', '.page-header', '.page-header h1', '#connection-state']
                .every((selector) => sidebar.contains(document.querySelector(selector))),
              controls: controls.map((id) => ({ id, ...bounds(document.getElementById(id)) }))
            };
          });
          const label = `${state} at ${layout.viewport.width}×${layout.viewport.height}`;
          assert.ok(layout.documentWidth <= layout.viewport.width, `${label}: document overflows horizontally`);
          assert.ok(layout.documentHeight <= layout.viewport.height + 1, `${label}: document overflows vertically (${layout.documentHeight})`);
          assert.equal(layout.documentTop, 0, `${label}: document unexpectedly scrolled`);
          assert.equal(layout.headingInSidebar, true, `${label}: page heading, return link and status belong inside the sidebar`);
          assert.ok(Math.abs(layout.sidebar.top - layout.terminal.top) <= 1, `${label}: panel tops must align`);
          assert.ok(layout.sidebarOverflow <= 1, `${label}: settings must remain visible without scrolling`);
          assert.equal(layout.sidebarTop, 0, `${label}: sidebar unexpectedly scrolled`);
          assert.equal(layout.terminalTop, 0, `${label}: terminal wrapper unexpectedly scrolled`);
          for (const [name, box] of Object.entries({ sidebar: layout.sidebar, terminal: layout.terminal })) {
            assert.ok(box.top >= -1 && box.bottom <= layout.viewport.height + 1, `${label}: ${name} is clipped vertically`);
            assert.ok(box.left >= -1 && box.right <= layout.viewport.width + 1, `${label}: ${name} is clipped horizontally`);
          }
          for (const box of layout.controls) {
            assert.ok(box.width > 0 && box.height > 0, `${label}: ${box.id} has no visible area`);
            assert.ok(box.top >= -1 && box.bottom <= layout.viewport.height + 1, `${label}: ${box.id} is below or above the viewport`);
            assert.ok(box.left >= -1 && box.right <= layout.viewport.width + 1, `${label}: ${box.id} is outside the viewport horizontally`);
            const panel = box.id.startsWith('serial-send') ? layout.terminal : layout.sidebar;
            assert.ok(box.top >= panel.top && box.bottom <= panel.bottom + 1, `${label}: ${box.id} is clipped by its panel`);
          }
        }
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          await assertCompactLayout('initial');
          await page.evaluate(() => { window.__serial.cancelRequest = true; });
          await page.click('#serial-select-port');
          await page.waitForFunction(() => !document.getElementById('serial-message').hidden);
          assert.match(await page.locator('#serial-message').innerText(), /取消/);
          await assertCompactLayout('with notice');
        }
        await page.emulateMedia({ colorScheme: 'dark' });
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');
        assert.equal(await page.locator('#log-viewport').isVisible(), true);
        assert.equal(await page.locator('#log-viewport').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(16, 23, 34)');
        await page.evaluate(() => { window.__serial.cancelRequest = false; });
        await openPort(page);
        await page.selectOption('#serial-log-type', 'text');
        await setField(page, '#serial-timer-out', '0');
        await receiveText(page, Array.from({ length: 160 }, (_, index) => `FRAME ${index}: serial data remains inside the terminal\n`).join(''));
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          await page.waitForFunction(() => {
            const logs = document.getElementById('log-viewport');
            return logs.scrollHeight > logs.clientHeight + 100;
          });
          await page.locator('#log-viewport').evaluate((element) => { element.scrollTop = 0; });
          await page.locator('#log-viewport').hover();
          await page.mouse.wheel(0, 400);
          await page.waitForFunction(() => document.getElementById('log-viewport').scrollTop > 0);
          await assertCompactLayout('with scrolling logs');
        }
        await clearLogs(page);
        await page.selectOption('#serial-log-type', 'ansi');
        await receiveText(page, '\x1b[93mYELLOW\x1b[97mWHITE\x1b[30mBLACK\x1b[34mDEEPBLUE\x1b[0m');
        await page.waitForFunction(() => document.getElementById('serial-logs').textContent.includes('YELLOWWHITEBLACKDEEPBLUE'));
        const contrasts = await page.evaluate(() => {
          const spans = [...document.querySelectorAll('.log-text [style*="color"]')];
          const luminance = (color) => {
            const linear = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
              const srgb = channel / 255;
              return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
            });
            return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
          };
          const surface = luminance(getComputedStyle(document.getElementById('log-viewport')).backgroundColor);
          return ['YELLOW', 'WHITE', 'BLACK', 'DEEPBLUE'].map((text) => {
            const span = spans.find((item) => item.textContent === text);
            if (!span) throw new Error(`Missing ANSI foreground for ${text}`);
            const foreground = luminance(getComputedStyle(span).color);
            return { text, ratio: (Math.max(surface, foreground) + 0.05) / (Math.min(surface, foreground) + 0.05) };
          });
        });
        for (const { text, ratio } of contrasts) assert.ok(ratio >= 4.5, `${text} contrast on the log surface was ${ratio}`);
      });
    });

    await t.test('return navigation completes even when releasing the device reports a close failure', async () => {
      await withPage({}, async (page) => {
        await openPort(page);
        await page.evaluate(() => { window.__serial.closeReject = 'NetworkError'; });
        await page.click('#serial-back');
        await page.waitForURL(`${origin}/`);
      });
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
