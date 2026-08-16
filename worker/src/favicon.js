import { HttpError } from './validation.js';

const SUCCESS_EDGE_TTL = 30 * 24 * 60 * 60;
const FAILURE_EDGE_TTL = 10 * 60;
const FETCH_BUDGET_MS = 5200;
const REQUEST_TIMEOUT_MS = 2400;
const MAX_REDIRECTS = 2;
const MAX_ICON_BYTES = 128 * 1024;
const FAVICON_CACHE_VERSION = 2;
const PRIMARY_ICON_PATH = '/favicon.ico';
const SECONDARY_ICON_PATHS = [
  '/favicon.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png'
];
const FAVICON_PROVIDER_URL = 'https://www.google.com/s2/favicons';

const RESPONSE_SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; sandbox",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff'
};

function assertGet(request) {
  if (request.method !== 'GET') {
    throw new HttpError(405, '请求方法不受支持。', 'METHOD_NOT_ALLOWED');
  }
}

function assertLinkId(linkId) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(linkId)) {
    throw new HttpError(400, '网址标识格式无效。', 'INVALID_LINK_ID');
  }
}

function ipv4Parts(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  return numbers.some((part) => part > 255) ? null : numbers;
}

function isPublicIpv4(parts) {
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicHostname(rawHostname) {
  const hostname = rawHostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!hostname || hostname.includes(':')) return false;
  const address = ipv4Parts(hostname);
  if (address) return isPublicIpv4(address);
  if (hostname.length > 253 || !hostname.includes('.')) return false;
  if (!hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return false;
  return !['localhost', 'local', 'internal', 'lan', 'home', 'test', 'invalid', 'example', 'arpa']
    .some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function safeHttpUrl(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password || !isPublicHostname(url.hostname)) return null;
  if ((url.protocol === 'http:' && url.port && url.port !== '80')
    || (url.protocol === 'https:' && url.port && url.port !== '443')) return null;
  return url;
}

function targetOrigin(rawUrl, siteOrigin) {
  try {
    const resolved = new URL(rawUrl, siteOrigin);
    const safe = safeHttpUrl(resolved);
    return safe ? safe.origin : null;
  } catch {
    return null;
  }
}

function urlFingerprint(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function cacheKey(link) {
  const id = encodeURIComponent(link.id);
  const revision = `${Number(link.updatedAt) || 0}-${urlFingerprint(link.url)}`;
  return new Request(`https://qfyx.top/__edge-cache/favicons/v${FAVICON_CACHE_VERSION}/${id}/${revision}`);
}

function imageKind(bytes) {
  if (bytes.length >= 8
    && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return 'image/png';
  }
  if (bytes.length >= 4
    && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return 'image/x-icon';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const signature = new TextDecoder().decode(bytes.slice(0, 12));
  if (signature.startsWith('GIF87a') || signature.startsWith('GIF89a')) return 'image/gif';
  if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function readLimitedBody(response) {
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_ICON_BYTES || !response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ICON_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function fetchFollowingSafeRedirects(startUrl, fetcher, signal) {
  let current = safeHttpUrl(startUrl);
  for (let redirects = 0; current && redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetcher(current, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        accept: 'image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/gif,image/webp;q=0.9'
      }
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      current = safeHttpUrl(new URL(location, current));
      continue;
    }
    return response;
  }
  return null;
}

async function fetchCandidate(url, fetcher, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFollowingSafeRedirects(url, fetcher, controller.signal);
    if (!response || response.status !== 200) return null;
    const body = await readLimitedBody(response);
    if (!body?.byteLength) return null;
    const contentType = imageKind(body);
    return contentType ? { body, contentType } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function remainingBudget(deadline) {
  return Math.max(0, deadline - Date.now());
}

async function fetchWithinBudget(url, fetcher, deadline) {
  const remaining = remainingBudget(deadline);
  if (!remaining) return null;
  return fetchCandidate(url, fetcher, Math.min(REQUEST_TIMEOUT_MS, remaining));
}

function providerUrl(origin) {
  const url = new URL(FAVICON_PROVIDER_URL);
  url.searchParams.set('domain_url', origin);
  url.searchParams.set('sz', '128');
  return url;
}

async function fetchFavicon(origin, fetcher) {
  const deadline = Date.now() + FETCH_BUDGET_MS;
  const primary = await fetchWithinBudget(new URL(PRIMARY_ICON_PATH, origin), fetcher, deadline);
  if (primary) return { ...primary, source: 'site' };

  const provided = await fetchWithinBudget(providerUrl(origin), fetcher, deadline);
  if (provided) return { ...provided, source: 'provider' };

  for (const path of SECONDARY_ICON_PATHS) {
    const icon = await fetchWithinBudget(new URL(path, origin), fetcher, deadline);
    if (icon) return { ...icon, source: 'site' };
    if (!remainingBudget(deadline)) break;
  }
  return null;
}

function storedImage(icon) {
  const fallback = !icon;
  const headers = {
    ...RESPONSE_SECURITY_HEADERS,
    'cache-control': `public, max-age=${fallback ? FAILURE_EDGE_TTL : SUCCESS_EDGE_TTL}, immutable`,
    'x-favicon-fallback': fallback ? '1' : '0',
    'x-favicon-source': icon?.source || 'none'
  };
  if (fallback) return new Response(null, { status: 204, headers });
  headers['content-type'] = icon.contentType;
  return new Response(icon.body, { status: 200, headers });
}

function clientResponse(response, cacheStatus) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  headers.set('x-favicon-cache', cacheStatus);
  return new Response(response.body, { status: response.status, headers });
}

async function cacheMatch(cache, key) {
  if (!cache) return null;
  try {
    return await cache.match(key);
  } catch {
    return null;
  }
}

async function cachePut(cache, key, response) {
  if (!cache) return;
  try {
    await cache.put(key, response);
  } catch {
    // 图标仍可直接返回；边缘缓存故障不应影响桌面加载。
  }
}

export function createFaviconHandler(services = {}) {
  return async function publicFavicon(request, env, linkId) {
    assertGet(request);
    assertLinkId(linkId);
    const link = await env.DB.prepare(
      'SELECT id, url, updated_at AS updatedAt FROM links WHERE id = ?'
    ).bind(linkId).first();
    if (!link) throw new HttpError(404, '网址不存在。', 'NOT_FOUND');

    const cache = Object.hasOwn(services, 'cache') ? services.cache : globalThis.caches?.default;
    const key = cacheKey(link);
    const cached = await cacheMatch(cache, key);
    if (cached) return clientResponse(cached, 'hit');

    const configuredOrigin = safeHttpUrl(env.ALLOWED_ORIGIN)?.origin;
    const requestOrigin = safeHttpUrl(new URL(request.url).origin)?.origin;
    const origin = targetOrigin(link.url, configuredOrigin || requestOrigin);
    const fetcher = services.fetch || globalThis.fetch;
    const icon = origin ? await fetchFavicon(origin, fetcher) : null;
    const response = storedImage(icon);
    await cachePut(cache, key, response.clone());
    return clientResponse(response, 'miss');
  };
}

export const publicFavicon = createFaviconHandler();