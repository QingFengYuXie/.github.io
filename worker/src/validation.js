export class HttpError extends Error {
  constructor(status, message, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function readJson(request, limit = 32768) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > limit) throw new HttpError(413, '请求内容过大。', 'PAYLOAD_TOO_LARGE');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, '请求内容过大。', 'PAYLOAD_TOO_LARGE');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, '请求格式不是有效的 JSON。', 'INVALID_JSON');
  }
}

export function cleanText(value, field, { min = 1, max = 80 } = {}) {
  const cleaned = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned.length < min || cleaned.length > max) {
    throw new HttpError(400, `${field}长度需要在 ${min} 到 ${max} 个字符之间。`, 'INVALID_FIELD');
  }
  return cleaned;
}

export function cleanOptionalText(value, field, max = 24) {
  if (value === undefined || value === null || value === '') return '';
  return cleanText(value, field, { min: 0, max });
}

export function normalizeColor(value, fallback = '#e8d9dc') {
  const color = String(value || fallback).trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, '颜色必须使用六位十六进制格式。', 'INVALID_COLOR');
  return color.toLowerCase();
}

export function normalizeOpenMode(value = 'auto') {
  const mode = String(value);
  if (!['auto', 'same', 'new'].includes(mode)) throw new HttpError(400, '打开方式无效。', 'INVALID_OPEN_MODE');
  return mode;
}

export function normalizeUrl(value) {
  const raw = cleanText(value, '网址', { min: 1, max: 2048 });
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    if (/[\s\\]/.test(raw)) throw new HttpError(400, '站内网址格式无效。', 'INVALID_URL');
    return raw;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HttpError(400, '请输入完整的 http、https、mailto 或站内网址。', 'INVALID_URL');
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    throw new HttpError(400, '只允许 http、https、mailto 和站内网址。', 'INVALID_URL_PROTOCOL');
  }
  if (['http:', 'https:'].includes(parsed.protocol) && (parsed.username || parsed.password)) {
    throw new HttpError(400, '网址中不能包含用户名或密码。', 'INVALID_URL');
  }
  return parsed.href;
}

export function normalizeMusicUrl(value) {
  const normalized = normalizeUrl(value);
  if (normalized.startsWith('/')) return normalized;
  const parsed = new URL(normalized);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HttpError(400, '音乐地址只允许站内路径、http 或 https。', 'INVALID_MUSIC_URL');
  }
  return parsed.href;
}

export function normalizeFolderInput(body, current = {}) {
  return {
    name: body.name === undefined && current.name !== undefined ? current.name : cleanText(body.name, '文件夹名称', { max: 40 }),
    icon: body.icon === undefined && current.icon !== undefined ? current.icon : cleanOptionalText(body.icon, '文件夹图标', 24) || '▰',
    color: body.color === undefined && current.color !== undefined ? current.color : normalizeColor(body.color, '#f4c84a')
  };
}

export function normalizeLinkInput(body, current = {}) {
  return {
    title: body.title === undefined && current.title !== undefined ? current.title : cleanText(body.title, '网址名称', { max: 60 }),
    url: body.url === undefined && current.url !== undefined ? current.url : normalizeUrl(body.url),
    icon: body.icon === undefined && current.icon !== undefined ? current.icon : cleanOptionalText(body.icon, '网址图标', 24),
    color: body.color === undefined && current.color !== undefined ? current.color : normalizeColor(body.color),
    openMode: body.openMode === undefined && current.openMode !== undefined ? current.openMode : normalizeOpenMode(body.openMode),
    pageId: body.pageId === undefined && current.pageId !== undefined
      ? current.pageId
      : (body.pageId ? cleanText(body.pageId, '页面', { max: 90 }) : null),
    folderId: body.folderId === undefined && current.folderId !== undefined
      ? current.folderId
      : (body.folderId ? cleanText(body.folderId, '文件夹', { max: 80 }) : null)
  };
}

export function normalizeMusicInput(body, current = {}) {
  return {
    title: body.title === undefined && current.title !== undefined
      ? current.title
      : cleanText(body.title, '音乐名称', { max: 60 }),
    url: body.url === undefined && current.url !== undefined
      ? current.url
      : normalizeMusicUrl(body.url)
  };
}

export const WALLPAPER_MAX_BYTES = 30 * 1024 * 1024;
export const WALLPAPER_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
});

export function wallpaperExtension(contentType) {
  return WALLPAPER_TYPES[contentType] || '';
}

export function assertWallpaperType(contentType) {
  if (!wallpaperExtension(contentType)) {
    throw new HttpError(400, '壁纸只支持 JPG、PNG 或 WebP 图片。', 'INVALID_WALLPAPER_TYPE');
  }
  return contentType;
}

export function normalizePageInput(body, current = {}) {
  return {
    name: body.name === undefined && current.name !== undefined
      ? current.name
      : cleanText(body.name, '页面名称', { max: 40 })
  };
}
