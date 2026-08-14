import test from 'node:test';
import assert from 'node:assert/strict';
import { csrfTokenForSession, hashPassword, isCredential, parseCookies, verifyPassword } from '../src/security.js';

test('password credential is salted and verifiable', async () => {
  const credential = await hashPassword('test-password-123', 100000);
  assert.equal(isCredential(credential), true);
  assert.equal(await verifyPassword('test-password-123', credential), true);
  assert.equal(await verifyPassword('wrong-password', credential), false);
});

test('csrf token is deterministic per session', async () => {
  assert.equal(await csrfTokenForSession('session-a'), await csrfTokenForSession('session-a'));
  assert.notEqual(await csrfTokenForSession('session-a'), await csrfTokenForSession('session-b'));
});

test('cookie parser ignores malformed fragments', () => {
  assert.deepEqual(parseCookies('theme=dark; lw_session=abc123; broken'), {
    theme: 'dark',
    lw_session: 'abc123'
  });
  assert.deepEqual(parseCookies(null), {});
});
