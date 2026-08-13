(() => {
  const siteStartedAt = Date.UTC(2026, 7, 11);
  const musicSource = 'https://aqqmusic.tc.qq.com/C400004JYkhl1ccbXL.m4a?guid=570938557&vkey=42950A34D64304D428C93616A08F00B56C650CCEEC25DEA15B6B2E62C3299994155260AC0D1FF6780BA27D7AFDF908AFFF7A7B76698B075B__v2b94c62d&uin=&fromtag=120032';
  const musicPreferenceKey = 'lightwind-background-music-enabled-v1';
  const musicPositionKey = 'lightwind-background-music-position-v1';

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

  function mountMusicControl() {
    if (document.querySelector('.site-music-toggle')) return;

    const themeButton = document.querySelector('.title-right a[onclick*="modeSwitch"]');
    const osMusicSlot = document.querySelector('#osMusicSlot');
    const button = document.createElement('button');
    const audio = document.createElement('audio');
    let musicEnabled = true;
    let resumePosition = 0;
    let positionRestored = false;

    try {
      musicEnabled = window.localStorage.getItem(musicPreferenceKey) !== 'off';
    } catch {
      musicEnabled = true;
    }

    try {
      const savedPosition = Number(window.sessionStorage.getItem(musicPositionKey));
      if (Number.isFinite(savedPosition) && savedPosition >= 0) resumePosition = savedPosition;
    } catch {
      resumePosition = 0;
    }

    button.type = 'button';
    button.className = 'site-music-toggle';
    button.setAttribute('aria-pressed', String(musicEnabled));
    button.innerHTML = '<span class="site-music-icon" aria-hidden="true">♫</span><span class="site-music-label">音乐</span>';

    audio.className = 'site-background-audio';
    audio.src = musicSource;
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.42;
    audio.setAttribute('aria-hidden', 'true');

    if (osMusicSlot) osMusicSlot.append(button);
    else if (themeButton?.parentNode) themeButton.parentNode.insertBefore(button, themeButton.nextSibling);
    else document.body.append(button);
    document.body.append(audio);

    function savePreference() {
      try {
        window.localStorage.setItem(musicPreferenceKey, musicEnabled ? 'on' : 'off');
      } catch {
        // Private browsing or blocked storage should not disable the player.
      }
    }

    function saveMusicPosition() {
      if (!Number.isFinite(audio.currentTime)) return;
      try {
        window.sessionStorage.setItem(musicPositionKey, String(audio.currentTime));
      } catch {
        // Private browsing or blocked storage should not interrupt playback.
      }
    }

    function updateButton(state = audio.paused ? 'paused' : 'playing') {
      const isPlaying = musicEnabled && state === 'playing';
      const isBlocked = musicEnabled && state === 'blocked';
      button.dataset.musicState = isPlaying ? 'playing' : isBlocked ? 'blocked' : 'paused';
      button.setAttribute('aria-pressed', String(musicEnabled));
      button.setAttribute('aria-label', isPlaying ? '关闭背景音乐' : '开启背景音乐');
      button.title = isPlaying ? '关闭背景音乐' : isBlocked ? '点击开启背景音乐' : '开启背景音乐';
      button.querySelector('.site-music-label').textContent = isPlaying ? '音乐' : '静音';
    }

    function requestPlay() {
      if (!musicEnabled) return;
      const playPromise = audio.play();
      if (playPromise?.then) {
        playPromise.then(() => updateButton('playing')).catch(() => updateButton('blocked'));
      }
    }

    function restoreMusicPosition() {
      if (positionRestored || audio.readyState < 1 || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      if (resumePosition > 0) {
        const safePosition = Math.min(resumePosition % audio.duration, Math.max(0, audio.duration - 0.25));
        try {
          audio.currentTime = safePosition;
        } catch {
          // The media can still be played from the beginning if seeking is unavailable.
        }
      }
      positionRestored = true;
      if (musicEnabled) requestPlay();
    }

    function setMusicEnabled(enabled) {
      musicEnabled = enabled;
      savePreference();
      if (musicEnabled) {
        restoreMusicPosition();
        requestPlay();
      } else {
        audio.pause();
        saveMusicPosition();
      }
      updateButton();
    }

    button.addEventListener('click', () => {
      setMusicEnabled(musicEnabled && !audio.paused ? false : true);
    });
    audio.addEventListener('play', () => updateButton('playing'));
    audio.addEventListener('pause', () => updateButton());
    audio.addEventListener('loadedmetadata', restoreMusicPosition);
    audio.addEventListener('canplay', restoreMusicPosition);
    audio.addEventListener('error', () => {
      if (musicEnabled) updateButton('blocked');
    });

    const unlockMusic = (event) => {
      if (!musicEnabled || event.target.closest?.('.site-music-toggle')) return;
      if (audio.paused) requestPlay();
    };
    document.addEventListener('pointerdown', unlockMusic, { passive: true });
    document.addEventListener('keydown', unlockMusic);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveMusicPosition();
      else if (musicEnabled && audio.paused) {
        restoreMusicPosition();
        requestPlay();
      }
    });
    window.addEventListener('pagehide', saveMusicPosition);
    window.setInterval(saveMusicPosition, 1000);

    updateButton();
    if (musicEnabled) {
      if (resumePosition > 0 && audio.readyState < 1) {
        audio.load();
      } else {
        restoreMusicPosition();
        requestPlay();
      }
    }
  }

  function initializeSiteChrome() {
    mountGlobalNavigation();
    mountVisitStats();
    mountMusicControl();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSiteChrome, { once: true });
  } else {
    initializeSiteChrome();
  }
})();
