const bootScreen = document.querySelector('#bootScreen');
const bootLog = document.querySelector('#bootLog');
const bootProgress = document.querySelector('#bootProgress');
const bootProgressFill = document.querySelector('#bootProgressFill');
const bootProgressPet = document.querySelector('#bootProgressPet');
const bootProgressPetSprite = document.querySelector('.boot-progress-pet-sprite');
const bootProgressValue = document.querySelector('#bootProgressValue');
const bootProgressStatus = document.querySelector('#bootProgressStatus');
const desktop = document.querySelector('#desktop');
const pageViewport = document.querySelector('#pageViewport');
const pageTrack = document.querySelector('#pageTrack');
const windows = [...document.querySelectorAll('.app-window')];
const globalDesktopLayers = [
  ...windows,
  ...document.querySelectorAll('.navigation-folder, .desktop-context-menu, .command-palette')
];
globalDesktopLayers.forEach((layer) => pageViewport?.append(layer));
const mobileLayoutMedia = window.matchMedia('(max-width: 800px)');
let topZ = 60;
let bootComplete = false;
let bootPetAnimationFrame = 0;
let bootPetFrame = 0;
let bootPetLastFrameAt = 0;

const bootMessages = [
  ['ok', 'Mounted /home/lightwind.'],
  ['ok', 'Started udev Kernel Device Manager.'],
  ['ok', 'Reached target Local File Systems.'],
  ['ok', 'Started Network Manager.'],
  ['ok', 'Connected to universe.network.'],
  ['ok', 'Loaded personal workspace.'],
  ['ok', 'Mounted /about /works /notes /now.'],
  ['ok', 'Started Lightwind Display Manager.'],
  ['info', 'Reached target Graphical Interface.']
];

const bootStartDelay = 180;
const bootStepDelay = 145;
const bootCompleteDelay = 280;

function drawBootPetFrame() {
  if (!bootProgressPetSprite) return;
  bootProgressPetSprite.style.backgroundPosition = `${-(bootPetFrame * 60)}px -65px`;
  bootProgressPetSprite.dataset.bootPetFrame = String(bootPetFrame);
}

function animateBootPet(timestamp) {
  bootPetAnimationFrame = 0;
  if (!bootProgressPetSprite || document.hidden || bootScreen?.classList.contains('hidden')) return;
  const frameDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 140 : 90;
  if (!bootPetLastFrameAt) bootPetLastFrameAt = timestamp;
  const elapsed = timestamp - bootPetLastFrameAt;
  if (elapsed >= frameDelay) {
    const elapsedFrames = Math.max(1, Math.min(2, Math.floor(elapsed / frameDelay)));
    bootPetFrame = (bootPetFrame + elapsedFrames) % 8;
    bootPetLastFrameAt = timestamp;
    drawBootPetFrame();
  }
  bootPetAnimationFrame = window.requestAnimationFrame(animateBootPet);
}

function startBootPetAnimation() {
  if (!bootPetAnimationFrame && !document.hidden && !bootScreen?.classList.contains('hidden')) {
    bootPetLastFrameAt = 0;
    bootPetAnimationFrame = window.requestAnimationFrame(animateBootPet);
  }
}

function stopBootPetAnimation() {
  if (bootPetAnimationFrame) window.cancelAnimationFrame(bootPetAnimationFrame);
  bootPetAnimationFrame = 0;
}

function updateBootProgress(index, status) {
  const progress = Math.min(100, Math.round(((index + 1) / bootMessages.length) * 100));
  bootProgress?.style.setProperty('--boot-progress', `${progress}%`);
  if (bootProgressFill) bootProgressFill.style.width = `${progress}%`;
  if (bootProgressPet) bootProgressPet.style.left = `${progress}%`;
  if (bootProgress) bootProgress.setAttribute('aria-valuenow', String(progress));
  if (bootProgressValue) bootProgressValue.textContent = `${progress}%`;
  if (bootProgressStatus) bootProgressStatus.textContent = status;
}

function finishBootSequence() {
  if (bootComplete) return;
  bootComplete = true;
  updateBootProgress(bootMessages.length - 1, 'Graphical interface ready. Launching desktop...');
  window.setTimeout(launch, 360);
}

function runBootSequence() {
  bootMessages.forEach(([type, message], index) => {
    window.setTimeout(() => {
      const line = document.createElement('p');
      line.className = `boot-log-line ${type}`;
      line.innerHTML = type === 'ok'
        ? `<span>[&nbsp; <b>OK</b> &nbsp;]</span> ${message}`
        : `<span>[&nbsp;&nbsp;INFO&nbsp;]</span> ${message}`;
      bootLog.append(line);
      bootLog.scrollTop = bootLog.scrollHeight;
      updateBootProgress(index, message);
      if (index === bootMessages.length - 1) window.setTimeout(finishBootSequence, bootCompleteDelay);
    }, bootStartDelay + index * bootStepDelay);
  });
}

function launch() {
  document.body.classList.add('is-launched');
  bootScreen.classList.add('hidden');
  stopBootPetAnimation();
}

drawBootPetFrame();
startBootPetAnimation();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopBootPetAnimation();
  else startBootPetAnimation();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && typeof navigationFolder !== 'undefined' && navigationFolder && !navigationFolder.hidden) {
    closeNavigationFolder();
    return;
  }
  if (event.key === 'Escape' && bootScreen.classList.contains('hidden') && (!commandPalette || commandPalette.hidden)) {
    const focusedWindow = document.querySelector('.app-window.focused:not([hidden])');
    if (focusedWindow) closeWindow(focusedWindow);
  }
});

runBootSequence();

function focusWindow(windowElement) {
  topZ += 1;
  windowElement.style.zIndex = topZ;
  windows.forEach((item) => item.classList.remove('focused'));
  windowElement.classList.add('focused');
}

function openWindow(id) {
  const windowElement = document.getElementById(id);
  if (!windowElement) return;
  windowElement.hidden = false;
  if (!windowElement.dataset.positioned) {
    const offset = windows.indexOf(windowElement) * 28;
    windowElement.style.left = `calc(18% + ${offset}px)`;
    windowElement.style.top = `calc(15% + ${offset}px)`;
    windowElement.dataset.positioned = 'true';
  }
  focusWindow(windowElement);
  windowElement.classList.remove('window-enter');
  requestAnimationFrame(() => windowElement.classList.add('window-enter'));
}

document.querySelectorAll('[data-open]:not(.desktop-icon)').forEach((trigger) => {
  trigger.addEventListener('click', () => openWindow(trigger.dataset.open));
});

function closeWindow(windowElement) {
  windowElement.hidden = true;
  windowElement.classList.remove('focused', 'window-enter');
}

windows.forEach((windowElement) => {
  windowElement.addEventListener('pointerdown', () => focusWindow(windowElement));
  windowElement.querySelector('.close-button').addEventListener('click', (event) => {
    event.stopPropagation();
    closeWindow(windowElement);
  });
  windowElement.querySelector('.minimize-button').addEventListener('click', (event) => {
    event.stopPropagation();
    closeWindow(windowElement);
  });
});

function makeDraggable(element, handle, bounds) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  handle.addEventListener('pointerdown', (event) => {
    if (mobileLayoutMedia.matches || event.target.closest('button')) return;
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    const rect = element.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;
    element.style.transform = 'none';
    focusWindow(element);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = element.getBoundingClientRect();
    const nextX = Math.max(8, Math.min(bounds.clientWidth - rect.width - 8, originX + event.clientX - startX));
    const nextY = Math.max(55, Math.min(bounds.clientHeight - rect.height - 80, originY + event.clientY - startY));
    element.style.left = `${nextX}px`;
    element.style.top = `${nextY}px`;
  });
  handle.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('pointercancel', () => { dragging = false; });
}

