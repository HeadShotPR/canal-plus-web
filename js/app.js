// js/app.js - Main Application Controller for Canal+ Web Player
let currentSection = 'live'; // 'live', 'movies', 'series', 'games'
let currentCategory = 'all';
let currentItems = [];
let hlsInstance = null;
let activeModalMedia = null;
let adultCategoryIds = new Set();

// DOM Elements
const el = {
  loginScreen: document.getElementById('login-screen'),
  appScreen: document.getElementById('app-screen'),
  loginBtn: document.getElementById('btn-login'),
  loginMsg: document.getElementById('login-msg'),
  loginUser: document.getElementById('login-user'),
  loginPass: document.getElementById('login-pass'),
  userName: document.getElementById('user-name'),
  userStatus: document.getElementById('user-status'),
  categoriesList: document.getElementById('categories-list'),
  itemsGrid: document.getElementById('items-grid'),
  contentTitle: document.getElementById('content-title'),
  contentCount: document.getElementById('content-count'),
  searchInput: document.getElementById('search-input'),
  detailModal: document.getElementById('detail-modal'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  modalPoster: document.getElementById('modal-poster'),
  modalTitle: document.getElementById('modal-title'),
  modalYear: document.getElementById('modal-year'),
  modalRating: document.getElementById('modal-rating'),
  modalDuration: document.getElementById('modal-duration'),
  modalGenre: document.getElementById('modal-genre'),
  modalPlot: document.getElementById('modal-plot'),
  btnWatch: document.getElementById('btn-watch'),
  btnFav: document.getElementById('btn-fav'),
  btnTrailer: document.getElementById('btn-trailer'),
  episodesContainer: document.getElementById('episodes-container'),
  seasonsBar: document.getElementById('seasons-bar'),
  episodesList: document.getElementById('episodes-list'),
  playerOverlay: document.getElementById('player-overlay'),
  mainVideo: document.getElementById('main-video'),
  playerTitle: document.getElementById('player-title'),
  playerPlayPause: document.getElementById('player-play-pause'),
  playerBackBtn: document.getElementById('player-back-btn'),
  playerTimeline: document.getElementById('player-timeline'),
  playerTimeCurrent: document.getElementById('player-time-current'),
  playerTimeTotal: document.getElementById('player-time-total'),
  arcadeContainer: document.getElementById('arcade-container'),
  arcadeIframe: document.getElementById('arcade-iframe'),
  toast: document.getElementById('toast')
};

// --- Toast Notification ---
function showToast(msg, duration = 2500) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), duration);
}

// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
  setupTvKeys();
  setupEvents();

  if (XtreamApi.initFromStorage() && XtreamApi.session.username) {
    el.loginUser.value = XtreamApi.session.username;
    el.loginPass.value = XtreamApi.session.password;
    handleAutoLogin();
  } else {
    showLogin();
  }
});

function showLogin() {
  el.loginScreen.style.display = 'flex';
  el.appScreen.style.display = 'none';
  el.loginUser.focus();
}

function showApp() {
  el.loginScreen.style.display = 'none';
  el.appScreen.style.display = 'flex';
  el.userName.textContent = XtreamApi.session.username || 'Cliente';
  el.userStatus.textContent = 'Ativo';
  switchSection('live');
}

// --- Login Handlers ---
async function handleAutoLogin() {
  try {
    el.loginMsg.textContent = 'Conectando ao servidor...';
    await XtreamApi.login(XtreamApi.session.username, XtreamApi.session.password, XtreamApi.session.server);
    showApp();
  } catch (e) {
    showLogin();
    el.loginMsg.textContent = e.message || 'Erro ao conectar';
  }
}

async function doLogin() {
  const user = el.loginUser.value.trim();
  const pass = el.loginPass.value.trim();

  if (!user || !pass) {
    el.loginMsg.textContent = 'Preencha usuário e senha';
    return;
  }

  el.loginBtn.disabled = true;
  el.loginMsg.textContent = 'Localizando servidor e conectando...';

  try {
    await XtreamApi.login(user, pass);
    el.loginMsg.textContent = '';
    showApp();
  } catch (err) {
    el.loginMsg.textContent = err.message || 'Erro de autenticação';
  } finally {
    el.loginBtn.disabled = false;
  }
}

