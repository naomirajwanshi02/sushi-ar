// Where things sit on the board, in cm on the board's top face (x across, z towards
// the player). Pure numbers, no three.js, so tests/layout.test.mjs can prove that
// nothing overlaps: dishes stay on the board, clear of each other, and clear of the
// middle where the piece is built.

export const BOARD = { w: 30, d: 20, top: 2.4 };

// Dishes are drawn 1.12× life size so they read on a phone; this is their outer radius.
export const TOKEN_SCALE = 1.12;
export const DISH_R = 2.5 * TOKEN_SCALE;

// The dishes run round a rounded rectangle inside the board edge.
const PATH = { hx: 11.4, hz: 6.5, r: 4 };

// The middle of the board is kept free for the piece being built.
export const CENTER = { hx: 6.0, hz: 3.1 };

// How much larger than life the piece in the middle is drawn, per kind. Chosen so each
// fits inside CENTER (checked in the browser by tools/layout-check.html).
export const PLAN_SCALE = { nigiri: 1.3, gunkan: 1.3, hosomaki: 0.85, futomaki: 0.85, uramaki: 0.85 };

// n points evenly spaced along the path, starting `phase` (0..1) of the way round.
export function dishPositions(n, phase = 0){
  const { hx, hz, r } = PATH;
  const sx = hx - r, sz = hz - r;                 // half-lengths of the straight parts
  const quarter = (Math.PI / 2) * r;
  // segments in order: bottom straight, corner, right straight, corner, top, corner, left, corner
  const segs = [];
  const line = (x0, z0, x1, z1) => segs.push({ len: Math.hypot(x1 - x0, z1 - z0), at: (t) => [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t] });
  // a quarter circle round (cx, cz), turning clockwise from angle a0
  const arc = (cx, cz, a0) => segs.push({ len: quarter, at: (t) => { const a = a0 - t * Math.PI / 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; } });
  line(-sx, hz, sx, hz);   arc(sx, sz, Math.PI / 2);     // front edge, then the front-right corner
  line(hx, sz, hx, -sz);   arc(sx, -sz, 0);              // right edge, back-right corner
  line(sx, -hz, -sx, -hz); arc(-sx, -sz, -Math.PI / 2);  // back edge, back-left corner
  line(-hx, -sz, -hx, sz); arc(-sx, sz, Math.PI);        // left edge, front-left corner
  const total = segs.reduce((s, g) => s + g.len, 0);
  const out = [];
  for (let k = 0; k < n; k++){
    let d = (((k / n + phase) % 1) + 1) % 1 * total;
    for (const g of segs){
      if (d <= g.len){ out.push(g.at(d / g.len)); break; }
      d -= g.len;
    }
  }
  return out;
}
