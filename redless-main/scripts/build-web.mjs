// Vercel build: copies the static game into public/ and writes the Supabase settings there.
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "public";
const FILES = ["index.html", "manifest.webmanifest", "sw.js", "PRIVACY.md", "COPYRIGHT.md", "css", "js", "fonts", "assets", "audio", "dist/redless.apk"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of FILES) if (existsSync(f)) cpSync(f, `${OUT}/${f}`, { recursive: true });
execFileSync(process.execPath, ["scripts/online-config.mjs", `${OUT}/js/online-config.js`], { stdio: "inherit" });
console.log("Site prêt dans public/");
