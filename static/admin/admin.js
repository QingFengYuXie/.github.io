const API_ROOT = '/api/v1';
const state = {
  csrfToken: '',
  desktop: null,
  music: null,
  pendingFolderDelete: null,
  dragItem: null,
  dragMusicId: null,
  previewTrackId: null
};

const loginView = document.querySelector('#loginView');
const dashboardView = document.querySelector('#dashboardView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const desktopList = document.querySelector('#desktopList');
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
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method) && state.csrfToken && path !== '/auth/login') {
    headers['x-csrf-token'] = state.csrfToken;
  }
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') showLogin('登录已过期，请重新登录。');
    throw new Error(payload.message || `请求失败（${response.status}）`);
  }
  return payload;
}

function showLogin(message = '', { clearPassword = true } = {}) {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginMessage.textContent = message;
  if (clearPassword) document.querySelector('#loginPassword').value = '';
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
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
    button('编辑', 'edit'),
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

function allFolders() {
  return (state.desktop?.items || []).filter((item) => item.type === 'folder');
}

function allLinks() {
  return (state.desktop?.items || []).flatMap((item) => item.type === 'folder' ? item.links : [item]);
}

function renderPreview() {
  previewIcons.replaceChildren();
  const terminal = { type: 'link', title: '终端', icon: '$_', color: '#ef3f57' };
  [terminal, ...(state.desktop?.items || [])].slice(0, 11).forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-item';
    wrapper.append(makeIcon(item, 'preview-item-icon'));
    const label = document.createElement('span');
    label.textContent = item.title;
    wrapper.append(label);
    previewIcons.append(wrapper);
  });
}

function render() {
  if (!state.desktop) return;
  desktopList.replaceChildren();
  state.desktop.items.forEach((item) => desktopList.append(makeManagerItem(item)));
  emptyState.hidden = state.desktop.items.length > 0;
  document.querySelector('#folderCount').textContent = String(allFolders().length);
  document.querySelector('#linkCount').textContent = String(allLinks().length);
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
  setSaveStatus('正在读取桌面数据…', 'saving');
  const desktop = await api('/desktop');
  state.desktop = desktop;
  render();
  setSaveStatus('所有修改都会立即保存。');
}

async function loadMusic() {
  setMusicSaveStatus('正在读取音乐库…', 'saving');
  const music = await api('/music');
  state.music = music;
  renderMusic();
  setMusicSaveStatus('所有修改都会立即保存。');
}

async function loadDashboardData() {
  const [desktopResult, musicResult] = await Promise.allSettled([loadDesktop(), loadMusic()]);
  if (desktopResult.status === 'rejected') throw desktopResult.reason;
  if (musicResult.status === 'rejected') {
    state.music = { version: 1, updatedAt: 0, tracks: [] };
    renderMusic();
    setMusicSaveStatus(`音乐库读取失败：${musicResult.reason.message}`, 'error');
  }
}

async function saveResult(promise, successMessage) {
  setSaveStatus('正在保存到云端…', 'saving');
  try {
    const result = await promise;
    if (result.desktop) state.desktop = result.desktop;
    render();
    setSaveStatus('已保存，公开桌面刷新后立即生效。');
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

function openItemDialog(type, item = null, parentFolderId = '') {
  const isFolder = type === 'folder';
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
  const folderSelect = document.querySelector('#itemFolder');
  folderSelect.replaceChildren(new Option('桌面', ''));
  allFolders().forEach((folder) => folderSelect.add(new Option(folder.title, folder.id)));
  folderSelect.value = parentFolderId;
  document.querySelector('#itemMessage').textContent = '';
  itemDialog.showModal();
  document.querySelector('#itemName').focus();
}

function findItem(id) {
  for (const item of state.desktop.items) {
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
    topLevel: state.desktop.items.map((item) => ({ id: item.id, type: item.type })),
    folders: Object.fromEntries(allFolders().map((folder) => [folder.id, folder.links.map((link) => link.id)]))
  };
}

function removeItemFromState(id) {
  const topIndex = state.desktop.items.findIndex((item) => item.id === id);
  if (topIndex >= 0) return state.desktop.items.splice(topIndex, 1)[0];
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

async function persistLayout() {
  render();
  try {
    await saveResult(api('/admin/layout', { method: 'PUT', body: layoutPayload() }), '桌面排序已保存');
  } catch (error) {
    showToast(error.message);
    try { await loadDesktop(); } catch { /* Keep the visible layout if the network is unavailable. */ }
  }
}

desktopList.addEventListener('dragstart', (event) => {
  const item = event.target.closest('[data-manager-id]');
  if (!item) return;
  state.dragItem = { id: item.dataset.managerId, type: item.dataset.managerType };
  item.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item.dataset.managerId);
});

desktopList.addEventListener('dragend', (event) => {
  event.target.closest('[data-manager-id]')?.classList.remove('is-dragging');
  document.querySelectorAll('.drag-over').forEach((element) => element.classList.remove('drag-over'));
  state.dragItem = null;
});

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
    state.desktop.items.splice(Math.max(0, index), 0, moving);
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
      : state.desktop.items;
    const index = collection.findIndex((entry) => entry.id === item.id);
    const nextIndex = action === 'move-up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= collection.length) return;
    [collection[index], collection[nextIndex]] = [collection[nextIndex], collection[index]];
    persistLayout();
  }
});

function musicLayoutPayload() {
  return { ids: musicTracks().map((track) => track.id) };
}

async function persistMusicLayout() {
  renderMusic();
  try {
    await saveMusicResult(
      api('/admin/music/layout', { method: 'PUT', body: musicLayoutPayload() }),
      '音乐顺序已保存'
    );
  } catch (error) {
    showToast(error.message);
    try { await loadMusic(); } catch { /* Keep the visible order if the network is unavailable. */ }
  }
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

itemForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = itemForm.querySelector('[type="submit"]');
  const type = document.querySelector('#itemType').value;
  const id = document.querySelector('#itemId').value;
  const body = type === 'folder' ? {
    name: document.querySelector('#itemName').value,
    icon: document.querySelector('#itemIcon').value,
    color: document.querySelector('#itemColor').value
  } : {
    title: document.querySelector('#itemName').value,
    url: document.querySelector('#itemUrl').value,
    icon: document.querySelector('#itemIcon').value,
    color: document.querySelector('#itemColor').value,
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
document.querySelector('#addFolderButton').addEventListener('click', () => openItemDialog('folder'));
document.querySelector('#addLinkButton').addEventListener('click', () => openItemDialog('link'));
document.querySelector('#addMusicButton').addEventListener('click', () => openMusicDialog());
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
    await loadDashboardData();
  } catch (error) { loginMessage.textContent = error.message; }
  finally { setBusy(submit, false); }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear the local view even if the session expired. */ }
  state.csrfToken = '';
  state.desktop = null;
  state.music = null;
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
    await loadDashboardData();
  } catch (error) {
    showLogin(`后台服务暂时不可用：${error.message}`);
  }
}

boot();
