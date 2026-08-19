const API_ROOT = '/api/v1';
const MAX_WALLPAPER_BYTES = 30 * 1024 * 1024;
const state = {
  csrfToken: '',
  desktop: null,
  selectedPageId: '',
  music: null,
  wallpaper: null,
  pendingFolderDelete: null,
  pendingPageDelete: null,
  dragItem: null,
  dragPageId: null,
  dragMusicId: null,
  previewTrackId: null
};

const loginView = document.querySelector('#loginView');
const dashboardView = document.querySelector('#dashboardView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const dashboardAlert = document.querySelector('#dashboardAlert');
const dashboardAlertMessage = document.querySelector('#dashboardAlertMessage');
const retryDashboardButton = document.querySelector('#retryDashboardButton');
const desktopList = document.querySelector('#desktopList');
const desktopPageManagerList = document.querySelector('#desktopPageManagerList');
const pageDialog = document.querySelector('#pageDialog');
const pageForm = document.querySelector('#pageForm');
const deletePageDialog = document.querySelector('#deletePageDialog');
const deletePageForm = document.querySelector('#deletePageForm');
const desktopContentTitle = document.querySelector('#desktopContentTitle');
const emptyState = document.querySelector('#emptyState');
const previewIcons = document.querySelector('#previewIcons');
const saveStatus = document.querySelector('#saveStatus');
const musicList = document.querySelector('#musicList');
const musicEmptyState = document.querySelector('#musicEmptyState');
const musicSaveStatus = document.querySelector('#musicSaveStatus');
const musicDialog = document.querySelector('#musicDialog');
const musicForm = document.querySelector('#musicForm');
const musicPreviewAudio = document.querySelector('#musicPreviewAudio');
const musicPreviewCard = document.querySelector('#musicPreviewCard');
const musicPreviewTitle = document.querySelector('#musicPreviewTitle');
const musicPreviewStatus = document.querySelector('#musicPreviewStatus');
const stopMusicPreviewButton = document.querySelector('#stopMusicPreview');
const wallpaperForm = document.querySelector('#wallpaperForm');
const wallpaperFile = document.querySelector('#wallpaperFile');
const uploadWallpaperButton = document.querySelector('#uploadWallpaperButton');
const deleteWallpaperButton = document.querySelector('#deleteWallpaperButton');
const wallpaperMessage = document.querySelector('#wallpaperMessage');
const wallpaperPreview = document.querySelector('#wallpaperPreview');
const wallpaperPreviewEmpty = document.querySelector('#wallpaperPreviewEmpty');
const wallpaperPreviewImage = document.querySelector('#wallpaperPreviewImage');
const wallpaperSaveStatus = document.querySelector('#wallpaperSaveStatus');
const itemDialog = document.querySelector('#itemDialog');
const itemForm = document.querySelector('#itemForm');
const deleteFolderDialog = document.querySelector('#deleteFolderDialog');
const passwordDialog = document.querySelector('#passwordDialog');
const toast = document.querySelector('#toast');

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.dataset.originalText ||= button.textContent;
  button.textContent = busy ? '正在处理…' : button.dataset.originalText;
}

async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  const isFormData = options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) headers['content-type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method) && state.csrfToken && path !== '/auth/login') {
    headers['x-csrf-token'] = state.csrfToken;
  }
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : (isFormData ? options.body : JSON.stringify(options.body))
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') showLogin('登录已过期，请重新登录。');
    const error = new Error(payload.message || `请求失败（${response.status}）`);
    error.status = response.status;
    error.code = payload.code || '';
    throw error;
  }
  return payload;
}

function showLogin(message = '', { clearPassword = true } = {}) {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginMessage.textContent = message;
  hideDashboardAlert();
  if (clearPassword) document.querySelector('#loginPassword').value = '';
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function hideDashboardAlert() {
  dashboardAlert.hidden = true;
  dashboardAlertMessage.textContent = '';
}

function showDashboardAlert(error) {
  dashboardAlertMessage.textContent = error?.message || '请稍后重试。';
  dashboardAlert.hidden = false;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2400);
}

function setSaveStatus(message, kind = '') {
  saveStatus.textContent = message;
  saveStatus.className = `preview-note${kind ? ` is-${kind}` : ''}`;
}

function setMusicSaveStatus(message, kind = '') {
  musicSaveStatus.textContent = message;
  musicSaveStatus.className = `preview-note${kind ? ` is-${kind}` : ''}`;
}

function faviconFor(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function makeIcon(item, className = 'item-icon') {
  const icon = document.createElement('span');
  icon.className = className;
  icon.style.setProperty('--item-color', item.color || '#e8d9dc');
  if (item.icon) {
    icon.textContent = item.icon;
  } else if (item.type === 'link' && faviconFor(item.url)) {
    const image = document.createElement('img');
    image.src = faviconFor(item.url);
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => { image.remove(); icon.textContent = '↗'; }, { once: true });
    icon.append(image);
  } else {
    icon.textContent = item.type === 'folder' ? '▰' : '↗';
  }
  return icon;
}

function button(label, action, title = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.dataset.action = action;
  if (title) element.title = title;
  return element;
}

function makeManagerItem(item, parentFolderId = '') {
  const article = document.createElement('article');
  article.className = 'manager-item';
  article.draggable = true;
  article.title = '拖动可排序，也可拖到左侧页面进行移动';
  article.dataset.managerId = item.id;
  article.dataset.managerType = item.type;
  article.dataset.parentFolder = parentFolderId;

  const row = document.createElement('div');
  row.className = 'item-row';
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.title = '拖动排序';

  const identity = document.createElement('div');
  identity.className = 'item-identity';
  identity.append(makeIcon(item));
  const copy = document.createElement('div');
  copy.className = 'item-copy';
  const name = document.createElement('strong');
  name.textContent = item.title;
  const detail = document.createElement('small');
  detail.textContent = item.type === 'folder' ? `${item.links.length} 个网址` : item.url;
  copy.append(name, detail);
  identity.append(copy);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.append(
    button('↑', 'move-up', '上移'),
    button('↓', 'move-down', '下移'),
    button('编辑 / 移动', 'edit'),
    button('删除', 'delete')
  );
  row.append(handle, identity, actions);
  article.append(row);

  if (item.type === 'folder') {
    const children = document.createElement('div');
    children.className = 'manager-list folder-children';
    children.dataset.dropList = '';
    children.dataset.folderId = item.id;
    item.links.forEach((link) => children.append(makeManagerItem(link, item.id)));
    if (!item.links.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'folder-empty';
      placeholder.textContent = '拖入网址，或编辑网址选择此文件夹';
      children.append(placeholder);
    }
    article.append(children);
  }
  return article;
}

