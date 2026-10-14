import { BrandImage } from "./brand-image";
import { cn } from "@/lib/cn";

/**
 * The team's logo where a square is needed (sidebar, phone header, previews). With an uploaded
 * logo, that image; without one, no artwork at all: the initial of the short name in a plain
 * square drawn with the theme colours.
 */
export function BrandMark({ src, still, name, className }: { src: string | null; still?: string | null; name: string; className?: string }) {
  if (src) return <BrandImage src={src} still={still} className={cn("shrink-0 rounded-lg object-contain", className)} />;
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-lg border border-accent/40 bg-accent/10 font-bold text-accent", className)} data-testid="brand-mark-text">
      {(name.trim()[0] ?? "U").toUpperCase()}
    </span>
  );
}
