import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getGeneralCatalogEntry } from "../game/generals";
import { avatarGradientStyle, portraitInitial } from "../game/generalPortrait";
import { portraitImageCandidates } from "../game/portraitUrls";

type Props = {
  name: string;
  catalogId?: string | null;
  factionHint?: string;
  size?: number;
  variant?: "inline" | "standee";
  className?: string;
  title?: string;
};

export default function GeneralAvatar({
  name,
  catalogId,
  factionHint,
  size = 40,
  variant = "inline",
  className = "",
  title,
}: Props) {
  const entry = catalogId ? getGeneralCatalogEntry(catalogId) : undefined;
  const faction = entry?.faction ?? factionHint ?? "群";
  const seed = catalogId ?? name;
  const { background, boxShadow } = avatarGradientStyle(seed, faction);
  const ch = portraitInitial(name);
  const isStandee = variant === "standee";

  const candidates = useMemo(() => portraitImageCandidates(catalogId, name), [catalogId, name]);
  const [imgFailIdx, setImgFailIdx] = useState(0);

  useEffect(() => {
    setImgFailIdx(0);
  }, [candidates.join("|")]);

  const tryUrl = imgFailIdx < candidates.length ? candidates[imgFailIdx] : null;
  const showRaster = tryUrl !== null;

  const wrapStyle: CSSProperties = {
    background: showRaster ? "transparent" : background,
    boxShadow: showRaster ? "none" : boxShadow,
    ...(isStandee ? {} : { width: size, height: size }),
  };

  return (
    <div
      className={[
        "general-avatar",
        isStandee ? "general-avatar--standee" : "",
        showRaster ? "general-avatar--raster" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={wrapStyle}
      title={title ?? `${name}（${faction}）`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {showRaster ? (
        <img
          key={tryUrl}
          src={tryUrl}
          alt=""
          className="general-avatar__img"
          draggable={false}
          onError={() => setImgFailIdx((i) => i + 1)}
        />
      ) : (
        <span
          className="general-avatar__glyph"
          style={isStandee ? undefined : { fontSize: Math.max(11, Math.round(size * 0.42)) }}
        >
          {ch}
        </span>
      )}
    </div>
  );
}
