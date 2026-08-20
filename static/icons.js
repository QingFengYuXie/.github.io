/*
 * LightwindIcons
 * A tiny self-hosted Lucide-compatible SVG registry.
 *
 * The registry deliberately stores paths instead of loading an icon package at
 * runtime. That keeps the OS, public pages and admin independent from CDNs and
 * makes the icon fallback deterministic when a website favicon is unavailable.
 */
(() => {
  'use strict';

  const registry = Object.freeze({
    Activity: ['<path d="M3 12h4l3-9 4 18 3-9h4"/>'],
    AlertTriangle: ['<path d="m21 16-5.5-10a2 2 0 0 0-3.5 0L6.5 16A2 2 0 0 0 8.25 19h7.5A2 2 0 0 0 21 16Z"/><path d="M12 9v4M12 16h.01"/>'],
    ArrowLeft: ['<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>'],
    ArrowRight: ['<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'],
    ArrowUpRight: ['<path d="M7 17 17 7"/><path d="M7 7h10v10"/>'],
    AtSign: ['<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>'],
    Check: ['<path d="m5 12 4 4L19 6"/>'],
    ChevronDown: ['<path d="m6 9 6 6 6-6"/>'],
    ChevronRight: ['<path d="m9 18 6-6-6-6"/>'],
    ChevronUp: ['<path d="m18 15-6-6-6 6"/>'],
    CircleHelp: ['<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-2.9 2-2.9 4M12 17h.01"/>'],
    CloudUpload: ['<path d="M12 13v8"/><path d="m8 17 4 4 4-4"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>'],
    Command: ['<path d="M18 3a3 3 0 1 0 0 6h-3V6a3 3 0 1 0-6 0v3H6a3 3 0 1 0 0 6h3v3a3 3 0 1 0 6 0v-3h3a3 3 0 1 0 0-6h-3V6a3 3 0 0 0-3-3"/>'],
    ExternalLink: ['<path d="M15 3h6v6"/><path d="m10 14 11-11"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'],
    FileText: ['<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>'],
    Folder: ['<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'],
    FolderOpen: ['<path d="m6 14 1.5-7h11.75a2 2 0 0 1 1.94 2.5l-1.5 6A2 2 0 0 1 17.75 17H5a2 2 0 0 1-1.94-2.5L4 12"/><path d="M3 7a2 2 0 0 1 2-2h4l2 2"/>'],
    Github: ['<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3 0 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3 0S18.1-.4 15 1.7a13.4 13.4 0 0 0-6 0C5.9-.4 4.7 0 4.7 0a5 5 0 0 0-.1 4A5.4 5.4 0 0 0 3.2 7.5c0 5.4 3.5 7 6.8 7A4.8 4.8 0 0 0 9 18v4"/><path d="M9 18c-4.5 2-5-2-7-2"/>'],
    Globe2: ['<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/>'],
    Grid2X2: ['<path d="M12 3v18M3 12h18"/><rect width="18" height="18" x="3" y="3" rx="2"/>'],
    GripVertical: ['<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>'],
    Image: ['<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L5 21"/>'],
    Link2: ['<path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>'],
    ListMusic: ['<path d="M21 15V6M18 3h-7a2 2 0 0 0-2 2v11"/><circle cx="6" cy="17" r="3"/><path d="M9 17V5h9"/>'],
    LockKeyhole: ['<circle cx="12" cy="16" r="1"/><rect width="14" height="12" x="5" y="10" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>'],
    Mail: ['<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'],
    Minus: ['<path d="M5 12h14"/>'],
    Move: ['<path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'],
    Music2: ['<circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 4"/>'],
    Pause: ['<path d="M8 5v14M16 5v14"/>'],
    Pencil: ['<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>'],
    Play: ['<path d="m8 5 11 7-11 7Z"/>'],
    Plus: ['<path d="M5 12h14M12 5v14"/>'],
    Radio: ['<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2a6 6 0 0 1 0-8.4M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>'],
    Repeat2: ['<path d="m2 9 3-3 3 3M5 6h10a4 4 0 0 1 4 4v1M22 15l-3 3-3-3M19 18H9a4 4 0 0 1-4-4v-1"/>'],
    RotateCcw: ['<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'],
    Save: ['<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'],
    Search: ['<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'],
    Settings2: ['<path d="M20 7h-9M14 17H5M18 12H5"/><circle cx="17" cy="7" r="2"/><circle cx="7" cy="17" r="2"/><circle cx="7" cy="12" r="2"/>'],
    Shuffle: ['<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'],
    SkipBack: ['<path d="M6 5v14M18 6l-8 6 8 6V6Z"/>'],
    SkipForward: ['<path d="M18 5v14M6 6l8 6-8 6V6Z"/>'],
    SlidersHorizontal: ['<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>'],
    Sparkles: ['<path d="m12 3-1.5 5.5L5 10l5.5 1.5L12 17l1.5-5.5L19 10l-5.5-1.5Z"/><path d="m19 16-.7 2.3L16 19l2.3.7L19 22l.7-2.3L22 19l-2.3-.7Z"/>'],
    Terminal: ['<path d="m4 17 6-6-6-6M12 19h8"/>'],
    Trash2: ['<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>'],
    Upload: ['<path d="M12 3v12M7 8l5-5 5 5M5 21h14"/>'],
    Volume2: ['<path d="M11 5 6 9H2v6h4l5 4V5ZM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'],
    X: ['<path d="M18 6 6 18M6 6l12 12"/>']
  });

  const legacy = Object.freeze({
    '$_': 'Terminal',
    '↗': 'ArrowUpRight',
    '✉': 'Mail',
    '▰': 'Folder',
    '@': 'AtSign',
    '⌘': 'Command',
    '◫': 'FileText',
    '✦': 'Sparkles',
    '♫': 'Music2',
    '◐': 'Radio',
    '→': 'ArrowRight',
    '←': 'ArrowLeft',
    '×': 'X',
    '—': 'Minus',
    '↑': 'ChevronUp',
    '↓': 'ChevronDown',
    '⠿': 'GripVertical'
  });

  const allowedAttributes = new Set([
    'aria-hidden', 'class', 'focusable', 'height', 'role', 'stroke-width', 'width'
  ]);

  function escapeAttribute(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function normalize(value, fallback = 'Link2') {
    const candidate = String(value || '').trim();
    const safeFallback = registry[fallback] ? fallback : 'Link2';
    return registry[candidate] ? candidate : (legacy[candidate] || safeFallback);
  }

  function svg(value, attributes = {}) {
    const name = normalize(value);
    const attrs = {
      'aria-hidden': 'true',
      class: 'lightwind-icon',
      focusable: 'false',
      height: '1em',
      role: 'img',
      width: '1em',
      'stroke-width': '1.8',
      ...attributes
    };
    const serialized = Object.entries(attrs)
      .filter(([key, item]) => allowedAttributes.has(key) && item !== null && item !== undefined)
      .map(([key, item]) => `${key}="${escapeAttribute(item)}"`)
      .join(' ');
    return `<svg ${serialized} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${registry[name].join('')}</svg>`;
  }

  function mount(element, value = element?.dataset?.icon, attributes = {}) {
    if (!element) return element;
    const name = normalize(value, 'Link2');
    element.innerHTML = svg(name, attributes);
    element.dataset.iconName = name;
    element.classList.add('lightwind-icon-host');
    return element;
  }

  function hydrate(root = document) {
    root.querySelectorAll?.('[data-icon]').forEach((element) => {
      if (element.querySelector('.lightwind-icon')) return;
      mount(element);
    });
  }

  const api = Object.freeze({
    names: Object.freeze(Object.keys(registry)),
    legacy,
    has: (value) => Boolean(registry[String(value || '').trim()]),
    normalize,
    svg,
    mount,
    hydrate
  });

  window.LightwindIcons = api;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hydrate(), { once: true });
  } else {
    hydrate();
  }
})();
