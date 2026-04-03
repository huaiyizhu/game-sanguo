export type Side = "player" | "enemy";

export type BattlePhase = "select" | "move" | "menu" | "pick-target" | "enemy";

export interface Unit {
  id: string;
  name: string;
  side: Side;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  move: number;
  moved: boolean;
  acted: boolean;
}

/** 我军回合开始时各将的位置与行动标记，用于 Esc/右键撤销本回合对该单位的操作 */
export type PlayerTurnStartMap = Record<
  string,
  { x: number; y: number; moved: boolean; acted: boolean }
>;

export interface PickTargetState {
  kind: "melee" | "tactic";
  attackerId: string;
  targetIds: string[];
  focusIndex: number;
}

export interface BattleState {
  version: 1;
  scenarioId: string;
  scenarioTitle: string;
  gridW: number;
  gridH: number;
  turn: "player" | "enemy";
  phase: BattlePhase;
  /** 当前选中我军单位 id，或 null */
  selectedId: string | null;
  /** 可移动到的格子（不含自身） */
  moveTargets: { x: number; y: number }[];
  units: Unit[];
  log: string[];
  outcome: "playing" | "won" | "lost";
  /** 多目标攻击/计策时的选择状态 */
  pickTarget: PickTargetState | null;
  /** 本回合我军行动前快照（每名我军存活单位） */
  playerTurnStart: PlayerTurnStartMap;
}

export const LOCAL_SAVES_KEY = "sanguo_local_saves";
