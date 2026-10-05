(() => {
  "use strict";

  // ---------- config ----------
  const MUSIC = { src: "audio/sync-or-die.mp3", bpm: 100, offset: 0.055 }; // measured on the track
  const MAX_BPM = 200; // = music played at 2x
  const GLIDE = 7;     // BPM per second: the tempo slides to its new value instead of jumping
  const CREEP = 0.25;  // BPM per second added between levels, so the music never stops speeding up

  // Each mode tunes the same engine. Levels raise the tempo; the tempo is the music's playback speed.
  const MODES = {
    classic: {
      name: "Classique", rule: "3 vies, ça accélère vite",
      lives: 3, startBpm: 72, bpmStep: 9, greensPerLevel: 8,
      feint: { from: 2, base: 0.06, step: 0.04, max: 0.32 },
    },
    chrono: {
      name: "Chrono", rule: "60 s, rouge = −5 s",
      lives: 0, time: 60, redPenalty: 5, startBpm: 80, bpmStep: 12, greensPerLevel: 7,
      feint: { from: 1, base: 0.12, step: 0.03, max: 0.3 },
    },
    sudden: {
      name: "Mort subite", rule: "1 seule vie, départ rapide",
      lives: 1, startBpm: 95, bpmStep: 10, greensPerLevel: 8,
      feint: { from: 1, base: 0.15, step: 0.04, max: 0.35 },
    },
    feint: {
      name: "Fintes", rule: "Les cases changent de couleur",
      lives: 3, startBpm: 72, bpmStep: 8, greensPerLevel: 8,
      feint: { from: 1, base: 0.55, step: 0.04, max: 0.8 },
    },
    expansion: {
      name: "Expansion", rule: "La grille s'agrandit à chaque palier",
      lives: 3, startBpm: 72, bpmStep: 8, greensPerLevel: 6,
      feint: { from: 4, base: 0.08, step: 0.03, max: 0.3 },
      grids: [[2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [4, 6], [5, 6], [5, 7], [6, 7], [6, 8], [7, 9]],
    },
  };
  const MODE_IDS = Object.keys(MODES);
  const DEFAULT_GRID = [4, 6];

  const CATALOG = {
    skin: [
      { id: "minuit", name: "Holo",    price: 0,    colors: ["#040a11", "#36c9ff", "#2bff8a", "#ff2d55"] },
      { id: "craie",  name: "Matrice", price: 250,  colors: ["#06100c", "#7dffb3", "#e8ff5a", "#ff3d3d"] },
      { id: "neon",   name: "Néon",    price: 400,  colors: ["#090414", "#c45cff", "#39ff9f", "#ff2e88"] },
      { id: "ocean",  name: "Océan",   price: 600,  colors: ["#020d14", "#4ef0e0", "#7dff6a", "#ff5d73"] },
      { id: "lave",   name: "Lave",    price: 800,  colors: ["#120604", "#ff7a3c", "#b8f25c", "#ff2f4f"] },
      { id: "shadow", name: "Chrome",  price: 1200, colors: ["#08090a", "#e8edf2", "#4be38a", "#f2424f"] },
    ],
    fx: [
      { id: "eclats",   name: "Éclats",    price: 0 },
      { id: "confetti", name: "Confettis", price: 200 },
      { id: "onde",     name: "Onde",      price: 350 },
      { id: "pixels",   name: "Pixels",    price: 500 },
      { id: "eclair",   name: "Éclair",    price: 900 },
    ],
    shape: [
      { id: "carre",   name: "Biseau",   price: 0 },
      { id: "cercle",  name: "Cercle",   price: 150 },
      { id: "losange", name: "Losange",  price: 300 },
      { id: "hexa",    name: "Hexagone", price: 450 },
      { id: "etoile",  name: "Étoile",   price: 700 },
    ],
  };

  // ---------- storage (may be unavailable) ----------
  const KEY = "ntplr-save-v1";
  const defaults = {
    coins: 0, bests: {}, games: 0, name: "", mode: "classic",
    owned: { skin: ["minuit"], fx: ["eclats"], shape: ["carre"] },
    equipped: { skin: "minuit", fx: "eclats", shape: "carre" },
    scores: [], sound: true,
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(defaults);
      const s = JSON.parse(raw);
      const out = { ...clone(defaults), ...s,
        owned: { ...defaults.owned, ...s.owned }, equipped: { ...defaults.equipped, ...s.equipped } };
      // v1 saves had one global best and mode-less scores: they were all Classique.
      if (typeof s.best === "number" && !out.bests.classic) out.bests.classic = s.best;
      out.scores.forEach((e) => (e.mode = e.mode || "classic"));
      if (!MODES[out.mode]) out.mode = "classic";
      return out;
    } catch { return clone(defaults); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
  const S = load();

  // ---------- dom ----------
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const screens = ["menu", "play", "over", "shop", "ranking"].reduce((o, id) => (o[id] = $("#" + id), o), {});
  const boardEl = $("#board"), scoreEl = $("#score"), comboEl = $("#combo");
  const bpmEl = $("#bpm"), levelEl = $("#level"), beatEl = $("#beat"), runCoinsEl = $("#run-coins");
  const canvas = $("#fx"), ctx2d = canvas.getContext("2d");
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ICONS = {
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  };
  $("#btn-pause").innerHTML = ICONS.pause;
  document.querySelectorAll(".back").forEach((b) => (b.innerHTML = ICONS.back, b.onclick = () => show("menu")));

  // ---------- holographic frames (chamfered SVG outlines sized to their element) ----------
  const SVGNS = "http://www.w3.org/2000/svg";
  function framePaths(type, w, h) {
    if (type === "hex") {
      const c = Math.min(22, w * 0.09);
      return { outline: `M${c} 0H${w - c}L${w} ${h / 2}L${w - c} ${h}H${c}L0 ${h / 2}Z`,
               ticks: `M${c + 8} 0H${c + 40}M${w - c - 40} ${h}H${w - c - 8}` };
    }
    const c = type === "board" ? 18 : 9;
    const outline = `M${c} 0H${w - c}L${w} ${c}V${h - c}L${w - c} ${h}H${c}L0 ${h - c}V${c}Z`;
    if (type !== "board") return { outline, ticks: `M${c + 4} 0H${c + 22}` };
    const m = h / 2;
    return { outline,
      ticks: `M0 ${c + 6}V${c + 40}M${w} ${h - c - 40}V${h - c - 6}M${c + 6} ${h}H${c + 50}M${w - c - 50} 0H${w - c - 6}`,
      extra: `M-7 ${m - 26}L-14 ${m}L-7 ${m + 26}M${w + 7} ${m - 26}L${w + 14} ${m}L${w + 7} ${m + 26}` };
  }
  function drawFrame(el) {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    let svg = el.querySelector(":scope > .frame-svg");
    if (!svg) {
      svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("class", "frame-svg"); svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = '<path class="fill"/><path class="line" pathLength="1"/><path class="tick"/><path class="line extra"/>';
      el.prepend(svg);
    }
    const p = framePaths(el.dataset.frame, w, h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const [fill, line, tick, extra] = svg.children;
    fill.setAttribute("d", el.dataset.frame === "board" ? "" : p.outline);
    line.setAttribute("d", p.outline); tick.setAttribute("d", p.ticks); extra.setAttribute("d", p.extra || "");
  }
  const frameObserver = "ResizeObserver" in window ? new ResizeObserver((es) => es.forEach((e) => drawFrame(e.target))) : null;
  function initFrames(root = document) {
    root.querySelectorAll("[data-frame]").forEach((el) => {
      if (el.dataset.framed) return;
      el.dataset.framed = "1";
      frameObserver ? frameObserver.observe(el) : drawFrame(el);
    });
  }
  function redrawFrames(root) { root.querySelectorAll("[data-frame]").forEach(drawFrame); }

  function show(id) {
    for (const k in screens) screens[k].hidden = k !== id;
    const sc = screens[id];
    if (id === "menu") renderMenu();
    if (id === "shop") renderShop();
    if (id === "ranking") renderBoard();
    initFrames(sc); redrawFrames(sc);
    if (!reduceMotion) {
      sc.classList.remove("enter"); void sc.offsetWidth; sc.classList.add("enter");
      sc.querySelectorAll(".frame-svg .line:not(.extra)").forEach((l) => { l.classList.remove("draw"); void l.getBBox; l.classList.add("draw"); });
      setTimeout(() => sc.classList.remove("enter"), 900);
    }
  }
  function bindAll() {
    document.querySelectorAll('[data-bind="coins"]').forEach((e) => (e.textContent = S.coins));
  }
  function applyLook() {
    app.dataset.skin = S.equipped.skin;
    app.dataset.shape = S.equipped.shape;
    const bg = getComputedStyle(app).getPropertyValue("--bg").trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.content = bg;
    rainColor = cssVar("--holo");
  }
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 1600);
  }
  const cssVar = (n) => getComputedStyle(app).getPropertyValue(n).trim();

  // ---------- music: the track is the game clock; its playback rate is the game tempo ----------
  const Music = {
    el: null, playing: false, loops: 0, lastT: 0, lastKey: -1,
    init() {
      if (this.el) return;
      const a = new window.Audio();
      a.src = MUSIC.src; a.loop = true; a.preload = "auto";
      a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = true;
      a.addEventListener("error", () => { this.playing = false; });
      this.el = a;
    },
    async start(bpm) {
      this.init();
      const a = this.el;
      a.muted = !S.sound; a.volume = 0.9;
      a.preservesPitch = a.webkitPreservesPitch = true;
      a.playbackRate = bpm / MUSIC.bpm;
      try { a.currentTime = 0; } catch {}
      this.loops = 0; this.lastT = 0; this.lastKey = -1;
      try { await a.play(); this.playing = true; } catch { this.playing = false; }
      return this.playing;
    },
    setBpm(bpm) { if (this.el) this.el.playbackRate = Math.min(2, bpm / MUSIC.bpm); },
    // Beat position in the track, or null before the first beat.
    beat() {
      const t = this.el.currentTime;
      if (t + 1 < this.lastT) this.loops++;
      this.lastT = t;
      const p = (t - MUSIC.offset) * MUSIC.bpm / 60;
      if (p < 0) return null;
      return { key: this.loops * 100000 + Math.floor(p), phase: p - Math.floor(p) };
    },
    pause() { if (this.el && this.playing) this.el.pause(); },
    resume() { if (this.el && this.playing) this.el.play().catch(() => {}); },
    stop() { if (this.el) { this.el.pause(); } this.playing = false; },
    // Tape-stop: the track slows down and drops in pitch, then stops.
    tapeStop() {
      if (!this.el || !this.playing) return;
      const a = this.el, r0 = a.playbackRate, t0 = performance.now();
      a.preservesPitch = a.webkitPreservesPitch = false;
      const step = () => {
        const k = (performance.now() - t0) / 700;
        if (k >= 1) { a.pause(); this.playing = false; return; }
        a.playbackRate = Math.max(0.25, r0 * (1 - k));
        a.volume = 0.9 * (1 - k);
        requestAnimationFrame(step);
      };
      step();
    },
    mute(on) { if (this.el) this.el.muted = on; },
  };

  // ---------- synth: sound effects, and the backing beat if the track can't play ----------
  const Audio = {
    ctx: null, master: null,
    init() {
      if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = S.sound ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    setOn(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.02); },
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
    BASS: [110, 87.31, 130.81, 98],
    beat(n, spb, level) {
      if (!this.ctx) return;
      const at = this.t(), beatInBar = n % 4, chord = this.BASS[Math.floor(n / 4) % 4];
      this.kick(at);
      if (beatInBar === 1 || beatInBar === 3) this.snare(at);
      this.hat(at + spb / 2);
      if (level >= 3) { this.hat(at + spb / 4, 0.08); this.hat(at + (3 * spb) / 4, 0.08); }
      this.tone(chord, at, spb * 0.9, "sawtooth", 0.07);
    },
    PENTA: [440, 523.25, 587.33, 659.25, 783.99],
    hit(combo, special) {
      if (!this.ctx) return;
      const i = combo % 10, f = this.PENTA[i % 5] * (i >= 5 ? 2 : 1);
      this.tone(f, this.t(), 0.14, "triangle", 0.14);
      if (special) this.tone(f * 1.5, this.t(0.05), 0.2, "sine", 0.12);
    },
    miss() { if (this.ctx) this.tone(180, this.t(), 0.25, "square", 0.1); },
    fail() {
      if (!this.ctx) return;
      const at = this.t(), o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(320, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.7);
      g.gain.setValueAtTime(0.3, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.75);
      o.connect(g).connect(this.master); o.start(at); o.stop(at + 0.8);
      this.snare(at);
    },
    ui() { if (this.ctx) this.tone(880, this.t(), 0.06, "square", 0.05); },
    sweep() { // level-up riser
      if (!this.ctx) return;
      const at = this.t(), o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(220, at); o.frequency.exponentialRampToValueAtTime(1320, at + 0.35);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.08, at + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      o.connect(g).connect(this.master); o.start(at); o.stop(at + 0.42);
    },
  };

  function renderSoundBtn() {
    const b = $("#btn-sound");
    b.innerHTML = S.sound ? ICONS.sound : ICONS.mute;
    b.setAttribute("aria-label", S.sound ? "Couper le son" : "Activer le son");
  }
  $("#btn-sound").onclick = () => { S.sound = !S.sound; save(); Audio.init(); Audio.setOn(S.sound); Music.mute(!S.sound); renderSoundBtn(); };

  // ---------- rain (background canvas) ----------
  const rainCv = $("#rain"), rainCtx = rainCv.getContext("2d");
  let drops = [], rainColor = "#36c9ff";
  function sizeCanvases() {
    const r = app.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const [cv, cx] of [[canvas, ctx2d], [rainCv, rainCtx]]) {
      cv.width = r.width * dpr; cv.height = r.height * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    drops = Array.from({ length: Math.round(r.width / 4) }, () => newDrop(r.width, r.height, true));
  }
  function newDrop(w, h, anywhere) {
    const z = Math.random();
    return { x: Math.random() * (w + 60), y: anywhere ? Math.random() * h : -20, len: 8 + z * 22, v: 7 + z * 11, a: 0.05 + z * 0.22 };
  }
  window.addEventListener("resize", sizeCanvases);
  function drawRain(dt) {
    const w = rainCv.width / (Math.min(window.devicePixelRatio || 1, 2)), h = rainCv.height / (Math.min(window.devicePixelRatio || 1, 2));
    rainCtx.clearRect(0, 0, w, h);
    const speed = (G && G.running && !G.paused ? G.bpmNow / 100 : 0.8) * dt / 16.7;
    rainCtx.strokeStyle = rainColor; rainCtx.lineWidth = 1;
    for (const d of drops) {
      d.y += d.v * speed; d.x -= d.v * speed * 0.12;
      if (d.y > h + 20) Object.assign(d, newDrop(w, h, false));
      rainCtx.globalAlpha = d.a;
      rainCtx.beginPath(); rainCtx.moveTo(d.x, d.y); rainCtx.lineTo(d.x + d.len * 0.12, d.y - d.len); rainCtx.stroke();
    }
    rainCtx.globalAlpha = 1;
  }

  // ---------- effects canvas ----------
  let parts = [];
  function burst(x, y, color, kind = S.equipped.fx, big = false) {
    const n = big ? 26 : 14;
    parts.push({ type: "hexring", x, y, r: 8, life: 1, color });
    if (kind === "onde") { parts.push({ type: "ring", x, y, r: 6, life: 1, color }); parts.push({ type: "ring", x, y, r: 2, life: 1.25, color }); return; }
    if (kind === "eclair") {
      for (let i = 0; i < 6; i++) parts.push({ type: "bolt", x, y, a: (i / 6) * Math.PI * 2 + Math.random() * 0.5, len: 30 + Math.random() * 40, life: 1, color });
      return;
    }
    const palette = kind === "confetti" ? [cssVar("--green"), cssVar("--gold"), cssVar("--holo"), cssVar("--red")] : [color];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * (big ? 6 : 4);
      parts.push({
        type: kind === "pixels" ? "px" : kind === "confetti" ? "conf" : "shard",
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === "confetti" ? 2 : 0),
        rot: Math.random() * 6, life: 1, size: kind === "pixels" ? 5 + Math.random() * 4 : 2 + Math.random() * 3,
        color: palette[i % palette.length],
      });
    }
  }
  function hexPath(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; c[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath();
  }
  function drawFx(dt) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    const k = dt / 16.7;
    parts = parts.filter((p) => (p.life -= 0.03 * k) > 0);
    for (const p of parts) {
      ctx2d.globalAlpha = Math.min(1, p.life);
      ctx2d.fillStyle = ctx2d.strokeStyle = p.color;
      if (p.type === "ring" || p.type === "hexring") {
        p.r += (p.type === "ring" ? 3.2 : 2.4) * k; ctx2d.lineWidth = 3 * p.life;
        if (p.type === "ring") { ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2); } else hexPath(ctx2d, p.x, p.y, p.r);
        ctx2d.stroke();
      } else if (p.type === "bolt") {
        const d = p.len * (1.2 - p.life); ctx2d.lineWidth = 3;
        ctx2d.beginPath(); ctx2d.moveTo(p.x + Math.cos(p.a) * d * 0.4, p.y + Math.sin(p.a) * d * 0.4);
        const mx = p.x + Math.cos(p.a + 0.3) * d * 0.7, my = p.y + Math.sin(p.a + 0.3) * d * 0.7;
        ctx2d.lineTo(mx, my); ctx2d.lineTo(p.x + Math.cos(p.a) * d, p.y + Math.sin(p.a) * d); ctx2d.stroke();
      } else {
        p.x += p.vx * k; p.y += p.vy * k; p.vy += (p.type === "conf" ? 0.12 : 0.16) * k; p.vx *= 0.98; p.rot += 0.2 * k;
        if (p.type === "px") ctx2d.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, p.size, p.size);
        else if (p.type === "conf") { ctx2d.save(); ctx2d.translate(p.x, p.y); ctx2d.rotate(p.rot); ctx2d.fillRect(-4, -2, 8, 4); ctx2d.restore(); }
        else { // shard: thin triangle
          ctx2d.save(); ctx2d.translate(p.x, p.y); ctx2d.rotate(p.rot);
          ctx2d.beginPath(); ctx2d.moveTo(0, -p.size * 2); ctx2d.lineTo(p.size, p.size); ctx2d.lineTo(-p.size, p.size); ctx2d.fill(); ctx2d.restore();
        }
      }
    }
    ctx2d.globalAlpha = 1;
  }

  // ---------- board ----------
  let cells = [];
  function setGrid(cols, rows, animate) {
    boardEl.querySelectorAll(".cell").forEach((c) => c.remove());
    boardEl.style.setProperty("--cols", cols);
    boardEl.style.setProperty("--rows", rows);
    boardEl.style.setProperty("--ar", (cols / rows).toFixed(4));
    boardEl.classList.toggle("small", cols >= 6);
    cells = [];
    for (let i = 0; i < cols * rows; i++) {
      const c = document.createElement("div");
      c.className = "cell" + (animate ? " grow" : ""); c.dataset.i = i;
      if (animate) c.style.animationDelay = `${(Math.floor(i / cols) + (i % cols)) * 25}ms`;
      boardEl.appendChild(c); cells.push(c);
    }
    $("#grid-size").textContent = `${cols}×${rows}`;
  }

  // ---------- game state ----------
  let G = null;

  function newGame() {
    const M = MODES[S.mode];
    G = {
      mode: S.mode, M,
      running: false, paused: false, over: false,
      score: 0, combo: 0, maxCombo: 0, lives: M.lives, coins: 0, greens: 0,
      level: 1, bpm: M.startBpm, bpmNow: M.startBpm, bpmShown: M.startBpm, beatN: 0, nextBeat: 0, lastBeat: 0, clock: 0, phase: 0,
      timeLeft: M.time ? M.time * 1000 : 0,
      tiles: new Map(), // cellIndex -> tile
      grid: M.grids ? 0 : -1,
    };
    const [c, r] = M.grids ? M.grids[0] : DEFAULT_GRID;
    setGrid(c, r, true);
    $("#energy-label").textContent = M.time ? "Temps" : "Énergie";
    $("#mode-tag").textContent = M.name;
    renderHud();
  }
  const spb = () => 60 / G.bpmNow; // seconds per beat, at the tempo the music is playing now

  const THRESHOLDS = [0, 10, 25, 50];
  const multiplier = () => (G.combo >= 50 ? 4 : G.combo >= 25 ? 3 : G.combo >= 10 ? 2 : 1);
  function renderHud() {
    scoreEl.textContent = G.score;
    const mult = multiplier();
    comboEl.textContent = G.combo >= 3 ? `Combo ${G.combo}` : "";
    $("#mult").textContent = "x" + mult;
    const lo = THRESHOLDS[mult - 1], hi = THRESHOLDS[mult] || lo;
    const shield = mult >= 4 ? 1 : (G.combo - lo) / (hi - lo);
    $("#shield-fill").style.strokeDashoffset = 100 - shield * 100;
    bpmEl.textContent = Math.round(G.bpmNow);
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
  function bump() { scoreEl.classList.remove("bump"); void scoreEl.offsetWidth; scoreEl.classList.add("bump"); }
  function banner(text, sub, warn) {
    const b = $("#banner");
    b.innerHTML = ""; b.append(text);
    if (sub) { const s = document.createElement("small"); s.textContent = sub; b.appendChild(s); }
    b.classList.toggle("warn", !!warn);
    b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
  }

  // Difficulty curve. Lifetime is measured in beats, so it shrinks with the tempo,
  // and also loses beats as levels climb.
  function lifetimeMs() {
    const beats = Math.max(1.6, 3.4 - (G.level - 1) * 0.18);
    return Math.max(380, beats * spb() * 1000);
  }
  function redChance() { return Math.min(0.4, 0.24 + (G.level - 1) * 0.02); }
  function feintChance() {
    const f = G.M.feint;
    if (G.level < f.from) return 0;
    return Math.min(f.max, f.base + (G.level - f.from) * f.step);
  }
  function spawnsThisBeat() {
    const extra = Math.min(0.8, Math.max(0, (G.level - 2) * 0.12));
    let n = 1 + (Math.random() < extra ? 1 : 0) + (G.level >= 9 && Math.random() < 0.3 ? 1 : 0);
    if (cells.length >= 30 && Math.random() < 0.5) n++; // bigger grids need more traffic
    if (cells.length <= 6) n = 1;
    return n;
  }

  // Tile kinds:
  //  green / gold / red  — fixed colour
  //  turn   — starts green, turns red partway (tap it early)
  //  trap   — starts red, turns green partway (wait, then tap)
  //  blink  — flips green/red every half beat (tap on green)
  function pickKind() {
    if (Math.random() < feintChance()) {
      const r = Math.random();
      return r < 0.4 ? "turn" : r < 0.75 ? "trap" : "blink";
    }
    const r = Math.random();
    return r < redChance() ? "red" : r < redChance() + 0.05 ? "gold" : "green";
  }

  function spawn() {
    const free = [];
    for (let i = 0; i < cells.length; i++) if (!G.tiles.has(i)) free.push(i);
    if (free.length <= 1) return;
    const i = free[(Math.random() * free.length) | 0];
    const kind = pickKind();
    const el = document.createElement("div");
    const timer = document.createElement("span"); timer.className = "timer"; el.appendChild(timer);
    cells[i].appendChild(el);
    const life = lifetimeMs();
    const t = { kind, el, timer, born: G.clock, life, color: "green", switchAt: 0 };
    if (kind === "red") { t.color = "red"; t.life = life * 1.3; }
    else if (kind === "gold") t.color = "gold";
    else if (kind === "turn") t.switchAt = life * (0.3 + Math.random() * 0.25);
    else if (kind === "trap") { t.color = "red"; t.switchAt = life * (0.25 + Math.random() * 0.2); t.life = life * 1.35; }
    else if (kind === "blink") { t.flip = spb() * 500; t.color = t.startColor = Math.random() < 0.5 ? "green" : "red"; t.life = life * 1.5; }
    el.className = "tile " + t.color;
    G.tiles.set(i, t);
  }

  // Advance colour changes of feint tiles. Returns the tile's colour now.
  function updateFeint(t, age) {
    let c = t.color;
    if (t.kind === "turn" && age >= t.switchAt) c = "red";
    else if (t.kind === "trap" && age >= t.switchAt) c = "green";
    else if (t.kind === "blink") c = Math.floor(age / t.flip) % 2 === 0 ? t.startColor : (t.startColor === "green" ? "red" : "green");
    if (c !== t.color) { t.color = c; t.el.className = "tile flip " + c; }
    return c;
  }

  function removeTile(i, cls) {
    const t = G.tiles.get(i); if (!t) return;
    G.tiles.delete(i);
    if (cls) { t.el.classList.add(cls); setTimeout(() => t.el.remove(), 300); } else t.el.remove();
  }
  function clearTiles() { for (const i of [...G.tiles.keys()]) removeTile(i); }

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
    const color = updateFeint(t, G.clock - t.born);
    if (color === "red") return touchRed(i, x, y);
    const feint = t.kind === "turn" || t.kind === "trap" || t.kind === "blink";
    G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.greens++;
    const before = multiplier();
    G.score += multiplier() * (feint ? 2 : 1);
    if (t.kind === "gold") { G.coins += 5; G.score += 2 * multiplier(); }
    Audio.hit(G.combo, t.kind === "gold" || feint);
    burst(x, y, color === "gold" ? cssVar("--gold") : cssVar("--green"), S.equipped.fx, t.kind === "gold" || feint);
    removeTile(i, "hit");
    bump();
    if (G.greens % G.M.greensPerLevel === 0) levelUp();
    else if (multiplier() > before) banner(`Bouclier x${multiplier()}`, `Combo ${G.combo}`);
    renderHud();
  }
  boardEl.addEventListener("pointerdown", onTap);

  function levelUp() {
    G.level++;
    G.bpm = Math.min(MAX_BPM, Math.round(G.bpm) + G.M.bpmStep);
    Audio.sweep();
    if (G.M.grids && G.grid < G.M.grids.length - 1) {
      G.grid++;
      const [c, r] = G.M.grids[G.grid];
      clearTiles();
      setGrid(c, r, true);
      banner(`Grille ${c}×${r}`, `${Math.round(G.bpm)} BPM`);
    } else if (G.level === G.M.feint.from && G.M.feint.from > 1) banner("Fintes", "les cases mentent", true);
    else banner(G.bpm >= MAX_BPM ? "Tempo max" : `${Math.round(G.bpm)} BPM`, `Niveau ${G.level}`);
    renderHud();
  }

  function missGreen(i) {
    G.combo = 0;
    Audio.miss();
    try { navigator.vibrate && navigator.vibrate(40); } catch {}
    removeTile(i, "miss");
    if (G.M.lives) {
      G.lives--;
      renderHud();
      if (G.lives <= 0) end("Trop lent", G.M.lives === 1 ? "Une case verte ratée" : `${G.M.lives} cases vertes ratées`);
    } else renderHud();
  }

  function glitch() {
    if (reduceMotion) return;
    screens.play.classList.remove("glitching"); void screens.play.offsetWidth; screens.play.classList.add("glitching");
  }
  function flash() { const f = $("#flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }

  function touchRed(i, x, y) {
    burst(x, y, cssVar("--red"), "eclats", true);
    if (G.M.redPenalty) {
      G.timeLeft -= G.M.redPenalty * 1000; G.combo = 0;
      Audio.miss();
      try { navigator.vibrate && navigator.vibrate(60); } catch {}
      flash(); glitch(); removeTile(i, "miss");
      banner(`−${G.M.redPenalty} s`, "rouge touché", true);
      renderHud();
      if (G.timeLeft <= 0) end("Temps écoulé", null);
      return;
    }
    const t = G.tiles.get(i); if (t) t.el.classList.add("hit");
    end("Rouge touché", null);
  }

  function end(title, sub) {
    G.running = false; G.over = true;
    const fail = title !== "Temps écoulé";
    Music.tapeStop();
    if (fail) {
      Audio.fail();
      try { navigator.vibrate && navigator.vibrate([80, 40, 120]); } catch {}
      flash(); glitch();
    } else Audio.ui();
    setTimeout(() => showOver(title, sub), fail ? 750 : 400);
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

  function showOver(title, sub) {
    const earned = Math.floor(G.score / 5) + G.coins;
    const prev = S.bests[G.mode] || 0, isBest = G.score > prev;
    S.coins += earned; S.games++;
    if (isBest) S.bests[G.mode] = G.score;
    save();
    $("#over-mode").textContent = G.M.name;
    const tt = $("#over-title");
    tt.textContent = title; tt.dataset.text = title;
    tt.style.color = title === "Temps écoulé" ? "var(--gold)" : "";
    $("#over-sub").textContent = sub || `Niveau ${G.level} atteint`;
    $("#over-coins").textContent = "+" + earned;
    $("#over-combo").textContent = G.maxCombo;
    $("#over-bpm").textContent = Math.round(G.bpmNow);
    $("#over-best").hidden = !isBest || G.score === 0;
    const form = $("#name-form"), input = $("#name-input");
    form.hidden = G.score === 0;
    form.dataset.saved = "";
    input.value = S.name;
    clearTiles();
    bindAll();
    show("over");
    countUp($("#over-score"), G.score);
    // Auto-save under the last pseudo, so a quick "Rejouer" still records the score.
    if (S.name && G.score > 0) recordScore(S.name);
  }

  function recordScore(name) {
    const form = $("#name-form");
    if (form.dataset.saved) {
      const prev = S.scores.find((s) => s.date === +form.dataset.saved);
      if (prev) prev.name = name;
    } else {
      const entry = { name, score: G.score, level: G.level, mode: G.mode, date: Date.now() };
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
    recordScore(name);
    $("#name-input").blur();
    toast("Score enregistré");
  });

  // ---------- loop ----------
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - lastFrame); lastFrame = now;
    if (G && G.running && !G.paused) tick(dt);
    if (!reduceMotion) drawRain(dt);
    if (parts.length || canvas.dataset.dirty) { drawFx(dt); canvas.dataset.dirty = parts.length ? "1" : ""; }
    if (!screens.menu.hidden) demoTick(now);
    requestAnimationFrame(frame);
  }
  function onBeat() {
    if (!Music.playing) Audio.beat(G.beatN, spb(), G.level);
    const n = spawnsThisBeat();
    for (let k = 0; k < n; k++) spawn();
    G.beatN++;
    if (!reduceMotion) { boardEl.classList.add("pulse"); setTimeout(() => boardEl.classList.remove("pulse"), 90); }
  }
  function tick(dt) {
    G.clock += dt;
    // Glide toward the target tempo; the music speeds up with it.
    G.bpm = Math.min(MAX_BPM, G.bpm + CREEP * dt / 1000);
    if (G.bpmNow < G.bpm) {
      G.bpmNow = Math.min(G.bpm, G.bpmNow + GLIDE * dt / 1000);
      if (Math.abs(G.bpmNow - (G.rateBpm || 0)) >= 0.2) { G.rateBpm = G.bpmNow; Music.setBpm(G.bpmNow); }
      if (Math.round(G.bpmNow) !== G.bpmShown) {
        G.bpmShown = Math.round(G.bpmNow);
        bpmEl.textContent = G.bpmShown;
        $("#sweep").style.setProperty("--bar", (4 * spb()).toFixed(2) + "s");
      }
    }
    if (G.M.time) {
      G.timeLeft -= dt;
      // Chrono speeds up with time as well as with greens.
      const lvl = 1 + Math.floor((G.M.time * 1000 - G.timeLeft) / 8000);
      while (G.level < lvl) levelUp();
      renderEnergy();
      if (G.timeLeft <= 0) { G.timeLeft = 0; renderEnergy(); return end("Temps écoulé", null); }
    }
    if (Music.playing) {
      // The music decides when a beat lands: faster playback = faster beats.
      const b = Music.beat();
      if (b) {
        if (b.key !== Music.lastKey) { Music.lastKey = b.key; onBeat(); }
        G.phase = b.phase;
      }
    } else {
      if (G.clock >= G.nextBeat) { G.lastBeat = G.nextBeat; G.nextBeat += spb() * 1000; onBeat(); }
      G.phase = (G.clock - G.lastBeat) / (spb() * 1000);
    }
    beatEl.style.transform = `scaleX(${1 - G.phase})`;
    for (const [i, t] of G.tiles) {
      const age = G.clock - t.born, p = age / t.life;
      const color = updateFeint(t, age);
      if (p >= 1) {
        // Only a tile that ends green counts as missed.
        if (color === "red") removeTile(i, "miss");
        else { missGreen(i); if (!G.running) break; }
      } else t.timer.style.transform = `scaleX(${1 - p})`;
    }
  }
  requestAnimationFrame(frame);

  function startGame() {
    Audio.init(); Audio.setOn(S.sound);
    Music.init();
    Music.stop();
    // Unlock the track inside the tap itself (iOS only lets media start from a gesture).
    if (Music.el) { const a = Music.el; a.muted = true; a.play().then(() => { if (!Music.playing) a.pause(); a.muted = !S.sound; }).catch(() => {}); }
    newGame();
    show("play");
    sizeCanvases();
    countdown(async () => {
      await Music.start(G.bpmNow);
      G.running = true; G.nextBeat = G.clock;
    });
  }
  let countdownTimer = 0;
  function countdown(done) {
    const c = $("#countdown"); let n = 3;
    clearInterval(countdownTimer);
    const showN = (v) => {
      c.innerHTML = `<div class="ring"><svg viewBox="0 0 160 160"><polygon points="80,6 144,43 144,117 80,154 16,117 16,43"/></svg><span></span></div>`;
      c.querySelector("span").textContent = v;
      Audio.ui();
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
    G.paused = true; $("#paused").hidden = false;
    initFrames(screens.play); redrawFrames($("#paused"));
    Music.pause();
    if (Audio.ctx) Audio.ctx.suspend();
  }
  function resume() {
    $("#paused").hidden = true;
    if (Audio.ctx) Audio.ctx.resume();
    countdown(() => { G.paused = false; Music.resume(); });
  }
  function quit() {
    $("#paused").hidden = true; G.running = false;
    Music.stop();
    if (Audio.ctx) Audio.ctx.resume();
    clearTiles();
    show("menu");
  }
  $("#btn-pause").onclick = pause;
  $("#btn-resume").onclick = resume;
  $("#btn-quit").onclick = quit;
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  // Hooks for the Android wrapper: system Back and app going to background.
  window.__pause = pause;
  window.__debug = () => ({ music: Music.playing, rate: Music.el && Music.el.playbackRate, t: Music.el && Music.el.currentTime, bpm: G && G.bpm, cells: cells.length });
  window.__back = () => {
    if (!screens.play.hidden) {
      if (G && G.running && !G.paused) { pause(); return true; }
      if (G && G.paused) { quit(); return true; }
      return true;
    }
    if (!screens.menu.hidden) return false;
    show("menu"); return true;
  };

  $("#btn-play").onclick = startGame;
  $("#btn-again").onclick = startGame;
  $("#btn-shop").onclick = () => show("shop");
  $("#btn-over-shop").onclick = () => show("shop");
  $("#btn-board").onclick = () => { rankMode = S.mode; show("ranking"); };
  $("#btn-over-menu").onclick = () => show("menu");

  // ---------- menu ----------
  function renderMenu() { bindAll(); renderSoundBtn(); renderModes(); }
  function renderModes() {
    const box = $("#modes"); box.innerHTML = "";
    for (const id of MODE_IDS) {
      const m = MODES[id], b = document.createElement("button");
      b.className = "mode"; b.dataset.frame = "sm";
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", id === S.mode);
      b.innerHTML = `<b></b><span></span><em></em>`;
      b.querySelector("b").textContent = m.name;
      b.querySelector("span").textContent = m.rule;
      b.querySelector("em").textContent = `Record ${S.bests[id] || 0}`;
      b.onclick = () => {
        S.mode = id; save(); Audio.init(); Audio.ui();
        box.querySelectorAll(".mode").forEach((x) => x.setAttribute("aria-checked", x === b));
      };
      box.appendChild(b);
    }
    initFrames(box);
  }
  // Menu backdrop: a 5×4 board that plays itself, feints included.
  const demo = $("#demo"), demoCells = [];
  for (let i = 0; i < 20; i++) { const c = document.createElement("i"); demo.appendChild(c); demoCells.push(c); }
  let demoNext = 0;
  function demoTick(now) {
    if (now < demoNext) return;
    demoNext = now + 300; // 100 BPM eighth notes
    const c = demoCells[(Math.random() * demoCells.length) | 0];
    const r = Math.random();
    c.className = r < 0.5 ? "g" : r < 0.8 ? "r" : "";
    if (c.className === "g" && Math.random() < 0.3) setTimeout(() => { c.className = "r"; }, 450);
  }

  // ---------- shop ----------
  let shopCat = "skin";
  document.querySelectorAll("#shop-tabs .tab").forEach((t) => (t.onclick = () => {
    shopCat = t.dataset.cat;
    document.querySelectorAll("#shop-tabs .tab").forEach((x) => x.setAttribute("aria-selected", x === t));
    renderShop();
  }));
  function preview(cat, item) {
    const p = document.createElement("div");
    if (cat === "skin") {
      const [bg, holo, g, r] = item.colors;
      p.className = "preview"; p.style.background = bg; p.style.boxShadow = `inset 0 0 0 1px ${holo}`;
      [g, r, g].forEach((c) => { const s = document.createElement("span"); s.style.background = c; p.appendChild(s); });
    } else if (cat === "shape") {
      p.className = "preview preview-shape";
      const s = document.createElement("span");
      const shapes = {
        carre: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)", cercle: "circle(50%)",
        losange: "polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)",
        hexa: "polygon(25% 4%, 75% 4%, 98% 50%, 75% 96%, 25% 96%, 2% 50%)",
        etoile: "polygon(50% 0, 63% 32%, 98% 35%, 71% 58%, 80% 94%, 50% 75%, 20% 94%, 29% 58%, 2% 35%, 37% 32%)",
      };
      s.style.clipPath = shapes[item.id]; p.appendChild(s);
    } else {
      p.className = "preview preview-shape";
      const s = document.createElement("span"); p.appendChild(s);
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
      b.dataset.frame = "sm";
      b.appendChild(preview(shopCat, item));
      const n = document.createElement("span"); n.className = "name"; n.textContent = item.name; b.appendChild(n);
      const st = document.createElement("span"); st.className = "state";
      if (on) st.textContent = "Équipé";
      else if (owned) st.textContent = "Équiper";
      else st.innerHTML = `<span class="coin"></span>${item.price}`;
      b.appendChild(st);
      b.onclick = () => {
        Audio.init();
        if (!owned) {
          if (S.coins < item.price) return toast(`Il te manque ${item.price - S.coins} crédits`);
          S.coins -= item.price; S.owned[shopCat].push(item.id); toast(`${item.name} débloqué`);
        }
        S.equipped[shopCat] = item.id; save(); applyLook(); Audio.ui();
        if (shopCat === "fx") {
          const a = app.getBoundingClientRect(), r = b.getBoundingClientRect();
          burst(r.left - a.left + r.width / 2, r.top - a.top + r.height / 3, cssVar("--green"), item.id);
        }
        renderShop();
      };
      list.appendChild(b);
    }
    initFrames(list);
  }

  // ---------- leaderboard ----------
  let rankMode = S.mode;
  function renderBoard() {
    const tabs = $("#rank-tabs"); tabs.innerHTML = "";
    for (const id of MODE_IDS) {
      const t = document.createElement("button");
      t.className = "tab"; t.setAttribute("role", "tab"); t.setAttribute("aria-selected", id === rankMode);
      t.textContent = MODES[id].name;
      t.onclick = () => { rankMode = id; renderBoard(); };
      tabs.appendChild(t);
    }
    const ol = $("#board-list"); ol.innerHTML = "";
    const rows = S.scores.filter((s) => s.mode === rankMode).slice(0, 10);
    if (!rows.length) {
      const li = document.createElement("li"); li.className = "empty";
      li.textContent = `Aucun score en ${MODES[rankMode].name} pour l'instant. Termine une partie et enregistre ton pseudo pour entrer au classement.`;
      ol.appendChild(li); return;
    }
    rows.forEach((s, k) => {
      const li = document.createElement("li");
      if (s.name === S.name) li.className = "me";
      const d = new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      li.innerHTML = `<span class="rank">${k + 1}</span><span class="who"></span><span class="pts">${s.score}</span>`;
      li.querySelector(".who").textContent = s.name;
      const sm = document.createElement("small"); sm.textContent = `Niveau ${s.level} · ${d}`;
      li.querySelector(".who").appendChild(sm);
      if (!reduceMotion) li.style.animation = `boot .4s ${k * 40}ms both`;
      ol.appendChild(li);
    });
  }

  // ---------- boot ----------
  applyLook();
  setGrid(...DEFAULT_GRID, false);
  sizeCanvases();
  show("menu");
})();
