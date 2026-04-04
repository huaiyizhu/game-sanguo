import type {
  ArmyType,
  BattleState,
  PickTargetState,
  PlayerTurnStartMap,
  Side,
  TacticKind,
  Terrain,
  Unit,
} from "./types";
import { TACTIC_DEF, tacticMaxFromIntel } from "./types";

const key = (x: number, y: number) => `${x},${y}`;

function terrainAt(state: BattleState, x: number, y: number): Terrain {
  const row = state.terrain[y];
  return row?.[x] ?? "plain";
}

/** 走入该格消耗的移动力；Infinity 表示不可进入 */
export function stepCostForUnit(u: Unit, t: Terrain): number {
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

function buildPlayerTurnStart(units: Unit[]): PlayerTurnStartMap {
  const playerTurnStart: PlayerTurnStartMap = {};
  for (const u of units) {
    if (u.side === "player" && u.hp > 0) {
      playerTurnStart[u.id] = {
        x: u.x,
        y: u.y,
        moved: u.moved,
        acted: u.acted,
        tacticPoints: u.tacticPoints,
      };
    }
  }
  return playerTurnStart;
}

function withTurnSnapshot(state: BattleState): BattleState {
  return { ...state, playerTurnStart: buildPlayerTurnStart(state.units) };
}

function createPrologueTerrain(gridW: number, gridH: number): Terrain[][] {
  const rows: Terrain[][] = [];
  for (let y = 0; y < gridH; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < gridW; x++) {
      let t: Terrain = "plain";
      if (y >= 2 && y <= 4 && x >= 4 && x <= 7) t = "forest";
      if (y === 5 && x >= 3 && x <= 8) t = "water";
      if ((x <= 1 || x >= gridW - 2) && y >= 1 && y <= 5) t = "mountain";
      if (y === gridH - 1 && x >= 2 && x <= 9) t = "desert";
      if (y === 0 && x >= 3 && x <= 8) t = "plain";
      row.push(t);
    }
    rows.push(row);
  }
  return rows;
}

export function createInitialBattle(): BattleState {
  const gridW = 12;
  const gridH = 8;
  const terrain = createPrologueTerrain(gridW, gridH);

  const units: Unit[] = [
    {
      id: "p1",
      name: "刘备",
      side: "player",
      x: 3,
      y: 6,
      hp: 120,
      maxHp: 120,
      might: 28,
      intel: 72,
      armyType: "ping",
      tacticMax: tacticMaxFromIntel(72),
      tacticPoints: tacticMaxFromIntel(72),
      move: 4,
      moved: false,
      acted: false,
    },
    {
      id: "p2",
      name: "关羽",
      side: "player",
      x: 5,
      y: 6,
      hp: 110,
      maxHp: 110,
      might: 95,
      intel: 68,
      armyType: "ping",
      tacticMax: tacticMaxFromIntel(68),
      tacticPoints: tacticMaxFromIntel(68),
      move: 3,
      moved: false,
      acted: false,
    },
    {
      id: "p3",
      name: "张飞",
      side: "player",
      x: 7,
      y: 6,
      hp: 130,
      maxHp: 130,
      might: 92,
      intel: 38,
      armyType: "shan",
      tacticMax: tacticMaxFromIntel(38),
      tacticPoints: tacticMaxFromIntel(38),
      move: 3,
      moved: false,
      acted: false,
    },
    {
      id: "e1",
      name: "黄巾贼",
      side: "enemy",
      x: 5,
      y: 5,
      hp: 70,
      maxHp: 70,
      might: 22,
      intel: 30,
      armyType: "shui",
      tacticMax: 0,
      tacticPoints: 0,
      move: 3,
      moved: false,
      acted: false,
    },
    {
      id: "e2",
      name: "黄巾贼",
      side: "enemy",
      x: 7,
      y: 2,
      hp: 65,
      maxHp: 65,
      might: 21,
      intel: 28,
      armyType: "ping",
      tacticMax: 0,
      tacticPoints: 0,
      move: 3,
      moved: false,
      acted: false,
    },
    {
      id: "e3",
      name: "黄巾头目",
      side: "enemy",
      x: 1,
      y: 3,
      hp: 95,
      maxHp: 95,
      might: 26,
      intel: 42,
      armyType: "shan",
      tacticMax: 0,
      tacticPoints: 0,
      move: 2,
      moved: false,
      acted: false,
    },
  ];

  return withTurnSnapshot({
    version: 2,
    scenarioId: "prologue_zhangjiao",
    scenarioTitle: "序章 · 讨伐黄巾",
    gridW,
    gridH,
    terrain,
    turn: "player",
    phase: "select",
    selectedId: null,
    moveTargets: [],
    units,
    log: ["刘备举义兵讨伐黄巾，与关羽、张飞共赴战场。"],
    outcome: "playing",
    pickTarget: null,
    playerTurnStart: {},
    enemyTurnQueue: null,
    enemyTurnCursor: 0,
  });
}

