(() => {
  "use strict";
  const { MODES, MODE_IDS, CATALOG, RANKS, MISSIONS, TRACKS, DEFAULT_GRID, MAX_BPM, GLIDE, CREEP, BOSS_MS, FREEZE_MS } = NT.cfg;
  const { Music, MenuMusic, Synth, haptic } = NT;
  const fx = NT.fx;
  const VERSION = "2.5";

  // ---------- storage (may be unavailable) ----------
  const KEY = "ntplr-save-v1";
  const defaults = {
    coins: 0, bests: {}, games: 0, name: "", mode: "classic",
    owned: { skin: ["minuit"], fx: ["eclats"], shape: ["carre"] },
    equipped: { skin: "minuit", fx: "eclats", shape: "carre" },
    scores: [], sound: true,
    musicVol: 0.9, sfxVol: 0.8, vibration: true, colorblind: false, track: "sync",
    latency: 0, calibrated: false, tutorialDone: false, xp: 0,
    daily: { date: "", score: null, best: 0 }, missions: { date: "", list: [] }, duels: {},
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(defaults);
      const s = JSON.parse(raw);
      const out = { ...clone(defaults), ...s,
        owned: { ...defaults.owned, ...s.owned }, equipped: { ...defaults.equipped, ...s.equipped } };
      // Older saves: one global best, mode-less scores, no tutorial flag.
      if (typeof s.best === "number" && !out.bests.classic) out.bests.classic = s.best;
      out.scores.forEach((e) => (e.mode = e.mode || "classic"));
      if (!MODES[out.mode] || MODES[out.mode].hidden) out.mode = "classic";
      if (s.tutorialDone === undefined && out.games > 0) out.tutorialDone = true;
      if (s.xp === undefined) out.xp = out.scores.reduce((a, e) => a + e.score, 0);
      if (!TRACKS[out.track]) out.track = "sync";
      out.sound = true; // the mute button is gone: volumes are set in Réglages
      return out;
    } catch { return clone(defaults); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
  const S = load();
  NT.S = S;

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const cssVar = fx.cssVar;
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad = (n) => String(n).padStart(2, "0");
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtDate = (d = new Date()) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join("");
  const cleanCode = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[IO01]/g, "").slice(0, 5);

  const screens = {};
  document.querySelectorAll(".screen").forEach((s) => (screens[s.id] = s));
  const boardEl = $("#board"), scoreEl = $("#score"), comboEl = $("#combo");
  const bpmEl = $("#bpm"), levelEl = $("#level"), beatEl = $("#beat"), runCoinsEl = $("#run-coins");

  const ICONS = {
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  };
  $("#btn-pause").innerHTML = ICONS.pause;
  $("#btn-settings").innerHTML = ICONS.gear;
  const BACK_TO = { privacy: "settings", calib: "settings" };
  document.querySelectorAll(".back").forEach((b) => {
    b.innerHTML = ICONS.back;
    b.onclick = () => show(BACK_TO[b.closest(".screen").id] || "menu");
  });

  let current = "menu";
  function show(id) {
    if (current === "calib" && id !== "calib") stopCalib();
    current = id;
    for (const k in screens) screens[k].hidden = k !== id;
    updateMenuMusic();
    const sc = screens[id];
    ({ menu: renderMenu, shop: renderShop, ranking: renderBoard, missions: renderMissions,
       settings: renderSettings, duel: renderDuel, calib: renderCalib })[id]?.();
    fx.initFrames(sc); fx.redrawFrames(sc);
    if (!reduceMotion) {
      sc.classList.remove("enter"); void sc.offsetWidth; sc.classList.add("enter");
      sc.querySelectorAll(".frame-svg .line:not(.extra)").forEach((l) => { l.classList.remove("draw"); void l.getBBox; l.classList.add("draw"); });
      setTimeout(() => sc.classList.remove("enter"), 900);
    }
    sc.scrollTop = 0;
  }
  function bindAll() { document.querySelectorAll('[data-bind="coins"]').forEach((e) => (e.textContent = S.coins)); }
  function applyLook(skin = S.equipped.skin, shape = S.equipped.shape) {
    app.dataset.skin = skin;
    app.dataset.shape = shape;
    app.dataset.cb = S.colorblind ? "1" : "";
    const bg = cssVar("--bg"), meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.content = bg;
    fx.setRainColor(cssVar("--holo"));
  }
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2000);
  }
  function banner(text, sub, warn) {
    const b = $("#banner");
    b.innerHTML = ""; b.append(text);
    if (sub) { const s = document.createElement("small"); s.textContent = sub; b.appendChild(s); }
    b.classList.toggle("warn", !!warn);
    b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
  }
  function flash() { const f = $("#flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }
  function glitch() {
    if (reduceMotion) return;
    screens.play.classList.remove("glitching"); void screens.play.offsetWidth; screens.play.classList.add("glitching");
  }
  function sfx(name, ...a) { Synth.init(); Synth[name](...a); }
  // Menu music plays on every screen outside a game, the tutorial and the calibration.
  const QUIET = new Set(["play", "tuto", "calib"]);
  function updateMenuMusic() {
    if (QUIET.has(current) || document.hidden) MenuMusic.stop(); else MenuMusic.play();
  }
  // Browsers only start audio after a tap: retry on each tap until it plays.
  document.addEventListener("pointerdown", () => {
    if (!QUIET.has(current) && (!MenuMusic.el || MenuMusic.el.paused)) MenuMusic.play();
  }, true);

  // ---------- ranks & missions ----------
  function rankOf(xp) {
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
    const cur = RANKS[i], next = RANKS[i + 1];
    return { i, name: cur.name, next, pct: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
  }
  function ensureMissions() {
    const d = todayKey();
    if (S.missions.date === d && S.missions.list.length) return;
    const r = mulberry32(hashStr("missions-" + d)), pool = MISSIONS.slice(), list = [];
    while (list.length < 3) list.push({ id: pool.splice((r() * pool.length) | 0, 1)[0].id, progress: 0, done: false });
    S.missions = { date: d, list }; save();
  }
  const missionDef = (id) => MISSIONS.find((m) => m.id === id);
  function applyRunToMissions(run) {
    ensureMissions();
    const done = [];
    for (const m of S.missions.list) {
      const def = missionDef(m.id);
      if (!def || m.done || (def.mode && def.mode !== run.mode)) continue;
      const v = run[def.stat] || 0;
      m.progress = def.type === "sum" ? m.progress + v : Math.max(m.progress, v);
      if (m.progress >= def.goal) { m.done = true; S.coins += def.reward; done.push(def); }
    }
    return done;
  }

  // ---------- board & tiles ----------
  let cells = [];
  function buildGrid(el, cols, rows, animate) {
    el.querySelectorAll(".cell").forEach((c) => c.remove());
    el.style.setProperty("--cols", cols);
    el.style.setProperty("--rows", rows);
    el.classList.toggle("small", cols >= 6);
    const out = [];
    for (let i = 0; i < cols * rows; i++) {
      const c = document.createElement("div");
      c.className = "cell" + (animate ? " grow" : ""); c.dataset.i = i;
      if (animate) c.style.animationDelay = `${(Math.floor(i / cols) + (i % cols)) * 25}ms`;
      el.appendChild(c); out.push(c);
    }
    return out;
  }
  function setGrid(cols, rows, animate) {
    cells = buildGrid(boardEl, cols, rows, animate);
    $("#grid-size").textContent = `${cols}×${rows}`;
  }
  const KIND_COLOR = { green: "green", gold: "gold", red: "red", rgreen: "green", freeze: "blue", purge: "violet", hold: "hold" };
  function makeTile(cell, t) {
    const el = document.createElement("div");
    const timer = document.createElement("span"); timer.className = "timer"; el.appendChild(timer);
    if (t.kind === "rgreen") { const ring = document.createElement("span"); ring.className = "ring"; el.appendChild(ring); t.ring = ring; }
    cell.appendChild(el);
    t.el = el; t.timer = timer;
    el.className = "tile " + t.color;
    return t;
  }
  // Colour changes of feint tiles. Returns the tile's colour now.
  function updateFeint(t, age) {
    let c = t.color;
    if (t.kind === "turn" && age >= t.switchAt) c = "red";
    else if (t.kind === "trap" && age >= t.switchAt) c = "green";
    else if (t.kind === "blink") c = Math.floor(age / t.flip) % 2 === 0 ? t.startColor : (t.startColor === "green" ? "red" : "green");
    if (c !== t.color) { t.color = c; t.el.className = "tile flip " + c; }
    return c;
  }
  const isFeint = (t) => t.kind === "turn" || t.kind === "trap" || t.kind === "blink";
  const centerOf = (cell) => { const a = app.getBoundingClientRect(), r = cell.getBoundingClientRect(); return [r.left - a.left + r.width / 2, r.top - a.top + r.height / 2]; };
  function popup(cell, text, cls) {
    const [x, y] = centerOf(cell), p = document.createElement("span");
    p.className = "judge " + (cls || ""); p.textContent = text;
    p.style.left = x + "px"; p.style.top = y + "px";
    app.appendChild(p); setTimeout(() => p.remove(), 700);
  }

  // ---------- game state ----------
  let G = null;
  function newGame(modeId, opts = {}) {
    const M = MODES[modeId];
    let seed = null;
    if (modeId === "daily") seed = hashStr("daily-" + todayKey());
    if (modeId === "duel") seed = hashStr("duel-" + opts.code);
    G = {
      modeId, M, code: opts.code || null, rng: seed !== null ? mulberry32(seed) : Math.random,
      official: modeId === "daily" && !(S.daily.date === todayKey() && S.daily.score !== null),
      running: false, paused: false, over: false,
      score: 0, combo: 0, maxCombo: 0, lives: M.lives, coins: 0, greens: 0,
      level: 1, bpm: M.startBpm, bpmNow: M.startBpm, bpmShown: 0, rateBpm: 0,
      beatN: 0, beatKey: null, loop: 0, pos: 0, fbPos: 0, clock: 0, phase: 0,
      timeLeft: M.time ? M.time * 1000 : 0,
      tiles: new Map(), grid: M.grids ? 0 : -1,
      feintStreak: 0, maxFeintStreak: 0, gold: 0, perfects: 0, inversions: 0, bosses: 0, specials: 0,
      freezeUntil: 0, frozen: false, boss: null, target: "green", mirrorBeats: 0, holding: null, cause: null,
      trackOn: false, spawnLog: [],
    };
    boardEl.className = "board" + (M.rhythm ? " rhythm" : "");
    if (seed !== null) for (let k = 0; k < 16; k++) G.rng(); // warm up: the first draws of a fresh seed are less mixed
    const [c, r] = M.grids ? M.grids[0] : DEFAULT_GRID;
    setGrid(c, r, true);
    $("#energy-label").textContent = M.time ? "Temps" : "Énergie";
    $("#mode-tag").textContent = M.name;
    $("#row3-label").textContent = M.mirror ? "Cible" : "Grille";
    if (M.mirror) renderTarget();
    $("#beatbar").classList.remove("boss");
    renderHud();
  }
  const effBpm = () => (G.frozen ? G.bpmNow * 0.7 : G.bpmNow);
  const spb = () => 60 / effBpm(); // seconds per beat at the tempo playing now
  const THRESHOLDS = [0, 10, 25, 50];
  const multiplier = () => (G.combo >= 50 ? 4 : G.combo >= 25 ? 3 : G.combo >= 10 ? 2 : 1);

  function renderHud() {
    scoreEl.textContent = G.score;
    const mult = multiplier();
    if (!G.boss) comboEl.textContent = G.combo >= 3 ? `Combo ${G.combo}` : "";
    $("#mult").textContent = "x" + mult;
    const lo = THRESHOLDS[mult - 1], hi = THRESHOLDS[mult] || lo;
    $("#shield-fill").style.strokeDashoffset = 100 - (mult >= 4 ? 1 : (G.combo - lo) / (hi - lo)) * 100;
    bpmEl.textContent = Math.round(effBpm());
    levelEl.textContent = G.level;
    runCoinsEl.textContent = G.coins;
    $("#sweep").style.setProperty("--bar", (4 * spb()).toFixed(2) + "s");
    renderEnergy();
  }
  function renderEnergy() {
    const f = $("#energy-fill"), v = $("#energy-val");
    let pct;
    if (G.M.time) { const s = Math.max(0, G.timeLeft / 1000); pct = s / G.M.time; v.textContent = s < 10 ? s.toFixed(1) : Math.ceil(s); }
    else { pct = G.lives / G.M.lives; v.textContent = G.lives; }
    f.style.strokeDashoffset = 100 - pct * 100;
    f.classList.toggle("low", pct <= 0.34);
  }
  function renderTarget() {
    const b = $("#grid-size");
    b.textContent = G.target === "green" ? "Vert" : "Rouge";
    b.style.color = G.target === "green" ? "var(--green)" : "var(--red)";
    boardEl.classList.toggle("target-red", G.target === "red");
  }
  function bump() { scoreEl.classList.remove("bump"); void scoreEl.offsetWidth; scoreEl.classList.add("bump"); }

  // Difficulty curve. Lifetime is counted in beats, so it shrinks with the tempo and with the level.
  function lifetimeMs() {
    const beats = Math.max(1.6, 3.4 - (G.level - 1) * 0.18);
    return Math.max(380, beats * spb() * 1000);
  }
  const redChance = () => Math.min(0.4, 0.24 + (G.level - 1) * 0.02);
  function feintChance() {
    const f = G.M.feint;
    const base = G.level < f.from ? 0 : Math.min(f.max, f.base + (G.level - f.from) * f.step);
    return G.boss ? Math.min(0.85, base + 0.35) : base;
  }
  // Every random draw goes through G.rng, a fixed number of times per call, so a seed
  // (défi du jour, duel) replays the same sequence whatever the player does.
  function spawnsThisBeat() {
    const a = G.rng(), b = G.rng(), c = G.rng();
    if (G.M.rhythm) return G.level <= 2 ? (G.beatN % 2 === 0 ? 1 : 0) : 1 + (G.level >= 6 && a < 0.3 ? 1 : 0);
    const extra = Math.min(0.8, Math.max(0, (G.level - 2) * 0.12));
    let n = 1 + (a < extra ? 1 : 0) + (G.level >= 9 && b < 0.3 ? 1 : 0);
    if (cells.length >= 30 && c < 0.5) n++;
    if (G.boss) n++;
    if (cells.length <= 6) n = 1;
    return n;
  }
  function pickKind() {
    const a = G.rng(), b = G.rng(), c = G.rng(), d = G.rng();
    if (G.M.rhythm) return d < 0.2 ? "red" : "rgreen";
    if (G.M.mirror) return d < 0.5 ? "red" : "green";
    if (G.M.specials && G.level >= 3 && c < 0.085) return c < 0.025 ? "freeze" : c < 0.045 ? "purge" : "hold";
    if (a < feintChance()) return b < 0.4 ? "turn" : b < 0.75 ? "trap" : "blink";
    return d < redChance() ? "red" : d < redChance() + 0.05 ? "gold" : "green";
  }
  function spawn() {
    const kind = pickKind(), rc = G.rng(), rp = G.rng();
    let i = Math.floor(rc * cells.length), tries = 0;
    while (G.tiles.has(i) && tries < cells.length) { i = (i + 1) % cells.length; tries++; }
    if (tries >= cells.length || G.tiles.size >= cells.length - 1) return;
    const life = lifetimeMs();
    const t = { kind, born: G.clock, life, color: KIND_COLOR[kind] || "green", switchAt: 0 };
    if (kind === "red") t.life = life * 1.3;
    else if (kind === "turn") t.switchAt = life * (0.3 + rp * 0.25);
    else if (kind === "trap") { t.color = "red"; t.switchAt = life * (0.25 + rp * 0.2); t.life = life * 1.35; }
    else if (kind === "blink") { t.flip = spb() * 500; t.color = t.startColor = rp < 0.5 ? "green" : "red"; t.life = life * 1.5; }
    else if (kind === "hold") { t.holdMs = Math.max(450, spb() * 900); t.life = Math.max(life * 1.4, t.holdMs + 900); }
    else if (kind === "freeze" || kind === "purge") t.life = life * 1.2;
    if (G.M.rhythm) t.target = G.beatKey + 1; // judged against the next beat
    makeTile(cells[i], t);
    G.tiles.set(i, t);
    if (G.spawnLog.length < 40) G.spawnLog.push(kind);
  }
  function removeTile(i, cls) {
    const t = G.tiles.get(i); if (!t) return;
    G.tiles.delete(i);
    if (G.holding && G.holding.i === i) G.holding = null;
    if (cls) { t.el.classList.add(cls); setTimeout(() => t.el.remove(), 300); } else t.el.remove();
  }
  function clearTiles() { if (G) for (const i of [...G.tiles.keys()]) removeTile(i); }

  // Beat position heard by the player, in beats.
  function beatPos() {
    if (G.trackOn && Music.playing) { const p = Music.pos(S.latency); return p.pos + p.loop * 100000; }
    return G.fbPos;
  }

  // ---------- taps ----------
  function addPoints(n) { G.score += n; bump(); }
  function scoreHit(i, t, color, pts, special) {
    G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.greens++;
    const before = multiplier();
    addPoints(pts * multiplier());
    const [x, y] = centerOf(cells[i]);
    fx.burst(x, y, color === "gold" ? cssVar("--gold") : color === "red" ? cssVar("--red") : cssVar("--green"), S.equipped.fx, special);
    sfx("hit", G.combo, special);
    haptic(special ? "feint" : "hit");
    removeTile(i, "hit");
    if (G.greens % G.M.greensPerLevel === 0) levelUp();
    else if (multiplier() > before) banner(`Bouclier x${multiplier()}`, `Combo ${G.combo}`);
    renderHud();
  }
  function onTap(e) {
    if (!G || !G.running || G.paused) return;
    const cell = e.target.closest(".cell"); if (!cell || cell.parentNode !== boardEl) return;
    e.preventDefault();
    const i = +cell.dataset.i, t = G.tiles.get(i);
    if (!t) return; // empty cell: no penalty
    const age = G.clock - t.born, color = isFeint(t) ? updateFeint(t, age) : t.color;

    if (G.M.mirror) {
      if (color === G.target) return scoreHit(i, t, color, 1, false);
      G.cause = { type: "mirror", target: G.target };
      return fail(i, color);
    }
    if (t.kind === "hold") { G.holding = { i, start: G.clock }; t.el.classList.add("holding"); haptic("ui"); return; }
    if (color === "red") return touchRed(i, t);
    if (t.kind === "freeze") return useFreeze(i);
    if (t.kind === "purge") return usePurge(i);
    if (t.kind === "rgreen") return judgeRhythm(i, t);
    if (isFeint(t)) { G.feintStreak++; G.maxFeintStreak = Math.max(G.maxFeintStreak, G.feintStreak); }
    else G.feintStreak = 0;
    if (t.kind === "gold") { G.coins += 5; G.gold++; }
    scoreHit(i, t, color, (isFeint(t) ? 2 : 1) + (t.kind === "gold" ? 2 : 0), t.kind === "gold" || isFeint(t));
  }
  boardEl.addEventListener("pointerdown", onTap);
  function releaseHold() {
    if (!G || !G.holding) return;
    const t = G.tiles.get(G.holding.i);
    if (t) { t.el.classList.remove("holding"); t.el.style.removeProperty("--hold"); }
    G.holding = null;
  }
  window.addEventListener("pointerup", releaseHold);
  window.addEventListener("pointercancel", releaseHold);

  function judgeRhythm(i, t) {
    const ms = (beatPos() - t.target) * spb() * 1000, a = Math.abs(ms);
    let pts, label, cls = "";
    if (a <= 70) { pts = 3; label = "Parfait"; cls = "perfect"; G.perfects++; sfx("perfect"); haptic("perfect"); }
    else if (a <= 150) { pts = 2; label = "Bien"; }
    else { pts = 1; label = ms < 0 ? "Tôt" : "Tard"; cls = "meh"; }
    popup(cells[i], label, cls);
    scoreHit(i, t, "green", pts, pts === 3);
  }
  function useFreeze(i) {
    G.specials++;
    G.freezeUntil = G.clock + FREEZE_MS;
    boardEl.classList.add("frozen");
    sfx("freeze"); haptic("special");
    popup(cells[i], "Ralenti", "blue");
    scoreHit(i, G.tiles.get(i), "green", 1, true);
  }
  function usePurge(i) {
    G.specials++;
    let n = 0;
    for (const [j, t] of [...G.tiles]) {
      if (j === i) continue;
      const c = isFeint(t) ? updateFeint(t, G.clock - t.born) : t.color;
      if (c === "red" || isFeint(t)) { const [x, y] = centerOf(cells[j]); fx.burst(x, y, cssVar("--violet"), "onde"); removeTile(j, "hit"); n++; }
    }
    sfx("purge"); haptic("special");
    popup(cells[i], `Purge ×${n}`, "violet");
    scoreHit(i, G.tiles.get(i), "green", 1 + n, true);
  }
  function holdDone(i) {
    G.specials++;
    G.holding = null;
    popup(cells[i], "Tenu", "");
    scoreHit(i, G.tiles.get(i), "green", 3, true);
  }

  function touchRed(i, t) {
    if (G.M.redPenalty) {
      const [x, y] = centerOf(cells[i]);
      fx.burst(x, y, cssVar("--red"), "eclats", true);
      G.timeLeft -= G.M.redPenalty * 1000; G.combo = 0; G.feintStreak = 0;
      sfx("miss"); haptic("red");
      flash(); glitch(); removeTile(i, "miss");
      banner(`−${G.M.redPenalty} s`, "rouge touché", true);
      renderHud();
      if (G.timeLeft <= 0) { G.cause = { type: "time" }; end(); }
      return;
    }
    G.cause = { type: t.kind === "turn" || t.kind === "trap" || t.kind === "blink" ? t.kind : "red" };
    fail(i, "red");
  }
  function fail(i, color) {
    const [x, y] = centerOf(cells[i]);
    fx.burst(x, y, color === "green" ? cssVar("--green") : cssVar("--red"), "eclats", true);
    const t = G.tiles.get(i); if (t) t.el.classList.add("hit");
    end();
  }
  function missTile(i) {
    G.combo = 0; G.feintStreak = 0;
    sfx("miss"); haptic("miss");
    removeTile(i, "miss");
    if (G.M.lives) {
      G.lives--;
      renderHud();
      if (G.lives <= 0) { G.cause = { type: "miss", target: G.target }; end(); }
    } else renderHud();
  }

  // ---------- levels, boss, mirror ----------
  function levelUp() {
    G.level++;
    G.bpm = Math.min(MAX_BPM, Math.round(G.bpm) + G.M.bpmStep);
    sfx("riser"); haptic("level");
    if (G.M.grids && G.grid < G.M.grids.length - 1) {
      G.grid++;
      const [c, r] = G.M.grids[G.grid];
      clearTiles();
      setGrid(c, r, true);
      banner(`Grille ${c}×${r}`, `${Math.round(G.bpm)} BPM`);
    } else if (G.M.boss && G.level % 5 === 0 && !G.boss) startBoss();
    else if (G.level === G.M.feint.from && G.M.feint.from > 1) banner("Fintes", "les cases mentent", true);
    else banner(G.bpm >= MAX_BPM ? "Tempo max" : `${Math.round(G.bpm)} BPM`, `Niveau ${G.level}`);
    renderHud();
  }
  function startBoss() {
    G.boss = { until: G.clock + BOSS_MS };
    boardEl.classList.add("boss");
    $("#beatbar").classList.add("boss");
    banner("Alerte boss", "tiens 15 secondes", true);
    sfx("alarm"); haptic("boss");
  }
  function endBoss() {
    G.boss = null; G.bosses++;
    boardEl.classList.remove("boss");
    $("#beatbar").classList.remove("boss");
    G.coins += 20; addPoints(50);
    banner("Boss vaincu", "+50 points · +20 crédits");
    sfx("riser"); haptic("level");
    renderHud();
  }
  function mirrorBeat() {
    G.mirrorBeats++;
    const k = G.mirrorBeats % 16;
    if (k === 13) banner("Inversion", "dans 3 temps", true);
    if (k === 0) {
      G.target = G.target === "green" ? "red" : "green";
      G.inversions++;
      clearTiles();
      renderTarget();
      banner("Inversion", `cible : ${G.target === "green" ? "vert" : "rouge"}`);
      sfx("riser"); haptic("level");
    }
  }

  // ---------- loop ----------
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - lastFrame); lastFrame = now;
    if (G && G.running && !G.paused) tick(dt);
    if (!reduceMotion) fx.drawRain(dt, G && G.running && !G.paused ? effBpm() / 100 : 0.8);
    fx.drawFx(dt);
    if (current === "menu") demoTick(now);
    if (current === "tuto") tutoTick(dt);
    requestAnimationFrame(frame);
  }
  function onBeat() {
    if (!(G.trackOn && Music.playing)) Synth.beat(G.beatN, spb(), G.level);
    if (G.M.mirror && G.beatN > 0) mirrorBeat();
    const n = spawnsThisBeat();
    for (let k = 0; k < n; k++) spawn();
    G.beatN++;
    if (!reduceMotion) { boardEl.classList.add("pulse"); setTimeout(() => boardEl.classList.remove("pulse"), 90); }
  }
  function tick(dt) {
    G.clock += dt;
    // Freeze (blue tile): tempo slowed to 70 %, tile timers stop.
    const frozen = G.clock < G.freezeUntil;
    if (frozen !== G.frozen) {
      G.frozen = frozen;
      boardEl.classList.toggle("frozen", frozen);
      G.rateBpm = 0;
    }
    if (frozen) for (const t of G.tiles.values()) t.born += dt;
    else {
      // The tempo creeps up continuously and glides to each new level's value.
      G.bpm = Math.min(MAX_BPM, G.bpm + CREEP * dt / 1000);
      if (G.bpmNow < G.bpm) G.bpmNow = Math.min(G.bpm, G.bpmNow + GLIDE * dt / 1000);
    }
    if (Math.abs(effBpm() - G.rateBpm) >= 0.2) {
      G.rateBpm = effBpm(); Music.setBpm(effBpm());
      if (Math.round(effBpm()) !== G.bpmShown) {
        G.bpmShown = Math.round(effBpm());
        bpmEl.textContent = G.bpmShown;
        $("#sweep").style.setProperty("--bar", (4 * spb()).toFixed(2) + "s");
      }
    }
    if (G.M.time) {
      G.timeLeft -= dt;
      const lvl = 1 + Math.floor((G.M.time * 1000 - G.timeLeft) / 8000);
      while (G.level < lvl) levelUp();
      renderEnergy();
      if (G.timeLeft <= 0) { G.timeLeft = 0; renderEnergy(); G.cause = { type: "time" }; return end(); }
    }
    if (G.boss) {
      const left = Math.ceil((G.boss.until - G.clock) / 1000);
      comboEl.textContent = `Boss ${Math.max(0, left)} s`;
      if (G.clock >= G.boss.until) endBoss();
    }
    if (!(G.trackOn && Music.playing)) G.fbPos += dt / 1000 / spb();
    const pos = beatPos();
    if (G.trackOn && Music.playing && Music.loops !== G.loop) { G.loop = Music.loops; if (G.M.rhythm) clearTiles(); }
    G.pos = pos;
    const key = Math.floor(pos);
    if (pos >= 0 && key !== G.beatKey) { G.beatKey = key; onBeat(); }
    G.phase = pos - Math.floor(pos);
    beatEl.style.transform = `scaleX(${1 - G.phase})`;

    if (G.holding) {
      const t = G.tiles.get(G.holding.i);
      if (t) {
        const k = (G.clock - G.holding.start) / t.holdMs;
        t.el.style.setProperty("--hold", Math.min(1, k).toFixed(3));
        if (k >= 1) holdDone(G.holding.i);
      } else G.holding = null;
    }
    for (const [i, t] of G.tiles) {
      if (G.M.rhythm) {
        const until = t.target - pos;
        if (t.ring) t.ring.style.transform = `scale(${1 + Math.max(0, until) * 1.4})`;
        if (until < -1) { if (t.kind === "rgreen") { missTile(i); if (!G.running) break; } else removeTile(i, "miss"); }
        continue;
      }
      const age = G.clock - t.born, p = age / t.life;
      const color = isFeint(t) ? updateFeint(t, age) : t.color;
      if (p >= 1) {
        // Bonus tiles (blue, violet) just fade; anything else the player had to touch costs a life.
        const bonus = t.kind === "freeze" || t.kind === "purge";
        const missed = G.M.mirror ? color === G.target : color !== "red" && !bonus;
        if (missed) { missTile(i); if (!G.running) break; } else removeTile(i, "miss");
      } else t.timer.style.transform = `scaleX(${1 - p})`;
    }
  }
  requestAnimationFrame(frame);

  // ---------- end of a run ----------
  const CAUSES = {
    red: ["Rouge touché", (b) => `Tu as touché une case rouge à ${b} BPM.`],
    turn: ["Finte", (b) => `Cette verte était passée au rouge (${b} BPM). Les fintes vert → rouge se touchent dès qu'elles apparaissent.`],
    trap: ["Piège", (b) => `Cette rouge n'était pas encore passée au vert (${b} BPM). Attends le vert avant de toucher.`],
    blink: ["Clignotante", (b) => `Touchée pendant sa phase rouge (${b} BPM). Attends qu'elle repasse au vert.`],
    miss: ["Trop lent", (b, g) => g.M.lives === 1 ? `Une case à toucher s'est éteinte (${b} BPM).` : `${g.M.lives} cases à toucher se sont éteintes. La dernière à ${b} BPM.`],
    mirror: ["Mauvaise cible", (b, g) => `La cible était ${g.cause.target === "green" ? "verte" : "rouge"} à ce moment (${b} BPM). Regarde « Cible » en bas de l'écran.`],
    time: ["Temps écoulé", () => "Les 60 secondes sont passées."],
  };
  function end() {
    if (!G.running) return;
    G.running = false; G.over = true;
    releaseHold();
    const timeUp = G.cause && G.cause.type === "time";
    Music.tapeStop();
    if (!timeUp) { sfx("fail"); haptic("red"); flash(); glitch(); } else sfx("ui");
    setTimeout(showOver, timeUp ? 400 : 750);
  }
  function countUp(el, to, ms = 700) {
    if (reduceMotion || to === 0) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function showOver() {
    const bpm = Math.round(G.bpmNow);
    const run = {
      mode: G.modeId, score: G.score, bpm, level: G.level, maxCombo: G.maxCombo, maxFeintStreak: G.maxFeintStreak,
      gold: G.gold, greens: G.greens, perfects: G.perfects, inversions: G.inversions, bosses: G.bosses,
      specials: G.specials, gridCells: cells.length, one: 1, dailyPlayed: G.modeId === "daily" ? 1 : 0,
      duration: G.clock,
    };
    const earned = Math.floor(G.score / 5) + G.coins;
    const prev = S.bests[G.modeId] || 0, isBest = G.score > prev;
    const rankBefore = rankOf(S.xp);
    S.coins += earned; S.games++; S.xp += G.score;
    if (isBest) S.bests[G.modeId] = G.score;
    let tag = "";
    if (G.modeId === "daily") {
      const today = todayKey();
      if (S.daily.date !== today) S.daily = { date: today, score: null, best: 0 };
      if (G.official) { S.daily.score = G.score; tag = "Score officiel du jour"; } else tag = "Entraînement · non classé";
      S.daily.best = Math.max(S.daily.best, G.score);
    }
    if (G.modeId === "duel") { S.duels[G.code] = Math.max(S.duels[G.code] || 0, G.score); tag = `Duel ${G.code}`; }
    const done = applyRunToMissions(run);
    save();

    const c = G.cause || { type: "red" }, [title, explain] = CAUSES[c.type] || CAUSES.red;
    $("#over-mode").textContent = G.M.name;
    const tt = $("#over-title");
    tt.textContent = title; tt.dataset.text = title;
    tt.style.color = c.type === "time" ? "var(--gold)" : "";
    $("#over-sub").textContent = explain(bpm, G);
    $("#over-coins").textContent = "+" + earned;
    $("#over-combo").textContent = G.maxCombo;
    $("#over-bpm").textContent = bpm;
    $("#over-best").hidden = !isBest || G.score === 0 || G.modeId === "duel";
    const tagEl = $("#over-tag"); tagEl.hidden = !tag; tagEl.textContent = tag;
    const rk = rankOf(S.xp);
    $("#over-rank").textContent = rk.name;
    $("#over-xpbar").style.width = (rk.pct * 100).toFixed(1) + "%";
    $("#over-xp").textContent = `+${G.score} pts`;
    const ul = $("#over-missions"); ul.innerHTML = ""; ul.hidden = !done.length;
    done.forEach((m) => { const li = document.createElement("li"); li.textContent = `Mission accomplie : ${m.text}`; const b = document.createElement("b"); b.textContent = `+${m.reward}`; li.appendChild(b); ul.appendChild(li); });
    const form = $("#name-form"), input = $("#name-input");
    form.hidden = G.score === 0 || G.modeId === "duel";
    form.dataset.saved = "";
    input.value = S.name;
    clearTiles();
    bindAll();
    show("over");
    countUp($("#over-score"), G.score);
    if (rk.i > rankBefore.i) setTimeout(() => toast(`Nouveau rang : ${rk.name}`), 900);
    else if (done.length) setTimeout(() => toast(`${done.length} mission${done.length > 1 ? "s" : ""} accomplie${done.length > 1 ? "s" : ""}`), 900);
    // Auto-save under the last pseudo, so a quick "Rejouer" still records the score.
    if (S.name && G.score > 0 && G.modeId !== "duel") recordScore(S.name);
    onlineSubmit(run);
  }
  // ---------- world leaderboard ----------
  let unsentRun = null;
  const ordinal = (n) => (n === 1 ? "1er" : n + "e");
  async function onlineSubmit(run) {
    const el = $("#over-online");
    unsentRun = null;
    if (!NT.online.enabled || !NT.online.GLOBAL_MODES.includes(run.mode) || run.score <= 0) { el.hidden = true; return; }
    el.hidden = false; el.className = "over-online";
    if (!S.name) { unsentRun = run; el.textContent = "Choisis un pseudo ci-dessous pour entrer au classement mondial."; return; }
    el.textContent = "Envoi au classement mondial…";
    try {
      const r = await NT.online.submit(run, S.name);
      if (!r) { el.hidden = true; return; }
      if (r.queued) { el.textContent = "Hors ligne : ton score sera envoyé au classement mondial au retour du réseau."; return; }
      el.className = "over-online ok";
      el.textContent = `Mondial ${MODES[run.mode].name} : ${ordinal(r.rank)} ${r.season ? `de la saison ${r.season}` : "de la pré-saison"} · ton meilleur score : ${r.best}`;
    } catch (e) {
      el.className = "over-online bad";
      el.textContent = `Classement mondial : ${e.message}.`;
      if (/pseudo/.test(e.message)) unsentRun = run;
    }
  }
  function recordScore(name) {
    const form = $("#name-form");
    if (form.dataset.saved) {
      const prev = S.scores.find((s) => s.date === +form.dataset.saved);
      if (prev) prev.name = name;
    } else {
      const entry = { name, score: G.score, level: G.level, mode: G.modeId, date: Date.now() };
      S.scores.push(entry);
      form.dataset.saved = entry.date;
    }
    S.scores.sort((a, b) => b.score - a.score);
    const kept = [], count = {};
    for (const s of S.scores) if ((count[s.mode] = (count[s.mode] || 0) + 1) <= 15) kept.push(s);
    S.scores = kept;
    S.name = name; save();
  }
  $("#name-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#name-input").value.trim().slice(0, 14);
    if (!name) return toast("Écris un pseudo d'abord");
    const changed = name !== S.name;
    recordScore(name);
    $("#name-input").blur();
    toast("Score enregistré");
    if (unsentRun) onlineSubmit(unsentRun);
    else if (changed && NT.online.enabled) NT.online.rename(name).catch((e) => !e.offline && toast(e.message));
  });

  // ---------- start, pause, quit ----------
  let lastStart = { modeId: "classic", opts: {} };
  function startGame(modeId = S.mode, opts = {}) {
    Synth.init(); Synth.applyVolume();
    if (S.track !== "synth") Music.unlock(S.track);
    if (!S.tutorialDone && !opts.skipTuto) return startTutorial(() => startGame(modeId, { ...opts, skipTuto: true }));
    lastStart = { modeId, opts };
    Music.stop();
    newGame(modeId, opts);
    show("play");
    fx.sizeCanvases();
    countdown(async () => {
      G.trackOn = S.track !== "synth" && (await Music.start(S.track, effBpm()));
      G.rateBpm = effBpm();
      G.running = true;
    });
  }
  let countdownTimer = 0;
  function countdown(done) {
    const c = $("#countdown"); let n = 3;
    clearInterval(countdownTimer);
    const showN = (v) => {
      c.innerHTML = `<div class="ring"><svg viewBox="0 0 160 160"><polygon points="80,6 144,43 144,117 80,154 16,117 16,43"/></svg><span></span></div>`;
      c.querySelector("span").textContent = v;
      sfx("ui");
    };
    c.hidden = false; showN(n);
    countdownTimer = setInterval(() => {
      n--;
      if (n === 0) { clearInterval(countdownTimer); c.hidden = true; done(); return; }
      showN(n);
    }, 450);
  }
  function pause() {
    if (!G || !G.running || G.paused) return;
    G.paused = true; releaseHold();
    $("#paused").hidden = false;
    fx.initFrames(screens.play); fx.redrawFrames($("#paused"));
    Music.pause(); Synth.suspend();
  }
  function resume() {
    $("#paused").hidden = true;
    Synth.resume();
    countdown(() => { G.paused = false; Music.resume(); });
  }
  function quit() {
    $("#paused").hidden = true; G.running = false;
    Music.stop(); Synth.resume();
    clearTiles();
    show("menu");
  }
  $("#btn-pause").onclick = pause;
  $("#btn-resume").onclick = resume;
  $("#btn-quit").onclick = quit;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { pause(); if (current === "calib") stopCalib(); MenuMusic.suspend(); }
    else updateMenuMusic();
  });

  $("#btn-play").onclick = () => startGame(S.mode);
  $("#btn-again").onclick = () => startGame(lastStart.modeId, { ...lastStart.opts, skipTuto: true });
  $("#btn-daily").onclick = () => startGame("daily");
  $("#btn-shop").onclick = () => show("shop");
  $("#btn-board").onclick = () => { rankMode = MODES[S.mode].hidden ? "classic" : S.mode; show("ranking"); };
  $("#btn-over-menu").onclick = () => show("menu");
  $("#btn-missions").onclick = () => show("missions");
  $("#btn-rank").onclick = () => show("missions");
  $("#btn-duel").onclick = () => show("duel");
  $("#btn-settings").onclick = () => show("settings");
  $("#btn-share").onclick = () => shareRun();

  // ---------- menu ----------
  function renderMenu() {
    bindAll(); renderModes(); ensureMissions();
    const rk = rankOf(S.xp);
    $("#rank-name").textContent = rk.name;
    $("#rank-bar").style.width = (rk.pct * 100).toFixed(1) + "%";
    $("#daily-date").textContent = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const today = S.daily.date === todayKey();
    $("#daily-state").textContent = today && S.daily.score !== null
      ? `Score officiel ${S.daily.score} · meilleur essai ${S.daily.best}`
      : "Pas encore joué · le premier essai compte";
    const doneCount = S.missions.list.filter((m) => m.done).length;
    const pill = $("#missions-pill"); pill.hidden = false; pill.textContent = `${doneCount}/3`;
    refreshEventPill();
  }
  function renderModes() {
    const box = $("#modes"); box.innerHTML = "";
    for (const id of MODE_IDS) {
      const m = MODES[id], b = document.createElement("button");
      b.className = "mode"; b.dataset.frame = "sm";
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", id === S.mode);
      b.innerHTML = "<b></b><em></em>";
      b.querySelector("b").textContent = m.name;
      b.querySelector("em").textContent = `Record ${S.bests[id] || 0}`;
      b.onclick = () => {
        S.mode = id; save(); sfx("ui"); haptic("ui");
        box.querySelectorAll(".mode").forEach((x) => x.setAttribute("aria-checked", x === b));
        $("#mode-rule").textContent = m.rule;
      };
      box.appendChild(b);
    }
    $("#mode-rule").textContent = MODES[S.mode].rule;
    fx.initFrames(box);
  }
  const demo = $("#demo"), demoCells = [];
  for (let i = 0; i < 20; i++) { const c = document.createElement("i"); demo.appendChild(c); demoCells.push(c); }
  let demoNext = 0;
  function demoTick(now) {
    if (now < demoNext) return;
    demoNext = now + 300;
    const c = demoCells[(Math.random() * demoCells.length) | 0], r = Math.random();
    c.className = r < 0.5 ? "g" : r < 0.8 ? "r" : "";
    if (c.className === "g" && Math.random() < 0.3) setTimeout(() => { c.className = "r"; }, 450);
  }

  // ---------- shop (first tap on a locked item previews it, second tap buys) ----------
  let shopCat = "skin", preview = null;
  document.querySelectorAll("#shop-tabs .tab").forEach((t) => (t.onclick = () => {
    shopCat = t.dataset.cat;
    document.querySelectorAll("#shop-tabs .tab").forEach((x) => x.setAttribute("aria-selected", x === t));
    renderShop();
  }));
  const SHAPE_CLIP = {
    carre: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)", cercle: "circle(50%)",
    losange: "polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)",
    hexa: "polygon(25% 4%, 75% 4%, 98% 50%, 75% 96%, 25% 96%, 2% 50%)",
    etoile: "polygon(50% 0, 63% 32%, 98% 35%, 71% 58%, 80% 94%, 50% 75%, 20% 94%, 29% 58%, 2% 35%, 37% 32%)",
  };
  function itemPreview(cat, item) {
    const p = document.createElement("div");
    if (cat === "skin") {
      const [bg, holo, g, r] = item.colors;
      p.className = "preview"; p.style.background = bg; p.style.boxShadow = `inset 0 0 0 1px ${holo}`;
      [g, r, g].forEach((c) => { const s = document.createElement("span"); s.style.background = c; p.appendChild(s); });
    } else {
      p.className = "preview preview-shape";
      const s = document.createElement("span");
      if (cat === "shape") s.style.clipPath = SHAPE_CLIP[item.id];
      p.appendChild(s);
    }
    return p;
  }
  function endPreview() { if (preview) { clearTimeout(preview.timer); preview = null; applyLook(); } }
  function renderShop() {
    bindAll();
    const list = $("#shop-list"); list.innerHTML = "";
    for (const item of CATALOG[shopCat]) {
      const owned = S.owned[shopCat].includes(item.id), on = S.equipped[shopCat] === item.id;
      const previewing = preview && preview.id === item.id;
      const b = document.createElement("button");
      b.className = "item" + (on ? " equipped" : "") + (owned ? "" : " locked") + (!owned && S.coins < item.price ? " cant" : "") + (previewing ? " previewing" : "");
      b.dataset.frame = "sm";
      b.appendChild(itemPreview(shopCat, item));
      const n = document.createElement("span"); n.className = "name"; n.textContent = item.name; b.appendChild(n);
      const st = document.createElement("span"); st.className = "state";
      if (on) st.textContent = "Équipé";
      else if (owned) st.textContent = "Équiper";
      else if (previewing) st.innerHTML = `Acheter · <span class="coin"></span>${item.price}`;
      else st.innerHTML = `<span class="coin"></span>${item.price} · essayer`;
      b.appendChild(st);
      b.onclick = () => {
        Synth.init();
        if (!owned && !previewing) {
          endPreview();
          preview = { id: item.id, timer: setTimeout(() => { endPreview(); if (current === "shop") renderShop(); }, 5000) };
          if (shopCat === "skin") applyLook(item.id, S.equipped.shape);
          if (shopCat === "shape") applyLook(S.equipped.skin, item.id);
          if (shopCat === "fx") { const a = app.getBoundingClientRect(), r = $("#shop-preview").getBoundingClientRect(); fx.burst(r.left - a.left + r.width / 2, r.top - a.top + r.height / 2, cssVar("--green"), item.id, true); }
          sfx("ui");
          toast(`Aperçu de ${item.name} · touche encore pour l'acheter`);
          return renderShop();
        }
        if (!owned) {
          if (S.coins < item.price) { endPreview(); renderShop(); return toast(`Il te manque ${item.price - S.coins} crédits`); }
          S.coins -= item.price; S.owned[shopCat].push(item.id); toast(`${item.name} débloqué`);
        }
        endPreview();
        S.equipped[shopCat] = item.id; save(); applyLook(); sfx("ui"); haptic("ui");
        if (shopCat === "fx") { const a = app.getBoundingClientRect(), r = b.getBoundingClientRect(); fx.burst(r.left - a.left + r.width / 2, r.top - a.top + r.height / 3, cssVar("--green"), item.id); }
        renderShop();
      };
      list.appendChild(b);
    }
    fx.initFrames(list);
  }

  // ---------- leaderboard ----------
  let rankMode = "classic";
  let rankView = NT.online.enabled ? "world" : "local", boardReq = 0;
  document.querySelectorAll("#rank-view button").forEach((b) => (b.onclick = () => { rankView = b.dataset.view; if (rankView === "world" && rankMode === "daily") rankMode = "classic"; renderBoard(); }));
  function boardRow(rank, name, small, score, me, k) {
    const li = document.createElement("li");
    if (me) li.className = "me";
    li.innerHTML = `<span class="rank"></span><span class="who"></span><span class="pts"></span>`;
    li.querySelector(".rank").textContent = rank;
    li.querySelector(".who").textContent = name;
    const sm = document.createElement("small"); sm.textContent = small; li.querySelector(".who").appendChild(sm);
    li.querySelector(".pts").textContent = score;
    if (!reduceMotion) li.style.animation = `boot .4s ${Math.min(k, 12) * 35}ms both`;
    return li;
  }
  function emptyRow(text) { const li = document.createElement("li"); li.className = "empty"; li.textContent = text; return li; }
  function renderBoard() {
    document.querySelectorAll("#rank-view button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === rankView));
    const world = rankView === "world";
    const tabs = $("#rank-tabs"); tabs.innerHTML = "";
    for (const id of world ? MODE_IDS : [...MODE_IDS, "daily"]) {
      const t = document.createElement("button");
      t.className = "tab"; t.setAttribute("role", "tab"); t.setAttribute("aria-selected", id === rankMode);
      t.textContent = id === "daily" ? "Défi" : MODES[id].name;
      t.onclick = () => { rankMode = id; renderBoard(); };
      tabs.appendChild(t);
    }
    $("#event-card").hidden = !world;
    const ol = $("#board-list"); ol.innerHTML = "";
    if (world) return renderWorld(ol);
    $("#rank-note").textContent = "Classement enregistré sur cet appareil";
    const rows = S.scores.filter((s) => s.mode === rankMode).slice(0, 10);
    if (!rows.length) return ol.appendChild(emptyRow(`Aucun score en ${MODES[rankMode].name} pour l'instant. Termine une partie et enregistre ton pseudo pour entrer au classement.`));
    rows.forEach((s, k) => {
      const d = new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      ol.appendChild(boardRow(k + 1, s.name, `Niveau ${s.level} · ${d}`, s.score, s.name === S.name, k));
    });
  }
  const fmtLeft = (ms) => {
    const h = Math.max(0, Math.floor(ms / 3600000)), d = Math.floor(h / 24);
    return d >= 1 ? `${d} j ${h % 24} h` : h >= 1 ? `${h} h` : `${Math.max(1, Math.ceil(ms / 60000))} min`;
  };
  // Fills the event card. Times are computed from the server clock, not the phone's.
  function renderEvent(info) {
    const main = $("#event-main"), sub = $("#event-sub"), bar = $("#event-bar");
    const now = new Date(info.server_now).getTime();
    if (!info.threshold_at) {
      main.textContent = `${info.players} / ${info.players_needed} joueurs`;
      sub.textContent = `L'événement démarre 7 jours après le ${info.players_needed}e joueur. En attendant, la pré-saison est classée.`;
      bar.style.width = Math.min(100, (info.players / info.players_needed) * 100) + "%";
    } else if (info.season === 0) {
      const left = new Date(info.event_start).getTime() - now;
      main.textContent = `Début dans ${fmtLeft(left)}`;
      sub.textContent = `${info.players} joueurs inscrits. La saison 1 commence le ${new Date(info.event_start).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`;
      bar.style.width = Math.min(100, (1 - left / (7 * 864e5)) * 100) + "%";
    } else {
      const st = new Date(info.season_start).getTime(), en = new Date(info.season_end).getTime();
      main.textContent = `Saison ${info.season} · fin dans ${fmtLeft(en - now)}`;
      sub.textContent = "Remise à zéro chaque mois. Épreuve officielle : mode Classique.";
      bar.style.width = Math.min(100, ((now - st) / (en - st)) * 100) + "%";
    }
    $("#rank-note").textContent = info.season === 0 ? "Pré-saison · classement mondial" : `Saison ${info.season} · classement mondial du mois`;
    fx.initFrames($("#event-card")); fx.redrawFrames($("#event-card"));
  }
  async function renderWorld(ol) {
    $("#rank-note").textContent = "Classement mondial";
    if (!NT.online.enabled) {
      $("#event-card").hidden = true;
      return ol.appendChild(emptyRow("Le classement mondial n'est pas encore activé sur cette version."));
    }
    const req = ++boardReq, mode = rankMode === "daily" ? "classic" : rankMode;
    ol.appendChild(emptyRow("Chargement…"));
    try {
      const [info, rows] = await Promise.all([NT.online.eventInfo(), NT.online.leaderboard(mode)]);
      if (req !== boardReq || current !== "ranking") return;
      ol.innerHTML = "";
      if (info) renderEvent(info);
      if (!rows || !rows.length) return ol.appendChild(emptyRow(`Personne n'est encore classé en ${MODES[mode].name} ce mois-ci. Termine une partie avec un pseudo pour être le premier.`));
      let last = 0;
      rows.forEach((r, k) => {
        if (r.rank > last + 1 && last > 0) { const gap = document.createElement("li"); gap.className = "gap"; gap.textContent = "…"; ol.appendChild(gap); }
        ol.appendChild(boardRow(r.rank, r.name, `Niveau ${r.level} · ${r.bpm} BPM`, r.score, r.is_me, k));
        last = r.rank;
      });
    } catch (e) {
      if (req !== boardReq) return;
      ol.innerHTML = "";
      const msg = e.offline ? "Pas de connexion. Le classement mondial s'affichera dès que tu seras en ligne."
        : /api key/i.test(e.message) ? "Le serveur refuse la clé du jeu (adresse ou clé publique Supabase incorrecte)."
        : /function|schema|does not exist/i.test(e.message) ? "Le serveur n'est pas encore prêt (schéma SQL non installé)."
        : `Classement indisponible : ${e.message}`;
      ol.appendChild(emptyRow(msg));
    }
  }

  // ---------- missions & rank ----------
  function renderMissions() {
    bindAll(); ensureMissions();
    const ul = $("#mission-list"); ul.innerHTML = "";
    for (const m of S.missions.list) {
      const def = missionDef(m.id); if (!def) continue;
      const li = document.createElement("li");
      li.className = "mission" + (m.done ? " done" : ""); li.dataset.frame = "sm";
      const pct = Math.min(1, m.progress / def.goal);
      li.innerHTML = `<span class="m-text"></span><span class="m-reward"><span class="coin"></span>${def.reward}</span><span class="xpbar"><i style="width:${(pct * 100).toFixed(0)}%"></i></span><span class="m-prog"></span>`;
      li.querySelector(".m-text").textContent = def.text;
      li.querySelector(".m-prog").textContent = m.done ? "Accomplie" : `${Math.min(m.progress, def.goal)} / ${def.goal}`;
      ul.appendChild(li);
    }
    fx.initFrames(ul);
    const rk = rankOf(S.xp);
    $("#rank-big").textContent = rk.name;
    $("#rank-bar2").style.width = (rk.pct * 100).toFixed(1) + "%";
    $("#rank-next").textContent = rk.next ? `${S.xp} points de carrière · ${rk.next.name} à ${rk.next.xp}` : `${S.xp} points de carrière · rang maximal`;
  }

  // ---------- duel ----------
  let duelCode = newCode();
  function renderDuel() {
    $("#duel-new").textContent = duelCode;
    $("#duel-input").value = "";
  }
  $("#btn-duel-reroll").onclick = () => { duelCode = newCode(); renderDuel(); sfx("ui"); };
  $("#btn-duel-new").onclick = () => startGame("duel", { code: duelCode });
  $("#duel-input").addEventListener("input", (e) => { e.target.value = cleanCode(e.target.value); });
  $("#duel-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = cleanCode($("#duel-input").value);
    if (code.length !== 5) return toast("Un code fait 5 caractères");
    startGame("duel", { code });
  });

  // ---------- settings ----------
  function renderSettings() {
    $("#set-name").value = S.name || "";
    $("#set-music").value = Math.round(S.musicVol * 100);
    $("#set-sfx").value = Math.round(S.sfxVol * 100);
    $("#set-vibe").setAttribute("aria-pressed", S.vibration);
    const noVibe = NT.isIOS && !NT.native();
    $("#set-vibe").disabled = noVibe; $("#vibe-hint").hidden = !noVibe;
    $("#set-cb").setAttribute("aria-pressed", S.colorblind);
    $("#set-latency").textContent = S.calibrated ? `${Math.round(S.latency * 1000)} ms compensés` : "Non calibré";
    $("#app-version").textContent = VERSION;
    const seg = $("#set-track"); seg.innerHTML = "";
    for (const id of Object.keys(TRACKS)) {
      const b = document.createElement("button");
      b.textContent = TRACKS[id].name; b.setAttribute("aria-pressed", S.track === id);
      if (TRACKS[id].src && Music.failed[id]) { b.disabled = true; b.title = "Fichier absent de cette version"; }
      b.onclick = () => { S.track = id; save(); renderSettings(); sfx("ui"); };
      seg.appendChild(b);
    }
    resetArmed = false; $("#btn-reset").textContent = "Effacer"; $("#reset-hint").textContent = "Crédits, records, achats";
  }
  $("#name-set-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#set-name").value.trim().slice(0, 14);
    if (name.length < 2) return toast("Le pseudo doit faire au moins 2 caractères");
    if (NT.online.enabled) {
      try { await NT.online.rename(name); }
      catch (err) { if (!err.offline) return toast(err.message); }
    }
    S.name = name; save(); $("#set-name").blur(); toast("Pseudo enregistré");
  });
  $("#set-music").addEventListener("input", (e) => { S.musicVol = e.target.value / 100; Music.applyVolume(); MenuMusic.applyVolume(); Synth.init(); Synth.applyVolume(); save(); });
  $("#set-sfx").addEventListener("input", (e) => { S.sfxVol = e.target.value / 100; Synth.init(); Synth.applyVolume(); save(); });
  $("#set-sfx").addEventListener("change", () => sfx("hit", 3, false));
  $("#set-vibe").onclick = () => { S.vibration = !S.vibration; save(); renderSettings(); haptic("level"); };
  $("#set-cb").onclick = () => { S.colorblind = !S.colorblind; save(); applyLook(); renderSettings(); };
  $("#btn-calib").onclick = () => show("calib");
  $("#btn-tuto").onclick = () => startTutorial(() => show("menu"));
  $("#btn-privacy").onclick = () => show("privacy");
  let resetArmed = false, resetTimer = 0;
  $("#btn-reset").onclick = () => {
    if (!resetArmed) {
      resetArmed = true; $("#btn-reset").textContent = "Confirmer"; $("#reset-hint").textContent = "Touche encore : tout sera effacé";
      clearTimeout(resetTimer); resetTimer = setTimeout(() => current === "settings" && renderSettings(), 4000);
      return;
    }
    try { localStorage.removeItem(KEY); } catch {}
    location.reload();
  };

  // ---------- calibration: tap along to the track, measure how late the sound arrives ----------
  const CALIB_TAPS = 16;
  let calib = null;
  function renderCalib() {
    calib = null;
    $("#calib-count").textContent = "Commencer";
    $("#calib-result").textContent = S.calibrated ? `Décalage actuel : ${Math.round(S.latency * 1000)} ms.` : "";
  }
  function stopCalib() {
    if (!calib) return;
    if (calib.mode === "track") Music.stop();
    clearInterval(calib.timer);
    calib = null;
  }
  async function startCalib() {
    Synth.init(); Synth.applyVolume();
    calib = { taps: [], mode: "wait", t0: 0 };
    $("#calib-count").textContent = "Écoute…";
    $("#calib-result").textContent = "";
    const c = calib;
    const track = S.track !== "synth" && (await Music.start(S.track, TRACKS[S.track].bpm));
    if (calib !== c) return; // left the screen meanwhile
    if (track) { calib.mode = "track"; return; }
    // Synth clicks every 600 ms, scheduled on the audio clock.
    const ctx = Synth.ctx; calib.t0 = ctx.currentTime + 0.3; calib.mode = "synth";
    for (let k = 0; k < 40; k++) Synth.click(calib.t0 + k * 0.6, k % 4 === 0);
  }
  function calibTap() {
    if (!calib) return startCalib();
    if (calib.mode === "wait") return;
    let d;
    if (calib.mode === "track") {
      const p = Music.pos(0), bp = p.pos;
      if (bp < 2) return;
      d = (bp - Math.round(bp)) * 60 / TRACKS[S.track].bpm;
    } else {
      const t = Synth.ctx.currentTime - calib.t0;
      if (t < 1.2) return;
      d = t - Math.round(t / 0.6) * 0.6;
    }
    calib.taps.push(d);
    haptic("ui");
    const ring = $("#calib-ring"); ring.classList.remove("on"); void ring.offsetWidth; ring.classList.add("on");
    const left = CALIB_TAPS - calib.taps.length;
    $("#calib-count").textContent = left > 0 ? left : "OK";
    if (left <= 0) {
      const sorted = calib.taps.slice().sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const spread = sorted[Math.floor(sorted.length * 0.8)] - sorted[Math.floor(sorted.length * 0.2)];
      stopCalib();
      if (spread > 0.16) {
        $("#calib-result").textContent = "Les touches étaient trop irrégulières pour mesurer. Recommence en suivant le temps fort.";
        $("#calib-count").textContent = "Recommencer";
        return;
      }
      S.latency = Math.max(-0.1, Math.min(0.35, med)); S.calibrated = true; save();
      $("#calib-result").textContent = `Décalage mesuré : ${Math.round(S.latency * 1000)} ms. Il est compensé dans tous les modes.`;
      $("#calib-count").textContent = "Refaire";
    }
  }
  $("#calib-pad").addEventListener("pointerdown", (e) => { e.preventDefault(); calibTap(); });
  $("#btn-calib-reset").onclick = () => { stopCalib(); S.latency = 0; S.calibrated = false; save(); renderCalib(); toast("Décalage remis à zéro"); };
  $("#btn-calib-done").onclick = () => show("settings");

  // ---------- tutorial ----------
  const TUTO = [
    { text: "Touche la case verte.", tiles: [{ cell: 4, kind: "green" }] },
    { text: "Une case rouge : ne la touche pas. Laisse-la s'éteindre.", tiles: [{ cell: 4, kind: "red", life: 2400 }], waitRed: true },
    { text: "Les vertes s'éteignent : touche-la avant que sa barre se vide.", tiles: [{ cell: 2, kind: "green", life: 2600 }] },
    { text: "Finte : cette verte va passer au rouge. Touche-la tout de suite.", tiles: [{ cell: 6, kind: "turn", life: 3200, switchAt: 1300 }] },
    { text: "Piège : cette rouge va passer au vert. Attends, puis touche-la.", tiles: [{ cell: 4, kind: "trap", life: 4400, switchAt: 1800 }] },
    { text: "Clignotante : touche-la quand elle est verte.", tiles: [{ cell: 4, kind: "blink", life: 7000, flip: 700, startColor: "red" }] },
    { text: "Case noire : garde le doigt appuyé jusqu'à ce qu'elle se remplisse.", tiles: [{ cell: 4, kind: "hold", holdMs: 900 }] },
    { text: "Bleue : ralentit le tempo. Violette : efface les rouges. Touche les deux.", tiles: [{ cell: 3, kind: "freeze" }, { cell: 5, kind: "purge" }] },
  ];
  const tutoBoard = $("#tuto-board");
  let T = null;
  function startTutorial(after) {
    Synth.init(); Synth.applyVolume();
    T = { step: 0, after, cells: buildGrid(tutoBoard, 3, 3, false), tiles: new Map(), clock: 0, holding: null, busy: false };
    show("tuto");
    tutoStep();
  }
  function tutoStep() {
    const st = TUTO[T.step];
    tutoBoard.querySelectorAll(".tile").forEach((el) => el.remove()); T.tiles.clear(); T.clock = 0; T.holding = null; T.busy = false;
    $("#tuto-step").textContent = `${T.step + 1} / ${TUTO.length}`;
    $("#tuto-text").textContent = st.text;
    $("#tuto-feedback").textContent = "";
    $("#tuto-feedback").className = "tuto-feedback";
    for (const d of st.tiles) {
      const t = { kind: d.kind, born: 0, life: d.life || Infinity, color: KIND_COLOR[d.kind] || "green", switchAt: d.switchAt || 0, holdMs: d.holdMs };
      if (d.kind === "trap") t.color = "red";
      if (d.kind === "blink") { t.flip = d.flip; t.color = t.startColor = d.startColor; }
      makeTile(T.cells[d.cell], t);
      T.tiles.set(d.cell, t);
    }
  }
  function tutoFeedback(text, ok) {
    const f = $("#tuto-feedback"); f.textContent = text; f.className = "tuto-feedback " + (ok ? "ok" : "bad");
  }
  function tutoRetry(text) {
    T.busy = true; tutoFeedback(text, false); sfx("miss"); haptic("miss");
    setTimeout(() => T && tutoStep(), 1100);
  }
  function tutoNext() {
    T.busy = true; tutoFeedback("Bien joué", true); sfx("riser");
    setTimeout(() => {
      if (!T) return;
      if (++T.step >= TUTO.length) return finishTutorial();
      tutoStep();
    }, 700);
  }
  function finishTutorial() {
    S.tutorialDone = true; save();
    const after = T.after; T = null;
    toast("Entraînement terminé");
    after ? after() : show("menu");
  }
  function tutoHit(i) {
    const t = T.tiles.get(i), [x, y] = centerOf(T.cells[i]);
    fx.burst(x, y, cssVar("--green"), S.equipped.fx);
    sfx("hit", 1, false); haptic("hit");
    t.el.classList.add("hit"); setTimeout(() => t.el.remove(), 250);
    T.tiles.delete(i);
    if (!T.tiles.size) tutoNext();
  }
  tutoBoard.addEventListener("pointerdown", (e) => {
    if (!T || T.busy) return;
    const cell = e.target.closest(".cell"); if (!cell) return;
    e.preventDefault();
    const i = +cell.dataset.i, t = T.tiles.get(i); if (!t) return;
    const color = isFeint(t) ? updateFeint(t, T.clock) : t.color;
    if (t.kind === "hold") { T.holding = { i, start: T.clock }; t.el.classList.add("holding"); return; }
    if (color === "red") {
      const msg = { turn: "Raté : elle était déjà rouge. Touche-la plus vite.", trap: "Trop tôt : elle était encore rouge.", blink: "Raté : elle était rouge à ce moment-là." }[t.kind] || "Raté : on ne touche jamais le rouge.";
      return tutoRetry(msg);
    }
    tutoHit(i);
  });
  function tutoRelease() {
    if (!T || !T.holding) return;
    const t = T.tiles.get(T.holding.i);
    if (t) { t.el.classList.remove("holding"); t.el.style.removeProperty("--hold"); }
    T.holding = null;
    if (t && !T.busy) tutoFeedback("Garde le doigt appuyé plus longtemps.", false);
  }
  window.addEventListener("pointerup", tutoRelease);
  window.addEventListener("pointercancel", tutoRelease);
  function tutoTick(dt) {
    if (!T || T.busy) return;
    T.clock += dt;
    if (T.holding) {
      const t = T.tiles.get(T.holding.i), k = (T.clock - T.holding.start) / t.holdMs;
      t.el.style.setProperty("--hold", Math.min(1, k).toFixed(3));
      if (k >= 1) { const idx = T.holding.i; T.holding = null; return tutoHit(idx); }
    }
    for (const [i, t] of T.tiles) {
      const color = isFeint(t) ? updateFeint(t, T.clock) : t.color, p = T.clock / t.life;
      if (isFinite(t.life)) t.timer.style.transform = `scaleX(${Math.max(0, 1 - p)})`;
      if (p >= 1) {
        if (TUTO[T.step].waitRed) { t.el.classList.add("miss"); setTimeout(() => t.el.remove(), 300); T.tiles.delete(i); return tutoNext(); }
        return tutoRetry(color === "red" && t.kind === "turn" ? "Trop tard : elle est passée au rouge." : "Trop tard : elle s'est éteinte.");
      }
    }
  }
  $("#btn-tuto-skip").onclick = () => { if (T) finishTutorial(); };

  // ---------- share ----------
  function shareText() {
    const what = G.modeId === "duel" ? `en Duel (code ${G.code})` : G.modeId === "daily" ? `au Défi du jour du ${fmtDate()}` : `en ${G.M.name}`;
    return `J'ai fait ${G.score} ${what} sur Redless, à ${Math.round(G.bpmNow)} BPM. Tu fais mieux ?`;
  }
  async function shareRun() {
    if (!G) return;
    const btn = $("#btn-share"); btn.disabled = true;
    try {
      const cv = await fx.shareCard({ score: G.score, mode: G.M.name, bpm: Math.round(G.bpmNow), level: G.level, combo: G.maxCombo, rank: rankOf(S.xp).name, date: fmtDate(), code: G.modeId === "duel" ? G.code : null });
      const url = cv.toDataURL("image/png"), text = shareText(), n = NT.native();
      if (n && n.shareImage) { n.shareImage(url, text); return; }
      const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
      const file = new File([blob], "redless.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      $("#share-img").src = url;
      $("#share-modal").hidden = false;
      fx.initFrames($("#share-modal")); fx.redrawFrames($("#share-modal"));
    } finally { btn.disabled = false; }
  }
  $("#btn-share-close").onclick = () => { $("#share-modal").hidden = true; };
  $("#btn-share-copy").onclick = async () => {
    const text = shareText();
    try { await navigator.clipboard.writeText(text); toast("Texte copié"); }
    catch { toast(text); }
  };

  // ---------- Android wrapper hooks: system Back and app going to background ----------
  window.__pause = () => { pause(); if (current === "calib") stopCalib(); MenuMusic.suspend(); };
  window.__resume = () => updateMenuMusic();
  window.__back = () => {
    if (!$("#share-modal").hidden) { $("#share-modal").hidden = true; return true; }
    if (current === "play") {
      if (G && G.running && !G.paused) { pause(); return true; }
      if (G && G.paused) { quit(); return true; }
      return true;
    }
    if (current === "tuto") { finishTutorial(); return true; }
    if (current === "menu") return false;
    show(BACK_TO[current] || "menu"); return true;
  };
  window.__debug = () => ({ music: Music.playing, rate: Music.el && Music.el.playbackRate, bpm: G && G.bpm, bpmNow: G && G.bpmNow, cells: cells.length, tiles: G && [...G.tiles.values()].map((t) => t.kind), level: G && G.level, target: G && G.target, boss: !!(G && G.boss), score: G && G.score, spawned: G && G.spawnLog.join(",") });

  // ---------- iPhone & installable web app ----------
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  NT.isIOS = isIOS;
  // Long-press (black tiles) must not open the iOS callout or the context menu; no pinch-zoom mid-game.
  app.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  // Let the game sound play even with the iPhone's silent switch on (Safari 16.4+).
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  // Offline cache once installed. Refused inside previews and sandboxes: that is fine.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost") && !NT.native()) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  // Install notice to the server (the owner gets an e-mail): Android app, or web app opened from the home screen.
  const installPlatform = NT.native() ? "android" : standalone ? (isIOS ? "ios" : "web-app") : null;
  if (installPlatform) setTimeout(() => NT.online.registerInstall(installPlatform, VERSION), 2000);
  window.addEventListener("appinstalled", () => NT.online.registerInstall("web-app", VERSION));
  let installPrompt = null;
  function installDismissed() { try { return localStorage.getItem("redless-install-hidden") === "1"; } catch { return false; } }
  function showInstall(html, withButton) {
    if (standalone || NT.native() || installDismissed()) return;
    $("#install-text").innerHTML = html;
    $("#btn-install").hidden = !withButton;
    $("#install").hidden = false;
    fx.initFrames($("#install"));
  }
  if (isIOS && !standalone) showInstall("Installe Redless : <b>Partager</b> puis <b>Sur l'écran d'accueil</b>. Il marchera en plein écran et hors ligne.", false);
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; showInstall("Installe Redless sur ton téléphone : plein écran et hors ligne.", true); });
  $("#btn-install").onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); try { await installPrompt.userChoice; } catch {} installPrompt = null; $("#install").hidden = true; };
  $("#btn-install-close").onclick = () => { $("#install").hidden = true; try { localStorage.setItem("redless-install-hidden", "1"); } catch {} };

  // Event status on the menu's Classement button, refreshed at most once a minute.
  let eventPillAt = 0;
  async function refreshEventPill() {
    if (!NT.online.enabled || Date.now() - eventPillAt < 60000) return;
    eventPillAt = Date.now();
    try {
      const info = await NT.online.eventInfo(), p = $("#rank-pill");
      if (!info) return;
      p.hidden = false;
      p.textContent = !info.threshold_at ? `${info.players}/${info.players_needed}` : info.season === 0 ? "Bientôt" : `Saison ${info.season}`;
    } catch {}
  }
  if (NT.online.enabled) setTimeout(() => NT.online.flush(S.name), 3000);

  // ---------- boot ----------
  applyLook();
  setGrid(...DEFAULT_GRID, false);
  fx.sizeCanvases();
  ensureMissions();
  show("menu");
})();
