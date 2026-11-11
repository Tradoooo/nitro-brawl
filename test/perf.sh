#!/bin/bash
# test/perf.sh [frames] : mesure réelle (pas de virtual-time)
FR="${1:-600}"
D=/tmp/nbperf-$$
mkdir -p "$D"; cp /home/baptiste/Bureau/nitro-brawl/dist/index.offline.html "$D/"
cd "$D"
timeout 120 google-chrome --headless=new --no-sandbox --disable-gpu --use-gl=angle \
  --use-angle=swiftshader --enable-unsafe-swiftshader --allow-file-access-from-files \
  --hide-scrollbars --user-data-dir=$(mktemp -d) --window-size=1280,800 --virtual-time-budget=30000 \
  --run-all-compositor-stages-before-draw --dump-dom "file://$D/index.html?selftest=$FR" 2>/dev/null \
  | grep -o '"perFrame":[0-9.]*\|"ms":[0-9]*\|"fps":[0-9]*\|"tris":[0-9]*\|"calls":[0-9]*' | head -6
rm -rf "$D"
