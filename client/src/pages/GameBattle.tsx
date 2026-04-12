import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AnimationEvent, CSSProperties, KeyboardEvent, MouseEvent } from "react";
import GeneralAvatar from "../components/GeneralAvatar";
import TroopEmblem from "../components/TroopEmblem";
import type { TroopFacing } from "../components/TroopEmblem";
import {
  canAffordTactic,
  canMeleeAttack,
  canUseTactic,
  DAMAGE_FLOAT_ANIM_MS,
  DAMAGE_FLOAT_DELAY_MS,
  MOVE_SLIDE_DURATION_MS,
  POST_ACTION_TURN_BANNER_DELAY_MS,
  physicalAttackMenuLabel,
  TURN_PHASE_BANNER_MS,
} from "../game/battle";
import type { BattleViewportNorm } from "../components/BattleOverviewMap";
import type { BattlePhase, BattleState, Side, TacticKind, Terrain, TroopKind } from "../game/types";
import {
  ARMY_TYPE_LABEL,
  ARCHER_ATTACK_RANGE,
  attackPowerOnTerrain,
  defensePowerOnTerrain,
  expToNextLevel,
  isArmyPreferredTerrain,
  TACTIC_DEF,
  TERRAIN_LABEL,
  TROOP_KIND_LABEL,
} from "../game/types";

export type MenuAction = "attack" | "tactic" | "wait";

const TACTIC_ORDER: TacticKind[] = ["fire", "water", "trap"];

/** 移动结束进入菜单后，先留白这段时间再显示菜单，便于看清落点再选行动 */
const ACTION_MENU_REVEAL_DELAY_MS = 480;
/** 敌方回合：字幕完全收尾后再放行 AI，避免与首个敌方动作重叠 */
const ENEMY_TURN_BANNER_FINISH_BUFFER_MS = 120;

/** 格子边长上限（px）；低于旧版 96 便于一屏多看地图，立绘随 --cell 仍可读 */
const BATTLE_CELL_MAX_PX = 76;
/** 宽屏桌面：相对手机基准格长放大倍数（仅 `narrowUi === false` 时用于 fit / 非 fit 格尺寸） */
const BATTLE_CELL_DESKTOP_SCALE = 2;
/** 与 index.css `.battle-grid` gap 一致 */
const BATTLE_GRID_GAP_PX = 3;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 合并多个子元素的屏幕包围盒（血条 HUD 在格子上方，地形格 rect 不含 HUD） */
function unionScreenRect(els: readonly Element[]): DOMRect | null {
  let t = Infinity;
  let l = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const el of els) {
    const R = el.getBoundingClientRect();
    if (R.width <= 0 && R.height <= 0) continue;
    t = Math.min(t, R.top);
    l = Math.min(l, R.left);
    r = Math.max(r, R.right);
    b = Math.max(b, R.bottom);
  }
  if (!Number.isFinite(t)) return null;
  return new DOMRect(l, t, r - l, b - t);
}

/** 棋盘相邻两行格顶之间距离（含 grid gap），用于顶行 HUD 仍「差一行」时的补偿 */
function getBattleGridRowStepPx(wrap: HTMLElement): number {
  const a = wrap.querySelector('[data-battle-cell="0,0"]');
  const b = wrap.querySelector('[data-battle-cell="0,1"]');
  if (a && b) {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const step = Math.abs(rb.top - ra.top);
    if (step > 1) return step;
  }
  const c = wrap.querySelector('[data-battle-cell="0,0"]')?.getBoundingClientRect();
  if (c && c.height > 1) return c.height + 3;
  return BATTLE_GRID_ROW_STRIDE_PX;
}

