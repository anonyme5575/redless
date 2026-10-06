// Global leaderboard on Supabase, over plain HTTP (no library, works offline-first).
// Players sign in anonymously; scores go through the submit_score() function on the server,
// which checks them. Failed sends wait in a local queue and are retried later.
(() => {
  "use strict";
  const AUTH = "redless-auth", QUEUE = "redless-pending", DEVICE = "redless-device", INSTALL = "redless-install", SERVER = "redless-server", EMAIL = "redless-email";
  const GLOBAL_MODES = ["classic", "chrono", "sudden", "feint", "expansion", "rhythm", "mirror"];

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Server: the one saved in Réglages (this device only) wins over js/online-config.js.
  const builtIn = window.REDLESS_ONLINE || {};
  const saved = read(SERVER, null);
  const cfg = saved && saved.url && saved.key ? saved : builtIn;
  const URL_ = (cfg.url || "").replace(/\/+$/, "");
  const KEY = cfg.key || "";
  const enabled = !!(URL_ && KEY);
  let session = read(AUTH, null);

  // Finds the project URL and the public key in anything pasted: the two values, the
  // dashboard address, a .env file, online-config.js… Secret keys are flagged, never kept.
  function parseServer(text) {
    const t = String(text || "");
    let url = (t.match(/https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)/i) || [])[0] || "";
    const ref = (t.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{20})/i) || [])[1];
    if (!url && ref) url = `https://${ref.toLowerCase()}.supabase.co`;
    if (!url && /^\s*[a-z0-9]{20}\s*$/i.test(t)) url = `https://${t.trim().toLowerCase()}.supabase.co`;
    if (!url) url = (t.match(/https:\/\/[^\s"'`,;]+/) || [""])[0].replace(/\/+$/, "");
    const secret = /sb_secret_/.test(t) || jwts(t).some((r) => r === "service_role");
    const key = (t.match(/sb_publishable_[A-Za-z0-9_-]+/) || [])[0] ||
                jwtList(t).find((j) => jwtRole(j) === "anon") || "";
    return { url: url.toLowerCase(), key, secret };
  }
  const jwtList = (t) => t.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
  function jwtRole(j) {
    try { return JSON.parse(atob(j.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || ""; } catch { return ""; }
  }
  const jwts = (t) => jwtList(t).map(jwtRole);

  async function http(path, body, token, method = "POST", base = URL_, key = KEY) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 9000);
    try {
      const headers = { apikey: key, "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const err = new Error((data && (data.message || data.msg || data.error_description || data.error)) || "HTTP " + res.status);
        err.status = res.status; err.code = data && data.code; err.errorCode = data && data.error_code;
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === "AbortError" || e instanceof TypeError) { const err = new Error("hors ligne"); err.offline = true; throw err; }
      throw e;
    } finally { clearTimeout(t); }
  }

  function keep(s) {
    session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) };
    write(AUTH, session);
  }
  // Anonymous account, created once per device and refreshed when it expires.
  async function token() {
    const now = Math.floor(Date.now() / 1000);
    if (session && session.access_token && session.expires_at - 60 > now) return session.access_token;
    if (session && session.refresh_token) {
      try { keep(await http("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })); return session.access_token; }
      catch (e) { if (e.offline) throw e; write(EMAIL, null); } // session lost: the e-mail account must be recovered
    }
    keep(await http("/auth/v1/signup", { data: {} }));
    return session.access_token;
  }
  async function rpc(name, params, needAuth) {
    // Reads work without an account; with one, the server can flag the player's own row.
    const tk = needAuth ? await token() : session ? await token().catch(() => null) : null;
    try { return await http("/rest/v1/rpc/" + name, params, tk); }
    catch (e) {
      if (e.status === 401 && needAuth) { session = null; write(AUTH, null); write(EMAIL, null); return http("/rest/v1/rpc/" + name, params, await token()); }
      throw e;
    }
  }

  // Score sending. Returns {season, best, rank, players} or {queued:true}.
  async function submit(run, name) {
    if (!enabled || !GLOBAL_MODES.includes(run.mode) || run.score <= 0) return null;
    const p = { p_mode: run.mode, p_score: run.score, p_level: run.level, p_bpm: run.bpm, p_duration_ms: Math.round(run.duration), p_name: name || null };
    try {
      const rows = await rpc("submit_score", p, true);
      return rows && rows[0];
    } catch (e) {
      if (e.offline) { const q = read(QUEUE, []); q.push({ ...p, t: Date.now() }); write(QUEUE, q.slice(-20)); return { queued: true }; }
      throw e;
    }
  }
  // Retries queued scores one by one (the server refuses more than one every 5 s).
  let flushing = false;
  async function flush(name) {
    if (!enabled || flushing) return;
    const q = read(QUEUE, []); if (!q.length) return;
    flushing = true;
    try {
      while (q.length) {
        const { t, ...p } = q[0];
        if (!p.p_name && name) p.p_name = name;
        try { await rpc("submit_score", p, true); }
        catch (e) { if (e.offline) break; if (/trop rapide/.test(e.message)) { await new Promise((r) => setTimeout(r, 5500)); continue; } }
        q.shift(); write(QUEUE, q);
      }
    } finally { flushing = false; }
  }
  const leaderboard = (mode, season = null, limit = 50) => rpc("get_leaderboard", { p_mode: mode, p_season: season, p_limit: limit }, false);
  // One row per player (total of their best scores in every mode), and one player's scores mode by mode.
  const overall = (season = null, limit = 100) => rpc("get_overall", { p_season: season, p_limit: limit }, false);
  const profile = (name, season = null) => rpc("get_profile", { p_name: name, p_season: season }, false);
  const eventInfo = async () => { const r = await rpc("event_info", {}, false); return r && r[0]; };
  const rename = (name) => rpc("set_name", { p_name: name }, true);

  // One anonymous signal per device at first launch of the installed app (no account needed).
  // Kept until the server answers, so an offline first launch is reported later.
  function uuid() {
    try { return crypto.randomUUID(); } catch {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });
    }
  }
  async function registerInstall(platform, version) {
    if (!enabled || read(INSTALL, null) === "sent") return;
    let dev = read(DEVICE, null);
    if (!dev) { dev = uuid(); write(DEVICE, dev); }
    try {
      await http("/rest/v1/rpc/register_install", { p_device: dev, p_platform: platform, p_version: version }, null);
      write(INSTALL, "sent");
    } catch {}
  }

  // ---------- account protected by e-mail (no password: a code is sent by e-mail) ----------
  // The anonymous account gets an e-mail address; on a new phone, the same address and a
  // fresh code bring the account back. Progress is saved online only for these accounts.
  const email = () => read(EMAIL, "");
  function frenchAuth(e) {
    if (e.offline) return e;
    const c = e.errorCode || "", m = e.message || "";
    const msg =
      c === "otp_expired" || /expired|invalid.*token|token.*invalid/i.test(m) ? "Code faux ou expiré. Demande un nouveau code." :
      c === "email_exists" || c === "user_already_exists" || /already.*(registered|exists)/i.test(m) ? "Cette adresse est déjà liée à un compte : utilise « Retrouver mon compte »." :
      c === "otp_disabled" || /signups not allowed/i.test(m) ? "Aucun compte avec cette adresse." :
      c === "anonymous_provider_disabled" || /anonymous sign-ins are disabled/i.test(m) ? "Connexion anonyme désactivée sur le serveur." :
      /rate limit|over_email_send_rate_limit|you can only request/i.test(c + " " + m) ? "Trop de codes demandés. Attends quelques minutes." :
      c === "email_address_invalid" || c === "validation_failed" || /invalid.*email|email.*invalid/i.test(m) ? "Adresse e-mail invalide." :
      /error sending|smtp/i.test(m) ? "Le serveur n'a pas pu envoyer l'e-mail (réglage SMTP de Supabase)." : m;
    const err = new Error(msg); err.status = e.status; return err;
  }
  const authCall = (p) => p.catch((e) => { throw frenchAuth(e); });
  const cleanEmail = (s) => String(s || "").trim().toLowerCase();

  // Step 1 (protect): sends a code to the address, to attach it to this phone's account.
  async function linkEmail(addr) {
    const tk = await authCall(token());
    await authCall(http("/auth/v1/user", { email: cleanEmail(addr) }, tk, "PUT"));
  }
  // Step 2 (protect): checks the code; the account is now tied to the address.
  async function confirmLink(addr, code) {
    const tk = await authCall(token());
    const r = await authCall(http("/auth/v1/verify", { type: "email_change", email: cleanEmail(addr), token: String(code).trim() }, tk));
    if (r && r.access_token) keep(r);
    else if (session && session.refresh_token) keep(await http("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token }));
    write(EMAIL, cleanEmail(addr));
  }
  // Step 1 (recover, on any phone): sends a code if an account uses this address.
  const sendLogin = (addr) => authCall(http("/auth/v1/otp", { email: cleanEmail(addr), create_user: false }));
  // Step 2 (recover): checks the code and switches this phone to that account.
  async function confirmLogin(addr, code) {
    const r = await authCall(http("/auth/v1/verify", { type: "email", email: cleanEmail(addr), token: String(code).trim() }));
    keep(r);
    write(EMAIL, cleanEmail(addr));
    write(INSTALL, "sent");
  }
  // Back to a fresh anonymous account on this phone (the protected account stays on the server).
  function logout() { session = null; [AUTH, EMAIL, QUEUE].forEach((k) => write(k, null)); }

  const pushSave = (data) => rpc("save_progress", { p_data: data }, true);
  async function pullSave() { const r = await rpc("load_progress", {}, true); return r && r[0]; }

  // Step-by-step connection test, without creating anything on the server.
  // Returns {ok, steps:[{ok, text, fix}]}; stops at the first blocking problem.
  async function check(url = URL_, key = KEY) {
    const steps = [];
    const stop = (text, fix) => { steps.push({ ok: false, text, fix }); return { ok: false, steps }; };
    url = (url || "").replace(/\/+$/, "");
    if (!url) return stop("Adresse du projet manquante", "Supabase → Project Settings → API → Project URL.");
    if (!/^https:\/\/[^/\s]+$/.test(url)) return stop("Adresse inattendue : " + url, "Elle doit ressembler à https://xxxx.supabase.co");
    if (!key) return stop("Clé publique manquante", "Supabase → Project Settings → API Keys → clé « publishable » (ou « anon »).");
    if (/^sb_secret_/.test(key) || jwtRole(key) === "service_role")
      return stop("C'est la clé SECRÈTE : ne la mets jamais dans le jeu", "Prends la clé « publishable » (sb_publishable_…) ou « anon ».");
    steps.push({ ok: true, text: "Adresse et clé bien formées" });

    let settings;
    try { settings = await http("/auth/v1/settings", undefined, null, "GET", url, key); }
    catch (e) {
      if (e.offline) return stop("Serveur injoignable", "Vérifie ta connexion et l'adresse. Si le projet est en pause (inactif 7 jours), ouvre-le sur supabase.com et touche « Restore ».");
      if (e.status === 401 || /api key/i.test(e.message)) return stop("Clé refusée par le serveur", "Recopie la clé publishable de CE projet (elle a peut-être été régénérée).");
      return stop("Réponse inattendue du serveur (" + (e.status || e.message) + ")", "Vérifie l'adresse du projet.");
    }
    steps.push({ ok: true, text: "Serveur joint, clé acceptée" });
    const anon = settings && settings.external && settings.external.anonymous_users;
    if (anon === false) return stop("Connexion anonyme désactivée", "Authentication → Sign In / Providers → active « Allow anonymous sign-ins » → Save.");
    steps.push({ ok: true, text: "Connexion anonyme des joueurs autorisée" });

    try {
      const r = await http("/rest/v1/rpc/event_info", {}, null, "POST", url, key);
      const info = r && r[0];
      steps.push({ ok: true, text: "Tables du classement installées" + (info && info.players != null ? ` (${info.players} joueur${info.players > 1 ? "s" : ""})` : "") });
    } catch (e) {
      if (e.offline) return stop("Serveur injoignable", "Réessaie dans un instant.");
      if (e.code === "PGRST202" || e.status === 404) return stop("Tables du classement absentes", "SQL Editor → New query → colle tout supabase/schema.sql → Run.");
      return stop("Erreur des tables : " + e.message, "Relance supabase/schema.sql dans le SQL Editor.");
    }
    // The online save exists if the server knows the function (calling it without an account is refused).
    try { await http("/rest/v1/rpc/load_progress", {}, null, "POST", url, key); }
    catch (e) {
      if (e.code === "PGRST202") return stop("Sauvegarde en ligne des comptes absente", "SQL Editor → relance tout supabase/schema.sql → Run.");
    }
    steps.push({ ok: true, text: "Sauvegarde en ligne des comptes installée" });
    return { ok: true, steps };
  }

  // Saves a server for this device (null = back to the one built into the game), then
  // forgets the anonymous account and queue tied to the previous server.
  function setServer(s) {
    try {
      if (s) localStorage.setItem(SERVER, JSON.stringify({ url: s.url.replace(/\/+$/, ""), key: s.key }));
      else localStorage.removeItem(SERVER);
      [AUTH, QUEUE, INSTALL, EMAIL].forEach((k) => localStorage.removeItem(k));
    } catch {}
  }

  window.addEventListener("online", () => flush());
  NT.online = {
    enabled, GLOBAL_MODES, submit, flush, leaderboard, overall, profile, eventInfo, rename, registerInstall, pending: () => read(QUEUE, []).length,
    check, parseServer, setServer, email, linkEmail, confirmLink, sendLogin, confirmLogin, logout, pushSave, pullSave, url: URL_, key: KEY, custom: cfg === saved, builtIn: { url: builtIn.url || "", key: builtIn.key || "" },
  };
})();
