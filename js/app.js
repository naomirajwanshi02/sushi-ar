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
const UI = { paused: false, lastTick: -1, started: false };

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
function renderMult(bumped){
  const m = $('mult');
  m.dataset.m = G.mult;
  m.innerHTML = `<div>×${G.mult}<small>${G.streak ? `${G.streak} perfect` : 'combo'}</small></div>`;
  if (bumped){ m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
}
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
  $('ordNo').textContent = `Order ${String(G.served + 1).padStart(2, '0')}`;
  $('ordName').textContent = r.name;
  $('ordPic').src = Stage.plateIcon(r);
  UI.lastTick = -1;
  renderTicket();
}

// Stages left to right; a stage with several ingredients is boxed: those go in any order.
function renderTicket(){
  const r = G.recipe, si = G.stageIndex();
  $('ticket').innerHTML = r.stages.map((stage, i) => {
    const chips = stage.map((id) => {
      const done = G.got.includes(id), next = !done && i === si;
      return `<div class="chip${done ? ' done' : ''}${next ? ' next' : ''}" title="${INGREDIENTS[id].name}"><img src="${Stage.ingredientIcon(id)}" alt=""><span>${INGREDIENTS[id].short}</span></div>`;
    }).join('');
    return (i ? '<span class="sep"></span>' : '') + (stage.length > 1 ? `<div class="group" title="Any order">${chips}</div>` : chips);
  }).join('');
  const got = G.got.length, need = G.need.length;
  $('ordRead').textContent = `${got}/${need}`;
  const want = G.wanted();
  $('hint').innerHTML = G.done() ? 'Order up!'
    : want.length > 1 ? `Any order: <b>${want.map((id) => INGREDIENTS[id].short).join(' · ')}</b>`
    : `Tap the <b>${INGREDIENTS[want[0]].short}</b>`;
  requestAnimationFrame(layoutFree);
}

// ------------------------------------------------------------ picking
function onPick(id){
  if (UI.paused || G.phase !== 'play') return;
  const at = Stage.tokenScreen(id);
  const res = G.pick(id);
  if (!res.ok){
    if (res.reason === 'idle') return;
    Stage.wrong(id); buzz(80);
    tagAt(at, `✕ ${res.message}`, 'bad');
    renderMult(false);
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
  popup(out.perfect ? 'Perfect plate!' : 'Order up!', 'big', 0.36);
  flyPoints(out.total, () => showScore(G.score, true));
  renderMult(out.bumped);
  if (out.bumped) setTimeout(() => { popup(`${G.streak} perfect in a row!  ×${out.mult}`, 'mid', 0.5); }, 600);
  Stage.clearTokens();
  await Stage.serve(r);
  if (G.phase === 'between' && UI.started) newOrder();
}

async function timedOut(over){ buzz([60, 40, 60]);
  popup('Too slow! The customer left', 'mid', 0.36);
  renderLives(); renderMult(false);
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
  if (UI.started && !UI.paused && G.phase === 'play'){
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
  setTimeout(() => { overlay('found', false); openIntro(); }, 1300);
}
function openIntro(){
  $('heroDish').src = Stage.plateIcon(RECIPES[0], 320);
  show('intro');
}
function startGame(){
  if (!DEMO) Stage.enableRoomLight();
  G.reset();
  Stage.reset();
  UI.started = true; UI.paused = false;
  buildOdo($('odo'), ODO_DIGITS); showScore(0);
  renderLives(); renderMult(false);
  show(null);
  overlay('hud', true);
  requestAnimationFrame(layoutFree);
  newOrder();
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
  $('stStreak').textContent = G.maxStreak;
  $('stBest').textContent = Math.max(best, G.score).toLocaleString();
  const made = RECIPES.filter((r) => G.learned.has(r.id));
  $('learned').textContent = made.length ? `You made ${made.length} different piece${made.length === 1 ? '' : 's'} of sushi:` : 'Every chef starts somewhere. Try again!';
  $('made').innerHTML = made.map((r) => `<img src="${Stage.plateIcon(r)}" alt="${r.name}" title="${r.name}">`).join('');
  $('newBest').classList.remove('on');
  show('over');
  if (isBest) setTimeout(() => $('newBest').classList.add('on'), 800);
}

// ------------------------------------------------------------ wiring
$('goBtn').addEventListener('click', startGame);
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', () => { UI.paused = false; gameOver(); });
$('againBtn').addEventListener('click', startGame);
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

window.__sushi = { G, Stage, startGame, onPick, layoutFree };
requestAnimationFrame(loop);
openScan();
