// NITRO BRAWL — effets : pool de particules, traces, ondes, screen shake, textes 3D
(function (NB) {
  'use strict';
  var M = NB.M;
  var F = {};
  var MAX = 900;
  var px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
  var vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX);
  var life = new Float32Array(MAX), maxLife = new Float32Array(MAX);
  var size = new Float32Array(MAX), grow = new Float32Array(MAX), grav = new Float32Array(MAX);
  var cr = new Float32Array(MAX), cg = new Float32Array(MAX), cb = new Float32Array(MAX);
  var add = new Uint8Array(MAX), alive = new Uint8Array(MAX);
  var cursor = 0;
  var skids = [], rings = [], beams = [], texts = [];
  F.count = 0;
  F.speedLevel = 0;
  F.shakeLevel = 0;

  F.init = function () { F.reset(); };

  F.reset = function () {
    alive.fill(0);
    skids.length = 0; rings.length = 0; beams.length = 0; texts.length = 0;
    F.count = 0; F.shakeLevel = 0; F.speedLevel = 0;
  };

  function spawn(x, y, z, dvx, dvy, dvz, s, g, gr, col, lf, additive) {
    var i = cursor;
    cursor = (cursor + 1) % MAX;
    if (!alive[i]) F.count++;
    alive[i] = 1;
    px[i] = x; py[i] = y; pz[i] = z;
    vx[i] = dvx; vy[i] = dvy; vz[i] = dvz;
    size[i] = s; grow[i] = g; grav[i] = gr;
    cr[i] = col[0]; cg[i] = col[1]; cb[i] = col[2];
    life[i] = lf; maxLife[i] = lf;
    add[i] = additive ? 1 : 0;
  }

  F.smoke = function (pos, vel, s, col, lf) {
    spawn(pos[0], pos[1] + 0.2, pos[2], vel[0] * 0.4, vel[1] * 0.4 + 0.6, vel[2] * 0.4,
      s || 0.8, 1.6, -0.6, col || [0.55, 0.55, 0.6], lf || 0.9, false);
  };
  F.spark = function (pos, vel, col, lf) {
    for (var i = 0; i < 3; i++) {
      spawn(pos[0], pos[1] + 0.3, pos[2],
        M.randRange(-4, 4) + vel[0], M.randRange(1, 6), M.randRange(-4, 4) + vel[2],
        0.16, -0.1, -9, col || [1, 0.8, 0.3], lf || 0.4, true);
    }
  };
  F.fire = function (pos, s, lf) {
    spawn(pos[0], pos[1], pos[2], M.randRange(-1, 1), M.randRange(1, 3), M.randRange(-1, 1),
      s || 0.7, 1.4, 1.5, [1, 0.55, 0.15], lf || 0.45, true);
  };
  F.debris = function (pos, col, n) {
    for (var i = 0; i < (n || 6); i++) {
      spawn(pos[0], pos[1] + 0.4, pos[2], M.randRange(-7, 7), M.randRange(3, 9), M.randRange(-7, 7),
        0.22, -0.05, -14, col || [0.3, 0.3, 0.34], M.randRange(0.5, 0.9), false);
    }
  };
  F.trail = function (pos, col, s) {
    spawn(pos[0], pos[1], pos[2], M.randRange(-0.5, 0.5), M.randRange(0, 0.6), M.randRange(-0.5, 0.5),
      s || 0.4, 0.9, 0.4, col || [1, 0.6, 0.2], 0.3, true);
  };
  F.skid = function (pos, yaw, width, alpha) {
    if (skids.length > 400) skids.shift();
    var f = [-Math.sin(yaw), -Math.cos(yaw)];
    var r = [Math.cos(yaw), -Math.sin(yaw)];
    skids.push({
      x: pos[0], z: pos[2], y: (pos[1] || 0) + 0.03, fx: f[0], fz: f[1], rx: r[0], rz: r[1],
      w: width || 0.4, a: alpha || 0.3, life: 6
    });
  };
  var shadows = [];
  F.shadow = function (x, z, r, alpha) {
    if (shadows.length < 64) shadows.push({ x: x, z: z, r: r, a: alpha });
  };

  function drawShadows() {
    if (!shadows.length) return;
    NB.gl.beginBatch();
    var g0 = F.ground;
    for (var i = 0; i < shadows.length; i++) {
      var s = shadows[i];
      var k = 1 - s.a * 1.6;
      if (k < 0.25) k = 0.25;
      var c = [g0[0] * k, g0[1] * k, g0[2] * k];
      var r = s.r;
      NB.gl.batchQuad(
        [s.x - r, s.y0 || 0.035, s.z - r], [s.x + r, s.y0 || 0.035, s.z - r],
        [s.x + r, s.y0 || 0.035, s.z + r], [s.x - r, s.y0 || 0.035, s.z + r], c);
    }
    NB.gl.flushBatch();
    shadows.length = 0;
  }
  F.ring = function (pos, radius, col, lf) {
    rings.push({ x: pos[0], y: (pos[1] || 0) + 0.1, z: pos[2], r: 0.4, max: radius, life: lf || 0.5, t: 0, c: col || [1, 0.7, 0.3] });
  };
  F.beam = function (a, b, col, lf) {
    beams.push({ a: a.slice(), b: b.slice(), c: col || [0.4, 0.9, 1], life: lf || 0.3, t: 0 });
  };
  F.text3d = function (pos, str, col, lf) {
    if (texts.length > 12) texts.shift();
    texts.push({ pos: pos.slice(), str: str, c: col || [1, 1, 1], life: lf || 1.2, t: 0 });
  };
  F.shake = function (amount) {
    F.shakeLevel = Math.min(1.2, F.shakeLevel + amount);
    if (NB.game) NB.game.shake = Math.min(1.2, (NB.game.shake || 0) + amount);
  };
  F.speedLines = function (i) { F.speedLevel = i; };
  F.hitFlash = function (col) { NB.util.eventBus.emit('hitflash', col || [1, 0.2, 0.2]); };

  F.drawScreenTexts = function (ctx) {
    if (!NB.gl.project) return;
    var out = [0, 0];
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (!NB.gl.project(out, [t.pos[0], t.pos[1] + t.t * 1.6, t.pos[2]])) continue;
      var a = M.clamp01(1 - t.t / t.life);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgb(' + (t.c[0] * 255 | 0) + ',' + (t.c[1] * 255 | 0) + ',' + (t.c[2] * 255 | 0) + ')';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 4;
      ctx.strokeText(t.str, out[0], out[1]);
      ctx.fillText(t.str, out[0], out[1]);
      ctx.restore();
    }
  };

  F.update = function (dt) {
    var i;
    F.count = 0;
    for (i = 0; i < MAX; i++) {
      if (!alive[i]) continue;
      life[i] -= dt;
      if (life[i] <= 0) { alive[i] = 0; continue; }
      F.count++;
      vy[i] += grav[i] * dt;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
      size[i] += grow[i] * dt;
    }
    for (i = skids.length - 1; i >= 0; i--) { skids[i].life -= dt; if (skids[i].life <= 0) skids.splice(i, 1); }
    for (i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      rings[i].r = M.lerp(0.4, rings[i].max, M.clamp01(rings[i].t / rings[i].life));
      if (rings[i].t >= rings[i].life) rings.splice(i, 1);
    }
    for (i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t >= beams[i].life) beams.splice(i, 1); }
    for (i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; if (texts[i].t >= texts[i].life) texts.splice(i, 1); }
    F.shakeLevel = Math.max(0, F.shakeLevel - dt * 2.2);
  };

  F.draw = function () {
    if (!NB.gl || !NB.gl.gl || !NB.gl.gl()) return;
    drawShadows();
    drawSkids();
    drawRings();
    drawBeams();
    NB.gl.beginSprites();
    for (var i = 0; i < MAX; i++) {
      if (!alive[i]) continue;
      var a = M.clamp01(life[i] / maxLife[i]);
      NB.gl.sprite(px[i], py[i], pz[i], Math.max(0.05, size[i]), [cr[i], cg[i], cb[i]], a * (add[i] ? 0.9 : 0.55), !!add[i]);
    }
    NB.gl.flushSprites();
  };

  F.ground = [0.8, 0.66, 0.42];

  function drawSkids() {
    NB.gl.beginBatch();
    var g0 = F.ground;
    for (var i = 0; i < skids.length; i++) {
      var s = skids[i];
      var a = M.clamp01(s.life / 6) * s.a * 3;
      a = M.clamp01(a);
      var k = 0.28 + 0.72 * (1 - a);
      var c = [g0[0] * k, g0[1] * k, g0[2] * k];
      var hw = s.w / 2;
      NB.gl.batchQuad(
        [s.x - s.fx * 1.1 - s.rx * hw, s.y, s.z - s.fz * 1.1 - s.rz * hw],
        [s.x - s.fx * 1.1 + s.rx * hw, s.y, s.z - s.fz * 1.1 + s.rz * hw],
        [s.x + s.fx * 1.1 + s.rx * hw, s.y, s.z + s.fz * 1.1 + s.rz * hw],
        [s.x + s.fx * 1.1 - s.rx * hw, s.y, s.z + s.fz * 1.1 - s.rz * hw], c);
    }
    NB.gl.flushBatch();
  }

  function drawRings() {
    NB.gl.beginBatch();
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i];
      var a = M.clamp01(1 - r.t / r.life);
      if (a < 0.06) continue;
      var seg = 10, w = 0.35 * a + 0.08;
      for (var s = 0; s < seg; s++) {
        var a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
        NB.gl.batchQuad(
          [r.x + Math.cos(a0) * r.r, r.y, r.z + Math.sin(a0) * r.r],
          [r.x + Math.cos(a0) * (r.r + w), r.y, r.z + Math.sin(a0) * (r.r + w)],
          [r.x + Math.cos(a1) * (r.r + w), r.y, r.z + Math.sin(a1) * (r.r + w)],
          [r.x + Math.cos(a1) * r.r, r.y, r.z + Math.sin(a1) * r.r],
          [r.c[0] * a, r.c[1] * a, r.c[2] * a]);
      }
    }
    NB.gl.flushBatch();
  }

  function drawBeams() {
    NB.gl.beginBatch();
    for (var i = 0; i < beams.length; i++) {
      var b = beams[i];
      var a = M.clamp01(1 - b.t / b.life);
      var d = M.sub(b.b, b.a);
      var len = M.len(d) || 1;
      var rx = -d[2] / len * 0.12, rz = d[0] / len * 0.12;
      NB.gl.batchQuad(
        [b.a[0] - rx, b.a[1], b.a[2] - rz], [b.a[0] + rx, b.a[1], b.a[2] + rz],
        [b.b[0] + rx, b.b[1], b.b[2] + rz], [b.b[0] - rx, b.b[1], b.b[2] - rz],
        [b.c[0] * a, b.c[1] * a, b.c[2] * a]);
    }
    NB.gl.flushBatch();
  }

  F.shieldBubble = function (pos, t) {
    var pulse = 1 + Math.sin(t * 9) * 0.06;
    NB.gl.sprite(pos[0], pos[1] + 0.7, pos[2], 2.6 * pulse, [0.3, 0.85, 1], 0.22, true);
    NB.gl.sprite(pos[0], pos[1] + 0.7, pos[2], 2.2 * pulse, [0.6, 0.95, 1], 0.1, false);
  };

  F.ramGlow = function (pos, yaw) {
    var f = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    NB.gl.sprite(pos[0] + f[0] * 1.1, pos[1] + 0.5, pos[2] + f[2] * 1.1, 1.4, [1, 0.4, 0.2], 0.5, true);
  };

  F.onEvent = function (e) {
    if (e.t === 'boom') {
      var i;
      for (i = 0; i < 10; i++) F.fire(e.pos, M.randRange(0.6, 1.4), M.randRange(0.3, 0.6));
      for (i = 0; i < 8; i++) F.smoke(e.pos, [M.randRange(-3, 3), 2, M.randRange(-3, 3)], M.randRange(0.8, 1.6), [0.4, 0.4, 0.45], 1.1);
      F.debris(e.pos, [0.35, 0.33, 0.36], 8);
      F.ring(e.pos, e.r * 1.6, e.color || [1, 0.7, 0.3], 0.45);
      F.shake(M.clamp01(e.r / 5) * 0.55);
      F.hitFlash([1, 0.6, 0.2]);
    } else if (e.t === 'kill') {
      var v = NB.game.karts[e.victimId];
      if (v) {
        F.debris(v.pos, v.color, 10);
        F.text3d([v.pos[0], v.pos[1] + 1.6, v.pos[2]], '💥', [1, 0.8, 0.3], 1);
      }
    } else if (e.t === 'hit') {
      var k = NB.game.karts[e.kartId];
      if (k) { F.spark(k.pos, [0, 2, 0], [0.4, 0.9, 1], 0.4); F.ring(k.pos, 2, [0.4, 0.9, 1], 0.3); }
    } else if (e.t === 'pickup') {
      var p = NB.game.karts[e.kartId];
      if (p) { F.ring(p.pos, 1.8, [1, 0.9, 0.4], 0.35); F.text3d([p.pos[0], p.pos[1] + 1.8, p.pos[2]], NB.pickups.ICONS[e.kind] || '+', [1, 1, 1], 0.9); }
    } else if (e.t === 'respawn') {
      F.beam([e.pos[0], 0, e.pos[2]], [e.pos[0], 8, e.pos[2]], [0.5, 0.9, 1], 0.5);
      F.ring(e.pos, 2.4, [0.5, 0.9, 1], 0.5);
    } else if (e.t === 'go') {
      F.hitFlash([0.6, 1, 0.6]);
    }
  };

  NB.fx = F;
})(window.NB = window.NB || {});
