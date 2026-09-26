// Browser stub: enough DOM/canvas/audio for the game module to run in node.
const noop = () => {};
const mkCtx = () => new Proxy({}, {
  get: (t, k) => (k === 'canvas' ? {} : (t[k] ??= noop)),
  set: () => true,
});
const mkEl = (tag='div') => {
  const e = {
    tagName:tag, textContent:'', innerHTML:'', hidden:false, width:0, height:0,
    offsetWidth:0, srcObject:null,
    style:new Proxy({},{get:()=>'',set:()=>true}),
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
      toggle(c,v){ v===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c))
                                 : (v?this._s.add(c):this._s.delete(c)) },
      contains(c){return this._s.has(c)} },
    appendChild(){}, remove(){}, setAttribute(){}, addEventListener(){},
    getContext:()=>mkCtx(), play:async()=>{},
    _kids:[],
    querySelector(sel){ return (this._kids.find(k=>k._sel===sel) || mkEl()); },
    querySelectorAll(sel){ return this._kids.filter(k=>k._sel===sel); },
  };
  return e;
};
const bag = {};
globalThis.document = {
  getElementById:(id)=>(bag[id] ??= mkEl()),
  createElement:(t)=>mkEl(t),
  body:mkEl(), documentElement:mkEl(),
};
// #tries holds three .try pips
bag.tries = mkEl();
bag.tries._kids = [0,1,2].map(()=>{ const d=mkEl(); d._sel='.try'; return d; });
// #banner holds a <b> and a <span>
bag.banner = mkEl();
bag.banner._kids = ['b','span'].map(s=>{ const d=mkEl(s); d._sel=s; return d; });

globalThis.window = globalThis;
globalThis.location = { search:'' };
// Node 21+ defines a read-only global navigator, so plain assignment throws.
Object.defineProperty(globalThis, 'navigator', { configurable:true,
  value:{ vibrate(){}, mediaDevices:{ getUserMedia:async()=>({}) } } });
globalThis.devicePixelRatio = 2;
globalThis.innerWidth = 390; globalThis.innerHeight = 844;
globalThis.addEventListener = noop;
const store = new Map();
globalThis.localStorage = {
  getItem:(k)=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
};
globalThis.AudioContext = class {
  constructor(){ this.state='running'; this.currentTime=0; }
  resume(){}
  createOscillator(){ return { type:'', frequency:{value:0,setValueAtTime:noop},
    connect:(x)=>x, start:noop, stop:noop }; }
  createGain(){ return { gain:{setValueAtTime:noop,linearRampToValueAtTime:noop,
    exponentialRampToValueAtTime:noop}, connect:(x)=>x }; }
};
globalThis.__BAG = bag;

import * as THREE from 'three';
/* =========================================================================
   SUSHI CHEF — NFC -> WebAR sushi-building game
   -------------------------------------------------------------------------
   An order ticket names a recipe. Ingredients sit in a ring on the tracked
   plate, shuffled and padded with decoys. Tap them in the recipe's order to
   assemble the sushi. A wrong pick or a timeout costs one of three tries.

   Backends:
     AR   (default)  MindAR image tracking, anchored to sushi_main.jpeg
     DEMO (?demo=1)  No target: the board floats in front of the camera

   Version pins matter: mind-ar@1.2.5 imports `sRGBEncoding` from three, which
   three removed in r162. Do not bump three past 0.160.0.
   ========================================================================= */

const qs    = new URLSearchParams(location.search);
const DEMO  = qs.has('demo');
const DEBUG = qs.has('debug');
const TARGET_SRC = qs.get('target') || './targets.mind';

const START_TRIES = 3;
const LIFT        = .02;

/* Layout is expressed in MindAR anchor units, where the target image's WIDTH is
   always 1.0 and its height is 1/aspect — so a 3:2 card only spans ±0.333
   vertically. A fixed circular ring would hang off the top and bottom of any
   non-square target, so the ingredient ring is an ellipse fitted to the actual
   target, read from the compiled descriptor at runtime (see applyTargetAspect).
   These are the defaults, matching the shipped 3:2 target. */
const DEFAULT_ASPECT = 1.5;
const RING = { rx:.42, ry:.28 };   // ingredient ring semi-axes
const FIT  = { rx:.52, ry:.38 };   // outer extent used for demo viewport fitting

/** Fit the ring inside a target of the given aspect, leaving a margin.
    Each axis takes 84% of the card's half-extent, so a square target gets a
    plain circle and only a wide or tall one gets squashed. */
function applyTargetAspect(aspect){
  const halfH = .5 / aspect;                  // half the card height, in width units
  RING.rx = .42;                              // 84% of the half-width, which is always .5
  RING.ry = Math.min(.42, halfH * .84);
  FIT.rx  = RING.rx + .10;
  FIT.ry  = RING.ry + .10;
}
applyTargetAspect(DEFAULT_ASPECT);

/* Equal ANGLE steps around an ellipse bunch the points up at the ends of the
   major axis: on the 3:2 ring the gaps come out 0.23 at the sides against 0.33
   at top and bottom. That is not tight enough to overlap a label, so this is
   about looking deliberate rather than about collisions — walking the perimeter
   by arc length instead evens the gaps to within ~6%. */
