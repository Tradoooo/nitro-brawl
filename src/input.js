// NITRO BRAWL — entrées joueur : clavier (QWERTY/AZERTY), souris, tactile, manette
(function (NB) {
  'use strict';
  var I = {};
  var down = {}, pressed = {};
  var mouse = { down: false, rdown: false };
  var touchRef = null;
  var lastInput = { throttle: 0, brake: 0, steer: 0, drift: false, fire: false, use: false };

  I.init = function () {
    if (typeof window === 'undefined' || I.bound) return;
    I.bound = true;
    window.addEventListener('keydown', function (e) {
      if (e.repeat) { e.preventDefault(); return; }
      down[e.code] = true; pressed[e.code] = true;
      if (BLOCKING[e.code]) e.preventDefault();
      NB.audio && NB.audio.resume && NB.audio.resume();
    });
    window.addEventListener('keyup', function (e) { down[e.code] = false; });
    window.addEventListener('blur', function () { down = {}; mouse.down = false; });
    var cv = document.getElementById('gl');
    if (cv) {
      cv.addEventListener('mousedown', function (e) {
        if (e.button === 0) mouse.down = true;
        if (e.button === 2) mouse.rdown = true;
        NB.audio && NB.audio.resume && NB.audio.resume();
      });
      window.addEventListener('mouseup', function (e) {
        if (e.button === 0) mouse.down = false;
        if (e.button === 2) mouse.rdown = false;
      });
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    window.addEventListener('gamepadconnected', function () { I.pad = true; });
  };

  var BLOCKING = {
    Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Tab: 1, KeyR: 1
  };

  I.pressed = function (code) { return !!pressed[code]; };
  I.down = function (code) { return !!down[code]; };
  I.endFrame = function () { pressed = {}; };

  function pad() {
    if (!navigator.getGamepads) return null;
    var pads = navigator.getGamepads();
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return pads[i];
    return null;
  }

  function fromKeyboard() {
    var up = down.KeyW || down.ArrowUp;
    var dn = down.KeyS || down.ArrowDown;
    var lf = down.KeyA || down.ArrowLeft;
    var rt = down.KeyD || down.ArrowRight;
    var st = (rt ? 1 : 0) - (lf ? 1 : 0);
    return {
      throttle: up ? 1 : 0, brake: dn ? 1 : 0, steer: st,
      drift: !!(down.ShiftLeft || down.KeyK),
      fire: !!(down.Space || mouse.down || down.KeyJ),
      use: !!(down.KeyE || mouse.rdown || down.KeyL)
    };
  }

  function fromTouch() {
    var t = touchRef || (NB.hud && NB.hud.touch);
    if (!t || !t.active) return null;
    var m = t.move || { x: 0, y: 0 };
    return {
      throttle: m.y < -0.25 ? Math.min(1, -m.y * 1.4) : 0,
      brake: m.y > 0.35 ? Math.min(1, m.y * 1.2) : 0,
      steer: NB.M.clamp(m.x * 1.5, -1, 1),
      drift: !!t.drift, fire: !!t.fire, use: !!t.use
    };
  }

  function fromPad() {
    var g = pad();
    if (!g) return null;
    var ax = g.axes && g.axes[0] ? g.axes[0] : 0;
    if (Math.abs(ax) < 0.15) ax = 0;
    var b = g.buttons || [];
    var on = function (i) { return b[i] && (b[i].pressed || b[i].value > 0.4); };
    var trig = b[7] ? b[7].value : 0, brk = b[6] ? b[6].value : 0;
    return {
      throttle: Math.max(trig, on(0) ? 1 : 0), brake: Math.max(brk, on(1) ? 1 : 0),
      steer: ax, drift: on(5) || on(4), fire: on(7) || on(2), use: on(3) || on(6)
    };
  }

  // Fusionne les sources en priorisant celle qui bouge vraiment.
  I.read = function () {
    var k = fromKeyboard(), t = fromTouch(), g = fromPad();
    var out = { throttle: 0, brake: 0, steer: 0, drift: false, fire: false, use: false };
    var srcs = [k, t, g];
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      if (!s) continue;
      out.throttle = Math.max(out.throttle, s.throttle);
      out.brake = Math.max(out.brake, s.brake);
      if (Math.abs(s.steer) > Math.abs(out.steer)) out.steer = s.steer;
      out.drift = out.drift || s.drift;
      out.fire = out.fire || s.fire;
      out.use = out.use || s.use;
    }
    out.steer = NB.M.clamp(out.steer, -1, 1);
    out.throttle = NB.M.clamp01(out.throttle);
    out.brake = NB.M.clamp01(out.brake);
    lastInput = out;
    return out;
  };

  I.last = function () { return lastInput; };
  I.setTouchRef = function (t) { touchRef = t; };
  NB.input = I;
})(window.NB = window.NB || {});
