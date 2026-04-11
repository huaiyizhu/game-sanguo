import type {
  ArmyType,
  BattleState,
  PendingMove,
  PickTargetState,
  PlayerTurnStartMap,
  Side,
  TacticKind,
  Terrain,
  Unit,
  WinCondition,
} from "./types";
import {
  ARCHER_ATTACK_RANGE,
  attackPowerOnTerrain,
  clampMight,
  clampUnitLevel,
  defensePowerForUnit,
  defensePowerOnTerrain,
  expToNextLevel,
  isArmyPreferredTerrain,
  isTroopKind,
  maxHpForLevel,
  MAX_UNIT_LEVEL,
  movePointsForTroop,
  normalizeTerrainCell,
  PREFERRED_TERRAIN_ATK_MUL,
  TACTIC_DEF,
  tacticMaxForUnit,
  TROOP_ATK_ADVANTAGE_MUL,
  TROOP_ATTACK_COUNTERS,
  TROOP_DEF_ADVANTAGE_BONUS,
  TROOP_DEFENSE_COUNTERS,
} from "./types";
import {
  SCENARIO_ORDER,
  buildBattleStateForScenario,
  createDefaultTerrain,
  getNextScenarioId,
} from "./scenarios";

const key = (x: number, y: number) => `${x},${y}`;

let nextDamagePulseKey = 1;

function attachDamagePulse(
  state: BattleState,
  unitId: string,
  amount: number,
  hpBefore: number,
  kind: "melee" | "tactic"
): BattleState {
  return {
    ...state,
    damagePulse: { unitId, amount, key: nextDamagePulseKey++, hpBefore, kind },
  };
}

/** 扣血飘字：进攻后先等这段时间再出现数字（须与 GameBattle 一致） */
export const DAMAGE_FLOAT_DELAY_MS = 400;
/** 扣血飘字 CSS 动画时长（须与 index.css `.dmg-float` 一致） */
export const DAMAGE_FLOAT_ANIM_MS = 1200;

/** 回合转场字幕时长（毫秒），须与 CSS 中字幕动画时长一致 */
export const TURN_PHASE_BANNER_MS = 1000;

/**
 * 与扣血飘字总时长对齐，以便先播完受击飘字再出回合字幕（见 GameBattle、index.css）。
 */
export const POST_ACTION_TURN_BANNER_DELAY_MS =
  DAMAGE_FLOAT_DELAY_MS + DAMAGE_FLOAT_ANIM_MS + 280;

/**
 * 与 `index.css` 中 `.unit-standee.unit-move-slide` 的 `animation-duration` 一致（毫秒）。
 * 改动画时长时须同步改此处与下方步进间隔。
 */
export const MOVE_SLIDE_DURATION_MS = 240;

/**
 * 沿路逐格移动时每格间隔（毫秒），供 GamePage 定时器使用。
 * 须明显大于 MOVE_SLIDE_DURATION_MS，避免下一格逻辑开始时上一格滑动动画未完成造成叠跳。
 */
export const MOVE_STEP_MS_PLAYER = MOVE_SLIDE_DURATION_MS + 50;
export const MOVE_STEP_MS_ENEMY = MOVE_SLIDE_DURATION_MS + 72;

function terrainAt(state: BattleState, x: number, y: number): Terrain {
  const row = state.terrain[y];
  return row?.[x] ?? "plain";
}

/** 走入该格消耗的移动力；Infinity 表示不可进入 */
export function stepCostForUnit(u: Unit, t: Terrain): number {
  if (t === "wall") return Infinity;
  if (t === "gate") return 1;
  if (t === "water") return u.armyType === "shui" ? 1 : Infinity;
  if (t === "mountain") return u.armyType === "shan" ? 1 : 2;
  return 1;
}

function occupantMap(units: Unit[]): Map<string, Unit> {
  const m = new Map<string, Unit>();
  for (const u of units) {
    if (u.hp > 0) m.set(key(u.x, u.y), u);
  }
  return m;
}

export function effectiveAttackPowerOnTerrain(state: BattleState, u: Unit): number {
  const t = terrainAt(state, u.x, u.y);
  return attackPowerOnTerrain(u.might, u.level, u.troopKind, u.armyType, t);
}

function effectiveIntelOnTerrain(state: BattleState, u: Unit): number {
  let v = u.intel;
  const t = terrainAt(state, u.x, u.y);
  if (isArmyPreferredTerrain(u.armyType, t)) v = Math.floor(v * PREFERRED_TERRAIN_ATK_MUL);
  return v;
}

export function effectiveDefenseOnTerrain(state: BattleState, u: Unit): number {
  const t = terrainAt(state, u.x, u.y);
  return defensePowerOnTerrain(u.might, u.level, u.troopKind, u.armyType, t);
}

function meleeDamageDealt(state: BattleState, attacker: Unit, target: Unit): number {
  let atk = effectiveAttackPowerOnTerrain(state, attacker);
  let def = effectiveDefenseOnTerrain(state, target);
  if (TROOP_ATTACK_COUNTERS[attacker.troopKind] === target.troopKind) {
    atk = Math.floor(atk * TROOP_ATK_ADVANTAGE_MUL);
  }
  if (TROOP_DEFENSE_COUNTERS[attacker.troopKind] === target.troopKind) {
    def += TROOP_DEF_ADVANTAGE_BONUS;
  }
  return Math.max(1, atk - def);
}

function tacticDamageDealt(
  state: BattleState,
  attacker: Unit,
  target: Unit,
  tacticKind: TacticKind
): number {
  const intl = effectiveIntelOnTerrain(state, attacker);
  let raw = Math.max(1, Math.floor(intl * 0.55 * TACTIC_DEF[tacticKind].dmgMul));
  const defPart = Math.floor(effectiveDefenseOnTerrain(state, target) * 0.45);
  return Math.max(1, raw - defPart);
}

function terrainCombatHint(state: BattleState, atk: Unit, def: Unit): string {
  const a = isArmyPreferredTerrain(atk.armyType, terrainAt(state, atk.x, atk.y));
  const d = isArmyPreferredTerrain(def.armyType, terrainAt(state, def.x, def.y));
  if (a && d) return "（双方地利）";
  if (a) return "（攻方地利）";
  if (d) return "（守方地利）";
  return "";
}

function troopCombatHint(attacker: Unit, defender: Unit): string {
  const bits: string[] = [];
  if (TROOP_ATTACK_COUNTERS[attacker.troopKind] === defender.troopKind) bits.push("克");
  if (TROOP_DEFENSE_COUNTERS[attacker.troopKind] === defender.troopKind) bits.push("守克");
  if (bits.length === 0) return "";
  return `（兵种${bits.join("·")}）`;
}

