// Food textures, painted in code on canvases so nothing has to be downloaded.
// Every texture is made once and shared. A fixed random seed keeps the food the
// same on every load.

import * as THREE from 'three';

let seed = 1337;
export const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
export const rr = (a, b) => a + (b - a) * rand();

const cache = new Map();
function tex(key, w, h, draw, { color = true, repeat = [1, 1] } = {}){
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
// Repeat a stamp across the edges so the texture tiles without seams.
function tiled(w, h, x, y, fn){
  for (const dx of [0, -w, w]) for (const dy of [0, -h, h]) fn(x + dx, y + dy);
}

// ------------------------------------------------------------------ rice
function riceGrainsOn(g, w, h, n, light){
  for (let i = 0; i < n; i++){
    const x = rr(0, w), y = rr(0, h), a = rr(0, Math.PI), rx = rr(7, 10), ry = rr(3.4, 4.8);
    const l = rr(light[0], light[1]);
    tiled(w, h, x, y, (px, py) => {
      g.save(); g.translate(px, py); g.rotate(a);
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = `hsl(44, ${rr(14, 28)}%, ${l}%)`; g.fill();
      g.strokeStyle = 'rgba(120,100,70,.28)'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.ellipse(-rx * 0.2, -ry * 0.25, rx * 0.5, ry * 0.35, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
      g.restore();
    });
  }
}
export const riceMap = () => tex('rice', 256, 256, (g, w, h) => {
  g.fillStyle = '#d8ccb3'; g.fillRect(0, 0, w, h);
  riceGrainsOn(g, w, h, 620, [87, 95]);
}, { repeat: [2, 2] });
// Grain relief as a height map: bright grain tops, dark gaps.
export const riceBump = () => tex('riceBump', 256, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 620; i++){
    const x = rr(0, w), y = rr(0, h), a = rr(0, Math.PI), rx = rr(7, 10), ry = rr(3.4, 4.8);
    tiled(w, h, x, y, (px, py) => {
      g.save(); g.translate(px, py); g.rotate(a);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#333');
      g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
      g.restore();
    });
  }
}, { color: false, repeat: [2, 2] });

