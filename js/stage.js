// The 3D sushi bar: a hinoki board with ingredient dishes round the edge and the piece
// being built in the middle.
//
// Where the board is:
//   · While the card is tracked, the board sits on it (MindAR image tracking).
//   · When the card leaves the view, the board glides to a resting place in front of
//     the camera and the game carries on. When the card is seen again it glides back.
//   · ?demo=1 has no card at all: the board always floats.
//
// Spaces: `stage` is in MindAR's anchor space (card width = 1, card in the XY plane, +Z
// out of the card). `content` turns that into cm with y up, so models are built at real size.

import * as THREE from 'three';
import { setupRenderer, environment, stageLights, fitShadow, roomLight } from './look.js';
import { rawModel, assembly, finishedModel, boardModel, dishModel, BOARD, contactShadow } from './models.js';
import { snapshot, disposeStudio } from './icons.js';
import { INGREDIENTS } from './data.js';

const params = new URLSearchParams(location.search);
export const TARGET_SRC = params.get('target') || './targets.mind';

const R = {
  renderer: null, scene: null, camera: null, mindar: null, video: null, demo: false,
  tracked: false, lostFor: 0, blend: 0, haveAnchor: false,
  anchorM: new THREE.Matrix4(), floatM: new THREE.Matrix4(),
  stage: null, content: null, look: null, room: null,
  tokens: new Map(), plan: null, planRoot: null, extra: [],
  tweens: [], hintIds: new Set(), labels: null, onPick: null, onTrack: null, onFound: null, found: false,
  last: 0, floatDist: 2,
};

// ------------------------------------------------------------------ tweens
const EASE = {
  out: (t) => 1 - (1 - t) ** 3,
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  pop: (t) => (t < 0.6 ? EASE.out(t / 0.6) * 1.12 : 1.12 - 0.12 * EASE.out((t - 0.6) / 0.4)),
};
function tw(dur, ease, step, delay = 0){
  return new Promise((done) => R.tweens.push({ t: -delay, dur, ease, step, done }));
}
function runTweens(dt){
  for (let i = R.tweens.length - 1; i >= 0; i--){
    const T = R.tweens[i];
    T.t += dt;
    if (T.t < 0) continue;
    const k = Math.min(T.t / T.dur, 1);
    T.step(T.ease(k), k);
    if (k >= 1){ R.tweens.splice(i, 1); T.done(); }
  }
}
const TOKEN_SCALE = 1.22;
// The piece in the middle is shown larger than life too, more so for small nigiri.
const PLAN_SCALE = { nigiri: 1.55, gunkan: 1.55, hosomaki: 1.15, futomaki: 1.1, uramaki: 1.1 };
const disposeTree = (o) => o.traverse((n) => { if (n.geometry) n.geometry.dispose(); });

// ------------------------------------------------------------------ scene
function buildScene(){
  R.stage = new THREE.Group();
  R.stage.matrixAutoUpdate = false;
  R.stage.visible = false;
  R.content = new THREE.Group();
  R.content.rotation.x = Math.PI / 2;      // model y-up → card +Z
  R.content.scale.setScalar(1 / BOARD.w);  // 30 cm board = card width
  R.stage.add(R.content);
  R.scene.add(R.stage);

  R.look = stageLights();
  R.content.add(R.look.rig);
  R.content.add(boardModel());
  const sh = contactShadow(BOARD.w * 1.15, BOARD.d * 1.25, 0.45); sh.position.y = 0.01; R.content.add(sh);
  R.planRoot = new THREE.Group();
  R.planRoot.position.y = BOARD.top;
  R.content.add(R.planRoot);
}

function setupRenderer2(renderer){
  setupRenderer(renderer);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  R.scene.environment = environment(renderer);
}

// ------------------------------------------------------------------ start: card (MindAR) or demo
export async function start(container, { demo = false, onFound, onStatus, onPick, onTrack } = {}){
  R.demo = demo; R.onFound = onFound; R.onPick = onPick; R.onTrack = onTrack;
  R.labels = document.createElement('div');
  R.labels.className = 'labels';
  if (demo) await startDemo(container, onStatus);
  else await startCard(container, onStatus);
  container.appendChild(R.labels);
  container.addEventListener('pointerdown', onPointer);
  R.last = performance.now();
  R.renderer.setAnimationLoop(frame);
}

