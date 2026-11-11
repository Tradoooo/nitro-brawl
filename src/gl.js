// NITRO BRAWL — couche de rendu : adaptateur Three.js (API identique à l'ancien moteur maison)
// Fournit : init/resize/createMesh/draw/drawTinted/batch*/sprite*/begin/end/project/stats.
(function (NB) {
  'use strict';
  var G = {};
  var renderer = null, scene = null, camera = null, sun = null, dirLight = null, ambLight = null;
  var canvas = null;
  var pool = [], poolIdx = 0;
  var matCache = {};
  var skyCache = {};
  var batchMesh = null, batchGeo = null, batchArr = null, batchN = 0, BATCH_CAP = 24000;
  var sprAdd = null, sprAddGeo = null, sprAddArr = null, sprAddN = 0;
  var sprNrm = null, sprNrmGeo = null, sprNrmArr = null, sprNrmN = 0;
  var SPR_CAP = 8000;   // sommets (6 par sprite)
  var IDENTITY = null;
  var camRight = [1, 0, 0], camUp = [0, 1, 0];
  var lastFov = -1, lastTheme = '', lastAspect = -1;

  // conversion sRGB -> linéaire (flux de travail linéaire de three + sortie sRGB)
  var LIN = new Float32Array(1024);
  (function () { for (var i = 0; i < 1024; i++) LIN[i] = Math.pow(i / 1023, 2.2); })();
  function lin(c) { return LIN[Math.max(0, Math.min(1023, (c * 1023) | 0))]; }

  G.time = 0;
  G.stats = { calls: 0, tris: 0, sprites: 0 };

  function mat3key(r, g, b) {
    return ((r * 16) | 0) + '_' + ((g * 16) | 0) + '_' + ((b * 16) | 0);
  }

  G.init = function (cv) {
    canvas = cv;
    if (typeof THREE === 'undefined') return false;
    IDENTITY = NB.M.create();
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { NB.util.dbg('renderer', e); return false; }
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x0b0e1a, 1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1.6, 0.3, 420);
    camera.matrixAutoUpdate = true;
    ambLight = new THREE.AmbientLight(0xffffff, 0.6);
    dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(50, 90, 30);
    scene.add(ambLight, dirLight);
    scene.fog = new THREE.Fog(0x99aabb, 60, 220);
    makeBatch();
    makeSprites();
    makeSun();
    return true;
  };

  function makeSun() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,250,225,0.95)');
    g.addColorStop(0.25, 'rgba(255,225,170,0.45)');
    g.addColorStop(1, 'rgba(255,200,140,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false
    }));
    sun.scale.set(240, 240, 1);
    scene.add(sun);
  }

  function makeBatch() {
    batchArr = new Float32Array(BATCH_CAP * 9);
    batchGeo = new THREE.BufferGeometry();
    var ib = new THREE.InterleavedBuffer(batchArr, 9);
    ib.setUsage(THREE.DynamicDrawUsage);
    batchGeo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    batchGeo.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    batchGeo.setAttribute('color', new THREE.InterleavedBufferAttribute(ib, 3, 6));
    batchGeo.setDrawRange(0, 0);
    batchMesh = new THREE.Mesh(batchGeo, matCache.base || baseMat());
    batchMesh.frustumCulled = false;
    batchMesh.visible = false;
    scene.add(batchMesh);
  }

  function baseMat() {
    if (!matCache.base) matCache.base = new THREE.MeshLambertMaterial({ vertexColors: true });
    return matCache.base;
  }

  var SPR_VS = [
    'attribute vec4 aColor; attribute vec2 aUV;',
    'varying vec4 vColor; varying vec2 vUV;',
    'void main(){ vColor=aColor; vUV=aUV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
  ].join('\n');
  var SPR_FS = [
    'precision highp float;',
    'varying vec4 vColor; varying vec2 vUV;',
    'void main(){ float r=length(vUV); float a=smoothstep(1.0,0.15,r)*vColor.a;',
    '  if(a<0.004) discard; gl_FragColor=vec4(vColor.rgb,a); }'
  ].join('\n');

  function spriteMesh(additive) {
    var arr = new Float32Array(SPR_CAP * 9);
    var geo = new THREE.BufferGeometry();
    var ib = new THREE.InterleavedBuffer(arr, 9);
    ib.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('aColor', new THREE.InterleavedBufferAttribute(ib, 4, 3));
    geo.setAttribute('aUV', new THREE.InterleavedBufferAttribute(ib, 2, 7));
    geo.setDrawRange(0, 0);
    var mat = new THREE.ShaderMaterial({
      vertexShader: SPR_VS, fragmentShader: SPR_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    var m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    return { mesh: m, geo: geo, arr: arr, n: 0 };
  }

  function makeSprites() {
    var a = spriteMesh(true), n = spriteMesh(false);
    sprAdd = a.mesh; sprAddGeo = a.geo; sprAddArr = a.arr;
    sprNrm = n.mesh; sprNrmGeo = n.geo; sprNrmArr = n.arr;
  }

  G.resize = function (w, h, dpr) {
    G.width = w; G.height = h; G.dpr = dpr || 1;
    if (!renderer) return;
    renderer.setPixelRatio(G.dpr);
    renderer.setSize(w, h, false);
    if (camera) { camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  };

  G.gl = function () { return renderer ? renderer.getContext() : null; };

  G.createMesh = function (f32) {
    var out = new Float32Array(f32.length);
    out.set(f32);
    for (var i = 6; i < out.length; i += 9) {   // couleurs -> espace linéaire
      out[i] = lin(f32[i]); out[i + 1] = lin(f32[i + 1]); out[i + 2] = lin(f32[i + 2]);
    }
    var geo = new THREE.BufferGeometry();
    var ib = new THREE.InterleavedBuffer(out, 9);
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    geo.setAttribute('color', new THREE.InterleavedBufferAttribute(ib, 3, 6));
    return { geometry: geo, count: out.length / 9, data: f32 };
  };

  G.deleteMesh = function (m) { if (m && m.geometry) m.geometry.dispose(); };

  G.begin = function (cam) {
    G.camera = cam;
    G.time += 1 / 60;
    G.stats.calls = 0; G.stats.tris = 0; G.stats.sprites = 0;
    poolIdx = 0;
    for (var i = 0; i < pool.length; i++) pool[i].visible = false;
    applyCamera(cam);
    applyTheme(cam);
    camRight = [camera.matrixWorld.elements[0], camera.matrixWorld.elements[4], camera.matrixWorld.elements[8]];
    camUp = [camera.matrixWorld.elements[1], camera.matrixWorld.elements[5], camera.matrixWorld.elements[9]];
    batchN = 0; sprAddN = 0; sprNrmN = 0;
    batchMesh.visible = false; sprAdd.visible = false; sprNrm.visible = false;
  };

  function applyCamera(cam) {
    var pos = cam.pos, tgt = cam.target;
    if (cam.shake > 0.0001) {
      var s = cam.shake;
      pos = [pos[0] + NB.M.randRange(-s, s), pos[1] + NB.M.randRange(-s, s), pos[2] + NB.M.randRange(-s, s)];
      tgt = [tgt[0] + NB.M.randRange(-s, s) * 0.5, tgt[1] + NB.M.randRange(-s, s) * 0.5, tgt[2] + NB.M.randRange(-s, s) * 0.5];
    }
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.up.set(cam.up ? cam.up[0] : 0, cam.up ? cam.up[1] : 1, cam.up ? cam.up[2] : 0);
    camera.lookAt(tgt[0], tgt[1], tgt[2]);
    var fovDeg = (cam.fov || 1.05) * 180 / Math.PI;
    var aspect = cam.aspect || (G.width / Math.max(1, G.height));
    if (Math.abs(fovDeg - lastFov) > 0.001 || Math.abs(aspect - lastAspect) > 0.0001) {
      camera.fov = fovDeg; camera.aspect = aspect;
      camera.near = cam.near || 0.3; camera.far = cam.far || 420;
      camera.updateProjectionMatrix();
      lastFov = fovDeg; lastAspect = aspect;
    }
    camera.updateMatrixWorld();
    G.viewProj = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).elements;
  }

  function applyTheme(cam) {
    var key = (cam.skyTop || []).join() + '|' + (cam.skyBottom || []).join() + '|' + (cam.fogColor || []).join() +
      '|' + (cam.ambient || 0) + '|' + (cam.sunDir || []).join() + '|' + (cam.fogNear || 0) + '|' + (cam.fogFar || 0);
    if (key === lastTheme) return;
    lastTheme = key;
    var top = cam.skyTop || [0.25, 0.45, 0.85], bot = cam.skyBottom || [0.85, 0.85, 0.95];
    if (!skyCache[key]) skyCache[key] = skyTexture(top, bot);
    scene.background = skyCache[key];
    var fog = cam.fogColor || [0.6, 0.7, 0.9];
    scene.fog.color.setRGB(fog[0], fog[1], fog[2]).convertSRGBToLinear();
    scene.fog.near = cam.fogNear == null ? 60 : cam.fogNear;
    scene.fog.far = cam.fogFar == null ? 220 : cam.fogFar;
    var amb = cam.ambient == null ? 0.6 : cam.ambient;
    ambLight.intensity = amb;
    dirLight.intensity = Math.max(0.05, 1 - amb);
    var sd = cam.sunDir || [0.5, 0.9, 0.35];
    dirLight.position.set(sd[0] * 120, sd[1] * 120, sd[2] * 120);
    if (sun) {
      sun.position.set(camera.position.x + sd[0] * 380, camera.position.y + sd[1] * 380, camera.position.z + sd[2] * 380);
      sun.material.color.setRGB(1, 0.95, 0.85).convertSRGBToLinear();
    }
  }

  function skyTexture(top, bot) {
    var c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 256);
    function rgb(a) { return 'rgb(' + (a[0] * 255 | 0) + ',' + (a[1] * 255 | 0) + ',' + (a[2] * 255 | 0) + ')'; }
    g.addColorStop(0, rgb(top));
    g.addColorStop(0.55, rgb(NB.M.lerp(bot, top, 0.45)));
    g.addColorStop(1, rgb(bot));
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function poolMesh() {
    var m = pool[poolIdx];
    if (!m) {
      m = new THREE.Mesh();
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      scene.add(m);
      pool[poolIdx] = m;
    }
    return m;
  }

  G.draw = function (mesh, mat) {
    if (!mesh || !mesh.geometry) return;
    var m = poolMesh();
    m.geometry = mesh.geometry;
    m.material = baseMat();
    m.matrix.fromArray(mat || IDENTITY);
    m.matrixWorldNeedsUpdate = true;
    m.visible = true;
    poolIdx++;
    G.stats.calls++;
    G.stats.tris += mesh.count / 3;
  };

  G.drawTinted = function (mesh, mat, tint) {
    if (!mesh || !mesh.geometry) return;
    var key = mat3key(tint[0], tint[1], tint[2]);
    var mtl = matCache[key];
    if (!mtl) {
      mtl = new THREE.MeshLambertMaterial({ vertexColors: true });
      mtl.color.setRGB(tint[0], tint[1], tint[2]).convertSRGBToLinear();
      matCache[key] = mtl;
    }
    var m = poolMesh();
    m.geometry = mesh.geometry;
    m.material = mtl;
    m.matrix.fromArray(mat || IDENTITY);
    m.matrixWorldNeedsUpdate = true;
    m.visible = true;
    poolIdx++;
    G.stats.calls++;
    G.stats.tris += mesh.count / 3;
  };

  // ---------- batch dynamique (espace monde) ----------
  G.beginBatch = function () { batchN = 0; };

  G.batchVert = function (x, y, z, nx, ny, nz, r, g, b) {
    if (batchN + 9 > batchArr.length) { G.flushBatch(); batchN = 0; }
    var i = batchN;
    batchArr[i] = x; batchArr[i + 1] = y; batchArr[i + 2] = z;
    batchArr[i + 3] = nx; batchArr[i + 4] = ny; batchArr[i + 5] = nz;
    batchArr[i + 6] = lin(r); batchArr[i + 7] = lin(g); batchArr[i + 8] = lin(b);
    batchN += 9;
  };

  G.batchTri = function (p0, p1, p2, n, c) {
    G.batchVert(p0[0], p0[1], p0[2], n[0], n[1], n[2], c[0], c[1], c[2]);
    G.batchVert(p1[0], p1[1], p1[2], n[0], n[1], n[2], c[0], c[1], c[2]);
    G.batchVert(p2[0], p2[1], p2[2], n[0], n[1], n[2], c[0], c[1], c[2]);
  };

  G.batchQuad = function (p0, p1, p2, p3, c) {
    var e1 = NB.M.sub(p1, p0), e2 = NB.M.sub(p3, p0);
    var n = NB.M.norm(NB.M.cross(e1, e2));
    G.batchTri(p0, p1, p2, n, c);
    G.batchTri(p0, p2, p3, n, c);
  };

  G.flushBatch = function () {
    if (batchN === 0) return;
    batchGeo.setDrawRange(0, batchN / 9);
    batchGeo.attributes.position.data.needsUpdate = true;
    batchMesh.visible = true;
    batchN = 0;
  };

  // ---------- sprites (billboards) ----------
  G.beginSprites = function () { sprAddN = 0; sprNrmN = 0; };

  G.sprite = function (x, y, z, size, color, alpha, additive, rot) {
    var isAdd = additive === undefined ? true : !!additive;
    var arr = isAdd ? sprAddArr : sprNrmArr;
    var at = isAdd ? sprAddN : sprNrmN;
    if (at + 54 > arr.length) return;
    var h = size * 0.5;
    var rx = camRight[0] * h, ry = camRight[1] * h, rz = camRight[2] * h;
    var ux = camUp[0] * h, uy = camUp[1] * h, uz = camUp[2] * h;
    if (rot) {
      var cr = Math.cos(rot), sr = Math.sin(rot);
      var nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
      var nux = -rx * sr + ux * cr, nuy = -ry * sr + uy * cr, nuz = -rz * sr + uz * cr;
      rx = nrx; ry = nry; rz = nrz; ux = nux; uy = nuy; uz = nuz;
    }
    var lr = lin(color[0]), lg = lin(color[1]), lb = lin(color[2]);
    var i = at;
    i = putVert(arr, i, x - rx - ux, y - ry - uy, z - rz - uz, lr, lg, lb, alpha, -1, -1);
    i = putVert(arr, i, x + rx - ux, y + ry - uy, z + rz - uz, lr, lg, lb, alpha, 1, -1);
    i = putVert(arr, i, x + rx + ux, y + ry + uy, z + rz + uz, lr, lg, lb, alpha, 1, 1);
    i = putVert(arr, i, x - rx - ux, y - ry - uy, z - rz - uz, lr, lg, lb, alpha, -1, -1);
    i = putVert(arr, i, x + rx + ux, y + ry + uy, z + rz + uz, lr, lg, lb, alpha, 1, 1);
    i = putVert(arr, i, x - rx + ux, y - ry + uy, z - rz + uz, lr, lg, lb, alpha, -1, 1);
    if (isAdd) sprAddN = i; else sprNrmN = i;
  };

  function putVert(a, i, x, y, z, r, g, b, al, u, v) {
    a[i] = x; a[i + 1] = y; a[i + 2] = z;
    a[i + 3] = r; a[i + 4] = g; a[i + 5] = b; a[i + 6] = al;
    a[i + 7] = u; a[i + 8] = v;
    return i + 9;
  }

  function flushSprites() {
    if (sprAddN > 0) {
      sprAddGeo.setDrawRange(0, sprAddN / 9);
      sprAddGeo.attributes.position.data.needsUpdate = true;
      sprAdd.visible = true;
      G.stats.sprites += sprAddN / 54;
    }
    if (sprNrmN > 0) {
      sprNrmGeo.setDrawRange(0, sprNrmN / 9);
      sprNrmGeo.attributes.position.data.needsUpdate = true;
      sprNrm.visible = true;
      G.stats.sprites += sprNrmN / 54;
    }
    sprAddN = 0; sprNrmN = 0;
  }
  G.flushSprites = flushSprites;

  G.end = function () {
    G.flushBatch();
    flushSprites();
    if (renderer && scene && camera) renderer.render(scene, camera);
  };

  G.project = function (out2, worldPos) {
    if (!camera) { out2[0] = -9999; out2[1] = -9999; return false; }
    var v = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]).project(camera);
    if (v.z > 1 || v.z < -1) { out2[0] = -9999; out2[1] = -9999; return false; }
    out2[0] = (v.x * 0.5 + 0.5) * G.width;
    out2[1] = (1 - (v.y * 0.5 + 0.5)) * G.height;
    return true;
  };

  NB.gl = G;
})(window.NB = window.NB || {});