function combatHints(state: BattleState, atk: Unit, def: Unit): string {
  return `${terrainCombatHint(state, atk, def)}${troopCombatHint(atk, def)}`.trim();
}

function xpForDamage(
  damage: number,
  killed: boolean,
  attackerLevel: number,
  targetLevel: number
): number {
  const diff = targetLevel - attackerLevel;
  let mult = 1 + diff * 0.1;
  mult = Math.max(0.42, Math.min(2.1, mult));
  let base = damage * 0.52;
  if (killed) base += 24 + targetLevel * 5;
  return Math.max(1, Math.floor(base * mult));
}

const TACTIC_BONUS_ON_LEVELUP = 5;

/** 升一级时的属性增量（经验不变） */
function applyOneLevelToUnit(u: Unit): Unit {
  if (u.level >= MAX_UNIT_LEVEL) return u;
  const level = u.level + 1;
  const maxHp = maxHpForLevel(level);
  const hpGain = maxHp - u.maxHp;
  const hp = Math.min(maxHp, u.hp + Math.max(0, hpGain));
  const defense = defensePowerForUnit(u.might, level, u.troopKind);
  const tacticMax = tacticMaxForUnit(u.intel, level);
  const tacticPoints = Math.min(tacticMax, u.tacticPoints + TACTIC_BONUS_ON_LEVELUP);
  return { ...u, level, maxHp, hp, defense, tacticMax, tacticPoints };
}

/** 秘籍：指定存活单位立即升一级（不改经验），战报追加一行 */
export function cheatInstantLevelUp(state: BattleState, unitId: string): BattleState {
  const u = state.units.find((x) => x.id === unitId);
  if (!u || u.hp <= 0) return state;
  if (u.level >= MAX_UNIT_LEVEL) {
    return {
      ...state,
      log: [...state.log, `${u.name}已达最高等级（${MAX_UNIT_LEVEL} 级），无法再升（秘籍）。`],
    };
  }
  const leveled = applyOneLevelToUnit(u);
  return {
    ...state,
    units: state.units.map((x) => (x.id === unitId ? leveled : x)),
    log: [...state.log, `${leveled.name}级别上升为${leveled.level}（秘籍）`],
  };
}

/** 我军获得经验并可能升级（仅修改武将自身字段） */
function applyExpAndLevelUps(u: Unit, gain: number, logOut: string[]): Unit {
  if (u.side !== "player" || gain <= 0) return u;
  let next = { ...u, exp: u.exp + gain };
  logOut.push(`${u.name} 获得 ${gain} 点经验。`);
  for (;;) {
    if (next.level >= MAX_UNIT_LEVEL) break;
    const need = expToNextLevel(next.level);
    if (next.exp < need) break;
    next.exp -= need;
    const prevMax = next.maxHp;
    next = applyOneLevelToUnit(next);
    const dHp = next.maxHp - prevMax;
    logOut.push(
      `${next.name}级别上升为${next.level}（兵力上限+${dHp}、攻防随等级与兵种重算、计策上限提升）`
    );
  }
  return next;
}

function buildPlayerTurnStart(units: Unit[]): PlayerTurnStartMap {
  const playerTurnStart: PlayerTurnStartMap = {};
  for (const u of units) {
    if (u.side === "player" && u.hp > 0) {
      playerTurnStart[u.id] = {
        x: u.x,
        y: u.y,
        moved: u.moved,
        acted: u.acted,
        hp: u.hp,
        maxHp: u.maxHp,
        level: u.level,
        exp: u.exp,
        defense: u.defense,
        tacticPoints: u.tacticPoints,
        tacticMax: u.tacticMax,
      };
    }
  }
  return playerTurnStart;
}

function withTurnSnapshot(state: BattleState): BattleState {
  return { ...state, playerTurnStart: buildPlayerTurnStart(state.units) };
}

/** 关卡顺序；最后一关胜利后回到序章 */
export const SCENARIO_IDS = SCENARIO_ORDER;
export { getNextScenarioId };

/** 新建指定关卡（我军为默认数值，用于新游戏/读档兜底） */
export function createBattleForScenario(scenarioId: string): BattleState {
  return withTurnSnapshot(buildBattleStateForScenario(scenarioId));
}

export function createInitialBattle(): BattleState {
  return createBattleForScenario(SCENARIO_IDS[0]);
}

/** 胜利后进入下一关：继承上一关存活我军（回满兵力、回满计策）；无下一关则回到序章 */
export function createNextBattleAfterVictory(prev: BattleState): BattleState {
  const nextId = getNextScenarioId(prev.scenarioId);
  const carried = prev.units.filter((u) => u.side === "player" && u.hp > 0);
  const template = createBattleForScenario(nextId ?? SCENARIO_IDS[0]);
  if (!nextId) {
    return template;
  }
  return withTurnSnapshot(mergeCarriedPlayers(template, carried));
}

function mergeCarriedPlayers(template: BattleState, carried: Unit[]): BattleState {
  const carriedById = new Map(carried.map((u) => [u.id, u]));
  const units = template.units.map((u) => {
    if (u.side !== "player") return u;
    const c = carriedById.get(u.id);
    if (!c) return u;
    const level = clampUnitLevel(c.level);
    const maxHp = maxHpForLevel(level);
    const tm = tacticMaxForUnit(c.intel, level);
    return {
      ...u,
      hp: maxHp,
      maxHp,
      level,
      exp: c.exp,
      might: clampMight(c.might),
      intel: c.intel,
      defense: defensePowerForUnit(c.might, level, c.troopKind),
      armyType: c.armyType,
      troopKind: c.troopKind,
      move: movePointsForTroop(c.troopKind),
      tacticMax: tm,
      tacticPoints: tm,
      moved: false,
      acted: false,
    };
  });
  return { ...template, units };
}

function alive(units: Unit[], side: Side) {
  return units.filter((u) => u.side === side && u.hp > 0);
}

function defaultWinCondition(): WinCondition {
  return { type: "eliminate_all" };
}

function normalizeWinCondition(raw: unknown): WinCondition {
  if (!raw || typeof raw !== "object") return defaultWinCondition();
  const o = raw as Record<string, unknown>;
  if (
    o.type === "eliminate_marked_enemies" &&
    Array.isArray(o.unitIds) &&
    o.unitIds.length > 0 &&
    o.unitIds.every((id) => typeof id === "string")
  ) {
    return { type: "eliminate_marked_enemies", unitIds: o.unitIds as string[] };
  }
  return defaultWinCondition();
}

