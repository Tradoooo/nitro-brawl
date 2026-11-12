// NITRO BRAWL — arène : géométrie GPU, collision AABB, raycast, minimap, navigation
(function (NB) {
  'use strict';
  var M = NB.M;
  var arena = {};

  arena.build = function (mapDef) {
    var L = mapDef.build();
    var th = mapDef.theme;
    var a = {
      map: mapDef, layout: L, solids: [], ramps: [], platforms: [],
      spawns: L.spawns, pads: L.pads, meshes: [], pathPoints: []
    };
    a.bounds = {
      minX: -L.floor.w / 2 + 2.2, maxX: L.floor.w / 2 - 2.2,
      minZ: -L.floor.d / 2 + 2.2, maxZ: L.floor.d / 2 - 2.2
    };
    collectSolids(a, L);
    buildGeometry(a, L, th);
    a.pathPoints = buildPathPoints(a);
    a.draw = function () { drawAll(a); };
    a.drawMinimap = function (ctx, x, y, size) { minimap(a, ctx, x, y, size); };
    a.groundHeight = function (x, z) { return groundHeight(a, x, z); };
    a.resolve = function (pos, r) { return resolve(a, pos, r, null); };
    a.resolveFull = function (pos, vel, r) { return resolve(a, pos, r, vel); };
    a.raycast = function (o, d, maxD) { return raycast(a, o, d, maxD); };
    a.lineOfSight = function (p, q) {
      var d = M.sub(q, p), len = M.len(d);
      if (len < 0.001) return true;
      return !raycast(a, p, M.scale(d, 1 / len), len - 0.2).hit;
    };
    a.randomPoint = function () { return randomPoint(a); };
    a.nearestPad = function (pos) { return nearestPad(a, pos); };
    a.outOfBounds = function (pos) {
      var b = a.bounds;
      return pos[0] < b.minX - 1 || pos[0] > b.maxX + 1 || pos[2] < b.minZ - 1 || pos[2] > b.maxZ + 1;
    };
    return a;
  };

  function boxSolid(x, z, w, d, y0, y1) {
    return { min: [x - w / 2, y0, z - d / 2], max: [x + w / 2, y1, z + d / 2] };
  }

  function collectSolids(a, L) {
    var i;
    for (i = 0; i < L.walls.length; i++) {
      var w = L.walls[i];
      a.solids.push(boxSolid(w.x, w.z, w.w, w.d, 0, w.h));
    }
    for (i = 0; i < L.obstacles.length; i++) {
      var o = L.obstacles[i];
      a.solids.push(boxSolid(o.x, o.z, o.w, o.d, 0, o.h));
    }
    for (i = 0; i < L.platforms.length; i++) {
      var p = L.platforms[i];
      a.platforms.push({ x: p.x, z: p.z, y: p.y, w: p.w, d: p.d });
      a.solids.push(boxSolid(p.x, p.z, p.w, p.d, 0, p.y));
    }
    for (i = 0; i < L.ramps.length; i++) {
      var r = L.ramps[i];
      var alongZ = (r.dir === '-z' || r.dir === '+z');
      var fx = alongZ ? r.w : r.d, fz = alongZ ? r.d : r.w;
      a.ramps.push({
        x: r.x, z: r.z, dir: r.dir, h: r.h, w: r.w, d: r.d,
        minX: r.x - fx / 2, maxX: r.x + fx / 2, minZ: r.z - fz / 2, maxZ: r.z + fz / 2
      });
    }
  }

  function groundHeight(a, x, z) {
    var h = 0, i;
    for (i = 0; i < a.platforms.length; i++) {
      var p = a.platforms[i];
      if (x > p.x - p.w / 2 && x < p.x + p.w / 2 && z > p.z - p.d / 2 && z < p.z + p.d / 2) {
        if (p.y > h) h = p.y;
      }
    }
    for (i = 0; i < a.ramps.length; i++) {
      var r = a.ramps[i];
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      var v = rampProgress(r, x, z);
      var y = r.h * v;
      if (y > h) h = y;
    }
    return h;
  }

  function rampProgress(r, x, z) {
    if (r.dir === '-z') return (r.maxZ - z) / r.d;
    if (r.dir === '+z') return (z - r.minZ) / r.d;
    if (r.dir === '-x') return (r.maxX - x) / r.d;
    return (x - r.minX) / r.d;
  }

  // ---------- géométrie ----------
  function buildGeometry(a, L, th) {
    var b = NB.mesh.builder();
    buildFloor(b, L, th);
    addMesh(a, b.build());
    var b2 = NB.mesh.builder();
    buildStructures(b2, L, th);
    addMesh(a, b2.build());
    var b3 = NB.mesh.builder();
    buildDecor(b3, L, th);
    if (b3.count()) addMesh(a, b3.build());
    var pm = buildProps(L, th);
    if (pm) a.meshes.push({ mesh: pm, mat: null });
  }

  function addMesh(a, f32) {
    if (!NB.gl || !NB.gl.gl || !NB.gl.gl()) { a.meshes.push({ mesh: null, mat: null }); return; }
    a.meshes.push({ mesh: NB.gl.createMesh(f32), mat: null });
  }

  function buildFloor(b, L, th) {
    var cell = 4, w = L.floor.w, d = L.floor.d;
    var nx = Math.round(w / cell), nz = Math.round(d / cell);
    for (var i = 0; i < nx; i++) {
      for (var j = 0; j < nz; j++) {
        var cx = -w / 2 + cell * (i + 0.5), cz = -d / 2 + cell * (j + 0.5);
        var c = ((i + j) % 2 === 0) ? (th.ground || [0.5, 0.5, 0.5]) : (th.groundAlt || th.ground);
        b.plane(cx, 0, cz, cell, cell, c);
      }
    }
    if (th.neonGrid) {
      var gg = over(th.gridColor || th.accent, 1.35);
      for (var gx = -w / 2 + 8; gx < w / 2 - 4; gx += 8) b.box(gx, 0.045, 0, 0.35, 0.09, d - 6, gg);
      for (var gz = -d / 2 + 8; gz < d / 2 - 4; gz += 8) b.box(0, 0.045, gz, w - 6, 0.09, 0.35, gg);
    }
    horizonGrid(b, th, w, d);
    // liseré néon autour de la piste
    var g = th.gridColor || th.accent;
    b.box(0, 0.06, -d / 2 + 1.2, w - 4, 0.12, 0.35, over(g, glowK(th)));
    b.box(0, 0.06, d / 2 - 1.2, w - 4, 0.12, 0.35, over(g, 1.5));
    b.box(-w / 2 + 1.2, 0.06, 0, 0.35, 0.12, d - 4, over(g, 1.5));
    b.box(w / 2 - 1.2, 0.06, 0, 0.35, 0.12, d - 4, over(g, 1.5));
  }

  // plan infini quadrillé sous l'arène : horizon synthwave, cache le vide
  function horizonGrid(b, th, w, d) {
    var dark = th.void || [th.ground[0] * 0.35, th.ground[1] * 0.35, th.ground[2] * 0.4];
    b.plane(0, -0.7, 0, 700, 700, dark);
    var gg = over(th.gridColor || th.accent, 0.9);
    for (var i = -8; i <= 8; i++) {
      if (Math.abs(i) < 1) continue;
      var o = i * 40;
      b.box(o, -0.62, 0, 0.5, 0.08, 640, gg);
      b.box(0, -0.62, o, 640, 0.08, 0.5, gg);
    }
  }

  function buildStructures(b, L, th) {
    var i;
    for (i = 0; i < L.walls.length; i++) {
      var w = L.walls[i];
      b.box(w.x, w.h / 2, w.z, w.w, w.h, w.d, w.color || th.wall);
      b.box(w.x, w.h + 0.08, w.z, w.w * 0.98, 0.16, w.d * 0.98, over(th.accent, glowK(th)));
    }
    for (i = 0; i < L.obstacles.length; i++) {
      var o = L.obstacles[i];
      if (o.kind === 'barrel') b.addMesh(NB.mesh.barrel(o.w / 2, o.h, o.color), [o.x, 0, o.z]);
      else if (o.kind === 'pillar') {
        b.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, o.color);
        b.box(o.x, o.h + 0.1, o.z, o.w * 1.15, 0.2, o.d * 1.15, over(th.accent, glowK(th)));
      } else if (o.kind === 'crate') b.addMesh(NB.mesh.crate(Math.min(o.w, o.h), o.color), [o.x, 0, o.z]);
      else b.box(o.x, o.h / 2, o.z, o.w, o.h, o.d, o.color);
    }
    for (i = 0; i < L.ramps.length; i++) {
      var r = L.ramps[i];
      b.ramp(r.x, 0, r.z, r.w, r.h, r.d, r.color, r.dir);
      b.box(r.x, 0.05, r.z, r.w * 0.9, 0.1, r.d * 0.9, over(th.accent, 1.6));
    }
    for (i = 0; i < L.platforms.length; i++) {
      var p = L.platforms[i];
      b.box(p.x, p.y - 0.25, p.z, p.w, 0.5, p.d, p.color);
      if (p.pillar) {
        b.box(p.x, (p.y - 0.5) / 2, p.z, p.w * 0.78, p.y - 0.5, p.d * 0.78, shade(p.color, 0.7));
        b.box(p.x, p.y * 0.5, p.z, p.w * 0.82, 0.14, p.d * 0.82, over(th.accent, glowK(th)));
      }
      b.box(p.x, p.y + 0.06, p.z, p.w * 0.96, 0.12, p.d * 0.96, over(th.accent, 1.6));
    }
  }

  function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

  function over(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

  function glowK(th) { return th.neonGrid ? 1.7 : 1.0; }

  function buildProps(L, th) {
    if (!NB.models || !NB.models.ready) return null;
    var P = NB.models.props, items = [], i;
    var w = L.floor.w, d = L.floor.d;
    var bw = P.barrierRed;
    if (bw) {
      var ix = w / 2 - 3.1, iz = d / 2 - 3.1;
      for (i = -ix + 1; i < ix - 1; i += 2.2) {
        items.push({ prop: bw, pos: [i, 0, -iz], yaw: 0, scale: 1 });
        items.push({ prop: bw, pos: [i, 0, iz], yaw: Math.PI, scale: 1 });
      }
      for (i = -iz + 1; i < iz - 1; i += 2.2) {
        items.push({ prop: bw, pos: [-ix, 0, i], yaw: Math.PI / 2, scale: 1 });
        items.push({ prop: bw, pos: [ix, 0, i], yaw: -Math.PI / 2, scale: 1 });
      }
    }
    if (P.flagCheckers) {
      var f = P.flagCheckers;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (sg) {
        items.push({ prop: f, pos: [sg[0] * (w / 2 - 5), 0, sg[1] * (d / 2 - 5)], yaw: sg[0] > 0 ? -0.6 : 0.6, scale: 2 });
      });
    }
    if (P.lightPostModern) {
      var l = P.lightPostModern;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (sg) {
        items.push({ prop: l, pos: [sg[0] * (w / 2 - 3.5), 0, sg[1] * (d / 2 - 3.5)], yaw: 0, scale: 1.6 });
      });
    }
    if (P.grandStandRound) {
      var g = P.grandStandRound;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (sg) {
        items.push({ prop: g, pos: [sg[0] * (w / 2 + 7), 0, sg[1] * (d / 2 + 7)], yaw: sg[0] > 0 ? -2.3 : 2.3, scale: 3.2 });
      });
    }
    if (P.treeSmall) {
      var t = P.treeSmall;
      for (i = 0; i < 14; i++) {
        var a = i / 14 * Math.PI * 2;
        var rad = Math.max(w, d) * 0.62 + 6;
        items.push({ prop: t, pos: [Math.cos(a) * rad, 0, Math.sin(a) * rad], yaw: i * 1.7, scale: 1.6 });
      }
    }
    if (P.pylon) {
      var py = P.pylon;
      for (i = 0; i < L.ramps.length; i++) {
        var r = L.ramps[i];
        items.push({ prop: py, pos: [r.x + 3.6, 0, r.z + 3.6], yaw: 0, scale: 1 });
      }
    }
    return NB.models.bakeProps(items);
  }

  function buildDecor(b, L, th) {
    for (var i = 0; i < L.decorations.length; i++) {
      var d = L.decorations[i];
      if (d.kind === 'tire') {
        b.cylinder(d.x, 0, d.z, 0.9, 0.9, 0.5, [0.12, 0.12, 0.14], 10);
        b.cylinder(d.x, 0.5, d.z, 0.8, 0.8, 0.5, [0.15, 0.15, 0.17], 10);
        b.cylinder(d.x, 1, d.z, 0.7, 0.7, 0.5, [0.12, 0.12, 0.14], 10);
      } else if (d.kind === 'flag') {
        b.cylinder(d.x, 0, d.z, 0.08, 0.08, 4, [0.8, 0.8, 0.85], 6);
        b.box(d.x + 0.7, 3.5, d.z, 1.4, 0.9, 0.06, th.accent);
      } else if (d.kind === 'neon') {
        b.box(d.x, 2.2, d.z, 0.3, 4.4, 0.3, th.accent);
        b.box(d.x, 4.5, d.z, 0.5, 0.2, 0.5, [1, 1, 1]);
      } else if (d.kind === 'arch') {
        b.box(d.x - 4, 2.5, d.z, 0.8, 5, 0.8, th.wall);
        b.box(d.x + 4, 2.5, d.z, 0.8, 5, 0.8, th.wall);
        b.box(d.x, 5.2, d.z, 9, 0.7, 0.9, th.accent);
      } else if (d.kind === 'stack') {
        b.addMesh(NB.mesh.crate(1.6, [0.6, 0.45, 0.3]), [d.x, 0, d.z]);
        b.addMesh(NB.mesh.crate(1.2, [0.7, 0.5, 0.32]), [d.x + 0.1, 1.6, d.z]);
      }
    }
  }

  function drawAll(a) {
    for (var i = 0; i < a.meshes.length; i++) {
      if (a.meshes[i].mesh) NB.gl.draw(a.meshes[i].mesh, a.meshes[i].mat);
    }
  }

  // ---------- collision ----------
  function resolve(a, pos, r, vel) {
    var hit = false, nx = 0, nz = 0;
    for (var i = 0; i < a.solids.length; i++) {
      var s = a.solids[i];
      if (pos[1] + 1.1 < s.min[1] || pos[1] - 0.3 > s.max[1]) continue;
      var cx = M.clamp(pos[0], s.min[0], s.max[0]);
      var cz = M.clamp(pos[2], s.min[2], s.max[2]);
      var dx = pos[0] - cx, dz = pos[2] - cz;
      var d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      var px, pz;
      if (d2 > 1e-8) {
        var d = Math.sqrt(d2);
        px = dx / d; pz = dz / d;
        pos[0] = cx + px * r; pos[2] = cz + pz * r;
      } else {
        var pen = [
          pos[0] - (s.min[0] - r), (s.max[0] + r) - pos[0],
          pos[2] - (s.min[2] - r), (s.max[2] + r) - pos[2]
        ];
        var k = 0;
        for (var j = 1; j < 4; j++) if (pen[j] < pen[k]) k = j;
        px = k === 0 ? -1 : (k === 1 ? 1 : 0);
        pz = k === 2 ? -1 : (k === 3 ? 1 : 0);
        if (k === 0) pos[0] = s.min[0] - r;
        if (k === 1) pos[0] = s.max[0] + r;
        if (k === 2) pos[2] = s.min[2] - r;
        if (k === 3) pos[2] = s.max[2] + r;
      }
      hit = true; nx = px; nz = pz;
      if (vel) {
        var vn = vel[0] * px + vel[2] * pz;
        if (vn < 0) { vel[0] -= px * vn * 1.35; vel[2] -= pz * vn * 1.35; }
      }
    }
    return { hit: hit, nx: nx, nz: nz };
  }

  function raycast(a, o, dir, maxD) {
    var best = { hit: false, dist: maxD, point: null, normal: [0, 1, 0], solid: null };
    for (var i = 0; i < a.solids.length; i++) {
      var s = a.solids[i];
      var t = slab(o, dir, s);
      if (t && t.t < best.dist) {
        best = { hit: true, dist: t.t, point: M.add(o, M.scale(dir, t.t)), normal: t.n, solid: s };
      }
    }
    return best;
  }

  function slab(o, d, s) {
    var tmin = 0, tmax = 1e9, n = [0, 0, 0], i;
    for (i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < s.min[i] || o[i] > s.max[i]) return null;
        continue;
      }
      var inv = 1 / d[i];
      var t1 = (s.min[i] - o[i]) * inv, t2 = (s.max[i] - o[i]) * inv;
      var sign = -1;
      if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
      if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[i] = sign; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    return { t: tmin, n: n };
  }

  function randomPoint(a) {
    var b = a.bounds;
    for (var i = 0; i < 40; i++) {
      var x = NB.M.randRange(b.minX + 2, b.maxX - 2);
      var z = NB.M.randRange(b.minZ + 2, b.maxZ - 2);
      var p = [x, 0.5, z];
      if (!resolve(a, p, 1.2, null).hit) return [x, groundHeight(a, x, z), z];
    }
    return [0, 0, 0];
  }

  function nearestPad(a, pos) {
    var best = null, bd = 1e9;
    for (var i = 0; i < a.pads.length; i++) {
      var d = M.dist2([pos[0], 0, pos[2]], [a.pads[i][0], 0, a.pads[i][1]]);
      if (d < bd) { bd = d; best = a.pads[i]; }
    }
    return best;
  }

  function buildPathPoints(a) {
    var pts = [], b = a.bounds, step = 5;
    for (var x = b.minX + 2; x <= b.maxX - 2; x += step) {
      for (var z = b.minZ + 2; z <= b.maxZ - 2; z += step) {
        var p = [x, 0.5, z];
        if (!resolve(a, p, 1.6, null).hit) pts.push([x, groundHeight(a, x, z) + 0.2, z]);
      }
    }
    return pts;
  }

  // ---------- minimap ----------
  function minimap(a, ctx, x, y, size) {
    var b = a.bounds;
    var w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    var sc = size / Math.max(w, d);
    var ox = x + size / 2, oy = y + size / 2;
    function px(v) { return ox + v * sc; }
    function pz(v) { return oy + v * sc; }
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,20,0.72)';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = 'rgba(120,140,190,0.25)';
    ctx.fillRect(px(b.minX), pz(b.minZ), w * sc, d * sc);
    ctx.fillStyle = 'rgba(150,170,220,0.5)';
    var i;
    for (i = 0; i < a.solids.length; i++) {
      var s = a.solids[i];
      ctx.fillRect(px(s.min[0]), pz(s.min[2]), (s.max[0] - s.min[0]) * sc, (s.max[2] - s.min[2]) * sc);
    }
    ctx.fillStyle = 'rgba(255,220,90,0.8)';
    for (i = 0; i < a.pads.length; i++) {
      ctx.beginPath();
      ctx.arc(px(a.pads[i][0]), pz(a.pads[i][1]), 1.6, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
    return { px: px, pz: pz, sc: sc };
  }

  NB.arena = arena;
})(window.NB = window.NB || {});
