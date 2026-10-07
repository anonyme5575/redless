// Global leaderboard on Supabase, over plain HTTP (no library, works offline-first).
// Players sign in anonymously; scores go through the submit_score() function on the server,
// which checks them. Failed sends wait in a local queue and are retried later.
(() => {
  "use strict";
  const AUTH = "redless-auth", QUEUE = "redless-pending", DEVICE = "redless-device", INSTALL = "redless-install", SERVER = "redless-server", EMAIL = "redless-email";
  const GLOBAL_MODES = ["classic", "chrono", "sudden", "feint", "expansion", "rhythm", "mirror"];

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Server: always the one built into the game (js/online-config.js). A server saved on this
  // device by an older version is dropped, with the account and queue that belonged to it.
  const cfg = window.REDLESS_ONLINE || {};
  const URL_ = (cfg.url || "").replace(/\/+$/, "");
  const saved = read(SERVER, null);
  if (saved) {
    const other = (saved.url || "").replace(/\/+$/, "") !== URL_;
    try { [SERVER, ...(other ? [AUTH, QUEUE, INSTALL, EMAIL] : [])].forEach((k) => localStorage.removeItem(k)); } catch {}
  }
  const KEY = cfg.key || "";
  const enabled = !!(URL_ && KEY);
  let session = read(AUTH, null);

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
  // True if nobody else has this pseudo. Unknown (old server without the function) counts as free.
  async function nameFree(name) {
    try { return (await rpc("name_available", { p_name: name }, false)) !== false; }
    catch (e) { if (e.offline || e.code !== "PGRST202") throw e; return true; }
  }

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
      c === "email_exists" || c === "user_already_exists" || /already.*(registered|exists)/i.test(m) ? "Cette adresse a déjà un compte : choisis « J'ai déjà un compte » (ou « Retrouver » dans Réglages)." :
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

  // Automatic connection at startup: creates (or refreshes) this device's anonymous account,
  // then sends the scores waiting offline. Silent: the game works the same without network.
  async function connect(name) {
    if (!enabled) return false;
    try { await token(); } catch { return false; }
    flush(name);
    return true;
  }
  const connected = () => !!(session && session.access_token);

  window.addEventListener("online", () => connect());
  NT.online = {
    enabled, GLOBAL_MODES, submit, flush, leaderboard, overall, profile, eventInfo, rename, registerInstall, pending: () => read(QUEUE, []).length,
    connect, connected, nameFree, email, linkEmail, confirmLink, sendLogin, confirmLogin, logout, pushSave, pullSave,
  };
})();
