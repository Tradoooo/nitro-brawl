// NITRO BRAWL — 4 arènes procédurales (layouts)
(function (NB) {
  'use strict';
  var maps = {};

  function border(w, d, h, color, th) {
    th = th || 2;
    return [
      { x: 0, z: -d / 2, w: w, d: th, h: h, color: color },
      { x: 0, z: d / 2, w: w, d: th, h: h, color: color },
      { x: -w / 2, z: 0, w: th, d: d, h: h, color: color },
      { x: w / 2, z: 0, w: th, d: d, h: h, color: color }
    ];
  }

  function ring8(r) {
    var out = [], i, a;
    for (i = 0; i < 8; i++) {
      a = i / 8 * Math.PI * 2 + Math.PI / 8;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  }

  function padsGrid(list) { return list; }

  // ---------- 1. DUST BOWL ----------
  maps.list = [];
  maps.list.push({
    id: 'dustbowl', name: 'Dust Bowl', tagline: 'Arène ovale du désert, plateforme centrale',
    difficulty: 1, size: [80, 80],
    theme: {
      skyTop: [0.28, 0.5, 0.85], skyBottom: [0.95, 0.8, 0.6], fog: [0.88, 0.78, 0.62],
      ground: [0.8, 0.66, 0.42], groundAlt: [0.62, 0.49, 0.3], wall: [0.72, 0.42, 0.25],
      accent: [1, 0.75, 0.2], sunDir: [0.45, 0.85, 0.3], ambient: 0.62, gridColor: [0.7, 0.55, 0.35], bloom: 0.3
    },
    build: function () {
      var W = 80, D = 80;
      var L = {
        floor: { w: W, d: D, checker: true },
        walls: border(W, D, 1.8, [0.72, 0.42, 0.25], 2.4),
        obstacles: [
          { x: -18, z: -18, w: 3, d: 3, h: 1.4, kind: 'crate', color: [0.8, 0.55, 0.3] },
          { x: 18, z: -18, w: 3, d: 3, h: 1.4, kind: 'crate', color: [0.8, 0.55, 0.3] },
          { x: -18, z: 18, w: 3, d: 3, h: 1.4, kind: 'crate', color: [0.8, 0.55, 0.3] },
          { x: 18, z: 18, w: 3, d: 3, h: 1.4, kind: 'crate', color: [0.8, 0.55, 0.3] },
          { x: 0, z: -26, w: 8, d: 2, h: 1.2, kind: 'block', color: [0.65, 0.4, 0.24] },
          { x: 0, z: 26, w: 8, d: 2, h: 1.2, kind: 'block', color: [0.65, 0.4, 0.24] },
          { x: -26, z: 0, w: 2, d: 8, h: 1.2, kind: 'block', color: [0.65, 0.4, 0.24] },
          { x: 26, z: 0, w: 2, d: 8, h: 1.2, kind: 'block', color: [0.65, 0.4, 0.24] }
        ],
        ramps: [
          { x: 0, z: 8.5, w: 6, d: 7, h: 2.6, dir: '-z', color: [0.68, 0.5, 0.3] },
          { x: 0, z: -8.5, w: 6, d: 7, h: 2.6, dir: '+z', color: [0.68, 0.5, 0.3] }
        ],
        platforms: [{ x: 0, y: 2.6, z: 0, w: 12, d: 10, color: [0.6, 0.44, 0.28], pillar: true }],
        spawns: ring8(32),
        pads: padsGrid([
          [16, 8], [-12, 0], [12, 0], [0, -20], [0, 20], [-24, -24], [24, -24],
          [-24, 24], [24, 24], [-32, 0], [32, 0], [0, 32], [-14, 14], [14, -14]
        ]),
        decorations: [
          { kind: 'tire', x: -34, z: -34 }, { kind: 'tire', x: 34, z: -34 },
          { kind: 'tire', x: -34, z: 34 }, { kind: 'tire', x: 34, z: 34 },
          { kind: 'flag', x: -36, z: 0 }, { kind: 'flag', x: 36, z: 0 },
          { kind: 'stack', x: -10, z: -32 }, { kind: 'stack', x: 10, z: 32 }
        ]
      };
      return L;
    }
  });

  // ---------- 2. NEON GRID ----------
  maps.list.push({
    id: 'neon', name: 'Neon Grid', tagline: 'Circuit néon nocturne, tours et passerelles',
    difficulty: 2, size: [72, 72],
    theme: {
      skyTop: [0.03, 0.02, 0.1], skyBottom: [0.16, 0.05, 0.3], fog: [0.1, 0.06, 0.22],
      ground: [0.09, 0.1, 0.16], groundAlt: [0.12, 0.13, 0.2], wall: [0.2, 0.1, 0.4],
      accent: [0.2, 0.95, 1], sunDir: [0.3, 0.8, 0.5], ambient: 0.5, gridColor: [0.2, 0.9, 1]
    },
    build: function () {
      var W = 72, D = 72;
      return {
        floor: { w: W, d: D, checker: true },
        walls: border(W, D, 2, [0.2, 0.1, 0.4], 2),
        obstacles: [
          { x: -14, z: -14, w: 2.4, d: 10, h: 2.2, kind: 'pillar', color: [0.15, 0.5, 0.6] },
          { x: 14, z: 14, w: 2.4, d: 10, h: 2.2, kind: 'pillar', color: [0.15, 0.5, 0.6] },
          { x: 14, z: -14, w: 10, d: 2.4, h: 2.2, kind: 'pillar', color: [0.6, 0.15, 0.5] },
          { x: -14, z: 14, w: 10, d: 2.4, h: 2.2, kind: 'pillar', color: [0.6, 0.15, 0.5] },
          { x: 0, z: 0, w: 4, d: 4, h: 3, kind: 'pillar', color: [0.3, 0.2, 0.6] }
        ],
        ramps: [
          { x: -21.5, z: 0, w: 5, d: 7, h: 3, dir: '+x', color: [0.26, 0.45, 0.66] },
          { x: 21.5, z: 0, w: 5, d: 7, h: 3, dir: '-x', color: [0.26, 0.45, 0.66] },
          { x: 0, z: -21.5, w: 7, d: 5, h: 3, dir: '+z', color: [0.26, 0.45, 0.66] },
          { x: 0, z: 21.5, w: 7, d: 5, h: 3, dir: '-z', color: [0.26, 0.45, 0.66] }
        ],
        platforms: [
          { x: -14, y: 3, z: 0, w: 8, d: 8, color: [0.16, 0.2, 0.34], pillar: true },
          { x: 14, y: 3, z: 0, w: 8, d: 8, color: [0.16, 0.2, 0.34], pillar: true },
          { x: 0, y: 3, z: -14, w: 8, d: 8, color: [0.16, 0.2, 0.34], pillar: true },
          { x: 0, y: 3, z: 14, w: 8, d: 8, color: [0.16, 0.2, 0.34], pillar: true }
        ],
        spawns: ring8(30),
        pads: [
          [0, 0.0], [-8, -8], [8, 8], [-8, 8], [8, -8], [-28, -28], [28, -28],
          [-28, 28], [28, 28], [0, -30], [0, 30], [-30, 0], [30, 0], [-14, 3.4]
        ],
        decorations: [
          { kind: 'neon', x: -33, z: -33 }, { kind: 'neon', x: 33, z: -33 },
          { kind: 'neon', x: -33, z: 33 }, { kind: 'neon', x: 33, z: 33 },
          { kind: 'arch', x: 0, z: -33 }, { kind: 'arch', x: 0, z: 33 }
        ]
      };
    }
  });

  // ---------- 3. FROST LINE ----------
  maps.list.push({
    id: 'frost', name: 'Frost Line', tagline: 'Banquise glissante, blocs de glace',
    difficulty: 2, size: [76, 76],
    theme: {
      skyTop: [0.55, 0.75, 0.95], skyBottom: [0.9, 0.97, 1], fog: [0.85, 0.93, 1],
      ground: [0.85, 0.93, 0.98], groundAlt: [0.78, 0.88, 0.96], wall: [0.5, 0.72, 0.9],
      accent: [0.3, 0.8, 1], sunDir: [0.5, 0.7, 0.5], ambient: 0.7, gridColor: [0.6, 0.8, 0.95], bloom: 0.45
    },
    build: function () {
      var W = 76, D = 76;
      return {
        floor: { w: W, d: D, checker: true },
        walls: border(W, D, 1.6, [0.5, 0.72, 0.9], 2.2),
        obstacles: [
          { x: -20, z: 0, w: 4, d: 14, h: 2, kind: 'block', color: [0.7, 0.88, 1] },
          { x: 20, z: 0, w: 4, d: 14, h: 2, kind: 'block', color: [0.7, 0.88, 1] },
          { x: 0, z: -20, w: 14, d: 4, h: 2, kind: 'block', color: [0.7, 0.88, 1] },
          { x: 0, z: 20, w: 14, d: 4, h: 2, kind: 'block', color: [0.7, 0.88, 1] },
          { x: -30, z: -30, w: 3, d: 3, h: 2.4, kind: 'pillar', color: [0.6, 0.82, 1] },
          { x: 30, z: 30, w: 3, d: 3, h: 2.4, kind: 'pillar', color: [0.6, 0.82, 1] }
        ],
        ramps: [
          { x: -12, z: -14.5, w: 6, d: 7, h: 2.4, dir: '-z', color: [0.66, 0.84, 0.98] },
          { x: 12, z: 14.5, w: 6, d: 7, h: 2.4, dir: '+z', color: [0.66, 0.84, 0.98] }
        ],
        platforms: [
          { x: -12, y: 2.4, z: -22, w: 10, d: 8, color: [0.72, 0.88, 1], pillar: true },
          { x: 12, y: 2.4, z: 22, w: 10, d: 8, color: [0.72, 0.88, 1], pillar: true }
        ],
        spawns: ring8(31),
        pads: [
          [0, 0], [-10, 10], [10, -10], [-26, 10], [26, -10], [-10, -26], [10, 26],
          [-30, -14], [30, 14], [0, -32], [0, 32], [-32, 20], [32, -20], [-12, -22]
        ],
        decorations: [
          { kind: 'stack', x: -34, z: 0 }, { kind: 'stack', x: 34, z: 0 },
          { kind: 'tire', x: 0, z: -35 }, { kind: 'tire', x: 0, z: 35 }
        ]
      };
    }
  });

  // ---------- 4. FOUNDRY ----------
  maps.list.push({
    id: 'foundry', name: 'Foundry', tagline: 'Fonderie industrielle, conteneurs et lave',
    difficulty: 3, size: [84, 84],
    theme: {
      skyTop: [0.12, 0.06, 0.06], skyBottom: [0.45, 0.16, 0.08], fog: [0.35, 0.14, 0.1],
      ground: [0.24, 0.22, 0.24], groundAlt: [0.28, 0.26, 0.28], wall: [0.4, 0.24, 0.16],
      accent: [1, 0.45, 0.1], sunDir: [0.4, 0.75, 0.45], ambient: 0.5, gridColor: [0.6, 0.3, 0.15]
    },
    build: function () {
      var W = 84, D = 84;
      return {
        floor: { w: W, d: D, checker: true },
        walls: border(W, D, 2.2, [0.4, 0.24, 0.16], 2.4),
        obstacles: [
          { x: -22, z: -10, w: 10, d: 4, h: 2.6, kind: 'block', color: [0.5, 0.3, 0.18] },
          { x: 22, z: 10, w: 10, d: 4, h: 2.6, kind: 'block', color: [0.5, 0.3, 0.18] },
          { x: -10, z: 22, w: 4, d: 10, h: 2.6, kind: 'block', color: [0.5, 0.3, 0.18] },
          { x: 10, z: -22, w: 4, d: 10, h: 2.6, kind: 'block', color: [0.5, 0.3, 0.18] },
          { x: -32, z: 20, w: 3, d: 3, h: 2, kind: 'barrel', color: [0.7, 0.35, 0.1] },
          { x: 32, z: -20, w: 3, d: 3, h: 2, kind: 'barrel', color: [0.7, 0.35, 0.1] },
          { x: 0, z: 0, w: 6, d: 6, h: 1.6, kind: 'block', color: [0.45, 0.26, 0.16] }
        ],
        ramps: [
          { x: -16, z: 4, w: 6, d: 7, h: 2.8, dir: '-z', color: [0.42, 0.3, 0.22] },
          { x: -23.5, z: -4, w: 7, d: 6, h: 2.8, dir: '+x', color: [0.42, 0.3, 0.22] },
          { x: 16, z: -4, w: 6, d: 7, h: 2.8, dir: '+z', color: [0.42, 0.3, 0.22] },
          { x: 23.5, z: 4, w: 7, d: 6, h: 2.8, dir: '-x', color: [0.42, 0.3, 0.22] }
        ],
        platforms: [
          { x: -16, y: 2.8, z: -4, w: 9, d: 9, color: [0.36, 0.26, 0.2], pillar: true },
          { x: 16, y: 2.8, z: 4, w: 9, d: 9, color: [0.36, 0.26, 0.2], pillar: true }
        ],
        spawns: ring8(34),
        pads: [
          [0, 3.4], [-8, -8], [8, 8], [-24, 0], [24, 0], [0, -24], [0, 24],
          [-30, -30], [30, -30], [-30, 30], [30, 30], [-16, -4.2], [16, 4.2], [12, -12]
        ],
        decorations: [
          { kind: 'arch', x: -38, z: 0 }, { kind: 'arch', x: 38, z: 0 },
          { kind: 'tire', x: -38, z: -38 }, { kind: 'tire', x: 38, z: 38 },
          { kind: 'neon', x: 0, z: -39 }, { kind: 'neon', x: 0, z: 39 }
        ]
      };
    }
  });

  maps.byId = function (id) {
    for (var i = 0; i < maps.list.length; i++) if (maps.list[i].id === id) return maps.list[i];
    return null;
  };
  maps.random = function () { return NB.M.pick(maps.list); };
  NB.maps = maps;
})(window.NB = window.NB || {});