function ellipseRing(n, phase){
  const N = 512, pts = [], cum = [0];
  const P = (t) => [RING.rx * Math.cos(t), RING.ry * Math.sin(t)];
  let prev = P(0);
  for (let i = 1; i <= N; i++){
    const p = P(i / N * Math.PI * 2);
    cum.push(cum[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  const total = cum[N];
  for (let k = 0; k < n; k++){
    const want = ((k / n + phase / (Math.PI * 2)) % 1) * total;
    let i = cum.findIndex((c) => c >= want);
    if (i < 0) i = N;
    pts.push(P(i / N * Math.PI * 2));
  }
  return pts;
}

// ------------------------------------------------------------------ DOM
const $ = (id) => document.getElementById(id);
const el = {
  ar:$('ar'), scanGuide:$('scanGuide'), score:$('score'), tries:$('tries'), ticket:$('ticket'),
  nextCard:$('nextCard'), orderNum:$('orderNum'), recipeName:$('recipeName'),
  bar:$('bar'), barFill:$('barFill'),
  progress:$('progress'), status:$('status'), pops:$('pops'), banner:$('banner'),
  flash:$('flash'), dbg:$('dbg'),
  gate:$('gate'), gateHint:$('gateHint'), startBtn:$('startBtn'),
  over:$('over'), finalScore:$('finalScore'), finalServed:$('finalServed'),
  finalStreak:$('finalStreak'), finalBest:$('finalBest'), overMsg:$('overMsg'),
  againBtn:$('againBtn'), err:$('err'), errbox:$('errbox'), retryBtn:$('retryBtn'),
};

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function showStatus(main, sub){
  el.status.innerHTML = main ? `<b>${main}</b>${sub ? `<span>${sub}</span>` : ''}` : '';
  el.status.classList.toggle('on', !!main);
}
function fail(e){
  console.error(e);
  el.errbox.textContent = (e && (e.stack || e.message)) || String(e);
  el.gate.hidden = el.over.hidden = true; el.err.hidden = false;
}

// ------------------------------------------------------------------ audio
const Sfx = (() => {
  let ctx = null;
  const unlock = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  };
  const tone = (f, dur = .1, type = 'sine', gain = .15, delay = 0) => {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + .02);
  };
  return {
    unlock,
    // rising pitch per correct ingredient — audible progress through a recipe
    step:(i, n) => { tone(440 * Math.pow(2, i / Math.max(n, 1) * .75), .13, 'triangle', .17);
                     tone(880 * Math.pow(2, i / Math.max(n, 1) * .75), .07, 'sine', .05); },
    good:()   => [0, .09, .18, .30].forEach((d, i) =>
                   tone([523, 659, 784, 1047][i], .3, 'triangle', .15, d)),
    bad:()    => { tone(180, .28, 'sawtooth', .18); tone(104, .34, 'square', .11); },
    tick:()   => tone(1250, .04, 'square', .05),
    over:()   => [0, .14, .30].forEach((d, i) => tone([440, 349, 262][i], .4, 'triangle', .15, d)),
  };
})();
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch {} };

// ------------------------------------------------------- tween engine
const tweens = [];
const EASE = {
  out:  t => 1 - Math.pow(1 - t, 3),
  io:   t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => 1 + 2.7016 * Math.pow(t - 1, 3) + 1.7016 * Math.pow(t - 1, 2),
  pop:  t => t < .6 ? EASE.out(t / .6) * 1.14 : 1.14 - .14 * EASE.out((t - .6) / .4),
};
function tw(dur, ease, step, done, delay = 0){
  tweens.push({ t:-delay, dur, ease, step, done });
}
function updateTweens(dt){
  for (let i = tweens.length - 1; i >= 0; i--){
    const T = tweens[i];
    T.t += dt;
    if (T.t < 0) continue;                       // still waiting out its delay
    const k = Math.min(T.t / T.dur, 1);
    T.step(T.ease(k), k);
    if (k >= 1){ tweens.splice(i, 1); T.done?.(); }
  }
}

/** Free GPU resources for a subtree. Sprites carry a canvas texture too, so
    disposing only meshes leaks one texture per ingredient label. */
function disposeTree(node){
  node.traverse(o => {
    if (o.isMesh) o.material.dispose();
    else if (o.isSprite){ o.material.map?.dispose(); o.material.dispose(); }
  });
}

// ------------------------------------------------------- procedural art
const GEO = {
  ball:  new THREE.SphereGeometry(.5, 18, 13),
  cyl:   new THREE.CylinderGeometry(.5, .5, 1, 24),
  cone:  new THREE.ConeGeometry(.5, 1, 16),
  box:   new THREE.BoxGeometry(1, 1, 1),
  ico:   new THREE.IcosahedronGeometry(.5, 0),
  torus: new THREE.TorusGeometry(1, .02, 8, 64),
  ring:  new THREE.RingGeometry(.86, 1, 48),
  tube:  new THREE.TorusGeometry(.5, .17, 10, 20, Math.PI * 1.25),
};

// Toon material holds saturation better in AR and matches the watercolor target style
const std = (color, o = {}) => {
  const mat = new THREE.MeshToonMaterial({ color, transparent:true, ...o });
  // Save original emissive state so highlight code can restore it (wasabi has built-in glow)
  mat.userData.originalEmissiveIntensity = o.emissiveIntensity || 0;
  return mat;
};

function m(geo, mat, s, p, r){
  const o = new THREE.Mesh(geo, mat);
  if (s) o.scale.set(...s);
  if (p) o.position.set(...p);
  if (r) o.rotation.set(...r);
  return o;
}

/* Each ingredient builder returns a Y-up Group about 0.1 units across.
   Shapes are deliberately distinct so they read at small AR scale, where
   colour alone isn't enough. */
