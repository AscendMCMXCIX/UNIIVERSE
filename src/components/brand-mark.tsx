import { BrandImage } from "./brand-image";
import { cn } from "@/lib/cn";

/**
 * The team's logo where a square is needed (sidebar, phone header, previews). With an uploaded
 * logo, that image; without one, no artwork at all: the initial of the short name in a plain
 * neutral square, lit faintly from the top in the theme's violet.
 */
export function BrandMark({ src, still, name, className }: { src: string | null; still?: string | null; name: string; className?: string }) {
  if (src) return <BrandImage src={src} still={still} className={cn("shrink-0 rounded-lg object-contain", className)} />;
  return (
    // A neutral tile with the letter in the main text colour and a faint violet light from its top:
    // the stand-in is part of the frame, not a block of the brand blue.
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-lg border border-border-strong bg-surface-2 bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--color-accent-2)_22%,transparent),transparent_70%)] font-bold text-fg", className)} data-testid="brand-mark-text">
      {(name.trim()[0] ?? "U").toUpperCase()}
    </span>
  );
}