function enemyWinSatisfied(state: BattleState, enemies: Unit[]): boolean {
  const wc = state.winCondition ?? defaultWinCondition();
  if (wc.type === "eliminate_all") return enemies.length === 0;
  return wc.unitIds.every((id) => !enemies.some((u) => u.id === id));
}

function victoryLogLine(state: BattleState): string {
  const brief = state.victoryBrief?.trim();
  if (brief) return brief;
  const wc = state.winCondition ?? defaultWinCondition();
  if (wc.type === "eliminate_marked_enemies") return "目标达成，战斗胜利！";
  return "敌军全灭，战斗胜利！";
}

function checkOutcome(state: BattleState): BattleState {
  const enemies = alive(state.units, "enemy");
  if (enemyWinSatisfied(state, enemies)) {
    return {
      ...state,
      outcome: "won",
      turn: "player",
      phase: "select",
      selectedId: null,
      moveTargets: [],
      pickTarget: null,
      enemyTurnQueue: null,
      enemyTurnCursor: 0,
      pendingMove: null,
      damagePulse: null,
      log: [...state.log, victoryLogLine(state)],
    };
  }
  if (alive(state.units, "player").length === 0) {
    return {
      ...state,
      outcome: "lost",
      turn: "player",
      phase: "select",
      selectedId: null,
      moveTargets: [],
      pickTarget: null,
      enemyTurnQueue: null,
      enemyTurnCursor: 0,
      pendingMove: null,
      damagePulse: null,
      log: [...state.log, "我方全部阵亡"],
    };
  }
  return state;
}

function dijkstraReachableData(
  u: Unit,
  units: Unit[],
  state: BattleState
): { reachable: Set<string>; parent: Map<string, string> } {
  const { gridW, gridH } = state;
  const occ = occupantMap(units);
  occ.delete(key(u.x, u.y));
  const start = key(u.x, u.y);
  const dist = new Map<string, number>();
  const parent = new Map<string, string>();
  dist.set(start, 0);
  const heap: { k: string; d: number }[] = [{ k: start, d: 0 }];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];

  const push = (k: string, d: number) => {
    heap.push({ k, d });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].d <= heap[i].d) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };

  const pop = () => {
    if (heap.length === 0) return null;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let sm = i;
        if (l < heap.length && heap[l].d < heap[sm].d) sm = l;
        if (r < heap.length && heap[r].d < heap[sm].d) sm = r;
        if (sm === i) break;
        [heap[i], heap[sm]] = [heap[sm], heap[i]];
        i = sm;
      }
    }
    return top;
  };

  while (heap.length) {
    const cur = pop()!;
    const d = cur.d;
    if (dist.get(cur.k)! < d) continue;
    const [cx, cy] = cur.k.split(",").map(Number);
    if (d > u.move) continue;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
      const nk = key(nx, ny);
      if (occ.has(nk)) continue;
      const t = terrainAt(state, nx, ny);
      const step = stepCostForUnit(u, t);
      if (!Number.isFinite(step)) continue;
      const nd = d + step;
      if (nd > u.move) continue;
      const prev = dist.get(nk);
      if (prev !== undefined && prev <= nd) continue;
      dist.set(nk, nd);
      parent.set(nk, cur.k);
      push(nk, nd);
    }
  }

  const reachable = new Set<string>();
  for (const [k, d] of dist) {
    if (d > 0 && d <= u.move) reachable.add(k);
  }
  return { reachable, parent };
}

/** 从起点沿最省移动力路径走到 goalKey，返回依次经过的格子（不含起点） */
function buildForwardPath(
  startKey: string,
  goalKey: string,
  parent: Map<string, string>
): { x: number; y: number }[] | null {
  if (goalKey === startKey) return [];
  if (!parent.has(goalKey)) return null;
  const rev: string[] = [];
  let cur: string | undefined = goalKey;
  while (cur && cur !== startKey) {
    rev.push(cur);
    cur = parent.get(cur);
  }
  if (cur !== startKey) return null;
  return rev.reverse().map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });
}

function bestApproachKey(
  eu: Unit,
  target: Unit,
  reachable: Set<string>
): string | null {
  const startK = key(eu.x, eu.y);
  let bestK: string | null = null;
  let bestM = Infinity;
  for (const k of reachable) {
    const [x, y] = k.split(",").map(Number);
    const m = Math.abs(x - target.x) + Math.abs(y - target.y);
    if (
      bestK === null ||
      m < bestM ||
      (m === bestM && k.localeCompare(bestK) < 0)
    ) {
      bestM = m;
      bestK = k;
    }
  }
  if (bestK === null || bestK === startK) return null;
  return bestK;
}

export function getReachable(
  u: Unit,
  units: Unit[],
  state: BattleState
): Set<string> {
  return dijkstraReachableData(u, units, state).reachable;
}

export function gridCellClick(state: BattleState, x: number, y: number): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.pendingMove) return state;
  if (state.phase === "move" && state.selectedId) {
    const u = state.units.find((z) => z.id === state.selectedId);
    if (u && !u.moved && u.x === x && u.y === y) return openMenuInPlace(state);
  }
  return moveSelected(state, x, y);
}

export function openMenuInPlace(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player" || state.phase !== "move") return state;
  if (state.pendingMove) return state;
  const id = state.selectedId;
  if (!id) return state;
  const u = state.units.find((x) => x.id === id);
  if (!u || u.moved || u.acted) return state;
  return {
    ...state,
    phase: "menu",
    moveTargets: [],
    pickTarget: null,
    units: state.units.map((x) => (x.id === id ? { ...x, moved: true } : x)),
    log: [...state.log, `${u.name} 原地待命，请选择行动。`],
  };
}

export function selectPlayerUnit(state: BattleState, unitId: string): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.pendingMove) return state;
  const u = state.units.find((x) => x.id === unitId);
  if (!u || u.side !== "player" || u.hp <= 0) return state;
  if (u.moved && u.acted) return state;
  if (state.phase === "move" && state.selectedId === unitId) {
    return openMenuInPlace(state);
  }
  if (u.moved && !u.acted) {
    return {
      ...state,
      phase: "menu",
      selectedId: unitId,
      moveTargets: [],
      pickTarget: null,
      log:
        state.selectedId === unitId
          ? state.log
          : [...state.log, `选择 ${u.name}，请选择行动。`],
    };
  }
  const reachable = getReachable(u, state.units, state);
  const moveTargets = [...reachable].map((s) => {
    const [xs, ys] = s.split(",").map(Number);
    return { x: xs, y: ys };
  });
  return {
    ...state,
    phase: "move",
    selectedId: unitId,
    moveTargets,
    pickTarget: null,
    log:
      state.selectedId === unitId
        ? state.log
        : [...state.log, `选择 ${u.name}。`],
  };
}

