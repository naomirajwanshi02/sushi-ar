// Sushi Chef rules: orders, stages, scoring, combo, clock and lives.
// Pure logic with no DOM or three.js, so tests/rules.test.mjs can drive it in node.
//
// Scoring, in multiples of 10 so it is easy to follow:
//   +10           each right ingredient
//   −1.5 s        each wrong tap (and the multiplier drops back to ×1); it never costs a life
//   on serving    (100 for the plate + up to 150 for speed + 50 if no mistakes) × multiplier
//   multiplier    1 + perfect plates in a row, up to ×5
//   lives         3 customers' patience: an order that runs out of time costs one

import { INGREDIENTS, RECIPES, PACE } from './data.js';

const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function createGame({ rng = Math.random, pace = PACE } = {}){
  const G = {
    pace, score: 0, lives: pace.lives, served: 0, mult: 1, maxMult: 1, streak: 0, maxStreak: 0,
    recipe: null, lastRecipe: null, need: [], got: [], tokens: [], mistakes: 0,
    timeMax: 0, timeLeft: 0, idle: 0, phase: 'idle', learned: new Set(),
  };

  // Recipes allowed at this point of the ramp: short ones first, longer ones unlock.
  G.allowedSteps = () => {
    let max = 0;
    for (const [from, steps] of pace.unlock) if (G.served >= from) max = steps;
    return max;
  };

  G.newOrder = () => {
    const max = G.allowedSteps();
    let pool = RECIPES.filter((r) => r.id !== G.lastRecipe && r.stages.flat().length <= max);
    if (!pool.length) pool = RECIPES.filter((r) => r.id !== G.lastRecipe);
    const r = pool[Math.floor(rng() * pool.length)];
    G.recipe = r; G.lastRecipe = r.id;
    G.need = r.stages.flat();
    G.got = [];
    G.mistakes = 0; G.idle = 0;

    const ramp = Math.min(1, G.served / pace.rampOrders);
    const nDecoy = Math.min(pace.maxTokens - G.need.length,
      Math.round(pace.decoys[0] + (pace.decoys[1] - pace.decoys[0]) * ramp));
    // Pickled ginger is always on the board: knowing it never goes in sushi is part of the game.
    const others = shuffle(Object.keys(INGREDIENTS).filter((id) => !G.need.includes(id) && id !== 'gari'), rng);
    const decoys = nDecoy > 0 ? ['gari', ...others.slice(0, nDecoy - 1)] : [];
    G.tokens = shuffle([...G.need, ...decoys], rng);

    const perStep = Math.max(pace.floor, pace.perStep * pace.shrink ** G.served);
    G.timeMax = Math.round((perStep * G.need.length + pace.read) * 10) / 10;
    G.timeLeft = G.timeMax;
    G.phase = 'play';
    return r;
  };

  // The stage the player is on: the first one with something still missing.
  G.stageIndex = () => G.recipe.stages.findIndex((s) => s.some((id) => !G.got.includes(id)));
  G.wanted = () => { const i = G.stageIndex(); return i < 0 ? [] : G.recipe.stages[i].filter((id) => !G.got.includes(id)); };
  G.done = () => G.need.every((id) => G.got.includes(id));

  // A tap on an ingredient. Returns what happened so the UI and the 3D stage can react.
  G.pick = (id) => {
    if (G.phase !== 'play') return { ok: false, reason: 'idle' };
    const stage = G.stageIndex();
    const wanted = G.wanted();
    if (wanted.includes(id)){
      G.got.push(id);
      G.idle = 0;
      G.score += 10;
      const done = G.done();
      if (done) G.phase = 'serving';
      return { ok: true, points: 10, stage, done };
    }
    // Wrong: say why, the way a sushi master would.
    G.mistakes++;
    G.mult = 1; G.streak = 0;
    G.timeLeft = Math.max(0.01, G.timeLeft - pace.mistakeCost);
    let reason, message;
    if (id === 'gari'){ reason = 'gari'; message = 'Gari goes beside sushi, not in it'; }
    else if (G.got.includes(id)){ reason = 'twice'; message = `${INGREDIENTS[id].short} is already in`; }
    else if (G.need.includes(id)){ reason = 'order'; message = `${INGREDIENTS[wanted[0]].short} first!`; }
    else { reason = 'notin'; message = `No ${INGREDIENTS[id].short.toLowerCase()} in ${G.recipe.name}`; }
    return { ok: false, reason, message, cost: pace.mistakeCost };
  };

  // Serving: points for the plate, then the multiplier grows if it was perfect.
  G.serve = () => {
    const frac = Math.max(0, Math.min(1, G.timeLeft / G.timeMax));
    const perfect = G.mistakes === 0;
    const parts = { plate: 100, speed: Math.round(15 * frac) * 10, perfect: perfect ? 50 : 0, mult: G.mult };
    const total = (parts.plate + parts.speed + parts.perfect) * parts.mult;
    G.score += total;
    G.served++;
    G.learned.add(G.recipe.id);
    let bumped = false;
    if (perfect){
      G.streak++;
      G.maxStreak = Math.max(G.maxStreak, G.streak);
      const m = Math.min(pace.maxMult, 1 + G.streak);
      bumped = m > G.mult;
      G.mult = m;
      G.maxMult = Math.max(G.maxMult, m);
    }
    G.phase = 'between';
    return { total, parts, perfect, bumped, mult: G.mult };
  };

  // The clock. Returns 'timeout' once, when the order runs out.
  G.tick = (dt) => {
    if (G.phase !== 'play') return null;
    G.timeLeft -= dt;
    G.idle += dt;
    if (G.timeLeft <= 0){
      G.timeLeft = 0;
      G.phase = 'between';
      G.lives--;
      G.mult = 1; G.streak = 0;
      return G.lives <= 0 ? 'over' : 'timeout';
    }
    return null;
  };

  G.showHint = () => G.phase === 'play' && G.idle >= pace.hintAfter;

  G.reset = () => {
    Object.assign(G, { score: 0, lives: pace.lives, served: 0, mult: 1, maxMult: 1, streak: 0, maxStreak: 0,
      recipe: null, lastRecipe: null, need: [], got: [], tokens: [], mistakes: 0, timeLeft: 0, timeMax: 0, idle: 0, phase: 'idle' });
    G.learned = new Set();
  };

  return G;
}
