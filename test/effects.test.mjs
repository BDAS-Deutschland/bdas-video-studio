import assert from "node:assert/strict";
import { test } from "node:test";
import { fixWordTimes, HOP, syllables } from "../scripts/lib/align.mjs";
import { resolveTimeline, sourceToFrame } from "../scripts/lib/timeline.mjs";

const sfx = {
  whoosh: { file: "whoosh.wav", duration: 0.5, peak: 0.3, volume: 0.6 },
  whip: { file: "whip.wav", duration: 0.24, peak: 0.1, volume: 0.55 },
  boom: { file: "boom.wav", duration: 1.8, peak: 0.08, volume: 1 },
};
const ctx = {
  sfx,
  loadWords: () => [],
  loadMeta: () => ({ duration: 60, hasAudio: true, width: 1920, height: 1080 }),
};
const clip = (id, a, b, extra = {}) => ({ id, type: "clip", src: "raw/a.mp4", in: a, out: b, ...extra });

test("Übergang überlappt mittig um den Schnitt, Zeiten und Länge bleiben gleich", () => {
  const t = { fps: 30, scenes: [clip("a", 10, 12), clip("b", 20, 22, { transition: "whip-left" })] };
  const r = resolveTimeline(t, ctx);
  assert.deepEqual(r.errors, []);
  const [a, b] = r.props.scenes;
  assert.equal(r.props.durationInFrames, 120);
  assert.equal(b.startFrame, 60);
  assert.deepEqual(b.enter, { type: "whip-left", frames: 8 });
  assert.equal(b.lead, 4);
  assert.equal(a.tail, 4);
  assert.equal(b.leadMode, "play");
  assert.equal(r.anchors["b.start"], 2);
});

test("Übergang bekommt automatisch den passenden Sound, Spitze genau auf dem Schnitt", () => {
  const t = { fps: 30, scenes: [clip("a", 10, 12), clip("b", 20, 22, { transition: "whip-left" })] };
  const s = resolveTimeline(t, ctx).props.overlays.find((o) => o.type === "sfx");
  assert.equal(s.name, "whip");
  assert.ok(Math.abs(s.start - (2 - 0.1)) < 1e-9);
  const off = resolveTimeline({ ...t, transitionSfx: false }, ctx).props.overlays.filter((o) => o.type === "sfx");
  assert.equal(off.length, 0);
});

test("Kein Vorlauf-Material am Clipanfang → Standbild statt Ton-Versatz", () => {
  const t = { fps: 30, scenes: [clip("a", 10, 12), clip("b", 0, 2, { transition: "slide-left" })] };
  assert.equal(resolveTimeline(t, ctx).props.scenes[1].leadMode, "freeze");
});

test("Fehler: Übergang in der ersten Szene, unbekannter Name, Szene zu kurz", () => {
  const errs = (t) => resolveTimeline({ fps: 30, ...t }, ctx).errors.join("\n");
  assert.match(errs({ scenes: [clip("a", 0, 2, { transition: "zoom" })] }), /braucht eine Szene davor/);
  assert.match(errs({ scenes: [clip("a", 0, 2), clip("b", 3, 5, { transition: "wirbel" })] }), /unbekannter Übergang "wirbel"/);
  assert.match(
    errs({ scenes: [clip("a", 0, 2), clip("b", 3, 3.2, { transition: { type: "cube-left", duration: 0.4 } }), clip("c", 5, 7, { transition: "cube-left" })] }),
    /zu kurz für ihre Übergänge/,
  );
});

test("Light Leak und Blitz sind harte Schnitte mit Effekt darüber", () => {
  const t = { fps: 30, scenes: [clip("a", 10, 12), clip("b", 20, 22, { transition: "light-leak" })] };
  const r = resolveTimeline(t, ctx);
  assert.equal(r.props.scenes[1].lead, 0);
  const leak = r.props.overlays.find((o) => o.type === "leak");
  assert.equal(leak.startFrame, 60 - 12);
  assert.equal(leak.durationInFrames, 24);
});

test("sfx: Name aus der Bibliothek, Ausrichtung an der Spitze, Fehler bei unbekanntem Sound", () => {
  const t = { fps: 30, scenes: [clip("a", 10, 14, { overlays: [{ type: "sfx", name: "boom", at: 1, align: "peak" }] })] };
  const o = resolveTimeline(t, ctx).props.overlays[0];
  assert.equal(o.src, ".build/sfx/boom.wav");
  assert.ok(Math.abs(o.start - 0.92) < 1e-9);
  assert.equal(resolveTimeline(t, ctx).usedSfx[0], "boom.wav");
  t.scenes[0].overlays[0].name = "tröt";
  assert.match(resolveTimeline(t, ctx).errors.join(), /Sound "tröt" gibt es nicht/);
});

