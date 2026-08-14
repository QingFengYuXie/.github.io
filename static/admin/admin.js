const API_ROOT = '/api/v1';
const state = { csrfToken: '', desktop: null, pendingFolderDelete: null, dragItem: null };

const loginView = document.querySelector('#loginView');
const dashboardView = document.querySelector('#dashboardView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const desktopList = document.querySelector('#desktopList');
const emptyState = document.querySelector('#emptyState');
const previewIcons = document.querySelector('#previewIcons');
const saveStatus = document.querySelector('#saveStatus');
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

function showLogin(message = '') {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginMessage.textContent = message;
  document.querySelector('#loginPassword').value = '';
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

async function loadDesktop() {
  setSaveStatus('正在读取桌面数据…', 'saving');
  const desktop = await api('/desktop');
  state.desktop = desktop;
  render();
  setSaveStatus('所有修改都会立即保存。');
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
    await loadDesktop();
  } catch (error) { loginMessage.textContent = error.message; }
  finally { setBusy(submit, false); }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear the local view even if the session expired. */ }
  state.csrfToken = '';
  state.desktop = null;
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
    if (!session.authenticated) { showLogin(); return; }
    state.csrfToken = session.csrfToken;
    showDashboard();
    await loadDesktop();
  } catch (error) {
    showLogin(`后台服务暂时不可用：${error.message}`);
  }
}

boot();
