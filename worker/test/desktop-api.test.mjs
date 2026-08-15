import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { hashPassword } from '../src/security.js';

const workerRoot = fileURLToPath(new URL('..', import.meta.url));
const origin = 'http://localhost';

async function responseJson(response) {
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function layoutFor(desktop, topLevel = desktop.items) {
  return {
    version: desktop.version,
    topLevel: topLevel.map((item) => ({ id: item.id, type: item.type })),
    folders: Object.fromEntries(
      desktop.items
        .filter((item) => item.type === 'folder')
        .map((folder) => [folder.id, folder.links.map((link) => link.id)])
    )
  };
}

test('desktop layout rejects stale versions without overwriting the latest order', async () => {
  const credential = await hashPassword('test-admin-password', 100000);
  const [indexSource, securitySource, validationSource, faviconSource] = await Promise.all([
    readFile(`${workerRoot}/src/index.js`, 'utf8'),
    readFile(`${workerRoot}/src/security.js`, 'utf8'),
    readFile(`${workerRoot}/src/validation.js`, 'utf8'),
    readFile(`${workerRoot}/src/favicon.js`, 'utf8')
  ]);
  const miniflare = new Miniflare({
    workers: [{
      config: {
        type: 'worker',
        name: 'lightwind-desktop-test',
        compatibilityDate: '2026-08-14',
        manifest: {
          mainModule: 'index.js',
          modulesRoot: `${workerRoot}/src`,
          modules: {
            'index.js': { type: 'esm', contents: indexSource },
            'security.js': { type: 'esm', contents: securitySource },
            'validation.js': { type: 'esm', contents: validationSource },
            'favicon.js': { type: 'esm', contents: faviconSource }
          }
        },
        env: {
          DB: { type: 'd1', id: 'test-desktop-db' },
          ADMIN_USERNAME: { type: 'text', value: 'qingfengyu' },
          ALLOWED_ORIGIN: { type: 'text', value: origin },
          INITIAL_ADMIN_CREDENTIAL: { type: 'text', value: credential }
        }
      }
    }]
  });

  try {
    const database = await miniflare.getD1Database('DB');
    const sql = await readFile(`${workerRoot}/migrations/0001_initial.sql`, 'utf8');
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }

    const initial = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/desktop`));
    assert.equal(initial.response.status, 200);

    const fallbackFavicon = await miniflare.dispatchFetch(`${origin}/api/v1/favicons/link-contact`);
    assert.equal(fallbackFavicon.status, 200);
    assert.match(fallbackFavicon.headers.get('content-type'), /^image\/svg\+xml/);
    assert.equal(fallbackFavicon.headers.get('x-favicon-fallback'), '1');

    const rejectedFaviconMethod = await responseJson(await miniflare.dispatchFetch(
      `${origin}/api/v1/favicons/link-contact`,
      { method: 'POST' }
    ));
    assert.equal(rejectedFaviconMethod.response.status, 405);

    const login = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'qingfengyu', password: 'test-admin-password' })
    }));
    assert.equal(login.response.status, 200);
    const authHeaders = {
      origin,
      cookie: login.response.headers.get('set-cookie').split(';')[0],
      'content-type': 'application/json',
      'x-csrf-token': login.payload.csrfToken
    };

    const newestTopLevel = [...initial.payload.items].reverse();
    const saved = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/layout`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(layoutFor(initial.payload, newestTopLevel))
    }));
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.desktop.version, initial.payload.version + 1);
    assert.deepEqual(saved.payload.desktop.items.map((item) => item.id), newestTopLevel.map((item) => item.id));

    const stale = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/layout`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(layoutFor(initial.payload))
    }));
    assert.equal(stale.response.status, 409);
    assert.equal(stale.payload.code, 'DESKTOP_VERSION_CONFLICT');

    const current = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/desktop`));
    assert.deepEqual(current.payload.items.map((item) => item.id), newestTopLevel.map((item) => item.id));

    const missingVersion = layoutFor(current.payload);
    delete missingVersion.version;
    const invalid = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/layout`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(missingVersion)
    }));
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.payload.code, 'INVALID_LAYOUT_VERSION');
  } finally {
    await miniflare.dispose();
  }
});