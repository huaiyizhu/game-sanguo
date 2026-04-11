/**
 * 刘备线关卡：可变大地图、演义背景提要、胜利条件与名将图鉴单位。
 */
import { playerJoinerFromCatalog, unitFromCatalog } from "./generals";
import type { ArmyType, BattleState, Terrain, TroopKind, Unit, WinCondition } from "./types";
import {
  clampMight,
  clampUnitLevel,
  defensePowerForUnit,
  maxHpForLevel,
  movePointsForTroop,
  tacticMaxForUnit,
} from "./types";

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
  "ch9_xiangfan",
  "ch10_yiling",
  "ch11_qishan",
] as const;

export type ScenarioId = (typeof SCENARIO_ORDER)[number];

export function getNextScenarioId(currentId: string): string | null {
  const idx = SCENARIO_ORDER.indexOf(currentId as ScenarioId);
  if (idx < 0 || idx >= SCENARIO_ORDER.length - 1) return null;
  return SCENARIO_ORDER[idx + 1];
}

/** 在指定横排铺城墙，仅 gateX 为城门（可通行），其余格为不可通行的城墙 */
function addCityWallRow(
  rows: Terrain[][],
  y: number,
  gateX: number,
  marginX = 2
): void {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (y < 0 || y >= h || w === 0) return;
  const lo = Math.max(marginX, 1);
  const hi = w - marginX;
  if (lo >= hi) return;
  const gx = Math.max(lo, Math.min(hi - 1, gateX));
  for (let x = lo; x < hi; x++) {
    rows[y][x] = x === gx ? "gate" : "wall";
  }
}

/** 与旧 12×8 序章兼容的默认地形；其余尺寸为算法生成 */
export function createDefaultTerrain(gridW: number, gridH: number): Terrain[][] {
  if (gridW === 12 && gridH === 8) return terrainClassic(12, 8);
  return terrainOpenPlains(gridW, gridH);
}

function terrainClassic(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      const y0 = Math.floor(h * 0.25);
      const y1 = Math.floor(h * 0.55);
      const x0 = Math.floor(w * 0.33);
      const x1 = Math.floor(w * 0.66);
      if (y >= y0 && y <= y1 && x >= x0 && x <= x1) t = "forest";
      const bx0 = Math.floor(w * 0.06);
      const bx1 = Math.floor(w * 0.24);
      const by0 = Math.floor(h * 0.62);
      if (x >= bx0 && x <= bx1 && y >= by0 && y <= h - 2) t = "forest";
      const wy = Math.floor(h * 0.62);
      if (y === wy && x >= Math.floor(w * 0.22) && x <= Math.floor(w * 0.72)) t = "water";
      const wy2 = Math.floor(h * 0.36);
      if (y >= wy2 && y <= wy2 + 1 && x >= Math.floor(w * 0.52) && x <= Math.floor(w * 0.94)) t = "water";
      if ((x <= 1 || x >= w - 2) && y >= 1 && y <= Math.floor(h * 0.7)) t = "mountain";
      if (y === h - 1 && x >= 2 && x <= w - 3) t = "desert";
      if (t === "plain" && (x + y * 3) % 13 === 0 && y > 2 && y < h - 3 && x > 2 && x < w - 3) t = "forest";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

function terrainOpenPlains(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < h; y++) {
    rows.push(Array.from({ length: w }, () => "plain" as Terrain));
  }
  return rows;
}

function terrainForestCore(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      const x0 = Math.floor(w * 0.28);
      const x1 = Math.floor(w * 0.72);
      const y0 = Math.floor(h * 0.22);
      const y1 = Math.floor(h * 0.65);
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) t = "forest";
      const x2 = Math.floor(w * 0.72);
      const x3 = Math.floor(w * 0.92);
      const y2 = Math.floor(h * 0.35);
      const y3 = Math.floor(h * 0.58);
      if (x >= x2 && x <= x3 && y >= y2 && y <= y3) t = "forest";
      if (y === h - 1 && x >= 1 && x <= w - 2) t = "water";
      if (y === h - 2 && x >= Math.floor(w * 0.35) && x <= Math.floor(w * 0.55)) t = "water";
      if (x <= Math.floor(w * 0.12) && y >= 1 && y <= Math.floor(h * 0.55)) t = "mountain";
      if (x >= Math.floor(w * 0.88) && y >= Math.floor(h * 0.5) && y <= h - 2) t = "mountain";
      if (t === "plain" && (x * y) % 17 === 0 && y > 1 && y < h - 2) t = "forest";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

