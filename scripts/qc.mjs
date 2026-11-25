// Stufe 5: QC-Bögen aus dem neuesten Rendering – 2 Bilder/s, Safe-Zones rot eingezeichnet.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, fail, projectDir } from "./lib/project.mjs";

const COLS = 6;
const ROWS = 4;
const FPS = 2;
const SECONDS_PER_SHEET = (COLS * ROWS) / FPS;

// Anteil, der in Hochkant-Feeds von Bedienelementen verdeckt wird.
const SAFE = { top: 0.14, bottom: 0.22, right: 0.12 };

const name = process.argv[2];
const dir = projectDir(name);
const rendersDir = path.join(dir, "renders");
const renders = fs
  .readdirSync(rendersDir)
  .filter((f) => f.endsWith(".mp4"))
  .map((f) => ({ f, t: fs.statSync(path.join(rendersDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
if (!renders.length) fail(`Kein Rendering in ${path.relative(ROOT, rendersDir)} – erst: pnpm render ${name} --draft`);
const video = path.join(rendersDir, renders[0].f);

const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video], {
  encoding: "utf8",
});
const [w, h] = probe.stdout.trim().split(",").map(Number);
const vertical = h > w;

const boxes = vertical
  ? [
      `drawbox=x=0:y=0:w=iw:h=ih*${SAFE.top}:color=red@0.35:t=fill`,
      `drawbox=x=0:y=ih*${1 - SAFE.bottom}:w=iw:h=ih*${SAFE.bottom}:color=red@0.35:t=fill`,
      `drawbox=x=iw*${1 - SAFE.right}:y=0:w=iw*${SAFE.right}:h=ih:color=red@0.35:t=fill`,
    ]
  : [];

const qcDir = path.join(rendersDir, "qc");
fs.rmSync(qcDir, { recursive: true, force: true });
fs.mkdirSync(qcDir);
const filters = [`fps=${FPS}`, ...boxes, "scale=360:360:force_original_aspect_ratio=decrease", `tile=${COLS}x${ROWS}:padding=4:color=white`].join(",");
const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", filters, "-fps_mode", "vfr", "-q:v", "4", path.join(qcDir, "tmp_%03d.jpg")], {
  encoding: "utf8",
});
if (r.status !== 0) fail(`ffmpeg fehlgeschlagen:\n${r.stderr}`);

const sheets = fs.readdirSync(qcDir).sort().map((f, i) => {
  const from = i * SECONDS_PER_SHEET;
  const target = `qc_${String(from).padStart(3, "0")}-${String(from + SECONDS_PER_SHEET).padStart(3, "0")}s.jpg`;
  fs.renameSync(path.join(qcDir, f), path.join(qcDir, target));
  return target;
});

console.log(`QC für ${renders[0].f}`);
console.log(`  ${sheets.length} Bogen/Bögen in ${path.relative(ROOT, qcDir)}/ – ${FPS} Bilder/s, ${COLS}×${ROWS}, zeilenweise`);
if (vertical) console.log("  Rot = Safe-Zone verletzt, falls dort Text oder Logo liegt");
