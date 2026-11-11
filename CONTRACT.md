# NITRO BRAWL — contrat d'interfaces (source de vérité)

Jeu d'arène de karts armés (style Smash Karts) : 1 joueur + 7 bots, power-ups,
éliminations en 1 coup, respawn, manches chronométrées. **Rendu WebGL maison.**

## Contraintes dures (concours Base44 × Nitro, jugé gameplay / créativité / technique)

1. Le livrable final = **UN seul fichier `dist/index.html`** auto-suffisant :
   zéro dépendance externe, zéro CDN, zéro image/son/police téléchargée.
   Tout est procédural (géométrie générée, sons WebAudio synthétisés).
2. Développement en modules séparés (`src/*.js`), assemblés par `build.mjs`
   dans l'ordre de la liste ci-dessous. **Pas d'ES modules** : scripts classiques
   partageant le global `window.NB`. Pas de `import`/`export`.
3. Chaque fichier **< 500 lignes**, chaque fonction **< 50 lignes**, zéro duplication.
   Au-delà : découper en helpers dans le même fichier ou demander.
4. `node --check src/<fichier>.js` doit passer (syntaxe ES2020, navigateur cible).
5. Aucune `console.log` de debug laissée en production (utiliser `NB.dbg()`).
6. Interdit de modifier un fichier qui n'est pas le tien. Interdit de redéléguer.

## Unités et repère

- Mètre, seconde, angle en **radians**. Repère main droite : **+X droite, +Y haut, +Z vers le spectateur**
  (donc « devant » = −Z quand yaw = 0).
- Sol de l'arène à `y = 0`. Gravité `NB.GRAVITY = -22`.
- Un kart = cylindre de collision `radius = 0.85`, hauteur 1.0, masse 1.
- Arène bornée : `|x|, |z| <= 60` max (chaque map définit ses propres limites).

## Ordre de chargement (build.mjs)

```
math.js  gl.js  mesh.js  util.js  maps.js  arena.js  kart.js  pickups.js
weapons.js  bots.js  fx.js  audio.js  hud.js  main.js
```

`index.html` (coquille) : un `<canvas id="gl">`, un `<div id="ui">` pour le HUD/menu
(DOM + CSS inline), `<script>` unique.

---

# PARTIE A — Cœurs déjà écrits (NE PAS TOUCHER, à lire)

## A1. `NB.M` — math (src/math.js)

Matrices **column-major** `Float32Array(16)` comme WebGL.

```js
NB.M.create()                      -> Float32Array(16) identité
NB.M.perspective(out, fovY, aspect, near, far) -> out
NB.M.lookAt(out, eye, target, up)  -> out        // eye/target/up = [x,y,z]
NB.M.multiply(out, a, b)           -> out       // out = a * b
NB.M.identity(out)                 -> out
NB.M.fromRotationY(out, rad)       -> out
NB.M.fromTranslation(out, [x,y,z]) -> out
NB.M.fromScaling(out, [x,y,z])     -> out
NB.M.compose(out, pos, yaw, scale) -> out       // T * Ry * S (modèle objet au sol)
NB.M.composeFull(out, pos, [rx,ry,rz], scale)   // T * Ry * Rx * Rz * S
NB.M.invert(out, a)                -> out|null
NB.M.xformPoint(out3, m, p3)       -> out3       // applique matrice à un point (w=1)
// vec3 (tableaux [x,y,z] ou Float32Array, au choix de l'appelant) :
NB.M.v3(x,y,z) NB.M.add(a,b) NB.M.sub(a,b) NB.M.scale(a,s) NB.M.mul(a,b)
NB.M.dot(a,b) NB.M.cross(a,b) NB.M.len(a) NB.M.dist(a,b) NB.M.dist2(a,b)
NB.M.norm(a) NB.M.lerp(a,b,t) NB.M.clamp(v,min,max) NB.M.clamp01(v)
NB.M.lerpAngle(a,b,t)             // interpolation d'angle la plus courte
NB.M.damp(current, target, lambda, dt)      // lissage indépendant du framerate
NB.M.dampAngle(current, target, lambda, dt)
NB.M.randRange(a,b) NB.M.randInt(n) NB.M.pick(arr) NB.M.shuffle(arr)
NB.M.approach(cur, target, delta)
```

