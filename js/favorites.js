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

  cleanChannelKey(name) {
    if (!name) return '';
    return name
      .replace(/[\s\(\[]+(4K|UHD|FHD[²2]?|HD[²2]?|SD[²2]?|HEVC|H\.265)[\)\]]?\s*$/i, '')
      .replace(/[\s\-\|:]+$/, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  },

  isFav(section, id, name = null) {
    if (!section || (!id && !name)) return false;
    const all = this.getAll();
    const sec = all[section] || {};
    const idStr = String(id || '');

    // Direct check by id
    if (idStr && sec[idStr]) return true;

    // For live channels, check if id belongs to any variant of a favorited channel
    if (section === 'live') {
      const normName = this.cleanChannelKey(name);
      for (const favId in sec) {
        const item = sec[favId];
        if (!item) continue;
        // Check if id matches any variant of this favorited channel
        if (idStr && Array.isArray(item.variants)) {
          if (item.variants.some(v => String(v.stream_id || v.id) === idStr)) {
            return true;
          }
        }
        // Check if normalized clean name matches
        if (normName && this.cleanChannelKey(item.displayName || item.name) === normName) {
          return true;
        }
      }
    }

    return false;
  },

  toggle(section, item) {
    if (!section || !item) return false;
    const all = this.getAll();
    if (!all[section]) all[section] = {};

    const idStr = String(item.stream_id || item.id || '');
    const displayName = item.displayName || item.cleanName || item.name || item.title || '';
    const normName = this.cleanChannelKey(displayName);

    if (section === 'live') {
      // Find existing favorite by id, variant id, or clean name
      let existingKey = null;
      if (idStr && all.live[idStr]) {
        existingKey = idStr;
      } else {
        for (const k in all.live) {
          const it = all.live[k];
          if (!it) continue;
          if (idStr && Array.isArray(it.variants) && it.variants.some(v => String(v.stream_id || v.id) === idStr)) {
            existingKey = k;
            break;
          }
          if (normName && this.cleanChannelKey(it.displayName || it.name) === normName) {
            existingKey = k;
            break;
          }
        }
      }

      if (existingKey) {
        // REMOVE from favorites (also clean up any duplicate entries of same channel)
        delete all.live[existingKey];
        for (const k in all.live) {
          const it = all.live[k];
          if (it && normName && this.cleanChannelKey(it.displayName || it.name) === normName) {
            delete all.live[k];
          }
        }
        try {
          localStorage.setItem(this.KEY, JSON.stringify(all));
        } catch (e) {}
        return false;
      } else {
        // ADD to favorites with all quality variants!
        let variants = Array.isArray(item.variants) && item.variants.length > 0 ? item.variants : null;
        if (!variants && typeof ChannelGrouper !== 'undefined' && ChannelGrouper.getVariants) {
          variants = ChannelGrouper.getVariants(idStr, displayName);
        }

        // Canonical stream_id is the primary variant or idStr
        const canonicalId = (variants && variants[0] && (variants[0].stream_id || variants[0].id)) || idStr;
        const canonicalLogo = item.stream_icon || item.logo || (variants && variants[0] && variants[0].item && (variants[0].item.stream_icon || variants[0].item.logo)) || '';

        all.live[String(canonicalId)] = {
          id: canonicalId,
          stream_id: canonicalId,
          name: displayName,
          displayName: displayName,
          logo: canonicalLogo,
          stream_icon: canonicalLogo,
          category_id: item.category_id || '',
          section: 'live',
          variants: variants || [],
          addedAt: Date.now()
        };

        try {
          localStorage.setItem(this.KEY, JSON.stringify(all));
        } catch (e) {}
        return true;
      }
    }

    // For movies & series
    let nextState = false;
    if (all[section][idStr]) {
      delete all[section][idStr];
      nextState = false;
    } else {
      all[section][idStr] = {
        id: item.id || idStr,
        name: item.name || item.title || '',
        stream_id: item.stream_id || item.id || idStr,
        logo: item.logo || item.stream_icon || item.cover || '',
        cover: item.cover || item.stream_icon || item.logo || '',
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
    const list = Object.values(sec);

    if (section === 'live') {
      // Deduplicate live favorites by clean channel name
      const seen = new Set();
      const deduped = [];
      for (const item of list) {
        const key = this.cleanChannelKey(item.displayName || item.name);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);

        // If item doesn't have variants or only 1, try to enrich from ChannelGrouper cache if available
        if ((!item.variants || item.variants.length === 0) && typeof ChannelGrouper !== 'undefined' && ChannelGrouper.getVariants) {
          const v = ChannelGrouper.getVariants(item.stream_id || item.id, item.displayName || item.name);
          if (v && v.length > 0) {
            item.variants = v;
          }
        }

        deduped.push(item);
      }
      return deduped;
    }

    return list;
  }
};
