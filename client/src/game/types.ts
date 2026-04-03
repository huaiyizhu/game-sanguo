export type Side = "player" | "enemy";

export type BattlePhase = "select" | "move" | "menu" | "enemy";

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
}

export const LOCAL_SAVES_KEY = "sanguo_local_saves";
