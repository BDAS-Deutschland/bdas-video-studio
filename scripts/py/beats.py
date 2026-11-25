"""Beats, Takte und starke Schläge eines Musikstücks (librosa, offline) → beats.json.

Aufruf (macht pnpm analyze): beats.py <audio> <beats.json>
beats = jeder Schlag, bars = erster Schlag jedes Takts (4/4 geschätzt), hits = auffällige Einsätze
(Drop, Einsatz nach Pause) – gut für Schnitte, Zoom, Wackeln. Zeiten in Sekunden ab Dateianfang.
"""

import json
import subprocess
import sys

import librosa
import numpy as np

SR = 22050


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def main(src, dest):
    y = load(src)
    duration = len(y) / SR
    hop = 512
    onset = librosa.onset.onset_strength(y=y, sr=SR, hop_length=hop)
    tempo, frames = librosa.beat.beat_track(onset_envelope=onset, sr=SR, hop_length=hop, units="frames", trim=False)
    bpm = float(np.atleast_1d(tempo)[0])
    beats = librosa.frames_to_time(frames, sr=SR, hop_length=hop)

    # Takt-Eins: Phase (0–3) mit der meisten Energie im Bass (Bassdrum fällt meist auf die Eins).
    mel = librosa.feature.melspectrogram(y=y, sr=SR, hop_length=hop, n_mels=64, fmax=8000)
    low = librosa.onset.onset_strength(S=librosa.power_to_db(mel[:6]), sr=SR, hop_length=hop)
    bars = []
    if len(frames) >= 8:
        scores = [low[np.clip(frames[p::4], 0, len(low) - 1)].sum() for p in range(4)]
        bars = beats[int(np.argmax(scores))::4]

    # Starke Einsätze: Lautheitssprung gegenüber den 2 s davor plus kräftiger Onset.
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    db = librosa.amplitude_to_db(rms + 1e-6)
    fps = SR / hop
    peaks = librosa.util.peak_pick(onset, pre_max=10, post_max=10, pre_avg=40, post_avg=10, delta=np.percentile(onset, 75) * 0.5, wait=int(fps * 2))
    hits = []
    for p in peaks:
        before = db[max(0, p - int(2 * fps)):max(1, p - 2)]
        after = db[p:p + int(0.5 * fps)]
        if len(before) and len(after) and np.median(after) - np.median(before) > 6 and onset[p] > np.percentile(onset, 90):
            hits.append(p)
    if not hits:
        hits = sorted(peaks[np.argsort(onset[peaks])[-6:]]) if len(peaks) else []
    hit_times = librosa.frames_to_time(np.array(hits, dtype=int), sr=SR, hop_length=hop)

    r = lambda arr: [round(float(v), 3) for v in arr]
    out = {"duration": round(duration, 3), "bpm": round(bpm, 1), "beats": r(beats), "bars": r(bars), "hits": r(hit_times)}
    with open(dest, "w") as f:
        json.dump(out, f)
    print(f"  Beats: {bpm:.0f} BPM, {len(beats)} Schläge, {len(bars)} Takte, {len(hit_times)} starke Einsätze")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
