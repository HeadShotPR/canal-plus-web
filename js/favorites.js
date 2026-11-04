// js/favorites.js - Favorites Storage System for Canal+ Web Player
const Favorites = {
  KEY: 'canalplus_favorites_v1',

  getAll() {
    try {
      const data = localStorage.getItem(this.KEY);
      return data ? JSON.parse(data) : { live: {}, movie: {}, series: {} };
    } catch (e) {
      return { live: {}, movie: {}, series: {} };
    }
  },

  isFav(section, id) {
    if (!section || !id) return false;
    const all = this.getAll();
    const sec = all[section] || {};
    return !!sec[String(id)];
  },

  toggle(section, item) {
    if (!section || !item || !item.id) return false;
    const all = this.getAll();
    if (!all[section]) all[section] = {};

    const idStr = String(item.id);
    let nextState = false;

    if (all[section][idStr]) {
      delete all[section][idStr];
      nextState = false;
    } else {
      all[section][idStr] = {
        id: item.id,
        name: item.name || item.title,
        stream_id: item.stream_id || item.id,
        logo: item.logo || item.stream_icon || item.cover,
        rating: item.rating || '',
        category_id: item.category_id || '',
        container_extension: item.container_extension || 'mp4',
        section: section,
        addedAt: Date.now()
      };
      nextState = true;
    }

    try {
      localStorage.setItem(this.KEY, JSON.stringify(all));
    } catch (e) {}

    return nextState;
  },

  getList(section) {
    const all = this.getAll();
    const sec = all[section] || {};
    return Object.values(sec);
  }
};
