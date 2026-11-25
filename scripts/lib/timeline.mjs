import fs from "node:fs";
import path from "node:path";

export const FORMATS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export function clipSlug(file) {
  const base = path.basename(file, path.extname(file));
  return base
    .replace(/ä/gi, "ae")
    .replace(/ö/gi, "oe")
    .replace(/ü/gi, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

const ANCHOR_RE = /^([a-zA-Z0-9_-]+)\.(start|end)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/;

export function parseTime(value, anchors) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") throw new Error(`Zeitangabe fehlt oder ungültig: ${JSON.stringify(value)}`);
  const m = value.trim().match(ANCHOR_RE);
  if (!m) throw new Error(`Anker nicht lesbar: "${value}" (erwartet z. B. "hook.start" oder "ende.start-0.5")`);
  const [, id, edge, sign, offset] = m;
  const key = `${id}.${edge}`;
  if (!(key in anchors)) throw new Error(`Unbekannter Anker "${key}"`);
  const delta = offset ? Number(offset) * (sign === "-" ? -1 : 1) : 0;
  return anchors[key] + delta;
}

function sceneSeconds(scene) {
  if (scene.type === "clip") {
    if (typeof scene.in !== "number" || typeof scene.out !== "number") {
      throw new Error(`Szene "${scene.id}": "in" und "out" (Sekunden) sind Pflicht`);
    }
    if (scene.out <= scene.in) throw new Error(`Szene "${scene.id}": "out" muss nach "in" liegen`);
    return scene.out - scene.in;
  }
  if (typeof scene.duration !== "number" || scene.duration <= 0) {
    throw new Error(`Szene "${scene.id}": "duration" (Sekunden) ist Pflicht`);
  }
  return scene.duration;
}

function overlayWindow(o, resolveAt, label) {
  const start = resolveAt(o.at);
  let end;
  if (o.until !== undefined) end = resolveAt(o.until);
  else if (typeof o.duration === "number") end = start + o.duration;
  else throw new Error(`${label}: "duration" oder "until" fehlt`);
  if (end <= start) throw new Error(`${label}: Ende liegt vor dem Anfang`);
  return { start, end };
}

const SENTENCE_END = /[.!?…:;]$/;

export function chunkWords(words, { maxWords = 4, maxGap = 0.6 } = {}) {
  const chunks = [];
  let cur = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const breakHere =
      cur.length >= maxWords || (prev && (w.start - prev.end > maxGap || SENTENCE_END.test(prev.text)));
    if (breakHere && cur.length) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((ws, i) => {
    const next = chunks[i + 1];
    const last = ws[ws.length - 1];
    const end = next && next[0].start - last.end < 0.3 ? next[0].start : last.end + 0.2;
    return { start: ws[0].start, end, words: ws };
  });
}

/**
 * Löst timeline.json zu absoluten Zeiten auf.
 * @param {object} timeline
 * @param {{ loadWords?: (src: string) => Array<{text:string,start:number,end:number}> | null,
 *           loadMeta?: (src: string) => {duration:number, hasAudio:boolean} | null,
 *           brand?: object, formatOverride?: string }} [ctx]
 */
export function resolveTimeline(timeline, ctx = {}) {
  const errors = [];
  const warnings = [];
  const format = ctx.formatOverride ?? timeline.format ?? "9:16";
  const dims = FORMATS[format];
  if (!dims) errors.push(`Unbekanntes Format "${format}" (erlaubt: ${Object.keys(FORMATS).join(", ")})`);
  const fps = timeline.fps ?? 30;
  const brand = ctx.brand ?? {};
  const toFrame = (s) => Math.round(s * fps);

  const scenes = [];
  const anchors = {};
  const ids = new Set();
  let t = 0;
  for (const [i, scene] of (timeline.scenes ?? []).entries()) {
    const label = `Szene ${i + 1}${scene.id ? ` "${scene.id}"` : ""}`;
    if (!scene.id) {
      errors.push(`${label}: "id" fehlt`);
      continue;
    }
    if (ids.has(scene.id)) errors.push(`${label}: id doppelt`);
    ids.add(scene.id);
    if (!["clip", "card", "cta"].includes(scene.type)) {
      errors.push(`${label}: unbekannter Typ "${scene.type}"`);
      continue;
    }
    let seconds;
    try {
      seconds = sceneSeconds(scene);
    } catch (e) {
      errors.push(e.message);
      continue;
    }
    if (scene.type === "clip") {
      const meta = ctx.loadMeta?.(scene.src);
      if (meta === null) warnings.push(`${label}: keine Metadaten zu "${scene.src}" – erst "pnpm ingest" laufen lassen`);
      else if (meta && scene.out > meta.duration + 0.05) {
        errors.push(`${label}: "out" ${scene.out}s liegt hinter dem Clipende (${meta.duration.toFixed(2)}s)`);
      }
    }
    const start = t;
    const end = t + seconds;
    anchors[`${scene.id}.start`] = start;
    anchors[`${scene.id}.end`] = end;
    scenes.push({ ...scene, start, end, startFrame: toFrame(start), durationInFrames: toFrame(end) - toFrame(start) });
    t = end;
  }
  const totalSeconds = t;
  if (scenes.length === 0) errors.push("Keine gültigen Szenen");

  const overlays = [];
  const addOverlay = (o, label, resolveAt, bounds) => {
    try {
      const { start, end } = overlayWindow(o, resolveAt, label);
      if (start < bounds.start - 0.001 || end > bounds.end + 0.001) {
        errors.push(`${label}: liegt außerhalb von ${bounds.name} (${start.toFixed(2)}–${end.toFixed(2)}s)`);
        return;
      }
      if (o.text) {
        const words = String(o.text).split(/\s+/).filter(Boolean).length;
        const min = Math.max(1.2, words * 0.3);
        if (end - start < min - 0.001) warnings.push(`${label}: nur ${(end - start).toFixed(1)}s sichtbar, empfohlen ≥ ${min.toFixed(1)}s`);
      }
      overlays.push({ ...o, start, end, startFrame: toFrame(start), durationInFrames: Math.max(1, toFrame(end) - toFrame(start)) });
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
    }
  };
  for (const s of scenes) {
    for (const [j, o] of (s.overlays ?? []).entries()) {
      const rel = (v) => {
        if (typeof v !== "number") throw new Error(`Overlays in Szenen brauchen Sekunden ab Szenenbeginn, nicht "${v}"`);
        return s.start + v;
      };
      addOverlay(o, `Overlay ${j + 1} in "${s.id}"`, rel, { start: s.start, end: s.end, name: `Szene "${s.id}"` });
    }
  }
  for (const [j, o] of (timeline.overlays ?? []).entries()) {
    addOverlay(o, `Globales Overlay ${j + 1} (${o.type})`, (v) => parseTime(v, anchors), {
      start: 0,
      end: totalSeconds,
      name: "dem Video",
    });
  }

  const captions = [];
  if (timeline.captions) {
    const maxWords = brand.captions?.maxWordsPerChunk ?? 4;
    for (const s of scenes) {
      if (s.type !== "clip" || s.volume === 0 || s.captions === false) continue;
      const words = ctx.loadWords?.(s.src);
      if (!words) {
        warnings.push(`Szene "${s.id}": kein Transkript für Untertitel`);
        continue;
      }
      const inScene = words
        .filter((w) => w.start >= s.in - 0.05 && w.end <= s.out + 0.05)
        .map((w) => ({
          text: w.text,
          start: Math.max(s.start, s.start + (w.start - s.in)),
          end: Math.min(s.end, s.start + (w.end - s.in)),
        }));
      for (const c of chunkWords(inScene, { maxWords })) {
        const end = Math.min(c.end, s.end);
        captions.push({
          startFrame: toFrame(c.start),
          durationInFrames: Math.max(1, toFrame(end) - toFrame(c.start)),
          words: c.words.map((w) => ({ text: w.text, startFrame: toFrame(w.start), endFrame: toFrame(w.end) })),
        });
      }
    }
  }

  let music = null;
  if (timeline.music) {
    const duck = scenes
      .filter((s) => s.type === "clip" && s.volume !== 0 && ctx.loadMeta?.(s.src)?.hasAudio !== false)
      .map((s) => [s.startFrame, s.startFrame + s.durationInFrames]);
    music = {
      src: timeline.music.src,
      volume: timeline.music.volume ?? 0.25,
      duckTo: timeline.music.duckTo ?? timeline.music.volume ?? 0.25,
      duckRanges: duck,
    };
  }

  return {
    errors,
    warnings,
    anchors,
    props: {
      format,
      ...(dims ?? FORMATS["9:16"]),
      fps,
      durationInFrames: Math.max(1, toFrame(totalSeconds)),
      scenes,
      overlays,
      captions,
      music,
      brand,
    },
  };
}

export function loadProject(projectDir) {
  const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  const timeline = read(path.join(projectDir, "timeline.json"));
  const logFor = (src, file) => path.join(projectDir, "log", clipSlug(src), file);
  const loadJson = (p) => (fs.existsSync(p) ? read(p) : null);
  return {
    timeline,
    loadWords: (src) => loadJson(logFor(src, "words.json")),
    loadMeta: (src) => loadJson(logFor(src, "meta.json")),
  };
}

export function formatTable(resolved) {
  const { props, anchors } = resolved;
  const lines = [];
  const f = (s) => s.toFixed(2).padStart(7);
  lines.push(`Format ${props.format} · ${props.width}×${props.height} · ${props.fps} fps · Länge ${(props.durationInFrames / props.fps).toFixed(2)} s`);
  lines.push("");
  lines.push("Szenen");
  for (const s of props.scenes) {
    const src = s.type === "clip" ? `${s.src} ${s.in}–${s.out}` : s.title ?? "";
    lines.push(`  ${f(s.start)} → ${f(s.end)}  ${s.id.padEnd(14)} ${s.type.padEnd(5)} ${src}`);
  }
  if (props.overlays.length) {
    lines.push("");
    lines.push("Overlays");
    for (const o of props.overlays) {
      lines.push(`  ${f(o.start)} → ${f(o.end)}  ${o.type.padEnd(6)} ${o.text ?? o.position ?? ""}`);
    }
  }
  lines.push("");
  lines.push(`Untertitel-Blöcke: ${props.captions.length}${props.music ? ` · Musik: ${props.music.src}` : ""}`);
  lines.push(`Anker: ${Object.entries(anchors).map(([k, v]) => `${k}=${v.toFixed(2)}`).join("  ")}`);
  return lines.join("\n");
}