export function moveSelected(state: BattleState, tx: number, ty: number): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.phase !== "move") return state;
  if (state.pendingMove) return state;
  const id = state.selectedId;
  if (!id) return state;
  const u = state.units.find((x) => x.id === id);
  if (!u || u.moved) return state;
  const k = key(tx, ty);
  const ok = state.moveTargets.some((t) => t.x === tx && t.y === ty);
  if (!ok) return state;
  const occ = occupantMap(state.units);
  if (occ.has(k) && k !== key(u.x, u.y)) return state;
  const startKey = key(u.x, u.y);
  const { parent } = dijkstraReachableData(u, state.units, state);
  const pathSteps = buildForwardPath(startKey, k, parent);
  if (!pathSteps || pathSteps.length === 0) return state;
  const pendingMove: PendingMove = {
    unitId: id,
    path: pathSteps,
    kind: "player",
    from: { x: u.x, y: u.y },
  };
  return {
    ...state,
    pendingMove,
    moveTargets: [],
    pickTarget: null,
  };
}

/** 推进一格沿路移动；走完后我军进入菜单，敌军则尝试攻击并轮到下一单位 */
export function advancePendingMove(state: BattleState): BattleState {
  const p = state.pendingMove;
  if (!p || p.path.length === 0) return { ...state, pendingMove: null };
  const [step, ...rest] = p.path;
  const uid = p.unitId;
  const units = state.units.map((x) =>
    x.id === uid ? { ...x, x: step.x, y: step.y } : x
  );
  let s: BattleState = { ...state, units };
  if (rest.length > 0) {
    return { ...s, pendingMove: { ...p, path: rest } };
  }
  s = { ...s, pendingMove: null };
  if (p.kind === "player") {
    const u = s.units.find((x) => x.id === uid);
    const logLine = u ? `${u.name} 移动至 (${step.x + 1},${step.y + 1})。` : "";
    s = {
      ...s,
      units: s.units.map((x) => (x.id === uid ? { ...x, moved: true } : x)),
      log: logLine ? [...s.log, logLine] : s.log,
    };
    s = afterMoveOpenMenu(s, uid);
    return checkOutcome(s);
  }
  const eu = s.units.find((x) => x.id === uid);
  if (eu) {
    s = { ...s, log: [...s.log, `${eu.name} 逼近我军。`] };
  }
  s = enemyAttackAfterAdvance(s, uid);
  s = checkOutcome(s);
  const q = s.enemyTurnQueue;
  const c = s.enemyTurnCursor;
  const nextC = c + 1;
  if (s.outcome !== "playing") {
    return { ...s, enemyTurnQueue: null, enemyTurnCursor: 0, pendingMove: null };
  }
  if (nextC >= (q?.length ?? 0)) {
    return finishEnemyTurnAndStartPlayer({ ...s, enemyTurnCursor: nextC });
  }
  return { ...s, enemyTurnCursor: nextC };
}

export function adjacent(a: Unit, b: Unit) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function manhattan(a: Unit, b: Unit) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 普攻射程：弓兵曼哈顿距离 ≤3，步骑仅相邻 */
export function inPhysicalAttackRange(attacker: Unit, target: Unit): boolean {
  const d = manhattan(attacker, target);
  if (d < 1) return false;
  if (attacker.troopKind === "archer") return d <= ARCHER_ATTACK_RANGE;
  return d === 1;
}

export function physicalAttackMenuLabel(unit: Unit): string {
  return unit.troopKind === "archer" ? "远程射击" : "近战攻击";
}

export function canMeleeAttack(attacker: Unit, units: Unit[]): boolean {
  return units.some((x) => x.side === "enemy" && x.hp > 0 && inPhysicalAttackRange(attacker, x));
}

function foesInTacticRange(attacker: Unit, units: Unit[]): Unit[] {
  return units.filter((x) => x.side === "enemy" && x.hp > 0 && manhattan(attacker, x) <= 2);
}

function tacticValidOnTarget(state: BattleState, kind: TacticKind, target: Unit): boolean {
  const t = terrainAt(state, target.x, target.y);
  return (TACTIC_DEF[kind].terrains as readonly Terrain[]).includes(t);
}

/** 某计策是否有合法目标且计策值足够 */
export function canAffordTactic(
  attacker: Unit,
  kind: TacticKind,
  state: BattleState
): boolean {
  const def = TACTIC_DEF[kind];
  if (attacker.tacticPoints < def.cost) return false;
  return foesInTacticRange(attacker, state.units).some((f) =>
    tacticValidOnTarget(state, kind, f)
  );
}

export function canUseTactic(attacker: Unit, state: BattleState): boolean {
  return (
    (["fire", "water", "trap"] as const).some((k) => canAffordTactic(attacker, k, state))
  );
}