function terrainRiverRetreat(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  const ry = Math.floor(h * 0.42);
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      const meander = Math.floor(Math.sin(x * 0.35) * 1.5);
      const ryHere = ry + meander;
      if (y === ryHere || y === ryHere + 1 || y === ryHere + 2) {
        if (x !== 0 && x !== w - 1) t = "water";
      }
      if (y <= Math.floor(h * 0.28) && x >= Math.floor(w * 0.42) && x <= Math.floor(w * 0.62)) t = "forest";
      if (y >= Math.floor(h * 0.62) && x >= Math.floor(w * 0.12) && x <= Math.floor(w * 0.48)) t = "forest";
      if (y >= Math.floor(h * 0.18) && y <= Math.floor(h * 0.32) && x >= Math.floor(w * 0.08) && x <= Math.floor(w * 0.22))
        t = "forest";
      if (x === 0 || x === w - 1) t = "mountain";
      if (t === "plain" && y > h - 4 && x > 3 && x < w - 4 && (x + y) % 9 === 0) t = "desert";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

function terrainChibiMarsh(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      if ((x + y) % 3 === 0 && y >= Math.floor(h * 0.18)) t = "water";
      if ((x + y * 2) % 5 === 0 && y >= Math.floor(h * 0.35) && y <= Math.floor(h * 0.72)) t = "water";
      if (x >= Math.floor(w * 0.38) && x <= Math.floor(w * 0.62) && y <= Math.floor(h * 0.18)) t = "forest";
      if (x <= Math.floor(w * 0.15) && y >= Math.floor(h * 0.45) && y <= Math.floor(h * 0.7)) t = "forest";
      if (y === h - 1 && x >= Math.floor(w * 0.25) && x <= Math.floor(w * 0.75)) t = "water";
      if (y === h - 2 && x >= Math.floor(w * 0.4) && x <= Math.floor(w * 0.6)) t = "water";
      if (t === "plain" && x > 2 && x < w - 3 && y > 2 && y < h - 3 && (x * 7 + y * 11) % 23 < 2) t = "mountain";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

function terrainMountainPass(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  const cx0 = Math.floor(w * 0.42);
  const cx1 = Math.floor(w * 0.55);
  const cx2 = Math.floor(w * 0.72);
  const cx3 = Math.floor(w * 0.78);
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      if (x >= cx0 && x <= cx1 && y >= 1 && y <= h - 2) t = "mountain";
      if (x >= cx2 && x <= cx3 && y >= Math.floor(h * 0.25) && y <= Math.floor(h * 0.65)) t = "mountain";
      if (y === 0 && x >= Math.floor(w * 0.18) && x <= Math.floor(w * 0.82)) t = "forest";
      if (y === h - 1) t = "desert";
      if (y >= Math.floor(h * 0.55) && y <= h - 2 && x >= Math.floor(w * 0.25) && x <= Math.floor(w * 0.38))
        t = "water";
      if (t === "plain" && y > 1 && y < h - 2 && (x + y * 2) % 19 === 0) t = "forest";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

function terrainHanzhong(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      if (y >= Math.floor(h * 0.52)) t = "desert";
      if (x <= Math.floor(w * 0.14) && y <= Math.floor(h * 0.55)) t = "mountain";
      if (x >= Math.floor(w * 0.78) && y <= Math.floor(h * 0.32)) t = "forest";
      if (y === Math.floor(h * 0.28) && x >= Math.floor(w * 0.35) && x <= Math.floor(w * 0.65)) t = "water";
      if (y >= Math.floor(h * 0.38) && y <= Math.floor(h * 0.42) && x >= Math.floor(w * 0.08) && x <= Math.floor(w * 0.42))
        t = "water";
      if (t === "plain" && x > w * 0.35 && x < w * 0.7 && y > h * 0.15 && y < h * 0.45 && (x + y) % 7 === 0)
        t = "forest";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

/** 襄樊·汉水：狭长河道，利于水战与弓弩迟滞 */
function terrainFanRiver(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  const riverL = Math.floor(w * 0.32);
  const riverR = Math.floor(w * 0.54);
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      const widen = y % 5 === 0 ? 1 : 0;
      if (x >= riverL - widen && x <= riverR + widen && y >= 1 && y <= h - 2) t = "water";
      if (y <= Math.floor(h * 0.2) && x >= Math.floor(w * 0.15) && x <= Math.floor(w * 0.85)) t = "forest";
      if (y >= Math.floor(h * 0.72) && x >= Math.floor(w * 0.6) && x <= Math.floor(w * 0.92)) t = "forest";
      if (x <= 1 || x >= w - 2) t = "mountain";
      if (t === "plain" && y > h * 0.55 && y < h - 1 && (x + y * 2) % 11 === 0) t = "desert";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

/** 夷陵：江岸连营，林带与浅滩交错 */
function terrainYilingShore(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      if ((x + y * 2) % 6 < 2 && y >= Math.floor(h * 0.22) && y <= Math.floor(h * 0.72)) t = "forest";
      if ((x * 3 + y) % 8 < 3 && y >= Math.floor(h * 0.35) && y <= Math.floor(h * 0.55) && x >= Math.floor(w * 0.35))
        t = "forest";
      if (y >= h - 2 && x >= Math.floor(w * 0.18) && x <= Math.floor(w * 0.58)) t = "water";
      if (y >= h - 3 && x >= Math.floor(w * 0.62) && x <= Math.floor(w * 0.88)) t = "water";
      if (x <= Math.floor(w * 0.08)) t = "mountain";
      if (x >= Math.floor(w * 0.92) && y <= Math.floor(h * 0.4)) t = "mountain";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

/** 祁山：陇右起伏，浅溪切分战场 */
function terrainQishan(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      if (y >= Math.floor(h * 0.45)) t = "desert";
      if (x <= Math.floor(w * 0.12) && y <= Math.floor(h * 0.5)) t = "mountain";
      if (y === Math.floor(h * 0.32) && x >= Math.floor(w * 0.28) && x <= Math.floor(w * 0.72)) t = "water";
      if (y === Math.floor(h * 0.48) && x >= Math.floor(w * 0.55) && x <= Math.floor(w * 0.9)) t = "water";
      if (x >= Math.floor(w * 0.72) && y <= Math.floor(h * 0.35)) t = "forest";
      if (t === "plain" && y < Math.floor(h * 0.42) && x > w * 0.25 && x < w * 0.55 && (x + y) % 9 === 0) t = "forest";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

function terrainXuzhouSiege(w: number, h: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < w; x++) {
      let t: Terrain = "plain";
      if (x >= Math.floor(w * 0.35) && x <= Math.floor(w * 0.65) && y <= Math.floor(h * 0.35)) t = "forest";
      if (x >= Math.floor(w * 0.08) && x <= Math.floor(w * 0.28) && y >= Math.floor(h * 0.12) && y <= Math.floor(h * 0.42))
        t = "forest";
      if (y === Math.floor(h * 0.55) && x >= Math.floor(w * 0.2) && x <= Math.floor(w * 0.8)) t = "water";
      if (y === Math.floor(h * 0.48) && x >= Math.floor(w * 0.62) && x <= Math.floor(w * 0.92)) t = "water";
      if (y >= Math.floor(h * 0.75)) t = "desert";
      if (t === "plain" && y > h * 0.6 && y < h - 1 && (x + y * 2) % 12 === 0) t = "mountain";
      row.push(t);
    }
    rows.push(row);
  }
  addCityWallRow(rows, Math.floor(h * 0.42), Math.floor(w / 2));
  return rows;
}

function playerRoster(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): Unit[] {
  const p1M = clampMight(72);
  const p2M = clampMight(98);
  const p3M = clampMight(99);
  const h1 = maxHpForLevel(1);
  return [
    {
      id: "p1",
      name: "刘备",
      side: "player",
      x: p1.x,
      y: p1.y,
      hp: h1,
      maxHp: h1,
      level: 1,
      exp: 0,
      might: p1M,
      intel: 72,
      defense: defensePowerForUnit(p1M, 1, "infantry"),
      armyType: "ping",
      troopKind: "infantry",
      tacticMax: tacticMaxForUnit(72, 1),
      tacticPoints: tacticMaxForUnit(72, 1),
      move: movePointsForTroop("infantry"),
      moved: false,
      acted: false,
      portraitCatalogId: "liu_bei",
    },
    {
      id: "p2",
      name: "关羽",
      side: "player",
      x: p2.x,
      y: p2.y,
      hp: h1,
      maxHp: h1,
      level: 1,
      exp: 0,
      might: p2M,
      intel: 68,
      defense: defensePowerForUnit(p2M, 1, "cavalry"),
      armyType: "ping",
      troopKind: "cavalry",
      tacticMax: tacticMaxForUnit(68, 1),
      tacticPoints: tacticMaxForUnit(68, 1),
      move: movePointsForTroop("cavalry"),
      moved: false,
      acted: false,
      portraitCatalogId: "guan_yu",
    },
    {
      id: "p3",
      name: "张飞",
      side: "player",
      x: p3.x,
      y: p3.y,
      hp: h1,
      maxHp: h1,
      level: 1,
      exp: 0,
      might: p3M,
      intel: 38,
      defense: defensePowerForUnit(p3M, 1, "archer"),
      armyType: "shan",
      troopKind: "archer",
      tacticMax: tacticMaxForUnit(38, 1),
      tacticPoints: tacticMaxForUnit(38, 1),
      move: movePointsForTroop("archer"),
      moved: false,
      acted: false,
      portraitCatalogId: "zhang_fei",
    },
  ];
}

/** 我军底部出生点，3–6 将横向排开（宽图自动夹紧在可行走列内） */
function playerSlotsBottom(w: number, h: number, count: 3 | 4 | 5 | 6): { x: number; y: number }[] {
  const y = Math.max(2, h - 2);
  const mid = Math.floor(w / 2);
  const cx = (x: number) => Math.max(2, Math.min(w - 3, x));
  if (count === 3) {
    return [{ x: cx(mid - 5), y }, { x: cx(mid), y }, { x: cx(mid + 5), y }];
  }
  if (count === 4) {
    return [{ x: cx(mid - 6), y }, { x: cx(mid - 2), y }, { x: cx(mid + 2), y }, { x: cx(mid + 6), y }];
  }
  if (count === 5) {
    return [
      { x: cx(mid - 8), y },
      { x: cx(mid - 4), y },
      { x: cx(mid), y },
      { x: cx(mid + 4), y },
      { x: cx(mid + 8), y },
    ];
  }
  return [
    { x: cx(mid - 9), y },
    { x: cx(mid - 5), y },
    { x: cx(mid - 2), y },
    { x: cx(mid + 2), y },
    { x: cx(mid + 5), y },
    { x: cx(mid + 9), y },
  ];
}

function allyJoinLevel(tier: number): number {
  return clampUnitLevel(Math.min(99, 2 + Math.max(0, tier)));
}

function joinerOrThrow(catalogId: string, battleId: string, pos: { x: number; y: number }, level: number): Unit {
  const u = playerJoinerFromCatalog(catalogId, battleId, pos.x, pos.y, level);
  if (!u) throw new Error(`playerJoinerFromCatalog: unknown ${catalogId}`);
  return u;
}

/** 刘备线：序章刘关张起，徐州赵云来投，小沛关平，新野孔明，赤壁庞统，入蜀魏延，汉中黄忠 */
function playersForLiuBeiScenario(scenarioId: string, w: number, h: number, tier: number): Unit[] {
  const j = allyJoinLevel(tier);
  if (scenarioId === "prologue_zhangjiao" || scenarioId === "ch1_pursuit") {
    const s = playerSlotsBottom(w, h, 3);
    return playerRoster(s[0]!, s[1]!, s[2]!);
  }
  if (scenarioId === "ch2_xuzhou") {
    const s = playerSlotsBottom(w, h, 4);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
    ];
  }
  if (scenarioId === "ch3_xiaopei") {
    const s = playerSlotsBottom(w, h, 5);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
      joinerOrThrow("guan_ping", "p5", s[4]!, j),
    ];
  }
  if (scenarioId === "ch4_xinye" || scenarioId === "ch5_changban") {
    const s = playerSlotsBottom(w, h, 6);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
      joinerOrThrow("guan_ping", "p5", s[4]!, j),
      joinerOrThrow("zhuge_liang", "p6", s[5]!, j),
    ];
  }
  if (scenarioId === "ch6_chibi") {
    const s = playerSlotsBottom(w, h, 6);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
      joinerOrThrow("pang_tong", "p5", s[4]!, j),
      joinerOrThrow("zhuge_liang", "p6", s[5]!, j),
    ];
  }
  if (scenarioId === "ch7_yizhou") {
    const s = playerSlotsBottom(w, h, 6);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
      joinerOrThrow("wei_yan", "p5", s[4]!, j),
      joinerOrThrow("zhuge_liang", "p6", s[5]!, j),
    ];
  }
  if (scenarioId === "ch8_hanzhong") {
    const s = playerSlotsBottom(w, h, 6);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
      joinerOrThrow("huang_zhong", "p5", s[4]!, j),
      joinerOrThrow("zhuge_liang", "p6", s[5]!, j),
    ];
  }
  if (scenarioId === "ch9_xiangfan") {
    const s = playerSlotsBottom(w, h, 6);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
      joinerOrThrow("ma_chao", "p5", s[4]!, j),
      joinerOrThrow("zhuge_liang", "p6", s[5]!, j),
    ];
  }
  if (scenarioId === "ch10_yiling") {
    const s = playerSlotsBottom(w, h, 6);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
      joinerOrThrow("zhou_cang", "p5", s[4]!, j),
      joinerOrThrow("zhuge_liang", "p6", s[5]!, j),
    ];
  }
  if (scenarioId === "ch11_qishan") {
    const s = playerSlotsBottom(w, h, 6);
    return [
      ...playerRoster(s[0]!, s[1]!, s[2]!),
      joinerOrThrow("zhao_yun", "p4", s[3]!, j),
      joinerOrThrow("jiang_wei", "p5", s[4]!, j),
      joinerOrThrow("zhuge_liang", "p6", s[5]!, j),
    ];
  }
  const s = playerSlotsBottom(w, h, 3);
  return playerRoster(s[0]!, s[1]!, s[2]!);
}

