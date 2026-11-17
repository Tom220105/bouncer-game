/* Einstellungen und Fortschritt (localStorage, mit Fallback falls gesperrt) */
(function (B) {
  'use strict';

  const KEY_SETTINGS = 'bouncer.settings.v1';
  const KEY_PROGRESS = 'bouncer.progress.v2'; // v2: 30 neue Level
  // ?unlock in der Adresse schaltet zum Testen alle Level frei (wird nicht gespeichert)
  const UNLOCK_ALL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlock');
  const KEY_LAST = 'bouncer.lastLevel';

  const DEFAULTS = {
    sound: true,
    volume: 70,
    snap: false,     // Winkel in 15°-Schritten einrasten
    preview: false,  // Flugbahn-Vorschau
    glow: true,      // Leuchteffekte
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignorieren */ }
  }

  const settings = Object.assign({}, DEFAULTS, load(KEY_SETTINGS, {}));
  const progress = load(KEY_PROGRESS, {}) || {};

  B.settings = settings;
  B.saveSettings = () => save(KEY_SETTINGS, settings);

  B.progress = {
    get(id) {
      return progress[id] || null;
    },
    /** Speichert ein Ergebnis, falls es besser ist als das bisherige. */
    record(id, stars, used) {
      const prev = progress[id];
      if (!prev || stars > prev.stars || (stars === prev.stars && used < prev.used)) {
        progress[id] = { stars, used };
        save(KEY_PROGRESS, progress);
        return true;
      }
      return false;
    },
    reset() {
      for (const k of Object.keys(progress)) delete progress[k];
      save(KEY_PROGRESS, progress);
    },
    isUnlocked(index) {
      if (index === 0 || UNLOCK_ALL) return true;
      const prev = B.LEVELS[index - 1];
      return !!(prev && progress[prev.id]);
    },
    get lastLevel() {
      return load(KEY_LAST, 0);
    },
    set lastLevel(i) {
      save(KEY_LAST, i);
    },
  };
})(globalThis.Bouncer = globalThis.Bouncer || {});
