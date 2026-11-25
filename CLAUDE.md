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
- `log/<clip>/words.json` – Transkript, **jedes Wort mit Start/Ende in Sekunden**
- `log/<clip>/transcript.md` – lesbares Transkript mit Zeitmarken

Danach schreibt Claude `log/clips.md` – das Drehprotokoll. Pro Clip:
- Was ist zu sehen (Personen, Ort, Einstellung, Licht)
- Beste Momente mit Zeitbereich (`12.4–18.9 s: „…Zitat…“`)
- Probleme (Wackler, Versprecher, Ton schlecht, Gegenlicht)
- Eignung: Hook / Beleg / B-Roll / unbrauchbar

**Regeln:**
- Kontaktbögen einmal ansehen, dann nur noch `clips.md` lesen. Bilder nicht erneut laden, wenn das Protokoll reicht.
- Schnittzeiten **immer aus `words.json`** (wortgenau), nie aus den Kontaktbögen schätzen. Bögen sind 1-s-genau.
- Einen Schnitt nicht mitten ins Wort legen: `in` = Start des ersten Worts minus ~0,1 s, `out` = Ende des letzten Worts plus ~0,15 s.
- Claude hört nichts. Alles über Ton kommt aus dem Transkript und `meta.json`.

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

---

## Werkzeuge und Grenzen

- Rendern: Remotion (React). Studio zum Ansehen: `pnpm studio <name>`.
- Video/Ton: ffmpeg. Transkript: whisper.cpp (lokal, Modell in `models/`).
- Generiertes Material (Stimme, Bilder, B-Roll) nur nach Rückfrage und mit dem Budget, das der Nutzer nennt. Schlüssel stehen in `.env`, nie in Dateien unter `projects/`.
- Musik nur mit klarer Lizenz; Quelle und Lizenz in `projects/<name>/music/LICENSE.txt` notieren.
- Erkennbare Personen brauchen eine Einwilligung (DSGVO). Im Zweifel beim Nutzer nachfragen.

## Marke

`brand/brand.json`: Akzent `#d12020` nur für Hervorhebungen und Karten-Hintergründe, nie als Fließtextfarbe. Text in `#333` / `#555` / `#888`. Keine anderen Farben ohne Rückfrage.
