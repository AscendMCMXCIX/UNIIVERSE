"use client";

import * as React from "react";
import { championArtUrl, type CardArt } from "@/domain/player-card";
import { artPlacement, PLACE_DEFAULT_FOCUS, type ArtPlace, type CardLook, type CardStyle } from "@/domain/card-style";
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
 *   `"band"` (the profile header): the same below its band, and in the band (from sm, or held
 *   sideways) the shade rises from the left edge, behind the identity, leaving the art clear on the right.
 * - `place` (and `narrow`): which of the artwork's places this is (ART_PLACES: the header, the Team
 *   card, the Peek), so a position the player gave that place alone is used there (Card Studio,
 *   "Artwork position"); every place without one uses the shared focal point and zoom. A component
 *   drawn in two shapes names both: `narrow` is used below its switch (`band`: the profile header's
 *   band from sm or held sideways; `lineup`: the Team card five across, a lineup of 56rem or more).
 *   The position and zoom are CSS variables chosen by the same queries the layout uses, so the
 *   server's page is already right at every width and a preview at any width draws the same.
 * - `priority`: the page's main picture (Team Overview's first card): fetched at once and ahead of
 *   the other pictures, instead of lazily. On a phone it is the page's largest element, and lazily
 *   it started only after layout, sharing the connection with the next cards' art
 *   (docs/PERFORMANCE.md, "Team Overview's first card"). Every other art stays lazy.
 */
