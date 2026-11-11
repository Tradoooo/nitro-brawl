#!/bin/bash
# test/qa.sh : capture toutes les scènes QA dans test/qa/
mkdir -p /home/baptiste/Bureau/nitro-brawl/test/qa
D=/tmp/nbqa-$$; mkdir -p "$D"
cp /home/baptiste/Bureau/nitro-brawl/dist/index.offline.html "$D/index.html"
shot() {
  UD=$(mktemp -d)
  timeout 90 google-chrome --headless=new --no-sandbox --disable-gpu --use-gl=angle \
    --use-angle=swiftshader --enable-unsafe-swiftshader --allow-file-access-from-files \
    --hide-scrollbars --user-data-dir=$UD --window-size=1000,640 --virtual-time-budget=6000 \
    --screenshot="/home/baptiste/Bureau/nitro-brawl/test/qa/$1.png" --dump-dom "file://$D/index.html?$2" 2>/dev/null \
    | grep -o '<title>[^<]*' | head -1 | sed "s/^/  $1 : /"
}
shot qa_kart      "qa=kart"
shot qa_arena0    "qa=arena0"
shot qa_arena1    "qa=arena1"
shot qa_arena2    "qa=arena2"
shot qa_arena3    "qa=arena3"
shot qa_fx        "qa=fx"
shot qa_pickups   "qa=pickups"
shot ui_menu      "screen=menu"
shot ui_maps      "screen=maps"
shot ui_mode      "screen=mode"
shot ui_customize "screen=customize"
shot ui_help      "screen=help"
shot ui_paused    "screen=paused"
shot ui_results   "screen=results"
rm -rf "$D"
echo "captures dans test/qa/"