async function startCard(container, onStatus){
  onStatus?.('Loading the card scanner…');
  const { MindARThree } = await import('mindar-image-three');
  const mindar = new MindARThree({
    container, imageTargetSrc: TARGET_SRC, uiScanning: 'no', uiLoading: 'no', uiError: 'no',
    filterMinCF: 0.001, filterBeta: 1000, warmupTolerance: 5, missTolerance: 10,
  });
  R.mindar = mindar;
  R.renderer = mindar.renderer; R.scene = mindar.scene; R.camera = mindar.camera;
  buildScene();
  setupRenderer2(R.renderer);
  const anchor = mindar.addAnchor(0);
  // MindAR blanks the anchor matrix the moment the card is lost, so keep our own copy.
  anchor.onTargetUpdate = () => { if (anchor.visible){ R.anchorM.copy(anchor.group.matrix); R.haveAnchor = true; } };
  anchor.onTargetFound = () => {
    R.tracked = true; R.lostFor = 0;
    if (!R.found){ R.found = true; R.blend = 1; R.stage.visible = true; R.onFound?.(); }
    R.onTrack?.(true);
  };
  anchor.onTargetLost = () => { R.tracked = false; };
  onStatus?.('Starting camera…');
  await mindar.start();
  R.video = mindar.video;
  // keep the board a natural size when it floats: about where the card was held
  const dims = mindar.controller?.markerDimensions?.[0];
  R.floatDist = (dims ? dims[0] : 1000) * 1.25;
  onStatus?.('Looking for the card…');
}

async function startDemo(container, onStatus){
  onStatus?.('Starting camera…');
  container.classList.add('nocam');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = document.createElement('video');
    Object.assign(v, { srcObject: stream, playsInline: true, muted: true, autoplay: true });
    v.setAttribute('playsinline', '');
    v.className = 'feed';
    container.appendChild(v);
    await v.play();
    R.video = v;
    container.classList.remove('nocam');
  } catch { /* no camera: the board floats over a plain background */ }
  R.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  R.renderer.domElement.className = 'stage';
  container.appendChild(R.renderer.domElement);
  R.scene = new THREE.Scene();
  R.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 50);
  buildScene();
  setupRenderer2(R.renderer);
  const fit = () => { R.renderer.setSize(innerWidth, innerHeight); R.camera.aspect = innerWidth / innerHeight; R.camera.updateProjectionMatrix(); };
  fit(); addEventListener('resize', fit);
  R.floatDist = 2;
  R.found = true; R.stage.visible = true;
  setTimeout(() => R.onFound?.(), 0);
}

export function stop(){
  try { R.renderer?.setAnimationLoop(null); } catch { /* fine */ }
  if (R.mindar){
    try { R.mindar.stop(); } catch { /* fine */ }
  }
  R.video?.srcObject?.getTracks?.().forEach((t) => t.stop());
}

// ------------------------------------------------------------------ where the board sits
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _s2 = new THREE.Vector3();
const _e = new THREE.Euler();
// Floating: in front of the camera, tilted back like a board on a table, sized to fit
// the screen below the order card.
function floatPose(t){
  const cam = R.camera, d = R.floatDist;
  const hh = d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), hw = hh * cam.aspect;
  const tilt = THREE.MathUtils.degToRad(52);
  // the board (1 wide, 2/3 deep) must fit the width and the lower ~55% of the height
  const s = Math.min(1.84 * hw, (1.1 * hh) / (0.667 * Math.cos(tilt) + 0.12));
  const sway = R.demo ? 0 : 0.012;
  _e.set(-tilt + Math.sin(t * 0.6) * sway, Math.sin(t * 0.43) * sway, 0);
  _q.setFromEuler(_e);
  _p.set(0, -hh * 0.3, -d);
  _s.setScalar(s);
  R.floatM.compose(_p, _q, _s);
}

