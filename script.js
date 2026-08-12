const themeRoot = document.documentElement;
const themeToggle = document.querySelector('#themeToggle');
const themeColorMeta = document.querySelector('#themeColorMeta');
const themeStorageKey = 'lightwind-theme-v1';

function readStoredTheme() {
  try {
    return localStorage.getItem(themeStorageKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme, persist = false) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  const isLight = nextTheme === 'light';
  themeRoot.dataset.theme = nextTheme;
  if (themeColorMeta) themeColorMeta.content = isLight ? '#f5f1ee' : '#070506';
  if (themeToggle) {
    themeToggle.dataset.theme = nextTheme;
    themeToggle.setAttribute('aria-pressed', String(isLight));
    themeToggle.setAttribute('aria-label', isLight ? '切换到深色主题' : '切换到浅色主题');
    themeToggle.title = isLight ? '切换到深色主题' : '切换到浅色主题';
    themeToggle.querySelector('.theme-toggle-label').textContent = isLight ? '深色' : '浅色';
  }
  if (persist) {
    try {
      localStorage.setItem(themeStorageKey, nextTheme);
    } catch {}
  }
}

applyTheme(readStoredTheme());
themeToggle?.addEventListener('click', () => {
  applyTheme(themeRoot.dataset.theme === 'light' ? 'dark' : 'light', true);
});

const bootScreen = document.querySelector('#bootScreen');
const launchButton = document.querySelector('#launchButton');
const bootLog = document.querySelector('#bootLog');
const bootReady = document.querySelector('#bootReady');
const desktop = document.querySelector('#desktop');
const windows = [...document.querySelectorAll('.app-window')];
const dockItems = [...document.querySelectorAll('.dock-item')];
const pageViewport = document.querySelector('#pageViewport');
const pageTrack = document.querySelector('#pageTrack');
const pages = [...document.querySelectorAll('.site-page')];
let topZ = 60;
let activePage = 0;
let bootComplete = false;

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

function finishBootSequence() {
  if (bootComplete) return;
  bootComplete = true;
  bootReady.hidden = false;
  requestAnimationFrame(() => bootReady.classList.add('visible'));
  launchButton.focus({ preventScroll: true });
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
      line.scrollIntoView({ block: 'nearest' });
      if (index === bootMessages.length - 1) window.setTimeout(finishBootSequence, 280);
    }, 180 + index * 145);
  });
}

function launch() {
  document.body.classList.add('is-launched');
  bootScreen.classList.add('hidden');
}

launchButton.addEventListener('click', () => {
  if (bootComplete) launch();
  else finishBootSequence();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !bootScreen.classList.contains('hidden')) {
    if (bootComplete) launch();
    else finishBootSequence();
  }
  if (event.key === 'Escape' && bootScreen.classList.contains('hidden')) {
    const focusedWindow = document.querySelector('.app-window.focused:not([hidden])');
    if (focusedWindow) closeWindow(focusedWindow);
  }
});

if (new URLSearchParams(window.location.search).has('desktop')) launch();
else runBootSequence();

function syncDock(windowElement, isOpen) {
  dockItems.forEach((item) => {
    if (item.dataset.open === windowElement.id) item.classList.toggle('active', isOpen);
  });
}

function focusWindow(windowElement) {
  topZ += 1;
  windowElement.style.zIndex = topZ;
  windows.forEach((item) => item.classList.remove('focused'));
  windowElement.classList.add('focused');
}

function switchPage(index, animate = true) {
  activePage = Math.max(0, Math.min(pages.length - 1, index));
  pageTrack.classList.toggle('is-dragging', !animate);
  pageTrack.style.transform = `translate3d(${-activePage * 100}%, 0, 0)`;
  pages.forEach((page, pageIndex) => {
    const isActive = pageIndex === activePage;
    page.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    page.toggleAttribute('inert', !isActive);
  });
  dockItems.forEach((item, itemIndex) => {
    const isActive = itemIndex === activePage;
    item.classList.toggle('active', isActive);
    if (isActive) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  document.body.dataset.page = String(activePage);
}

dockItems.forEach((item) => {
  item.addEventListener('click', () => {
    windows.filter((windowElement) => !windowElement.hidden).forEach(closeWindow);
    switchPage(Number(item.dataset.page));
  });
});

let swipePointer = null;
let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartedAt = 0;
let swipeDeltaX = 0;
let horizontalSwipe = false;

pageViewport.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  if (event.target.closest('button, a, input, .app-window, .desktop-icon, .os-code, .os-table-wrap')) return;
  swipePointer = event.pointerId;
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  swipeStartedAt = performance.now();
  swipeDeltaX = 0;
  horizontalSwipe = false;
});

