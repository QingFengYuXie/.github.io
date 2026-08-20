import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaviconHandler } from '../src/favicon.js';
import { HttpError } from '../src/validation.js';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const ICO = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0]);

function makeEnv(link, extras = {}) {
  return {
    ALLOWED_ORIGIN: 'https://qfyx.top',
    DB: {
      prepare() {
        return {
          bind(id) {
            return {
              async first() {
                return link && id === link.id ? { ...link } : null;
              }
            };
          }
        };
      }
    },
    ...extras
  };
}

function makeCache() {
  const values = new Map();
  return {
    values,
    async match(request) {
      return values.get(request.url)?.clone() || null;
    },
    async put(request, response) {
      values.set(request.url, response.clone());
    }
  };
}

function makeBucket() {
  const values = new Map();
  return {
    values,
    async get(key) {
      const value = values.get(key);
      if (!value) return null;
      return { body: new Response(value.body).body, httpMetadata: value.httpMetadata };
    },
    async put(key, body, options) {
      const bytes = body instanceof Uint8Array
        ? body
        : new Uint8Array(await new Response(body).arrayBuffer());
      values.set(key, { body: bytes, httpMetadata: options.httpMetadata });
    }
  };
}

function iconResponse(body = PNG, contentType = 'image/png') {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, 'content-length': String(body.byteLength) }
  });
}

test('favicon handler fetches fixed paths and caches a validated image', async () => {
  const link = { id: 'link-search', url: 'https://www.example.org/search?q=private', updatedAt: 10 };
  const requested = [];
  const cache = makeCache();
  const handler = createFaviconHandler({
    cache,
    async fetch(url, init) {
      requested.push({ url: String(url), init });
      return iconResponse();
    }
  });

  let response = await handler(
    new Request('https://qfyx.top/api/v1/favicons/link-search'),
    makeEnv(link),
    link.id
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-favicon-cache'), 'miss');
  assert.equal(response.headers.get('x-favicon-fallback'), '0');
  assert.equal(response.headers.get('x-favicon-source'), 'site');
  assert.equal(requested.length, 1);
  assert.equal(requested[0].url, 'https://www.example.org/favicon.ico');
  assert.equal(requested[0].init.redirect, 'manual');

  response = await handler(
    new Request('https://qfyx.top/api/v1/favicons/link-search'),
    makeEnv(link),
    link.id
  );
  assert.equal(response.headers.get('x-favicon-cache'), 'hit');
  assert.equal(requested.length, 1);
});

test('favicon handler uses a fixed provider after the site root icon fails', async () => {
  const link = {
    id: 'link-provider',
    url: 'https://blocked.example.org/private/path?token=secret',
    updatedAt: 10
  };
  const requested = [];
  const handler = createFaviconHandler({
    cache: makeCache(),
    async fetch(url) {
      const parsed = new URL(url);
      requested.push(parsed);
      if (parsed.hostname === 'www.google.com') return iconResponse();
      return new Response(null, { status: 404 });
    }
  });

  const response = await handler(
    new Request('https://qfyx.top/api/v1/favicons/link-provider'),
    makeEnv(link),
    link.id
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-favicon-fallback'), '0');
  assert.equal(response.headers.get('x-favicon-source'), 'provider');
  assert.equal(requested.length, 3);
  assert.equal(requested[0].href, 'https://blocked.example.org/favicon.ico');
  assert.equal(requested[1].href, 'https://blocked.example.org/');
  assert.equal(requested[2].origin, 'https://www.google.com');
  assert.equal(requested[2].searchParams.get('domain_url'), 'https://blocked.example.org');
  assert.equal(requested[2].searchParams.get('sz'), '128');
  assert.doesNotMatch(requested[2].href, /private|token|secret/);
});

test('favicon handler discovers declared SVG icons', async () => {
  const link = { id: 'link-declared-svg', url: 'https://declared.example.org/app', updatedAt: 10 };
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0h64v64H0z"/></svg>');
  const requested = [];
  const handler = createFaviconHandler({
    cache: makeCache(),
    async fetch(url) {
      const parsed = new URL(url);
      requested.push(parsed.href);
      if (parsed.pathname === '/favicon.ico') return new Response(null, { status: 404 });
      if (parsed.pathname === '/') {
        return new Response('<!doctype html><link rel="icon" type="image/svg+xml" sizes="any" href="/assets/icon.svg">', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        });
      }
      if (parsed.pathname === '/assets/icon.svg') return iconResponse(svg, 'image/svg+xml');
      return new Response(null, { status: 404 });
    }
  });

  const response = await handler(
    new Request('https://qfyx.top/api/v1/favicons/link-declared-svg'),
    makeEnv(link),
    link.id
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.equal(response.headers.get('x-favicon-source'), 'site-declared');
  assert.deepEqual(requested, [
    'https://declared.example.org/favicon.ico',
    'https://declared.example.org/',
    'https://declared.example.org/assets/icon.svg'
  ]);
});

test('favicon handler persists successful icons in R2', async () => {
  const link = { id: 'link-r2', url: 'https://r2.example.org', updatedAt: 10 };
  const bucket = makeBucket();
  let fetches = 0;
  const firstHandler = createFaviconHandler({
    cache: makeCache(),
    async fetch() {
      fetches += 1;
      return iconResponse();
    }
  });
  const env = makeEnv(link, { FAVICON_BUCKET: bucket });
  const first = await firstHandler(
    new Request('https://qfyx.top/api/v1/favicons/link-r2'),
    env,
    link.id
  );

  const secondHandler = createFaviconHandler({
    cache: makeCache(),
    async fetch() {
      fetches += 1;
      throw new Error('R2 hit should avoid a network fetch');
    }
  });
  const second = await secondHandler(
    new Request('https://qfyx.top/api/v1/favicons/link-r2'),
    env,
    link.id
  );

  assert.equal(first.status, 200);
  assert.equal(first.headers.get('x-favicon-cache'), 'miss');
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('x-favicon-cache'), 'r2');
  assert.equal(second.headers.get('content-type'), 'image/png');
  assert.equal(fetches, 1);
  assert.equal(bucket.values.size, 1);
});

test('favicon handler trusts image signatures instead of incorrect content types', async () => {
  const link = { id: 'link-mislabeled', url: 'https://mislabeled.example.org', updatedAt: 10 };
  let fetches = 0;
  const handler = createFaviconHandler({
    cache: makeCache(),
    async fetch() {
      fetches += 1;
      return iconResponse(ICO, 'text/plain; charset=utf-8');
    }
  });

  const response = await handler(
    new Request('https://qfyx.top/api/v1/favicons/link-mislabeled'),
    makeEnv(link),
    link.id
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/x-icon');
  assert.equal(response.headers.get('x-favicon-source'), 'site');
  assert.equal(fetches, 1);
});

test('favicon cache key changes when the saved URL revision changes', async () => {
  const cache = makeCache();
  let fetches = 0;
  const handler = createFaviconHandler({
    cache,
    async fetch() {
      fetches += 1;
      return iconResponse();
    }
  });
  const request = new Request('https://qfyx.top/api/v1/favicons/link-changing');

  await handler(request, makeEnv({
    id: 'link-changing', url: 'https://first.example.org', updatedAt: 100
  }), 'link-changing');
  await handler(request, makeEnv({
    id: 'link-changing', url: 'https://second.example.org', updatedAt: 101
  }), 'link-changing');

  assert.equal(fetches, 2);
  assert.equal(cache.values.size, 2);
});

test('favicon handler never fetches private, local, or unsupported targets', async () => {
  const targets = [
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data',
    'http://192.168.1.1',
    'http://[::1]/',
    'http://localhost/',
    'mailto:owner@example.org'
  ];
  for (const [index, url] of targets.entries()) {
    let fetches = 0;
    const handler = createFaviconHandler({
      cache: makeCache(),
      async fetch() {
        fetches += 1;
        return iconResponse();
      }
    });
    const id = `link-private-${index}`;
    const response = await handler(
      new Request(`https://qfyx.top/api/v1/favicons/${id}`),
      makeEnv({ id, url, updatedAt: 1 }),
      id
    );
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('content-type'), null);
    assert.equal(response.headers.get('x-favicon-fallback'), '1');
    assert.equal(response.headers.get('x-favicon-source'), 'none');
    assert.equal(fetches, 0);
  }
});

test('favicon handler rejects redirects to private targets', async () => {
  const requested = [];
  const handler = createFaviconHandler({
    cache: makeCache(),
    async fetch(url) {
      requested.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private.ico' }
      });
    }
  });
  const id = 'link-redirect';
  const response = await handler(
    new Request(`https://qfyx.top/api/v1/favicons/${id}`),
    makeEnv({ id, url: 'https://public.example.org', updatedAt: 1 }),
    id
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-favicon-fallback'), '1');
  assert.equal(requested.length, 7);
  assert.ok(requested.every((url) => !url.includes('127.0.0.1')));
  assert.ok(requested[0].startsWith('https://public.example.org/'));
  assert.ok(requested[1].startsWith('https://public.example.org/'));
  assert.ok(requested[2].startsWith('https://www.google.com/s2/favicons?'));
  assert.ok(requested.slice(3).every((url) => url.startsWith('https://public.example.org/')));
});