// --- Section Switching ---
function switchSection(section) {
  stopPlayer();

  currentSection = section;
  currentCategory = 'all';
  el.searchInput.value = '';

  // Update navbar visual
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });

  if (section === 'games') {
    // Show Arcade View
    document.querySelector('.categories-sidebar').style.display = 'none';
    document.querySelector('.content-viewport').style.display = 'none';
    el.arcadeContainer.style.display = 'block';

    // Force load the arcade HTML
    if (!el.arcadeIframe.src || !el.arcadeIframe.src.includes('contra_v3.html')) {
      el.arcadeIframe.src = 'arcade/contra_v3.html';
    }
    el.arcadeIframe.focus();
  } else {
    // Media View (Live, Movies, Series)
    el.arcadeContainer.style.display = 'none';
    document.querySelector('.categories-sidebar').style.display = 'flex';
    document.querySelector('.content-viewport').style.display = 'flex';

    loadSectionData(section);
  }
}

// --- Helper for Favorites section key ---
function getFavSectionKey() {
  return currentSection === 'series' ? 'series' : (currentSection === 'movies' ? 'movie' : 'live');
}

// --- Load Categories and Content ---
async function loadSectionData(section) {
  el.categoriesList.innerHTML = '<div class="spinner"></div>';
  el.itemsGrid.innerHTML = '<div class="spinner"></div>';
  el.contentTitle.textContent = getSectionTitle(section);
  el.contentCount.textContent = 'Carregando...';

  try {
    let categories = [];
    if (section === 'live') {
      categories = await XtreamApi.getLiveCategories();
    } else if (section === 'movies') {
      categories = await XtreamApi.getVodCategories();
    } else if (section === 'series') {
      categories = await XtreamApi.getSeriesCategories();
    }

    renderCategories(categories || []);
    loadCategoryItems('all');
  } catch (err) {
    el.categoriesList.innerHTML = '<p style="padding:16px;color:#ff5252">Erro ao carregar categorias</p>';
    el.itemsGrid.innerHTML = '';
    showToast('Falha ao conectar à lista.');
  }
}

function getSectionTitle(section) {
  switch (section) {
    case 'live': return '📺 Canais Ao Vivo';
    case 'movies': return '🎬 Filmes';
    case 'series': return '🍿 Séries';
    default: return '';
  }
}

function updateFavoritesCatCount() {
  const badge = document.getElementById('fav-count-badge');
  if (badge) {
    const count = Favorites.getList(getFavSectionKey()).length;
    badge.textContent = count;
  }
}

function renderCategories(cats) {
  el.categoriesList.innerHTML = '';

  const sec = getFavSectionKey();
  const favCount = Favorites.getList(sec).length;

  // 1. "★ Favoritos" (exactly like the APK)
  const favItem = document.createElement('div');
  favItem.className = 'cat-item focusable fav-cat-item';
  favItem.dataset.id = '__favorites__';
  favItem.innerHTML = `<span>★ Favoritos</span><span id="fav-count-badge" class="cat-pill">${favCount}</span>`;
  favItem.onclick = () => selectCategory('__favorites__', favItem);
  el.categoriesList.appendChild(favItem);

  // 2. "🌟 Todos"
  const allItem = document.createElement('div');
  allItem.className = 'cat-item focusable active';
  allItem.dataset.id = 'all';
  allItem.innerHTML = `<span>🌟 Todos</span>`;
  allItem.onclick = () => selectCategory('all', allItem);
  el.categoriesList.appendChild(allItem);

  // 3. Demais Categorias
  adultCategoryIds = new Set();
  cats.forEach(c => {
    const isAdult = Parental.isAdultName(c.category_name);
    if (isAdult) adultCategoryIds.add(String(c.category_id));
    const item = document.createElement('div');
    item.className = 'cat-item focusable';
    item.dataset.id = c.category_id;
    item.innerHTML = `<span>${isAdult ? '🔒 ' : ''}${c.category_name}</span>`;
    item.onclick = async () => {
      if (isAdult) {
        const ok = await Parental.promptPin();
        if (!ok) {
          showToast('PIN incorreto!');
          return;
        }
      }
      selectCategory(c.category_id, item);
    };
    el.categoriesList.appendChild(item);
  });
}

