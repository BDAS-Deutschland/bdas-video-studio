# Learnings

Wird nach jedem Projekt ergänzt. Kurz, konkret, mit Projektname.

## Stil und Schnitt
- Alevitischer_Kalender: Der Nutzer will beim Reden oft sichtbar sein. Handy-Aufnahmen deshalb als Karte in die freie rechte Spalte neben den Sprecher (`box: [0.585, 0.15, 0.295, 0.36]`), nicht vollflächig.
- Gesten als Taktgeber: Zeigt er zur Seite, erscheint die Karte genau dort und fliegt von dort herein (`enter: "right"`). Hebt er die Hand, gehört der Sticker auf die andere Seite. Gesten vorher vermessen: Bilder alle 0,5 s mit Gitter (`drawgrid=w=iw/4:h=ih/10`).
- Versprecher oder fehlende Erklärung im Nutzer-Schnitt: selbstironischer Einschub statt Nachdreh. Zeitlupe (`speed: 0.2`) mit Zoom aufs Gesicht, Kommentar-Blase („Bro hat … vergessen 💀“), danach Schnelldurchlauf der Bildschirmaufnahme auf Markenrot. Die folgende Original-Szene wird zur Pointe.
- Thumbnails für junge Leute: Gesicht mit starker Mimik, 2–3 Wörter in roten und weißen Kästen, ein Hinweis auf den Inhalt (Kalenderzeilen, Handy, Benachrichtigung). Wichtiges in die mittlere 3:4-Fläche (y 240–1680).

## Feedback, das immer wieder kommt
- „Ich gestikuliere – beachte das beim Einsetzen von Fotos und Videos“ (Alevitischer_Kalender): Einblendungen dürfen Gesten nicht verdecken und sollen sie aufgreifen.
- Bei Erklärschritten will der Nutzer jeden Klick sehen. Im Schnelldurchlauf fehlte die Seite mit dem Button „Herunterladen (.ics)“ (Alevitischer_Kalender). Jeden Tipp als eigenes Bild zeigen, mit 👆 auf dem Button und Klick-Sound.
- Thumbnail-Geschmack (Alevitischer_Kalender): Gewählt wurde das Selfie mit Benachrichtigungs-Bannern oben und „NIE WIEDER / Feiertag verpassen“ in Rot- und Weiß-Kästen unten.
- Lange URLs (bdas.de/alevitischer-kalender) und Kommentar-Blasen oben überdecken das Logo oben links. In diesen Szenen das Logo ausblenden.

