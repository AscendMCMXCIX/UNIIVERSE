/*
  Images that fail before the page is interactive. React's onError only hears an image once the page
  has hydrated, but a blocked or unreachable image host (Riot's CDN, Community Dragon, a site's
  favicon) fails within milliseconds, while the server's HTML is still loading; such an image would
  stay a broken-image glyph for good. The root layout inlines CAPTURE_IMAGE_ERRORS_SCRIPT at the top
  of <head>, so every image that fails from the very start is noted (in a WeakSet: nothing is
  written to the page, so hydration is untouched), and useImageFailure (remote-image.tsx) reads the
  note when React first attaches to the image. A plain module, not a client one, so the server
  layout gets the script itself.
*/

declare global {
  interface Window {
    __failedImages?: WeakSet<Element>;
  }
}

export const CAPTURE_IMAGE_ERRORS_SCRIPT = `(function(){var s=window.__failedImages=new WeakSet();document.addEventListener("error",function(e){var t=e.target;if(t&&t.tagName==="IMG")s.add(t)},true)})();`;
