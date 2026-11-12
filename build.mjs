// Build : assemble src/*.js dans UN SEUL dist/index.html (+ variante offline avec Three.js inliné).
// Usage : node build.mjs [--check]
//   dist/index.html          -> Three.js via CDN (fichier léger, ~165 Ko)
//   dist/index.offline.html  -> Three.js inliné (autonome, ~770 Ko, marche hors-ligne / file://)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ORDER = [
  'math.js', 'gl.js', 'mesh.js', 'util.js', 'gltf.js', 'models.js', 'maps.js', 'arena.js', 'kart.js',
  'pickups.js', 'weapons.js', 'bots.js', 'fx.js', 'audio.js', 'hud-css.js', 'hud.js', 'input.js', 'camera.js', 'qa.js', 'main.js'
];

const THREE_CDN = 'https://unpkg.com/three@0.149.0/build/three.min.js';
const THREE_LOCAL = 'vendor/three.min.js';

const SHELL_HEAD = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#0b0e1a">
<meta name="description" content="Nitro Brawl — arène de karts armés : 8 pilotes, power-ups, éliminations. Jouable au clavier, à la souris, au tactile et à la manette. Rendu Three.js.">
<title>NITRO BRAWL — Kart Arena Brawl</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{width:100%;height:100%;overflow:hidden;background:#0b0e1a;color:#eaf0ff;
font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
touch-action:none;user-select:none;-webkit-user-select:none;overscroll-behavior:none}
#gl{position:fixed;inset:0;width:100%;height:100%;display:block}
#ui{position:fixed;inset:0;pointer-events:none;z-index:10}
#ui button,#ui a,#ui input,#ui [data-click]{pointer-events:auto}
#touch{position:fixed;inset:0;pointer-events:none;z-index:20}
.nb-hidden{display:none !important}
@keyframes nbPop{from{transform:scale(.86);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes nbSlide{from{transform:translateX(28px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes nbPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
</style>
</head>
<body>
<canvas id="gl"></canvas>
<div id="ui"></div>
<div id="touch"></div>
`;

const SHELL_FOOT = `
</body>
</html>
`;

const onlyCheck = process.argv.includes('--check');
const parts = [];
let problems = 0;

for (const f of ORDER) {
  const path = 'src/' + f;
  if (!existsSync(path)) { console.error(`MANQUE ${path}`); problems++; continue; }
  const code = readFileSync(path, 'utf8');
  const lines = code.split('\n').length;
  if (lines > 500) { console.error(`TROP LONG ${path} : ${lines} lignes (>500)`); problems++; }
  try { execSync(`node --check ${path}`, { stdio: 'pipe' }); }
  catch (e) { console.error(`SYNTAXE KO ${path}\n${e.stderr?.toString().slice(0, 600)}`); problems++; }
  parts.push(`/* ==== ${f} (${lines} lignes) ==== */\n${code.trim()}\n`);
}

if (problems) { console.error(`\n${problems} problème(s) — build non écrit.`); process.exit(1); }
if (onlyCheck) { console.log('OK : tous les modules présents, syntaxe valide.'); process.exit(0); }

const bundle = parts.join('\n');
mkdirSync('dist', { recursive: true });

// 1) variante CDN (légère)
const cdnHtml = SHELL_HEAD + `<script src="${THREE_CDN}"></script>\n<script>\n${bundle}\n</script>` + SHELL_FOOT;
writeFileSync('dist/index.html', cdnHtml, 'utf8');
writeFileSync('index.html', cdnHtml, 'utf8');   // racine du repo : servi tel quel par GitHub Pages

// 2) variante autonome (Three.js inliné)
let threeSrc = '';
if (existsSync(THREE_LOCAL)) threeSrc = readFileSync(THREE_LOCAL, 'utf8');
if (threeSrc) {
  const offHtml = SHELL_HEAD + `<script>${threeSrc}\n</script>\n<script>\n${bundle}\n</script>` + SHELL_FOOT;
  writeFileSync('dist/index.offline.html', offHtml, 'utf8');
  console.log(`dist/index.offline.html : ${(Buffer.byteLength(offHtml) / 1024).toFixed(0)} Ko (Three.js inliné)`);
} else {
  console.log('(!) vendor/three.min.js absent — variante offline non générée.');
}
console.log(`dist/index.html          : ${(Buffer.byteLength(cdnHtml) / 1024).toFixed(0)} Ko (Three.js via CDN), ${ORDER.length} modules.`);
