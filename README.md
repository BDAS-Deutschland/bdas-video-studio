# BDAS Video Studio

Rohmaterial rein → Skript, Schnitt und Grafiken mit Claude → fertiges Video. Den Ablauf und die Regeln für Claude beschreibt [`CLAUDE.md`](CLAUDE.md).

## Einmalig

```bash
pnpm bootstrap        # ffmpeg, whisper.cpp, uv, Node-Pakete, Whisper-Modell (~550 MB),
                      # Python-Analyse in .venv (~550 MB), MediaPipe-Modelle, Soundeffekte, Remotion-Skills
```

Logo als `brand/logo.png` ablegen. Farben und Schrift stehen in `brand/brand.json`.

## Pro Video

```bash
pnpm new mein-video             # legt projects/mein-video/ an
# Rohmaterial nach projects/mein-video/raw/ kopieren, brief.md ausfüllen
pnpm ingest mein-video          # Transkript, Kontaktbögen, Szenenwechsel, Gesichter/Gesten, Hook-Kandidaten, Beats
# → in Claude Code: „Lies brief.md und log/, schreib clips.md, beats.md und script.md“
pnpm analyze mein-video         # Analysen für schon eingelesenes Material nachholen
pnpm resolve mein-video         # Zeitleiste prüfen
pnpm cutout mein-video          # Person freistellen (für Text hinter der Person)
pnpm studio mein-video          # im Browser ansehen und scrubben
pnpm render mein-video --draft  # schneller Entwurf (halbe Auflösung)
pnpm qc mein-video              # QC-Bögen mit Safe-Zones
pnpm render mein-video          # Endfassung
pnpm render mein-video --format 16:9   # Variante
```

## Ordner

| Ordner | Inhalt |
|---|---|
| `brand/` | Logo, Farben, Hausmusik, Soundeffekte (`sfx/`, selbst erzeugt), Lottie-Animationen |
| `templates/` | Vorlagen für Briefing, Beat-Sheet, Skript, Beispiel-Zeitleisten (`timeline.effects.json` zeigt alle Effekte) |
| `projects/<name>/` | `raw/`, `log/`, `brief.md`, `beats.md`, `script.md`, `timeline.json`, `renders/` – bleibt lokal, nicht im Repository |
| `scripts/` | Einlesen, Analyse, Auflösen, Rendern, QC; `scripts/py/` = Python-Analyse (MediaPipe, librosa) |
| `src/` | Remotion-Komponenten (Szenen, Übergänge, Overlays, Effekte, Untertitel) |

`pnpm test` prüft die Zeitleisten-Logik (Anker, Übergänge, Sounds, Beats, Untertitel, Wortzeiten, Fehlermeldungen).

Remotion ist für Einzelpersonen, gemeinnützige Organisationen und Firmen bis 3 Personen kostenlos; Lizenz unter remotion.dev/license prüfen.

## Lizenz

[MIT](LICENSE) – gilt für Code, Vorlagen, Doku und die selbst erzeugten Soundeffekte in `brand/sfx/`. Ausgenommen sind Name und Logo der BDAS (`brand/logo.png`).
