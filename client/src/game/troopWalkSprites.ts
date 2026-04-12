import type { TroopKind } from "./types";
import { MOVE_SLIDE_DURATION_MS } from "./battle";

/**
 * 行走多帧素材约定（占位，等你逐帧图到位后改帧数即可启用）：
 *
 * - 单张朝向图（现状）：`sprites/units/{kind}_{facing}.png`
 * - 走格循环帧（可选）：`sprites/units/{kind}_{facing}_walk_{i}.png`，`i` 从 **0** 到 **帧数−1**
 * - 当 `troopWalkFrameCount(kind) <= 1` 时，不会请求 `_walk_*` 图，只走平滑位移动画。
 *
 * 与 `MOVE_SLIDE_DURATION_MS`（battle.ts）对齐：每格滑动时长内跑完一整轮循环帧，
 * 避免下一格开始时帧序号与位移脱节。
 */
export type TroopWalkFacing = "left" | "right" | "up" | "down";

/**
 * 各兵种每方向行走序列帧数。**全部设为 1** 表示尚未接入多帧图；
 * 接入后例如步兵四向各 4 帧：`infantry: 4`（会加载 `infantry_right_walk_0.png` … `_3.png`）。
 */
export const TROOP_WALK_FRAME_COUNT: Record<TroopKind, number> = {
  infantry: 1,
  cavalry: 1,
  archer: 1,
};

export function troopWalkFrameCount(kind: TroopKind): number {
  const n = TROOP_WALK_FRAME_COUNT[kind];
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** 走格时每帧停留毫秒（整格滑动内均匀切帧） */
export function troopWalkFrameIntervalMs(kind: TroopKind): number {
  const n = troopWalkFrameCount(kind);
  if (n <= 1) return 0;
  return Math.max(40, Math.floor(MOVE_SLIDE_DURATION_MS / n));
}

const base = typeof import.meta !== "undefined" ? import.meta.env.BASE_URL : "/";

export function troopWalkFrameUrl(kind: TroopKind, facing: TroopWalkFacing, frameIndex: number): string {
  const i = Math.max(0, frameIndex);
  return `${base}sprites/units/${kind}_${facing}_walk_${i}.png`;
}
