/**
 * Builds the committed cut of Data Dragon's item.json that Champion Intel's build rules are tested
 * on (src/domain/champion-builds.test.ts: which purchases are boots and which are completed items,
 * Manamune, Archangel's Staff, Winter's Approach, Gunmetal Greaves and the support item among them):
 * every Summoner's Rift item (map 11, ids of up to four digits) with the shop facts the server keeps
 * in app_settings "riot_build_data" (src/server/riot/static/assets.ts compactBuildData) and its name.
 *
 *   node scripts/static/build-item-builds-fixture.mjs --version 16.22.1      (downloads item.json)
 *   node scripts/static/build-item-builds-fixture.mjs --from path/to/item.json --version 16.22.1
 *
 * Writes tests/fixtures/ddragon-<version>-item-builds.json.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const version = opt("--version");
if (!version || !/^\d{1,4}(?:\.\d{1,4}){1,3}$/.test(version)) throw new Error("--version <Data Dragon version> is required");
const from = opt("--from");
const json = from ? JSON.parse(await readFile(resolve(from), "utf8")) : await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`)).json();

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
const items = {};
for (const [id, v] of Object.entries(json.data ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  if (!/^\d{1,4}$/.test(id) || v?.maps?.["11"] !== true) continue;
  items[id] = {
    name: v.name ?? "",
    gold: { total: typeof v.gold?.total === "number" ? v.gold.total : 0, purchasable: v.gold?.purchasable === true },
    tags: strings(v.tags),
    from: strings(v.from),
    into: strings(v.into),
    depth: typeof v.depth === "number" ? v.depth : 1,
  };
}
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "fixtures", `ddragon-${version}-item-builds.json`);
const note = "Every Summoner's Rift item of Data Dragon's item.json (map 11, ids of up to four digits) with the shop facts the server keeps (riot_build_data) and its name. Written by scripts/static/build-item-builds-fixture.mjs; src/domain/champion-builds.test.ts reads it.";
await writeFile(out, `${JSON.stringify({ _note: note, version, items }, null, 0)}\n`);
console.log(`${Object.keys(items).length} items → ${out}`);
