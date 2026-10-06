// Global leaderboard on Supabase, over plain HTTP (no library, works offline-first).
// Players sign up with their e-mail and a password (address confirmed by an e-mailed code); scores go through the
// submit_score() function on the server, which checks them. Failed sends wait in a local queue.
(() => {
  "use strict";
  const cfg = window.REDLESS_ONLINE || {};
  const URL_ = (cfg.url || "").replace(/\/+$/, "");
  const KEY = cfg.key || "";
  const enabled = !!(URL_ && KEY);
  const AUTH = "redless-auth", QUEUE = "redless-pending", DEVICE = "redless-device", INSTALL = "redless-install";
  const GLOBAL_MODES = ["classic", "chrono", "sudden", "feint", "expansion", "rhythm", "mirror"];

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let session = read(AUTH, null);

  async function http(path, body, token, method = "POST") {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 9000);
    try {
      const headers = { apikey: KEY, "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      const res = await fetch(URL_ + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const err = new Error((data && (data.message || data.msg || data.error_description || data.error)) || "HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === "AbortError" || e instanceof TypeError) { const err = new Error("hors ligne"); err.offline = true; throw err; }
      throw e;
    } finally { clearTimeout(t); }
  }

  function keep(s) {
    const email = (s.user && s.user.email) || (session && session.email) || null;
    session = { access_token: s.access_token, refresh_token: s.refresh_token, email,
      expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) };
    // Sessions left over from the old anonymous accounts have no e-mail: they no longer count.
    if (!session.email) { session = null; write(AUTH, null); return; }
    write(AUTH, session);
  }
  if (session && !session.email) { session = null; write(AUTH, null); }
  function needLogin() { const e = new Error("connexion requise"); e.needLogin = true; return e; }
  // Valid access token for the signed-in player, refreshed when it expires.
  async function token() {
    const now = Math.floor(Date.now() / 1000);
    if (session && session.access_token && session.expires_at - 60 > now) return session.access_token;
    if (session && session.refresh_token) {
      try { keep(await http("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })); if (session) return session.access_token; }
      catch (e) { if (e.offline) throw e; logout(); }
    }
    throw needLogin();
  }

  // ---- account: e-mail + password ----
  // signUp creates the account; Supabase sends the welcome e-mail with a code that confirms the
  // address (verifyCode). signIn opens the session. resetPassword e-mails a code; newPassword
  // checks it and sets the new password.
  const cleanEmail = (e) => String(e || "").trim().toLowerCase();
  function checkEmail(email) {
    if (!enabled) throw new Error("classement non configuré");
    const em = cleanEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) throw new Error("adresse e-mail invalide");
    return em;
  }
  function checkPassword(pw) {
    if (String(pw || "").length < 8) throw new Error("mot de passe trop court (8 caractères minimum)");
    return String(pw);
  }
  function opened(s, email) { session = { email }; keep(s); if (!session) throw new Error("connexion refusée"); return session.email; }
  // Returns {email, confirm:true} when the address still has to be confirmed by code.
  async function signUp(email, password) {
    const em = checkEmail(email), pw = checkPassword(password);
    const r = await http("/auth/v1/signup", { email: em, password: pw });
    if (r && r.access_token) return { email: opened(r, em) };
    // Address already registered: Supabase answers with a user that has no identity, and sends nothing.
    const u = (r && r.user) || r;
    if (u && Array.isArray(u.identities) && u.identities.length === 0) { const e = new Error("adresse déjà inscrite"); e.exists = true; throw e; }
    return { email: em, confirm: true };
  }
  async function signIn(email, password) {
    const em = checkEmail(email);
    try { return { email: opened(await http("/auth/v1/token?grant_type=password", { email: em, password: String(password || "") }), em) }; }
    catch (e) {
      // Account created but address not confirmed yet: send a fresh code.
      if (/not confirmed/i.test(e.message)) { await http("/auth/v1/resend", { type: "signup", email: em }).catch(() => {}); return { email: em, confirm: true }; }
      if (/invalid login|invalid_credentials/i.test(e.message)) throw new Error("e-mail ou mot de passe incorrect");
      throw e;
    }
  }
  async function verifyCode(email, code) {
    const c = String(code || "").replace(/\D/g, "");
    if (c.length < 6) throw new Error("le code fait 6 chiffres");
    const em = cleanEmail(email);
    return opened(await http("/auth/v1/verify", { type: "email", email: em, token: c }), em);
  }
  async function resendCode(email) { await http("/auth/v1/resend", { type: "signup", email: checkEmail(email) }); }
  async function resetPassword(email) { const em = checkEmail(email); await http("/auth/v1/recover", { email: em }); return em; }
  async function newPassword(email, code, password) {
    const pw = checkPassword(password), c = String(code || "").replace(/\D/g, "");
    if (c.length < 6) throw new Error("le code fait 6 chiffres");
    const em = cleanEmail(email);
    const s = await http("/auth/v1/verify", { type: "recovery", email: em, token: c });
    await http("/auth/v1/user", { password: pw }, s.access_token, "PUT");
    return opened(s, em);
  }
  function logout() {
    const tk = session && session.access_token;
    session = null; write(AUTH, null);
    if (tk) http("/auth/v1/logout", {}, tk).catch(() => {});
  }
  // Deletes the account on the server (pseudo, scores and runs go with it), then signs out.
  async function deleteAccount() {
    await rpc("delete_my_account", {}, true);
    write(QUEUE, []);
    session = null; write(AUTH, null);
  }
  const account = () => (session && session.email ? { email: session.email } : null);
  async function rpc(name, params, needAuth) {
    // Reads work without an account; with one, the server can flag the player's own row.
    const tk = needAuth ? await token() : session ? await token().catch(() => null) : null;
    try { return await http("/rest/v1/rpc/" + name, params, tk); }
    catch (e) {
      if (needAuth && (e.status === 401 || /e-mail requise|non connecté/.test(e.message))) { logout(); throw needLogin(); }
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
    if (!enabled || flushing || !session) return;
    const q = read(QUEUE, []); if (!q.length) return;
    flushing = true;
    try {
      while (q.length) {
        const { t, ...p } = q[0];
        if (!p.p_name && name) p.p_name = name;
        try { await rpc("submit_score", p, true); }
        catch (e) { if (e.offline || e.needLogin) break; if (/trop rapide/.test(e.message)) { await new Promise((r) => setTimeout(r, 5500)); continue; } }
        q.shift(); write(QUEUE, q);
      }
    } finally { flushing = false; }
  }
  const leaderboard = (mode, season = null, limit = 50) => rpc("get_leaderboard", { p_mode: mode, p_season: season, p_limit: limit }, false);
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

  window.addEventListener("online", () => flush());
  NT.online = { enabled, GLOBAL_MODES, submit, flush, leaderboard, eventInfo, rename, registerInstall,
    signUp, signIn, verifyCode, resendCode, resetPassword, newPassword, logout, deleteAccount, account, pending: () => read(QUEUE, []).length };
})();
