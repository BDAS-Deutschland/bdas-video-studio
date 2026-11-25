// Analysen mit den lokalen Python-Werkzeugen (.venv): Tracking, Energie/Hooks, Beats, Freisteller.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fixWordTimes, loudness } from "./align.mjs";
import { ROOT } from "./project.mjs";
import { clipSlug } from "./timeline.mjs";

const PY = path.join(ROOT, ".venv/bin/python");
export const MUSIC = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

export function hasPython() {
  return fs.existsSync(PY) && fs.existsSync(path.join(ROOT, "models/mediapipe/pose_landmarker_full.task"));
}

/** Startet ein Skript aus scripts/py; MediaPipe-Logzeilen werden ausgefiltert. */
export function runPy(script, args) {
  const r = spawnSync(PY, [path.join(ROOT, "scripts/py", script), ...args.map(String)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GLOG_minloglevel: "2", TF_CPP_MIN_LOG_LEVEL: "3" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) {
    const err = (r.stderr || "").split("\n").filter((l) => l && !/^[WI]\d{4}|^INFO:|inference_feedback|WARNING: All log/.test(l));
    throw new Error(`${script} fehlgeschlagen:\n${err.slice(-12).join("\n")}`);
  }
}

/** Wortzeiten korrigieren; das Whisper-Original bleibt als words.whisper.json erhalten. */
export function fixWords(file, outDir) {
  const wordsPath = path.join(outDir, "words.json");
  const backup = path.join(outDir, "words.whisper.json");
  if (!fs.existsSync(backup)) fs.copyFileSync(wordsPath, backup);
  const original = JSON.parse(fs.readFileSync(backup, "utf8"));
  const { words, changed, skipped } = fixWordTimes(original, loudness(file));
  fs.writeFileSync(wordsPath, JSON.stringify(words, null, 1));
  if (skipped) console.log(`  Wortzeiten: ${skipped}`);
  else if (changed.length) {
    const top = [...changed].sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, 4);
    console.log(`  Wortzeiten: ${changed.length} korrigiert (Stille erkannt), z. B. ${top.map((c) => `„${c.text}“ ${c.from.toFixed(2)}→${c.to.toFixed(2)} s`).join(", ")}`);
  } else console.log("  Wortzeiten: passen zum Ton");
  return words;
}

/** Tracking + Energie für einen eingelesenen Clip. */
export function analyseClip(file, outDir, meta, { force = false } = {}) {
  if (!hasPython()) {
    console.log("  (Analyse übersprungen – Python-Werkzeuge fehlen: pnpm bootstrap)");
    return;
  }
  if (meta.hasVideo && meta.width && (force || !fs.existsSync(path.join(outDir, "track.json")))) {
    runPy("track.py", [file, meta.width, meta.height, outDir]);
  }
  if (meta.hasAudio && fs.existsSync(path.join(outDir, "words.json")) && (force || !fs.existsSync(path.join(outDir, "hooks.md")))) {
    runPy("energy.py", [file, path.join(outDir, "words.json"), outDir]);
  }
}

/** Beat-Analyse für alle Musikdateien in projects/<name>/music. */
export function analyseMusic(dir, { force = false } = {}) {
  const musicDir = path.join(dir, "music");
  if (!fs.existsSync(musicDir) || !hasPython()) return;
  for (const f of fs.readdirSync(musicDir).filter((x) => MUSIC.test(x)).sort()) {
    const file = path.join(musicDir, f);
    if (fs.statSync(file).size === 0) continue;
    const out = path.join(dir, "log", clipSlug(`music/${f}`));
    const dest = path.join(out, "beats.json");
    if (!force && fs.existsSync(dest)) continue;
    fs.mkdirSync(out, { recursive: true });
    console.log(`→ music/${f}`);
    runPy("beats.py", [file, dest]);
  }
}
