// Sushi Chef rules, checked in node: node tests/rules.test.mjs
import { createGame } from '../js/rules.js';
import { INGREDIENTS, RECIPES, PACE, BY_ID } from '../js/data.js';

let fails = 0, count = 0;
const ok = (c, m, x = '') => { count++; console.log(`${c ? '  PASS' : '  FAIL'}  ${m}${x ? '  (' + x + ')' : ''}`); if (!c) fails++; };
let s = 42;
const rng = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const fresh = () => { const G = createGame({ rng }); return G; };
const force = (G, id) => { // start a specific recipe
  G.newOrder();
  const r = BY_ID[id];
  G.recipe = r; G.need = r.stages.flat(); G.got = [];
  G.tokens = [...G.need, 'gari'];
};

console.log('--- data ---');
ok(RECIPES.every((r) => r.stages.flat().every((id) => INGREDIENTS[id])), 'every recipe step is a real ingredient');
ok(RECIPES.every((r) => new Set(r.stages.flat()).size === r.stages.flat().length), 'no recipe uses an ingredient twice');
ok(!RECIPES.some((r) => r.stages.flat().includes('gari')), 'pickled ginger is never inside sushi');
ok(RECIPES.filter((r) => r.form === 'nigiri').every((r) => r.stages[0][0] === 'rice'), 'every nigiri starts with rice');
ok(RECIPES.filter((r) => /maki/.test(r.form)).every((r) => r.stages[0][0] === 'nori' && r.stages[1][0] === 'rice'), 'every roll starts nori, then rice');
ok(RECIPES.filter((r) => r.form === 'uramaki').every((r) => r.stages.at(-1).includes('goma')), 'inside-out rolls finish with sesame outside');

console.log('\n--- a right pick ---');
let G = fresh();
force(G, 'california');
let r = G.pick('rice');
ok(!r.ok && r.reason === 'order' && /Nori first/.test(r.message), 'rice before nori is the wrong order', r.message);
G = fresh(); force(G, 'california');
r = G.pick('nori');
ok(r.ok && r.points === 10 && G.score === 10, 'nori first scores 10');
G.pick('rice');
ok(G.wanted().length === 3, 'the fillings stage wants all three fillings', G.wanted().join(','));
r = G.pick('kyuri'); ok(r.ok, 'fillings go in any order: cucumber first');
r = G.pick('kani'); ok(r.ok, 'then crab');
r = G.pick('goma'); ok(!r.ok && r.reason === 'order', 'sesame waits until the fillings are in', r.message);
G.pick('avocado');
r = G.pick('goma'); ok(r.ok && r.done && G.phase === 'serving', 'sesame finishes the roll');

console.log('\n--- mistakes ---');
G = fresh(); force(G, 'sake-nigiri');
const t0 = G.timeLeft;
r = G.pick('gari');
ok(!r.ok && r.reason === 'gari', 'tapping gari explains it goes beside sushi', r.message);
ok(Math.abs(G.timeLeft - (t0 - PACE.mistakeCost)) < 1e-9, 'a wrong tap costs 1.5 s', `${t0} -> ${G.timeLeft}`);
ok(G.lives === PACE.lives, 'a wrong tap never costs a life');
r = G.pick('avocado'); ok(r.reason === 'notin', 'an ingredient from another recipe is "not in"', r.message);
G.pick('rice');
r = G.pick('rice'); ok(r.reason === 'twice' || r.reason === 'order', 'rice twice is refused', r.reason);

