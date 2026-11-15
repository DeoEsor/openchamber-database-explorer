// Build both frames: service (node ESM with postgres bundled) and panel (browser IIFE with SDK bundled).
import { build } from "bun";

const out = (label, result) => {
  for (const item of result.outputs) console.log(`${label}: ${item.path} (${(item.size / 1024).toFixed(1)} kB)`);
};

const service = await build({
  entrypoints: ["src/service/main.js"],
  target: "node",
  format: "esm",
  outdir: "service",
  naming: "[dir]/main.js",
  sourcemap: "none",
});
out("service", service);

const panel = await build({
  entrypoints: ["src/panel/main.js"],
  target: "browser",
  format: "iife",
  outdir: "panel",
  naming: "[dir]/main.js",
  sourcemap: "none",
});
out("panel", panel);