## A2. `NB.gl` — rendu Three.js r149 (src/gl.js)

Implémentation : adaptateur Three.js (WebGLRenderer + MeshLambertMaterial vertexColors +
Fog + lumières directionnelle/ambiante + ciel en texture dégradé + sprites en billboards
quad avec ShaderMaterial). Flux linéaire : couleurs sRGB converties en linéaire à la
création (`lin()`), sortie `sRGBEncoding`. API publique inchangée ci-dessous.

Deux programmes : **opaque** (éclairage directionnel + fog, écriture de profondeur)
et **sprite** (non éclairé, blend additif/alpha, billboards, pour particules et halos).

```js
NB.gl.init(canvas) -> true|false           // false si WebGL indisponible
NB.gl.resize(w, h, dpr)                    // gère canvas.width/height + viewport
NB.gl.begin(cam)
// cam = { pos:[x,y,z], target:[x,y,z], fov: radians, aspect: number,
//         near=0.3, far=400, fogColor:[r,g,b], fogNear=60, fogFar=220,
//         skyTop:[r,g,b], skyBottom:[r,g,b], shake=0 }
NB.gl.end()

// Géométrie statique/dynamique opaque :
NB.gl.createMesh(f32) -> mesh              // f32 interleaved: pos(3) normal(3) color(3) par sommet
mesh.count                                 // nombre de sommets
NB.gl.deleteMesh(mesh)
NB.gl.draw(mesh, modelMatrix|null)         // modelMatrix = Float32Array(16) ou null (identité)
NB.gl.drawTinted(mesh, modelMatrix, tint)  // tint=[r,g,b] multiplicateur (0..1+), pour flash dégâts

// Batch dynamique (rebâti à chaque frame, espace monde) — même format interleaved :
NB.gl.beginBatch()                         // remet le compteur à 0
NB.gl.batchVert(x,y,z, nx,ny,nz, r,g,b)    // ajouter un sommet (par triangle)
NB.gl.batchTri(p0,p1,p2, n, color)         // raccourci : 3 points [x,y,z], normale, couleur
NB.gl.batchQuad(p0,p1,p2,p3, color)        // quad (2 tris), normale auto
NB.gl.flushBatch()                         // dessine le batch opaque accumulé

// Sprites / particules (billboards, blend additif par défaut) :
NB.gl.beginSprites()
NB.gl.sprite(x,y,z, size, [r,g,b], alpha, additive=true, rot=0)
NB.gl.flushSprites()

// Utilitaires exposés aux modules :
NB.gl.camera      // la caméra courante (valide entre begin() et end())
NB.gl.viewProj    // Float32Array(16) courant
NB.gl.project(out2, worldPos) -> bool  // projection écran ; out2=[x,y] en px CSS, false si derrière
NB.gl.time        // secondes depuis l'init (pour shaders animés)
```

**Règle d'usage pour tous les modules** : on ne dessine QUE entre `NB.gl.begin()` et
`NB.gl.end()`, et l'ordre est imposé par `main.js` :

```
gl.begin(cam)
  arena.draw()                 // meshes statiques opaques
  pickups.draw()               // draw(mesh, mat)
  kart.drawAll()               // draw/drawTinted
  weapons.draw()               // projectiles : batch + sprites
  fx.draw()                    // particules : beginSprites/sprite/flushSprites + batch
gl.end()
```

## A3. `NB.mesh` — générateurs (src/mesh.js)

Tous retournent un `Float32Array` interleaved **pos(3) normal(3) color(3)** prêt pour
`NB.gl.createMesh`. Un `Builder` accumule des primitives avec une transform.

