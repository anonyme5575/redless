// Shared by the browser tests: Playwright's Chromium and a static server for the game files.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
let pw;
try { pw = await import("playwright"); }
catch { pw = createRequire(import.meta.url)(join(execSync("npm root -g").toString().trim(), "playwright")); }
export const chromium = pw.chromium;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp3": "audio/mpeg" };
export function startServer() {
  const server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith("/")) path += "index.html";
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, () => { server.url = `http://localhost:${server.address().port}/`; ok(server); }));
}
