// js/app.js - Main Application Controller for Canal+ Web Player
let currentSection = 'live'; // 'live', 'movies', 'series', 'games'
let currentCategory = 'all';
let currentItems = [];
let hlsInstance = null;
let activeModalMedia = null;
let adultCategoryIds = new Set();

// Estado e Memória de Séries (Paridade com o APK)
const SeriesStore = {
  KEY: 'canalmais_series_v1',
  getAll() {
    try {
      const s = localStorage.getItem(this.KEY);
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  },
  getLast(seriesId) {
    if (!seriesId) return null;
    const all = this.getAll();
    return all[seriesId] || null;
  },
  save(seriesId, epId, epIndex, epTitle) {
    if (!seriesId) return;
    try {
      const all = this.getAll();
      all[seriesId] = {
        epId: String(epId),
        epIndex: Number(epIndex),
        epTitle: epTitle || '',
        updatedAt: Date.now()
      };
      localStorage.setItem(this.KEY, JSON.stringify(all));
    } catch (e) {}
  }
};

let currentSeriesEpisodes = [];
let currentSeriesIndex = -1;
let currentSeriesId = null;
let currentSeriesName = '';
let currentSeriesCover = '';
let seriesAutoPlayTimer = null;

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
  btnDownload: document.getElementById('btn-download'),
  btnFav: document.getElementById('btn-fav'),
  btnTrailer: document.getElementById('btn-trailer'),
  episodesContainer: document.getElementById('episodes-container'),
  seasonsBar: document.getElementById('seasons-bar'),
  episodesList: document.getElementById('episodes-list'),
  localVideoInput: document.getElementById('local-video-input'),
  playerOverlay: document.getElementById('player-overlay'),
  mainVideo: document.getElementById('main-video'),
  playerTitle: document.getElementById('player-title'),
  playerFavBtn: document.getElementById('player-fav-btn'),
  playerSeriesNextBtn: document.getElementById('player-series-next-btn'),
  playerSeriesEpsBtn: document.getElementById('player-series-eps-btn'),
  inplayerEpisodesModal: document.getElementById('inplayer-episodes-modal'),
  inplayerEpisodesList: document.getElementById('inplayer-episodes-list'),
  inplayerEpisodesTitle: document.getElementById('inplayer-episodes-title'),
  btnCloseInplayerEps: document.getElementById('btn-close-inplayer-eps'),
  playerPlayPause: document.getElementById('player-play-pause'),
  playerBackBtn: document.getElementById('player-back-btn'),
  playerTimelineBox: document.getElementById('player-timeline-box'),
  playerTimeline: document.getElementById('player-timeline'),
  playerTimeCurrent: document.getElementById('player-time-current'),
  playerTimeTotal: document.getElementById('player-time-total'),
  playerQualityBar: document.getElementById('player-quality-bar'),
  qualityPillsRow: document.getElementById('quality-pills-row'),
  btnPlayerReconnect: document.getElementById('btn-player-reconnect'),
  btnAspectContain: document.getElementById('btn-aspect-contain'),
  btnAspectFill: document.getElementById('btn-aspect-fill'),
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
  if (section === 'offline') {
    el.categoriesList.innerHTML = `
      <div class="cat-item focusable active">
        <span>⬇</span> Filmes Baixados
      </div>
    `;
    loadOfflineItems();
    return;
  }

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
    case 'offline': return '⬇ Filmes & Vídeos Offline';
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

  // 1.5 "▶ Continuar Assistindo" (Filmes e Séries, igual no APK)
  if (currentSection === 'movies' || currentSection === 'series') {
    const resumeCount = ResumeStore.count(currentSection);
    const resumeItem = document.createElement('div');
    resumeItem.className = 'cat-item focusable resume-cat-item';
    resumeItem.dataset.id = '__resume__';
    resumeItem.innerHTML = `<span>▶ Continuar Assistindo</span><span id="resume-count-badge" class="cat-pill">${resumeCount}</span>`;
    resumeItem.onclick = () => selectCategory('__resume__', resumeItem);
    el.categoriesList.appendChild(resumeItem);
  }

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
          return; // cancelado pelo usuário
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

// --- Channel Grouper (Quality grouping for Live TV) ---
const ChannelGrouper = {
  QUALITY_REGEX: /[\s\(\[]+(4K|UHD|FHD[²2]?|HD[²2]?|SD[²2]?|HEVC|H\.265)[\)\]]?\s*$/i,
  variantsByStreamId: new Map(),
  variantsByName: new Map(),

  normalizeQuality(q) {
    if (!q) return 'HD';
    const upper = q.toUpperCase();
    if (upper === 'FHD2') return 'FHD²';
    if (upper === 'HD2') return 'HD²';
    if (upper === 'SD2') return 'SD²';
    if (upper === 'H.265') return 'HEVC';
    return upper;
  },

  getQualityRank(q) {
    const map = {
      '4K': 1,
      'UHD': 2,
      'FHD': 3,
      'FHD²': 4,
      'HD': 5,
      'HD²': 6,
      'SD': 7,
      'SD²': 8,
      'HEVC': 9
    };
    return map[q] || 10;
  },

  extractQuality(name) {
    if (!name) return { cleanName: '', quality: 'HD' };
    const m = name.match(this.QUALITY_REGEX);
    if (m) {
      const rawQ = m[1];
      const clean = name.slice(0, m.index).replace(/[\s\-\|:]+$/, '').trim();
      return { cleanName: clean || name, quality: this.normalizeQuality(rawQ) };
    }
    return { cleanName: name.trim(), quality: 'HD' };
  },

  cleanChannelKey(name) {
    const { cleanName } = this.extractQuality(name);
    return cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
  },

  registerVariants(streamId, name, variants) {
    if (!Array.isArray(variants) || variants.length === 0) return;
    if (streamId) {
      this.variantsByStreamId.set(String(streamId), variants);
    }
    variants.forEach(v => {
      const vId = v.stream_id || (v.item && (v.item.stream_id || v.item.id));
      if (vId) this.variantsByStreamId.set(String(vId), variants);
    });
    const key = this.cleanChannelKey(name);
    if (key) {
      this.variantsByName.set(key, variants);
    }
  },

  getVariants(streamId, name) {
    if (streamId && this.variantsByStreamId.has(String(streamId))) {
      return this.variantsByStreamId.get(String(streamId));
    }
    const key = this.cleanChannelKey(name);
    if (key && this.variantsByName.has(key)) {
      return this.variantsByName.get(key);
    }
    return null;
  },

  groupLiveStreams(streams) {
    if (!Array.isArray(streams) || streams.length === 0) return [];
    const groups = new Map();

    for (const item of streams) {
      const { cleanName, quality } = this.extractQuality(item.name);
      const key = `${item.category_id || ''}_${cleanName.toLowerCase()}`;

      if (!groups.has(key)) {
        groups.set(key, { cleanName, variants: [] });
      }

      groups.get(key).variants.push({
        quality,
        rank: this.getQualityRank(quality),
        stream_id: item.stream_id || item.id,
        name: item.name,
        item
      });
    }

    const grouped = [];
    for (const group of groups.values()) {
      group.variants.sort((a, b) => a.rank - b.rank);
      const primary = group.variants[0];

      // Store in global memory cache so favorites and other views retain variants
      this.registerVariants(primary.stream_id, group.cleanName, group.variants);

      grouped.push({
        ...primary.item,
        displayName: group.cleanName || primary.item.name,
        variants: group.variants
      });
    }

    return grouped;
  }
};

async function loadCategoryItems(catId) {
  el.itemsGrid.innerHTML = '<div class="spinner"></div>';
  el.itemsGrid.classList.toggle('live-mode', currentSection === 'live');

  try {
    let items = [];

    if (catId === '__resume__') {
      items = ResumeStore.list(currentSection);
      el.contentTitle.textContent = '▶ Continuar Assistindo';
      currentItems = items || [];
      renderResumeItems(currentItems);
      return;
    } else if (catId === '__favorites__') {
      // Load favorites of the active section
      items = Favorites.getList(getFavSectionKey());
      el.contentTitle.textContent = '★ Favoritos';
      if (currentSection === 'live') {
        // Register any saved variants into ChannelGrouper cache!
        items.forEach(it => {
          if (it.variants && it.variants.length > 0) {
            ChannelGrouper.registerVariants(it.stream_id || it.id, it.displayName || it.name, it.variants);
          }
        });
      }
    } else {
      el.contentTitle.textContent = getSectionTitle(currentSection);
      const filterId = catId === 'all' ? '' : catId;

      if (currentSection === 'live') {
        const rawLive = await XtreamApi.getLiveStreams(filterId);
        items = ChannelGrouper.groupLiveStreams(rawLive || []);
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
  const displayName = item.displayName || item.cleanName || item.name;
  const isFav = Favorites.isFav('live', item.stream_id || item.id, displayName);

  let badgesHtml = '<div class="channel-badge">AO VIVO</div>';
  if (item.variants && item.variants.length > 1) {
    badgesHtml += `<div class="channel-quality-badge" title="${item.variants.length} qualidades disponíveis">${item.variants.length}Q</div>`;
  }

  card.innerHTML = `
    <div class="logo-box">
      <img src="${logo}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'50\\' height=\\'50\\' viewBox=\\'0 0 24 24\\'><rect width=\\'24\\' height=\\'24\\' fill=\\'%23111\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23666\\' font-size=\\'8\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>TV</text></svg>'">
    </div>
    <div class="channel-info">
      <div class="channel-name">${displayName}</div>
      <div style="display:flex; gap:6px; align-items:center;">
        ${badgesHtml}
      </div>
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
      ...item,
      id: item.stream_id || item.id,
      name: displayName,
      displayName: displayName,
      stream_icon: item.stream_icon || item.logo,
      variants: item.variants || ChannelGrouper.getVariants(item.stream_id || item.id, displayName)
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
    if (Parental.isAdultName(displayName)) {
      const ok = await Parental.promptPin();
      if (!ok) {
        return; // cancelado pelo usuário
      }
    }
    playLiveWithQualities(item);
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

// --- Resume Watching Store (Ported from Android ResumeStore) ---
const ResumeStore = {
  KEY: 'canalmais_resume_v1',
  getAll() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },
  saveAll(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (e) {}
  },
  count(section) {
    return this.list(section).length;
  },
  get(id) {
    if (!id) return null;
    const all = this.getAll();
    return all[String(id)] || null;
  },
  save(id, name, poster, pos, dur, section, streamUrl, extra = {}) {
    if (!id || !dur || dur <= 0 || pos < 5) return;
    if (Parental.isAdultName(name) || (section && Parental.isAdultName(section))) {
      this.remove(id);
      return;
    }

    const pct = Math.floor((pos * 100) / dur);
    // Se completou 95% ou faltam menos de 30s, concluiu o filme -> remove do continuar assistindo
    if (pct >= 95 || (dur - pos) < 30) {
      this.remove(id);
      return;
    }

    const all = this.getAll();
    all[String(id)] = {
      id: String(id),
      name: name || 'Filme',
      poster: poster || '',
      pos: Math.floor(pos),
      dur: Math.floor(dur),
      pct: pct,
      section: section || 'movies',
      streamUrl: streamUrl || '',
      updatedAt: Date.now(),
      extra: extra
    };
    this.saveAll(all);
    updateResumeCatCount();
  },
  remove(id) {
    if (!id) return;
    const all = this.getAll();
    if (all[String(id)]) {
      delete all[String(id)];
      this.saveAll(all);
      updateResumeCatCount();
    }
  },
  list(filterSection) {
    const all = this.getAll();
    const arr = Object.values(all);
    arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!filterSection || filterSection === 'all') {
      return arr;
    }

    return arr.filter(item => {
      if (filterSection === 'movies' && (item.section === 'movies' || item.section === 'vod' || item.section === 'movie')) return true;
      if (filterSection === 'series' && item.section === 'series') return true;
      return item.section === filterSection;
    });
  }
};

function updateResumeCatCount() {
  const badge = document.getElementById('resume-count-badge');
  if (badge) {
    badge.textContent = ResumeStore.count(currentSection);
  }
}

function renderResumeItems(items) {
  el.itemsGrid.innerHTML = '';
  el.itemsGrid.classList.remove('live-mode');
  el.contentCount.textContent = `${items.length} itens`;

  if (!items || items.length === 0) {
    el.itemsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: #94a3b8;">
        <div style="font-size: 48px; margin-bottom: 12px;">▶</div>
        <h3 style="color: #fff; margin-bottom: 8px;">Nenhum conteúdo em andamento</h3>
        <p style="font-size: 14px; max-width: 500px; margin: 0 auto;">
          Quando você começar a assistir a um filme ou série e pausar, ele aparecerá aqui com o minuto exato para você continuar de onde parou!
        </p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'media-card focusable';
    const poster = item.poster || 'assets/placeholder_channel.png';
    const title = item.name || '';
    const posStr = formatTime(item.pos);
    const durStr = formatTime(item.dur);
    const pct = item.pct || 0;

    card.innerHTML = `
      <div class="poster-box">
        <img src="${poster}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'160\\' height=\\'240\\'><rect width=\\'160\\' height=\\'240\\' fill=\\'%230d1322\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23445\\' font-size=\\'14\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>Sem Capa</text></svg>'">
        <div class="resume-badge">⏱ ${posStr} / ${durStr} (${pct}%)</div>
        <div class="resume-progress-container">
          <div class="resume-progress-bar" style="width: ${pct}%;"></div>
        </div>
      </div>
      <div class="title-box">
        <div class="media-title">${title}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
          <span style="font-size:11.5px; color:#38bdf8; font-weight:700;">▶ Continuar</span>
          <button class="btn-delete-resume focusable" title="Remover do histórico" style="background:rgba(255,255,255,0.1); color:#94a3b8; border:none; padding:3px 7px; border-radius:6px; cursor:pointer; font-size:11px;">✕</button>
        </div>
      </div>
    `;

    card.onclick = () => {
      const url = item.streamUrl || (item.section === 'series' ? XtreamApi.getEpisodeUrl(item.id) : XtreamApi.getVodUrl(item.id));
      playStream(url, title, item.section, [], null, item.id, poster, item.pos);
    };

    const btnDel = card.querySelector('.btn-delete-resume');
    btnDel.onclick = (e) => {
      e.stopPropagation();
      ResumeStore.remove(item.id);
      showToast('Item removido do Continuar Assistindo.');
      loadCategoryItems('__resume__');
    };

    fragment.appendChild(card);
  });

  el.itemsGrid.appendChild(fragment);
}

// --- Downloads & Offline Storage System (Ported from Android DownloadStore) ---
const DownloadsStore = {
  KEY: 'canalmais_downloads_v1',
  getAll() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },
  saveAll(list) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(list));
    } catch (e) {}
  },
  add(item) {
    if (!item || !item.id) return;
    const list = this.getAll().filter(i => String(i.id) !== String(item.id));
    list.unshift({
      id: item.id,
      name: item.name || item.title || 'Filme',
      poster: item.poster || item.stream_icon || item.cover || item.logo || '',
      rating: item.rating || '',
      year: item.year || '',
      url: item.url || '',
      fileName: item.fileName || '',
      downloadedAt: Date.now()
    });
    this.saveAll(list);
  },
  remove(id) {
    const list = this.getAll().filter(i => String(i.id) !== String(id));
    this.saveAll(list);
  },
  isDownloaded(id) {
    return this.getAll().some(i => String(i.id) === String(id));
  }
};

function handleDownloadMovie(item) {
  if (!item) return;
  const id = item.stream_id || item.id;
  const ext = (activeModalMedia && activeModalMedia.container_extension) || item.container_extension || 'mp4';
  const playExt = (ext && ext.toLowerCase() !== 'mkv') ? ext.toLowerCase() : 'mp4';
  const url = XtreamApi.getVodUrl(id, playExt);
  const cleanTitle = (item.name || item.title || 'filme').replace(/[/\\?%*:|"<>]/g, '_');
  const fileName = `${cleanTitle}.${playExt}`;

  // Salva os dados na aba Offline
  DownloadsStore.add({
    id: id,
    name: item.name || item.title || 'Filme',
    poster: item.stream_icon || item.cover || item.logo || '',
    rating: item.rating || '',
    year: item.year || '',
    url: url,
    fileName: fileName
  });

  // Dispara o download nativo do arquivo no navegador
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast(`⬇ Download iniciado! Salvo na sua aba Offline.`);
}

function createOfflineCard(item) {
  const card = document.createElement('div');
  card.className = 'media-card focusable';
  const poster = item.poster || '';
  const title = item.name || 'Filme Offline';
  const rating = item.rating ? Number(item.rating).toFixed(1) : '';

  card.innerHTML = `
    <div class="poster-box">
      <img src="${poster}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'160\\' height=\\'240\\'><rect width=\\'160\\' height=\\'240\\' fill=\\'%230d1322\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23445\\' font-size=\\'14\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>Offline</text></svg>'">
      <div class="channel-quality-badge" style="background:#10b981; color:#fff; position:absolute; top:8px; left:8px; font-weight:800;">OFFLINE</div>
      ${rating ? `<div class="rating-badge">★ ${rating}</div>` : ''}
    </div>
    <div class="title-box">
      <div class="media-title">${title}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; gap:8px;">
        <button class="btn-watch-offline focusable" style="flex:1; background:#0ea5e9; color:#fff; border:none; padding:6px 12px; border-radius:12px; font-size:12px; font-weight:700; cursor:pointer;">
          ▶ Assistir
        </button>
        <button class="btn-delete-offline focusable" title="Remover" style="background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid rgba(239,68,68,0.4); padding:5px 9px; border-radius:10px; font-size:12px; cursor:pointer;">
          🗑️
        </button>
      </div>
    </div>
  `;

  // Assistir
  const btnWatch = card.querySelector('.btn-watch-offline');
  btnWatch.onclick = (e) => {
    e.stopPropagation();
    playStream(item.url, title, 'movie', [], null, item.id, item.poster);
  };

  card.onclick = () => {
    playStream(item.url, title, 'movie', [], null, item.id, item.poster);
  };

  // Excluir
  const btnDelete = card.querySelector('.btn-delete-offline');
  btnDelete.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Remover "${title}" dos seus downloads offline?`)) {
      DownloadsStore.remove(item.id);
      showToast('Filme removido da lista offline.');
      loadOfflineItems();
    }
  };

  return card;
}

function handleSelectedLocalFile(file) {
  if (!file) return;
  const blobUrl = URL.createObjectURL(file);
  const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
  const localId = 'local_' + encodeURIComponent(file.name);

  DownloadsStore.add({
    id: localId,
    name: `📂 ${cleanTitle}`,
    poster: '',
    rating: 'Local',
    year: new Date().getFullYear(),
    url: blobUrl,
    fileName: file.name
  });

  showToast(`Abrindo: ${cleanTitle}...`, 2500);
  playStream(blobUrl, `📂 ${cleanTitle}`, 'movie', [], null, localId, '', 0);

  if (currentSection === 'offline') {
    loadOfflineItems();
  }
}

async function openLocalVideoPicker() {
  // 1. Tentar Modern File System Access API (Nativo do Windows no Opera GX, Chrome, Edge)
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'Vídeos e Filmes',
          accept: {
            'video/*': ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.m3u8', '.wmv', '.flv']
          }
        }]
      });
      if (handles && handles.length > 0) {
        const file = await handles[0].getFile();
        handleSelectedLocalFile(file);
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // Cancelado pelo usuário
      console.warn('showOpenFilePicker:', err);
    }
  }

  // 2. Fallback com input file no DOM
  let input = document.getElementById('local-video-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'local-video-input';
    input.accept = 'video/*,.mp4,.mkv,.avi,.mov,.webm,.ts,.m3u8,.wmv,.flv';
    input.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;';
    document.body.appendChild(input);
  }
  el.localVideoInput = input;

  input.value = '';
  input.onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      handleSelectedLocalFile(file);
    }
  };

  input.click();
}