```js
const b = NB.mesh.builder();              // accumulateur
b.box(cx,cy,cz, sx,sy,sz, color, opt)     // opt={rx,ry,rz} rotation du bloc
b.sphere(cx,cy,cz, r, color, seg=12, rings=8)
b.cylinder(cx,cy,cz, rBottom, rTop, h, color, seg=14)  // base centrée sur (cx,cy,cz), monte vers +Y
b.cone(cx,cy,cz, r, h, color, seg=14)
b.torus(cx,cy,cz, R, r, color, seg=16, tubeSeg=8)
b.ramp(cx,cy,cz, w,h,d, color, dir)       // plan incliné ; dir ∈ {'-z','+z','-x','+x'}
b.wedge(...)                              // alias si besoin
b.plane(cx,cy,cz, w,d, color, ry=0)       // quad horizontal, normale +Y
b.quad(p0,p1,p2,p3, color)                // quad libre, normale calculée
b.addMesh(f32, matrixOrPos, yaw)          // réinjecte un mesh déjà construit (avec transform)
b.count()                                 // nb de sommets accumulés
b.build() -> Float32Array

// Raccourcis directs (sans builder) :
NB.mesh.box(sx,sy,sz,color) NB.mesh.sphere(r,color,seg,rings)
NB.mesh.cylinder(rb,rt,h,color,seg) NB.mesh.cone(r,h,color,seg)
NB.mesh.kart(bodyColor, accentColor) -> Float32Array   // kart complet (châssis, siège, volant, 4 roues, pare-chocs, pot d'échappement),
                                                       // origine au centre du sol du kart, nez vers -Z, longueur ~1.9, largeur ~1.3
NB.mesh.crate(size, color) NB.mesh.barrel(r,h,color) NB.mesh.pylon(r,h,color)
NB.mesh.projectile(kind, color)   // kind: 'rocket'|'mine'|'grenade'|'orb'
NB.mesh.pickup(kind, color)       // kind: 'box'|'gem'|'ring'
```

## A4. `NB.util` — outils partagés (src/util.js)

```js
NB.util.now()                       // performance.now()/1000
NB.util.fmtTime(sec) -> "1:23.45"
NB.util.uid() -> string
NB.util.store                     // localStorage wrappé (get/set/JSON, try/catch)
NB.util.dbg(...)                    // log si NB.DEBUG
NB.util.eventBus                    // on/off/emit (utilisé par hud & audio & main)
```

---

# PARTIE B — État de jeu partagé (créé par `main.js`, lu/écrit par tous)

```js
NB.game = {
  mode: 'deathmatch' | 'elimination',
  map: <objet map de NB.maps.list[i]>,
  arena: <objet construit par NB.arena.build(map)>,
  time: 0,                  // secondes depuis le début de la frame courante (cumul)
  matchTime: 180,           // durée totale en deathmatch
  clock: 180,               // temps restant
  phase: 'menu'|'countdown'|'playing'|'finished'|'paused',
  countdown: 3,
  karts: [ <kart>, ... ],   // index 0 = joueur
  player: <kart>,
  pickups: [ <pickup>, ... ],
  projectiles: [ <proj>, ... ],
  hazards: [ <hazard>, ... ],   // mines, flaques d'huile (voir weapons)
  events: [],                   // file d'événements de la frame (voir B3)
  score: { kills:0, deaths:0 }, // dupliqué par kart
  winner: null,
  difficulty: 'rookie'|'pro'|'legend',
  shake: 0,
  slowmo: 1,
}
```

## B1. Objet `kart` — créé par `NB.kart.create(opts)`, mis à jour par `NB.kart.update(kart, input, dt)`