windows.forEach((windowElement) => makeDraggable(windowElement, windowElement.querySelector('.window-header'), desktop));

const desktopPet = document.querySelector('#desktopPet');
const petPositionKey = 'lightwind-rem-pet-position-v2';
const legacyPetPositionKey = 'lightwind-rem-pet-position-v1';
let restoreDefaultPetPosition = () => {};
if (desktopPet) {
  const petSprite = desktopPet.querySelector('.desktop-pet-sprite');
  const petMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const petAnimations = Object.freeze({
    idle: { row: 0, frames: 8, frameMs: 150 },
    runningRight: { row: 1, frames: 8, frameMs: 90 },
    runningLeft: { row: 2, frames: 8, frameMs: 90 },
    waving: { row: 3, frames: 4, frameMs: 150 },
    jumping: { row: 4, frames: 8, frameMs: 120 }
  });
  let petPointerId = null;
  let petStartX = 0;
  let petStartY = 0;
  let petLastX = 0;
  let petOriginX = 0;
  let petOriginY = 0;
  let petMoved = false;
  let petInteractionTimer = 0;
  let petDragFrame = 0;
  let petPendingX = 0;
  let petPendingY = 0;
  let petBounds = null;
  let petHovered = false;
  let petInteracting = false;
  let petUsesCustomPosition = false;
  let petRescueFrame = 0;
  let petAnimationFrame = 0;
  let petAnimationName = '';
  let petSpriteFrame = 0;
  let petLastFrameAt = 0;

  function getPetAnimationName() {
    const state = desktopPet.dataset.petState || 'idle';
    if (state === 'dragging') {
      return desktopPet.dataset.petDirection === 'left' ? 'runningLeft' : 'runningRight';
    }
    if (state === 'interacting') return 'waving';
    if (state === 'hovered') return 'jumping';
    return 'idle';
  }

  function drawPetFrame(animation, frame) {
    if (!petSprite) return;
    const frameWidth = petSprite.offsetWidth || 144;
    const frameHeight = petSprite.offsetHeight || 156;
    petSprite.style.backgroundPosition = `${-(frame * frameWidth)}px ${-(animation.row * frameHeight)}px`;
    desktopPet.dataset.petFrame = String(frame);
  }

  function animatePet(timestamp) {
    petAnimationFrame = 0;
    if (!petSprite || document.hidden) return;

    const nextAnimationName = getPetAnimationName();
    const nextAnimation = petAnimations[nextAnimationName] || petAnimations.idle;
    if (nextAnimationName !== petAnimationName) {
      petAnimationName = nextAnimationName;
      petSpriteFrame = 0;
      petLastFrameAt = timestamp;
      desktopPet.dataset.petAnimation = nextAnimationName;
      drawPetFrame(nextAnimation, petSpriteFrame);
    } else {
      const motionScale = petMotionPreference.matches ? 1.35 : 1;
      const frameDuration = nextAnimation.frameMs * motionScale;
      const elapsed = timestamp - petLastFrameAt;
      if (elapsed >= frameDuration) {
        const elapsedFrames = Math.max(1, Math.min(3, Math.floor(elapsed / frameDuration)));
        petSpriteFrame = (petSpriteFrame + elapsedFrames) % nextAnimation.frames;
        petLastFrameAt = timestamp;
        drawPetFrame(nextAnimation, petSpriteFrame);
      }
    }

    petAnimationFrame = window.requestAnimationFrame(animatePet);
  }

  function startPetAnimation() {
    if (!petAnimationFrame && !document.hidden) {
      petAnimationFrame = window.requestAnimationFrame(animatePet);
    }
  }

  function getPetBounds() {
    const desktopRect = desktop.getBoundingClientRect();
    const navigationRect = mobileLayoutMedia.matches
      ? document.querySelector('.site-global-nav')?.getBoundingClientRect()
      : null;
    const lowerEdge = navigationRect?.height
      ? navigationRect.top - desktopRect.top - 10
      : desktop.clientHeight - 78;
    return {
      maxX: Math.max(8, desktop.clientWidth - desktopPet.offsetWidth - 8),
      maxY: Math.max(54, lowerEdge - desktopPet.offsetHeight)
    };
  }

  function clampPetPosition(x, y, bounds = getPetBounds()) {
    return {
      x: Math.max(8, Math.min(bounds.maxX, Number.isFinite(x) ? x : bounds.maxX)),
      y: Math.max(54, Math.min(bounds.maxY, Number.isFinite(y) ? y : bounds.maxY))
    };
  }

  function savePetPosition(x, y) {
    try {
      localStorage.setItem(petPositionKey, JSON.stringify({ x, y }));
      localStorage.removeItem(legacyPetPositionKey);
    } catch {
      // Some privacy modes block storage. The pet still works for this visit.
    }
  }

  function clearStoredPetPosition() {
    try {
      localStorage.removeItem(petPositionKey);
      localStorage.removeItem(legacyPetPositionKey);
    } catch {
      // Storage can be unavailable in strict private browsing modes.
    }
  }

  function syncPetState() {
    let state = 'idle';
    if (petPointerId !== null && petMoved) state = 'dragging';
    else if (petInteracting) state = 'interacting';
    else if (petHovered) state = 'hovered';
    desktopPet.dataset.petState = state;
  }

  function applyPetPosition() {
    petDragFrame = 0;
    const next = clampPetPosition(petPendingX, petPendingY, petBounds || getPetBounds());
    petPendingX = next.x;
    petPendingY = next.y;
    desktopPet.style.left = `${next.x}px`;
    desktopPet.style.top = `${next.y}px`;
    desktopPet.style.right = 'auto';
    desktopPet.style.bottom = 'auto';
    petUsesCustomPosition = true;
  }

  function queuePetPosition(x, y) {
    petPendingX = x;
    petPendingY = y;
    if (!petDragFrame) petDragFrame = window.requestAnimationFrame(applyPetPosition);
  }

  function flushPetPosition() {
    if (!petDragFrame) return;
    window.cancelAnimationFrame(petDragFrame);
    applyPetPosition();
  }

  function placePet(x, y, persist = false) {
    if (petDragFrame) window.cancelAnimationFrame(petDragFrame);
    petDragFrame = 0;
    const next = clampPetPosition(x, y);
    petPendingX = next.x;
    petPendingY = next.y;
    desktopPet.style.left = `${next.x}px`;
    desktopPet.style.top = `${next.y}px`;
    desktopPet.style.right = 'auto';
    desktopPet.style.bottom = 'auto';
    petUsesCustomPosition = true;
    if (persist) savePetPosition(next.x, next.y);
  }

  function rescuePetIntoViewport() {
    petRescueFrame = 0;
    if (!petUsesCustomPosition || desktopPet.offsetParent === null) return;
    const desktopRect = desktop.getBoundingClientRect();
    const petRect = desktopPet.getBoundingClientRect();
    const x = Number.parseFloat(desktopPet.style.left);
    const y = Number.parseFloat(desktopPet.style.top);
    placePet(
      Number.isFinite(x) ? x : petRect.left - desktopRect.left,
      Number.isFinite(y) ? y : petRect.top - desktopRect.top,
      true
    );
  }

  function schedulePetRescue() {
    if (!petRescueFrame) petRescueFrame = window.requestAnimationFrame(rescuePetIntoViewport);
  }

  function pointerIsInsidePet(event) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
    const rect = desktopPet.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  function beginPetInteraction() {
    window.clearTimeout(petInteractionTimer);
    petInteracting = true;
    syncPetState();
    petInteractionTimer = window.setTimeout(() => {
      petInteracting = false;
      syncPetState();
    }, 3200);
  }

  desktopPet.dataset.petState = 'idle';
  desktopPet.dataset.petDirection = 'right';
  startPetAnimation();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (petAnimationFrame) window.cancelAnimationFrame(petAnimationFrame);
      petAnimationFrame = 0;
      return;
    }
    petAnimationName = '';
    petLastFrameAt = 0;
    startPetAnimation();
  });
  desktopPet.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    petHovered = true;
    syncPetState();
  });
  desktopPet.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'touch') return;
    petHovered = false;
    syncPetState();
  });

  try {
    const rawPosition = localStorage.getItem(petPositionKey) || localStorage.getItem(legacyPetPositionKey);
    const saved = rawPosition ? JSON.parse(rawPosition) : null;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      window.requestAnimationFrame(() => placePet(saved.x, saved.y, true));
    } else if (rawPosition) {
      clearStoredPetPosition();
    }
  } catch {
    clearStoredPetPosition();
  }

  window.addEventListener('resize', schedulePetRescue, { passive: true });
  window.addEventListener('pageshow', schedulePetRescue);
  window.visualViewport?.addEventListener('resize', schedulePetRescue, { passive: true });

  desktopPet.addEventListener('pointerdown', (event) => {
    if (event.isPrimary === false || event.button !== 0) return;
    event.preventDefault();
    window.clearTimeout(petInteractionTimer);
    petInteracting = false;
    petHovered = event.pointerType !== 'touch';
    petPointerId = event.pointerId;
    petMoved = false;
    desktopPet.dataset.petDragged = 'false';
    petStartX = event.clientX;
    petStartY = event.clientY;
    petLastX = event.clientX;
    const rect = desktopPet.getBoundingClientRect();
    const desktopRect = desktop.getBoundingClientRect();
    petOriginX = rect.left - desktopRect.left;
    petOriginY = rect.top - desktopRect.top;
    petPendingX = petOriginX;
    petPendingY = petOriginY;
    petBounds = getPetBounds();
    try { desktopPet.setPointerCapture(event.pointerId); } catch { /* Older webviews may not support capture. */ }
    syncPetState();
  });

  function updatePetDrag(event) {
    if (event.pointerId !== petPointerId) return;
    const dx = event.clientX - petStartX;
    const dy = event.clientY - petStartY;
    const movementX = event.clientX - petLastX;
    petLastX = event.clientX;
    if (Math.abs(movementX) >= 1) {
      desktopPet.dataset.petDirection = movementX < 0 ? 'left' : 'right';
    }
    if (!petMoved && Math.hypot(dx, dy) > 6) {
      petMoved = true;
      desktopPet.dataset.petDragged = 'true';
      syncPetState();
    }
    if (!petMoved || !petBounds) return;
    const nextX = Math.max(8, Math.min(petBounds.maxX, petOriginX + dx));
    const nextY = Math.max(54, Math.min(petBounds.maxY, petOriginY + dy));
    queuePetPosition(nextX, nextY);
  }

  function finishPetDrag(event, cancelled = false) {
    if (event.pointerId !== petPointerId) return;
    flushPetPosition();
    try {
      if (desktopPet.hasPointerCapture(event.pointerId)) desktopPet.releasePointerCapture(event.pointerId);
    } catch { /* Pointer capture can already be gone after a browser gesture. */ }
    const wasDragged = petMoved;
    petPointerId = null;
    petBounds = null;
    petMoved = false;
    petHovered = !cancelled && event.pointerType !== 'touch' && pointerIsInsidePet(event);
    if (cancelled) {
      petInteracting = false;
      desktopPet.dataset.petDragged = 'false';
      syncPetState();
      return;
    }
    if (wasDragged) {
      petInteracting = false;
      syncPetState();
      savePetPosition(Number.parseFloat(desktopPet.style.left), Number.parseFloat(desktopPet.style.top));
      return;
    }
    beginPetInteraction();
  }

  desktopPet.addEventListener('pointermove', updatePetDrag);
  desktopPet.addEventListener('pointerup', finishPetDrag);
  desktopPet.addEventListener('pointercancel', (event) => finishPetDrag(event, true));
  document.addEventListener('pointermove', updatePetDrag, { passive: true });
  document.addEventListener('pointerup', finishPetDrag, { passive: true });
  document.addEventListener('pointercancel', (event) => finishPetDrag(event, true), { passive: true });

  restoreDefaultPetPosition = () => {
    petUsesCustomPosition = false;
    petHovered = false;
    petInteracting = false;
    if (petDragFrame) window.cancelAnimationFrame(petDragFrame);
    petDragFrame = 0;
    clearStoredPetPosition();
    desktopPet.style.left = '';
    desktopPet.style.top = '';
    desktopPet.style.right = '';
    desktopPet.style.bottom = '';
    syncPetState();
  };
}

