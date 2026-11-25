// Freisteller (Person mit Alphakanal) für alle Clip-Szenen mit "cutout": true erzeugen.
// pnpm cutout <name> [--force]
import fs from "node:fs";
import path from "node:path";
import { hasPython, runPy } from "./lib/analysis.mjs";
import { ROOT, fail, projectDir } from "./lib/project.mjs";
import { clipSlug, cutoutName } from "./lib/timeline.mjs";

const args = process.argv.slice(2);
const name = args[0];
const force = args.includes("--force");
const dir = projectDir(name);
if (!hasPython()) fail("Python-Werkzeuge fehlen – erst: pnpm bootstrap");

const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const fps = timeline.fps ?? 30;
const scenes = (timeline.scenes ?? []).filter((s) => s.type === "clip" && s.cutout);
if (!scenes.length) {
  console.log('Keine Szene mit "cutout": true in timeline.json.');
  process.exit(0);
}
for (const s of scenes) {
  const logDir = path.join(dir, "log", clipSlug(s.src));
  const metaPath = path.join(logDir, "meta.json");
  if (!fs.existsSync(metaPath)) fail(`Szene "${s.id}": ${s.src} ist noch nicht eingelesen (pnpm ingest ${name})`);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const dest = path.join(logDir, cutoutName(s, fps));
  if (!force && fs.existsSync(dest)) {
    console.log(`· ${s.id} – Freisteller vorhanden`);
    continue;
  }
  console.log(`→ ${s.id}: ${s.src} ${s.in}–${s.out} s (dauert etwa 9 s je Sekunde Video)`);
  runPy("cutout.py", [path.join(dir, s.src), s.in, s.out, fps, meta.width, meta.height, dest]);
}
console.log(`\n✓ Freisteller fertig → ${path.relative(ROOT, path.join(dir, "log"))}/<clip>/cutout_*.webm`);
