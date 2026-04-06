import type { Terrain, Unit } from "../game/types";

/** 相对整张可滚动战场的视口矩形，0–1 归一化（与主战场 scroll 同步） */
export type BattleViewportNorm = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  gridW: number;
  gridH: number;
  terrain: Terrain[][];
  units: readonly Unit[];
  viewport: BattleViewportNorm | null;
  battleRound: number;
  maxBattleRounds: number;
};

function terrainAt(terrain: Terrain[][], x: number, y: number): Terrain {
  return terrain[y]?.[x] ?? "plain";
}

export default function BattleOverviewMap({
  gridW,
  gridH,
  terrain,
  units,
  viewport,
  battleRound,
  maxBattleRounds,
}: Props) {
  const cells: { x: number; y: number; t: Terrain }[] = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      cells.push({ x, y, t: terrainAt(terrain, x, y) });
    }
  }

  const vp = viewport;
  const showVp =
    vp &&
    vp.width > 0 &&
    vp.height > 0 &&
    (vp.width < 0.998 || vp.height < 0.998 || vp.left > 0.002 || vp.top > 0.002);

  const r = battleRound >= 1 ? battleRound : 1;
  const cap = maxBattleRounds > 0 ? maxBattleRounds : 0;

  return (
    <div className="battle-overview" aria-label="战场缩略图">
      <p className="battle-overview__title">战局略图</p>
      <p className="battle-overview__rounds" aria-live="polite">
        回合 <span className="battle-overview__rounds-num">{r}</span>
        <span className="battle-overview__rounds-sep"> / </span>
        <span className="battle-overview__rounds-num">{cap > 0 ? cap : "—"}</span>
      </p>
      <div
        className="battle-overview__frame"
        style={{
          aspectRatio: `${gridW} / ${gridH}`,
        }}
      >
        <div
          className="battle-overview__grid"
          style={{
            gridTemplateColumns: `repeat(${gridW}, 1fr)`,
            gridTemplateRows: `repeat(${gridH}, 1fr)`,
          }}
        >
          {cells.map(({ x, y, t }) => (
            <div
              key={`${x}-${y}`}
              className={["battle-overview__cell", `battle-overview__cell--${t}`].join(" ")}
              title={`(${x + 1},${y + 1})`}
            />
          ))}
        </div>
        {units.map((u) => (
          <div
            key={u.id}
            className={[
              "battle-overview__unit",
              u.side === "player" ? "battle-overview__unit--player" : "battle-overview__unit--enemy",
              u.hp <= 0 ? "battle-overview__unit--dead" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${((u.x + 0.5) / gridW) * 100}%`,
              top: `${((u.y + 0.5) / gridH) * 100}%`,
            }}
            title={u.hp <= 0 ? `${u.name}（阵亡）` : u.name}
          />
        ))}
        {showVp && vp && (
          <div
            className="battle-overview__viewport"
            style={{
              left: `${vp.left * 100}%`,
              top: `${vp.top * 100}%`,
              width: `${vp.width * 100}%`,
              height: `${vp.height * 100}%`,
            }}
            aria-hidden
          />
        )}
      </div>
      <p className="battle-overview__hint muted small">
        {showVp ? "黄框为当前网页可见区域" : "当前可见整张战场"}
      </p>
    </div>
  );
}