const defaultDesktopNavigation = {
  version: 1,
  updatedAt: 0,
  pages: [{
    id: 'desktop-page-home',
    name: '主页',
    position: 0,
    items: [
      {
        id: 'folder-lightwind', type: 'folder', title: '轻风雨斜 OS', icon: '✦', color: '#f4c84a', position: 0,
        links: [
          { id: 'link-dynamic', type: 'link', title: '动态', url: '/dynamic/', icon: '◫', color: '#e33a52', openMode: 'same', position: 0 },
          { id: 'link-about', type: 'link', title: '关于', url: '/about.html', icon: '@', color: '#d8b4bd', openMode: 'same', position: 1 }
        ]
      },
      { id: 'link-github', type: 'link', title: 'GitHub', url: 'https://github.com/QingFengYuXie', icon: '⌘', color: '#ddd5d7', openMode: 'new', position: 1 },
      { id: 'link-contact', type: 'link', title: '联系我', url: 'mailto:2399975530@qq.com', icon: '@', color: '#e8d9dc', openMode: 'same', position: 2 }
    ]
  }]
};

let desktopPages = defaultDesktopNavigation.pages;
let desktopNavigation = desktopPages[0];
let currentPageIndex = 0;
let pageGridElements = [];
let desktopIconZ = 30;
let desktopIcons = [];
const homeIconGrid = document.querySelector('#desktopIcons');
let iconGrid = homeIconGrid;
const pageSidebar = document.querySelector('#desktopPageSidebar');
const pageSidebarList = document.querySelector('#desktopPageSidebarList');
const navigationFolder = document.querySelector('#navigationFolder');
const navigationFolderTitle = document.querySelector('#navigationFolderTitle');
const navigationFolderGrid = document.querySelector('#navigationFolderGrid');
const navigationFolderEmpty = document.querySelector('#navigationFolderEmpty');
const iconGridStorageKey = 'lightwind-desktop-grid-v3';
const navigationCacheKey = 'lightwind-navigation-cache-v2';
const iconCellWidth = 112;
const iconCellHeight = 96;

function iconGridStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(iconGridStorageKey) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function saveIconGrid() {
  const saved = iconGridStorage();
  saved[desktopNavigation.id] = Object.fromEntries(desktopIcons.map((icon) => [icon.dataset.navigationId, iconCell(icon)]));
  try { localStorage.setItem(iconGridStorageKey, JSON.stringify(saved)); } catch { /* Optional layout persistence. */ }
}

function iconCellMetrics(target = iconGrid) {
  const styles = getComputedStyle(target);
  return {
    width: Number.parseFloat(styles.getPropertyValue('--cell-w')) || iconCellWidth,
    height: Number.parseFloat(styles.getPropertyValue('--cell-h')) || iconCellHeight
  };
}