function loadOfflineItems() {
  el.itemsGrid.innerHTML = '';
  el.itemsGrid.classList.remove('live-mode');
  const items = DownloadsStore.getAll();
  el.contentTitle.textContent = '⬇ Filmes Baixados (Offline)';
  el.contentCount.textContent = `${items.length} itens`;

  // Banner superior com botão para abrir arquivo do computador / pendrive
  const topBar = document.createElement('div');
  topBar.style.cssText = 'grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 14px 20px; margin-bottom: 12px;';
  topBar.innerHTML = `
    <div>
      <div style="font-weight: 800; font-size: 15px; color: #fff;">📁 Reprodução 100% Offline (Sem Internet)</div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Assista aos filmes baixados direto no app ou abra arquivos do seu computador/pendrive.</div>
    </div>
    <button id="btn-browse-local" class="focusable" style="background:#0ea5e9; color:#fff; border:none; padding:8px 16px; border-radius:18px; font-weight:700; cursor:pointer; font-size:13px;">
      📂 Abrir Arquivo do Disco
    </button>
  `;
  el.itemsGrid.appendChild(topBar);

  const btnBrowse = topBar.querySelector('#btn-browse-local');
  if (btnBrowse) {
    btnBrowse.onclick = (e) => {
      e.stopPropagation();
      openLocalVideoPicker();
    };
  }

  if (items.length === 0) {
    const emptyBox = document.createElement('div');
    emptyBox.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: #94a3b8;';
    emptyBox.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 12px;">⬇</div>
      <h3 style="color: #fff; margin-bottom: 8px;">Nenhum filme baixado ainda</h3>
      <p style="font-size: 14px; max-width: 520px; margin: 0 auto;">
        Vá até a aba <b>🎬 Filmes</b>, abra qualquer filme e clique em <b>"⬇ Baixar Filme"</b>. O arquivo será baixado e listado aqui para você assistir offline!
      </p>
    `;
    el.itemsGrid.appendChild(emptyBox);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    fragment.appendChild(createOfflineCard(item));
  });
  el.itemsGrid.appendChild(fragment);
}

// --- Media Modal (Movies & Series) ---
async function openMediaModal(item, section) {
  if (Parental.isAdultName(item.name || item.title)) {
    const ok = await Parental.promptPin();
    if (!ok) {
      return; // cancelado pelo usuário
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

  // Set Watch and Download Buttons
  if (section === 'movies') {
    el.btnWatch.style.display = 'flex';
    if (el.btnDownload) {
      el.btnDownload.style.display = 'flex';
      el.btnDownload.onclick = () => {
        handleDownloadMovie(item);
      };
    }
    el.btnWatch.onclick = () => {
      closeMediaModal();
      const ext = (activeModalMedia && activeModalMedia.container_extension) || item.container_extension || 'mp4';
      const id = item.stream_id || item.id;
      const playExt = (ext && ext.toLowerCase() !== 'mkv') ? ext.toLowerCase() : 'mp4';
      const url = XtreamApi.getVodUrl(id, playExt);
      const poster = item.stream_icon || item.cover || item.logo || '';
      playStream(url, item.name || item.title, 'movie', [], null, id, poster);
    };
    loadMovieDetails(item.stream_id || item.id);
  } else if (section === 'series') {
    el.btnWatch.style.display = 'none';
    if (el.btnDownload) el.btnDownload.style.display = 'none';
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

  const seriesId = activeModalMedia ? (activeModalMedia.series_id || activeModalMedia.id || activeModalMedia.stream_id) : currentSeriesId;
  const seriesName = activeModalMedia ? (activeModalMedia.name || activeModalMedia.title || '') : currentSeriesName;
  const seriesCover = activeModalMedia ? (activeModalMedia.stream_icon || activeModalMedia.cover || activeModalMedia.logo || '') : currentSeriesCover;
  const saved = SeriesStore.getLast(seriesId);

  episodes.forEach((ep, idx) => {
    const item = document.createElement('div');
    item.className = 'episode-item focusable';
    const epId = ep.id || ep.stream_id;

    const isCurrent = (currentSeriesId == seriesId) && (currentSeriesIndex === idx || String(currentStreamId) === String(epId));
    const isSaved = saved && String(saved.epId) === String(epId);

    let badgeHtml = '';
    if (isCurrent) {
      badgeHtml = `<span style="color:#38bdf8; font-weight:800; margin-right:6px; background:rgba(14,165,233,0.15); padding:2px 6px; border-radius:4px; border:1px solid #0ea5e9;">▶ [ATUAL]</span>`;
      item.style.borderColor = '#0ea5e9';
      item.style.background = 'rgba(14,165,233,0.1)';
    } else if (isSaved) {
      badgeHtml = `<span style="color:#4ade80; font-weight:800; margin-right:6px; background:rgba(74,222,128,0.15); padding:2px 6px; border-radius:4px; border:1px solid #4ade80;">▶ [ONDE PAROU]</span>`;
      item.style.borderColor = 'rgba(74,222,128,0.4)';
    }

    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px;">
        ${badgeHtml}
        <strong>E${ep.episode_num || (idx + 1)}</strong> - ${ep.title || 'Episódio'}
      </div>
      <span style="font-size:12px;color:var(--accent-cyan); font-weight:700;">Assistir ▶</span>
    `;

    item.onclick = () => {
      closeMediaModal();
      playSeriesEpisode(seriesId, seriesName, seriesCover, episodes, idx);
    };
    el.episodesList.appendChild(item);
  });
}

