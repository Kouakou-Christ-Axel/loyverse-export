// Build script — bundles the TypeScript sources with esbuild and copies static
// assets (manifest, popup HTML, icons) into the dist/ folder ready for Chrome.
import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const outdir = path.join(root, "dist");
const watch = process.argv.includes("--watch");

/** Static files copied verbatim into dist/. */
const staticAssets = [
  { from: "manifest.json", to: "manifest.json" },
  { from: "public/popup.html", to: "popup.html" },
  { from: "public/icons", to: "icons" },
];

async function copyStatic() {
  for (const asset of staticAssets) {
    const src = path.join(root, asset.from);
    if (!existsSync(src)) continue;
    const dest = path.join(outdir, asset.to);
    await cp(src, dest, { recursive: true });
  }
}

const buildOptions = {
  entryPoints: {
    content: path.join(root, "src/content.ts"),
    popup: path.join(root, "src/popup.ts"),
  },
  outdir,
  bundle: true,
  format: "iife",
  target: ["chrome120"],
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  await copyStatic();
  console.log("Watching for changes… (Ctrl+C to stop)");
} else {
  await esbuild.build(buildOptions);
  await copyStatic();
  console.log("Build terminé -> dist/");
}
