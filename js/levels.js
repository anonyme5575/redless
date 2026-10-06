// Campaign: 200 levels in 20 worlds of 10. Each level has its own colour theme (generated from
// a hue), a mode, a difficulty that rises with the number, and 3 quests: the first one (score)
// clears the level, the two others are bonuses. Three quests done = the level's theme is unlocked
// in the shop. Everything is computed from the level number, so nothing is stored but progress.
(() => {
  "use strict";
  const { MODES } = NT.cfg;

  // ---------- colour themes from a hue (levels and some shop themes) ----------
  // Green stays green and red stays red whatever the hue: they are the rules of the game.
  function themeVars(h, s = 85) {
    h = ((Math.round(h) % 360) + 360) % 360;
    const nearGreen = h > 105 && h < 175, nearRed = h > 330 || h < 15;
    return {
      "--bg": `hsl(${h} 50% 5%)`,
      "--panel": `hsl(${h} 55% 13% / .62)`,
      "--holo": `hsl(${h} ${s}% 64%)`,
      "--holo-dim": `hsl(${h} ${s}% 64% / .16)`,
      "--glow": `hsl(${h} ${s}% 64% / .55)`,
      "--ink": `hsl(${h} 70% 95%)`,
      "--muted": `hsl(${h} 20% 66%)`,
      "--green": nearGreen ? "hsl(95 95% 58%)" : "hsl(145 95% 55%)",
      "--red": nearRed ? "hsl(358 100% 62%)" : "hsl(350 95% 60%)",
      "--warn": "#ffb347",
      "--cell": `hsl(${h} ${s}% 64% / .05)`,
    };
  }
  // Four swatches for the shop preview: background, frame, green, red.
  function themeColors(h, s) { const v = themeVars(h, s); return [v["--bg"], v["--holo"], v["--green"], v["--red"]]; }

  // ---------- worlds ----------
  const MODE_CYCLE = ["classic", "chrono", "feint", "sudden", "expansion", "rhythm", "mirror"];
  const WORLDS = [
    ["Néo-Tokyo", 195], ["Désert de verre", 38], ["Forêt binaire", 140], ["Abysse", 220], ["Station orbitale", 175],
    ["Volcan", 15], ["Cité engloutie", 190], ["Glacier quantique", 200], ["Jungle néon", 110], ["Ruines solaires", 45],
    ["Tempête ionique", 255], ["Récif corail", 5], ["Métropole pourpre", 285], ["Toundra", 210], ["Nébuleuse", 300],
    ["Canyon rouge", 20], ["Laboratoire", 165], ["Archipel", 185], ["Citadelle", 270], ["Le Cœur", 330],
  ].map(([name, hue], w) => ({ name, hue, mode: MODE_CYCLE[w % MODE_CYCLE.length] }));
  const STEPS = ["Aube", "Écho", "Pulse", "Prisme", "Orage", "Spectre", "Vortex", "Nova", "Zénith", "Apex"];
  const COUNT = WORLDS.length * 10;

  // ---------- quests ----------
  // stat = field of the run summary (best value in one run). ok = can this quest exist here.
  const plural = (n, one, many) => (n > 1 ? many : one);
  const POOL = [
    { id: "combo", stat: "maxCombo", goal: (i) => 8 + Math.floor(i * 0.15), text: (g) => `Fais un combo de ${g}` },
    { id: "greens", stat: "greens", goal: (i) => 15 + Math.floor(i / 2), text: (g) => `Touche ${g} cases à toucher` },
    { id: "level", stat: "level", goal: (i) => 3 + Math.floor(i / 30), text: (g) => `Atteins le palier ${g}` },
    { id: "gold", stat: "gold", goal: (i) => 1 + Math.floor(i / 45), text: (g) => `Touche ${g} ${plural(g, "case dorée", "cases dorées")}`, ok: (m) => !m.rhythm && !m.mirror },
    { id: "time", stat: "seconds", goal: (i) => 30 + Math.floor(i * 0.4), text: (g) => `Tiens ${g} secondes`, ok: (m) => !m.time },
    { id: "feints", stat: "maxFeintStreak", goal: (i) => 2 + Math.floor(i / 60), text: (g) => `Réussis ${g} fintes d'affilée`, ok: (m) => m.feint.max > 0 && m.feint.from < 4 },
    { id: "special", stat: "specials", goal: (i) => 1 + Math.floor(i / 90), text: (g) => `Touche ${g} ${plural(g, "case spéciale", "cases spéciales")}`, ok: (m) => m.specials },
    { id: "perfect", stat: "perfects", goal: (i) => 5 + Math.floor(i / 12), text: (g) => `Fais ${g} « Parfait »`, ok: (m) => m.rhythm },
    { id: "invert", stat: "inversions", goal: (i) => 1 + Math.floor(i / 70), text: (g) => `Survis à ${g} ${plural(g, "inversion", "inversions")}`, ok: (m) => m.mirror },
    { id: "boss", stat: "bosses", goal: () => 1, text: () => "Bats un boss", ok: (m, i) => m.boss && i >= 20 },
    { id: "bpm", stat: "bpm", goal: (i, lv) => lv.startBpm + 20 + Math.floor(i / 10), text: (g) => `Atteins ${g} BPM` },
  ];
  const SCORE_BASE = { classic: 25, chrono: 35, feint: 22, sudden: 18, expansion: 28, rhythm: 22, mirror: 22 };

  function rng(seed) {
    let a = seed * 2654435761 >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const cache = {};
  // Level n (1..200): everything the game needs to play it and to judge it.
  function get(n) {
    if (cache[n]) return cache[n];
    const w = Math.floor((n - 1) / 10), j = (n - 1) % 10, world = WORLDS[w], t = (n - 1) / (COUNT - 1);
    const mode = world.mode, base = MODES[mode];
    const hue = world.hue + (j - 4.5) * 7, sat = j % 2 ? 78 : 92;
    const lv = {
      n, world: w, step: j, name: `${world.name} · ${STEPS[j]}`, mode, hue, sat,
      // Difficulty grows with the number: from a bit easier than Normal to far beyond it.
      tune: { bpm: Math.round(-8 + 48 * t), step: 1 + 0.4 * t, feint: 1 + 0.8 * t, life: 1 - 0.3 * t, red: 0.08 * t, lives: 0 },
      startBpm: base.startBpm + Math.round(-8 + 48 * t),
      reward: 15 + Math.floor(n / 4),
    };
    const r = rng(n * 7919);
    const target = Math.round(SCORE_BASE[mode] * (1 + (n - 1) / 40));
    const quests = [{ id: "score", stat: "score", goal: target, text: `Marque ${target} points`, main: true }];
    const pool = POOL.filter((q) => !q.ok || q.ok(base, n));
    while (quests.length < 3 && pool.length) {
      const q = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const goal = q.goal(n, lv);
      quests.push({ id: q.id, stat: q.stat, goal, text: q.text(goal) });
    }
    lv.quests = quests;
    return (cache[n] = lv);
  }
  const questDone = (q, run) => (run[q.stat] || 0) >= q.goal;

  NT.levels = { COUNT, WORLDS, get, questDone, themeVars, themeColors };
})();
