/**
 * When an animated branding image (GIF) shows its still first frame instead: for people who ask
 * for reduced motion. Every other screen, phones included, gets the animation: it is served from
 * its web copy (an animated WebP at the size the app draws it, about half a megabyte for the
 * team's 7.6 MB logo) and kept by the browser for a year, so a phone downloads it once.
 */
export const STILL_MEDIA = "(prefers-reduced-motion: reduce)";

/**
 * A branding image that may be animated: where `STILL_MEDIA` matches, the browser fetches the still
 * frame and never the animation. Plain <img> otherwise, so it works in server and client components.
 * The <picture> around it takes no part in the layout (display: contents), so the image's own
 * classes size it: a flex row that runs short of room can never shrink the picture and squash the
 * image inside it (a logo drawn taller than wide).
 */
export function BrandImage({ src, still, alt = "", className }: { src: string; still?: string | null; alt?: string; className?: string }) {
  if (!still || still === src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  }
  return (
    <picture className="contents">
      <source srcSet={still} media={STILL_MEDIA} />
      <img src={src} alt={alt} className={className} />
    </picture>
  );
}
