// NITRO BRAWL — caméra : chase cam lissée + orbite de démonstration
(function (NB) {
  'use strict';
  var M = NB.M;
  var C = {};
  var cam = {
    pos: [0, 20, 40], target: [0, 0, 0], fov: 1.08, aspect: 1,
    near: 0.3, far: 420, shake: 0, skyTop: [0.1, 0.14, 0.3], skyBottom: [0.5, 0.55, 0.7],
    fogColor: [0.5, 0.55, 0.7], sunDir: [0.5, 0.9, 0.35], ambient: 0.58
  };
  var sm = { pos: [0, 20, 40], target: [0, 0, 0], fov: 1.08 };
  C.cam = cam;

  function forward(k) { return [-Math.sin(k.yaw), 0, -Math.cos(k.yaw)]; }

  C.snap = function (k) {
    if (!k) return;
    var f = forward(k);
    sm.pos = [k.pos[0] - f[0] * 11, k.pos[1] + 4.6, k.pos[2] - f[2] * 11];
    sm.target = k.pos.slice();
  };

  C.update = function (g, dt) {
    var th = g.map && g.map.theme ? g.map.theme : null;
    if (th) {
      cam.skyTop = th.skyTop; cam.skyBottom = th.skyBottom; cam.fogColor = th.fog;
      cam.sunDir = th.sunDir; cam.ambient = th.ambient == null ? 0.58 : th.ambient;
    }
    if (!g.player || g.phase === 'menu' || g.phase === 'finished') orbit(g, dt);
    else chase(g, g.player, dt);
    cam.shake = Math.max(0, g.shake || 0) * 0.5;
    g.shake = M.damp(g.shake || 0, 0, 6, dt);
    cam.pos = sm.pos; cam.target = sm.target; cam.fov = sm.fov;
  };

  function orbit(g, dt) {
    var a = g.arena && g.arena.bounds ? g.arena.bounds : { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
    var cx = (a.minX + a.maxX) / 2, cz = (a.minZ + a.maxZ) / 2;
    var r = Math.max(a.maxX - a.minX, a.maxZ - a.minZ) * 0.72;
    var t = g.time * 0.12;
    sm.pos = [cx + Math.cos(t) * r, r * 0.55, cz + Math.sin(t) * r];
    sm.target = [cx, 1.5, cz];
    sm.fov = M.damp(sm.fov, 1.0, 4, dt);
  }

  function chase(g, k, dt) {
    var f = forward(k);
    var sp = Math.abs(k.speed || 0);
    var back = 6.6 + sp * 0.11, up = 2.2 + sp * 0.028;
    var want = [k.pos[0] - f[0] * back, k.pos[1] + up, k.pos[2] - f[2] * back];
    var look = [k.pos[0] + f[0] * 7.5, k.pos[1] + 1.1, k.pos[2] + f[2] * 7.5];
    sm.pos[0] = M.damp(sm.pos[0], want[0], 7, dt);
    sm.pos[1] = M.damp(sm.pos[1], want[1], 6, dt);
    sm.pos[2] = M.damp(sm.pos[2], want[2], 7, dt);
    sm.target[0] = M.damp(sm.target[0], look[0], 12, dt);
    sm.target[1] = M.damp(sm.target[1], look[1], 10, dt);
    sm.target[2] = M.damp(sm.target[2], look[2], 12, dt);
    sm.fov = M.damp(sm.fov, 0.86 + sp * 0.006, 4, dt);
  }

  NB.cam = C;
})(window.NB = window.NB || {});
