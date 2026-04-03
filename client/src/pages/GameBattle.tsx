import type { KeyboardEvent, MouseEvent } from "react";
import type { BattleState, Side } from "../game/types";

type Props = {
  battle: BattleState;
  onCellClick: (x: number, y: number) => void;
  onUnitClick: (unitId: string, side: Side) => void;
};

export default function GameBattle({ battle, onCellClick, onUnitClick }: Props) {
  const { gridW, gridH, units, moveTargets, selectedId, turn, phase, outcome } = battle;
  const moveSet = new Set(moveTargets.map((t) => `${t.x},${t.y}`));
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

  return (
    <div className="battle-wrap">
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
          const canClickTile =
            outcome === "playing" &&
            turn === "player" &&
            phase === "move" &&
            isMove &&
            selectedId;
          return (
            <div
              key={`${x}-${y}`}
              className={[
                "cell",
                (x + y) % 2 === 0 ? "even" : "odd",
                isMove ? "move-hint" : "",
                u ? "has-unit" : "",
                canClickTile ? "clickable-tile" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (canClickTile) onCellClick(x, y);
              }}
              role="presentation"
            >
              {u && (
                <span
                  role="button"
                  tabIndex={0}
                  className={[
                    "unit-token",
                    u.side,
                    isSelected ? "selected" : "",
                    outcome === "playing" &&
                    turn === "player" &&
                    (phase === "move" || phase === "act") &&
                    u.side === "player" &&
                    u.hp > 0 &&
                    !(u.moved && u.acted)
                      ? "selectable"
                      : "",
                    outcome === "playing" &&
                    turn === "player" &&
                    phase === "act" &&
                    selectedId &&
                    u.side === "enemy"
                      ? "attackable"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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
                  <span className="unit-name">{u.name}</span>
                  <span className="unit-hp">
                    {u.hp}/{u.maxHp}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
