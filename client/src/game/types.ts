export type Side = "player" | "enemy";

/** 地形：影响移动力消耗与可用计策 */
export type Terrain = "plain" | "forest" | "water" | "mountain" | "desert";

/** 兵种：平军 / 山军 / 水军，影响涉水与山地移耗 */
export type ArmyType = "ping" | "shan" | "shui";

/** 将领种类：骑 / 步 / 弓（移动力与普攻射程、兵种相克） */
export type TroopKind = "cavalry" | "infantry" | "archer";

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
  /** 等级 */
  level: number;
  /** 当前经验值（累积至升级） */
  exp: number;
  /** 武力（近战伤害） */
  might: number;
  /** 智力（影响计策伤害与计策上限） */
  intel: number;
  /** 防御（减免受到的物理/计策伤害） */
  defense: number;
  /** 兵种 */
  armyType: ArmyType;
  /** 将领种类（骑步弓） */
  troopKind: TroopKind;
  /** 当前计策值 */
  tacticPoints: number;
  /** 计策值上限（智力 + 等级，每回合我军开始时回满） */
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
    hp: number;
    maxHp: number;
    level: number;
    exp: number;
    defense: number;
    tacticPoints: number;
    tacticMax: number;
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

/** 计策上限中由智力贡献的部分 */
export function tacticMaxFromIntel(intel: number): number {
  return 10 + Math.floor(intel / 2);
}

/** 计策上限 = 智力基数 + 每级 +2 */
export function tacticMaxForUnit(intel: number, level: number): number {
  return tacticMaxFromIntel(intel) + level * 2;
}

/** 升到下一级所需经验（当前等级为 L 时） */
export function expToNextLevel(level: number): number {
  return 36 + level * 24 + level * level * 2;
}

/** 兵种是否在优势地形（攻防加成） */
export function isArmyPreferredTerrain(army: ArmyType, t: Terrain): boolean {
  if (army === "ping") return t === "plain" || t === "forest" || t === "desert";
  if (army === "shan") return t === "mountain";
  return army === "shui" && t === "water";
}

/** 优势地形：攻击力倍率 */
export const PREFERRED_TERRAIN_ATK_MUL = 1.15;
/** 优势地形：额外防御（减免） */
export const PREFERRED_TERRAIN_DEF_BONUS = 6;

export const ARMY_TYPE_LABEL: Record<ArmyType, string> = {
  ping: "平军",
  shan: "山军",
  shui: "水军",
};

export const TROOP_KIND_LABEL: Record<TroopKind, string> = {
  cavalry: "骑兵",
  infantry: "步兵",
  archer: "弓兵",
};

/** 格子上兵种徽记（与图腾配合，扫一眼可辨） */
export const TROOP_KIND_BADGE: Record<TroopKind, string> = {
  cavalry: "骑",
  infantry: "步",
  archer: "弓",
};

/** 各将领种类每回合移动力（可走格消耗仍受地形影响） */
export function movePointsForTroop(t: TroopKind): number {
  if (t === "cavalry") return 6;
  if (t === "archer") return 3;
  return 4;
}

/**
 * 普攻侧克制：攻方种类对守方种类有杀伤优势（骑→步、步→弓、弓→骑）
 */
export const TROOP_ATTACK_COUNTERS: Record<TroopKind, TroopKind> = {
  cavalry: "infantry",
  infantry: "archer",
  archer: "cavalry",
};

/**
 * 防御侧克制：守方种类对来自该攻方种类的伤害更易减免（步防弓、骑防步、弓防骑）
 */
export const TROOP_DEFENSE_COUNTERS: Record<TroopKind, TroopKind> = {
  archer: "infantry",
  infantry: "cavalry",
  cavalry: "archer",
};

/** 普攻克制：攻方武力等效倍率 */
export const TROOP_ATK_ADVANTAGE_MUL = 1.22;
/** 防御克制：守方额外等效防御 */
export const TROOP_DEF_ADVANTAGE_BONUS = 8;

export function isTroopKind(x: unknown): x is TroopKind {
  return x === "cavalry" || x === "infantry" || x === "archer";
}

/** 弓兵普攻最远距离（曼哈顿）；步骑仅相邻 1 */
export const ARCHER_ATTACK_RANGE = 2;

export const TERRAIN_LABEL: Record<Terrain, string> = {
  plain: "陆地",
  forest: "林地",
  water: "水",
  mountain: "山地",
  desert: "沙漠",
};
