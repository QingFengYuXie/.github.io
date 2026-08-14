import {
  SESSION_MAX_AGE,
  clearSessionCookie,
  createSessionCookie,
  csrfTokenForSession,
  hashPassword,
  isCredential,
  parseCookies,
  randomToken,
  sha256,
  verifyPassword
} from './security.js';
import {
  HttpError,
  cleanText,
  normalizeFolderInput,
  normalizeLinkInput,
  normalizeMusicInput,
  readJson
} from './validation.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
};

function unixTime() {
  return Math.floor(Date.now() / 1000);
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function assertMethod(request, allowed) {
  if (!allowed.includes(request.method)) {
    throw new HttpError(405, '请求方法不受支持。', 'METHOD_NOT_ALLOWED');
  }
}

function assertSameOrigin(request, env) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const allowed = new Set([requestOrigin, env.ALLOWED_ORIGIN].filter(Boolean));
  if (!origin || !allowed.has(origin)) {
    throw new HttpError(403, '请求来源校验失败。', 'ORIGIN_REJECTED');
  }
}

async function ensureAdmin(env) {
  let admin = await env.DB.prepare('SELECT id, username, password_hash AS passwordHash FROM admins WHERE id = 1').first();
  if (admin) return admin;
  if (!isCredential(env.INITIAL_ADMIN_CREDENTIAL)) {
    throw new HttpError(503, '管理员尚未初始化。', 'ADMIN_NOT_INITIALIZED');
  }
  const now = unixTime();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO admins (id, username, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?, ?)'
  ).bind(env.ADMIN_USERNAME || 'qingfengyu', env.INITIAL_ADMIN_CREDENTIAL, now, now).run();
  admin = await env.DB.prepare('SELECT id, username, password_hash AS passwordHash FROM admins WHERE id = 1').first();
  if (!admin) throw new HttpError(503, '管理员初始化失败。', 'ADMIN_NOT_INITIALIZED');
  return admin;
}

async function clientHash(request, username) {
  const address = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  return sha256(`${address}:${String(username || '').toLowerCase()}`);
}

async function checkLoginLimit(env, hash) {
  const now = unixTime();
  const cutoff = now - 15 * 60;
  await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(cutoff).run();
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS total, MIN(attempted_at) AS oldest FROM login_attempts WHERE client_hash = ? AND attempted_at >= ?'
  ).bind(hash, cutoff).first();
  if (Number(row?.total || 0) >= 5) {
    const retryAfter = Math.max(1, 15 * 60 - (now - Number(row.oldest || now)));
    throw new HttpError(429, `登录尝试过多，请在 ${Math.ceil(retryAfter / 60)} 分钟后重试。`, 'LOGIN_RATE_LIMITED');
  }
}

async function recordLoginFailure(env, hash) {
  await env.DB.prepare('INSERT INTO login_attempts (client_hash, attempted_at) VALUES (?, ?)')
    .bind(hash, unixTime()).run();
}

async function clearLoginFailures(env, hash) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE client_hash = ?').bind(hash).run();
}

async function getSession(request, env) {
  const token = parseCookies(request.headers.get('cookie')).lw_session;
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = unixTime();
  const session = await env.DB.prepare(
    `SELECT sessions.token_hash AS tokenHash, sessions.expires_at AS expiresAt,
            admins.id AS adminId, admins.username AS username
       FROM sessions JOIN admins ON admins.id = sessions.admin_id
      WHERE sessions.token_hash = ?`
  ).bind(tokenHash).first();
  if (!session) return null;
  if (Number(session.expiresAt) <= now) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return { ...session, token };
}

async function requireAdmin(request, env, { csrf = false } = {}) {
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, '请先登录管理员后台。', 'UNAUTHENTICATED');
  if (csrf) {
    assertSameOrigin(request, env);
    const supplied = request.headers.get('x-csrf-token') || '';
    const expected = await csrfTokenForSession(session.token);
    if (!supplied || supplied !== expected) throw new HttpError(403, '安全令牌已失效，请刷新后台。', 'CSRF_REJECTED');
  }
  return session;
}

