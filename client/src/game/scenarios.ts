/**
 * 刘备线关卡：可变大地图、演义背景提要、胜利条件与名将图鉴单位。
 * 关卡顺序与每关 meta / 敌军布置见 `liuBeiCampaign.ts`，本文件负责地形生成与战场拼装。
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
import { buildOpeningBattleScript } from "./battleScript";
import {
  SCENARIO_ORDER,
  type CampaignEnemyRow,
  type CampaignTerrainKind,
  type ScenarioId,
  getLiuBeiScenarioBody,
} from "./liuBeiCampaign";

export { SCENARIO_ORDER };
export type { ScenarioId };

export function getNextScenarioId(currentId: string): string | null {
  const idx = SCENARIO_ORDER.indexOf(currentId as ScenarioId);
  if (idx < 0 || idx >= SCENARIO_ORDER.length - 1) return null;
  return SCENARIO_ORDER[idx + 1];
}

const spawnOccupancyKey = (x: number, y: number) => `${x},${y}`;

/** 不可作为出生点的地形（水、城墙、城门格） */
export function isBlockedSpawnTerrain(t: Terrain): boolean {
  return t === "water" || t === "wall" || t === "gate";
}

function bfsNearestValidSpawn(
  terrain: Terrain[][],
  w: number,
  h: number,
  sx: number,
  sy: number,
  taken: Set<string>
): { x: number; y: number } | null {
  const q: [number, number][] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = spawnOccupancyKey(x, y);
    if (seen.has(k)) return;
    seen.add(k);
    q.push([x, y]);
  };
  push(sx, sy);
  for (let qi = 0; qi < q.length; qi++) {
    const [x, y] = q[qi]!;
    const k = spawnOccupancyKey(x, y);
    const cell = terrain[y]?.[x] ?? "plain";
    if (!isBlockedSpawnTerrain(cell) && !taken.has(k)) {
      return { x, y };
    }
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return null;
}

/**
 * 将落在水/墙/城门格的单位挪到最近的合法陆地空位（按数组顺序，避免重叠）。
 * 仅用于关卡拼装时的初始站位修正。
 */
