# CLAUDE.md – BDAS Video Studio

Hier entstehen Videos aus echtem Rohmaterial. Claude schreibt keine Videos „aus dem Nichts“, sondern **Daten** (`timeline.json`), aus denen Remotion das Video rendert. Jede Änderung ist eine gezielte Datenänderung, kein Neu-Würfeln.

Vor jedem Projekt: `learnings.md` lesen. Nach jedem Projekt: `learnings.md` ergänzen.

---

## Ablauf (immer in dieser Reihenfolge)

| Stufe | Wer | Ergebnis | Befehl |
|---|---|---|---|
| 0 Projekt anlegen | Claude | `projects/<name>/` | `pnpm new <name>` |
| 1 Material einlesen | Skript + Claude | `log/<clip>/…` + `log/clips.md` | `pnpm ingest <name>` |
| 2 Briefing | **Nutzer** | `brief.md` | – |
| 3 Beat-Sheet + Skript | Claude | `beats.md`, `script.md` | – |
| ⛔ **Freigabe 1** | **Nutzer** | Skript abgenommen | – |
| 4 Schnitt als Daten | Claude | `timeline.json` | `pnpm resolve <name>` |
| 5 Rohschnitt + Selbstprüfung | Claude | Entwurf + QC-Bogen | `pnpm render <name> --draft` → `pnpm qc <name>` |
| ⛔ **Freigabe 2** | **Nutzer** | Feedback-Runden | – |
| 6 Feinschliff + Varianten | Claude | Endfassung(en) | `pnpm render <name>` |
| ⛔ **Freigabe 3** | **Nutzer** | Abnahme | – |
| 7 Lernen | Claude | `learnings.md` ergänzt | – |

An den ⛔-Punkten **anhalten und auf den Nutzer warten.** Nicht über eine Freigabe hinweg weiterarbeiten.

---

## Stufe 1 – Material einlesen

`pnpm ingest <name>` erzeugt pro Datei in `raw/`:

- `log/<clip>/meta.json` – Dauer, Auflösung, fps, hat Ton
- `log/<clip>/sheet_000-024s.jpg` usw. – Kontaktbögen, **1 Bild pro Sekunde, 6 Spalten × 4 Zeilen = 24 s pro Bogen**, zeilenweise von links oben nach rechts unten. Der Dateiname nennt den Zeitbereich; Bild Nr. k (ab 0) zeigt Sekunde Start + k.
- `log/<clip>/scenes.txt` – erkannte Schnitte/Szenenwechsel (Sekunden)
- `log/<clip>/words.json` – Transkript, **jedes Wort mit Start/Ende in Sekunden**. Wörter, die Whisper in eine Stille gelegt hat (typisch nach langen Pausen), sind schon an den Sprechbeginn verschoben; das Original steht in `words.whisper.json`.
- `log/<clip>/transcript.md` – lesbares Transkript mit Zeitmarken
- `log/<clip>/track.md` (+ `track.json`) – Gesicht und Gesten (MediaPipe): wo das Gesicht ist (je Sekunde), Gesten mit Zeit und Bildposition („zeigt nach rechts“, „Hand oben“)
- `log/<clip>/hooks.md` (+ `energy.json`) – Sätze mit der meisten Energie (Lautstärke, Tempo, Tonhöhe) = Hook-Kandidaten; Pausen ≥ 0,5 s
- `log/music_<datei>/beats.json` – für jede Datei in `music/`: BPM, Schläge, Takte, starke Einsätze

Für schon eingelesenes Material: `pnpm analyze <name>` (holt Tracking, Hooks, Beats nach; `--words` korrigiert zusätzlich die Wortzeiten).

Danach schreibt Claude `log/clips.md` – das Drehprotokoll. Pro Clip:
- Was ist zu sehen (Personen, Ort, Einstellung, Licht)
- Beste Momente mit Zeitbereich (`12.4–18.9 s: „…Zitat…“`)
- Probleme (Wackler, Versprecher, Ton schlecht, Gegenlicht)
- Eignung: Hook / Beleg / B-Roll / unbrauchbar

