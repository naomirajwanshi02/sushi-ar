// The board layout, checked in node: node tests/layout.test.mjs
import { BOARD, DISH_R, CENTER, dishPositions } from '../js/layout.js';
import { PACE } from '../js/data.js';

let fails = 0, count = 0;
const ok = (c, m, x = '') => { count++; console.log(`${c ? '  PASS' : '  FAIL'}  ${m}${x ? '  (' + x + ')' : ''}`); if (!c) fails++; };
const GAP = 0.5; // at least half a centimetre of clear board between any two dishes, the board edge and the middle

let worstBoard = Infinity, worstDish = Infinity, worstMiddle = Infinity;
for (let n = 3; n <= PACE.maxTokens; n++){
  for (let k = 0; k < 40; k++){
    const pts = dishPositions(n, k / 40);
    for (const [x, z] of pts){
      worstBoard = Math.min(worstBoard, BOARD.w / 2 - (Math.abs(x) + DISH_R), BOARD.d / 2 - (Math.abs(z) + DISH_R));
      // distance from the dish centre to the middle rectangle, less the dish radius
      const dx = Math.max(0, Math.abs(x) - CENTER.hx), dz = Math.max(0, Math.abs(z) - CENTER.hz);
      worstMiddle = Math.min(worstMiddle, Math.hypot(dx, dz) - DISH_R);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
      worstDish = Math.min(worstDish, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) - 2 * DISH_R);
  }
}
ok(worstBoard >= GAP, 'every dish stays on the board', `closest edge ${worstBoard.toFixed(2)} cm`);
ok(worstDish >= GAP, 'no two dishes overlap, with 3 to 9 on the board', `closest pair ${worstDish.toFixed(2)} cm apart`);
ok(worstMiddle >= GAP, 'no dish reaches the middle where the piece is built', `closest ${worstMiddle.toFixed(2)} cm`);
const p = dishPositions(9, 0.37);
ok(p.length === 9 && p.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)), 'positions are always defined');

console.log(fails ? `\n${fails} of ${count} FAILED` : `\nALL ${count} LAYOUT TESTS PASSED`);
process.exit(fails ? 1 : 0);
