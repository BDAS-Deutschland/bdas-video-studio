import { spawnSync } from "node:child_process";
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

/**
 * Übergänge zwischen Szenen. Sie stehen an der Szene, in die übergeblendet wird.
 * kind "series": beide Szenen sind kurz gleichzeitig zu sehen, mittig um den Schnitt (Zeiten bleiben gleich).
 * kind "overlay": harter Schnitt mit Effekt darüber (Light Leak, Blitz).
 * Richtungswörter beschreiben, wohin sich das Bild bewegt: "slide-left" = neues Bild kommt von rechts.
 */
export const TRANSITIONS = (() => {
  const t = { cut: { kind: "cut" }, fade: { kind: "fade" } };
  for (const d of ["left", "right", "up", "down"]) {
    t[`slide-${d}`] = { kind: "series", seconds: 0.4, sfx: "swish" };
    t[`whip-${d}`] = { kind: "series", seconds: 0.27, sfx: "whip" };
    t[`wipe-${d}`] = { kind: "series", seconds: 0.45, sfx: "swish" };
    t[`cube-${d}`] = { kind: "series", seconds: 0.6, sfx: "whoosh" };
    t[`flip-${d}`] = { kind: "series", seconds: 0.6, sfx: "swish" };
  }
  Object.assign(t, {
    push: { kind: "series", seconds: 0.3, sfx: "whoosh" },
    zoom: { kind: "series", seconds: 0.35, sfx: "whoosh" },
    "zoom-in-out": { kind: "series", seconds: 0.5, sfx: "whoosh-long" },
    "cross-zoom": { kind: "series", seconds: 0.5, sfx: "whoosh-long" },
    "linear-blur": { kind: "series", seconds: 0.4, sfx: "whoosh" },
    swap: { kind: "series", seconds: 0.6, sfx: "whoosh" },
    crosswarp: { kind: "series", seconds: 0.6, sfx: "swish" },
    ripple: { kind: "series", seconds: 0.7, sfx: null },
    dreamy: { kind: "series", seconds: 0.7, sfx: null },
    crossfade: { kind: "series", seconds: 0.4, sfx: null },
    iris: { kind: "series", seconds: 0.5, sfx: "swish" },
    clock: { kind: "series", seconds: 0.6, sfx: "swish" },
    "light-leak": { kind: "overlay", seconds: 0.8, sfx: "whoosh-long" },
    flash: { kind: "overlay", seconds: 0.3, sfx: null },
  });
  return t;
})();

export const OVERLAY_TYPES = [
  "title", "text", "logo", "media", "headline", "stat", "audio", "sticker", "comment", "notify", "button",
  "sfx", "draw", "lottie", "leak", "flash", "shake", "punch",
];
const DRAW_SHAPES = ["circle", "underline", "arrow", "check", "cross", "box"];
const BEAT_KINDS = { beat: "beats", bar: "bars", hit: "hits" };

const ANCHOR_RE = /^([a-zA-Z0-9_-]+)\.(start|end|\d+)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/;

export function parseTime(value, anchors) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") throw new Error(`Zeitangabe fehlt oder ungültig: ${JSON.stringify(value)}`);
  const m = value.trim().match(ANCHOR_RE);
  if (!m) throw new Error(`Anker nicht lesbar: "${value}" (erwartet z. B. "hook.start", "ende.start-0.5" oder "beat.12")`);
  const [, id, edge, sign, offset] = m;
  const key = `${id}.${edge}`;
  if (!(key in anchors)) {
    if (id in BEAT_KINDS && !(`${id}.1` in anchors)) {
      throw new Error(`Unbekannter Anker "${key}" – keine Beat-Analyse der Musik (erst: pnpm analyze <name>)`);
    }
    throw new Error(`Unbekannter Anker "${key}"`);
  }
  const delta = offset ? Number(offset) * (sign === "-" ? -1 : 1) : 0;
  return anchors[key] + delta;
}