function normalizeDesktopData(desktop) {
  if (!desktop || typeof desktop !== 'object') return null;
  if (Array.isArray(desktop.pages)) return desktop;
  if (!Array.isArray(desktop.items)) return { ...desktop, pages: [] };
  return {
    ...desktop,
    pages: [{
      id: 'desktop-page-home',
      name: '主页',
      position: 0,
      items: desktop.items
    }]
  };
}

function desktopPages() {
  return state.desktop?.pages || [];
}

function selectedPage() {
  return desktopPages().find((page) => page.id === state.selectedPageId) || desktopPages()[0] || null;
}

function selectedItems() {
  return selectedPage()?.items || [];
}

function syncSelectedPage(preferredId = state.selectedPageId) {
  const pages = desktopPages();
  state.selectedPageId = pages.some((page) => page.id === preferredId) ? preferredId : (pages[0]?.id || '');
}

function allFolders() {
  return selectedItems().filter((item) => item.type === 'folder');
}

function allLinks() {
  return selectedItems().flatMap((item) => item.type === 'folder' ? item.links : [item]);
}

function makePageManagerItem(page, index) {
  const article = document.createElement('article');
  article.className = 'desktop-page-manager-item';
  article.dataset.pageId = page.id;
  article.draggable = true;
  if (page.id === state.selectedPageId) article.classList.add('is-selected');

  const select = document.createElement('button');
  select.type = 'button';
  select.className = 'desktop-page-select';
  select.dataset.action = 'select-page';
  select.setAttribute('aria-pressed', String(page.id === state.selectedPageId));
  const order = document.createElement('span');
  order.className = 'desktop-page-order';
  order.textContent = String(index + 1).padStart(2, '0');
  const copy = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = page.name;
  const count = document.createElement('small');
  const links = page.items.flatMap((item) => item.type === 'folder' ? item.links : [item]);
  count.textContent = `${page.items.filter((item) => item.type === 'folder').length} 个文件夹 · ${links.length} 个网址`;
  copy.append(name, count);
  select.append(order, copy);

  const actions = document.createElement('div');
  actions.className = 'desktop-page-actions';
  actions.append(
    button('↑', 'move-page-up', '上移页面'),
    button('↓', 'move-page-down', '下移页面'),
    button('重命名', 'rename-page'),
    button('删除', 'delete-page')
  );
  article.append(select, actions);
  return article;
}

function renderPages() {
  desktopPageManagerList.replaceChildren();
  desktopPages().forEach((page, index) => desktopPageManagerList.append(makePageManagerItem(page, index)));
}

function renderPreview() {
  previewIcons.replaceChildren();
  const terminal = { type: 'link', title: '终端', icon: '$_', color: '#ef3f57' };
  [terminal, ...selectedItems()].slice(0, 11).forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-item';
    if (item.id) {
      wrapper.draggable = true;
      wrapper.dataset.managerId = item.id;
      wrapper.dataset.managerType = item.type;
      wrapper.title = '拖到左侧页面可跨页面移动';
    }
    wrapper.append(makeIcon(item, 'preview-item-icon'));
    const label = document.createElement('span');
    label.textContent = item.title;
    wrapper.append(label);
    previewIcons.append(wrapper);
  });
}

function render() {
  if (!state.desktop) return;
  syncSelectedPage();
  const page = selectedPage();
  const items = selectedItems();
  renderPages();
  desktopList.replaceChildren();
  items.forEach((item) => desktopList.append(makeManagerItem(item)));
  emptyState.hidden = items.length > 0;
  document.querySelector('#addFolderButton').disabled = !page;
  document.querySelector('#addLinkButton').disabled = !page;
  if (desktopContentTitle) desktopContentTitle.textContent = page ? `${page.name} · 页面内容` : '页面内容';
  document.querySelector('#folderCount').textContent = String(desktopPages().flatMap((entry) => entry.items).filter((item) => item.type === 'folder').length);
  document.querySelector('#linkCount').textContent = String(desktopPages().flatMap((entry) => entry.items).flatMap((item) => item.type === 'folder' ? item.links : [item]).length);
  document.querySelector('#versionCount').textContent = String(state.desktop.version || 1);
  renderPreview();
}

function musicTracks() {
  return state.music?.tracks || [];
}

function makeMusicManagerItem(track, index) {
  const article = document.createElement('article');
  article.className = 'manager-item music-manager-item';
  article.draggable = true;
  article.dataset.musicId = track.id;

  const row = document.createElement('div');
  row.className = 'item-row';

  const order = document.createElement('span');
  order.className = 'music-index';
  order.textContent = String(index + 1).padStart(2, '0');
  order.title = '拖动排序';

  const identity = document.createElement('div');
  identity.className = 'item-identity';
  const icon = document.createElement('span');
  icon.className = 'music-item-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '♫';
  const copy = document.createElement('div');
  copy.className = 'item-copy';
  const name = document.createElement('strong');
  name.textContent = track.title;
  const detail = document.createElement('small');
  detail.textContent = track.url;
  copy.append(name, detail);
  identity.append(icon, copy);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const isPreviewing = state.previewTrackId === track.id && !musicPreviewAudio.paused;
  const previewButton = button(isPreviewing ? '暂停' : '试听', 'preview-music');
  previewButton.setAttribute('aria-pressed', String(isPreviewing));
  actions.append(
    button('↑', 'move-music-up', '上移'),
    button('↓', 'move-music-down', '下移'),
    previewButton,
    button('编辑', 'edit-music'),
    button('删除', 'delete-music')
  );
  row.append(order, identity, actions);
  article.append(row);
  return article;
}

