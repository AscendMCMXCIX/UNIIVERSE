"use client";

import * as React from "react";
import { championArtUrl, type CardArt } from "@/domain/player-card";
import { cn } from "@/lib/cn";

/**
 * The artwork behind a player's card, header or preview: the chosen skin's official art under a
 * readability gradient tinted with the player's accent. Used by the Team card, the Players
 * directory card, the profile header and the Customise preview, so a choice looks the same
 * everywhere.
 *
 * - kind "splash" (landscape, ~1215×717) for large headers; "loading" (portrait crop, a few
 *   dozen KB) for small cards, so the directory never downloads full splashes.
 * - If a skin's art is missing (retired, or not published yet) it falls back to the champion's
 *   default art, then to the plain gradient; a broken image is never shown.
 * - `strength` sets how dark the gradient is (text sits on top of it).
 */
export function CardArtLayer({ art, accent, kind, position = "center 20%", strength = "normal", className, testId = "card-art-image" }: { art: CardArt | null; accent: string; kind: "splash" | "loading"; position?: string; strength?: "light" | "normal" | "strong"; className?: string; testId?: string }) {
  const urls = art ? [...new Set([championArtUrl(art, kind), championArtUrl({ ...art, skinNum: 0 }, kind)])] : [];
  const veil = strength === "strong" ? "from-bg/55 via-bg/70 to-surface" : strength === "light" ? "from-bg/10 via-bg/35 to-surface" : "from-bg/30 via-bg/50 to-surface";
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} data-art-layer={testId} data-art={art ? `${art.championId}:${art.skinNum}` : "none"}>
      {art && urls.length ? <ArtImage key={urls.join("|")} urls={urls} position={position} testId={testId} art={art} /> : null}
      <div className={cn("absolute inset-0 bg-gradient-to-b", veil)} />
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${accent} 24%, transparent), transparent 60%)` }} />
    </div>
  );
}

/** The image itself, with its fallback chain (remounted whenever the art changes). */
function ArtImage({ urls, position, testId, art }: { urls: string[]; position: string; testId: string; art: CardArt }) {
  const [failed, setFailed] = React.useState(0);
  const src = urls[failed];
  if (!src) return null;
  return (
    // Official Riot art from Data Dragon (already sized JPEGs); a plain <img> so the browser caches it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed((n) => n + 1)}
      className="card-art-img absolute inset-0 h-full w-full object-cover opacity-75 transition-transform duration-500 motion-reduce:transition-none"
      style={{ objectPosition: position }}
      data-testid={testId}
      data-champion={art.championId}
      data-skin={art.skinNum}
    />
  );
}