function sortMeleeTargets(foes: Unit[]): Unit[] {
  return [...foes].sort((a, b) => a.hp - b.hp || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

function sortTacticTargets(foes: Unit[]): Unit[] {
  return [...foes].sort((a, b) => a.hp - b.hp || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

function afterMoveOpenMenu(state: BattleState, attackerId: string): BattleState {
  const attacker = state.units.find((x) => x.id === attackerId);
  if (!attacker || attacker.acted) {
    return maybeEndPlayerTurn({
      ...state,
      phase: "select",
      selectedId: null,
      moveTargets: [],
      pickTarget: null,
    });
  }
  return {
    ...state,
    phase: "menu",
    selectedId: attackerId,
    moveTargets: [],
    pickTarget: null,
    log: [...state.log, `${attacker.name} 移动完毕，请选择行动。`],
  };
}

function toPickState(
  kind: "melee" | "tactic",
  attackerId: string,
  sortedFoes: Unit[],
  tacticKind?: TacticKind
): PickTargetState {
  return {
    kind,
    attackerId,
    tacticKind,
    targetIds: sortedFoes.map((f) => f.id),
    focusIndex: 0,
  };
}

export function menuMeleeAttack(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player" || state.phase !== "menu") return state;
  const aid = state.selectedId;
  if (!aid) return state;
  const attacker = state.units.find((x) => x.id === aid);
  if (!attacker || attacker.acted || !attacker.moved) return state;
  if (!canMeleeAttack(attacker, state.units)) return state;
  const foes = state.units.filter(
    (x) => x.side === "enemy" && x.hp > 0 && inPhysicalAttackRange(attacker, x)
  );
  if (foes.length === 0) return state;
  const sorted = sortMeleeTargets(foes);
  if (sorted.length === 1) {
    return applyPlayerMeleeDamage(state, aid, sorted[0].id);
  }
  const aimHint = attacker.troopKind === "archer" ? "弓箭" : "攻击";
  return {
    ...state,
    phase: "pick-target",
    pickTarget: toPickState("melee", aid, sorted),
    log: [...state.log, `选择${aimHint}目标（方向键切换，Enter 确认）。`],
  };
}

/** 菜单进入计策子选单 */
export function menuOpenTacticMenu(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player" || state.phase !== "menu") return state;
  const aid = state.selectedId;
  if (!aid) return state;
  const attacker = state.units.find((x) => x.id === aid);
  if (!attacker || attacker.acted || !attacker.moved) return state;
  if (!canUseTactic(attacker, state)) return state;
  return {
    ...state,
    phase: "tactic-menu",
    pickTarget: null,
    log: [...state.log, "选择计策种类。"],
  };
}

/** 从计策子选单返回行动菜单 */
export function cancelTacticMenu(state: BattleState): BattleState {
  if (state.phase !== "tactic-menu") return state;
  return { ...state, phase: "menu" };
}

/** 在计策子选单中选择火计/水计/陷阱 */
export function tacticMenuChoose(state: BattleState, tacticKind: TacticKind): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player" || state.phase !== "tactic-menu") {
    return state;
  }
  const aid = state.selectedId;
  if (!aid) return state;
  const attacker = state.units.find((x) => x.id === aid);
  if (!attacker || attacker.acted || !attacker.moved) return state;
  if (!canAffordTactic(attacker, tacticKind, state)) return state;

  const foes = foesInTacticRange(attacker, state.units).filter((f) =>
    tacticValidOnTarget(state, tacticKind, f)
  );
  if (foes.length === 0) return state;

  const sorted = sortTacticTargets(foes);
  const def = TACTIC_DEF[tacticKind];
  if (sorted.length === 1) {
    return applyPlayerTacticDamage(
      state,
      aid,
      sorted[0].id,
      tacticKind,
      def.cost
    );
  }
  return {
    ...state,
    phase: "pick-target",
    pickTarget: toPickState("tactic", aid, sorted, tacticKind),
    log: [
      ...state.log,
      `选择 ${def.name} 目标（方向键切换，Enter 确认）。`,
    ],
  };
}

function applyPlayerMeleeDamage(
  state: BattleState,
  attackerId: string,
  enemyId: string
): BattleState {
  const attacker = state.units.find((x) => x.id === attackerId);
  const target = state.units.find((x) => x.id === enemyId);
  if (!attacker || !target || target.side !== "enemy") return state;
  const dmg = meleeDamageDealt(state, attacker, target);
  const hpBeforeMelee = target.hp;
  const newHp = Math.max(0, target.hp - dmg);
  const killed = newHp <= 0;
  const xp = xpForDamage(dmg, killed, attacker.level, target.level);
  const hint = combatHints(state, attacker, target);
  const verb = attacker.troopKind === "archer" ? "箭射" : "攻击";
  const lines: string[] = [];
  lines.push(
    `${attacker.name} ${verb} ${target.name}，造成 ${dmg} 点伤害${hint ? ` ${hint}` : ""}。`
  );
  if (killed) lines.push(`${target.name} 被击退！`);
  const attackerAfter = applyExpAndLevelUps({ ...attacker, acted: true }, xp, lines);
  const units = state.units.map((x) => {
    if (x.id === enemyId) return { ...x, hp: newHp };
    if (x.id === attackerId) return attackerAfter;
    return x;
  });
  let next: BattleState = {
    ...state,
    units,
    selectedId: null,
    phase: "select",
    moveTargets: [],
    pickTarget: null,
    log: [...state.log, ...lines],
  };
  if (dmg > 0) next = attachDamagePulse(next, enemyId, dmg, hpBeforeMelee, "melee");
  next = checkOutcome(next);
  if (next.outcome !== "playing") return next;
  return maybeEndPlayerTurn(next);
}

function applyPlayerTacticDamage(
  state: BattleState,
  attackerId: string,
  enemyId: string,
  tacticKind: TacticKind,
  cost: number
): BattleState {
  const attacker = state.units.find((x) => x.id === attackerId);
  const target = state.units.find((x) => x.id === enemyId);
  if (!attacker || !target || target.side !== "enemy") return state;
  if (attacker.tacticPoints < cost) return state;
  if (!tacticValidOnTarget(state, tacticKind, target)) return state;
  if (manhattan(attacker, target) > 2) return state;

  const dmg = tacticDamageDealt(state, attacker, target, tacticKind);
  const hpBeforeTactic = target.hp;
  const newHp = Math.max(0, target.hp - dmg);
  const killed = newHp <= 0;
  const xp = xpForDamage(dmg, killed, attacker.level, target.level);
  const hint = terrainCombatHint(state, attacker, target);
  const def = TACTIC_DEF[tacticKind];
  const lines: string[] = [];
  lines.push(
    `${attacker.name} 施展${def.name}打击 ${target.name}，造成 ${dmg} 点伤害（-${cost} 计策）${hint ? ` ${hint}` : ""}。`
  );
  if (killed) lines.push(`${target.name} 被击退！`);
  const atkBase = {
    ...attacker,
    acted: true,
    tacticPoints: attacker.tacticPoints - cost,
  };
  const attackerAfter = applyExpAndLevelUps(atkBase, xp, lines);
  const units = state.units.map((x) => {
    if (x.id === enemyId) return { ...x, hp: newHp };
    if (x.id === attackerId) return attackerAfter;
    return x;
  });
  let next: BattleState = {
    ...state,
    units,
    selectedId: null,
    phase: "select",
    moveTargets: [],
    pickTarget: null,
    log: [...state.log, ...lines],
  };
  if (dmg > 0) next = attachDamagePulse(next, enemyId, dmg, hpBeforeTactic, "tactic");
  next = checkOutcome(next);
  if (next.outcome !== "playing") return next;
  return maybeEndPlayerTurn(next);
}

export function confirmPickTarget(state: BattleState, enemyId: string): BattleState {
  const p = state.pickTarget;
  if (!p || state.phase !== "pick-target") return state;
  if (!p.targetIds.includes(enemyId)) return state;
  const attacker = state.units.find((u) => u.id === p.attackerId);
  const target = state.units.find((u) => u.id === enemyId);
  if (!attacker || attacker.acted || !target || target.side !== "enemy" || target.hp <= 0) {
    return state;
  }
  if (p.kind === "melee" && !inPhysicalAttackRange(attacker, target)) return state;
  if (p.kind === "tactic") {
    if (manhattan(attacker, target) > 2) return state;
    const tk = p.tacticKind;
    if (!tk) return state;
    const cost = TACTIC_DEF[tk].cost;
    if (attacker.tacticPoints < cost) return state;
    if (!tacticValidOnTarget(state, tk, target)) return state;
    return applyPlayerTacticDamage(
      { ...state, pickTarget: null },
      p.attackerId,
      enemyId,
      tk,
      cost
    );
  }
  return applyPlayerMeleeDamage({ ...state, pickTarget: null }, p.attackerId, enemyId);
}

export function pickTargetNavigate(state: BattleState, delta: number): BattleState {
  const p = state.pickTarget;
  if (!p || state.phase !== "pick-target" || p.targetIds.length === 0) return state;
  const n = p.targetIds.length;
  const focusIndex = (((p.focusIndex + delta) % n) + n) % n;
  return { ...state, pickTarget: { ...p, focusIndex } };
}

export function pickTargetFocusEnemy(state: BattleState, enemyId: string): BattleState {
  const p = state.pickTarget;
  if (!p || state.phase !== "pick-target") return state;
  const idx = p.targetIds.indexOf(enemyId);
  if (idx < 0 || idx === p.focusIndex) return state;
  return { ...state, pickTarget: { ...p, focusIndex: idx } };
}

export function cancelPickTarget(state: BattleState): BattleState {
  if (state.phase !== "pick-target") return state;
  const backToTactic =
    state.pickTarget?.kind === "tactic" && Boolean(state.pickTarget.tacticKind);
  return {
    ...state,
    phase: backToTactic ? "tactic-menu" : "menu",
    pickTarget: null,
  };
}

export function escapeOrRevertUnit(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.pendingMove?.kind === "player" && state.pendingMove.from) {
    const { unitId, from } = state.pendingMove;
    const name = state.units.find((u) => u.id === unitId)?.name ?? unitId;
    return {
      ...state,
      pendingMove: null,
      units: state.units.map((u) =>
        u.id === unitId ? { ...u, x: from.x, y: from.y } : u
      ),
      phase: "select",
      selectedId: null,
      moveTargets: [],
      pickTarget: null,
      log: [...state.log, `已取消 ${name} 的移动。`],
    };
  }
  if (state.phase === "tactic-menu") return cancelTacticMenu(state);
  if (state.phase === "pick-target") return cancelPickTarget(state);
  if (state.phase === "move") {
    const id = state.selectedId;
    const name = id ? (state.units.find((u) => u.id === id)?.name ?? id) : "";
    return {
      ...state,
      phase: "select",
      selectedId: null,
      moveTargets: [],
      pickTarget: null,
      log: id ? [...state.log, `已取消选择 ${name}。`] : state.log,
    };
  }
  if (state.phase !== "menu" || !state.selectedId) return state;
  const id = state.selectedId;
  const snap = state.playerTurnStart[id];
  if (!snap) return state;
  const name = state.units.find((u) => u.id === id)?.name ?? id;
  const units = state.units.map((u) =>
    u.id === id
      ? {
          ...u,
          x: snap.x,
          y: snap.y,
          moved: snap.moved,
          acted: snap.acted,
          hp: snap.hp ?? u.hp,
          maxHp: snap.maxHp ?? u.maxHp,
          level: snap.level ?? u.level,
          exp: snap.exp ?? u.exp,
          defense: snap.defense ?? u.defense,
          tacticPoints:
            typeof snap.tacticPoints === "number" ? snap.tacticPoints : u.tacticPoints,
          tacticMax: snap.tacticMax ?? u.tacticMax,
        }
      : u
  );
  return {
    ...state,
    units,
    phase: "select",
    selectedId: null,
    moveTargets: [],
    pickTarget: null,
    pendingMove: null,
    log: [...state.log, `${name} 取消行动，恢复至回合开始位置。`],
  };
}

function allPlayerDone(units: Unit[]) {
  return units
    .filter((u) => u.side === "player" && u.hp > 0)
    .every((u) => u.moved && u.acted);
}

function maybeEndPlayerTurn(state: BattleState): BattleState {
  if (state.outcome !== "playing") return state;
  if (!allPlayerDone(state.units)) return state;
  return startEnemyTurn({
    ...state,
    turn: "enemy",
    phase: "enemy",
    selectedId: null,
    moveTargets: [],
    pickTarget: null,
    pendingMove: null,
    log: [...state.log, "—— 敌军回合 ——"],
  });
}

function startEnemyTurn(state: BattleState): BattleState {
  const refreshed = state.units.map((u) =>
    u.side === "enemy" && u.hp > 0 ? { ...u, moved: false, acted: false } : u
  );
  const queue = refreshed.filter((u) => u.side === "enemy" && u.hp > 0).map((u) => u.id);
  const base = {
    ...state,
    units: refreshed,
    enemyTurnQueue: queue,
    enemyTurnCursor: 0,
    pendingMove: null,
  };
  if (queue.length === 0) return finishEnemyTurnAndStartPlayer(base);
  return base;
}

function refreshPlayerTacticPools(units: Unit[]): Unit[] {
  return units.map((u) => {
    if (u.side !== "player" || u.hp <= 0) return u;
    const max = tacticMaxForUnit(u.intel, u.level);
    return { ...u, tacticMax: max, tacticPoints: max };
  });
}

function finishEnemyTurnAndStartPlayer(s: BattleState): BattleState {
  const prevRound = s.battleRound ?? 1;
  const nextRound = prevRound + 1;
  const cap = s.maxBattleRounds;
  if (typeof cap === "number" && cap > 0 && nextRound > cap) {
    return {
      ...s,
      outcome: "lost",
      turn: "player",
      phase: "select",
      selectedId: null,
      moveTargets: [],
      pickTarget: null,
      enemyTurnQueue: null,
      enemyTurnCursor: 0,
      pendingMove: null,
      damagePulse: null,
      log: [...s.log, `回合数已达上限（${cap}），未能取胜。`],
    };
  }
  const withPools = refreshPlayerTacticPools(s.units);
  const next: BattleState = {
    ...s,
    battleRound: nextRound,
    units: withPools.map((u) =>
      u.side === "player" && u.hp > 0 ? { ...u, moved: false, acted: false } : u
    ),
    turn: "player",
    phase: "select",
    selectedId: null,
    moveTargets: [],
    pickTarget: null,
    enemyTurnQueue: null,
    enemyTurnCursor: 0,
    pendingMove: null,
    log: [...s.log, "—— 我军回合 ——"],
  };
  return withTurnSnapshot(next);
}

function enemyAttackAfterAdvance(s: BattleState, eid: string): BattleState {
  const eu = s.units.find((x) => x.id === eid);
  if (!eu || eu.side !== "enemy" || eu.hp <= 0) return s;
  const adj2 = sortMeleeTargets(
    s.units.filter((u) => u.side === "player" && u.hp > 0 && inPhysicalAttackRange(eu, u))
  )[0];
  if (!adj2) return s;
  const dmg = meleeDamageDealt(s, eu, adj2);
  const hint = combatHints(s, eu, adj2);
  const hpBeforeEnemyHit = adj2.hp;
  const newHp = Math.max(0, adj2.hp - dmg);
  let hit: BattleState = {
    ...s,
    units: s.units.map((x) => (x.id === adj2.id ? { ...x, hp: newHp } : x)),
    log: [
      ...s.log,
      `${eu.name} ${eu.troopKind === "archer" ? "箭射" : "攻击"} ${adj2.name}，造成 ${dmg} 点伤害${hint ? ` ${hint}` : ""}。`,
    ],
  };
  if (dmg > 0) hit = attachDamagePulse(hit, adj2.id, dmg, hpBeforeEnemyHit, "melee");
  return hit;
}

function executeEnemyUnitAction(state: BattleState, eid: string): BattleState {
  const s = state;
  const players = s.units.filter((u) => u.side === "player" && u.hp > 0);
  if (players.length === 0) return s;
  const euFound = s.units.find((x) => x.id === eid);
  if (!euFound || euFound.side !== "enemy" || euFound.hp <= 0) return s;
  const eu = euFound;

  const adj = sortMeleeTargets(players.filter((p) => inPhysicalAttackRange(eu, p)))[0];
  if (adj) {
    const dmg = meleeDamageDealt(s, eu, adj);
    const hint = combatHints(s, eu, adj);
    const hpBeforeEnemyMelee = adj.hp;
    const newHp = Math.max(0, adj.hp - dmg);
    let hit: BattleState = {
      ...s,
      units: s.units.map((x) => (x.id === adj.id ? { ...x, hp: newHp } : x)),
      log: [
        ...s.log,
        `${eu.name} ${eu.troopKind === "archer" ? "箭射" : "攻击"} ${adj.name}，造成 ${dmg} 点伤害${hint ? ` ${hint}` : ""}。`,
      ],
    };
    if (dmg > 0) hit = attachDamagePulse(hit, adj.id, dmg, hpBeforeEnemyMelee, "melee");
    return checkOutcome(hit);
  }
  const target = players.reduce((a, b) => {
    const da = Math.abs(eu.x - a.x) + Math.abs(eu.y - a.y);
    const db = Math.abs(eu.x - b.x) + Math.abs(eu.y - b.y);
    return da <= db ? a : b;
  });
  const { reachable, parent } = dijkstraReachableData(eu, s.units, s);
  const goalK = bestApproachKey(eu, target, reachable);
  if (!goalK) return s;
  const pathSteps = buildForwardPath(key(eu.x, eu.y), goalK, parent);
  if (!pathSteps || pathSteps.length === 0) return s;
  return {
    ...s,
    pendingMove: { unitId: eu.id, path: pathSteps, kind: "enemy" },
  };
}

export function processSingleEnemyStep(state: BattleState): BattleState {
  if (state.turn !== "enemy" || state.phase !== "enemy") return state;
  if (state.pendingMove?.kind === "enemy") {
    return state;
  }
  const q = state.enemyTurnQueue;
  if (!q?.length) return state;
  const c = state.enemyTurnCursor;
  if (c >= q.length) return finishEnemyTurnAndStartPlayer(state);

  const eid = q[c];
  const nextC = c + 1;

  const eu0 = state.units.find((x) => x.id === eid);
  if (!eu0 || eu0.side !== "enemy" || eu0.hp <= 0) {
    let s = { ...state, enemyTurnCursor: nextC };
    if (nextC >= q.length) return finishEnemyTurnAndStartPlayer(s);
    return s;
  }

  let s = executeEnemyUnitAction(state, eid);
  if (s.pendingMove?.kind === "enemy" && s.pendingMove.path.length > 0) {
    return s;
  }
  s = { ...s, enemyTurnCursor: nextC };

  if (s.outcome !== "playing") {
    return {
      ...s,
      enemyTurnQueue: null,
      enemyTurnCursor: 0,
      pendingMove: null,
    };
  }
  if (nextC >= q.length) return finishEnemyTurnAndStartPlayer(s);
  return s;
}

export function skipOrEndIfStuck(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.pendingMove) return state;
  const id = state.selectedId;
  if (!id) return state;
  const u = state.units.find((x) => x.id === id);
  if (!u || u.moved) return state;
  const units = state.units.map((x) => (x.id === id ? { ...x, moved: true, acted: true } : x));
  let next: BattleState = {
    ...state,
    units,
    selectedId: null,
    phase: "select",
    moveTargets: [],
    pickTarget: null,
    log: [...state.log, `${u.name} 待机。`],
  };
  return maybeEndPlayerTurn(next);
}

