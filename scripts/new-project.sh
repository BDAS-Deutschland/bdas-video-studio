#!/usr/bin/env bash
# Legt projects/<name>/ mit Ordnern und Vorlagen an.
set -euo pipefail
cd "$(dirname "$0")/.."

name="${1:?Aufruf: pnpm new <projektname>}"
dir="projects/$name"
[ -e "$dir" ] && { echo "✗ $dir existiert schon"; exit 1; }

mkdir -p "$dir"/{raw,refs,music,log,renders}
cp templates/brief.md templates/beats.md templates/script.md "$dir/"
cat > "$dir/timeline.json" <<JSON
{
  "format": "9:16",
  "fps": 30,
  "captions": true,
  "scenes": [
    { "id": "start", "type": "card", "title": "$name", "duration": 2 }
  ],
  "overlays": []
}
JSON
echo "✓ $dir angelegt – Rohmaterial nach $dir/raw/ legen, dann: pnpm ingest $name"
