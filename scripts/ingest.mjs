// Stufe 1: Rohmaterial einlesen – Metadaten, Kontaktbögen, Szenenwechsel, Transkript.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, argValue, fail, projectDir } from "./lib/project.mjs";
import { clipSlug } from "./lib/timeline.mjs";

const MEDIA = /\.(mp4|mov|m4v|mkv|webm|avi|mts|mp3|wav|m4a|aac)$/i;
const SHEET_COLS = 6;
const SHEET_ROWS = 4;
const PER_SHEET = SHEET_COLS * SHEET_ROWS;

const args = process.argv.slice(2);
const name = args[0];
const force = args.includes("--force");
const lang = argValue(args, "--lang") ?? "de";
const dir = projectDir(name);
const rawDir = path.join(dir, "raw");
const model = fs.readdirSync(path.join(ROOT, "models")).find((f) => f.endsWith(".bin"));
if (!model) fail("Kein Whisper-Modell in models/ – erst: pnpm bootstrap");

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) fail(`${cmd} fehlgeschlagen:\n${(r.stderr || "").split("\n").slice(-15).join("\n")}`);
  return r;
}

function probe(file) {
  const r = run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const info = JSON.parse(r.stdout);
  const v = info.streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const a = info.streams.find((s) => s.codec_type === "audio");
  const rotation = Number(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v?.tags?.rotate ?? 0);
  let [w, h] = [v?.width, v?.height];
  if (Math.abs(rotation) % 180 === 90) [w, h] = [h, w];
  const [num, den] = (v?.avg_frame_rate ?? "0/1").split("/").map(Number);
  return {
    file: path.relative(dir, file),
    duration: Number(info.format.duration),
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    width: w ?? null,
    height: h ?? null,
    orientation: !v ? null : w > h ? "quer" : w < h ? "hoch" : "quadratisch",
    fps: den ? Math.round((num / den) * 100) / 100 : null,
  };
}

function contactSheets(file, outDir, duration) {
  for (const f of fs.readdirSync(outDir)) if (f.startsWith("sheet_")) fs.rmSync(path.join(outDir, f));
  run("ffmpeg", [
    "-v", "error", "-y", "-i", file,
    "-vf", `fps=1,scale=320:320:force_original_aspect_ratio=decrease,tile=${SHEET_COLS}x${SHEET_ROWS}:padding=4:color=white`,
    "-fps_mode", "vfr", "-q:v", "4",
    path.join(outDir, "tmp_sheet_%03d.jpg"),
  ]);
  const tmp = fs.readdirSync(outDir).filter((f) => f.startsWith("tmp_sheet_")).sort();
  return tmp.map((f, i) => {
    const from = i * PER_SHEET;
    const to = Math.min(Math.ceil(duration), from + PER_SHEET);
    const target = `sheet_${String(from).padStart(3, "0")}-${String(to).padStart(3, "0")}s.jpg`;
    fs.renameSync(path.join(outDir, f), path.join(outDir, target));
    return target;
  });
}

function sceneChanges(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", "scdet=threshold=12", "-an", "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return [...(r.stderr ?? "").matchAll(/lavfi\.scd\.time:\s*([\d.]+)/g)].map((m) => Number(Number(m[1]).toFixed(2)));
}

