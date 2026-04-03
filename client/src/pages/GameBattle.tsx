import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  canMeleeAttack,
  canUseTactic,
} from "../game/battle";
import type { BattlePhase, BattleState, Side } from "../game/types";

export type MenuAction = "attack" | "tactic" | "wait";

type Props = {
  battle: BattleState;
  onCellClick: (x: number, y: number) => void;
  onUnitClick: (unitId: string, side: Side) => void;
  onMenuAction: (action: MenuAction) => void;
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

export default function GameBattle({
  battle,
  onCellClick,
  onUnitClick,
  onMenuAction,
  onEscapeOrRevert,
  onPickNavigate,
  onPickConfirmFocused,
  onPickHoverEnemy,
}: Props) {
  const { gridW, gridH, units, moveTargets, selectedId, turn, phase, outcome, pickTarget } =
    battle;
  const moveSet = new Set(moveTargets.map((t) => `${t.x},${t.y}`));
  const [menuFocus, setMenuFocus] = useState(0);
  const [dmgFx, setDmgFx] = useState<{
    unitId: string;
    amount: number;
    key: number;
  } | null>(null);
  const prevHpRef = useRef<Record<string, number> | null>(null);
  const prevPhaseRef = useRef<BattlePhase | null>(null);

  const selectedUnit = selectedId ? units.find((u) => u.id === selectedId) : undefined;
  const attackOk =
    phase === "menu" && selectedUnit
      ? canMeleeAttack(selectedUnit, units)
      : false;
  const tacticOk =
    phase === "menu" && selectedUnit
      ? canUseTactic(selectedUnit, units)
      : false;

  const focusedEnemyId =
    phase === "pick-target" && pickTarget && pickTarget.targetIds.length > 0
      ? pickTarget.targetIds[pickTarget.focusIndex]
      : null;

  useEffect(() => {
    const prev = prevPhaseRef.current;
    const enteredMenu = phase === "menu" && prev !== "menu";
    prevPhaseRef.current = phase;
    if (!enteredMenu || !selectedId) return;
    const su = units.find((u) => u.id === selectedId);
    if (!su) return;
    if (canMeleeAttack(su, units)) setMenuFocus(0);
    else if (canUseTactic(su, units)) setMenuFocus(1);
    else setMenuFocus(2);
  }, [phase, selectedId, units]);

  useEffect(() => {
    if (!prevHpRef.current) {
      prevHpRef.current = Object.fromEntries(units.map((u) => [u.id, u.hp]));
      return;
    }
    for (const u of units) {
      const prev = prevHpRef.current[u.id];
      if (prev !== undefined && u.hp < prev) {
        setDmgFx({
          unitId: u.id,
          amount: prev - u.hp,
          key: Date.now() + Math.random(),
        });
      }
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
    if (phase !== "pick-target") return;
    window.addEventListener("keydown", onPickKeyDown as unknown as EventListener);
    return () =>
      window.removeEventListener("keydown", onPickKeyDown as unknown as EventListener);
  }, [phase, onPickKeyDown]);

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      if (outcome !== "playing" || turn !== "player") return;
      if (phase === "menu" || phase === "pick-target") {
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

  return (
    <div
      className="battle-wrap"
      role="application"
      aria-label="battlefield"
      onContextMenu={onContextMenu}
    >
      <div
        className="battle-grid"
        style={{
          gridTemplateColumns: `repeat(${gridW}, var(--cell))`,
        }}
      >
        {cells.map(({ x, y }) => {
          const u = byPos.get(`${x},${y}`);
          const isMove = moveSet.has(`${x},${y}`);
          const isSelected = u && u.id === selectedId;
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
          const hitActive = dmgFx?.unitId === u?.id;
          const pickCand = u && u.side === "enemy" && isPickCandidate(u.id);
          const pickFocus = u && u.id === focusedEnemyId;

          return (
            <div
              key={`${x}-${y}`}
              className={[
                "cell",
                (x + y) % 2 === 0 ? "even" : "odd",
                isMove ? "move-hint" : "",
                u ? "has-unit" : "",
                canClickTile ? "clickable-tile" : "",
                showMenu ? "cell-menu-open" : "",
                pickCand ? "cell-pick-candidate" : "",
                pickFocus ? "cell-pick-focus" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (canClickTile) onCellClick(x, y);
              }}
              role="presentation"
            >
              {u && (
                <div
                  role="button"
                  tabIndex={0}
                  className={[
                    "unit-token",
                    u.side,
                    isSelected ? "selected" : "",
                    hitActive ? "unit-hit" : "",
                    pickCand ? "pick-target-candidate" : "",
                    pickFocus ? "pick-target-focus" : "",
                    outcome === "playing" &&
                    turn === "player" &&
                    (phase === "move" || phase === "menu") &&
                    u.side === "player" &&
                    u.hp > 0 &&
                    !(u.moved && u.acted)
                      ? "selectable"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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
                </div>
              )}
            </div>
          );
        })}
      </div>
      {phase === "menu" && (
        <p className="menu-hint">
          方向键选择 · Enter 确认 · Esc / 右键 取消并恢复回合初状态
        </p>
      )}
      {phase === "pick-target" && (
        <p className="menu-hint">
          方向键切换目标 · Enter 确认 · Esc / 右键 返回菜单
        </p>
      )}
    </div>
  );
}