function playSeriesEpisode(seriesId, seriesName, seriesCover, episodesList, index) {
  if (!episodesList || index < 0 || index >= episodesList.length) return;
  currentSeriesEpisodes = episodesList;
  currentSeriesIndex = index;
  currentSeriesId = seriesId;
  currentSeriesName = seriesName;
  currentSeriesCover = seriesCover;

  if (seriesAutoPlayTimer) {
    clearTimeout(seriesAutoPlayTimer);
    seriesAutoPlayTimer = null;
  }

  const ep = episodesList[index];
  const epId = ep.id || ep.stream_id;
  const ext = ep.container_extension || 'mp4';
  const playExt = (ext && ext.toLowerCase() !== 'mkv') ? ext.toLowerCase() : 'mp4';
  const url = XtreamApi.getEpisodeUrl(epId, playExt);
  const epTitle = `${seriesName} - E${ep.episode_num || (index + 1)}: ${ep.title || 'Episódio'}`;

  // Salva onde parou
  SeriesStore.save(seriesId, epId, index, ep.title || '');

  updatePlayerSeriesButtons();
  playStream(url, epTitle, 'series', [], null, epId, seriesCover);
}

function playNextEpisode() {
  if (seriesAutoPlayTimer) {
    clearTimeout(seriesAutoPlayTimer);
    seriesAutoPlayTimer = null;
  }
  if (currentSeriesEpisodes && currentSeriesIndex + 1 < currentSeriesEpisodes.length) {
    const nextIdx = currentSeriesIndex + 1;
    showToast(`▶ Carregando Próximo Episódio...`, 2000);
    playSeriesEpisode(currentSeriesId, currentSeriesName, currentSeriesCover, currentSeriesEpisodes, nextIdx);
  } else {
    showToast('Você chegou ao último episódio desta temporada.', 3000);
  }
}

