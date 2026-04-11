import type { Side, TroopKind } from "../game/types";
import { TROOP_KIND_BADGE, TROOP_KIND_LABEL } from "../game/types";
import { useEffect, useState } from "react";

export type TroopFacing = "left" | "right" | "up" | "down";
type Props = { kind: TroopKind; side: Side; showTroopBadge?: boolean; facing?: TroopFacing };

const base = import.meta.env.BASE_URL;

const RASTER_SRC: Record<TroopKind, string> = {
  cavalry: `${base}sprites/units/cavalry.png`,
  infantry: `${base}sprites/units/infantry.png`,
  archer: `${base}sprites/units/archer.png`,
};

function directionalSrc(kind: TroopKind, facing: TroopFacing): string {
  return `${base}sprites/units/${kind}_${facing}.png`;
}

/**
 * 战场兵种：骑兵 / 步兵 / 弓兵均为同尺寸透明底 PNG（512×512，
 * 由 remove-sprite-bg（npm run sprites:units-final）抠底去水印后 normalize-unit-sprites 统一画布）。
 */
export default function TroopEmblem({
  kind,
  side,
  showTroopBadge = true,
  facing = "up",
}: Props) {
  const label = TROOP_KIND_LABEL[kind];
  const ch = TROOP_KIND_BADGE[kind];
  const [src, setSrc] = useState(() => directionalSrc(kind, facing));
  /** 单张默认立绘（如 archer.png）通常朝右；左向需镜像。四向图 *_left.png 已是朝左，不可再 scaleX(-1)。 */
  const [usingRasterFallback, setUsingRasterFallback] = useState(false);

  useEffect(() => {
    setUsingRasterFallback(false);
    setSrc(directionalSrc(kind, facing));
  }, [kind, facing]);

  return (
    <span className={`unit-troop-figure troop-figure-${kind} unit-troop-figure--raster`} title={label}>
      <span className="unit-troop-figure-model unit-troop-figure-model--raster" aria-hidden>
        <img
          src={src}
          alt=""
          className={`unit-troop-sprite unit-troop-sprite--${kind} unit-troop-sprite--dir-${facing} ${usingRasterFallback ? "unit-troop-sprite--raster-fallback" : ""} ${side === "enemy" ? "unit-troop-sprite--enemy" : ""}`}
          onError={() => {
            setUsingRasterFallback(true);
            setSrc(RASTER_SRC[kind]);
          }}
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
