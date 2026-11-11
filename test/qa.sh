#!/bin/bash
# test/qa.sh : capture TOUTES les scènes QA dans test/qa/ (Chrome headless, WebGL logiciel).
# Usage : ./test/qa.sh [scene]   (sans argument = tout)
ROOT=/home/baptiste/Bureau/nitro-brawl
mkdir -p "$ROOT/test/qa"
D=/tmp/nbqa-$$; mkdir -p "$D"
cp "$ROOT/dist/index.offline.html" "$D/index.html"

shot() { # nom  params  [largeur hauteur]
  local W=${3:-1000} H=${4:-640}
  local UD; UD=$(mktemp -d)
  timeout 120 google-chrome --headless=new --no-sandbox --disable-gpu --use-gl=angle \
    --use-angle=swiftshader --enable-unsafe-swiftshader --allow-file-access-from-files \
    --hide-scrollbars --user-data-dir=$UD --window-size=$W,$H --virtual-time-budget=9000 \
    --screenshot="$ROOT/test/qa/$1.png" --dump-dom "file://$D/index.html?$2" 2>/dev/null \
    | grep -o '<title>[^<]*' | head -1 | sed "s|^|  $1 : |"
}

run_all() {
  shot qa_kart      "qa=kart"
  shot qa_arena0    "qa=arena0"
  shot qa_arena1    "qa=arena1"
  shot qa_arena2    "qa=arena2"
  shot qa_arena3    "qa=arena3"
  shot qa_fx        "qa=fx"
  shot qa_pickups   "qa=pickups"
  shot qa_ingame    "qa=ingame"
  shot qa_touch     "qa=touch"
  shot qa_touch_portrait "qa=touch" 480 860
  shot ui_menu      "screen=menu"
  shot ui_maps      "screen=maps"
  shot ui_mode      "screen=mode"
  shot ui_customize "screen=customize"
  shot ui_help      "screen=help"
  shot ui_paused    "screen=paused"
  shot ui_results   "screen=results"
  shot ui_results_portrait "screen=results" 480 860
  shot ui_menu_portrait "screen=menu" 480 860
}

if [ -n "$1" ]; then
  case "$1" in
    portrait) shot qa_touch_portrait "qa=touch" 480 860; shot ui_results_portrait "screen=results" 480 860; shot ui_menu_portrait "screen=menu" 480 860 ;;
    *) shot "$1" "$2" ${3:-1000} ${4:-640} ;;
  esac
else
  run_all
fi
rm -rf "$D"
echo "captures dans $ROOT/test/qa/"