function mapLink(row) {
  return {
    id: row.id,
    type: 'link',
    title: row.title,
    url: row.url,
    icon: row.icon || '',
    color: row.color,
    openMode: row.openMode,
    position: Number(row.position)
  };
}

function mapTrack(row) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    position: Number(row.position)
  };
}

async function getMusicData(env) {
  const [meta, trackResult] = await Promise.all([
    env.DB.prepare('SELECT version, updated_at AS updatedAt FROM music_meta WHERE id = 1').first(),
    env.DB.prepare('SELECT id, title, url, position FROM music_tracks ORDER BY position, id').all()
  ]);
  return {
    version: Number(meta?.version || 1),
    updatedAt: Number(meta?.updatedAt || unixTime()),
    tracks: (trackResult.results || []).map(mapTrack)
  };
}

async function getDesktopData(env) {
  const [meta, folderResult, linkResult] = await Promise.all([
    env.DB.prepare('SELECT version, updated_at AS updatedAt FROM desktop_meta WHERE id = 1').first(),
    env.DB.prepare('SELECT id, name, icon, color, position FROM folders ORDER BY position, id').all(),
    env.DB.prepare(
      `SELECT id, folder_id AS folderId, title, url, icon, color, open_mode AS openMode, position
         FROM links ORDER BY position, id`
    ).all()
  ]);
  const linksByFolder = new Map();
  const topLevel = [];
  for (const row of linkResult.results || []) {
    const link = mapLink(row);
    if (row.folderId) {
      if (!linksByFolder.has(row.folderId)) linksByFolder.set(row.folderId, []);
      linksByFolder.get(row.folderId).push(link);
    } else {
      topLevel.push(link);
    }
  }
  for (const folder of folderResult.results || []) {
    topLevel.push({
      id: folder.id,
      type: 'folder',
      title: folder.name,
      icon: folder.icon || '▰',
      color: folder.color,
      position: Number(folder.position),
      links: linksByFolder.get(folder.id) || []
    });
  }
  topLevel.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  return {
    version: Number(meta?.version || 1),
    updatedAt: Number(meta?.updatedAt || unixTime()),
    items: topLevel
  };
}

async function publicDesktop(request, env) {
  assertMethod(request, ['GET', 'HEAD']);
  const desktop = await getDesktopData(env);
  const etag = `"lightwind-desktop-v${desktop.version}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ...JSON_HEADERS, etag, 'cache-control': 'no-cache' } });
  }
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: { ...JSON_HEADERS, etag, 'cache-control': 'no-cache' } });
  }
  return json(desktop, 200, { etag, 'cache-control': 'no-cache' });
}

async function publicMusic(request, env) {
  assertMethod(request, ['GET', 'HEAD']);
  const music = await getMusicData(env);
  const etag = `"lightwind-music-v${music.version}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ...JSON_HEADERS, etag, 'cache-control': 'no-cache' } });
  }
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: { ...JSON_HEADERS, etag, 'cache-control': 'no-cache' } });
  }
  return json(music, 200, { etag, 'cache-control': 'no-cache' });
}

async function login(request, env) {
  assertMethod(request, ['POST']);
  assertSameOrigin(request, env);
  const body = await readJson(request, 8192);
  const username = cleanText(body.username, '账号', { min: 1, max: 64 }).toLowerCase();
  const password = String(body.password || '');
  if (password.length < 1 || password.length > 128) throw new HttpError(400, '密码格式无效。', 'INVALID_PASSWORD');
  const hash = await clientHash(request, username);
  await checkLoginLimit(env, hash);
  const admin = await ensureAdmin(env);
  const passwordMatches = await verifyPassword(password, admin.passwordHash);
  if (username !== admin.username.toLowerCase() || !passwordMatches) {
    await recordLoginFailure(env, hash);
    throw new HttpError(401, '账号或密码错误。', 'INVALID_CREDENTIALS');
  }
  await clearLoginFailures(env, hash);
  const token = randomToken();
  const now = unixTime();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), admin.id, now + SESSION_MAX_AGE, now)
  ]);
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true, username: admin.username, csrfToken: await csrfTokenForSession(token) }, 200, {
    'cache-control': 'no-store',
    'set-cookie': createSessionCookie(token, secure)
  });
}

