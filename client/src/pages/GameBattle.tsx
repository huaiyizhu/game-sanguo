import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import {
  canAffordTactic,
  canMeleeAttack,
  canUseTactic,
  TURN_PHASE_BANNER_MS,
} from "../game/battle";
import type { BattlePhase, BattleState, Side, TacticKind, Terrain } from "../game/types";
import { TACTIC_DEF, TERRAIN_LABEL } from "../game/types";

export type MenuAction = "attack" | "tactic" | "wait";

const TACTIC_ORDER: TacticKind[] = ["fire", "water", "trap"];

type Props = {
  battle: BattleState;
  visualEpoch: number;
  onCellClick: (x: number, y: number) => void;
  onUnitClick: (unitId: string, side: Side) => void;
  onMenuAction: (action: MenuAction) => void;
  onTacticPick: (kind: TacticKind) => void;
  onEscapeOrRevert: () => void;
  onPickNavigate: (delta: number) => void;
  onPickConfirmFocused: () => void;
  onPickHoverEnemy: (enemyId: string) => void;
};

const MENU_ORDER: MenuAction[] = ["attack", "tactic", "wait"];

function nextEnabledFocus(
  from: number,
  delta: 1 | -1,
  attackOk: boolean,
  tacticOk: boolean
): number {
  const enabled = [attackOk, tacticOk, true];
  for (let step = 1; step <= 3; step++) {
    const i = (((from + delta * step) % 3) + 3) % 3;
    if (enabled[i]) return i;
  }
  return from;
}

function nextTacticFocus(from: number, delta: 1 | -1, enabled: boolean[]): number {
  for (let step = 1; step <= 4; step++) {
    const i = (((from + delta * step) % 3) + 3) % 3;
    if (enabled[i]) return i;
  }
  return from;
}

type UnitSnap = { x: number; y: number; hp: number };

type DyingVisual = {
  key: number;
  x: number;
  y: number;
  name: string;
  side: Side;
  level: number;
};

type KillBanner = { key: number; text: string };