```js
{
  id, name, color:[r,g,b], accent:[r,g,b], isPlayer:bool, isBot:bool,
  pos:[x,y,z], vel:[x,y,z], yaw:number, yawVel:number,
  speed:number,                 // vitesse signée le long du nez (m/s)
  steer:number,                 // -1..1 (entrée lissée)
  throttle:number, brake:number, drift:bool,
  onGround:bool, vy:number, airTime:number,
  alive:bool, respawnIn:number, lives:number,
  kills:number, deaths:number, streak:number,
  weapon:null|'rocket'|'homing'|'mine'|'oil'|'grenade'|'shield'|'boost'|'ram',
  weaponAmmo:0, shieldT:0, boostT:0, oilT:0, invulnT:0, freezeT:0,
  driftCharge:number, miniBoostT:number,
  flashT:0,                     // >0 = teinte rouge (dégât/encaissé)
  radius:0.85, mass:1,
  lastHitBy:null,               // id du kart crédité de l'élimination
  wheelSpin:number, tiltX:number, tiltZ:number, // pour l'animation du mesh
  ai:null|<objet bots>,
  lapSfx:0, engineRpm:0,
}
```

`input` (même forme pour joueur et bots) :

```js
{ throttle:0..1, brake:0..1, steer:-1..1, drift:bool, fire:bool, use:bool }
```

`fire` = tirer l'arme, `use` = activer le bonus passif (shield/boost). Les deux peuvent
être le même bouton ; `main.js` tranche (Espace = fire, Maj = drift, E/Shift droit = use).

## B2. Arène — `NB.arena` (voir PARTIE C1)

## B3. Événements (file `NB.game.events`, vidée par `main.js` en fin de frame)

```js
{ t:'kill',   killerId, victimId, weapon }
{ t:'hit',    kartId, byId, weapon }
{ t:'pickup', kartId, kind }
{ t:'shot',   kartId, weapon, pos }
{ t:'boom',   pos:[x,y,z], r:radius, power, color }
{ t:'respawn',kartId, pos }
{ t:'count',  n }          // 3,2,1
{ t:'go' }
{ t:'matchEnd', winner }
```

`fx` et `audio` et `hud` **écoutent** ces événements (via `main.js` qui fait
`NB.fx.onEvent(e)` / `NB.audio.onEvent(e)` / `NB.hud.onEvent(e)`), et `weapons`
**émet** `NB.game.events.push(e)`. Personne n'appelle directement `fx.explode()`
depuis `weapons` — sauf pour les effets purement visuels immédiats autorisés :
`NB.fx.spawn*(...)` est appelable depuis n'importe quel module.

---

# PARTIE C — Modules à écrire (chacun SON fichier, signatures exactes)

## C1. `maps.js` + `arena.js`

**`NB.maps`** : définitions procédurales (pas de gros tableaux de sommets).

```js
NB.maps.list = [ mapDef, ... ]        // 4 maps minimum
mapDef = {
  id:'dustbowl', name:'Dust Bowl', tagline:'...',
  size:[w,d],                          // dimensions du sol (<=120)
  theme:{ skyTop:[r,g,b], skyBottom:[...], fog:[...], ground:[...], groundAlt:[...],
          wall:[...], accent:[...], sunDir:[x,y,z], ambient:0.55, gridColor:[...] },
  difficulty:1..3,
  build: (M) -> layout                  // fonction qui retourne le layout (voir dessous)
}
NB.maps.byId(id) -> mapDef
NB.maps.random() -> mapDef
```

`layout` retourné par `build()` :

```js
{
  floor:{ w, d, color, colorAlt, checker:bool },   // sol (damier ou panneaux)
  walls:[ {x,z,w,d,h,color, ry=0} ],               // murs/bordures (boîtes AABB après rotation ry ; ry doit rester 0 ou ±PI/2)
  obstacles:[ {x,z,w,d,h,color, kind:'crate'|'pillar'|'block'|'barrel', ry=0, destructible=false} ],
  ramps:[ {x,z,w,d,h,dir:'-z'|'+z'|'-x'|'+x',color} ],
  platforms:[ {x,y,z,w,d,color, pillar:true} ],    // plateformes surélevées (accès par rampes)
  spawns:[ [x,z], ... ],                            // >= 8 points de spawn répartis
  pads:[ [x,z], ... ],                              // >= 12 emplacements de power-ups
  decorations:[ {kind:'flag'|'neon'|'stack'|'arch'|'tire', x,z, ...} ]  // purement visuel
}
```

