"""Gesicht und Körper im Zeitverlauf (MediaPipe, offline) → track.json + track.md.

Aufruf (macht pnpm analyze): track.py <video> <width> <height> <out_dir> [--fps 10]
width/height = angezeigte Größe (nach Drehung), aus meta.json.

track.json: {"fps": 10, "samples": [{"t": 1.2, "face": [cx, cy, w, h] | null, "pose": {...} | null}]}
            Koordinaten als Anteile des Bildes (0–1), Ursprung oben links.
track.md:   lesbare Zusammenfassung – wo das Gesicht ist, Gesten mit Zeiten und Bildposition.
"""

import argparse
import json
import subprocess
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

MODELS = Path(__file__).resolve().parents[2] / "models" / "mediapipe"
POSE_IDX = {"nose": 0, "ls": 11, "rs": 12, "le": 13, "re": 14, "lw": 15, "rw": 16, "li": 19, "ri": 20}


def decode(path, fps, w, h, max_side=640):
    s = max_side / max(w, h)
    sw, sh = int(round(w * s / 2) * 2), int(round(h * s / 2) * 2)
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={fps},scale={sw}:{sh}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = sw * sh * 3
    i = 0
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield i / fps, np.frombuffer(buf, np.uint8).reshape(sh, sw, 3)
        i += 1
    proc.wait()


def r3(v):
    return round(float(v), 3)


def analyse(path, w, h, fps):
    face_det = vision.FaceDetector.create_from_options(
        vision.FaceDetectorOptions(
            base_options=mpt.BaseOptions(model_asset_path=str(MODELS / "blaze_face_short_range.tflite")),
            running_mode=vision.RunningMode.VIDEO,
            min_detection_confidence=0.5,
        )
    )
    pose_det = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(
            base_options=mpt.BaseOptions(model_asset_path=str(MODELS / "pose_landmarker_full.task")),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
    )
    samples = []
    for t, frame in decode(path, fps, w, h):
        ih, iw = frame.shape[:2]
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        ts = int(t * 1000)
        face = None
        det = face_det.detect_for_video(image, ts)
        if det.detections:
            b = max(det.detections, key=lambda d: d.bounding_box.width * d.bounding_box.height).bounding_box
            face = [r3((b.origin_x + b.width / 2) / iw), r3((b.origin_y + b.height / 2) / ih), r3(b.width / iw), r3(b.height / ih)]
        pose = None
        res = pose_det.detect_for_video(image, ts)
        if res.pose_landmarks:
            lm = res.pose_landmarks[0]
            pose = {k: [r3(lm[i].x), r3(lm[i].y), r3(lm[i].visibility)] for k, i in POSE_IDX.items()}
            if face is None and lm[0].visibility > 0.6:
                # Gesicht aus Nase/Ohren schätzen, wenn der Gesichtsdetektor nichts findet (z. B. Profil).
                ears = [lm[7], lm[8]]
                fw = abs(ears[0].x - ears[1].x) * 1.6 or 0.12
                face = [r3(lm[0].x), r3(lm[0].y), r3(fw), r3(fw * w / h * 1.3)]
        samples.append({"t": round(t, 2), "face": face, "pose": pose})
    return samples