function openInPlayerEpisodesDialog() {
  const modal = document.getElementById('inplayer-episodes-modal');
  const list = document.getElementById('inplayer-episodes-list');
  const title = document.getElementById('inplayer-episodes-title');
  if (!modal || !list) return;

  if (!currentSeriesEpisodes || currentSeriesEpisodes.length === 0) {
    showToast('Nenhum episódio carregado.');
    return;
  }

  title.textContent = currentSeriesName ? `📑 ${currentSeriesName} - Episódios` : '📑 Escolha o Episódio';
  list.innerHTML = '';

  const saved = SeriesStore.getLast(currentSeriesId);

  currentSeriesEpisodes.forEach((ep, idx) => {
    const row = document.createElement('div');
    row.className = 'episode-item focusable';
    row.style.cssText = 'padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; border-radius: 10px; cursor: pointer;';

    const isCurrent = idx === currentSeriesIndex;
    const isSaved = saved && String(saved.epId) === String(ep.id || ep.stream_id);

    let prefix = '';
    if (isCurrent) {
      prefix = '<span style="color:#38bdf8; font-weight:800; margin-right:6px; background:rgba(14,165,233,0.15); padding:2px 6px; border-radius:4px; border:1px solid #0ea5e9;">▶ [ATUAL]</span>';
      row.style.background = 'rgba(14, 165, 233, 0.2)';
      row.style.border = '1px solid #0ea5e9';
    } else if (isSaved) {
      prefix = '<span style="color:#4ade80; font-weight:800; margin-right:6px; background:rgba(74,222,128,0.15); padding:2px 6px; border-radius:4px; border:1px solid #4ade80;">▶ [ONDE PAROU]</span>';
      row.style.border = '1px solid rgba(74, 222, 128, 0.4)';
    }

    row.innerHTML = `
      <div style="font-size:13px; color:#fff; display:flex; align-items:center; gap:6px;">
        ${prefix}<strong>E${ep.episode_num || (idx + 1)}</strong> - ${ep.title || 'Episódio'}
      </div>
      <span style="font-size:12px; color:var(--accent-cyan); font-weight:700;">Assistir ▶</span>
    `;

    row.onclick = () => {
      modal.style.display = 'none';
      playSeriesEpisode(currentSeriesId, currentSeriesName, currentSeriesCover, currentSeriesEpisodes, idx);
    };

    list.appendChild(row);
  });

  modal.style.display = 'flex';
}