function parseBattleCellCoords(anchor: Element): { x: number; y: number } | null {
  const u = anchor.getAttribute("data-battle-unit-cell");
  if (u) {
    const [x, y] = u.split(",").map((n) => Number.parseInt(n, 10));
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  const t = anchor.getAttribute("data-battle-cell");
  if (t) {
    const [x, y] = t.split(",").map((n) => Number.parseInt(n, 10));
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  return null;
}

/** .battle-wrap 内真正可滚动的内容视口（须扣 border+padding；用外框 rect 会把顶 padding 当成「已可见」而少滚约一行） */
function getWrapScrollportViewportRect(wrap: HTMLElement): DOMRect {
  const br = wrap.getBoundingClientRect();
  const st = getComputedStyle(wrap);
  const bt = parseFloat(st.borderTopWidth) || 0;
  const bl = parseFloat(st.borderLeftWidth) || 0;
  const bb = parseFloat(st.borderBottomWidth) || 0;
  const brw = parseFloat(st.borderRightWidth) || 0;
  const pt = parseFloat(st.paddingTop) || 0;
  const pl = parseFloat(st.paddingLeft) || 0;
  const pb = parseFloat(st.paddingBottom) || 0;
  const pr = parseFloat(st.paddingRight) || 0;
  const left = br.left + bl + pl;
  const top = br.top + bt + pt;
  const right = br.right - brw - pr;
  const bottom = br.bottom - bb - pb;
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

/** fit 模式：按 .battle-wrap 内容区与棋盘格数反推正方形格边长，使一屏内尽量多看格（仍受 MIN/MAX 限制） */
function readBattleWrapPaddingBox(wrap: HTMLElement): { innerW: number; innerH: number } {
  const st = getComputedStyle(wrap);
  const pl = parseFloat(st.paddingLeft) || 0;
  const pr = parseFloat(st.paddingRight) || 0;
  const pt = parseFloat(st.paddingTop) || 0;
  const pb = parseFloat(st.paddingBottom) || 0;
  return {
    innerW: Math.max(0, wrap.clientWidth - pl - pr),
    innerH: Math.max(0, wrap.clientHeight - pt - pb),
  };
}

function computeFitCellPxForViewport(args: {
  innerW: number;
  innerH: number;
  gridW: number;
  gridH: number;
  headroomPx: number;
  minCellPx: number;
  maxCellPx: number;
}): number {
  const { innerW, innerH, gridW, gridH, headroomPx, minCellPx, maxCellPx } = args;
  const gw = Math.max(1, gridW);
  const gh = Math.max(1, gridH);
  const gap = BATTLE_GRID_GAP_PX;
  const sceneChromeV = 10;
  const availHForGrid = Math.max(0, innerH - headroomPx - sceneChromeV);
  const cellW = (innerW - (gw - 1) * gap) / gw;
  const cellH = (availHForGrid - (gh - 1) * gap) / gh;
  let cell = Math.min(cellW, cellH);
  if (!Number.isFinite(cell) || cell <= 0) {
    cell = maxCellPx;
  }
  cell = Math.floor(cell);
  return Math.max(minCellPx, Math.min(maxCellPx, cell));
}

/** 宽屏行动菜单锚点（与 index.css @media min-width 901 配套） */
type WideMenuAnchor = "right" | "left" | "top" | "bottom";

/**
 * 将 .battle-wrap 的滚动限制在「棋盘 .battle-grid 实际包围盒」与视口相交范围内，
 * 避免 fit 模式下顶/侧出现大块「滚出地图」的留白（略图黄框仍以格子为准）。
 */
function getBattleGridScrollBounds(wrap: HTMLElement): {
  tMin: number;
  tMax: number;
  lMin: number;
  lMax: number;
} {
  const grid = wrap.querySelector(".battle-grid") as HTMLElement | null;
  const hardMaxT = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
  const hardMaxL = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
  const fallback = { tMin: 0, tMax: hardMaxT, lMin: 0, lMax: hardMaxL };
  if (!grid || grid.clientWidth < 4 || grid.clientHeight < 4) return fallback;

  const vp = getWrapScrollportViewportRect(wrap);
  const gr = grid.getBoundingClientRect();
  const snapTop = wrap.scrollTop + (gr.top - vp.top);
  const snapBot = wrap.scrollTop + (gr.bottom - vp.bottom);
  const snapLeft = wrap.scrollLeft + (gr.left - vp.left);
  const snapRight = wrap.scrollLeft + (gr.right - vp.right);

  const axisRange = (snapA: number, snapB: number, hardMax: number) => {
    if (snapA <= snapB + 0.5) {
      let mn = Math.max(0, snapA);
      let mx = Math.min(hardMax, snapB);
      if (mn > mx) {
        const c = Math.max(0, Math.min(hardMax, snapA));
        mn = mx = c;
      }
      return { mn, mx };
    }
    const c = Math.max(0, Math.min(hardMax, snapA));
    return { mn: c, mx: c };
  };

  const yt = axisRange(snapTop, snapBot, hardMaxT);
  const xl = axisRange(snapLeft, snapRight, hardMaxL);
  return { tMin: yt.mn, tMax: yt.mx, lMin: xl.mn, lMax: xl.mx };
}

function clampBattleWrapScrollToGrid(wrap: HTMLElement): void {
  const { tMin, tMax, lMin, lMax } = getBattleGridScrollBounds(wrap);
  let t = wrap.scrollTop;
  let l = wrap.scrollLeft;
  if (t < tMin - 0.5) t = tMin;
  else if (t > tMax + 0.5) t = tMax;
  if (l < lMin - 0.5) l = lMin;
  else if (l > lMax + 0.5) l = lMax;
  if (t !== wrap.scrollTop || l !== wrap.scrollLeft) {
    wrap.scrollTop = t;
    wrap.scrollLeft = l;
  }
}

function computeWideMenuAnchor(
  narrowUi: boolean,
  x: number,
  _y: number,
  gridW: number,
  _gridH: number,
  phase: BattlePhase,
  floatSide: "right" | "left" | "top" | "bottom" | null,
  floatSameUnit: boolean,
  cellRect: DOMRect | null,
  vpRect: DOMRect | null
): WideMenuAnchor {
  if (narrowUi) return "right";
  if (phase !== "menu" && phase !== "tactic-menu") return "right";

  const MENU_W_EST = 168;
  const MENU_H_EST = 156;
  const EDGE = 6;

  if (floatSameUnit && floatSide === "right") return "left";

  const vpOk = Boolean(cellRect && vpRect && cellRect.width > 2);
  const gridRightEdge = x >= gridW - 1;
  const viewportBlocksRight =
    vpOk && cellRect!.right + MENU_W_EST > vpRect!.right - EDGE;
  const needNonRight = gridRightEdge || viewportBlocksRight;
  if (!needNonRight) return "right";

  const floatBlocksLeft = floatSameUnit && floatSide === "left";
  const viewportBlocksLeft = vpOk && cellRect!.left - MENU_W_EST < vpRect!.left + EDGE;
  if (!floatBlocksLeft && !viewportBlocksLeft) return "left";

  const canTop = vpOk && cellRect!.top - MENU_H_EST > vpRect!.top + EDGE;
  const canBot = vpOk && cellRect!.bottom + MENU_H_EST < vpRect!.bottom - EDGE;
  /* 右不可用且左被挡时：优先上，其次下（与需求「上 / 左 / 下」顺序一致） */
  if (canTop && canBot) return "top";
  if (canTop) return "top";
  if (canBot) return "bottom";
  return "left";
}

/**
 * 在 .battle-wrap 内滚动，使目标格（及单位层立绘/HUD）完整落在可视区内。
 * 视口用 border+padding 内沿；有立绘时在包围盒上方再扩一整行（HUD/_sprite 常超出 bbox）。
 */
function scrollBattleWrapToRevealCell(
  wrap: HTMLElement,
  anchor: Element,
  opts?: { margin?: number }
): void {
  const margin = opts?.margin ?? 10;
  /** 用 instant，避免 smooth 未结束时用旧 rect 再算仍偏一行 */
  const behavior: ScrollBehavior = "auto";

  const parts: Element[] = [anchor];
  const standee = anchor.querySelector(".unit-standee");
  if (standee) parts.push(standee);
  const body = anchor.querySelector(".unit-standee__body");
  if (body) parts.push(body);
  const hud = anchor.querySelector(".unit-standee__hud");
  if (hud) parts.push(hud);

  const pos = parseBattleCellCoords(anchor);
  if (pos && pos.y >= 1) {
    const above = wrap.querySelector(`[data-battle-cell="${pos.x},${pos.y - 1}"]`);
    if (above) parts.push(above);
  }

  let cr = unionScreenRect(parts);
  if (!cr) return;

  const rowStep = getBattleGridRowStepPx(wrap);
  if (standee) {
    cr = new DOMRect(cr.left, cr.top - rowStep, cr.width, cr.height + rowStep);
  }

  const vp = getWrapScrollportViewportRect(wrap);

  let dY = 0;
  if (cr.top < vp.top + margin) {
    dY = cr.top - vp.top - margin;
  } else if (cr.bottom > vp.bottom - margin) {
    dY = cr.bottom - vp.bottom + margin;
  }

  let dX = 0;
  if (cr.left < vp.left + margin) {
    dX = cr.left - vp.left - margin;
  } else if (cr.right > vp.right - margin) {
    dX = cr.right - vp.right + margin;
  }

  const bounds = getBattleGridScrollBounds(wrap);
  const hardMaxL = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
  const hardMaxT = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
  const nextL = Math.min(bounds.lMax, Math.max(bounds.lMin, Math.min(hardMaxL, Math.max(0, wrap.scrollLeft + dX))));
  const nextT = Math.min(bounds.tMax, Math.max(bounds.tMin, Math.min(hardMaxT, Math.max(0, wrap.scrollTop + dY))));
  if (nextL !== wrap.scrollLeft || nextT !== wrap.scrollTop) {
    wrap.scrollTo({ top: nextT, left: nextL, behavior });
  }
  clampBattleWrapScrollToGrid(wrap);
}
/** 极宽地图时每格不低于此值，避免点选过难；手机横屏可略压以换可视格数 */
const BATTLE_CELL_MIN_PX = 30;
/** fitViewport 下每格固定为该值（与上限一致） */
const BATTLE_CELL_PX_VIEWPORT = BATTLE_CELL_MAX_PX;
/** 一格 + 行间 gap（与 index.css .battle-grid gap: 3px 一致） */
const BATTLE_GRID_ROW_STRIDE_PX = BATTLE_CELL_PX_VIEWPORT + 3;
/** fit 顶占位：1 整行仍差半行时，用 1.5 倍行距顶缓冲 */
const BATTLE_GRID_SCROLL_HEADROOM_PX = Math.round(BATTLE_GRID_ROW_STRIDE_PX * 1.5);

/** 选中单位后属性浮窗：停留时长 + 淡出时长 */
const UNIT_ATTR_FLOAT_HOLD_MS = 3400;
/** 与 .unit-attr-float--fading 一致（自然超时淡出） */
export const UNIT_ATTR_FLOAT_FADE_MS = 900;
/** 走格前打断浮窗：较短渐隐，与 CSS .unit-attr-float--fade-move 一致 */
export const UNIT_ATTR_FLOAT_FADE_MS_MOVE = 260;

function getAttrFloatFadeWaitMsForMove(): number {
  if (typeof window === "undefined") return UNIT_ATTR_FLOAT_FADE_MS_MOVE;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : UNIT_ATTR_FLOAT_FADE_MS_MOVE;
}

function ratioPercent(value: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, Math.round((100 * value) / cap));
}

type AttrFloatSide = "right" | "left" | "top" | "bottom";

/** 在视口内为浮窗选一侧：优先右→左→下→上；skipSides 用于避开行动菜单占用的侧（与 index.css 中 .action-menu 一致） */
function pickAttrFloatPlacement(
  cellRect: DOMRect,
  floatW: number,
  floatH: number,
  skipSides?: ReadonlySet<AttrFloatSide>
): { left: number; top: number; side: AttrFloatSide } {
  const M = 10;
  const GAP = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const yCenter = cellRect.top + cellRect.height / 2 - floatH / 2;
  const xCenter = cellRect.left + cellRect.width / 2 - floatW / 2;

  const fits = (l: number, t: number) =>
    l >= M && t >= M && l + floatW <= vw - M && t + floatH <= vh - M;

  const primaryOrder: AttrFloatSide[] = ["right", "left", "bottom", "top"];
  const tryOrder = skipSides?.size
    ? primaryOrder.filter((s) => !skipSides.has(s))
    : primaryOrder;

  for (const side of tryOrder) {
    let left = 0;
    let top = 0;
    if (side === "right") {
      left = cellRect.right + GAP;
      top = yCenter;
    } else if (side === "left") {
      left = cellRect.left - GAP - floatW;
      top = yCenter;
    } else if (side === "bottom") {
      left = xCenter;
      top = cellRect.bottom + GAP;
    } else {
      left = xCenter;
      top = cellRect.top - GAP - floatH;
    }
    if (fits(left, top)) return { left, top, side };
  }

  const candidates: { l: number; t: number; side: AttrFloatSide }[] = [
    { l: cellRect.right + GAP, t: yCenter, side: "right" },
    { l: cellRect.left - GAP - floatW, t: yCenter, side: "left" },
    { l: xCenter, t: cellRect.bottom + GAP, side: "bottom" },
    { l: xCenter, t: cellRect.top - GAP - floatH, side: "top" },
  ];
  let best = candidates[0];
  let bestArea = -1;
  for (const c of candidates) {
    const cl = Math.min(Math.max(M, c.l), vw - floatW - M);
    const ct = Math.min(Math.max(M, c.t), vh - floatH - M);
    const visW = Math.min(cl + floatW, vw - M) - Math.max(cl, M);
    const visH = Math.min(ct + floatH, vh - M) - Math.max(ct, M);
    const area = Math.max(0, visW) * Math.max(0, visH);
    if (area > bestArea) {
      bestArea = area;
      best = { l: cl, t: ct, side: c.side };
    }
  }
  return { left: best.l, top: best.t, side: best.side };
}

const ATTR_FLOAT_EST_W = 288;
const ATTR_FLOAT_EST_H = 240;

type Props = {
  battle: BattleState;
  /** 当前检视/点选单位（含敌军与侧栏点将），用于属性浮窗 */
  inspectUnitId?: string | null;
  /** 每次场上/侧栏点将递增，便于再次点同一 id 时重播浮窗 */
  inspectTapSeq?: number;
  visualEpoch: number;
  /** 为 true 时回合开场字幕流程尚未结束，须屏蔽战场操作（由父组件根据 onTurnActionReady 驱动） */
  turnIntroLocked: boolean;
  /** 与回合字幕同节奏：false = 本回合尚不可操作，true = 可行动 */
  onTurnActionReady: (ready: boolean) => void;
  /** 消费 battle.damagePulse，避免受击动画推断错误 */
  onDamagePulseConsumed: () => void;
  onCellClick: (x: number, y: number) => void | Promise<void>;
  onUnitClick: (unitId: string, side: Side) => void;
  onMenuAction: (action: MenuAction) => void;
  onTacticPick: (kind: TacticKind) => void;
  onEscapeOrRevert: () => void;
  onPickNavigate: (delta: number) => void;
  onPickConfirmFocused: () => void;
  onPickHoverEnemy: (enemyId: string) => void;
  /** 为 true 时屏蔽战场键盘（例如父级秘籍选关弹层打开） */
  keyboardBlocked?: boolean;
  /** 为 true 时棋盘在容器内缩放铺满，不出现滚动条 */
  fitViewport?: boolean;
  /** 秘籍：桌面强开窄屏 UI（与 max-width:900 时一致；GamePage Ctrl+M / Ctrl+Shift+M） */
  forceNarrowLayout?: boolean;
  /** 主战场滚动容器视口相对整张地图的比例（用于侧栏缩略图） */
  onScrollViewportChange?: (norm: BattleViewportNorm) => void;
};

const MENU_ORDER: MenuAction[] = ["attack", "tactic", "wait"];

function nextEnabledFocus(
  from: number,
  delta: 1 | -1,
  attackOk: boolean,
  tacticOk: boolean
): number {
  const enabled = [attackOk, tacticOk, true];
  for (let step = 1; step <= 3; step++) {
    const i = (((from + delta * step) % 3) + 3) % 3;
    if (enabled[i]) return i;
  }
  return from;
}

function nextTacticFocus(from: number, delta: 1 | -1, enabled: boolean[]): number {
  for (let step = 1; step <= 4; step++) {
    const i = (((from + delta * step) % 3) + 3) % 3;
    if (enabled[i]) return i;
  }
  return from;
}

type UnitSnap = { x: number; y: number; hp: number; level: number };

type DyingVisual = {
  key: number;
  unitId: string;
  x: number;
  y: number;
  name: string;
  side: Side;
  level: number;
  troopKind: TroopKind;
};

type LevelUpVisual = {
  key: number;
  unitId: string;
  x: number;
  y: number;
  name: string;
  side: Side;
  newLevel: number;
};

/**
 * 根据单步网格位移选四向立绘（网格 x 右为正、y 下为正；屏幕上行对应 y 减小）。
 * 使用「到达格 − 出发格」避免与滑动动画里 (old−new) 符号混用。
 */
function facingFromGridStep(from: { x: number; y: number }, to: { x: number; y: number }): TroopFacing {
  const tx = to.x - from.x;
  const ty = to.y - from.y;
  if (Math.abs(tx) >= Math.abs(ty) && tx !== 0) return tx > 0 ? "right" : "left";
  if (ty !== 0) return ty < 0 ? "up" : "down";
  return "right";
}

/** 阵亡条带横向跨多格，以死亡格为中心对齐（约 5 格宽） */
const DEATH_TEXT_COL_SPAN = 5;
/** 阵亡文案/残影展示时长：拉长以确保玩家能看清「被斩于阵前」 */
const DEATH_TEXT_POP_MS = 1600;
/** 与扣血飘字总时长一致：须与 `DAMAGE_FLOAT_DELAY_MS` + `DAMAGE_FLOAT_ANIM_MS` 及 index.css `.dmg-float` 同步 */
const DMG_FLOAT_SEQUENCE_MS = DAMAGE_FLOAT_DELAY_MS + DAMAGE_FLOAT_ANIM_MS;
const DMG_FLOAT_SEQUENCE_REDUCED_MS = 80 + 480;
/** 略长于飘字总时长，避免与 `dmgFloatTimersRef.end` 同毫秒注册时先播阵亡 */
const DEATH_UI_AFTER_DMG_MS = 48;
function deathTextGridColumn(deathX: number, gridW: number): string {
  const span = Math.min(DEATH_TEXT_COL_SPAN, gridW);
  const startX = Math.max(0, Math.min(deathX - Math.floor((span - 1) / 2), gridW - span));
  return `${startX + 1} / span ${span}`;
}

/**
 * 整格 z-index：越大越在上层。有单位的格必须整体高于纯地形格（否则后序 DOM 邻格会盖住立绘溢出）；
 * 移动中再抬高，减少滑步时「被格子切一下」的顿挫感。
 */
function battleSlotStackZ(
  x: number,
  y: number,
  gridW: number,
  f: {
    menuOpen: boolean;
    pickFocus: boolean;
    pickCand: boolean;
    rosterPulse: boolean;
    moveSlide: boolean;
    moveHint: boolean;
    hasLiveUnit: boolean;
  }
): number {
  const tie = y * gridW + x;
  if (f.menuOpen) return 100_000 + tie;
  if (f.pickFocus) return 92_000 + tie;
  if (f.pickCand) return 88_000 + tie;
  if (f.rosterPulse) return 75_000 + tie;
  if (f.moveSlide) return 65_000 + tie;
  if (f.moveHint) return 12_000 + tie;
  if (f.hasLiveUnit) return 6_000 + tie;
  return tie;
}

export type GameBattleHandle = {
  /**
   * 滚动战场使该单位所在格进入视野；可选在缩略格上短暂高亮（侧栏点将时为 true）。
   */
  focusUnitOnMap: (unitId: string, opts?: { rosterPulse?: boolean }) => boolean;
  /**
   * 我军即将沿路走格前调用：若属性浮窗正展示该将，则先渐隐再 resolve，
   * 以便父组件在写入 pendingMove 前等待，避免浮窗与滑步重叠。
   */
  beforePlayerMoveStart: (movingUnitId: string) => Promise<void>;
};

const GameBattle = forwardRef<GameBattleHandle, Props>(function GameBattle(
  {
  battle,
  visualEpoch,
  turnIntroLocked,
  onTurnActionReady,
  onDamagePulseConsumed,
  onCellClick,
  onUnitClick,
  onMenuAction,
  onTacticPick,
  onEscapeOrRevert,
  onPickNavigate,
  onPickConfirmFocused,
  onPickHoverEnemy,
  keyboardBlocked = false,
  fitViewport = false,
  forceNarrowLayout = false,
  onScrollViewportChange,
  inspectUnitId = null,
  inspectTapSeq = 0,
  }: Props,
  ref
) {
  const {
    gridW,
    gridH,
    units,
    moveTargets,
    selectedId,
    turn,
    phase,
    outcome,
    pickTarget,
    terrain,
    pendingMove,
    battleRound,
    maxBattleRounds,
  } = battle;

  const [mqNarrow, setMqNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setMqNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const narrowUi = forceNarrowLayout || mqNarrow;

  /** 手机/窄屏与秘籍窄布局保持基准格长；宽屏桌面为基准的 BATTLE_CELL_DESKTOP_SCALE 倍 */
  const cellClamp = useMemo(() => {
    const scale = narrowUi ? 1 : BATTLE_CELL_DESKTOP_SCALE;
    return {
      min: Math.round(BATTLE_CELL_MIN_PX * scale),
      max: Math.round(BATTLE_CELL_MAX_PX * scale),
      fallback: Math.round(BATTLE_CELL_MAX_PX * scale),
    };
  }, [narrowUi]);

  const floatUnit = useMemo(() => {
    if (!inspectUnitId) return null;
    return units.find((u) => u.id === inspectUnitId && u.hp > 0) ?? null;
  }, [inspectUnitId, units]);

  const cellCss = useMemo(() => {
    return `min(${cellClamp.max}px, max(${cellClamp.min}px, calc((min(96vw, 1240px) - 280px) / ${gridW})))`;
  }, [gridW, cellClamp]);
  const [fitCellPx, setFitCellPx] = useState(0);
  const cellCssEffective = useMemo(() => {
    if (fitViewport) return fitCellPx > 0 ? `${fitCellPx}px` : `${cellClamp.fallback}px`;
    return cellCss;
  }, [fitViewport, fitCellPx, cellCss, cellClamp]);
  /** fit 顶缓冲随格长略缩，与 recomputeFitCellPx 内 head1 一致，避免横屏上占位过大 */
  const fitScrollHeadroomPx = useMemo(() => {
    if (!fitViewport) return BATTLE_GRID_SCROLL_HEADROOM_PX;
    const c = fitCellPx > 0 ? fitCellPx : cellClamp.min;
    const cap = Math.round((cellClamp.max + BATTLE_GRID_GAP_PX) * 1.5);
    return Math.min(cap, Math.round((c + BATTLE_GRID_GAP_PX) * 1.5));
  }, [fitViewport, fitCellPx, cellClamp]);
  const battleWrapRef = useRef<HTMLDivElement>(null);
  const onScrollViewportChangeRef = useRef(onScrollViewportChange);
  onScrollViewportChangeRef.current = onScrollViewportChange;
  const battleSnapRef = useRef(battle);
  battleSnapRef.current = battle;
  const [rosterPulse, setRosterPulse] = useState<{ x: number; y: number } | null>(null);
  const rosterPulseTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const [attrFloatVisible, setAttrFloatVisible] = useState(false);
  const [attrFloatFading, setAttrFloatFading] = useState(false);
  /** 走格前渐隐：用更短 transition，避免久等又不至于瞬间消失 */
  const [attrFloatFadeMove, setAttrFloatFadeMove] = useState(false);
  const [attrFloatPlacement, setAttrFloatPlacement] = useState<{
    left: number;
    top: number;
    side: AttrFloatSide;
  } | null>(null);
  const attrFloatRootRef = useRef<HTMLDivElement>(null);
  const attrFloatTimersRef = useRef<{
    hold: ReturnType<typeof window.setTimeout> | null;
    done: ReturnType<typeof window.setTimeout> | null;
  }>({ hold: null, done: null });
  const attrFloatVisibleRef = useRef(false);
  attrFloatVisibleRef.current = attrFloatVisible;
  const inspectUnitIdPropRef = useRef<string | null>(null);
  inspectUnitIdPropRef.current = inspectUnitId;

  /** 宽屏行动菜单锚点；用 ref 供属性浮窗 layout 同帧内读 skipSides */
  const [wideMenuAnchor, setWideMenuAnchor] = useState<WideMenuAnchor>("right");
  const wideMenuAnchorRef = useRef<WideMenuAnchor>("right");

  useImperativeHandle(ref, () => ({
    focusUnitOnMap(unitId: string, opts?: { rosterPulse?: boolean }) {
      const u = battleSnapRef.current.units.find((z) => z.id === unitId);
      if (!u) return false;
      const pulse = opts?.rosterPulse !== false;
      if (pulse) {
        if (rosterPulseTimerRef.current) {
          window.clearTimeout(rosterPulseTimerRef.current);
          rosterPulseTimerRef.current = null;
        }
        setRosterPulse({ x: u.x, y: u.y });
        rosterPulseTimerRef.current = window.setTimeout(() => {
          setRosterPulse(null);
          rosterPulseTimerRef.current = null;
        }, 2000);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const wrap = battleWrapRef.current;
          if (!wrap) return;
          const unitSlot = wrap.querySelector(`[data-battle-unit-cell="${u.x},${u.y}"]`);
          const terrainSlot = wrap.querySelector(`[data-battle-cell="${u.x},${u.y}"]`);
          const anchor = unitSlot ?? terrainSlot;
          if (!anchor) return;
          scrollBattleWrapToRevealCell(wrap, anchor);
        });
      });
      return true;
    },
    beforePlayerMoveStart(movingUnitId: string) {
      return new Promise<void>((resolve) => {
        const ft = attrFloatTimersRef.current;
        if (ft.hold != null) {
          window.clearTimeout(ft.hold);
          ft.hold = null;
        }
        if (ft.done != null) {
          window.clearTimeout(ft.done);
          ft.done = null;
        }
        const needFade =
          attrFloatVisibleRef.current &&
          inspectUnitIdPropRef.current === movingUnitId;
        if (!needFade) {
          resolve();
          return;
        }
        setAttrFloatFadeMove(true);
        setAttrFloatFading(true);
        const wait = getAttrFloatFadeWaitMsForMove();
        window.setTimeout(() => {
          setAttrFloatFadeMove(false);
          setAttrFloatFading(false);
          setAttrFloatVisible(false);
          setAttrFloatPlacement(null);
          resolve();
        }, wait);
      });
    },
  }), []);

  useEffect(() => {
    return () => {
      if (rosterPulseTimerRef.current) {
        window.clearTimeout(rosterPulseTimerRef.current);
      }
      const ft = attrFloatTimersRef.current;
      if (ft.hold != null) window.clearTimeout(ft.hold);
      if (ft.done != null) window.clearTimeout(ft.done);
    };
  }, []);

  const recomputeFitCellPx = useCallback(() => {
    if (!fitViewport) return;
    const wrap = battleWrapRef.current;
    if (!wrap || wrap.clientWidth < 8 || wrap.clientHeight < 8) return;
    const { innerW, innerH } = readBattleWrapPaddingBox(wrap);
    const gap = BATTLE_GRID_GAP_PX;
    const headroomCapPx = Math.round((cellClamp.max + gap) * 1.5);
    const head0 = Math.round((cellClamp.min + gap) * 1.5);
    let cell = computeFitCellPxForViewport({
      innerW,
      innerH,
      gridW,
      gridH,
      headroomPx: head0,
      minCellPx: cellClamp.min,
      maxCellPx: cellClamp.max,
    });
    const head1 = Math.min(headroomCapPx, Math.round((cell + gap) * 1.5));
    cell = computeFitCellPxForViewport({
      innerW,
      innerH,
      gridW,
      gridH,
      headroomPx: head1,
      minCellPx: cellClamp.min,
      maxCellPx: cellClamp.max,
    });
    setFitCellPx((prev) => (prev === cell ? prev : cell));
  }, [fitViewport, gridW, gridH, cellClamp]);

  useEffect(() => {
    if (!fitViewport) {
      setFitCellPx(0);
    }
  }, [fitViewport]);

  const reportScrollViewport = useCallback(() => {
    const wrap = battleWrapRef.current;
    const cb = onScrollViewportChangeRef.current;
    if (!wrap || !cb || !fitViewport) return;
    clampBattleWrapScrollToGrid(wrap);
    const grid = wrap.querySelector(".battle-grid") as HTMLElement | null;
    if (!grid) return;
    const gRect = grid.getBoundingClientRect();
    if (gRect.width < 2 || gRect.height < 2) return;

    /** 与 scrollBattleWrapToRevealCell 一致：用 padding 内沿，否则 ih 易为 0、略图黄框塌成一条线 */
    const vp = getWrapScrollportViewportRect(wrap);
    const viewL = vp.left;
    const viewT = vp.top;
    const viewR = vp.left + vp.width;
    const viewB = vp.top + vp.height;

    const ix0 = Math.max(viewL, gRect.left);
    const iy0 = Math.max(viewT, gRect.top);
    const ix1 = Math.min(viewR, gRect.right);
    const iy1 = Math.min(viewB, gRect.bottom);
    const iw = Math.max(0, ix1 - ix0);
    const ih = Math.max(0, iy1 - iy0);

    const left = (ix0 - gRect.left) / gRect.width;
    const top = (iy0 - gRect.top) / gRect.height;
    const width = iw / gRect.width;
    const height = ih / gRect.height;
    cb({
      left: clamp01(left),
      top: clamp01(top),
      width: clamp01(width),
      height: clamp01(height),
    });
  }, [fitViewport]);

  useEffect(() => {
    if (!fitViewport || !onScrollViewportChange) return;
    const el = battleWrapRef.current;
    if (!el) return;
    recomputeFitCellPx();
    reportScrollViewport();
    el.addEventListener("scroll", reportScrollViewport, { passive: true });
    const ro = new ResizeObserver(() => {
      recomputeFitCellPx();
      reportScrollViewport();
    });
    ro.observe(el);
    const onWinResize = () => {
      recomputeFitCellPx();
      reportScrollViewport();
    };
    window.addEventListener("resize", onWinResize);
    return () => {
      el.removeEventListener("scroll", reportScrollViewport);
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
    };
  }, [fitViewport, onScrollViewportChange, reportScrollViewport, recomputeFitCellPx, gridW, gridH]);

  useLayoutEffect(() => {
    if (!fitViewport) return;
    const wrap = battleWrapRef.current;
    if (!wrap) return;
    const id = requestAnimationFrame(() => clampBattleWrapScrollToGrid(wrap));
    return () => cancelAnimationFrame(id);
  }, [fitViewport, gridW, gridH, cellCssEffective, fitScrollHeadroomPx, visualEpoch]);

  const moveSet = new Set(moveTargets.map((t) => `${t.x},${t.y}`));
  const [menuFocus, setMenuFocus] = useState(0);
  const [tacticFocus, setTacticFocus] = useState(0);
  const [dmgFx, setDmgFx] = useState<{
    unitId: string;
    amount: number;
    key: number;
  } | null>(null);
  /** 扣血飘字结束前，血条仍显示受伤前血量 */
  const [hpBarLag, setHpBarLag] = useState<Record<string, number>>({});
  /** 与 hpBarLag 同步：受击光效配色（普攻红 / 计策青） */
  const [hitFxKind, setHitFxKind] = useState<Record<string, "melee" | "tactic">>({});
  const dmgFloatTimersRef = useRef<{
    delay?: ReturnType<typeof window.setTimeout>;
    end?: ReturnType<typeof window.setTimeout>;
  }>({});
  /** 阵亡残影/条带：须在伤害飘字播完后再出现，按 unitId 去重 */
  const pendingDeathRevealTimersRef = useRef<Map<string, ReturnType<typeof window.setTimeout>>>(
    new Map()
  );
  /**
   * 走格滑步的 fallback 定时器（prefers-reduced-motion 下无 animationend）。
   * 每格须先清掉该单位上一格的定时器，否则下一步在 ~MOVE_STEP_MS 触发时，旧定时器仍在
   * ~MOVE_SLIDE_DURATION_MS+48ms 执行 delete，会把当前格的 moveSlide 清掉，从第二格起动画被截断、体感一跳一跳。
   */
  const moveSlideFallbackTimersRef = useRef<Map<string, ReturnType<typeof window.setTimeout>>>(
    new Map()
  );
  const [moveSlide, setMoveSlide] = useState<
    Record<string, { dx: number; dy: number; gen: number }>
  >({});
  const [troopFacingById, setTroopFacingById] = useState<Record<string, TroopFacing>>({});
  const [actionMenuRevealReady, setActionMenuRevealReady] = useState(false);
  const [dyingVisuals, setDyingVisuals] = useState<DyingVisual[]>([]);
  /** 已阵亡但尚未切入阵亡残影动画的单位：继续占格显示立绘，避免「先消失再出现」 */
  const [lingerDeadIds, setLingerDeadIds] = useState(() => new Set<string>());
  const [levelUpVisuals, setLevelUpVisuals] = useState<LevelUpVisual[]>([]);
  const prevHpRef = useRef<Record<string, number> | null>(null);
  const prevSnapRef = useRef<Record<string, UnitSnap> | null>(null);
  const prevEpochRef = useRef(visualEpoch);
  const prevPhaseRef = useRef<BattlePhase | null>(null);
  const prevTurnBattleRef = useRef<"player" | "enemy" | undefined>(undefined);
  const prevGateTurnRef = useRef<"player" | "enemy" | undefined>(undefined);
  const turnBannerTimerRef = useRef<number>(0);
  const turnBannerDelayRef = useRef<number>(0);
  const turnGateTimerRef = useRef<number>(0);
  const [turnBanner, setTurnBanner] = useState<"player" | "enemy" | null>(null);
  const [turnBannerSeq, setTurnBannerSeq] = useState(0);

  useEffect(() => {
    if (prevEpochRef.current === visualEpoch) return;
    prevEpochRef.current = visualEpoch;
    prevHpRef.current = null;
    prevSnapRef.current = null;
    prevTurnBattleRef.current = undefined;
    /* 与下方回合门控 effect 配合：新局/视觉纪元后必须重跑门控，否则 prev===curr 直接 return 会永远不解锁点击 */
    prevGateTurnRef.current = undefined;
    window.clearTimeout(turnBannerTimerRef.current);
    window.clearTimeout(turnBannerDelayRef.current);
    window.clearTimeout(turnGateTimerRef.current);
    setTurnBanner(null);
    setMoveSlide({});
    setTroopFacingById({});
    setActionMenuRevealReady(false);
    setDyingVisuals([]);
    setLingerDeadIds(new Set());
    setLevelUpVisuals([]);
    setDmgFx(null);
    setHpBarLag({});
    setHitFxKind({});
    const ft = dmgFloatTimersRef.current;
    if (ft.delay) window.clearTimeout(ft.delay);
    if (ft.end) window.clearTimeout(ft.end);
    ft.delay = undefined;
    ft.end = undefined;
    for (const t of pendingDeathRevealTimersRef.current.values()) {
      window.clearTimeout(t);
    }
    pendingDeathRevealTimersRef.current.clear();
    for (const t of moveSlideFallbackTimersRef.current.values()) {
      window.clearTimeout(t);
    }
    moveSlideFallbackTimersRef.current.clear();
  }, [visualEpoch]);

  const battleMenuActive =
    outcome === "playing" &&
    turn === "player" &&
    Boolean(selectedId) &&
    (phase === "menu" || phase === "tactic-menu");

  useEffect(() => {
    if (!battleMenuActive) {
      setActionMenuRevealReady(false);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setActionMenuRevealReady(true);
      return;
    }
    setActionMenuRevealReady(false);
    const t = window.setTimeout(() => {
      setActionMenuRevealReady(true);
    }, ACTION_MENU_REVEAL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [battleMenuActive, phase, selectedId]);

  useEffect(() => {
    if (battle.outcome !== "playing") {
      window.clearTimeout(turnBannerTimerRef.current);
      window.clearTimeout(turnBannerDelayRef.current);
      setTurnBanner(null);
      prevTurnBattleRef.current = battle.turn;
      return;
    }
    const prev = prevTurnBattleRef.current;
    const curr = battle.turn;
    const turnChanged = prev !== curr;

    const scheduleBannerHide = () => {
      window.clearTimeout(turnBannerTimerRef.current);
      turnBannerTimerRef.current = window.setTimeout(() => {
        setTurnBanner(null);
      }, TURN_PHASE_BANNER_MS);
    };

    if (turnChanged) {
      prevTurnBattleRef.current = curr;
      window.clearTimeout(turnBannerTimerRef.current);
      window.clearTimeout(turnBannerDelayRef.current);

      const deferBannerForActionAnims =
        (prev === "enemy" && curr === "player") ||
        (prev === "player" && curr === "enemy");

      if (deferBannerForActionAnims) {
        turnBannerDelayRef.current = window.setTimeout(() => {
          setTurnBanner(curr);
          setTurnBannerSeq((n) => n + 1);
          scheduleBannerHide();
        }, POST_ACTION_TURN_BANNER_DELAY_MS);
      } else {
        setTurnBanner(curr);
        setTurnBannerSeq((n) => n + 1);
        scheduleBannerHide();
      }
    } else {
      /* 每次 effect 执行都重新挂载关闭定时器，避免 Strict Mode cleanup 或合盖休眠后定时器丢失导致字幕层逻辑上“永远不关” */
      window.clearTimeout(turnBannerTimerRef.current);
      turnBannerTimerRef.current = window.setTimeout(() => {
        setTurnBanner(null);
      }, TURN_PHASE_BANNER_MS);
    }
    return () => {
      window.clearTimeout(turnBannerTimerRef.current);
      window.clearTimeout(turnBannerDelayRef.current);
    };
  }, [battle.turn, battle.outcome]);

  useEffect(() => {
    if (battle.outcome !== "playing") {
      window.clearTimeout(turnGateTimerRef.current);
      prevGateTurnRef.current = battle.turn;
      onTurnActionReady(true);
      return;
    }
    const prev = prevGateTurnRef.current;
    const curr = battle.turn;
    if (prev === curr) return;

    prevGateTurnRef.current = curr;
    window.clearTimeout(turnGateTimerRef.current);
    onTurnActionReady(false);

    const deferBannerForActionAnims =
      prev !== undefined &&
      ((prev === "enemy" && curr === "player") || (prev === "player" && curr === "enemy"));
    const enemyExtraMs = curr === "enemy" ? ENEMY_TURN_BANNER_FINISH_BUFFER_MS : 0;
    const lockMs = (deferBannerForActionAnims
      ? POST_ACTION_TURN_BANNER_DELAY_MS + TURN_PHASE_BANNER_MS
      : TURN_PHASE_BANNER_MS) + enemyExtraMs;

    turnGateTimerRef.current = window.setTimeout(() => {
      onTurnActionReady(true);
    }, lockMs);
    return () => {
      window.clearTimeout(turnGateTimerRef.current);
      /* React Strict Mode：首次 effect 的定时器被清掉后，若 ref 已写入 curr，再次执行会 prev===curr 直接 return，永远不调 onTurnActionReady(true) */
      prevGateTurnRef.current = undefined;
    };
  }, [battle.turn, battle.outcome, visualEpoch, onTurnActionReady]);

  const tabWasHiddenRef = useRef(false);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        tabWasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState === "visible" && tabWasHiddenRef.current) {
        tabWasHiddenRef.current = false;
        window.clearTimeout(turnBannerTimerRef.current);
        window.clearTimeout(turnBannerDelayRef.current);
        setTurnBanner(null);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (outcome !== "playing") return;
    if (!turnBanner && !turnIntroLocked && !keyboardBlocked) return;
    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", block, true);
    window.addEventListener("keyup", block, true);
    return () => {
      window.removeEventListener("keydown", block, true);
      window.removeEventListener("keyup", block, true);
    };
  }, [turnBanner, turnIntroLocked, keyboardBlocked, outcome]);

  const selectedUnit = selectedId ? units.find((u) => u.id === selectedId) : undefined;
  const attackOk =
    phase === "menu" && selectedUnit
      ? canMeleeAttack(selectedUnit, units)
      : false;
  const tacticOk =
    phase === "menu" && selectedUnit ? canUseTactic(selectedUnit, battle) : false;

  const tacticEnabled =
    phase === "tactic-menu" && selectedUnit
      ? TACTIC_ORDER.map((k) => canAffordTactic(selectedUnit, k, battle))
      : [false, false, false];

  const focusedEnemyId =
    phase === "pick-target" && pickTarget && pickTarget.targetIds.length > 0
      ? pickTarget.targetIds[pickTarget.focusIndex]
      : null;

  useEffect(() => {
    const ft = attrFloatTimersRef.current;
    const clearAttrFloatTimers = () => {
      if (ft.hold != null) {
        window.clearTimeout(ft.hold);
        ft.hold = null;
      }
      if (ft.done != null) {
        window.clearTimeout(ft.done);
        ft.done = null;
      }
    };

    clearAttrFloatTimers();
    setAttrFloatFading(false);
    setAttrFloatFadeMove(false);
    setAttrFloatPlacement(null);

    if (outcome !== "playing" || !inspectUnitId) {
      setAttrFloatVisible(false);
      return clearAttrFloatTimers;
    }

    if (battleSnapRef.current.turn !== "player") {
      setAttrFloatVisible(false);
      return clearAttrFloatTimers;
    }

    if (battleSnapRef.current.pendingMove) {
      setAttrFloatVisible(false);
      return clearAttrFloatTimers;
    }

    const su = battleSnapRef.current.units.find((z) => z.id === inspectUnitId);
    if (!su || su.hp <= 0) {
      setAttrFloatVisible(false);
      return clearAttrFloatTimers;
    }

    setAttrFloatVisible(true);

    ft.hold = window.setTimeout(() => {
      ft.hold = null;
      setAttrFloatFading(true);
    }, UNIT_ATTR_FLOAT_HOLD_MS);

    ft.done = window.setTimeout(() => {
      ft.done = null;
      setAttrFloatFading(false);
      setAttrFloatFadeMove(false);
      setAttrFloatVisible(false);
      setAttrFloatPlacement(null);
    }, UNIT_ATTR_FLOAT_HOLD_MS + UNIT_ATTR_FLOAT_FADE_MS);

    return clearAttrFloatTimers;
  }, [inspectUnitId, inspectTapSeq, outcome, pendingMove, turn]);

  useEffect(() => {
    if (!attrFloatVisible || !inspectUnitId) return;
    const u = units.find((z) => z.id === inspectUnitId);
    if (u && u.hp > 0) return;
    const ft = attrFloatTimersRef.current;
    if (ft.hold != null) {
      window.clearTimeout(ft.hold);
      ft.hold = null;
    }
    if (ft.done != null) {
      window.clearTimeout(ft.done);
      ft.done = null;
    }
    setAttrFloatFading(false);
    setAttrFloatFadeMove(false);
    setAttrFloatVisible(false);
    setAttrFloatPlacement(null);
  }, [attrFloatVisible, inspectUnitId, units]);

  useLayoutEffect(() => {
    const su = units.find((u) => u.id === selectedId);
    if (narrowUi || !su || (phase !== "menu" && phase !== "tactic-menu")) {
      wideMenuAnchorRef.current = "right";
      setWideMenuAnchor("right");
      return;
    }
    const wrap = battleWrapRef.current;
    const cell =
      (wrap?.querySelector(`[data-battle-unit-cell="${su.x},${su.y}"]`) as HTMLElement | null) ??
      (wrap?.querySelector(`[data-battle-cell="${su.x},${su.y}"]`) as HTMLElement | null);
    const vp = wrap ? getWrapScrollportViewportRect(wrap) : null;
    const cr = cell?.getBoundingClientRect() ?? null;
    const floatSame = Boolean(
      attrFloatPlacement && floatUnit && selectedId === floatUnit.id
    );
    const fs =
      floatSame && attrFloatPlacement
        ? (attrFloatPlacement.side as "right" | "left" | "top" | "bottom")
        : null;
    const next = computeWideMenuAnchor(
      narrowUi,
      su.x,
      su.y,
      gridW,
      gridH,
      phase,
      fs,
      floatSame,
      cr && cr.width > 2 ? cr : null,
      vp && vp.width > 2 ? vp : null
    );
    wideMenuAnchorRef.current = next;
    setWideMenuAnchor(next);
  }, [
    narrowUi,
    phase,
    selectedId,
    units,
    gridW,
    gridH,
    attrFloatPlacement,
    floatUnit,
    cellCssEffective,
    visualEpoch,
  ]);

  useLayoutEffect(() => {
    if (!attrFloatVisible || !floatUnit || pendingMove) {
      setAttrFloatPlacement(null);
      return;
    }
    const run = () => {
      const wrap = battleWrapRef.current;
      const cell = wrap?.querySelector(
        `[data-battle-cell="${floatUnit.x},${floatUnit.y}"]`
      ) as HTMLElement | null;
      const root = attrFloatRootRef.current;
      const fw =
        root && root.offsetWidth > 48 ? root.offsetWidth : ATTR_FLOAT_EST_W;
      const fh =
        root && root.offsetHeight > 48 ? root.offsetHeight : ATTR_FLOAT_EST_H;
      const cr = cell?.getBoundingClientRect();
      const menuOpenForFloatUnit =
        floatUnit &&
        selectedId === floatUnit.id &&
        (phase === "menu" || phase === "tactic-menu");
      const skipSides = new Set<AttrFloatSide>();
      if (menuOpenForFloatUnit) {
        if (narrowUi) {
          skipSides.add("bottom");
        } else {
          const a = wideMenuAnchorRef.current;
          if (a === "right") skipSides.add("right");
          else if (a === "left") skipSides.add("left");
          else if (a === "top") skipSides.add("top");
          else if (a === "bottom") skipSides.add("bottom");
        }
      }
      if (!cr || cr.width < 2 || cr.height < 2) {
        setAttrFloatPlacement({
          left: Math.max(12, window.innerWidth / 2 - fw / 2),
          top: 80,
          side: "right",
        });
        return;
      }
      setAttrFloatPlacement(pickAttrFloatPlacement(cr, fw, fh, skipSides));
    };
    run();
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(run);
    });
    const wrap = battleWrapRef.current;
    wrap?.addEventListener("scroll", run, { passive: true });
    window.addEventListener("resize", run);
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      wrap?.removeEventListener("scroll", run);
      window.removeEventListener("resize", run);
    };
  }, [
    attrFloatVisible,
    floatUnit?.id,
    floatUnit?.x,
    floatUnit?.y,
    inspectTapSeq,
    visualEpoch,
    cellCssEffective,
    gridW,
    gridH,
    pendingMove,
    phase,
    selectedId,
    narrowUi,
    wideMenuAnchor,
    pendingMove,
  ]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    const enteredMenu = phase === "menu" && prev !== "menu";
    const enteredTactic = phase === "tactic-menu" && prev !== "tactic-menu";
    prevPhaseRef.current = phase;
    if (enteredTactic) {
      const en = TACTIC_ORDER.map((k) =>
        selectedUnit ? canAffordTactic(selectedUnit, k, battle) : false
      );
      const first = en.findIndex(Boolean);
      setTacticFocus(first >= 0 ? first : 0);
    }
    if (!enteredMenu || !selectedId) return;
    const su = units.find((u) => u.id === selectedId);
    if (!su) return;
    if (canMeleeAttack(su, units)) setMenuFocus(0);
    else if (canUseTactic(su, battle)) setMenuFocus(1);
    else setMenuFocus(2);
  }, [phase, selectedId, units, battle, selectedUnit]);

  useLayoutEffect(() => {
    if (!prevSnapRef.current || !prevHpRef.current) {
      const snap: Record<string, UnitSnap> = {};
      const hpMap: Record<string, number> = {};
      for (const u of units) {
        snap[u.id] = { x: u.x, y: u.y, hp: u.hp, level: u.level };
        hpMap[u.id] = u.hp;
      }
      prevSnapRef.current = snap;
      prevHpRef.current = hpMap;
      return;
    }

    for (const u of units) {
      const old = prevSnapRef.current[u.id];
      if (old) {
        if (old.hp > 0 && u.hp <= 0) {
          const uid = u.id;
          const prevT = pendingDeathRevealTimersRef.current.get(uid);
          if (prevT) window.clearTimeout(prevT);
          setLingerDeadIds((prev) => {
            const n = new Set(prev);
            n.add(uid);
            return n;
          });
          const reduced =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const delayMs =
            (reduced ? DMG_FLOAT_SEQUENCE_REDUCED_MS : DMG_FLOAT_SEQUENCE_MS) + DEATH_UI_AFTER_DMG_MS;
          const k = Date.now() + Math.random();
          const entry: DyingVisual = {
            key: k,
            unitId: uid,
            x: old.x,
            y: old.y,
            name: u.name,
            side: u.side,
            level: u.level,
            troopKind: u.troopKind,
          };
          const tid = window.setTimeout(() => {
            pendingDeathRevealTimersRef.current.delete(uid);
            setLingerDeadIds((prev) => {
              const n = new Set(prev);
              n.delete(uid);
              return n;
            });
            setDyingVisuals((list) => [...list, entry]);
            window.setTimeout(() => {
              setDyingVisuals((list) => list.filter((d) => d.key !== k));
            }, DEATH_TEXT_POP_MS);
          }, delayMs);
          pendingDeathRevealTimersRef.current.set(uid, tid);
        } else if (old.hp > 0 && u.hp > 0 && u.level > old.level) {
          const k = Date.now() + Math.random();
          setLevelUpVisuals((list) => [
            ...list,
            {
              key: k,
              unitId: u.id,
              x: u.x,
              y: u.y,
              name: u.name,
              side: u.side,
              newLevel: u.level,
            },
          ]);
          window.setTimeout(() => {
            setLevelUpVisuals((list) => list.filter((d) => d.key !== k));
          }, DEATH_TEXT_POP_MS);
        } else if (old.hp > 0 && u.hp > 0 && (old.x !== u.x || old.y !== u.y)) {
          const id = u.id;
          const dx = old.x - u.x;
          const dy = old.y - u.y;
          const prevClear = moveSlideFallbackTimersRef.current.get(id);
          if (prevClear) {
            window.clearTimeout(prevClear);
            moveSlideFallbackTimersRef.current.delete(id);
          }
          setTroopFacingById((prev) => ({
            ...prev,
            [id]: facingFromGridStep({ x: old.x, y: old.y }, { x: u.x, y: u.y }),
          }));
          setMoveSlide((prev) => ({
            ...prev,
            [id]: { dx, dy, gen: (prev[id]?.gen ?? 0) + 1 },
          }));
          /* prefers-reduced-motion 下无 animation，animationend 不会触发 */
          const tid = window.setTimeout(() => {
            moveSlideFallbackTimersRef.current.delete(id);
            setMoveSlide((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          }, MOVE_SLIDE_DURATION_MS + 48);
          moveSlideFallbackTimersRef.current.set(id, tid);
        }
      }

      prevSnapRef.current[u.id] = { x: u.x, y: u.y, hp: u.hp, level: u.level };
      prevHpRef.current[u.id] = u.hp;
    }
  }, [units]);

  /**
   * damagePulse 会在微任务里被 onDamagePulseConsumed 清空。
   * 若本 effect 依赖 damagePulse 且 return 里 clearTimeout，下一帧 pulse=null 时会误清掉刚安排的飘字定时器。
   * 因此：不在 cleanup 里清定时器；仅在新脉冲到来时覆盖旧定时器，并由 visualEpoch / 卸载时统一清理。
   */
  useEffect(() => {
    const p = battle.damagePulse;
    if (!p) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delayMs = reduced ? 80 : DAMAGE_FLOAT_DELAY_MS;
    const animMs = reduced ? 480 : DAMAGE_FLOAT_ANIM_MS;

    const ft = dmgFloatTimersRef.current;
    if (ft.delay) window.clearTimeout(ft.delay);
    if (ft.end) window.clearTimeout(ft.end);

    setHpBarLag((prev) => ({ ...prev, [p.unitId]: p.hpBefore }));
    setHitFxKind((prev) => ({ ...prev, [p.unitId]: p.kind }));
    setDmgFx(null);
    queueMicrotask(() => onDamagePulseConsumed());

    ft.delay = window.setTimeout(() => {
      setDmgFx({ unitId: p.unitId, amount: p.amount, key: p.key });
    }, delayMs);

    ft.end = window.setTimeout(() => {
      setDmgFx(null);
      setHpBarLag((prev) => {
        const next = { ...prev };
        delete next[p.unitId];
        return next;
      });
      setHitFxKind((prev) => {
        const next = { ...prev };
        delete next[p.unitId];
        return next;
      });
    }, delayMs + animMs);
  }, [battle.damagePulse, onDamagePulseConsumed]);

  useEffect(() => {
    return () => {
      const ft = dmgFloatTimersRef.current;
      if (ft.delay) window.clearTimeout(ft.delay);
      if (ft.end) window.clearTimeout(ft.end);
      ft.delay = undefined;
      ft.end = undefined;
      for (const t of pendingDeathRevealTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      pendingDeathRevealTimersRef.current.clear();
      setLingerDeadIds(new Set());
    };
  }, []);

  const onMenuKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "menu" || outcome !== "playing" || turn !== "player") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeOrRevert();
        return;
      }
      if (!actionMenuRevealReady) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setMenuFocus((f) => nextEnabledFocus(f, 1, attackOk, tacticOk));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setMenuFocus((f) => nextEnabledFocus(f, -1, attackOk, tacticOk));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const action = MENU_ORDER[menuFocus];
        if (action === "attack" && attackOk) onMenuAction("attack");
        else if (action === "tactic" && tacticOk) onMenuAction("tactic");
        else if (action === "wait") onMenuAction("wait");
      }
    },
    [
      phase,
      outcome,
      turn,
      menuFocus,
      attackOk,
      tacticOk,
      actionMenuRevealReady,
      onMenuAction,
      onEscapeOrRevert,
    ]
  );

  const onTacticMenuKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "tactic-menu" || outcome !== "playing" || turn !== "player") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeOrRevert();
        return;
      }
      if (!actionMenuRevealReady) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setTacticFocus((f) => nextTacticFocus(f, 1, tacticEnabled));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setTacticFocus((f) => nextTacticFocus(f, -1, tacticEnabled));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const k = TACTIC_ORDER[tacticFocus];
        if (tacticEnabled[tacticFocus]) onTacticPick(k);
      }
    },
    [
      phase,
      outcome,
      turn,
      tacticFocus,
      tacticEnabled,
      actionMenuRevealReady,
      onTacticPick,
      onEscapeOrRevert,
    ]
  );

  const onMovePhaseKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "move" || outcome !== "playing" || turn !== "player") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeOrRevert();
      }
    },
    [phase, outcome, turn, onEscapeOrRevert]
  );

  const onPickKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "pick-target" || outcome !== "playing" || turn !== "player") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeOrRevert();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const d =
          e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        onPickNavigate(d);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onPickConfirmFocused();
      }
    },
    [phase, outcome, turn, onEscapeOrRevert, onPickNavigate, onPickConfirmFocused]
  );

  useEffect(() => {
    if (phase !== "menu") return;
    window.addEventListener("keydown", onMenuKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onMenuKeyDown as unknown as EventListener);
  }, [phase, onMenuKeyDown]);

  useEffect(() => {
    if (phase !== "tactic-menu") return;
    window.addEventListener("keydown", onTacticMenuKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onTacticMenuKeyDown as unknown as EventListener);
  }, [phase, onTacticMenuKeyDown]);

  useEffect(() => {
    if (phase !== "pick-target") return;
    window.addEventListener("keydown", onPickKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onPickKeyDown as unknown as EventListener);
  }, [phase, onPickKeyDown]);

  useEffect(() => {
    if (phase !== "move") return;
    window.addEventListener("keydown", onMovePhaseKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onMovePhaseKeyDown as unknown as EventListener);
  }, [phase, onMovePhaseKeyDown]);

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      if (outcome !== "playing" || turn !== "player" || turnIntroLocked) return;
      if (
        phase === "move" ||
        phase === "menu" ||
        phase === "tactic-menu" ||
        phase === "pick-target"
      ) {
        e.preventDefault();
        onEscapeOrRevert();
      }
    },
    [outcome, turn, phase, turnIntroLocked, onEscapeOrRevert]
  );

  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      cells.push({ x, y });
    }
  }
  const byPos = new Map<string, (typeof units)[0]>();
  for (const u of units) {
    if (u.hp > 0) {
      byPos.set(`${u.x},${u.y}`, u);
    } else if (lingerDeadIds.has(u.id)) {
      byPos.set(`${u.x},${u.y}`, u);
    }
  }

  const tryActivateMenu = (index: number) => {
    const action = MENU_ORDER[index];
    if (action === "attack" && attackOk) onMenuAction("attack");
    else if (action === "tactic" && tacticOk) onMenuAction("tactic");
    else if (action === "wait") onMenuAction("wait");
  };

  const isPickCandidate =
    phase === "pick-target" && pickTarget
      ? (id: string) => pickTarget.targetIds.includes(id)
      : () => false;

  const terrainAt = (x: number, y: number): Terrain => terrain[y]?.[x] ?? "plain";
  const terrainClass = (x: number, y: number) => `terrain-${terrainAt(x, y)}`;

  const roundNum = battleRound >= 1 ? battleRound : 1;
  const roundCap =
    typeof maxBattleRounds === "number" && maxBattleRounds > 0 ? maxBattleRounds : null;
  const roundTitle = roundCap ? `第 ${roundNum} / ${roundCap} 回合` : `第 ${roundNum} 回合`;
  const turnBannerLabel =
    turnBanner === "player"
      ? `${roundTitle} · 我方回合`
      : turnBanner === "enemy"
        ? `${roundTitle} · 敌方回合`
        : "";

  const showMoveRange =
    outcome === "playing" &&
    turn === "player" &&
    phase === "move" &&
    Boolean(selectedId) &&
    moveTargets.length > 0;

  /** 窄屏：菜单在格下方时，若属性浮窗也在下方则改到格上方（与 index.css 窄屏 action-menu--mirror 一致） */
  const narrowMenuMirror =
    narrowUi &&
    Boolean(
      attrFloatPlacement &&
        floatUnit &&
        selectedId === floatUnit.id &&
        (phase === "menu" || phase === "tactic-menu") &&
        attrFloatPlacement.side === "bottom"
    );

  const battleCellCtxList = cells.map(({ x, y }) => {
    const u = byPos.get(`${x},${y}`);
    const isMove = moveSet.has(`${x},${y}`);
    const isSelected = u && u.id === selectedId;
    const turnDone = u && u.hp > 0 && u.moved && u.acted;
    const onOwnCell =
      phase === "move" &&
      selectedId &&
      (() => {
        const su = units.find((z) => z.id === selectedId);
        return Boolean(su && !su.moved && su.x === x && su.y === y);
      })();
    const canClickTile =
      outcome === "playing" &&
      turn === "player" &&
      phase === "move" &&
      (isMove || onOwnCell) &&
      selectedId &&
      !pendingMove &&
      !turnIntroLocked;
    const showMenu =
      Boolean(u) &&
      u!.id === selectedId &&
      phase === "menu" &&
      outcome === "playing" &&
      turn === "player";
    const showTacticMenu =
      Boolean(u) &&
      u!.id === selectedId &&
      phase === "tactic-menu" &&
      outcome === "playing" &&
      turn === "player";
    /* 受伤起就播受击（与血条滞后一致）；飘字延迟期间也要有抖动/闪光 */
    const hitActive = Boolean(
      u && (Object.prototype.hasOwnProperty.call(hpBarLag, u.id) || dmgFx?.unitId === u.id)
    );
    const hitKind: "melee" | "tactic" | undefined = u ? hitFxKind[u.id] : undefined;
    const pickCand = Boolean(u && u.side === "enemy" && isPickCandidate(u.id));
    const pickFocus = Boolean(u && u.id === focusedEnemyId);
    const slide = u && moveSlide[u.id];
    const pendingSelectionGlow = Boolean(
      isSelected &&
        u &&
        u.hp > 0 &&
        !(u.moved && u.acted) &&
        outcome === "playing" &&
        turn === "player" &&
        (phase === "select" || phase === "move" || phase === "menu" || phase === "tactic-menu")
    );
    const deathHere = dyingVisuals.find((d) => d.x === x && d.y === y);
    const rosterPulseHere = rosterPulse !== null && rosterPulse.x === x && rosterPulse.y === y;

    return {
      x,
      y,
      u,
      isMove,
      isSelected,
      turnDone,
      canClickTile,
      showMenu,
      showTacticMenu,
      hitActive,
      hitKind,
      pickCand,
      pickFocus,
      slide,
      pendingSelectionGlow,
      deathHere,
      rosterPulseHere,
    };
  });

  return (
    <div
      ref={battleWrapRef}
      className={["battle-wrap", fitViewport ? "battle-wrap--fit" : ""].filter(Boolean).join(" ")}
      role="application"
      aria-label="battlefield"
      onContextMenu={onContextMenu}
    >
      {outcome === "playing" && turnIntroLocked && (
        <div className="turn-intro-input-blocker" aria-hidden />
      )}
      {turnBanner && (
        <div
          className={`turn-phase-banner-root turn-phase-banner-${turnBanner}`}
          role="status"
          aria-live="polite"
          aria-label={turnBannerLabel}
        >
          <p key={turnBannerSeq} className="turn-phase-banner-text">
            {turnBannerLabel}
          </p>
        </div>
      )}
      {outcome === "playing" &&
        turn === "player" &&
        phase !== "menu" &&
        phase !== "tactic-menu" &&
        !pendingMove &&
        attrFloatVisible &&
        floatUnit && (
        <div
          ref={attrFloatRootRef}
          className={[
            "unit-attr-float",
            attrFloatFading ? "unit-attr-float--fading" : "",
            attrFloatFadeMove ? "unit-attr-float--fade-move" : "",
            !attrFloatPlacement ? "unit-attr-float--unplaced" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            attrFloatPlacement
              ? { left: attrFloatPlacement.left, top: attrFloatPlacement.top }
              : undefined
          }
          data-attr-float-side={attrFloatPlacement?.side}
          role="status"
          aria-label={`${floatUnit.name} 属性`}
        >
          <div className="unit-attr-float__card">
            <div className="unit-attr-float__head">
              <GeneralAvatar
                name={floatUnit.name}
                catalogId={floatUnit.portraitCatalogId}
                size={44}
                title={floatUnit.name}
              />
              <div className="unit-attr-float__head-text">
                <div className="unit-attr-float__name">{floatUnit.name}</div>
                <div className="unit-attr-float__meta">
                  {floatUnit.side === "player" ? "我军" : "敌军"} · Lv.{floatUnit.level} ·{" "}
                  {TROOP_KIND_LABEL[floatUnit.troopKind]}
                  {floatUnit.troopKind === "archer" && ` · 射程${ARCHER_ATTACK_RANGE}`}
                </div>
              </div>
            </div>
            <div className="unit-attr-float__grid">
              <span className="unit-attr-float__tag">{ARMY_TYPE_LABEL[floatUnit.armyType]}</span>
              <span className="unit-attr-float__tag">移动力 {floatUnit.move}</span>
              <span className="unit-attr-float__tag">武力 {floatUnit.might}</span>
              <span className="unit-attr-float__tag">
                攻击{" "}
                {attackPowerOnTerrain(
                  floatUnit.might,
                  floatUnit.level,
                  floatUnit.troopKind,
                  floatUnit.armyType,
                  terrainAt(floatUnit.x, floatUnit.y)
                )}
                {isArmyPreferredTerrain(floatUnit.armyType, terrainAt(floatUnit.x, floatUnit.y))
                  ? "↑"
                  : ""}
              </span>
              <span className="unit-attr-float__tag">
                防御{" "}
                {defensePowerOnTerrain(
                  floatUnit.might,
                  floatUnit.level,
                  floatUnit.troopKind,
                  floatUnit.armyType,
                  terrainAt(floatUnit.x, floatUnit.y)
                )}
                {isArmyPreferredTerrain(floatUnit.armyType, terrainAt(floatUnit.x, floatUnit.y))
                  ? "↑"
                  : ""}
              </span>
              <span className="unit-attr-float__tag">智力 {floatUnit.intel}</span>
              {floatUnit.side === "player" && (
                <span className="unit-attr-float__tag">
                  计策 {floatUnit.tacticPoints}/{floatUnit.tacticMax}
                </span>
              )}
            </div>
            <div className="unit-attr-float__hp">
              <span className="unit-attr-float__hp-label">
                兵力 {floatUnit.hp} / {floatUnit.maxHp}
              </span>
              <div
                className="unit-attr-float__hp-bar"
                role="presentation"
                aria-hidden
              >
                <div
                  className={[
                    "unit-attr-float__hp-fill",
                    floatUnit.side === "player"
                      ? "unit-attr-float__hp-fill--player"
                      : "unit-attr-float__hp-fill--enemy",
                  ].join(" ")}
                  style={{
                    width: `${ratioPercent(floatUnit.hp, floatUnit.maxHp)}%`,
                  }}
                />
              </div>
            </div>
            {floatUnit.side === "player" && (() => {
              const expCap = expToNextLevel(floatUnit.level);
              const finiteCap = Number.isFinite(expCap) && expCap > 0;
              const expPct = finiteCap ? ratioPercent(floatUnit.exp, expCap) : 100;
              return (
                <div className="unit-attr-float__exp">
                  <span className="unit-attr-float__exp-label">
                    {finiteCap ? `${floatUnit.exp} / ${expCap}` : `${floatUnit.exp}（已满级）`}
                  </span>
                  <div className="unit-attr-float__exp-bar" aria-hidden>
                    <div
                      className="unit-attr-float__exp-fill"
                      style={{
                        width: `${expPct}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
            <div className="unit-attr-float__terrain">
              脚下 {TERRAIN_LABEL[terrainAt(floatUnit.x, floatUnit.y)]}
            </div>
          </div>
        </div>
      )}
      <div
        className={["battle-scene", fitViewport ? "battle-scene--fit" : ""].filter(Boolean).join(" ")}
      >
        <div className="battle-scene__ground" aria-hidden />
        {/*
          fit 模式下 .battle-grid 的 margin-top 被置 0，顶行单位血条（伸出格子上方）会少可滚空间；
          用占位撑出约 1.5 行格距的顶缓冲（非 fit 时仍靠原 margin-top）。
        */}
        {fitViewport ? (
          <div
            className="battle-grid-scroll-headroom"
            aria-hidden
            style={{
              flexShrink: 0,
              width: "100%",
              height: fitScrollHeadroomPx,
              pointerEvents: "none",
            }}
          />
        ) : null}
        <div
          className={["battle-grid", showMoveRange ? "battle-grid--move-preview" : ""]
            .filter(Boolean)
            .join(" ")}
          style={
            {
              ["--cell" as string]: cellCssEffective,
              gridTemplateColumns: `repeat(${gridW}, var(--cell))`,
              gridTemplateRows: `repeat(${gridH}, var(--cell))`,
            } as CSSProperties
          }
        >
        {battleCellCtxList.map(
          ({
            x,
            y,
            u,
            isMove,
            canClickTile,
            deathHere,
            rosterPulseHere,
          }) => (
            <div
              key={`t-${x}-${y}`}
              data-battle-cell={`${x},${y}`}
              className={[
                "battle-slot",
                "battle-slot--terrain",
                rosterPulseHere && !u ? "battle-slot--roster-pulse" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ gridColumn: x + 1, gridRow: y + 1 }}
            >
              <div
                className={[
                  "cell",
                  terrainClass(x, y),
                  isMove ? "move-hint" : "",
                  canClickTile ? "clickable-tile" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (canClickTile) onCellClick(x, y);
                }}
                title={`${TERRAIN_LABEL[terrainAt(x, y)]} (${x + 1},${y + 1})`}
                role="presentation"
              />
              {dmgFx &&
                (() => {
                  const victim = units.find(
                    (uu) => uu.id === dmgFx.unitId && uu.x === x && uu.y === y && uu.hp <= 0
                  );
                  if (!victim || lingerDeadIds.has(victim.id)) return null;
                  const hk = hitFxKind[victim.id];
                  return (
                    <div key={`terrain-dmg-${dmgFx.key}`} className="battle-cell-dmg-float-slot" aria-hidden>
                      <span
                        className={[
                          "dmg-float",
                          "unit-standee__dmg-float",
                          hk === "tactic" ? "dmg-float--tactic" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        -{dmgFx.amount}
                      </span>
                    </div>
                  );
                })()}
              {deathHere && (
                <div key={deathHere.key} className="death-overlay-slot" aria-hidden>
                  <div
                    className={[
                      "unit-standee",
                      "unit-standee--death",
                      deathHere.side,
                      "unit-death-fade",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "unit-standee__body",
                        deathHere.side,
                        `troop-${deathHere.troopKind}`,
                      ].join(" ")}
                    >
                      <TroopEmblem
                        kind={deathHere.troopKind}
                        side={deathHere.side}
                        facing={troopFacingById[deathHere.unitId] ?? (deathHere.side === "enemy" ? "down" : "up")}
                        showTroopBadge={false}
                      />
                    </div>
                    <div className="unit-standee__hud unit-standee__hud--ghost unit-standee__hud--hp-only" aria-hidden>
                      <div className="unit-standee__hud-hp-row">
                        <span className="unit-standee__lv unit-standee__lv--ghost">Lv.{deathHere.level}</span>
                        <div className="unit-standee__hpbar" aria-hidden>
                          <div className="unit-standee__hpfill" style={{ width: "0%" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        )}
        {battleCellCtxList.map(
          ({
            x,
            y,
            u,
            isSelected,
            turnDone,
            showMenu,
            showTacticMenu,
            hitActive,
            hitKind,
            pickCand,
            pickFocus,
            slide,
            pendingSelectionGlow,
            isMove,
            rosterPulseHere,
          }) => {
            if (!u) return null;
            const hpForBar = hpBarLag[u.id] ?? u.hp;
            return (
              <div
                key={`unit-${u.id}`}
                data-battle-unit-cell={`${x},${y}`}
                className={[
                  "battle-slot",
                  "battle-slot--units",
                  showMenu || showTacticMenu ? "battle-slot--menu-open" : "",
                  pickCand ? "battle-slot--pick-candidate" : "",
                  pickFocus ? "battle-slot--pick-focus" : "",
                  rosterPulseHere ? "battle-slot--roster-pulse" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  gridColumn: x + 1,
                  gridRow: y + 1,
                  zIndex: battleSlotStackZ(x, y, gridW, {
                    menuOpen: Boolean(showMenu || showTacticMenu),
                    pickFocus: Boolean(pickFocus),
                    pickCand: Boolean(pickCand),
                    rosterPulse: Boolean(rosterPulseHere && u),
                    moveSlide: Boolean(slide),
                    moveHint: Boolean(isMove),
                    hasLiveUnit: Boolean(u.hp > 0 || lingerDeadIds.has(u.id)),
                  }),
                }}
              >
                <div
                  key={slide ? `mv-${u.id}-${slide.gen}` : `st-${u.id}`}
                  className={[
                    "unit-standee",
                    u.side,
                    u.hp <= 0 ? "unit-standee--linger-dead" : "",
                    slide ? "unit-move-slide" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    slide
                      ? ({
                          "--sdx": String(slide.dx),
                          "--sdy": String(slide.dy),
                          "--unit-move-slide-ms": `${MOVE_SLIDE_DURATION_MS}ms`,
                        } as CSSProperties)
                      : undefined
                  }
                  onAnimationEnd={(e: AnimationEvent) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.animationName !== "unit-move-slide-in") return;
                    const uid = u.id;
                    const fb = moveSlideFallbackTimersRef.current.get(uid);
                    if (fb) {
                      window.clearTimeout(fb);
                      moveSlideFallbackTimersRef.current.delete(uid);
                    }
                    setMoveSlide((prev) => {
                      if (!prev[uid]) return prev;
                      const next = { ...prev };
                      delete next[uid];
                      return next;
                    });
                  }}
                >
                  <div
                    role={u.hp <= 0 ? "presentation" : "button"}
                    tabIndex={u.hp <= 0 ? -1 : 0}
                    className={[
                      "unit-standee__body",
                      u.side,
                      `troop-${u.troopKind}`,
                      isSelected ? "selected" : "",
                      turnDone ? "unit-turn-done" : "",
                      pendingSelectionGlow ? "unit-pending-highlight" : "",
                      hitActive
                        ? hitKind === "tactic"
                          ? "unit-hit unit-hit--tactic"
                          : "unit-hit"
                        : "",
                      pickCand ? "pick-target-candidate" : "",
                      pickFocus ? "pick-target-focus" : "",
                      outcome === "playing" &&
                      turn === "player" &&
                      (phase === "move" || phase === "menu" || phase === "tactic-menu") &&
                      u.side === "player" &&
                      u.hp > 0 &&
                      !(u.moved && u.acted) &&
                      !pendingMove &&
                      !turnIntroLocked &&
                      selectedId != null &&
                      u.id === selectedId
                        ? "selectable"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={
                      u.hp <= 0
                        ? `${u.name}，${TROOP_KIND_LABEL[u.troopKind]}，已阵亡`
                        : `${u.name}，${TROOP_KIND_LABEL[u.troopKind]}，等级 ${u.level}，生命 ${u.hp}/${u.maxHp}`
                    }
                    onMouseEnter={() => {
                      if (u.hp <= 0) return;
                      if (phase === "pick-target" && u.side === "enemy" && isPickCandidate(u.id)) {
                        onPickHoverEnemy(u.id);
                      }
                    }}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      if (u.hp <= 0) return;
                      onUnitClick(u.id, u.side);
                    }}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (u.hp <= 0) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onUnitClick(u.id, u.side);
                      }
                    }}
                  >
                    <TroopEmblem
                      kind={u.troopKind}
                      side={u.side}
                      facing={troopFacingById[u.id] ?? (u.side === "enemy" ? "down" : "up")}
                      showTroopBadge={false}
                      motion={slide ? "walk" : "idle"}
                    />
                  </div>
                  {dmgFx?.unitId === u.id && (
                    <span
                      className={[
                        "dmg-float",
                        "unit-standee__dmg-float",
                        hitKind === "tactic" ? "dmg-float--tactic" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={dmgFx.key}
                    >
                      -{dmgFx.amount}
                    </span>
                  )}
                  <div className="unit-standee__hud unit-standee__hud--hp-only" aria-hidden>
                    <div className="unit-standee__hud-hp-row">
                      <span
                        className={[
                          "unit-standee__lv",
                          u.side === "enemy" ? "unit-standee__lv--enemy" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        Lv.{u.level}
                      </span>
                      <div className="unit-standee__hpbar" aria-hidden>
                        <div
                          className="unit-standee__hpfill"
                          style={{
                            width: `${Math.max(0, Math.min(100, (hpForBar / Math.max(1, u.maxHp)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  {showMenu && (
                    <div
                      className={[
                        "action-menu",
                        narrowUi
                          ? narrowMenuMirror
                            ? "action-menu--mirror"
                            : ""
                          : wideMenuAnchor === "left"
                            ? "action-menu--mirror"
                            : wideMenuAnchor === "top"
                              ? "action-menu--wide-top"
                              : wideMenuAnchor === "bottom"
                                ? "action-menu--wide-bottom"
                                : "",
                        actionMenuRevealReady ? "action-menu--revealed" : "action-menu--pre-reveal",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      role="menu"
                      aria-label="Actions"
                      aria-hidden={!actionMenuRevealReady}
                      inert={!actionMenuRevealReady ? true : undefined}
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                      onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className={[
                          "action-menu-item",
                          attackOk ? "enabled" : "disabled",
                          menuFocus === 0 ? "focused" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={!attackOk}
                        onMouseEnter={() => setMenuFocus(0)}
                        onClick={() => tryActivateMenu(0)}
                      >
                        {physicalAttackMenuLabel(u)}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={[
                          "action-menu-item",
                          tacticOk ? "enabled" : "disabled",
                          menuFocus === 1 ? "focused" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={!tacticOk}
                        onMouseEnter={() => setMenuFocus(1)}
                        onClick={() => tryActivateMenu(1)}
                      >
                        使用计策
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={[
                          "action-menu-item",
                          "enabled",
                          menuFocus === 2 ? "focused" : "",
                        ].join(" ")}
                        onMouseEnter={() => setMenuFocus(2)}
                        onClick={() => tryActivateMenu(2)}
                      >
                        待机
                      </button>
                    </div>
                  )}
                  {showTacticMenu && (
                    <div
                      className={[
                        "action-menu",
                        "tactic-submenu",
                        narrowUi
                          ? narrowMenuMirror
                            ? "action-menu--mirror"
                            : ""
                          : wideMenuAnchor === "left"
                            ? "action-menu--mirror"
                            : wideMenuAnchor === "top"
                              ? "action-menu--wide-top"
                              : wideMenuAnchor === "bottom"
                                ? "action-menu--wide-bottom"
                                : "",
                        actionMenuRevealReady ? "action-menu--revealed" : "action-menu--pre-reveal",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      role="menu"
                      aria-label="Tactics"
                      aria-hidden={!actionMenuRevealReady}
                      inert={!actionMenuRevealReady ? true : undefined}
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                      onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
                    >
                      {TACTIC_ORDER.map((kind, i) => {
                        const def = TACTIC_DEF[kind];
                        const ok = tacticEnabled[i];
                        return (
                          <button
                            key={kind}
                            type="button"
                            role="menuitem"
                            className={[
                              "action-menu-item",
                              ok ? "enabled" : "disabled",
                              tacticFocus === i ? "focused" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            disabled={!ok}
                            onMouseEnter={() => setTacticFocus(i)}
                            onClick={() => ok && onTacticPick(kind)}
                          >
                            {def.name}（{def.cost} 计）
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        role="menuitem"
                        className="action-menu-item enabled"
                        onClick={onEscapeOrRevert}
                      >
                        返回
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          }
        )}
        {dyingVisuals.map((d) => (
          <div
            key={`death-text-${d.key}`}
            className="battle-slot battle-slot--units death-text-pop-slot"
            style={{
              gridColumn: deathTextGridColumn(d.x, gridW),
              gridRow: d.y + 1,
              zIndex: 96_000 + d.y * gridW + d.x,
            }}
            aria-hidden
          >
            <p
              className={[
                "death-text-pop",
                d.side === "enemy" ? "death-text-pop--enemy" : "death-text-pop--player",
              ].join(" ")}
            >
              {`${d.name}被斩于阵前`}
            </p>
          </div>
        ))}
        {levelUpVisuals.map((lv) => (
          <div
            key={`level-text-${lv.key}`}
            className="battle-slot battle-slot--units death-text-pop-slot"
            style={{
              gridColumn: deathTextGridColumn(lv.x, gridW),
              gridRow: lv.y + 1,
              zIndex: 96_200 + lv.y * gridW + lv.x,
            }}
            aria-hidden
          >
            <p
              className={[
                "death-text-pop",
                lv.side === "enemy" ? "death-text-pop--enemy" : "death-text-pop--player",
              ].join(" ")}
            >
              {`${lv.name}级别上升为${lv.newLevel}`}
            </p>
          </div>
        ))}
        </div>
      </div>
      <div className="battle-menu-hint-slot" aria-live="polite">
        {phase === "menu" && actionMenuRevealReady && (
          <p className="menu-hint">
            方向键选择 · Enter 确认 · Esc / 右键 取消并恢复回合初状态
          </p>
        )}
        {phase === "tactic-menu" && actionMenuRevealReady && (
          <p className="menu-hint">
            方向键选择计策 · Enter 确认 · Esc / 右键 返回行动菜单
          </p>
        )}
        {phase === "pick-target" && (
          <p className="menu-hint">
            方向键切换目标 · Enter 确认 · Esc / 右键 返回上一层
          </p>
        )}
      </div>
    </div>
  );
});

export default GameBattle;
