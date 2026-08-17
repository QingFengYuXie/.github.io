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

function layoutFor(desktop, page = desktop.pages[0], topLevel = page.items) {
  return {
    version: desktop.version,
    pageId: page.id,
    topLevel: topLevel.map((item) => ({ id: item.id, type: item.type })),
    folders: Object.fromEntries(
      page.items
        .filter((item) => item.type === 'folder')
        .map((folder) => [folder.id, folder.links.map((link) => link.id)])
    )
  };
}

async function createDesktopRuntime(databaseId) {
  const credential = await hashPassword('test-admin-password', 100000);
  const [indexSource, securitySource, validationSource, faviconSource] = await Promise.all([
    readFile(`${workerRoot}/src/index.js`, 'utf8'),
    readFile(`${workerRoot}/src/security.js`, 'utf8'),
    readFile(`${workerRoot}/src/validation.js`, 'utf8'),
    readFile(`${workerRoot}/src/favicon.js`, 'utf8')
  ]);
  const miniflare = new Miniflare({
    workers: [{
      config: {
        type: 'worker',
        name: `lightwind-${databaseId}`,
        compatibilityDate: '2026-08-14',
        manifest: {
          mainModule: 'index.js',
          modulesRoot: `${workerRoot}/src`,
          modules: {
            'index.js': { type: 'esm', contents: indexSource },
            'security.js': { type: 'esm', contents: securitySource },
            'validation.js': { type: 'esm', contents: validationSource },
            'favicon.js': { type: 'esm', contents: faviconSource }
          }
        },
        env: {
          DB: { type: 'd1', id: databaseId },
          ADMIN_USERNAME: { type: 'text', value: 'qingfengyu' },
          ALLOWED_ORIGIN: { type: 'text', value: origin },
          INITIAL_ADMIN_CREDENTIAL: { type: 'text', value: credential }
        }
      }
    }]
  });
  const database = await miniflare.getD1Database('DB');
  for (const migrationPath of ['0001_initial.sql', '0003_desktop_pages.sql']) {
    const sql = await readFile(`${workerRoot}/migrations/${migrationPath}`, 'utf8');
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  }
  return miniflare;
}

async function authenticate(miniflare) {
  const login = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'qingfengyu', password: 'test-admin-password' })
  }));
  assert.equal(login.response.status, 200);
  return {
    origin,
    cookie: login.response.headers.get('set-cookie').split(';')[0],
    'content-type': 'application/json',
    'x-csrf-token': login.payload.csrfToken
  };
}

async function adminRequest(miniflare, authHeaders, path, method, body) {
  return responseJson(await miniflare.dispatchFetch(`${origin}/api/v1${path}`, {
    method,
    headers: authHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  }));
}

