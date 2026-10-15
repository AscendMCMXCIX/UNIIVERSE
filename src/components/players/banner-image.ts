/**
 * Prepare a card banner in the browser before it is sent: crop very tall pictures to a 2:1
 * landscape (centred), scale to at most 1600 px wide, and encode as WebP (JPEG where WebP
 * encoding is missing), lowering the quality until it fits the server's 450 KB limit. The server
 * checks the result again; this only keeps uploads small and fast.
 */
export const BANNER_UPLOAD_LIMIT = 440 * 1024;

export async function prepareBanner(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a PNG, JPEG or WebP picture.");
  if (file.size > 20 * 1024 * 1024) throw new Error("That file is very large; choose one under 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 320) throw new Error("Use a picture at least 320 pixels wide.");
    // Keep landscape pictures as they are; crop anything taller than 2:1 to 2:1 around the centre.
    const maxRatio = 2;
    const srcW = bitmap.width;
    const srcH = Math.min(bitmap.height, Math.round(bitmap.width / Math.min(maxRatio, Math.max(1.2, bitmap.width / bitmap.height))));
    const sy = Math.round((bitmap.height - srcH) / 2);
    const scale = Math.min(1, 1600 / srcW);
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot prepare images.");
    ctx.drawImage(bitmap, 0, sy, srcW, srcH, 0, 0, w, h);
    for (const type of ["image/webp", "image/jpeg"]) {
      for (const q of [0.86, 0.78, 0.7, 0.6, 0.5]) {
        const url = canvas.toDataURL(type, q);
        if (!url.startsWith(`data:${type}`)) break;
        if (url.length * 0.75 <= BANNER_UPLOAD_LIMIT) return url;
      }
    }
    throw new Error("That picture stays too large after resizing; try a simpler image.");
  } finally {
    bitmap.close();
  }
}
