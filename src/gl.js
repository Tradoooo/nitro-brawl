// NITRO BRAWL — couche de rendu : adaptateur Three.js r149.
// Éclairage/gamma/fog dans NOTRE shader (identique sur tous les navigateurs),
// Three gère scène, meshs, matrices, caméra, tri du transparent.
(function (NB) {
  'use strict';
  var G = {};
  var renderer = null, scene = null, camera = null, sun = null;
  var pool = [], poolIdx = 0;
  var matCache = {};
  var skyCache = {};
  var batchMesh = null, batchGeo = null, batchArr = null, batchN = 0;
  var sprAdd = null, sprAddGeo = null, sprAddArr = null, sprAddN = 0;
  var sprNrm = null, sprNrmGeo = null, sprNrmArr = null, sprNrmN = 0;
  var SPR_CAP = 8000;
  var IDENTITY = null;
  var camRight = [1, 0, 0], camUp = [0, 1, 0];
  var lastFov = -1, lastTheme = '', lastAspect = -1;

  // uniforms partagés par tous les matériaux opaques
  var U = {
    uTint: { value: null },
    uLightDir: { value: null },
    uAmbient: { value: 0.6 },
    uFogColor: { value: null },
    uFogNear: { value: 60 },
    uFogFar: { value: 220 }
  };

  var VS = [
    'attribute vec3 color;',
    'varying vec3 vColor; varying vec3 vN; varying float vDepth;',
    'void main() {',
    '  vColor = color;',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var FS = [
    'precision highp float;',
    'varying vec3 vColor; varying vec3 vN; varying float vDepth;',
    'uniform vec3 uTint, uLightDir, uFogColor;',
    'uniform float uAmbient, uFogNear, uFogFar;',
    'void main() {',
    '  vec3 n = normalize(vN);',
    '  float d = max(dot(n, normalize(uLightDir)), 0.0);',
    '  vec3 lin = pow(vColor * uTint, vec3(2.2));',
    '  vec3 lit = lin * (uAmbient + d * (1.0 - uAmbient));',
    '  float f = clamp((vDepth - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);',
    '  vec3 col = mix(lit, pow(uFogColor, vec3(2.2)), f);',
    '  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);',
    '}'
  ].join('\n');

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

  G.time = 0;
  G.stats = { calls: 0, tris: 0, sprites: 0 };

  function opaqueMat(tint) {
    var m = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: {
        uTint: { value: new THREE.Vector3(tint[0], tint[1], tint[2]) },
        uLightDir: U.uLightDir, uAmbient: U.uAmbient,
        uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar
      }
    });
    return m;
  }

  function baseMat() {
    if (!matCache.base) matCache.base = opaqueMat([1, 1, 1]);
    return matCache.base;
  }

  function tintMat(t) {
    var key = ((t[0] * 16) | 0) + '_' + ((t[1] * 16) | 0) + '_' + ((t[2] * 16) | 0);
    if (!matCache[key]) matCache[key] = opaqueMat(t);
    return matCache[key];
  }

  G.init = function (cv) {
    if (typeof THREE === 'undefined') return false;
    IDENTITY = NB.M.create();
    U.uLightDir.value = new THREE.Vector3(0.5, 0.9, 0.35);
    U.uFogColor.value = new THREE.Vector3(0.6, 0.7, 0.9);
    U.uTint.value = new THREE.Vector3(1, 1, 1);
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { NB.util.dbg('renderer', e); return false; }
    renderer.outputEncoding = THREE.LinearEncoding;   // gamma géré par NOTRE shader
    renderer.setClearColor(0x0b0e1a, 1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1.6, 0.3, 420);
    scene.fog = null;   // fog géré par le shader
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
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false
    }));
    sun.scale.set(240, 240, 1);
    scene.add(sun);
  }

  function makeBatch() {
    batchArr = new Float32Array(24000 * 9);
    batchGeo = new THREE.BufferGeometry();
    var ib = new THREE.InterleavedBuffer(batchArr, 9);
    ib.setUsage(THREE.DynamicDrawUsage);
    batchGeo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    batchGeo.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    batchGeo.setAttribute('color', new THREE.InterleavedBufferAttribute(ib, 3, 6));
    batchGeo.setDrawRange(0, 0);
    batchMesh = new THREE.Mesh(batchGeo, baseMat());
    batchMesh.frustumCulled = false;
    batchMesh.visible = false;
    scene.add(batchMesh);
  }

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
    m.renderOrder = additive ? 12 : 10;
    scene.add(m);
    return { mesh: m, geo: geo, arr: arr };
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
    var geo = new THREE.BufferGeometry();
    var ib = new THREE.InterleavedBuffer(f32, 9);
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    geo.setAttribute('color', new THREE.InterleavedBufferAttribute(ib, 3, 6));
    return { geometry: geo, count: f32.length / 9, data: f32 };
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
    var e = camera.matrixWorld.elements;
    camRight = [e[0], e[4], e[8]];
    camUp = [e[1], e[5], e[9]];
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
    U.uFogColor.value.set(fog[0], fog[1], fog[2]);
    U.uFogNear.value = cam.fogNear == null ? 60 : cam.fogNear;
    U.uFogFar.value = cam.fogFar == null ? 220 : cam.fogFar;
    U.uAmbient.value = cam.ambient == null ? 0.6 : cam.ambient;
    var sd = cam.sunDir || [0.5, 0.9, 0.35];
    U.uLightDir.value.set(sd[0], sd[1], sd[2]);
    if (sun) {
      sun.position.set(camera.position.x + sd[0] * 380, camera.position.y + sd[1] * 380, camera.position.z + sd[2] * 380);
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
    var m = poolMesh();
    m.geometry = mesh.geometry;
    m.material = tintMat(tint);
    m.matrix.fromArray(mat || IDENTITY);
    m.matrixWorldNeedsUpdate = true;
    m.visible = true;
    poolIdx++;
    G.stats.calls++;
    G.stats.tris += mesh.count / 3;
  };

  G.beginBatch = function () { batchN = 0; };

  G.batchVert = function (x, y, z, nx, ny, nz, r, g, b) {
    if (batchN + 9 > batchArr.length) { G.flushBatch(); batchN = 0; }
    var i = batchN;
    batchArr[i] = x; batchArr[i + 1] = y; batchArr[i + 2] = z;
    batchArr[i + 3] = nx; batchArr[i + 4] = ny; batchArr[i + 5] = nz;
    batchArr[i + 6] = r; batchArr[i + 7] = g; batchArr[i + 8] = b;
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
    var i = at;
    i = putVert(arr, i, x - rx - ux, y - ry - uy, z - rz - uz, color, alpha, -1, -1);
    i = putVert(arr, i, x + rx - ux, y + ry - uy, z + rz - uz, color, alpha, 1, -1);
    i = putVert(arr, i, x + rx + ux, y + ry + uy, z + rz + uz, color, alpha, 1, 1);
    i = putVert(arr, i, x - rx - ux, y - ry - uy, z - rz - uz, color, alpha, -1, -1);
    i = putVert(arr, i, x + rx + ux, y + ry + uy, z + rz + uz, color, alpha, 1, 1);
    i = putVert(arr, i, x - rx + ux, y - ry + uy, z - rz + uz, color, alpha, -1, 1);
    if (isAdd) sprAddN = i; else sprNrmN = i;
  };

  function putVert(a, i, x, y, z, c, al, u, v) {
    a[i] = x; a[i + 1] = y; a[i + 2] = z;
    a[i + 3] = c[0]; a[i + 4] = c[1]; a[i + 5] = c[2]; a[i + 6] = al;
    a[i + 7] = u; a[i + 8] = v;
    return i + 9;
  }

  function flushSprites() {
    if (sprNrmN > 0) {
      sprNrmGeo.setDrawRange(0, sprNrmN / 9);
      sprNrmGeo.attributes.position.data.needsUpdate = true;
      sprNrm.visible = true;
      G.stats.sprites += sprNrmN / 54;
    }
    if (sprAddN > 0) {
      sprAddGeo.setDrawRange(0, sprAddN / 9);
      sprAddGeo.attributes.position.data.needsUpdate = true;
      sprAdd.visible = true;
      G.stats.sprites += sprAddN / 54;
    }
    sprAddN = 0; sprNrmN = 0;
  }
  G.flushSprites = flushSprites;

  G.end = function () {
    G.flushBatch();
    flushSprites();
    if (renderer && scene && camera) renderer.render(scene, camera);
  };

  G.scissor = function (x, y, w, h) {
    if (!renderer) return;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h);
    renderer.setViewport(x, y, w, h);
  };

  G.noScissor = function () {
    if (!renderer) return;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, G.width, G.height);
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