// ------------------------------------------------------------------ nori
export const noriMap = () => tex('nori', 256, 256, (g, w, h) => {
  g.fillStyle = '#1d2618'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2200; i++){
    const x = rr(0, w), y = rr(0, h), l = rr(3, 16), a = rr(0, Math.PI);
    g.strokeStyle = rand() < 0.5 ? `rgba(70,92,52,${rr(0.18, 0.45)})` : `rgba(4,8,4,${rr(0.25, 0.6)})`;
    g.lineWidth = rr(0.6, 1.7);
    tiled(w, h, x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
  for (let i = 0; i < 40; i++){ // a few thin, see-through spots
    const x = rr(0, w), y = rr(0, h), r = rr(2, 6);
    g.fillStyle = 'rgba(60,78,40,.35)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}, { repeat: [2, 2] });
export const noriRough = () => tex('noriRough', 128, 128, (g, w, h) => {
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 600; i++){ g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},.25)`; g.fillRect(rr(0, w), rr(0, h), rr(1, 4), rr(1, 4)); }
}, { color: false, repeat: [2, 2] });

// ------------------------------------------------------------------ fish
// Salmon: orange flesh with curved white fat lines (the myosepta) across the grain.
export const salmonMap = () => tex('salmon', 512, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#f57438'); gr.addColorStop(0.5, '#e8561f'); gr.addColorStop(1, '#f27a40');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = -6; i < 18; i++){
    const x0 = i * 34 + rr(-5, 5);
    g.strokeStyle = `rgba(255,222,200,${rr(0.65, 0.85)})`; g.lineWidth = rr(4, 7);
    g.beginPath(); g.moveTo(x0, -10); g.bezierCurveTo(x0 + 42, h * 0.3, x0 + 18, h * 0.7, x0 + 70, h + 10); g.stroke();
    g.strokeStyle = 'rgba(255,240,228,.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0 + 15, -10); g.bezierCurveTo(x0 + 57, h * 0.3, x0 + 33, h * 0.7, x0 + 85, h + 10); g.stroke();
  }
  for (let i = 0; i < 900; i++){ g.fillStyle = `rgba(255,${rr(120, 200) | 0},120,.08)`; g.fillRect(rr(0, w), rr(0, h), 2, 2); }
});
// Tuna (akami): deep red with faint pale sinew and a wet sheen.
export const tunaMap = () => tex('tuna', 512, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#a3122a'); gr.addColorStop(0.5, '#b81932'); gr.addColorStop(1, '#9c0f27');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = -4; i < 14; i++){
    const x0 = i * 46 + rr(-8, 8);
    g.strokeStyle = `rgba(230,120,140,${rr(0.12, 0.22)})`; g.lineWidth = rr(2, 4);
    g.beginPath(); g.moveTo(x0, -10); g.bezierCurveTo(x0 + 30, h * 0.35, x0 + 10, h * 0.65, x0 + 50, h + 10); g.stroke();
  }
  for (let i = 0; i < 1500; i++){ g.fillStyle = `rgba(${rr(60, 120) | 0},0,10,.12)`; g.fillRect(rr(0, w), rr(0, h), rr(1, 3), rr(1, 3)); }
});
// Ebi: white flesh with red-orange bands across the back, darker towards the tail.
export const ebiMap = () => tex('ebi', 512, 128, (g, w, h) => {
  g.fillStyle = '#fbe9dc'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++){
    const x = 18 + i * 56, bw = 30 - i;
    const gr = g.createLinearGradient(x, 0, x + bw, 0);
    gr.addColorStop(0, 'rgba(238,96,52,0)'); gr.addColorStop(0.35, '#ee6034'); gr.addColorStop(0.75, '#f57d4a'); gr.addColorStop(1, 'rgba(245,125,74,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 14, h * 0.4, x - 6, h * 0.6, x + 6, h); g.lineTo(x + bw + 6, h);
    g.bezierCurveTo(x + bw - 6, h * 0.6, x + bw + 14, h * 0.4, x + bw, 0); g.fill();
  }
  const edge = g.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, 'rgba(240,110,60,.35)'); edge.addColorStop(0.2, 'rgba(240,110,60,0)'); edge.addColorStop(0.8, 'rgba(240,110,60,0)'); edge.addColorStop(1, 'rgba(240,110,60,.35)');
  g.fillStyle = edge; g.fillRect(0, 0, w, h);
  // the tail fan (the last 15% of the length) is bright red-orange with ribs
  const tail = g.createLinearGradient(w * 0.8, 0, w, 0);
  tail.addColorStop(0, 'rgba(226,72,34,0)'); tail.addColorStop(0.35, '#e2481f'); tail.addColorStop(1, '#b8301a');
  g.fillStyle = tail; g.fillRect(w * 0.8, 0, w * 0.2, h);
  g.strokeStyle = 'rgba(120,20,10,.5)'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++){ g.beginPath(); g.moveTo(w * 0.86, h / 2); g.lineTo(w, h * (i + 0.5) / 7); g.stroke(); }
});
// Tamago: thin golden layers with browned seams between them.
export const tamagoSide = () => tex('tamagoSide', 256, 256, (g, w, h) => {
  g.fillStyle = '#f6c83b'; g.fillRect(0, 0, w, h);
  let y = 0;
  while (y < h){
    const t = rr(14, 22);
    const gr = g.createLinearGradient(0, y, 0, y + t);
    gr.addColorStop(0, '#fbd55a'); gr.addColorStop(0.8, '#f3c233'); gr.addColorStop(1, '#c98b1f');
    g.fillStyle = gr; g.fillRect(0, y, w, t);
    g.strokeStyle = 'rgba(150,90,20,.55)'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(0, y + t);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + t + rr(-1.2, 1.2));
    g.stroke();
    y += t;
  }
  for (let i = 0; i < 300; i++){ g.fillStyle = 'rgba(255,240,180,.25)'; g.fillRect(rr(0, w), rr(0, h), 2, 1); }
});
export const tamagoTop = () => tex('tamagoTop', 256, 256, (g, w, h) => {
  g.fillStyle = '#f2bd35'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++){
    const x = rr(0, w), y = rr(0, h), r = rr(10, 34);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(176,104,26,.55)'); gr.addColorStop(1, 'rgba(176,104,26,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
});
// Crab stick: white fibres running along its length, with a red-orange skin on the top
// third of the way round (u goes round the stick, v along it; the top is u = 0.25).
export const kaniMap = () => tex('kani', 256, 128, (g, w, h) => {
  g.fillStyle = '#fbf6ef'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 220; i++){ g.strokeStyle = 'rgba(200,188,170,.35)'; g.lineWidth = 1; const x = rr(0, w); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rr(-2, 2), h); g.stroke(); }
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0.02, 'rgba(226,69,47,0)'); gr.addColorStop(0.1, '#dc3d26'); gr.addColorStop(0.38, '#ea5b37'); gr.addColorStop(0.48, 'rgba(234,91,55,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
// Tamago atlas for boxUV({ atlas: true }): layered sides on the left half, browned top on the right.
export const tamagoAtlas = () => tex('tamagoAtlas', 512, 256, (g) => {
  g.drawImage(tamagoSide().image, 0, 0, 256, 256);
  g.drawImage(tamagoTop().image, 256, 0, 256, 256);
});

// ------------------------------------------------------------------ board, dishes
// Hinoki cypress: pale, fine straight grain.
export const woodMap = () => tex('wood', 512, 512, (g, w, h) => {
  g.fillStyle = '#d6b07a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++){
    const y = rr(0, h), amp = rr(1, 5), f = rr(0.004, 0.012), ph = rr(0, 6);
    g.strokeStyle = rand() < 0.75 ? `rgba(170,120,62,${rr(0.08, 0.22)})` : `rgba(255,240,210,${rr(0.15, 0.3)})`;
    g.lineWidth = rr(0.8, 2.6);
    g.beginPath();
    for (let x = -4; x <= w + 4; x += 8) g.lineTo(x, y + Math.sin(x * f + ph) * amp);
    g.stroke();
  }
  for (let i = 0; i < 2000; i++){ g.fillStyle = 'rgba(140,96,48,.05)'; g.fillRect(rr(0, w), rr(0, h), rr(2, 9), 1); }
});
export const woodBump = () => tex('woodBump', 256, 256, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++){ const y = rr(0, h); g.strokeStyle = `rgba(0,0,0,${rr(0.1, 0.3)})`; g.lineWidth = rr(0.6, 1.6); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + rr(-3, 3)); g.stroke(); }
}, { color: false });
// Bamboo mat slats.
export const bambooMap = () => tex('bamboo', 256, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#c8a560'); gr.addColorStop(0.5, '#e4c98a'); gr.addColorStop(1, '#b8924c');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (const x of [40, 120, 200]){ g.fillStyle = 'rgba(120,80,30,.45)'; g.fillRect(x, 0, 5, h); g.fillStyle = 'rgba(255,240,200,.4)'; g.fillRect(x + 5, 0, 2, h); }
  for (let i = 0; i < 80; i++){ g.strokeStyle = 'rgba(140,100,40,.15)'; g.beginPath(); const y = rr(0, h); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});
// Glazed stoneware dish: speckled ivory with an indigo ring (u around, v from centre to rim).
export const dishMap = () => tex('dish', 64, 256, (g, w, h) => {
  g.fillStyle = '#f1ebdf'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 200; i++){ g.fillStyle = 'rgba(90,70,50,.18)'; g.fillRect(rr(0, w), rr(0, h), 1.2, 1.2); }
  g.fillStyle = '#2f4a78'; g.fillRect(0, h * 0.70, w, h * 0.05);
  g.fillStyle = 'rgba(47,74,120,.45)'; g.fillRect(0, h * 0.77, w, h * 0.015);
  g.fillStyle = '#8a6a4a'; g.fillRect(0, h * 0.97, w, h * 0.03);
});

// Soft contact shadow.
export const shadowMap = () => tex('shadow', 128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(0,0,0,.8)'); gr.addColorStop(0.5, 'rgba(0,0,0,.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { color: false });
// Fine noise, used as a bump map for paste-like surfaces (wasabi).
export const pasteBump = () => tex('paste', 128, 128, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++){ const r = rr(0.5, 2.5); g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${rr(0.1, 0.35)})`; g.beginPath(); g.arc(rr(0, w), rr(0, h), r, 0, Math.PI * 2); g.fill(); }
}, { color: false, repeat: [2, 2] });

// ------------------------------------------------------------------ cut face of a roll
// The cross-section seen on each cut piece: nori, rice and the fillings, drawn from the recipe.
const FILL_DRAW = {
  salmon(g, x, y, s, a){ shape(g, x, y, a, () => { g.fillStyle = '#ee6128'; rect(g, -s * 0.5, -s * 0.32, s, s * 0.64, s * 0.12); g.fill();
    g.strokeStyle = 'rgba(255,225,205,.8)'; g.lineWidth = s * 0.06; for (let i = -1; i <= 1; i++){ g.beginPath(); g.moveTo(-s * 0.4 + i * s * 0.3, -s * 0.3); g.quadraticCurveTo(i * s * 0.3, 0, -s * 0.3 + i * s * 0.3, s * 0.3); g.stroke(); } }); },
  tuna(g, x, y, s, a){ shape(g, x, y, a, () => { g.fillStyle = '#b3162f'; rect(g, -s * 0.5, -s * 0.34, s, s * 0.68, s * 0.1); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; rect(g, -s * 0.4, -s * 0.28, s * 0.4, s * 0.2, s * 0.08); g.fill(); }); },
  kyuri(g, x, y, s, a){ shape(g, x, y, a, () => { g.fillStyle = '#2f5a22'; rect(g, -s * 0.36, -s * 0.36, s * 0.72, s * 0.72, s * 0.14); g.fill();
    g.fillStyle = '#cfe6a6'; rect(g, -s * 0.3, -s * 0.3, s * 0.6, s * 0.6, s * 0.1); g.fill(); g.fillStyle = '#e8f3c8'; g.beginPath(); g.arc(s * 0.05, s * 0.05, s * 0.14, 0, Math.PI * 2); g.fill(); }); },
  avocado(g, x, y, s, a){ shape(g, x, y, a, () => { const gr = g.createLinearGradient(0, -s * 0.4, 0, s * 0.4); gr.addColorStop(0, '#4c7a26'); gr.addColorStop(0.18, '#a6c447'); gr.addColorStop(1, '#e8e489');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-s * 0.55, s * 0.3); g.quadraticCurveTo(0, -s * 0.75, s * 0.55, s * 0.3); g.quadraticCurveTo(0, s * 0.05, -s * 0.55, s * 0.3); g.fill(); }); },
  kani(g, x, y, s, a){ shape(g, x, y, a, () => { g.fillStyle = '#fbf3ea'; g.beginPath(); g.arc(0, 0, s * 0.36, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e04a2c'; g.beginPath(); g.arc(0, 0, s * 0.36, Math.PI * 1.05, Math.PI * 1.95); g.lineTo(0, -s * 0.18); g.fill(); }); },
  tamago(g, x, y, s, a){ shape(g, x, y, a, () => { g.fillStyle = '#f4c430'; rect(g, -s * 0.42, -s * 0.36, s * 0.84, s * 0.72, s * 0.06); g.fill();
    g.strokeStyle = 'rgba(170,110,20,.6)'; g.lineWidth = s * 0.03; for (let i = 1; i < 4; i++){ g.beginPath(); g.moveTo(-s * 0.42, -s * 0.36 + i * s * 0.18); g.lineTo(s * 0.42, -s * 0.36 + i * s * 0.18); g.stroke(); } }); },
  wasabi(g, x, y, s){ g.fillStyle = 'rgba(134,168,60,.85)'; g.beginPath(); g.ellipse(x, y, s * 0.5, s * 0.08, 0.3, 0, Math.PI * 2); g.fill(); },
};
function shape(g, x, y, a, draw){ g.save(); g.translate(x, y); g.rotate(a); draw(); g.restore(); }
function rect(g, x, y, w, h, r){ g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

export const cutFaceMap = (recipe) => tex(`cut:${recipe.id}`, 512, 512, (g, w, h) => {
  const c = w / 2, R = w * 0.49, ura = recipe.form === 'uramaki';
  g.clearRect(0, 0, w, h);
  // outer skin
  g.fillStyle = ura ? '#e9e1cf' : '#1d2618';
  g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
  // rice body
  const rRice = ura ? R : R * 0.94;
  g.save(); g.beginPath(); g.arc(c, c, rRice, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#ddd3bf'; g.fillRect(0, 0, w, h);
  riceGrainsOn(g, w, h, 1300, [88, 97]);
  if (ura){ // sesame on the outside rim
    for (let i = 0; i < 160; i++){
      const a = rr(0, Math.PI * 2), r = R - rr(2, 18);
      g.save(); g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r); g.rotate(a + rr(-0.6, 0.6));
      g.fillStyle = rand() < 0.25 ? '#2a221c' : '#efdcb0'; g.beginPath(); g.ellipse(0, 0, 6, 3.2, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  g.restore();
  // nori ring hidden inside an inside-out roll
  const inner = ura ? R * 0.52 : 0;
  if (ura){ g.strokeStyle = '#1d2618'; g.lineWidth = 9; g.beginPath(); g.arc(c, c, inner, 0, Math.PI * 2); g.stroke(); }
  // fillings in the middle
  const fill = [...(recipe.fill || [])];
  if (recipe.stages.flat().includes('wasabi') && recipe.form !== 'nigiri') fill.push('wasabi');
  // a thin roll's single filling is over a third of its width; thick rolls pack several
  const s = recipe.form === 'hosomaki' ? R * 0.78 : ura ? R * 0.5 : R * 0.6;
  const n = fill.filter((f) => f !== 'wasabi').length;
  let k = 0;
  for (const f of fill){
    if (f === 'wasabi'){ FILL_DRAW.wasabi(g, c - s * 0.1, c + s * 0.45, s); continue; }
    const a = n === 1 ? 0 : (k / n) * Math.PI * 2 - Math.PI / 2;
    const off = n === 1 ? 0 : s * (ura ? 0.5 : 0.55);
    FILL_DRAW[f]?.(g, c + Math.cos(a) * off, c + Math.sin(a) * off, s, a + Math.PI / 2 + rr(-0.2, 0.2));
    k++;
  }
  // a little shading towards the rim gives the cut face depth
  const sh = g.createRadialGradient(c, c, R * 0.6, c, c, R);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,40,20,.18)');
  g.fillStyle = sh; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
});
