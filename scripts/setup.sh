#!/usr/bin/env bash
# Einmalige Einrichtung: Programme, Node-Pakete, Whisper-Modell.
set -euo pipefail
cd "$(dirname "$0")/.."

MODEL_NAME="ggml-large-v3-turbo-q5_0.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}"

for bin in ffmpeg ffprobe whisper-cli; do
  if ! command -v "$bin" >/dev/null; then
    echo "→ installiere ffmpeg und whisper-cpp über Homebrew"
    brew install ffmpeg whisper-cpp
    break
  fi
done

pnpm install

mkdir -p models
if [ ! -f "models/${MODEL_NAME}" ]; then
  echo "→ lade Whisper-Modell (~550 MB) von huggingface.co/ggerganov/whisper.cpp"
  curl -L --fail -o "models/${MODEL_NAME}.part" "$MODEL_URL"
  mv "models/${MODEL_NAME}.part" "models/${MODEL_NAME}"
fi

echo "✓ fertig"
