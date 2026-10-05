(() => {
  "use strict";

  // ---------- config ----------
  const COLS = 4, ROWS = 6;
  const START_BPM = 96, MAX_BPM = 184, BPM_STEP = 8;
  const GREENS_PER_LEVEL = 12;
  const LIVES = 3;

  const CATALOG = {
    skin: [
      { id: "minuit", name: "Minuit", price: 0,    colors: ["#12151d", "#3ee07a", "#ff3b4e"] },
      { id: "craie",  name: "Craie",  price: 250,  colors: ["#ebe8e1", "#1c9a52", "#d42a3e"] },
      { id: "neon",   name: "Néon",   price: 400,  colors: ["#0b0616", "#39ff9f", "#ff2e88"] },
      { id: "ocean",  name: "Océan",  price: 600,  colors: ["#06171f", "#4ef0c4", "#ff5d73"] },
      { id: "lave",   name: "Lave",   price: 800,  colors: ["#190c09", "#b8f25c", "#ff4d1a"] },
      { id: "shadow", name: "Shadow 1", price: 1200, colors: ["#1d1e21", "#4be38a", "#f2424f"] },
    ],
    fx: [
      { id: "eclats",   name: "Éclats",   price: 0 },
      { id: "confetti", name: "Confettis", price: 200 },
      { id: "onde",     name: "Onde",     price: 350 },
      { id: "pixels",   name: "Pixels",   price: 500 },
      { id: "eclair",   name: "Éclair",   price: 900 },
    ],
    shape: [
      { id: "carre",   name: "Carré",   price: 0 },
      { id: "cercle",  name: "Cercle",  price: 150 },
      { id: "losange", name: "Losange", price: 300 },
      { id: "hexa",    name: "Hexagone", price: 450 },
      { id: "etoile",  name: "Étoile",  price: 700 },
    ],
  };

  // ---------- storage (may be unavailable) ----------
  const KEY = "ntplr-save-v1";
  const defaults = {
    coins: 0, best: 0, games: 0, name: "",
    owned: { skin: ["minuit"], fx: ["eclats"], shape: ["carre"] },
    equipped: { skin: "minuit", fx: "eclats", shape: "carre" },
    scores: [], sound: true,
  };
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(defaults);
      const s = JSON.parse(raw);
      return { ...structuredClone(defaults), ...s,
        owned: { ...defaults.owned, ...s.owned }, equipped: { ...defaults.equipped, ...s.equipped } };
    } catch { return structuredClone(defaults); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
  const S = load();

  // ---------- dom ----------
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const screens = ["menu", "play", "over", "shop", "ranking"].reduce((o, id) => (o[id] = $("#" + id), o), {});
  const boardEl = $("#board"), scoreEl = $("#score"), heartsEl = $("#hearts"), comboEl = $("#combo");
  const bpmEl = $("#bpm"), levelEl = $("#level"), beatEl = $("#beat"), runCoinsEl = $("#run-coins");
  const canvas = $("#fx"), ctx2d = canvas.getContext("2d");

  const ICONS = {
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  };
  $("#btn-pause").innerHTML = ICONS.pause;
  document.querySelectorAll(".back").forEach((b) => (b.innerHTML = ICONS.back, b.onclick = () => show("menu")));

  function show(id) {
    for (const k in screens) screens[k].hidden = k !== id;
    if (id === "menu") renderMenu();
    if (id === "shop") renderShop();
    if (id === "ranking") renderBoard();
  }
  function bindAll() {
    document.querySelectorAll('[data-bind="coins"]').forEach((e) => (e.textContent = S.coins));
    document.querySelectorAll('[data-bind="best"]').forEach((e) => (e.textContent = S.best));
    document.querySelectorAll('[data-bind="games"]').forEach((e) => (e.textContent = S.games));
  }
  function applyLook() {
    app.dataset.skin = S.equipped.skin;
    app.dataset.shape = S.equipped.shape;
    const bg = getComputedStyle(app).getPropertyValue("--bg").trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.content = bg;
  }
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 1600);
  }
  const cssVar = (n) => getComputedStyle(app).getPropertyValue(n).trim();

  // ---------- audio: a small procedural track whose tempo is the game clock ----------
  const Audio = {
    ctx: null, master: null,
    init() {
      if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = S.sound ? 0.6 : 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    setOn(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.02); },
    t(offset = 0) { return this.ctx.currentTime + 0.01 + offset; },
    kick(at) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
      g.gain.setValueAtTime(0.9, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      o.connect(g).connect(this.master); o.start(at); o.stop(at + 0.22);
    },
    hat(at, vol = 0.18) {
      const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      s.buffer = this.noise; f.type = "highpass"; f.frequency.value = 7000;
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
      s.connect(f).connect(g).connect(this.master); s.start(at); s.stop(at + 0.06);
    },
    snare(at) {
      const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      s.buffer = this.noise; f.type = "bandpass"; f.frequency.value = 1800;
      g.gain.setValueAtTime(0.35, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      s.connect(f).connect(g).connect(this.master); s.start(at); s.stop(at + 0.15);
    },
    tone(freq, at, dur, type = "triangle", vol = 0.2) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(this.master); o.start(at); o.stop(at + dur + 0.02);
    },
    // A minor progression: Am F C G, one chord per bar of 4 beats.
    BASS: [110, 87.31, 130.81, 98],
    beat(n, spb, level) {
      if (!this.ctx) return;
      const at = this.t(), beatInBar = n % 4, chord = this.BASS[Math.floor(n / 4) % 4];
      this.kick(at);
      if (beatInBar === 1 || beatInBar === 3) this.snare(at);
      this.hat(at + spb / 2);
      if (level >= 3) { this.hat(at + spb / 4, 0.08); this.hat(at + (3 * spb) / 4, 0.08); }
      this.tone(chord, at, spb * 0.9, "sawtooth", 0.07);
      if (level >= 5) this.tone(chord * 2, at + spb / 2, spb * 0.4, "square", 0.04);
    },
    // Pentatonic notes climbing with the combo.
    PENTA: [440, 523.25, 587.33, 659.25, 783.99],
    hit(combo, gold) {
      if (!this.ctx) return;
      const i = combo % 10, f = this.PENTA[i % 5] * (i >= 5 ? 2 : 1);
      this.tone(f, this.t(), 0.18, "triangle", 0.22);
      if (gold) this.tone(f * 1.5, this.t(0.06), 0.25, "sine", 0.18);
    },
    miss() { if (this.ctx) this.tone(180, this.t(), 0.25, "square", 0.12); },
    fail() {
      if (!this.ctx) return;
      const at = this.t(), o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(320, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.7);
      g.gain.setValueAtTime(0.35, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.75);
      o.connect(g).connect(this.master); o.start(at); o.stop(at + 0.8);
      this.snare(at);
    },
    ui() { if (this.ctx) this.tone(660, this.t(), 0.08, "sine", 0.12); },
  };

  function renderSoundBtn() {
    const b = $("#btn-sound");
    b.innerHTML = S.sound ? ICONS.sound : ICONS.mute;
    b.setAttribute("aria-label", S.sound ? "Couper le son" : "Activer le son");
  }
  $("#btn-sound").onclick = () => { S.sound = !S.sound; save(); Audio.init(); Audio.setOn(S.sound); renderSoundBtn(); };

  // ---------- effects canvas ----------
  let parts = [];
  function sizeCanvas() {
    const r = app.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", sizeCanvas);
  function burst(x, y, color, kind = S.equipped.fx, big = false) {
    const n = big ? 26 : 14;
    if (kind === "onde") { parts.push({ type: "ring", x, y, r: 6, life: 1, color }); parts.push({ type: "ring", x, y, r: 2, life: 1.25, color }); return; }
    if (kind === "eclair") {
      for (let i = 0; i < 6; i++) parts.push({ type: "bolt", x, y, a: (i / 6) * Math.PI * 2 + Math.random() * 0.5, len: 30 + Math.random() * 40, life: 1, color });
      return;
    }
    const palette = kind === "confetti" ? [cssVar("--green"), cssVar("--gold"), cssVar("--ink"), cssVar("--red")] : [color];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * (big ? 6 : 4);
      parts.push({
        type: kind === "pixels" ? "px" : kind === "confetti" ? "conf" : "dot",
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === "confetti" ? 2 : 0),
        rot: Math.random() * 6, life: 1, size: kind === "pixels" ? 5 + Math.random() * 4 : 2 + Math.random() * 3,
        color: palette[i % palette.length],
      });
    }
  }
  function drawFx(dt) {
    const w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    const k = dt / 16.7;
    parts = parts.filter((p) => (p.life -= 0.03 * k) > 0);
    for (const p of parts) {
      ctx2d.globalAlpha = Math.min(1, p.life);
      ctx2d.fillStyle = ctx2d.strokeStyle = p.color;
      if (p.type === "ring") {
        p.r += 3.2 * k; ctx2d.lineWidth = 4 * p.life;
        ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx2d.stroke();
      } else if (p.type === "bolt") {
        const d = p.len * (1.2 - p.life); ctx2d.lineWidth = 3;
        ctx2d.beginPath(); ctx2d.moveTo(p.x + Math.cos(p.a) * d * 0.4, p.y + Math.sin(p.a) * d * 0.4);
        const mx = p.x + Math.cos(p.a + 0.3) * d * 0.7, my = p.y + Math.sin(p.a + 0.3) * d * 0.7;
        ctx2d.lineTo(mx, my); ctx2d.lineTo(p.x + Math.cos(p.a) * d, p.y + Math.sin(p.a) * d); ctx2d.stroke();
      } else {
        p.x += p.vx * k; p.y += p.vy * k; p.vy += (p.type === "conf" ? 0.12 : 0.18) * k; p.vx *= 0.98; p.rot += 0.2 * k;
        if (p.type === "dot") { ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx2d.fill(); }
        else if (p.type === "px") ctx2d.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, p.size, p.size);
        else { ctx2d.save(); ctx2d.translate(p.x, p.y); ctx2d.rotate(p.rot); ctx2d.fillRect(-4, -2, 8, 4); ctx2d.restore(); }
      }
    }
    ctx2d.globalAlpha = 1;
  }

  // ---------- game state ----------
  const cells = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const c = document.createElement("div");
    c.className = "cell"; c.dataset.i = i; boardEl.appendChild(c); cells.push(c);
  }
  let G = null;

  function newGame() {
    G = {
      running: false, paused: false, over: false,
      score: 0, combo: 0, maxCombo: 0, lives: LIVES, coins: 0, greens: 0,
      level: 1, bpm: START_BPM, beatN: 0, nextBeat: 0, lastBeat: 0, clock: 0,
      tiles: new Map(), // cellIndex -> tile
    };
    cells.forEach((c) => (c.innerHTML = ""));
    renderHud();
  }
  const spb = () => 60 / G.bpm; // seconds per beat

  function renderHud() {
    scoreEl.textContent = G.score;
    heartsEl.innerHTML = "";
    for (let i = 0; i < LIVES; i++) {
      const h = document.createElement("span");
      h.className = "heart" + (i >= G.lives ? " lost" : ""); heartsEl.appendChild(h);
    }
    const mult = multiplier();
    comboEl.textContent = G.combo >= 5 ? `Combo ${G.combo}${mult > 1 ? " · x" + mult : ""}` : "";
    bpmEl.textContent = `${G.bpm} BPM`;
    levelEl.textContent = `Niveau ${G.level}`;
    runCoinsEl.textContent = G.coins;
  }
  const multiplier = () => (G.combo >= 50 ? 4 : G.combo >= 25 ? 3 : G.combo >= 10 ? 2 : 1);

  // Difficulty curve, all derived from the level.
  function lifetimeMs() { return Math.max(520, 1700 - (G.level - 1) * 110); }
  function redChance() { return Math.min(0.42, 0.22 + (G.level - 1) * 0.025); }
  function spawnsThisBeat() {
    if (G.level >= 7) return Math.random() < 0.5 ? 2 : 1;
    if (G.level >= 4) return Math.random() < 0.25 ? 2 : 1;
    return 1;
  }

  function spawn() {
    const free = [];
    for (let i = 0; i < cells.length; i++) if (!G.tiles.has(i)) free.push(i);
    if (!free.length) return;
    const i = free[(Math.random() * free.length) | 0];
    const r = Math.random();
    const kind = r < redChance() ? "red" : r < redChance() + 0.05 ? "gold" : "green";
    const el = document.createElement("div");
    el.className = "tile " + kind;
    const timer = document.createElement("span"); timer.className = "timer"; el.appendChild(timer);
    cells[i].appendChild(el);
    const life = kind === "red" ? lifetimeMs() * 1.3 : lifetimeMs();
    G.tiles.set(i, { kind, el, timer, born: G.clock, life });
  }

  function removeTile(i, cls) {
    const t = G.tiles.get(i); if (!t) return;
    G.tiles.delete(i);
    if (cls) { t.el.classList.add(cls); setTimeout(() => t.el.remove(), 260); } else t.el.remove();
  }

  function cellCenter(i) {
    const a = app.getBoundingClientRect(), r = cells[i].getBoundingClientRect();
    return [r.left - a.left + r.width / 2, r.top - a.top + r.height / 2];
  }

  function onTap(e) {
    if (!G || !G.running || G.paused) return;
    const cell = e.target.closest(".cell"); if (!cell) return;
    e.preventDefault();
    const i = +cell.dataset.i, t = G.tiles.get(i);
    if (!t) return; // empty cell: no penalty
    const [x, y] = cellCenter(i);
    if (t.kind === "red") return lose(i, x, y);
    G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.greens++;
    G.score += multiplier();
    if (t.kind === "gold") { G.coins += 5; G.score += 2 * multiplier(); }
    Audio.hit(G.combo, t.kind === "gold");
    burst(x, y, t.kind === "gold" ? cssVar("--gold") : cssVar("--green"), S.equipped.fx, t.kind === "gold");
    removeTile(i, "hit");
    if (G.greens % GREENS_PER_LEVEL === 0) levelUp();
    renderHud();
  }
  boardEl.addEventListener("pointerdown", onTap);

  function levelUp() {
    G.level++;
    G.bpm = Math.min(MAX_BPM, G.bpm + BPM_STEP);
    const l = $("#levelup");
    l.textContent = G.bpm >= MAX_BPM ? "Tempo max" : `${G.bpm} BPM`;
    l.classList.remove("on"); void l.offsetWidth; l.classList.add("on");
  }

  function missGreen(i) {
    G.lives--; G.combo = 0;
    Audio.miss();
    try { navigator.vibrate && navigator.vibrate(40); } catch {}
    removeTile(i, "miss");
    renderHud();
    if (G.lives <= 0) end("Trop lent", "Trois cases vertes ratées");
  }

  function lose(i, x, y) {
    burst(x, y, cssVar("--red"), "eclats", true);
    const t = G.tiles.get(i); if (t) t.el.classList.add("hit");
    end("Rouge touché", null);
  }

  function end(title, sub) {
    G.running = false; G.over = true;
    Audio.fail();
    try { navigator.vibrate && navigator.vibrate([80, 40, 120]); } catch {}
    const f = $("#flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
    screens.play.classList.remove("shake"); void screens.play.offsetWidth; screens.play.classList.add("shake");
    setTimeout(() => showOver(title, sub), 650);
  }

  function showOver(title, sub) {
    const earned = Math.floor(G.score / 5) + G.coins;
    const isBest = G.score > S.best;
    S.coins += earned; S.games++;
    if (isBest) S.best = G.score;
    save();
    $("#over-title").textContent = title;
    $("#over-sub").textContent = sub || `Niveau ${G.level} atteint`;
    $("#over-score").textContent = G.score;
    $("#over-coins").textContent = "+" + earned;
    $("#over-combo").textContent = G.maxCombo;
    $("#over-bpm").textContent = G.bpm;
    $("#over-best").hidden = !isBest || G.score === 0;
    const form = $("#name-form"), input = $("#name-input");
    form.hidden = G.score === 0;
    form.dataset.saved = "";
    input.value = S.name;
    for (const i of [...G.tiles.keys()]) removeTile(i);
    bindAll();
    show("over");
    // Auto-save under the last pseudo, so a quick "Rejouer" still records the score.
    if (S.name && G.score > 0) recordScore(S.name);
  }

  function recordScore(name) {
    const form = $("#name-form");
    const entry = { name, score: G.score, level: G.level, date: Date.now() };
    if (form.dataset.saved) {
      const prev = S.scores.find((s) => s.date === +form.dataset.saved);
      if (prev) prev.name = name;
    } else {
      S.scores.push(entry);
      form.dataset.saved = entry.date;
    }
    S.scores.sort((a, b) => b.score - a.score);
    S.scores = S.scores.slice(0, 20);
    S.name = name; save();
  }
  $("#name-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#name-input").value.trim().slice(0, 14);
    if (!name) return toast("Écris un pseudo d'abord");
    recordScore(name);
    $("#name-input").blur();
    toast("Score enregistré");
  });

  // ---------- loop ----------
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - lastFrame); lastFrame = now;
    if (G && G.running && !G.paused) {
      G.clock += dt;
      if (G.clock >= G.nextBeat) {
        Audio.beat(G.beatN, spb(), G.level);
        const n = spawnsThisBeat();
        for (let k = 0; k < n; k++) spawn();
        G.lastBeat = G.nextBeat;
        G.nextBeat += spb() * 1000;
        G.beatN++;
      }
      beatEl.style.transform = `scaleX(${1 - (G.clock - G.lastBeat) / (spb() * 1000)})`;
      for (const [i, t] of G.tiles) {
        const p = (G.clock - t.born) / t.life;
        if (p >= 1) { if (t.kind === "red") removeTile(i, "miss"); else { missGreen(i); if (!G.running) break; } }
        else t.timer.style.transform = `scaleX(${1 - p})`;
      }
    }
    if (parts.length || canvas.dataset.dirty) { drawFx(dt); canvas.dataset.dirty = parts.length ? "1" : ""; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function startGame() {
    Audio.init(); Audio.setOn(S.sound);
    newGame();
    show("play");
    sizeCanvas();
    countdown(() => { G.running = true; G.nextBeat = G.clock; });
  }
  function countdown(done) {
    const c = $("#countdown"); let n = 3;
    c.hidden = false; c.textContent = n; Audio.ui();
    const iv = setInterval(() => {
      n--;
      if (n === 0) { clearInterval(iv); c.hidden = true; done(); return; }
      c.textContent = n; Audio.ui();
    }, 500);
  }
  function pause() {
    if (!G || !G.running || G.paused) return;
    G.paused = true; $("#paused").hidden = false;
    if (Audio.ctx) Audio.ctx.suspend();
  }
  function resume() {
    $("#paused").hidden = true;
    if (Audio.ctx) Audio.ctx.resume();
    countdown(() => { G.paused = false; });
  }
  $("#btn-pause").onclick = pause;
  $("#btn-resume").onclick = resume;
  $("#btn-quit").onclick = () => {
    $("#paused").hidden = true; G.running = false;
    if (Audio.ctx) Audio.ctx.resume();
    for (const i of [...G.tiles.keys()]) removeTile(i);
    show("menu");
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

  $("#btn-play").onclick = startGame;
  $("#btn-again").onclick = startGame;
  $("#btn-shop").onclick = () => show("shop");
  $("#btn-over-shop").onclick = () => show("shop");
  $("#btn-board").onclick = () => show("ranking");
  $("#btn-over-menu").onclick = () => show("menu");

  // ---------- menu ----------
  function renderMenu() { bindAll(); renderSoundBtn(); }

  // ---------- shop ----------
  let shopCat = "skin";
  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => {
    shopCat = t.dataset.cat;
    document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", x === t));
    renderShop();
  }));
  function preview(cat, item) {
    const p = document.createElement("div");
    if (cat === "skin") {
      const [bg, g, r] = item.colors;
      p.className = "preview"; p.style.background = bg;
      [g, r, g].forEach((c) => { const s = document.createElement("span"); s.style.background = c; p.appendChild(s); });
    } else if (cat === "shape") {
      p.className = "preview preview-shape"; p.style.background = "var(--cell)";
      const s = document.createElement("span");
      const shapes = {
        carre: "inset(0 round 10px)", cercle: "circle(50%)",
        losange: "polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)",
        hexa: "polygon(25% 4%, 75% 4%, 98% 50%, 75% 96%, 25% 96%, 2% 50%)",
        etoile: "polygon(50% 0, 63% 32%, 98% 35%, 71% 58%, 80% 94%, 50% 75%, 20% 94%, 29% 58%, 2% 35%, 37% 32%)",
      };
      s.style.clipPath = shapes[item.id]; p.appendChild(s);
    } else {
      p.className = "preview preview-shape"; p.style.background = "var(--cell)";
      const s = document.createElement("span"); s.style.borderRadius = "10px"; p.appendChild(s);
    }
    return p;
  }
  function renderShop() {
    bindAll();
    const list = $("#shop-list"); list.innerHTML = "";
    for (const item of CATALOG[shopCat]) {
      const owned = S.owned[shopCat].includes(item.id), on = S.equipped[shopCat] === item.id;
      const b = document.createElement("button");
      b.className = "item" + (on ? " equipped" : "") + (owned ? "" : " locked") + (!owned && S.coins < item.price ? " cant" : "");
      b.appendChild(preview(shopCat, item));
      const n = document.createElement("span"); n.className = "name"; n.textContent = item.name; b.appendChild(n);
      const st = document.createElement("span"); st.className = "state";
      if (on) st.textContent = "Équipé";
      else if (owned) st.textContent = "Équiper";
      else st.innerHTML = `<span class="coin"></span>${item.price}`;
      b.appendChild(st);
      b.onclick = (e) => {
        Audio.init();
        if (!owned) {
          if (S.coins < item.price) return toast(`Il te manque ${item.price - S.coins} pièces`);
          S.coins -= item.price; S.owned[shopCat].push(item.id); toast(`${item.name} débloqué`);
        }
        S.equipped[shopCat] = item.id; save(); applyLook(); Audio.ui();
        if (shopCat === "fx") {
          sizeCanvas();
          const a = app.getBoundingClientRect(), r = b.getBoundingClientRect();
          burst(r.left - a.left + r.width / 2, r.top - a.top + r.height / 3, cssVar("--green"), item.id);
        }
        renderShop();
      };
      list.appendChild(b);
    }
  }

  // ---------- leaderboard ----------
  function renderBoard() {
    const ol = $("#board-list"); ol.innerHTML = "";
    if (!S.scores.length) {
      const li = document.createElement("li"); li.className = "empty";
      li.textContent = "Aucun score pour l'instant. Termine une partie et enregistre ton pseudo pour entrer au classement.";
      ol.appendChild(li); return;
    }
    S.scores.slice(0, 10).forEach((s, k) => {
      const li = document.createElement("li");
      if (s.name === S.name) li.className = "me";
      const d = new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      li.innerHTML = `<span class="rank">${k + 1}</span><span class="who"></span><span class="pts">${s.score}</span>`;
      li.querySelector(".who").textContent = s.name;
      const sm = document.createElement("small"); sm.textContent = `Niveau ${s.level} · ${d}`;
      li.querySelector(".who").appendChild(sm);
      ol.appendChild(li);
    });
  }

  // ---------- boot ----------
  applyLook();
  show("menu");
  sizeCanvas();
})();