function gridCapacity() {
  const metrics = iconCellMetrics();
  const columns = Math.max(1, Math.floor(iconGrid.clientWidth / metrics.width));
  return {
    columns,
    rows: Math.max(1, Math.floor(iconGrid.clientHeight / metrics.height), Math.ceil(Math.max(1, desktopIcons.length) / columns))
  };
}

function iconCell(icon) {
  return {
    x: Number(icon.style.getPropertyValue('--x')) || 0,
    y: Number(icon.style.getPropertyValue('--y')) || 0
  };
}

function setIconCell(icon, x, y) {
  icon.style.setProperty('--x', x);
  icon.style.setProperty('--y', y);
}

function nearestFreeCell(targetX, targetY, movingIcon) {
  const { columns, rows } = gridCapacity();
  const occupied = new Set(desktopIcons
    .filter((icon) => icon !== movingIcon)
    .map((icon) => {
      const cell = iconCell(icon);
      return `${cell.x}:${cell.y}`;
    }));
  const cells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!occupied.has(`${x}:${y}`)) cells.push({ x, y });
    }
  }
  cells.sort((a, b) => {
    const distanceA = (a.x - targetX) ** 2 + (a.y - targetY) ** 2;
    const distanceB = (b.x - targetX) ** 2 + (b.y - targetY) ** 2;
    return distanceA - distanceB || a.y - b.y || a.x - b.x;
  });
  return cells[0] || iconCell(movingIcon);
}

function restoreIconGrid() {
  const saved = iconGridStorage()[desktopNavigation.id] || {};
  try {
    const { columns, rows } = gridCapacity();
    const occupied = new Set();
    desktopIcons.forEach((icon) => {
      const position = saved[icon.dataset.navigationId];
      const defaultPosition = iconCell(icon);
      const targetX = Math.max(0, Math.min(columns - 1, Number(position?.x ?? defaultPosition.x) || 0));
      const targetY = Math.max(0, Math.min(rows - 1, Number(position?.y ?? defaultPosition.y) || 0));
      let cell = { x: targetX, y: targetY };
      if (occupied.has(`${cell.x}:${cell.y}`)) {
        const alternatives = [];
        for (let y = 0; y < rows; y += 1) {
          for (let x = 0; x < columns; x += 1) {
            if (!occupied.has(`${x}:${y}`)) alternatives.push({ x, y });
          }
        }
        alternatives.sort((a, b) => ((a.x - targetX) ** 2 + (a.y - targetY) ** 2) - ((b.x - targetX) ** 2 + (b.y - targetY) ** 2));
        cell = alternatives[0] || cell;
      }
      occupied.add(`${cell.x}:${cell.y}`);
      setIconCell(icon, cell.x, cell.y);
    });
  } catch {
    localStorage.removeItem(iconGridStorageKey);
  }
}

