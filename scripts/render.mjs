import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, argValue, build, fail } from "./lib/project.mjs";

// Ziel-Lautheit für Instagram/TikTok/YouTube: −14 LUFS, Spitzen höchstens −1,5 dBTP.
const LOUDNESS = { I: -14, TP: -1.5, LRA: 11 };

const args = process.argv.slice(2);
const name = args[0];
const draft = args.includes("--draft");
const formatOverride = argValue(args, "--format");
const { dir, propsPath, props } = build(name, { formatOverride });

const d = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const fmt = props.format.replace(":", "x");
const out = path.join(dir, "renders", `${name}_${fmt}_${draft ? "entwurf_" : ""}${stamp}.mp4`);

const flags = ["render", "src/index.ts", "Video", out, `--props=${propsPath}`, `--public-dir=${dir}`];
if (draft) flags.push("--scale=0.5", "--crf=28");
else flags.push("--crf=18");

console.log(`\n→ rendere ${path.relative(ROOT, out)}`);
const r = spawnSync(path.join(ROOT, "node_modules/.bin/remotion"), flags, { cwd: ROOT, stdio: "inherit" });
if (r.status !== 0) fail("Rendern fehlgeschlagen");

/** Lautheit messen (ffmpeg loudnorm, erster Durchgang). */
function measure(file) {
  const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:print_format=json`, "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const json = (m.stderr ?? "").match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  return json ? JSON.parse(json[0]) : null;
}

if (!args.includes("--no-loudnorm")) {
  const hasAudio = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout.trim();
  const m = hasAudio ? measure(out) : null;
  if (m && Number.isFinite(Number(m.input_i))) {
    const tmp = out.replace(/\.mp4$/, ".norm.mp4");
    const filter = `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    const n = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", out, "-c:v", "copy", "-af", filter, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp], { encoding: "utf8" });
    if (n.status === 0) {
      fs.renameSync(tmp, out);
      const after = measure(out);
      console.log(`  Lautheit: ${Number(m.input_i).toFixed(1)} → ${after ? Number(after.input_i).toFixed(1) : "?"} LUFS (Ziel ${LOUDNESS.I}), Spitze ${after ? Number(after.input_tp).toFixed(1) : "?"} dBTP`);
    } else {
      fs.rmSync(tmp, { force: true });
      console.warn(`⚠ Lautheit nicht angepasst: ${n.stderr.slice(-300)}`);
    }
  }
}
console.log(`✓ ${path.relative(ROOT, out)}${draft ? `\n  Selbstprüfung: pnpm qc ${name}` : ""}`);
