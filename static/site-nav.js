(() => {
  const siteStartedAt = Date.UTC(2026, 7, 11);
  const fallbackMusicLibrary = {
    version: 1,
    updatedAt: 0,
    tracks: [{
      id: 'track-default',
      title: '默认音乐',
      url: 'https://aqqmusic.tc.qq.com/C400004JYkhl1ccbXL.m4a?guid=570938557&vkey=42950A34D64304D428C93616A08F00B56C650CCEEC25DEA15B6B2E62C3299994155260AC0D1FF6780BA27D7AFDF908AFFF7A7B76698B075B__v2b94c62d&uin=&fromtag=120032',
      position: 0
    }]
  };
  const musicPreferenceKey = 'lightwind-background-music-enabled-v1';
  const musicPlaybackStateKey = 'lightwind-background-music-state-v2';
  const legacyMusicPositionKey = 'lightwind-background-music-position-v1';
  const musicLibraryCacheKey = 'lightwind-music-library-cache-v1';
  const musicPlaybackModeKey = 'lightwind-background-music-mode-v1';
  const avatarFallbackSources = ['/os/assets/avatar.webp', '/os/assets/avatar.jpg'];

  function getCurrentPath() {
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }

  function getChromePageType(path = getCurrentPath()) {
    const normalizedPath = path.replace(/\/+$/, '') || '/';
    if (
      normalizedPath === '/about'
      || normalizedPath === '/about.html'
      || normalizedPath === '/dynamic/about'
      || normalizedPath === '/dynamic/about.html'
    ) return 'about';
    if (
      normalizedPath === '/dynamic'
      || normalizedPath === '/dynamic/index.html'
      || /^\/(?:dynamic\/)?page\d+(?:\.html)?$/.test(normalizedPath)
      || /^\/(?:dynamic\/)?(?:tag|search)(?:\.html)?$/.test(normalizedPath)
      || /^\/(?:dynamic\/)?post\/.+(?:\.html)?$/.test(normalizedPath)
    ) {
      return 'dynamic';
    }
    return '';
  }

  function getNavigationCurrent(path = getCurrentPath()) {
    if (path === '/os' || path === '/os/index.html') return 'os';
    return getChromePageType(path) === 'about' ? 'about' : 'feed';
  }

  function mountAvatarFallback() {
    document.querySelectorAll('#avatarImg, img.avatar').forEach((avatar) => {
      avatar.addEventListener('error', () => {
        const nextIndex = Number(avatar.dataset.avatarFallbackIndex || -1) + 1;
        if (nextIndex >= avatarFallbackSources.length) return;
        avatar.dataset.avatarFallbackIndex = String(nextIndex);
        avatar.src = avatarFallbackSources[nextIndex];
      });
    });
  }

  function mountTitleActions() {
    const pageType = getChromePageType();
    if (!pageType) return null;

    const actions = document.querySelector('#header .title-right, .title-right');
    const themeAction = actions?.querySelector('a[onclick*="modeSwitch"]');
    if (!actions || !themeAction) return null;

    document.body.classList.add('site-title-actions-page', `site-title-actions-page--${pageType}`);
    actions.classList.add('site-title-actions');
    [...actions.children]
      .filter((action) => action.matches('a') && action !== themeAction && getComputedStyle(action).display !== 'none')
      .forEach((action) => {
        action.classList.add('site-title-icon-action');
        action.setAttribute('aria-label', action.getAttribute('aria-label') || action.getAttribute('title') || '页面操作');
      });
    themeAction.classList.add('site-title-icon-action', 'site-theme-action');
    themeAction.setAttribute('aria-label', themeAction.getAttribute('title') || '切换主题');
    actions.append(themeAction);
    return actions;
  }

  function mountArticleBackButton(titleActions) {
    const path = getCurrentPath();
    if (!/^\/(?:dynamic\/)?post\/.+(?:\.html)?$/.test(path)) return;
    if (document.querySelector('.site-article-back')) return;

    document.body.classList.add('site-article-page');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-article-back';
    button.setAttribute('aria-label', '返回上个页面');
    button.title = '返回上个页面';
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
    button.addEventListener('click', () => {
      let canGoBack = false;
      try {
        canGoBack = window.history.length > 1
          && Boolean(document.referrer)
          && new URL(document.referrer, window.location.href).origin === window.location.origin;
      } catch {
        canGoBack = false;
      }
      if (canGoBack) window.history.back();
      else window.location.assign('/dynamic/');
    });
    if (titleActions) titleActions.prepend(button);
    else document.body.append(button);
  }

  function mountUtterancesThemeSync() {
    if (!/^\/(?:dynamic\/)?post\/.+(?:\.html)?$/.test(getCurrentPath())) return;

    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const resolveTheme = () => {
      const mode = document.documentElement.getAttribute('data-color-mode');
      if (mode === 'dark') return 'dark-blue';
      if (mode === 'light') return 'github-light';
      return systemTheme.matches ? 'dark-blue' : 'github-light';
    };
    const normalizeTheme = (theme) => theme === 'preferred-color-scheme' ? resolveTheme() : theme;
    const syncFrameTheme = () => {
      const frame = document.querySelector('iframe.utterances-frame');
      if (!frame?.contentWindow) return false;
      frame.contentWindow.postMessage({ type: 'set-theme', theme: resolveTheme() }, 'https://utteranc.es');
      return true;
    };

    const originalThemeSetter = window.utterancesTheme;
    if (typeof originalThemeSetter === 'function' && !originalThemeSetter.lightwindThemeSync) {
      const wrappedThemeSetter = (theme) => originalThemeSetter.call(window, normalizeTheme(theme));
      wrappedThemeSetter.lightwindThemeSync = true;
      window.utterancesTheme = wrappedThemeSetter;
    }

    const observedFrames = new WeakSet();
    const prepareUtterancesNode = (node) => {
      if (!(node instanceof Element)) return;
      const scripts = node.matches('script[src="https://utteranc.es/client.js"]')
        ? [node]
        : [...node.querySelectorAll('script[src="https://utteranc.es/client.js"]')];
      scripts.forEach((script) => script.setAttribute('theme', resolveTheme()));

      const frames = node.matches('iframe.utterances-frame')
        ? [node]
        : [...node.querySelectorAll('iframe.utterances-frame')];
      frames.forEach((frame) => {
        if (observedFrames.has(frame)) return;
        observedFrames.add(frame);
        frame.addEventListener('load', () => window.setTimeout(syncFrameTheme, 0));
        window.requestAnimationFrame(syncFrameTheme);
      });
    };

    prepareUtterancesNode(document.documentElement);
    const observer = new MutationObserver((records) => {
      let themeChanged = false;
      records.forEach((record) => {
        if (record.type === 'attributes') themeChanged = true;
        record.addedNodes.forEach(prepareUtterancesNode);
      });
      if (themeChanged) window.requestAnimationFrame(syncFrameTheme);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-mode'],
      childList: true,
      subtree: true
    });

    const syncSystemTheme = () => {
      if (document.documentElement.getAttribute('data-color-mode') === 'auto') syncFrameTheme();
    };
    if (typeof systemTheme.addEventListener === 'function') systemTheme.addEventListener('change', syncSystemTheme);
    else systemTheme.addListener(syncSystemTheme);
  }

  function mountGlobalNavigation() {
    if (document.querySelector('.site-global-nav')) return;

    const path = getCurrentPath();
    const current = getNavigationCurrent(path);
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
    if (document.querySelector('.site-visit-stats') || !getChromePageType()) return;

    const today = new Date();
    const todayAtMidnight = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const runningDays = Math.max(0, Math.floor((todayAtMidnight - siteStartedAt) / 86400000));

    const stats = document.createElement('aside');
    stats.className = 'site-visit-stats';
    stats.setAttribute('aria-label', '网站运行和访问统计');
    stats.innerHTML = `本站已运行 <strong>${runningDays}</strong> 天 <span aria-hidden="true">|</span> 总访问 <strong class="site-visit-count">--</strong> 次`;
    document.body.classList.add('has-site-visit-stats');
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

  function getDynamicListingPageNumber(path = getCurrentPath()) {
    const match = path.match(/^\/dynamic\/page(\d+)(?:\.html)?$/);
    return match ? Math.max(1, Number(match[1])) : 1;
  }

  function getDynamicListingPageHref(pageNumber) {
    return pageNumber === 1 ? '/dynamic/' : `/dynamic/page${pageNumber}.html`;
  }

  function mountPaginationControls() {
    const path = getCurrentPath();
    const isDynamicListing = path === '/dynamic'
      || path === '/dynamic/index.html'
      || /^\/dynamic\/page\d+(?:\.html)?$/.test(path);
    if (!isDynamicListing) return;

    const container = document.querySelector('nav.paginate-container');
    const pagination = container?.querySelector('.pagination');
    if (!container || !pagination || pagination.dataset.lightwindEnhanced === 'true') return;

    const currentPage = Number.parseInt(container.dataset.pageCurrent || '', 10)
      || getDynamicListingPageNumber(path);
    const linkedPages = [...pagination.querySelectorAll('a[href]')].map((link) => {
      try {
        const linkedPath = new URL(link.href, window.location.href).pathname.replace(/\/+$/, '');
        const match = linkedPath.match(/^\/dynamic\/page(\d+)(?:\.html)?$/);
        return match ? Number(match[1]) : 1;
      } catch {
        return 0;
      }
    }).filter((page) => page > 0);
    const totalPages = Number.parseInt(container.dataset.pageTotal || '', 10)
      || Math.max(currentPage, ...linkedPages, 1);

    const tools = document.createElement('div');
    tools.className = 'site-pagination-tools';
    tools.setAttribute('aria-label', '动态分页工具');
    tools.innerHTML = `
      <span class="site-pagination-summary">第 <strong>${currentPage}</strong> 页 / 共 <strong>${totalPages}</strong> 页</span>
      <label class="site-pagination-jump">
        <span>跳转页面</span>
        <select class="site-pagination-select" aria-label="跳转到第几页"></select>
      </label>
    `;
    const select = tools.querySelector('.site-pagination-select');
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const option = document.createElement('option');
      option.value = getDynamicListingPageHref(pageNumber);
      option.textContent = `第 ${pageNumber} 页`;
      option.selected = pageNumber === currentPage;
      select.append(option);
    }
    select.addEventListener('change', () => {
      if (select.value) window.location.assign(select.value);
    });
    pagination.insertAdjacentElement('afterend', tools);
    pagination.dataset.lightwindEnhanced = 'true';
  }

  function mountMusicControl(titleActions) {
    if (document.querySelector('.site-music-player')) return;

    const player = document.createElement('section');
    const audio = document.createElement('audio');
    const title = document.createElement('strong');
    const titleText = document.createElement('span');
    const status = document.createElement('span');
    const modeButton = document.createElement('button');
    const previousButton = document.createElement('button');
    const playButton = document.createElement('button');
    const nextButton = document.createElement('button');
    const playIcon = (isPlaying) => isPlaying
      ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>'
      : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>';
    let musicEnabled = true;
    let tracks = [];
    let currentIndex = -1;
    let pendingPosition = 0;
    let positionRestored = false;
    let playAfterLoad = false;
    let playbackExhausted = false;
    let playRequestSerial = 0;
    let playbackMode = 'sequence';
    let shuffleHistory = [];
    let currentSelectionWasManual = false;
    let consecutiveFailures = 0;
    let titleMeasureFrame = 0;
    const failedTracks = new Set();
    let savedPlaybackState = { trackId: '', currentTime: 0 };

    try {
      musicEnabled = window.localStorage.getItem(musicPreferenceKey) !== 'off';
    } catch {
      musicEnabled = true;
    }

    try {
      playbackMode = window.localStorage.getItem(musicPlaybackModeKey) === 'shuffle' ? 'shuffle' : 'sequence';
    } catch {
      playbackMode = 'sequence';
    }

    try {
      const saved = JSON.parse(window.sessionStorage.getItem(musicPlaybackStateKey) || '{}');
      savedPlaybackState = {
        trackId: typeof saved.trackId === 'string' ? saved.trackId : '',
        currentTime: Number.isFinite(Number(saved.currentTime)) ? Math.max(0, Number(saved.currentTime)) : 0
      };
    } catch {
      savedPlaybackState = { trackId: '', currentTime: 0 };
    }

    if (!savedPlaybackState.currentTime) {
      try {
        const legacyPosition = Number(window.sessionStorage.getItem(legacyMusicPositionKey));
        if (Number.isFinite(legacyPosition) && legacyPosition > 0) savedPlaybackState.currentTime = legacyPosition;
      } catch {
        // The new player still starts normally when legacy storage is unavailable.
      }
    }

    player.className = 'site-music-player';
    player.setAttribute('role', 'group');
    player.setAttribute('aria-label', '背景音乐播放器');
    player.innerHTML = '<span class="site-music-copy"><span class="site-music-status">正在加载</span></span><span class="site-music-controls"></span>';
    title.className = 'site-music-title';
    titleText.className = 'site-music-title-text';
    titleText.textContent = '正在加载音乐…';
    title.append(titleText);
    player.querySelector('.site-music-copy').prepend(title);
    status.className = 'site-music-live-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    player.append(status);

    modeButton.type = 'button';
    modeButton.className = 'site-music-control site-music-mode';
    modeButton.dataset.musicAction = 'mode';

    previousButton.type = 'button';
    previousButton.className = 'site-music-control';
    previousButton.dataset.musicAction = 'previous';
    previousButton.setAttribute('aria-label', '上一首');
    previousButton.title = '上一首';
    previousButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 5v14M18 6l-8 6 8 6V6Z"/></svg>';

    playButton.type = 'button';
    playButton.className = 'site-music-control site-music-play';
    playButton.dataset.musicAction = 'play';
    playButton.setAttribute('aria-label', '播放音乐');
    playButton.title = '播放';
    playButton.innerHTML = playIcon(false);

    nextButton.type = 'button';
    nextButton.className = 'site-music-control';
    nextButton.dataset.musicAction = 'next';
    nextButton.setAttribute('aria-label', '下一首');
    nextButton.title = '下一首';
    nextButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 5v14M6 6l8 6-8 6V6Z"/></svg>';

    player.querySelector('.site-music-controls').append(modeButton, previousButton, playButton, nextButton);

    audio.className = 'site-background-audio';
    audio.preload = 'metadata';
    audio.volume = 0.42;
    audio.setAttribute('aria-hidden', 'true');

    if (titleActions) {
      player.classList.add('site-music-player--title-action');
      player.querySelectorAll('.site-music-control').forEach((control) => {
        control.classList.add('btn', 'btn-invisible', 'circle');
      });
      titleActions.append(player);
    } else {
      document.body.append(player);
    }
    document.body.append(audio);

    function alignOsMusicPlayer() {
      if (!document.body.classList.contains('os-page')) return;
      if (!window.matchMedia('(min-width: 801px)').matches) return;
      player.style.left = 'auto';
      player.style.right = '24px';
      player.style.top = '24px';
      player.style.bottom = 'auto';
    }

    if (document.body.classList.contains('os-page')) {
      window.requestAnimationFrame(alignOsMusicPlayer);
      window.addEventListener('resize', alignOsMusicPlayer, { passive: true });
      if ('ResizeObserver' in window) {
        new ResizeObserver(alignOsMusicPlayer).observe(document.querySelector('.os-brand') || player);
      }
    }

    function updateTitleOverflow() {
      if (titleMeasureFrame) window.cancelAnimationFrame(titleMeasureFrame);
      titleMeasureFrame = window.requestAnimationFrame(() => {
        titleMeasureFrame = 0;
        title.classList.remove('is-scrolling');
        const overflow = Math.max(0, Math.ceil(titleText.scrollWidth - title.clientWidth));
        title.style.setProperty('--site-music-title-shift', `${overflow}px`);
        title.style.setProperty('--site-music-title-duration', `${Math.min(18, Math.max(7, 5 + overflow / 20))}s`);
        title.classList.toggle('is-scrolling', overflow > 6);
      });
    }

    function setPlayerTitle(value) {
      const nextTitle = String(value || '暂无音乐');
      if (titleText.textContent !== nextTitle) titleText.textContent = nextTitle;
      updateTitleOverflow();
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(updateTitleOverflow).observe(title);
    } else {
      window.addEventListener('resize', updateTitleOverflow, { passive: true });
    }

    function isCurrentAudioSource() {
      const track = currentTrack();
      if (!track) return false;
      const expectedSource = new URL(track.url, document.baseURI).href;
      const assignedSource = audio.src || '';
      const currentSource = audio.currentSrc || '';
      if (assignedSource && assignedSource !== expectedSource) return false;
      if (currentSource && currentSource !== expectedSource && currentSource !== assignedSource) return false;
      return true;
    }

    function safeMusicUrl(value) {
      const raw = String(value || '').trim();
      if (raw.startsWith('/') && !raw.startsWith('//') && !/[\s\\]/.test(raw)) return raw;
      try {
        const parsed = new URL(raw);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
        return parsed.href;
      } catch {
        return '';
      }
    }

    function normalizeMusicLibrary(payload) {
      if (!payload || !Array.isArray(payload.tracks)) return null;
      const seen = new Set();
      const normalizedTracks = [];
      payload.tracks.slice(0, 300).forEach((track, index) => {
        const id = String(track?.id || '').trim();
        const trackTitle = String(track?.title || '').trim().slice(0, 60);
        const url = safeMusicUrl(track?.url);
        if (!id || !trackTitle || !url || seen.has(id)) return;
        seen.add(id);
        normalizedTracks.push({
          id,
          title: trackTitle,
          url,
          position: Number.isFinite(Number(track.position)) ? Number(track.position) : index
        });
      });
      normalizedTracks.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
      return {
        version: Number(payload.version || 1),
        updatedAt: Number(payload.updatedAt || 0),
        tracks: normalizedTracks
      };
    }

    function readCachedLibrary() {
      try {
        return normalizeMusicLibrary(JSON.parse(window.localStorage.getItem(musicLibraryCacheKey) || 'null'));
      } catch {
        return null;
      }
    }

    function cacheLibrary(library) {
      try {
        window.localStorage.setItem(musicLibraryCacheKey, JSON.stringify(library));
      } catch {
        // Playback continues even when storage is blocked.
      }
    }

    function currentTrack() {
      return currentIndex >= 0 ? tracks[currentIndex] || null : null;
    }

    function savePreference() {
      try {
        window.localStorage.setItem(musicPreferenceKey, musicEnabled ? 'on' : 'off');
      } catch {
        // Private browsing or blocked storage should not disable the player.
      }
    }

    function savePlaybackMode() {
      try {
        window.localStorage.setItem(musicPlaybackModeKey, playbackMode);
      } catch {
        // The selected mode remains active for this page when storage is blocked.
      }
    }

    function savePlaybackState() {
      const track = currentTrack();
      if (!track) return;
      const currentTime = !positionRestored && pendingPosition > 0
        ? pendingPosition
        : (Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0);
      try {
        window.sessionStorage.setItem(musicPlaybackStateKey, JSON.stringify({
          trackId: track.id,
          currentTime,
          playing: musicEnabled && !audio.paused
        }));
        window.sessionStorage.removeItem(legacyMusicPositionKey);
      } catch {
        // Private browsing or blocked storage should not interrupt playback.
      }
    }

    function updatePlayer(state = musicEnabled && !audio.paused ? 'playing' : 'paused') {
      const track = currentTrack();
      const isPlaying = state === 'playing';
      const labels = {
        loading: '正在加载',
        playing: '正在播放',
        paused: '已暂停',
        blocked: '点击播放',
        error: '播放失败',
        empty: '音乐库为空'
      };
      const modeLabel = playbackMode === 'shuffle' ? '随机播放' : '顺序循环';
      player.dataset.musicState = state;
      player.dataset.trackId = track?.id || '';
      player.dataset.playbackMode = playbackMode;
      setPlayerTitle(state === 'error' ? '音乐暂时无法播放' : (track?.title || '暂无音乐'));
      player.querySelector('.site-music-status').textContent = `${modeLabel} · ${labels[state] || labels.paused}`;
      status.textContent = state === 'error' ? '音乐暂时无法播放' : '';
      playButton.disabled = !track;
      previousButton.disabled = tracks.length < 2;
      nextButton.disabled = tracks.length < 2;
      modeButton.disabled = !track;
      modeButton.dataset.musicMode = playbackMode;
      modeButton.setAttribute('aria-label', playbackMode === 'shuffle'
        ? '当前为随机播放，点击切换到顺序循环'
        : '当前为顺序循环，点击切换到随机播放');
      modeButton.title = playbackMode === 'shuffle' ? '随机播放（切换到顺序循环）' : '顺序循环（切换到随机播放）';
      modeButton.innerHTML = playbackMode === 'shuffle'
        ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h3c5 0 5 12 10 12h3m-3-3 3 3-3 3M4 18h3c2.1 0 3.4-2.3 4.7-5M17 3l3 3-3 3"/></svg>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 7h12m-3-3 3 3-3 3m5 7H7m3 3-3-3 3-3"/></svg>';
      playButton.setAttribute('aria-label', isPlaying ? '暂停音乐' : '播放音乐');
      playButton.title = isPlaying ? '暂停' : '播放';
      playButton.innerHTML = playIcon(isPlaying);
    }

    function requestPlay() {
      if (!musicEnabled || playbackExhausted || !currentTrack()) return;
      const requestSerial = ++playRequestSerial;
      const playPromise = audio.play();
      if (playPromise?.then) {
        playPromise
          .then(() => {
            if (requestSerial === playRequestSerial && musicEnabled) updatePlayer('playing');
          })
          .catch(() => {
            if (requestSerial === playRequestSerial && musicEnabled) updatePlayer('blocked');
          });
      }
    }

    function restoreMusicPosition() {
      if (positionRestored || audio.readyState < 1 || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      if (pendingPosition > 0) {
        const safePosition = Math.min(pendingPosition, Math.max(0, audio.duration - 0.25));
        try {
          audio.currentTime = safePosition;
        } catch {
          // The media can still be played from the beginning if seeking is unavailable.
        }
      }
      positionRestored = true;
      if (musicEnabled && playAfterLoad) requestPlay();
    }

    function selectTrack(index, { resumePosition = 0, play = musicEnabled, resetFailures = false, manual = false } = {}) {
      if (!tracks.length) {
        playRequestSerial += 1;
        currentIndex = -1;
        currentSelectionWasManual = false;
        consecutiveFailures = 0;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        updatePlayer('empty');
        return;
      }
      currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
      const track = currentTrack();
      playRequestSerial += 1;
      currentSelectionWasManual = Boolean(manual);
      if (manual) consecutiveFailures = 0;
      if (resetFailures) failedTracks.clear();
      pendingPosition = Math.max(0, Number(resumePosition) || 0);
      positionRestored = false;
      playAfterLoad = Boolean(play);
      audio.loop = tracks.length === 1;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.dataset.trackId = track.id;
      audio.src = track.url;
      audio.load();
      updatePlayer('loading');
      savePlaybackState();
    }

    function applyLibrary(library) {
      const activeTrack = currentTrack();
      const activeId = activeTrack?.id || savedPlaybackState.trackId;
      const activeTime = activeTrack && Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : savedPlaybackState.currentTime;
      const previousSource = activeTrack?.url || '';
      const previousSources = tracks.map((track) => `${track.id}\n${track.url}`).join('\n');
      const nextSources = library.tracks.map((track) => `${track.id}\n${track.url}`).join('\n');
      tracks = library.tracks;
      const trackIds = new Set(tracks.map((track) => track.id));
      shuffleHistory = shuffleHistory.filter((trackId) => trackIds.has(trackId));
      if (previousSources !== nextSources) {
        failedTracks.clear();
        playbackExhausted = false;
      }
      if (!tracks.length) {
        selectTrack(-1);
        return;
      }
      const matchingIndex = Math.max(0, tracks.findIndex((track) => track.id === activeId));
      const matchingTrack = tracks[matchingIndex];
      if (activeTrack && activeTrack.id === matchingTrack.id && previousSource === matchingTrack.url) {
        currentIndex = matchingIndex;
        audio.loop = tracks.length === 1;
        const currentState = player.dataset.musicState;
        updatePlayer(['blocked', 'error', 'loading'].includes(currentState)
          ? currentState
          : (musicEnabled && !audio.paused ? 'playing' : 'paused'));
        return;
      }
      selectTrack(matchingIndex, { resumePosition: activeTime, play: musicEnabled });
      savedPlaybackState = { trackId: '', currentTime: 0 };
    }

    function setPlaybackMode(mode, { persist = true } = {}) {
      const nextMode = mode === 'shuffle' ? 'shuffle' : 'sequence';
      if (nextMode !== playbackMode) shuffleHistory = [];
      playbackMode = nextMode;
      if (persist) savePlaybackMode();
      updatePlayer(player.dataset.musicState || (musicEnabled && !audio.paused ? 'playing' : 'paused'));
    }

    function randomTrackIndex() {
      const candidates = tracks
        .map((track, index) => ({ track, index }))
        .filter(({ track, index }) => index !== currentIndex && !failedTracks.has(track.id));
      if (!candidates.length) return -1;
      return candidates[Math.floor(Math.random() * candidates.length)].index;
    }

    function previousShuffleIndex() {
      while (shuffleHistory.length) {
        const previousId = shuffleHistory.pop();
        const index = tracks.findIndex((track) => track.id === previousId);
        if (index >= 0 && index !== currentIndex && !failedTracks.has(previousId)) return index;
      }
      return randomTrackIndex();
    }

    function setMusicEnabled(enabled) {
      musicEnabled = Boolean(enabled);
      savePreference();
      if (musicEnabled) {
        failedTracks.clear();
        consecutiveFailures = 0;
        playbackExhausted = false;
        if (!audio.src && tracks.length) selectTrack(Math.max(0, currentIndex), { play: true });
        else requestPlay();
      } else {
        playRequestSerial += 1;
        audio.pause();
        savePlaybackState();
      }
      updatePlayer(musicEnabled && !audio.paused ? 'playing' : 'paused');
    }

    function changeTrack(direction, { manual = false, fromFailure = false } = {}) {
      if (!tracks.length) return;
      if (manual) {
        failedTracks.clear();
        consecutiveFailures = 0;
        playbackExhausted = false;
        musicEnabled = true;
        savePreference();
      }
      if (tracks.length === 1) {
        try { audio.currentTime = 0; } catch { /* Reload below if seeking is unavailable. */ }
        requestPlay();
        return;
      }
      if (playbackMode === 'shuffle') {
        const targetIndex = direction < 0 ? previousShuffleIndex() : randomTrackIndex();
        if (targetIndex < 0) return;
        const activeTrack = currentTrack();
        if (direction >= 0 && !fromFailure && activeTrack) {
          shuffleHistory.push(activeTrack.id);
          if (shuffleHistory.length > 100) shuffleHistory.shift();
        }
        selectTrack(targetIndex, { play: musicEnabled, resetFailures: manual, manual });
        return;
      }
      selectTrack(currentIndex + direction, { play: musicEnabled, resetFailures: manual, manual });
    }

    modeButton.addEventListener('click', () => {
      setPlaybackMode(playbackMode === 'shuffle' ? 'sequence' : 'shuffle');
    });
    playButton.addEventListener('click', () => {
      setMusicEnabled(!(musicEnabled && !audio.paused));
    });
    previousButton.addEventListener('click', () => changeTrack(-1, { manual: true }));
    nextButton.addEventListener('click', () => changeTrack(1, { manual: true }));

    function showPlaybackError() {
      playbackExhausted = true;
      playRequestSerial += 1;
      audio.pause();
      updatePlayer('error');
    }

    audio.addEventListener('play', () => {
      if (!isCurrentAudioSource()) return;
      failedTracks.delete(currentTrack()?.id);
      consecutiveFailures = 0;
      playbackExhausted = false;
      updatePlayer('playing');
    });
    audio.addEventListener('pause', () => {
      if (!isCurrentAudioSource()) return;
      if (!['error', 'empty', 'loading'].includes(player.dataset.musicState)) updatePlayer('paused');
    });
    audio.addEventListener('loadedmetadata', () => {
      if (isCurrentAudioSource()) restoreMusicPosition();
    });
    audio.addEventListener('canplay', () => {
      if (!isCurrentAudioSource()) return;
      failedTracks.delete(currentTrack()?.id);
      consecutiveFailures = 0;
      restoreMusicPosition();
    });
    audio.addEventListener('ended', () => {
      if (isCurrentAudioSource()) changeTrack(1);
    });
    audio.addEventListener('error', () => {
      if (!isCurrentAudioSource()) return;
      const failedTrack = currentTrack();
      if (!failedTrack) return;
      failedTracks.add(failedTrack.id);
      if (currentSelectionWasManual) {
        showPlaybackError();
        return;
      }
      consecutiveFailures += 1;
      if (musicEnabled && tracks.length > 1 && failedTracks.size < tracks.length && consecutiveFailures < 3) {
        changeTrack(1, { fromFailure: true });
        return;
      }
      showPlaybackError();
    });

    const unlockMusic = (event) => {
      if (!musicEnabled || event.target.closest?.('.site-music-player')) return;
      if (audio.paused && player.dataset.musicState === 'blocked') requestPlay();
    };
    document.addEventListener('pointerdown', unlockMusic, { passive: true });
    document.addEventListener('keydown', unlockMusic);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) savePlaybackState();
      else if (musicEnabled && !playbackExhausted && audio.paused) {
        restoreMusicPosition();
        requestPlay();
      }
    });
    window.addEventListener('pagehide', savePlaybackState);
    window.setInterval(savePlaybackState, 1000);

    const cachedLibrary = readCachedLibrary();
    applyLibrary(cachedLibrary || fallbackMusicLibrary);

    fetch('/api/v1/music', { headers: { accept: 'application/json' }, cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Music API returned ${response.status}`);
        const library = normalizeMusicLibrary(await response.json());
        if (!library) throw new Error('Music API returned invalid data');
        cacheLibrary(library);
        applyLibrary(library);
      })
      .catch(() => {
        if (!tracks.length) updatePlayer('empty');
      });

    if (!musicEnabled) {
      audio.pause();
      updatePlayer('paused');
    } else if (audio.readyState >= 1) {
      restoreMusicPosition();
      requestPlay();
    }

    window.addEventListener('storage', (event) => {
      if (event.key === musicPreferenceKey) {
        setMusicEnabled(event.newValue !== 'off');
      }
      if (event.key === musicPlaybackModeKey) {
        setPlaybackMode(event.newValue === 'shuffle' ? 'shuffle' : 'sequence', { persist: false });
      }
    });
  }

  function initializeSiteChrome() {
    mountAvatarFallback();
    const titleActions = mountTitleActions();
    mountArticleBackButton(titleActions);
    mountUtterancesThemeSync();
    mountGlobalNavigation();
    mountVisitStats();
    mountPaginationControls();
    mountMusicControl(titleActions);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSiteChrome, { once: true });
  } else {
    initializeSiteChrome();
  }
})();