**`NB.arena`** : construit la géométrie GPU + fournit la collision.

```js
NB.arena.build(mapDef) -> arena
arena = {
  map: mapDef, layout,
  bounds:{ minX,maxX,minZ,maxZ },      // limites internes jouables (murs inclus)
  solids:[ {min:[x,y,z], max:[x,y,z]} ],   // toutes les boîtes de collision (murs+obstacles+platforms+ramps traités)
  ramps:[ {min:[x,z], max:[x,z], y0, y1, dir} ],
  spawns:[[x,z]], pads:[[x,z]],
  meshes:[ {mesh, mat|null} ],         // geometry pré-uploadée
  draw(),                              // NB.gl.draw pour chaque mesh
  drawMinimap(ctx2d, x, y, size),      // vue de dessus (sol, murs, obstacles) sur canvas 2D
  pathPoints:[[x,z],...],              // points de navigation pour les bots (circuit/maillage de l'arène)
  groundHeight(x,z) -> y,              // 0 par défaut, hauteur de rampe/plateforme si dedans
  resolve(pos, radius) -> bool,        // repousse pos hors des solides (XZ) ; renvoie true si collision
  resolveFull(pos, vel, radius) -> {hit:bool, nx, nz},  // idem + rebond : annule la composante normale de vel
  raycast(origin, dir, maxDist) -> {hit:bool, dist, point:[x,y,z], normal:[x,y,z], solid},
  lineOfSight(a, b) -> bool,
  randomPoint() -> [x,y,z],
  nearestPad(pos) -> [x,z]|null,
  outOfBounds(pos) -> bool
}
```

Contraintes : `resolve` doit être O(nb solides) avec un early-out par AABB élargi ;
les maps doivent être **jouables** : pas de cul-de-sac mortel, pas d'obstacle sur un
spawn, des lignes de tir depuis la plupart des positions, des rampes menant aux
plateformes. `groundHeight` gère rampes (plan incliné) et plateformes (y constant).

## C2. `kart.js` — physique + rendu des karts

```js
NB.kart.create(opts) -> kart            // opts={id,name,color,accent,isPlayer,isBot,pos:[x,z],yaw,arena,difficulty}
NB.kart.reset(kart, x, z, yaw)          // remise au sol, invulnT=2
NB.kart.update(kart, input, dt)         // physique complète + collisions arène + karts entre eux gérés par NB.kart.collideKarts(dt)
NB.kart.collideKarts(dt)                // collisions kart-kart (bump), appelé une fois par frame
NB.kart.damage(kart, byId, weapon, power) -> bool  // true si éliminé ; gère shield/invuln, pousse l'event 'kill'
NB.kart.giveWeapon(kart, kind)
NB.kart.drawAll()                       // dessine tous les karts vivants + fantômes de respawn
NB.kart.drawOne(kart)                   // un kart (utilisé par hud pour les portraits)
NB.kart.mesh                            // mesh unique partagé, instancié par couleur via drawTinted
NB.kart.stats(kart) -> { speedKmh, drifting, airborne }
NB.kart.maxSpeed                        // ~ 26 m/s (94 km/h) ; boost -> 38
NB.kart.accel, NB.kart.turnRate         // constantes exposées et tunables
```

Physique attendue (arcade, nerveuse, « drift » signé Smash Karts) :
- accélération progressive, vitesse max, freinage, marche arrière lente ;
- direction dépendante de la vitesse (plus vif à basse vitesse) ;
- **drift** (bouton drift + steer) : angle de dérive, perte d'adhérence latérale,
  charge `driftCharge` qui donne un **mini-boost** au relâchement (comme Mario Kart) ;
