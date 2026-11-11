#!/bin/bash
# test/visual.sh <page.html> <out.png> [size]  — copie fraîche pour éviter le cache file://
set -e
PAGE="$1"; OUT="$2"; SIZE="${3:-1280,800}"
D=/tmp/nbv-$$
mkdir -p "$D/test" "$D/src"
cp /home/baptiste/Bureau/nitro-brawl/src/*.js "$D/src/"
cp "/home/baptiste/Bureau/nitro-brawl/test/$PAGE" "$D/test/"
cd "$D"
timeout 120 google-chrome --headless=new --no-sandbox --disable-gpu --use-gl=angle \
  --use-angle=swiftshader --enable-unsafe-swiftshader --allow-file-access-from-files \
  --hide-scrollbars --user-data-dir=$(mktemp -d) --window-size=$SIZE --virtual-time-budget=8000 \
  --screenshot="/home/baptiste/Bureau/nitro-brawl/test/$OUT" --dump-dom "file://$D/test/$PAGE" 2>/dev/null \
  | grep -o '<title>[^<]*' | head -1
rm -rf "$D"