function safeNavigationUrl(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('/') && !raw.startsWith('//') && !/[\s\\]/.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return '';
    if (['http:', 'https:'].includes(parsed.protocol) && (parsed.username || parsed.password)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function normalizeNavigationLink(value) {
  if (!value || value.type !== 'link') return null;
  const id = String(value.id || '');
  const title = String(value.title || '').trim().slice(0, 60);
  const url = safeNavigationUrl(value.url);
  if (!/^[a-zA-Z0-9_-]{1,90}$/.test(id) || !title || !url) return null;
  return {
    id, type: 'link', title, url,
    icon: String(value.icon || '').trim().slice(0, 24),
    color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#e8d9dc',
    openMode: ['auto', 'same', 'new'].includes(value.openMode) ? value.openMode : 'auto',
    position: Number(value.position) || 0
  };
}

function normalizeDesktopNavigation(value) {
  if (!value || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 100) {
    if (!value || !Array.isArray(value.items)) return null;
    value = {
      ...value,
      pages: [{ id: 'desktop-page-home', name: '主页', position: 0, items: value.items }]
    };
  }
  const pages = value.pages.map((page, pageIndex) => {
    const id = String(page?.id || '');
    const name = String(page?.name || `桌面 ${pageIndex + 1}`).trim().slice(0, 40);
    if (!/^[a-zA-Z0-9_-]{1,90}$/.test(id) || !name || !Array.isArray(page.items) || page.items.length > 100) return null;
    const items = page.items.map((item) => {
      if (item?.type === 'link') return normalizeNavigationLink(item);
      if (item?.type !== 'folder') return null;
      const folderId = String(item.id || '');
      const title = String(item.title || '').trim().slice(0, 40);
      if (!/^[a-zA-Z0-9_-]{1,90}$/.test(folderId) || !title || !Array.isArray(item.links) || item.links.length > 100) return null;
      return {
        id: folderId,
        type: 'folder',
        title,
        icon: String(item.icon || '▰').trim().slice(0, 24) || '▰',
        color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#f4c84a',
        position: Number(item.position) || 0,
        links: item.links.map(normalizeNavigationLink).filter(Boolean)
      };
    }).filter(Boolean);
    return { id, name, position: Number(page.position) || pageIndex, items };
  }).filter(Boolean);
  return pages.length ? { version: Number(value.version) || 1, updatedAt: Number(value.updatedAt) || 0, pages } : null;
}

function createFaviconLoader() {
  const maxConcurrent = 3;
  const requestTimeoutMs = 8000;
  const pending = [];
  let pageLoaded = document.readyState === 'complete';
  let active = 0;
  let scheduled = false;

  const scheduleIdle = window.requestIdleCallback
    ? (callback) => window.requestIdleCallback(callback, { timeout: 1000 })
    : (callback) => window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 0);

  function schedule() {
    if (!pageLoaded || scheduled || active >= maxConcurrent || !pending.length) return;
    scheduled = true;
    scheduleIdle(drain);
  }

  function finish(task, image, loaded) {
    window.clearTimeout(task.timeout);
    active -= 1;
    if (loaded && task.wrapper.isConnected) task.wrapper.replaceChildren(image);
    schedule();
  }

  function load(task) {
    active += 1;
    const image = document.createElement('img');
    let settled = false;
    const settle = (loaded) => {
      if (settled) return;
      settled = true;
      finish(task, image, loaded);
    };
    image.alt = '';
    image.decoding = 'async';
    image.addEventListener('load', () => {
      // Some browsers fire `load` for an empty/204 response. Keep the text
      // fallback in place unless the response produced a real image.
      settle(image.naturalWidth > 0 && image.naturalHeight > 0);
    }, { once: true });
    image.addEventListener('error', () => settle(false), { once: true });
    task.timeout = window.setTimeout(() => {
      image.removeAttribute('src');
      settle(false);
    }, requestTimeoutMs);
    image.src = `/api/v1/favicons/${encodeURIComponent(task.linkId)}`;
  }

  function drain(deadline) {
    scheduled = false;
    let started = 0;
    while (active < maxConcurrent && pending.length
      && (deadline.didTimeout || deadline.timeRemaining() > 4 || started === 0)) {
      const task = pending.shift();
      if (!task.wrapper.isConnected) continue;
      load(task);
      started += 1;
    }
    schedule();
  }

  window.addEventListener('load', () => {
    pageLoaded = true;
    schedule();
  }, { once: true });

  return {
    enqueue(linkId, wrapper) {
      pending.push({ linkId, wrapper, timeout: 0 });
      schedule();
    }
  };
}

const faviconLoader = createFaviconLoader();

function shortFaviconFallback(title) {
  return [...String(title || '').trim()].slice(0, 2).join('') || '↗';
}

function makeFavicon(link, fallback = '') {
  const wrapper = document.createElement('span');
  const fallbackText = link.icon || fallback || shortFaviconFallback(link.title);
  wrapper.className = 'navigation-favicon';
  if (!link.icon) wrapper.classList.add('is-text-fallback');
  wrapper.style.setProperty('--navigation-color', link.color || '#e8d9dc');
  wrapper.textContent = fallbackText;
  faviconLoader.enqueue(link.id, wrapper);
  return wrapper;
}

function makeFolderVisual(folder) {
  const icon = document.createElement('span');
  icon.className = 'icon folder-icon navigation-folder-icon';
  icon.style.setProperty('--navigation-color', folder.color);
  const miniGrid = document.createElement('span');
  miniGrid.className = 'folder-mini-grid';
  folder.links.slice(0, 9).forEach((link) => miniGrid.append(makeFavicon(link, link.title.slice(0, 1))));
  icon.append(miniGrid);
  return icon;
}

function makeLinkVisual(link) {
  const icon = document.createElement('span');
  icon.className = 'icon navigation-link-icon';
  icon.style.setProperty('--navigation-color', link.color);
  icon.append(makeFavicon(link));
  return icon;
}

function navigationItemById(id) {
  return desktopNavigation.items.find((item) => item.id === id);
}

function resolvedLinkTarget(link) {
  if (link.openMode === 'same') return '_self';
  if (link.openMode === 'new') return '_blank';
  try {
    const url = new URL(link.url, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin ? '_blank' : '_self';
  } catch {
    return '_self';
  }
}

function openNavigationLink(link) {
  const url = safeNavigationUrl(link.url);
  if (!url) return;
  const target = resolvedLinkTarget(link);
  if (target === '_blank') {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  } else {
    window.location.href = url;
  }
}

function closeNavigationFolder() {
  if (!navigationFolder || navigationFolder.hidden) return;
  navigationFolder.classList.remove('is-open');
  window.setTimeout(() => { navigationFolder.hidden = true; }, 160);
}

function openNavigationFolder(folder) {
  if (!navigationFolder || !navigationFolderGrid) return;
  navigationFolderTitle.textContent = folder.title;
  navigationFolderGrid.replaceChildren();
  navigationFolderEmpty.hidden = folder.links.length > 0;
  folder.links.forEach((link) => {
    const anchor = document.createElement('a');
    anchor.className = 'navigation-folder-link';
    anchor.href = safeNavigationUrl(link.url);
    anchor.target = resolvedLinkTarget(link);
    if (anchor.target === '_blank') anchor.rel = 'noopener noreferrer';
    anchor.append(makeFavicon(link));
    const label = document.createElement('span');
    label.textContent = link.title;
    anchor.append(label);
    anchor.addEventListener('click', () => { if (anchor.target === '_self') closeNavigationFolder(); });
    navigationFolderGrid.append(anchor);
  });
  navigationFolder.hidden = false;
  requestAnimationFrame(() => navigationFolder.classList.add('is-open'));
  document.querySelector('#closeNavigationFolder')?.focus();
}

function activateDesktopIcon(icon) {
  if (icon.dataset.open) {
    openWindow(icon.dataset.open);
    if (icon.dataset.open === 'terminalWindow') window.setTimeout(() => document.querySelector('#terminalInput')?.focus(), 80);
    return;
  }
  const item = navigationItemById(icon.dataset.navigationId);
  if (!item) return;
  if (item.type === 'folder') openNavigationFolder(item);
  else openNavigationLink(item);
}

function bindDesktopIcon(icon) {
  if (icon.dataset.dragBound === 'true') return;
  icon.dataset.dragBound = 'true';
  const dragThreshold = 7;
  let activePointer = null;
  let moved = false;
  let startX = 0;
  let startY = 0;
  icon.addEventListener('pointerdown', (event) => {
    if (mobileLayoutMedia.matches || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    activePointer = event.pointerId;
    moved = false;
    icon.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
  });
  icon.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.hypot(dx, dy) >= dragThreshold) {
      moved = true;
      icon.classList.add('is-dragging');
      iconGrid.classList.add('is-arranging');
      desktopIconZ += 1;
      icon.style.zIndex = desktopIconZ;
    }
    if (moved) icon.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.05)`;
  });
  icon.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointer) return;
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    const wasDragged = moved || distance >= dragThreshold;
    if (icon.hasPointerCapture(event.pointerId)) icon.releasePointerCapture(event.pointerId);
    activePointer = null;
    if (!wasDragged) {
      activateDesktopIcon(icon);
      return;
    }
    const gridRect = iconGrid.getBoundingClientRect();
    const draggedRect = icon.getBoundingClientRect();
    const metrics = iconCellMetrics();
    const targetX = Math.round((draggedRect.left - gridRect.left - 12) / metrics.width);
    const targetY = Math.round((draggedRect.top - gridRect.top - 6) / metrics.height);
    const { columns, rows } = gridCapacity();
    const freeCell = nearestFreeCell(
      Math.max(0, Math.min(columns - 1, targetX)),
      Math.max(0, Math.min(rows - 1, targetY)),
      icon
    );
    icon.style.transform = '';
    icon.classList.remove('is-dragging');
    iconGrid.classList.remove('is-arranging');
    setIconCell(icon, freeCell.x, freeCell.y);
    saveIconGrid();
  });
  icon.addEventListener('pointercancel', (event) => {
    if (icon.hasPointerCapture(event.pointerId)) icon.releasePointerCapture(event.pointerId);
    activePointer = null;
    moved = false;
    icon.style.transform = '';
    icon.classList.remove('is-dragging');
    iconGrid.classList.remove('is-arranging');
  });
  icon.addEventListener('click', () => {
    if (mobileLayoutMedia.matches) activateDesktopIcon(icon);
  });
  icon.addEventListener('dragstart', (event) => event.preventDefault());
}

function makeTerminalIcon() {
  const button = document.createElement('button');
  button.className = 'desktop-icon terminal-icon';
  button.type = 'button';
  button.dataset.open = 'terminalWindow';
  button.dataset.navigationId = 'system-terminal';
  button.title = '打开命令工具';
  const icon = document.createElement('span');
  icon.className = 'icon app-icon';
  icon.textContent = '$_';
  const label = document.createElement('span');
  label.textContent = '终端';
  button.append(icon, label);
  return button;
}

function createAdditionalPage(page) {
  const grid = document.createElement('section');
  grid.className = 'desktop-icons';
  grid.dataset.generatedPage = 'true';
  grid.dataset.pageId = page.id;
  grid.setAttribute('aria-label', `${page.name}桌面网址导航`);
  grid.setAttribute('aria-busy', 'true');
  grid.append(makeTerminalIcon());
  return grid;
}

function renderPageSidebar() {
  if (!pageSidebarList) return;
  pageSidebarList.replaceChildren();
  desktopPages.forEach((page, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desktop-page-sidebar-item';
    button.dataset.pageIndex = String(index);
    button.setAttribute('aria-label', `切换到${page.name}`);
    button.setAttribute('aria-current', String(index === currentPageIndex));
    button.dataset.pageName = page.name;
    pageSidebarList.append(button);
  });
  if (pageSidebar) pageSidebar.hidden = desktopPages.length === 0;
}

function renderPageNavigation(page, grid, isCurrent) {
  grid.querySelectorAll('[data-managed-navigation]').forEach((element) => element.remove());
  if (!grid.querySelector('.terminal-icon')) grid.prepend(makeTerminalIcon());
  const loading = grid.querySelector('.navigation-loading');
  if (loading) loading.hidden = true;
  const estimatedColumns = Math.max(1, Math.floor(grid.clientWidth / iconCellMetrics(grid).width));
  page.items.forEach((item, itemIndex) => {
    const button = document.createElement('button');
    const slot = itemIndex + 1;
    button.type = 'button';
    button.className = `desktop-icon navigation-icon navigation-icon-${item.type}`;
    button.dataset.managedNavigation = '';
    button.dataset.navigationId = item.id;
    button.style.setProperty('--x', slot % estimatedColumns);
    button.style.setProperty('--y', Math.floor(slot / estimatedColumns));
    button.title = item.type === 'folder' ? `打开文件夹：${item.title}` : `打开网址：${item.title}`;
    button.append(item.type === 'folder' ? makeFolderVisual(item) : makeLinkVisual(item));
    const label = document.createElement('span');
    label.textContent = item.title;
    button.append(label);
    grid.append(button);
  });
  grid.setAttribute('aria-busy', 'false');
  if (isCurrent) {
    desktopNavigation = page;
    iconGrid = grid;
    desktopIcons = [...grid.querySelectorAll('.desktop-icon')];
    desktopIcons.forEach(bindDesktopIcon);
    restoreIconGrid();
  }
}

function activatePage(index) {
  const page = desktopPages[index];
  const grid = pageGridElements[index];
  if (!page || !grid) return;
  currentPageIndex = index;
  desktopNavigation = page;
  iconGrid = grid;
  desktopIcons = [...grid.querySelectorAll('.desktop-icon')];
  desktopIcons.forEach(bindDesktopIcon);
  restoreIconGrid();
}

function goToPage(index, source = 'programmatic') {
  if (!desktopPages.length || !pageTrack) return;
  const nextIndex = Math.max(0, Math.min(desktopPages.length - 1, Number(index) || 0));
  currentPageIndex = nextIndex;
  pageTrack.style.transform = mobileLayoutMedia.matches
    ? `translate3d(${-nextIndex * 100}%, 0, 0)`
    : `translate3d(0, ${-nextIndex * 100}%, 0)`;
  pageTrack.dataset.pageIndex = String(nextIndex);
  document.body.dataset.page = String(nextIndex);
  pageGridElements.forEach((grid, pageIndex) => {
    const inactive = pageIndex !== nextIndex;
    grid.setAttribute('aria-hidden', String(inactive));
    grid.inert = inactive;
  });
  renderPageSidebar();
  activatePage(nextIndex);

}

function renderDesktopPages(data) {
  desktopPages = data.pages;
  const firstPage = desktopPages[0];
  desktop.dataset.pageId = firstPage.id;
  desktop.dataset.pageName = firstPage.name;
  desktop.setAttribute('aria-label', firstPage.name);
  pageTrack.querySelectorAll('[data-generated-page]').forEach((element) => element.remove());
  pageGridElements = [homeIconGrid];
  desktopPages.slice(1).forEach((page) => {
    const grid = createAdditionalPage(page);
    pageTrack.append(grid);
    pageGridElements.push(grid);
  });
  pageGridElements.forEach((grid, index) => {
    renderPageNavigation(desktopPages[index], grid, index === 0);
  });
  renderPageSidebar();
  goToPage(Math.min(currentPageIndex, desktopPages.length - 1));
}

function bindPageNavigation() {
  pageSidebarList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page-index]');
    if (button) goToPage(Number(button.dataset.pageIndex), 'sidebar');
  });

  let wheelLockedUntil = 0;
  pageViewport?.addEventListener('wheel', (event) => {
    if (mobileLayoutMedia.matches || Math.abs(event.deltaY) < 12) return;
    if (event.target.closest('.app-window, .navigation-folder, .desktop-context-menu, .command-palette, .site-global-nav, .site-music-player')) return;
    const now = Date.now();
    if (now < wheelLockedUntil) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    wheelLockedUntil = now + 620;
    goToPage(currentPageIndex + (event.deltaY > 0 ? 1 : -1), 'wheel');
  }, { passive: false });

  let gesture = null;
  let suppressClick = false;
  pageViewport?.addEventListener('pointerdown', (event) => {
    if (!mobileLayoutMedia.matches || event.pointerType === 'mouse') return;
    const ignoredTarget = event.target.closest('.app-window, .desktop-pet, .navigation-folder, .desktop-context-menu, .command-palette, .site-global-nav, .site-music-player, a, input, select, textarea');
    if (ignoredTarget && !ignoredTarget.closest('.desktop-icon')) return;
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      horizontal: false
    };
  });
  pageViewport?.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      gesture.horizontal = true;
      try { pageViewport.setPointerCapture?.(event.pointerId); } catch { /* Synthetic events may not own a live pointer. */ }
    }
    if (!gesture.horizontal) return;
    event.preventDefault();
    pageTrack.classList.add('is-dragging');
    const atEdge = (currentPageIndex === 0 && dx > 0)
      || (currentPageIndex === desktopPages.length - 1 && dx < 0);
    const offset = atEdge ? dx * .28 : dx;
    pageTrack.style.transform = `translate3d(calc(${-currentPageIndex * 100}% + ${offset}px), 0, 0)`;
  }, { passive: false });
  const finishGesture = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = Math.abs(dx) / elapsed;
    const threshold = Math.max(48, pageViewport.clientWidth * .14);
    const shouldSwitch = gesture.horizontal && (Math.abs(dx) >= threshold || (Math.abs(dx) >= 32 && velocity >= .45));
    const wasHorizontal = gesture.horizontal;
    pageTrack.classList.remove('is-dragging');
    try {
      if (pageViewport.hasPointerCapture?.(event.pointerId)) pageViewport.releasePointerCapture(event.pointerId);
    } catch { /* The pointer may already have been released by the browser. */ }
    if (shouldSwitch) {
      goToPage(currentPageIndex + (dx < 0 ? 1 : -1), 'swipe');
    } else {
      goToPage(currentPageIndex, 'programmatic');
    }
    gesture = null;
    if (wasHorizontal) {
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
    }
  };
  pageViewport?.addEventListener('pointerup', finishGesture);
  pageViewport?.addEventListener('pointercancel', (event) => {
    if (gesture?.pointerId === event.pointerId) {
      const wasHorizontal = gesture.horizontal;
      pageTrack.classList.remove('is-dragging');
      goToPage(currentPageIndex, 'programmatic');
      gesture = null;
      if (wasHorizontal) {
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
      }
    }
  });
  pageViewport?.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!bootScreen.classList.contains('hidden') || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      goToPage(currentPageIndex + 1, 'keyboard');
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      goToPage(currentPageIndex - 1, 'keyboard');
    }
  });

  let lastMobileLayout = mobileLayoutMedia.matches;
  const syncPageAxis = () => {
    if (lastMobileLayout === mobileLayoutMedia.matches) return;
    lastMobileLayout = mobileLayoutMedia.matches;
    pageTrack.classList.remove('is-dragging');
    goToPage(currentPageIndex, 'responsive');
  };
  window.addEventListener('resize', syncPageAxis, { passive: true });
  mobileLayoutMedia.addEventListener?.('change', syncPageAxis);
}

async function loadDesktopNavigation() {
  let initial = defaultDesktopNavigation;
  try {
    const cached = normalizeDesktopNavigation(JSON.parse(localStorage.getItem(navigationCacheKey)));
    if (cached) initial = cached;
  } catch {
    try { localStorage.removeItem(navigationCacheKey); } catch { /* Storage may be blocked. */ }
  }
  renderDesktopPages(initial);
  try {
    const response = await fetch('/api/v1/desktop', { headers: { accept: 'application/json' }, cache: 'no-cache' });
    if (!response.ok) throw new Error('navigation api unavailable');
    const data = normalizeDesktopNavigation(await response.json());
    if (!data) throw new Error('invalid navigation data');
    renderDesktopPages(data);
    iconGrid.classList.remove('uses-cached-navigation');
    try {
      localStorage.setItem(navigationCacheKey, JSON.stringify(data));
    } catch {
      // Rendering live navigation must not depend on optional browser storage.
    }
  } catch {
    iconGrid.classList.add('uses-cached-navigation');
  }
}

async function loadDesktopWallpaper() {
  try {
    const response = await fetch('/api/v1/wallpaper/meta', { headers: { accept: 'application/json' }, cache: 'no-cache' });
    if (!response.ok) throw new Error('wallpaper api unavailable');
    const wallpaper = await response.json();
    const rawUrl = String(wallpaper.url || '');
    if (!wallpaper.configured || !rawUrl) {
      desktop.classList.remove('has-custom-wallpaper');
      desktop.style.removeProperty('--wallpaper-image');
      return;
    }
    const imageUrl = new URL(rawUrl, window.location.origin);
    if (imageUrl.origin !== window.location.origin || imageUrl.pathname !== '/api/v1/wallpaper/image') {
      throw new Error('invalid wallpaper url');
    }
    desktop.style.setProperty('--wallpaper-image', `url("${imageUrl.href}")`);
    desktop.classList.add('has-custom-wallpaper');
  } catch {
    desktop.classList.remove('has-custom-wallpaper');
    desktop.style.removeProperty('--wallpaper-image');
  }
}

document.querySelector('#closeNavigationFolder')?.addEventListener('click', closeNavigationFolder);
navigationFolder?.addEventListener('pointerdown', (event) => { if (event.target === navigationFolder) closeNavigationFolder(); });

bindPageNavigation();
loadDesktopNavigation();
loadDesktopWallpaper();

const clockElement = document.querySelector('#clock');
const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' });
const timeFormatter = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

function updateClock() {
  if (!clockElement) return;
  const now = new Date();
  const weekday = weekdayFormatter.format(now);
  const time = timeFormatter.format(now);
  const fullTime = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}  ${weekday}  ${time}`;
  clockElement.textContent = mobileLayoutMedia.matches ? time : fullTime;
  clockElement.title = fullTime;
}
let clockTimer = 0;
function scheduleClockUpdate() {
  window.clearTimeout(clockTimer);
  updateClock();
  clockTimer = window.setTimeout(scheduleClockUpdate, document.hidden ? 120000 : 30000);
}
scheduleClockUpdate();
mobileLayoutMedia.addEventListener?.('change', updateClock);
document.addEventListener('visibilitychange', scheduleClockUpdate);

const terminalWindow = document.querySelector('#terminalWindow');
const terminalOutput = document.querySelector('#terminalOutput');
const terminalForm = document.querySelector('#terminalForm');
const terminalInput = document.querySelector('#terminalInput');
const contextMenu = document.querySelector('#desktopContextMenu');
const commandPalette = document.querySelector('#commandPalette');
const commandPaletteInput = document.querySelector('#commandPaletteInput');
const commandPaletteResults = document.querySelector('#commandPaletteResults');
const latestPost = document.querySelector('#latestPost');
const siteUptime = document.querySelector('#siteUptime');
const petSpeech = document.querySelector('#petSpeech');
const desktopStatusCard = document.querySelector('#desktopStatusCard');
const statusCardToggle = document.querySelector('#statusCardToggle');
const statusCardStateKey = 'lightwind-status-card-collapsed-v1';
let paletteItems = [];
let paletteActiveIndex = 0;
let cachedPosts = [];
let petSpeechTimer = 0;

function setStatusCardCollapsed(collapsed, persist = true) {
  if (!desktopStatusCard || !statusCardToggle) return;
  desktopStatusCard.classList.toggle('is-collapsed', collapsed);
  statusCardToggle.setAttribute('aria-expanded', String(!collapsed));
  statusCardToggle.setAttribute('aria-label', collapsed ? '展开系统状态' : '收起系统状态');
  statusCardToggle.title = collapsed ? '展开系统状态' : '收起系统状态';
  if (latestPost) latestPost.tabIndex = collapsed ? -1 : 0;
  if (!persist) return;
  try {
    localStorage.setItem(statusCardStateKey, collapsed ? '1' : '0');
  } catch {
    // The toggle remains usable when storage is blocked.
  }
}

if (desktopStatusCard && statusCardToggle) {
  let initiallyCollapsed = false;
  try { initiallyCollapsed = localStorage.getItem(statusCardStateKey) === '1'; } catch { /* Use expanded default. */ }
  setStatusCardCollapsed(initiallyCollapsed, false);
  statusCardToggle.addEventListener('click', () => {
    setStatusCardCollapsed(!desktopStatusCard.classList.contains('is-collapsed'));
  });
}

function safeText(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function normalizeTestTitle(title) {
  const match = String(title || '').match(/\?{6}\s*(\d{1,2})/);
  return match ? `测试动态 ${match[1]}` : (title || '未命名动态');
}

function showPetSpeech(message, duration = 3000) {
  if (!petSpeech || !desktopPet) return;
  const petRect = desktopPet.getBoundingClientRect();
  const desktopRect = desktop.getBoundingClientRect();
  petSpeech.textContent = message;
  petSpeech.hidden = false;
  if (mobileLayoutMedia.matches) {
    const maxLeft = Math.max(12, desktopRect.width - petSpeech.offsetWidth - 12);
    const maxTop = Math.max(56, desktopRect.height - petSpeech.offsetHeight - 12);
    petSpeech.style.left = `${Math.max(12, Math.min(maxLeft, petRect.left - desktopRect.left - 35))}px`;
    petSpeech.style.top = `${Math.max(56, Math.min(maxTop, petRect.top - desktopRect.top - petSpeech.offsetHeight - 8))}px`;
  } else {
    petSpeech.style.left = `${Math.max(12, petRect.left - desktopRect.left - 35)}px`;
    petSpeech.style.top = `${Math.max(56, petRect.top - desktopRect.top - 54)}px`;
  }
  window.clearTimeout(petSpeechTimer);
  petSpeechTimer = window.setTimeout(() => { petSpeech.hidden = true; }, duration);
}

if (desktopPet) {
  desktopPet.addEventListener('pointerup', () => {
    if (desktopPet.dataset.petDragged === 'true') {
      desktopPet.dataset.petDragged = 'false';
      return;
    }
    showPetSpeech(['蕾姆正在为你加油。', '写一点，再休息一下。', '检测到新的灵感。', '今天也要保持好奇。'][Math.floor(Math.random() * 4)]);
  });
  window.setTimeout(() => showPetSpeech('蕾姆已上线，点击我可以互动。', 4200), 2200);
}

function appendTerminalLine(content, className = '') {
  if (!terminalOutput) return;
  const line = document.createElement('p');
  if (className) line.className = className;
  line.innerHTML = content;
  terminalOutput.append(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function openTerminal() {
  openWindow('terminalWindow');
  window.setTimeout(() => terminalInput?.focus(), 80);
}

function terminalHelp() {
  return '可用命令：<code>help</code> <code>about</code> <code>posts</code> <code>contact</code> <code>status</code> <code>theme</code> <code>clear</code>。';
}

function executeTerminalCommand(rawCommand) {
  const command = rawCommand.trim().toLowerCase();
  if (!command) return;
  appendTerminalLine(`<span>lightwind@universe</span>:<b>~</b>$ ${safeText(rawCommand)}`);
  if (command === 'help') appendTerminalLine(terminalHelp(), 'terminal-muted');
  else if (command === 'about') { openWindow('aboutWindow'); appendTerminalLine('已打开 about.html。'); }
  else if (command === 'posts' || command === 'dynamic') { appendTerminalLine('<a class="terminal-link" href="/dynamic/">正在打开动态 ↗</a>'); window.setTimeout(() => { window.location.href = '/dynamic/'; }, 350); }
  else if (command === 'contact') { openWindow('contactWindow'); appendTerminalLine('已打开 contact.md。'); }
  else if (command === 'status') appendTerminalLine('系统在线 · FOCUS 68% · CURIOSITY 92% · Rem: active');
  else if (command === 'theme') { document.body.classList.toggle('desktop-soft-light'); appendTerminalLine('已切换桌面光效。'); }
  else if (command === 'clear') { terminalOutput.innerHTML = ''; }
  else appendTerminalLine(`command not found: ${safeText(command)}。输入 <code>help</code> 查看命令。`, 'terminal-error');
}

terminalForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  executeTerminalCommand(terminalInput.value);
  terminalInput.value = '';
});

function commandItems() {
  return [
    { icon: '$_', title: '打开终端', detail: '> terminal', run: openTerminal },
    { icon: '⌂', title: '打开关于', detail: '> about', run: () => openWindow('aboutWindow') },
    { icon: '✦', title: '打开系统状态', detail: '> status', run: () => openWindow('nowWindow') },
    { icon: '↗', title: '前往动态', detail: '> posts', run: () => { window.location.href = '/dynamic/'; } },
    { icon: '✉', title: '打开联系', detail: '> contact', run: () => openWindow('contactWindow') },
    { icon: '◌', title: '整理桌面', detail: '> arrange', run: arrangeIcons },
    { icon: '◐', title: '切换桌面光效', detail: '> theme', run: () => document.body.classList.toggle('desktop-soft-light') }
  ].filter((item) => item.detail !== '> terminal');
}

function getPaletteItems(query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.startsWith('>')) {
    const search = normalizedQuery.slice(1).trim();
    return commandItems().filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(search));
  }
  const commands = commandItems().filter((item) => item.title.toLowerCase().includes(normalizedQuery));
  const posts = cachedPosts
    .filter((post) => normalizeTestTitle(post.postTitle).toLowerCase().includes(normalizedQuery))
    .slice(0, 7)
    .map((post) => ({
      icon: '▤', title: normalizeTestTitle(post.postTitle), detail: post.createdDate || '动态',
      run: () => { window.location.href = `/dynamic/${post.postUrl}`; }
    }));
  return [...commands, ...posts];
}

