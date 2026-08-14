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
    if (document.querySelector('.site-music-player')) return;

    const player = document.createElement('section');
    const audio = document.createElement('audio');
    const title = document.createElement('strong');
    const status = document.createElement('span');
    const previousButton = document.createElement('button');
    const playButton = document.createElement('button');
    const nextButton = document.createElement('button');
    let musicEnabled = true;
    let tracks = [];
    let currentIndex = -1;
    let pendingPosition = 0;
    let positionRestored = false;
    let playAfterLoad = false;
    let playbackExhausted = false;
    let playRequestSerial = 0;
    const failedTracks = new Set();
    let savedPlaybackState = { trackId: '', currentTime: 0 };

    try {
      musicEnabled = window.localStorage.getItem(musicPreferenceKey) !== 'off';
    } catch {
      musicEnabled = true;
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
    title.textContent = '正在加载音乐…';
    player.querySelector('.site-music-copy').append(title);
    status.className = 'site-music-live-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    player.append(status);

    previousButton.type = 'button';
    previousButton.className = 'site-music-control';
    previousButton.dataset.musicAction = 'previous';
    previousButton.setAttribute('aria-label', '上一首');
    previousButton.title = '上一首';
    previousButton.innerHTML = '<span aria-hidden="true">⏮</span>';

    playButton.type = 'button';
    playButton.className = 'site-music-control site-music-play';
    playButton.dataset.musicAction = 'play';
    playButton.setAttribute('aria-label', '播放音乐');
    playButton.title = '播放';
    playButton.innerHTML = '<span aria-hidden="true">▶</span>';

    nextButton.type = 'button';
    nextButton.className = 'site-music-control';
    nextButton.dataset.musicAction = 'next';
    nextButton.setAttribute('aria-label', '下一首');
    nextButton.title = '下一首';
    nextButton.innerHTML = '<span aria-hidden="true">⏭</span>';

    player.querySelector('.site-music-controls').append(previousButton, playButton, nextButton);

    audio.className = 'site-background-audio';
    audio.preload = 'metadata';
    audio.volume = 0.42;
    audio.setAttribute('aria-hidden', 'true');

    document.body.append(player, audio);

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
      player.dataset.musicState = state;
      player.dataset.trackId = track?.id || '';
      title.textContent = state === 'error' ? '音乐暂时无法播放' : (track?.title || '暂无音乐');
      player.querySelector('.site-music-status').textContent = labels[state] || labels.paused;
      status.textContent = state === 'error' ? '音乐暂时无法播放' : '';
      playButton.disabled = !track;
      previousButton.disabled = tracks.length < 2;
      nextButton.disabled = tracks.length < 2;
      playButton.setAttribute('aria-label', isPlaying ? '暂停音乐' : '播放音乐');
      playButton.title = isPlaying ? '暂停' : '播放';
      playButton.innerHTML = `<span aria-hidden="true">${isPlaying ? 'Ⅱ' : '▶'}</span>`;
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

    function selectTrack(index, { resumePosition = 0, play = musicEnabled, resetFailures = false } = {}) {
      if (!tracks.length) {
        playRequestSerial += 1;
        currentIndex = -1;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        updatePlayer('empty');
        return;
      }
      currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
      const track = currentTrack();
      playRequestSerial += 1;
      if (resetFailures) failedTracks.clear();
      pendingPosition = Math.max(0, Number(resumePosition) || 0);
      positionRestored = false;
      playAfterLoad = Boolean(play);
      audio.loop = tracks.length === 1;
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

    function setMusicEnabled(enabled) {
      musicEnabled = Boolean(enabled);
      savePreference();
      if (musicEnabled) {
        failedTracks.clear();
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

    function changeTrack(direction, { manual = false } = {}) {
      if (!tracks.length) return;
      if (manual) {
        failedTracks.clear();
        playbackExhausted = false;
        musicEnabled = true;
        savePreference();
      }
      if (tracks.length === 1) {
        try { audio.currentTime = 0; } catch { /* Reload below if seeking is unavailable. */ }
        requestPlay();
        return;
      }
      selectTrack(currentIndex + direction, { play: musicEnabled, resetFailures: manual });
    }

    playButton.addEventListener('click', () => {
      setMusicEnabled(!(musicEnabled && !audio.paused));
    });
    previousButton.addEventListener('click', () => changeTrack(-1, { manual: true }));
    nextButton.addEventListener('click', () => changeTrack(1, { manual: true }));

    audio.addEventListener('play', () => {
      failedTracks.delete(currentTrack()?.id);
      playbackExhausted = false;
      updatePlayer('playing');
    });
    audio.addEventListener('pause', () => {
      if (!['error', 'empty', 'loading'].includes(player.dataset.musicState)) updatePlayer('paused');
    });
    audio.addEventListener('loadedmetadata', restoreMusicPosition);
    audio.addEventListener('canplay', () => {
      failedTracks.delete(currentTrack()?.id);
      restoreMusicPosition();
    });
    audio.addEventListener('ended', () => changeTrack(1));
    audio.addEventListener('error', () => {
      const failedTrack = currentTrack();
      if (!failedTrack) return;
      failedTracks.add(failedTrack.id);
      if (musicEnabled && tracks.length > 1 && failedTracks.size < tracks.length) {
        changeTrack(1);
        return;
      }
      playbackExhausted = true;
      playRequestSerial += 1;
      audio.pause();
      updatePlayer('error');
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
    });
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
