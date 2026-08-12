const bootScreen = document.querySelector('#bootScreen');
const launchButton = document.querySelector('#launchButton');
const bootLog = document.querySelector('#bootLog');
const bootReady = document.querySelector('#bootReady');
const desktop = document.querySelector('#desktop');
const windows = [...document.querySelectorAll('.app-window')];
let topZ = 60;
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

const desktopPet = document.querySelector('#desktopPet');
if (desktopPet) {
  const petPositionKey = 'lightwind-rem-pet-position-v1';
  let petPointerId = null;
  let petStartX = 0;
  let petStartY = 0;
  let petOriginX = 0;
  let petOriginY = 0;
  let petMoved = false;

  try {
    const saved = JSON.parse(localStorage.getItem(petPositionKey));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      desktopPet.style.left = `${saved.x}px`;
      desktopPet.style.top = `${saved.y}px`;
      desktopPet.style.right = 'auto';
      desktopPet.style.bottom = 'auto';
    }
  } catch {
    localStorage.removeItem(petPositionKey);
  }

  desktopPet.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    petPointerId = event.pointerId;
    petMoved = false;
    petStartX = event.clientX;
    petStartY = event.clientY;
    const rect = desktopPet.getBoundingClientRect();
    const desktopRect = desktop.getBoundingClientRect();
    petOriginX = rect.left - desktopRect.left;
    petOriginY = rect.top - desktopRect.top;
    desktopPet.setPointerCapture(event.pointerId);
  });

  desktopPet.addEventListener('pointermove', (event) => {
    if (event.pointerId !== petPointerId) return;
    const dx = event.clientX - petStartX;
    const dy = event.clientY - petStartY;
    if (!petMoved && Math.hypot(dx, dy) > 6) {
      petMoved = true;
      desktopPet.classList.add('is-dragging');
    }
    if (!petMoved) return;
    const maxX = Math.max(8, desktop.clientWidth - desktopPet.offsetWidth - 8);
    const maxY = Math.max(54, desktop.clientHeight - desktopPet.offsetHeight - 78);
    const nextX = Math.max(8, Math.min(maxX, petOriginX + dx));
    const nextY = Math.max(54, Math.min(maxY, petOriginY + dy));
    desktopPet.style.left = `${nextX}px`;
    desktopPet.style.top = `${nextY}px`;
    desktopPet.style.right = 'auto';
    desktopPet.style.bottom = 'auto';
  });

  desktopPet.addEventListener('pointerup', (event) => {
    if (event.pointerId !== petPointerId) return;
    if (desktopPet.hasPointerCapture(event.pointerId)) desktopPet.releasePointerCapture(event.pointerId);
    petPointerId = null;
    desktopPet.classList.remove('is-dragging');
    if (petMoved) {
      localStorage.setItem(petPositionKey, JSON.stringify({
        x: parseFloat(desktopPet.style.left),
        y: parseFloat(desktopPet.style.top)
      }));
      return;
    }
    desktopPet.classList.add('is-excited');
    window.setTimeout(() => desktopPet.classList.remove('is-excited'), 2200);
  });

  desktopPet.addEventListener('pointercancel', () => {
    petPointerId = null;
    desktopPet.classList.remove('is-dragging');
  });
}

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

function updateClock() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  document.querySelector('#clock').textContent = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}  ${weekday}  ${time}`;
}
updateClock();
setInterval(updateClock, 30000);
