const encoder = new TextEncoder();

// Keep PBKDF2 within the Cloudflare Workers Free CPU budget. Online login
// throttling and a random per-password salt provide additional protection.
export const PASSWORD_ITERATIONS = 100000;
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

export function isCredential(value) {
  if (typeof value !== 'string') return false;
  const [algorithm, iterations, salt, hash, extra] = value.split('$');
  return algorithm === 'pbkdf2-sha256'
    && Number.isInteger(Number(iterations))
    && Number(iterations) >= 100000
    && Boolean(salt)
    && Boolean(hash)
    && extra === undefined;
}

export async function hashPassword(password, iterations = PASSWORD_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function verifyPassword(password, credential) {
  if (!isCredential(credential)) return false;
  const [, iterationText, saltText, expectedText] = credential.split('$');
  const actual = await derivePassword(password, base64UrlToBytes(saltText), Number(iterationText));
  return constantTimeEqual(actual, base64UrlToBytes(expectedText));
}

export function randomToken(length = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function csrfTokenForSession(sessionToken) {
  return sha256(`lightwind-csrf:${sessionToken}`);
}

export function parseCookies(header = '') {
  return Object.fromEntries(String(header || '').split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

export function createSessionCookie(token, secure = true) {
  return `lw_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure = true) {
  return `lw_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
