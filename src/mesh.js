// NITRO BRAWL — générateurs de géométrie low-poly (Float32Array interleaved pos3 normal3 color3)
(function (NB) {
  'use strict';
  var M = NB.M;
  var mesh = {};

  function builder() {
    var b = { n: 0, buf: [] };
    var arr = new Float32Array(1 << 18);   // 262144 floats ≈ 29k sommets
    function push(x, y, z, nx, ny, nz, c, k) {
      if (b.n + 9 > arr.length) { var na = new Float32Array(arr.length * 2); na.set(arr); arr = na; }
      var i = b.n;
      arr[i] = x; arr[i + 1] = y; arr[i + 2] = z;
      arr[i + 3] = nx; arr[i + 4] = ny; arr[i + 5] = nz;
      arr[i + 6] = c[0] * k; arr[i + 7] = c[1] * k; arr[i + 8] = c[2] * k;
      b.n += 9;
    }
    function rotM(rx, ry, rz) {
      var m = M.create(), t = M.create();
      if (rz) { M.fromRotationZ(t, rz); M.multiply(m, m, t); }
      if (rx) { M.fromRotationX(t, rx); M.multiply(m, m, t); }
      if (ry) { M.fromRotationY(t, ry); M.multiply(m, m, t); }
      return m;
    }
    function xform(p, m) { return M.xformPoint([0, 0, 0], m, p); }

    b.push = push;
    b.count = function () { return b.n / 9; };
    b.build = function () { var o = new Float32Array(b.n); o.set(arr.subarray(0, b.n)); return o; };

    b.quad = function (p0, p1, p2, p3, c, n, k) {
      n = n || M.norm(M.cross(M.sub(p1, p0), M.sub(p3, p0)));
      k = k == null ? 1 : k;
      push(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, k);
      push(p1[0], p1[1], p1[2], n[0], n[1], n[2], c, k);
      push(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, k);
      push(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, k);
      push(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, k);
      push(p3[0], p3[1], p3[2], n[0], n[1], n[2], c, k);
      return b;
    };

    b.tri = function (p0, p1, p2, c, n, k) {
      n = n || M.norm(M.cross(M.sub(p1, p0), M.sub(p2, p0)));
      k = k == null ? 1 : k;
      push(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, k);
      push(p1[0], p1[1], p1[2], n[0], n[1], n[2], c, k);
      push(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, k);
      return b;
    };

    b.box = function (cx, cy, cz, sx, sy, sz, c, opt) {
      opt = opt || {};
      var hx = sx / 2, hy = sy / 2, hz = sz / 2;
      var m = (opt.rx || opt.ry || opt.rz) ? rotM(opt.rx || 0, opt.ry || 0, opt.rz || 0) : null;
      var shade = opt.shade || [1, 0.92, 0.8, 0.72, 0.86, 0.68];
      var faces = [
        [[hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz], [hx, -hy, -hz], [1, 0, 0]],
        [[-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz], [-1, 0, 0]],
        [[-hx, hy, hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [0, 1, 0]],
        [[-hx, -hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [0, -1, 0]],
        [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 0, -1]],
        [[hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [0, 0, 1]]
      ];
      for (var f = 0; f < 6; f++) {
        var q = faces[f], pts = [], nn = q[4];
        for (var i = 0; i < 4; i++) {
          var p = [q[i][0] + cx, q[i][1] + cy, q[i][2] + cz];
          var n = nn;
          if (m) { p = xform(p, m); n = xform([0, 0, 0], m, nn); }
          pts.push(p);
        }
        b.quad(pts[0], pts[1], pts[2], pts[3], c, n2(nn, m), shade[f]);
      }
      return b;
    };

    function n2(n, m) { return m ? M.norm(xform([0, 0, 0], m, n)) : n; }

    b.plane = function (cx, cy, cz, w, d, c, ry) {
      var hw = w / 2, hd = d / 2;
      var pts = [[-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd]].map(function (p) {
        var x = p[0], z = p[2];
        if (ry) { var co = Math.cos(ry), si = Math.sin(ry); x = p[0] * co + p[2] * si; z = -p[0] * si + p[2] * co; }
        return [x + cx, cy, z + cz];
      });
      b.quad(pts[0], pts[1], pts[2], pts[3], c, [0, 1, 0], 1);
      return b;
    };

    b.sphere = function (cx, cy, cz, r, c, seg, rings) {
      seg = seg || 12; rings = rings || 8;
      for (var j = 0; j < rings; j++) {
        var t0 = j / rings * Math.PI, t1 = (j + 1) / rings * Math.PI;
        for (var i = 0; i < seg; i++) {
          var p0 = i / seg * Math.PI * 2, p1 = (i + 1) / seg * Math.PI * 2;
          var a = sph(cx, cy, cz, r, t0, p0), bb = sph(cx, cy, cz, r, t0, p1);
          var cc = sph(cx, cy, cz, r, t1, p1), dd = sph(cx, cy, cz, r, t1, p0);
          var k = 1 - j / rings * 0.25;
          b.quad(a, bb, cc, dd, c, null, k);
        }
      }
      return b;
    };

    function sph(cx, cy, cz, r, t, p) {
      return [cx + r * Math.sin(t) * Math.cos(p), cy + r * Math.cos(t), cz + r * Math.sin(t) * Math.sin(p)];
    }

    b.cylinder = function (cx, cy, cz, rb, rt, h, c, seg, capped) {
      seg = seg || 14;
      capped = capped !== false;
      for (var i = 0; i < seg; i++) {
        var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        var b0 = [cx + rb * Math.cos(a0), cy, cz + rb * Math.sin(a0)];
        var b1 = [cx + rb * Math.cos(a1), cy, cz + rb * Math.sin(a1)];
        var t0 = [cx + rt * Math.cos(a0), cy + h, cz + rt * Math.sin(a0)];
        var t1 = [cx + rt * Math.cos(a1), cy + h, cz + rt * Math.sin(a1)];
        var nm = M.norm([(Math.cos(a0) + Math.cos(a1)) / 2, 0.12, (Math.sin(a0) + Math.sin(a1)) / 2]);
        if (rt > 0.001) { b.quad(b0, b1, t1, t0, c, nm, 0.95); }
        else { b.tri(b0, b1, t0, c, nm, 0.95); }
        if (capped) {
          b.tri([cx, cy, cz], b0, b1, c, [0, -1, 0], 0.65);
          if (rt > 0.001) b.tri([cx, cy + h, cz], t1, t0, c, [0, 1, 0], 1);
        }
      }
      return b;
    };

    b.cone = function (cx, cy, cz, r, h, c, seg) { return b.cylinder(cx, cy, cz, r, 0.0001, h, c, seg || 14); };

    b.torus = function (cx, cy, cz, R, r, c, seg, tube) {
      seg = seg || 16; tube = tube || 8;
      for (var i = 0; i < seg; i++) {
        var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        for (var j = 0; j < tube; j++) {
          var t0 = j / tube * Math.PI * 2, t1 = (j + 1) / tube * Math.PI * 2;
          b.quad(tp(cx, cy, cz, R, r, a0, t0), tp(cx, cy, cz, R, r, a1, t0),
            tp(cx, cy, cz, R, r, a1, t1), tp(cx, cy, cz, R, r, a0, t1), c, null, 0.9 + 0.1 * Math.cos(t0));
        }
      }
      return b;
    };

    function tp(cx, cy, cz, R, r, a, t) {
      return [cx + (R + r * Math.cos(t)) * Math.cos(a), cy + r * Math.sin(t), cz + (R + r * Math.cos(t)) * Math.sin(a)];
    }

    // rampe : monte vers la direction dir ('-z' = la pente monte vers -Z)
    // repère local : u = axe largeur, v = direction de la montée (cross(u,v) = +Y)
    b.ramp = function (cx, cy, cz, w, h, d, c, dir) {
      var U, V;
      if (dir === '-z') { U = [1, 0, 0]; V = [0, 0, -1]; }
      else if (dir === '+z') { U = [-1, 0, 0]; V = [0, 0, 1]; }
      else if (dir === '-x') { U = [0, 0, -1]; V = [-1, 0, 0]; }
      else { U = [0, 0, 1]; V = [1, 0, 0]; }
      var hw = w / 2, hd = d / 2;
      var base = [cx - V[0] * hd, cy, cz - V[2] * hd];   // arête basse (centre)
      function P(u, v, top) {
        return [
          base[0] + U[0] * u + V[0] * d * v,
          base[1] + (top ? h * v : 0),
          base[2] + U[2] * u + V[2] * d * v
        ];
      }
      var U3 = [U[0], 0, U[2]], V3 = [V[0], 0, V[2]];
      var A = P(-hw, 0, true), B = P(hw, 0, true), C = P(hw, 1, true), D = P(-hw, 1, true);
      var slope = M.norm(M.cross(U3, M.add(M.scale(V3, d), [0, h, 0])));
      if (slope[1] < 0) slope = M.scale(slope, -1);
      b.quad(A, B, C, D, c, slope, 1);                                  // surface
      var Ab = P(-hw, 0, false), Bb = P(hw, 0, false);
      var Cb = P(hw, 1, false), Db = P(-hw, 1, false);
      b.quad(Ab, Bb, Cb, Db, c, [0, -1, 0], 0.55);                      // dessous
      b.quad(Cb, C, D, Db, c, V3, 0.75);                                // mur vertical haut
      b.tri(A, Db, D, c, M.scale(U3, -1), 0.8);                         // jouée gauche
      b.tri(B, C, Cb, c, U3, 0.8);                                      // jouée droite
      return b;
    };

    b.addMesh = function (f32, pos, yaw, scale, rot) {
      var m = M.create();
      var r = rot || [0, yaw || 0, 0];
      M.composeFull(m, pos || [0, 0, 0], r, scale || [1, 1, 1]);
      var p = [0, 0, 0], n = [0, 0, 0];
      for (var i = 0; i + 8 < f32.length; i += 9) {
        M.xformPoint(p, m, [f32[i], f32[i + 1], f32[i + 2]]);
        M.xformPoint(n, m, [f32[i + 3], f32[i + 4], f32[i + 5]]);
        push(p[0], p[1], p[2], n[0], n[1], n[2], [f32[i + 6], f32[i + 7], f32[i + 8]], 1);
      }
      return b;
    };
    return b;
  }

  mesh.builder = builder;

  mesh.box = function (sx, sy, sz, c) { return builder().box(0, sy / 2, 0, sx, sy, sz, c).build(); };
  mesh.sphere = function (r, c, seg, rings) { return builder().sphere(0, 0, 0, r, c, seg, rings).build(); };
  mesh.cylinder = function (rb, rt, h, c, seg) { return builder().cylinder(0, 0, 0, rb, rt, h, c, seg).build(); };
  mesh.cone = function (r, h, c, seg) { return builder().cone(0, 0, 0, r, h, c, seg).build(); };
  mesh.plane = function (w, d, c) { return builder().plane(0, 0, 0, w, d, c).build(); };

  // --- kart : origine au sol, nez vers -Z ---
  // renvoie 3 groupes : body (teinté par la couleur du kart), accent (teinté secondaire),
  // dark (noir/gris fixes : roues, pare-chocs,ails, métal)
  mesh.kartParts = function () {
    var B = builder(), A = builder(), D = builder();
    var dark = [0.16, 0.16, 0.2], tire = [0.13, 0.13, 0.16], chrome = [0.42, 0.45, 0.52];
    B.box(0, 0.34, 0, 1.16, 0.30, 1.72, [1, 1, 1]);          // châssis
    A.box(0, 0.24, -0.72, 0.86, 0.22, 0.62, [1, 1, 1]);       // nez
    A.box(0, 0.56, 0.36, 0.66, 0.36, 0.3, [1, 1, 1]);         // dossier
    D.box(0, 0.52, 0.16, 0.6, 0.12, 0.5, dark);               // assise
    D.torus(0, 0.72, -0.12, 0.17, 0.035, dark, 12, 6);        // volant
    D.box(0, 0.8, 0.48, 0.72, 0.08, 0.1, chrome);              // arceau
    D.box(-0.62, 0.34, 0.1, 0.12, 0.26, 1.1, dark);
    D.box(0.62, 0.34, 0.1, 0.12, 0.26, 1.1, dark);
    A.box(0, 0.44, 0.92, 1.2, 0.16, 0.18, [1, 1, 1]);         // pare-chocs arrière
    D.box(-0.34, 0.62, 0.86, 0.14, 0.14, 0.42, chrome);        // pots d'échappement
    D.box(0.34, 0.62, 0.86, 0.14, 0.14, 0.42, chrome);
    A.box(0, 0.98, 0.62, 0.82, 0.10, 0.34, [1, 1, 1]);        // aileron
    D.box(-0.36, 0.78, 0.62, 0.08, 0.34, 0.1, dark);
    D.box(0.36, 0.78, 0.62, 0.08, 0.34, 0.1, dark);
    D.box(0, 0.2, -0.98, 0.5, 0.14, 0.28, dark);              // lame avant (mode ram)
    wheel(D, -0.60, -0.58, tire, 0.27, 0.22);
    wheel(D, 0.60, -0.58, tire, 0.27, 0.22);
    wheel(D, -0.62, 0.60, tire, 0.30, 0.24);
    wheel(D, 0.62, 0.60, tire, 0.30, 0.24);
    return { body: B.build(), accent: A.build(), dark: D.build() };
  };

  // (compat) renvoie uniquement le châssis blanc ; utiliser kartParts() pour teinter
  mesh.kart = function () { return mesh.kartParts().body; };

  function wheel(b, x, z, c, r, w) {
    var side = builder().cylinder(0, 0, 0, r, r, w, c, 10).build();
    var hub = builder().cylinder(0, 0, 0, r * 0.5, r * 0.5, w + 0.02, [0.45, 0.47, 0.53], 8).build();
    b.addMesh(side, [x + w / 2, r, z], 0, [1, 1, 1], [0, 0, Math.PI / 2]);
    b.addMesh(hub, [x + w / 2 + 0.01, r, z], 0, [1, 1, 1], [0, 0, Math.PI / 2]);
  }

  mesh.wheel = function (r, w, c) {
    var b = builder();
    wheel(b, 0, 0, c || [0.1, 0.1, 0.12], r, w);
    return b.build();
  };

  mesh.crate = function (s, c) {
    var b = builder();
    b.box(0, s / 2, 0, s, s, s, c);
    var d = [0.42, 0.3, 0.16];
    b.box(0, s * 0.52, 0, s * 1.015, s * 0.09, s * 1.015, d);
    b.box(0, s * 0.14, 0, s * 1.015, s * 0.09, s * 1.015, d);
    return b.build();
  };

  mesh.barrel = function (r, h, c) {
    var b = builder();
    b.cylinder(0, 0, 0, r, r, h, c, 12);
    b.cylinder(0, h * 0.22, 0, r * 1.04, r * 1.04, h * 0.08, [0.2, 0.2, 0.24], 12);
    b.cylinder(0, h * 0.66, 0, r * 1.04, r * 1.04, h * 0.08, [0.2, 0.2, 0.24], 12);
    return b.build();
  };

  mesh.pylon = function (r, h, c) {
    var b = builder();
    b.cone(0, 0, 0, r, h, c, 10);
    b.box(0, 0.06, 0, r * 2.4, 0.12, r * 2.4, [0.2, 0.2, 0.22]);
    b.cylinder(0, h * 0.45, 0, r * 0.62, r * 0.5, h * 0.16, [0.95, 0.95, 0.97], 10);
    return b.build();
  };

  mesh.projectile = function (kind, c) {
    var b = builder();
    if (kind === 'rocket') {
      b.cylinder(0, -0.35, 0, 0.14, 0.14, 0.6, c, 8);
      b.cone(0, 0.25, 0, 0.15, 0.34, [1, 0.85, 0.4], 8);
      b.box(0, -0.28, 0, 0.5, 0.05, 0.18, [0.25, 0.25, 0.3]);
    } else if (kind === 'mine') {
      b.sphere(0, 0, 0, 0.3, c, 8, 6);
      for (var i = 0; i < 4; i++) b.cone(0, 0.18, 0, 0.07, 0.2, [0.9, 0.2, 0.2], 4);
    } else if (kind === 'grenade') {
      b.sphere(0, 0, 0, 0.24, c, 8, 6);
      b.cylinder(0, 0.18, 0, 0.09, 0.09, 0.14, [0.3, 0.3, 0.34], 6);
    } else {
      b.sphere(0, 0, 0, 0.26, c, 10, 7);
    }
    return b.build();
  };

  mesh.pickup = function (kind, c) {
    var b = builder();
    if (kind === 'box') {
      b.box(0, 0, 0, 0.8, 0.8, 0.8, c);
      b.box(0, 0, 0, 0.86, 0.2, 0.2, [1, 1, 1]);
      b.box(0, 0, 0, 0.2, 0.86, 0.2, [1, 1, 1]);
      b.box(0, 0, 0, 0.2, 0.2, 0.86, [1, 1, 1]);
    } else if (kind === 'gem') {
      var top = [0, 0.46, 0], bot = [0, -0.46, 0];
      var r1 = [0.34, 0, 0], r2 = [0, 0, 0.34], r3 = [-0.34, 0, 0], r4 = [0, 0, -0.34];
      b.tri(top, r1, r2, c, null, 1); b.tri(top, r2, r3, c, null, 0.92);
      b.tri(top, r3, r4, c, null, 0.85); b.tri(top, r4, r1, c, null, 0.78);
      b.tri(bot, r2, r1, c, null, 0.7); b.tri(bot, r3, r2, c, null, 0.62);
      b.tri(bot, r4, r3, c, null, 0.55); b.tri(bot, r1, r4, c, null, 0.5);
    } else {
      b.torus(0, 0, 0, 0.34, 0.12, c, 12, 6);
    }
    return b.build();
  };

  mesh.gem = function (r, h, c) { return mesh.pickup('gem', c); };
  NB.mesh = mesh;
})(window.NB = window.NB || {});
