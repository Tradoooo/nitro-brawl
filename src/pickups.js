// NITRO BRAWL — power-ups : spawn sur pads, respawn, tirage pondéré
(function (NB) {
  'use strict';
  var M = NB.M;
  var P = {};
  P.KINDS = ['rocket', 'homing', 'mine', 'oil', 'grenade', 'shield', 'boost', 'ram'];
  P.WEIGHTS = { rocket: 22, homing: 16, mine: 12, oil: 10, grenade: 14, shield: 12, boost: 14, ram: 8 };
  P.COLORS = {
    rocket: [1, 0.3, 0.2], homing: [0.7, 0.35, 1], mine: [0.9, 0.75, 0.15], oil: [0.35, 0.8, 0.3],
    grenade: [0.4, 0.9, 0.4], shield: [0.25, 0.85, 1], boost: [1, 0.85, 0.2], ram: [1, 0.4, 0.5]
  };
  P.ICONS = {
    rocket: '🚀', homing: '🎯', mine: '🧨', oil: '🛢️', grenade: '💣', shield: '🛡️', boost: '⚡', ram: '🔰'
  };
  P.NAMES = {
    rocket: 'Roquette', homing: 'Missile', mine: 'Mine', oil: 'Huile',
    grenade: 'Grenade', shield: 'Bouclier', boost: 'Boost', ram: 'Bélier'
  };
  P.list = [];
  var meshCache = {};
  var arenaRef = null;

  function meshFor(kind) {
    if (meshCache[kind]) return meshCache[kind];
    if (!NB.gl || !NB.gl.gl || !NB.gl.gl()) return null;
    meshCache[kind] = NB.gl.createMesh(NB.mesh.pickup('gem', P.COLORS[kind]));
    return meshCache[kind];
  }

  P.init = function (arena) {
    arenaRef = arena;
    P.list = [];
    for (var i = 0; i < arena.pads.length; i++) {
      P.list.push(makePickup(arena.pads[i], i));
    }
  };

  function makePickup(pad, i) {
    return {
      id: i, pad: pad, kind: rollKind(null),
      pos: [pad[0], 1.05, pad[1]], taken: false, respawnAt: 0, t: M.randRange(0, 6)
    };
  }

  function rollKind(kart) {
    var g = NB.game;
    var leading = false;
    if (kart && g && g.karts && g.karts.length) {
      var rank = 1;
      for (var i = 0; i < g.karts.length; i++) if (g.karts[i].kills > kart.kills) rank++;
      leading = rank <= 2;
    }
    var total = 0, w = {}, k;
    for (k in P.WEIGHTS) {
      var v = P.WEIGHTS[k];
      if (kart && kart.weapon === k) v = 0;
      if (leading && (k === 'shield' || k === 'boost')) v *= 1.6;
      if (leading && (k === 'rocket' || k === 'homing')) v *= 0.7;
      w[k] = v; total += v;
    }
    var r = Math.random() * total;
    for (k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'rocket';
  }
  P.roll = rollKind;

  P.update = function (dt) {
    var t = NB.game ? NB.game.time : 0;
    for (var i = 0; i < P.list.length; i++) {
      var p = P.list[i];
      p.t += dt;
      if (p.taken && t >= p.respawnAt) {
        p.taken = false;
        p.kind = rollKind(null);
        p.t = 0;
      }
    }
  };

  P.draw = function () {
    if (!NB.gl || !NB.gl.gl || !NB.gl.gl()) return;
    var m = M.create();
    for (var i = 0; i < P.list.length; i++) {
      var p = P.list[i];
      if (p.taken) continue;
      var mesh = meshFor(p.kind);
      if (!mesh) continue;
      var y = p.pos[1] + Math.sin(p.t * 2.4) * 0.16;
      M.composeFull(m, [p.pos[0], y, p.pos[2]], [Math.sin(p.t) * 0.3, p.t * 1.8, 0], [1.35, 1.35, 1.35]);
      NB.gl.draw(mesh, m);
      NB.gl.sprite(p.pos[0], 0.08, p.pos[2], 2.2, P.COLORS[p.kind], 0.22, true);
      NB.gl.sprite(p.pos[0], y, p.pos[2], 1.1, P.COLORS[p.kind], 0.16, true);
    }
  };

  P.tryPick = function (kart) {
    for (var i = 0; i < P.list.length; i++) {
      var p = P.list[i];
      if (p.taken) continue;
      if (M.dist2([kart.pos[0], 0, kart.pos[2]], [p.pos[0], 0, p.pos[2]]) > 2.2) continue;
      if (Math.abs(kart.pos[1] - p.pos[1]) > 1.8) continue;
      p.taken = true;
      p.respawnAt = (NB.game ? NB.game.time : 0) + M.randRange(4, 6);
      NB.kart.giveWeapon(kart, p.kind);
      NB.game.events.push({ t: 'pickup', kartId: kart.id, kind: p.kind });
      return p.kind;
    }
    return null;
  };

  P.reset = function () { P.list = []; };
  NB.pickups = P;
})(window.NB = window.NB || {});