function sceneSeconds(scene) {
  if (scene.type === "clip") {
    if (typeof scene.in !== "number" || typeof scene.out !== "number") {
      throw new Error(`Szene "${scene.id}": "in" und "out" (Sekunden) sind Pflicht`);
    }
    if (scene.out <= scene.in) throw new Error(`Szene "${scene.id}": "out" muss nach "in" liegen`);
    const speed = scene.speed ?? 1;
    if (!(speed > 0)) throw new Error(`Szene "${scene.id}": "speed" muss größer als 0 sein`);
    return (scene.out - scene.in) / speed;
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

// ------------------------------------------------------------ Bildgeometrie (Tracking → Bildkoordinaten)

/** Größe des Quellbildes nach object-fit im Ausgabeformat. */
function displaySize(src, dims, fit = "cover") {
  const k = fit === "contain" ? Math.min(dims.width / src.width, dims.height / src.height) : Math.max(dims.width / src.width, dims.height / src.height);
  return { dw: src.width * k, dh: src.height * k };
}

/** Punkt im Quellbild (Anteile) → Punkt im Ausgabebild (Anteile), bei object-position px/py (0–1). */
export function sourceToFrame([fx, fy], src, dims, fit, [px, py] = [0.5, 0.5]) {
  const { dw, dh } = displaySize(src, dims, fit);
  const x = (dims.width - dw) * px + fx * dw;
  const y = (dims.height - dh) * py + fy * dh;
  return [x / dims.width, y / dims.height];
}

/** object-position, die den Punkt (fx, fy) möglichst an die Zielstelle im Bild schiebt. */
function panFor([fx, fy], src, dims, fit, target = [0.5, 0.4]) {
  const { dw, dh } = displaySize(src, dims, fit);
  const solve = (f, d, size, t) => (Math.abs(size - d) < 1 ? 0.5 : Math.min(1, Math.max(0, (f * d - t * size) / (d - size))));
  return [solve(fx, dw, dims.width, target[0]), solve(fy, dh, dims.height, target[1])];
}

/** Gesichtsmittelpunkte (Quelle, Anteile) zwischen t0 und t1, Lücken mit Nachbarwerten gefüllt. */
function faceSeries(track, t0, t1) {
  const pts = (track?.samples ?? []).filter((s) => s.t >= t0 - 0.5 && s.t <= t1 + 0.5 && s.face).map((s) => ({ t: s.t, x: s.face[0], y: s.face[1] }));
  return pts;
}

function average(pts) {
  if (!pts.length) return null;
  return [pts.reduce((a, p) => a + p.x, 0) / pts.length, pts.reduce((a, p) => a + p.y, 0) / pts.length];
}

function smoothAt(pts, t, radius = 0.6) {
  const near = pts.filter((p) => Math.abs(p.t - t) <= radius);
  return average(near.length ? near : [pts.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), pts[0])]);
}

// ------------------------------------------------------------ Auflösen

/**
 * Löst timeline.json zu absoluten Zeiten auf.
 * @param {object} timeline
 * @param {{ loadWords?: (src: string) => Array<{text:string,start:number,end:number}> | null,
 *           loadMeta?: (src: string) => {duration:number, hasAudio:boolean, width?:number, height?:number} | null,
 *           loadTrack?: (src: string) => {samples: Array<{t:number, face: number[] | null}>} | null,
 *           loadBeats?: (src: string) => {duration:number, beats:number[], bars:number[], hits:number[]} | null,
 *           loadLottie?: (o: object) => object | null,
 *           cutoutFor?: (scene: object) => {src: string, exists: boolean},
 *           sfx?: Record<string, {file:string, duration:number, volume:number, peak:number}>,
 *           brand?: object, formatOverride?: string }} [ctx]
 */