export function waitAfterMove(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.phase !== "menu" && state.phase !== "tactic-menu") return state;
  const id = state.selectedId;
  if (!id) return state;
  const u = state.units.find((x) => x.id === id);
  if (!u || !u.moved || u.acted) return state;
  const units = state.units.map((x) => (x.id === id ? { ...x, acted: true } : x));
  let next: BattleState = {
    ...state,
    units,
    selectedId: null,
    phase: "select",
    moveTargets: [],
    pickTarget: null,
    log: [...state.log, `${u.name} 待机。`],
  };
  return maybeEndPlayerTurn(next);
}

/** 强制结束我方回合：将存活我军标记为已行动并直接进入敌军回合流程。 */
export function endPlayerTurnImmediately(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.pendingMove) return state;
  const next: BattleState = {
    ...state,
    units: state.units.map((u) =>
      u.side === "player" && u.hp > 0 ? { ...u, moved: true, acted: true } : u
    ),
    selectedId: null,
    phase: "select",
    moveTargets: [],
    pickTarget: null,
    log: [...state.log, "我方主动结束本回合。"],
  };
  return maybeEndPlayerTurn(next);
}

function migrateV1Unit(raw: Record<string, unknown>): Unit {
  const atk = typeof raw.atk === "number" ? raw.atk : 25;
  const intel = typeof raw.intel === "number" ? raw.intel : 50;
  const might = typeof raw.might === "number" ? raw.might : atk;
  const armyType = (raw.armyType as ArmyType) || "ping";
  const level = 1;
  const exp = 0;
  const troopKind = isTroopKind(raw.troopKind) ? raw.troopKind : "infantry";
  const m = clampMight(might);
  const defense = defensePowerForUnit(m, level, troopKind);
  const tm = tacticMaxForUnit(intel, level);
  const maxHp = maxHpForLevel(level);
  return {
    id: String(raw.id),
    name: String(raw.name),
    side: raw.side as Side,
    x: Number(raw.x),
    y: Number(raw.y),
    hp: Math.min(maxHp, Math.max(0, Number(raw.hp) || maxHp)),
    maxHp,
    level,
    exp,
    might: m,
    intel,
    defense,
    armyType: ["ping", "shan", "shui"].includes(armyType) ? armyType : "ping",
    troopKind,
    tacticMax: typeof raw.tacticMax === "number" ? Math.max(raw.tacticMax as number, tm) : tm,
    tacticPoints:
      typeof raw.tacticPoints === "number" ? (raw.tacticPoints as number) : tm,
    move: movePointsForTroop(troopKind),
    moved: Boolean(raw.moved),
    acted: Boolean(raw.acted),
  };
}