function placeStage(dt, t){
  if (R.tracked) R.lostFor = 0; else R.lostFor += dt;
  // a short hold rides out a blink of lost tracking before the board starts to float
  const want = R.haveAnchor && (R.tracked || R.lostFor < 0.5) ? 1 : 0;
  R.blend += (want - R.blend) * (1 - Math.exp(-dt * 4.5));
  if (Math.abs(want - R.blend) < 0.002) R.blend = want;
  floatPose(t);
  const M = R.stage.matrix;
  if (R.blend >= 1) M.copy(R.anchorM);
  else if (R.blend <= 0) M.copy(R.floatM);
  else {
    R.floatM.decompose(_p, _q, _s);
    R.anchorM.decompose(_p2, _q2, _s2);
    const k = EASE.io(R.blend);
    _p.lerp(_p2, k); _q.slerp(_q2, k); _s.lerp(_s2, k);
    M.compose(_p, _q, _s);
  }
  R.stage.matrixWorldNeedsUpdate = true;
  const onCard = R.blend > 0.5;
  if (onCard !== R.onCardShown){ R.onCardShown = onCard; R.onTrack?.(onCard); }
}
export const onCard = () => R.blend > 0.5;

// ------------------------------------------------------------------ frame
const _v = new THREE.Vector3();
function frame(){
  const now = performance.now();
  const dt = Math.min((now - R.last) / 1000, 0.1);
  R.last = now;
  const t = now / 1000;
  if (R.found) placeStage(dt, t);
  runTweens(dt);
  // tokens breathe a little; wanted ones hop when the hint is on
  for (const tk of R.tokens.values()){
    if (!tk.alive) continue;
    const hop = R.hintIds.has(tk.id) ? Math.abs(Math.sin(t * 5 + tk.phase)) * 0.9 : 0;
    tk.model.position.y = tk.baseY + hop;
    tk.model.rotation.y = tk.spin + Math.sin(t * 0.7 + tk.phase) * 0.08;
  }
  if (R.room && R.video) R.room(R.video, now, dt);
  R.stage.updateMatrixWorld(true);
  const ws = R.content.getWorldScale(_v).x;
  fitShadow(R.look.key, ws);
  updateLabels();
  R.renderer.render(R.scene, R.camera);
}