function renderMusic() {
  const tracks = musicTracks();
  musicList.replaceChildren();
  tracks.forEach((track, index) => musicList.append(makeMusicManagerItem(track, index)));
  musicEmptyState.hidden = tracks.length > 0;
  document.querySelector('#musicCount').textContent = String(tracks.length);
}

function openMusicDialog(track = null) {
  document.querySelector('#musicDialogTitle').textContent = track ? '编辑音乐' : '新增音乐';
  document.querySelector('#musicId').value = track?.id || '';
  document.querySelector('#musicTitle').value = track?.title || '';
  document.querySelector('#musicUrl').value = track?.url || '';
  document.querySelector('#musicMessage').textContent = '';
  musicDialog.showModal();
  document.querySelector('#musicTitle').focus();
}

function updateMusicPreview(viewState, track = null, message = '') {
  musicPreviewCard.dataset.previewState = viewState;
  musicPreviewTitle.textContent = track?.title || '点击列表中的“试听”';
  const labels = {
    idle: '尚未选择音乐',
    loading: '正在载入…',
    playing: '正在试听',
    paused: '试听已暂停',
    ended: '试听已结束',
    error: '这首音乐暂时无法播放'
  };
  musicPreviewStatus.textContent = message || labels[viewState] || labels.idle;
  stopMusicPreviewButton.disabled = !state.previewTrackId;
}

function stopMusicPreview({ clear = true } = {}) {
  musicPreviewAudio.pause();
  try { musicPreviewAudio.currentTime = 0; } catch { /* Metadata may not be ready yet. */ }
  if (clear) {
    state.previewTrackId = null;
    musicPreviewAudio.removeAttribute('src');
    musicPreviewAudio.load();
    updateMusicPreview('idle');
  }
  renderMusic();
}

async function toggleMusicPreview(track) {
  if (state.previewTrackId === track.id && !musicPreviewAudio.paused) {
    musicPreviewAudio.pause();
    return;
  }
  if (state.previewTrackId !== track.id) {
    state.previewTrackId = track.id;
    musicPreviewAudio.src = track.url;
    musicPreviewAudio.volume = 0.42;
    musicPreviewAudio.load();
    updateMusicPreview('loading', track);
  }
  try {
    await musicPreviewAudio.play();
  } catch {
    updateMusicPreview('error', track);
    renderMusic();
  }
}

async function loadDesktop() {
  setSaveStatus('正在读取页面数据…', 'saving');
  try {
    const desktop = await api('/desktop');
    state.desktop = normalizeDesktopData(desktop);
    syncSelectedPage();
    render();
    setSaveStatus('所有修改都会立即保存。');
  } catch (error) {
    setSaveStatus(`页面数据读取失败：${error.message}`, 'error');
    throw error;
  }
}

async function loadMusic() {
  setMusicSaveStatus('正在读取音乐库…', 'saving');
  const music = await api('/music');
  state.music = music;
  renderMusic();
  setMusicSaveStatus('所有修改都会立即保存。');
}

async function loadWallpaper() {
  setWallpaperStatus('正在读取壁纸配置…', 'saving');
  const result = await api('/admin/wallpaper', { cache: 'no-store' });
  state.wallpaper = result.wallpaper || null;
  renderWallpaper();
  setWallpaperStatus('所有修改都会立即保存。');
}

function setWallpaperStatus(message, kind = '') {
  wallpaperSaveStatus.textContent = message;
  wallpaperSaveStatus.className = `preview-note${kind ? ` is-${kind}` : ''}`;
}

function renderWallpaper() {
  const wallpaper = state.wallpaper;
  const configured = Boolean(wallpaper?.configured && wallpaper.url);
  wallpaperPreviewEmpty.hidden = configured;
  wallpaperPreviewImage.hidden = !configured;
  deleteWallpaperButton.hidden = !configured;
  if (configured) {
    wallpaperPreviewImage.src = `${wallpaper.url}&preview=${Date.now()}`;
  } else {
    wallpaperPreviewImage.removeAttribute('src');
  }
}

async function submitWallpaperUpload(event) {
  event.preventDefault();
  const file = wallpaperFile.files?.[0];
  if (!file) {
    wallpaperMessage.textContent = '请选择一张图片。';
    return;
  }
  if (file.size < 1 || file.size > MAX_WALLPAPER_BYTES) {
    wallpaperMessage.textContent = '壁纸文件不能超过 30 MB。';
    return;
  }
  const submit = uploadWallpaperButton;
  const formData = new FormData();
  formData.append('wallpaper', file);
  setBusy(submit, true);
  wallpaperMessage.textContent = '';
  setWallpaperStatus('正在上传壁纸…', 'saving');
  try {
    const result = await api('/admin/wallpaper', { method: 'POST', body: formData });
    state.wallpaper = result.wallpaper || null;
    renderWallpaper();
    wallpaperForm.reset();
    setWallpaperStatus('已保存，OS 页面刷新后立即生效。');
    showToast('桌面壁纸已更新');
  } catch (error) {
    wallpaperMessage.textContent = error.message;
    setWallpaperStatus(error.message, 'error');
  } finally {
    setBusy(submit, false);
  }
}

async function deleteWallpaper() {
  if (!state.wallpaper?.configured || !window.confirm('确定删除当前桌面壁纸吗？')) return;
  setBusy(deleteWallpaperButton, true);
  wallpaperMessage.textContent = '';
  setWallpaperStatus('正在删除壁纸…', 'saving');
  try {
    const result = await api('/admin/wallpaper', { method: 'DELETE' });
    state.wallpaper = result.wallpaper || null;
    renderWallpaper();
    setWallpaperStatus('已删除，OS 页面将恢复默认背景。');
    showToast('桌面壁纸已删除');
  } catch (error) {
    wallpaperMessage.textContent = error.message;
    setWallpaperStatus(error.message, 'error');
  } finally {
    setBusy(deleteWallpaperButton, false);
  }
}