test('desktop layout rejects stale versions without overwriting the latest order', async () => {
  const miniflare = await createDesktopRuntime('test-desktop-layout-db');

  try {
    const initial = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/desktop`));
    assert.equal(initial.response.status, 200);

    const fallbackFavicon = await miniflare.dispatchFetch(`${origin}/api/v1/favicons/link-contact`);
    assert.equal(fallbackFavicon.status, 204);
    assert.equal(fallbackFavicon.headers.get('content-type'), null);
    assert.equal(fallbackFavicon.headers.get('x-favicon-fallback'), '1');
    assert.equal(fallbackFavicon.headers.get('x-favicon-source'), 'none');

    const rejectedFaviconMethod = await responseJson(await miniflare.dispatchFetch(
      `${origin}/api/v1/favicons/link-contact`,
      { method: 'POST' }
    ));
    assert.equal(rejectedFaviconMethod.response.status, 405);

    const authHeaders = await authenticate(miniflare);

    const initialPage = initial.payload.pages[0];
    const newestTopLevel = [...initialPage.items].reverse();
    const saved = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/layout`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(layoutFor(initial.payload, initialPage, newestTopLevel))
    }));
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.desktop.version, initial.payload.version + 1);
    assert.deepEqual(saved.payload.desktop.pages[0].items.map((item) => item.id), newestTopLevel.map((item) => item.id));

    const stale = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/layout`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(layoutFor(initial.payload, initialPage))
    }));
    assert.equal(stale.response.status, 409);
    assert.equal(stale.payload.code, 'DESKTOP_VERSION_CONFLICT');

    const current = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/desktop`));
    assert.deepEqual(current.payload.pages[0].items.map((item) => item.id), newestTopLevel.map((item) => item.id));

    const missingVersion = layoutFor(current.payload);
    delete missingVersion.version;
    const invalid = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/admin/layout`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(missingVersion)
    }));
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.payload.code, 'INVALID_LAYOUT_VERSION');
  } finally {
    await miniflare.dispose();
  }
});

test('desktop pages isolate content and migrate it when a page is deleted', async () => {
  const miniflare = await createDesktopRuntime('test-desktop-pages-db');

  try {
    const initial = await responseJson(await miniflare.dispatchFetch(`${origin}/api/v1/desktop`));
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload.pages.length, 1);
    const homePage = initial.payload.pages[0];
    assert.equal(homePage.id, 'desktop-page-home');
    assert.equal(homePage.name, '主页');
    assert.ok(homePage.items.length > 0);
    assert.ok(homePage.items.every((item) => item.pageId === homePage.id));
    assert.ok(homePage.items.flatMap((item) => item.type === 'folder' ? item.links : [])
      .every((link) => link.pageId === homePage.id));

    const authHeaders = await authenticate(miniflare);
    const createdPage = await adminRequest(miniflare, authHeaders, '/admin/pages', 'POST', { name: '工作' });
    assert.equal(createdPage.response.status, 200);
    assert.equal(createdPage.payload.desktop.pages.length, 2);
    const workspace = createdPage.payload.desktop.pages.find((page) => page.name === '工作');
    assert.ok(workspace);
    assert.deepEqual(workspace.items, []);

    const duplicatePage = await adminRequest(miniflare, authHeaders, '/admin/pages', 'POST', { name: '工作' });
    assert.equal(duplicatePage.response.status, 409);
    assert.equal(duplicatePage.payload.code, 'DUPLICATE_PAGE_NAME');

    const createdFolder = await adminRequest(miniflare, authHeaders, '/admin/folders', 'POST', {
      name: '项目', icon: '▰', color: '#f4c84a', pageId: workspace.id
    });
    assert.equal(createdFolder.response.status, 200);
    const workspaceWithFolder = createdFolder.payload.desktop.pages.find((page) => page.id === workspace.id);
    const projectFolder = workspaceWithFolder.items.find((item) => item.title === '项目');
    assert.ok(projectFolder);
    assert.equal(projectFolder.pageId, workspace.id);

    const createdLink = await adminRequest(miniflare, authHeaders, '/admin/links', 'POST', {
      title: '项目文档',
      url: '/dynamic/',
      icon: '文',
      color: '#e8d9dc',
      openMode: 'same',
      pageId: workspace.id,
      folderId: projectFolder.id
    });
    assert.equal(createdLink.response.status, 200);
    let desktop = createdLink.payload.desktop;
    const isolatedWorkspace = desktop.pages.find((page) => page.id === workspace.id);
    const isolatedHome = desktop.pages.find((page) => page.id === homePage.id);
    assert.deepEqual(isolatedWorkspace.items.find((item) => item.id === projectFolder.id).links.map((link) => link.title), ['项目文档']);
    assert.equal(isolatedHome.items.some((item) => item.id === projectFolder.id), false);

    const movableLink = await adminRequest(miniflare, authHeaders, '/admin/links', 'POST', {
      title: '待移动网址',
      url: '/dynamic/about.html',
      icon: '移',
      color: '#e8d9dc',
      openMode: 'same',
      pageId: workspace.id,
      folderId: projectFolder.id
    });
    assert.equal(movableLink.response.status, 200);
    const movableLinkId = movableLink.payload.desktop.pages
      .find((page) => page.id === workspace.id).items
      .find((item) => item.id === projectFolder.id).links
      .find((link) => link.title === '待移动网址').id;
    const movedLink = await adminRequest(
      miniflare,
      authHeaders,
      `/admin/links/${encodeURIComponent(movableLinkId)}`,
      'PATCH',
      {
        pageId: homePage.id,
        folderId: null,
        title: '待移动网址',
        url: '/dynamic/about.html',
        icon: '移',
        color: '#e8d9dc',
        openMode: 'same'
      }
    );
    assert.equal(movedLink.response.status, 200);
    const homeAfterLinkMove = movedLink.payload.desktop.pages.find((page) => page.id === homePage.id);
    const workspaceAfterLinkMove = movedLink.payload.desktop.pages.find((page) => page.id === workspace.id);
    const movedLinkInHome = homeAfterLinkMove.items.find((item) => item.id === movableLinkId);
    assert.ok(movedLinkInHome);
    assert.equal(movedLinkInHome.pageId, homePage.id);
    assert.equal(workspaceAfterLinkMove.items.find((item) => item.id === projectFolder.id).links.some((link) => link.id === movableLinkId), false);

    const crossPageLink = await adminRequest(miniflare, authHeaders, '/admin/links', 'POST', {
      title: '跨页网址',
      url: '/about.html',
      color: '#e8d9dc',
      openMode: 'same',
      pageId: homePage.id,
      folderId: projectFolder.id
    });
    assert.equal(crossPageLink.response.status, 400);
    assert.equal(crossPageLink.payload.code, 'INVALID_FOLDER_PAGE');

    const crossPageFolder = await adminRequest(miniflare, authHeaders, `/admin/folders/${encodeURIComponent(projectFolder.id)}`, 'PATCH', {
      name: '项目',
      icon: '▰',
      color: '#f4c84a',
      pageId: homePage.id
    });
    assert.equal(crossPageFolder.response.status, 200);
    desktop = crossPageFolder.payload.desktop;
    const movedFolder = desktop.pages.find((page) => page.id === homePage.id).items
      .find((item) => item.id === projectFolder.id);
    assert.ok(movedFolder);
    assert.equal(movedFolder.pageId, homePage.id);
    assert.deepEqual(movedFolder.links.map((link) => [link.title, link.pageId]), [['项目文档', homePage.id]]);
    assert.equal(desktop.pages.find((page) => page.id === workspace.id).items.some((item) => item.id === projectFolder.id), false);

    const renamed = await adminRequest(
      miniflare,
      authHeaders,
      `/admin/pages/${encodeURIComponent(workspace.id)}`,
      'PATCH',
      { name: '专注工作' }
    );
    assert.equal(renamed.response.status, 200);
    desktop = renamed.payload.desktop;
    assert.equal(desktop.pages.find((page) => page.id === workspace.id).name, '专注工作');

    const reordered = await adminRequest(miniflare, authHeaders, '/admin/pages/layout', 'PUT', {
      version: desktop.version,
      ids: [workspace.id, homePage.id]
    });
    assert.equal(reordered.response.status, 200);
    desktop = reordered.payload.desktop;
    assert.deepEqual(desktop.pages.map((page) => page.id), [workspace.id, homePage.id]);

    const stalePageOrder = await adminRequest(miniflare, authHeaders, '/admin/pages/layout', 'PUT', {
      version: renamed.payload.desktop.version,
      ids: [homePage.id, workspace.id]
    });
    assert.equal(stalePageOrder.response.status, 409);
    assert.equal(stalePageOrder.payload.code, 'DESKTOP_VERSION_CONFLICT');

    const selfMigration = await adminRequest(
      miniflare,
      authHeaders,
      `/admin/pages/${encodeURIComponent(workspace.id)}?targetPageId=${encodeURIComponent(workspace.id)}`,
      'DELETE'
    );
    assert.equal(selfMigration.response.status, 400);
    assert.equal(selfMigration.payload.code, 'INVALID_TARGET_PAGE');

    const deleted = await adminRequest(
      miniflare,
      authHeaders,
      `/admin/pages/${encodeURIComponent(workspace.id)}?targetPageId=${encodeURIComponent(homePage.id)}`,
      'DELETE'
    );
    assert.equal(deleted.response.status, 200);
    assert.deepEqual(deleted.payload.desktop.pages.map((page) => page.id), [homePage.id]);
    const migratedFolder = deleted.payload.desktop.pages[0].items.find((item) => item.id === projectFolder.id);
    assert.ok(migratedFolder);
    assert.equal(migratedFolder.pageId, homePage.id);
    assert.deepEqual(migratedFolder.links.map((link) => [link.title, link.pageId]), [['项目文档', homePage.id]]);

    const lastPage = await adminRequest(
      miniflare,
      authHeaders,
      `/admin/pages/${encodeURIComponent(homePage.id)}?targetPageId=missing-page`,
      'DELETE'
    );
    assert.equal(lastPage.response.status, 400);
    assert.equal(lastPage.payload.code, 'LAST_DESKTOP_PAGE');
  } finally {
    await miniflare.dispose();
  }
});