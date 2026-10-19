// Synthetic champion portraits for Clash Scout's recognition tests (Data Dragon is not reachable
// from the test machines): a deterministic, detailed 120×120 picture per champion id, drawn the
// same way by the fixture generator (in the browser) and by the tests (in Node).
export function portraitPixels(id, size = 120) {
  let seed = 2166136261;
  for (const ch of id) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0), (seed ^= seed >>> 13), (seed >>> 0) / 4294967296);
  const hue = rnd() * 360;
  const blobs = Array.from({ length: 7 }, () => ({ x: rnd() * size, y: rnd() * size, r: size * (0.12 + rnd() * 0.3), h: (hue + rnd() * 140 - 70 + 360) % 360, l: 0.25 + rnd() * 0.5 }));
  const hsl = (h, s, l) => {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  };
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b] = hsl(hue, 0.55, 0.18 + 0.25 * (y / size));
      for (const o of blobs) {
        const d = Math.hypot(x - o.x, y - o.y);
        if (d < o.r) {
          const t = 1 - d / o.r;
          const [br, bg, bb] = hsl(o.h, 0.7, o.l);
          r = r * (1 - t) + br * t;
          g = g * (1 - t) + bg * t;
          b = b * (1 - t) + bb * t;
        }
      }
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}
