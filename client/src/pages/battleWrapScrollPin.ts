/**
 * 逻辑副本校验：`npm run verify:scroll-pin -w client`（见 `scripts/verify-battle-scroll-pin.mjs`，改算法时请同步）。
 *
 * 在 .battle-wrap 的 client 尺寸或 scroll 总长变化后校正 scroll。
 * 若传入上一帧的 client 宽高，则在「先前贴底/贴顶」或视口仅缩放时保持锚点，避免侧栏挤占高度时地图整块错位。
 */
export function computePinnedBattleWrapScroll(args: {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  prevClientHeight?: number;
  prevClientWidth?: number;
  edgePx?: number;
}): { scrollTop: number; scrollLeft: number } {
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
