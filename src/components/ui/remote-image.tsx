"use client";

import * as React from "react";

/*
  Images from other hosts (Riot's CDN, Community Dragon) can fail: the host is down, blocked by a
  network or an extension, or the file moved. Every such image shows a designed fallback instead,
  never a broken-image glyph, whether it fails before the page is interactive (noted by the early
  script in image-errors.ts, which also declares window.__failedImages) or after (onError).
*/

/** Whether this image failed before the page was interactive (React's onError cannot hear that). */
export function failedEarly(img: HTMLImageElement | null): boolean {
  return !!img && !!window.__failedImages?.has(img);
}

/** `failed` once the image at `src` has failed to load; spread `ref` and `onError` on the <img>. */
export function useImageFailure(src: string | null | undefined) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const ref = React.useCallback((img: HTMLImageElement | null) => {
    if (failedEarly(img)) setFailedSrc(img!.getAttribute("src"));
  }, []);
  const onError = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => setFailedSrc(e.currentTarget.getAttribute("src")), []);
  return { failed: !!src && failedSrc === src, ref, onError };
}

/** An <img> from another host that shows `fallback` (or nothing) in its place when it fails. */
export function RemoteImage({ src, fallback = null, ...img }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { src: string; fallback?: React.ReactNode }) {
  const { failed, ref, onError } = useImageFailure(src);
  if (failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...img} src={src} ref={ref} onError={onError} />;
}