function updatePlayerSeriesButtons() {
  const btnNext = document.getElementById('player-series-next-btn');
  const btnEps = document.getElementById('player-series-eps-btn');

  if (currentStreamType === 'series' && currentSeriesEpisodes && currentSeriesEpisodes.length > 0) {
    if (btnEps) btnEps.style.display = 'inline-block';
    if (btnNext) {
      if (currentSeriesIndex + 1 < currentSeriesEpisodes.length) {
        btnNext.style.display = 'inline-block';
      } else {
        btnNext.style.display = 'none';
      }
    }
  } else {
    if (btnNext) btnNext.style.display = 'none';
    if (btnEps) btnEps.style.display = 'none';
  }
}

function closeMediaModal() {
  el.detailModal.style.display = 'none';
  el.episodesContainer.style.display = 'none';
  activeModalMedia = null;
}

// --- Video Player State & Quality Control ---
let currentLiveVariants = [];
let currentLiveVariant = null;
let currentLiveChannelName = '';
let currentStreamId = null;
let currentStreamPoster = '';
let currentStreamUrl = null;
let currentStreamTitle = null;
let currentStreamType = null;

function updatePlayerFavBtn() {
  if (!el.playerFavBtn) return;
  const isFav = Favorites.isFav('live', currentLiveVariant ? currentLiveVariant.stream_id : null, currentLiveChannelName);
  el.playerFavBtn.textContent = isFav ? '★ Favorito' : '☆ Favorito';
  el.playerFavBtn.style.color = isFav ? '#ffd700' : '#ffffff';
}