const ING = {
  rice: { name:'Rice', color:0xFFFAF0, build(){
    const g = new THREE.Group();
    // More distinct rice grains for realism
    const base = std(0xFFFAF0);
    const grain = std(0xFFF5E1);
    g.add(m(GEO.ball, base, [.105,.062,.075], [0,.031,0]));
    // Visible individual grains on surface
    [[-.028,.052,.01],[.026,.055,-.012],[.004,.062,.022],
     [-.015,.058,-.016],[.018,.056,.018],[-.022,.045,.016],
     [.012,.049,-.018],[-.008,.065,.008],[.020,.050,-.008]].forEach(p =>
      g.add(m(GEO.ball, grain, [.018,.014,.016], p)));
    return g; } },

  nori: { name:'Nori', color:0x2d5f41, build(){
    const g = new THREE.Group();
    // Base sheet with texture layers
    g.add(m(GEO.box, std(0x2d5f41), [.115,.008,.115], [0,.006,0]));
    // Darker veins/texture (seaweed has visible structure)
    for (let i = 0; i < 4; i++){
      g.add(m(GEO.box, std(0x1a3d2b), [.118,.001,.006], [0,.012,-.048 + i * .032]));
      g.add(m(GEO.box, std(0x1a3d2b), [.006,.001,.118], [-.048 + i * .032,.012,0]));
    }
    // Slight glossy highlight (nori has a sheen)
    g.add(m(GEO.box, std(0x3a7050, { opacity:.3 }), [.112,.001,.08], [0,.0145,0]));
    return g; } },

  salmon:   { name:'Salmon',   color:0xFF7043, build(){ return slab(0xFF7043, 0xFFCCBC); } },
  tuna:     { name:'Tuna',     color:0xE91E63, build(){ return slab(0xE91E63, 0xF48FB1); } },

  egg: { name:'Tamago', color:0xFFD600, build(){
    const g = new THREE.Group();
    g.add(m(GEO.box, std(0xFFD600), [.1,.055,.07], [0,.028,0]));
    for (let i = 0; i < 2; i++)
      g.add(m(GEO.box, std(0xFFAB00), [.101,.004,.071], [0,.02 + i * .018,0]));
    return g; } },

  avocado: { name:'Avocado', color:0x9CFF57, build(){
    const g = new THREE.Group();
    // Fanned crescent slices with inner yellow gradient
    for (let i = 0; i < 3; i++){
      const x = -.018 + i * .018, y = .03 + i * .004, rot = .35 + i * .16;
      // Outer green flesh
      g.add(m(GEO.tube, std(0x9CFF57), [.085,.085,.03], [x,y,0], [Math.PI / 2, 0, rot]));
      // Inner lighter green (closer to seed)
      g.add(m(GEO.tube, std(0xC5FF8A, { opacity:.8 }),
              [.065,.065,.031], [x,y + .001,0], [Math.PI / 2, 0, rot]));
    }
    return g; } },

  cucumber: { name:'Cucumber', color:0x4AFF88, build(){
    const g = new THREE.Group();
    for (let i = 0; i < 2; i++){
      g.add(m(GEO.cyl, std(0x2E7D32), [.072,.016,.072], [-.02 + i * .04, .03 + i * .018, 0],
              [0,0,.1]));
      g.add(m(GEO.cyl, std(0xDCFFD6), [.05,.018,.05], [-.02 + i * .04, .031 + i * .018, 0],
              [0,0,.1]));
    }
    return g; } },

  shrimp: { name:'Ebi', color:0xFF9E80, build(){
    const g = new THREE.Group();
    // Curved segmented body
    for (let i = 0; i < 5; i++){
      const t = i / 4;
      const curve = -.5 - t * .4;  // increasing curve
      const x = -.032 + i * .016;
      const y = .035 + Math.sin(t * Math.PI * .5) * .008;
      const scale = .05 - i * .004;  // tapering
      g.add(m(GEO.tube, std(i % 2 ? 0xFF9E80 : 0xFFB299),
              [.09,.09,scale], [x,y,0], [Math.PI / 2, 0, curve]));
    }
    // Tail segments (stripes)
    for (let i = 0; i < 4; i++)
      g.add(m(GEO.box, std(0xFF5722), [.008,.028,.048], [-.028 + i * .019, .046, 0], [0,0,.35]));
    return g; } },

  crab: { name:'Crab', color:0xFF6D00, build(){
    const g = new THREE.Group();
    g.add(m(GEO.box, std(0xFFFFFF), [.11,.04,.042], [0,.022,0], [0,.2,0]));
    g.add(m(GEO.box, std(0xFF6D00), [.112,.014,.044], [0,.046,0], [0,.2,0]));
    return g; } },

  sesame: { name:'Sesame', color:0xFFF9E6, build(){
    const g = new THREE.Group();
    g.add(m(GEO.cyl, std(0x3E2723), [.1,.012,.1], [0,.006,0]));
    const mt = std(0xFFF9E6);
    for (let i = 0; i < 11; i++){
      const a = i / 11 * Math.PI * 2, r = .022 + (i % 3) * .016;
      g.add(m(GEO.ball, mt, [.017,.009,.011],
              [Math.cos(a) * r, .017, Math.sin(a) * r], [0, a, 0]));
    }
    return g; } },

  wasabi: { name:'Wasabi', color:0x76FF03, build(){
    const g = new THREE.Group();
    g.add(m(GEO.cone, std(0x76FF03, { emissive:0x33691E, emissiveIntensity:0.4 }),
            [.085,.075,.085], [0,.037,0]));
    g.add(m(GEO.ico, std(0xCDDC39), [.03,.03,.03], [.022,.024,.02]));
    return g; } },

  ginger: { name:'Ginger', color:0xFFCDD2, build(){
    const g = new THREE.Group(), mt = std(0xFFCDD2);
    for (let i = 0; i < 3; i++)
      g.add(m(GEO.cyl, mt, [.075 - i * .012, .01, .075 - i * .012],
              [0, .01 + i * .013, 0], [.22, i * .8, .1]));
    return g; } },
};

function slab(c, light){
  const g = new THREE.Group();
  // Main fish body with slight curve for realism
  g.add(m(GEO.ball, std(c), [.11,.028,.07], [0,.02,0]));
  // Fat marbling (white streaks)
  for (let i = 0; i < 4; i++)
    g.add(m(GEO.box, std(light, { opacity:.85 }),
            [.092 - i * .008,.003,.005], [0,.034,-.021 + i * .014], [0,0,.05 * i]));
  // Muscle striations (darker lines for texture)
  for (let i = 0; i < 5; i++)
    g.add(m(GEO.box, std(c, { emissive:0x000000, emissiveIntensity:.1 }),
            [.105,.001,.045], [-.003,.035,-.015 + i * .0075]));
  return g;
}

/* Finished-sushi models, shown when an order completes. */
function finishedSushi(form, topKey){
  const g = new THREE.Group();
  const top = ING[topKey]?.color ?? 0xFF7043;
  if (form === 'nigiri'){
    g.add(m(GEO.ball, std(0xFFFAF0), [.15,.085,.1], [0,.042,0]));
    g.add(m(GEO.ball, std(top), [.16,.032,.108], [0,.092,0], [0,0,.07]));
    g.add(m(GEO.box, std(0x2d5f41), [.042,.004,.112], [0,.1,0]));
  } else {
    g.add(m(GEO.cyl, std(0x2d5f41), [.145,.11,.145], [0,.055,0]));
    g.add(m(GEO.cyl, std(0xFFFAF0), [.128,.116,.128], [0,.057,0]));
    g.add(m(GEO.cyl, std(top), [.055,.122,.055], [0,.059,0]));
    for (let i = 0; i < 5; i++){                      // sesame on the rice face
      const a = i / 5 * Math.PI * 2;
      g.add(m(GEO.ball, std(0xFFF9E6), [.014,.008,.01],
              [Math.cos(a) * .088, .118, Math.sin(a) * .088]));
    }
  }
  return g;
}

