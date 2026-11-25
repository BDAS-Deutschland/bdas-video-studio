import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT, argValue, build } from "./lib/project.mjs";

const args = process.argv.slice(2);
const { dir, propsPath } = build(args[0], { formatOverride: argValue(args, "--format"), quiet: true });
spawnSync(path.join(ROOT, "node_modules/.bin/remotion"), ["studio", "src/index.ts", `--props=${propsPath}`, `--public-dir=${dir}`], {
  cwd: ROOT,
  stdio: "inherit",
});