pageViewport.addEventListener('pointermove', (event) => {
  if (event.pointerId !== swipePointer) return;
  const dx = event.clientX - swipeStartX;
  const dy = event.clientY - swipeStartY;
  if (!horizontalSwipe && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    horizontalSwipe = true;
    pageViewport.setPointerCapture(event.pointerId);
    pageTrack.classList.add('is-dragging');
  }
  if (!horizontalSwipe) return;
  const atEdge = (activePage === 0 && dx > 0) || (activePage === pages.length - 1 && dx < 0);
  swipeDeltaX = atEdge ? dx * 0.28 : dx;
  pageTrack.style.transform = `translate3d(calc(${-activePage * 100}% + ${swipeDeltaX}px), 0, 0)`;
});

function finishSwipe(event) {
  if (event.pointerId !== swipePointer) return;
  const elapsed = Math.max(performance.now() - swipeStartedAt, 1);
  const isFlick = Math.abs(swipeDeltaX / elapsed) > 0.45;
  const shouldChange = Math.abs(swipeDeltaX) > Math.min(90, pageViewport.clientWidth * 0.16) || isFlick;
  let nextPage = activePage;
  if (horizontalSwipe && shouldChange) nextPage += swipeDeltaX < 0 ? 1 : -1;
  switchPage(nextPage);
  swipePointer = null;
  swipeDeltaX = 0;
  window.setTimeout(() => { horizontalSwipe = false; }, 0);
}

pageViewport.addEventListener('pointerup', finishSwipe);
pageViewport.addEventListener('pointercancel', finishSwipe);
pageViewport.addEventListener('click', (event) => {
  if (!horizontalSwipe) return;
  event.preventDefault();
  event.stopPropagation();
}, true);

pageViewport.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  switchPage(activePage + (event.key === 'ArrowRight' ? 1 : -1));
});

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
  syncDock(windowElement, false);
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
    if (event.target.closest('button')) return;
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

let desktopIconZ = 30;
const desktopIcons = [...document.querySelectorAll('.desktop-icon')];
const iconGrid = document.querySelector('.desktop-icons');
const iconGridStorageKey = 'lightwind-desktop-grid-v1';
const iconCellWidth = 112;
const iconCellHeight = 96;

function gridCapacity() {
  return {
    columns: Math.max(1, Math.floor(iconGrid.clientWidth / iconCellWidth)),
    rows: Math.max(1, Math.floor(iconGrid.clientHeight / iconCellHeight))
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

function saveIconGrid() {
  const positions = desktopIcons.map((icon, index) => ({ index, ...iconCell(icon) }));
  localStorage.setItem(iconGridStorageKey, JSON.stringify(positions));
}

function restoreIconGrid() {
  try {
    const saved = JSON.parse(localStorage.getItem(iconGridStorageKey));
    if (!Array.isArray(saved)) return;
    const { columns, rows } = gridCapacity();
    const occupied = new Set();
    desktopIcons.forEach((icon, index) => {
      const position = saved.find((item) => item.index === index);
      if (!position) return;
      const targetX = Math.max(0, Math.min(columns - 1, Number(position.x) || 0));
      const targetY = Math.max(0, Math.min(rows - 1, Number(position.y) || 0));
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

restoreIconGrid();

desktopIcons.forEach((icon) => {
  const dragThreshold = 7;
  let activePointer = null;
  let moved = false;
  let startX = 0;
  let startY = 0;
  icon.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
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
    if (moved) {
      icon.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.05)`;
    }
  });
  icon.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointer) return;
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    const wasDragged = moved || distance >= dragThreshold;
    if (icon.hasPointerCapture(event.pointerId)) icon.releasePointerCapture(event.pointerId);
    activePointer = null;
    if (!wasDragged) {
      openWindow(icon.dataset.open);
      return;
    }
    const gridRect = iconGrid.getBoundingClientRect();
    const draggedRect = icon.getBoundingClientRect();
    const targetX = Math.round((draggedRect.left - gridRect.left - 12) / iconCellWidth);
    const targetY = Math.round((draggedRect.top - gridRect.top - 6) / iconCellHeight);
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
  icon.addEventListener('dragstart', (event) => event.preventDefault());
});

const requestedPage = Number(new URLSearchParams(window.location.search).get('page'));
switchPage(Number.isInteger(requestedPage) ? requestedPage : 0, false);

function updateClock() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  document.querySelector('#clock').textContent = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}  ${weekday}  ${time}`;
}
updateClock();
setInterval(updateClock, 30000);