- adhérence latérale : `vel` partiellement reprojeté sur l'axe du kart ;
- rampes : décollage quand la vitesse verticale dépasse le sol → `onGround=false`,
  gravité `NB.GRAVITY`, contrôle aérien réduit (yaw 40 %), atterrissage avec rebond léger ;
- collision murs/obstacles via `arena.resolveFull` + perte de vitesse (facteur 0.35) + `flashT` ;
- bump kart-kart : séparation + transfert d'impulsion ;
- huile (`oilT>0`) : adhérence ×0.25, steer amplifié, impossible de drifter ;
- `freezeT>0` : vitesse max ×0.45 ;
- respawn : `alive=false`, `respawnIn` décroît, réapparition avec `invulnT=2`.

Rendu : châssis orienté par `yaw` + inclinaison (`tiltX` freinage/accélération,
`tiltZ` virage/drift), roues qui tournent (`wheelSpin`), teinte rouge quand
`flashT>0`, halo de shield si `shieldT>0`, flammes de boost si `boostT>0`
(→ passer par `NB.fx.trail(...)`), ombre portée au sol (sprite aplati via
`NB.fx.shadow(x,z,r,alpha)`).

## C3. `pickups.js` — boîtes de power-up

```js
NB.pickups.init(arena)                  // crée les pickups sur arena.pads
NB.pickups.update(dt)                   // rotation/float + respawn (pad libre -> nouveau pickup après 4-6 s)
NB.pickups.draw()
NB.pickups.tryPick(kart) -> kind|null   // appelé par main.js pour chaque kart vivant (rayon 1.4)
NB.pickups.roll(kart) -> kind           // tirage pondéré selon l'état du kart (pas de doublon d'arme si déjà armé,
                                        // favorise shield/boost si le kart est en tête, etc.)
NB.pickups.KINDS = ['rocket','homing','mine','oil','grenade','shield','boost','ram']
NB.pickups.WEIGHTS = {...}
NB.pickups.list                          // pickups actifs [{id,pos:[x,y,z],kind,color,mesh,mat,taken,t}]
NB.pickups.reset()
```

Chaque pickup : cube/gemme flottant qui tourne, halo au sol, couleur par type
(rocket = rouge/orange, homing = violet, mine = gris/jaune, oil = noir/vert,
grenade = vert, shield = cyan, boost = jaune, ram = blanc/rouge).

## C4. `weapons.js` — projectiles, pièges, explosions

```js
NB.weapons.init()
NB.weapons.update(dt)              // projectiles + hazards + collisions + dégâts
NB.weapons.draw()
NB.weapons.fire(kart) -> bool      // consomme l'arme ; false si pas d'arme / cooldown
NB.weapons.activate(kart) -> bool  // shield / boost / ram (usage immédiat)
NB.weapons.explode(pos, radius, power, byId, color)  // dégâts de zone + event 'boom'
NB.weapons.SPECS = { rocket:{speed:42,life:3,r:0.35,blast:3.2}, homing:{...}, grenade:{...},
                     mine:{...}, oil:{...}, shield:{dur:5}, boost:{dur:2.2}, ram:{dur:3} }
NB.weapons.cooldown(kart) -> bool
```

Comportements :
- **rocket** : vol droit, explose au contact d'un solide/kart, blast 3.2 m ;
- **homing** : verrouille le kart vivant le plus proche dans un cône de 60° devant,
  virage limité, traînée de fumée, blast 3.0 ;
- **grenade** : lob parabolique (vy=+9), rebondit, fuse 1.8 s, blast 4.0 ;
- **mine** : se pose au sol derrière le kart, invisible 0.6 s puis clignote,
  armée 20 s, blast 3.5, déclenchement par proximity 1.6 m ;
- **oil** : flaque au sol 8 s, rayon 2.2 → `oilT=1.6` sur les karts qui passent ;
- **shield** : bulle 5 s, annule UNE attaque puis disparaît (ou expire) ;
- **boost** : 2.2 s de vitesse max ×1.5 + accélération ×2 + invulnérabilité aux bumps ;
- **ram** : 3 s, le kart devient un bélier : tout contact **élimine** la cible et
  donne un petit boost ; visuel : lame avant + étincelles.