if (el.playerFavBtn) {
  el.playerFavBtn.onclick = (e) => {
    e.stopPropagation();
    const next = Favorites.toggle('live', {
      stream_id: currentLiveVariant ? currentLiveVariant.stream_id : null,
      id: currentLiveVariant ? currentLiveVariant.stream_id : null,
      displayName: currentLiveChannelName,
      name: currentLiveChannelName,
      variants: currentLiveVariants
    });
    updatePlayerFavBtn();
    showToast(next ? 'Canal adicionado aos Favoritos!' : 'Canal removido dos Favoritos!');
    updateFavoritesCatCount();
    if (currentCategory === '__favorites__') {
      loadCategoryItems('__favorites__');
    }
  };
}

function playLiveWithQualities(channelItem) {
  let variants = channelItem.variants && channelItem.variants.length > 0
    ? channelItem.variants
    : ChannelGrouper.getVariants(channelItem.stream_id || channelItem.id, channelItem.displayName || channelItem.name);

  if (!variants || variants.length === 0) {
    variants = [{
      quality: ChannelGrouper.extractQuality(channelItem.name).quality || 'HD',
      stream_id: channelItem.stream_id || channelItem.id,
      name: channelItem.name,
      item: channelItem
    }];
  }

  currentLiveVariants = variants;
  currentLiveVariant = variants[0];
  currentLiveChannelName = channelItem.displayName || channelItem.cleanName || channelItem.name;

  const initialUrl = XtreamApi.getLiveUrl(currentLiveVariant.stream_id);
  playStream(initialUrl, `${currentLiveChannelName} (${currentLiveVariant.quality})`, 'live', variants, currentLiveVariant);
}

function renderQualityPills(variants, activeVariant) {
  if (!el.qualityPillsRow) return;
  el.qualityPillsRow.innerHTML = '';

  if (!variants || variants.length === 0) {
    if (el.playerQualityBar) el.playerQualityBar.style.display = 'none';
    return;
  }

  variants.forEach(variant => {
    const btn = document.createElement('button');
    btn.className = 'quality-pill focusable';
    btn.textContent = variant.quality;
    btn.setAttribute('data-id', variant.stream_id);

    const isActive = activeVariant && (activeVariant.stream_id == variant.stream_id);
    if (isActive) {
      btn.classList.add('active');
    }

    btn.onclick = (e) => {
      e.stopPropagation();
      switchLiveQuality(variant);
    };

    el.qualityPillsRow.appendChild(btn);
  });
}

