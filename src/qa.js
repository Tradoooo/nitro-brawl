// NITRO BRAWL — harnais QA visuel : scènes figées en panneaux pour inspection des défauts.
// URL : ?qa=kart|arena0..3|fx|pickups   (rendu statique, déterministe)
(function (NB) {
  'use strict';
  var M = NB.M;
  var Q = {};
  var state = null;

  Q.setup = function (name) {
    state = { name: name, karts: [], arena: null, ground: null, steps: 0 };
    if (name === 'kart') {
      state.ground = NB.gl.createMesh(NB.mesh.box(40, 0.4, 40, [0.8, 0.66, 0.42]));
      state.parts = NB.mesh.kartParts();
      state.mb = NB.gl.createMesh(state.parts.body);
      state.ma = NB.gl.createMesh(state.parts.accent);
      state.md = NB.gl.createMesh(state.parts.dark);
      return;
    }
    var mi = name === 'arena1' ? 1 : name === 'arena2' ? 2 : name === 'arena3' ? 3 : 0;
    var map = NB.maps.list[mi];
    var arena = NB.arena.build(map);
    state.arena = arena;
    NB.game = NB.game || {};
    NB.game.arena = arena; NB.game.map = map; NB.game.karts = []; NB.game.events = [];
    NB.game.projectiles = []; NB.game.hazards = []; NB.game.time = 0;
    var cols = [[0.95, 0.25, 0.2], [0.2, 0.65, 1], [0.35, 0.9, 0.4], [1, 0.8, 0.15]];
    for (var i = 0; i < 4; i++) {
      var sp = arena.spawns[i];
      var k = NB.kart.create({
        id: i, name: 'Q' + i, color: cols[i], accent: [cols[i][0] * 0.4, cols[i][1] * 0.4, cols[i][2] * 0.4],
        isPlayer: i === 0, isBot: i > 0, pos: [sp[0], sp[1]], yaw: i * 0.9, arena: arena, difficulty: 'pro'
      });
      k.invulnT = 0;
      state.karts.push(k);
      NB.game.karts.push(k);
    }
    NB.pickups.init(arena);
    if (name === 'fx') setupFx(state);
  };

  function setupFx(st) {
    var a = st.arena;
    st.karts[1].shieldT = 4;
    st.karts[2].boostT = 2;
    st.karts[3].oilT = 1.5;
    NB.game.hazards.push({ kind: 'mine', pos: [st.karts[0].pos[0] + 4, 0, st.karts[0].pos[2] + 3], life: 12, age: 1, owner: 9, spin: 0 });
    NB.game.hazards.push({ kind: 'oil', pos: [st.karts[0].pos[0] - 5, 0.04, st.karts[0].pos[2] + 2], life: 6, age: 1, owner: 9, r: 2.2 });
    var boom = [st.karts[0].pos[0] + 7, 1.2, st.karts[0].pos[2] - 4];
    NB.fx.ring(boom, 5, [1, 0.7, 0.3], 0.5);
    for (var i = 0; i < 12; i++) NB.fx.fire(boom, M.randRange(0.6, 1.5), 0.6);
    for (i = 0; i < 8; i++) NB.fx.smoke(boom, [M.randRange(-3, 3), 2, M.randRange(-3, 3)], 1.4, [0.45, 0.45, 0.5], 1.1);
    NB.fx.debris(boom, [0.35, 0.33, 0.36], 8);
    NB.fx.beam([st.karts[0].pos[0], 1, st.karts[0].pos[2]], boom, [1, 0.5, 0.2], 0.4);
    NB.fx.text3d([st.karts[0].pos[0], 2.4, st.karts[0].pos[2]], '💥', [1, 0.8, 0.3], 1.2);
    for (i = 0; i < 14; i++) NB.fx.skid([st.karts[0].pos[0] - 6 + i * 0.5, 0, st.karts[0].pos[2] - 6], 0.4, 0.4, 0.3);
    NB.game.projectiles.push({
      kind: 'rocket', pos: [st.karts[0].pos[0] - 2, 1, st.karts[0].pos[2] + 6],
      vel: [10, 0, -10], life: 2, owner: 9, targetId: -1, spin: 0, age: 0
    });
    for (i = 0; i < 10; i++) NB.fx.update(1 / 60);
  }

  function camAt(pos, tgt, fov) {
    var th = (state.arena && state.arena.map.theme) || {
      skyTop: [0.28, 0.5, 0.85], skyBottom: [0.95, 0.8, 0.6], fog: [0.88, 0.78, 0.62],
      sunDir: [0.45, 0.85, 0.3], ambient: 0.62
    };
    return {
      pos: pos, target: tgt, fov: fov || 1.0, aspect: 1, skyTop: th.skyTop, skyBottom: th.skyBottom,
      fogColor: th.fog, fogNear: 50, fogFar: 200, sunDir: th.sunDir, ambient: th.ambient
    };
  }

  function panels(list) {
    var W = NB.gl.width, H = NB.gl.height;
    var cols = list.length > 2 ? 2 : list.length;
    var rows = Math.ceil(list.length / cols);
    var pw = W / cols, ph = H / rows;
    for (var i = 0; i < list.length; i++) {
      var cx = i % cols, cy = Math.floor(i / cols);
      NB.gl.scissor(cx * pw, H - (cy + 1) * ph, pw, ph);
      var cam = list[i](pw / ph);
      cam.aspect = pw / ph;
      NB.gl.begin(cam);
      drawWorld();
      NB.gl.end();
    }
    NB.gl.noScissor();
  }

  function drawWorld() {
    var i;
    if (state.ground) NB.gl.draw(state.ground, M.fromTranslation(M.create(), [0, -0.2, 0]));
    if (state.arena) state.arena.draw();
    if (state.name === 'kart') {
      var m = M.compose(M.create(), [0, 0, 0], 0.5, [1, 1, 1]);
      NB.gl.drawTinted(state.mb, m, [0.9, 0.25, 0.2]);
      NB.gl.drawTinted(state.ma, m, [0.36, 0.1, 0.1]);
      NB.gl.draw(state.md, m);
      NB.fx.shadow(0, 0, 1.15, 0.34);
    } else {
      NB.pickups.draw();
      NB.kart.drawAll();
      NB.weapons.draw();
      NB.fx.draw();
    }
  }

  // export PNG fait par le jeu lui-même (readPixels -> PNG via canvas 2D)
  Q.png = function () {
    var gl = NB.gl.gl();
    var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    var px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var cx = cv.getContext('2d');
    var img = cx.createImageData(w, h);
    for (var y = 0; y < h; y++) {
      var src = (h - 1 - y) * w * 4, dst = y * w * 4;
      img.data.set(px.subarray(src, src + w * 4), dst);
    }
    cx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  };

  Q.probe = function (fx, fy) {
    var gl = NB.gl.gl();
    if (!gl) return 'nogl';
    var px = new Uint8Array(4);
    gl.readPixels(fx | 0, fy | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px[0] + ',' + px[1] + ',' + px[2];
  };

  Q.tick = function () {
    if (Q.done) return;
    if (/[?&]probe=1/.test(location.search)) {
      Q.done = true;
      var W = NB.gl.width, H = NB.gl.height;
      document.title = 'PROBE under=' + Q.probe(W / 2, H * 0.28) +
        ' floor=' + Q.probe(W / 2, H * 0.12) + ' sky=' + Q.probe(W / 2, H * 0.9);
    } else if (/[?&]png=1/.test(location.search)) {
      Q.done = true;
      var pre = document.createElement('pre');
      pre.id = 'qapng';
      pre.textContent = Q.png();
      document.body.appendChild(pre);
    }
  };

  Q.draw = function (name) {
    if (name === 'kart') {
      panels([
        function (a) { return camAt([0, 1.2, -4.2], [0, 0.6, 0], 0.9); },
        function (a) { return camAt([4.2, 1.1, 0], [0, 0.6, 0], 0.9); },
        function (a) { return camAt([3, 1.6, 3], [0, 0.6, 0], 0.9); },
        function (a) { return camAt([0.01, 5.5, 0.01], [0, 0.4, 0], 0.9); }
      ]);
      return;
    }
    if (name === 'pickups') {
      panels([function (a) { return camAt([0, 3.2, 12], [0, 1, 0], 0.9); }]);
      return;
    }
    var k0 = state.karts[0];
    var f = [-Math.sin(k0.yaw), 0, -Math.cos(k0.yaw)];
    panels([
      function (a) { return camAt([k0.pos[0] - f[0] * 7, k0.pos[1] + 2.4, k0.pos[2] - f[2] * 7], [k0.pos[0] + f[0] * 6, 1, k0.pos[2] + f[2] * 6], 0.9); },
      function (a) {
        var b = state.arena.bounds;
        var cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        return camAt([cx + 40, 34, cz + 40], [cx, 0, cz], 0.9);
      },
      function (a) { return camAt([k0.pos[0] + 3, 0.9, k0.pos[2] + 3], [k0.pos[0], 1.4, k0.pos[2]], 1.1); },
      function (a) {
        var r = state.arena.ramps[0];
        return camAt([r.x + 9, 2.2, r.z + 9], [r.x, 1.2, r.z], 0.95);
      }
    ]);
  };

  // scène pickups : une rangée des 8 types
  Q.setupPickups = function () {
    state = { name: 'pickups', karts: [], arena: null };
    NB.game = NB.game || {};
    NB.game.karts = []; NB.game.events = []; NB.game.time = 0;
    NB.game.projectiles = []; NB.game.hazards = [];
    var b = NB.mesh.builder();
    b.box(0, -0.2, 0, 30, 0.4, 12, [0.3, 0.32, 0.38]);
    state.ground = NB.gl.createMesh(b.build());
    NB.pickups.list = [];
    var kinds = NB.pickups.KINDS;
    for (var i = 0; i < kinds.length; i++) {
      NB.pickups.list.push({
        id: i, pad: [(i - 3.5) * 2.4, 0], kind: kinds[i],
        pos: [(i - 3.5) * 2.4, 1.05, 0], taken: false, respawnAt: 0, t: i * 0.7
      });
    }
  };

  Q.ingame = function (touch) {
    var g = NB.game;
    NB.main.autopilotOn();
    NB.main.startMatch({ mapId: 'dustbowl', mode: 'deathmatch', difficulty: 'pro' });
    g.countdown = 0;
    NB.main.setPhase('playing');
    for (var i = 0; i < 360; i++) { g.time += 1 / 60; NB.main.step(1 / 60); }
    var p = g.player;
    NB.weapons.explode([p.pos[0] + 6, 1, p.pos[2] + 4], 3.2, 1, 1, [1, 0.6, 0.2]);
    g.projectiles.push({
      kind: 'homing', pos: [p.pos[0] + 14, 1.2, p.pos[2] + 10], vel: [-20, 0, -14],
      life: 3, owner: 2, targetId: 0, spin: 0, age: 0
    });
    g.events.push({ t: 'kill', killerId: 1, victimId: 2, weapon: 'rocket' });
    g.events.push({ t: 'kill', killerId: 0, victimId: 4, weapon: 'homing' });
    NB.main.dispatch(g);
    if (touch) NB.hud.setTouchVisible(true);
    NB.main.freeze(true);
  };

  NB.qa = Q;
})(window.NB = window.NB || {});