Un kart touché = **éliminé** (pas de barre de vie), sauf shield/invuln.
`explode()` crédite le tueur (`byId`) → `NB.kart.damage` → event `kill`.
Suicide possible (son propre blast) → event `kill` avec `killerId === victimId`.
Traînée de fumée/étincelles via `NB.fx.*` (ne pas créer de particules maison).

## C5. `bots.js` — IA

```js
NB.bots.attach(kart, arena, difficulty)   // crée kart.ai
NB.bots.update(kart, dt) -> input          // retourne l'input du bot (même format que le joueur)
NB.bots.NAMES = [ 'Volt','Rico','Nova','Blitz','Tango','Ziggy','Koda','Rex','Sly','Fang' ]
NB.bots.tune(difficulty) -> { aim:0..1, react:0..2 s, aggression:0..1, topSpeedMul:0.85..1.05, mistakeRate:0..0.4 }
```

Comportement attendu (machine à états simple : `roam` → `hunt pickup` → `attack` → `evade`) :
- aller chercher le power-up le plus « rentable » (distance + danger), en suivant
  `arena.pathPoints` pour éviter les obstacles ;
- viser : anticipation de la cible (lead) selon `aim`, tir seulement si
  `arena.lineOfSight` et dans le cône ; poser mine/huile en fuite ou dans un passage ;
- esquiver : si un projectile arrive dans un rayon de 8 m et vise le bot → coup de
  volant latéral + drift ; activer shield/boost à bon escient ;
- éviter les murs (rayon court devant), ne pas rester bloqué (détection `speed<1`
  pendant 1 s → marche arrière + braquage aléatoire) ;
- personnalités : chaque bot a un biais (agressif / campard / chasseur de power-ups)
  + un `mistakeRate` qui simule les erreurs humaines.

## C6. `fx.js` — particules, traces, caméra

```js
NB.fx.init()
NB.fx.update(dt)
NB.fx.draw()                       // batch + sprites
NB.fx.reset()
NB.fx.onEvent(e)                   // réagit aux events du jeu (kill/boom/hit/pickup/respawn/go)
// API d'émission (appelable partout) :
NB.fx.smoke(pos, vel, size, color, life)
NB.fx.spark(pos, vel, color, life)
NB.fx.fire(pos, size, life)
NB.fx.debris(pos, color, count)
NB.fx.trail(pos, color, size)      // traînée courte (boost, dérive)
NB.fx.skid(pos, yaw, width, alpha) // marque au sol persistante (max 400, FIFO)
NB.fx.shadow(x, z, r, alpha)       // ombre aplatie
NB.fx.ring(pos, radius, color, life)   // onde de choc
NB.fx.beam(a, b, color, life)
NB.fx.text3d(pos, str, color, life)    // petit texte flottant (billboard via sprites)
NB.fx.shake(amount)                // alimente NB.game.shake / cam.shake
NB.fx.speedLines(intensity)        // effet de vitesse écran (via hud si besoin)
NB.fx.hitFlash(color)              // demande un flash plein écran (hud le consomme)
NB.fx.count                        // nb particules vivantes (plafond 900, recyclage)
```

Budget : 900 particules max, pool réutilisé (zéro allocation par frame si possible).
Les marques de dérive vivent 6 s, max 400 quads.

## C7. `audio.js` — WebAudio 100 % synthétique