// ------------------------------------------------------------------ ingredient dishes
// Dishes sit on an ellipse inside the board edge, evenly spaced by arc length.
function ringPoints(n, phase){
  const rx = 11.0, rz = 6.6, N = 400, cum = [0];
  const P = (a) => [rx * Math.cos(a), rz * Math.sin(a)];
  let prev = P(0);
  for (let i = 1; i <= N; i++){ const p = P((i / N) * Math.PI * 2); cum.push(cum[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
  const out = [];
  for (let k = 0; k < n; k++){
    const want = ((k / n + phase) % 1) * cum[N];
    let i = cum.findIndex((c) => c >= want); if (i < 0) i = N;
    out.push(P((i / N) * Math.PI * 2));
  }
  return out;
}

export function setTokens(ids){
  clearTokens(true);
  const pts = ringPoints(ids.length, 0.03 + Math.random() * 0.05);
  ids.forEach((id, i) => {
    const node = new THREE.Group();
    node.position.set(pts[i][0], BOARD.top, pts[i][1]);
    const dish = dishModel();
    const model = rawModel(id);
    const inner = new THREE.Group(); inner.scale.setScalar(TOKEN_SCALE); // dishes read better a bit larger than life
    const baseY = 0.32;
    model.position.y = baseY;
    const spin = Math.atan2(-pts[i][0], -pts[i][1]) * 0.35 + (Math.random() - 0.5) * 0.4;
    model.rotation.y = spin;
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 5.5, 16), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 2.0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.16, 8, 48).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#d4402a', transparent: true, opacity: 0, depthWrite: false }));
    ring.position.y = 0.66;
    inner.add(dish, model, ring);
    node.add(inner, hit);
    node.scale.setScalar(0.001);
    R.content.add(node);
    const label = document.createElement('div');
    label.className = 'tlabel';
    label.innerHTML = `${INGREDIENTS[id].short}<small>${INGREDIENTS[id].jp}</small>`;
    R.labels.appendChild(label);
    const tk = { id, node, model, hit, ring, label, baseY, spin, phase: i * 1.3, alive: true, out: Math.sign(pts[i][1]) || 1 };
    hit.userData.token = tk;
    R.tokens.set(id, tk);
    tw(0.45, EASE.pop, (k) => node.scale.setScalar(Math.max(k, 0.001)), i * 0.05);
  });
}

function removeToken(tk, animate = true){
  tk.alive = false;
  R.tokens.delete(tk.id);
  const done = () => { R.content.remove(tk.node); disposeTree(tk.node); tk.label.remove(); };
  tk.label.classList.add('gone');
  if (!animate) return done();
  return tw(0.3, EASE.io, (k) => tk.node.scale.setScalar(Math.max(1 - k, 0.001))).then(done);
}
export function clearTokens(now = false){
  R.hintIds.clear();
  return Promise.all([...R.tokens.values()].map((tk) => removeToken(tk, !now)));
}

export function hint(ids){ R.hintIds = new Set(ids || []); for (const tk of R.tokens.values()) tk.label.classList.toggle('hint', R.hintIds.has(tk.id)); }

// ------------------------------------------------------------------ the piece in the middle
export function newPlate(recipe){
  clearPlan();
  R.plan = assembly(recipe);
  R.plan.root.rotation.y = recipe.form === 'nigiri' || recipe.form === 'gunkan' ? 0.12 : 0;
  R.planRoot.add(R.plan.root);
  R.planRoot.scale.setScalar(PLAN_SCALE[recipe.form]);
  R.plan.recipe = recipe;
}
function clearPlan(){
  if (!R.plan) return;
  R.planRoot.remove(R.plan.root); disposeTree(R.plan.root);
  R.plan = null;
}

// A right pick: the ingredient lifts off its dish, arcs to the middle and becomes the
// next part of the piece. The dish then clears away.
export function accept(id){
  const tk = R.tokens.get(id);
  if (!tk || !R.plan) return;
  tk.alive = false;
  tk.label.classList.add('gone');
  R.hintIds.delete(id);
  const from = tk.model.getWorldPosition(new THREE.Vector3()); R.content.worldToLocal(from);
  const to = new THREE.Vector3(0, BOARD.top + 2.2, 0);
  const flyer = tk.model;
  flyer.parent.remove(flyer);
  flyer.position.copy(from);
  flyer.scale.setScalar(TOKEN_SCALE);
  R.content.add(flyer);
  tw(0.42, EASE.io, (k) => {
    flyer.position.lerpVectors(from, to, k);
    flyer.position.y += Math.sin(k * Math.PI) * 5;
    flyer.scale.setScalar(TOKEN_SCALE * (1 - 0.7 * k));
  }).then(() => { R.content.remove(flyer); disposeTree(flyer); });
  // the part drops into place as the flyer arrives
  const part = R.plan.add(id);
  if (part){
    part.visible = false;
    tw(0.32, EASE.out, (k) => { part.visible = true; part.position.y = (1 - k) * 2.2; part.scale.setScalar(0.85 + 0.15 * k); }, 0.34);
  }
  tw(0.3, EASE.io, (k) => tk.node.scale.setScalar(Math.max(1 - k, 0.001)), 0.25).then(() => {
    R.tokens.delete(id); R.content.remove(tk.node); disposeTree(tk.node); tk.label.remove();
  });
}

// A wrong pick: the dish shakes and flashes a red ring; the label turns red.
export function wrong(id){
  const tk = R.tokens.get(id);
  if (!tk) return;
  tk.label.classList.remove('bad'); void tk.label.offsetWidth; tk.label.classList.add('bad');
  const x0 = tk.node.position.x;
  tw(0.45, EASE.out, (k) => {
    tk.node.position.x = x0 + Math.sin(k * 30) * 0.5 * (1 - k);
    tk.ring.material.opacity = 0.9 * (1 - k);
  });
}

// Serving: the built piece gives way to the finished plate (a pair of nigiri, or the
// roll cut into six), which then slides off the front of the board.
export async function serve(recipe){
  const old = R.plan;
  R.plan = null;
  if (old){
    tw(0.3, EASE.io, (k) => old.root.scale.setScalar(Math.max(1 - k, 0.001))).then(() => { R.planRoot.remove(old.root); disposeTree(old.root); });
  }
  const plate = finishedModel(recipe);
  plate.scale.setScalar(0.001);
  R.planRoot.add(plate);
  await tw(0.55, EASE.pop, (k) => { plate.scale.setScalar(Math.max(k, 0.001)); plate.rotation.y = (1 - k) * 1.2; }, 0.2);
  await tw(1.0, (k) => k, () => {});
  await tw(0.5, EASE.io, (k) => { plate.position.z = k * 9; plate.position.y = Math.sin(k * Math.PI) * 1.5; plate.scale.setScalar(Math.max(1 - k, 0.001)); });
  R.planRoot.remove(plate); disposeTree(plate);
}

// Time ran out: the unfinished piece sinks away.
export async function dump(){
  const old = R.plan;
  R.plan = null;
  if (!old) return;
  await tw(0.6, EASE.io, (k) => { old.root.rotation.z = k * 0.5; old.root.position.y = -k * 1.5; old.root.scale.setScalar(Math.max(1 - k, 0.001)); });
  R.planRoot.remove(old.root); disposeTree(old.root);
}

export function reset(){ clearTokens(true); clearPlan(); }

// ------------------------------------------------------------------ labels and screen positions
function toScreen(v){
  v.project(R.camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, front: v.z < 1 };
}
function updateLabels(){
  for (const tk of R.tokens.values()){
    // the label sits on the outer side of its dish, away from the piece in the middle
    _v.set(tk.node.position.x, BOARD.top + 0.4, tk.node.position.z + tk.out * 3.9);
    R.content.localToWorld(_v);
    const s = toScreen(_v);
    tk.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
    tk.label.style.visibility = R.stage.visible && s.front ? 'visible' : 'hidden';
  }
}
export function tokenScreen(id){
  const tk = R.tokens.get(id);
  _v.set(0, 0, 0);
  if (tk){ _v.copy(tk.node.position); _v.y += 3; } else _v.set(0, BOARD.top + 3, 0);
  R.content.localToWorld(_v);
  return toScreen(_v);
}
export function plateScreen(){ _v.set(0, BOARD.top + 3, 0); R.content.localToWorld(_v); return toScreen(_v); }

// ------------------------------------------------------------------ taps
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(x, y){
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, R.camera);
  const hits = ray.intersectObjects([...R.tokens.values()].filter((t) => t.alive).map((t) => t.hit), false);
  return hits[0]?.object.userData.token || null;
}
function onPointer(ev){
  if (!R.found || !R.onPick) return;
  // a finger is bigger than a pixel: try the point, then a small ring round it
  let tk = pickAt(ev.clientX, ev.clientY);
  for (let i = 0; !tk && i < 8; i++){ const a = (i / 8) * Math.PI * 2; tk = pickAt(ev.clientX + Math.cos(a) * 16, ev.clientY + Math.sin(a) * 16); }
  if (tk) R.onPick(tk.id);
}

// ------------------------------------------------------------------ icons for the ticket
const iconCache = new Map();
export function ingredientIcon(id){
  if (!iconCache.has(id)){
    const g = new THREE.Group(); g.add(dishModel()); const m = rawModel(id); m.position.y = 0.32; g.add(m);
    iconCache.set(id, snapshot(g, 128)); disposeTree(g);
  }
  return iconCache.get(id);
}
export function plateIcon(recipe, size = 200){
  const key = `plate:${recipe.id}`;
  if (!iconCache.has(key)){ const g = finishedModel(recipe); iconCache.set(key, snapshot(g, size, { el: 40 })); disposeTree(g); }
  return iconCache.get(key);
}
export function warmIcons(ids, recipes){
  ids.forEach(ingredientIcon);
  recipes.forEach((r) => plateIcon(r));
  disposeStudio();
}

export function enableRoomLight(){ if (R.renderer && R.look) R.room = roomLight(R.look, R.renderer); }
export const debug = R;