export default function GameBattle({
  battle,
  visualEpoch,
  onCellClick,
  onUnitClick,
  onMenuAction,
  onTacticPick,
  onEscapeOrRevert,
  onPickNavigate,
  onPickConfirmFocused,
  onPickHoverEnemy,
}: Props) {
  const { gridW, gridH, units, moveTargets, selectedId, turn, phase, outcome, pickTarget, terrain } =
    battle;
  const moveSet = new Set(moveTargets.map((t) => `${t.x},${t.y}`));
  const [menuFocus, setMenuFocus] = useState(0);
  const [tacticFocus, setTacticFocus] = useState(0);
  const [dmgFx, setDmgFx] = useState<{
    unitId: string;
    amount: number;
    key: number;
  } | null>(null);
  const [moveSlide, setMoveSlide] = useState<Record<string, { dx: number; dy: number }>>({});
  const [dyingVisuals, setDyingVisuals] = useState<DyingVisual[]>([]);
  const [killBanners, setKillBanners] = useState<KillBanner[]>([]);
  const prevHpRef = useRef<Record<string, number> | null>(null);
  const prevSnapRef = useRef<Record<string, UnitSnap> | null>(null);
  const prevEpochRef = useRef(visualEpoch);
  const prevPhaseRef = useRef<BattlePhase | null>(null);
  const prevTurnBattleRef = useRef<"player" | "enemy" | undefined>(undefined);
  const turnBannerTimerRef = useRef<number>(0);
  const [turnBanner, setTurnBanner] = useState<"player" | "enemy" | null>(null);
  const [turnBannerSeq, setTurnBannerSeq] = useState(0);

  useEffect(() => {
    if (prevEpochRef.current === visualEpoch) return;
    prevEpochRef.current = visualEpoch;
    prevHpRef.current = null;
    prevSnapRef.current = null;
    prevTurnBattleRef.current = undefined;
    window.clearTimeout(turnBannerTimerRef.current);
    setTurnBanner(null);
    setMoveSlide({});
    setDyingVisuals([]);
    setKillBanners([]);
    setDmgFx(null);
  }, [visualEpoch]);

  useEffect(() => {
    if (battle.outcome !== "playing") {
      window.clearTimeout(turnBannerTimerRef.current);
      setTurnBanner(null);
      prevTurnBattleRef.current = battle.turn;
      return;
    }
    const prev = prevTurnBattleRef.current;
    const curr = battle.turn;
    const turnChanged = prev !== curr;
    if (turnChanged) {
      prevTurnBattleRef.current = curr;
      setTurnBanner(curr);
      setTurnBannerSeq((n) => n + 1);
    }
    /* 每次 effect 执行都重新挂载关闭定时器，避免 Strict Mode cleanup 或合盖休眠后定时器丢失导致字幕层逻辑上“永远不关” */
    window.clearTimeout(turnBannerTimerRef.current);
    turnBannerTimerRef.current = window.setTimeout(() => {
      setTurnBanner(null);
    }, TURN_PHASE_BANNER_MS);
    return () => window.clearTimeout(turnBannerTimerRef.current);
  }, [battle.turn, battle.outcome]);

  const tabWasHiddenRef = useRef(false);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        tabWasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState === "visible" && tabWasHiddenRef.current) {
        tabWasHiddenRef.current = false;
        window.clearTimeout(turnBannerTimerRef.current);
        setTurnBanner(null);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!turnBanner) return;
    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", block, true);
    window.addEventListener("keyup", block, true);
    return () => {
      window.removeEventListener("keydown", block, true);
      window.removeEventListener("keyup", block, true);
    };
  }, [turnBanner]);

  const selectedUnit = selectedId ? units.find((u) => u.id === selectedId) : undefined;
  const attackOk =
    phase === "menu" && selectedUnit
      ? canMeleeAttack(selectedUnit, units)
      : false;
  const tacticOk =
    phase === "menu" && selectedUnit ? canUseTactic(selectedUnit, battle) : false;

  const tacticEnabled =
    phase === "tactic-menu" && selectedUnit
      ? TACTIC_ORDER.map((k) => canAffordTactic(selectedUnit, k, battle))
      : [false, false, false];

  const focusedEnemyId =
    phase === "pick-target" && pickTarget && pickTarget.targetIds.length > 0
      ? pickTarget.targetIds[pickTarget.focusIndex]
      : null;

  useEffect(() => {
    const prev = prevPhaseRef.current;
    const enteredMenu = phase === "menu" && prev !== "menu";
    const enteredTactic = phase === "tactic-menu" && prev !== "tactic-menu";
    prevPhaseRef.current = phase;
    if (enteredTactic) {
      const en = TACTIC_ORDER.map((k) =>
        selectedUnit ? canAffordTactic(selectedUnit, k, battle) : false
      );
      const first = en.findIndex(Boolean);
      setTacticFocus(first >= 0 ? first : 0);
    }
    if (!enteredMenu || !selectedId) return;
    const su = units.find((u) => u.id === selectedId);
    if (!su) return;
    if (canMeleeAttack(su, units)) setMenuFocus(0);
    else if (canUseTactic(su, battle)) setMenuFocus(1);
    else setMenuFocus(2);
  }, [phase, selectedId, units, battle, selectedUnit]);

  useEffect(() => {
    if (!prevSnapRef.current || !prevHpRef.current) {
      const snap: Record<string, UnitSnap> = {};
      const hpMap: Record<string, number> = {};
      for (const u of units) {
        snap[u.id] = { x: u.x, y: u.y, hp: u.hp };
        hpMap[u.id] = u.hp;
      }
      prevSnapRef.current = snap;
      prevHpRef.current = hpMap;
      return;
    }

    for (const u of units) {
      const prevHp = prevHpRef.current[u.id];
      if (prevHp !== undefined && u.hp < prevHp && u.hp > 0) {
        setDmgFx({
          unitId: u.id,
          amount: prevHp - u.hp,
          key: Date.now() + Math.random(),
        });
      }

      const old = prevSnapRef.current[u.id];
      if (old) {
        if (old.hp > 0 && u.hp <= 0) {
          const k = Date.now() + Math.random();
          setDyingVisuals((list) => [
            ...list,
            {
              key: k,
              x: old.x,
              y: old.y,
              name: u.name,
              side: u.side,
              level: u.level,
            },
          ]);
          setKillBanners((list) =>
            [...list, { key: k, text: `${u.name}被斩于阵前` }].slice(-8)
          );
          window.setTimeout(() => {
            setDyingVisuals((list) => list.filter((d) => d.key !== k));
          }, 980);
          window.setTimeout(() => {
            setKillBanners((list) => list.filter((b) => b.key !== k));
          }, 3200);
        } else if (old.hp > 0 && u.hp > 0 && (old.x !== u.x || old.y !== u.y)) {
          const id = u.id;
          const dx = old.x - u.x;
          const dy = old.y - u.y;
          setMoveSlide((prev) => ({ ...prev, [id]: { dx, dy } }));
          window.setTimeout(() => {
            setMoveSlide((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          }, 460);
        }
      }

      prevSnapRef.current[u.id] = { x: u.x, y: u.y, hp: u.hp };
      prevHpRef.current[u.id] = u.hp;
    }
  }, [units]);

  useEffect(() => {
    if (!dmgFx) return;
    const t = window.setTimeout(() => setDmgFx(null), 720);
    return () => window.clearTimeout(t);
  }, [dmgFx]);

  const onMenuKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "menu" || outcome !== "playing" || turn !== "player") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeOrRevert();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setMenuFocus((f) => nextEnabledFocus(f, 1, attackOk, tacticOk));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setMenuFocus((f) => nextEnabledFocus(f, -1, attackOk, tacticOk));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const action = MENU_ORDER[menuFocus];
        if (action === "attack" && attackOk) onMenuAction("attack");
        else if (action === "tactic" && tacticOk) onMenuAction("tactic");
        else if (action === "wait") onMenuAction("wait");
      }
    },
    [
      phase,
      outcome,
      turn,
      menuFocus,
      attackOk,
      tacticOk,
      onMenuAction,
      onEscapeOrRevert,
    ]
  );

  const onTacticMenuKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "tactic-menu" || outcome !== "playing" || turn !== "player") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeOrRevert();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setTacticFocus((f) => nextTacticFocus(f, 1, tacticEnabled));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setTacticFocus((f) => nextTacticFocus(f, -1, tacticEnabled));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const k = TACTIC_ORDER[tacticFocus];
        if (tacticEnabled[tacticFocus]) onTacticPick(k);
      }
    },
    [
      phase,
      outcome,
      turn,
      tacticFocus,
      tacticEnabled,
      onTacticPick,
      onEscapeOrRevert,
    ]
  );

  const onMovePhaseKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "move" || outcome !== "playing" || turn !== "player") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeOrRevert();
      }
    },
    [phase, outcome, turn, onEscapeOrRevert]
  );

  const onPickKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "pick-target" || outcome !== "playing" || turn !== "player") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeOrRevert();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const d =
          e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        onPickNavigate(d);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onPickConfirmFocused();
      }
    },
    [phase, outcome, turn, onEscapeOrRevert, onPickNavigate, onPickConfirmFocused]
  );

  useEffect(() => {
    if (phase !== "menu") return;
    window.addEventListener("keydown", onMenuKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onMenuKeyDown as unknown as EventListener);
  }, [phase, onMenuKeyDown]);

  useEffect(() => {
    if (phase !== "tactic-menu") return;
    window.addEventListener("keydown", onTacticMenuKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onTacticMenuKeyDown as unknown as EventListener);
  }, [phase, onTacticMenuKeyDown]);

  useEffect(() => {
    if (phase !== "pick-target") return;
    window.addEventListener("keydown", onPickKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onPickKeyDown as unknown as EventListener);
  }, [phase, onPickKeyDown]);

  useEffect(() => {
    if (phase !== "move") return;
    window.addEventListener("keydown", onMovePhaseKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onMovePhaseKeyDown as unknown as EventListener);
  }, [phase, onMovePhaseKeyDown]);

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      if (outcome !== "playing" || turn !== "player") return;
      if (
        phase === "move" ||
        phase === "menu" ||
        phase === "tactic-menu" ||
        phase === "pick-target"
      ) {
        e.preventDefault();
        onEscapeOrRevert();
      }
    },
    [outcome, turn, phase, onEscapeOrRevert]
  );

  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      cells.push({ x, y });
    }
  }
  const byPos = new Map<string, (typeof units)[0]>();
  for (const u of units) {
    if (u.hp > 0) byPos.set(`${u.x},${u.y}`, u);
  }

  const tryActivateMenu = (index: number) => {
    const action = MENU_ORDER[index];
    if (action === "attack" && attackOk) onMenuAction("attack");
    else if (action === "tactic" && tacticOk) onMenuAction("tactic");
    else if (action === "wait") onMenuAction("wait");
  };

  const isPickCandidate =
    phase === "pick-target" && pickTarget
      ? (id: string) => pickTarget.targetIds.includes(id)
      : () => false;

  const terrainAt = (x: number, y: number): Terrain => terrain[y]?.[x] ?? "plain";
  const terrainClass = (x: number, y: number) => `terrain-${terrainAt(x, y)}`;

  const turnBannerLabel =
    turnBanner === "player" ? "我方回合" : turnBanner === "enemy" ? "敌方回合" : "";

  const showMoveRange =
    outcome === "playing" &&
    turn === "player" &&
    phase === "move" &&
    Boolean(selectedId) &&
    moveTargets.length > 0;

  return (
    <div
      className="battle-wrap"
      role="application"
      aria-label="battlefield"
      onContextMenu={onContextMenu}
    >
      {turnBanner && (
        <div
          className={`turn-phase-banner-root turn-phase-banner-${turnBanner}`}
          role="status"
          aria-live="polite"
          aria-label={turnBannerLabel}
        >
          <p key={turnBannerSeq} className="turn-phase-banner-text">
            {turnBannerLabel}
          </p>
        </div>
      )}
      {killBanners.length > 0 && (
        <div className="kill-banner-stack" aria-live="polite">
          {killBanners.map((b) => (
            <p key={b.key} className="kill-banner-line">
              {b.text}
            </p>
          ))}
        </div>
      )}
      <div
        className={["battle-grid", showMoveRange ? "battle-grid--move-preview" : ""]
          .filter(Boolean)
          .join(" ")}
        style={{
          gridTemplateColumns: `repeat(${gridW}, var(--cell))`,
        }}
      >
        {cells.map(({ x, y }) => {
          const u = byPos.get(`${x},${y}`);
          const isMove = moveSet.has(`${x},${y}`);
          const isSelected = u && u.id === selectedId;
          const turnDone = u && u.hp > 0 && u.moved && u.acted;
          const onOwnCell =
            phase === "move" &&
            selectedId &&
            (() => {
              const su = units.find((z) => z.id === selectedId);
              return su && !su.moved && su.x === x && su.y === y;
            })();
          const canClickTile =
            outcome === "playing" &&
            turn === "player" &&
            phase === "move" &&
            (isMove || onOwnCell) &&
            selectedId;
          const showMenu =
            u &&
            u.id === selectedId &&
            phase === "menu" &&
            outcome === "playing" &&
            turn === "player";
          const showTacticMenu =
            u &&
            u.id === selectedId &&
            phase === "tactic-menu" &&
            outcome === "playing" &&
            turn === "player";
          const hitActive = dmgFx?.unitId === u?.id;
          const pickCand = u && u.side === "enemy" && isPickCandidate(u.id);
          const pickFocus = u && u.id === focusedEnemyId;
          const slide = u && moveSlide[u.id];
          const pendingSelectionGlow =
            isSelected &&
            u &&
            u.hp > 0 &&
            !(u.moved && u.acted) &&
            outcome === "playing" &&
            turn === "player" &&
            (phase === "select" || phase === "move" || phase === "menu" || phase === "tactic-menu");

          return (
            <div
              key={`${x}-${y}`}
              className={[
                "cell",
                terrainClass(x, y),
                isMove ? "move-hint" : "",
                u ? "has-unit" : "",
                canClickTile ? "clickable-tile" : "",
                showMenu || showTacticMenu ? "cell-menu-open" : "",
                pickCand ? "cell-pick-candidate" : "",
                pickFocus ? "cell-pick-focus" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (canClickTile) onCellClick(x, y);
              }}
              title={`${TERRAIN_LABEL[terrainAt(x, y)]} (${x + 1},${y + 1})`}
              role="presentation"
            >
              {u && (
                <div
                  role="button"
                  tabIndex={0}
                  className={[
                    "unit-token",
                    u.side,
                    slide ? "unit-move-slide" : "",
                    isSelected ? "selected" : "",
                    turnDone ? "unit-turn-done" : "",
                    pendingSelectionGlow ? "unit-pending-highlight" : "",
                    hitActive ? "unit-hit" : "",
                    pickCand ? "pick-target-candidate" : "",
                    pickFocus ? "pick-target-focus" : "",
                    outcome === "playing" &&
                    turn === "player" &&
                    (phase === "move" || phase === "menu" || phase === "tactic-menu") &&
                    u.side === "player" &&
                    u.hp > 0 &&
                    !(u.moved && u.acted)
                      ? "selectable"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    slide
                      ? ({
                          "--sdx": String(slide.dx),
                          "--sdy": String(slide.dy),
                        } as CSSProperties)
                      : undefined
                  }
                  onMouseEnter={() => {
                    if (phase === "pick-target" && u.side === "enemy" && isPickCandidate(u.id)) {
                      onPickHoverEnemy(u.id);
                    }
                  }}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    onUnitClick(u.id, u.side);
                  }}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onUnitClick(u.id, u.side);
                    }
                  }}
                >
                  <span className="unit-level-badge" aria-label={`等级 ${u.level}`}>
                    Lv.{u.level}
                  </span>
                  {hitActive && dmgFx && (
                    <span className="dmg-float" key={dmgFx.key}>
                      -{dmgFx.amount}
                    </span>
                  )}
                  <span className="unit-name">{u.name}</span>
                  <span className="unit-hp">
                    {u.hp}/{u.maxHp}
                  </span>
                  {showMenu && (
                    <div
                      className="action-menu"
                      role="menu"
                      aria-label="Actions"
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                      onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className={[
                          "action-menu-item",
                          attackOk ? "enabled" : "disabled",
                          menuFocus === 0 ? "focused" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={!attackOk}
                        onMouseEnter={() => setMenuFocus(0)}
                        onClick={() => tryActivateMenu(0)}
                      >
                        发动攻击
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={[
                          "action-menu-item",
                          tacticOk ? "enabled" : "disabled",
                          menuFocus === 1 ? "focused" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={!tacticOk}
                        onMouseEnter={() => setMenuFocus(1)}
                        onClick={() => tryActivateMenu(1)}
                      >
                        使用计策
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={[
                          "action-menu-item",
                          "enabled",
                          menuFocus === 2 ? "focused" : "",
                        ].join(" ")}
                        onMouseEnter={() => setMenuFocus(2)}
                        onClick={() => tryActivateMenu(2)}
                      >
                        待机
                      </button>
                    </div>
                  )}
                  {showTacticMenu && (
                    <div
                      className="action-menu tactic-submenu"
                      role="menu"
                      aria-label="Tactics"
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                      onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
                    >
                      {TACTIC_ORDER.map((kind, i) => {
                        const def = TACTIC_DEF[kind];
                        const ok = tacticEnabled[i];
                        return (
                          <button
                            key={kind}
                            type="button"
                            role="menuitem"
                            className={[
                              "action-menu-item",
                              ok ? "enabled" : "disabled",
                              tacticFocus === i ? "focused" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            disabled={!ok}
                            onMouseEnter={() => setTacticFocus(i)}
                            onClick={() => ok && onTacticPick(kind)}
                          >
                            {def.name}（{def.cost} 计）
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        role="menuitem"
                        className="action-menu-item enabled"
                        onClick={onEscapeOrRevert}
                      >
                        返回
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {dyingVisuals.map((d) => (
          <div
            key={d.key}
            className="death-ghost-cell"
            style={{ gridColumn: d.x + 1, gridRow: d.y + 1 }}
            aria-hidden
          >
            <div className={`unit-token ${d.side} unit-death-fade`}>
              <span className="unit-level-badge" aria-hidden>
                Lv.{d.level}
              </span>
              <span className="unit-name">{d.name}</span>
              <span className="unit-hp">0</span>
            </div>
          </div>
        ))}
      </div>
      {phase === "menu" && (
        <p className="menu-hint">
          方向键选择 · Enter 确认 · Esc / 右键 取消并恢复回合初状态
        </p>
      )}
      {phase === "tactic-menu" && (
        <p className="menu-hint">
          方向键选择计策 · Enter 确认 · Esc / 右键 返回行动菜单
        </p>
      )}
      {phase === "pick-target" && (
        <p className="menu-hint">
          方向键切换目标 · Enter 确认 · Esc / 右键 返回上一层
        </p>
      )}
    </div>
  );
}
