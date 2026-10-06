// Game data: modes, shop, missions, ranks, music tracks. Loaded first; everything hangs off window.NT.
window.NT = window.NT || {};
(() => {
  "use strict";

  // Music tracks. bpm/offset were measured on the file; "synth" is generated live at any tempo.
  const TRACKS = {
    sync: { name: "Sync or Die", src: "audio/sync-or-die.mp3", bpm: 100, offset: 0.055 },
    synth: { name: "Synthé", src: null },
    // Two more tracks, unlocked in the shop. bpm/offset measured on the files (strong beats).
    scar: { name: "Every Scar A Shield", src: "audio/every-scar-a-shield.mp3", bpm: 68, offset: 0.084 },
    velvet: { name: "The Velvet Hour", src: "audio/the-velvet-hour.mp3", bpm: 95, offset: 0.14 },
  };
  // Menu music: the original file, played as is (normal speed, untouched).
  const MENU_TRACK = "audio/sync-or-die-original.mp3";

  // Each mode tunes the same engine. Levels raise the tempo; the tempo is the music's playback speed.
  // feint: chance that a tile is a feint (turn / trap / blink), from a given level.
  // specials: blue / violet / black tiles from level 3. boss: a 15 s storm every 5 levels.
  const MODES = {
    classic: {
      name: "Classique", rule: "3 vies, ça accélère vite",
      lives: 3, startBpm: 72, bpmStep: 9, greensPerLevel: 8,
      feint: { from: 2, base: 0.06, step: 0.04, max: 0.32 }, specials: true, boss: true,
    },
    chrono: {
      name: "Chrono", rule: "60 s pour marquer, rouge = −5 s",
      lives: 0, time: 60, redPenalty: 5, startBpm: 80, bpmStep: 12, greensPerLevel: 7,
      feint: { from: 1, base: 0.12, step: 0.03, max: 0.3 }, specials: true,
    },
    sudden: {
      name: "Mort subite", rule: "1 seule vie, départ rapide",
      lives: 1, startBpm: 95, bpmStep: 10, greensPerLevel: 8,
      feint: { from: 1, base: 0.15, step: 0.04, max: 0.35 }, specials: true, boss: true,
    },
    feint: {
      name: "Fintes", rule: "Les cases changent de couleur",
      lives: 3, startBpm: 72, bpmStep: 8, greensPerLevel: 8,
      feint: { from: 1, base: 0.55, step: 0.04, max: 0.8 }, specials: true, boss: true,
    },
    expansion: {
      name: "Expansion", rule: "La grille s'agrandit à chaque palier",
      lives: 3, startBpm: 72, bpmStep: 8, greensPerLevel: 6,
      feint: { from: 4, base: 0.08, step: 0.03, max: 0.3 }, specials: true,
      grids: [[2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [4, 6], [5, 6], [5, 7], [6, 7], [6, 8], [7, 9]],
    },
    rhythm: {
      name: "Rythme", rule: "Touche quand l'anneau se referme",
      lives: 3, startBpm: 80, bpmStep: 6, greensPerLevel: 10, rhythm: true,
      feint: { from: 99, base: 0, step: 0, max: 0 },
    },
    mirror: {
      name: "Miroir", rule: "La couleur à toucher s'inverse tous les 16 temps",
      lives: 3, startBpm: 76, bpmStep: 8, greensPerLevel: 8, mirror: true,
      feint: { from: 99, base: 0, step: 0, max: 0 },
    },
    // Not shown in the mode list: same rules as Classique, but every spawn comes from a seed.
    daily: {
      name: "Défi du jour", rule: "La même partie pour tout le monde aujourd'hui", hidden: true, seeded: true,
      lives: 3, startBpm: 72, bpmStep: 9, greensPerLevel: 8,
      feint: { from: 2, base: 0.06, step: 0.04, max: 0.32 }, specials: true, boss: true,
    },
    duel: {
      name: "Duel", rule: "La même partie que ton adversaire", hidden: true, seeded: true,
      lives: 3, startBpm: 72, bpmStep: 9, greensPerLevel: 8,
      feint: { from: 2, base: 0.06, step: 0.04, max: 0.32 }, specials: true, boss: true,
    },
  };

  // req (optional) = condition to meet before buying, on top of the price:
  //   rank: "Pilote" · games: 30 (games played) · best: { mode, score } · combo: 40 (best combo)
  //   bosses: 3 (bosses beaten) · missions: 15 (missions completed)
  const CATALOG = {
    skin: [
      { id: "minuit", name: "Holo",    price: 0,    colors: ["#040a11", "#36c9ff", "#2bff8a", "#ff2d55"] },
      { id: "craie",  name: "Matrice", price: 250,  colors: ["#06100c", "#7dffb3", "#e8ff5a", "#ff3d3d"] },
      { id: "neon",   name: "Néon",    price: 400,  colors: ["#090414", "#c45cff", "#39ff9f", "#ff2e88"] },
      { id: "ocean",  name: "Océan",   price: 600,  colors: ["#020d14", "#4ef0e0", "#7dff6a", "#ff5d73"] },
      { id: "lave",   name: "Lave",    price: 800,  colors: ["#120604", "#ff7a3c", "#b8f25c", "#ff2f4f"] },
      { id: "sakura", name: "Sakura",  price: 900,  colors: ["#12060c", "#ff8fc7", "#7dffb0", "#ff3b5c"], req: { games: 30 } },
      { id: "glace",  name: "Glace",   price: 1000, colors: ["#04101a", "#a8e6ff", "#6dffd8", "#ff5577"], req: { best: { mode: "chrono", score: 80 } } },
      { id: "shadow", name: "Chrome",  price: 1200, colors: ["#08090a", "#e8edf2", "#4be38a", "#f2424f"] },
      { id: "vapeur", name: "Vapeur",  price: 1400, colors: ["#10041a", "#ff6ad5", "#00f5d4", "#ff3366"], req: { missions: 15 } },
      { id: "or",     name: "Or",      price: 2000, colors: ["#0e0a02", "#ffd25a", "#8dff6a", "#ff4040"], req: { rank: "Élite" } },
    ],
    fx: [
      { id: "eclats",   name: "Éclats",    price: 0 },
      { id: "confetti", name: "Confettis", price: 200 },
      { id: "onde",     name: "Onde",      price: 350 },
      { id: "pixels",   name: "Pixels",    price: 500 },
      { id: "spirale",  name: "Spirale",   price: 600 },
      { id: "etoiles",  name: "Étoiles",   price: 700,  req: { rank: "Pilote" } },
      { id: "eclair",   name: "Éclair",    price: 900 },
      { id: "flammes",  name: "Flammes",   price: 1000, req: { combo: 40 } },
      { id: "glitch",   name: "Glitch",    price: 1200, req: { best: { mode: "sudden", score: 60 } } },
      { id: "nova",     name: "Nova",      price: 1800, req: { bosses: 3 } },
    ],
    shape: [
      { id: "carre",    name: "Biseau",   price: 0 },
      { id: "cercle",   name: "Cercle",   price: 150 },
      { id: "losange",  name: "Losange",  price: 300 },
      { id: "hexa",     name: "Hexagone", price: 450 },
      { id: "triangle", name: "Triangle", price: 550 },
      { id: "etoile",   name: "Étoile",   price: 700 },
      { id: "octo",     name: "Octogone", price: 800,  req: { games: 20 } },
      { id: "bouclier", name: "Bouclier", price: 1100, req: { rank: "Vétéran" } },
    ],
    // Music: ids are TRACKS keys. Bought here, picked here or in Réglages.
    music: [
      { id: "sync",  name: "Sync or Die", price: 0 },
      { id: "synth", name: "Synthé",      price: 0 },
      { id: "scar",   name: "Every Scar A Shield", price: 500 },
      { id: "velvet", name: "The Velvet Hour",     price: 700, req: { rank: "Cadet" } },
    ],
  };

  // Career points (sum of all scores) unlock ranks.
  const RANKS = [
    { xp: 0, name: "Recrue" }, { xp: 300, name: "Cadet" }, { xp: 1000, name: "Pilote" },
    { xp: 2500, name: "Vétéran" }, { xp: 5000, name: "Élite" }, { xp: 10000, name: "Spectre" },
    { xp: 20000, name: "Légende" },
  ];

  // Three missions are drawn each day. "max" = best value in one run, "sum" = adds up over the day.
  // stat names are fields of the run summary built at the end of a game.
  const MISSIONS = [
    { id: "feintStreak", text: "Réussis 3 fintes d'affilée", stat: "maxFeintStreak", goal: 3, type: "max", reward: 60 },
    { id: "combo30", text: "Fais un combo de 30", stat: "maxCombo", goal: 30, type: "max", reward: 60 },
    { id: "bpm140", text: "Atteins 140 BPM", stat: "bpm", goal: 140, type: "max", reward: 80 },
    { id: "sudden40", text: "Marque 40 points en Mort subite", stat: "score", mode: "sudden", goal: 40, type: "max", reward: 80 },
    { id: "exp56", text: "Atteins la grille 5×6 en Expansion", stat: "gridCells", mode: "expansion", goal: 30, type: "max", reward: 80 },
    { id: "chrono60", text: "Marque 60 points en Chrono", stat: "score", mode: "chrono", goal: 60, type: "max", reward: 70 },
    { id: "games3", text: "Joue 3 parties", stat: "one", goal: 3, type: "sum", reward: 40 },
    { id: "gold8", text: "Touche 8 cases dorées", stat: "gold", goal: 8, type: "sum", reward: 50 },
    { id: "greens150", text: "Touche 150 cases vertes", stat: "greens", goal: 150, type: "sum", reward: 60 },
    { id: "perfect15", text: "Fais 15 « Parfait » en Rythme", stat: "perfects", goal: 15, type: "sum", reward: 70 },
    { id: "mirror3", text: "Survis à 3 inversions en Miroir", stat: "inversions", goal: 3, type: "max", reward: 70 },
    { id: "boss1", text: "Bats un boss", stat: "bosses", goal: 1, type: "sum", reward: 90 },
    { id: "special4", text: "Touche 4 cases spéciales", stat: "specials", goal: 4, type: "sum", reward: 50 },
    { id: "daily", text: "Joue le défi du jour", stat: "dailyPlayed", goal: 1, type: "sum", reward: 40 },
  ];

  NT.cfg = {
    TRACKS, MENU_TRACK, MODES, CATALOG, RANKS, MISSIONS,
    MODE_IDS: Object.keys(MODES).filter((id) => !MODES[id].hidden),
    DEFAULT_GRID: [4, 6],
    MAX_BPM: 200,   // = the track played at 2x
    GLIDE: 7,       // BPM per second: the tempo slides to its new value instead of jumping
    CREEP: 0.25,    // BPM per second added between levels, so the music never stops speeding up
    BOSS_MS: 15000,
    FREEZE_MS: 3000,
  };
})();