test("shake und punch werden gesammelt, nicht als Overlay gezeichnet", () => {
  const t = {
    fps: 30,
    scenes: [clip("a", 10, 14, { overlays: [{ type: "punch", at: 1, duration: 0.5, scale: 1.2 }, { type: "shake", at: 2 }] })],
  };
  const r = resolveTimeline(t, ctx);
  assert.deepEqual(r.errors, []);
  assert.equal(r.props.overlays.length, 0);
  assert.deepEqual(r.props.shakes, [{ startFrame: 60, durationInFrames: 11, strength: 1 }]);
  assert.deepEqual(r.props.scenes[0].punches[0], { startFrame: 30, durationInFrames: 15, scale: 1.2, origin: [0.5, 0.35], ease: "snap" });
});

test("Beat-Anker aus der Musik-Analyse, verschoben um music.from", () => {
  const t = {
    fps: 30,
    music: { src: "music/m.mp3", from: 1 },
    scenes: [clip("a", 10, 14)],
    overlays: [{ type: "flash", at: "bar.2" }],
  };
  const beats = { duration: 10, bpm: 120, beats: [0.5, 1, 1.5, 2, 2.5, 3], bars: [1, 3], hits: [2.5] };
  const r = resolveTimeline(t, { ...ctx, loadBeats: () => beats });
  assert.deepEqual(r.errors, []);
  assert.equal(r.anchors["beat.1"], 0);
  assert.equal(r.anchors["bar.2"], 2);
  assert.equal(r.props.overlays[0].start, 2);
  const none = resolveTimeline(t, ctx);
  assert.match(none.errors.join(), /keine Beat-Analyse/);
});

test("Gesicht → Bildkoordinaten bei 16:9-Quelle im 9:16-Format", () => {
  // Quelle 1920×1080 cover in 1080×1920: Breite wird 3413 px, Mitte zeigt x 0.5.
  const [x, y] = sourceToFrame([0.5, 0.4], { width: 1920, height: 1080 }, { width: 1080, height: 1920 }, "cover");
  assert.ok(Math.abs(x - 0.5) < 1e-9);
  assert.ok(Math.abs(y - 0.4) < 1e-9);
  const t = {
    fps: 30,
    scenes: [clip("a", 0, 2, { follow: "face", origin: "face" })],
  };
  const track = { samples: Array.from({ length: 21 }, (_, i) => ({ t: i / 10, face: [0.8, 0.4, 0.1, 0.2] })) };
  const r = resolveTimeline(t, { ...ctx, loadTrack: () => track });
  assert.deepEqual(r.errors, []);
  const s = r.props.scenes[0];
  // Gesicht rechts im Querformat → Bildausschnitt wandert nach rechts, Gesicht landet mittig.
  assert.ok(s.pan[0][1] > 0.9);
  assert.ok(Math.abs(s.origin[0] - 0.5) < 0.05);
});

test("Wortzeiten: Wort in der Stille wandert zum Sprechbeginn, Rest bleibt", () => {
  // 0–2 s Sprache, 2–4 s Stille, ab 4 s Sprache. Whisper setzt "Pointe" fälschlich auf 2.5 s.
  const n = Math.round(6 / HOP);
  const db = Float32Array.from({ length: n }, (_, i) => (i * HOP >= 2 && i * HOP < 4 ? -80 : -20));
  const words = [
    { text: "Und", start: 0.2, end: 0.5 },
    { text: "dann?", start: 0.6, end: 1.9 },
    { text: "Pointe.", start: 2.5, end: 3.2 },
    { text: "Danach", start: 4.6, end: 5.0 },
  ];
  const { words: out, changed } = fixWordTimes(words, db);
  assert.equal(changed.length, 1);
  assert.equal(out[2].start, 4);
  assert.equal(out[0].start, 0.2);
  assert.equal(out[3].start, 4.6);
  assert.equal(syllables("Bereitschaftspolizei"), 6);
});

test("Wortzeiten: ohne Dynamik im Ton (Musik, Lärm) bleibt alles unverändert", () => {
  const db = Float32Array.from({ length: 300 }, (_, i) => -30 + (i % 7));
  const words = [{ text: "a", start: 1, end: 2 }];
  const r = fixWordTimes(words, db);
  assert.equal(r.changed.length, 0);
  assert.match(r.skipped, /Dynamik/);
});