export function resolveTimeline(timeline, ctx = {}) {
  const errors = [];
  const warnings = [];
  const format = ctx.formatOverride ?? timeline.format ?? "9:16";
  const dims = FORMATS[format];
  if (!dims) errors.push(`Unbekanntes Format "${format}" (erlaubt: ${Object.keys(FORMATS).join(", ")})`);
  const frameDims = dims ?? FORMATS["9:16"];
  const fps = timeline.fps ?? 30;
  const brand = ctx.brand ?? {};
  const toFrame = (s) => Math.round(s * fps);
  const usedSfx = new Set();

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
    scenes.push({ ...scene, start, end, startFrame: toFrame(start), durationInFrames: toFrame(end) - toFrame(start), lead: 0, tail: 0 });
    t = end;
  }
  const totalSeconds = t;
  if (scenes.length === 0) errors.push("Keine gültigen Szenen");

  // ---------------------------------------------------------- Übergänge
  const transitionSfx = [];
  const transitionFx = [];
  const transitionWindows = [];
  for (const [i, s] of scenes.entries()) {
    const raw = s.transition ?? "cut";
    const tr = typeof raw === "string" ? { type: raw } : raw && typeof raw === "object" ? raw : null;
    s.transition = undefined;
    if (!tr || typeof tr.type !== "string") {
      errors.push(`Szene "${s.id}": "transition" muss ein Name oder {"type": …} sein`);
      continue;
    }
    const def = TRANSITIONS[tr.type];
    if (!def) {
      errors.push(`Szene "${s.id}": unbekannter Übergang "${tr.type}" (erlaubt: ${Object.keys(TRANSITIONS).join(", ")})`);
      continue;
    }
    if (def.kind === "fade") s.transition = "fade";
    if (def.kind === "cut" || def.kind === "fade") continue;
    if (i === 0) {
      errors.push(`Szene "${s.id}": Übergang "${tr.type}" braucht eine Szene davor`);
      continue;
    }
    const frames = Math.max(2, toFrame(tr.duration ?? def.seconds));
    const before = Math.floor(frames / 2);
    transitionWindows.push({ start: (s.startFrame - before) / fps, end: (s.startFrame - before + frames) / fps, type: tr.type });
    if (def.kind === "series") {
      s.lead = before;
      scenes[i - 1].tail = frames - before;
      s.enter = { type: tr.type, frames };
    } else {
      transitionFx.push({
        type: tr.type === "light-leak" ? "leak" : "flash",
        seed: tr.seed,
        hue: tr.hue,
        color: tr.color,
        startFrame: s.startFrame - before,
        durationInFrames: frames,
        start: (s.startFrame - before) / fps,
        end: (s.startFrame - before + frames) / fps,
      });
    }
    const sfxName = tr.sfx === undefined ? def.sfx : tr.sfx;
    if (sfxName && timeline.transitionSfx !== false) {
      transitionSfx.push({ type: "sfx", name: sfxName, at: s.start, align: "peak", volume: tr.sfxVolume, label: `Übergang zu "${s.id}"` });
    }
  }
  for (const s of scenes) {
    if (s.lead + s.tail > s.durationInFrames) {
      errors.push(`Szene "${s.id}" (${(s.durationInFrames / fps).toFixed(2)}s) ist zu kurz für ihre Übergänge (brauchen ${((s.lead + s.tail) / fps).toFixed(2)}s)`);
    }
    if (s.type !== "clip") continue;
    const speed = s.speed ?? 1;
    const meta = ctx.loadMeta?.(s.src);
    // Vorlauf/Nachlauf aus dem Quellclip spielen, wenn Material da ist – sonst Standbild.
    s.leadMode = s.in - (s.lead / fps) * speed >= 0 ? "play" : "freeze";
    s.tailMode = !meta || s.out + (s.tail / fps) * speed <= meta.duration - 0.05 ? "play" : "freeze";
  }

  // ---------------------------------------------------------- Tracking: Gesicht verfolgen
  for (const s of scenes) {
    if (s.type !== "clip") continue;
    const wantsFace = s.follow === "face" || s.origin === "face" || (s.overlays ?? []).some((o) => o.type === "punch" && o.origin === "face");
    if (!wantsFace) continue;
    const meta = ctx.loadMeta?.(s.src);
    const track = ctx.loadTrack?.(s.src);
    const src = meta?.width && meta?.height ? { width: meta.width, height: meta.height } : null;
    const pts = faceSeries(track, s.in, s.out);
    if (!track || !src) {
      errors.push(`Szene "${s.id}": kein Tracking für "${s.src}" (erst: pnpm analyze <name>)`);
      s.origin = undefined;
      s.follow = undefined;
      continue;
    }
    if (!pts.length) {
      warnings.push(`Szene "${s.id}": im Ausschnitt wurde kein Gesicht erkannt – Mitte statt Gesicht`);
      if (s.origin === "face") s.origin = undefined;
      s.follow = undefined;
      s.faceAt = () => null;
      continue;
    }
    const speed = s.speed ?? 1;
    const fit = s.fit ?? "cover";
    if (s.follow === "face") {
      const keys = [];
      const step = 0.2 * speed;
      for (let st = s.in; st <= s.out + 1e-6; st += step) {
        const c = smoothAt(pts, st);
        const [px, py] = panFor(c, src, frameDims, fit);
        keys.push([Math.round(((st - s.in) / speed) * fps), Number(px.toFixed(4)), Number(py.toFixed(4))]);
      }
      s.pan = keys;
    }
    const panAt = (st) => {
      if (!s.pan) return [0.5, 0.5];
      const f = ((st - s.in) / speed) * fps;
      const k = s.pan.reduce((best, p) => (Math.abs(p[0] - f) < Math.abs(best[0] - f) ? p : best), s.pan[0]);
      return [k[1], k[2]];
    };
    s.faceAt = (st, radius = 0.6) => {
      const c = smoothAt(pts, st, radius);
      return c ? sourceToFrame(c, src, frameDims, fit, panAt(st)).map((v) => Number(v.toFixed(4))) : null;
    };
    if (s.origin === "face") {
      const c = average(pts.filter((p) => p.t >= s.in && p.t <= s.out)) ?? average(pts);
      s.origin = sourceToFrame(c, src, frameDims, fit, panAt((s.in + s.out) / 2)).map((v) => Number(v.toFixed(4)));
    }
  }

  // ---------------------------------------------------------- Musik und Beats
  let music = null;
  let beatInfo = null;
  if (timeline.music) {
    const from = timeline.music.from ?? 0;
    const duck = scenes
      .filter((s) => s.type === "clip" && s.volume !== 0 && ctx.loadMeta?.(s.src)?.hasAudio !== false)
      .map((s) => [s.startFrame, s.startFrame + s.durationInFrames]);
    music = {
      src: timeline.music.src,
      from,
      volume: timeline.music.volume ?? 0.25,
      duckTo: timeline.music.duckTo ?? timeline.music.volume ?? 0.25,
      duckRanges: duck,
    };
    const beats = ctx.loadBeats?.(timeline.music.src);
    if (beats) {
      const period = Math.max(0.5, (beats.duration ?? 0) - from);
      for (const [name, key] of Object.entries(BEAT_KINDS)) {
        let n = 0;
        for (let loop = 0; loop * period < totalSeconds + period; loop++) {
          for (const bt of beats[key] ?? []) {
            const vt = bt - from + loop * period;
            if (bt < from || vt > totalSeconds) continue;
            anchors[`${name}.${++n}`] = Number(vt.toFixed(3));
          }
          if (!(beats.duration > 0)) break;
        }
      }
      beatInfo = { bpm: beats.bpm, beats: Object.keys(anchors).filter((k) => k.startsWith("beat.")).length };
    }
  }

  // ---------------------------------------------------------- Overlays
  const overlays = [...transitionFx];
  const shakes = [];
  const sfxInfo = (name) => {
    const info = ctx.sfx?.[name];
    if (!info) throw new Error(`Sound "${name}" gibt es nicht (vorhanden: ${Object.keys(ctx.sfx ?? {}).join(", ") || "keine – erst: pnpm sfx"})`);
    return info;
  };
  const addSfx = (o, label, resolveAt, bounds) => {
    const info = sfxInfo(o.name);
    let start = resolveAt(o.at);
    if (start < bounds.start - 0.001 || start > bounds.end + 0.001) {
      errors.push(`${label}: liegt außerhalb von ${bounds.name} (${start.toFixed(2)}s)`);
      return;
    }
    if (o.align === "peak") start -= info.peak ?? 0;
    let from = 0;
    if (start < 0) {
      from = -start;
      start = 0;
    }
    const len = typeof o.duration === "number" ? o.duration : info.duration - from;
    const end = Math.min(start + len, totalSeconds);
    if (end - start < 0.02) return;
    usedSfx.add(info.file);
    overlays.push({
      type: "sfx",
      name: o.name,
      src: `.build/sfx/${info.file}`,
      from,
      volume: (o.volume ?? info.volume ?? 0.6) * (timeline.sfxVolume ?? 1),
      start,
      end,
      startFrame: toFrame(start),
      durationInFrames: Math.max(1, toFrame(end) - toFrame(start)),
    });
  };

  const addOverlay = (o, label, resolveAt, bounds, scene) => {
    try {
      if (!OVERLAY_TYPES.includes(o.type)) {
        errors.push(`${label}: unbekannter Overlay-Typ "${o.type}"`);
        return;
      }
      if (o.type === "sfx") return addSfx(o, label, resolveAt, bounds);
      if (o.type === "punch" && !scene) throw new Error('"punch" geht nur innerhalb einer Clip-Szene');
      const { start, end } = overlayWindow(
        o.type === "shake" || o.type === "punch" || o.type === "flash" ? { duration: o.type === "flash" ? 0.3 : 0.35, ...o } : o,
        resolveAt,
        label,
      );
      if (start < bounds.start - 0.001 || end > bounds.end + 0.001) {
        errors.push(`${label}: liegt außerhalb von ${bounds.name} (${start.toFixed(2)}–${end.toFixed(2)}s)`);
        return;
      }
      const shownText = [o.kicker, o.text, o.quote, o.label, o.title, o.body].filter(Boolean).join(" ");
      if (shownText) {
        const words = shownText.split(/\s+/).filter(Boolean).length;
        const min = Math.max(1.2, words * 0.3);
        if (end - start < min - 0.001) warnings.push(`${label}: nur ${(end - start).toFixed(1)}s sichtbar, empfohlen ≥ ${min.toFixed(1)}s`);
      }
      const startFrame = toFrame(start);
      const durationInFrames = Math.max(1, toFrame(end) - toFrame(start));
      if (o.type === "shake") {
        shakes.push({ startFrame, durationInFrames, strength: o.strength ?? 1 });
        return;
      }
      if (o.type === "punch") {
        if (scene.type !== "clip") throw new Error('"punch" geht nur in Clip-Szenen');
        let origin = Array.isArray(o.origin) ? o.origin : scene.origin && Array.isArray(scene.origin) ? scene.origin : [0.5, 0.35];
        if (o.origin === "face") {
          const st = scene.in + (start - scene.start) * (scene.speed ?? 1);
          origin = scene.faceAt?.(st, 0.3) ?? origin;
        }
        scene.punches = scene.punches ?? [];
        scene.punches.push({ startFrame: startFrame - scene.startFrame, durationInFrames, scale: o.scale ?? 1.15, origin, ease: o.ease ?? "snap" });
        return;
      }
      const extra = {};
      if (o.type === "media") {
        if (!o.src) throw new Error('"src" fehlt');
        extra.kind = /\.(png|jpe?g|webp|gif|avif)$/i.test(o.src) ? "image" : "video";
        const size = ctx.loadSize?.(o.src);
        if (!size) {
          warnings.push(`${label}: Größe von "${o.src}" unbekannt – nehme 16:9 an`);
          extra.srcAspect = 16 / 9;
        } else extra.srcAspect = size.width / size.height;
        if (extra.kind === "video") {
          const meta = ctx.loadMeta?.(o.src);
          if (meta && (o.from ?? 0) + (end - start) * (o.rate ?? 1) > meta.duration + 0.05) {
            errors.push(`${label}: Ausschnitt ab ${o.from ?? 0}s ist länger als "${o.src}" (${meta.duration.toFixed(2)}s)`);
          }
        }
        if (o.crop && (o.crop.length !== 4 || o.crop.some((v) => v < 0 || v > 1))) errors.push(`${label}: "crop" braucht [x, y, w, h] zwischen 0 und 1`);
      }
      if (o.type === "audio") {
        const meta = ctx.loadMeta?.(o.src);
        if (meta && (o.from ?? 0) + (end - start) > meta.duration + 0.05) errors.push(`${label}: Ton ab ${o.from ?? 0}s ist länger als "${o.src}"`);
      }
      if (o.type === "draw") {
        if (!DRAW_SHAPES.includes(o.shape)) throw new Error(`"shape" muss eins von ${DRAW_SHAPES.join(", ")} sein`);
        if (o.shape === "arrow") {
          if (!Array.isArray(o.from) || !Array.isArray(o.to)) throw new Error('Pfeil braucht "from": [x, y] und "to": [x, y] (Anteile des Bildes)');
        } else if (![o.x, o.y, o.w].every((v) => typeof v === "number")) {
          throw new Error(`"${o.shape}" braucht "x", "y" (Mitte) und "w" (Breite), optional "h" – als Anteile des Bildes`);
        }
      }
      if (o.type === "lottie") {
        const data = ctx.loadLottie?.(o);
        if (!data) throw new Error(`Lottie-Datei nicht gefunden: ${o.src ?? `brand/lottie/${o.name}.json`}`);
        extra.animationData = data;
      }
      if (o.behind) {
        extra.layer = "behind";
        if (o.type === "sfx" || o.type === "audio") delete extra.layer;
      }
      overlays.push({ ...o, ...extra, start, end, startFrame, durationInFrames });
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
      addOverlay(o, `Overlay ${j + 1} in "${s.id}"`, rel, { start: s.start, end: s.end, name: `Szene "${s.id}"` }, s);
    }
  }
  for (const [j, o] of (timeline.overlays ?? []).entries()) {
    addOverlay(o, `Globales Overlay ${j + 1} (${o.type})`, (v) => parseTime(v, anchors), {
      start: 0,
      end: totalSeconds,
      name: "dem Video",
    });
  }
  for (const o of transitionSfx) {
    try {
      addSfx(o, o.label, (v) => v, { start: 0, end: totalSeconds, name: "dem Video" });
    } catch (e) {
      errors.push(`${o.label}: ${e.message}`);
    }
  }

  // ---------------------------------------------------------- Freisteller (Text hinter der Person)
  for (const s of scenes) {
    if (s.type !== "clip" || !s.cutout) continue;
    const c = ctx.cutoutFor?.(s);
    if (!c?.exists) {
      errors.push(`Szene "${s.id}": Freisteller fehlt (${c?.src ?? "?"}) – erst: pnpm cutout <name>`);
      continue;
    }
    s.cutoutSrc = c.src;
  }
  for (const o of overlays) {
    if (o.layer !== "behind") continue;
    const hit = scenes.filter((s) => s.start < o.end && s.end > o.start);
    if (hit.some((s) => !s.cutoutSrc)) warnings.push(`Overlay ${o.type} (${o.start.toFixed(2)}s): "behind" ohne Freisteller in jeder Szene – dort liegt es normal über dem Bild`);
    if (transitionWindows.some((w) => w.start < o.end && w.end > o.start)) warnings.push(`Overlay ${o.type} (${o.start.toFixed(2)}s): "behind" überschneidet einen Übergang`);
  }

  // ---------------------------------------------------------- Untertitel
  const captions = [];
  if (timeline.captions) {
    const maxWords = brand.captions?.maxWordsPerChunk ?? 4;
    for (const s of scenes) {
      if (s.type !== "clip" || s.volume === 0 || s.captions === false || (s.speed ?? 1) !== 1) continue;
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

  for (const s of scenes) {
    delete s.faceAt;
    delete s.overlays;
    if (s.transition === undefined) delete s.transition;
  }

  return {
    errors,
    warnings,
    anchors,
    usedSfx: [...usedSfx],
    beatInfo,
    props: {
      format,
      ...frameDims,
      fps,
      durationInFrames: Math.max(1, toFrame(totalSeconds)),
      scenes,
      overlays,
      captions,
      shakes,
      music,
      brand,
    },
  };
}

export function loadProject(projectDir, { brandDir } = {}) {
  const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  const timeline = read(path.join(projectDir, "timeline.json"));
  const logFor = (src, file) => path.join(projectDir, "log", clipSlug(src), file);
  const loadJson = (p) => (fs.existsSync(p) ? read(p) : null);
  const loadMeta = (src) => loadJson(logFor(src, "meta.json"));
  const sfxManifest = brandDir ? loadJson(path.join(brandDir, "sfx", "sfx.json")) : null;
  return {
    timeline,
    sfx: sfxManifest ?? {},
    loadWords: (src) => loadJson(logFor(src, "words.json")),
    loadMeta,
    loadTrack: (src) => loadJson(logFor(src, "track.json")),
    loadBeats: (src) => loadJson(logFor(src, "beats.json")),
    loadLottie: (o) => {
      const p = o.src ? path.join(projectDir, o.src) : brandDir && o.name ? path.join(brandDir, "lottie", `${o.name}.json`) : null;
      return p ? loadJson(p) : null;
    },
    cutoutFor: (s) => {
      const src = path.join("log", clipSlug(s.src), cutoutName(s, timeline.fps ?? 30));
      return { src, exists: fs.existsSync(path.join(projectDir, src)) };
    },
    loadSize: (src) => {
      const meta = loadMeta(src);
      if (meta?.width && meta?.height) return { width: meta.width, height: meta.height };
      const file = path.join(projectDir, src);
      if (!fs.existsSync(file)) return null;
      const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
      const [width, height] = (r.stdout ?? "").trim().split(",").map(Number);
      return width && height ? { width, height } : null;
    },
  };
}

/** Dateiname des Freistellers für eine Clip-Szene (abhängig von Ausschnitt und fps). */
export function cutoutName(scene, fps) {
  return `cutout_${scene.in.toFixed(2)}-${scene.out.toFixed(2)}_${fps}fps.webm`;
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
    const enter = s.enter ? `  ⇢ ${s.enter.type} ${(s.enter.frames / props.fps).toFixed(2)}s` : s.transition === "fade" ? "  ⇢ fade" : "";
    const extras = [s.follow === "face" ? "folgt Gesicht" : "", s.cutoutSrc ? "Freisteller" : "", s.punches?.length ? `${s.punches.length}× punch` : ""].filter(Boolean).join(", ");
    lines.push(`  ${f(s.start)} → ${f(s.end)}  ${s.id.padEnd(14)} ${s.type.padEnd(5)} ${src}${enter}${extras ? `  [${extras}]` : ""}`);
  }
  const visible = props.overlays.filter((o) => o.type !== "sfx");
  if (visible.length) {
    lines.push("");
    lines.push("Overlays");
    for (const o of visible) {
      const what =
        o.text ?? o.quote ?? (o.type === "stat" ? `${o.value}${o.suffix ?? ""} ${o.label ?? ""}` : o.type === "draw" ? o.shape : o.src ? `${o.src}${o.from !== undefined ? ` ab ${o.from}` : ""}` : o.name ?? o.position ?? "");
      lines.push(`  ${f(o.start)} → ${f(o.end)}  ${o.type.padEnd(8)} ${what}${o.layer === "behind" ? "  (hinter Person)" : ""}`);
    }
  }
  const sfx = props.overlays.filter((o) => o.type === "sfx");
  if (sfx.length) {
    lines.push("");
    lines.push(`Sounds: ${sfx.map((o) => `${o.name}@${o.start.toFixed(2)}`).join("  ")}`);
  }
  if (props.shakes.length) lines.push(`Wackeln: ${props.shakes.map((s) => `${(s.startFrame / props.fps).toFixed(2)}s×${s.strength}`).join("  ")}`);
  lines.push("");
  lines.push(`Untertitel-Blöcke: ${props.captions.length}${props.music ? ` · Musik: ${props.music.src}${props.music.from ? ` ab ${props.music.from}s` : ""}` : ""}`);
  if (resolved.beatInfo) {
    const first = Object.entries(anchors).filter(([k]) => k.startsWith("bar.")).slice(0, 8);
    lines.push(`Beats: ${resolved.beatInfo.bpm ? `${Math.round(resolved.beatInfo.bpm)} BPM, ` : ""}${resolved.beatInfo.beats} Beats im Video · Takte: ${first.map(([k, v]) => `${k}=${v.toFixed(2)}`).join("  ")}${first.length ? " …" : ""}`);
  }
  lines.push(`Anker: ${Object.entries(anchors).filter(([k]) => /\.(start|end)$/.test(k)).map(([k, v]) => `${k}=${v.toFixed(2)}`).join("  ")}`);
  return lines.join("\n");
}