async function sessionStatus(request, env) {
  assertMethod(request, ['GET']);
  const session = await getSession(request, env);
  if (!session) return json({ authenticated: false }, 200, { 'cache-control': 'no-store' });
  return json({
    authenticated: true,
    username: session.username,
    csrfToken: await csrfTokenForSession(session.token)
  }, 200, { 'cache-control': 'no-store' });
}

async function logout(request, env) {
  assertMethod(request, ['POST']);
  const session = await requireAdmin(request, env, { csrf: true });
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash).run();
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, {
    'cache-control': 'no-store',
    'set-cookie': clearSessionCookie(secure)
  });
}

async function changePassword(request, env) {
  assertMethod(request, ['POST']);
  const session = await requireAdmin(request, env, { csrf: true });
  const body = await readJson(request, 8192);
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new HttpError(400, '新密码长度需要在 8 到 128 个字符之间。', 'INVALID_PASSWORD');
  }
  const admin = await env.DB.prepare('SELECT password_hash AS passwordHash FROM admins WHERE id = ?')
    .bind(session.adminId).first();
  if (!admin || !await verifyPassword(currentPassword, admin.passwordHash)) {
    throw new HttpError(401, '当前密码错误。', 'INVALID_CREDENTIALS');
  }
  await env.DB.prepare('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(await hashPassword(newPassword), unixTime(), session.adminId).run();
  return json({ ok: true }, 200, { 'cache-control': 'no-store' });
}

async function nextTopLevelPosition(env) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM (
       SELECT position FROM folders
       UNION ALL
       SELECT position FROM links WHERE folder_id IS NULL
     )`
  ).first();
  return Number(row?.position || 0);
}

async function nextFolderPosition(env, folderId) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM links WHERE folder_id = ?'
  ).bind(folderId).first();
  return Number(row?.position || 0);
}

async function nextMusicPosition(env) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM music_tracks'
  ).first();
  return Number(row?.position || 0);
}

function touchDesktop(env, now = unixTime()) {
  return env.DB.prepare('UPDATE desktop_meta SET version = version + 1, updated_at = ? WHERE id = 1').bind(now);
}

function touchMusic(env, now = unixTime()) {
  return env.DB.prepare('UPDATE music_meta SET version = version + 1, updated_at = ? WHERE id = 1').bind(now);
}

async function adminMutationResponse(env) {
  return json({ ok: true, desktop: await getDesktopData(env) }, 200, { 'cache-control': 'no-store' });
}

async function adminMusicMutationResponse(env) {
  return json({ ok: true, music: await getMusicData(env) }, 200, { 'cache-control': 'no-store' });
}

async function createFolder(request, env) {
  await requireAdmin(request, env, { csrf: true });
  const input = normalizeFolderInput(await readJson(request));
  const now = unixTime();
  const id = `folder-${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO folders (id, name, icon, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, input.name, input.icon, input.color, await nextTopLevelPosition(env), now, now),
    touchDesktop(env, now)
  ]);
  return adminMutationResponse(env);
}

