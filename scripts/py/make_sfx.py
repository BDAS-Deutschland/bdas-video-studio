"""Erzeugt die Soundeffekt-Bibliothek brand/sfx/ per Synthese (keine Fremdaufnahmen, keine Lizenzfragen).

Aufruf: pnpm sfx   (oder: .venv/bin/python scripts/py/make_sfx.py brand/sfx)
Schreibt pro Effekt eine WAV (48 kHz, Stereo, 16 bit), dazu sfx.json (Name, Dauer, Standard-Lautstärke,
Beschreibung), LICENSE.txt und _vorschau.wav (alle Effekte hintereinander, Reihenfolge wie in sfx.json).
"""

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000
RNG = np.random.default_rng(7)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def noise(n, color="white"):
    x = RNG.standard_normal(n)
    if color == "pink":
        # Einfache Näherung: 1/f über drei Tiefpass-Stufen gemischt.
        out = np.zeros(n)
        for a, g in ((0.99886, 0.0555179), (0.99332, 0.0750759), (0.969, 0.153852)):
            y = np.zeros(n)
            acc = 0.0
            for i in range(n):
                acc = a * acc + x[i] * g
                y[i] = acc
            out += y
        x = out + x * 0.05
    return x / (np.max(np.abs(x)) + 1e-9)


def svf(x, fc, q=0.707, mode="band"):
    """Zustandsvariables Filter (TPT), fc darf pro Sample variieren."""
    n = len(x)
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    q = np.broadcast_to(np.asarray(q, dtype=float), (n,))
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    ic1 = ic2 = 0.0
    out = np.empty(n)
    for i in range(n):
        v3 = x[i] - ic2
        v1 = a1[i] * ic1 + a2[i] * v3
        v2 = ic2 + a2[i] * ic1 + a3[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        if mode == "band":
            out[i] = v1
        elif mode == "low":
            out[i] = v2
        else:
            out[i] = x[i] - k[i] * v1 - v2
    return out


def env_exp(t, attack, decay):
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def bell(p, peak=0.5, power=2.0):
    """Hüllkurve 0→1→0 mit Maximum bei `peak` (0–1)."""
    up = np.clip(p / peak, 0, 1)
    down = np.clip((1 - p) / (1 - peak), 0, 1)
    return np.where(p < peak, np.sin(up * np.pi / 2), np.sin(down * np.pi / 2)) ** power


def sine_sweep(t, f):
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase)


def pan(mono, position):
    """position: −1 links … +1 rechts, Skalar oder Array."""
    p = (np.asarray(position) + 1) * np.pi / 4
    return np.stack([mono * np.cos(p), mono * np.sin(p)], axis=1)


def stereo(mono):
    return np.stack([mono, mono], axis=1)


def fade_edges(x, fade_in=0.001, fade_out=0.01):
    n = len(x)
    fi = max(1, int(fade_in * SR))
    fo = max(1, int(fade_out * SR))
    x[:fi] *= np.linspace(0, 1, fi)[:, None] if x.ndim == 2 else np.linspace(0, 1, fi)
    x[n - fo:] *= np.linspace(1, 0, fo)[:, None] if x.ndim == 2 else np.linspace(1, 0, fo)
    return x


def reverb(x, length=0.6, mix=0.18):
    x = fade_edges(np.array(x, dtype=float), 0.0005, 0.06)
    n = int(length * SR)
    ir_t = np.arange(n) / SR
    ir = RNG.standard_normal(n) * np.exp(-ir_t / (length / 5))
    ir = svf(ir, 3500, 0.7, "low")
    ir /= np.sqrt(np.sum(ir**2)) + 1e-9
    wet = np.stack([np.convolve(x[:, c], ir * (1 + 0.1 * c)) for c in range(2)], axis=1)
    dry = np.vstack([x, np.zeros((n - 1, 2))])
    return dry + mix * wet


# ---------------------------------------------------------------- Effekte

def whoosh(dur=0.5, lo=300, hi=2800, q=1.1, peak=0.6, width=1.0):
    t = t_axis(dur)
    p = t / dur
    sweep = bell(p, peak, 1.5)
    fc = lo + (hi - lo) * sweep
    body = svf(svf(noise(len(t)), fc, q, "band"), fc * 2.2, 0.7, "low")
    air = svf(noise(len(t)), 180 + 220 * sweep, 0.8, "low") * 0.35
    env = bell(p, peak, 2.0)
    mono = (body + air) * env
    return pan(mono, (p * 2 - 1) * width)