function renderPalette() {
  if (!commandPaletteInput || !commandPaletteResults) return;
  paletteItems = getPaletteItems(commandPaletteInput.value);
  paletteActiveIndex = Math.max(0, Math.min(paletteActiveIndex, paletteItems.length - 1));
  if (!paletteItems.length) {
    commandPaletteResults.innerHTML = '<p class="command-palette-empty">没有找到匹配的命令或动态。</p>';
    return;
  }
  commandPaletteResults.innerHTML = paletteItems.map((item, index) => (
    `<button class="command-palette-result${index === paletteActiveIndex ? ' is-active' : ''}" type="button" data-palette-index="${index}" role="option"><i>${item.icon}</i><span>${safeText(item.title)}</span><small>${safeText(item.detail)}</small></button>`
  )).join('');
}

function openPalette() {
  return;
  if (!commandPalette) return;
  commandPalette.hidden = false;
  commandPaletteInput.value = '';
  paletteActiveIndex = 0;
  renderPalette();
  window.setTimeout(() => commandPaletteInput.focus(), 30);
}

function closePalette() {
  if (commandPalette) commandPalette.hidden = true;
}

function runPaletteItem(index = paletteActiveIndex) {
  const item = paletteItems[index];
  if (!item) return;
  closePalette();
  item.run();
}

