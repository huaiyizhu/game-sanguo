export type Side = "player" | "enemy";

/** 地形：影响移动力消耗与可用计策 */
export type Terrain =
  | "plain"
  | "forest"
  | "water"
  | "bridge_horizontal"
  | "bridge_vertical"
  | "mountain"
  | "desert"
  | "wall"
  | "gate";

/** 用于旧存档或异常 JSON 回填 */
const ALL_TERRAINS: readonly Terrain[] = [
  "plain",
  "forest",
  "water",
  "bridge_horizontal",
  "bridge_vertical",
  "mountain",
  "desert",
  "wall",
  "gate",
];

export function normalizeTerrainCell(v: unknown): Terrain {
  if (typeof v === "string" && (ALL_TERRAINS as readonly string[]).includes(v)) {
    return v as Terrain;
  }
  return "plain";
}

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
  /** 兵力上限：由等级决定，1 级 1000，每级 +200，最高 99 级 */
  maxHp: number;
  /** 等级（1–99） */
  level: number;
  /** 当前经验值；每满 100 升一级，溢出带入下一级；99 级后不再升级 */
  exp: number;
  /** 武力（10–100，影响攻防推算；吕布 100、刘禅 10 为锚点） */
  might: number;
  /** 智力（影响计策伤害与计策上限） */
  intel: number;
  /**
   * 防御力（不含地形）：由武力、等级、兵种推算后写入。
   * 攻击力不单独存盘，与界面「含地形」攻防见 `attackPowerOnTerrain` / `defensePowerOnTerrain`。
   */
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
  /** 对应 `generals` 图鉴 id，用于战场头像；无则仅按姓名生成配色 */
  portraitCatalogId?: string;
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

/** 胜利条件：全歼敌军，或仅歼灭若干指定敌方单位（主将等） */
export type WinCondition =
  | { type: "eliminate_all" }
  | { type: "eliminate_marked_enemies"; unitIds: string[] };

/** 我军/敌军沿路逐格移动中的队列（不含起点，按顺序踩格） */
export type PendingMove = {
  unitId: string;
  path: { x: number; y: number }[];
  kind: "player" | "enemy";
  /** 起步格（用于中途取消时还原，可选） */
  from?: { x: number; y: number };
};

/** 剧情对白一行（配置）：按 catalog / 姓名在场上找发言人 */
export type BattleScriptLineDef = {
  speakerCatalogId?: string;
  speakerNameIncludes?: string;
  displayName?: string;
  displayLevel?: number;
  displaySide?: Side;
  text: string;
};

/** 已解析到具体头像与等级的对白行 */
export type BattleScriptLineResolved = {
  name: string;
  level: number;
  side: Side;
  portraitCatalogId?: string;
  text: string;
};

export type BattleScriptKind = "opening" | "reaction";

/** 对白队列：cursor 为当前条下标，任意键推进，满后清空 */
export type BattleScriptQueue = {
  kind: BattleScriptKind;
  lines: BattleScriptLineResolved[];
  cursor: number;
};

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
  /**
   * 胜利条件已满足，但暂不写入 outcome: "won"：等 UI 播完最后一击飘字与阵亡动画后再提交（见 `commitPendingVictory`）。
   */
  pendingVictory?: boolean;
  pickTarget: PickTargetState | null;
  playerTurnStart: PlayerTurnStartMap;
  enemyTurnQueue: string[] | null;
  enemyTurnCursor: number;
  /** 非空时表示单位正在沿路逐格移动，由 UI 定时器调用 `advancePendingMove` */
  pendingMove: PendingMove | null;
  /**
   * 本帧造成的伤害提示（受害者 id + 数值），供 UI 在正确单位上播放受击/飘字；
   * 不应写入存档，加载后应为 null；由 GameBattle 消费后清空。
   */
  damagePulse: {
    unitId: string;
    amount: number;
    key: number;
    hpBefore: number;
    /** UI 受击光色：普攻 / 计策 */
    kind: "melee" | "tactic";
  } | null;
  /** 本关背景提要（侧栏与图鉴式说明） */
  scenarioBrief?: string;
  /** 胜利条件简述（侧栏展示；实际判定见 winCondition） */
  victoryBrief?: string;
  /** 未写则视为全歼敌军 */
  winCondition?: WinCondition;
  /**
   * 从 1 起计：每个「我军回合」阶段的序号（同一条目内敌方行动仍属同一回合数，直至下次我军回合开始才 +1）。
   */
  battleRound: number;
  /** 回合上限；超过后仍未达成胜利则败北。未设则由关卡默认 */
  maxBattleRounds?: number;
  /**
   * 开场或关键阵亡等剧情对白；非空时 UI 盖在地图之上并阻塞操作，逐条按任意键推进。
   * 旧存档无此字段时视为 null。
   */
  battleScript?: BattleScriptQueue | null;
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
    terrains: ["plain", "forest", "desert", "bridge_horizontal", "bridge_vertical"],
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

/** 武力合法区间 */
export const MIGHT_MIN = 10;
export const MIGHT_MAX = 100;

/** 武将等级上限 */
export const MAX_UNIT_LEVEL = 99;