function grunt(
  id: string,
  name: string,
  x: number,
  y: number,
  _unusedHp: number,
  level: number,
  might: number,
  intel: number,
  troopKind: TroopKind,
  armyType: ArmyType
): Unit {
  const m = clampMight(might);
  const maxHp = maxHpForLevel(level);
  return {
    id,
    name,
    side: "enemy",
    x,
    y,
    hp: maxHp,
    maxHp,
    level,
    exp: 0,
    might: m,
    intel,
    defense: defensePowerForUnit(m, level, troopKind),
    armyType,
    troopKind,
    tacticMax: 0,
    tacticPoints: 0,
    move: movePointsForTroop(troopKind),
    moved: false,
    acted: false,
  };
}

function U(cat: string, bid: string, x: number, y: number, tier: number): Unit {
  const u = unitFromCatalog("enemy", cat, bid, x, y, tier);
  if (!u) throw new Error(`Unknown catalog: ${cat}`);
  return u;
}

type BaseMeta = {
  scenarioBrief: string;
  victoryBrief: string;
  winCondition: WinCondition;
  extraLog?: string[];
  /** 本关允许的我军回合轮数上限；省略则用关卡内默认值 */
  maxBattleRounds?: number;
};

function baseState(
  scenarioId: string,
  scenarioTitle: string,
  terrain: Terrain[][],
  units: Unit[],
  log0: string,
  meta: BaseMeta
): BattleState {
  const h = terrain.length;
  const w = terrain[0]?.length ?? 12;
  const log = [log0, ...(meta.extraLog ?? [])];
  return {
    version: 2,
    scenarioId,
    scenarioTitle,
    gridW: w,
    gridH: h,
    terrain,
    turn: "player",
    phase: "select",
    selectedId: null,
    moveTargets: [],
    units,
    log,
    outcome: "playing",
    pickTarget: null,
    playerTurnStart: {},
    enemyTurnQueue: null,
    enemyTurnCursor: 0,
    pendingMove: null,
    damagePulse: null,
    scenarioBrief: meta.scenarioBrief,
    victoryBrief: meta.victoryBrief,
    winCondition: meta.winCondition,
    battleRound: 1,
    maxBattleRounds: meta.maxBattleRounds ?? 85,
  };
}