def whip():
    t = t_axis(0.24)
    p = t / 0.24
    fc = 1400 + 5200 * bell(p, 0.35, 1.2)
    mono = svf(svf(noise(len(t)), fc, 0.9, "band"), fc * 2, 0.7, "low") * bell(p, 0.35, 1.6)
    return pan(mono, (p * 2 - 1) * 0.8)


def swish():
    t = t_axis(0.32)
    p = t / 0.32
    fc = 3500 + 4500 * bell(p, 0.5, 1.0)
    mono = svf(noise(len(t)), fc, 0.8, "high") * bell(p, 0.45, 2.2)
    return pan(mono, (p * 2 - 1) * 0.5)


def pop():
    t = t_axis(0.12)
    f = 320 + 950 * (1 - np.exp(-t / 0.009))
    tone = sine_sweep(t, f) * env_exp(t, 0.0008, 0.022)
    click = svf(noise(len(t)), 2500, 1.0, "band") * env_exp(t, 0.0003, 0.0025) * 0.5
    return stereo(tone + click)


def click():
    t = t_axis(0.045)
    n = svf(noise(len(t)), 3200, 1.4, "band") * env_exp(t, 0.0002, 0.003)
    s = np.sin(2 * np.pi * 1900 * t) * env_exp(t, 0.0002, 0.005) * 0.6
    return stereo(n + s)


def tap():
    t = t_axis(0.09)
    s = np.sin(2 * np.pi * 620 * t) * env_exp(t, 0.0004, 0.016)
    n = svf(noise(len(t)), 1500, 0.8, "low") * env_exp(t, 0.0002, 0.006) * 0.7
    return stereo(s + n)


def tick():
    t = t_axis(0.03)
    return stereo(np.sin(2 * np.pi * 2600 * t) * env_exp(t, 0.0002, 0.004))


def bell_tone(t, f0, partials, attack=0.002):
    out = np.zeros_like(t)
    for ratio, amp, dec in partials:
        out += amp * np.sin(2 * np.pi * f0 * ratio * t) * env_exp(t, attack, dec)
    return out


def ding():
    t = t_axis(1.5)
    mono = bell_tone(t, 1318.5, [(1, 1.0, 0.9), (2.0, 0.35, 0.5), (2.76, 0.22, 0.35), (5.4, 0.08, 0.15)])
    return reverb(stereo(mono), 0.8, 0.12)


def notify():
    t = t_axis(0.8)
    a = bell_tone(t, 784.0, [(1, 1.0, 0.25), (2, 0.25, 0.12), (3, 0.08, 0.08)])
    b = np.zeros_like(t)
    off = int(0.11 * SR)
    b[off:] = bell_tone(t[: len(t) - off], 1046.5, [(1, 1.0, 0.35), (2, 0.25, 0.15), (3, 0.08, 0.1)])
    return reverb(stereo(a * 0.8 + b), 0.5, 0.1)


def soft_note(t, f, dec):
    tri = np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * 3 * f * t) / 9 - np.sin(2 * np.pi * 5 * f * t) / 25
    return tri * env_exp(t, 0.004, dec)


def success():
    t = t_axis(0.9)
    out = np.zeros_like(t)
    for i, f in enumerate((523.25, 659.25, 783.99, 1046.5)):
        off = int(i * 0.065 * SR)
        out[off:] += soft_note(t[: len(t) - off], f, 0.28) * (0.8 if i < 3 else 1.0)
    return reverb(stereo(out), 0.5, 0.12)


def fail():
    """Komisches „Wah-wah“: zwei fallende Töne, Blech-artig."""
    t = t_axis(1.05)
    out = np.zeros_like(t)

    def note(start, dur, f0, fall=0.0, vibrato=0.0):
        n = int(dur * SR)
        tt = np.arange(n) / SR
        f = f0 - np.clip(tt - (dur - 0.3), 0, None) * fall
        f = f * (1 + vibrato * np.sin(2 * np.pi * 6 * tt) * np.clip((tt - 0.12) / 0.1, 0, 1))
        phase = 2 * np.pi * np.cumsum(f) / SR
        saw = 2 * ((phase / (2 * np.pi)) % 1) - 1
        tone = svf(saw, 700 + 700 * np.exp(-tt / 0.08), 0.9, "low")
        env = np.clip(tt / 0.015, 0, 1) * np.clip((dur - tt) / 0.06, 0, 1)
        off = int(start * SR)
        out[off:off + n] += tone * env

    note(0.0, 0.27, 311.1)
    note(0.31, 0.72, 293.7, fall=110, vibrato=0.012)
    return stereo(out)


