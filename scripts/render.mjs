import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT, argValue, build, fail } from "./lib/project.mjs";

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
console.log(`✓ ${path.relative(ROOT, out)}${draft ? `\n  Selbstprüfung: pnpm qc ${name}` : ""}`);