function alive(units: Unit[], side: Side) {
  return units.filter((u) => u.side === side && u.hp > 0);
}

function checkOutcome(state: BattleState): BattleState {
  if (alive(state.units, "enemy").length === 0) {
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
      log: [...state.log, "敌军全灭，战斗胜利！"],
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
      log: [...state.log, "我军全灭……"],
    };
  }
  return state;
}

function dijkstraReachable(
  u: Unit,
  units: Unit[],
  state: BattleState
): Set<string> {
  const { gridW, gridH } = state;
  const occ = occupantMap(units);
  occ.delete(key(u.x, u.y));
  const start = key(u.x, u.y);
  const dist = new Map<string, number>();
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
      push(nk, nd);
    }
  }

  const reachable = new Set<string>();
  for (const [k, d] of dist) {
    if (d > 0 && d <= u.move) reachable.add(k);
  }
  return reachable;
}

export function getReachable(
  u: Unit,
  units: Unit[],
  state: BattleState
): Set<string> {
  return dijkstraReachable(u, units, state);
}

export function gridCellClick(state: BattleState, x: number, y: number): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.phase === "move" && state.selectedId) {
    const u = state.units.find((z) => z.id === state.selectedId);
    if (u && !u.moved && u.x === x && u.y === y) return openMenuInPlace(state);
  }
  return moveSelected(state, x, y);
}

export function openMenuInPlace(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player" || state.phase !== "move") return state;
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
  const id = state.selectedId;
  if (!id) return state;
  const u = state.units.find((x) => x.id === id);
  if (!u || u.moved) return state;
  const k = key(tx, ty);
  const ok = state.moveTargets.some((t) => t.x === tx && t.y === ty);
  if (!ok) return state;
  const occ = occupantMap(state.units);
  if (occ.has(k) && k !== key(u.x, u.y)) return state;
  const units = state.units.map((x) =>
    x.id === id ? { ...x, x: tx, y: ty, moved: true } : x
  );
  let next: BattleState = {
    ...state,
    units,
    moveTargets: [],
    pickTarget: null,
    log: [...state.log, `${u.name} 移动至 (${tx + 1},${ty + 1})。`],
  };
  next = afterMoveOpenMenu(next, id);
  return checkOutcome(next);
}

