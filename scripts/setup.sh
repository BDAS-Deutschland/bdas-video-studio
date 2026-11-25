#!/usr/bin/env bash
# Einmalige Einrichtung: Programme, Node-Pakete, Whisper-Modell, Python-Analyse (MediaPipe, librosa),
# MediaPipe-Modelle und die selbst erzeugte Sound-Bibliothek. Alles kostenlos und offline nutzbar.
set -euo pipefail
cd "$(dirname "$0")/.."

MODEL_NAME="ggml-large-v3-turbo-q5_0.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}"
MP_BASE="https://storage.googleapis.com/mediapipe-models"
MP_MODELS=(
  "pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
  "face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
  "image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
)

for bin in ffmpeg ffprobe whisper-cli uv; do
  if ! command -v "$bin" >/dev/null; then
    echo "→ installiere ffmpeg, whisper-cpp und uv über Homebrew"
    brew install ffmpeg whisper-cpp uv
    break
  fi
done

pnpm install

mkdir -p models/mediapipe
if [ ! -f "models/${MODEL_NAME}" ]; then
  echo "→ lade Whisper-Modell (~550 MB) von huggingface.co/ggerganov/whisper.cpp"
  curl -L --fail -o "models/${MODEL_NAME}.part" "$MODEL_URL"
  mv "models/${MODEL_NAME}.part" "models/${MODEL_NAME}"
fi

# Python-Werkzeuge (~550 MB): Tracking, Freisteller, Beats, Hook-Analyse, Soundeffekte.
if [ ! -x .venv/bin/python ]; then
  echo "→ richte Python 3.12 in .venv ein"
  uv venv .venv --python 3.12
fi
VIRTUAL_ENV=.venv uv pip install --quiet -r scripts/py/requirements.txt

for m in "${MP_MODELS[@]}"; do
  f="models/mediapipe/$(basename "$m")"
  if [ ! -f "$f" ]; then
    echo "→ lade MediaPipe-Modell $(basename "$m") von storage.googleapis.com"
    curl -sL --fail -o "$f.part" "$MP_BASE/$m"
    mv "$f.part" "$f"
  fi
done

# Remotion-Skills für Claude Code (aus remotion-dev/skills, nicht im Repository mitgeliefert).
if [ ! -e .claude/skills/remotion-best-practices ]; then
  echo "→ installiere Remotion-Skills für Claude Code"
  npx --yes remotion skills add
fi

if [ ! -f brand/sfx/sfx.json ]; then
  echo "→ erzeuge Soundeffekte in brand/sfx"
  .venv/bin/python scripts/py/make_sfx.py brand/sfx
fi

echo "✓ fertig"
