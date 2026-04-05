import type { Side, TroopKind } from "../game/types";
import { TROOP_KIND_BADGE, TROOP_KIND_LABEL } from "../game/types";

type Props = { kind: TroopKind; side: Side; showTroopBadge?: boolean };

const base = import.meta.env.BASE_URL;

const RASTER_SRC: Record<TroopKind, string> = {
  cavalry: `${base}sprites/units/cavalry.png`,
  infantry: `${base}sprites/units/infantry.png`,
  archer: `${base}sprites/units/archer.png`,
};

/**
 * 战场兵种：骑兵 / 步兵 / 弓兵均为同尺寸透明底 PNG（512×512，
 * 由 remove-sprite-bg（npm run sprites:units-final）抠底去水印后 normalize-unit-sprites 统一画布）。
 */
export default function TroopEmblem({ kind, side, showTroopBadge = true }: Props) {
  const label = TROOP_KIND_LABEL[kind];
  const ch = TROOP_KIND_BADGE[kind];

  return (
    <span className={`unit-troop-figure troop-figure-${kind} unit-troop-figure--raster`} title={label}>
      <span className="unit-troop-figure-model unit-troop-figure-model--raster" aria-hidden>
        <img
          src={RASTER_SRC[kind]}
          alt=""
          className={`unit-troop-sprite unit-troop-sprite--${kind} ${side === "enemy" ? "unit-troop-sprite--enemy" : ""}`}
          draggable={false}
        />
      </span>
      {showTroopBadge ? (
        <span className="unit-troop-figure-badge" aria-hidden>
          {ch}
        </span>
      ) : null}
    </span>
  );
}