console.log('\n--- serving and the multiplier ---');
G = fresh(); force(G, 'sake-nigiri');
G.timeLeft = G.timeMax; // full clock
['rice', 'wasabi', 'salmon'].forEach((id) => G.pick(id));
let out = G.serve();
ok(out.parts.plate === 100 && out.parts.speed === 150 && out.parts.perfect === 50 && out.mult === 2, 'perfect and instant: 100 + 150 + 50, then ×2', JSON.stringify(out.parts));
ok(out.total === 300, 'first plate is worth 300 at ×1', String(out.total));
ok(G.score === 330, 'score = 3 × 10 + 300', String(G.score));
force(G, 'maguro-nigiri'); G.timeLeft = G.timeMax / 2;
['rice', 'wasabi', 'tuna'].forEach((id) => G.pick(id));
out = G.serve();
ok(out.parts.speed === 80 && out.parts.mult === 2 && out.total === 460, 'half the clock: 80 speed, (100+80+50) × 2 = 460', JSON.stringify(out.parts));
ok(G.mult === 3, 'two perfect plates in a row: ×3');
force(G, 'ebi-nigiri'); G.pick('gari'); ['rice', 'wasabi', 'ebi'].forEach((id) => G.pick(id));
ok(G.mult === 1, 'a wrong tap drops the multiplier to ×1 straight away');
out = G.serve();
ok(out.parts.perfect === 0 && !out.perfect && G.mult === 1, 'a plate with a mistake gets no perfect bonus and no ×');
for (let i = 0; i < 8; i++){ force(G, 'sake-nigiri'); ['rice', 'wasabi', 'salmon'].forEach((id) => G.pick(id)); G.serve(); }
ok(G.mult === PACE.maxMult && G.maxMult === PACE.maxMult, 'the multiplier tops out at ×5', String(G.mult));
ok(Object.values(out.parts).every((v) => v % 10 === 0 || v === out.parts.mult), 'every part of the score is a multiple of 10');

console.log('\n--- the clock and lives ---');
G = fresh(); G.newOrder();
let res = null, n = 0;
while (!res && n < 10000){ res = G.tick(0.1); n++; }
ok(res === 'timeout' && G.lives === PACE.lives - 1, 'running out of time costs one life', `${res}, lives ${G.lives}`);
ok(G.mult === 1 && G.streak === 0, 'and resets the multiplier');
ok(G.tick(1) === null, 'the clock stops between orders');
G.newOrder(); while (!G.tick(1)); G.newOrder();
res = null; while (!res) res = G.tick(1);
ok(res === 'over' && G.lives === 0, 'the third timeout ends the game');
G = fresh(); G.newOrder(); G.idle = PACE.hintAfter - 0.1;
ok(!G.showHint(), 'no hint before 6 s idle');
G.tick(0.2); ok(G.showHint(), 'hint after 6 s with no progress');
G.pick(G.wanted()[0]); ok(!G.showHint(), 'a right pick resets the hint timer');

console.log('\n--- the ramp ---');
G = fresh();
const lens = [], tokens = [], clocks = [];
for (let i = 0; i < 16; i++){
  G.newOrder();
  lens.push(G.need.length); tokens.push(G.tokens.length); clocks.push(G.timeMax / G.need.length);
  G.got = [...G.need]; G.serve();
}
ok(lens.slice(0, 3).every((l) => l <= 3), 'the first three orders have at most 3 steps', lens.join(','));
ok(lens.slice(3, 6).every((l) => l <= 4), 'orders 4-6 have at most 4 steps', lens.join(','));
ok(Math.max(...lens) >= 5, 'longer rolls arrive later', lens.join(','));
ok(tokens.every((t) => t <= PACE.maxTokens), 'never more than 9 dishes on the board', tokens.join(','));
ok(G.tokens.includes('gari'), 'pickled ginger is always one of the decoys');
ok(clocks[15] < clocks[0], 'there is less time per step as you go', `${clocks[0].toFixed(2)} -> ${clocks[15].toFixed(2)} s/step`);
for (let i = 0; i < 60; i++){ G.newOrder(); G.got = [...G.need]; G.serve(); }
ok(G.timeMax >= PACE.floor * G.need.length, 'but never below 1.4 s a step', `${G.timeMax} s for ${G.need.length}`);
const seen = new Set(); let last = null, repeat = false;
for (let i = 0; i < 80; i++){ G.newOrder(); seen.add(G.recipe.id); if (G.recipe.id === last) repeat = true; last = G.recipe.id; G.got = [...G.need]; G.serve(); }
ok(seen.size === RECIPES.length, 'every recipe comes up', `${seen.size}/${RECIPES.length}`);
ok(!repeat, 'the same recipe never comes twice in a row');

console.log(fails ? `\n${fails} of ${count} FAILED` : `\nALL ${count} RULES TESTS PASSED`);
process.exit(fails ? 1 : 0);
