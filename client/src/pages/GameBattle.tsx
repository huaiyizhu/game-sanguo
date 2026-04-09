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
  expToNextLevel,
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
/** 极宽地图时每格不低于此值，避免点选过难 */
const BATTLE_CELL_MIN_PX = 32;
/** fitViewport 下每格固定为该值（与上限一致） */
const BATTLE_CELL_PX_VIEWPORT = BATTLE_CELL_MAX_PX;

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

type UnitSnap = { x: number; y: number; hp: number };

type DyingVisual = {
  key: number;
  x: number;
  y: number;
  name: string;
  side: Side;
  level: number;
  troopKind: TroopKind;
};

/** 阵亡条带横向跨多格，以死亡格为中心对齐（约 5 格宽） */
const DEATH_TEXT_COL_SPAN = 5;
/** 阵亡文案/残影展示时长：拉长以确保玩家能看清「被斩于阵前」 */
const DEATH_TEXT_POP_MS = 1600;
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
  /** 滚动战场使该单位所在格进入视野，并短暂高亮；单位须存活 */
  focusUnitOnMap: (unitId: string) => boolean;
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

  const floatUnit = useMemo(() => {
    if (!inspectUnitId) return null;
    return units.find((u) => u.id === inspectUnitId && u.hp > 0) ?? null;
  }, [inspectUnitId, units]);

  const cellCss = useMemo(() => {
    return `min(${BATTLE_CELL_MAX_PX}px, max(${BATTLE_CELL_MIN_PX}px, calc((min(96vw, 1240px) - 280px) / ${gridW})))`;
  }, [gridW]);
  const [fitCellPx, setFitCellPx] = useState(0);
  const cellCssEffective = useMemo(() => {
    if (fitViewport) return fitCellPx > 0 ? `${fitCellPx}px` : `${BATTLE_CELL_PX_VIEWPORT}px`;
    return cellCss;
  }, [fitViewport, fitCellPx, cellCss]);
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

  const [narrowUi, setNarrowUi] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setNarrowUi(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useImperativeHandle(ref, () => ({
    focusUnitOnMap(unitId: string) {
      const u = battleSnapRef.current.units.find((z) => z.id === unitId);
      if (!u) return false;
      if (rosterPulseTimerRef.current) {
        window.clearTimeout(rosterPulseTimerRef.current);
        rosterPulseTimerRef.current = null;
      }
      setRosterPulse({ x: u.x, y: u.y });
      rosterPulseTimerRef.current = window.setTimeout(() => {
        setRosterPulse(null);
        rosterPulseTimerRef.current = null;
      }, 2000);
      requestAnimationFrame(() => {
        const wrap = battleWrapRef.current;
        const cell = wrap?.querySelector(`[data-battle-cell="${u.x},${u.y}"]`);
        cell?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
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

  useEffect(() => {
    if (!fitViewport) {
      setFitCellPx(0);
      return;
    }
    setFitCellPx(BATTLE_CELL_PX_VIEWPORT);
  }, [fitViewport]);

  const reportScrollViewport = useCallback(() => {
    const el = battleWrapRef.current;
    const cb = onScrollViewportChangeRef.current;
    if (!el || !cb || !fitViewport) return;
    const sw = el.scrollWidth;
    const sh = el.scrollHeight;
    if (sw < 2 || sh < 2) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const left = Math.max(0, Math.min(1, el.scrollLeft / sw));
    const top = Math.max(0, Math.min(1, el.scrollTop / sh));
    const width = Math.max(0, Math.min(1, cw / sw));
    const height = Math.max(0, Math.min(1, ch / sh));
    cb({ left, top, width, height });
  }, [fitViewport]);

  useEffect(() => {
    if (!fitViewport || !onScrollViewportChange) return;
    const el = battleWrapRef.current;
    if (!el) return;
    reportScrollViewport();
    el.addEventListener("scroll", reportScrollViewport, { passive: true });
    const ro = new ResizeObserver(() => reportScrollViewport());
    ro.observe(el);
    window.addEventListener("resize", reportScrollViewport);
    return () => {
      el.removeEventListener("scroll", reportScrollViewport);
      ro.disconnect();
      window.removeEventListener("resize", reportScrollViewport);
    };
  }, [fitViewport, onScrollViewportChange, reportScrollViewport, gridW, gridH]);

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
  const [moveSlide, setMoveSlide] = useState<Record<string, { dx: number; dy: number }>>({});
  const [actionMenuRevealReady, setActionMenuRevealReady] = useState(false);
  const [dyingVisuals, setDyingVisuals] = useState<DyingVisual[]>([]);
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
    setActionMenuRevealReady(false);
    setDyingVisuals([]);
    setDmgFx(null);
    setHpBarLag({});
    setHitFxKind({});
    const ft = dmgFloatTimersRef.current;
    if (ft.delay) window.clearTimeout(ft.delay);
    if (ft.end) window.clearTimeout(ft.end);
    ft.delay = undefined;
    ft.end = undefined;
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
        if (narrowUi) skipSides.add("bottom");
        else skipSides.add("right");
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
        snap[u.id] = { x: u.x, y: u.y, hp: u.hp };
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
          const k = Date.now() + Math.random();
          setDyingVisuals((list) => [
            ...list,
            {
              key: k,
              x: old.x,
              y: old.y,
              name: u.name,
              side: u.side,
              level: u.level,
              troopKind: u.troopKind,
            },
          ]);
          window.setTimeout(() => {
            setDyingVisuals((list) => list.filter((d) => d.key !== k));
          }, DEATH_TEXT_POP_MS);
        } else if (old.hp > 0 && u.hp > 0 && (old.x !== u.x || old.y !== u.y)) {
          const id = u.id;
          const dx = old.x - u.x;
          const dy = old.y - u.y;
          setMoveSlide((prev) => ({ ...prev, [id]: { dx, dy } }));
          /* prefers-reduced-motion 下无 animation，animationend 不会触发 */
          window.setTimeout(() => {
            setMoveSlide((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          }, MOVE_SLIDE_DURATION_MS + 48);
        }
      }

      prevSnapRef.current[u.id] = { x: u.x, y: u.y, hp: u.hp };
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
    if (u.hp > 0) byPos.set(`${u.x},${u.y}`, u);
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

  /** 浮窗与行动/计策菜单同侧时的回退：镜像菜单位置（与 index.css 中 .action-menu 默认侧一致） */
  const mirrorActionMenu =
    Boolean(
      attrFloatPlacement &&
        floatUnit &&
        selectedId === floatUnit.id &&
        (phase === "menu" || phase === "tactic-menu") &&
        (narrowUi
          ? attrFloatPlacement.side === "bottom"
          : attrFloatPlacement.side === "right")
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
              <span className="unit-attr-float__tag">防御 {floatUnit.defense}</span>
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
            {floatUnit.side === "player" && (
              <div className="unit-attr-float__exp">
                <span className="unit-attr-float__exp-label">
                  经验 {floatUnit.exp} / {expToNextLevel(floatUnit.level)}
                </span>
                <div className="unit-attr-float__exp-bar" aria-hidden>
                  <div
                    className="unit-attr-float__exp-fill"
                    style={{
                      width: `${ratioPercent(
                        floatUnit.exp,
                        expToNextLevel(floatUnit.level)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
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
                      <TroopEmblem kind={deathHere.troopKind} side={deathHere.side} showTroopBadge={false} />
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
                    hasLiveUnit: Boolean(u.hp > 0),
                  }),
                }}
              >
                <div
                  className={[
                    "unit-standee",
                    u.side,
                    slide ? "unit-move-slide" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    slide
                      ? ({
                          "--sdx": String(slide.dx),
                          "--sdy": String(slide.dy),
                        } as CSSProperties)
                      : undefined
                  }
                  onAnimationEnd={(e: AnimationEvent) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.animationName !== "unit-move-slide-in") return;
                    const uid = u.id;
                    setMoveSlide((prev) => {
                      if (!prev[uid]) return prev;
                      const next = { ...prev };
                      delete next[uid];
                      return next;
                    });
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
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
                    aria-label={`${u.name}，${TROOP_KIND_LABEL[u.troopKind]}，等级 ${u.level}，生命 ${u.hp}/${u.maxHp}`}
                    onMouseEnter={() => {
                      if (phase === "pick-target" && u.side === "enemy" && isPickCandidate(u.id)) {
                        onPickHoverEnemy(u.id);
                      }
                    }}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      onUnitClick(u.id, u.side);
                    }}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onUnitClick(u.id, u.side);
                      }
                    }}
                  >
                    <TroopEmblem kind={u.troopKind} side={u.side} showTroopBadge={false} />
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
                        mirrorActionMenu ? "action-menu--mirror" : "",
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
                        mirrorActionMenu ? "action-menu--mirror" : "",
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