async function updateFolder(request, env, id) {
  await requireAdmin(request, env, { csrf: true });
  const current = await env.DB.prepare('SELECT id, name, icon, color FROM folders WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, '文件夹不存在。', 'NOT_FOUND');
  const input = normalizeFolderInput(await readJson(request), current);
  const now = unixTime();
  await env.DB.batch([
    env.DB.prepare('UPDATE folders SET name = ?, icon = ?, color = ?, updated_at = ? WHERE id = ?')
      .bind(input.name, input.icon, input.color, now, id),
    touchDesktop(env, now)
  ]);
  return adminMutationResponse(env);
}

async function deleteFolder(request, env, id) {
  await requireAdmin(request, env, { csrf: true });
  const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ?').bind(id).first();
  if (!folder) throw new HttpError(404, '文件夹不存在。', 'NOT_FOUND');
  const mode = new URL(request.url).searchParams.get('mode') || 'move';
  if (!['move', 'delete'].includes(mode)) throw new HttpError(400, '删除方式无效。', 'INVALID_DELETE_MODE');
  const children = (await env.DB.prepare('SELECT id FROM links WHERE folder_id = ? ORDER BY position').bind(id).all()).results || [];
  const statements = [];
  if (mode === 'delete') {
    statements.push(env.DB.prepare('DELETE FROM links WHERE folder_id = ?').bind(id));
  } else {
    const base = await nextTopLevelPosition(env);
    children.forEach((link, index) => {
      statements.push(env.DB.prepare('UPDATE links SET folder_id = NULL, position = ?, updated_at = ? WHERE id = ?')
        .bind(base + index, unixTime(), link.id));
    });
  }
  statements.push(env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id));
  statements.push(touchDesktop(env));
  await env.DB.batch(statements);
  return adminMutationResponse(env);
}

async function assertFolderExists(env, folderId) {
  if (!folderId) return;
  const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ?').bind(folderId).first();
  if (!folder) throw new HttpError(400, '目标文件夹不存在。', 'INVALID_FOLDER');
}

async function createLink(request, env) {
  await requireAdmin(request, env, { csrf: true });
  const input = normalizeLinkInput(await readJson(request), {
    icon: '', color: '#e8d9dc', openMode: 'auto', folderId: null
  });
  await assertFolderExists(env, input.folderId);
  const now = unixTime();
  const id = `link-${crypto.randomUUID()}`;
  const position = input.folderId ? await nextFolderPosition(env, input.folderId) : await nextTopLevelPosition(env);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO links (id, folder_id, title, url, icon, color, open_mode, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, input.folderId, input.title, input.url, input.icon, input.color, input.openMode, position, now, now),
    touchDesktop(env, now)
  ]);
  return adminMutationResponse(env);
}

async function updateLink(request, env, id) {
  await requireAdmin(request, env, { csrf: true });
  const current = await env.DB.prepare(
    `SELECT id, folder_id AS folderId, title, url, icon, color, open_mode AS openMode, position
       FROM links WHERE id = ?`
  ).bind(id).first();
  if (!current) throw new HttpError(404, '网址不存在。', 'NOT_FOUND');
  const input = normalizeLinkInput(await readJson(request), current);
  await assertFolderExists(env, input.folderId);
  const folderChanged = (current.folderId || null) !== (input.folderId || null);
  const position = folderChanged
    ? (input.folderId ? await nextFolderPosition(env, input.folderId) : await nextTopLevelPosition(env))
    : Number(current.position);
  const now = unixTime();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE links SET folder_id = ?, title = ?, url = ?, icon = ?, color = ?, open_mode = ?, position = ?, updated_at = ?
        WHERE id = ?`
    ).bind(input.folderId, input.title, input.url, input.icon, input.color, input.openMode, position, now, id),
    touchDesktop(env, now)
  ]);
  return adminMutationResponse(env);
}

async function deleteLink(request, env, id) {
  await requireAdmin(request, env, { csrf: true });
  const link = await env.DB.prepare('SELECT id FROM links WHERE id = ?').bind(id).first();
  if (!link) throw new HttpError(404, '网址不存在。', 'NOT_FOUND');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id),
    touchDesktop(env)
  ]);
  return adminMutationResponse(env);
}

async function createMusic(request, env) {
  await requireAdmin(request, env, { csrf: true });
  const input = normalizeMusicInput(await readJson(request));
  const now = unixTime();
  const id = `track-${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO music_tracks (id, title, url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, input.title, input.url, await nextMusicPosition(env), now, now),
    touchMusic(env, now)
  ]);
  return adminMusicMutationResponse(env);
}

