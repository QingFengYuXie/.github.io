const bootScreen = document.querySelector('#bootScreen');
const launchButton = document.querySelector('#launchButton');
const desktop = document.querySelector('#desktop');
const windows = [...document.querySelectorAll('.app-window')];
const dockItems = [...document.querySelectorAll('.dock-item')];
let topZ = 60;

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
  dockItems.forEach((item) => item.classList.toggle('active', item.dataset.open === windowElement.id));
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

document.querySelectorAll('.desktop-icon').forEach((icon) => {
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  icon.addEventListener('pointerdown', (event) => {
    moved = false;
    icon.setPointerCapture(event.pointerId);
    const rect = icon.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;
    icon.style.position = 'fixed';
    icon.style.left = `${originX}px`;
    icon.style.top = `${originY}px`;
    icon.style.zIndex = 30;
  });
  icon.addEventListener('pointermove', (event) => {
    if (!icon.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    if (moved) {
      icon.style.left = `${Math.max(4, Math.min(window.innerWidth - icon.offsetWidth - 4, originX + dx))}px`;
      icon.style.top = `${Math.max(55, Math.min(window.innerHeight - icon.offsetHeight - 85, originY + dy))}px`;
    }
  });
  icon.addEventListener('pointerup', (event) => {
    if (!moved) openWindow(icon.dataset.open);
    if (icon.hasPointerCapture(event.pointerId)) icon.releasePointerCapture(event.pointerId);
  });
  icon.addEventListener('pointercancel', (event) => {
    if (icon.hasPointerCapture(event.pointerId)) icon.releasePointerCapture(event.pointerId);
  });
});

function updateClock() {
  document.querySelector('#clock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}
updateClock();
setInterval(updateClock, 30000);
