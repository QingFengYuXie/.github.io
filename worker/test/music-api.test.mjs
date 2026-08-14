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

test('music API supports public reads and authenticated CRUD with ordering', async () => {
  const credential = await hashPassword('test-admin-password', 100000);
  const [indexSource, securitySource, validationSource] = await Promise.all([
    readFile(`${workerRoot}/src/index.js`, 'utf8'),
    readFile(`${workerRoot}/src/security.js`, 'utf8'),
    readFile(`${workerRoot}/src/validation.js`, 'utf8')
  ]);
  const miniflare = new Miniflare({
    workers: [{
      config: {
        type: 'worker',
        name: 'lightwind-music-test',
        compatibilityDate: '2026-08-14',
        manifest: {
          mainModule: 'index.js',
          modulesRoot: `${workerRoot}/src`,
          modules: {
            'index.js': { type: 'esm', contents: indexSource },
            'security.js': { type: 'esm', contents: securitySource },
            'validation.js': { type: 'esm', contents: validationSource }
          }
        },
        env: {
          DB: { type: 'd1', id: 'test-music-db' },
          ADMIN_USERNAME: { type: 'text', value: 'qingfengyu' },
          ALLOWED_ORIGIN: { type: 'text', value: origin },
          INITIAL_ADMIN_CREDENTIAL: { type: 'text', value: credential }
        }
      }
    }]
  });

  try {
    const database = await miniflare.getD1Database('DB');
    for (const migration of ['0001_initial.sql', '0002_music_library.sql']) {
      const sql = await readFile(`${workerRoot}/migrations/${migration}`, 'utf8');
      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
        await database.prepare(statement).run();
      }
    }

    let result = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/music`));
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.tracks.length, 1);
    assert.equal(result.payload.tracks[0].id, 'track-default');
    const initialEtag = result.response.headers.get('etag');
    assert.ok(initialEtag);

    result = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/music`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ title: '未登录音乐', url: '/unauthorized.mp3' })
    }));
    assert.equal(result.response.status, 401);

    const login = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'qingfengyu', password: 'test-admin-password' })
    }));
    assert.equal(login.response.status, 200);
    const cookie = login.response.headers.get('set-cookie').split(';')[0];
    const authHeaders = {
      origin,
      cookie,
      'content-type': 'application/json',
      'x-csrf-token': login.payload.csrfToken
    };

    result = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/music`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: '测试音乐', url: 'https://example.com/test.mp3' })
    }));
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.music.tracks.length, 2);
    const created = result.payload.music.tracks.find((track) => track.title === '测试音乐');
    assert.ok(created);

    result = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/music/${created.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ title: '修改后的音乐', url: '/music/edited.m4a' })
    }));
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.music.tracks.find((track) => track.id === created.id).url, '/music/edited.m4a');

    result = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/music/layout`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ ids: [created.id, 'track-default'] })
    }));
    assert.deepEqual(result.payload.music.tracks.map((track) => track.id), [created.id, 'track-default']);

    result = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/music`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: '危险地址', url: 'data:audio/mp3;base64,AAAA' })
    }));
    assert.equal(result.response.status, 400);

    for (const id of [created.id, 'track-default']) {
      result = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/music/${id}`, {
        method: 'DELETE',
        headers: authHeaders
      }));
      assert.equal(result.response.status, 200);
    }
    assert.deepEqual(result.payload.music.tracks, []);

    const notModified = await miniflare.dispatchFetch(`${origin}/api/v1/music`, {
      headers: { 'if-none-match': `"lightwind-music-v${result.payload.music.version}"` }
    });
    assert.equal(notModified.status, 304);
  } finally {
    await miniflare.dispose();
  }
});
