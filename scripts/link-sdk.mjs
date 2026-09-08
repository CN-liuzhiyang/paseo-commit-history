// Links @getpaseo/plugin from a sibling Paseo checkout for local typechecking.
//
// The 0.8 SDK this plugin targets is not on npm yet, and `npm install` with a
// `file:` dependency on a workspace member crashes npm's arborist. Until 0.8 is
// published (then: add `@getpaseo/plugin` to devDependencies and delete this),
// point PASEO_CHECKOUT at a Paseo checkout whose `packages/plugin` has been built
// with `npm run build:plugin`. Defaults to `../paseo`. No-op when it is missing.
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const checkout = path.resolve(root, process.env.PASEO_CHECKOUT ?? "../paseo");
const sdk = path.join(checkout, "packages", "plugin");
const target = path.join(root, "node_modules", "@getpaseo", "plugin");

if (!existsSync(path.join(sdk, "dist", "index.d.ts"))) {
  console.warn(
    `[link-sdk] ${sdk}/dist not found; skipping. Build it with \`npm run build:plugin\` in the Paseo checkout, then rerun \`npm install\`.`,
  );
  process.exit(0);
}

mkdirSync(path.dirname(target), { recursive: true });
rmSync(target, { recursive: true, force: true });
// "junction" is honoured on Windows without elevation and ignored elsewhere.
symlinkSync(sdk, target, "junction");
console.log(`[link-sdk] @getpaseo/plugin -> ${sdk}`);
