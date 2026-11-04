// js/api.js - Xtream Codes API Client with Automatic Multi-DNS Detection
const XtreamApi = {
  SERVERS: [
    'http://plus.lat',
    'https://plus.lat',
    'http://5tv.store',
    'https://5tv.store',
    'http://imagenshd.top',
    'http://canal231.com'
  ],

  session: {
    server: 'https://5tv.store',
    username: '',
    password: '',
    userInfo: null,
    serverInfo: null
  },

  initFromStorage() {
    try {
      const saved = localStorage.getItem('canalplus_auth_v1');
      if (saved) {
        this.session = JSON.parse(saved);
        if (window.location.protocol === 'https:' && this.session.server && this.session.server.startsWith('http://')) {
          if (this.session.server.includes('plus.lat') || this.session.server.includes('5tv.store')) {
            this.session.server = this.session.server.replace('http://', 'https://');
          }
        }
        return true;
      }
    } catch (e) {}
    return false;
  },

  saveSession() {
    try {
      localStorage.setItem('canalplus_auth_v1', JSON.stringify(this.session));
    } catch (e) {}
  },

  clearSession() {
    this.session.username = '';
    this.session.password = '';
    this.session.userInfo = null;
    this.session.serverInfo = null;
    try {
      localStorage.removeItem('canalplus_auth_v1');
    } catch (e) {}
  },

  getCleanServer() {
    let s = (this.session.server || 'https://5tv.store').trim().replace(/\/+$/, '');
    if (window.location.protocol === 'https:' && s.startsWith('http://')) {
      if (s.includes('plus.lat') || s.includes('5tv.store')) {
        s = s.replace('http://', 'https://');
      }
    }
    return s;
  },

  wrapUrl(targetUrl) {
    if (!targetUrl) return '';
    if (targetUrl.startsWith('/api/proxy') || targetUrl.includes('/api/proxy?url=')) {
      return targetUrl;
    }
    const isHttps = window.location.protocol === 'https:';
    if (isHttps || window.location.hostname.includes('vercel.app')) {
      return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    }
    return targetUrl;
  },

  async request(params = {}) {
    return await this.requestOnServer(this.getCleanServer(), this.session.username, this.session.password, params);
  },

  async requestOnServer(targetServer, user, pass, params = {}) {
    let cleanServer = targetServer.trim().replace(/\/+$/, '');
    if (window.location.protocol === 'https:' && cleanServer.startsWith('http://')) {
      if (cleanServer.includes('plus.lat') || cleanServer.includes('5tv.store')) {
        cleanServer = cleanServer.replace('http://', 'https://');
      }
    }

    const query = new URLSearchParams({
      username: user,
      password: pass,
      ...params
    });

    const targetUrl = `${cleanServer}/player_api.php?${query.toString()}`;
    const fetchUrl = this.wrapUrl(targetUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    try {
      const res = await fetch(fetchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return null;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  },

  async login(username, password, explicitServer = null) {
    const user = String(username || '').trim();
    const pass = String(password || '').trim();
    const isHttps = window.location.protocol === 'https:';

    let serversToTry = explicitServer ? [explicitServer] : [...this.SERVERS];
    if (isHttps) {
      serversToTry = serversToTry.sort((a, b) => (b.startsWith('https://') ? 1 : 0) - (a.startsWith('https://') ? 1 : 0));
    }

    let lastError = 'Usuário ou senha incorretos.';
    let successData = null;
    let successfulServer = null;

    for (const s of serversToTry) {
      try {
        const data = await this.requestOnServer(s, user, pass);
        if (data && data.user_info && data.user_info.auth == 1) {
          if (data.user_info.status && data.user_info.status.toLowerCase() !== 'active') {
            throw new Error('Assinatura desativada.');
          }

          const exp = data.user_info.exp_date;
          if (exp && exp !== 'null') {
            const expSec = parseInt(exp, 10);
            const nowSec = Math.floor(Date.now() / 1000);
            if (expSec > 0 && nowSec > expSec) {
              throw new Error('Assinatura vencida.');
            }
          }

          successData = data;
          successfulServer = s;
          break;
        } else if (data && data.user_info && data.user_info.message) {
          lastError = data.user_info.message;
        }
      } catch (err) {
        if (err.message === 'Assinatura desativada.' || err.message === 'Assinatura vencida.') {
          throw err;
        }
      }
    }

    if (!successData) {
      throw new Error(lastError);
    }

    this.session.server = successfulServer;
    this.session.username = user;
    this.session.password = pass;
    this.session.userInfo = successData.user_info;
    this.session.serverInfo = successData.server_info;
    this.saveSession();
    return successData;
  },

  // Live Streams
  async getLiveCategories() {
    return await this.request({ action: 'get_live_categories' });
  },

  async getLiveStreams(categoryId = '') {
    const params = { action: 'get_live_streams' };
    if (categoryId) params.category_id = categoryId;
    return await this.request(params);
  },

  // VOD Movies
  async getVodCategories() {
    return await this.request({ action: 'get_vod_categories' });
  },

  async getVodStreams(categoryId = '') {
    const params = { action: 'get_vod_streams' };
    if (categoryId) params.category_id = categoryId;
    return await this.request(params);
  },

  async getVodInfo(vodId) {
    return await this.request({ action: 'get_vod_info', vod_id: vodId });
  },

  // Series
  async getSeriesCategories() {
    return await this.request({ action: 'get_series_categories' });
  },

  async getSeries(categoryId = '') {
    const params = { action: 'get_series' };
    if (categoryId) params.category_id = categoryId;
    return await this.request(params);
  },

  async getSeriesInfo(seriesId) {
    return await this.request({ action: 'get_series_info', series_id: seriesId });
  },

  // Stream URL builders
  getLiveUrl(streamId) {
    const s = this.getCleanServer();
    const u = encodeURIComponent(this.session.username);
    const p = encodeURIComponent(this.session.password);
    return `${s}/live/${u}/${p}/${streamId}.m3u8`;
  },

  getVodUrl(streamId, ext = 'mp4') {
    const s = this.getCleanServer();
    const u = encodeURIComponent(this.session.username);
    const p = encodeURIComponent(this.session.password);
    const cleanExt = (ext || 'mp4').replace('.', '');
    return `${s}/movie/${u}/${p}/${streamId}.${cleanExt}`;
  },

  getEpisodeUrl(streamId, ext = 'mp4') {
    const s = this.getCleanServer();
    const u = encodeURIComponent(this.session.username);
    const p = encodeURIComponent(this.session.password);
    const cleanExt = (ext || 'mp4').replace('.', '');
    return `${s}/series/${u}/${p}/${streamId}.${cleanExt}`;
  }
};