**Regeln:**
- Kontaktbögen einmal ansehen, dann nur noch `clips.md` lesen. Bilder nicht erneut laden, wenn das Protokoll reicht.
- Schnittzeiten **immer aus `words.json`** (wortgenau), nie aus den Kontaktbögen schätzen. Bögen sind 1-s-genau.
- Einen Schnitt nicht mitten ins Wort legen: `in` = Start des ersten Worts minus ~0,1 s, `out` = Ende des letzten Worts plus ~0,15 s.
- Claude hört nichts. Alles über Ton kommt aus Transkript, `meta.json` und `hooks.md`. Hook-Kandidaten aus `hooks.md` sind Vorschläge, kein Urteil – mit dem Inhalt abgleichen.
- Gesten und Gesichtsposition aus `track.md` nehmen statt sie auf Kontaktbögen zu vermessen.

## Stufe 2 – Briefing

Der Nutzer füllt `brief.md`. Fehlen Pflichtfelder (Botschaft, Zielgruppe, Call-to-Action, Format, Länge), **nachfragen statt raten.**

## Stufe 3 – Beat-Sheet und Skript

1. Konzeptbaum: eine Botschaft → 2–4 Belege → ein Call-to-Action.
2. `beats.md`: Takt für Takt mit Sollzeit. Hook in den ersten 3 s.
3. `script.md`: aus dem **vorhandenen Material** gebaut. Jeder Beat nennt seine Quelle (`clip_03 12.4–18.9`) oder ist als **Lücke** markiert, mit Vorschlag: Text-Karte / Motion-Graphic / generiertes Material / „nachdrehen: …“.

Keine erfundenen Zitate. Was gesagt wird, muss im Transkript stehen.

## Stufe 4 – timeline.json

Format siehe unten. Danach immer `pnpm resolve <name>`: zeigt die aufgelöste Zeitleiste mit absoluten Zeiten und meldet Fehler (Anker unbekannt, Clip zu kurz, Overlay außerhalb der Szene).

## Stufe 5 – Selbstprüfung (vor jeder Vorlage an den Nutzer)

`pnpm render <name> --draft` und danach `pnpm qc <name>`. Die QC-Bögen (`renders/qc/qc_000-012s.jpg` usw., 2 Bilder/s, 6×4, mit rot eingezeichneten Safe-Zones) ansehen und prüfen:
- Text in der Safe-Zone? (9:16: oben 14 %, unten 22 %, rechts 12 % frei – dort liegen Instagram-/TikTok-Bedienelemente)
- Text lang genug sichtbar? Faustregel: 0,3 s pro Wort, mindestens 1,2 s
- Abgeschnittene Wörter, schwarze Bilder, falsche Clips
- Logo und Farben laut `brand/brand.json`
- Übergänge: Szenen müssen mindestens halb so lang sein wie ihre Übergänge; Einzelbilder mitten im Übergang ansehen

`pnpm render` gleicht die Lautheit automatisch auf −14 LUFS an (Ausgabe „Lautheit: … → … LUFS“).

Gefundene Fehler selbst beheben, dann erst dem Nutzer zeigen.

## Feedback des Nutzers

„Fast, aber…“-Runden sind normal. Feedback in Datenänderungen übersetzen und die Änderung in einem Satz bestätigen („Szene `beleg2` endet jetzt bei 41,2 s statt 43,0 s“). Wiederkehrendes Feedback → `learnings.md`.

---

## timeline.json – Format

Vollständiges, lauffähiges Beispiel: `templates/timeline.example.json`.

