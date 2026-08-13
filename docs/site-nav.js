(() => {
  const siteStartedAt = Date.UTC(2026, 7, 11);

  function getCurrentPath() {
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }

  function mountGlobalNavigation() {
    if (document.querySelector('.site-global-nav')) return;

    const path = getCurrentPath();
    const current = path === '/os' ? 'os' : path === '/about.html' ? 'about' : 'feed';
    const items = [
      { id: 'feed', label: '动态', href: '/dynamic/' },
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

  function mountVisitStats() {
    if (document.querySelector('.site-visit-stats')) return;

    const path = getCurrentPath();
    const isDynamicPage = path === '/dynamic'
      || path === '/dynamic/index.html'
      || /^\/dynamic\/page\d+\.html$/.test(path);
    const isAboutPage = path === '/about.html';
    if (!isDynamicPage && !isAboutPage) return;

    const today = new Date();
    const todayAtMidnight = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const runningDays = Math.max(0, Math.floor((todayAtMidnight - siteStartedAt) / 86400000));

    const stats = document.createElement('aside');
    stats.className = 'site-visit-stats';
    stats.setAttribute('aria-label', '网站运行和访问统计');
    stats.innerHTML = `本站已运行 <strong>${runningDays}</strong> 天 <span aria-hidden="true">|</span> 总访问量 <strong class="site-visit-count">--</strong> 次`;
    document.body.prepend(stats);

    const count = stats.querySelector('.site-visit-count');
    const syncVercount = () => {
      const vercountValue = document.querySelector('#busuanzi_value_site_pv');
      const value = vercountValue?.textContent?.trim();
      if (!value) return false;
      count.textContent = value;
      stats.classList.add('is-ready');
      return true;
    };

    if (syncVercount()) return;
    const observer = new MutationObserver(() => {
      if (syncVercount()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setTimeout(() => observer.disconnect(), 60000);
  }

  function initializeSiteChrome() {
    mountGlobalNavigation();
    mountVisitStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSiteChrome, { once: true });
  } else {
    initializeSiteChrome();
  }
})();
