/**
 * 刘备线关卡配置（演义时间线 + 参考《三国英杰传》式章节推进）。
 * 战场均为 12×8；敌军强度随章节递增。
 */
import type { ArmyType, BattleState, Terrain, TroopKind, Unit } from "./types";
import { tacticMaxForUnit, movePointsForTroop } from "./types";

const GW = 12;
const GH = 8;

/** 关卡顺序；最后一关胜利后回到序章（见 createNextBattleAfterVictory） */
export const SCENARIO_ORDER = [
  "prologue_zhangjiao",
  "ch1_pursuit",
  "ch2_xuzhou",
  "ch3_xiaopei",
  "ch4_xinye",
  "ch5_changban",
  "ch6_chibi",
  "ch7_yizhou",
  "ch8_hanzhong",
] as const;

export type ScenarioId = (typeof SCENARIO_ORDER)[number];

export function getNextScenarioId(currentId: string): string | null {
  const idx = SCENARIO_ORDER.indexOf(currentId as ScenarioId);
  if (idx < 0 || idx >= SCENARIO_ORDER.length - 1) return null;
  return SCENARIO_ORDER[idx + 1];
}

/** 与序章相同：林、水、山、沙教学地形 */
export function createDefaultTerrain(gridW: number, gridH: number): Terrain[][] {
  if (gridW === GW && gridH === GH) return terrainClassic();
  const rows: Terrain[][] = [];
  for (let y = 0; y < gridH; y++) {
    rows.push(Array.from({ length: gridW }, () => "plain" as Terrain));
  }
  return rows;
}