function selectCategory(catId, element) {
  currentCategory = catId;
  document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('active'));
  if (element) element.classList.add('active');
  loadCategoryItems(catId);
}

async function loadCategoryItems(catId) {
  el.itemsGrid.innerHTML = '<div class="spinner"></div>';
  el.itemsGrid.classList.toggle('live-mode', currentSection === 'live');

  try {
    let items = [];

    if (catId === '__favorites__') {
      // Load favorites of the active section
      items = Favorites.getList(getFavSectionKey());
      el.contentTitle.textContent = '★ Favoritos';
    } else {
      el.contentTitle.textContent = getSectionTitle(currentSection);
      const filterId = catId === 'all' ? '' : catId;

      if (currentSection === 'live') {
        items = await XtreamApi.getLiveStreams(filterId);
      } else if (currentSection === 'movies') {
        items = await XtreamApi.getVodStreams(filterId);
      } else if (currentSection === 'series') {
        items = await XtreamApi.getSeries(filterId);
      }
    }

    currentItems = items || [];
    // "Todos" must not expose items from PIN-protected (adult) categories
    if (catId === 'all' && adultCategoryIds.size > 0) {
      currentItems = currentItems.filter(it => {
        const ids = [it.category_id, ...(Array.isArray(it.category_ids) ? it.category_ids : [])]
          .filter(x => x !== undefined && x !== null).map(String);
        return !ids.some(id => adultCategoryIds.has(id));
      });
    }
    renderItems(currentItems);
  } catch (e) {
    el.itemsGrid.innerHTML = '<p style="padding:20px;color:#ff5252">Erro ao carregar conteúdo.</p>';
  }
}

function renderItems(items) {
  el.itemsGrid.innerHTML = '';
  el.contentCount.textContent = `${items.length} itens`;

  if (!items || items.length === 0) {
    el.itemsGrid.innerHTML = '<p style="padding:20px;color:var(--text-muted)">Nenhum conteúdo encontrado.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  items.slice(0, 300).forEach(item => {
    if (currentSection === 'live') {
      const card = createLiveCard(item);
      fragment.appendChild(card);
    } else {
      const card = createMediaCard(item);
      fragment.appendChild(card);
    }
  });

  el.itemsGrid.appendChild(fragment);
}

function createLiveCard(item) {
  const card = document.createElement('div');
  card.className = 'live-card focusable';
  const logo = item.stream_icon || item.logo || 'assets/placeholder_channel.png';
  const isFav = Favorites.isFav('live', item.stream_id || item.id);

  card.innerHTML = `
    <div class="logo-box">
      <img src="${logo}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'50\\' height=\\'50\\' viewBox=\\'0 0 24 24\\'><rect width=\\'24\\' height=\\'24\\' fill=\\'%23111\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23666\\' font-size=\\'8\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>TV</text></svg>'">
    </div>
    <div class="channel-info">
      <div class="channel-name">${item.name}</div>
      <div class="channel-badge">AO VIVO</div>
    </div>
    <button class="channel-fav-btn focusable ${isFav ? 'active' : ''}" title="Favoritar">
      ${isFav ? '★' : '☆'}
    </button>
  `;

  // Favorite Star click
  const favBtn = card.querySelector('.channel-fav-btn');
  favBtn.onclick = (e) => {
    e.stopPropagation();
    const next = Favorites.toggle('live', {
      id: item.stream_id || item.id,
      name: item.name,
      stream_icon: item.stream_icon || item.logo
    });
    favBtn.textContent = next ? '★' : '☆';
    favBtn.classList.toggle('active', next);
    showToast(next ? 'Canal adicionado aos Favoritos!' : 'Canal removido dos Favoritos!');
    updateFavoritesCatCount();
    if (currentCategory === '__favorites__') {
      loadCategoryItems('__favorites__');
    }
  };

  card.onclick = async () => {
    if (Parental.isAdultName(item.name)) {
      const ok = await Parental.promptPin();
      if (!ok) {
        showToast('PIN incorreto!');
        return;
      }
    }
    const url = XtreamApi.getLiveUrl(item.stream_id || item.id);
    playStream(url, item.name, 'live');
  };

  return card;
}