export function adjacent(a: Unit, b: Unit) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function manhattan(a: Unit, b: Unit) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function canMeleeAttack(attacker: Unit, units: Unit[]): boolean {
  return units.some((x) => x.side === "enemy" && x.hp > 0 && adjacent(attacker, x));
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
    (x) => x.side === "enemy" && x.hp > 0 && adjacent(attacker, x)
  );
  if (foes.length === 0) return state;
  const sorted = sortMeleeTargets(foes);
  if (sorted.length === 1) {
    return applyPlayerDamage(state, aid, sorted[0].id, attacker.might, "melee");
  }
  return {
    ...state,
    phase: "pick-target",
    pickTarget: toPickState("melee", aid, sorted),
    log: [...state.log, "选择攻击目标（方向键切换，Enter 确认）。"],
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

function tacticDamageAmount(attacker: Unit, tacticKind: TacticKind): number {
  const base = Math.max(1, Math.floor(attacker.intel * 0.55));
  return Math.max(1, Math.floor(base * TACTIC_DEF[tacticKind].dmgMul));
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

  const dmg = tacticDamageAmount(attacker, tacticKind);
  const newHp = Math.max(0, target.hp - dmg);
  const units = state.units.map((x) => {
    if (x.id === enemyId) return { ...x, hp: newHp };
    if (x.id === attackerId)
      return {
        ...x,
        acted: true,
        tacticPoints: x.tacticPoints - cost,
      };
    return x;
  });
  const def = TACTIC_DEF[tacticKind];
  let log = [
    ...state.log,
    `${attacker.name} 施展${def.name}打击 ${target.name}，造成 ${dmg} 伤害（-${cost} 计策）。`,
  ];
  if (newHp <= 0) log = [...log, `${target.name} 被击退！`];
  let next: BattleState = {
    ...state,
    units,
    selectedId: null,
    phase: "select",
    moveTargets: [],
    pickTarget: null,
    log,
  };
  next = checkOutcome(next);
  if (next.outcome !== "playing") return next;
  return maybeEndPlayerTurn(next);
}

function applyPlayerDamage(
  state: BattleState,
  attackerId: string,
  enemyId: string,
  dmg: number,
  kind: "melee" | "tactic"
): BattleState {
  const attacker = state.units.find((x) => x.id === attackerId);
  const target = state.units.find((x) => x.id === enemyId);
  if (!attacker || !target || target.side !== "enemy") return state;
  const newHp = Math.max(0, target.hp - dmg);
  const units = state.units.map((x) =>
    x.id === enemyId ? { ...x, hp: newHp } : x.id === attackerId ? { ...x, acted: true } : x
  );
  const verb = kind === "melee" ? "攻击" : "施展计策";
  let log = [...state.log, `${attacker.name} ${verb} ${target.name}，造成 ${dmg} 伤害。`];
  if (newHp <= 0) log = [...log, `${target.name} 被击退！`];
  let next: BattleState = {
    ...state,
    units,
    selectedId: null,
    phase: "select",
    moveTargets: [],
    pickTarget: null,
    log,
  };
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
  if (p.kind === "melee" && !adjacent(attacker, target)) return state;
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
  const dmg = attacker.might;
  return applyPlayerDamage({ ...state, pickTarget: null }, p.attackerId, enemyId, dmg, p.kind);
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
  if (state.phase === "tactic-menu") return cancelTacticMenu(state);
  if (state.phase === "pick-target") return cancelPickTarget(state);
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
          tacticPoints:
            typeof snap.tacticPoints === "number" ? snap.tacticPoints : u.tacticPoints,
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
  };
  if (queue.length === 0) return finishEnemyTurnAndStartPlayer(base);
  return base;
}

function refreshPlayerTacticPools(units: Unit[]): Unit[] {
  return units.map((u) => {
    if (u.side !== "player" || u.hp <= 0) return u;
    const max = tacticMaxFromIntel(u.intel);
    return { ...u, tacticMax: max, tacticPoints: max };
  });
}

function finishEnemyTurnAndStartPlayer(s: BattleState): BattleState {
  const withPools = refreshPlayerTacticPools(s.units);
  const next: BattleState = {
    ...s,
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
    log: [...s.log, "—— 我军回合 ——"],
  };
  return withTurnSnapshot(next);
}

function executeEnemyUnitAction(state: BattleState, eid: string): BattleState {
  let s = state;
  const players = s.units.filter((u) => u.side === "player" && u.hp > 0);
  if (players.length === 0) return s;
  const euFound = s.units.find((x) => x.id === eid);
  if (!euFound || euFound.side !== "enemy" || euFound.hp <= 0) return s;
  let eu: Unit = euFound;

  const adj = players.find((p) => adjacent(eu, p));
  if (adj) {
    const dmg = eu.might;
    const newHp = Math.max(0, adj.hp - dmg);
    s = {
      ...s,
      units: s.units.map((x) => (x.id === adj.id ? { ...x, hp: newHp } : x)),
      log: [...s.log, `${eu.name} 攻击 ${adj.name}，造成 ${dmg} 伤害。`],
    };
    return checkOutcome(s);
  }
  const target = players.reduce((a, b) => {
    const da = Math.abs(eu.x - a.x) + Math.abs(eu.y - a.y);
    const db = Math.abs(eu.x - b.x) + Math.abs(eu.y - b.y);
    return da <= db ? a : b;
  });
  const step = firstStepToward(eu, target, s);
  if (step) {
    s = {
      ...s,
      units: s.units.map((x) => (x.id === eu.id ? { ...x, x: step.x, y: step.y } : x)),
      log: [...s.log, `${eu.name} 逼近我军。`],
    };
    eu = s.units.find((x) => x.id === eid)!;
  }
  const adj2 = s.units.find((u) => u.side === "player" && u.hp > 0 && adjacent(eu, u));
  if (adj2) {
    const dmg = eu.might;
    const newHp = Math.max(0, adj2.hp - dmg);
    s = {
      ...s,
      units: s.units.map((x) => (x.id === adj2.id ? { ...x, hp: newHp } : x)),
      log: [...s.log, `${eu.name} 攻击 ${adj2.name}，造成 ${dmg} 伤害。`],
    };
    s = checkOutcome(s);
  }
  return s;
}

