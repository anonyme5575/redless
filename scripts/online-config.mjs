// Writes js/online-config.js from environment variables (Vercel build step, CI).
// Reads only the project URL and the PUBLIC key (anon / publishable). Refuses a secret key.
// Names covered: the ones set by the Vercel ↔ Supabase integration, and plain ones.
import { writeFileSync } from "node:fs";

const e = process.env;
const url = (e.NEXT_PUBLIC_SUPABASE_URL || e.SUPABASE_URL || "").trim();
const key = (e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || e.SUPABASE_PUBLISHABLE_KEY ||
             e.NEXT_PUBLIC_SUPABASE_ANON_KEY || e.SUPABASE_ANON_KEY || "").trim();

if (!url || !key) {
  console.log("Supabase : variables absentes, configuration laissée telle quelle.");
  process.exit(0);
}
if (!/^https:\/\/[^/]+$/.test(url.replace(/\/+$/, ""))) {
  console.error("Supabase : URL inattendue (" + url + ").");
  process.exit(1);
}
// A legacy key is a JWT: its "role" must be anon. New-style secret keys start with sb_secret_.
let role = "";
if (key.split(".").length === 3) {
  try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role || ""; } catch {}
}
if (key.startsWith("sb_secret_") || role === "service_role") {
  console.error("Supabase : la clé fournie est SECRÈTE. Utilise la clé anon / publishable. Rien n'a été écrit.");
  process.exit(1);
}

// Target: argument 1 (e.g. public/js/online-config.js), default js/online-config.js.
const target = process.argv[2] ? new URL(process.argv[2], "file://" + process.cwd() + "/") : new URL("../js/online-config.js", import.meta.url);
writeFileSync(target, `// Généré au déploiement par scripts/online-config.mjs (variables d'environnement Supabase).
window.REDLESS_ONLINE = {
  url: ${JSON.stringify(url.replace(/\/+$/, ""))},
  key: ${JSON.stringify(key)},
};
`);
console.log("Supabase : configuration écrite (" + target.pathname + ") pour " + url);