function createMediaCard(item) {
  const card = document.createElement('div');
  card.className = 'media-card focusable';
  const poster = item.stream_icon || item.cover || item.logo || '';
  const title = item.name || item.title || '';
  const rating = item.rating ? Number(item.rating).toFixed(1) : '';

  card.innerHTML = `
    <div class="poster-box">
      <img src="${poster}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'160\\' height=\\'240\\'><rect width=\\'160\\' height=\\'240\\' fill=\\'%230d1322\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23445\\' font-size=\\'14\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>Sem Capa</text></svg>'">
      ${rating ? `<div class="rating-badge">★ ${rating}</div>` : ''}
    </div>
    <div class="title-box">
      <div class="media-title">${title}</div>
    </div>
  `;

  card.onclick = () => openMediaModal(item, currentSection);
  return card;
}

// --- Media Modal (Movies & Series) ---
async function openMediaModal(item, section) {
  if (Parental.isAdultName(item.name || item.title)) {
    const ok = await Parental.promptPin();
    if (!ok) {
      showToast('PIN incorreto!');
      return;
    }
  }

  activeModalMedia = item;
  el.detailModal.style.display = 'flex';
  el.modalTitle.textContent = item.name || item.title || 'Detalhes';
  el.modalPoster.src = item.stream_icon || item.cover || item.logo || '';
  el.modalYear.textContent = '';
  el.modalRating.textContent = item.rating ? `★ ${Number(item.rating).toFixed(1)}` : '';
  el.modalDuration.textContent = '';
  el.modalGenre.textContent = '';
  el.modalPlot.textContent = 'Carregando sinopse...';
  el.episodesContainer.style.display = 'none';

  // Favorite button text
  const sec = section === 'series' ? 'series' : 'movie';
  const isFav = Favorites.isFav(sec, item.stream_id || item.series_id || item.id);
  updateFavButton(isFav);

  // Set Watch Button
  if (section === 'movies') {
    el.btnWatch.style.display = 'flex';
    el.btnWatch.onclick = () => {
      closeMediaModal();
      const ext = (activeModalMedia && activeModalMedia.container_extension) || item.container_extension || 'mp4';
      const id = item.stream_id || item.id;
      const playExt = (ext && ext.toLowerCase() !== 'mkv') ? ext.toLowerCase() : 'mp4';
      const url = XtreamApi.getVodUrl(id, playExt);
      playStream(url, item.name || item.title, 'movie');
    };
    loadMovieDetails(item.stream_id || item.id);
  } else if (section === 'series') {
    el.btnWatch.style.display = 'none';
    loadSeriesDetails(item.series_id || item.id);
  }
}

function updateFavButton(isFav) {
  el.btnFav.textContent = isFav ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos';
  el.btnFav.style.background = isFav ? '#c62828' : '#1b5e20';
}

