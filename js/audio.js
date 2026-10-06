// Sound: the music track (which is also the game clock), the live synth (sound effects and the
// "Synthé" track), and haptics. Reads settings from NT.S, which game.js sets before anything plays.
(() => {
  "use strict";
  const { TRACKS } = NT.cfg;
  const S = () => NT.S;
  const native = () => window.NTPLRAndroid || null;

  // ---------- track player ----------
  const Music = {
    el: null, track: null, playing: false, failed: {}, loops: 0, lastT: 0,

    available(id) { return !!TRACKS[id].src && !this.failed[id]; },
    load(id) {
      const tr = TRACKS[id];
      if (!tr.src || this.failed[id]) { this.track = null; return; }
      if (this.track === tr && this.el) return;
      if (this.el) this.el.pause();
      const a = new window.Audio();
      a.src = tr.src; a.loop = true; a.preload = "auto";
      a.addEventListener("error", () => { this.failed[id] = true; this.playing = false; });
      this.el = a; this.track = tr;
    },
    volume() { return S().sound ? S().musicVol : 0; },
    // Starts the selected track at the given tempo. Resolves false when only the synth can play.
    async start(id, bpm, fromStart = true) {
      this.load(id);
      if (!this.track) { this.playing = false; return false; }
      const a = this.el;
      a.volume = this.volume(); a.muted = !S().sound;
      a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = true;
      a.playbackRate = Math.min(2, bpm / this.track.bpm);
      if (fromStart) { try { a.currentTime = 0; } catch {} this.loops = 0; this.lastT = 0; }
      try { await a.play(); this.playing = true; } catch { this.playing = false; }
      return this.playing;
    },
    // Unlocks media playback inside a tap (iOS lets media start only from a gesture).
    unlock(id) {
      this.load(id);
      if (!this.el) return;
      const a = this.el; a.muted = true;
      a.play().then(() => { if (!this.playing) a.pause(); a.muted = !S().sound; }).catch(() => {});
    },
    setBpm(bpm) { if (this.el && this.track) this.el.playbackRate = Math.max(0.5, Math.min(2, bpm / this.track.bpm)); },
    // Continuous beat position heard by the player. latency (s) is the calibrated output delay.
    pos(latency) {
      const a = this.el, t = a.currentTime;
      if (t + 1 < this.lastT) this.loops++;
      this.lastT = t;
      return { pos: (t - this.track.offset - latency * a.playbackRate) * this.track.bpm / 60, loop: this.loops };
    },
    pause() { if (this.el && this.playing) this.el.pause(); },
    resume() { if (this.el && this.playing) this.el.play().catch(() => {}); },
    stop() { if (this.el) this.el.pause(); this.playing = false; },
    applyVolume() { if (this.el) { this.el.volume = this.volume(); this.el.muted = !S().sound; } },
    // Tape-stop: the track slows down and drops in pitch, then stops.
    tapeStop() {
      if (!this.el || !this.playing) return;
      const a = this.el, r0 = a.playbackRate, v0 = a.volume, t0 = performance.now();
      a.preservesPitch = a.webkitPreservesPitch = false;
      this.playing = false;
      const step = () => {
        const k = (performance.now() - t0) / 700;
        if (k >= 1) { a.pause(); return; }
        a.playbackRate = Math.max(0.25, r0 * (1 - k));
        a.volume = v0 * (1 - k);
        requestAnimationFrame(step);
      };
      step();
    },
  };

  // ---------- menu music: the original track, looped at normal speed ----------
  const MenuMusic = {
    el: null, on: false, fade: 0,
    play() {
      this.on = true;
      if (!this.el) {
        const a = new window.Audio();
        a.src = NT.cfg.MENU_TRACK; a.loop = true; a.preload = "auto";
        this.el = a;
      }
      const a = this.el;
      clearInterval(this.fade);
      a.volume = S().musicVol;
      if (a.paused) a.play().catch(() => {}); // refused until the first tap: retried then
    },
    // Fades out over 300 ms, then pauses where it was.
    stop() {
      this.on = false;
      const a = this.el;
      clearInterval(this.fade);
      if (!a || a.paused) return;
      const v0 = a.volume; let k = 0;
      this.fade = setInterval(() => {
        k += 0.1; a.volume = Math.max(0, v0 * (1 - k));
        if (k >= 1) { clearInterval(this.fade); a.pause(); }
      }, 30);
    },
    suspend() { clearInterval(this.fade); if (this.el) this.el.pause(); },
    applyVolume() { if (this.el && this.on) this.el.volume = S().musicVol; },
  };

  // ---------- synth ----------
  const Synth = {
    ctx: null, sfx: null, bus: null,
    init() {
      if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.ctx.destination);
      this.bus = this.ctx.createGain(); this.bus.connect(this.ctx.destination);
      this.applyVolume();
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    applyVolume() {
      if (!this.ctx) return;
      const on = S().sound ? 1 : 0, now = this.ctx.currentTime;
      this.sfx.gain.setTargetAtTime(0.5 * S().sfxVol * on, now, 0.02);
      this.bus.gain.setTargetAtTime(0.7 * S().musicVol * on, now, 0.02);
    },
    suspend() { if (this.ctx) this.ctx.suspend(); },
    resume() { if (this.ctx) this.ctx.resume(); },
    t(offset = 0) { return this.ctx.currentTime + 0.01 + offset; },
    kick(at, out) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
      g.gain.setValueAtTime(0.9, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      o.connect(g).connect(out); o.start(at); o.stop(at + 0.22);
    },
    hat(at, vol, out) {
      const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      s.buffer = this.noise; f.type = "highpass"; f.frequency.value = 7000;
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
      s.connect(f).connect(g).connect(out); s.start(at); s.stop(at + 0.06);
    },
    snare(at, out, vol = 0.35) {
      const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      s.buffer = this.noise; f.type = "bandpass"; f.frequency.value = 1800;
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      s.connect(f).connect(g).connect(out); s.start(at); s.stop(at + 0.15);
    },
    tone(freq, at, dur, type, vol, out) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(out); o.start(at); o.stop(at + dur + 0.02);
    },
    // "Synthé" track: one call per beat. A minor, Am F C G, one chord per bar.
    BASS: [110, 87.31, 130.81, 98],
    ARP: [[440, 523.25, 659.25], [349.23, 440, 523.25], [523.25, 659.25, 783.99], [392, 493.88, 587.33]],
    beat(n, spb, level) {
      if (!this.ctx) return;
      const out = this.bus, at = this.t(), inBar = n % 4, bar = Math.floor(n / 4) % 4, root = this.BASS[bar];
      this.kick(at, out);
      if (inBar === 1 || inBar === 3) this.snare(at, out);
      this.hat(at + spb / 2, 0.16, out);
      if (level >= 3) { this.hat(at + spb / 4, 0.07, out); this.hat(at + (3 * spb) / 4, 0.07, out); }
      this.tone(root, at, spb * 0.9, "sawtooth", 0.08, out);
      if (level >= 2) this.tone(this.ARP[bar][n % 3], at + spb / 2, spb * 0.4, "square", 0.035, out);
    },
    click(at, accent) { if (this.ctx) this.tone(accent ? 1760 : 1320, at, 0.05, "square", 0.12, this.sfx); },
    PENTA: [440, 523.25, 587.33, 659.25, 783.99],
    hit(combo, special) {
      if (!this.ctx) return;
      const i = combo % 10, f = this.PENTA[i % 5] * (i >= 5 ? 2 : 1);
      this.tone(f, this.t(), 0.14, "triangle", 0.14, this.sfx);
      if (special) this.tone(f * 1.5, this.t(0.05), 0.2, "sine", 0.12, this.sfx);
    },
    perfect() { if (this.ctx) { this.tone(1046.5, this.t(), 0.1, "sine", 0.12, this.sfx); this.tone(1568, this.t(0.05), 0.16, "sine", 0.1, this.sfx); } },
    miss() { if (this.ctx) this.tone(180, this.t(), 0.25, "square", 0.1, this.sfx); },
    fail() {
      if (!this.ctx) return;
      const at = this.t(), o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(320, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.7);
      g.gain.setValueAtTime(0.3, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.75);
      o.connect(g).connect(this.sfx); o.start(at); o.stop(at + 0.8);
      this.snare(at, this.sfx);
    },
    ui() { if (this.ctx) this.tone(880, this.t(), 0.06, "square", 0.05, this.sfx); },
    riser() {
      if (!this.ctx) return;
      const at = this.t(), o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(220, at); o.frequency.exponentialRampToValueAtTime(1320, at + 0.35);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.08, at + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      o.connect(g).connect(this.sfx); o.start(at); o.stop(at + 0.42);
    },
    alarm() { // boss incoming
      if (!this.ctx) return;
      for (let k = 0; k < 3; k++) this.tone(k % 2 ? 660 : 880, this.t(k * 0.16), 0.14, "square", 0.08, this.sfx);
    },
    freeze() { if (this.ctx) { this.tone(1975, this.t(), 0.5, "sine", 0.08, this.sfx); this.tone(2637, this.t(0.08), 0.5, "sine", 0.06, this.sfx); } },
    purge() { if (this.ctx) { this.snare(this.t(), this.sfx, 0.5); this.tone(110, this.t(), 0.4, "sawtooth", 0.12, this.sfx); } },
  };

  // ---------- haptics ----------
  const PATTERNS = {
    hit: [8], feint: [16], special: [10, 30, 10], miss: [40], red: [80, 40, 120],
    level: [20, 40, 20, 40, 20], boss: [60, 30, 60, 30, 60], perfect: [12], ui: [6],
  };
  function haptic(name) {
    if (!S().vibration) return;
    const p = PATTERNS[name] || [10];
    try {
      const n = native();
      if (n && n.vibrate) n.vibrate(JSON.stringify(p));
      else if (navigator.vibrate) navigator.vibrate(p);
    } catch {}
  }

  NT.Music = Music;
  NT.MenuMusic = MenuMusic;
  NT.Synth = Synth;
  NT.haptic = haptic;
  NT.native = native;
})();
