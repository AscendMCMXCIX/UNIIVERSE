// The installed app's shortcut icons (manifest.ts): each destination's own icon from the bars
// (nav.ts NAV_ENTRIES, lucide), drawn in the accent on the app's background, 96×96 PNG, written to
// public/icons/shortcuts/<icon>.png. Run after changing a destination's icon:
//   node scripts/shortcut-icons.mjs circle-user-round users swords book-bookmark
// nav-parity.test.ts fails while a destination's icon has no file here. sharp is a dependency already.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BACKGROUND = "#0a0b12"; // DEFAULT_COLOURS.background (src/domain/branding.ts)
const ACCENT = "#1fc3ff"; // DEFAULT_COLOURS.accent
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const icons = join(dirname(require.resolve("lucide-react/package.json")), "dist/esm/icons");
const out = join(root, "public/icons/shortcuts");
mkdirSync(out, { recursive: true });

const attrs = (o) => Object.entries(o).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ");
for (const name of process.argv.slice(2)) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`not an icon name: ${name}`);
  const { __iconData } = await import(join(icons, `${name}.mjs`));
  const shapes = __iconData.node.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
  // The glyph at 56 of 96, centred: inside a maskable circle's safe zone, as Android crops it.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="${BACKGROUND}"/><g transform="translate(20 20) scale(2.3333)" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`;
  writeFileSync(join(out, `${name}.png`), await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer());
  console.log(`${name}.png`);
}
