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
    // 17 free tracks (CC0, OpenGameArt — authors in audio/CREDITS.md). Cut to ~2 min on a bar line,
    // bpm and offset measured on the final files (kick drum). Fast songs use half time (game range).
    welcome:   { name: "Welcome Mix",         src: "audio/welcome-mix.mp3",         bpm: 110, offset: 0.279 },
    aifight:   { name: "AI Fight",            src: "audio/ai-fight.mp3",            bpm: 120, offset: 0.032 },
    electric:  { name: "Electric Stream",     src: "audio/electric-stream.mp3",     bpm: 90,  offset: 0.025 },
    cyborg:    { name: "Jumping Cyborg",      src: "audio/jumping-cyborg.mp3",      bpm: 110, offset: 0.221 },
    factory:   { name: "New Factory",         src: "audio/new-factory.mp3",         bpm: 129, offset: 0.411 },
    nightclub: { name: "Night Club Chill",    src: "audio/night-club-chill.mp3",    bpm: 100, offset: 0.315 },
    strange:   { name: "Strange Experiments", src: "audio/strange-experiments.mp3", bpm: 80,  offset: 0.276 },
    overload:  { name: "System Overload",     src: "audio/system-overload.mp3",     bpm: 77,  offset: 0.218 },
    casino:    { name: "The Casino",          src: "audio/the-casino.mp3",          bpm: 80,  offset: 0.282 },
    sewers:    { name: "Through the Sewers",  src: "audio/through-the-sewers.mp3",  bpm: 88,  offset: 0.315 },
    beats:     { name: "Beats n Games",       src: "audio/beats-n-games.mp3",       bpm: 78,  offset: 0.219 },
    synthtype: { name: "Synthwave Type",      src: "audio/synthwave-type.mp3",      bpm: 85,  offset: 0.118 },
    house:     { name: "Synthwave House",     src: "audio/synthwave-house.mp3",     bpm: 114, offset: 0.035 },
    glitch:    { name: "Glitch Stairs",       src: "audio/glitch-stairs.mp3",       bpm: 100, offset: 0.226 },
    edm:       { name: "Melodic EDM",         src: "audio/melodic-edm.mp3",         bpm: 70,  offset: 0.518 },
    dance:     { name: "Dance Field",         src: "audio/dance-field.mp3",         bpm: 112, offset: 0.27 },
    freerun:   { name: "Free Run",            src: "audio/free-run.mp3",            bpm: 120, offset: 0.026 },
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
    // Everything moves: the board spins, flips over (recto verso), zooms in and out, changes size,
    // throws a random event every few bars (quake, tornado, shuffle…), and every 3 levels
    // teleports the player into the chicken mini-game (jump over the trees).
    chaos: {
      name: "Chaos", rule: "Ça tourne, se retourne, tremble, se mélange… et téléportation à la ferme",
      lives: 3, startBpm: 72, bpmStep: 7, greensPerLevel: 8, chaos: true,
      feint: { from: 3, base: 0.05, step: 0.03, max: 0.25 }, specials: true,
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

  // Difficulty of the modes (not the campaign: each level has its own). bpm: start tempo added;
  // step: tempo gained per level (multiplier); feint: chance of feints; life: how long a tile
  // stays; red: extra chance of red; lives: lives added (min 1); coins: credits multiplier.
  // Facile is not sent to the world leaderboard (its scores would be too easy).
  const DIFFICULTIES = {
    facile:     { name: "Facile",     bpm: -12, step: 0.7, feint: 0.5, life: 1.35, red: -0.06, lives: 2,  coins: 0.5, ranked: false },
    normal:     { name: "Normal",     bpm: 0,   step: 1,   feint: 1,   life: 1,    red: 0,     lives: 0,  coins: 1,   ranked: true },
    difficile:  { name: "Difficile",  bpm: 12,  step: 1.2, feint: 1.3, life: 0.85, red: 0.04,  lives: 0,  coins: 1.5, ranked: true },
    hardcore:   { name: "Hardcore",   bpm: 24,  step: 1.4, feint: 1.6, life: 0.72, red: 0.07,  lives: -1, coins: 2,   ranked: true },
    impossible: { name: "Impossible", bpm: 40,  step: 1.7, feint: 2,   life: 0.6,  red: 0.1,   lives: -9, coins: 3,   ranked: true },
  };

  // req (optional) = condition to meet before buying, on top of the price:
  //   rank: "Pilote" · games: 30 (games played) · best: { mode, score } · combo: 40 (best combo)
  //   bosses: 3 (bosses beaten) · missions: 15 (missions completed)
  //   level: 20 (campaign level cleared) · stars: 60 (campaign quests done)
  // A skin with hue (no colors) is generated by NT.levels.themeVars, like the level themes.
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
      { id: "menthe",   name: "Menthe",    price: 300,  hue: 160 },
      { id: "corail",   name: "Corail",    price: 350,  hue: 12 },
      { id: "cobalt",   name: "Cobalt",    price: 450,  hue: 222 },
      { id: "citron",   name: "Citron",    price: 500,  hue: 58 },
      { id: "amethyste",name: "Améthyste", price: 650,  hue: 275, req: { level: 10 } },
      { id: "rubis",    name: "Rubis",     price: 750,  hue: 348, req: { stars: 25 } },
      { id: "jade",     name: "Jade",      price: 850,  hue: 150, sat: 70, req: { level: 30 } },
      { id: "turquoise",name: "Turquoise", price: 950,  hue: 180, req: { games: 50 } },
      { id: "lavande",  name: "Lavande",   price: 1100, hue: 255, sat: 70, req: { stars: 60 } },
      { id: "ambre",    name: "Ambre",     price: 1300, hue: 33,  req: { combo: 50 } },
      { id: "fuchsia",  name: "Fuchsia",   price: 1500, hue: 312, req: { level: 60 } },
      { id: "acier",    name: "Acier",     price: 1700, hue: 205, sat: 25, req: { rank: "Vétéran" } },
      { id: "aurore",   name: "Aurore",    price: 2200, hue: 125, sat: 60, req: { stars: 150 } },
      { id: "eclipse",  name: "Éclipse",   price: 3000, hue: 240, sat: 40, req: { level: 100 } },
      { id: "supernova",name: "Supernova", price: 5000, hue: 25,  sat: 100, req: { level: 200 } },
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
      { id: "bulles",   name: "Bulles",    price: 400 },
      { id: "neige",    name: "Neige",     price: 550,  req: { level: 5 } },
      { id: "coeurs",   name: "Cœurs",     price: 650,  req: { stars: 15 } },
      { id: "anneaux",  name: "Anneaux",   price: 800,  req: { games: 40 } },
      { id: "laser",    name: "Laser",     price: 1400, req: { level: 40 } },
      { id: "artifice", name: "Feu d'artifice", price: 2500, req: { stars: 120 } },
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
      { id: "pilule",   name: "Pilule",   price: 350 },
      { id: "goutte",   name: "Goutte",   price: 500,  req: { level: 8 } },
      { id: "diamant",  name: "Diamant",  price: 650,  req: { stars: 20 } },
      { id: "coeur",    name: "Cœur",     price: 900,  req: { level: 25 } },
      { id: "fleche",   name: "Flèche",   price: 1000, req: { games: 60 } },
      { id: "pixel",    name: "Pixel",    price: 1600, req: { level: 80 } },
    ],
    // Background animation behind every screen.
    bg: [
      { id: "pluie",   name: "Pluie",   price: 0 },
      { id: "neige",   name: "Neige",   price: 300 },
      { id: "etoiles", name: "Étoiles", price: 500 },
      { id: "bulles",  name: "Bulles",  price: 700,  req: { level: 15 } },
      { id: "grille",  name: "Grille",  price: 900,  req: { stars: 40 } },
      { id: "matrice", name: "Matrice", price: 1200, req: { level: 50 } },
      { id: "aucun",   name: "Aucun",   price: 0 },
    ],
    // Music: ids are TRACKS keys. Bought here, picked here or in Réglages.
    music: [
      { id: "sync",  name: "Sync or Die", price: 0 },
      { id: "synth", name: "Synthé",      price: 0 },
      { id: "scar",   name: "Every Scar A Shield", price: 500 },
      { id: "velvet", name: "The Velvet Hour",     price: 700, req: { rank: "Cadet" } },
      { id: "freerun",   name: "Free Run",            price: 150 },
      { id: "edm",       name: "Melodic EDM",         price: 200 },
      { id: "house",     name: "Synthwave House",     price: 250 },
      { id: "dance",     name: "Dance Field",         price: 300 },
      { id: "nightclub", name: "Night Club Chill",    price: 350 },
      { id: "electric",  name: "Electric Stream",     price: 400 },
      { id: "welcome",   name: "Welcome Mix",         price: 450 },
      { id: "synthtype", name: "Synthwave Type",      price: 500,  req: { level: 5 } },
      { id: "glitch",    name: "Glitch Stairs",       price: 550,  req: { games: 25 } },
      { id: "beats",     name: "Beats n Games",       price: 600,  req: { stars: 10 } },
      { id: "cyborg",    name: "Jumping Cyborg",      price: 650,  req: { level: 15 } },
      { id: "casino",    name: "The Casino",          price: 750,  req: { stars: 30 } },
      { id: "aifight",   name: "AI Fight",            price: 850,  req: { level: 30 } },
      { id: "strange",   name: "Strange Experiments", price: 950,  req: { combo: 40 } },
      { id: "factory",   name: "New Factory",         price: 1100, req: { level: 50 } },
      { id: "sewers",    name: "Through the Sewers",  price: 1300, req: { stars: 90 } },
      { id: "overload",  name: "System Overload",     price: 1600, req: { level: 80 } },
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
    { id: "sloth2", text: "Survis à 2 téléportations en Chaos", stat: "teleports", mode: "chaos", goal: 2, type: "max", reward: 80 },
    { id: "daily", text: "Joue le défi du jour", stat: "dailyPlayed", goal: 1, type: "sum", reward: 40 },
  ];

  NT.cfg = {
    TRACKS, MENU_TRACK, MODES, CATALOG, RANKS, MISSIONS, DIFFICULTIES,
    MODE_IDS: Object.keys(MODES).filter((id) => !MODES[id].hidden),
    DEFAULT_GRID: [4, 6],
    MAX_BPM: 200,   // = the track played at 2x
    GLIDE: 7,       // BPM per second: the tempo slides to its new value instead of jumping
    CREEP: 0.25,    // BPM per second added between levels, so the music never stops speeding up
    BOSS_MS: 15000,
    CHAOS_GRIDS: [[3, 3], [3, 4], [4, 4], [4, 5], [5, 5], [5, 6], [6, 6]],
    TELEPORT_EVERY: 3, // levels
    MINI_MS: 10000,
    FREEZE_MS: 3000,
  };
})();
