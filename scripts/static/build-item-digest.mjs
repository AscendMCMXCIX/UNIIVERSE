/**
 * Writes Data Dragon's own `<stats>` text of every Summoner's Rift item that names ability haste
 * (map 11, ids of up to four digits), so CI can hold the app's parser (itemHaste in
 * src/server/riot/static/assets.ts) to Riot's text without item.json:
 * tests/fixtures/ddragon-<version>-item-haste.json.
 *
 *   node scripts/static/build-item-digest.mjs --from path/to/item.json
 *   node scripts/static/build-item-digest.mjs --version 16.22.1      (downloads it)
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const full = args.get("--from")
  ? JSON.parse(await readFile(resolve(args.get("--from")), "utf8"))
  : await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${args.get("--version")}/data/en_US/item.json`, { signal: AbortSignal.timeout(60_000) })).json();
const version = full.version;
if (!/^\d{1,4}(?:\.\d{1,4}){1,3}$/.test(version ?? "")) throw new Error("item.json has no usable version");
const items = [];
for (const [id, v] of Object.entries(full.data)) {
  if (!/^\d{1,4}$/.test(id) || v?.maps?.["11"] !== true) continue;
  const stats = /<stats>([\s\S]*?)<\/stats>/i.exec(v.description ?? "")?.[1];
  if (stats && /Ability Haste/i.test(stats)) items.push([id, v.name, `<stats>${stats}</stats>`, v.gold?.purchasable === true]);
}
const note = "Data Dragon's own <stats> text of every Summoner's Rift item (map 11, ids of up to four digits) that names ability haste, as Riot gives it: [id, name, stats, purchasable]. Written by scripts/static/build-item-digest.mjs; src/server/riot/static/assets.test.ts parses every one.";
const lines = ["{", `  "_note": ${JSON.stringify(note)},`, `  "version": ${JSON.stringify(version)},`, `  "items": [`];
items.forEach((it, i) => lines.push(`    ${JSON.stringify(it)}${i < items.length - 1 ? "," : ""}`));
lines.push("  ]", "}", "");
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, `tests/fixtures/ddragon-${version}-item-haste.json`);
await writeFile(out, lines.join("\n"));
console.log(`Wrote ${out}: ${items.length} items (${items.filter((x) => x[3]).length} purchasable).`);