test('favicon handler rejects non-images and oversized bodies', async () => {
  let requestNumber = 0;
  const handler = createFaviconHandler({
    cache: makeCache(),
    async fetch() {
      requestNumber += 1;
      if (requestNumber === 1) {
        return new Response('<html>not an icon</html>', {
          headers: { 'content-type': 'text/html' }
        });
      }
      return new Response(PNG, {
        headers: { 'content-type': 'image/png', 'content-length': String(129 * 1024) }
      });
    }
  });
  const id = 'link-invalid-image';
  const response = await handler(
    new Request(`https://qfyx.top/api/v1/favicons/${id}`),
    makeEnv({ id, url: 'https://public.example.org', updatedAt: 1 }),
    id
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-favicon-fallback'), '1');
  assert.equal(requestNumber, 7);
});

test('favicon handler accepts only GET requests and existing link IDs', async () => {
  const handler = createFaviconHandler({ cache: makeCache(), fetch: async () => iconResponse() });
  const env = makeEnv({ id: 'link-valid', url: 'https://public.example.org', updatedAt: 1 });

  await assert.rejects(
    handler(new Request('https://qfyx.top/api/v1/favicons/link-valid', { method: 'POST' }), env, 'link-valid'),
    (error) => error instanceof HttpError && error.status === 405
  );
  await assert.rejects(
    handler(new Request('https://qfyx.top/api/v1/favicons/link-valid'), env, '../private'),
    (error) => error instanceof HttpError && error.status === 400
  );
  await assert.rejects(
    handler(new Request('https://qfyx.top/api/v1/favicons/link-missing'), env, 'link-missing'),
    (error) => error instanceof HttpError && error.status === 404
  );
});
