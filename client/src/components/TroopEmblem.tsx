import type { Side, TroopKind } from "../game/types";
import { TROOP_KIND_BADGE, TROOP_KIND_LABEL } from "../game/types";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  troopWalkFrameCount,
  troopWalkFrameIntervalMs,
  troopWalkFrameUrl,
  type TroopWalkFacing,
} from "../game/troopWalkSprites";

export type TroopFacing = TroopWalkFacing;
type Props = {
  kind: TroopKind;
  side: Side;
  showTroopBadge?: boolean;
  facing?: TroopFacing;
  /** idle：站立；walk：格间滑动时启用多帧行走（见 troopWalkSprites） */
  motion?: "idle" | "walk";
};

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
 *
 * 走格多帧：`game/troopWalkSprites.ts` 中把 `TROOP_WALK_FRAME_COUNT[kind]` 改为 >1 后，
 * 按 `{kind}_{facing}_walk_{i}.png` 命名放入 `public/sprites/units/` 即可自动轮播。
 */
export default function TroopEmblem({
  kind,
  side,
  showTroopBadge = true,
  facing = "up",
  motion = "idle",
}: Props) {
  const label = TROOP_KIND_LABEL[kind];
  const ch = TROOP_KIND_BADGE[kind];
  const frameCount = troopWalkFrameCount(kind);
  const walkSequenceEnabled = motion === "walk" && frameCount > 1;
  /** 多帧 walk 图缺失时回退到单张朝向图，避免 onError 死循环 */
  const [walkFramesDisabled, setWalkFramesDisabled] = useState(false);
  /** 单张默认立绘（如 archer.png）通常朝右；左向需镜像。四向图 *_left.png 已是朝左，不可再 scaleX(-1)。 */
  const [usingRasterFallback, setUsingRasterFallback] = useState(false);
  const [src, setSrc] = useState(() => directionalSrc(kind, facing));

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useLayoutEffect(() => {
    setUsingRasterFallback(false);
    if (motion === "idle") setWalkFramesDisabled(false);
    if (motion !== "walk" || frameCount <= 1) {
      setSrc(directionalSrc(kind, facing));
    }
  }, [kind, facing, motion, frameCount]);

  useEffect(() => {
    if (!walkSequenceEnabled || reducedMotion || walkFramesDisabled) {
      setSrc(directionalSrc(kind, facing));
      return;
    }
    const tick = troopWalkFrameIntervalMs(kind);
    if (tick <= 0) return;
    let frame = 0;
    setSrc(troopWalkFrameUrl(kind, facing, 0));
    const id = window.setInterval(() => {
      frame = (frame + 1) % frameCount;
      setSrc(troopWalkFrameUrl(kind, facing, frame));
    }, tick);
    return () => clearInterval(id);
  }, [
    walkSequenceEnabled,
    reducedMotion,
    walkFramesDisabled,
    kind,
    facing,
    frameCount,
  ]);

  return (
    <span className={`unit-troop-figure troop-figure-${kind} unit-troop-figure--raster`} title={label}>
      <span className="unit-troop-figure-model unit-troop-figure-model--raster" aria-hidden>
        <img
          src={src}
          alt=""
          className={[
            `unit-troop-sprite unit-troop-sprite--${kind} unit-troop-sprite--dir-${facing}`,
            usingRasterFallback ? "unit-troop-sprite--raster-fallback" : "",
            side === "enemy" ? "unit-troop-sprite--enemy" : "",
            motion === "walk" ? "unit-troop-sprite--walking" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onError={() => {
            if (walkSequenceEnabled && !walkFramesDisabled) {
              setWalkFramesDisabled(true);
              setUsingRasterFallback(false);
              setSrc(directionalSrc(kind, facing));
              return;
            }
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
