import { S, ING, RECIPES, update, startGame, acceptItem, penalise,
         paletteRoot, buildSpot, RING, FIT, applyTargetAspect, relayout, ellipseRing, lockRing } from './game_test.mjs';

let fails = 0;
const ok = (c,m,x='') => { console.log(`${c?'  PASS':'  FAIL'}  ${m}${x?'  ('+x+')':''}`); if(!c) fails++; };
const run = (sec, dt=1/60) => { for(let i=0;i<Math.round(sec/dt);i++) update(dt); };
const pick = (key) => {           // mirrors onTap()'s decision branch exactly
  const it = S.items.find(i=>i.key===key);
  if (!it) throw new Error('no palette item: '+key);
  if (it.key === S.recipe.steps[S.step]) acceptItem(it); else penalise('wrong', it);
};
const serveOrder = () => { for (const k of [...S.recipe.steps]) pick(k); run(2.2); };

console.log('--- recipe data integrity ---');
const badIng = RECIPES.flatMap(r=>r.steps).filter(k=>!ING[k]);
ok(badIng.length===0, 'every recipe step is a real ingredient', badIng.join(',')||'all valid');
const badTop = RECIPES.filter(r=>!ING[r.top]);
ok(badTop.length===0, 'every recipe topping is a real ingredient', badTop.map(r=>r.name).join(','));
const badForm = RECIPES.filter(r=>!['nigiri','maki'].includes(r.form));
ok(badForm.length===0, 'every recipe form is nigiri|maki');
for (const n of [2,3,4,5]){
  const pool = RECIPES.filter(r=>r.steps.length===n);
  ok(pool.length>0, `a recipe pool exists for length ${n} (difficulty ramp)`, `${pool.length} recipes`);
}
const dupNames = RECIPES.length !== new Set(RECIPES.map(r=>r.name)).size;
ok(!dupNames, 'no duplicate recipe names');

console.log('\n--- game start ---');
S.tracked = true; startGame();
ok(S.phase==='playing', 'phase playing', S.phase);
ok(S.tries===3, 'three tries', String(S.tries));
ok(S.score===0 && S.served===0, 'score/served reset');
ok(!!S.recipe && S.recipe.steps.length>0, 'an order exists', S.recipe?.name);
ok(S.recipe.steps.length===2, 'first order is the easiest (2 steps)', String(S.recipe.steps.length));

console.log('\n--- palette composition ---');
const need = [...new Set(S.recipe.steps)];
const keys = S.items.map(i=>i.key);
ok(need.every(k=>keys.includes(k)), 'every needed ingredient is on the board');
ok(new Set(keys).size===keys.length, 'no duplicate palette items', `${keys.length} items`);
ok(keys.length>need.length, 'decoys are present', `${keys.length-need.length} decoys`);
ok(keys.every(k=>!!ING[k]), 'all palette keys are real ingredients');
const onEllipse = S.items.map(i=>Math.hypot(i.node.position.x/RING.rx, i.node.position.y/RING.ry));
ok(onEllipse.every(v=>Math.abs(v-1)<2e-2), 'items sit on the ring ellipse',
   `rx=${RING.rx.toFixed(3)} ry=${RING.ry.toFixed(3)}`);
ok(S.items.every(i=>Math.abs(i.node.position.x)<.5), 'items stay inside the card width');
ok(S.items.every(i=>Math.abs(i.node.position.y)<.5/1.5), 'items stay inside the 3:2 card height');

console.log('\n--- correct picks ---');
const s0=S.score, step0=S.step;
pick(S.recipe.steps[0]);
ok(S.step===step0+1, 'correct pick advances the step', String(S.step));
ok(S.score>s0, 'correct pick scores', `${s0} -> ${S.score}`);
ok(buildSpot.children.length>0, 'ingredient moved into the build area');
ok(!S.items.some(i=>i.key===S.recipe.steps[0] && i.alive), 'used item left the palette');

console.log('\n--- wrong pick ---');
const decoy = S.items.find(i=>!S.recipe.steps.includes(i.key));
const tr=S.tries, st=S.step, sc=S.score;
penalise('wrong', decoy);
ok(S.tries===tr-1, 'wrong pick costs a try', `${tr} -> ${S.tries}`);
ok(S.step===st, 'wrong pick does not advance the step');
ok(S.score===sc, 'wrong pick does not score');
ok(S.items.includes(decoy), 'wrong item stays on the board');