```jsonc
{
  "format": "9:16",            // "9:16" | "16:9" | "1:1" | "4:5"
  "fps": 30,
  "music": { "src": "music/track.mp3", "volume": 0.25, "duckTo": 0.08 },  // optional; duckTo = Lautstärke während Clips mit Ton
  "captions": true,             // Untertitel aus words.json für alle Clip-Szenen
  "scenes": [
    {
      "id": "hook",
      "type": "clip",
      "src": "raw/interview.mp4",
      "in": 12.3, "out": 15.1,   // Sekunden im Quellclip
      "volume": 1,               // optional, 0 = stumm
      "fit": "cover",            // optional: "cover" | "contain"
      "transition": "cut",       // optional: "cut" | "fade"
      "overlays": [
        { "type": "title", "text": "Wer wir sind", "subtitle": "BDAS Berlin", "at": 0.3, "duration": 2.5 }
      ]
    },
    { "id": "fakt", "type": "card", "title": "120 Mitglieder", "subtitle": "in 14 Städten", "duration": 2.5 },
    { "id": "ende", "type": "cta", "title": "Mach mit", "subtitle": "bdas.de", "duration": 3 }
  ],
  "overlays": [
    { "type": "logo", "at": "hook.start", "until": "ende.start", "position": "top-left" }
  ]
}
```

**Szenen** laufen nacheinander. Ihre Dauer ergibt sich aus `out − in` (Clips) bzw. `duration` (Karten).

**Anker:** Jede Szene erzeugt automatisch `<id>.start` und `<id>.end`. Globale Overlays (unten im `overlays`-Array) hängen an Ankern, auch mit Versatz: `"at": "ende.start-0.5"`. Ändert sich ein Clip, verschieben sich alle Anker dahinter automatisch – **nie absolute Zeiten in globale Overlays schreiben.** Overlays innerhalb einer Szene zählen ab Szenenbeginn (Zahl in Sekunden).

**Overlay-Typen:**
- `title` – Bauchbinde (Name/Funktion), unten links: `text`, `subtitle`
- `text` – großer Text in der Bildmitte, Wort für Wort eingeblendet: `text`, optional `position`: `"center" | "top" | "bottom"`
- `logo` – `position`: `"top-left" | "top-right" | "bottom-right" | "center"`
- Zeitangabe: `at` + `duration` **oder** `at` + `until`

**Szenen-Typen:** `clip`, `card` (Text-Karte auf Markenfarbe; `title`, `subtitle`, optional `"variant": "accent"`), `cta` (Abschluss mit Logo; `title`, `subtitle`).

Dateipfade (`src`, `music.src`) sind relativ zum Projektordner. Musik liegt in `projects/<name>/music/` oder wird aus `brand/music/` dorthin kopiert.

### Effekte für Social-Media-Schnitt

Weitere Overlays (`media`, `headline`, `stat`, `sticker`, `comment`, `notify`, `button`, `audio`) stehen in `learnings.md` unter „Technik“. Vollständiges Beispiel mit allen Effekten: `templates/timeline.effects.json`.

**Übergänge** (`"transition"` an der Szene, in die übergeblendet wird; String oder `{ "type", "duration", "sfx", "sfxVolume" }`). Sie liegen mittig um den Schnitt – **Zeiten und Anker ändern sich nicht**. Der Ton schneidet hart wie bisher. Bei Clips wird der Vor-/Nachlauf aus dem Quellmaterial gespielt (stumm), sonst als Standbild.
- schnell/viral: `whip-left|right|up|down` (0,27 s), `zoom` (0,35 s), `push` (0,3 s), `slide-…` (0,4 s)
- weich/edel: `crossfade`, `zoom-in-out`, `cross-zoom`, `linear-blur`, `dreamy`, `ripple`, `crosswarp`
- grafisch: `wipe-…`, `cube-…`, `flip-…`, `swap`, `iris`, `clock`
- harter Schnitt mit Effekt: `light-leak` (0,8 s, rötlich), `flash` (0,3 s, weiß)
- Richtungswort = Bewegung des Bildes (`slide-left`: neues Bild kommt von rechts). Jeder Übergang bringt seinen Sound mit (whip, whoosh, swish …); `"sfx": false` schaltet ihn ab, `"transitionSfx": false` oben schaltet alle ab.

**Sounds:** `{ "type": "sfx", "name": "boom", "at": 2.1, "align": "peak", "volume": 0.8 }` – Bibliothek in `brand/sfx/` (Liste mit Beschreibung: `brand/sfx/sfx.json`, Vorhören: `brand/sfx/_vorschau.wav`). `"align": "peak"` legt den lautesten Moment auf `at` (Bass-Schlag genau auf das Wort, Riser endet genau am Schnitt). `"sfxVolume"` oben skaliert alle Effekte.

