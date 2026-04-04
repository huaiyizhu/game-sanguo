import type { TroopKind } from "../game/types";
import { TROOP_KIND_BADGE, TROOP_KIND_LABEL } from "../game/types";

type Props = { kind: TroopKind };

/** 战场格内兵种识别：小图腾 SVG + 汉字徽，与 .troop-* 外形样式配合 */
export default function TroopEmblem({ kind }: Props) {
  const label = TROOP_KIND_LABEL[kind];
  const ch = TROOP_KIND_BADGE[kind];

  return (
    <span className={`unit-troop-emblem troop-emblem-${kind}`} title={label} aria-hidden>
      <span className="unit-troop-emblem-svg" aria-hidden>
        {kind === "cavalry" && <CavalryGlyph />}
        {kind === "infantry" && <InfantryGlyph />}
        {kind === "archer" && <ArcherGlyph />}
      </span>
      <span className="unit-troop-emblem-char">{ch}</span>
    </span>
  );
}

function CavalryGlyph() {
  return (
    <svg viewBox="0 0 24 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M18.2 3.2c.9-.1 1.7.4 2 1.2.3.9 0 1.8-.7 2.4l-1.1.9 1.2 2.4c.2.5 0 1.1-.5 1.3l-.8.3c-.4.2-.9 0-1.1-.4l-.9-1.8-2.1.4-1.4 2.8H11l.6-2.5-2.3-1.1c-1.3-.6-2-2-1.7-3.4.3-1.5 1.6-2.6 3.1-2.6h1.1l1.5-1.6c.5-.5 1.3-.7 2-.4l1.9.7zm-9.4 8.6c.8 0 1.4.6 1.4 1.4v6.3H6v-5.5c0-1.2 1-2.2 2.2-2.2h2.6z"
      />
    </svg>
  );
}

function InfantryGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M12 2.2L4.5 6v6.2c0 4.2 2.9 8.1 7.5 9.6 4.6-1.5 7.5-5.4 7.5-9.6V6L12 2.2zm0 3.1L17 8.3v3.9c0 2.8-1.9 5.4-5 6.6V14h-2v4.8c-3.1-1.2-5-3.8-5-6.6V8.3l5-2.9z"
      />
    </svg>
  );
}

function ArcherGlyph() {
  return (
    <svg viewBox="0 0 24 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 11c0-4.5 3.6-8 8.2-7.9 4.2.1 7.6 3.5 7.8 7.7"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M3.5 11h17"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        fill="currentColor"
        d="M6 16l2-1.2V7.5L6 6.3c-.4-.2-.7.1-.7.5v8.6c0 .4.3.7.7.6z"
      />
    </svg>
  );
}