async function loadDashboardData() {
  const [desktopResult, musicResult, wallpaperResult] = await Promise.allSettled([
    loadDesktop(),
    loadMusic(),
    loadWallpaper()
  ]);
  if (desktopResult.status === 'rejected') throw desktopResult.reason;
  if (musicResult.status === 'rejected') {
    state.music = { version: 1, updatedAt: 0, tracks: [] };
    renderMusic();
    setMusicSaveStatus(`音乐库读取失败：${musicResult.reason.message}`, 'error');
  }
  if (wallpaperResult.status === 'rejected') {
    state.wallpaper = null;
    renderWallpaper();
    setWallpaperStatus(`壁纸配置读取失败：${wallpaperResult.reason.message}`, 'error');
  }
}

async function refreshDashboardData() {
  hideDashboardAlert();
  setBusy(retryDashboardButton, true);
  try {
    await loadDashboardData();
    return true;
  } catch (error) {
    showDashboardAlert(error);
    return false;
  } finally {
    setBusy(retryDashboardButton, false);
  }
}

async function saveResult(promise, successMessage) {
  setSaveStatus('正在保存到云端…', 'saving');
  try {
    const result = await promise;
    if (result.desktop) {
      state.desktop = normalizeDesktopData(result.desktop);
      syncSelectedPage();
    }
    render();
    setSaveStatus('已保存，公开导航刷新后立即生效。');
    showToast(successMessage);
    return result;
  } catch (error) {
    setSaveStatus(error.message, 'error');
    throw error;
  }
}

async function saveMusicResult(promise, successMessage) {
  setMusicSaveStatus('正在保存到云端…', 'saving');
  try {
    const result = await promise;
    if (result.music) state.music = result.music;
    renderMusic();
    setMusicSaveStatus('已保存，公开页面刷新后立即生效。');
    showToast(successMessage);
    return result;
  } catch (error) {
    setMusicSaveStatus(error.message, 'error');
    throw error;
  }
}

function foldersForPage(pageId) {
  return desktopPages().find((page) => page.id === pageId)?.items
    .filter((item) => item.type === 'folder') || [];
}

function populateItemFolderOptions(pageId, selectedFolderId = '') {
  const folderSelect = document.querySelector('#itemFolder');
  folderSelect.replaceChildren(new Option('当前页面', ''));
  foldersForPage(pageId).forEach((folder) => folderSelect.add(new Option(folder.title, folder.id)));
  folderSelect.value = selectedFolderId;
}

function openItemDialog(type, item = null, parentFolderId = '') {
  const isFolder = type === 'folder';
  const pageId = item?.pageId || state.selectedPageId;
  document.querySelector('#itemDialogTitle').textContent = item ? `编辑${isFolder ? '文件夹' : '网址'}` : `新增${isFolder ? '文件夹' : '网址'}`;
  document.querySelector('#nameLabel').textContent = isFolder ? '文件夹名称' : '网址名称';
  document.querySelector('#itemId').value = item?.id || '';
  document.querySelector('#itemType').value = type;
  document.querySelector('#itemName').value = item?.title || '';
  document.querySelector('#itemUrl').value = item?.url || '';
  document.querySelector('#itemIcon').value = item?.icon || '';
  document.querySelector('#itemColor').value = item?.color || (isFolder ? '#f4c84a' : '#e8d9dc');
  document.querySelector('#itemOpenMode').value = item?.openMode || 'auto';
  document.querySelectorAll('.link-field').forEach((field) => { field.hidden = isFolder; });
  const pageSelect = document.querySelector('#itemPage');
  pageSelect.replaceChildren(...desktopPages().map((page) => new Option(page.name, page.id)));
  pageSelect.value = pageId;
  populateItemFolderOptions(pageId, parentFolderId);
  document.querySelector('#itemMessage').textContent = '';
  itemDialog.showModal();
  document.querySelector('#itemName').focus();
}

function findItem(id) {
  for (const item of selectedItems()) {
    if (item.id === id) return { item, parentFolderId: '' };
    if (item.type === 'folder') {
      const link = item.links.find((child) => child.id === id);
      if (link) return { item: link, parentFolderId: item.id };
    }
  }
  return null;
}

function layoutPayload() {
  return {
    version: Number(state.desktop?.version || 0),
    pageId: state.selectedPageId,
    topLevel: selectedItems().map((item) => ({ id: item.id, type: item.type })),
    folders: Object.fromEntries(allFolders().map((folder) => [folder.id, folder.links.map((link) => link.id)]))
  };
}

function removeItemFromState(id) {
  const items = selectedItems();
  const topIndex = items.findIndex((item) => item.id === id);
  if (topIndex >= 0) return items.splice(topIndex, 1)[0];
  for (const folder of allFolders()) {
    const childIndex = folder.links.findIndex((link) => link.id === id);
    if (childIndex >= 0) return folder.links.splice(childIndex, 1)[0];
  }
  return null;
}

function directDropIndex(list, eventTarget) {
  let target = eventTarget.closest?.('[data-manager-id]');
  while (target && target.parentElement !== list) target = target.parentElement?.closest?.('[data-manager-id]');
  if (!target) return list.querySelectorAll(':scope > [data-manager-id]').length;
  return [...list.children].indexOf(target);
}

function createLatestSaveQueue({ payload, save, apply, renderView, setStatus, successMessage, reload }) {
  let running = false;
  let pending = false;
  let waiters = [];

  async function drain() {
    if (running) return;
    running = true;
    let failed = false;
    try {
      while (pending) {
        pending = false;
        const currentPayload = payload();
        setStatus('正在保存到云端…', 'saving');
        try {
          const result = await save(currentPayload);
          apply(result, pending);
          if (!pending) {
            renderView();
            setStatus('已保存，公开页面刷新后立即生效。');
            showToast(successMessage);
          }
        } catch (error) {
          failed = true;
          pending = false;
          setStatus(error.message, 'error');
          showToast(error.message);
          try { await reload(); } catch { /* Keep the visible layout if the network is unavailable. */ }
          break;
        }
      }
    } finally {
      running = false;
      const settled = waiters;
      waiters = [];
      settled.forEach(({ resolve, reject }) => (failed ? reject(new Error('保存失败。')) : resolve()));
      if (pending) drain();
    }
  }

  return function enqueue() {
    renderView();
    pending = true;
    const completion = new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    drain();
    return completion;
  };
}