function terrainClassic(): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < GH; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < GW; x++) {
      let t: Terrain = "plain";
      if (y >= 2 && y <= 4 && x >= 4 && x <= 7) t = "forest";
      if (y === 5 && x >= 3 && x <= 8) t = "water";
      if ((x <= 1 || x >= GW - 2) && y >= 1 && y <= 5) t = "mountain";
      if (y === GH - 1 && x >= 2 && x <= 9) t = "desert";
      if (y === 0 && x >= 3 && x <= 8) t = "plain";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

/** 小沛/新野：中央密林 */
function terrainForestCore(): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < GH; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < GW; x++) {
      let t: Terrain = "plain";
      if (x >= 3 && x <= 8 && y >= 2 && y <= 5) t = "forest";
      if (y === GH - 1 && x >= 1 && x <= 10) t = "water";
      if (x <= 1 && y >= 1 && y <= 4) t = "mountain";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

/** 长坂：河道横断，利于迟滞 */
function terrainRiverRetreat(): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < GH; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < GW; x++) {
      let t: Terrain = "plain";
      if (y === 3 || y === 4) {
        if (x !== 0 && x !== GW - 1) t = "water";
      }
      if (y <= 2 && x >= 5 && x <= 7) t = "forest";
      if (y >= 5 && x >= 2 && x <= 5) t = "forest";
      if (x === 0 || x === GW - 1) t = "mountain";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

/** 赤壁前哨：多水泽 */
function terrainChibiMarsh(): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < GH; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < GW; x++) {
      let t: Terrain = "plain";
      if ((x + y) % 3 === 0 && y >= 2) t = "water";
      if (x >= 4 && x <= 7 && y === 1) t = "forest";
      if (y === GH - 1 && x >= 3 && x <= 8) t = "water";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

/** 剑阁：中央山隘 */
function terrainMountainPass(): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < GH; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < GW; x++) {
      let t: Terrain = "plain";
      if (x >= 5 && x <= 6 && y >= 1 && y <= GH - 2) t = "mountain";
      if (y === 0 && x >= 2 && x <= 9) t = "forest";
      if (y === GH - 1) t = "desert";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

/** 汉中：沙地 + 山麓混合 */
function terrainHanzhong(): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < GH; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < GW; x++) {
      let t: Terrain = "plain";
      if (y >= 4) t = "desert";
      if (x <= 2 && y <= 4) t = "mountain";
      if (x >= 9 && y <= 3) t = "forest";
      if (y === 2 && x >= 4 && x <= 7) t = "water";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

function playerRoster(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): Unit[] {
  return [
    {
      id: "p1",
      name: "刘备",
      side: "player",
      x: p1.x,
      y: p1.y,
      hp: 120,
      maxHp: 120,
      level: 1,
      exp: 0,
      might: 28,
      intel: 72,
      defense: 12,
      armyType: "ping",
      troopKind: "infantry",
      tacticMax: tacticMaxForUnit(72, 1),
      tacticPoints: tacticMaxForUnit(72, 1),
      move: movePointsForTroop("infantry"),
      moved: false,
      acted: false,
    },
    {
      id: "p2",
      name: "关羽",
      side: "player",
      x: p2.x,
      y: p2.y,
      hp: 110,
      maxHp: 110,
      level: 1,
      exp: 0,
      might: 32,
      intel: 68,
      defense: 14,
      armyType: "ping",
      troopKind: "cavalry",
      tacticMax: tacticMaxForUnit(68, 1),
      tacticPoints: tacticMaxForUnit(68, 1),
      move: movePointsForTroop("cavalry"),
      moved: false,
      acted: false,
    },
    {
      id: "p3",
      name: "张飞",
      side: "player",
      x: p3.x,
      y: p3.y,
      hp: 130,
      maxHp: 130,
      level: 1,
      exp: 0,
      might: 30,
      intel: 38,
      defense: 13,
      armyType: "shan",
      troopKind: "archer",
      tacticMax: tacticMaxForUnit(38, 1),
      tacticPoints: tacticMaxForUnit(38, 1),
      move: movePointsForTroop("archer"),
      moved: false,
      acted: false,
    },
  ];
}

function E(
  id: string,
  name: string,
  x: number,
  y: number,
  hp: number,
  level: number,
  might: number,
  intel: number,
  defense: number,
  troopKind: TroopKind,
  armyType: ArmyType
): Unit {
  return {
    id,
    name,
    side: "enemy",
    x,
    y,
    hp,
    maxHp: hp,
    level,
    exp: 0,
    might,
    intel,
    defense,
    armyType,
    troopKind,
    tacticMax: 0,
    tacticPoints: 0,
    move: movePointsForTroop(troopKind),
    moved: false,
    acted: false,
  };
}

function baseState(
  scenarioId: string,
  scenarioTitle: string,
  terrain: Terrain[][],
  units: Unit[],
  log0: string
): BattleState {
  return {
    version: 2,
    scenarioId,
    scenarioTitle,
    gridW: GW,
    gridH: GH,
    terrain,
    turn: "player",
    phase: "select",
    selectedId: null,
    moveTargets: [],
    units,
    log: [log0],
    outcome: "playing",
    pickTarget: null,
    playerTurnStart: {},
    enemyTurnQueue: null,
    enemyTurnCursor: 0,
    pendingMove: null,
    damagePulse: null,
  };
}

export function buildBattleStateForScenario(scenarioId: string): BattleState {
  const bottom = { a: { x: 3, y: 6 }, b: { x: 5, y: 6 }, c: { x: 7, y: 6 } };
  const mid = { a: { x: 2, y: 5 }, b: { x: 5, y: 6 }, c: { x: 8, y: 5 } };

  switch (scenarioId) {
    case "prologue_zhangjiao":
      return baseState(
        "prologue_zhangjiao",
        "序章 · 讨伐黄巾",
        terrainClassic(),
        [
          ...playerRoster(bottom.a, bottom.b, bottom.c),
          E("e1", "黄巾贼", 5, 5, 70, 2, 22, 30, 8, "infantry", "shui"),
          E("e2", "黄巾贼", 7, 2, 65, 2, 21, 28, 7, "archer", "ping"),
          E("e3", "黄巾头目", 1, 3, 95, 4, 26, 42, 11, "cavalry", "shan"),
        ],
        "刘备举义兵讨伐黄巾，与关羽、张飞共赴战场。"
      );

    case "ch1_pursuit":
      return baseState(
        "ch1_pursuit",
        "第一章 · 洛阳溃敌",
        terrainClassic(),
        [
          ...playerRoster(bottom.a, bottom.b, bottom.c),
          E("e1", "西凉斥候", 3, 1, 58, 3, 24, 22, 9, "cavalry", "ping"),
          E("e2", "西凉斥候", 8, 1, 58, 3, 24, 22, 9, "cavalry", "ping"),
          E("e3", "西凉精兵", 5, 0, 88, 5, 29, 26, 12, "infantry", "shan"),
          E("e4", "西凉队率", 6, 2, 102, 6, 31, 35, 13, "archer", "ping"),
        ],
        "董卓已死，西凉残部四散；刘备军追歼溃敌，却遭精锐拦击。"
      );

    case "ch2_xuzhou":
      return baseState(
        "ch2_xuzhou",
        "第二章 · 徐州驰援",
        terrainClassic(),
        [
          ...playerRoster(mid.a, mid.b, mid.c),
          E("e1", "曹军斥候", 9, 1, 62, 4, 25, 24, 10, "cavalry", "ping"),
          E("e2", "曹军弓手", 10, 3, 55, 4, 23, 30, 8, "archer", "ping"),
          E("e3", "曹军步卒", 8, 5, 72, 4, 24, 22, 10, "infantry", "ping"),
          E("e4", "曹军都伯", 6, 2, 92, 6, 28, 32, 12, "infantry", "shan"),
          E("e5", "青州兵", 4, 1, 80, 5, 27, 26, 11, "infantry", "ping"),
        ],
        "陶谦告急，曹操大军压境徐州，刘备星夜来援。"
      );

    case "ch3_xiaopei":
      return baseState(
        "ch3_xiaopei",
        "第三章 · 小沛据守",
        terrainForestCore(),
        [
          ...playerRoster(bottom.a, bottom.b, bottom.c),
          E("e1", "并州骑", 10, 2, 68, 5, 27, 22, 11, "cavalry", "ping"),
          E("e2", "并州骑", 9, 4, 65, 5, 26, 22, 10, "cavalry", "shan"),
          E("e3", "陷阵营卒", 7, 3, 78, 6, 28, 24, 13, "infantry", "shan"),
          E("e4", "飞熊军士", 5, 1, 85, 6, 29, 28, 12, "archer", "ping"),
          E("e5", "吕军裨将", 3, 2, 108, 7, 32, 36, 14, "infantry", "ping"),
        ],
        "吕布势盛，小沛城下战云密布，刘关张死守营栅。"
      );

    case "ch4_xinye":
      return baseState(
        "ch4_xinye",
        "第四章 · 新野初谋",
        terrainForestCore(),
        [
          ...playerRoster(bottom.a, bottom.b, bottom.c),
          E("e1", "曹军先锋", 10, 5, 72, 6, 28, 25, 12, "cavalry", "ping"),
          E("e2", "虎豹骑探马", 11, 3, 70, 6, 30, 20, 11, "cavalry", "ping"),
          E("e3", "青州弩手", 8, 2, 62, 6, 24, 34, 9, "archer", "ping"),
          E("e4", "许都精兵", 6, 1, 88, 7, 30, 27, 13, "infantry", "ping"),
          E("e5", "曹军司马", 4, 3, 115, 8, 33, 38, 15, "infantry", "shan"),
        ],
        "新野小城，曹军先锋衔枚疾进；诸葛亮初佐玄德，此战试刃。"
      );

    case "ch5_changban":
      return baseState(
        "ch5_changban",
        "第五章 · 长坂退敌",
        terrainRiverRetreat(),
        [
          ...playerRoster({ x: 2, y: 6 }, { x: 4, y: 6 }, { x: 6, y: 6 }),
          E("e1", "虎豹骑", 10, 2, 78, 7, 31, 22, 12, "cavalry", "ping"),
          E("e2", "虎豹骑", 9, 0, 75, 7, 30, 22, 12, "cavalry", "ping"),
          E("e3", "曹魏突骑", 11, 4, 72, 7, 29, 24, 11, "cavalry", "shan"),
          E("e4", "长坂斥候", 8, 1, 68, 7, 27, 28, 10, "archer", "ping"),
          E("e5", "曹军别部", 5, 2, 95, 8, 31, 30, 13, "infantry", "ping"),
          E("e6", "曹军偏将", 7, 0, 125, 9, 34, 40, 15, "infantry", "shan"),
        ],
        "长坂坡前，百姓流离；赵云单骑未在此战，唯有关张与主公断后冲围。"
      );

    case "ch6_chibi":
      return baseState(
        "ch6_chibi",
        "第六章 · 赤壁前哨",
        terrainChibiMarsh(),
        [
          ...playerRoster(bottom.a, bottom.b, bottom.c),
          E("e1", "江东弩手", 10, 3, 68, 8, 28, 36, 11, "archer", "shui"),
          E("e2", "曹军水卒", 9, 5, 74, 8, 27, 26, 12, "infantry", "shui"),
          E("e3", "连环舟卒", 7, 4, 80, 8, 29, 24, 12, "infantry", "shui"),
          E("e4", "荆州降卒", 5, 2, 85, 9, 30, 28, 13, "archer", "ping"),
          E("e5", "水军督尉", 3, 3, 118, 9, 32, 42, 14, "infantry", "shui"),
        ],
        "孙刘结盟在即，江岸前哨已交火：水军与弓弩对射，烟火渐起。"
      );

    case "ch7_yizhou":
      return baseState(
        "ch7_yizhou",
        "第七章 · 剑阁先声",
        terrainMountainPass(),
        [
          ...playerRoster(bottom.a, bottom.b, bottom.c),
          E("e1", "益州弓手", 10, 5, 72, 9, 29, 32, 12, "archer", "shan"),
          E("e2", "剑阁守军", 8, 4, 88, 9, 28, 26, 13, "infantry", "shan"),
          E("e3", "益州骑兵", 6, 6, 76, 9, 30, 24, 12, "cavalry", "ping"),
          E("e4", "涪城援军", 4, 3, 92, 10, 31, 28, 13, "infantry", "shan"),
          E("e5", "刘璋部将", 2, 2, 105, 10, 33, 35, 14, "cavalry", "ping"),
          E("e6", "益州司马", 1, 5, 132, 11, 35, 44, 16, "infantry", "shan"),
        ],
        "入蜀之路险阻，剑阁天险下益州将士列阵相拒。"
      );

    case "ch8_hanzhong":
      return baseState(
        "ch8_hanzhong",
        "第八章 · 定军山麓",
        terrainHanzhong(),
        [
          ...playerRoster(mid.a, mid.b, mid.c),
          E("e1", "魏军骑兵", 10, 1, 82, 10, 32, 24, 13, "cavalry", "ping"),
          E("e2", "魏军骑兵", 11, 3, 80, 10, 31, 24, 13, "cavalry", "shan"),
          E("e3", "夏侯部曲", 9, 5, 90, 11, 33, 30, 14, "infantry", "ping"),
          E("e4", "魏武强弩", 7, 2, 74, 10, 28, 38, 11, "archer", "ping"),
          E("e5", "长安精兵", 5, 4, 98, 11, 32, 28, 14, "infantry", "shan"),
          E("e6", "魏军参军", 3, 1, 112, 11, 34, 40, 15, "archer", "ping"),
          E("e7", "魏军大将", 6, 0, 155, 12, 36, 42, 17, "cavalry", "ping"),
        ],
        "汉中门户洞开，魏军精锐云集定军山麓；刘备军为立足西川，决一死战。"
      );

    default:
      return buildBattleStateForScenario(SCENARIO_ORDER[0]);
  }
}

/** 秘籍选关面板用：全部关卡 id 与标题 */
export function listScenarioEntries(): { id: ScenarioId; title: string }[] {
  return SCENARIO_ORDER.map((id) => ({
    id,
    title: buildBattleStateForScenario(id).scenarioTitle,
  }));
}
