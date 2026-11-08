"use client";

import * as React from "react";
import { championArtUrl, type CardArt } from "@/domain/player-card";
import type { CardLook, CardStyle } from "@/domain/card-style";
import { cn } from "@/lib/cn";
import { failedEarly } from "@/components/ui/remote-image";

/**
 * The artwork behind a player's card, header or preview: the chosen skin's official art (or the
 * player's banner) under a readability veil tinted with the player's colours. Used by the Team
 * card, the profile header and the Card Studio preview, so a choice looks the same everywhere
 * (the Players rows show the same choice as a faint strip: RowArtStrip below).
 *
 * - kind "splash" (landscape, ~1215×717) for large headers; "loading" (portrait crop, a few
 *   dozen KB) for small cards, so a small card never downloads a full splash.
 * - If a skin's art is missing (retired, or not published yet) it falls back to the champion's
 *   default art, then to the plain gradient; a broken image is never shown. A banner that fails
 *   falls back to the champion art.
 * - `strength` shifts the veil for surfaces with more text on the art; `look` adds the player's
 *   Studio settings (without it, the card is drawn as before the Studio). `decorate` = false
 *   leaves out motifs and animated effects for small variants.
 * - Animated effects move with transforms only (no repaint per frame). `motion` "hover" keeps
 *   them still until the card is hovered or focused (pages with several cards: never five
 *   animations at once); "always" for a single card. Reduced motion stops them everywhere.
 * - `smooth` = false drops the image's zoom transition and keeps the image on its own layer, so
 *   the Studio preview moves with a slider instead of easing along behind it.
 * - `foot`: where a player's name and details sit on the art's lower part (cards, the profile
 *   header), a shade rises from the bottom in the card's own surface colour, whatever darkness the
 *   player chose, so light artwork never washes the text out. The top keeps the chosen darkness.
 * - `priority`: the page's main picture (Team Overview's first card): fetched at once and ahead of
 *   the other pictures, instead of lazily. On a phone it is the page's largest element, and lazily
 *   it started only after layout, sharing the connection with the next cards' art
 *   (docs/PERFORMANCE.md, "Team Overview's first card"). Every other art stays lazy.
 */