function applyDesktopLayoutResult(result, preserveLocalOrder) {
  if (!result.desktop) throw new Error('服务器没有返回页面数据。');
  const desktop = normalizeDesktopData(result.desktop);
  if (!preserveLocalOrder) {
    if (!state.desktop || desktop.version >= state.desktop.version) state.desktop = desktop;
    return;
  }
  state.desktop.version = Math.max(state.desktop.version, desktop.version);
  state.desktop.updatedAt = Math.max(state.desktop.updatedAt, desktop.updatedAt);
}

const enqueueDesktopLayoutSave = createLatestSaveQueue({
  payload: layoutPayload,
  save: (body) => api('/admin/layout', { method: 'PUT', body }),
  apply: applyDesktopLayoutResult,
  renderView: render,
  setStatus: setSaveStatus,
  successMessage: '页面内容排序已保存',
  reload: loadDesktop
});

function persistLayout() {
  return enqueueDesktopLayoutSave().catch(() => {});
}

function pageLayoutPayload() {
  return {
    version: Number(state.desktop?.version || 0),
    ids: desktopPages().map((page) => page.id)
  };
}

const enqueuePageLayoutSave = createLatestSaveQueue({
  payload: pageLayoutPayload,
  save: (body) => api('/admin/pages/layout', { method: 'PUT', body }),
  apply: applyDesktopLayoutResult,
  renderView: render,
  setStatus: setSaveStatus,
  successMessage: '页面顺序已保存',
  reload: loadDesktop
});

function persistPageLayout() {
  return enqueuePageLayoutSave().catch(() => {});
}

function openPageDialog(page = null) {
  document.querySelector('#pageDialogTitle').textContent = page ? '重命名页面' : '新增页面';
  document.querySelector('#pageId').value = page?.id || '';
  document.querySelector('#pageName').value = page?.name || '';
  document.querySelector('#pageMessage').textContent = '';
  pageDialog.showModal();
  document.querySelector('#pageName').focus();
}

function openDeletePageDialog(page) {
  const targets = desktopPages().filter((candidate) => candidate.id !== page.id);
  if (!targets.length) {
    showToast('至少需要保留一个页面。');
    return;
  }
  state.pendingPageDelete = page.id;
  const select = document.querySelector('#deletePageTarget');
  select.replaceChildren(...targets.map((target) => new Option(target.name, target.id)));
  document.querySelector('#deletePageMessage').textContent = '';
  deletePageDialog.showModal();
  select.focus();
}

function findDesktopItem(desktop, itemId) {
  for (const page of desktop.pages || []) {
    for (const item of page.items || []) {
      if (item.id === itemId) return item;
      if (item.type === 'folder') {
        const child = item.links.find((link) => link.id === itemId);
        if (child) return child;
      }
    }
  }
  return null;
}

function itemBelongsToPage(desktop, itemId, pageId) {
  const page = (desktop.pages || []).find((entry) => entry.id === pageId);
  if (!page) return false;
  return Boolean(findDesktopItem({ pages: [page] }, itemId));
}

async function moveItemToPage(item, targetPageId) {
  if (!item || item.pageId === targetPageId) return;
  const isFolder = item.type === 'folder';
  const body = isFolder ? {
    name: item.title,
    icon: item.icon,
    color: item.color,
    pageId: targetPageId
  } : {
    title: item.title,
    url: item.url,
    icon: item.icon,
    color: item.color,
    openMode: item.openMode,
    pageId: targetPageId,
    folderId: null
  };
  const collection = isFolder ? 'folders' : 'links';
  setSaveStatus('正在移动到目标页面…', 'saving');
  const result = await api(`/admin/${collection}/${encodeURIComponent(item.id)}`, { method: 'PATCH', body });
  const returnedDesktop = normalizeDesktopData(result.desktop);
  if (!itemBelongsToPage(returnedDesktop, item.id, targetPageId)) {
    throw new Error('服务器没有确认项目已移动，请刷新后重试。');
  }
  const persistedDesktop = normalizeDesktopData(await api('/desktop', { cache: 'no-store' }));
  if (!itemBelongsToPage(persistedDesktop, item.id, targetPageId)) {
    throw new Error('项目移动没有持久化，请刷新后重试。');
  }
  state.desktop = persistedDesktop;
  state.selectedPageId = targetPageId;
  syncSelectedPage(targetPageId);
  render();
  setSaveStatus('已移动，目标页面已切换为当前预览。');
  showToast(`“${item.title}”已移动到当前预览页面`);
}

function draggedItem() {
  return state.dragItem ? findItem(state.dragItem.id)?.item || null : null;
}

function clearPageDropTargets() {
  desktopPageManagerList.querySelectorAll('.is-item-drop-target')
    .forEach((item) => item.classList.remove('is-item-drop-target'));
}

desktopPageManagerList.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  const item = event.target.closest('[data-page-id]');
  if (!actionButton || !item) return;
  const pages = desktopPages();
  const index = pages.findIndex((page) => page.id === item.dataset.pageId);
  if (index < 0) return;
  const page = pages[index];
  const action = actionButton.dataset.action;
  if (action === 'select-page') {
    state.selectedPageId = page.id;
    render();
    return;
  }
  if (action === 'rename-page') {
    openPageDialog(page);
    return;
  }
  if (action === 'delete-page') {
    openDeletePageDialog(page);
    return;
  }
  if (action === 'move-page-up' || action === 'move-page-down') {
    const nextIndex = action === 'move-page-up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= pages.length) return;
    [pages[index], pages[nextIndex]] = [pages[nextIndex], pages[index]];
    persistPageLayout();
  }
});