/** 每升一级所需经验（当前等级 Lv.L 攒满后升至 Lv.L+1） */
export const EXP_PER_LEVEL = 100;

export function clampMight(might: number): number {
  return Math.min(MIGHT_MAX, Math.max(MIGHT_MIN, Math.floor(might)));
}

export function clampUnitLevel(level: number): number {
  return Math.min(MAX_UNIT_LEVEL, Math.max(1, Math.floor(level)));
}

/**
 * 兵力上限：1 级 1000，每升一级 +200（与等级挂钩，与旧版「图鉴 maxHp」脱钩）。
 */
export function maxHpForLevel(level: number): number {
  const L = clampUnitLevel(level);
  return 1000 + (L - 1) * 200;
}

/** 计策上限中由智力贡献的部分 */
export function tacticMaxFromIntel(intel: number): number {
  return 10 + Math.floor(intel / 2);
}

/**
 * 策略（计策）上限：智力打底 + 等级线性项 + 等级平方项（高等级增长更明显），封顶防爆炸。
 */
export function tacticMaxForUnit(intel: number, level: number): number {
  const L = clampUnitLevel(level);
  const base = tacticMaxFromIntel(intel);
  const linear = L * 3.2;
  const curve = L * L * 0.28;
  return Math.min(200, Math.floor(base + linear + curve));
}

/**
 * 攻击力（不含地形）：武力越高、等级越高越强；同等条件下骑 > 步 > 弓。
 * 低武力高等级可高于高武力低等级（等级平方项主导中后期）。
 * 战场实际扣血为「兵力上限」的比例伤，本值与防御的比值决定每击大致掉血比例（见 `battle.ts`）。
 */
export function attackPowerForUnit(might: number, level: number, troopKind: TroopKind): number {
  const m = clampMight(might);
  const L = clampUnitLevel(level);
  const troopMul =
    troopKind === "cavalry" ? 1.15 : troopKind === "infantry" ? 1 : 0.84;
  const core = m * 0.32 + L * L * 0.18 + L * 1.15;
  return Math.max(1, Math.floor(core * troopMul));
}

/**
 * 防御力（不含地形）：同武力等级下步 > 骑 > 弓。
 * 与攻方含地形攻击力的比值影响每击兵力损失比例；亦参与计策抗性。
 */
export function defensePowerForUnit(might: number, level: number, troopKind: TroopKind): number {
  const m = clampMight(might);
  const L = clampUnitLevel(level);
  const troopMul =
    troopKind === "infantry" ? 1.12 : troopKind === "cavalry" ? 1 : 0.86;
  const core = m * 0.22 + L * L * 0.16 + L * 0.9;
  return Math.max(1, Math.floor(core * troopMul));
}

/**
 * 升到下一级所需经验（当前等级为 L 时）。
 * 已满级时返回 `Infinity`（不再升级，经验可继续累积）。
 */
export function expToNextLevel(level: number): number {
  return clampUnitLevel(level) >= MAX_UNIT_LEVEL ? Infinity : EXP_PER_LEVEL;
}

/** 兵种是否在优势地形（攻防加成） */
export function isArmyPreferredTerrain(army: ArmyType, t: Terrain): boolean {
  if (t === "wall" || t === "gate") return false;
  if (army === "ping")
    return t === "plain" || t === "forest" || t === "desert" || t === "bridge_horizontal" || t === "bridge_vertical";
  if (army === "shan") return t === "mountain";
  return army === "shui" && t === "water";
}

/** 优势地形：攻击力倍率 */
export const PREFERRED_TERRAIN_ATK_MUL = 1.15;
/** 优势地形：额外防御（减免） */
export const PREFERRED_TERRAIN_DEF_BONUS = 6;

/** 当前格地形上的攻击力（含兵种地利倍率，不含兵种相克） */
export function attackPowerOnTerrain(
  might: number,
  level: number,
  troopKind: TroopKind,
  armyType: ArmyType,
  terrain: Terrain
): number {
  let v = attackPowerForUnit(might, level, troopKind);
  if (isArmyPreferredTerrain(armyType, terrain)) v = Math.floor(v * PREFERRED_TERRAIN_ATK_MUL);
  return v;
}

/** 当前格地形上的防御力（含兵种地利加成，不含兵种相克） */
export function defensePowerOnTerrain(
  might: number,
  level: number,
  troopKind: TroopKind,
  armyType: ArmyType,
  terrain: Terrain
): number {
  let v = defensePowerForUnit(might, level, troopKind);
  if (isArmyPreferredTerrain(armyType, terrain)) v += PREFERRED_TERRAIN_DEF_BONUS;
  return v;
}

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
  if (t === "cavalry") return 8;
  if (t === "archer") return 5;
  return 6;
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
export const ARCHER_ATTACK_RANGE = 3;

export const TERRAIN_LABEL: Record<Terrain, string> = {
  plain: "陆地",
  forest: "林地",
  water: "水",
  bridge_horizontal: "木桥（东西）",
  bridge_vertical: "木桥（南北）",
  mountain: "山地",
  desert: "沙漠",
  wall: "城墙",
  gate: "城门",
};