el.btnFav.onclick = () => {
  if (!activeModalMedia) return;
  const sec = currentSection === 'series' ? 'series' : 'movie';
  const next = Favorites.toggle(sec, {
    id: activeModalMedia.stream_id || activeModalMedia.series_id || activeModalMedia.id,
    name: activeModalMedia.name || activeModalMedia.title,
    cover: activeModalMedia.stream_icon || activeModalMedia.cover || activeModalMedia.logo,
    rating: activeModalMedia.rating,
    container_extension: activeModalMedia.container_extension
  });
  updateFavButton(next);
  showToast(next ? 'Adicionado aos Favoritos!' : 'Removido dos Favoritos!');
  updateFavoritesCatCount();
  if (currentCategory === '__favorites__') {
    loadCategoryItems('__favorites__');
  }
};

async function loadMovieDetails(vodId) {
  try {
    const data = await XtreamApi.getVodInfo(vodId);
    if (data) {
      if (data.movie_data && data.movie_data.container_extension) {
        if (activeModalMedia) activeModalMedia.container_extension = data.movie_data.container_extension;
      }
      if (data.info) {
        el.modalPlot.textContent = data.info.plot || data.info.description || 'Sem sinopse disponível.';
        if (data.info.releasedate) el.modalYear.textContent = data.info.releasedate.substring(0, 4);
        if (data.info.duration) el.modalDuration.textContent = data.info.duration;
        if (data.info.genre) el.modalGenre.textContent = data.info.genre;
      }
    }
  } catch (e) {
    el.modalPlot.textContent = 'Não foi possível carregar a sinopse completa.';
  }
}

async function loadSeriesDetails(seriesId) {
  try {
    const data = await XtreamApi.getSeriesInfo(seriesId);
    if (data && data.info) {
      el.modalPlot.textContent = data.info.plot || 'Sem sinopse disponível.';
      if (data.info.releaseDate) el.modalYear.textContent = data.info.releaseDate.substring(0, 4);
      if (data.info.genre) el.modalGenre.textContent = data.info.genre;
    }

    if (data && data.episodes) {
      renderSeriesEpisodes(data.episodes);
    }
  } catch (e) {
    el.modalPlot.textContent = 'Erro ao carregar episódios da série.';
  }
}