def gestures(samples, fps):
    """Gesten aus den Körperpunkten. Seiten = Bildseiten (links/rechts im Bild)."""
    labels = []
    prev = None
    for s in samples:
        p = s["pose"]
        lab = []
        if p:
            ls, rs = np.array(p["ls"][:2]), np.array(p["rs"][:2])
            shoulder_w = max(abs(ls[0] - rs[0]), 0.05)
            cx = (ls[0] + rs[0]) / 2
            sy = (ls[1] + rs[1]) / 2
            for wk, sk, ek in (("lw", "ls", "le"), ("rw", "rs", "re")):
                wv = p[wk]
                if wv[2] < 0.5 or wv[1] > 1.0:
                    continue
                wx, wy = wv[0], wv[1]
                sx, syy = p[sk][0], p[sk][1]
                ex, ey = p[ek][0], p[ek][1]
                upper = np.hypot(ex - sx, ey - syy)
                lower = np.hypot(wx - ex, wy - ey)
                reach = np.hypot(wx - sx, wy - syy)
                straight = reach > 0.8 * (upper + lower)
                if wy < sy - 0.04:
                    lab.append(("Hand oben", wx, wy))
                if straight and abs(wx - cx) > 1.25 * shoulder_w and abs(wy - sy) < 2.0 * shoulder_w:
                    side = "rechts" if wx > cx else "links"
                    lab.append((f"zeigt nach {side} (im Bild)", wx, wy))
                f = s["face"]
                if f and abs(wx - f[0]) < f[2] * 0.9 and abs(wy - f[1]) < f[3] * 0.9:
                    lab.append(("Hand am Gesicht", wx, wy))
            if prev and prev["pose"]:
                pp = prev["pose"]
                speed = 0
                for wk in ("lw", "rw"):
                    if p[wk][2] > 0.5 and pp[wk][2] > 0.5:
                        speed = max(speed, np.hypot(p[wk][0] - pp[wk][0], p[wk][1] - pp[wk][1]) * fps / shoulder_w)
                if speed > 2.2:
                    lab.append(("starke Handbewegung", p["lw"][0] if p["lw"][2] > p["rw"][2] else p["rw"][0], p["lw"][1] if p["lw"][2] > p["rw"][2] else p["rw"][1]))
        labels.append((s["t"], lab))
        prev = s
    # Gleiche Gesten zu Zeitbereichen zusammenfassen (Lücken bis 0,2 s überbrücken, mindestens 0,3 s).
    events = []
    open_ = {}
    step = 1 / fps
    for t, lab in labels:
        names = {n: (x, y) for n, x, y in lab}
        for n in list(open_):
            if n not in names and t - open_[n]["end"] > 0.2 + 1e-6:
                events.append(open_.pop(n))
        for n, (x, y) in names.items():
            e = open_.get(n)
            if e:
                e["end"] = t
                e["xs"].append(x)
                e["ys"].append(y)
            else:
                open_[n] = {"name": n, "start": t, "end": t, "xs": [x], "ys": [y]}
    events += open_.values()
    out = []
    for e in sorted(events, key=lambda e: e["start"]):
        if e["end"] + step - e["start"] < 0.3:
            continue
        out.append({"name": e["name"], "start": round(e["start"], 2), "end": round(e["end"] + step, 2), "x": r3(np.mean(e["xs"])), "y": r3(np.mean(e["ys"]))})
    return out


def summary_md(slug, samples, events, duration):
    faces = [s for s in samples if s["face"]]
    lines = [f"# Tracking {slug}", "", "Koordinaten als Anteile des Bildes (x von links, y von oben). Seiten = Bildseiten.", ""]
    if not samples:
        return "\n".join(lines + ["Keine Bilder gelesen."]) + "\n"
    share = len(faces) / len(samples)
    lines.append(f"Gesicht in {share * 100:.0f} % der Bilder erkannt.")
    if faces:
        xs = [f["face"][0] for f in faces]
        ys = [f["face"][1] for f in faces]
        ws = [f["face"][2] for f in faces]
        lines.append(f"Mitte meist bei x={np.median(xs):.2f}, y={np.median(ys):.2f}, Breite ~{np.median(ws):.2f} (x schwankt {min(xs):.2f}–{max(xs):.2f}).")
    # Abschnitte ohne Gesicht
    gaps = []
    start = None
    for s in samples:
        if not s["face"] and start is None:
            start = s["t"]
        if s["face"] and start is not None:
            if s["t"] - start >= 0.5:
                gaps.append((start, s["t"]))
            start = None
    if start is not None and samples[-1]["t"] - start >= 0.5:
        gaps.append((start, samples[-1]["t"]))
    if gaps:
        lines.append("Kein Gesicht: " + ", ".join(f"{a:.1f}–{b:.1f} s" for a, b in gaps))
    lines += ["", "## Gesten", ""]
    if events:
        for e in events:
            lines.append(f"- {e['start']:.1f}–{e['end']:.1f} s  {e['name']}, Hand bei x={e['x']:.2f} y={e['y']:.2f}")
    else:
        lines.append("Keine deutlichen Gesten erkannt (Hände oft außerhalb des Bildes?).")
    lines += ["", "## Gesicht je Sekunde (x, y, Breite)", ""]
    row = []
    for sec in range(int(duration) + 1):
        near = [s for s in samples if sec <= s["t"] < sec + 1 and s["face"]]
        if near:
            f = np.mean([s["face"][:3] for s in near], axis=0)
            row.append(f"{sec}s {f[0]:.2f},{f[1]:.2f},{f[2]:.2f}")
        else:
            row.append(f"{sec}s –")
    for k in range(0, len(row), 6):
        lines.append(" · ".join(row[k:k + 6]))
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("width", type=int)
    ap.add_argument("height", type=int)
    ap.add_argument("out_dir")
    ap.add_argument("--fps", type=float, default=10)
    a = ap.parse_args()
    out = Path(a.out_dir)
    samples = analyse(a.video, a.width, a.height, a.fps)
    events = gestures(samples, a.fps)
    duration = samples[-1]["t"] if samples else 0
    (out / "track.json").write_text(json.dumps({"fps": a.fps, "samples": samples, "gestures": events}, separators=(",", ":")))
    (out / "track.md").write_text(summary_md(out.name, samples, events, duration))
    faces = sum(1 for s in samples if s["face"])
    print(f"  Tracking: {len(samples)} Bilder, Gesicht in {faces}, {len(events)} Gesten")


if __name__ == "__main__":
    main()
