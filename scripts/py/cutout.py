"""Person freistellen (MediaPipe-Segmentierung, offline) → WebM mit Alphakanal.

Aufruf (macht pnpm cutout): cutout.py <video> <in> <out> <fps> <width> <height> <ziel.webm>
Der Ausschnitt [in, out] wird mit der Bildrate der Zeitleiste ausgegeben, damit er Bild für Bild
über dem Originalclip liegt. Kanten: Maske hochskaliert mit Guided Filter am Originalbild, zeitlich geglättet.
"""

import argparse
import subprocess
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

MODEL = Path(__file__).resolve().parents[2] / "models" / "mediapipe" / "selfie_multiclass_256x256.tflite"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("t_in", type=float)
    ap.add_argument("t_out", type=float)
    ap.add_argument("fps", type=float)
    ap.add_argument("width", type=int)
    ap.add_argument("height", type=int)
    ap.add_argument("dest")
    ap.add_argument("--max-side", type=int, default=1920)
    a = ap.parse_args()

    s = min(1.0, a.max_side / max(a.width, a.height))
    w, h = int(round(a.width * s / 2) * 2), int(round(a.height * s / 2) * 2)
    dur = a.t_out - a.t_in
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-ss", f"{a.t_in:.3f}", "-i", a.video, "-t", f"{dur:.3f}", "-vf", f"fps={a.fps},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    tmp = Path(a.dest).with_suffix(".part.webm")
    enc = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}", "-r", str(a.fps), "-i", "-",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "24", "-deadline", "good", "-cpu-used", "5",
            "-row-mt", "1", "-auto-alt-ref", "0", "-an", str(tmp),
        ],
        stdin=subprocess.PIPE,
    )
    seg = vision.ImageSegmenter.create_from_options(
        vision.ImageSegmenterOptions(
            base_options=mpt.BaseOptions(model_asset_path=str(MODEL)),
            running_mode=vision.RunningMode.VIDEO,
            output_confidence_masks=True,
            output_category_mask=False,
        )
    )
    size = w * h * 3
    prev = None
    n = 0
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        rgb = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        res = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(n * 1000 / a.fps))
        # Klasse 0 = Hintergrund; Person = 1 − Hintergrund (Haare, Körper, Gesicht, Kleidung).
        person = 1.0 - res.confidence_masks[0].numpy_view().astype(np.float32)
        person = cv2.resize(person, (w, h), interpolation=cv2.INTER_LINEAR)
        guide = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
        person = cv2.ximgproc.guidedFilter(guide, person, radius=max(4, w // 160), eps=1e-3)
        if prev is not None:
            person = 0.65 * person + 0.35 * prev  # gegen Flackern
        prev = person
        alpha = np.clip((person - 0.35) / 0.3, 0, 1)
        rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
        enc.stdin.write(rgba.tobytes())
        n += 1
    dec.wait()
    enc.stdin.close()
    enc.wait()
    if enc.returncode != 0 or n == 0:
        raise SystemExit(f"Freistellen fehlgeschlagen ({n} Bilder)")
    tmp.replace(a.dest)
    print(f"  Freisteller: {n} Bilder → {a.dest}")


if __name__ == "__main__":
    main()