export function sanitizeUnitSpawnPositions(terrain: Terrain[][], units: readonly Unit[]): Unit[] {
  const h = terrain.length;
  const w = terrain[0]?.length ?? 0;
  if (w <= 0 || h <= 0) return [...units];
  const taken = new Set<string>();
  for (const u of units) {
    taken.add(spawnOccupancyKey(u.x, u.y));
  }
  return units.map((u) => {
    const cell = terrain[u.y]?.[u.x] ?? "plain";
    if (!isBlockedSpawnTerrain(cell)) return u;
    const k0 = spawnOccupancyKey(u.x, u.y);
    taken.delete(k0);
    const found = bfsNearestValidSpawn(terrain, w, h, u.x, u.y, taken);
    if (!found) {
      taken.add(k0);
      return u;
    }
    taken.add(spawnOccupancyKey(found.x, found.y));
    return { ...u, x: found.x, y: found.y };
  });
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

/**
 * 东西向木桥：铺在一条横线上，便于跨过「纵向水道」（水占窄列、沿南北延伸）。
 */
function paintBridgeHorizontalRow(rows: Terrain[][], y: number, x0: number, x1: number): void {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (!w || y < 0 || y >= h) return;
  const lo = Math.max(0, Math.min(x0, x1));
  const hi = Math.min(w - 1, Math.max(x0, x1));
  const row = rows[y];
  if (!row) return;
  for (let x = lo; x <= hi; x++) {
    if (row[x] === "water") row[x] = "bridge_horizontal";
  }
}

/**
 * 南北向木桥：铺在一条竖线上，便于跨过「横向水道」（水占窄行、沿东西延伸）——与常见「过河」一致。
 */
function paintBridgeVerticalCol(rows: Terrain[][], x: number, y0: number, y1: number): void {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (!w || x < 0 || x >= w) return;
  const lo = Math.max(0, Math.min(y0, y1));
  const hi = Math.min(h - 1, Math.max(y0, y1));
  for (let y = lo; y <= hi; y++) {
    const row = rows[y];
    if (row?.[x] === "water") row[x] = "bridge_vertical";
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
  const wy = Math.floor(h * 0.62);
  paintBridgeVerticalCol(rows, Math.floor(w * 0.4), wy, wy);
  paintBridgeVerticalCol(rows, Math.floor(w * 0.55), wy, wy);
  const wy2 = Math.floor(h * 0.36);
  paintBridgeVerticalCol(rows, Math.floor(w * 0.68), wy2, wy2 + 1);
  paintBridgeVerticalCol(rows, Math.floor(w * 0.78), wy2, wy2 + 1);
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
  paintBridgeVerticalCol(rows, Math.floor(w * 0.45), h - 2, h - 1);
  paintBridgeVerticalCol(rows, Math.floor(w * 0.52), h - 2, h - 1);
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
  paintBridgeVerticalCol(rows, Math.floor(w * 0.5), 1, h - 2);
  paintBridgeVerticalCol(rows, Math.floor(w * 0.33), 1, h - 2);
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
  paintBridgeVerticalCol(rows, Math.floor(w * 0.5), h - 2, h - 1);
  paintBridgeHorizontalRow(rows, Math.floor(h * 0.45), Math.floor(w * 0.32), Math.floor(w * 0.68));
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
  paintBridgeHorizontalRow(rows, Math.floor(h * 0.58), Math.floor(w * 0.27), Math.floor(w * 0.36));
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
  paintBridgeVerticalCol(rows, Math.floor(w * 0.5), Math.floor(h * 0.28), Math.floor(h * 0.28));
  paintBridgeVerticalCol(rows, Math.floor(w * 0.22), Math.floor(h * 0.38), Math.floor(h * 0.42));
  paintBridgeVerticalCol(rows, Math.floor(w * 0.32), Math.floor(h * 0.38), Math.floor(h * 0.42));
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
  const yyB = Math.floor(h * 0.5);
  const widenB = yyB % 5 === 0 ? 1 : 0;
  paintBridgeHorizontalRow(rows, yyB, riverL - widenB, riverR + widenB);
  const yyB2 = Math.floor(h * 0.72);
  const widenB2 = yyB2 % 5 === 0 ? 1 : 0;
  paintBridgeHorizontalRow(rows, yyB2, riverL - widenB2, riverR + widenB2);
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
  paintBridgeVerticalCol(rows, Math.floor(w * 0.38), h - 3, h - 1);
  paintBridgeVerticalCol(rows, Math.floor(w * 0.74), h - 4, h - 2);
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
  paintBridgeVerticalCol(rows, Math.floor(w * 0.45), Math.floor(h * 0.32), Math.floor(h * 0.32));
  paintBridgeVerticalCol(rows, Math.floor(w * 0.55), Math.floor(h * 0.32), Math.floor(h * 0.32));
  paintBridgeVerticalCol(rows, Math.floor(w * 0.72), Math.floor(h * 0.48), Math.floor(h * 0.48));
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
  paintBridgeVerticalCol(rows, Math.floor(w * 0.48), Math.floor(h * 0.55), Math.floor(h * 0.55));
  paintBridgeVerticalCol(rows, Math.floor(w * 0.58), Math.floor(h * 0.55), Math.floor(h * 0.55));
  paintBridgeVerticalCol(rows, Math.floor(w * 0.76), Math.floor(h * 0.48), Math.floor(h * 0.48));
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

function compileCampaignEnemies(rows: readonly CampaignEnemyRow[], tier: number): Unit[] {
  return rows.map((row) => {
    if (row[0] === "U") {
      return U(row[1], row[2], row[3], row[4], tier);
    }
    return grunt(row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10]);
  });
}

function layoutCampaignTerrain(
  kind: CampaignTerrainKind,
  w: number,
  h: number,
  scenarioId: string
): Terrain[][] {
  if (scenarioId === "ch3_xiaopei") {
    const t = terrainForestCore(w, h);
    addCityWallRow(t, Math.floor(h * 0.42), Math.floor(w / 2));
    return t;
  }
  switch (kind) {
    case "classic":
      return terrainClassic(w, h);
    case "open":
      return terrainOpenPlains(w, h);
    case "forest":
      return terrainForestCore(w, h);
    case "river":
      return terrainRiverRetreat(w, h);
    case "chibi":
      return terrainChibiMarsh(w, h);
    case "pass":
      return terrainMountainPass(w, h);
    case "hanzhong":
      return terrainHanzhong(w, h);
    case "fan":
      return terrainFanRiver(w, h);
    case "yiling":
      return terrainYilingShore(w, h);
    case "qishan":
      return terrainQishan(w, h);
    case "xuzhou":
      return terrainXuzhouSiege(w, h);
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function playersFromExtras(w: number, h: number, tier: number, extras: readonly string[]): Unit[] {
  const n = 3 + Math.min(3, extras.length);
  const slots = playerSlotsBottom(w, h, n as 3 | 4 | 5 | 6);
  const core = playerRoster(slots[0]!, slots[1]!, slots[2]!);
  const lv = allyJoinLevel(tier);
  const tail = extras.slice(0, 3).map((cat, i) => joinerOrThrow(cat, `p${4 + i}`, slots[3 + i]!, lv));
  return [...core, ...tail];
}

function playersNorthernTeam(w: number, h: number, tier: number, catalogs: readonly string[]): Unit[] {
  const c = Math.min(6, Math.max(3, catalogs.length)) as 3 | 4 | 5 | 6;
  const slots = playerSlotsBottom(w, h, c);
  const lv = allyJoinLevel(tier);
  return catalogs.slice(0, c).map((cat, i) => joinerOrThrow(cat, `p${i + 1}`, slots[i]!, lv));
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
    battleScript: null,
  };
}

export function buildBattleStateForScenario(scenarioId: string): BattleState {
  const idx = SCENARIO_ORDER.indexOf(scenarioId as ScenarioId);
  if (idx < 0) return buildBattleStateForScenario(SCENARIO_ORDER[0]!);
  const body = getLiuBeiScenarioBody(scenarioId as ScenarioId);
  const tier = idx;
  const { w, h, terrain, title, openingLog, scenarioBrief, victoryBrief, winCondition } = body;
  const terrainGrid = layoutCampaignTerrain(terrain, w, h, scenarioId);
  const players = body.northernTeam?.length
    ? playersNorthernTeam(w, h, tier, body.northernTeam)
    : playersFromExtras(w, h, tier, body.allyExtras);
  const enemies = compileCampaignEnemies(body.enemies, tier);
  const placed = sanitizeUnitSpawnPositions(terrainGrid, [...players, ...enemies]);
  const base = baseState(
    scenarioId,
    title,
    terrainGrid,
    placed,
    openingLog,
    {
      scenarioBrief,
      victoryBrief,
      winCondition,
      maxBattleRounds: body.maxBattleRounds,
      extraLog: body.extraLog,
    }
  );
  const opening = buildOpeningBattleScript(scenarioId, title, victoryBrief, base.units);
  return opening ? { ...base, battleScript: opening } : base;
}

/** 秘籍选关面板用：全部关卡 id 与标题 */
export function listScenarioEntries(): { id: ScenarioId; title: string }[] {
  return SCENARIO_ORDER.map((id) => ({
    id,
    title: buildBattleStateForScenario(id).scenarioTitle,
  }));
}