function transcribe(file, outDir) {
  const wav = path.join(outDir, "audio.wav");
  run("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
  const base = path.join(outDir, "whisper");
  run("whisper-cli", ["-m", path.join(ROOT, "models", model), "-f", wav, "-l", lang, "-ml", "1", "-sow", "-oj", "-of", base, "-np"]);
  fs.rmSync(wav);
  const raw = JSON.parse(fs.readFileSync(`${base}.json`, "utf8"));
  fs.rmSync(`${base}.json`);
  const words = raw.transcription
    .map((s) => ({ text: s.text.trim(), start: s.offsets.from / 1000, end: s.offsets.to / 1000 }))
    .filter((w) => w.text && !/^\[.*\]$|^\(.*\)$/.test(w.text));
  // Satzzeichen ohne eigenes Wort an das vorige Wort hängen.
  const merged = [];
  for (const w of words) {
    if (/^[.,!?;:…»«"'”“)]+$/.test(w.text) && merged.length) {
      merged[merged.length - 1].text += w.text;
      merged[merged.length - 1].end = w.end;
    } else merged.push({ ...w });
  }
  return merged;
}

function transcriptMarkdown(slug, words) {
  const lines = [`# Transkript ${slug}`, "", "Zeiten in Sekunden. Wortgenaue Zeiten stehen in words.json.", ""];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push(`[${cur[0].start.toFixed(1)}–${cur[cur.length - 1].end.toFixed(1)}] ${cur.map((w) => w.text).join(" ")}`);
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end > 0.8 || /[.!?]$/.test(prev.text))) flush();
    cur.push(w);
  }
  flush();
  return lines.join("\n") + "\n";
}

if (!fs.existsSync(rawDir)) fail(`Ordner fehlt: ${rawDir}`);
const files = fs.readdirSync(rawDir).filter((f) => MEDIA.test(f)).sort();
if (!files.length) fail(`Keine Mediendateien in ${path.relative(ROOT, rawDir)}`);

const logDir = path.join(dir, "log");
fs.mkdirSync(logDir, { recursive: true });
const index = [];

for (const f of files) {
  const file = path.join(rawDir, f);
  const slug = clipSlug(f);
  const out = path.join(logDir, slug);
  const metaPath = path.join(out, "meta.json");
  fs.mkdirSync(out, { recursive: true });

  if (!force && fs.existsSync(metaPath)) {
    console.log(`· ${f} – schon eingelesen (--force zum Wiederholen)`);
  } else {
    console.log(`→ ${f}`);
    const meta = probe(file);
    if (meta.hasVideo) {
      meta.sheets = contactSheets(file, out, meta.duration);
      console.log(`  ${meta.sheets.length} Kontaktbogen/-bögen`);
      meta.sceneChanges = sceneChanges(file);
      fs.writeFileSync(path.join(out, "scenes.txt"), meta.sceneChanges.join("\n") + "\n");
      console.log(`  ${meta.sceneChanges.length} Szenenwechsel`);
    }
    if (meta.hasAudio) {
      const words = transcribe(file, out);
      fs.writeFileSync(path.join(out, "words.json"), JSON.stringify(words, null, 1));
      fs.writeFileSync(path.join(out, "transcript.md"), transcriptMarkdown(slug, words));
      meta.words = words.length;
      console.log(`  ${words.length} Wörter transkribiert`);
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  index.push({ slug, ...JSON.parse(fs.readFileSync(metaPath, "utf8")) });
}

const rows = index.map(
  (m) =>
    `| ${m.slug} | \`${m.file}\` | ${m.duration.toFixed(1)} s | ${m.width ? `${m.width}×${m.height} ${m.orientation}` : "nur Ton"} | ${m.words ?? 0} | ${m.sheets?.length ?? 0} |`,
);
fs.writeFileSync(
  path.join(logDir, "index.md"),
  [
    "# Material-Übersicht (automatisch)",
    "",
    "| Clip | Datei (`src`) | Dauer | Bild | Wörter | Bögen |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n"),
);

const clipsMd = path.join(logDir, "clips.md");
if (!fs.existsSync(clipsMd)) {
  fs.writeFileSync(
    clipsMd,
    `# Drehprotokoll\n\n<!-- Claude füllt das aus: pro Clip Inhalt, beste Momente (Zeitbereich + Zitat), Probleme, Eignung. Siehe CLAUDE.md, Stufe 1. -->\n\n${index.map((m) => `## ${m.slug}\n`).join("\n")}`,
  );
}

console.log(`\n✓ ${index.length} Datei(en) eingelesen → ${path.relative(ROOT, logDir)}/index.md`);
console.log("  Nächster Schritt: Claude schreibt log/clips.md (Drehprotokoll).");
