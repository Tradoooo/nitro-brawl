// NITRO BRAWL — boucle de jeu, caméra, règles de match, bootstrap
(function (NB) {
  'use strict';
  var M = NB.M;
  var G = {};
  NB.GRAVITY = -22;

  var canvas = null, uiEl = null, raf = 0, lastT = 0, acc = 0;
  var demo = false;
  var PALETTE = [
    [1, 0.28, 0.24], [0.25, 0.75, 1], [1, 0.82, 0.2], [0.42, 0.9, 0.45],
    [0.78, 0.45, 1], [1, 0.5, 0.15], [0.95, 0.4, 0.75], [0.6, 0.95, 0.9]
  ];
  var prevUse = {}, prevFire = {};

  // ---------- bootstrap ----------
  G.boot = function () {
    canvas = document.getElementById('gl');
    uiEl = document.getElementById('ui');
    if (!canvas) return;
    var ok = false, glErr = '';
    try { ok = NB.gl.init(canvas); } catch (e) { glErr = String(e && e.message || e); NB.util.dbg('gl', e); }
    if (/[?&]diag=1/.test(location.search)) {
      var ctxOk = false;
      try {
        var c2 = document.createElement('canvas');
        ctxOk = !!(c2.getContext('webgl2') || c2.getContext('webgl') || c2.getContext('experimental-webgl'));
      } catch (e2) { ctxOk = 'exc'; }
      document.title = 'NB DIAG ok=' + ok + ' ctx=' + ctxOk + ' three=' + (typeof THREE !== 'undefined') +
        ' err=' + String(glErr).slice(0, 90);
    }
    if (!ok) { fatal(); return; }
    G.fit();
    window.addEventListener('resize', G.fit);
    NB.input.init();
    NB.hud.init();
    NB.audio.init();
    wireHud();
    NB.game = { phase: 'menu', karts: [], events: [], time: 0, shake: 0, slowmo: 1 };
    if (NB.models) NB.models.loadAll();
    G.autopilot = /[?&]autopilot=1/.test(location.search);
    var qa = (location.search.match(/[?&]qa=([a-z0-9]+)/) || [])[1];
    var scr = (location.search.match(/[?&]screen=([a-z]+)/) || [])[1];
    if (qa === 'ingame' || qa === 'touch') {
      NB.qa.ingame(qa === 'touch');
    } else if (qa) {
      G.qaMode = qa;
      if (qa === 'pickups') NB.qa.setupPickups(); else NB.qa.setup(qa);
      els0();
    } else if (scr) {
      G.uiFreeze = true;
      NB.hud.screen(scr, scr === 'results' ? sampleResults() : null);
    } else {
      startDemo();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && NB.game.phase === 'playing') setPhase('paused');
    });
    lastT = NB.util.now();
    raf = requestAnimationFrame(frame);
    NB.util.dbg('boot ok');
    if (/[?&]auto=1/.test(location.search)) {
      var m = NB.maps.list[0];
      G.startMatch({ mapId: m.id, mode: 'deathmatch', difficulty: 'pro' });
    }
    if (/[?&]selftest/.test(location.search)) selftest();
  };

  function fatal() {
    if (!uiEl) return;
    uiEl.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;text-align:center;padding:24px;font-size:17px;line-height:1.7">' +
      '<div style="max-width:640px"><h1 style="font-size:30px;margin-bottom:14px">NITRO BRAWL</h1>' +
      '<b>WebGL est indisponible sur ce navigateur.</b><br>' +
      'Deux causes possibles :<br>' +
      '1) accélération matérielle désactivée → chrome://settings → activer ' +
      '« Utiliser l\'accélération matérielle » puis relancer ;<br>' +
      '2) pas de GPU sur cette machine → Chrome bloque le WebGL logiciel : lance-le avec ' +
      '<code style="background:rgba(255,255,255,.12);padding:2px 8px;border-radius:6px">' +
      'google-chrome --enable-unsafe-swiftshader</code><br>' +
      '<button id="nbRetry" style="margin-top:16px;padding:10px 22px;font-size:16px;font-weight:800;' +
      'border:0;border-radius:10px;background:#2ee6ff;color:#081018;cursor:pointer">Réessayer</button></div></div>';
    var b = document.getElementById('nbRetry');
    if (b) b.addEventListener('click', function () { location.reload(); });
  }

  G.fit = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    NB.gl.resize(w, h, dpr);
    NB.cam.cam.aspect = w / Math.max(1, h);
  };

  function wireHud() {
    NB.hud.onInput = {
      onStart: function (mapId, mode, difficulty) { G.startMatch({ mapId: mapId, mode: mode, difficulty: difficulty }); },
      onResume: function () { if (NB.game.phase === 'paused') setPhase('playing'); },
      onRestart: function () { G.startMatch(lastOpts); },
      onMenu: function () { G.toMenu(); },
      onQuit: function () { G.toMenu(); },
      onCustomize: function () { /* lu au démarrage du match */ },
      onToggleAudio: function (v) { NB.audio.setEnabled(v); },
      onToggleMusic: function (v) { NB.audio.setMusic(v); }
    };
  }

  var lastOpts = null;

  // ---------- mise en place d'une manche ----------
  G.startMatch = function (opts) {
    opts = opts || {};
    lastOpts = opts;
    var s = NB.hud.persist && NB.hud.persist.get ? NB.hud.persist.get() : {};
    var map = NB.maps.byId(opts.mapId) || NB.maps.random();
    var arena = NB.arena.build(map);
    var g = NB.game;
    g.map = map; g.arena = arena;
    g.mode = opts.mode || 'deathmatch';
    g.difficulty = opts.difficulty || 'pro';
    g.matchTime = g.mode === 'deathmatch' ? 180 : 999;
    g.clock = g.matchTime;
    g.karts = []; g.projectiles = []; g.hazards = []; g.events = [];
    g.winner = null; g.shake = 0;
    demo = false;
    buildKarts(g, arena, s);
    NB.weapons.init();
    NB.pickups.init(arena);
    NB.fx.init(); NB.fx.reset();
    NB.audio.resume();
    NB.audio.music('match');
    setPhase('countdown');
    g.countdown = 3.6;
    NB.hud.screen('playing');
    NB.cam.snap(g.karts[0]);
  };

  function buildKarts(g, arena, s) {
    var names = NB.bots.NAMES.slice();
    M.shuffle(names);
    var pname = (s && s.name) || 'TOI';
    var pcolor = (NB.hud && NB.hud.COLORS && s && s.color != null && NB.hud.COLORS[s.color]) ? NB.hud.COLORS[s.color] : PALETTE[1];
    if (/[?&]dbgcolor=1/.test(location.search)) pcolor = [1, 0, 1];
    for (var i = 0; i < 8; i++) {
      var sp = arena.spawns[i % arena.spawns.length];
      var isP = i === 0;
      var k = NB.kart.create({
        id: i, name: isP ? pname : names[i % names.length],
        color: isP ? pcolor : PALETTE[i],
        accent: shade3(isP ? pcolor : PALETTE[i], 0.45),
        isPlayer: isP, isBot: !isP, pos: [sp[0], sp[1]], yaw: yawToCenter(sp, arena),
        arena: arena, difficulty: g.difficulty
      });
      k.lives = g.mode === 'elimination' ? 1 : 99;
      if (NB.models && NB.models.ready) k.model = NB.models.cars[i % NB.models.cars.length];
      k.out = false;
      g.karts.push(k);
      if (!isP || G.autopilot) NB.bots.attach(k, arena, g.difficulty);
    }
    g.player = g.karts[0];
  }

  function shade3(c, k) { return [c[0] * k + 0.06, c[1] * k + 0.06, c[2] * k + 0.06]; }

  function yawToCenter(sp, arena) {
    var c = [(arena.bounds.minX + arena.bounds.maxX) / 2, (arena.bounds.minZ + arena.bounds.maxZ) / 2];
    return Math.atan2(-(c[0] - sp[0]), -(c[1] - sp[1]));
  }

  function startDemo() {
    demo = true;
    var map = NB.maps.random();
    var arena = NB.arena.build(map);
    var g = NB.game;
    g.map = map; g.arena = arena; g.mode = 'deathmatch'; g.difficulty = 'pro';
    g.matchTime = 9999; g.clock = 9999; g.events = []; g.karts = []; g.winner = null;
    buildKarts(g, arena, {});
    g.player = g.karts[0];
    NB.weapons.init(); NB.pickups.init(arena); NB.fx.init(); NB.fx.reset();
    setPhase('menu');
    NB.hud.screen('menu');
  }

  function setPhase(p) {
    NB.game.phase = p;
    NB.util.eventBus.emit('phase', p);
    if (p === 'paused') NB.hud.screen('paused');
    if (p === 'menu') NB.audio.music('menu');
  }
  G.setPhase = setPhase;

  G.toMenu = function () { startDemo(); };

  // ---------- boucle ----------
  function frame() {
    raf = requestAnimationFrame(frame);
    var t = NB.util.now();
    var dt = Math.min(0.05, Math.max(0.0005, t - lastT));
    lastT = t;
    var g = NB.game;
    g.time += dt;
    g.fps = g.fps ? g.fps * 0.9 + (1 / dt) * 0.1 : 60;
    try {
      if (G.qaMode) {
        NB.qa.draw(G.qaMode);
        NB.qa.tick();
      } else { update(dt); draw(); }
    } catch (e) {
      cancelAnimationFrame(raf);
      NB.util.dbg('fatal frame error', e && e.stack || e);
      throw e;
    }
    if (G.frozen && NB.qa) NB.qa.tick();
    NB.input.endFrame();
  }

  function els0() {
    var h = document.getElementById('hud');
    if (h) h.classList.add('nb-hidden');
  }

  function sampleResults() {
    var rows = [];
    var names = ['TOI', 'Volt', 'Rico', 'Nova', 'Blitz', 'Tango', 'Ziggy', 'Koda'];
    for (var i = 0; i < 8; i++) {
      rows.push({
        rank: i + 1, name: names[i], kills: 9 - i, deaths: i, color: [0.9, 0.3, 0.2],
        isPlayer: i === 0, lives: 3, shots: 20, hits: 10
      });
    }
    return { mode: 'deathmatch', map: 'Dust Bowl', winner: { isPlayer: true }, playerRank: 1, rows: rows };
  }

  function update(dt) {
    var g = NB.game;
    if (g.phase === 'paused') return;
    if (G.uiFreeze) return;
    if (G.frozen) { NB.hud.update(dt); return; }
    if (g.phase === 'countdown') {
      g.countdown -= dt;
      tickCountdown(g);
    } else if (g.phase === 'playing') {
      tickClock(g, dt);
    }
    var live = (g.phase === 'playing' || demo);
    stepKarts(g, dt, live);
    NB.kart.collideKarts(dt);
    NB.pickups.update(dt);
    if (live) collectPickups(g);
    NB.weapons.update(dt);
    if (NB.weapons.resolveRam) NB.weapons.resolveRam(dt);
    dispatchEvents(g);
    if (!demo) {
      NB.audio.engine(g.player, dt);
      NB.audio.skid(driftIntensity(g.player));
    }
    NB.fx.update(dt);
    NB.cam.update(g, dt);
    NB.hud.update(dt);
  }

  function driftIntensity(k) {
    if (!k || !k.alive) return 0;
    var drifting = k.drift && Math.abs(k.steer) > 0.3 && k.speed > 8;
    return drifting ? Math.min(1, Math.abs(k.speed) / 24) : (k.oilT > 0 ? 0.5 : 0);
  }

  function tickCountdown(g) {
    var n = Math.ceil(g.countdown - 0.6);
    if (n !== g.lastCount && n >= 1 && n <= 3) {
      g.lastCount = n;
      g.events.push({ t: 'count', n: n });
    }
    if (g.countdown <= 0) {
      setPhase('playing');
      g.events.push({ t: 'go' });
    }
  }

  function tickClock(g, dt) {
    if (g.mode === 'deathmatch') {
      g.clock -= dt;
      if (g.clock <= 0) { g.clock = 0; finish(g); }
    } else {
      var aliveCount = 0, last = null;
      for (var i = 0; i < g.karts.length; i++) {
        if (!g.karts[i].out) { aliveCount++; last = g.karts[i]; }
      }
      if (aliveCount <= 1 && g.karts.length > 1) { finish(g, last); }
    }
  }

  function stepKarts(g, dt, live) {
    for (var i = 0; i < g.karts.length; i++) {
      var k = g.karts[i];
      var inp = NEUTRAL;
      if (live && k.alive) {
        if (k.isBot || (G.autopilot && k.isPlayer)) {
          inp = NB.bots.update(k, dt) || NEUTRAL;
          if (inp.fire) tryFire(k);
          if (inp.use) tryUse(k);
          inp.fire = false; inp.use = false;
        } else {
          inp = playerInput(g, k, dt);
        }
      }
      NB.kart.update(k, inp, dt);
      if (!k.alive && k.respawnIn <= 0 && !k.out) respawn(g, k);
    }
  }

  var NEUTRAL = { throttle: 0, brake: 0, steer: 0, drift: false, fire: false, use: false };

  function playerInput(g, k, dt) {
    var inp = NB.input.read();
    if (NB.input.pressed('KeyR')) { k.respawnIn = 0.05; }
    if (NB.input.pressed('Escape')) setPhase(g.phase === 'paused' ? 'playing' : 'paused');
    var id = k.id;
    var fireEdge = inp.fire && !prevFire[id];
    var useEdge = inp.use && !prevUse[id];
    prevFire[id] = inp.fire; prevUse[id] = inp.use;
    if (fireEdge) tryFire(k);
    if (useEdge) tryUse(k);
    inp.fire = false; inp.use = false;
    return inp;
  }

  function tryFire(k) {
    if (!k.weapon || NB.weapons.cooldown(k)) return;
    NB.weapons.fire(k);
  }

  function tryUse(k) {
    if (k.weapon === 'shield' || k.weapon === 'boost' || k.weapon === 'ram') NB.weapons.activate(k);
  }

  function collectPickups(g) {
    for (var i = 0; i < g.karts.length; i++) {
      var k = g.karts[i];
      if (k.alive) NB.pickups.tryPick(k);
    }
  }

  function respawn(g, k) {
    var best = null, bestScore = -1;
    for (var i = 0; i < g.arena.spawns.length; i++) {
      var sp = g.arena.spawns[i];
      var d = nearestEnemyDist(g, k, sp[0], sp[1]);
      if (d > bestScore) { bestScore = d; best = sp; }
    }
    var sp2 = best || g.arena.spawns[0];
    NB.kart.reset(k, sp2[0], sp2[1], yawToCenter(sp2, g.arena));
    g.events.push({ t: 'respawn', kartId: k.id, pos: [sp2[0], 0.5, sp2[1]] });
  }

  function nearestEnemyDist(g, self, x, z) {
    var best = 1e9;
    for (var i = 0; i < g.karts.length; i++) {
      var k = g.karts[i];
      if (k === self || !k.alive) continue;
      var d = M.dist2([x, 0, z], [k.pos[0], 0, k.pos[2]]);
      if (d < best) best = d;
    }
    return best;
  }

  function dispatchEvents(g) {
    var evs = g.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.t === 'kill') applyKill(g, e);
      NB.fx.onEvent(e);
      NB.audio.onEvent(e);
      NB.hud.onEvent(e);
    }
    evs.length = 0;
  }

  function applyKill(g, e) {
    var victim = g.karts[e.victimId];
    if (!victim) return;
    if (g.mode === 'elimination') {
      victim.lives = (victim.lives || 3) - 1;
      if (victim.lives <= 0) { victim.out = true; victim.respawnIn = 1e9; }
    }
  }

  function finish(g, forcedWinner) {
    var list = g.karts.slice().sort(function (a, b) {
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.deaths - b.deaths;
    });
    g.winner = forcedWinner || list[0];
    setPhase('finished');
    g.events.push({ t: 'matchEnd', winner: g.winner.id });
    NB.audio.music('end');
    saveBest(g, list);
    NB.hud.results(buildResults(g, list));
  }

  function saveBest(g, list) {
    var p = g.player;
    var key = 'nb.best.' + g.map.id + '.' + g.mode;
    var prev = NB.util.store.get(key, null);
    if (!prev || p.kills > prev.kills) NB.util.store.set(key, { kills: p.kills, deaths: p.deaths, at: Date.now() });
  }

  function buildResults(g, list) {
    return {
      mode: g.mode, map: g.map.name, winner: g.winner,
      playerRank: list.indexOf(g.player) + 1,
      rows: list.map(function (k, i) {
        return {
          rank: i + 1, name: k.name, kills: k.kills, deaths: k.deaths,
          color: k.color, isPlayer: k.isPlayer, lives: k.lives,
          shots: k.shots || 0, hits: k.hits || 0
        };
      })
    };
  }

  // ---------- rendu ----------
  function draw() {
    var g = NB.game;
    NB.gl.begin(NB.cam.cam);
    if (g.arena) g.arena.draw();
    NB.pickups.draw();
    NB.kart.drawAll();
    NB.weapons.draw();
    NB.fx.draw();
    NB.gl.end();
  }

  // ---------- selftest (headless) ----------
  function selftest() {
    var out = { ok: true, errors: [], frames: 0 };
    try {
      var g = NB.game;
      var mode = /[?&]mode=elim/.test(location.search) ? 'elimination' : 'deathmatch';
      var mapId = (location.search.match(/map=([a-z]+)/) || [])[1] || NB.maps.list[0].id;
      if (g.phase === 'menu') G.startMatch({ mapId: mapId, mode: mode, difficulty: 'pro' });
      g.countdown = 0; setPhase('playing');
      var n = parseInt((location.search.match(/selftest=(\d+)/) || [])[1] || '240', 10);
      var t0 = NB.util.now();
      for (var i = 0; i < n; i++) {
        g.time += 1 / 60;
        update(1 / 60);
        draw();
        out.frames++;
      }
      out.ms = Math.round((NB.util.now() - t0) * 1000);
      out.perFrame = +(out.ms / n).toFixed(2);
      out.karts = g.karts.map(function (k) {
        return { id: k.id, alive: k.alive, lives: k.lives, out: !!k.out, x: +k.pos[0].toFixed(1), z: +k.pos[2].toFixed(1), sp: +(k.speed || 0).toFixed(1), kills: k.kills };
      });
      out.moved = g.karts.filter(function (k) { return Math.abs(k.pos[0]) + Math.abs(k.pos[2]) > 0.5; }).length;
      out.calls = NB.gl.stats.calls; out.tris = Math.round(NB.gl.stats.tris); out.sprites = Math.round(NB.gl.stats.sprites);
      out.particles = NB.fx.count || 0;
      out.pickups = NB.pickups.list ? NB.pickups.list.length : 0;
      out.weapons = g.karts.map(function (k) { return k.weapon || '-'; });
      out.shots = g.karts.reduce(function (a, k) { return a + (k.shots || 0); }, 0);
      out.avgSpeed = +(g.karts.reduce(function (a, k) { return a + Math.abs(k.speed); }, 0) / g.karts.length).toFixed(1);
      out.deaths = g.karts.reduce(function (a, k) { return a + k.deaths; }, 0);
      out.projectiles = (g.projectiles || []).length;
      out.fps = Math.round(1000 / Math.max(1, out.perFrame));
      out.phase = g.phase; out.frozen = !!G.frozen; out.hidden = document.hidden;
      if (/[?&]end=1/.test(location.search)) {
        g.clock = 0;
        for (var e2 = 0; e2 < 4; e2++) { g.time += 1 / 60; update(1 / 60); }
        out.phase = g.phase;
        out.winner = g.winner ? g.winner.name : null;
      }
    } catch (e) {
      out.ok = false;
      out.errors.push(String((e && e.stack) || e));
    }
    if (/[?&]freeze=1/.test(location.search)) G.frozen = true;
    window.__SELFTEST = out;
    document.title = 'SELFTEST ' + JSON.stringify(out).slice(0, 900);
    var d = document.createElement('pre');
    d.id = 'selftest';
    d.textContent = JSON.stringify(out, null, 1);
    document.body.appendChild(d);
  }
  G.selftest = selftest;
  G.step = update;
  G.autopilotOn = function () { G.autopilot = true; };
  G.dispatch = dispatchEvents;
  G.freeze = function (v) { G.frozen = !!v; };
  G.cam = NB.cam.cam;
  NB.main = G;
})(window.NB = window.NB || {});

if (typeof window !== 'undefined') {
  window.addEventListener('load', function () { NB.main.boot(); });
}
