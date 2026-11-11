// NITRO BRAWL — audio 100 % synthétique (WebAudio) : moteur, tirs, explosions, musique
(function (NB) {
  'use strict';
  var A = {};
  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var engineNodes = null, skidNode = null;
  var voices = 0, MAXV = 24;
  var musicTimer = null, musicStep = 0, musicNext = 0, musicTrack = null;
  A.enabled = true;
  A.volume = 0.6;
  A.musicOn = true;

  function ready() { return !!(ctx && ctx.state === 'running'); }

  A.init = function () {
    var s = NB.util.store.get('nb.audio', null);
    if (s) { A.volume = s.volume == null ? 0.6 : s.volume; A.enabled = s.enabled !== false; A.musicOn = s.music !== false; }
    if (typeof window === 'undefined') return;
    var on = function () { A.resume(); };
    window.addEventListener('pointerdown', on, { once: false });
    window.addEventListener('keydown', on, { once: false });
  };

  A.resume = function () {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = A.enabled ? A.volume : 0;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.16; musicBus.connect(master);
      noiseBuf = makeNoise();
    }
    if (ctx.state === 'suspended') ctx.resume();
    startEngine();
    startSkid();
    if (A.musicOn && musicTrack) scheduleMusic();
  };

  function persist() { NB.util.store.set('nb.audio', { volume: A.volume, enabled: A.enabled, music: A.musicOn }); }
  A.setEnabled = function (v) { A.enabled = v; if (master) master.gain.value = v ? A.volume : 0; persist(); };
  A.setVolume = function (v) { A.volume = NB.M.clamp01(v); if (master && A.enabled) master.gain.value = A.volume; persist(); };
  A.setMusic = function (v) { A.musicOn = v; if (!v) stopMusic(); else if (musicTrack) scheduleMusic(); persist(); };

  function makeNoise() {
    var len = ctx.sampleRate * 1.2;
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function voice(gain) {
    if (voices >= MAXV) return null;
    voices++;
    return gain;
  }

  function tone(opt) {
    if (!ready() || !A.enabled) return;
    var g = ctx.createGain();
    if (!voice(g)) return;
    var t0 = ctx.currentTime + (opt.delay || 0);
    var dur = opt.dur || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opt.gain || 0.3, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var o = ctx.createOscillator();
    o.type = opt.type || 'square';
    o.frequency.setValueAtTime(opt.f0 || 440, t0);
    if (opt.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t0 + dur);
    var node = o;
    if (opt.filter) {
      var f = ctx.createBiquadFilter();
      f.type = opt.filter; f.frequency.value = opt.fc || 1200;
      o.connect(f); node = f;
    }
    node.connect(g);
    var out = g;
    if (opt.pan) {
      var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { p.pan.value = NB.M.clamp(opt.pan, -1, 1); g.connect(p); out = p; }
    }
    out.connect(opt.bus || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
    o.onended = function () { voices--; };
  }

  function noise(opt) {
    if (!ready() || !A.enabled) return;
    var g = ctx.createGain();
    if (!voice(g)) return;
    var t0 = ctx.currentTime + (opt.delay || 0);
    var dur = opt.dur || 0.3;
    g.gain.setValueAtTime(opt.gain || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = opt.filter || 'lowpass';
    f.frequency.setValueAtTime(opt.fc || 900, t0);
    if (opt.fc1) f.frequency.exponentialRampToValueAtTime(opt.fc1, t0 + dur);
    f.Q.value = opt.q || 0.8;
    s.connect(f); f.connect(g);
    var out = g;
    if (opt.pan && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner(); p.pan.value = NB.M.clamp(opt.pan, -1, 1); g.connect(p); out = p;
    }
    out.connect(opt.bus || sfxBus);
    s.start(t0); s.stop(t0 + dur + 0.05);
    s.onended = function () { voices--; };
  }

  // ---------- moteur & dérive ----------
  function startEngine() {
    if (engineNodes || !ready()) return;
    var g = ctx.createGain(); g.gain.value = 0;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    var o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 70;
    var o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 71.5;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus);
    o1.start(); o2.start();
    engineNodes = { g: g, f: f, o1: o1, o2: o2 };
  }

  A.engine = function (kart, dt) {
    if (!engineNodes || !ready()) return;
    var on = kart && kart.alive && NB.game.phase === 'playing';
    var rpm = kart ? kart.engineRpm : 0;
    var target = on ? 0.05 + rpm * 0.1 + (kart.throttle || 0) * 0.05 : 0;
    engineNodes.g.gain.value = NB.M.damp(engineNodes.g.gain.value, target, 8, dt);
    var fq = 55 + rpm * 160 + (kart && kart.boostT > 0 ? 40 : 0);
    engineNodes.o1.frequency.value = NB.M.damp(engineNodes.o1.frequency.value, fq, 10, dt);
    engineNodes.o2.frequency.value = engineNodes.o1.frequency.value * 1.01 + 2;
    engineNodes.f.frequency.value = 500 + rpm * 2200;
  };

  function startSkid() {
    if (skidNode || !ready()) return;
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 1.4;
    var g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start();
    skidNode = { g: g, f: f };
  }

  A.skid = function (intensity) {
    if (!skidNode || !ready()) return;
    skidNode.g.gain.value = NB.M.clamp01(intensity) * 0.16;
  };

  // ---------- sons ponctuels ----------
  function sfx(kind, gain, pan) {
    gain = gain == null ? 0.5 : gain;
    pan = pan || 0;
    if (kind === 'shot') { tone({ type: 'sawtooth', f0: 620, f1: 90, dur: 0.28, gain: gain * 0.5, pan: pan }); noise({ fc: 2400, fc1: 300, dur: 0.22, gain: gain * 0.35, pan: pan }); }
    else if (kind === 'homing') { tone({ type: 'sine', f0: 300, f1: 1400, dur: 0.4, gain: gain * 0.3, pan: pan }); }
    else if (kind === 'boom') { noise({ fc: 1400, fc1: 120, dur: 0.6, gain: gain * 0.8, pan: pan }); tone({ type: 'sine', f0: 150, f1: 38, dur: 0.5, gain: gain * 0.8, pan: pan }); }
    else if (kind === 'pickup') { tone({ type: 'triangle', f0: 660, dur: 0.09, gain: gain * 0.35, pan: pan }); tone({ type: 'triangle', f0: 880, dur: 0.1, gain: gain * 0.35, pan: pan, delay: 0.08 }); tone({ type: 'triangle', f0: 1320, dur: 0.14, gain: gain * 0.3, pan: pan, delay: 0.16 }); }
    else if (kind === 'shield') { tone({ type: 'sine', f0: 220, f1: 880, dur: 0.4, gain: gain * 0.3, pan: pan }); }
    else if (kind === 'boost') { noise({ filter: 'bandpass', fc: 400, fc1: 3200, dur: 0.5, gain: gain * 0.4, pan: pan, q: 1.2 }); }
    else if (kind === 'kill') { noise({ fc: 900, fc1: 100, dur: 0.5, gain: gain * 0.6, pan: pan }); tone({ type: 'square', f0: 220, f1: 60, dur: 0.4, gain: gain * 0.3, pan: pan }); }
    else if (kind === 'respawn') { tone({ type: 'sine', f0: 200, f1: 900, dur: 0.35, gain: gain * 0.3, pan: pan }); }
    else if (kind === 'count') { tone({ type: 'square', f0: 440, dur: 0.14, gain: gain * 0.4 }); }
    else if (kind === 'go') { tone({ type: 'square', f0: 880, dur: 0.3, gain: gain * 0.45 }); }
    else if (kind === 'hit') { tone({ type: 'square', f0: 180, f1: 90, dur: 0.12, gain: gain * 0.35, pan: pan }); }
    else if (kind === 'matchEnd') { fanfare(); }
    else if (kind === 'click') tone({ type: 'square', f0: 520, dur: 0.06, gain: 0.25 });
    else if (kind === 'back') tone({ type: 'square', f0: 300, f1: 180, dur: 0.1, gain: 0.25 });
    else if (kind === 'hover') tone({ type: 'sine', f0: 900, dur: 0.03, gain: 0.1 });
    else if (kind === 'error') tone({ type: 'sawtooth', f0: 140, dur: 0.18, gain: 0.3 });
    else if (kind === 'select') { tone({ type: 'square', f0: 660, dur: 0.07, gain: 0.3 }); tone({ type: 'square', f0: 990, dur: 0.1, gain: 0.3, delay: 0.07 }); }
  }

  function fanfare() {
    var notes = [523, 659, 784, 1046];
    for (var i = 0; i < notes.length; i++) {
      tone({ type: 'triangle', f0: notes[i], dur: 0.28, gain: 0.35, delay: i * 0.13 });
    }
  }

  A.ui = function (kind) { sfx(kind, 1, 0); };

  A.nearby = function (pos, kind, gain) {
    var g = NB.game;
    if (!g || !g.player) { sfx(kind, gain, 0); return; }
    var d = NB.M.dist(pos, g.player.pos);
    if (d > 60) return;
    var v = (1 - d / 60);
    var f = [-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw)];
    var right = [Math.cos(g.player.yaw), 0, -Math.sin(g.player.yaw)];
    var to = NB.M.sub(pos, g.player.pos);
    var pan = NB.M.dot(to, right) / (NB.M.len(to) || 1);
    sfx(kind, (gain == null ? 0.5 : gain) * v * v, pan);
  };

  A.onEvent = function (e) {
    if (e.t === 'shot') {
      if (e.kartId === 0) sfx(e.weapon === 'homing' ? 'homing' : 'shot', 0.6, 0);
      else A.nearby(e.pos, e.weapon === 'homing' ? 'homing' : 'shot', 0.5);
    } else if (e.t === 'boom') A.nearby(e.pos, 'boom', 0.9);
    else if (e.t === 'kill') { if (e.victimId === 0 || e.killerId === 0) sfx('kill', 0.7, 0); }
    else if (e.t === 'hit') A.nearby(NB.game.karts[e.kartId].pos, 'hit', 0.5);
    else if (e.t === 'pickup') { if (e.kartId === 0) sfx(e.kind === 'shield' ? 'shield' : e.kind === 'boost' ? 'boost' : 'pickup', 0.6, 0); }
    else if (e.t === 'respawn') { if (e.kartId === 0) sfx('respawn', 0.5, 0); }
    else if (e.t === 'count') sfx('count', 0.6, 0);
    else if (e.t === 'go') sfx('go', 0.7, 0);
    else if (e.t === 'matchEnd') sfx('matchEnd', 0.8, 0);
  };

  // ---------- musique procédurale ----------
  var SCALE = [0, 3, 5, 7, 10];
  var PATTERNS = {
    menu: { bpm: 96, root: 220, bass: [0, 0, 3, 3, 5, 5, 3, 2], arp: [0, 2, 4, 2, 0, 2, 4, 3] },
    match: { bpm: 132, root: 196, bass: [0, 0, 0, 5, 3, 3, 5, 7], arp: [4, 2, 0, 2, 4, 4, 2, 0] },
    end: { bpm: 110, root: 262, bass: [0, 4, 5, 3, 0, 4, 5, 7], arp: [0, 2, 4, 7, 4, 2, 0, 2] }
  };

  A.music = function (track) {
    musicTrack = PATTERNS[track] ? track : null;
    musicStep = 0;
    if (musicTrack && A.musicOn) scheduleMusic(); else stopMusic();
  };

  function scheduleMusic() {
    if (!ready() || !A.musicOn || !musicTrack) return;
    if (musicTimer) return;
    musicNext = ctx.currentTime + 0.1;
    musicTimer = setInterval(tickMusic, 40);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function tickMusic() {
    if (!ready() || !musicTrack) { stopMusic(); return; }
    var p = PATTERNS[musicTrack];
    var spb = 60 / p.bpm / 2;
    while (musicNext < ctx.currentTime + 0.15) {
      var step = musicStep % 8;
      var bar = Math.floor(musicStep / 8) % 4;
      playNote(p, step, bar, musicNext, spb);
      musicNext += spb;
      musicStep++;
    }
  }

  function playNote(p, step, bar, t, spb) {
    var semi = SCALE[p.bass[step] % SCALE.length] + (bar === 3 ? 12 : 0);
    var f = p.root * Math.pow(2, semi / 12);
    noteAt(f, t, spb * 0.9, 'triangle', 0.5);
    if (step % 2 === 0) noteAt(f / 2, t, spb * 1.6, 'sine', 0.6);
    var a = SCALE[p.arp[step] % SCALE.length] + 12;
    noteAt(p.root * Math.pow(2, a / 12), t + spb * 0.5, spb * 0.4, 'square', 0.16);
    if (step % 4 === 0) kickAt(t);
    if (step % 4 === 2) hatAt(t);
  }

  function noteAt(freq, t, dur, type, gain) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function kickAt(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + 0.2);
  }

  function hatAt(t) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t); s.stop(t + 0.1);
  }

  A.stopAll = function () {
    stopMusic();
    if (engineNodes) { try { engineNodes.o1.stop(); engineNodes.o2.stop(); } catch (e) { /* déjà stoppé */ } engineNodes = null; }
    if (skidNode) { try { skidNode.g.gain.value = 0; } catch (e) { /* ignore */ } }
  };

  NB.audio = A;
})(window.NB = window.NB || {});
