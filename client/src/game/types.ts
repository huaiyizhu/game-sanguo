export type Side = "player" | "enemy";

/** 地形：影响移动力消耗与可用计策 */
export type Terrain = "plain" | "forest" | "water" | "mountain" | "desert";

/** 兵种：平军 / 山军 / 水军，影响涉水与山地移耗 */
export type ArmyType = "ping" | "shan" | "shui";

export type BattlePhase =
  | "select"
  | "move"
  | "menu"
  | "tactic-menu"
  | "pick-target"
  | "enemy";

/** 计策种类 */
export type TacticKind = "fire" | "water" | "trap";

export interface Unit {
  id: string;
  name: string;
  side: Side;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 武力（近战伤害） */
  might: number;
  /** 智力（影响计策伤害与计策上限） */
  intel: number;
  /** 兵种 */
  armyType: ArmyType;
  /** 当前计策值 */
  tacticPoints: number;
  /** 计策值上限（由智力推导，每回合我军开始时回满） */
  tacticMax: number;
  move: number;
  moved: boolean;
  acted: boolean;
}

/** 我军回合开始时各将的状态，用于 Esc/右键撤销 */
export type PlayerTurnStartMap = Record<
  string,
  {
    x: number;
    y: number;
    moved: boolean;
    acted: boolean;
    tacticPoints: number;
  }
>;

export interface PickTargetState {
  kind: "melee" | "tactic";
  tacticKind?: TacticKind;
  attackerId: string;
  targetIds: string[];
  focusIndex: number;
}

export interface BattleState {
  version: 2;
  scenarioId: string;
  scenarioTitle: string;
  gridW: number;
  gridH: number;
  /** terrain[y][x] */
  terrain: Terrain[][];
  turn: "player" | "enemy";
  phase: BattlePhase;
  selectedId: string | null;
  moveTargets: { x: number; y: number }[];
  units: Unit[];
  log: string[];
  outcome: "playing" | "won" | "lost";
  pickTarget: PickTargetState | null;
  playerTurnStart: PlayerTurnStartMap;
  enemyTurnQueue: string[] | null;
  enemyTurnCursor: number;
}

export const LOCAL_SAVES_KEY = "sanguo_local_saves";

/** 计策定义：耗费、目标站立格地形要求 */
export const TACTIC_DEF: Record<
  TacticKind,
  { name: string; cost: number; terrains: readonly Terrain[]; dmgMul: number }
> = {
  fire: {
    name: "火计",
    cost: 3,
    terrains: ["plain", "forest", "desert"],
    dmgMul: 1.0,
  },
  water: {
    name: "水计",
    cost: 4,
    terrains: ["water"],
    dmgMul: 1.15,
  },
  trap: {
    name: "陷阱",
    cost: 4,
    terrains: ["mountain"],
    dmgMul: 1.1,
  },
};

export function tacticMaxFromIntel(intel: number): number {
  return 10 + Math.floor(intel / 2);
}

export const ARMY_TYPE_LABEL: Record<ArmyType, string> = {
  ping: "平军",
  shan: "山军",
  shui: "水军",
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  plain: "陆地",
  forest: "林地",
  water: "水",
  mountain: "山地",
  desert: "沙漠",
};
