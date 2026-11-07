import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
const requestedOutDir = process.argv[2];
const outDir = requestedOutDir ? path.resolve(root, requestedOutDir) : distRoot;
if (requestedOutDir && (!outDir.startsWith(distRoot + path.sep) || fs.existsSync(outDir))) {
  throw new Error("A clean output path inside dist/ is required");
}
const entries = [
  ".nojekyll",
  "README.md",
  "index.html",
  "teacher-portal.html",
  "manifest.webmanifest",
  "service-worker.js",
  "_headers",
  "google-sheet-backend.gs",
  "supabase-schema.sql",
  "assets"
];

fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) continue;

  const dest = path.join(outDir, entry);
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (source) => !source.split(path.sep).includes(".git")
  });
}

fs.writeFileSync(
  path.join(outDir, "_worker.js"),
  `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    const url = new URL(request.url);
    url.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  }
};
`
);