export function processSingleEnemyStep(state: BattleState): BattleState {
  if (state.turn !== "enemy" || state.phase !== "enemy") return state;
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
  s = { ...s, enemyTurnCursor: nextC };

  if (s.outcome !== "playing") {
    return {
      ...s,
      enemyTurnQueue: null,
      enemyTurnCursor: 0,
    };
  }
  if (nextC >= q.length) return finishEnemyTurnAndStartPlayer(s);
  return s;
}

function firstStepToward(eu: Unit, target: Unit, state: BattleState): { x: number; y: number } | null {
  const { gridW, gridH } = state;
  const units = state.units;
  const occ = occupantMap(units);
  occ.delete(key(eu.x, eu.y));
  const goal = key(target.x, target.y);
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  const prev = new Map<string, string | null>();
  const q: string[] = [goal];
  prev.set(goal, null);
  while (q.length) {
    const cur = q.shift()!;
    const [cx, cy] = cur.split(",").map(Number);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
      const nk = key(nx, ny);
      if (prev.has(nk)) continue;
      const t = terrainAt(state, nx, ny);
      if (!Number.isFinite(stepCostForUnit(eu, t))) continue;
      if (occ.has(nk) && nk !== key(eu.x, eu.y)) continue;
      prev.set(nk, cur);
      q.push(nk);
    }
  }
  const start = key(eu.x, eu.y);
  if (!prev.has(start)) return null;
  let cur: string | null = start;
  let last: string | null = null;
  while (cur && cur !== goal) {
    last = cur;
    cur = prev.get(cur) ?? null;
  }
  if (!last) return null;
  const [lx, ly] = last.split(",").map(Number);
  return { x: lx, y: ly };
}

export function skipOrEndIfStuck(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
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

function migrateV1Unit(raw: Record<string, unknown>): Unit {
  const atk = typeof raw.atk === "number" ? raw.atk : 25;
  const intel = typeof raw.intel === "number" ? raw.intel : 50;
  const might = typeof raw.might === "number" ? raw.might : atk;
  const armyType = (raw.armyType as ArmyType) || "ping";
  const max = tacticMaxFromIntel(intel);
  return {
    id: String(raw.id),
    name: String(raw.name),
    side: raw.side as Side,
    x: Number(raw.x),
    y: Number(raw.y),
    hp: Number(raw.hp),
    maxHp: Number(raw.maxHp),
    might,
    intel,
    armyType: ["ping", "shan", "shui"].includes(armyType) ? armyType : "ping",
    tacticMax: typeof raw.tacticMax === "number" ? raw.tacticMax : max,
    tacticPoints:
      typeof raw.tacticPoints === "number" ? raw.tacticPoints : max,
    move: Number(raw.move),
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
  if (typeof r.might === "number" && typeof r.intel === "number" && r.armyType) {
    return u as Unit;
  }
  return migrateV1Unit(r);
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
    terrain:
      s.terrain && s.terrain.length === s.gridH && s.terrain[0]?.length === s.gridW
        ? s.terrain
        : createPrologueTerrain(s.gridW, s.gridH),
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
          const tp =
            typeof snap.tacticPoints === "number"
              ? snap.tacticPoints
              : (u?.tacticPoints ?? 0);
          return [id, { ...snap, tacticPoints: tp }];
        })
      ) as PlayerTurnStartMap,
    };
  }
  s = {
    ...s,
    units: s.units.map((u) => {
      const max = tacticMaxFromIntel(u.intel);
      if (u.tacticMax !== max || u.tacticPoints > max) {
        return { ...u, tacticMax: max, tacticPoints: Math.min(u.tacticPoints, max) };
      }
      return u;
    }),
  };
  return s;
}