export function buildBattleStateForScenario(scenarioId: string): BattleState {
  switch (scenarioId) {
    case "prologue_zhangjiao": {
      const w = 32;
      const h = 20;
      const t = terrainClassic(w, h);
      const tier = 0;
      return baseState(
        "prologue_zhangjiao",
        "序章 · 讨伐黄巾",
        t,
        [
          ...playersForLiuBeiScenario("prologue_zhangjiao", w, h, tier),
          U("zhang_jiao", "e_zhang_jiao", 14, 4, tier),
          U("zhang_bao", "e_zhang_bao", 20, 4, tier),
          U("zhang_liang", "e_zhang_liang", 8, 4, tier),
          grunt("e_g1", "黄巾术士", 12, 6, 62, 2, 20, 34, "archer", "shui"),
          grunt("e_g2", "黄巾刀兵", 22, 8, 68, 2, 22, 28, "infantry", "ping"),
          grunt("e_g3", "黄巾骑手", 4, 8, 58, 3, 24, 22, "cavalry", "ping"),
        ],
        "灵帝末年，张角以太平道聚众三十六万，烽火燎原。刘备随邹靖讨贼，与关羽、张飞首阵共讨黄巾。",
        {
          scenarioBrief:
            "钜鹿张角自称天公将军，弟宝、梁分统地公、人公；官军初战需挫其锋。演义此战重在义兵崛起，非一城一池之得失。",
          victoryBrief: "张角授首（或溃败），黄巾失其魁首，关东州郡得以喘息。",
          winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_zhang_jiao"] },
          extraLog: ["胜利条件：击败天公将军张角（张宝、张梁与余众可续剿，本关以张角溃败为胜）。"],
        }
      );
    }

    case "ch1_pursuit": {
      const w = 36;
      const h = 20;
      const t = terrainClassic(w, h);
      const tier = 1;
      return baseState(
        "ch1_pursuit",
        "第一章 · 洛阳溃敌",
        t,
        [
          ...playersForLiuBeiScenario("ch1_pursuit", w, h, tier),
          U("hua_xiong", "e_hua_xiong", 16, 2, tier),
          U("dong_zhuo", "e_dong_zhuo", 10, 4, tier),
          U("zhang_liao", "e_zhang_liao", 24, 4, tier),
          grunt("e_x1", "西凉铁骑", 28, 6, 72, 4, 27, 24, "cavalry", "ping"),
          grunt("e_x2", "西凉弓骑", 6, 6, 65, 4, 24, 30, "archer", "ping"),
          grunt("e_x3", "飞熊军", 20, 8, 88, 5, 29, 28, "infantry", "shan"),
          grunt("e_x4", "董府死士", 12, 8, 78, 5, 28, 32, "infantry", "ping"),
        ],
        "董卓迁都长安，西凉兵马断后；曹操发檄未至，刘备先遇华雄旧部与董军精锐，洛阳道上一战定去留。",
        {
          scenarioBrief:
            "洛阳残破，西凉军团仍控要道。敌军含华雄、董卓亲兵与张辽等名将，兵力厚于序章。",
          victoryBrief: "敌军全灭，西凉断后部队溃散。",
          winCondition: { type: "eliminate_all" },
        }
      );
    }

    case "ch2_xuzhou": {
      const w = 36;
      const h = 24;
      const t = terrainXuzhouSiege(w, h);
      const tier = 2;
      return baseState(
        "ch2_xuzhou",
        "第二章 · 徐州驰援",
        t,
        [
          ...playersForLiuBeiScenario("ch2_xuzhou", w, h, tier),
          U("cao_cao", "e_cao_cao", 18, 4, tier),
          U("xiahou_dun", "e_xiahou_dun", 24, 4, tier),
          U("zhang_liao", "e_zhang_liao2", 12, 4, tier),
          U("yu_jin", "e_yu_jin", 28, 6, tier),
          grunt("e_c1", "青州兵", 8, 8, 82, 5, 27, 26, "infantry", "ping"),
          grunt("e_c2", "曹军弩手", 32, 8, 68, 5, 25, 32, "archer", "ping"),
          grunt("e_c3", "虎豹骑斥候", 16, 8, 76, 6, 30, 24, "cavalry", "ping"),
          grunt("e_c4", "辎重营卒", 22, 10, 74, 5, 24, 22, "infantry", "ping"),
        ],
        "陶谦三让徐州前夜，曹操以父仇为名大军压境；刘备自公孙瓒处来援，小沛未立先战彭城外道。",
        {
          scenarioBrief:
            "战场开阔，河中游可迟滞骑兵。曹操本人督阵，夏侯惇、张辽、于禁分统诸部，需分路牵制。",
          victoryBrief: "击退曹军前锋，徐州暂得喘息（本关以全歼敌军为胜）。",
          winCondition: { type: "eliminate_all" },
        }
      );
    }

    case "ch3_xiaopei": {
      const w = 40;
      const h = 24;
      const t = terrainForestCore(w, h);
      addCityWallRow(t, Math.floor(h * 0.42), Math.floor(w / 2));
      const tier = 3;
      return baseState(
        "ch3_xiaopei",
        "第三章 · 小沛据守",
        t,
        [
          ...playersForLiuBeiScenario("ch3_xiaopei", w, h, tier),
          U("lu_bu", "e_lu_bu", 20, 4, tier),
          U("gao_shun", "e_gao_shun", 16, 6, tier),
          U("zhang_liao", "e_zhang_liao3", 26, 4, tier),
          grunt("e_b1", "陷阵营", 14, 8, 92, 7, 30, 26, "infantry", "shan"),
          grunt("e_b2", "并州狼骑", 30, 6, 74, 6, 29, 22, "cavalry", "ping"),
          grunt("e_b3", "方天画戟亲卫", 22, 8, 85, 7, 31, 28, "infantry", "ping"),
          grunt("e_b4", "飞将弓骑", 10, 6, 70, 6, 27, 30, "archer", "ping"),
          grunt("e_b5", "下邳援军", 34, 8, 80, 6, 28, 24, "cavalry", "shan"),
        ],
        "刘备暂驻小沛，吕布忌其得人心，陈宫劝早除后患。营栅之外密林起伏，正是步弓设伏之地。",
        {
          scenarioBrief:
            "吕布亲自冲锋，高顺陷阵营与张辽侧翼呼应。林地利于我军步兵与弓兵，骑兵须慎入深林。",
          victoryBrief: "吕布败走，小沛之围得解。",
          winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_lu_bu"] },
          extraLog: ["胜利条件：击败飞将吕布（余部可溃散不顾）。"],
        }
      );
    }

    case "ch4_xinye": {
      const w = 40;
      const h = 24;
      const t = terrainForestCore(w, h);
      const tier = 4;
      return baseState(
        "ch4_xinye",
        "第四章 · 新野初谋",
        t,
        [
          ...playersForLiuBeiScenario("ch4_xinye", w, h, tier),
          U("zhuge_liang", "e_kongming_decoy", 6, h - 3, tier),
          U("simazhao", "e_sima_zhao", 28, 4, tier),
          U("zhang_he", "e_zhang_he", 22, 6, tier),
          U("xu_huang", "e_xu_huang", 16, 6, tier),
          grunt("e_n1", "虎豹骑", 32, 4, 78, 7, 31, 22, "cavalry", "ping"),
          grunt("e_n2", "虎豹骑", 12, 4, 76, 7, 30, 22, "cavalry", "ping"),
          grunt("e_n3", "许都弩营", 24, 8, 68, 7, 25, 36, "archer", "ping"),
          grunt("e_n4", "青州射手", 18, 10, 65, 6, 24, 32, "archer", "ping"),
          grunt("e_n5", "曹军精锐", 34, 8, 90, 8, 30, 28, "infantry", "ping"),
          grunt("e_n6", "曹军司马", 10, 8, 95, 8, 29, 34, "infantry", "shan"),
        ],
        "诸葛亮新拜军师，博望未战先谋新野：曹军先锋追至，林道狭窄，正可示敌以弱、诱而分之。",
        {
          scenarioBrief:
            "（演义向）孔明初出茅庐第一策，战场以密林与浅溪分割敌军。本关敌军含张郃、徐晃与司马昭所部。",
          victoryBrief: "敌军全灭，新野军民得安。",
          winCondition: { type: "eliminate_all" },
          extraLog: [
            "注：敌军「诸葛亮」旗号实为诱敌疑兵；我军本阵军师诸葛亮随军参谋，两不相混。",
          ],
        }
      );
    }

    case "ch5_changban": {
      const w = 44;
      const h = 24;
      const t = terrainRiverRetreat(w, h);
      const tier = 5;
      return baseState(
        "ch5_changban",
        "第五章 · 长坂退敌",
        t,
        [
          ...playersForLiuBeiScenario("ch5_changban", w, h, tier),
          U("zhang_liao", "e_zhang_liao_cb", 36, 2, tier),
          U("xu_chu", "e_xu_chu", 32, 4, tier),
          U("zhang_he", "e_zhang_he2", 28, 2, tier),
          grunt("e_cb1", "虎豹骑", 40, 4, 82, 8, 32, 22, "cavalry", "ping"),
          grunt("e_cb2", "虎豹骑", 24, 4, 80, 8, 31, 22, "cavalry", "ping"),
          grunt("e_cb3", "虎豹骑", 20, 6, 78, 8, 31, 22, "cavalry", "ping"),
          grunt("e_cb4", "长坂斥候", 16, 4, 70, 7, 27, 28, "archer", "ping"),
          grunt("e_cb5", "曹军别部", 12, 6, 92, 8, 30, 30, "infantry", "ping"),
          grunt("e_cb6", "曹军偏将", 8, 4, 100, 9, 32, 36, "infantry", "shan"),
          grunt("e_cb7", "江岸弩手", 38, 8, 68, 7, 26, 32, "archer", "shui"),
          grunt("e_cb8", "江岸弩手", 14, 8, 66, 7, 25, 30, "archer", "shui"),
        ],
        "当阳道上，百姓塞路；曹军虎豹骑追及，刘备不忍弃民，关张护主且战且走。",
        {
          scenarioBrief:
            "河道横贯地图中央，非水军难渡。骑兵自两翼包抄，需利用河岸迟滞与弓兵牵制。",
          victoryBrief: "敌军全灭，百姓得续向南。",
          winCondition: { type: "eliminate_all" },
        }
      );
    }

    case "ch6_chibi": {
      const w = 44;
      const h = 28;
      const t = terrainChibiMarsh(w, h);
      const tier = 6;
      return baseState(
        "ch6_chibi",
        "第六章 · 赤壁前哨",
        t,
        [
          ...playersForLiuBeiScenario("ch6_chibi", w, h, tier),
          U("zhou_yu", "e_zhou_yu", 36, 6, tier),
          U("gan_ning", "e_gan_ning", 32, 8, tier),
          U("huang_gai", "e_huang_gai", 28, 10, tier),
          U("cao_cao", "e_cao_cao_cb", 12, 4, tier),
          U("zhang_liao", "e_zhang_liao_cb", 16, 4, tier),
          grunt("e_w1", "江东弩手", 40, 10, 72, 8, 28, 36, "archer", "shui"),
          grunt("e_w2", "连环舟卒", 22, 12, 80, 8, 28, 26, "infantry", "shui"),
          grunt("e_w3", "曹军水卒", 10, 10, 76, 8, 27, 28, "infantry", "shui"),
          grunt("e_w4", "荆州降卒", 18, 8, 82, 9, 29, 28, "archer", "ping"),
          grunt("e_w5", "楼船弓手", 26, 12, 70, 8, 27, 34, "archer", "shui"),
          grunt("e_w6", "浅滩死士", 8, 12, 88, 9, 30, 26, "infantry", "shui"),
        ],
        "孙刘结盟，周瑜程督水军；江岸前哨已与曹军水寨交锋，烟火映红半壁天。",
        {
          scenarioBrief:
            "大面积水泽，水军与弓兵占优。曹军亦有水卒与降卒，不可轻敌。",
          victoryBrief: "肃清前哨，为赤壁大战铺路。",
          winCondition: { type: "eliminate_all" },
        }
      );
    }

    case "ch7_yizhou": {
      const w = 40;
      const h = 28;
      const t = terrainMountainPass(w, h);
      const tier = 7;
      return baseState(
        "ch7_yizhou",
        "第七章 · 剑阁先声",
        t,
        [
          ...playersForLiuBeiScenario("ch7_yizhou", w, h, tier),
          U("liu_zhang", "e_liu_zhang", 8, 6, tier),
          U("yan_yan", "e_yan_yan", 16, 8, tier),
          U("zhang_ren", "e_zhang_ren", 12, 10, tier),
          grunt("e_yz1", "益州弓手", 24, 12, 76, 9, 29, 32, "archer", "shan"),
          grunt("e_yz2", "剑阁守军", 20, 10, 90, 9, 28, 28, "infantry", "shan"),
          grunt("e_yz3", "益州骑兵", 28, 14, 80, 9, 30, 24, "cavalry", "ping"),
          grunt("e_yz4", "涪城援军", 32, 8, 94, 10, 31, 28, "infantry", "shan"),
          grunt("e_yz5", "栈道甲士", 14, 12, 88, 10, 29, 26, "infantry", "shan"),
          grunt("e_yz6", "益州司马", 4, 10, 120, 11, 33, 42, "infantry", "shan"),
          grunt("e_yz7", "江油戍卒", 36, 12, 78, 9, 27, 30, "archer", "shan"),
        ],
        "入蜀必经剑阁天险，刘璋虽暗弱，麾下张任、严颜辈皆善战；先破外围，再图成都。",
        {
          scenarioBrief:
            "中央山隘狭窄，大军难以展开。宜以弓兵封谷口、步兵层层推进。",
          victoryBrief: "剑阁外垒尽拔，益州震动。",
          winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_liu_zhang"] },
          extraLog: ["胜利条件：击破刘璋本队（迫其退守成都，余众可不究）。"],
        }
      );
    }

    case "ch8_hanzhong": {
      const w = 48;
      const h = 28;
      const t = terrainHanzhong(w, h);
      const tier = 8;
      return baseState(
        "ch8_hanzhong",
        "第八章 · 定军山麓",
        t,
        [
          ...playersForLiuBeiScenario("ch8_hanzhong", w, h, tier),
          U("xiahou_dun", "e_xiahou_dun_hz", 24, 2, tier),
          U("zhang_he", "e_zhang_he_hz", 30, 4, tier),
          U("xu_huang", "e_xu_huang_hz", 18, 4, tier),
          U("si_ma_yi", "e_si_ma_yi", 14, 2, tier),
          grunt("e_hz1", "魏军骑兵", 36, 4, 86, 11, 33, 24, "cavalry", "ping"),
          grunt("e_hz2", "魏军骑兵", 40, 6, 84, 11, 32, 24, "cavalry", "shan"),
          grunt("e_hz3", "夏侯部曲", 28, 6, 94, 11, 33, 30, "infantry", "ping"),
          grunt("e_hz4", "魏武强弩", 22, 6, 76, 10, 28, 38, "archer", "ping"),
          grunt("e_hz5", "长安精兵", 10, 8, 102, 11, 32, 28, "infantry", "shan"),
          grunt("e_hz6", "魏军参军", 6, 6, 108, 11, 30, 40, "archer", "ping"),
          grunt("e_hz7", "辎重护卫", 34, 8, 88, 10, 29, 26, "infantry", "ping"),
          grunt("e_hz8", "斜谷援军", 42, 8, 92, 11, 31, 28, "cavalry", "ping"),
          grunt("e_hz9", "定军斥候", 12, 10, 72, 10, 27, 32, "archer", "ping"),
          grunt("e_hz10", "汉中垒壁", 16, 12, 96, 11, 30, 26, "infantry", "shan"),
        ],
        "刘备既得益州，曹操不敢坐视，夏侯渊、张郃屯汉中；此为定军山决战前哨，司马懿亦献策于军中。",
        {
          scenarioBrief:
            "大地图分沙地、山麓与浅溪，骑兵与弓弩齐备。敌军名将云集，等级与兵力为本线最高。",
          victoryBrief: "夏侯惇本阵被破，魏军撤出山麓，汉中归属见分晓。",
          winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_xiahou_dun_hz"] },
          extraLog: ["胜利条件：击破夏侯惇督军本阵（敌军虽众，斩其大将则全线动摇）。"],
        }
      );
    }

    case "ch9_xiangfan": {
      const w = 44;
      const h = 24;
      const t = terrainFanRiver(w, h);
      const tier = 9;
      return baseState(
        "ch9_xiangfan",
        "第九章 · 汉水樊城",
        t,
        [
          ...playersForLiuBeiScenario("ch9_xiangfan", w, h, tier),
          U("cao_ren", "e_cao_ren_xf", 20, 4, tier),
          U("yu_jin", "e_yu_jin_xf", 28, 6, tier),
          U("xu_huang", "e_xu_huang_xf", 14, 4, tier),
          U("zhang_he", "e_zhang_he_xf", 10, 6, tier),
          U("xu_chu", "e_xu_chu_xf", 34, 4, tier),
          grunt("e_xf1", "七军舟师", 24, 8, 88, 10, 30, 28, "infantry", "shui"),
          grunt("e_xf2", "樊城弩台", 16, 8, 76, 10, 27, 36, "archer", "ping"),
          grunt("e_xf3", "魏武强弩", 6, 6, 80, 10, 28, 34, "archer", "ping"),
          grunt("e_xf4", "汉水斥候", 36, 8, 72, 9, 26, 30, "cavalry", "ping"),
          grunt("e_xf5", "曹军别部", 30, 10, 96, 11, 31, 28, "infantry", "shan"),
          grunt("e_xf6", "辎重营卒", 12, 10, 84, 10, 26, 24, "infantry", "ping"),
        ],
        "关羽北伐威震华夏，曹仁固守樊城，于禁督七军来援；汉水暴涨，正是水战与岸炮相持之地。",
        {
          scenarioBrief:
            "河道纵贯中央，水军与弓兵可封浅滩。曹仁、于禁、徐晃、张郃、许褚分督诸部，宜先断其两翼再逼中军。",
          victoryBrief: "七军溃散，樊城外援断绝（本关以全歼敌军为胜）。",
          winCondition: { type: "eliminate_all" },
          maxBattleRounds: 95,
        }
      );
    }

    case "ch10_yiling": {
      const w = 44;
      const h = 28;
      const t = terrainYilingShore(w, h);
      const tier = 10;
      return baseState(
        "ch10_yiling",
        "第十章 · 夷陵复仇",
        t,
        [
          ...playersForLiuBeiScenario("ch10_yiling", w, h, tier),
          U("lu_xun", "e_lu_xun_yi", 32, 6, tier),
          U("lu_meng", "e_lu_meng_yi", 24, 8, tier),
          U("gan_ning", "e_gan_ning_yi", 36, 8, tier),
          U("ling_tong", "e_ling_tong_yi", 28, 10, tier),
          U("sun_quan", "e_sun_quan_yi", 16, 4, tier),
          grunt("e_yi1", "江东水军", 40, 12, 82, 11, 29, 32, "infantry", "shui"),
          grunt("e_yi2", "吴军强弩", 20, 10, 76, 11, 28, 38, "archer", "shui"),
          grunt("e_yi3", "夷陵刀盾", 12, 12, 92, 12, 31, 28, "infantry", "ping"),
          grunt("e_yi4", "江岸弓骑", 8, 8, 78, 11, 27, 30, "cavalry", "ping"),
          grunt("e_yi5", "连营斥候", 38, 10, 70, 10, 26, 32, "archer", "shan"),
          grunt("e_yi6", "吴军司马", 14, 14, 100, 12, 30, 36, "infantry", "shan"),
        ],
        "关羽既殁，刘备倾国东征；陆逊坚守夷陵，火攻连营之势已成，此战关乎国运与军心。",
        {
          scenarioBrief:
            "岸滩与林带交错，弓兵与步兵可层层设防。敌军以陆逊为核心，甘宁、凌统等骁将侧翼游弋，不可冒进。",
          victoryBrief: "吴军全灭，东征军夺还战场主动（演义向：以全歼敌军为胜）。",
          winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_lu_xun_yi"] },
          extraLog: ["胜利条件：击破吴军大都督陆逊本阵（余众可溃）。"],
          maxBattleRounds: 100,
        }
      );
    }

    case "ch11_qishan": {
      const w = 48;
      const h = 28;
      const t = terrainQishan(w, h);
      const tier = 11;
      return baseState(
        "ch11_qishan",
        "第十一章 · 祁山北伐",
        t,
        [
          ...playersForLiuBeiScenario("ch11_qishan", w, h, tier),
          U("si_ma_yi", "e_si_ma_yi_qs", 16, 4, tier),
          U("zhang_he", "e_zhang_he_qs", 28, 4, tier),
          U("xu_huang", "e_xu_huang_qs", 22, 6, tier),
          U("dian_wei", "e_dian_wei_qs", 12, 6, tier),
          U("cao_ren", "e_cao_ren_qs", 36, 4, tier),
          grunt("e_qs1", "魏军铁骑", 40, 6, 90, 12, 32, 24, "cavalry", "ping"),
          grunt("e_qs2", "祁山弩阵", 32, 8, 78, 12, 28, 40, "archer", "ping"),
          grunt("e_qs3", "陇右甲士", 24, 10, 102, 13, 32, 30, "infantry", "shan"),
          grunt("e_qs4", "魏军参军", 8, 8, 88, 12, 30, 34, "archer", "ping"),
          grunt("e_qs5", "斜谷辎重", 42, 10, 86, 12, 29, 26, "infantry", "ping"),
          grunt("e_qs6", "长安精骑", 6, 6, 94, 12, 31, 28, "cavalry", "ping"),
          grunt("e_qs7", "寨栅守卒", 18, 12, 96, 13, 30, 28, "infantry", "shan"),
        ],
        "诸葛亮再上祁山，司马懿深沟高垒；姜维新降，正是锐气可用之时。",
        {
          scenarioBrief:
            "沙地与浅溪分割战场，骑兵与弓弩齐备。司马懿与张郃、徐晃诸部互为掎角，宜分兵牵制、寻机破其中军。",
          victoryBrief: "魏军全灭，祁山前哨得定（本关以全歼敌军为胜）。",
          winCondition: { type: "eliminate_all" },
          maxBattleRounds: 105,
        }
      );
    }

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
