import type { BattleState, Side, Unit } from "./types";

const key = (x: number, y: number) => `${x},${y}`;

function occupantMap(units: Unit[]): Map<string, Unit> {
  const m = new Map<string, Unit>();
  for (const u of units) {
    if (u.hp > 0) m.set(key(u.x, u.y), u);
  }
  return m;
}

export function createInitialBattle(): BattleState {
  const units: Unit[] = [
    {
      id: "p1",
      name: "刘备",
      side: "player",
      x: 3,
      y: 6,
      hp: 120,
      maxHp: 120,
      atk: 28,
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
      atk: 32,
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
      atk: 30,
      move: 3,
      moved: false,
      acted: false,
    },
    {
      id: "e1",
      name: "黄巾贼",
      side: "enemy",
      x: 4,
      y: 1,
      hp: 70,
      maxHp: 70,
      atk: 22,
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
      atk: 21,
      move: 3,
      moved: false,
      acted: false,
    },
    {
      id: "e3",
      name: "黄巾头目",
      side: "enemy",
      x: 5,
      y: 0,
      hp: 95,
      maxHp: 95,
      atk: 26,
      move: 2,
      moved: false,
      acted: false,
    },
  ];

  return {
    version: 1,
    scenarioId: "prologue_zhangjiao",
    scenarioTitle: "序章 · 讨伐黄巾",
    gridW: 12,
    gridH: 8,
    turn: "player",
    phase: "select",
    selectedId: null,
    moveTargets: [],
    units,
    log: ["刘备举义兵讨伐黄巾，与关羽、张飞共赴战场。"],
    outcome: "playing",
  };
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
      log: [...state.log, "我军全灭……"],
    };
  }
  return state;
}

export function getReachable(
  u: Unit,
  units: Unit[],
  gridW: number,
  gridH: number
): Set<string> {
  const occ = occupantMap(units);
  occ.delete(key(u.x, u.y));
  const start = key(u.x, u.y);
  const dist = new Map<string, number>();
  const q: { x: number; y: number; d: number }[] = [{ x: u.x, y: u.y, d: 0 }];
  dist.set(start, 0);
  const reachable = new Set<string>();
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  while (q.length) {
    const cur = q.shift()!;
    if (cur.d > 0) reachable.add(key(cur.x, cur.y));
    if (cur.d >= u.move) continue;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
      const k = key(nx, ny);
      if (occ.has(k)) continue;
      const nd = cur.d + 1;
      if (dist.has(k) && dist.get(k)! <= nd) continue;
      dist.set(k, nd);
      q.push({ x: nx, y: ny, d: nd });
    }
  }
  return reachable;
}

export function selectPlayerUnit(state: BattleState, unitId: string): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  const u = state.units.find((x) => x.id === unitId);
  if (!u || u.side !== "player" || u.hp <= 0) return state;
  if (u.moved && u.acted) return state;
  if (u.moved && !u.acted) {
    return {
      ...state,
      phase: "act",
      selectedId: unitId,
      moveTargets: [],
      log: state.selectedId === unitId ? state.log : [...state.log, `选择 ${u.name}（攻击或待机）。`],
    };
  }
  const reachable = getReachable(u, state.units, state.gridW, state.gridH);
  const moveTargets = [...reachable].map((s) => {
    const [xs, ys] = s.split(",").map(Number);
    return { x: xs, y: ys };
  });
  return {
    ...state,
    phase: "move",
    selectedId: unitId,
    moveTargets,
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
    log: [...state.log, `${u.name} 移动至 (${tx + 1},${ty + 1})。`],
  };
  next = tryPromptAttack(next, id);
  return checkOutcome(next);
}

function adjacent(a: Unit, b: Unit) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function tryPromptAttack(state: BattleState, attackerId: string): BattleState {
  const attacker = state.units.find((x) => x.id === attackerId);
  if (!attacker || attacker.acted) {
    return maybeEndPlayerTurn({ ...state, phase: "select", selectedId: null, moveTargets: [] });
  }
  const foe = state.units.find(
    (x) => x.side === "enemy" && x.hp > 0 && adjacent(attacker, x)
  );
  if (!foe) {
    return {
      ...state,
      phase: "act",
      selectedId: attackerId,
      moveTargets: [],
      log: [...state.log, `${attacker.name} 移动完毕，可攻击邻近敌军或待机。`],
    };
  }
  return attackEnemy(state, foe.id);
}

