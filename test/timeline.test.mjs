import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkWords, clipSlug, parseTime, resolveTimeline } from "../scripts/lib/timeline.mjs";

const words = [
  { text: "Hallo", start: 10.0, end: 10.4 },
  { text: "wir", start: 10.5, end: 10.7 },
  { text: "sind", start: 10.8, end: 11.0 },
  { text: "BDAS.", start: 11.1, end: 11.6 },
  { text: "Danach", start: 13.0, end: 13.4 },
];

const base = {
  format: "9:16",
  fps: 30,
  captions: true,
  scenes: [
    { id: "hook", type: "clip", src: "raw/a.mp4", in: 10, out: 12 },
    { id: "fakt", type: "card", title: "Fakt", duration: 2 },
    { id: "ende", type: "cta", title: "Mach mit", duration: 3 },
  ],
  overlays: [{ type: "logo", at: "hook.start", until: "ende.start-0.5" }],
};
const ctx = { loadWords: () => words, loadMeta: () => ({ duration: 60, hasAudio: true }) };

test("Szenen laufen nacheinander und erzeugen Anker", () => {
  const r = resolveTimeline(base, ctx);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.anchors, { "hook.start": 0, "hook.end": 2, "fakt.start": 2, "fakt.end": 4, "ende.start": 4, "ende.end": 7 });
  assert.equal(r.props.durationInFrames, 210);
  assert.equal(r.props.width, 1080);
});

test("globales Overlay folgt dem Anker, wenn sich ein Clip ändert", () => {
  const longer = structuredClone(base);
  longer.scenes[0].out = 13;
  const r = resolveTimeline(longer, ctx);
  assert.equal(r.props.overlays[0].start, 0);
  assert.equal(r.props.overlays[0].end, 4.5);
});

test("Anker mit Versatz und Fehler bei unbekanntem Anker", () => {
  assert.equal(parseTime("a.end+1.5", { "a.end": 2 }), 3.5);
  assert.throws(() => parseTime("x.start", {}), /Unbekannter Anker/);
  const bad = structuredClone(base);
  bad.overlays[0].at = "gibtsnicht.start";
  assert.match(resolveTimeline(bad, ctx).errors.join(), /Unbekannter Anker/);
});

test("Untertitel nur aus dem gewählten Ausschnitt, auf Videozeit verschoben", () => {
  const r = resolveTimeline(base, ctx);
  const all = r.props.captions.flatMap((c) => c.words.map((w) => w.text));
  assert.deepEqual(all, ["Hallo", "wir", "sind", "BDAS."]);
  assert.equal(r.props.captions[0].words[0].startFrame, 0);
});

test("Fehler: out hinter Clipende, Overlay außerhalb der Szene, doppelte id", () => {
  const bad = structuredClone(base);
  bad.scenes[0].out = 70;
  bad.scenes[1].overlays = [{ type: "text", text: "zu lang", at: 1, duration: 5 }];
  bad.scenes[2].id = "fakt";
  const errs = resolveTimeline(bad, ctx).errors.join("\n");
  assert.match(errs, /hinter dem Clipende/);
  assert.match(errs, /außerhalb von Szene "fakt"/);
  assert.match(errs, /id doppelt/);
});

test("Warnung, wenn Text zu kurz sichtbar ist", () => {
  const t = structuredClone(base);
  t.scenes[1].overlays = [{ type: "text", text: "eins zwei drei vier fünf sechs", at: 0, duration: 1 }];
  assert.match(resolveTimeline(t, ctx).warnings.join(), /empfohlen ≥ 1.8s/);
});

test("Musik wird während Clips mit Ton abgesenkt", () => {
  const t = { ...base, music: { src: "music/x.mp3", volume: 0.3, duckTo: 0.1 } };
  assert.deepEqual(resolveTimeline(t, ctx).props.music.duckRanges, [[0, 60]]);
});

test("Formatwechsel für Varianten", () => {
  const r = resolveTimeline(base, { ...ctx, formatOverride: "16:9" });
  assert.equal(r.props.width, 1920);
  assert.equal(r.props.height, 1080);
});

test("Wörter werden an Satzende und Pausen in Blöcke geteilt", () => {
  const chunks = chunkWords(words, { maxWords: 4 });
  assert.deepEqual(chunks.map((c) => c.words.length), [4, 1]);
});

test("clipSlug ist dateisystemfreundlich", () => {
  assert.equal(clipSlug("raw/Interview Größe 01.MOV"), "interview_groesse_01");
});
