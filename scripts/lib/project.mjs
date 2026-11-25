import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatTable, loadProject, resolveTimeline } from "./timeline.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function projectDir(name) {
  if (!name) fail("Projektname fehlt, z. B.: pnpm render mein-video");
  const dir = path.join(ROOT, "projects", name);
  if (!fs.existsSync(dir)) fail(`Projekt "${name}" gibt es nicht (${dir})`);
  return dir;
}

export function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

export function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Löst die Zeitleiste auf, kopiert das Logo und schreibt .build/props.json. */
export function build(name, { formatOverride, quiet = false } = {}) {
  const dir = projectDir(name);
  const brand = JSON.parse(fs.readFileSync(path.join(ROOT, "brand/brand.json"), "utf8"));
  const { timeline, ...ctx } = loadProject(dir, { brandDir: path.join(ROOT, "brand") });
  const resolved = resolveTimeline(timeline, { ...ctx, brand, formatOverride });

  const buildDir = path.join(dir, ".build");
  fs.mkdirSync(buildDir, { recursive: true });
  // Soundeffekte aus brand/sfx in den Projektordner kopieren (Remotion liest nur aus dem Projektordner).
  if (resolved.usedSfx.length) {
    fs.mkdirSync(path.join(buildDir, "sfx"), { recursive: true });
    for (const f of resolved.usedSfx) fs.copyFileSync(path.join(ROOT, "brand/sfx", f), path.join(buildDir, "sfx", f));
  }
  const logoSrc = brand.logo ? path.join(ROOT, "brand", brand.logo) : null;
  if (logoSrc && fs.existsSync(logoSrc)) {
    const dest = `.build/brand-logo${path.extname(logoSrc)}`;
    fs.copyFileSync(logoSrc, path.join(dir, dest));
    resolved.props.brand = { ...brand, logo: dest };
  } else {
    resolved.props.brand = { ...brand, logo: null };
  }
  if (resolved.props.music && !fs.existsSync(path.join(dir, resolved.props.music.src))) {
    resolved.errors.push(`Musikdatei fehlt: ${resolved.props.music.src}`);
  }
  for (const s of resolved.props.scenes) {
    if (s.type === "clip" && !fs.existsSync(path.join(dir, s.src))) resolved.errors.push(`Szene "${s.id}": Datei fehlt: ${s.src}`);
  }

  for (const o of resolved.props.overlays) {
    if ((o.type === "media" || o.type === "audio") && !fs.existsSync(path.join(dir, o.src))) resolved.errors.push(`Overlay ${o.type}: Datei fehlt: ${o.src}`);
  }
  if (!quiet) console.log(formatTable(resolved));
  for (const w of resolved.warnings) console.warn(`⚠ ${w}`);
  if (resolved.errors.length) {
    for (const e of resolved.errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  const propsPath = path.join(buildDir, "props.json");
  fs.writeFileSync(propsPath, JSON.stringify(resolved.props, null, 2));
  return { dir, propsPath, props: resolved.props };
}