function renderSeriesEpisodes(episodesMap) {
  el.episodesContainer.style.display = 'block';
  el.seasonsBar.innerHTML = '';
  el.episodesList.innerHTML = '';

  const seasons = Object.keys(episodesMap);
  if (seasons.length === 0) return;

  seasons.forEach((sNum, index) => {
    const pill = document.createElement('div');
    pill.className = 'season-pill focusable' + (index === 0 ? ' active' : '');
    pill.textContent = `Temporada ${sNum}`;
    pill.onclick = () => {
      document.querySelectorAll('.season-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      showSeasonEpisodes(episodesMap[sNum]);
    };
    el.seasonsBar.appendChild(pill);
  });

  showSeasonEpisodes(episodesMap[seasons[0]]);
}

function showSeasonEpisodes(episodes) {
  el.episodesList.innerHTML = '';
  if (!episodes) return;

  episodes.forEach(ep => {
    const item = document.createElement('div');
    item.className = 'episode-item focusable';
    item.innerHTML = `
      <div>
        <strong>E${ep.episode_num || ''}</strong> - ${ep.title || 'Episódio'}
      </div>
      <span style="font-size:12px;color:var(--accent-cyan)">Assistir ▶</span>
    `;
    item.onclick = () => {
      // Read series name BEFORE closing the modal (closeMediaModal clears activeModalMedia)
      const seriesName = activeModalMedia ? (activeModalMedia.name || activeModalMedia.title || '') : '';
      const ext = ep.container_extension || 'mp4';
      const epId = ep.id || ep.stream_id;
      const playExt = (ext && ext.toLowerCase() !== 'mkv') ? ext.toLowerCase() : 'mp4';
      const url = XtreamApi.getEpisodeUrl(epId, playExt);
      const epTitle = `${seriesName} - E${ep.episode_num || ''}`;
      closeMediaModal();
      playStream(url, epTitle, 'series');
    };
    el.episodesList.appendChild(item);
  });
}

function closeMediaModal() {
  el.detailModal.style.display = 'none';
  el.episodesContainer.style.display = 'none';
  activeModalMedia = null;
}

// --- Video Player ---
function playStream(url, title, type) {
  if (!url) {
    showToast('Link do vídeo indisponível.');
    return;
  }

  el.playerOverlay.style.display = 'flex';
  el.playerTitle.textContent = title || 'Reprodução';
  el.playerOverlay.classList.add('controls-visible');

  // Clear previous player
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  el.mainVideo.pause();
  el.mainVideo.removeAttribute('src');
  el.mainVideo.load();

  // Ensure HTTPS if the page is on HTTPS
  let streamUrl = url;
  if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
    if (streamUrl.includes('plus.lat') || streamUrl.includes('5tv.store')) {
      streamUrl = streamUrl.replace('http://', 'https://');
    }
  }

  const isHls = streamUrl.includes('.m3u8') || type === 'live';

  if (isHls && Hls.isSupported()) {
    // Live TV via Hls.js with CORS proxy (CONFIRMED WORKING!)
    const proxiedUrl = XtreamApi.wrapUrl(streamUrl);
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60
    });
    hlsInstance.loadSource(proxiedUrl);
    hlsInstance.attachMedia(el.mainVideo);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      el.mainVideo.play().catch(() => {});
    });
    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn('HLS fatal error:', data);
        if (hlsInstance) {
          hlsInstance.destroy();
          hlsInstance = null;
        }
        el.mainVideo.src = proxiedUrl;
        el.mainVideo.load();
        el.mainVideo.play().catch(() => {
          showToast('Erro ao reproduzir canal ao vivo.');
        });
      }
    });
  } else {
    // Movies & Series (VOD): Play via proxied URL
    const proxiedVideoUrl = XtreamApi.wrapUrl(streamUrl);
    el.mainVideo.src = proxiedVideoUrl;
    el.mainVideo.load();

    const p = el.mainVideo.play();
    if (p !== undefined) {
      p.catch((err) => {
        console.warn('Play via proxy caught:', err);
        if (err.name === 'NotAllowedError') {
          el.playerPlayPause.textContent = '▶';
        } else {
          // Fallback to direct URL if available
          el.mainVideo.src = streamUrl;
          el.mainVideo.load();
          el.mainVideo.play().catch((err2) => {
            if (err2.name === 'NotAllowedError') {
              el.playerPlayPause.textContent = '▶';
            } else {
              showToast('Erro ao reproduzir fluxo de vídeo.');
            }
          });
        }
      });
    }
  }

  resetControlsTimeout();
}

let controlsTimer = null;
function resetControlsTimeout() {
  clearTimeout(controlsTimer);
  el.playerOverlay.classList.add('controls-visible');
  controlsTimer = setTimeout(() => {
    if (!el.mainVideo.paused) {
      el.playerOverlay.classList.remove('controls-visible');
    }
  }, 4000);
}

function stopPlayer() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  el.mainVideo.pause();
  el.mainVideo.removeAttribute('src');
  el.mainVideo.load();
  el.playerOverlay.style.display = 'none';
  el.playerOverlay.classList.remove('controls-visible');
  clearTimeout(controlsTimer);
}

// --- Player Controls Events ---
el.playerBackBtn.onclick = stopPlayer;

el.playerPlayPause.onclick = () => {
  if (el.mainVideo.paused) {
    el.mainVideo.play();
    el.playerPlayPause.textContent = '⏸';
  } else {
    el.mainVideo.pause();
    el.playerPlayPause.textContent = '▶';
  }
  resetControlsTimeout();
};

el.mainVideo.ontimeupdate = () => {
  if (!el.mainVideo.duration) return;
  const current = el.mainVideo.currentTime;
  const total = el.mainVideo.duration;
  el.playerTimeline.value = (current / total) * 100;
  el.playerTimeCurrent.textContent = formatTime(current);
  el.playerTimeTotal.textContent = formatTime(total);
};

el.playerTimeline.oninput = () => {
  if (!el.mainVideo.duration) return;
  el.mainVideo.currentTime = (el.playerTimeline.value / 100) * el.mainVideo.duration;
};

