# BDAS Video Studio

Rohmaterial rein → Skript, Schnitt und Grafiken mit Claude → fertiges Video. Den Ablauf und die Regeln für Claude beschreibt [`CLAUDE.md`](CLAUDE.md).

## Einmalig

```bash
pnpm bootstrap        # ffmpeg, whisper.cpp, Node-Pakete, Whisper-Modell (~550 MB)
```

Logo als `brand/logo.png` ablegen. Farben und Schrift stehen in `brand/brand.json`.

## Pro Video

```bash
pnpm new mein-video             # legt projects/mein-video/ an
# Rohmaterial nach projects/mein-video/raw/ kopieren, brief.md ausfüllen
pnpm ingest mein-video          # Transkript, Kontaktbögen, Szenenwechsel
# → in Claude Code: „Lies brief.md und log/, schreib clips.md, beats.md und script.md“
pnpm resolve mein-video         # Zeitleiste prüfen
pnpm studio mein-video          # im Browser ansehen und scrubben
pnpm render mein-video --draft  # schneller Entwurf (halbe Auflösung)
pnpm qc mein-video              # QC-Bögen mit Safe-Zones
pnpm render mein-video          # Endfassung
pnpm render mein-video --format 16:9   # Variante
```

## Ordner

| Ordner | Inhalt |
|---|---|
| `brand/` | Logo, Farben, Hausmusik, Referenzen |
| `templates/` | Vorlagen für Briefing, Beat-Sheet, Skript, Beispiel-Zeitleiste |
| `projects/<name>/` | `raw/`, `log/`, `brief.md`, `beats.md`, `script.md`, `timeline.json`, `renders/` |
| `scripts/` | Einlesen, Auflösen, Rendern, QC |
| `src/` | Remotion-Komponenten (Szenen, Overlays, Untertitel) |

`pnpm test` prüft die Zeitleisten-Logik (Anker, Untertitel, Fehlermeldungen).

Remotion ist für Einzelpersonen, gemeinnützige Organisationen und Firmen bis 3 Personen kostenlos; Lizenz unter remotion.dev/license prüfen.