export function CardArtLayer({ art, accent, kind, position = "center 20%", strength = "normal", className, testId = "card-art-image", look, decorate = true, motion = "always", smooth = true, foot = false, priority = false }: { art: CardArt | null; accent: string; kind: "splash" | "loading"; position?: string; strength?: "light" | "normal" | "strong"; className?: string; testId?: string; look?: CardLook | null; decorate?: boolean; motion?: "always" | "hover"; smooth?: boolean; foot?: boolean; priority?: boolean }) {
  const style = look?.style ?? null;
  const source = style?.art.source ?? "champion";
  const banner = source === "banner" && look?.bannerUrl ? look.bannerUrl : null;
  const champion = art && source !== "none" ? [championArtUrl(art, kind), championArtUrl({ ...art, skinNum: 0 }, kind)] : [];
  const urls = [...new Set([...(banner ? [banner] : []), ...champion])];
  const offset = strength === "strong" ? 20 : strength === "light" ? -20 : 0;
  const darkness = Math.min(95, Math.max(10, (style?.art.darkness ?? 50) + offset));
  const focus = style && (style.art.focusX !== null || style.art.focusY !== null) ? `${style.art.focusX ?? 50}% ${style.art.focusY ?? 20}%` : position;
  const highlight = style?.colours.highlight ?? 24;
  const fx = (style?.effects.intensity ?? 50) / 100;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", motion === "hover" && "card-fx-hover", className)} data-art-layer={testId} data-art={banner ? "banner" : art && source !== "none" ? `${art.championId}:${art.skinNum}` : "none"} data-art-source={banner ? "banner" : source === "none" ? "none" : "champion"}>
      {urls.length ? <ArtImage key={urls.join("|")} urls={urls} position={focus} testId={testId} art={art} zoom={style?.art.zoom ?? 1} blur={style?.art.blur ?? 0} smooth={smooth} priority={priority} /> : null}
      {style && style.colours.gradient !== "none" ? <div className={cn("absolute", style.effects.drift && decorate ? "card-fx-drift -inset-x-[15%] inset-y-0" : "inset-0")} style={washStyle(style)} data-testid="card-wash" /> : null}
      <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgb(8 12 36 / ${darkness * 0.6}%), rgb(8 12 36 / ${darkness}%), var(--card-surface, var(--color-surface)))` }} />
      {style && style.art.vignette > 0 ? <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 40%, transparent 45%, rgb(8 12 36 / ${style.art.vignette}%) 100%)` }} /> : null}
      {highlight > 0 ? <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${accent} ${highlight}%, transparent), transparent 60%)` }} /> : null}
      {style && decorate && style.effects.motif !== "none" ? <div className="absolute inset-0" style={motifStyle(style, fx)} data-testid="card-motif" data-motif={style.effects.motif} /> : null}
      {style && decorate && style.effects.shimmer ? <div className="card-fx-shimmer absolute inset-y-0 -left-1/2 w-[200%]" style={{ backgroundImage: `linear-gradient(105deg, transparent 46%, rgb(255 255 255 / ${Math.round(6 + 14 * fx)}%) 50%, transparent 54%)` }} data-testid="card-shimmer" /> : null}
      {foot ? <div className="absolute inset-x-0 bottom-0 h-3/4" style={{ background: FOOT_SCRIM }} data-testid="card-foot-scrim" /> : null}
    </div>
  );
}

// Strongest at the bottom, where the card's text is, gone by a quarter of the way from the top.
const FOOT_SCRIM = "linear-gradient(to top, color-mix(in srgb, var(--card-surface, var(--color-surface)) 82%, transparent), color-mix(in srgb, var(--card-surface, var(--color-surface)) 55%, transparent) 50%, transparent)";

function washStyle(style: CardStyle): React.CSSProperties {
  const { primary: p, secondary: s, gradient } = style.colours;
  const a = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  const image = gradient === "horizontal" ? `linear-gradient(90deg, ${a(p, 34)}, ${a(s, 34)})` : gradient === "radial" ? `radial-gradient(circle at 75% 25%, ${a(s, 36)}, ${a(p, 18)} 55%, transparent 80%)` : `linear-gradient(135deg, ${a(p, 34)}, ${a(s, 30)})`;
  return { backgroundImage: image, mixBlendMode: "screen" };
}

function motifStyle(style: CardStyle, fx: number): React.CSSProperties {
  const c = `color-mix(in srgb, ${style.colours.primary} ${Math.round(18 + 40 * fx)}%, transparent)`;
  switch (style.effects.motif) {
    case "lines":
      return { backgroundImage: `repeating-linear-gradient(135deg, ${c} 0 1px, transparent 1px 11px)`, maskImage: "linear-gradient(to bottom, #000, transparent 85%)" };
    case "dots":
      return { backgroundImage: `radial-gradient(${c} 1px, transparent 1.6px)`, backgroundSize: "12px 12px", maskImage: "linear-gradient(to bottom left, #000, transparent 70%)" };
    case "rings":
      return { backgroundImage: `repeating-radial-gradient(circle at 100% 0%, ${c} 0 1px, transparent 1px 16px)`, maskImage: "radial-gradient(circle at 100% 0%, #000, transparent 75%)" };
    case "corners": {
      const g = `linear-gradient(${c}, ${c})`;
      return {
        inset: "10px",
        backgroundImage: [g, g, g, g, g, g, g, g].join(", "),
        backgroundRepeat: "no-repeat",
        backgroundSize: "16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px",
        backgroundPosition: "0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%",
      };
    }
    default:
      return {};
  }
}

/**
 * The art's fallback chain: the first address, then the next each time one fails (the banner, the
 * chosen skin, the champion's default skin), and nothing once all have failed. A picture that
 * failed before the page was interactive moves on down the chain too. Mount it again (a key) when
 * the addresses change.
 */
function useArtChain(urls: string[]) {
  const [failed, setFailed] = React.useState(0);
  const ref = React.useCallback((img: HTMLImageElement | null) => {
    if (failedEarly(img)) setFailed((n) => n + 1);
  }, []);
  return { src: urls[failed], ref, onError: () => setFailed((n) => n + 1) };
}

/**
 * The player's art as a faint strip at the start of a list row (Players): their banner, otherwise
 * the chosen skin's square tile (about 40 KB; the champion's default skin if that skin has none),
 * fading out before the row's figures, a little brighter while the row is pointed at (the row is
 * `group/row`). Nothing when the player chose no art. Lazy, and left out of the page's layout by the
 * caller's `className` where a screen shows no strip (phones), so nothing is downloaded there.
 */
export function RowArtStrip({ art, look, className }: { art: CardArt | null; look: CardLook | null | undefined; className?: string }) {
  const source = look?.style.art.source ?? "champion";
  if (source === "none") return null;
  const banner = source === "banner" && look?.bannerUrl ? look.bannerUrl : null;
  const champion = art ? [championArtUrl(art, "tiles"), championArtUrl({ ...art, skinNum: 0 }, "tiles")] : [];
  const urls = [...new Set([...(banner ? [banner] : []), ...champion])];
  if (!urls.length) return null;
  const style = look?.style;
  const focus = style && (style.art.focusX !== null || style.art.focusY !== null) ? `${style.art.focusX ?? 50}% ${style.art.focusY ?? 25}%` : "center 25%";
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 -z-10 w-2/5 max-w-56 overflow-hidden [mask-image:linear-gradient(to_right,black_15%,transparent)]", className)} data-row-art={banner ? "banner" : `${art!.championId}:${art!.skinNum}`}>
      <StripImage key={urls.join("|")} urls={urls} position={focus} />
    </span>
  );
}

function StripImage({ urls, position }: { urls: string[]; position: string }) {
  const { src, ref, onError } = useArtChain(urls);
  if (!src) return null;
  // Official Riot art from Data Dragon or the player's validated banner; a plain <img> so the browser caches it.
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={src} src={src} alt="" loading="lazy" decoding="async" ref={ref} onError={onError} className="h-full w-full object-cover opacity-20 transition-opacity duration-300 group-hover/row:opacity-30 motion-reduce:transition-none" style={{ objectPosition: position }} data-testid="row-art-image" />;
}

/** The image itself, with its fallback chain (remounted whenever the art changes). */
function ArtImage({ urls, position, testId, art, zoom, blur, smooth, priority }: { urls: string[]; position: string; testId: string; art: CardArt | null; zoom: number; blur: number; smooth: boolean; priority: boolean }) {
  const { src, ref: early, onError } = useArtChain(urls);
  if (!src) return null;
  // A blurred edge shows the background through: scale up a touch to keep the edges covered.
  const scale = zoom * (blur > 0 ? 1 + blur / 60 : 1);
  return (
    // Official Riot art from Data Dragon (already sized JPEGs) or the player's validated banner; a plain <img> so the browser caches it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt=""
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      ref={early}
      onError={onError}
      className={cn("card-art-img absolute inset-0 h-full w-full object-cover opacity-75", smooth ? "transition-transform duration-500 motion-reduce:transition-none" : "will-change-transform")}
      style={{ objectPosition: position, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: position, filter: blur > 0 ? `blur(${blur}px)` : undefined }}
      data-testid={testId}
      data-champion={art?.championId}
      data-skin={art?.skinNum}
      data-zoom={zoom}
    />
  );
}
