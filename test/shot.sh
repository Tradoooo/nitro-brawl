#!/bin/bash
# test/shot.sh <out.png> [url-suffix] [budget]
OUT="$1"; SUFFIX="${2:-}"; BUDGET="${3:-6000}"
D=/tmp/nbshot-$$
mkdir -p "$D"
cp /home/baptiste/Bureau/nitro-brawl/dist/index.offline.html "$D/index.html"
cd "$D"
timeout 120 google-chrome --headless=new --no-sandbox --disable-gpu --use-gl=angle \
  --use-angle=swiftshader --enable-unsafe-swiftshader --allow-file-access-from-files \
  --hide-scrollbars --user-data-dir=$(mktemp -d) --window-size=1280,800 --virtual-time-budget=$BUDGET \
  --screenshot="/home/baptiste/Bureau/nitro-brawl/test/$OUT" --dump-dom "file://$D/index.html$SUFFIX" 2>/dev/null \
  | grep -o '<title>[^<]*' | head -1
rm -rf "$D"