```js
NB.audio.init()                  // lazy, après un geste utilisateur (voir main.js)
NB.audio.resume()
NB.audio.setEnabled(bool) NB.audio.enabled NB.audio.setVolume(v) NB.audio.volume
NB.audio.setMusic(bool)
NB.audio.onEvent(e)              // kill/boom/pickup/count/go/matchEnd/hit
NB.audio.engine(kart, dt)        // moteur du joueur : 2 oscillateurs + filtre, rpm lié à la vitesse
NB.audio.skid(intensity)         // bruit de dérive (noise filtré), intensity 0..1
NB.audio.nearby(pos, kind, gain) // sons spatialisés simplifiés (volume selon distance)
NB.audio.ui(kind)                // 'click'|'back'|'hover'|'error'|'select'
NB.audio.music(track)            // boucle procédurale (menu / match / fin)
NB.audio.stopAll()
```

Aucun fichier audio : tout en oscillateurs/noise buffers générés. Volume master
`0.6`, limite dure : pas plus de ~24 voix simultanées.

## C8. `hud.js` — interface DOM/CSS + menus + tactile

Uniquement dans `<div id="ui">` (innerHTML + CSS injecté par `NB.hud.injectCSS()`).
**Aucune image externe** : icônes en emoji/SVG inline/CSS.

```js
NB.hud.init()                    // construit le DOM, branche les écouteurs
NB.hud.injectCSS()
NB.hud.update(dt)                // HUD en jeu (temps, kills, position, arme, vitesse)
NB.hud.onEvent(e)                // killfeed, flashes, compte à rebours, fin de match
NB.hud.screen(name, data)        // 'menu'|'maps'|'mode'|'playing'|'paused'|'results'|'help'|'customize'
NB.hud.drawMinimap()             // canvas 2D 160x160 : arène (arena.drawMinimap) + karts + pickups
NB.hud.onInput                    // callbacks posés par main.js :
   // { onStart(mapId, mode, difficulty), onResume(), onRestart(), onMenu(), onQuit(),
   //   onCustomize(color, name), onToggleAudio(), onToggleMusic() }
NB.hud.touch                      // { active:bool, move:{x,y}, fire:bool, drift:bool, use:bool }
NB.hud.setTouchVisible(bool)
NB.hud.results(data)              // classement final, kills/deaths, meilleur temps, médaille
NB.hud.persist                    // meilleurs scores / réglages via NB.util.store
NB.hud.killfeed                   // 5 dernières lignes max
```

Écrans demandés : **menu principal** (titre animé, Jouer, Maps, Mode, Difficulté,
Personnaliser, Aide, Son), **sélection de map** (4 cartes avec aperçu miniature et
tagline), **mode** (Deathmatch 3 min / Elimination 3 vies), **personnalisation**
(nom + 8 couleurs de kart), **aide** (commandes clavier/souris/tactile), **pause**,
**résultats** (podium, kills, précision, rejouer/menu).

HUD en jeu : chrono, compteur de kills + position (1/8), arme et son icône,
mini-carte, killfeed, indicateur de respawn, compteur de vitesse, alertes
(missile verrouillé → flèche directionnelle vers la menace).

Tactile : joystick virtuel gauche, boutons droite (tir, drift, bonus). Détecter
`'ontouchstart' in window` et afficher automatiquement.

## C9. `main.js` — boucle et règles (écrit par `b`, ne pas écrire)

---

# PARTIE D — Règles de match (rappel pour tous)

- **Deathmatch** : 3 min, le plus de kills gagne. Respawn 2.5 s, invulnérable 2 s.
- **Elimination** : 3 vies chacun, dernier vivant gagne ; zone sans rétrécissement.
- 8 karts : joueur + 7 bots. Noms via `NB.bots.NAMES`, couleurs distinctes.
- Compte à rebours 3-2-1-GO avant le départ (les karts ne bougent pas pendant `countdown`).
- Classement final par kills puis deaths.
- Les meilleurs scores sont persistés (`NB.util.store`, clé `nb.best.<mapId>.<mode>`).

# PARTIE E — Style visuel

Low-poly néon « arcade » : couleurs saturées, soleil directionnel, fog coloré,
ciel dégradé, sol en damier/panneaux, arêtes sombres. Chaque map a son thème
(désert, néon nocturne, glace, usine/lave). Cohérence : pas de textures, uniquement
des couleurs par sommet.