export function isValidSave(o: unknown): o is BattleState {
  if (!o || typeof o !== "object") return false;
  const x = o as Record<string, unknown>;
  const v = x.version;
  if (v !== 1 && v !== 2) return false;
  if (!Array.isArray(x.units) || typeof x.gridW !== "number") return false;
  return true;
}

function ensureUnitShape(u: Unit | Record<string, unknown>): Unit {
  const r = u as Record<string, unknown>;
  if (typeof r.might !== "number" || typeof r.intel !== "number" || !r.armyType) {
    return migrateV1Unit(r);
  }
  let base = { ...(u as Unit) };
  if (typeof base.level !== "number") base.level = 1;
  base.level = clampUnitLevel(base.level);
  if (typeof base.exp !== "number") base.exp = 0;
  if (!isTroopKind(base.troopKind)) base.troopKind = "infantry";
  base.might = clampMight(base.might);
  base.maxHp = maxHpForLevel(base.level);
  base.hp = Math.min(base.maxHp, Math.max(0, Math.floor(base.hp ?? base.maxHp)));
  base.defense = defensePowerForUnit(base.might, base.level, base.troopKind);
  const tm = tacticMaxForUnit(base.intel, base.level);
  if (typeof base.tacticMax !== "number") base.tacticMax = tm;
  base.tacticMax = Math.max(base.tacticMax, tm);
  base.tacticPoints = Math.min(base.tacticMax, base.tacticPoints ?? base.tacticMax);
  base.move = movePointsForTroop(base.troopKind);
  const pc = (base as Unit).portraitCatalogId;
  if (pc !== undefined && typeof pc !== "string") {
    delete (base as Unit).portraitCatalogId;
  }
  return base;
}

