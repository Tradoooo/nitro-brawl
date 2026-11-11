#!/bin/bash
# Lance NITRO BRAWL dans le meilleur navigateur dispo sur ce poste.
cd "$(dirname "$0")" || exit 1
URL="${1:-http://127.0.0.1:8745/index.offline.html}"
# serveur local si absent
curl -s -o /dev/null --max-time 2 http://127.0.0.1:8745/ || { (cd dist && nohup python3 -m http.server 8745 >/tmp/nbhttp.log 2>&1 &); sleep 1; }
if command -v firefox >/dev/null && firefox-ok 2>/dev/null; then :; fi
if command -v firefox >/dev/null; then
  echo "Ouverture dans Firefox (WebGL logiciel Mesa OK sur ce poste)…"
  DISPLAY=:0 nohup firefox --new-window "$URL" >/dev/null 2>&1 &
else
  echo "Ouverture dans Chrome avec WebGL logiciel (profil séparé)…"
  DISPLAY=:0 nohup google-chrome --new-window --user-data-dir=/tmp/nbchrome-sw \
    --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader "$URL" >/dev/null 2>&1 &
fi