**Bewegung:**
- `punch` (nur in Clip-Szenen) – schneller Zoom auf ein Wort: `{ "type": "punch", "at": 1.2, "duration": 0.8, "scale": 1.15, "origin": "face", "ease": "snap" | "smooth" }`
- `shake` – Kamerawackeln: `{ "type": "shake", "at": …, "duration": 0.35, "strength": 1 }`
- Clip-Szene `"origin": "face"` (Zoom-Mittelpunkt aufs Gesicht), `"follow": "face"` (Bildausschnitt folgt dem Gesicht, z. B. 16:9-Material im 9:16-Format). Braucht `track.json`.

**Grafik:**
- `draw` – mit dem Stift gezeichnet: `"shape": "circle" | "underline" | "box" | "check" | "cross"` mit `x`, `y` (Mitte), `w`, optional `h`; `"arrow"` mit `from: [x, y]`, `to: [x, y]`, `curve`. `color`: `accent` (Standard) / `white` / `dark`, `drawTime` (s). Alles in Anteilen des Bildes. Passender Sound: `marker`.
- `lottie` – Lottie-Animation: `src` (Projektdatei) oder `name` (aus `brand/lottie/`), `x`, `y`, `size` (Breite als Anteil), `loop`, `rate`
- `leak`, `flash` – auch frei als Overlay (`seed`, `hue` bzw. `color`)

**Text hinter der Person:** Clip-Szene `"cutout": true`, dann `pnpm cutout <name>` (≈ 9 s Rechenzeit je Sekunde Video). Overlays mit `"behind": true` liegen zwischen Video und freigestellter Person. Wirkt nur, wo Kopf oder Körper den Text überdecken (z. B. `headline` mit `"position": "center"`).

**Beat-Anker:** Mit Musik und `beats.json` gibt es `beat.N`, `bar.N` (Takt-Eins) und `hit.N` (starke Einsätze), 1-basiert, in Videozeit: `"at": "bar.4"`, `"at": "hit.1-0.1"`. `"music": { "from": 12.5 }` startet die Musik später im Stück (Anker verschieben sich mit). `pnpm resolve` zeigt die Takte.

---

## Werkzeuge und Grenzen

- Rendern: Remotion (React). Studio zum Ansehen: `pnpm studio <name>`. WebGL ist an (`remotion.config.ts`), nötig für Shader-Übergänge und Light Leaks.
- Remotion-Wissen: Skills `remotion-best-practices`, `remotion-docs` u. a. in `.claude/skills/` (aktualisieren: `npx remotion skills update`). Vor neuen Remotion-Bausteinen dort nachlesen statt aus dem Gedächtnis.
- Video/Ton: ffmpeg. Transkript: whisper.cpp (lokal, Modell in `models/`).
- Analyse offline in `.venv` (Python 3.12): MediaPipe (Gesicht, Gesten, Freisteller), librosa (Beats, Energie). Einrichtung: `pnpm bootstrap`. Sounds neu erzeugen: `pnpm sfx`.
- Generiertes Material (Stimme, Bilder, B-Roll) nur nach Rückfrage und mit dem Budget, das der Nutzer nennt. Schlüssel stehen in `.env`, nie in Dateien unter `projects/`.
- Musik nur mit klarer Lizenz; Quelle und Lizenz in `projects/<name>/music/LICENSE.txt` notieren.
- Erkennbare Personen brauchen eine Einwilligung (DSGVO). Im Zweifel beim Nutzer nachfragen.

## Marke

`brand/brand.json`: Akzent `#d12020` nur für Hervorhebungen und Karten-Hintergründe, nie als Fließtextfarbe. Text in `#333` / `#555` / `#888`. Keine anderen Farben ohne Rückfrage. Light Leaks sind standardmäßig rot (`hue` 40); andere Farbtöne nur nach Rückfrage.