// ------------------------------------------------------------ recipes
const RECIPES = [
  { name:'Salmon Nigiri',   form:'nigiri', top:'salmon',   steps:['rice','salmon'] },
  { name:'Tuna Nigiri',     form:'nigiri', top:'tuna',     steps:['rice','tuna'] },
  { name:'Tamago Nigiri',   form:'nigiri', top:'egg',      steps:['rice','egg'] },
  { name:'Ebi Nigiri',      form:'nigiri', top:'shrimp',   steps:['rice','shrimp'] },
  { name:'Avocado Maki',    form:'maki',   top:'avocado',  steps:['nori','rice','avocado'] },
  { name:'Kappa Maki',      form:'maki',   top:'cucumber', steps:['nori','rice','cucumber'] },
  { name:'Salmon Maki',     form:'maki',   top:'salmon',   steps:['nori','rice','salmon'] },
  { name:'Wasabi Nigiri',   form:'nigiri', top:'tuna',     steps:['rice','tuna','wasabi'] },
  { name:'Spicy Tuna Roll', form:'maki',   top:'tuna',     steps:['nori','rice','tuna','wasabi'] },
  { name:'Ebi Roll',        form:'maki',   top:'shrimp',   steps:['nori','rice','shrimp','sesame'] },
  { name:'Veggie Roll',     form:'maki',   top:'avocado',  steps:['nori','rice','avocado','cucumber'] },
  { name:'California Roll', form:'maki',   top:'crab',     steps:['nori','rice','crab','avocado','sesame'] },
  { name:'Rainbow Roll',    form:'maki',   top:'salmon',   steps:['nori','rice','crab','avocado','salmon'] },
  { name:"Chef's Special",  form:'maki',   top:'tuna',     steps:['nori','rice','tuna','shrimp','ginger'] },
];
const ING_KEYS = Object.keys(ING);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--){
  const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// --------------------------------------------------------------- state
const S = {
  phase:'idle',            // idle | playing | between | over
  score:0, shown:0, tries:START_TRIES, served:0, streak:0, bestStreak:0,
  tracked:DEMO, recipe:null, step:0, timeLeft:0, timeMax:0, lastTickSec:-1,
  items:[], ringPhase:0,   // palette entries currently on the board
  stack:[],                // meshes already added to the build
  busy:false,              // true during completion animation
};
const BEST_KEY = 'sushichef.best';
const best = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
const setBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} };

// ------------------------------------------------------------- board
const board = new THREE.Group();
const buildSpot = new THREE.Group();     // where the sushi assembles
const paletteRoot = new THREE.Group();
const fx = new THREE.Group();
let lockRing, matMesh;
// Billboard transform reusable objects (allocated once, reused per frame)
const bb = {
  tempPos: new THREE.Vector3(),
  cameraLocalPos: new THREE.Vector3(),
  stackCenter: new THREE.Vector3(),
  d: new THREE.Vector3(),
  tempQuat: new THREE.Quaternion(),
  boardQuat: new THREE.Quaternion(),
  localQuat: new THREE.Quaternion(),
  camUp: new THREE.Vector3(),
  u: new THREE.Vector3(),
  localZ: new THREE.Vector3(0, 0, 1),
  targetQuat: new THREE.Quaternion(),
};
{
  // Bright ground color keeps PBR materials vibrant by reflecting light back up
  board.add(new THREE.HemisphereLight(0xffffff, 0xc8e0ff, 2.0));
  // Lower intensities with toon material to avoid overexposure
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(.35, .55, .95);
  board.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, .4); rim.position.set(-.6, -.3, .5);
  board.add(rim);

  // lock-on ring + bamboo mat under the build area. Both are re-scaled by
  // relayout() once the real target aspect is known.
  lockRing = m(GEO.torus, new THREE.MeshBasicMaterial(
    { color:0x43d6a3, transparent:true, opacity:.5 }), [RING.rx, RING.ry, RING.ry]);
  board.add(lockRing);
  matMesh = m(GEO.cyl, std(0xc9a668, { opacity:.92 }),
              [.21,.006,.21], [0,0,.003]);
  matMesh.rotation.x = Math.PI / 2;                   // lie flat in the plate plane
  board.add(matMesh);
  board.add(buildSpot, paletteRoot, fx);
}

/** Re-fit ring, mat and any live ingredients after the target aspect changes. */
function relayout(){
  lockRing.scale.set(RING.rx, RING.ry, RING.ry);
  const mr = Math.min(.21, RING.ry * .74);
  matMesh.scale.set(mr, .006, mr);
  const pts = ellipseRing(S.items.length, S.ringPhase);
  S.items.forEach((it, i) => {
    it.home.set(pts[i][0], pts[i][1], LIFT);
    if (it.alive) it.node.position.copy(it.home);
  });
}

// Ingredients are modelled Y-up; the target plane is XY with +Z out of it.
function tilted(inner){
  const t = new THREE.Group();
  t.rotation.x = Math.PI / 2;
  t.add(inner);
  return t;
}

function labelSprite(text){
  const c = document.createElement('canvas');
  c.width = 320; c.height = 84;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,10,14,.82)';
  const r = 26, w = c.width, h = c.height;
  g.beginPath();
  g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r);
  g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#fff';
  g.font = '700 44px ui-sans-serif,system-ui,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial(
    { map:tex, transparent:true, depthWrite:false }));
  s.scale.set(.24, .06, 1);          // large, very readable AR labels (2x)
  return s;
}