desktopPageManagerList.addEventListener('dragstart', (event) => {
  const item = event.target.closest('[data-page-id]');
  if (!item) return;
  state.dragPageId = item.dataset.pageId;
  item.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', state.dragPageId);
});

desktopPageManagerList.addEventListener('dragend', (event) => {
  event.target.closest('[data-page-id]')?.classList.remove('is-dragging');
  desktopPageManagerList.classList.remove('drag-over');
  clearPageDropTargets();
  state.dragPageId = null;
});

desktopPageManagerList.addEventListener('dragover', (event) => {
  if (state.dragItem) {
    const target = event.target.closest('[data-page-id]');
    const moving = draggedItem();
    if (!target || !moving || moving.pageId === target.dataset.pageId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearPageDropTargets();
    target.classList.add('is-item-drop-target');
    return;
  }
  if (!state.dragPageId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  desktopPageManagerList.classList.add('drag-over');
});

desktopPageManagerList.addEventListener('dragleave', (event) => {
  if (!desktopPageManagerList.contains(event.relatedTarget)) clearPageDropTargets();
});

desktopPageManagerList.addEventListener('drop', async (event) => {
  if (state.dragItem) {
    const target = event.target.closest('[data-page-id]');
    const moving = draggedItem();
    if (!target || !moving || moving.pageId === target.dataset.pageId) return;
    event.preventDefault();
    clearPageDropTargets();
    try {
      await moveItemToPage(moving, target.dataset.pageId);
    } catch (error) {
      setSaveStatus(error.message, 'error');
      showToast(error.message);
    }
    return;
  }
  if (!state.dragPageId) return;
  event.preventDefault();
  desktopPageManagerList.classList.remove('drag-over');
  const pages = desktopPages();
  const sourceIndex = pages.findIndex((page) => page.id === state.dragPageId);
  const target = event.target.closest('[data-page-id]');
  let targetIndex = target ? pages.findIndex((page) => page.id === target.dataset.pageId) : pages.length;
  if (sourceIndex < 0 || targetIndex === sourceIndex) return;
  const [moving] = pages.splice(sourceIndex, 1);
  if (sourceIndex < targetIndex) targetIndex -= 1;
  pages.splice(Math.max(0, targetIndex), 0, moving);
  persistPageLayout();
});

function startItemDrag(event) {
  const item = event.target.closest('[data-manager-id]');
  if (!item) return;
  state.dragItem = { id: item.dataset.managerId, type: item.dataset.managerType };
  item.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item.dataset.managerId);
}

function endItemDrag(event) {
  event.target.closest('[data-manager-id]')?.classList.remove('is-dragging');
  document.querySelectorAll('.drag-over').forEach((element) => element.classList.remove('drag-over'));
  clearPageDropTargets();
  state.dragItem = null;
}

desktopList.addEventListener('dragstart', startItemDrag);
desktopList.addEventListener('dragend', endItemDrag);
previewIcons.addEventListener('dragstart', startItemDrag);
previewIcons.addEventListener('dragend', endItemDrag);

desktopList.addEventListener('dragover', (event) => {
  const list = event.target.closest('[data-drop-list]');
  if (!list || !state.dragItem) return;
  if (state.dragItem.type === 'folder' && list.dataset.folderId) return;
  event.preventDefault();
  document.querySelectorAll('.drag-over').forEach((element) => { if (element !== list) element.classList.remove('drag-over'); });
  list.classList.add('drag-over');
});

desktopList.addEventListener('drop', (event) => {
  const list = event.target.closest('[data-drop-list]');
  if (!list || !state.dragItem || (state.dragItem.type === 'folder' && list.dataset.folderId)) return;
  event.preventDefault();
  const index = directDropIndex(list, event.target);
  const moving = removeItemFromState(state.dragItem.id);
  if (!moving) return;
  if (list.dataset.folderId) {
    const folder = allFolders().find((item) => item.id === list.dataset.folderId);
    folder?.links.splice(Math.max(0, index), 0, moving);
  } else {
    selectedItems().splice(Math.max(0, index), 0, moving);
  }
  persistLayout();
});

desktopList.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-action]');
  const itemElement = event.target.closest('[data-manager-id]');
  if (!actionButton || !itemElement) return;
  const found = findItem(itemElement.dataset.managerId);
  if (!found) return;
  const { item, parentFolderId } = found;
  const action = actionButton.dataset.action;
  if (action === 'edit') openItemDialog(item.type, item, parentFolderId);
  if (action === 'delete') {
    if (item.type === 'folder' && item.links.length) {
      state.pendingFolderDelete = item.id;
      deleteFolderDialog.showModal();
      return;
    }
    if (!window.confirm(`确定删除“${item.title}”吗？`)) return;
    try {
      const path = item.type === 'folder' ? `/admin/folders/${encodeURIComponent(item.id)}` : `/admin/links/${encodeURIComponent(item.id)}`;
      await saveResult(api(path, { method: 'DELETE' }), `${item.title} 已删除`);
    } catch (error) { showToast(error.message); }
  }
  if (action === 'move-up' || action === 'move-down') {
    const collection = parentFolderId
      ? allFolders().find((folder) => folder.id === parentFolderId).links
      : selectedItems();
    const index = collection.findIndex((entry) => entry.id === item.id);
    const nextIndex = action === 'move-up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= collection.length) return;
    [collection[index], collection[nextIndex]] = [collection[nextIndex], collection[index]];
    persistLayout();
  }
});

function musicLayoutPayload() {
  return {
    version: Number(state.music?.version || 0),
    ids: musicTracks().map((track) => track.id)
  };
}

function applyMusicLayoutResult(result, preserveLocalOrder) {
  if (!result.music) throw new Error('服务器没有返回音乐数据。');
  if (!preserveLocalOrder) {
    if (!state.music || result.music.version >= state.music.version) state.music = result.music;
    return;
  }
  state.music.version = Math.max(state.music.version, result.music.version);
  state.music.updatedAt = Math.max(state.music.updatedAt, result.music.updatedAt);
}

