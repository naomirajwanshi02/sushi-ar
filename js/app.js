// Sushi Chef: scan the card → the sushi bar opens → build orders against the clock.
// Rules live in rules.js, the 3D board in stage.js; this file is the screens and the HUD.
//
// ?demo=1   no card: the board floats in front of the camera from the start
// ?target=./other.mind   use another compiled card

import { INGREDIENTS, RECIPES, PACE } from './data.js';
import { createGame } from './rules.js';
import * as Stage from './stage.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');

const store = {
  get(k, d){ try { const v = localStorage.getItem('sushichef.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem('sushichef.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

const G = createGame();
const UI = { paused: false, lastTick: -1, started: false, touring: false };

const show = (id) => document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('on', el.id === id));
const overlay = (id, on) => $(id).classList.toggle('on', on);

// ------------------------------------------------------------ odometer (Ramen_Builder's)
const ODO_DIGITS = 6;
function buildOdo(el, digits){
  el.innerHTML = Array.from({ length: digits }, () =>
    `<div class="d"><span>${Array.from({ length: 10 }, (_, n) => `<i>${n}</i>`).join('')}</span></div>`).join('');
}
function setOdo(el, value){
  const h = el.firstChild.offsetHeight || 26;
  const s = String(Math.min(value, 10 ** el.children.length - 1)).padStart(el.children.length, '0');
  [...el.children].forEach((d, i) => {
    d.firstChild.style.transform = `translateY(${-Number(s[i]) * h}px)`;
    d.style.opacity = i < el.children.length - String(value).length ? '.28' : '1';
  });
}
function lockScore(){
  const odo = $('odo');
  odo.classList.remove('lock'); void odo.offsetWidth; odo.classList.add('lock');
  $('scoreBox').classList.add('locked'); buzz(20);
  clearTimeout(lockScore.t);
  lockScore.t = setTimeout(() => $('scoreBox').classList.remove('locked'), 1100);
}
// The odometer shows what has landed; points still flying in are added when they arrive.
let shown = 0;
function showScore(value, lock = false){ shown = value; setOdo($('odo'), shown); if (lock) lockScore(); }

// ------------------------------------------------------------ HUD helpers
// A life is one waiting customer's plate: a little salmon nigiri.
const LIFE = `<svg viewBox="0 0 24 20" aria-hidden="true"><ellipse cx="12" cy="13.5" rx="9" ry="4.4" fill="#f6eddb" stroke="#3b2a1c" stroke-width="1.3"/><path d="M3 10.5q9-6.5 18 0q-9 3.4-18 0Z" fill="#e8622c" stroke="#3b2a1c" stroke-width="1.3"/><path d="M7.5 8.6l1.6 2.3M11.4 7.7l1.7 2.6M15.3 7.9l1.6 2.4" stroke="#ffd7c0" stroke-width="1" stroke-linecap="round"/></svg>`;
function renderLives(){
  $('lives').innerHTML = Array.from({ length: PACE.lives }, () => LIFE).join('');
  [...$('lives').children].forEach((el, i) => el.classList.toggle('gone', i >= G.lives));
}
function popup(text, cls = 'mid', y = 0.42){
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.style.top = `${Math.round(innerHeight * y)}px`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}
function tagAt({ x, y }, text, cls = ''){
  const el = document.createElement('div');
  el.className = `tag ${cls}`;
  el.textContent = text;
  el.style.left = `${Math.max(70, Math.min(innerWidth - 70, x))}px`;
  el.style.top = `${Math.max(120, Math.min(innerHeight - 80, y))}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1050);
}
function flyPoints(points, done){
  const from = Stage.plateScreen();
  const to = $('odo').getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'pts';
  el.textContent = `+${points}`;
  el.style.left = `${from.x - 30}px`;
  el.style.top = `${from.y - 20}px`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transform = `translate(${to.left - from.x + 30}px, ${to.top - from.y + 20}px) scale(.7)`;
    el.style.opacity = '.2';
  }));
  setTimeout(() => { el.remove(); done(); }, 820);
}

// ------------------------------------------------------------ the order card
function newOrder(){
  const r = G.newOrder();
  Stage.newPlate(r);
  Stage.setTokens(G.tokens);
  $('ordName').textContent = r.name;
  $('ordPic').src = Stage.plateIcon(r);
  UI.lastTick = -1;
  renderTicket();
}

// Every ingredient in order, left to right, with a dash between each. The ones that can be
// tapped now are outlined in red.
function renderTicket(){
  const wanted = G.wanted();
  $('ticket').innerHTML = G.need.map((id, i) => {
    const done = G.got.includes(id), next = wanted.includes(id);
    // the dash travels with the chip after it, so a wrapped row never ends on a dash
    return `<div class="step">${i ? '<span class="sep"></span>' : ''}<div class="chip${done ? ' done' : ''}${next ? ' next' : ''}"><img src="${Stage.ingredientIcon(id)}" alt=""><span>${INGREDIENTS[id].short}</span></div></div>`;
  }).join('');
  $('ordRead').textContent = `${G.got.length}/${G.need.length}`;
  requestAnimationFrame(layoutFree);
}

// ------------------------------------------------------------ picking
function onPick(id){
  if (UI.paused || UI.touring || G.phase !== 'play') return;
  const at = Stage.tokenScreen(id);
  const res = G.pick(id);
  if (!res.ok){
    if (res.reason === 'idle') return;
    Stage.wrong(id); buzz(80);
    tagAt(at, `✕ ${res.message}`, 'bad');
    return;
  }
  Stage.accept(id);
  Stage.hint(null);
  buzz(12);
  showScore(shown + 10);
  renderTicket();
  if (res.done) setTimeout(serve, 450);
}

async function serve(){
  const r = G.recipe;
  const out = G.serve();
  buzz([20, 40, 20]);
  popup('Order up!', 'big', 0.36);
  flyPoints(out.total, () => showScore(G.score, true));
  Stage.clearTokens();
  await Stage.serve(r);
  if (G.phase === 'between' && UI.started) newOrder();
}

async function timedOut(over){
  buzz([60, 40, 60]);
  popup('Too slow! The customer left', 'mid', 0.36);
  renderLives();
  Stage.clearTokens();
  await Stage.dump();
  if (over) gameOver();
  else if (UI.started) newOrder();
}

// ------------------------------------------------------------ loop: the clock
let lastT = 0;
function loop(t){
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
  lastT = t;
  if (UI.started && !UI.paused && !UI.touring && G.phase === 'play'){
    const res = G.tick(dt);
    const frac = Math.max(0, G.timeLeft / G.timeMax);
    $('timerBar').style.transform = `scaleX(${frac})`;
    $('timer').classList.toggle('hot', frac < 0.3);
    const sec = Math.ceil(G.timeLeft);
    if (frac < 0.3 && sec !== UI.lastTick){ UI.lastTick = sec; }
    if (G.showHint()) Stage.hint(G.wanted());
    if (res) timedOut(res === 'over');
  }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------ flow
// Browsers built into other apps (Instagram, WhatsApp, Facebook, TikTok…) often refuse the
// camera. Spot them, and say how to open the page in the phone's real browser.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Twitter|Pinterest|; wv\)/i.test(navigator.userAgent);
const OPEN_IN_BROWSER = 'Tap the ⋯ or share menu and choose “Open in Safari” or “Open in Chrome”.';
function noCamera(text){
  $('scanStatus').textContent = text;
  $('scanRetry').hidden = false;
  $('copyLink').hidden = !IN_APP;
}
async function openScan(){
  overlay('guide', true);
  $('scanRetry').hidden = true;
  if (!DEMO && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)){
    return noCamera(IN_APP ? `This app's browser can't use the camera. ${OPEN_IN_BROWSER}`
      : 'This browser can’t use the camera here. Open the page in Safari or Chrome.');
  }
  try {
    await Stage.start($('ar'), {
      demo: DEMO,
      onStatus: (s) => { $('scanStatus').textContent = s; },
      onFound, onPick,
    });
  } catch (err){
    console.error(err);
    const msg = String(err?.message || err?.name || err || '');
    noCamera(IN_APP ? `This app's browser didn't let the game use the camera. ${OPEN_IN_BROWSER}`
      : /NotAllowed|Permission/i.test(msg)
      ? 'The camera was blocked. Tap the “aA” or lock icon next to the address, allow the camera, then tap Try again.'
      : /mind|fetch|404/i.test(msg) ? `Could not load the card data (${msg}).`
      : 'The camera did not start. Close other apps that use it and tap Try again.');
  }
}
function onFound(){
  overlay('guide', false);
  buzz(40);
  overlay('found', true);
  setTimeout(() => { overlay('found', false); startGame({ tour: true }); }, 1300);
}

// ------------------------------------------------------------ how to play (as in Ramen_Builder)
// A short tour points at each part of the screen. The clock waits until it's done.
const TOUR = [
  { title: 'Your order', text: 'This is the sushi to make. Add the ingredients <b>from left to right</b>. The ones outlined in red are next. Finish before the bar at the bottom runs out!',
    rect: () => $('order').getBoundingClientRect() },
  { title: 'Your sushi', text: 'Everything you pick goes here, and the sushi builds up step by step. When it\'s finished it is <b>served</b>, and the next order comes in.',
    rect: () => Stage.plateRect() },
  { title: 'The ingredients', text: '<b>Tap a dish</b> to add what\'s on it. Some are not in the order, and pickled ginger never goes in sushi. A wrong tap <b>costs time</b>.',
    rect: () => Stage.tokensRect() },
  { title: 'Score and lives', text: 'Your <b>score</b> goes up with every plate. An order that runs out of time costs one of your <b>3 lives</b>. It gets faster as you go!',
    rect: () => document.querySelector('.hud.top').getBoundingClientRect() },
];
let tourStep = 0;
function showTour(){
  if (!UI.touring) return;
  tourStep = 0;
  overlay('howto', true);
  renderTour();
}
function renderTour(){
  const step = TOUR[tourStep];
  const r = step.rect();
  const pad = 6;
  Object.assign($('spot').style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  $('coachTitle').textContent = step.title;
  $('coachText').innerHTML = step.text;
  $('coachNext').textContent = tourStep === TOUR.length - 1 ? "Let's cook!" : 'Next';
  // The card goes above or below the spotlight, whichever has more room. On a short
  // landscape screen neither fits, so it goes beside it instead.
  const coach = $('coach');
  Object.assign(coach.style, { left: '', right: '', width: '', margin: '' });
  let h = coach.offsetHeight || 170;
  const above = r.top, below = innerHeight - (r.top + r.height);
  if (Math.max(above, below) >= h + 28){
    coach.style.top = below > above ? `${Math.min(innerHeight - h - 12, r.top + r.height + 16)}px` : `${Math.max(12, r.top - h - 16)}px`;
  } else {
    const leftRoom = r.left, rightRoom = innerWidth - (r.left + r.width);
    const w = Math.max(220, Math.min(400, Math.max(leftRoom, rightRoom) - 28));
    Object.assign(coach.style, { width: `${w}px`, margin: '0', right: 'auto',
      left: `${rightRoom > leftRoom ? r.left + r.width + 14 : Math.max(8, r.left - 14 - w)}px` });
    h = coach.offsetHeight;
    coach.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, r.top + r.height / 2 - h / 2))}px`;
  }
  coach.style.animation = 'none'; void coach.offsetWidth; coach.style.animation = '';
}
function endTour(){
  overlay('howto', false);
  if (!UI.touring) return;
  UI.touring = false;
  G.timeLeft = G.timeMax;
  popup('Go!', 'big', 0.4);
}

function startGame({ tour = false } = {}){
  if (!DEMO) Stage.enableRoomLight();
  G.reset();
  Stage.reset();
  UI.started = true; UI.paused = false;
  buildOdo($('odo'), ODO_DIGITS); showScore(0);
  renderLives();
  show(null);
  overlay('hud', true);
  requestAnimationFrame(layoutFree);
  newOrder();
  UI.touring = tour;
  if (tour) setTimeout(showTour, 900);   // let the board settle first
}
function pause(){ if (!UI.started) return; UI.paused = true; show('pause'); }
function resume(){ UI.paused = false; show(null); }

function gameOver(){
  UI.started = false;
  G.phase = 'over';
  overlay('hud', false);
  Stage.reset();
  const best = store.get('best', 0), isBest = G.score > best;
  if (isBest) store.set('best', G.score);
  $('finalScore').textContent = G.score.toLocaleString();
  $('stPlates').textContent = G.served;
  $('stBest').textContent = Math.max(best, G.score).toLocaleString();
  const made = RECIPES.filter((r) => G.learned.has(r.id));
  $('learned').textContent = made.length ? `You made ${made.length} different piece${made.length === 1 ? '' : 's'} of sushi:` : 'Every chef starts somewhere. Try again!';
  $('made').innerHTML = made.map((r) => `<img src="${Stage.plateIcon(r)}" alt="${r.name}" title="${r.name}">`).join('');
  $('newBest').classList.remove('on');
  show('over');
  if (isBest) setTimeout(() => $('newBest').classList.add('on'), 800);
}

// ------------------------------------------------------------ wiring
$('coachNext').addEventListener('click', () => { if (tourStep < TOUR.length - 1){ tourStep++; renderTour(); } else endTour(); });
$('coachSkip').addEventListener('click', endTour);
addEventListener('resize', () => { if (UI.touring && $('howto').classList.contains('on')) requestAnimationFrame(renderTour); });
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', () => { UI.paused = false; gameOver(); });
$('againBtn').addEventListener('click', () => startGame());
$('rescanBtn').addEventListener('click', () => location.reload());
$('scanRetry').addEventListener('click', () => location.reload());
$('errBtn').addEventListener('click', () => location.reload());
document.addEventListener('visibilitychange', () => { if (document.hidden && UI.started && !UI.paused) pause(); });

// MindAR's own listeners can throw after a failed camera start; the screen already says what to do.
const fromTracker = (s) => /mind-?ar/i.test(String(s));
addEventListener('error', (e) => { const s = e.error?.stack || e.message; if (fromTracker(s + e.filename)) return; $('errText').textContent = String(s); $('err').hidden = false; });
addEventListener('unhandledrejection', (e) => { const s = e.reason?.stack || e.reason; if (fromTracker(s)) return; $('errText').textContent = String(s); $('err').hidden = false; });

// The floating board fits whatever space the HUD leaves: below it on a portrait screen,
// beside it when the HUD becomes a side column in landscape.
function layoutFree(){
  const W = innerWidth, H = innerHeight;
  const hud = $('hud').classList.contains('on') ? document.querySelector('.hudstack').getBoundingClientRect() : null;
  let left = 0, top = 0, right = W, bottom = H;
  if (hud && hud.height){
    if (hud.width < W * 0.6 && hud.right < W * 0.6){ left = hud.right; bottom = H; } // side column
    else top = hud.bottom;
  }
  Stage.setFreeArea({ left, top, right, bottom });
}
addEventListener('resize', () => requestAnimationFrame(layoutFree));
addEventListener('orientationchange', () => setTimeout(layoutFree, 300));
if ('ResizeObserver' in window) new ResizeObserver(() => layoutFree()).observe(document.querySelector('.hudstack'));

$('copyLink').addEventListener('click', async () => {
  const url = location.href.split('?')[0];
  try { await navigator.clipboard.writeText(url); $('copyLink').textContent = 'Link copied'; }
  catch { prompt('Copy this link and open it in Safari or Chrome:', url); }
});

window.__sushi = { G, Stage, startGame, onPick, layoutFree, renderTicket };
requestAnimationFrame(loop);
openScan();