async function updateMusic(request, env, id) {
  await requireAdmin(request, env, { csrf: true });
  const current = await env.DB.prepare(
    'SELECT id, title, url, position FROM music_tracks WHERE id = ?'
  ).bind(id).first();
  if (!current) throw new HttpError(404, '音乐不存在。', 'NOT_FOUND');
  const input = normalizeMusicInput(await readJson(request), current);
  const now = unixTime();
  await env.DB.batch([
    env.DB.prepare('UPDATE music_tracks SET title = ?, url = ?, updated_at = ? WHERE id = ?')
      .bind(input.title, input.url, now, id),
    touchMusic(env, now)
  ]);
  return adminMusicMutationResponse(env);
}

async function deleteMusic(request, env, id) {
  await requireAdmin(request, env, { csrf: true });
  const current = await env.DB.prepare('SELECT id FROM music_tracks WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, '音乐不存在。', 'NOT_FOUND');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM music_tracks WHERE id = ?').bind(id),
    touchMusic(env)
  ]);
  return adminMusicMutationResponse(env);
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

async function updateMusicLayout(request, env) {
  await requireAdmin(request, env, { csrf: true });
  const body = await readJson(request, 32768);
  if (!Array.isArray(body.ids) || body.ids.length > 300) {
    throw new HttpError(400, '音乐排序数据无效。', 'INVALID_MUSIC_LAYOUT');
  }
  const trackResult = await env.DB.prepare('SELECT id FROM music_tracks').all();
  const allTracks = new Set((trackResult.results || []).map((track) => track.id));
  const orderedIds = body.ids.map((value) => String(value || ''));
  const suppliedTracks = new Set(orderedIds);
  if (orderedIds.length !== suppliedTracks.size || !sameSet(suppliedTracks, allTracks)) {
    throw new HttpError(400, '音乐排序必须包含全部且不重复的音乐。', 'INVALID_MUSIC_LAYOUT');
  }
  const now = unixTime();
  const statements = orderedIds.map((id, position) => (
    env.DB.prepare('UPDATE music_tracks SET position = ?, updated_at = ? WHERE id = ?').bind(position, now, id)
  ));
  statements.push(touchMusic(env, now));
  await env.DB.batch(statements);
  return adminMusicMutationResponse(env);
}