export function ensureBattleFields(b: BattleState): BattleState {
  let s: BattleState = { ...b };
  if ((s.version as number) === 1) {
    const gridW = s.gridW;
    const gridH = s.gridH;
    const terrain: Terrain[][] = [];
    for (let y = 0; y < gridH; y++) {
      terrain.push(Array.from({ length: gridW }, () => "plain" as Terrain));
    }
    s = {
      ...(s as unknown as BattleState),
      version: 2,
      terrain,
      units: (s.units as unknown as Record<string, unknown>[]).map(migrateV1Unit),
    } as BattleState;
  }
  s = {
    ...s,
    pickTarget: s.pickTarget ?? null,
    enemyTurnQueue: s.enemyTurnQueue ?? null,
    enemyTurnCursor: s.enemyTurnCursor ?? 0,
    pendingMove: s.pendingMove ?? null,
    damagePulse: (() => {
      const dp = s.damagePulse;
      if (!dp || typeof (dp as { hpBefore?: unknown }).hpBefore !== "number") return null;
      const k = (dp as { kind?: unknown }).kind;
      if (k !== "melee" && k !== "tactic") return null;
      return dp as NonNullable<BattleState["damagePulse"]>;
    })(),
    scenarioBrief: typeof s.scenarioBrief === "string" ? s.scenarioBrief : "",
    victoryBrief: typeof s.victoryBrief === "string" ? s.victoryBrief : "",
    winCondition: normalizeWinCondition(s.winCondition),
    battleRound:
      typeof s.battleRound === "number" && s.battleRound >= 1 ? Math.floor(s.battleRound) : 1,
    maxBattleRounds:
      typeof s.maxBattleRounds === "number" && s.maxBattleRounds > 0
        ? Math.floor(s.maxBattleRounds)
        : 60,
    terrain: (() => {
      if (!s.terrain || s.terrain.length !== s.gridH || s.terrain[0]?.length !== s.gridW) {
        return createDefaultTerrain(s.gridW, s.gridH);
      }
      return s.terrain.map((row) => row.map((c) => normalizeTerrainCell(c)));
    })(),
  };
  s = { ...s, units: s.units.map((u) => ensureUnitShape(u as Unit | Record<string, unknown>)) };
  if (!s.playerTurnStart || Object.keys(s.playerTurnStart).length === 0) {
    s = { ...s, playerTurnStart: buildPlayerTurnStart(s.units) };
  } else {
    s = {
      ...s,
      playerTurnStart: Object.fromEntries(
        Object.entries(s.playerTurnStart).map(([id, snap]) => {
          const u = s.units.find((x) => x.id === id);
          return [
            id,
            {
              x: snap.x,
              y: snap.y,
              moved: snap.moved,
              acted: snap.acted,
              hp: snap.hp ?? u?.hp ?? 0,
              maxHp: snap.maxHp ?? u?.maxHp ?? 0,
              level: snap.level ?? u?.level ?? 1,
              exp: snap.exp ?? u?.exp ?? 0,
              defense: snap.defense ?? u?.defense ?? 5,
              tacticPoints:
                typeof snap.tacticPoints === "number"
                  ? snap.tacticPoints
                  : (u?.tacticPoints ?? 0),
              tacticMax: snap.tacticMax ?? u?.tacticMax ?? 0,
            },
          ];
        })
      ) as PlayerTurnStartMap,
    };
  }
  s = {
    ...s,
    units: s.units.map((u) => {
      const m = clampMight(u.might);
      const lv = clampUnitLevel(u.level);
      const maxHp = maxHpForLevel(lv);
      const hp = Math.min(maxHp, Math.max(0, u.hp));
      const def = defensePowerForUnit(m, lv, u.troopKind);
      const max = tacticMaxForUnit(u.intel, lv);
      const move = movePointsForTroop(u.troopKind);
      const tacticPoints = Math.min(max, u.tacticPoints);
      if (
        u.might !== m ||
        u.level !== lv ||
        u.maxHp !== maxHp ||
        u.hp !== hp ||
        u.defense !== def ||
        u.tacticMax !== max ||
        u.tacticPoints !== tacticPoints ||
        u.move !== move
      ) {
        return { ...u, might: m, level: lv, maxHp, hp, defense: def, tacticMax: max, tacticPoints, move };
      }
      return u;
    }),
  };
  return s;
}
