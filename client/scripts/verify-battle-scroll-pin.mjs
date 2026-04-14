/**
 * 与 src/pages/battleWrapScrollPin.ts 保持同步；`npm run verify:scroll-pin` 做无依赖校验。
 */
import assert from "node:assert/strict";

function computePinnedBattleWrapScroll(args) {
  const edge = args.edgePx ?? 24;
  const sh = Math.max(1, args.scrollHeight);
  const ch = Math.max(0, args.clientHeight);
  const sw = Math.max(1, args.scrollWidth);
  const cw = Math.max(0, args.clientWidth);
  const maxY = Math.max(0, sh - ch);
  const maxX = Math.max(0, sw - cw);
  let st = args.scrollTop;
  let sl = args.scrollLeft;

  const pch = args.prevClientHeight;
  if (pch != null && pch > 0 && ch > 0 && pch !== ch) {
    const oldMaxY = Math.max(0, sh - pch);
    const wasBottom = oldMaxY <= edge || st >= oldMaxY - edge;
    if (wasBottom) {
      st = maxY;
    }
  }

  const pcw = args.prevClientWidth;
  if (pcw != null && pcw > 0 && cw > 0 && pcw !== cw) {
    const oldMaxX = Math.max(0, sw - pcw);
    const wasRight = oldMaxX <= edge || sl >= oldMaxX - edge;
    if (wasRight) {
      sl = maxX;
    }
  }

  if (st > maxY) st = maxY;
  if (sl > maxX) sl = maxX;
  if (maxY > 0) {
    if (maxY - st <= edge) st = maxY;
    else if (st <= 12) st = 0;
  }
  if (maxX > 0) {
    if (maxX - sl <= edge) sl = maxX;
    else if (sl <= 12) sl = 0;
  }
  return { scrollTop: st, scrollLeft: sl };
}

assert.equal(
  computePinnedBattleWrapScroll({
    scrollTop: 800,
    scrollLeft: 0,
    scrollHeight: 2000,
    scrollWidth: 800,
    clientHeight: 1000,
    clientWidth: 800,
    prevClientHeight: 1200,
    prevClientWidth: 800,
  }).scrollTop,
  1000
);

assert.equal(
  computePinnedBattleWrapScroll({
    scrollTop: 100,
    scrollLeft: 0,
    scrollHeight: 2000,
    scrollWidth: 800,
    clientHeight: 1000,
    clientWidth: 800,
    prevClientHeight: 1200,
    prevClientWidth: 800,
  }).scrollTop,
  100
);

assert.equal(
  computePinnedBattleWrapScroll({
    scrollTop: 9999,
    scrollLeft: 0,
    scrollHeight: 2000,
    scrollWidth: 800,
    clientHeight: 1200,
    clientWidth: 800,
  }).scrollTop,
  800
);

console.log("verify-battle-scroll-pin: ok");