async function updateLayout(request, env) {
  await requireAdmin(request, env, { csrf: true });
  const body = await readJson(request, 65536);
  if (!Array.isArray(body.topLevel) || !body.folders || typeof body.folders !== 'object') {
    throw new HttpError(400, '桌面排序数据无效。', 'INVALID_LAYOUT');
  }
  if (body.topLevel.length > 300) throw new HttpError(400, '桌面项目数量过多。', 'INVALID_LAYOUT');
  const [folderResult, linkResult] = await Promise.all([
    env.DB.prepare('SELECT id FROM folders').all(),
    env.DB.prepare('SELECT id FROM links').all()
  ]);
  const allFolders = new Set((folderResult.results || []).map((item) => item.id));
  const allLinks = new Set((linkResult.results || []).map((item) => item.id));
  const seenFolders = new Set();
  const seenLinks = new Set();
  const statements = [];
  body.topLevel.forEach((item, position) => {
    const id = String(item?.id || '');
    if (item?.type === 'folder' && allFolders.has(id) && !seenFolders.has(id)) {
      seenFolders.add(id);
      statements.push(env.DB.prepare('UPDATE folders SET position = ?, updated_at = ? WHERE id = ?')
        .bind(position, unixTime(), id));
      return;
    }
    if (item?.type === 'link' && allLinks.has(id) && !seenLinks.has(id)) {
      seenLinks.add(id);
      statements.push(env.DB.prepare('UPDATE links SET folder_id = NULL, position = ?, updated_at = ? WHERE id = ?')
        .bind(position, unixTime(), id));
      return;
    }
    throw new HttpError(400, '桌面排序包含重复或不存在的项目。', 'INVALID_LAYOUT');
  });
  for (const folderId of allFolders) {
    const orderedLinks = body.folders[folderId] || [];
    if (!Array.isArray(orderedLinks)) throw new HttpError(400, '文件夹排序数据无效。', 'INVALID_LAYOUT');
    orderedLinks.forEach((linkIdValue, position) => {
      const linkId = String(linkIdValue || '');
      if (!allLinks.has(linkId) || seenLinks.has(linkId)) {
        throw new HttpError(400, '文件夹排序包含重复或不存在的网址。', 'INVALID_LAYOUT');
      }
      seenLinks.add(linkId);
      statements.push(env.DB.prepare('UPDATE links SET folder_id = ?, position = ?, updated_at = ? WHERE id = ?')
        .bind(folderId, position, unixTime(), linkId));
    });
  }
  if (!sameSet(seenFolders, allFolders) || !sameSet(seenLinks, allLinks)) {
    throw new HttpError(400, '排序数据没有包含全部项目。', 'INVALID_LAYOUT');
  }
  statements.push(touchDesktop(env));
  await env.DB.batch(statements);
  return adminMutationResponse(env);
}

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (path === '/api/v1/health') return json({ ok: true, service: 'lightwind-navigation-api' });
  if (path === '/api/v1/desktop') return publicDesktop(request, env);
  if (path === '/api/v1/music') return publicMusic(request, env);
  if (path === '/api/v1/auth/login') return login(request, env);
  if (path === '/api/v1/auth/session') return sessionStatus(request, env);
  if (path === '/api/v1/auth/logout') return logout(request, env);
  if (path === '/api/v1/auth/password') return changePassword(request, env);
  if (path === '/api/v1/admin/layout') {
    assertMethod(request, ['PUT']);
    return updateLayout(request, env);
  }
  if (path === '/api/v1/admin/music/layout') {
    assertMethod(request, ['PUT']);
    return updateMusicLayout(request, env);
  }
  const folderMatch = path.match(/^\/api\/v1\/admin\/folders(?:\/([^/]+))?$/);
  if (folderMatch) {
    const id = folderMatch[1] ? decodeURIComponent(folderMatch[1]) : null;
    if (!id) {
      assertMethod(request, ['POST']);
      return createFolder(request, env);
    }
    if (request.method === 'PATCH') return updateFolder(request, env, id);
    if (request.method === 'DELETE') return deleteFolder(request, env, id);
    throw new HttpError(405, '请求方法不受支持。', 'METHOD_NOT_ALLOWED');
  }
  const linkMatch = path.match(/^\/api\/v1\/admin\/links(?:\/([^/]+))?$/);
  if (linkMatch) {
    const id = linkMatch[1] ? decodeURIComponent(linkMatch[1]) : null;
    if (!id) {
      assertMethod(request, ['POST']);
      return createLink(request, env);
    }
    if (request.method === 'PATCH') return updateLink(request, env, id);
    if (request.method === 'DELETE') return deleteLink(request, env, id);
    throw new HttpError(405, '请求方法不受支持。', 'METHOD_NOT_ALLOWED');
  }
  const musicMatch = path.match(/^\/api\/v1\/admin\/music(?:\/([^/]+))?$/);
  if (musicMatch) {
    const id = musicMatch[1] ? decodeURIComponent(musicMatch[1]) : null;
    if (!id) {
      assertMethod(request, ['POST']);
      return createMusic(request, env);
    }
    if (request.method === 'PATCH') return updateMusic(request, env, id);
    if (request.method === 'DELETE') return deleteMusic(request, env, id);
    throw new HttpError(405, '请求方法不受支持。', 'METHOD_NOT_ALLOWED');
  }
  throw new HttpError(404, '接口不存在。', 'NOT_FOUND');
}

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ ok: false, code: error.code, message: error.message }, error.status, {
          'cache-control': 'no-store',
          ...(error.status === 429 ? { 'retry-after': '900' } : {})
        });
      }
      console.error('Unhandled navigation API error', error);
      return json({ ok: false, code: 'INTERNAL_ERROR', message: '服务器暂时无法处理请求。' }, 500, {
        'cache-control': 'no-store'
      });
    }
  }
};
