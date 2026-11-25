// Analysen für schon eingelesenes Material nachholen: Tracking (track.md), Hook-Kandidaten (hooks.md), Beats.
// pnpm analyze <name> [--force] [--words]
//   --force  alles neu berechnen
//   --words  zusätzlich Wortzeiten an Stillen korrigieren (Whisper-Original → words.whisper.json)
import fs from "node:fs";
import path from "node:path";
import { analyseClip, analyseMusic, fixWords, hasPython } from "./lib/analysis.mjs";
import { ROOT, fail, projectDir } from "./lib/project.mjs";
import { clipSlug } from "./lib/timeline.mjs";

const args = process.argv.slice(2);
const name = args[0];
const force = args.includes("--force");
const dir = projectDir(name);
if (!hasPython()) fail("Python-Werkzeuge fehlen – erst: pnpm bootstrap");

const rawDir = path.join(dir, "raw");
const files = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter((f) => !f.startsWith(".")).sort() : [];
for (const f of files) {
  const out = path.join(dir, "log", clipSlug(f));
  const metaPath = path.join(out, "meta.json");
  if (!fs.existsSync(metaPath)) {
    console.log(`· ${f} – noch nicht eingelesen (pnpm ingest ${name})`);
    continue;
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const file = path.join(rawDir, f);
  console.log(`→ ${f}`);
  try {
    if (args.includes("--words") && meta.hasAudio && fs.existsSync(path.join(out, "words.json"))) fixWords(file, out);
    analyseClip(file, out, meta, { force });
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
  }
}
analyseMusic(dir, { force });
console.log(`\n✓ Analyse fertig → ${path.relative(ROOT, path.join(dir, "log"))}/<clip>/track.md, hooks.md`);