/** Draw what the finished dish looks like (goal preview for the player). */
function drawFinishedDish(recipe, size){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), cx = size / 2, cy = size / 2;

  if (recipe.form === 'nigiri'){
    // Nigiri: rice base (oval) + topping (rounded rect on top)
    const topColor = hex(ING[recipe.top].color);

    // Rice base (cream oval)
    g.fillStyle = hex(ING.rice.color);
    g.strokeStyle = 'rgba(0,0,0,.2)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(cx, cy + size * .08, size * .32, size * .18, 0, 0, Math.PI * 2);
    g.fill(); g.stroke();

    // Topping (rounded rect overlay, slightly offset to show rice)
    g.fillStyle = topColor;
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.lineWidth = 2;
    g.beginPath();
    const rx = size * .35, ry = size * .2, r = size * .06, dy = -size * .05;
    g.moveTo(cx - rx + r, cy - ry + dy);
    g.arcTo(cx + rx, cy - ry + dy, cx + rx, cy + ry + dy, r);
    g.arcTo(cx + rx, cy + ry + dy, cx - rx, cy + ry + dy, r);
    g.arcTo(cx - rx, cy + ry + dy, cx - rx, cy - ry + dy, r);
    g.arcTo(cx - rx, cy - ry + dy, cx + rx, cy - ry + dy, r);
    g.closePath();
    g.fill(); g.stroke();

    // Marbling lines on top
    g.strokeStyle = 'rgba(255,255,255,.4)';
    g.lineWidth = 2;
    for (let i = 0; i < 2; i++){
      const y = cy - size * .08 + i * size * .08 + dy;
      g.beginPath();
      g.moveTo(cx - size * .28, y);
      g.lineTo(cx + size * .28, y);
      g.stroke();
    }
  } else {
    // Maki: nori ring (dark) + rice ring (cream) + filling center (colorful)
    const topColor = hex(ING[recipe.top].color);

    // Nori outer ring (dark green/black circle)
    g.fillStyle = hex(ING.nori.color);
    g.strokeStyle = 'rgba(0,0,0,.3)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, size * .38, 0, Math.PI * 2);
    g.fill(); g.stroke();

    // Rice ring (cream)
    g.fillStyle = hex(ING.rice.color);
    g.strokeStyle = 'rgba(0,0,0,.15)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, size * .30, 0, Math.PI * 2);
    g.fill(); g.stroke();

    // Center filling (the "top" ingredient color)
    g.fillStyle = topColor;
    g.strokeStyle = 'rgba(0,0,0,.2)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, size * .16, 0, Math.PI * 2);
    g.fill(); g.stroke();

    // Sesame speckle if the recipe has sesame
    if (recipe.steps.includes('sesame')){
      g.fillStyle = '#FFF9E6';
      for (let i = 0; i < 8; i++){
        const angle = (i / 8) * Math.PI * 2;
        const dist = size * .24 + (Math.random() - 0.5) * size * .04;
        const sx = cx + Math.cos(angle) * dist;
        const sy = cy + Math.sin(angle) * dist;
        g.beginPath();
        g.arc(sx, sy, size * .02, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  return c;
}

/** Draw a large icon showing ingredient shape + color for the ticket card. */
function drawIngredientIcon(key, size){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), cx = size / 2, cy = size / 2;
  const color = hex(ING[key].color);

  g.fillStyle = color;
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = 3;

  // Draw simplified shape silhouettes based on ingredient type
  if (key === 'rice'){                               // white ball
    g.beginPath(); g.arc(cx, cy, size * .35, 0, Math.PI * 2); g.fill(); g.stroke();
  } else if (key === 'nori'){                        // dark square
    g.fillRect(cx - size * .35, cy - size * .35, size * .7, size * .7);
    g.strokeRect(cx - size * .35, cy - size * .35, size * .7, size * .7);
  } else if (key === 'salmon' || key === 'tuna'){   // fish slab (rounded rect)
    g.beginPath();
    const rx = size * .38, ry = size * .25, r = size * .08;
    g.moveTo(cx - rx + r, cy - ry);
    g.arcTo(cx + rx, cy - ry, cx + rx, cy + ry, r);
    g.arcTo(cx + rx, cy + ry, cx - rx, cy + ry, r);
    g.arcTo(cx - rx, cy + ry, cx - rx, cy - ry, r);
    g.arcTo(cx - rx, cy - ry, cx + rx, cy - ry, r);
    g.closePath(); g.fill(); g.stroke();
  } else if (key === 'egg'){                         // yellow square
    g.fillRect(cx - size * .33, cy - size * .28, size * .66, size * .56);
    g.strokeRect(cx - size * .33, cy - size * .28, size * .66, size * .56);
  } else if (key === 'avocado'){                     // green crescent
    g.beginPath();
    g.arc(cx - size * .1, cy, size * .35, 0, Math.PI * 2);
    g.arc(cx + size * .1, cy, size * .35, 0, Math.PI * 2);
    g.fill('evenodd'); g.stroke();
  } else if (key === 'cucumber'){                    // green cylinder
    g.beginPath();
    g.arc(cx, cy, size * .3, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.3)';
    g.beginPath(); g.arc(cx, cy, size * .18, 0, Math.PI * 2); g.fill();
  } else if (key === 'shrimp'){                      // orange crescent
    g.beginPath();
    g.arc(cx, cy - size * .08, size * .32, 0.3, Math.PI - 0.3);
    g.lineWidth = size * .15;
    g.lineCap = 'round';
    g.stroke();
  } else if (key === 'crab'){                        // white/orange block
    g.fillStyle = '#fff';
    g.fillRect(cx - size * .35, cy - size * .22, size * .7, size * .44);
    g.fillStyle = color;
    g.fillRect(cx - size * .35, cy - size * .08, size * .7, size * .16);
  } else if (key === 'sesame'){                      // cream circle with dots
    g.beginPath(); g.arc(cx, cy, size * .34, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff';
    for (let i = 0; i < 7; i++){
      const a = i / 7 * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * size * .18, cy + Math.sin(a) * size * .18, size * .04, 0, Math.PI * 2);
      g.fill();
    }
  } else if (key === 'wasabi'){                      // green cone
    g.beginPath();
    g.moveTo(cx, cy - size * .35);
    g.lineTo(cx + size * .32, cy + size * .28);
    g.lineTo(cx - size * .32, cy + size * .28);
    g.closePath(); g.fill(); g.stroke();
  } else if (key === 'ginger'){                      // pink stacked layers
    for (let i = 0; i < 3; i++){
      g.fillStyle = i === 1 ? 'rgba(255,255,255,.3)' : color;
      g.beginPath();
      g.ellipse(cx, cy - size * .15 + i * size * .15, size * .35 - i * .04 * size, size * .08, 0, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
  } else {                                           // fallback: circle
    g.beginPath(); g.arc(cx, cy, size * .35, 0, Math.PI * 2); g.fill(); g.stroke();
  }

  return c;
}

// --------------------------------------------------------- order flow
function buildOrder(){
  // Difficulty: recipe length and decoy count both grow with orders served.
  const want = Math.min(2 + Math.floor(S.served / 3), 5);
  const pool = RECIPES.filter(r => r.steps.length === want);
  S.recipe = (pool.length ? pool : RECIPES)[(Math.random() * (pool.length || RECIPES.length)) | 0];
  S.step = 0;

  const need = [...new Set(S.recipe.steps)];
  const slots = Math.min(need.length + 2 + Math.floor(S.served / 2), 8);
  const decoys = shuffle(ING_KEYS.filter(k => !need.includes(k))).slice(0, Math.max(0, slots - need.length));
  const keys = shuffle([...need, ...decoys]);

  clearPalette();
  clearStack();

  S.ringPhase = Math.random() * Math.PI * 2;
  const pts = ellipseRing(keys.length, S.ringPhase);
  keys.forEach((key, i) => {
    const inner = ING[key].build();
    const node = new THREE.Group();
    node.add(tilted(inner));
    const lab = labelSprite(ING[key].name);
    lab.position.set(0, -.085, .01);   // just below the model on the card, not lifted toward the camera
    node.add(lab);
    node.position.set(pts[i][0], pts[i][1], LIFT);
    node.scale.setScalar(.001);
    paletteRoot.add(node);

    const item = { key, node, inner, label:lab, home:node.position.clone(), alive:true };
    inner.traverse(o => { if (o.isMesh) o.userData.item = item; });
    S.items.push(item);

    // staggered entrance
    tw(.42, EASE.pop, (k) => node.scale.setScalar(Math.max(k, .001)), null, i * .05);
  });

  // Double base time and reduce per-order drain for child-friendly pacing
  S.timeMax = Math.max(14, 12 + S.recipe.steps.length * 3.4 - S.served * .1);
  S.timeLeft = S.timeMax;
  S.lastTickSec = -1;
  renderTicket();
  el.ticket.classList.add('on');
}

function clearPalette(){
  S.items.forEach(it => { it.alive = false; disposeTree(it.node); paletteRoot.remove(it.node); });
  S.items = [];
}
function clearStack(){
  S.stack.forEach(n => { disposeTree(n); buildSpot.remove(n); });
  S.stack = [];
}

function renderTicket(){
  el.orderNum.textContent = `ORDER #${S.served + 1}`;
  el.recipeName.textContent = S.recipe.name;

  // Draw the finished dish preview (goal)
  const canvas = drawFinishedDish(S.recipe, 140);
  el.nextCard.innerHTML = '';
  el.nextCard.appendChild(canvas);

  // Progress: filled dots for done, outlined for pending, text name for current
  el.progress.innerHTML = S.recipe.steps.map((k, i) => {
    if (i === S.step){
      // Current step: show ingredient name as pulsing text
      return `<div class="dot now">${ING[k].name}</div>`;
    } else {
      // Done or pending: show dot
      const cls = i < S.step ? 'dot done' : 'dot';
      const bg = i < S.step ? hex(ING[k].color) : 'transparent';
      return `<div class="${cls}" style="background:${bg}${i < S.step ? ';border-color:transparent' : ''}"></div>`;
    }
  }).join('');
}

function popText(worldObj, text, color, big){
  if (!activeCamera) return;
  const v = new THREE.Vector3();
  worldObj.getWorldPosition(v).project(activeCamera);
  const d = document.createElement('div');
  d.className = 'pop'; d.textContent = text;
  d.style.color = color;
  if (big) d.style.fontSize = '25px';
  d.style.left = `${(v.x * .5 + .5) * 100}%`;
  d.style.top  = `${(-v.y * .5 + .5) * 100}%`;
  el.pops.appendChild(d);
  setTimeout(() => d.remove(), 880);
}

function sparkle(at, color){
  const mt = new THREE.MeshBasicMaterial({ color, transparent:true });
  for (let i = 0; i < 12; i++){
    const p = m(GEO.ico, mt.clone(), [.012,.012,.012]);
    p.position.copy(at);
    fx.add(p);
    const a = Math.random() * Math.PI * 2, sp = .1 + Math.random() * .13;
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp, vz = .08 + Math.random() * .14;
    tw(.62, EASE.out, (k) => {
      p.position.set(at.x + vx * k, at.y + vy * k, at.z + vz * k - .16 * k * k);
      p.material.opacity = 1 - k;
      p.scale.setScalar(.012 * (1 - k * .5));
    }, () => { p.material.dispose(); fx.remove(p); });
  }
  mt.dispose();  // Dispose base material after clones are made
}

/** Correct pick: fly the ingredient into the build stack. */
function acceptItem(item){
  const idx = S.step;
  item.alive = false;
  S.items = S.items.filter(x => x !== item);
  item.label.visible = false;

  const from = item.node.position.clone();
  const to = new THREE.Vector3(0, 0, LIFT + .014 + idx * .026);
  const node = item.node;
  paletteRoot.remove(node);
  buildSpot.add(node);
  S.stack.push(node);

  Sfx.step(idx, S.recipe.steps.length);
  buzz(16);
  popText(node, ING[item.key].name, '#43d6a3');

  tw(.38, EASE.io, (k) => {
    node.position.lerpVectors(from, to, k);
    node.position.z += Math.sin(k * Math.PI) * .13;        // arc
    node.rotation.z = k * Math.PI * 2;
    node.scale.setScalar(1 - .12 * Math.sin(k * Math.PI));
  }, () => { node.rotation.z = 0; node.scale.setScalar(1); });

  S.step++;
  S.score += 60 + Math.round(40 * (S.timeLeft / S.timeMax));

  // Only update ticket if there are more steps; completeOrder will start a new order
  if (S.step < S.recipe.steps.length) renderTicket();

  if (S.step >= S.recipe.steps.length) completeOrder();
}

function completeOrder(){
  S.busy = true;
  const speedBonus = Math.round(240 * (S.timeLeft / S.timeMax));
  S.streak++;
  S.bestStreak = Math.max(S.bestStreak, S.streak);
  const mult = 1 + Math.floor(S.streak / 3) * .5;
  const gained = Math.round((300 + speedBonus) * mult);
  S.score += gained;
  S.served++;

  Sfx.good(); buzz([18, 40, 18]);
  el.banner.querySelector('b').textContent = S.streak > 1 ? `${S.streak} IN A ROW!` : 'ORDER UP!';
  el.banner.querySelector('span').textContent =
    `+${gained}${mult > 1 ? `  (×${mult.toFixed(1)})` : ''}`;
  el.banner.classList.remove('on'); void el.banner.offsetWidth;
  el.banner.classList.add('on');
  el.ticket.classList.remove('on');

  // collapse the raw stack, then pop in the finished sushi
  S.stack.forEach((n, i) => tw(.3, EASE.io, (k) => {
    n.scale.setScalar(1 - k); n.position.z -= k * .01 * i;
  }));

  const done = finishedSushi(S.recipe.form, S.recipe.top);
  const holder = new THREE.Group();
  holder.add(tilted(done));
  holder.position.set(0, 0, LIFT + .02);
  holder.scale.setScalar(.001);
  buildSpot.add(holder);
  sparkle(new THREE.Vector3(0, 0, LIFT + .06), 0xffd77a);

  tw(.55, EASE.pop, (k) => {
    holder.scale.setScalar(Math.max(k, .001));
    done.rotation.y = k * Math.PI * 2;
  });
  tw(1.5, EASE.out, (k) => { holder.position.z = LIFT + .02 + k * .05; }, () => {
    tw(.3, EASE.io, (k) => holder.scale.setScalar(1 - k), () => {
      done.traverse(o => { if (o.isMesh) o.material.dispose(); });
      buildSpot.remove(holder);
      S.busy = false;
      if (S.phase === 'playing') buildOrder();
    });
  });
}

/** Wrong pick or timeout. */
function penalise(reason, item){
  S.tries--;
  S.streak = 0;
  Sfx.bad(); buzz(160);
  el.flash.classList.add('on');
  setTimeout(() => el.flash.classList.remove('on'), 110);
  el.ticket.classList.remove('shake'); void el.ticket.offsetWidth;
  el.ticket.classList.add('shake');
  [...el.tries.querySelectorAll('.try')].forEach((d, i) =>
    d.classList.toggle('gone', i >= S.tries));

  if (item){
    popText(item.node, 'WRONG', '#ff5d5d', true);
    const home = item.home.clone();
    tw(.45, EASE.out, (k) => {
      item.node.position.set(home.x + Math.sin(k * 34) * .022 * (1 - k), home.y, home.z);
    });
    // Several meshes share one material (rice grains, sesame, ginger), and a
    // second wrong tap can land mid-flash, so remember the true colour once
    // per material rather than reading back a colour that is already red.
    const mats = new Set();
    item.inner.traverse(o => { if (o.isMesh) mats.add(o.material); });
    mats.forEach(mt => {
      mt.userData.flashOrig ??= mt.color.getHex();
      mt.color.setHex(0xff3b3b);
      clearTimeout(mt.userData.flashTimer);
      mt.userData.flashTimer = setTimeout(() => {
        mt.color.setHex(mt.userData.flashOrig);
        delete mt.userData.flashOrig;
      }, 260);
    });
  } else {
    showStatus("⏱️", 'Time ran out');
    setTimeout(() => showStatus(''), 1200);
  }

  if (S.tries <= 0) return gameOver(reason === 'time' ? 'Ran out of time.' : 'Too many wrong ingredients.');
  if (reason === 'time') buildOrder();          // buildOrder() clears the board itself
}

// ------------------------------------------------------- game lifecycle
function startGame(){
  Object.assign(S, { phase:'playing', score:0, shown:0, tries:START_TRIES, served:0,
                     streak:0, bestStreak:0, busy:false, step:0 });
  clearPalette(); clearStack();
  [...el.tries.querySelectorAll('.try')].forEach(d => d.classList.remove('gone'));
  el.over.hidden = el.gate.hidden = true;
  document.body.classList.add('ingame');
  el.score.textContent = '0';
  buildOrder();
  showStatus(S.tracked ? '' : '📷 🃏');
  el.scanGuide.classList.toggle('on', !S.tracked);
}

function gameOver(why){
  S.phase = 'over';
  clearPalette(); clearStack();
  el.ticket.classList.remove('on');
  Sfx.over();
  const b = Math.max(best(), S.score);
  setBest(b);
  el.finalScore.textContent = S.score.toLocaleString();
  el.finalServed.textContent = S.served;
  el.finalStreak.textContent = S.bestStreak;
  el.finalBest.textContent = b.toLocaleString();
  el.overMsg.textContent = why;
  el.over.hidden = false;
  showStatus('');
}

function update(dt){
  updateTweens(dt);

  // rolling score counter
  if (S.shown !== S.score){
    S.shown += Math.max(1, Math.ceil((S.score - S.shown) * .18));
    if (S.shown > S.score) S.shown = S.score;
    el.score.textContent = S.shown.toLocaleString();
  }

  // gentle idle motion so the board never looks frozen
  // + highlight the NEXT needed ingredient with pulsing scale and glow
  const needKey = S.phase === 'playing' && !S.busy && S.tracked ? S.recipe.steps[S.step] : null;
  S.items.forEach((it, i) => {
    it.node.rotation.z = Math.sin(performance.now() / 1000 * .7 + i) * .12;

    // Visual cue: pulse and glow the correct ingredient
    if (needKey && it.key === needKey && it.alive){
      const pulse = Math.sin(performance.now() / 600) * 0.5 + 0.5;
      it.node.scale.setScalar(0.95 + 0.15 * pulse);
      it.inner.traverse(o => {
        if (o.isMesh){
          const original = o.material.userData.originalEmissiveIntensity || 0;
          // Preserve original emissive color if it exists (wasabi), else use ingredient color
          if (original > 0) {
            // Has built-in glow (wasabi) — boost its intensity, keep its color
            o.material.emissiveIntensity = original + 0.3 * pulse;
          } else {
            // No built-in glow — pulse with ingredient color
            o.material.emissive.set(ING[needKey].color);
            o.material.emissiveIntensity = 0.3 * pulse;
          }
        }
      });
    } else if (it.alive){
      // Reset non-highlighted items to their original emissive state
      it.node.scale.setScalar(1);
      it.inner.traverse(o => {
        if (o.isMesh) {
          o.material.emissiveIntensity = o.material.userData.originalEmissiveIntensity || 0;
        }
      });
    }
  });

  // Billboard transform: orient buildSpot so stacked layers are visible edge-on and
  // aligned vertically on screen, rather than colinear with the view (invisible).
  // Reuses pre-allocated objects from bb to avoid per-frame GC pressure.
  if (activeCamera && S.stack.length > 1) {
    activeCamera.getWorldPosition(bb.tempPos);
    bb.cameraLocalPos.copy(bb.tempPos);
    board.worldToLocal(bb.cameraLocalPos);
    bb.stackCenter.set(0, 0, LIFT + .014 + (S.stack.length - 1) * .026 / 2);
    bb.d.subVectors(bb.cameraLocalPos, bb.stackCenter);
    const distSq = bb.d.lengthSq();
    if (distSq >= 0.0001) {
      bb.d.normalize();
      activeCamera.getWorldQuaternion(bb.tempQuat);
      board.getWorldQuaternion(bb.boardQuat);
      bb.localQuat.copy(bb.boardQuat).invert().multiply(bb.tempQuat);
      bb.camUp.set(0, 1, 0).applyQuaternion(bb.localQuat);
      const dot = bb.camUp.dot(bb.d);
      bb.u.copy(bb.camUp).addScaledVector(bb.d, -dot);
      if (bb.u.lengthSq() < 0.0001) {
        bb.u.set(bb.camUp.x, bb.camUp.y, 0);
        if (bb.u.lengthSq() < 0.0001) bb.u.set(0, 1, 0);
      }
      bb.u.normalize();
      bb.targetQuat.setFromUnitVectors(bb.localZ, bb.u);
      buildSpot.quaternion.slerp(bb.targetQuat, 0.12);
    }
  }

  if (S.phase !== 'playing' || S.busy) return;

  if (!S.tracked) return;                       // pause, don't punish

  S.timeLeft -= dt;
  const frac = Math.max(0, S.timeLeft / S.timeMax);
  el.barFill.style.transform = `scaleX(${frac})`;
  el.bar.classList.toggle('low', frac < .3);

  // once per whole second in the last 30%, so running out is audible
  const sec = Math.ceil(S.timeLeft);
  if (frac < .3 && frac > 0 && sec !== S.lastTickSec){ S.lastTickSec = sec; Sfx.tick(); }

  if (S.timeLeft <= 0){
    S.timeLeft = 0;
    penalise('time', null);
  }
}

// --------------------------------------------------------------- input
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let activeCamera = null;

function onTap(ev){
  if (S.phase !== 'playing' || S.busy || !S.tracked || !activeCamera) return;
  const t = ev.changedTouches ? ev.changedTouches[0] : ev;
  ndc.x =  (t.clientX / window.innerWidth)  * 2 - 1;
  ndc.y = -(t.clientY / window.innerHeight) * 2 + 1;
  ray.setFromCamera(ndc, activeCamera);
  const hits = ray.intersectObjects(S.items.map(i => i.inner), true);
  if (!hits.length) return;
  const item = hits[0].object.userData.item;
  if (!item || !item.alive) return;
  if (item.key === S.recipe.steps[S.step]) acceptItem(item);
  else penalise('wrong', item);
}
window.addEventListener('pointerdown', onTap, { passive:true });

// ------------------------------------------------------------ backends
let lastT = 0;
function frame(renderer, scene, camera){
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, .05);
  lastT = now;
  update(dt);
  if (DEBUG) el.dbg.textContent =
    `${DEMO ? 'demo' : 'ar'} | fps ${(1 / Math.max(dt, 1e-3)).toFixed(0)} | tracked ${S.tracked}` +
    ` | items ${S.items.length} | tweens ${tweens.length}`;
  renderer.render(scene, camera);
}

async function startAR(){
  const { MindARThree } = await import('mindar-image-three');
  const mindar = new MindARThree({ container: el.ar, imageTargetSrc: TARGET_SRC,
                                   uiScanning:'no', uiLoading:'no',
                                   // One-euro filter; MindAR measures time in ms, so
                                   // 0.001 is a 1 Hz cutoff at rest (its default).
                                   // Values like 1.0 or 3.0 mean 1-3 kHz: no smoothing.
                                   filterMinCF: 0.001, filterBeta: 1000,
                                   warmupTolerance: 8, missTolerance: 10 });
  const { renderer, scene, camera } = mindar;
  activeCamera = camera;
  const anchor = mindar.addAnchor(0);
  anchor.group.add(board);
  anchor.onTargetFound = () => {
    S.tracked = true;
    showStatus('');
    el.scanGuide.classList.remove('on');
    if (S.phase === 'idle') showMenu();       // first lock-on: reveal the main page
  };
  anchor.onTargetLost  = () => {
    S.tracked = false;
    if (S.phase === 'playing'){
      showStatus('📷 🃏');
      el.scanGuide.classList.add('on');
    }
  };
  await mindar.start();
  if (!S.tracked) el.scanGuide.classList.add('on');  // Show scanning guide until the target locks

  /* MindAR normalises anchor space to the target image's WIDTH (see the
     postMatrix it builds from markerDimensions), so the card's height is
     1/aspect and a non-square target needs the ring re-fitted. Reading the real
     dimensions here means swapping in any `.mind` just works. */
  const dims = mindar.controller?.markerDimensions?.[0];
  if (dims && dims[0] && dims[1]){
    applyTargetAspect(dims[0] / dims[1]);
    relayout();
    if (DEBUG) console.log(`target ${dims[0]}x${dims[1]}  ring rx=${RING.rx.toFixed(3)} ry=${RING.ry.toFixed(3)}`);
  }

  lastT = performance.now();
  renderer.setAnimationLoop(() => frame(renderer, scene, camera));
}

async function startDemo(){
  const stream = await navigator.mediaDevices.getUserMedia(
    { video:{ facingMode:'environment' }, audio:false });
  const video = document.createElement('video');
  Object.assign(video, { srcObject:stream, playsInline:true, muted:true, autoplay:true });
  video.setAttribute('playsinline','');
  Object.assign(video.style,
    { position:'fixed', inset:'0', width:'100%', height:'100%', objectFit:'cover' });
  el.ar.appendChild(video);
  await video.play();

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  Object.assign(renderer.domElement.style, { position:'fixed', inset:'0' });
  el.ar.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .01, 20);
  activeCamera = camera;

  const holder = new THREE.Group();
  holder.rotation.x = -Math.PI / 2.9;
  holder.add(board);
  scene.add(holder);

  // `fov` is the VERTICAL field of view, so on a portrait phone (aspect ~0.46)
  // the horizontal view is far narrower. Fit to whichever axis is tighter or
  // the board's sides fall outside the frame; never magnify past 1:1.
  const DIST = 1.05;
  function fitBoard(){
    const halfH = DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = halfH * camera.aspect;
    // The ring is an ellipse now, so constrain each axis by its own extent.
    // Ignoring the holder's tilt only ever makes the vertical fit safer.
    const s = Math.min(1, .86 * Math.min(halfW / FIT.rx, halfH / FIT.ry));
    holder.scale.setScalar(s);
    holder.position.set(0, -.08 * s, -DIST);
  }
  fitBoard();
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    fitBoard();
  });

  lastT = performance.now();
  renderer.setAnimationLoop(() => frame(renderer, scene, camera));
}

