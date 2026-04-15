import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  apiDeleteSave,
  apiListSaves,
  apiPutSave,
  type ServerSaveRow,
} from "../api";
import {
  advanceBattleScript,
  advancePendingMove,
  cancelPickTarget,
  cancelTacticMenu,
  cheatInstantLevelUp,
  commitPendingVictory,
  confirmPickTarget,
  createBattleForScenario,
  createInitialBattle,
  createNextBattleAfterVictory,
  endPlayerTurnImmediately,
  ensureBattleFields,
  getNextScenarioId,
  escapeOrRevertUnit,
  gridCellClick,
  isValidSave,
  menuMeleeAttack,
  menuOpenTacticMenu,
  MOVE_STEP_MS_ENEMY,
  MOVE_STEP_MS_PLAYER,
  POST_ACTION_TURN_BANNER_DELAY_MS,
  pickTargetFocusEnemy,
  pickTargetNavigate,
  processSingleEnemyStep,
  selectPlayerUnit,
  skipOrEndIfStuck,
  tacticMenuChoose,
  TURN_PHASE_BANNER_MS,
  victoryRevealHoldMs,
  waitAfterMove,
} from "../game/battle";
import { listGeneralsSorted } from "../game/generals";
import { listScenarioEntries } from "../game/scenarios";
import type { BattleState, Side, Terrain, Unit } from "../game/types";
import {
  ARCHER_ATTACK_RANGE,
  ARMY_TYPE_LABEL,
  attackPowerForUnit,
  attackPowerOnTerrain,
  defensePowerOnTerrain,
  expToNextLevel,
  isArmyPreferredTerrain,
  maxHpForLevel,
  MAX_UNIT_LEVEL,
  normalizeTerrainCell,
  tacticMaxForUnit,
  TERRAIN_LABEL,
  TROOP_KIND_LABEL,
  type TacticKind,
} from "../game/types";

const TERRAIN_LEGEND: { id: Terrain; ch: string }[] = [
  { id: "plain", ch: "陆" },
  { id: "forest", ch: "林" },
  { id: "water", ch: "水" },
  { id: "mountain", ch: "山" },
  { id: "desert", ch: "沙" },
  { id: "wall", ch: "墙" },
  { id: "gate", ch: "门" },
];
import { LOCAL_SAVES_KEY } from "../game/types";
import BattleOverviewMap, {
  type BattleViewportNorm,
} from "../components/BattleOverviewMap";
import BattleDialogueOverlay from "../components/BattleDialogueOverlay";
import GeneralAvatar from "../components/GeneralAvatar";
import GameBattle, { type GameBattleHandle, type MenuAction } from "./GameBattle";

/** 敌军每名单位行动之间的间隔（毫秒）；队列中第一名立即行动 */
const ENEMY_ACTION_GAP_MS = 2000;
/** 与 GameBattle 的回合门控一致：敌方字幕完全播完后才放行 AI */
const ENEMY_TURN_BANNER_FINISH_BUFFER_MS = 120;
const ENEMY_TURN_BLOCK_MS =
  POST_ACTION_TURN_BANNER_DELAY_MS + TURN_PHASE_BANNER_MS + ENEMY_TURN_BANNER_FINISH_BUFFER_MS;

/** 秘籍：打开关卡列表（在捕获阶段优先于战场按键屏蔽） */
const CHEAT_STAGE_PICKER_COMBO = (e: KeyboardEvent) =>
  e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyK";

const CHEAT_GENERAL_CODEX_COMBO = (e: KeyboardEvent) =>
  e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyJ";

/** 秘籍：当前选中或侧栏检视中的存活单位立即升一级 */
const CHEAT_LEVEL_UP_COMBO = (e: KeyboardEvent) =>
  e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyU";

/** 秘籍：与胜利后相同规则进入下一关（继承存活我军）；最后一关后回到序章 */
const CHEAT_NEXT_STAGE_COMBO = (e: KeyboardEvent) =>
  e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyD";

/** 秘籍：手机横屏布局；已在秘籍横/竖屏时再按则恢复桌面 */
const CHEAT_MOBILE_LANDSCAPE_COMBO = (e: KeyboardEvent) =>
  e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyM";

/** 秘籍：手机竖屏布局 */
const CHEAT_MOBILE_PORTRAIT_COMBO = (e: KeyboardEvent) =>
  e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyM";

type CheatBattleLayout = "none" | "landscape" | "portrait";

/**
 * 战斗页启用手机式侧栏/字号：≤900px，或典型手机横屏（矮视口；真机横屏常 >900px 宽）。
 * 横屏侧栏列宽等 CSS 须与本条件一致，见 index.css「横屏战斗」：`(landscape) and (max-width:900px)` 与 `(landscape) and (max-height:560px)` 逗号或。
 */
const BATTLE_MOBILE_UI_MATCH_MEDIA =
  "(max-width: 900px), ((orientation: landscape) and (max-height: 560px))";

const SCENARIO_PICKER_ENTRIES = listScenarioEntries();
const GENERALS_CODEX_LIST = listGeneralsSorted();

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

/** 胜负全屏提示展示时长（毫秒），之后自动下一关或重开 */
const OUTCOME_TRANSITION_MS = 2800;

function normalizeLoadedBattle(b: BattleState): BattleState {
  let s = ensureBattleFields(b);
  if ((s.phase as string) === "act") s = { ...s, phase: "menu" };
  return s;
}

type LocalSaveEntry = { slotName: string; updatedAt: string; payload: BattleState };

function readLocalSaves(): LocalSaveEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_SAVES_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw) as Record<string, { updatedAt: string; payload: unknown }>;
    return Object.entries(o)
      .map(([slotName, v]) => {
        if (!v?.payload || !isValidSave(v.payload)) return null;
        return {
          slotName,
          updatedAt: v.updatedAt || "",
          payload: normalizeLoadedBattle(v.payload as BattleState),
        };
      })
      .filter((x): x is LocalSaveEntry => x !== null)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } catch {
    return [];
  }
}

function writeLocalSave(slotName: string, payload: BattleState) {
  const raw = localStorage.getItem(LOCAL_SAVES_KEY);
  let o: Record<string, { updatedAt: string; payload: BattleState }> = {};
  if (raw) {
    try {
      o = JSON.parse(raw);
    } catch {
      o = {};
    }
  }
  o[slotName] = { updatedAt: new Date().toISOString(), payload };
  localStorage.setItem(LOCAL_SAVES_KEY, JSON.stringify(o));
}

