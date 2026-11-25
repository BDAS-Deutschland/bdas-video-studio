import { argValue, build } from "./lib/project.mjs";

const args = process.argv.slice(2);
build(args[0], { formatOverride: argValue(args, "--format") });
console.log("\n✓ Zeitleiste in Ordnung");