// ---------------------------------------------------------------- boot
/* Flow: page opens -> camera viewfinder (scan the sushi picture) -> first
   lock-on shows the main page -> Start begins the game. Demo mode has nothing
   to scan, so it shows the main page as soon as the camera is up. */
function showMenu(){
  showStatus('');
  el.gate.hidden = false;
}

let booted = false;
async function boot(){
  if (booted) return;
  booted = true;
  el.gate.hidden = true;
  el.dbg.hidden = !DEBUG;
  showStatus('📷');
  try {
    if (DEMO) await startDemo(); else await startAR();
    showStatus('');
    if (DEMO || S.tracked) showMenu();
  } catch (e){
    booted = false;
    fail(/NotAllowedError|Permission/i.test(String(e))
      ? 'Camera permission was denied.\n\nEnable it for this site in your browser settings, then retry.'
      : /targets?\.mind|fetch|404|Failed to load/i.test(String(e))
        ? `Could not load the image target:\n  ${TARGET_SRC}\n\nPut targets.mind next to index.html, ` +
          `or append ?demo=1 to play without a target.\n\n${e.message || e}`
        : e);
  }
}

// Audio can only be unlocked from a tap, so it waits for Start rather than boot.
el.startBtn.addEventListener('click', () => { Sfx.unlock(); el.gate.hidden = true; startGame(); });
el.againBtn.addEventListener('click', () => { Sfx.unlock(); startGame(); });
el.retryBtn.addEventListener('click', () => { el.err.hidden = true; booted ? showMenu() : boot(); });
if (DEMO) el.gateHint.innerHTML =
  'Demo mode — no image target needed. Remove <code>?demo=1</code> once you have printed the target.';
window.addEventListener('error', e => fail(e.error || e.message));
window.addEventListener('unhandledrejection', e => fail(e.reason));
window.addEventListener('load', boot);        // open the viewfinder straight away

export { S, ING, RECIPES, update, startGame, buildOrder, acceptItem, penalise, board, paletteRoot, buildSpot, tweens, gameOver, RING, FIT, applyTargetAspect, relayout, ellipseRing, lockRing, matMesh };