document.querySelector('#openPaletteButton')?.addEventListener('click', openPalette);
commandPaletteInput?.addEventListener('input', () => { paletteActiveIndex = 0; renderPalette(); });
commandPaletteResults?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-palette-index]');
  if (button) runPaletteItem(Number(button.dataset.paletteIndex));
});
commandPalette?.addEventListener('pointerdown', (event) => { if (event.target === commandPalette) closePalette(); });

function arrangeIcons() {
  const { columns } = gridCapacity();
  desktopIcons.forEach((icon, index) => setIconCell(icon, index % columns, Math.floor(index / columns)));
  saveIconGrid();
  showPetSpeech('桌面已整理完成。');
}

function resetPetPosition() {
  if (!desktopPet) return;
  restoreDefaultPetPosition();
  showPetSpeech('蕾姆回到默认位置。');
}

function closeContextMenu() { if (contextMenu) contextMenu.hidden = true; }
desktop.addEventListener('contextmenu', (event) => {
  if (event.target.closest('.app-window, .desktop-pet, .desktop-context-menu, .command-palette, .navigation-folder')) return;
  event.preventDefault();
  const rect = desktop.getBoundingClientRect();
  contextMenu.hidden = false;
  contextMenu.style.left = `${Math.min(desktop.clientWidth - 170, Math.max(8, event.clientX - rect.left))}px`;
  contextMenu.style.top = `${Math.min(desktop.clientHeight - 190, Math.max(54, event.clientY - rect.top))}px`;
});
document.addEventListener('pointerdown', (event) => { if (!event.target.closest('.desktop-context-menu')) closeContextMenu(); });
contextMenu?.addEventListener('click', (event) => {
  const action = event.target.dataset.contextAction;
  closeContextMenu();
  if (action === 'arrange') arrangeIcons();
  if (action === 'reset-icons') { localStorage.removeItem(iconGridStorageKey); arrangeIcons(); showPetSpeech('图标位置已重置。'); }
  if (action === 'reset-pet') resetPetPosition();
  if (action === 'terminal') openTerminal();
});

