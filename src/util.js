// NITRO BRAWL — utilitaires partagés
(function (NB) {
  'use strict';
  var U = {};

  U.now = function () { return performance.now() / 1000; };

  U.fmtTime = function (sec) {
    if (sec == null || !isFinite(sec)) return '--:--';
    var neg = sec < 0; sec = Math.abs(sec);
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return (neg ? '-' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };

  U.fmtClock = function (sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  var uidc = 0;
  U.uid = function (p) { uidc++; return (p || 'id') + '_' + uidc; };

  U.store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    del: function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  NB.DEBUG = false;
  U.dbg = function () {
    if (!NB.DEBUG) return;
    if (typeof console !== 'undefined') console.log.apply(console, arguments);
  };

  var listeners = {};
  U.eventBus = {
    on: function (evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return fn;
    },
    off: function (evt, fn) {
      var l = listeners[evt];
      if (!l) return;
      var i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    emit: function (evt, data) {
      var l = listeners[evt];
      if (!l) return;
      for (var i = 0; i < l.length; i++) {
        try { l[i](data); } catch (e) { U.dbg('bus error', evt, e); }
      }
    }
  };

  // --- helpers géométrie partagée (utilisés par plusieurs modules) ---
  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.dist2D = function (ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };
  U.angleDiff = function (a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  NB.util = U;
})(window.NB = window.NB || {});