export function attackEnemy(state: BattleState, enemyId: string): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
  if (state.phase !== "move" && state.phase !== "act") return state;
  const aid = state.selectedId;
  if (!aid) return state;
  const attacker = state.units.find((x) => x.id === aid);
  const target = state.units.find((x) => x.id === enemyId);
  if (!attacker || !target || target.side !== "enemy" || target.hp <= 0) return state;
  if (!adjacent(attacker, target)) return state;
  if (attacker.acted) return state;
  const dmg = attacker.atk;
  const newHp = Math.max(0, target.hp - dmg);
  const units = state.units.map((x) =>
    x.id === enemyId ? { ...x, hp: newHp } : x.id === aid ? { ...x, acted: true } : x
  );
  let log = [...state.log, `${attacker.name} 攻击 ${target.name}，造成 ${dmg} 伤害。`];
  if (newHp <= 0) log = [...log, `${target.name} 被击退！`];
  let next: BattleState = {
    ...state,
    units,
    selectedId: null,
    phase: "select",
    moveTargets: [],
    log,
  };
  next = checkOutcome(next);
  if (next.outcome !== "playing") return next;
  return maybeEndPlayerTurn(next);
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
    log: [...state.log, "—— 敌军回合 ——"],
  });
}

function startEnemyTurn(state: BattleState): BattleState {
  const refreshed = state.units.map((u) =>
    u.side === "enemy" && u.hp > 0 ? { ...u, moved: false, acted: false } : u
  );
  return runEnemyAi({ ...state, units: refreshed });
}

function runEnemyAi(state: BattleState): BattleState {
  let s = { ...state };
  const enemies = s.units.filter((u) => u.side === "enemy" && u.hp > 0);
  for (const e of enemies) {
    if (s.outcome !== "playing") break;
    const players = s.units.filter((u) => u.side === "player" && u.hp > 0);
    if (players.length === 0) break;
    let eu = s.units.find((x) => x.id === e.id)!;
    const adj = players.find((p) => adjacent(eu, p));
    if (adj) {
      const dmg = eu.atk;
      const newHp = Math.max(0, adj.hp - dmg);
      s = {
        ...s,
        units: s.units.map((x) => (x.id === adj.id ? { ...x, hp: newHp } : x)),
        log: [...s.log, `${eu.name} 反击 ${adj.name}，造成 ${dmg} 伤害。`],
      };
      s = checkOutcome(s);
      continue;
    }
    const target = players.reduce((a, b) => {
      const da = Math.abs(eu.x - a.x) + Math.abs(eu.y - a.y);
      const db = Math.abs(eu.x - b.x) + Math.abs(eu.y - b.y);
      return da <= db ? a : b;
    });
    const step = firstStepToward(eu, target, s.units, s.gridW, s.gridH);
    if (step) {
      s = {
        ...s,
        units: s.units.map((x) => (x.id === eu.id ? { ...x, x: step.x, y: step.y } : x)),
        log: [...s.log, `${eu.name} 逼近我军。`],
      };
      eu = s.units.find((x) => x.id === e.id)!;
    }
    const adj2 = s.units.find((u) => u.side === "player" && u.hp > 0 && adjacent(eu, u));
    if (adj2) {
      const dmg = eu.atk;
      const newHp = Math.max(0, adj2.hp - dmg);
      s = {
        ...s,
        units: s.units.map((x) => (x.id === adj2.id ? { ...x, hp: newHp } : x)),
        log: [...s.log, `${eu.name} 攻击 ${adj2.name}，造成 ${dmg} 伤害。`],
      };
      s = checkOutcome(s);
    }
  }
  if (s.outcome !== "playing") return s;
  return {
    ...s,
    turn: "player",
    phase: "select",
    selectedId: null,
    moveTargets: [],
    units: s.units.map((u) =>
      u.side === "player" && u.hp > 0 ? { ...u, moved: false, acted: false } : u
    ),
    log: [...s.log, "—— 我军回合 ——"],
  };
}

function firstStepToward(
  eu: Unit,
  target: Unit,
  units: Unit[],
  gridW: number,
  gridH: number
): { x: number; y: number } | null {
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

/** 未移动直接待机 */
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
    log: [...state.log, `${u.name} 待机。`],
  };
  return maybeEndPlayerTurn(next);
}

/** 移动后待机（不攻击） */
export function waitAfterMove(state: BattleState): BattleState {
  if (state.outcome !== "playing" || state.turn !== "player") return state;
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
    log: [...state.log, `${u.name} 待机。`],
  };
  return maybeEndPlayerTurn(next);
}

export function isValidSave(o: unknown): o is BattleState {
  if (!o || typeof o !== "object") return false;
  const x = o as Record<string, unknown>;
  return x.version === 1 && Array.isArray(x.units) && typeof x.gridW === "number";
}