def boom():
    t = t_axis(1.8)
    f = 42 + 85 * np.exp(-t / 0.07)
    sub = sine_sweep(t, f) * env_exp(t, 0.003, 0.65)
    body = np.sin(2 * np.pi * 92 * t) * env_exp(t, 0.002, 0.12) * 0.4
    hit = svf(noise(len(t)), 2800, 0.7, "low") * env_exp(t, 0.0005, 0.03) * 0.6
    mono = np.tanh(1.9 * (sub + body + hit)) / np.tanh(1.9)
    return stereo(mono)


def impact():
    t = t_axis(0.9)
    f = 55 + 110 * np.exp(-t / 0.04)
    low = sine_sweep(t, f) * env_exp(t, 0.002, 0.25)
    crack = svf(noise(len(t)), 1900, 0.9, "band") * env_exp(t, 0.0004, 0.05) * 0.8
    mono = np.tanh(1.6 * (low + crack))
    return reverb(stereo(mono), 0.7, 0.22)


def riser(dur=2.0):
    t = t_axis(dur)
    p = t / dur
    fc = 300 * (20 ** p)
    left = svf(noise(len(t)), fc, 0.8 + 3 * p, "band")
    right = svf(noise(len(t)), fc * 1.03, 0.8 + 3 * p, "band")
    f = 110 * (8 ** p)
    phase = 2 * np.pi * np.cumsum(f) / SR
    saw = svf(2 * ((phase / (2 * np.pi)) % 1) - 1, 400 + 3000 * p, 0.8, "low") * 0.25
    env = p**2.2
    out = np.stack([(left + saw) * env, (right + saw) * env], axis=1)
    return fade_edges(out, 0.01, 0.015)


def glitch():
    t = t_axis(0.36)
    out = np.zeros_like(t)
    i = 0
    while i < len(t):
        seg = int(RNG.uniform(0.012, 0.04) * SR)
        kind = RNG.integers(0, 3)
        tt = np.arange(min(seg, len(t) - i)) / SR
        if kind == 0:
            x = noise(len(tt))
            hold = int(RNG.integers(6, 30))
            x = np.repeat(x[::hold], hold)[: len(tt)]
            out[i:i + len(tt)] = np.round(x * 4) / 4
        elif kind == 1:
            fr = RNG.uniform(200, 2400)
            out[i:i + len(tt)] = np.sign(np.sin(2 * np.pi * fr * tt)) * 0.6
        i += seg
    return pan(out * 0.8, np.sin(t * 60))


def typing():
    t = t_axis(1.6)
    out = np.zeros_like(t)
    pos = 0.02
    while pos < 1.45:
        off = int(pos * SR)
        n = int(0.03 * SR)
        tt = np.arange(n) / SR
        amp = RNG.uniform(0.5, 1.0)
        key = svf(noise(n), RNG.uniform(2200, 3800), 1.2, "band") * env_exp(tt, 0.0002, 0.004)
        thock = np.sin(2 * np.pi * RNG.uniform(170, 240) * tt) * env_exp(tt, 0.0005, 0.008) * 0.6
        out[off:off + n] += (key + thock) * amp
        pos += RNG.uniform(0.07, 0.17)
    return stereo(out)


def shutter():
    t = t_axis(0.3)
    a = svf(noise(len(t)), 4000, 0.7, "high") * env_exp(t, 0.0002, 0.004)
    b = np.zeros_like(t)
    off = int(0.085 * SR)
    b[off:] = svf(noise(len(t) - off), 2500, 0.9, "band") * env_exp(t[: len(t) - off], 0.0002, 0.012)
    whirr = svf(noise(len(t)), 1200, 2.0, "band") * bell(t / 0.3, 0.3, 1) * 0.08
    return stereo(a + b * 0.9 + whirr)


def marker():
    """Filzstift auf Papier – passt zu gezeichneten Kreisen und Pfeilen."""
    t = t_axis(0.55)
    strokes = np.abs(np.sin(2 * np.pi * 7.5 * t + RNG.uniform(0, 1))) ** 0.6
    fc = 2600 + 700 * np.sin(2 * np.pi * 7.5 * t)
    mono = svf(noise(len(t)), fc, 1.8, "band") * strokes * bell(t / 0.55, 0.2, 0.6)
    return stereo(mono)


def rewind():
    t = t_axis(0.7)
    p = t / 0.7
    tone = sine_sweep(t, 1400 * (0.15 ** p)) * 0.35
    body = svf(noise(len(t)), 3000 * (0.2 ** p) + 300, 1.5, "band")
    mono = (body + tone) * bell(p, 0.7, 1.2)
    return pan(mono, 1 - 2 * p)