function updateSiteUptime() {
  if (!siteUptime) return;
  const start = new Date('2026-08-11T00:00:00+08:00');
  const days = Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);
  siteUptime.textContent = `${days} DAYS`;
}

async function loadLatestPost() {
  try {
    const response = await fetch('/dynamic/postList.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('post list unavailable');
    const data = await response.json();
    cachedPosts = Object.entries(data)
      .filter(([key, post]) => /^P\d+$/.test(key) && post?.postUrl)
      .map(([key, post]) => ({ ...post, order: Number(key.slice(1)) }))
      .sort((a, b) => b.order - a.order);
    const latest = cachedPosts[0];
    if (latest && latestPost) {
      latestPost.href = `/dynamic/${latest.postUrl}`;
      latestPost.innerHTML = `${safeText(normalizeTestTitle(latest.postTitle))}<b>↗</b>`;
    }
  } catch {
    if (latestPost) latestPost.textContent = '前往查看全部动态 ↗';
  }
}

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (commandPalette?.hidden) openPalette(); else closePalette();
    return;
  }
  if (commandPalette && !commandPalette.hidden) {
    if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); paletteActiveIndex = Math.min(paletteItems.length - 1, paletteActiveIndex + 1); renderPalette(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); paletteActiveIndex = Math.max(0, paletteActiveIndex - 1); renderPalette(); }
    if (event.key === 'Enter') { event.preventDefault(); runPaletteItem(); }
  }
});

updateSiteUptime();
loadLatestPost();