export function CardArtLayer({ art, accent, kind, position = "center 20%", strength = "normal", className, testId = "card-art-image", look, decorate = true, motion = "always", smooth = true, foot = false, priority = false, place, narrow }: { art: CardArt | null; accent: string; kind: "splash" | "loading"; position?: string; strength?: "light" | "normal" | "strong"; className?: string; testId?: string; look?: CardLook | null; decorate?: boolean; motion?: "always" | "hover"; smooth?: boolean; foot?: boolean | "band"; priority?: boolean; place?: ArtPlace; narrow?: { place: ArtPlace; at: PlaceSwitch } }) {
  const style = look?.style ?? null;
  const source = style?.art.source ?? "champion";
  const banner = source === "banner" && look?.bannerUrl ? look.bannerUrl : null;
  const champion = art && source !== "none" ? [championArtUrl(art, kind), championArtUrl({ ...art, skinNum: 0 }, kind)] : [];
  const urls = [...new Set([...(banner ? [banner] : []), ...champion])];
  const offset = strength === "strong" ? 20 : strength === "light" ? -20 : 0;
  const darkness = Math.min(95, Math.max(10, (style?.art.darkness ?? 50) + offset));
  const blur = style?.art.blur ?? 0;
  const framing = placeVars(style, place, narrow, position, blur);
  const highlight = style?.colours.highlight ?? 24;
  const fx = (style?.effects.intensity ?? 50) / 100;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", motion === "hover" && "card-fx-hover", className)} data-art-layer={testId} data-art={banner ? "banner" : art && source !== "none" ? `${art.championId}:${art.skinNum}` : "none"} data-art-source={banner ? "banner" : source === "none" ? "none" : "champion"}>
      {urls.length ? <ArtImage key={urls.join("|")} urls={urls} framing={framing} testId={testId} art={art} blur={blur} smooth={smooth} priority={priority} /> : null}
      {style && style.colours.gradient !== "none" ? <div className={cn("absolute", style.effects.drift && decorate ? "card-fx-drift -inset-x-[15%] inset-y-0" : "inset-0")} style={washStyle(style)} data-testid="card-wash" /> : null}
      <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgb(8 12 36 / ${darkness * 0.6}%), rgb(8 12 36 / ${darkness}%), var(--card-surface, var(--color-surface)))` }} />
      {style && style.art.vignette > 0 ? <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 40%, transparent 45%, rgb(8 12 36 / ${style.art.vignette}%) 100%)` }} /> : null}
      {highlight > 0 ? <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${accent} ${highlight}%, transparent), transparent 60%)` }} /> : null}
      {style && decorate && style.effects.motif !== "none" ? <div className="absolute inset-0" style={motifStyle(style, fx)} data-testid="card-motif" data-motif={style.effects.motif} /> : null}
      {style && decorate && style.effects.shimmer ? <div className="card-fx-shimmer absolute inset-y-0 -left-1/2 w-[200%]" style={{ backgroundImage: `linear-gradient(105deg, transparent 46%, rgb(255 255 255 / ${Math.round(6 + 14 * fx)}%) 50%, transparent 54%)` }} data-testid="card-shimmer" /> : null}
      {foot ? <div className={cn("absolute inset-x-0 bottom-0 h-3/4", foot === "band" && "band:hidden")} style={{ background: FOOT_SCRIM }} data-testid="card-foot-scrim" /> : null}
      {foot === "band" ? <div className="absolute inset-y-0 left-0 hidden w-3/5 band:block" style={{ background: SIDE_SCRIM }} data-testid="card-side-scrim" /> : null}
    </div>
  );
}

/** Where a component drawn in two shapes changes from its narrow place to its wide one (CardArtLayer's `narrow`). */
export type PlaceSwitch = "band" | "lineup";

/*
  The image's position and zoom as CSS variables, read by the query the component's layout changes
  at: the narrow place's below it, the wide place's from it. Written out whole, for Tailwind.
*/
const PLACE_CLASS: Record<PlaceSwitch | "one", string> = {
  one: "[object-position:var(--art-pos)] [transform-origin:var(--art-pos)] [transform:scale(var(--art-scale))]",
  band: "[object-position:var(--art-pos-n)] [transform-origin:var(--art-pos-n)] [transform:scale(var(--art-scale-n))] band:[object-position:var(--art-pos)] band:[transform-origin:var(--art-pos)] band:[transform:scale(var(--art-scale))]",
  lineup: "[object-position:var(--art-pos-n)] [transform-origin:var(--art-pos-n)] [transform:scale(var(--art-scale-n))] @4xl/lineup:[object-position:var(--art-pos)] @4xl/lineup:[transform-origin:var(--art-pos)] @4xl/lineup:[transform:scale(var(--art-scale))]",
};

type Framing = { className: string; vars: React.CSSProperties; zoom: number; position: string; place: ArtPlace | null };

/** One place's framing: the position and the scale (the zoom, a touch more under a blur, whose edge would show the background). */
function framingOf(style: CardStyle | null, place: ArtPlace | undefined, fallback: string, blur: number): { pos: string; scale: number; zoom: number } {
  const extra = blur > 0 ? 1 + blur / 60 : 1;
  if (!style) return { pos: fallback, scale: extra, zoom: 1 };
  if (!place) {
    // A layer that names no place (the first-time setup's preview) keeps the shared framing.
    const set = style.art.focusX !== null || style.art.focusY !== null;
    return { pos: set ? `${style.art.focusX ?? 50}% ${style.art.focusY ?? 20}%` : fallback, scale: style.art.zoom * extra, zoom: style.art.zoom };
  }
  const p = artPlacement(style, place);
  // A place left automatic keeps the component's own words for it (identical to the default focus, PLACE_DEFAULT_FOCUS).
  const auto = !p.own && style.art.focusX === null && style.art.focusY === null;
  return { pos: auto ? fallback : `${p.focusX}% ${p.focusY}%`, scale: p.zoom * extra, zoom: p.zoom };
}

function placeVars(style: CardStyle | null, place: ArtPlace | undefined, narrow: { place: ArtPlace; at: PlaceSwitch } | undefined, fallback: string, blur: number): Framing {
  const wide = framingOf(style, place, fallback, blur);
  const vars: Record<string, string | number> = { "--art-pos": wide.pos, "--art-scale": wide.scale };
  if (narrow) {
    const n = framingOf(style, narrow.place, fallback, blur);
    vars["--art-pos-n"] = n.pos;
    vars["--art-scale-n"] = n.scale;
  }
  return { className: PLACE_CLASS[narrow ? narrow.at : "one"], vars: vars as React.CSSProperties, zoom: wide.zoom, position: wide.pos, place: place ?? null };
}

/** The default framing of a place as CSS words ("50% 22%"), for a layer that is given a place but no position. */
export function placeDefaultPosition(place: ArtPlace): string {
  const d = PLACE_DEFAULT_FOCUS[place];
  return `${d.x}% ${d.y}%`;
}

// Strongest at the bottom, where the card's text is, gone by a quarter of the way from the top.
const FOOT_SCRIM = "linear-gradient(to top, color-mix(in srgb, var(--card-surface, var(--color-surface)) 82%, transparent), color-mix(in srgb, var(--card-surface, var(--color-surface)) 55%, transparent) 50%, transparent)";

// The profile's band: the identity sits at its left over the art, so the shade rises from the left edge instead, leaving the artwork clear on the right.
const SIDE_SCRIM = "linear-gradient(to right, color-mix(in srgb, var(--card-surface, var(--color-surface)) 78%, transparent), color-mix(in srgb, var(--card-surface, var(--color-surface)) 45%, transparent) 55%, transparent)";

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
 * the chosen skin's square tile (about 40 KB; the champion's default skin if that skin has none), at
 * 20% opacity at rest and while pointed at (the row's own hover marks it), behind the picture and
 * name: gone by 60% of the strip's width, before the rank and the pool, so no figure sits on art. Nothing when the player chose no art. Lazy, and left out of the page's layout by
 * the caller's `className` where a screen shows no strip (phones), so nothing is downloaded there.
 */
export function RowArtStrip({ art, look, className }: { art: CardArt | null; look: CardLook | null | undefined; className?: string }) {
  const source = look?.style.art.source ?? "champion";
  if (source === "none") return null;
  const banner = source === "banner" && look?.bannerUrl ? look.bannerUrl : null;
  const champion = art ? [championArtUrl(art, "tiles"), championArtUrl({ ...art, skinNum: 0 }, "tiles")] : [];
  const urls = [...new Set([...(banner ? [banner] : []), ...champion])];
  if (!urls.length) return null;
  const framing = placeVars(look?.style ?? null, "row", undefined, "center 25%", 0);
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 -z-10 w-2/5 max-w-56 overflow-hidden [mask-image:linear-gradient(to_right,black_15%,transparent_60%)]", className)} data-row-art={banner ? "banner" : `${art!.championId}:${art!.skinNum}`}>
      <StripImage key={urls.join("|")} urls={urls} framing={framing} />
    </span>
  );
}

function StripImage({ urls, framing }: { urls: string[]; framing: Framing }) {
  const { src, ref, onError } = useArtChain(urls);
  if (!src) return null;
  // Official Riot art from Data Dragon or the player's validated banner; a plain <img> so the browser caches it.
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={src} src={src} alt="" loading="lazy" decoding="async" ref={ref} onError={onError} className={cn("h-full w-full object-cover opacity-20", framing.className)} style={framing.vars} data-testid="row-art-image" data-place="row" data-zoom={framing.zoom} />;
}

/** The image itself, with its fallback chain (remounted whenever the art changes). */
function ArtImage({ urls, framing, testId, art, blur, smooth, priority }: { urls: string[]; framing: Framing; testId: string; art: CardArt | null; blur: number; smooth: boolean; priority: boolean }) {
  const { src, ref: early, onError } = useArtChain(urls);
  if (!src) return null;
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
      className={cn("card-art-img absolute inset-0 h-full w-full object-cover opacity-75", framing.className, smooth ? "transition-transform duration-500 motion-reduce:transition-none" : "will-change-transform")}
      style={{ ...framing.vars, filter: blur > 0 ? `blur(${blur}px)` : undefined }}
      data-testid={testId}
      data-champion={art?.championId}
      data-skin={art?.skinNum}
      data-zoom={framing.zoom}
      data-place={framing.place ?? undefined}
    />
  );
}
