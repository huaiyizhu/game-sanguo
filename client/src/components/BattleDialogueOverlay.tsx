import { useCallback, useEffect } from "react";
import type { BattleScriptLineResolved } from "../game/types";
import GeneralAvatar from "./GeneralAvatar";

type Props = {
  line: BattleScriptLineResolved;
  /** 如「2 / 5」 */
  progressLabel: string;
  onAdvance: () => void;
};

export default function BattleDialogueOverlay({ line, progressLabel, onAdvance }: Props) {
  const advance = useCallback(() => {
    onAdvance();
  }, [onAdvance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      advance();
    };
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      advance();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [advance]);

  const sideLabel = line.side === "player" ? "我军" : "敌军";

  return (
    <div
      className="battle-dialogue-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="剧情对白"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="battle-dialogue-overlay__dim" aria-hidden />
      <div className="battle-dialogue-overlay__card">
        <div className="battle-dialogue-overlay__head">
          {line.portraitCatalogId ? (
            <GeneralAvatar name={line.name} catalogId={line.portraitCatalogId} size={56} />
          ) : (
            <div className="battle-dialogue-overlay__avatar-fallback" aria-hidden>
              旁白
            </div>
          )}
          <div className="battle-dialogue-overlay__who">
            <span className="battle-dialogue-overlay__name">{line.name}</span>
            <span className="battle-dialogue-overlay__meta">
              {sideLabel} · Lv.{line.level}
            </span>
          </div>
          <span className="battle-dialogue-overlay__progress">{progressLabel}</span>
        </div>
        <p className="battle-dialogue-overlay__text">{line.text}</p>
        <p className="battle-dialogue-overlay__hint muted small">按任意键或点击屏幕继续</p>
      </div>
    </div>
  );
}