const enqueueMusicLayoutSave = createLatestSaveQueue({
  payload: musicLayoutPayload,
  save: (body) => api('/admin/music/layout', { method: 'PUT', body }),
  apply: applyMusicLayoutResult,
  renderView: renderMusic,
  setStatus: setMusicSaveStatus,
  successMessage: '音乐顺序已保存',
  reload: loadMusic
});

function persistMusicLayout() {
  return enqueueMusicLayoutSave().catch(() => {});
}

musicList.addEventListener('dragstart', (event) => {
  const item = event.target.closest('[data-music-id]');
  if (!item) return;
  state.dragMusicId = item.dataset.musicId;
  item.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', state.dragMusicId);
});

musicList.addEventListener('dragend', (event) => {
  event.target.closest('[data-music-id]')?.classList.remove('is-dragging');
  musicList.classList.remove('drag-over');
  state.dragMusicId = null;
});

musicList.addEventListener('dragover', (event) => {
  if (!state.dragMusicId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  musicList.classList.add('drag-over');
});

musicList.addEventListener('dragleave', (event) => {
  if (!musicList.contains(event.relatedTarget)) musicList.classList.remove('drag-over');
});

musicList.addEventListener('drop', (event) => {
  if (!state.dragMusicId) return;
  event.preventDefault();
  musicList.classList.remove('drag-over');
  const tracks = musicTracks();
  const movingIndex = tracks.findIndex((track) => track.id === state.dragMusicId);
  if (movingIndex < 0) return;
  const target = event.target.closest('[data-music-id]');
  let targetIndex = target ? tracks.findIndex((track) => track.id === target.dataset.musicId) : tracks.length;
  if (targetIndex === movingIndex) return;
  const [moving] = tracks.splice(movingIndex, 1);
  if (movingIndex < targetIndex) targetIndex -= 1;
  tracks.splice(Math.max(0, targetIndex), 0, moving);
  persistMusicLayout();
});

musicList.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-action]');
  const itemElement = event.target.closest('[data-music-id]');
  if (!actionButton || !itemElement) return;
  const tracks = musicTracks();
  const index = tracks.findIndex((track) => track.id === itemElement.dataset.musicId);
  if (index < 0) return;
  const track = tracks[index];
  const action = actionButton.dataset.action;

  if (action === 'preview-music') {
    await toggleMusicPreview(track);
    return;
  }
  if (action === 'edit-music') {
    openMusicDialog(track);
    return;
  }
  if (action === 'delete-music') {
    if (!window.confirm(`确定删除“${track.title}”吗？`)) return;
    if (state.previewTrackId === track.id) stopMusicPreview();
    try {
      await saveMusicResult(
        api(`/admin/music/${encodeURIComponent(track.id)}`, { method: 'DELETE' }),
        `${track.title} 已删除`
      );
    } catch (error) { showToast(error.message); }
    return;
  }
  if (action === 'move-music-up' || action === 'move-music-down') {
    const nextIndex = action === 'move-music-up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= tracks.length) return;
    [tracks[index], tracks[nextIndex]] = [tracks[nextIndex], tracks[index]];
    await persistMusicLayout();
  }
});

pageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = pageForm.querySelector('[type="submit"]');
  const id = document.querySelector('#pageId').value;
  const name = document.querySelector('#pageName').value;
  setBusy(submit, true);
  document.querySelector('#pageMessage').textContent = '';
  try {
    const result = await saveResult(
      api(`/admin/pages${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PATCH' : 'POST',
        body: { name }
      }),
      id ? '页面名称已更新' : '页面已添加'
    );
    const savedPage = result.desktop?.pages?.find((page) => id ? page.id === id : page.name === name.trim());
    if (savedPage) state.selectedPageId = savedPage.id;
    render();
    pageDialog.close();
  } catch (error) {
    document.querySelector('#pageMessage').textContent = error.message;
  } finally {
    setBusy(submit, false);
  }
});

deletePageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const pageId = state.pendingPageDelete;
  const targetPageId = document.querySelector('#deletePageTarget').value;
  if (!pageId || !targetPageId) return;
  const submit = deletePageForm.querySelector('[type="submit"]');
  setBusy(submit, true);
  document.querySelector('#deletePageMessage').textContent = '';
  try {
    state.selectedPageId = targetPageId;
    await saveResult(
      api(`/admin/pages/${encodeURIComponent(pageId)}?targetPageId=${encodeURIComponent(targetPageId)}`, { method: 'DELETE' }),
      '页面内容已迁移，页面已删除'
    );
    state.pendingPageDelete = null;
    deletePageDialog.close();
  } catch (error) {
    document.querySelector('#deletePageMessage').textContent = error.message;
  } finally {
    setBusy(submit, false);
  }
});

document.querySelector('#itemPage').addEventListener('change', (event) => {
  populateItemFolderOptions(event.target.value);
});

itemForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = itemForm.querySelector('[type="submit"]');
  const type = document.querySelector('#itemType').value;
  const id = document.querySelector('#itemId').value;
  const pageId = document.querySelector('#itemPage').value;
  const body = type === 'folder' ? {
    name: document.querySelector('#itemName').value,
    icon: document.querySelector('#itemIcon').value,
    color: document.querySelector('#itemColor').value,
    pageId
  } : {
    title: document.querySelector('#itemName').value,
    url: document.querySelector('#itemUrl').value,
    icon: document.querySelector('#itemIcon').value,
    color: document.querySelector('#itemColor').value,
    pageId,
    folderId: document.querySelector('#itemFolder').value || null,
    openMode: document.querySelector('#itemOpenMode').value
  };
  const collection = type === 'folder' ? 'folders' : 'links';
  const path = `/admin/${collection}${id ? `/${encodeURIComponent(id)}` : ''}`;
  setBusy(submit, true);
  document.querySelector('#itemMessage').textContent = '';
  try {
    await saveResult(api(path, { method: id ? 'PATCH' : 'POST', body }), id ? '修改已保存' : '新项目已添加');
    itemDialog.close();
  } catch (error) {
    document.querySelector('#itemMessage').textContent = error.message;
  } finally { setBusy(submit, false); }
});

musicForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = musicForm.querySelector('[type="submit"]');
  const id = document.querySelector('#musicId').value;
  const body = {
    title: document.querySelector('#musicTitle').value,
    url: document.querySelector('#musicUrl').value
  };
  const path = `/admin/music${id ? `/${encodeURIComponent(id)}` : ''}`;
  setBusy(submit, true);
  document.querySelector('#musicMessage').textContent = '';
  try {
    const result = await saveMusicResult(
      api(path, { method: id ? 'PATCH' : 'POST', body }),
      id ? '音乐修改已保存' : '音乐已添加'
    );
    if (id && state.previewTrackId === id) {
      const updated = result.music?.tracks?.find((track) => track.id === id);
      if (updated) {
        state.previewTrackId = updated.id;
        musicPreviewAudio.src = updated.url;
        musicPreviewAudio.load();
        updateMusicPreview('paused', updated, '音乐已更新，可重新试听');
      }
    }
    musicDialog.close();
  } catch (error) {
    document.querySelector('#musicMessage').textContent = error.message;
  } finally { setBusy(submit, false); }
});

async function deletePendingFolder(mode) {
  if (!state.pendingFolderDelete) return;
  const id = state.pendingFolderDelete;
  state.pendingFolderDelete = null;
  deleteFolderDialog.close();
  try {
    await saveResult(api(`/admin/folders/${encodeURIComponent(id)}?mode=${mode}`, { method: 'DELETE' }), '文件夹已删除');
  } catch (error) { showToast(error.message); }
}

document.querySelector('#moveFolderLinksButton').addEventListener('click', () => deletePendingFolder('move'));
document.querySelector('#deleteFolderLinksButton').addEventListener('click', () => deletePendingFolder('delete'));
document.querySelector('#addDesktopPageButton').addEventListener('click', () => openPageDialog());
document.querySelector('#addFolderButton').addEventListener('click', () => openItemDialog('folder'));
document.querySelector('#addLinkButton').addEventListener('click', () => openItemDialog('link'));
document.querySelector('#addMusicButton').addEventListener('click', () => openMusicDialog());
wallpaperForm.addEventListener('submit', submitWallpaperUpload);
deleteWallpaperButton.addEventListener('click', deleteWallpaper);
stopMusicPreviewButton.addEventListener('click', () => stopMusicPreview());

musicPreviewAudio.addEventListener('play', () => {
  const track = musicTracks().find((entry) => entry.id === state.previewTrackId);
  updateMusicPreview('playing', track);
  renderMusic();
});

musicPreviewAudio.addEventListener('pause', () => {
  if (!state.previewTrackId || musicPreviewAudio.ended) return;
  const track = musicTracks().find((entry) => entry.id === state.previewTrackId);
  updateMusicPreview('paused', track);
  renderMusic();
});

musicPreviewAudio.addEventListener('ended', () => {
  const track = musicTracks().find((entry) => entry.id === state.previewTrackId);
  updateMusicPreview('ended', track);
  renderMusic();
});

musicPreviewAudio.addEventListener('error', () => {
  const track = musicTracks().find((entry) => entry.id === state.previewTrackId);
  updateMusicPreview('error', track);
  renderMusic();
});

function selectAdminSection(sectionName) {
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.hidden = section.dataset.adminSection !== sectionName;
  });
  document.querySelectorAll('[data-admin-tab]').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.adminTab === sectionName));
  });
}

document.querySelectorAll('[data-admin-tab]').forEach((tab) => {
  tab.addEventListener('click', () => selectAdminSection(tab.dataset.adminTab));
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector('[type="submit"]');
  setBusy(submit, true);
  loginMessage.textContent = '';
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: {
        username: document.querySelector('#loginUsername').value,
        password: document.querySelector('#loginPassword').value
      }
    });
    state.csrfToken = result.csrfToken;
    showDashboard();
    await refreshDashboardData();
  } catch (error) { loginMessage.textContent = error.message; }
  finally { setBusy(submit, false); }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear the local view even if the session expired. */ }
  state.csrfToken = '';
  state.desktop = null;
  state.selectedPageId = '';
  state.music = null;
  state.wallpaper = null;
  stopMusicPreview();
  document.querySelector('#musicCount').textContent = '0';
  showLogin('已经安全退出。');
});

document.querySelector('#passwordButton').addEventListener('click', () => {
  document.querySelector('#passwordForm').reset();
  document.querySelector('#passwordMessage').textContent = '';
  passwordDialog.showModal();
});

document.querySelector('#passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type="submit"]');
  const message = document.querySelector('#passwordMessage');
  const currentPassword = document.querySelector('#currentPassword').value;
  const newPassword = document.querySelector('#newPassword').value;
  const confirmPassword = document.querySelector('#confirmPassword').value;
  if (newPassword !== confirmPassword) { message.textContent = '两次输入的新密码不一致。'; return; }
  setBusy(submit, true);
  try {
    await api('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
    passwordDialog.close();
    showToast('管理员密码已更新');
  } catch (error) { message.textContent = error.message; }
  finally { setBusy(submit, false); }
});

document.querySelectorAll('[data-close-dialog]').forEach((buttonElement) => {
  buttonElement.addEventListener('click', () => document.querySelector(`#${buttonElement.dataset.closeDialog}`)?.close());
});

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
});

async function boot() {
  try {
    const session = await api('/auth/session');
    if (!session.authenticated) { showLogin('', { clearPassword: false }); return; }
    state.csrfToken = session.csrfToken;
    showDashboard();
    await refreshDashboardData();
  } catch (error) {
    showLogin(`后台服务暂时不可用：${error.message}`);
  }
}

retryDashboardButton.addEventListener('click', refreshDashboardData);
boot();