function switchLiveQuality(variant) {
  if (!variant || (currentLiveVariant && currentLiveVariant.stream_id == variant.stream_id)) {
    return;
  }

  currentLiveVariant = variant;

  // Update pills UI
  if (el.qualityPillsRow) {
    const pills = el.qualityPillsRow.querySelectorAll('.quality-pill');
    pills.forEach(p => {
      if (p.getAttribute('data-id') == variant.stream_id) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
  }

  // Update player title and favorite button
  el.playerTitle.textContent = `${currentLiveChannelName} (${variant.quality})`;
  updatePlayerFavBtn();

  // Switch stream smoothly
  const streamUrl = XtreamApi.getLiveUrl(variant.stream_id);
  const proxiedUrl = XtreamApi.wrapUrl(streamUrl);

  if (hlsInstance) {
    hlsInstance.loadSource(proxiedUrl);
    hlsInstance.attachMedia(el.mainVideo);
    el.mainVideo.play().catch(() => {});
  } else {
    el.mainVideo.src = proxiedUrl;
    el.mainVideo.load();
    el.mainVideo.play().catch(() => {});
  }

  showToast(`Qualidade: ${variant.quality}`);
  resetControlsTimeout();
}

// --- Anti-Freeze Watchdog for Live Streams (Ported from Android PlayerErrorHandler) ---
const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300.000 ms
let firstFreezeInWindowTime = 0;
let freezesInWindowCount = 0;
let lastHeartbeatTime = 0;
let lastVideoPos = -1;
let lastRecoveryTriggerTime = 0;
let liveWatchdogInterval = null;

function startLiveWatchdog() {
  stopLiveWatchdog();
  // Dá 6 segundos de margem inicial para conectar e abrir os primeiros quadros
  lastHeartbeatTime = Date.now() + 6000;
  lastVideoPos = -1;

  liveWatchdogInterval = setInterval(() => {
    if (!el.mainVideo || el.playerOverlay.style.display !== 'flex') return;
    if (el.mainVideo.paused || el.mainVideo.ended) return;

    // Apenas para canais ao vivo
    if (!currentLiveVariant) return;

    const pos = el.mainVideo.currentTime;
    const now = Date.now();

    // Se a posição de reprodução estiver avançando
    if (pos > 0 && Math.abs(pos - lastVideoPos) > 0.05) {
      lastVideoPos = pos;
      lastHeartbeatTime = now;
    } else {
      if (now > lastHeartbeatTime) {
        const stallDuration = now - lastHeartbeatTime;
        // Congelou por 4.5 segundos:
        if (stallDuration >= 4500) {
          triggerLiveAutoRecovery();
        }
      }
    }
  }, 1000);
}

function stopLiveWatchdog() {
  if (liveWatchdogInterval) {
    clearInterval(liveWatchdogInterval);
    liveWatchdogInterval = null;
  }
}

function triggerLiveAutoRecovery() {
  const now = Date.now();
  // Evita disparar duas vezes em menos de 5 segundos
  if (now - lastRecoveryTriggerTime < 5000) return;
  lastRecoveryTriggerTime = now;

  // Janela de 5 minutos (300.000 ms)
  if (firstFreezeInWindowTime > 0 && (now - firstFreezeInWindowTime <= FIVE_MINUTES_MS)) {
    // Travou novamente dentro de 5 minutos!
    freezesInWindowCount++;
  } else {
    // Primeiro travamento ou já se passaram mais de 5 minutos desde o anterior
    firstFreezeInWindowTime = now;
    freezesInWindowCount = 1;
  }

  // Regra solicitada:
  // Se congelar 2 vezes dentro de 5 minutos -> troca de qualidade
  // Se congelar com intervalo maior que 5 minutos -> só reconecta
  if (freezesInWindowCount >= 2 && currentLiveVariants && currentLiveVariants.length > 1) {
    const fallback = getFallbackVariant(currentLiveVariant, currentLiveVariants);
    if (fallback) {
      showToast(`⚠️ Canal instável (2x em 5 min). Alternando para ${fallback.quality}...`, 4000);
      freezesInWindowCount = 0;
      firstFreezeInWindowTime = 0;
      lastHeartbeatTime = Date.now() + 6000;
      switchLiveQuality(fallback);
      return;
    }
  }

  // Se for o 1º travamento ou se passaram mais de 5 minutos: SÓ RECONECTA
  showToast('⚡ Canal travou. Reconectando transmissão...', 3000);
  reconnectLiveStream();
}

function getFallbackVariant(currentVariant, variants) {
  if (!currentVariant || !variants || variants.length <= 1) return null;
  const currentId = String(currentVariant.stream_id || '');
  let currentIndex = -1;

  for (let i = 0; i < variants.length; i++) {
    if (String(variants[i].stream_id) === currentId) {
      currentIndex = i;
      break;
    }
  }

  // Seleciona a próxima qualidade mais leve (ex: FHD -> HD -> SD)
  if (currentIndex >= 0 && currentIndex + 1 < variants.length) {
    return variants[currentIndex + 1];
  }

  // Se já for a última, tenta a primeira diferente da atual
  for (const v of variants) {
    if (String(v.stream_id) !== currentId) {
      return v;
    }
  }
  return null;
}

function manualReconnect() {
  freezesInWindowCount = 0;
  firstFreezeInWindowTime = 0;
  showToast('🔄 Reconectando transmissão...', 2500);
  reconnectLiveStream();
}

function reconnectLiveStream() {
  if (!currentLiveVariant) return;
  lastVideoPos = -1;
  lastHeartbeatTime = Date.now() + 6000;

  const streamUrl = XtreamApi.getLiveUrl(currentLiveVariant.stream_id);
  const sep = streamUrl.includes('?') ? '&' : '?';
  const freshUrl = `${streamUrl}${sep}_t=${Date.now()}`;
  const proxiedUrl = XtreamApi.wrapUrl(freshUrl);

  if (hlsInstance) {
    hlsInstance.loadSource(proxiedUrl);
    hlsInstance.attachMedia(el.mainVideo);
    el.mainVideo.play().catch(() => {});
  } else {
    el.mainVideo.src = proxiedUrl;
    el.mainVideo.load();
    el.mainVideo.play().catch(() => {});
  }
}

// --- Video Player ---
function playStream(url, title, type, variants = [], activeVariant = null, customId = null, customPoster = null, resumePosition = 0) {
  if (!url) {
    showToast('Link do vídeo indisponível.');
    return;
  }

  currentStreamUrl = url;
  currentStreamTitle = title;
  currentStreamType = type;
  currentStreamId = customId || (currentLiveVariant ? currentLiveVariant.stream_id : null);
  currentStreamPoster = customPoster || '';

  el.playerOverlay.style.display = 'flex';
  el.playerTitle.textContent = title || 'Reprodução';
  el.playerOverlay.classList.add('controls-visible');

  // Toggle Live Quality Bar vs VOD Timeline
  if (type === 'live') {
    if (el.playerTimelineBox) el.playerTimelineBox.style.display = 'none';
    if (el.playerQualityBar) {
      el.playerQualityBar.style.display = 'flex';
      renderQualityPills(variants, activeVariant);
    }
    if (el.playerFavBtn) {
      el.playerFavBtn.style.display = 'inline-block';
      updatePlayerFavBtn();
    }
  } else {
    if (el.playerQualityBar) el.playerQualityBar.style.display = 'none';
    if (el.playerTimelineBox) el.playerTimelineBox.style.display = 'flex';
    if (el.playerFavBtn) el.playerFavBtn.style.display = 'none';
  }

  // Clear previous player
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  el.mainVideo.pause();
  el.mainVideo.removeAttribute('src');
  el.mainVideo.load();

  // Resume configuration (Filmes e Séries)
  let targetResumePos = 0;
  if (type !== 'live' && currentStreamId) {
    if (resumePosition && resumePosition > 0) {
      targetResumePos = resumePosition;
    } else {
      const saved = ResumeStore.get(currentStreamId);
      if (saved && saved.pos > 5) {
        targetResumePos = saved.pos;
      }
    }
  }

  let hasResumed = false;
  const seekTarget = (targetResumePos > 5) ? Math.max(0, targetResumePos - 3) : 0;

  const performResume = () => {
    if (hasResumed || seekTarget <= 0) return;
    hasResumed = true;
    try {
      el.mainVideo.currentTime = seekTarget;
      showToast(`▶ Continuando de ${formatTime(seekTarget)}...`, 2500);
    } catch (e) {
      console.warn('Resume seek error:', e);
    }
  };

  el.mainVideo.onloadedmetadata = () => {
    performResume();
  };
  el.mainVideo.oncanplay = () => {
    performResume();
  };

  // Ensure HTTPS if the page is on HTTPS
  let streamUrl = url;
  if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
    if (streamUrl.includes('plus.lat') || streamUrl.includes('5tv.store')) {
      streamUrl = streamUrl.replace('http://', 'https://');
    }
  }

  const isHls = streamUrl.includes('.m3u8') || type === 'live';

  if (isHls && Hls.isSupported()) {
    // Live TV via Hls.js with CORS proxy
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
      performResume();
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

  if (type === 'live') {
    startLiveWatchdog();
  } else {
    stopLiveWatchdog();
  }

  updatePlayerSeriesButtons();
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
  stopLiveWatchdog();
  firstFreezeInWindowTime = 0;
  freezesInWindowCount = 0;
  currentLiveVariant = null;

  if (seriesAutoPlayTimer) {
    clearTimeout(seriesAutoPlayTimer);
    seriesAutoPlayTimer = null;
  }
  const inplayerModal = document.getElementById('inplayer-episodes-modal');
  if (inplayerModal) inplayerModal.style.display = 'none';
  updatePlayerSeriesButtons();

  // Salvar última posição antes de fechar se for VOD (filme/série)
  if (currentStreamType !== 'live' && el.mainVideo && el.mainVideo.duration > 0 && currentStreamId && el.mainVideo.currentTime >= 5) {
    ResumeStore.save(currentStreamId, currentStreamTitle, currentStreamPoster, el.mainVideo.currentTime, el.mainVideo.duration, currentStreamType, currentStreamUrl);
    if (currentCategory === '__resume__') {
      loadCategoryItems('__resume__');
    }
  }

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

if (el.btnPlayerReconnect) {
  el.btnPlayerReconnect.onclick = () => manualReconnect();
}

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

  // Auto-salvar progresso para Continuar Assistindo a cada ~2.5 segundos
  if (currentStreamType !== 'live' && total > 0 && currentStreamId && current >= 5) {
    if (!el.mainVideo._lastResumeSave || (Date.now() - el.mainVideo._lastResumeSave) > 2500) {
      el.mainVideo._lastResumeSave = Date.now();
      ResumeStore.save(currentStreamId, currentStreamTitle, currentStreamPoster, current, total, currentStreamType, currentStreamUrl);
    }
  }
};

el.mainVideo.onended = () => {
  if (currentStreamType !== 'live' && currentStreamId) {
    ResumeStore.remove(currentStreamId);
    if (currentCategory === '__resume__') {
      loadCategoryItems('__resume__');
    }
  }

  // Auto-play próximo episódio para séries (3 segundos de contagem)
  if (currentStreamType === 'series' && currentSeriesEpisodes && currentSeriesIndex + 1 < currentSeriesEpisodes.length) {
    showToast('▶ Episódio finalizado! Carregando próximo em 3s...', 3000);
    if (seriesAutoPlayTimer) clearTimeout(seriesAutoPlayTimer);
    seriesAutoPlayTimer = setTimeout(() => {
      playNextEpisode();
    }, 3000);
  }
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

  // Aspect Ratio buttons
  if (el.btnAspectContain) {
    el.btnAspectContain.onclick = (e) => {
      e.stopPropagation();
      el.mainVideo.style.objectFit = 'contain';
      el.btnAspectContain.classList.add('active');
      if (el.btnAspectFill) el.btnAspectFill.classList.remove('active');
      showToast('Proporção: Original');
      resetControlsTimeout();
    };
  }

  if (el.btnAspectFill) {
    el.btnAspectFill.onclick = (e) => {
      e.stopPropagation();
      el.mainVideo.style.objectFit = 'fill';
      el.btnAspectFill.classList.add('active');
      if (el.btnAspectContain) el.btnAspectContain.classList.remove('active');
      showToast('Proporção: Ajustar à Tela');
      resetControlsTimeout();
    };
  }

  // Click on player background toggles controls visibility
  el.playerOverlay.onclick = (e) => {
    if (e.target.closest('.player-topbar, .player-controls')) {
      return;
    }
    if (el.playerOverlay.classList.contains('controls-visible')) {
      el.playerOverlay.classList.remove('controls-visible');
    } else {
      resetControlsTimeout();
    }
  };

  // Search filter
  el.searchInput.oninput = () => {
    const query = el.searchInput.value.toLowerCase().trim();
    if (!query) {
      renderItems(currentItems);
      return;
    }
    const filtered = currentItems.filter(item => {
      const name = (item.displayName || item.name || item.title || '').toLowerCase();
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

  // Series In-Player Buttons
  const btnSeriesNext = document.getElementById('player-series-next-btn');
  if (btnSeriesNext) {
    btnSeriesNext.onclick = (e) => {
      e.stopPropagation();
      playNextEpisode();
    };
  }

  const btnSeriesEps = document.getElementById('player-series-eps-btn');
  if (btnSeriesEps) {
    btnSeriesEps.onclick = (e) => {
      e.stopPropagation();
      openInPlayerEpisodesDialog();
    };
  }

  const btnCloseInplayer = document.getElementById('btn-close-inplayer-eps');
  if (btnCloseInplayer) {
    btnCloseInplayer.onclick = (e) => {
      e.stopPropagation();
      const modal = document.getElementById('inplayer-episodes-modal');
      if (modal) modal.style.display = 'none';
    };
  }

  // Close modals on overlay click
  window.onclick = (e) => {
    if (e.target === el.detailModal) closeMediaModal();
    const inplayerModal = document.getElementById('inplayer-episodes-modal');
    if (e.target === inplayerModal) inplayerModal.style.display = 'none';
  };

  // Drag & Drop global para filmes e vídeos no computador
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/') || /\.(mp4|mkv|avi|mov|webm|ts|m3u8|wmv|flv)$/i.test(file.name)) {
        handleSelectedLocalFile(file);
      }
    }
  });

  // Local Video Picker for 100% Offline Playback
  if (el.localVideoInput) {
    el.localVideoInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleSelectedLocalFile(file);
      }
    };
  }
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
      const active = document.activeElement;
      const isPlayerButton = active && el.playerOverlay.contains(active) && active.classList.contains('focusable');

      if (keyCode === 32) { // Space toggles play/pause
        e.preventDefault();
        el.playerPlayPause.click();
        return;
      }

      if (keyCode === 13) { // Enter on focused player button clicks it
        if (isPlayerButton) {
          active.click();
        } else {
          el.playerPlayPause.click();
        }
        return;
      }

      // If user is navigating with arrows inside player controls
      if ([37, 38, 39, 40].includes(keyCode)) {
        if (isPlayerButton || el.playerOverlay.classList.contains('controls-visible')) {
          handleDpad(keyCode);
          return;
        }
        // Fallback: Seek only for VOD when no button is focused
        if (currentSection !== 'live') {
          if (keyCode === 37) {
            el.mainVideo.currentTime = Math.max(0, el.mainVideo.currentTime - 15);
          } else if (keyCode === 39) {
            el.mainVideo.currentTime = Math.min(el.mainVideo.duration, el.mainVideo.currentTime + 15);
          }
          return;
        }
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
  // While the PIN modal is open, keep D-pad focus inside it. When player is open, keep inside player.
  const pinModal = document.getElementById('pin-modal');
  const scope = (pinModal && pinModal.style.display === 'flex')
    ? pinModal
    : (el.playerOverlay && el.playerOverlay.style.display === 'flex' ? el.playerOverlay : document);
  const focusables = Array.from(scope.querySelectorAll('.focusable:not([disabled])')).filter(el => {
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
