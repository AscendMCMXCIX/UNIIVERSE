import { cn } from "@/lib/cn";
import { RemoteImage } from "@/components/ui/remote-image";

const SIZES = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl", hero: "h-14 w-14 text-lg sm:h-20 sm:w-20 sm:text-2xl" } as const;

/** Stable hue from the name, so default avatars differ without looking random from page to page. */
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** A member's picture, or a clean initial on a tinted disc when they have none (or it cannot load). */
export function Avatar({ name, src, size = "md", className, ring }: { name: string; src?: string | null; size?: keyof typeof SIZES; className?: string; ring?: "blue" | "red" | "accent" }) {
  const ringClass = ring ? { blue: "ring-2 ring-blue", red: "ring-2 ring-red", accent: "ring-2 ring-accent" }[ring] : "";
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const hue = hueOf(name);
  const disc = (
    <span aria-hidden className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", SIZES[size], ringClass, className)} style={{ background: `hsl(${hue} 45% 22%)`, color: `hsl(${hue} 80% 82%)` }}>
      {initial}
    </span>
  );
  if (!src) return disc;
  // A picture that cannot load shows the initial instead.
  return <RemoteImage src={src} fallback={disc} alt="" width={80} height={80} loading="lazy" decoding="async" className={cn("shrink-0 rounded-full object-cover bg-surface-3", SIZES[size], ringClass, className)} />;
}
