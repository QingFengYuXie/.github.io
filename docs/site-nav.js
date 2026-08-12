(() => {
  function mountGlobalNavigation() {
    if (document.querySelector('.site-global-nav')) return;

    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const current = path === '/os' ? 'os' : path === '/about.html' ? 'about' : 'feed';
    const items = [
      { id: 'feed', label: '动态', href: '/' },
      { id: 'os', label: '我的 OS', href: '/os/' },
      { id: 'about', label: '关于', href: '/about.html' }
    ];

    const nav = document.createElement('nav');
    nav.className = 'site-global-nav';
    nav.setAttribute('aria-label', '全局页面导航');

    items.forEach((item) => {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      if (item.id === current) link.setAttribute('aria-current', 'page');
      nav.append(link);
    });

    document.body.append(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountGlobalNavigation, { once: true });
  } else {
    mountGlobalNavigation();
  }
})();
