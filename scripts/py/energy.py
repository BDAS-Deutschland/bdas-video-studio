"""Wo wird es spannend? Lautstärke, Sprechtempo und Tonhöhe je Satz (librosa, offline) → energy.json + hooks.md.

Aufruf (macht pnpm analyze): energy.py <media> <words.json> <out_dir>
hooks.md: Sätze mit der meisten Energie (Hook-Kandidaten), Pausen (zum Straffen oder als Spannungspause).
Claude hört nichts – diese Werte ersetzen das Hinhören nicht, zeigen aber, wo man genauer schauen sollte.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np

SR = 16000
HOP = 800  # 50 ms


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def sentences(words):
    out, cur = [], []
    for w in words:
        if cur and (w["start"] - cur[-1]["end"] > 0.8 or re.search(r"[.!?…]$", cur[-1]["text"])):
            out.append(cur)
            cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return out


def z(values):
    v = np.array(values, dtype=float)
    sd = v.std()
    return (v - v.mean()) / sd if sd > 1e-9 else np.zeros_like(v)


def main(media, words_path, out_dir):
    words = json.loads(Path(words_path).read_text())
    y = load(media)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    db = librosa.amplitude_to_db(rms + 1e-6)
    f0 = librosa.yin(y, fmin=70, fmax=400, sr=SR, frame_length=2048, hop_length=HOP)
    voiced = db > np.percentile(db, 40)
    t_of = lambda i: i * HOP / SR
    idx = lambda t: int(round(t * SR / HOP))

    rows = []
    for sent in sentences(words):
        a, b = sent[0]["start"], sent[-1]["end"]
        if b - a < 0.4:
            continue
        sl = slice(idx(a), max(idx(a) + 1, idx(b)))
        loud = float(np.mean(db[sl][voiced[sl]])) if voiced[sl].any() else float(np.mean(db[sl]))
        pitch = f0[sl][voiced[sl]]
        semis = 12 * np.log2(pitch / np.median(pitch)) if len(pitch) > 3 else np.zeros(1)
        text = " ".join(w["text"] for w in sent)
        rows.append({
            "start": round(a, 2),
            "end": round(b, 2),
            "text": text,
            "loud": round(loud, 1),
            "rate": round(len(sent) / (b - a), 2),
            "pitchRange": round(float(np.percentile(semis, 90) - np.percentile(semis, 10)), 1),
        })
    if rows:
        score = 0.45 * z([r["loud"] for r in rows]) + 0.25 * z([r["rate"] for r in rows]) + 0.30 * z([r["pitchRange"] for r in rows])
        for r, s in zip(rows, score):
            bonus = 0.3 if r["text"].rstrip().endswith("?") else 0
            bonus += 0.2 if re.search(r"\d", r["text"]) else 0
            r["score"] = round(float(s) + bonus, 2)

    pauses = []
    for w0, w1 in zip(words, words[1:]):
        gap = w1["start"] - w0["end"]
        if gap >= 0.5:
            pauses.append({"start": round(w0["end"], 2), "end": round(w1["start"], 2), "after": w0["text"], "before": w1["text"]})

    out = Path(out_dir)
    (out / "energy.json").write_text(json.dumps({"hop": HOP / SR, "db": [round(float(v), 1) for v in db], "sentences": rows, "pauses": pauses}, ensure_ascii=False, separators=(",", ":")))

    lines = [f"# Energie {out.name}", "", "Automatisch aus Lautstärke, Sprechtempo und Tonhöhe. Ersetzt kein Hinhören – zeigt, wo es sich lohnt.", ""]
    lines += ["## Hook-Kandidaten (meiste Energie zuerst)", ""]
    for r in sorted(rows, key=lambda r: -r["score"])[:8]:
        lines.append(f"- {r['start']:.1f}–{r['end']:.1f} s  (Score {r['score']:+.1f}; {r['loud']:.0f} dB, {r['rate']:.1f} W/s, Tonhöhe ±{r['pitchRange']:.0f} HT)  „{r['text']}“")
    lines += ["", "## Pausen ≥ 0,5 s (straffen oder bewusst als Spannungspause nutzen)", ""]
    for p in pauses:
        lines.append(f"- {p['start']:.2f}–{p['end']:.2f} s ({p['end'] - p['start']:.1f} s) nach „{p['after']}“, vor „{p['before']}“")
    if not pauses:
        lines.append("Keine.")
    (out / "hooks.md").write_text("\n".join(lines) + "\n")
    print(f"  Energie: {len(rows)} Sätze bewertet, {len(pauses)} Pausen ≥ 0,5 s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