## Technik
- Kontaktbögen sind 1-s-genau; Schnittzeiten immer aus `words.json` nehmen.
- Erster Render lädt einmalig Chrome Headless herunter (~1–2 min), danach rendern 12 s Entwurf in unter einer Minute.
- `text`-Overlay mit `position: "top"` hält Abstand zum Logo oben links; trotzdem im QC-Bogen prüfen.
- Neue Overlays (Proteste_reel): `media` (Bild/Video als Karte, `crop` [x,y,w,h] in Anteilen, `dim` dunkelt+blurrt Hintergrund, `quote`, `label`), `headline` (`kicker` + großes Wort, Schrift passt sich an), `stat` (Zählt hoch; bei kleinen Werten `fromValue` = `value`, sonst „1 Jahre“), `audio` (Ton-Einspieler mit `from`). Clips: `zoom`/`zoomTo` für Punch-ins.
- Fremd-Reportagen im Split-Layout (Le Monde): oberes Viertel `crop [0,0,1,0.285]` ist sauberes B-Roll ohne Untertitel.
- Headlines auf Nahaufnahmen immer mit `dim: true`, sonst liegt roter Text auf dem Gesicht.
- Fertig geschnittenes Nutzervideo an den vorhandenen Jump-Cuts (`scenes.txt`) in Szenen teilen → Anker für Einblendungen und Zoom pro Schnitt.
- FilmCraft-`.fcproj` (Alevitischer_Kalender) ist JSON und enthält nur Verweise auf die Videos (absolute Pfade), Zeiten in Ticks (254 016 000 000 pro s). Videos neben der `.fcproj` liegen lassen, nie verschieben oder umbenennen, sonst öffnet FilmCraft sie als „offline“. Für unsere Pipeline eine Kopie nach `raw/` legen.
- Neue Bausteine (Alevitischer_Kalender): Overlays `sticker` (frei per `x`/`y`/`anchor`, `kicker`, `variant` white/accent/dark, `\n` für Umbrüche), `comment` (Kommentar-Karte, `typing`, `avatar: "logo"`), `notify` (Benachrichtigung von oben), `button` („+ Folgen“ → „Gefolgt ✓“ mit Tipp). `media` kann `box`, `rate`, `enter` und `exitFade: false` (für nahtlos anschließende Teile). Clips haben `speed` (Zeitlupe oder Zeitraffer, ohne Untertitel) und `origin` für den Zoom-Mittelpunkt.
- `audio`-Overlays unter 11 Frames (Klick, 0,36 s) ließen das Rendern abstürzen (Rampe nicht steigend). Behoben, die Rampe wird jetzt gekürzt.
- Bildschirmaufnahmen vom Handy zeigen beim Kalender-Auswählen private Kalendernamen. Frames vorher bei 10 fps prüfen und aussparen (zwei `media`-Teile mit `exitFade: false` / `enter: "none"`).
- FilmCraft-Export hatte 1,4 s Schwarzbild am Ende und die Stimme bei −18,6 LUFS. Letzte Szene am letzten Clipende enden lassen; die `raw/`-Kopie mit `volume=4.1dB,alimiter` anheben → Mix −15 LUFS.
- Thumbnails: mehrere `<Still>` in einer `.tsx`, rendern mit `remotion still <datei> ThumbN out.png --public-dir=<ordner>`.
- Whisper-Wortzeiten können nach langen Pausen um >1 s danebenliegen (Proteste_reel: „Talkshows“ 1,7 s zu früh, Stille wirkte kürzer). Bei Pausen und Pointen die Zeiten mit dem Lautstärkeverlauf (ffmpeg → RMS pro 50 ms) gegenprüfen und `words.json` korrigieren.
  → Seit 2026-11-25 automatisch beim Einlesen (`scripts/lib/align.mjs`). Nicht nur das erste Wort ist verschoben, sondern der ganze Satz danach (9 Wörter, 1,7 → 0,4 s Fehler). Der Satz wird deshalb auf die Sprechabschnitte nach der Stille verteilt. Gemessen an den Handkorrekturen: Summe der Abweichungen 9,2 s → 1,3 s. Eine globale DTW-Ausrichtung war schlechter (verschob richtige Wörter um 0,1–1,2 s) und wurde verworfen. Bei verrauschtem Ton (Le-Monde-Reportage, Dynamik < 30 dB) greift die Korrektur bewusst nicht.

### Werkzeug-Ausbau 2026-11-25 (freie Tools)
- Remotion 4.0.547 bringt 20 Übergänge mit (viele als WebGL-Shader). Sie brauchen `Config.setChromiumOpenGlRenderer("angle")` (steht in `remotion.config.ts`), sonst rendert Chrome nichts.
- Übergänge mit Vor- und Nachlauf („Handles“) statt Überlappung: Die Szene davor läuft `tail` Frames weiter, die Szene danach beginnt `lead` Frames früher (stumm). So bleiben alle Anker, Untertitel und die Gesamtlänge gleich.
- Light Leak `hueShift`: 0 = gelb-orange, **40 = rot (Marke)**, 60 = pink, 300–330 = grün-gelb. Die Doku legt nahe, 320 sei rötlich – das stimmt nicht. Auf weißen Karten (CTA) überstrahlt er für ca. 0,4 s alles.
- Freisteller mit MediaPipe `selfie_multiclass` + Guided Filter: saubere Kanten an Haaren und Händen, ca. 9 s Rechenzeit je Videosekunde. Text „hinter“ der Person wirkt nur, wo der Kopf den Text überdeckt: Headline `position: "center"`, nicht `top`.
- Headline mit weißer Kontur: 12 px Wortabstand wirkten wie „JEDERZWEITE“. Abstand jetzt 0,15 × Schriftgröße.
- Soundeffekte sind selbst synthetisiert (`scripts/py/make_sfx.py`) und lizenzfrei. Claude kann sie nicht hören; geprüft wurde per Spektrogramm (Knackser bei Hüllkurven-Sprüngen gefunden und behoben). Die Lautheit ist angeglichen (RMS −16 dBFS). Der Nutzer sollte `_vorschau.wav` einmal anhören.
- MediaPipe-Tracking: 60 s Selfie-Video in 17 s, Gesicht in 100 % der Bilder. Selfie-Videos zeigen die Hände oft unten am Bildrand; „zeigt nach …“ greift nur, wenn der Arm gestreckt im Bild ist.
