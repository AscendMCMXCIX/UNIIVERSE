/**
 * When an animated branding image (GIF) shows its still first frame instead: on phones, held either
 * way (the layout's phone width and its `short:` height), and for people who ask for reduced motion.
 * An animated logo can be several megabytes, and every page carries it.
 */
export const STILL_MEDIA = "(prefers-reduced-motion: reduce), (max-width: 39.99rem), (max-height: 480px)";

/**
 * A branding image that may be animated: where `STILL_MEDIA` matches, the browser fetches the still
 * frame and never the animation. Plain <img> otherwise, so it works in server and client components.
 */
export function BrandImage({ src, still, alt = "", className }: { src: string; still?: string | null; alt?: string; className?: string }) {
  if (!still || still === src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  }
  return (
    <picture>
      <source srcSet={still} media={STILL_MEDIA} />
      <img src={src} alt={alt} className={className} />
    </picture>
  );
}