function deleteLocalSave(slotName: string) {
  const raw = localStorage.getItem(LOCAL_SAVES_KEY);
  if (!raw) return;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    delete o[slotName];
    localStorage.setItem(LOCAL_SAVES_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function applyTerminalOutcomeTransition(
  b: BattleState,
  setMessage: (msg: string | null) => void
): BattleState {
  if (b.outcome === "won") {
    const hadNext = getNextScenarioId(b.scenarioId) !== null;
    const next = createNextBattleAfterVictory(b);
    if (hadNext) {
      setMessage(`进入：${next.scenarioTitle}`);
    } else {
      setMessage("已通关全部关卡，从序章重新开始。");
    }
    return next;
  }
  if (b.outcome === "lost") {
    setMessage("已重新开始游戏");
    return createInitialBattle();
  }
  return b;
}

function ratioPercent(value: number, cap: number): number {
  return Math.max(0, Math.min(100, (value / Math.max(1, cap)) * 100));
}

function rosterItemVisualClass(u: Unit): string {
  if (u.hp <= 0) return "battle-roster__item--dead";
  if (u.moved && u.acted) return "battle-roster__item--done";
  return "battle-roster__item--ready";
}

function rosterStatusTag(u: Unit, side: Side): string {
  if (u.hp <= 0) return "阵亡";
  if (u.moved && u.acted) return "行动完毕";
  return side === "player" ? "待行动" : "待机";
}

export default function GamePage() {
  const { user, token } = useAuth();
  const [battle, setBattle] = useState<BattleState>(() => createInitialBattle());
  const battleRef = useRef(battle);
  battleRef.current = battle;
  const [slotName, setSlotName] = useState("存档1");
  const [message, setMessage] = useState<string | null>(null);
  const [localList, setLocalList] = useState<LocalSaveEntry[]>(() => readLocalSaves());
  const [remoteList, setRemoteList] = useState<ServerSaveRow[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [visualEpoch, setVisualEpoch] = useState(0);
  const [inspectUnitId, setInspectUnitId] = useState<string | null>(null);
  const inspectUnitIdRef = useRef<string | null>(null);
  inspectUnitIdRef.current = inspectUnitId;
  /** 每次点将/检视递增，使 GameBattle 在再次点同一单位时仍能重播属性浮窗 */
  const [inspectTapSeq, setInspectTapSeq] = useState(0);
  /** 主战场有指针活动时为 true；静止一段时间后隐藏右侧地形图例与格上地形提示（左侧「战局」提要不受此项影响，避免随地图边缘微动反复伸缩与滚动条闪烁） */
  const MAP_POINTER_IDLE_MS = 1400;
  const [battleMapPointerActive, setBattleMapPointerActive] = useState(true);
  const battleMapPointerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpBattleMapPointer = useCallback(() => {
    setBattleMapPointerActive(true);
    if (battleMapPointerTimerRef.current) clearTimeout(battleMapPointerTimerRef.current);
    battleMapPointerTimerRef.current = window.setTimeout(() => {
      setBattleMapPointerActive(false);
      battleMapPointerTimerRef.current = null;
    }, MAP_POINTER_IDLE_MS);
  }, []);
  useEffect(
    () => () => {
      if (battleMapPointerTimerRef.current) clearTimeout(battleMapPointerTimerRef.current);
    },
    []
  );
  useEffect(() => {
    bumpBattleMapPointer();
  }, [battle.scenarioId, bumpBattleMapPointer]);
  /** 秘籍：桌面强开手机战斗栅格（Ctrl+M 横屏 / Ctrl+Shift+M 竖屏 / 再 Ctrl+M 恢复） */
  const [cheatBattleLayout, setCheatBattleLayout] = useState<CheatBattleLayout>("none");
  /** 与桌面版分离的窄屏战斗样式（侧栏/行动菜单/信息区），见 index.css `.game-layout--battle-mobile-ui` */
  const [battleMobileUi, setBattleMobileUi] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(BATTLE_MOBILE_UI_MATCH_MEDIA).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(BATTLE_MOBILE_UI_MATCH_MEDIA);
    const sync = () => setBattleMobileUi(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const [battlePortraitMobile, setBattlePortraitMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 900px) and (orientation: portrait)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px) and (orientation: portrait)");
    const sync = () => setBattlePortraitMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  /** 竖屏手机：战局略图 details 默认展开，可收起省高度 */
  const [battleOverviewOpen, setBattleOverviewOpen] = useState(true);
  const [metaSidebarCollapsed, setMetaSidebarCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem("sanguo_meta_sidebar_collapsed");
      if (raw === "0" || raw === "1") return raw === "1";
      if (typeof window === "undefined") return false;
      if (window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches) {
        return true;
      }
      if (window.matchMedia("(max-width: 900px) and (orientation: landscape)").matches) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });
  /** 整块左侧（战局 / 略图 / 战场单位）收起为一条边栏，仅留主区「信息与存档」与地图 */
  const [battleLeftPanelHidden, setBattleLeftPanelHidden] = useState(false);
  const [rosterExpanded, setRosterExpanded] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      if (window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches) {
        return false;
      }
      if (window.matchMedia("(max-width: 900px) and (orientation: landscape)").matches) {
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
  });
  const [unitInspectExpanded, setUnitInspectExpanded] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      if (window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches) {
        return false;
      }
      if (window.matchMedia("(max-width: 900px) and (orientation: landscape)").matches) {
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
  });
  /** 信息与存档面板内：武将信息 | 存档 | 战报 */
  const [rightInspectorTab, setRightInspectorTab] = useState<"unit" | "saves" | "log">("unit");
  /** 与「武将信息」tab 当前可视高度一致，用于限制存档/战报 tab 不要更高 */
  const [battleRightTabCapPx, setBattleRightTabCapPx] = useState<number | null>(null);
  const unitTabPanelRef = useRef<HTMLDivElement>(null);
  const [turnIntroLocked, setTurnIntroLocked] = useState(true);
  /** 回合放行票据：仅当某一方字幕流程完整结束后才会被置为该方 */
  const [turnActionReadyTurn, setTurnActionReadyTurn] = useState<"player" | "enemy" | null>(null);
  const [enemyTurnGateSeq, setEnemyTurnGateSeq] = useState(0);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [generalCodexOpen, setGeneralCodexOpen] = useState(false);
  const [generalCodexQuery, setGeneralCodexQuery] = useState("");
  const [generalCodexPickId, setGeneralCodexPickId] = useState<string | null>(null);
  const [battleViewportNorm, setBattleViewportNorm] = useState<BattleViewportNorm | null>(null);
  const onBattleScrollViewportChange = useCallback((n: BattleViewportNorm) => {
    setBattleViewportNorm(n);
  }, []);
  const turnIntroLockedRef = useRef(true);
  turnIntroLockedRef.current = turnIntroLocked;
  const onTurnActionReady = useCallback((ready: boolean) => {
    setTurnIntroLocked(!ready);
    if (!ready) {
      setTurnActionReadyTurn(null);
      return;
    }
    const t = battleRef.current.turn;
    setTurnActionReadyTurn(t === "player" || t === "enemy" ? t : null);
  }, []);

  const onDamagePulseConsumed = useCallback(() => {
    setBattle((s) => (s.damagePulse ? { ...s, damagePulse: null } : s));
  }, []);

  const bumpVisualEpoch = useCallback(() => {
    setTurnIntroLocked(true);
    setVisualEpoch((n) => n + 1);
  }, []);

  const advanceBattleDialogue = useCallback(() => {
    setBattle((b) => {
      if (!b.battleScript) return b;
      const kind = b.battleScript.kind;
      const next = advanceBattleScript(b);
      if (kind === "opening" && !next.battleScript) {
        queueMicrotask(() => bumpVisualEpoch());
      }
      return next;
    });
  }, [bumpVisualEpoch]);

  const setMetaCollapsed = useCallback((collapsed: boolean) => {
    setMetaSidebarCollapsed(collapsed);
    try {
      localStorage.setItem("sanguo_meta_sidebar_collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const refreshLocal = useCallback(() => setLocalList(readLocalSaves()), []);

  const refreshRemote = useCallback(async () => {
    if (!token) {
      setRemoteList([]);
      return;
    }
    setRemoteLoading(true);
    try {
      const { saves } = await apiListSaves(token);
      setRemoteList(saves);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "无法加载云端存档");
    } finally {
      setRemoteLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshRemote();
  }, [refreshRemote]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (CHEAT_STAGE_PICKER_COMBO(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setStagePickerOpen((open) => !open);
        return;
      }

      if (CHEAT_GENERAL_CODEX_COMBO(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setGeneralCodexOpen((open) => !open);
        return;
      }

      if (CHEAT_LEVEL_UP_COMBO(e)) {
        const b = battleRef.current;
        if (b.outcome !== "playing") return;
        const id = b.selectedId ?? inspectUnitIdRef.current;
        if (!id) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setMessage("秘籍：请先在战场上选中单位，或在侧栏点选一名武将。");
          return;
        }
        const u = b.units.find((x) => x.id === id && x.hp > 0);
        if (!u) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setMessage("秘籍：该单位无法升级（未找到或已阵亡）。");
          return;
        }
        if (u.level >= MAX_UNIT_LEVEL) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setMessage(`秘籍：${u.name} 已达最高等级（${MAX_UNIT_LEVEL} 级）。`);
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        setBattle((s) => cheatInstantLevelUp(s, id));
        setMessage(`秘籍：${u.name} 已升一级（Lv.${Math.min(MAX_UNIT_LEVEL, u.level + 1)}）。`);
        return;
      }

      if (CHEAT_NEXT_STAGE_COMBO(e)) {
        const b = battleRef.current;
        if (b.outcome === "lost") {
          e.preventDefault();
          e.stopImmediatePropagation();
          setMessage("秘籍：战败中不可用 Ctrl+D 跳转下一关。");
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        const hadNext = getNextScenarioId(b.scenarioId) !== null;
        const next = createNextBattleAfterVictory(b);
        setBattle(next);
        setInspectUnitId(null);
        setStagePickerOpen(false);
        setGeneralCodexOpen(false);
        setGeneralCodexPickId(null);
        bumpVisualEpoch();
        setMessage(
          hadNext
            ? `秘籍：已进入下一关「${next.scenarioTitle}」`
            : "秘籍：已过最后一关，从序章重新开始。"
        );
        return;
      }

      if (CHEAT_MOBILE_PORTRAIT_COMBO(e)) {
        if (e.repeat) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setCheatBattleLayout("portrait");
        queueMicrotask(() =>
          setMessage("秘籍：手机竖屏布局（再按 Ctrl+M 恢复桌面，仅 Ctrl+M 为横屏）。")
        );
        return;
      }

      if (CHEAT_MOBILE_LANDSCAPE_COMBO(e)) {
        if (e.repeat) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setCheatBattleLayout((prev) => {
          if (prev === "landscape" || prev === "portrait") {
            queueMicrotask(() => setMessage("秘籍：已恢复桌面布局。"));
            return "none";
          }
          queueMicrotask(() =>
            setMessage("秘籍：手机横屏布局（再按 Ctrl+M 恢复桌面；Ctrl+Shift+M 为竖屏）。")
          );
          return "landscape";
        });
        return;
      }

      if (e.key === "Escape") {
        if (generalCodexOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setGeneralCodexOpen(false);
          setGeneralCodexPickId(null);
          return;
        }
        if (stagePickerOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setStagePickerOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [stagePickerOpen, generalCodexOpen, bumpVisualEpoch]);

  const jumpToScenario = useCallback(
    (scenarioId: string, title: string) => {
      setBattle(createBattleForScenario(scenarioId));
      setStagePickerOpen(false);
      setGeneralCodexOpen(false);
      setInspectUnitId(null);
      setMessage(`秘籍：已进入「${title}」`);
      bumpVisualEpoch();
    },
    [bumpVisualEpoch]
  );

  const gameBattleRef = useRef<GameBattleHandle>(null);
  const prevTurnRef = useRef<"player" | "enemy" | undefined>(undefined);
  const enemyTurnUnlockAtRef = useRef(0);
  const lastEnemyMoverIdRef = useRef<string | null>(null);

  const outcomeScheduledRef = useRef(false);
  const tabWasHiddenRef = useRef(false);
  useEffect(() => {
    if (battle.outcome !== "won" && battle.outcome !== "lost") {
      outcomeScheduledRef.current = false;
      return;
    }
    if (outcomeScheduledRef.current) return;
    outcomeScheduledRef.current = true;
    const tid = window.setTimeout(() => {
      setBattle((b) => applyTerminalOutcomeTransition(b, setMessage));
      bumpVisualEpoch();
      setInspectUnitId(null);
      outcomeScheduledRef.current = false;
    }, OUTCOME_TRANSITION_MS);
    return () => {
      window.clearTimeout(tid);
      outcomeScheduledRef.current = false;
    };
  }, [battle.outcome, bumpVisualEpoch]);

  /** 胜利条件已达成：等最后一击飘字 + 阵亡动画播完再揭示 outcome: "won"（与 GameBattle 时长一致） */
  useEffect(() => {
    if (!battle.pendingVictory) return;
    if (battle.battleScript) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = victoryRevealHoldMs(reduced);
    const tid = window.setTimeout(() => {
      setBattle((b) => commitPendingVictory(b));
    }, ms);
    return () => window.clearTimeout(tid);
  }, [battle.pendingVictory, battle.battleScript]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        tabWasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState !== "visible" || !tabWasHiddenRef.current) return;
      tabWasHiddenRef.current = false;
      const o = battleRef.current.outcome;
      if (o !== "won" && o !== "lost") return;
      setBattle((b) => applyTerminalOutcomeTransition(b, setMessage));
      bumpVisualEpoch();
      setInspectUnitId(null);
      outcomeScheduledRef.current = false;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [bumpVisualEpoch]);

  useEffect(() => {
    if (battle.pendingVictory) return;
    if (battle.pendingMove?.kind !== "player") return;
    if (turnIntroLocked) return;
    const tid = window.setTimeout(() => {
      setBattle((s) => advancePendingMove(s));
    }, MOVE_STEP_MS_PLAYER);
    return () => window.clearTimeout(tid);
  }, [
    battle.outcome,
    battle.pendingVictory,
    battle.pendingMove?.kind,
    battle.pendingMove?.unitId,
    (battle.pendingMove?.path ?? []).join("|"),
    turnIntroLocked,
  ]);

  useEffect(() => {
    if (battle.outcome !== "playing") {
      prevTurnRef.current = battle.turn;
      enemyTurnUnlockAtRef.current = 0;
      return;
    }
    const prev = prevTurnRef.current;
    const curr = battle.turn;
    if (prev !== curr && curr === "enemy") {
      enemyTurnUnlockAtRef.current = performance.now() + ENEMY_TURN_BLOCK_MS;
    }
    prevTurnRef.current = curr;
  }, [battle.outcome, battle.turn]);

  useEffect(() => {
    if (battle.pendingMove?.kind === "enemy") {
      lastEnemyMoverIdRef.current = battle.pendingMove.unitId;
      return;
    }
    if (battle.turn !== "enemy" || battle.phase !== "enemy") {
      lastEnemyMoverIdRef.current = null;
    }
  }, [battle.pendingMove?.kind, battle.pendingMove?.unitId, battle.turn, battle.phase]);

  useEffect(() => {
    if (battle.pendingVictory) return;
    if (battle.outcome !== "playing") return;
    if (turnIntroLocked) return;
    if (turnActionReadyTurn !== "enemy") return;
    if (battle.turn !== "enemy" || battle.phase !== "enemy") return;
    const remain = enemyTurnUnlockAtRef.current - performance.now();
    if (remain > 0) {
      const tid = window.setTimeout(() => setEnemyTurnGateSeq((n) => n + 1), remain + 8);
      return () => window.clearTimeout(tid);
    }
    const q = battle.enemyTurnQueue;
    if (!q?.length) return;
    const c = battle.enemyTurnCursor;
    if (c >= q.length) return;

    if (battle.pendingMove?.kind === "enemy") {
      const tid = window.setTimeout(() => {
        setBattle((s) => advancePendingMove(s));
      }, MOVE_STEP_MS_ENEMY);
      return () => window.clearTimeout(tid);
    }

    const delay = c === 0 ? 0 : ENEMY_ACTION_GAP_MS;
    let cancelled = false;
    const tid = window.setTimeout(() => {
      void (async () => {
        const prevMoverId = lastEnemyMoverIdRef.current;
        if (prevMoverId) {
          await gameBattleRef.current?.revealUnitOnMapBeforeAction(prevMoverId, {
            smoothIfNeeded: true,
            ensureFullyVisible: true,
          });
        }
        const b0 = battleRef.current;
        const q0 = b0.enemyTurnQueue;
        const c0 = b0.enemyTurnCursor;
        const currentId = q0 && c0 < q0.length ? q0[c0] : null;
        if (currentId) {
          await gameBattleRef.current?.revealUnitOnMapBeforeAction(currentId, {
            smoothIfNeeded: true,
            ensureFullyVisible: true,
          });
        }
        if (cancelled) return;
        lastEnemyMoverIdRef.current = null;
        setBattle((s) => processSingleEnemyStep(s));
      })();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [
    battle.outcome,
    battle.pendingVictory,
    battle.turn,
    battle.phase,
    battle.enemyTurnCursor,
    battle.enemyTurnQueue?.join(","),
    battle.pendingMove?.kind,
    battle.pendingMove?.unitId,
    (battle.pendingMove?.path ?? []).join("|"),
    turnIntroLocked,
    turnActionReadyTurn,
    enemyTurnGateSeq,
  ]);

  /** 敌军行动中不保留检视/浮窗，避免 pendingMove 结束后属性浮窗再次弹出 */
  useEffect(() => {
    if (battle.outcome !== "playing") return;
    if (battle.turn !== "enemy") return;
    setInspectUnitId(null);
  }, [battle.outcome, battle.turn]);

  const onCellClick = useCallback(async (x: number, y: number) => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.pendingMove) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    if (battleRef.current.outcome === "playing" && battleRef.current.turn !== "player") return;
    const occupant = battleRef.current.units.find(
      (unit) => unit.x === x && unit.y === y && unit.hp > 0
    );
    if (occupant) {
      setInspectUnitId(occupant.id);
      setInspectTapSeq((n) => n + 1);
    }
    const applyCellClick = (s: BattleState) => {
      if (s.phase === "pick-target" && s.pickTarget) {
        const u = s.units.find(
          (unit) =>
            unit.x === x && unit.y === y && unit.hp > 0 && unit.side === "enemy"
        );
        if (u && s.pickTarget.targetIds.includes(u.id)) return confirmPickTarget(s, u.id);
      }
      return gridCellClick(s, x, y);
    };
    const s0 = battleRef.current;
    const preview = applyCellClick(s0);
    const pm = preview.pendingMove;
    if (pm?.kind === "player" && pm.unitId) {
      const first = pm.path[0];
      await gameBattleRef.current?.beforePlayerMoveStart(
        pm.unitId,
        pm.from && first ? { from: pm.from, to: first } : undefined
      );
    }
    setBattle((s) => applyCellClick(s));
  }, []);

  const onUnitClick = useCallback((unitId: string, side: "player" | "enemy") => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.pendingMove) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    if (battleRef.current.outcome === "playing" && battleRef.current.turn !== "player") return;
    setInspectUnitId(unitId);
    setRightInspectorTab("unit");
    setInspectTapSeq((n) => n + 1);
    setBattle((s) => {
      if (side === "player") return selectPlayerUnit(s, unitId);
      if (s.phase === "pick-target" && s.pickTarget?.targetIds.includes(unitId)) {
        return confirmPickTarget(s, unitId);
      }
      return s;
    });
  }, []);

  const onMenuAction = useCallback((action: MenuAction) => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    if (action === "wait") {
      /* 待机后不再回弹属性浮窗：清掉当前检视目标 */
      setInspectUnitId(null);
    }
    setBattle((s) => {
      if (action === "attack") return menuMeleeAttack(s);
      if (action === "tactic") return menuOpenTacticMenu(s);
      return waitAfterMove(s);
    });
  }, []);

  const onTacticPick = useCallback((kind: TacticKind) => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    setBattle((s) => tacticMenuChoose(s, kind));
  }, []);

  const onEscapeOrRevert = useCallback(() => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    setBattle((s) => escapeOrRevertUnit(s));
  }, []);

  const onPickNavigate = useCallback((delta: number) => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    setBattle((s) => pickTargetNavigate(s, delta));
  }, []);

  const onPickConfirmFocused = useCallback(() => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    setBattle((s) => {
      const p = s.pickTarget;
      if (!p || s.phase !== "pick-target") return s;
      const id = p.targetIds[p.focusIndex];
      return confirmPickTarget(s, id);
    });
  }, []);

  const onPickHoverEnemy = useCallback((enemyId: string) => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    setBattle((s) => pickTargetFocusEnemy(s, enemyId));
  }, []);

  const onWait = useCallback(() => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && turnIntroLockedRef.current) return;
    setBattle((s) => {
      if (s.phase === "pick-target") return cancelPickTarget(s);
      if (s.phase === "tactic-menu") return cancelTacticMenu(s);
      if (s.phase === "move") return skipOrEndIfStuck(s);
      if (s.phase === "menu") return waitAfterMove(s);
      return s;
    });
  }, []);

  const onEndPlayerTurnQuick = useCallback(() => {
    if (battleRef.current.pendingVictory) return;
    if (battleRef.current.outcome !== "playing") return;
    if (battleRef.current.turn !== "player") return;
    if (battleRef.current.pendingMove) return;
    if (battleRef.current.battleScript) return;
    if (turnIntroLockedRef.current) return;
    setBattle((s) => endPlayerTurnImmediately(s));
  }, []);

  const onNewGame = useCallback(() => {
    setBattle(createInitialBattle());
    setInspectUnitId(null);
    setMessage(null);
    bumpVisualEpoch();
  }, [bumpVisualEpoch]);

  const saveLocal = useCallback(() => {
    const name = slotName.trim() || "存档1";
    writeLocalSave(name, battle);
    refreshLocal();
    setMessage(`已保存到本地：${name}`);
  }, [battle, slotName, refreshLocal]);

  const saveRemote = useCallback(async () => {
    if (!token) {
      setMessage("请先登录后再保存到服务器");
      return;
    }
    const name = slotName.trim() || "存档1";
    try {
      await apiPutSave(token, name, battle);
      setMessage(`已同步到云端：${name}`);
      await refreshRemote();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "云端保存失败");
    }
  }, [token, slotName, battle, refreshRemote]);

  const loadLocal = useCallback(
    (entry: LocalSaveEntry) => {
      setBattle(entry.payload);
      setSlotName(entry.slotName);
      setMessage(`已读取本地：${entry.slotName}`);
      bumpVisualEpoch();
    },
    [bumpVisualEpoch]
  );

  const loadRemote = useCallback(
    async (row: ServerSaveRow) => {
      if (!isValidSave(row.payload)) {
        setMessage("云端存档格式无效");
        return;
      }
      setBattle(normalizeLoadedBattle(row.payload as BattleState));
      setSlotName(row.slotName);
      setMessage(`已读取云端：${row.slotName}`);
      bumpVisualEpoch();
    },
    [bumpVisualEpoch]
  );

  const removeLocal = useCallback(
    (name: string) => {
      deleteLocalSave(name);
      refreshLocal();
      setMessage(`已删除本地：${name}`);
    },
    [refreshLocal]
  );

  const removeRemote = useCallback(
    async (name: string) => {
      if (!token) return;
      try {
        await apiDeleteSave(token, name);
        await refreshRemote();
        setMessage(`已删除云端：${name}`);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "删除失败");
      }
    },
    [token, refreshRemote]
  );

  const statusLine = useMemo(() => {
    if (battle.outcome === "won") return "战斗胜利";
    if (battle.outcome === "lost") return "战斗失败";
    return battle.turn === "player" ? "我军回合" : "敌军行动中…";
  }, [battle.outcome, battle.turn]);

  const inspectedRosterTarget = useMemo(() => {
    if (!inspectUnitId) return null;
    return battle.units.find((u) => u.id === inspectUnitId) ?? null;
  }, [battle.units, inspectUnitId]);

  const inspectedUnit =
    inspectedRosterTarget && inspectedRosterTarget.hp > 0 ? inspectedRosterTarget : null;

  const inspectedTerrain = useMemo(() => {
    if (!inspectedUnit) return null;
    const row = battle.terrain[inspectedUnit.y];
    const t = row?.[inspectedUnit.x];
    return t ? TERRAIN_LABEL[t] : null;
  }, [battle.terrain, inspectedUnit]);

  const inspectedOnPreferredTerrain = useMemo(() => {
    if (!inspectedUnit) return false;
    const t = battle.terrain[inspectedUnit.y]?.[inspectedUnit.x];
    if (!t) return false;
    return isArmyPreferredTerrain(inspectedUnit.armyType, t);
  }, [battle.terrain, inspectedUnit]);

  const inspectedTerrainCell = useMemo(() => {
    if (!inspectedUnit) return null;
    const raw = battle.terrain[inspectedUnit.y]?.[inspectedUnit.x];
    return raw != null ? normalizeTerrainCell(raw) : null;
  }, [battle.terrain, inspectedUnit]);

  const generalCodexFiltered = useMemo(() => {
    const raw = generalCodexQuery.trim();
    if (!raw) return GENERALS_CODEX_LIST;
    const low = raw.toLowerCase();
    return GENERALS_CODEX_LIST.filter(
      (g) =>
        g.name.includes(raw) || g.id.toLowerCase().includes(low) || g.faction.includes(raw)
    );
  }, [generalCodexQuery]);

  const generalCodexSelected = useMemo(() => {
    if (!generalCodexPickId) return null;
    return GENERALS_CODEX_LIST.find((g) => g.id === generalCodexPickId) ?? null;
  }, [generalCodexPickId]);

  const rosterPlayers = useMemo(() => {
    const all = battle.units.filter((u) => u.side === "player");
    const order = ["p1", "p2", "p3"];
    return [...all].sort((a, b) => {
      const da = a.hp <= 0 ? 1 : 0;
      const db = b.hp <= 0 ? 1 : 0;
      if (da !== db) return da - db;
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
  }, [battle.units]);

  const rosterEnemies = useMemo(() => {
    return battle.units
      .filter((u) => u.side === "enemy")
      .sort((a, b) => {
        const da = a.hp <= 0 ? 1 : 0;
        const db = b.hp <= 0 ? 1 : 0;
        if (da !== db) return da - db;
        return a.y - b.y || a.x - b.x || a.name.localeCompare(b.name, "zh-Hans-CN");
      });
  }, [battle.units]);

  const onRosterPickUnit = useCallback((u: Unit) => {
    if (battleRef.current.battleScript) return;
    if (battleRef.current.outcome === "playing" && battleRef.current.turn !== "player") return;
    setInspectUnitId(u.id);
    setRightInspectorTab("unit");
    setInspectTapSeq((n) => n + 1);
    requestAnimationFrame(() => {
      gameBattleRef.current?.focusUnitOnMap(u.id);
    });
  }, []);

  useLayoutEffect(() => {
    if (!unitInspectExpanded || rightInspectorTab !== "unit") return;
    const el = unitTabPanelRef.current;
    if (!el) return;
    const sync = () => {
      const h = el.clientHeight;
      setBattleRightTabCapPx((prev) => (h > 0 ? h : prev));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rightInspectorTab, unitInspectExpanded]);

  return (
    <div
      className={`page game-layout game-layout--battle${
        cheatBattleLayout === "portrait"
          ? " game-layout--cheat-mobile"
          : cheatBattleLayout === "landscape"
            ? " game-layout--cheat-mobile-landscape"
            : ""
      }${cheatBattleLayout !== "none" || battleMobileUi ? " game-layout--battle-mobile-ui" : ""}${
        battleLeftPanelHidden ? " game-layout--battle-left-hidden" : ""
      }`}
    >
      {stagePickerOpen && (
        <div
          className="stage-picker-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stage-picker-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setStagePickerOpen(false);
          }}
        >
          <div className="stage-picker-panel" onMouseDown={(e) => e.stopPropagation()}>
            <h2 id="stage-picker-title" className="stage-picker-title">
              秘籍 · 选关
            </h2>
            <p className="stage-picker-hint muted small">
              再按 <kbd className="kbd-chip">Ctrl</kbd>+<kbd className="kbd-chip">Shift</kbd>+
              <kbd className="kbd-chip">K</kbd> 或 <kbd className="kbd-chip">Esc</kbd> 关闭。
              战斗中 <kbd className="kbd-chip">Ctrl</kbd>+<kbd className="kbd-chip">D</kbd>{" "}
              直接进入下一关（与胜利相同：继承存活我军；最后一关后回序章）。
              <kbd className="kbd-chip">Ctrl</kbd>+<kbd className="kbd-chip">M</kbd> 手机横屏，
              <kbd className="kbd-chip">Ctrl</kbd>+<kbd className="kbd-chip">Shift</kbd>+
              <kbd className="kbd-chip">M</kbd> 手机竖屏；再按 <kbd className="kbd-chip">Ctrl</kbd>+
              <kbd className="kbd-chip">M</kbd> 恢复桌面。
            </p>
            <ul className="stage-picker-list">
              {SCENARIO_PICKER_ENTRIES.map((row, i) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="stage-picker-row"
                    onClick={() => jumpToScenario(row.id, row.title)}
                  >
                    <span className="stage-picker-idx">{i + 1}</span>
                    <span className="stage-picker-name">{row.title}</span>
                    <span className="stage-picker-id muted small">{row.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {generalCodexOpen && (
        <div
          className="general-codex-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="general-codex-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setGeneralCodexOpen(false);
              setGeneralCodexPickId(null);
            }
          }}
        >
          <div className="general-codex-panel" onMouseDown={(e) => e.stopPropagation()}>
            <h2 id="general-codex-title" className="stage-picker-title">
              秘籍 · 将领图鉴（{GENERALS_CODEX_LIST.length}）
            </h2>
            <p className="stage-picker-hint muted small">
              <kbd className="kbd-chip">Ctrl</kbd>+<kbd className="kbd-chip">Shift</kbd>+
              <kbd className="kbd-chip">J</kbd> 关闭 · <kbd className="kbd-chip">Esc</kbd> 关闭
            </p>
            <input
              type="search"
              className="general-codex-search"
              placeholder="按姓名、势力或 id 筛选…"
              value={generalCodexQuery}
              onChange={(e) => setGeneralCodexQuery(e.target.value)}
              aria-label="筛选将领"
            />
            <div className="general-codex-columns">
              <ul className="general-codex-list">
                {generalCodexFiltered.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={
                        generalCodexPickId === g.id ? "general-codex-row is-active" : "general-codex-row"
                      }
                      onClick={() => setGeneralCodexPickId(g.id)}
                    >
                      <GeneralAvatar name={g.name} catalogId={g.id} size={32} className="general-codex-row-avatar" />
                      <span className="general-codex-name">{g.name}</span>
                      <span className="muted small">{g.faction}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="general-codex-detail">
                {!generalCodexSelected && (
                    <p className="muted small">
                      点击左侧将领查看演义列传与图鉴基准属性（非本关场内实时数值）。战场上攻防会按脚下地形与兵种地利增减；实际扣血按兵力上限的比例结算，等级差≥6 时优势方杀伤显著提高。
                    </p>
                )}
                {generalCodexSelected && (
                  <>
                    <div className="general-codex-detail-head">
                      <GeneralAvatar name={generalCodexSelected.name} catalogId={generalCodexSelected.id} size={72} />
                      <h3 className="general-codex-detail-name">{generalCodexSelected.name}</h3>
                    </div>
                    <p className="general-codex-bio">{generalCodexSelected.bio}</p>
                    <dl className="unit-inspect-dl general-codex-dl">
                      <dt>势力</dt>
                      <dd>{generalCodexSelected.faction}</dd>
                      <dt>图鉴等级</dt>
                      <dd>Lv.{generalCodexSelected.refLevel}</dd>
                      <dt>兵种</dt>
                      <dd>{ARMY_TYPE_LABEL[generalCodexSelected.armyType]}</dd>
                      <dt>将领种类</dt>
                      <dd>{TROOP_KIND_LABEL[generalCodexSelected.troopKind]}</dd>
                      <dt>兵力（按图鉴等级）</dt>
                      <dd>{maxHpForLevel(generalCodexSelected.refLevel)}</dd>
                      <dt>武力</dt>
                      <dd>{generalCodexSelected.might}</dd>
                      <dt>智力</dt>
                      <dd>{generalCodexSelected.intel}</dd>
                      <dt>攻击（无地形）</dt>
                      <dd>
                        {attackPowerForUnit(
                          generalCodexSelected.might,
                          generalCodexSelected.refLevel,
                          generalCodexSelected.troopKind
                        )}
                      </dd>
                      <dt>防御（无地形）</dt>
                      <dd>{generalCodexSelected.defense}</dd>
                      <dt>计策上限（按图鉴等级推算）</dt>
                      <dd>{tacticMaxForUnit(generalCodexSelected.intel, generalCodexSelected.refLevel)}</dd>
                      <dt>内部 id</dt>
                      <dd className="muted small">{generalCodexSelected.id}</dd>
                    </dl>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        className={["game-left-stack", battleLeftPanelHidden ? "game-left-stack--rail-only" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {!battleLeftPanelHidden ? (
          <div className="game-left-stack__body">
        <div className="game-left-toprow" role="toolbar" aria-label="导航与开局">
          <Link to="/" className="battle-back-home battle-back-home--sidebar battle-back-home--toprow">
            ← 返回首页
          </Link>
          <button type="button" className="btn tiny game-left-newgame" onClick={onNewGame}>
            新游戏
          </button>
          <button
            type="button"
            className="btn tiny game-left-hide-panel"
            onClick={() => setBattleLeftPanelHidden(true)}
            title="收起左侧，仅保留地图与「信息与存档」"
            aria-label="收起左侧战局、略图与战场单位"
          >
            ⟨
          </button>
        </div>
        {metaSidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-expand-bar"
            onClick={() => setMetaCollapsed(false)}
          >
            展开战局
          </button>
        ) : (
          <aside className="game-meta-sidebar" aria-label="战局">
            <div className="meta-sidebar-header">
              <span className="meta-sidebar-title">战局</span>
              <button
                type="button"
                className="btn-collapse-sidebar"
                onClick={() => setMetaCollapsed(true)}
                title="收起侧栏，腾出空间"
              >
                收起
              </button>
            </div>
            <p className="meta-compact-line">
              <strong>{battle.scenarioTitle}</strong>
              <br />
              <span className="status-inline">{statusLine}</span>
            </p>
            {battle.scenarioBrief ? (
              <p className="scenario-story small">{battle.scenarioBrief}</p>
            ) : null}
            {battle.victoryBrief ? (
              <p className="victory-hint small">
                <strong>胜利条件：</strong>
                {battle.victoryBrief}
              </p>
            ) : null}
            {message && <p className="toast-msg">{message}</p>}
          </aside>
        )}
        {(battlePortraitMobile && battleMobileUi) || cheatBattleLayout === "portrait" ? (
          <details
            className="sidebar-disclosure battle-overview-disclosure"
            open={battleOverviewOpen}
            onToggle={(e) => setBattleOverviewOpen(e.currentTarget.open)}
          >
            <summary>战局略图 · 展开 / 收起</summary>
            <BattleOverviewMap
              gridW={battle.gridW}
              gridH={battle.gridH}
              terrain={battle.terrain}
              units={battle.units}
              viewport={battleViewportNorm}
              battleRound={battle.battleRound}
              maxBattleRounds={battle.maxBattleRounds ?? 60}
              hideHeading
            />
          </details>
        ) : (
          <BattleOverviewMap
            gridW={battle.gridW}
            gridH={battle.gridH}
            terrain={battle.terrain}
            units={battle.units}
            viewport={battleViewportNorm}
            battleRound={battle.battleRound}
            maxBattleRounds={battle.maxBattleRounds ?? 60}
          />
        )}
        <details
          className="sidebar-disclosure battle-roster-disclosure"
          open={rosterExpanded}
          onToggle={(e) => setRosterExpanded(e.currentTarget.open)}
        >
          <summary>战场单位 · 点击定位</summary>
          <aside className="battle-roster battle-roster--in-sidebar" aria-label="战场单位列表">
            <div className="battle-roster__cols">
              <div className="battle-roster__col">
                <div className="battle-roster__col-head">
                  <h4>我军 ({rosterPlayers.length})</h4>
                  <div className="battle-roster__col-actions">
                    <button
                      type="button"
                      className="btn tiny"
                      onClick={onWait}
                      disabled={
                        battle.outcome !== "playing" ||
                        battle.turn !== "player" ||
                        !battle.selectedId ||
                        battle.phase === "enemy" ||
                        turnIntroLocked ||
                        Boolean(battle.battleScript)
                      }
                      title="当前选中单位待机"
                    >
                      待机
                    </button>
                    <button
                      type="button"
                      className="btn tiny battle-roster__end-turn-btn"
                      onClick={onEndPlayerTurnQuick}
                      disabled={
                        battle.outcome !== "playing" ||
                        battle.turn !== "player" ||
                        turnIntroLocked ||
                        Boolean(battle.pendingMove) ||
                        Boolean(battle.battleScript)
                      }
                      title="直接结束我方回合"
                    >
                      结束回合
                    </button>
                  </div>
                </div>
                <ul className="battle-roster__list">
                  {rosterPlayers.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className={[
                          "battle-roster__item",
                          rosterItemVisualClass(u),
                          inspectUnitId === u.id ? "is-inspected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => onRosterPickUnit(u)}
                        aria-label={`${u.name}，${rosterStatusTag(u, "player")}`}
                      >
                        <GeneralAvatar
                          name={u.name}
                          catalogId={u.portraitCatalogId}
                          size={28}
                        />
                        <span className="battle-roster__item-meta">
                          <span className="battle-roster__item-name">{u.name}</span>
                          <span className="battle-roster__item-sub">
                            <span className="battle-roster__item-tag">{rosterStatusTag(u, "player")}</span>
                            {u.hp <= 0 ? (
                              <>
                                Lv.{u.level} · {TROOP_KIND_LABEL[u.troopKind]}
                              </>
                            ) : (
                              <>
                                Lv.{u.level} · {TROOP_KIND_LABEL[u.troopKind]} · {u.hp}/{u.maxHp}
                              </>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="battle-roster__col">
                <h4>敌军 ({rosterEnemies.length})</h4>
                <ul className="battle-roster__list">
                  {rosterEnemies.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className={[
                          "battle-roster__item",
                          rosterItemVisualClass(u),
                          inspectUnitId === u.id ? "is-inspected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => onRosterPickUnit(u)}
                        aria-label={`${u.name}，${rosterStatusTag(u, "enemy")}`}
                      >
                        <GeneralAvatar
                          name={u.name}
                          catalogId={u.portraitCatalogId}
                          size={28}
                        />
                        <span className="battle-roster__item-meta">
                          <span className="battle-roster__item-name">{u.name}</span>
                          <span className="battle-roster__item-sub">
                            <span className="battle-roster__item-tag">{rosterStatusTag(u, "enemy")}</span>
                            {u.hp <= 0 ? (
                              <>
                                Lv.{u.level} · {TROOP_KIND_LABEL[u.troopKind]}
                              </>
                            ) : (
                              <>
                                Lv.{u.level} · {TROOP_KIND_LABEL[u.troopKind]} · {u.hp}/{u.maxHp}
                              </>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </details>
          </div>
        ) : null}
        {battleLeftPanelHidden ? (
          <button
            type="button"
            className="game-left-edge-toggle"
            onClick={() => setBattleLeftPanelHidden(false)}
            aria-expanded={false}
            aria-label="展开左侧战局、略图与战场单位"
            title="展开左侧战局、略图与战场单位"
          >
            ⟩
          </button>
        ) : null}
      </div>

      <main className="game-main game-main--battle">
        {(battle.outcome === "won" || battle.outcome === "lost") && (
          <div className="outcome-flash-layer" role="alert" aria-live="assertive">
            <p className={`outcome-flash-text outcome-flash-text--${battle.outcome}`}>
              {battle.outcome === "won" ? "敌军全灭，战斗胜利！" : "我方全部阵亡"}
            </p>
          </div>
        )}
        <div className="battle-play-area">
          <details
            className="sidebar-disclosure battle-main-stack-disclosure unit-inspect-float battle-right-panel"
            open={unitInspectExpanded}
            onToggle={(e) => setUnitInspectExpanded(e.currentTarget.open)}
          >
            <summary className="unit-inspect-float__summary battle-right-panel__summary battle-main-stack-disclosure__summary">
              信息与存档
            </summary>
            <div
              className="unit-inspect-float__inner battle-right-panel__body"
              aria-label="信息与存档"
            >
              <div
                className="battle-right-tabs battle-right-tabs--three"
                role="tablist"
                aria-label="信息与存档"
              >
                <button
                  type="button"
                  role="tab"
                  id="battle-right-tabbtn-unit"
                  aria-controls="battle-right-panel-unit"
                  aria-selected={rightInspectorTab === "unit"}
                  tabIndex={rightInspectorTab === "unit" ? 0 : -1}
                  className={[
                    "battle-right-tab",
                    rightInspectorTab === "unit" ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setRightInspectorTab("unit")}
                >
                  武将信息
                </button>
                <button
                  type="button"
                  role="tab"
                  id="battle-right-tabbtn-saves"
                  aria-controls="battle-right-panel-saves"
                  aria-selected={rightInspectorTab === "saves"}
                  tabIndex={rightInspectorTab === "saves" ? 0 : -1}
                  className={[
                    "battle-right-tab",
                    rightInspectorTab === "saves" ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setRightInspectorTab("saves")}
                >
                  存档
                </button>
                <button
                  type="button"
                  role="tab"
                  id="battle-right-tabbtn-log"
                  aria-controls="battle-right-panel-log"
                  aria-selected={rightInspectorTab === "log"}
                  tabIndex={rightInspectorTab === "log" ? 0 : -1}
                  className={[
                    "battle-right-tab",
                    rightInspectorTab === "log" ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setRightInspectorTab("log")}
                >
                  战报
                </button>
              </div>
              <div
                ref={unitTabPanelRef}
                role="tabpanel"
                id="battle-right-panel-unit"
                aria-labelledby="battle-right-tabbtn-unit"
                hidden={rightInspectorTab !== "unit"}
                className="battle-right-tabpanel unit-inspect"
              >
              {!inspectedUnit && !inspectedRosterTarget && (
                <p className="muted small">点击场上武将或左侧列表查看详情。</p>
              )}
              {inspectedRosterTarget && inspectedRosterTarget.hp <= 0 && (
                <p className="unit-inspect-dead-note muted small">
                  <strong>{inspectedRosterTarget.name}</strong> 已阵亡。
                </p>
              )}
              {inspectedUnit && (
                <dl className="unit-inspect-dl unit-inspect-dl--horizontal">
                  <div className="unit-inspect-row unit-inspect-row--identity">
                    <dt>头像</dt>
                    <dd className="unit-inspect-portrait">
                      <GeneralAvatar
                        name={inspectedUnit.name}
                        catalogId={inspectedUnit.portraitCatalogId}
                        size={44}
                        title={inspectedUnit.name}
                      />
                    </dd>
                    <dt>姓名</dt>
                    <dd>{inspectedUnit.name}</dd>
                    <dt>阵营</dt>
                    <dd>{inspectedUnit.side === "player" ? "我军" : "敌军"}</dd>
                  </div>
                  <div className="unit-inspect-row unit-inspect-row--class">
                    <dt>等级</dt>
                    <dd>Lv.{inspectedUnit.level}</dd>
                    {inspectedUnit.side === "player" && (
                      <>
                        <dt>经验</dt>
                        <dd className="unit-inspect-dd--with-meter">
                          {(() => {
                            const expCap = expToNextLevel(inspectedUnit.level);
                            const finiteCap = Number.isFinite(expCap) && expCap > 0;
                            const expPct = finiteCap ? ratioPercent(inspectedUnit.exp, expCap) : 100;
                            return (
                              <>
                                <span className="unit-inspect-meter-label">
                                  {finiteCap
                                    ? `${inspectedUnit.exp} / ${expCap}`
                                    : `${inspectedUnit.exp}（已满级）`}
                                </span>
                                <div
                                  className="unit-inspect-meter"
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={finiteCap ? expCap : 100}
                                  aria-valuenow={Math.round(expPct)}
                                  aria-label="经验进度"
                                >
                                  <div
                                    className="unit-inspect-meter__fill unit-inspect-meter__fill--exp"
                                    style={{ width: `${expPct}%` }}
                                  />
                                </div>
                              </>
                            );
                          })()}
                        </dd>
                      </>
                    )}
                    <dt>兵种</dt>
                    <dd>{ARMY_TYPE_LABEL[inspectedUnit.armyType]}</dd>
                    <dt>将领种类</dt>
                    <dd>
                      {TROOP_KIND_LABEL[inspectedUnit.troopKind]}
                      {inspectedUnit.troopKind === "archer" && `（普攻射程 ${ARCHER_ATTACK_RANGE} 格）`}
                    </dd>
                    <dt>移动力</dt>
                    <dd>{inspectedUnit.move}</dd>
                    <dt>兵力</dt>
                    <dd className="unit-inspect-dd--with-meter">
                      <span className="unit-inspect-meter-label">
                        {inspectedUnit.hp} / {inspectedUnit.maxHp}
                      </span>
                      <div
                        className="unit-inspect-meter"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(
                          ratioPercent(inspectedUnit.hp, inspectedUnit.maxHp)
                        )}
                        aria-label="兵力"
                      >
                        <div
                          className={[
                            "unit-inspect-meter__fill",
                            inspectedUnit.side === "player"
                              ? "unit-inspect-meter__fill--hp-player"
                              : "unit-inspect-meter__fill--hp-enemy",
                          ].join(" ")}
                          style={{
                            width: `${ratioPercent(inspectedUnit.hp, inspectedUnit.maxHp)}%`,
                          }}
                        />
                      </div>
                    </dd>
                  </div>
                  <div className="unit-inspect-row unit-inspect-row--attrs">
                    <dt>武力</dt>
                    <dd>{inspectedUnit.might}</dd>
                    <dt>攻击</dt>
                    <dd>
                      {attackPowerOnTerrain(
                        inspectedUnit.might,
                        inspectedUnit.level,
                        inspectedUnit.troopKind,
                        inspectedUnit.armyType,
                        inspectedTerrainCell ?? "plain"
                      )}
                      {inspectedOnPreferredTerrain ? " · 含兵种地利" : ""}
                      {inspectedOnPreferredTerrain && (
                        <span className="muted small">
                          {" "}
                          （基准{" "}
                          {attackPowerForUnit(
                            inspectedUnit.might,
                            inspectedUnit.level,
                            inspectedUnit.troopKind
                          )}
                          ）
                        </span>
                      )}
                    </dd>
                    <dt>防御</dt>
                    <dd>
                      {defensePowerOnTerrain(
                        inspectedUnit.might,
                        inspectedUnit.level,
                        inspectedUnit.troopKind,
                        inspectedUnit.armyType,
                        inspectedTerrainCell ?? "plain"
                      )}
                      {inspectedOnPreferredTerrain ? " · 含兵种地利" : ""}
                      {inspectedOnPreferredTerrain && (
                        <span className="muted small"> （基准 {inspectedUnit.defense}）</span>
                      )}
                    </dd>
                    <dt>智力</dt>
                    <dd>{inspectedUnit.intel}</dd>
                    {inspectedUnit.side === "player" && (
                      <>
                        <dt>计策值</dt>
                        <dd>
                          {inspectedUnit.tacticPoints} / {inspectedUnit.tacticMax}
                        </dd>
                      </>
                    )}
                  </div>
                  {inspectedTerrain && (
                    <div className="unit-inspect-row unit-inspect-row--terrain">
                      <dt>脚下地形</dt>
                      <dd>
                        {inspectedTerrain}
                        {inspectedOnPreferredTerrain && (
                          <span className="terrain-bonus-tag"> 兵种优势（攻防↑）</span>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <div
                className={[
                  "terrain-legend terrain-legend--inline",
                  battleMapPointerActive ? "" : "terrain-legend--pointer-idle",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden={!battleMapPointerActive}
              >
                <p className="terrain-legend-title">战场地形</p>
                <div className="terrain-legend-row">
                  {TERRAIN_LEGEND.map(({ id, ch }) => (
                    <span key={id} className="terrain-legend-item">
                      <span
                        className={`terrain-legend-swatch ${id}`}
                        title={battleMapPointerActive ? TERRAIN_LABEL[id] : undefined}
                        aria-hidden
                      >
                        {ch}
                      </span>
                      <span>{TERRAIN_LABEL[id]}</span>
                    </span>
                  ))}
                </div>
              </div>
              </div>
              <div
                role="tabpanel"
                id="battle-right-panel-saves"
                aria-labelledby="battle-right-tabbtn-saves"
                hidden={rightInspectorTab !== "saves"}
                className="battle-right-tabpanel battle-right-tabpanel--saves"
                style={battleRightTabCapPx != null ? { maxHeight: battleRightTabCapPx } : undefined}
              >
                <div className="battle-saves-compact">
                  <div className="battle-saves-row battle-saves-row--save">
                    <input
                      className="slot-input slot-input--saves-inline"
                      value={slotName}
                      onChange={(e) => setSlotName(e.target.value)}
                      placeholder="槽名"
                      maxLength={64}
                      aria-label="存档槽名称"
                    />
                    <button type="button" className="btn primary tiny" onClick={saveLocal}>
                      本地
                    </button>
                    <button type="button" className="btn tiny" onClick={saveRemote} disabled={!user}>
                      云端
                    </button>
                  </div>
                  {!user ? (
                    <p className="battle-saves-inline-hint muted small">登录后可云端存</p>
                  ) : null}
                  <div className="battle-saves-dual">
                    <div className="battle-saves-dual__col">
                      <div className="battle-saves-dual__head">
                        本地 <span className="muted">({localList.length})</span>
                      </div>
                      <ul className="save-list save-list--dense">
                        {localList.length === 0 && <li className="muted">无</li>}
                        {localList.map((e) => (
                          <li key={e.slotName}>
                            <button type="button" className="linkish" onClick={() => loadLocal(e)}>
                              {e.slotName}
                            </button>
                            <button
                              type="button"
                              className="btn tiny danger"
                              onClick={() => removeLocal(e.slotName)}
                              aria-label={`删除本地 ${e.slotName}`}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="battle-saves-dual__col">
                      <div className="battle-saves-dual__head">
                        云端{" "}
                        <span className="muted">
                          {remoteLoading
                            ? "（…）"
                            : !token
                              ? "（未登录）"
                              : `（${remoteList.length}）`}
                        </span>
                      </div>
                      <ul className="save-list save-list--dense">
                        {!token && <li className="muted">未登录</li>}
                        {token && remoteList.length === 0 && !remoteLoading && <li className="muted">无</li>}
                        {remoteList.map((r) => (
                          <li key={r.id}>
                            <button type="button" className="linkish" onClick={() => void loadRemote(r)}>
                              {r.slotName}
                            </button>
                            <button
                              type="button"
                              className="btn tiny danger"
                              onClick={() => void removeRemote(r.slotName)}
                              aria-label={`删除云端 ${r.slotName}`}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div
                role="tabpanel"
                id="battle-right-panel-log"
                aria-labelledby="battle-right-tabbtn-log"
                hidden={rightInspectorTab !== "log"}
                className="battle-right-tabpanel battle-right-tabpanel--log"
                style={battleRightTabCapPx != null ? { maxHeight: battleRightTabCapPx } : undefined}
              >
                {rightInspectorTab === "log" ? (
                  <>
                    <p className="battle-log-tab-intro muted small">最新条目在上，在卷轴内上下滚动查看。</p>
                    <ol reversed className="battle-log-list" aria-label="战报">
                      {battle.log
                        .slice()
                        .reverse()
                        .slice(0, 80)
                        .map((line, i) => (
                          <li key={`${battle.log.length}-${i}`}>{line}</li>
                        ))}
                    </ol>
                  </>
                ) : null}
              </div>
            </div>
          </details>
          <div
            className="battle-map-viewport"
            onMouseMove={bumpBattleMapPointer}
            onMouseEnter={bumpBattleMapPointer}
          >
            <GameBattle
              ref={gameBattleRef}
              battle={battle}
              inspectUnitId={inspectUnitId}
              inspectTapSeq={inspectTapSeq}
              visualEpoch={visualEpoch}
              turnIntroLocked={turnIntroLocked}
              battleScriptBlocked={Boolean(battle.battleScript)}
              forceNarrowLayout={cheatBattleLayout !== "none"}
              keyboardBlocked={stagePickerOpen || generalCodexOpen}
              fitViewport
              mapHoverTipsActive={battleMapPointerActive}
              onScrollViewportChange={onBattleScrollViewportChange}
              onTurnActionReady={onTurnActionReady}
              onDamagePulseConsumed={onDamagePulseConsumed}
              onCellClick={onCellClick}
              onUnitClick={onUnitClick}
              onMenuAction={onMenuAction}
              onTacticPick={onTacticPick}
              onEscapeOrRevert={onEscapeOrRevert}
              onPickNavigate={onPickNavigate}
              onPickConfirmFocused={onPickConfirmFocused}
              onPickHoverEnemy={onPickHoverEnemy}
            />
            {battle.outcome === "playing" &&
            battle.battleScript &&
            battle.battleScript.lines.length > 0 ? (
              <BattleDialogueOverlay
                line={battle.battleScript.lines[battle.battleScript.cursor]!}
                progressLabel={`${battle.battleScript.cursor + 1} / ${battle.battleScript.lines.length}`}
                onAdvance={advanceBattleDialogue}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