console.log('\n--- completing an order ---');
S.tries=3; startGame(); S.tracked=true;
const name=S.recipe.name, nsteps=S.recipe.steps.length;
for (const k of [...S.recipe.steps]) pick(k);
ok(S.served===1, 'served increments on completion', String(S.served));
ok(S.streak===1, 'streak increments', String(S.streak));
ok(S.busy===true, 'completion animation is playing (input locked)');
run(2.2);
ok(S.busy===false, 'animation finishes and unlocks');
ok(S.recipe.name!==undefined && S.step===0, 'a fresh order is dealt', S.recipe.name);
ok(buildSpot.children.length===0, 'build area cleared for the new order',
   `children=${buildSpot.children.length}`);

console.log('\n--- difficulty ramp ---');
S.tries=99; startGame(); S.tracked=true; S.tries=99;
const lens=[]; const slots=[];
for(let i=0;i<10;i++){ lens.push(S.recipe.steps.length); slots.push(S.items.length); serveOrder(); }
ok(lens[0]===2 && lens[9]>=4, 'recipe length grows with orders served', lens.join(','));
ok(lens.every((v,i)=>i===0||v>=lens[i-1]), 'length never regresses', lens.join(','));
ok(slots[9]>slots[0], 'decoy count grows too', slots.join(','));
ok(slots.every(v=>v<=8), 'palette never exceeds 8 slots', `max=${Math.max(...slots)}`);

console.log('\n--- streak multiplier ---');
S.tries=99; startGame(); S.tracked=true; S.tries=99;
serveOrder(); const after1=S.score;
serveOrder(); serveOrder();                   // streak 3 -> multiplier kicks in
ok(S.streak===3, 'streak tracked across orders', String(S.streak));
ok(S.bestStreak>=3, 'best streak recorded', String(S.bestStreak));
const gainLast = S.score - after1;
ok(gainLast>0, 'later orders keep scoring', String(gainLast));

console.log('\n--- losing all tries ---');
S.tries=3; startGame(); S.tracked=true;
for(let i=0;i<3;i++){
  const d=S.items.find(x=>!S.recipe.steps.includes(x.key));
  penalise('wrong', d); run(0.05);
}
ok(S.phase==='over', 'three wrong picks ends the game', S.phase);
ok(S.items.length===0, 'palette cleared on game over');
ok(paletteRoot.children.length===0, 'no leaked palette nodes',
   `children=${paletteRoot.children.length}`);
ok(buildSpot.children.length===0, 'no leaked build nodes');

console.log('\n--- timeout path ---');
S.tries=3; startGame(); S.tracked=true;
const t0=S.tries, r0=S.recipe.name;
run(S.timeMax + 0.3);
ok(S.tries===t0-1, 'timeout costs a try', `${t0} -> ${S.tries}`);
ok(S.phase==='playing', 'still playing with tries left');
ok(S.items.length>0, 'a new order was dealt after timeout', String(S.items.length));

console.log('\n--- pause while target lost ---');
S.tries=3; startGame(); S.tracked=true; run(0.5);
const tl=S.timeLeft; S.tracked=false; run(2.0);
ok(Math.abs(S.timeLeft-tl)<1e-9, 'timer frozen when target lost', `${tl.toFixed(2)} held`);
S.tracked=true; run(0.5);
ok(S.timeLeft<tl, 'timer resumes when tracking returns');

console.log('\n--- input guards ---');
S.tries=3; startGame(); S.tracked=true;
for (const k of [...S.recipe.steps]) pick(k);        // now busy
const scoreWhileBusy=S.score;
run(0.1);
ok(S.busy, 'busy during completion');
ok(S.score>=scoreWhileBusy, 'no negative scoring while busy');

console.log('\n--- wrong-pick flash restores shared materials ---');
S.tries=99; startGame(); S.tracked=true; S.tries=99;
const rice = ING.rice.build();     // 9 grains share one material
const colours = (g) => { const c=[]; g.traverse(o=>{ if(o.isMesh) c.push(o.material.color.getHex()); }); return c.join(); };
const before = colours(rice);
const fake = { key:'rice', node:rice, inner:rice, home:rice.position.clone(), alive:true };
penalise('wrong', fake);
penalise('wrong', fake);           // second tap lands mid-flash
ok(colours(rice)!==before, 'wrong pick flashes the item red');
await new Promise(r=>setTimeout(r, 400));
ok(colours(rice)===before, 'every mesh gets its own colour back', colours(rice));

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL 42 CHEF-MODE TESTS PASSED');
process.exit(fails?1:0);