# Name → (Funktion, Standard-Lautstärke, Beschreibung)
EFFECTS = {
    "whoosh": (lambda: whoosh(), 0.6, "Mittlerer Whoosh – Übergänge, hereinfliegende Karten"),
    "whoosh-long": (lambda: whoosh(0.9, 200, 1800, 0.9, 0.55), 0.6, "Langer, tiefer Whoosh – große Übergänge, Zoom"),
    "whip": (whip, 0.55, "Kurzer, heller Peitschen-Whoosh – Whip-Pans"),
    "swish": (swish, 0.5, "Luftiges Wischen – Wipes, Slides"),
    "pop": (pop, 0.7, "Pop – Sticker, Emojis, Text erscheint"),
    "click": (click, 0.6, "UI-Klick – Buttons, Tippen"),
    "tap": (tap, 0.6, "Weiches Tippen – Handy-Bedienung"),
    "tick": (tick, 0.35, "Kurzes Ticken – Zähler (stat), Countdown"),
    "ding": (ding, 0.45, "Glocke – Aha-Moment, richtige Antwort"),
    "notify": (notify, 0.5, "Zwei-Ton-Benachrichtigung – notify-Overlay"),
    "success": (success, 0.45, "Aufsteigendes Arpeggio – Erfolg, „Gefolgt ✓“"),
    "fail": (fail, 0.55, "Komisches Wah-wah – Fail, Selbstironie"),
    "boom": (boom, 1.0, "Tiefer Bass-Schlag – Pointe, Enthüllung, Hook"),
    "impact": (impact, 0.7, "Harter Treffer mit Hall – Headline knallt rein"),
    "riser": (lambda: riser(2.0), 0.5, "Spannungsaufbau (2 s) – vor einer Enthüllung"),
    "riser-short": (lambda: riser(1.0), 0.5, "Kurzer Spannungsaufbau (1 s)"),
    "glitch": (glitch, 0.4, "Digitale Störung – Glitch-Übergang, Fehler"),
    "typing": (typing, 0.5, "Tastatur-Tippen – Kommentar wird getippt"),
    "shutter": (shutter, 0.6, "Kamera-Auslöser – Screenshot, Foto erscheint"),
    "marker": (marker, 0.5, "Filzstift – gezeichnete Kreise, Pfeile, Unterstreichungen"),
    "rewind": (rewind, 0.5, "Zurückspulen – Rückblende, „Moment mal“"),
}


def finish(x, rms_db=-16.0, peak_db=-1.0):
    """Gleicht die Lautheit an: RMS des hörbaren Teils auf rms_db, Spitzen höchstens peak_db."""
    x = fade_edges(np.array(x, dtype=float), 0.0005, 0.008)
    peak = np.max(np.abs(x)) + 1e-9
    level = np.abs(x).max(axis=1)
    active = x[level > peak * 0.05]
    rms = np.sqrt(np.mean(active**2)) + 1e-9
    gain = min(10 ** (rms_db / 20) / rms, 10 ** (peak_db / 20) / peak)
    return x * gain


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {}
    preview = []
    gap = np.zeros((int(0.6 * SR), 2))
    for name, (fn, volume, desc) in EFFECTS.items():
        audio = finish(fn())
        sf.write(out / f"{name}.wav", audio, SR, subtype="PCM_16")
        # Lautester Moment (10-ms-Fenster) – Übergänge legen ihn genau auf den Schnitt.
        win = int(0.01 * SR)
        energy = np.convolve((audio**2).sum(axis=1), np.ones(win), "same")
        peak = round(float(np.argmax(energy)) / SR, 3)
        manifest[name] = {"file": f"{name}.wav", "duration": round(len(audio) / SR, 3), "peak": peak, "volume": volume, "description": desc}
        preview += [audio * volume, gap]
        print(f"  {name:12s} {len(audio) / SR:5.2f} s  {desc}")
    sf.write(out / "_vorschau.wav", np.vstack(preview), SR, subtype="PCM_16")
    (out / "sfx.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (out / "LICENSE.txt").write_text(
        "Alle Effekte in diesem Ordner sind selbst erzeugt (Synthese mit scripts/py/make_sfx.py),\n"
        "keine Fremdaufnahmen. Frei verwendbar für BDAS, keine Namensnennung nötig.\n"
        "Neu erzeugen: pnpm sfx\n"
        "_vorschau.wav spielt alle Effekte in der Reihenfolge von sfx.json (mit Standard-Lautstärke).\n"
    )
    print(f"✓ {len(manifest)} Effekte → {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "brand/sfx")
