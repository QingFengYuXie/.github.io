const bootScreen = document.querySelector('#bootScreen');
const launchButton = document.querySelector('#launchButton');
const desktop = document.querySelector('#desktop');
const windows = [...document.querySelectorAll('.app-window')];
const dockItems = [...document.querySelectorAll('.dock-item')];
const pageViewport = document.querySelector('#pageViewport');
const pageTrack = document.querySelector('#pageTrack');
const pages = [...document.querySelectorAll('.site-page')];
let topZ = 60;
let activePage = 0;

function launch() {
  document.body.classList.add('is-launched');
  bootScreen.classList.add('hidden');
}

launchButton.addEventListener('click', launch);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !bootScreen.classList.contains('hidden')) launch();
  if (event.key === 'Escape' && bootScreen.classList.contains('hidden')) {
    const focusedWindow = document.querySelector('.app-window.focused:not([hidden])');
    if (focusedWindow) closeWindow(focusedWindow);
  }
});

if (new URLSearchParams(window.location.search).has('desktop')) launch();

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
  if (event.target.closest('button, a, .app-window, .desktop-icon')) return;
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

document.querySelectorAll('.desktop-icon').forEach((icon) => {
  const dragThreshold = 7;
  let placeholder = null;
  let activePointer = null;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  icon.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    activePointer = event.pointerId;
    moved = false;
    icon.setPointerCapture(event.pointerId);
    const rect = icon.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;
  });
  icon.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.hypot(dx, dy) >= dragThreshold) {
      moved = true;
      if (!placeholder) {
        placeholder = document.createElement('span');
        placeholder.className = 'desktop-icon-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.width = `${icon.offsetWidth}px`;
        placeholder.style.height = `${icon.offsetHeight}px`;
        icon.before(placeholder);
      }
      icon.style.position = 'fixed';
      icon.style.left = `${originX}px`;
      icon.style.top = `${originY}px`;
      desktopIconZ += 1;
      icon.style.zIndex = desktopIconZ;
    }
    if (moved) {
      icon.style.left = `${Math.max(4, Math.min(window.innerWidth - icon.offsetWidth - 4, originX + dx))}px`;
      icon.style.top = `${Math.max(55, Math.min(window.innerHeight - icon.offsetHeight - 85, originY + dy))}px`;
    }
  });
  icon.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointer) return;
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    const wasDragged = moved || distance >= dragThreshold;
    if (icon.hasPointerCapture(event.pointerId)) icon.releasePointerCapture(event.pointerId);
    activePointer = null;
    if (!wasDragged) openWindow(icon.dataset.open);
  });
  icon.addEventListener('pointercancel', (event) => {
    if (icon.hasPointerCapture(event.pointerId)) icon.releasePointerCapture(event.pointerId);
    activePointer = null;
    moved = false;
  });
  icon.addEventListener('dragstart', (event) => event.preventDefault());
});

const requestedPage = Number(new URLSearchParams(window.location.search).get('page'));
switchPage(Number.isInteger(requestedPage) ? requestedPage : 0, false);

function updateClock() {
  document.querySelector('#clock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}
updateClock();
setInterval(updateClock, 30000);