function formatTime(sec) {
  if (isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

// --- Event Listeners Setup ---
function setupEvents() {
  el.loginBtn.onclick = doLogin;
  el.modalCloseBtn.onclick = closeMediaModal;

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.onclick = () => switchSection(btn.dataset.section);
  });

  // Search filter
  el.searchInput.oninput = () => {
    const query = el.searchInput.value.toLowerCase().trim();
    if (!query) {
      renderItems(currentItems);
      return;
    }
    const filtered = currentItems.filter(item => {
      const name = (item.name || item.title || '').toLowerCase();
      return name.includes(query);
    });
    renderItems(filtered);
  };

  // Logout
  document.getElementById('btn-logout').onclick = () => {
    if (confirm('Deseja realmente sair da sua conta?')) {
      XtreamApi.clearSession();
      showLogin();
    }
  };

  // Close modals on overlay click
  window.onclick = (e) => {
    if (e.target === el.detailModal) closeMediaModal();
  };
}

// --- TV Remote Control (D-pad & Key Codes) ---
function setupTvKeys() {
  window.addEventListener('keydown', (e) => {
    const keyCode = e.keyCode || e.which;

    // Samsung Tizen Return (10009), LG Back (461), Escape (27), Backspace (8)
    if (keyCode === 10009 || keyCode === 461 || keyCode === 27) {
      e.preventDefault();
      if (el.playerOverlay.style.display === 'flex') {
        stopPlayer();
      } else if (el.detailModal.style.display === 'flex') {
        closeMediaModal();
      } else if (currentSection === 'games') {
        switchSection('live');
      }
      return;
    }

    // When Player is active
    if (el.playerOverlay.style.display === 'flex') {
      resetControlsTimeout();
      if (keyCode === 32 || keyCode === 13) {
        el.playerPlayPause.click();
      } else if (keyCode === 37) { // Left 15s
        el.mainVideo.currentTime = Math.max(0, el.mainVideo.currentTime - 15);
      } else if (keyCode === 39) { // Right 15s
        el.mainVideo.currentTime = Math.min(el.mainVideo.duration, el.mainVideo.currentTime + 15);
      }
      return;
    }

    // Spatial Focus Navigation for Smart TV
    if ([37, 38, 39, 40].includes(keyCode)) {
      handleDpad(keyCode);
    }
  });

  window.addEventListener('mousemove', () => {
    if (el.playerOverlay.style.display === 'flex') resetControlsTimeout();
  });
}

function handleDpad(keyCode) {
  const focusables = Array.from(document.querySelectorAll('.focusable:not([disabled])')).filter(el => {
    return el.offsetParent !== null;
  });

  const active = document.activeElement;
  if (!focusables.includes(active)) {
    if (focusables.length > 0) focusables[0].focus();
    return;
  }

  const activeRect = active.getBoundingClientRect();
  let bestNext = null;
  let minDistance = Infinity;

  focusables.forEach(target => {
    if (target === active) return;
    const targetRect = target.getBoundingClientRect();

    let isCandidate = false;
    if (keyCode === 38 && targetRect.bottom <= activeRect.top + 10) isCandidate = true; // UP
    if (keyCode === 40 && targetRect.top >= activeRect.bottom - 10) isCandidate = true; // DOWN
    if (keyCode === 37 && targetRect.right <= activeRect.left + 10) isCandidate = true; // LEFT
    if (keyCode === 39 && targetRect.left >= activeRect.right - 10) isCandidate = true; // RIGHT

    if (isCandidate) {
      const dx = (targetRect.left + targetRect.width / 2) - (activeRect.left + activeRect.width / 2);
      const dy = (targetRect.top + targetRect.height / 2) - (activeRect.top + activeRect.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDistance) {
        minDistance = dist;
        bestNext = target;
      }
    }
  });

  if (bestNext) {
    bestNext.focus();
    bestNext.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
