// NITRO BRAWL — interface : menus, HUD, minimap, killfeed, tactile (DOM/CSS uniquement)
(function (NB) {
  'use strict';
  var H = {};
  var ui = null, touch = null, overlay = null, octx = null, mini = null, mctx = null;
  var els = {};
  var feed = [];
  var flashT = 0, flashColor = [1, 0.2, 0.2];
  var centerMsg = '', centerT = 0;
  H.touch = { active: false, move: { x: 0, y: 0 }, fire: false, drift: false, use: false };
  H.onInput = {};
  H.killfeed = feed;

  H.persist = {
    get: function () {
      return NB.util.store.get('nb.settings', { name: 'TOI', color: 1, difficulty: 'pro', mapId: 'dustbowl', mode: 'deathmatch' });
    },
    set: function (patch) {
      var s = H.persist.get();
      for (var k in patch) s[k] = patch[k];
      NB.util.store.set('nb.settings', s);
      return s;
    }
  };

  H.COLORS = [
    [0.95, 0.25, 0.2], [0.2, 0.65, 1], [1, 0.8, 0.15], [0.35, 0.9, 0.4],
    [0.75, 0.4, 1], [1, 0.5, 0.12], [0.95, 0.35, 0.7], [0.55, 0.95, 0.9]
  ];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  H.injectCSS = function () {
    if (document.getElementById('nb-css')) return;
    var s = el('style');
    s.id = 'nb-css';
    s.textContent = [
      '#ui{font-family:ui-sans-serif,system-ui,sans-serif;color:#eaf2ff}',
      '.nb-screen{position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;padding:26px 0 44px;',
      'background:radial-gradient(1200px 700px at 50% 20%,rgba(30,20,70,.55),rgba(6,8,18,.82));',
      'animation:nbPop .22s ease-out;overflow:auto}',
      '.nb-panel{width:min(680px,92vw);padding:clamp(10px,2vw,24px);text-align:center;margin:0 auto}',
      '.nb-title{font-size:clamp(24px,4.4vw,44px);font-weight:900;letter-spacing:.05em;margin:0;white-space:nowrap;',
      'background:linear-gradient(92deg,#ff3d6e,#ffb02e,#2ee6ff);-webkit-background-clip:text;background-clip:text;',
      'color:transparent;filter:drop-shadow(0 0 18px rgba(255,80,120,.45));animation:nbPulse 2.6s ease-in-out infinite}',
      '.nb-sub{opacity:.75;margin:4px 0 12px;letter-spacing:.28em;text-transform:uppercase;font-size:clamp(10px,1.6vw,13px)}',
      '.nb-btn{display:block;width:min(340px,80vw);margin:8px auto;padding:11px 16px;font-size:16px;font-weight:800;',
      'letter-spacing:.12em;color:#081018;background:linear-gradient(90deg,#2ee6ff,#7cf0a8);border:0;border-radius:12px;',
      'cursor:pointer;box-shadow:0 6px 0 rgba(0,0,0,.35),0 0 22px rgba(46,230,255,.35);transition:transform .12s,filter .12s}',
      '.nb-btn:hover{transform:translateY(-2px);filter:brightness(1.12)}',
      '.nb-btn:active{transform:translateY(2px)}',
      '.nb-btn.ghost{background:rgba(255,255,255,.08);color:#dfe8ff;box-shadow:0 4px 0 rgba(0,0,0,.3)}',
      '.nb-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:12px auto;max-width:560px}',
      '.nb-card{flex:1 1 45%;max-width:260px;padding:10px;border-radius:14px;cursor:pointer;',
      'background:rgba(255,255,255,.06);border:2px solid transparent;transition:border .12s,transform .12s}',
      '.nb-card:hover{transform:translateY(-3px)}',
      '.nb-card.sel{border-color:#2ee6ff;background:rgba(46,230,255,.14)}',
      '.nb-card h3{margin:4px 0 2px;font-size:15px}',
      '.nb-card p{margin:0;font-size:11px;opacity:.7;line-height:1.35}',
      '.nb-card canvas{width:100%;height:112px;border-radius:8px;background:#0a0d18}',
      '.nb-swatches{display:flex;gap:8px;justify-content:center;margin:12px 0}',
      '.nb-swatch{width:34px;height:34px;border-radius:50%;cursor:pointer;border:3px solid transparent}',
      '.nb-swatch.sel{border-color:#fff;transform:scale(1.15)}',
      '#hud{position:absolute;inset:0;pointer-events:none}',
      '.hud-box{position:absolute;background:rgba(8,10,22,.62);border:1px solid rgba(120,160,255,.25);',
      'border-radius:12px;padding:8px 12px;backdrop-filter:blur(4px)}',
      '#hud-clock{top:14px;left:14px;font-size:26px;font-weight:900;letter-spacing:.05em}',
      '#hud-clock small{display:block;font-size:11px;opacity:.65;letter-spacing:.2em}',
      '#hud-rank{bottom:14px;left:14px;font-size:20px;font-weight:800}',
      '#hud-rank b{color:#ffd23e}',
      '#hud-weapon{bottom:14px;right:14px;text-align:right;font-size:15px;font-weight:700}',
      '#hud-weapon .ico{font-size:30px;display:block}',
      '#hud-speed{bottom:104px;right:14px;font-size:15px;font-weight:800;text-align:right}',
      '#hud-map{top:14px;right:180px;font-size:12px;letter-spacing:.18em;opacity:.8}',
      '#mini{position:absolute;top:14px;right:14px;width:150px;height:150px;border-radius:12px;',
      'border:1px solid rgba(120,160,255,.3);background:rgba(8,10,22,.6)}',
      '#pauseBtn{position:absolute;top:170px;right:14px;width:44px;height:44px;border-radius:12px;border:0;',
      'background:rgba(8,10,22,.7);color:#fff;font-size:20px;cursor:pointer}',
      '#killfeed{position:absolute;top:96px;left:14px;display:flex;flex-direction:column;gap:4px}',
      '.kf{background:rgba(8,10,22,.6);border-left:3px solid #ff3d6e;border-radius:6px;padding:4px 10px;',
      'font-size:13px;font-weight:700;animation:nbSlide .2s ease-out}',
      '#center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
      'font-size:clamp(50px,14vw,150px);font-weight:900;text-shadow:0 0 40px rgba(255,120,60,.6);pointer-events:none}',
      '#flash{position:absolute;inset:0;pointer-events:none;opacity:0}',
      '#overlay{position:absolute;inset:0;pointer-events:none}',
      '#threat{position:absolute;top:50%;left:50%;width:0;height:0;font-size:44px;transform:translate(-50%,-50%);',
      'filter:drop-shadow(0 0 10px red);display:none}',
      '#touch .stick{position:absolute;left:4vw;bottom:6vh;width:34vw;height:34vw;max-width:190px;max-height:190px;',
      'border-radius:50%;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.2)}',
      '#touch .knob{position:absolute;width:40%;height:40%;border-radius:50%;background:rgba(46,230,255,.5);',
      'left:30%;top:30%}',
      '#touch .tbtn{position:absolute;border-radius:50%;border:0;color:#081018;font-weight:900;font-size:15px;',
      'background:rgba(255,255,255,.75);box-shadow:0 4px 0 rgba(0,0,0,.3)}',
      '#tFire{right:5vw;bottom:8vh;width:24vw;height:24vw;max-width:120px;max-height:120px;background:#ff5d7e;color:#fff}',
      '#tDrift{right:24vw;bottom:5vh;width:16vw;height:16vw;max-width:84px;max-height:84px}',
      '#tUse{right:6vw;bottom:30vh;width:16vw;height:16vw;max-width:84px;max-height:84px;background:#ffd23e}',
      '.nb-table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}',
      '.nb-table td,.nb-table th{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.1)}',
      '.nb-table .me{background:rgba(46,230,255,.12);font-weight:800}',
      '.nb-medal{font-size:44px}',
      '.nb-help{ text-align:left;font-size:14px;line-height:1.7;max-width:520px;margin:0 auto }',
      'kbd{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:5px;padding:1px 7px;font-size:12px}'
    ].join('');
    document.head.appendChild(s);
  };

  H.init = function () {
    if (typeof document === 'undefined' || H.done) return;
    H.done = true;
    H.injectCSS();
    ui = document.getElementById('ui');
    touch = document.getElementById('touch');
    ui.innerHTML = '<div id="hud" class="nb-hidden">' +
      '<div class="hud-box" id="hud-clock">3:00<small id="hud-mode">DEATHMATCH</small></div>' +
      '<div class="hud-box" id="hud-map"></div>' +
      '<canvas id="mini" width="150" height="150"></canvas>' +
      '<button id="pauseBtn" data-click>⏸</button>' +
      '<div id="killfeed"></div>' +
      '<div class="hud-box" id="hud-rank"></div>' +
      '<div class="hud-box" id="hud-speed"></div>' +
      '<div class="hud-box" id="hud-weapon"></div>' +
      '<div id="center"></div><div id="flash"></div><div id="threat">️</div>' +
      '<canvas id="overlay"></canvas></div><div id="screens"></div>';
    els.hud = ui.querySelector('#hud');
    els.clock = ui.querySelector('#hud-clock');
    els.mode = ui.querySelector('#hud-mode');
    els.map = ui.querySelector('#hud-map');
    els.rank = ui.querySelector('#hud-rank');
    els.speed = ui.querySelector('#hud-speed');
    els.weapon = ui.querySelector('#hud-weapon');
    els.feed = ui.querySelector('#killfeed');
    els.center = ui.querySelector('#center');
    els.flash = ui.querySelector('#flash');
    els.threat = ui.querySelector('#threat');
    els.screens = ui.querySelector('#screens');
    mini = ui.querySelector('#mini'); mctx = mini.getContext('2d');
    overlay = ui.querySelector('#overlay'); octx = overlay.getContext('2d');
    ui.querySelector('#pauseBtn').addEventListener('click', function () {
      NB.audio.ui('click');
      if (NB.game.phase === 'playing') NB.main.setPhase('paused');
      else if (NB.game.phase === 'paused') H.onInput.onResume && H.onInput.onResume();
    });
    NB.util.eventBus.on('hitflash', function (c) { flashT = 0.35; flashColor = c || [1, 0.2, 0.2]; });
    NB.util.eventBus.on('phase', function (p) {
      els.hud.classList.toggle('nb-hidden', p === 'menu');
      if (p === 'menu') H.screen('menu');
    });
    setupTouch();
    window.addEventListener('resize', sizeOverlay);
    sizeOverlay();
  };

  function sizeOverlay() {
    if (!overlay) return;
    overlay.width = window.innerWidth; overlay.height = window.innerHeight;
  }

  // ---------- écrans ----------
  H.screen = function (name, data) {
    if (!ui) return;
    var s = els.screens;
    s.innerHTML = '';
    if (name === 'playing') return;
    var wrap = el('div', 'nb-screen');
    var panel = el('div', 'nb-panel');
    wrap.appendChild(panel);
    s.appendChild(wrap);
    if (name === 'menu') menuScreen(panel);
    else if (name === 'maps') mapsScreen(panel);
    else if (name === 'mode') modeScreen(panel);
    else if (name === 'customize') customizeScreen(panel);
    else if (name === 'help') helpScreen(panel);
    else if (name === 'paused') pausedScreen(panel);
    else if (name === 'results') resultsScreen(panel, data);
  };

  function title(panel, t, sub) {
    panel.appendChild(el('h1', 'nb-title', t));
    if (sub) panel.appendChild(el('div', 'nb-sub', sub));
  }

  function btn(panel, label, cls, fn) {
    var b = el('button', 'nb-btn ' + (cls || ''), label);
    b.addEventListener('click', function () { NB.audio.ui('click'); fn(); });
    b.addEventListener('mouseenter', function () { NB.audio.ui('hover'); });
    panel.appendChild(b);
    return b;
  }

  function menuScreen(p) {
    title(p, 'NITRO BRAWL', 'Kart Arena Brawl — 1 joueur + 7 bots');
    btn(p, '▶ JOUER', '', function () {
      var s = H.persist.get();
      H.onInput.onStart && H.onInput.onStart(s.mapId, s.mode, s.difficulty);
    });
    btn(p, '🗺 ARÈNES', 'ghost', function () { H.screen('maps'); });
    btn(p, '🏁 MODE DE JEU', 'ghost', function () { H.screen('mode'); });
    btn(p, '🎨 PILOTE & DIFFICULTÉ', 'ghost', function () { H.screen('customize'); });
    btn(p, '❓ AIDE', 'ghost', function () { H.screen('help'); });
    var st = NB.util.store.get('nb.audio', {});
    btn(p, (st.enabled === false ? '🔇' : '🔊') + ' SON', 'ghost', function () {
      var cur = NB.util.store.get('nb.audio', {});
      NB.audio.setEnabled(cur.enabled === false);
      H.screen('menu');
    });
    p.appendChild(el('div', 'nb-sub', 'Concours Base44 × Nitro — WebGL maison, zéro asset'));
  }

  function mapsScreen(p) {
    title(p, 'CHOISIS TON ARÈNE');
    var row = el('div', 'nb-row');
    var sel = H.persist.get().mapId;
    NB.maps.list.forEach(function (m) {
      var card = el('div', 'nb-card' + (m.id === sel ? ' sel' : ''));
      var cv = el('canvas'); cv.width = 160; cv.height = 160;
      card.appendChild(cv);
      card.appendChild(el('h3', '', m.name));
      card.appendChild(el('p', '', m.tagline + ' · diff ' + m.difficulty + '/3'));
      card.addEventListener('click', function () {
        NB.audio.ui('select');
        H.persist.set({ mapId: m.id });
        H.screen('maps');
      });
      row.appendChild(card);
      try { NB.arena.build(m).drawMinimap(cv.getContext('2d'), 0, 0, 160); } catch (e) { /* aperçu optionnel */ }
    });
    p.appendChild(row);
    btn(p, '✔ VALIDER', '', function () { H.screen('menu'); });
    btn(p, '← RETOUR', 'ghost', function () { H.screen('menu'); });
  }

  function modeScreen(p) {
    title(p, 'MODE DE JEU');
    var row = el('div', 'nb-row');
    var sel = H.persist.get().mode;
    [['deathmatch', '💥 DEATHMATCH', '3 minutes. Le plus d\'éliminations gagne.'],
      ['elimination', '☠️ ÉLIMINATION', '3 vies chacun. Dernier kart debout.']].forEach(function (m) {
      var card = el('div', 'nb-card' + (sel === m[0] ? ' sel' : ''));
      card.appendChild(el('h3', '', m[1]));
      card.appendChild(el('p', '', m[2]));
      card.addEventListener('click', function () { NB.audio.ui('select'); H.persist.set({ mode: m[0] }); H.screen('mode'); });
      row.appendChild(card);
    });
    p.appendChild(row);
    btn(p, '← RETOUR', 'ghost', function () { H.screen('menu'); });
  }

  function customizeScreen(p) {
    title(p, 'TON PILOTE');
    var s = H.persist.get();
    var inp = el('input');
    inp.maxLength = 12; inp.value = s.name || 'TOI';
    inp.style.cssText = 'font-size:20px;padding:10px;border-radius:10px;border:1px solid #2ee6ff;background:rgba(0,0,0,.4);color:#fff;text-align:center;width:min(260px,70vw)';
    inp.addEventListener('change', function () { H.persist.set({ name: inp.value.toUpperCase() || 'TOI' }); });
    p.appendChild(inp);
    var sw = el('div', 'nb-swatches');
    H.COLORS.forEach(function (c, i) {
      var d = el('div', 'nb-swatch' + (i === s.color ? ' sel' : ''));
      d.style.background = 'rgb(' + (c[0] * 255 | 0) + ',' + (c[1] * 255 | 0) + ',' + (c[2] * 255 | 0) + ')';
      d.addEventListener('click', function () { NB.audio.ui('select'); H.persist.set({ color: i }); H.screen('customize'); });
      sw.appendChild(d);
    });
    p.appendChild(sw);
    var row = el('div', 'nb-row');
    ['rookie', 'pro', 'legend'].forEach(function (d) {
      var card = el('div', 'nb-card' + (s.difficulty === d ? ' sel' : ''));
      card.appendChild(el('h3', '', d.toUpperCase()));
      card.appendChild(el('p', '', d === 'rookie' ? 'Bots distraits' : d === 'pro' ? 'Bots sérieux' : 'Bots sans pitié'));
      card.addEventListener('click', function () { NB.audio.ui('select'); H.persist.set({ difficulty: d }); H.screen('customize'); });
      row.appendChild(card);
    });
    p.appendChild(row);
    btn(p, '← RETOUR', 'ghost', function () { H.screen('menu'); });
  }

  function helpScreen(p) {
    title(p, 'COMMENT JOUER');
    p.appendChild(el('div', 'nb-help',
      '<b>Conduire</b> : <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>WASD</kbd> / flèches / joystick tactile<br>' +
      '<b>Tirer</b> : <kbd>Espace</kbd> ou clic gauche ou bouton TIRER<br>' +
      '<b>Drift</b> : <kbd>Maj</kbd> (maintenir en virage → mini-boost au relâchement)<br>' +
      '<b>Activer</b> (bouclier/boost/bélier) : <kbd>E</kbd> ou clic droit ou bouton BONUS<br>' +
      '<b>Respawn forcé</b> : <kbd>R</kbd> · <b>Pause</b> : <kbd>Échap</kbd><br><br>' +
      '<b>Power-ups</b> : 🚀 roquette · 🎯 missile guidé · 💣 grenade ·  mine · ️ huile · ️ bouclier ·  boost · 🔰 bélier<br>' +
      'Un seul tir encaissé = élimination. Ramasse, vise, esquive. Les rampes mènent aux plateformes : prends de la vitesse !'));
    btn(p, '← RETOUR', 'ghost', function () { H.screen('menu'); });
  }

  function pausedScreen(p) {
    title(p, 'PAUSE');
    btn(p, '▶ REPRENDRE', '', function () { H.onInput.onResume && H.onInput.onResume(); });
    btn(p, '↻ RECOMMENCER', 'ghost', function () { H.onInput.onRestart && H.onInput.onRestart(); });
    btn(p, '🗺 CHANGER D\'ARÈNE', 'ghost', function () { H.screen('maps'); });
    btn(p, '🏠 MENU', 'ghost', function () { H.onInput.onMenu && H.onInput.onMenu(); });
  }

  function resultsScreen(p, data) {
    if (!data) return;
    var medals = ['🥇', '', ''];
    title(p, data.winner && data.winner.isPlayer ? 'VICTOIRE !' : 'MANCHE TERMINÉE');
    p.appendChild(el('div', 'nb-medal', (data.winner && data.winner.isPlayer) ? '🏆' : medals[Math.min(2, data.playerRank - 1)] || '🏁'));
    p.appendChild(el('div', 'nb-sub', data.map + ' · ' + data.mode + ' · ta place : ' + data.playerRank + '/' + data.rows.length));
    var t = el('table', 'nb-table');
    var head = '<tr><th>#</th><th>Pilote</th><th>Kills</th><th>Morts</th></tr>';
    var body = data.rows.map(function (r) {
      return '<tr class="' + (r.isPlayer ? 'me' : '') + '"><td>' + r.rank + '</td><td>' +
        (medals[r.rank - 1] || '') + ' ' + r.name + '</td><td>' + r.kills + '</td><td>' + r.deaths + '</td></tr>';
    }).join('');
    t.innerHTML = head + body;
    p.appendChild(t);
    btn(p, '↻ REJOUER', '', function () { H.onInput.onRestart && H.onInput.onRestart(); });
    btn(p, '🏠 MENU', 'ghost', function () { H.onInput.onMenu && H.onInput.onMenu(); });
  }

  // ---------- HUD en jeu ----------
  H.update = function (dt) {
    var g = NB.game;
    if (!g || !els.hud) return;
    if (g.phase === 'menu') return;
    if (g.mode === 'deathmatch') els.clock.firstChild.nodeValue = NB.util.fmtClock(g.clock);
    else els.clock.firstChild.nodeValue = remaining(g) + ' EN COURSE';
    els.mode.textContent = g.mode === 'deathmatch' ? 'DEATHMATCH' : 'ÉLIMINATION';
    els.map.textContent = (g.map ? g.map.name : '').toUpperCase();
    var rank = playerRank(g);
    els.rank.innerHTML = 'POS <b>' + rank + '/' + g.karts.length + '</b> · ☠ ' + (g.player ? g.player.kills : 0) +
      ' · 💀 ' + (g.player ? g.player.deaths : 0);
    var st = g.player ? NB.kart.stats(g.player) : { speedKmh: 0 };
    els.speed.textContent = Math.round(st.speedKmh) + ' km/h';
    var w = g.player ? g.player.weapon : null;
    els.weapon.innerHTML = w ? '<span class="ico">' + NB.pickups.ICONS[w] + '</span>' + NB.pickups.NAMES[w] : '<span class="ico" style="opacity:.25">·</span>aucune arme';
    drawMinimap();
    drawOverlay(g, dt);
    if (flashT > 0) {
      flashT -= dt;
      els.flash.style.opacity = Math.max(0, flashT / 0.35) * 0.4;
      els.flash.style.background = 'rgb(' + (flashColor[0] * 255 | 0) + ',' + (flashColor[1] * 255 | 0) + ',' + (flashColor[2] * 255 | 0) + ')';
    } else els.flash.style.opacity = 0;
    if (centerT > 0) { centerT -= dt; if (centerT <= 0) els.center.textContent = ''; }
    threatArrow(g);
  };

  function remaining(g) {
    var n = 0;
    for (var i = 0; i < g.karts.length; i++) if (!g.karts[i].out) n++;
    return n;
  }

  function playerRank(g) {
    var r = 1;
    for (var i = 0; i < g.karts.length; i++) if (g.karts[i].kills > g.player.kills) r++;
    return r;
  }

  function threatArrow(g) {
    var t = null;
    var ps = g.projectiles || [];
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].kind === 'homing' && ps[i].targetId === 0) { t = ps[i]; break; }
    }
    if (!t) { els.threat.style.display = 'none'; return; }
    var d = NB.M.dist(t.pos, g.player.pos);
    if (d > 30) { els.threat.style.display = 'none'; return; }
    var ang = Math.atan2(t.pos[2] - g.player.pos[2], t.pos[0] - g.player.pos[0]) - g.player.yaw;
    els.threat.style.display = 'block';
    els.threat.style.transform = 'translate(-50%,-50%) rotate(' + (ang * 180 / Math.PI + 90) + 'deg) translateY(-90px)';
  }

  H.drawMinimap = function () { drawMinimap(); };

  function drawMinimap() {
    var g = NB.game;
    if (!mctx || !g || !g.arena) return;
    g.arena.drawMinimap(mctx, 0, 0, 150);
    var b = g.arena.bounds;
    var sc = 150 / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    function px(v) { return 75 + v * sc; }
    var i;
    for (i = 0; i < NB.pickups.list.length; i++) {
      var p = NB.pickups.list[i];
      if (p.taken) continue;
      mctx.fillStyle = 'rgba(255,220,90,.9)';
      mctx.fillRect(px(p.pos[0]) - 1.5, px(p.pos[2]) - 1.5, 3, 3);
    }
    for (i = 0; i < g.karts.length; i++) {
      var k = g.karts[i];
      if (!k.alive) continue;
      mctx.fillStyle = k.isPlayer ? '#ffffff' : 'rgb(' + (k.color[0] * 255 | 0) + ',' + (k.color[1] * 255 | 0) + ',' + (k.color[2] * 255 | 0) + ')';
      mctx.beginPath();
      mctx.arc(px(k.pos[0]), px(k.pos[2]), k.isPlayer ? 4 : 3, 0, 6.283);
      mctx.fill();
      if (k.isPlayer) { mctx.strokeStyle = '#2ee6ff'; mctx.lineWidth = 1.5; mctx.stroke(); }
    }
  }

  function drawOverlay(g, dt) {
    if (!octx) return;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    var sp = g.player ? NB.M.clamp01(Math.abs(g.player.speed) / 40) : 0;
    var lvl = Math.max(sp * 0.6, NB.fx.speedLevel);
    if (lvl > 0.35 && g.phase === 'playing') {
      var cx = overlay.width / 2, cy = overlay.height / 2;
      octx.strokeStyle = 'rgba(255,255,255,' + ((lvl - 0.35) * 0.5) + ')';
      octx.lineWidth = 2;
      for (var i = 0; i < 14; i++) {
        var a = i / 14 * Math.PI * 2 + g.time * 2;
        var r0 = Math.min(cx, cy) * (0.72 + Math.random() * 0.1);
        octx.beginPath();
        octx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        octx.lineTo(cx + Math.cos(a) * (r0 + 60 * lvl), cy + Math.sin(a) * (r0 + 60 * lvl));
        octx.stroke();
      }
    }
    if (NB.fx.drawScreenTexts) NB.fx.drawScreenTexts(octx);
  }

  H.onEvent = function (e) {
    if (!ui) return;
    if (e.t === 'kill') {
      var g = NB.game;
      var k = g.karts[e.killerId], v = g.karts[e.victimId];
      if (!k || !v) return;
      feed.unshift({ txt: k.name + ' ' + (NB.pickups.ICONS[e.weapon] || '💥') + ' ' + v.name, me: k.isPlayer || v.isPlayer });
      if (feed.length > 5) feed.pop();
      els.feed.innerHTML = feed.map(function (f) {
        return '<div class="kf"' + (f.me ? ' style="border-color:#2ee6ff"' : '') + '>' + f.txt + '</div>';
      }).join('');
    } else if (e.t === 'count') {
      els.center.textContent = e.n;
      centerT = 0.9;
    } else if (e.t === 'go') {
      els.center.textContent = 'GO !';
      centerT = 1;
    } else if (e.t === 'respawn' && e.kartId === 0) {
      els.center.textContent = '';
    }
  };

  H.results = function (data) { H.screen('results', data); };

  H.setTouchVisible = function (v) {
    if (!touch) return;
    touch.style.display = v ? 'block' : 'none';
    H.touch.active = v;
  };

  function setupTouch() {
    if (!touch) return;
    var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    touch.innerHTML = '<div class="stick" id="stick"><div class="knob" id="knob"></div></div>' +
      '<button class="tbtn" id="tFire">TIR</button><button class="tbtn" id="tDrift">DRIFT</button>' +
      '<button class="tbtn" id="tUse">BONUS</button>';
    var stick = touch.querySelector('#stick'), knob = touch.querySelector('#knob');
    var sid = null;
    stick.addEventListener('touchstart', function (e) {
      sid = e.changedTouches[0].identifier; moveStick(e.changedTouches[0]); e.preventDefault();
    }, { passive: false });
    stick.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === sid) moveStick(e.changedTouches[i]);
      }
      e.preventDefault();
    }, { passive: false });
    var end = function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === sid) { sid = null; H.touch.move = { x: 0, y: 0 }; knob.style.left = '30%'; knob.style.top = '30%'; }
      }
    };
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    function moveStick(t) {
      var r = stick.getBoundingClientRect();
      var dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      var l = Math.hypot(dx, dy) || 1;
      if (l > 1) { dx /= l; dy /= l; }
      H.touch.move = { x: dx, y: dy };
      knob.style.left = (30 + dx * 30) + '%';
      knob.style.top = (30 + dy * 30) + '%';
    }
    bindHold(touch.querySelector('#tFire'), 'fire');
    bindHold(touch.querySelector('#tDrift'), 'drift');
    bindHold(touch.querySelector('#tUse'), 'use');
    H.setTouchVisible(isTouch);
  }

  function bindHold(btn, key) {
    var on = function (e) { H.touch[key] = true; e.preventDefault(); };
    var off = function (e) { H.touch[key] = false; e.preventDefault(); };
    btn.addEventListener('touchstart', on, { passive: false });
    btn.addEventListener('touchend', off, { passive: false });
    btn.addEventListener('touchcancel', off, { passive: false });
  }

  NB.hud = H;
})(window.NB = window.NB || {});
