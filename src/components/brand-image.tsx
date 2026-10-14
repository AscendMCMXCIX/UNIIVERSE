/**
 * A branding image that may be animated (GIF): people who ask for reduced motion get the still
 * first frame instead. Plain <img> otherwise, so it works in server and client components.
 */
export function BrandImage({ src, still, alt = "", className }: { src: string; still?: string | null; alt?: string; className?: string }) {
  if (!still || still === src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  }
  return (
    <picture>
      <source srcSet={still} media="(prefers-reduced-motion: reduce)" />
      <img src={src} alt={alt} className={className} />
    </picture>
  );
}
