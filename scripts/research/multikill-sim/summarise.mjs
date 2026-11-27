import { readFileSync, readdirSync } from "node:fs";
// The simulation's result files beside this script (sim.ts writes them): node scripts/research/multikill-sim/summarise.mjs [boards]
const dir = new URL(".", import.meta.url).pathname;
const boards = process.argv[2] ?? "500";
const files = readdirSync(dir).filter((f) => new RegExp(`^results-${boards}-.*\\.json$`).test(f) && !f.includes("S1_S10"));
const all = files.flatMap((f) => JSON.parse(readFileSync(dir + f, "utf8")));
const order = ["S1", "S2", "S3", "S4", "S5", "S6", "S7v", "S7c", "S8", "S9", "S10", "S11", "S11b", "S0"];
all.sort((a, b) => order.indexOf(a.scenario.key) - order.indexOf(b.scenario.key));
const models = ["M0", "Mflat", "M2", "M3", "M1a", "M1b", "M1c", "M1d", "M0raw", "M0eb", "M4", "M4p", "M4e", "M5", "M5eb"];
const f = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");
for (const [metric, title] of [["pTop1", "P(truly best ranks first)"], ["rhoTruth", "Spearman with the true ranking"]]) {
  const sc = all.filter((r) => r.scenario.key !== "S0");
  console.log(`\n### ${title}\n`);
  console.log(`| model | ${sc.map((r) => r.scenario.key).join(" | ")} |`);
  console.log(`|---|${sc.map(() => "---").join("|")}|`);
  for (const m of models) console.log(`| ${m} | ${sc.map((r) => f(r.models[m][metric])).join(" | ")} |`);
}
const s0 = all.find((r) => r.scenario.key === "S0");
if (s0) {
  console.log(`\n### S0 equal skill: stable non-skill signal and bias (no skill differences at all)\n`);
  console.log("| model | split-half | rank~games | rank~champ propensity | rank~support share | rank~Swiftplay share | rank~lobby pace | first is short record (fair 0.32) |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const m of models) { const x = s0.models[m]; console.log(`| ${m} | ${f(x.splitHalf)} | ${f(x.resVsGames)} | ${f(x.resVsPropensity)} | ${f(x.resVsSupport)} | ${f(x.resVsSwift)} | ${f(x.resVsLobby)} | ${f(x.firstShort)} |`); }
}
const s1 = all.find((r) => r.scenario.key === "S1");
console.log(`\n### S1 realistic: bias and stability\n`);
console.log("| model | split-half (Spearman-Brown) | res~games | res~champ propensity | res~support | res~Swiftplay | res~lobby | first short (truth " + f(s1.truth.firstShort) + ") | mean abs log error |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const m of models) { const x = s1.models[m]; console.log(`| ${m} | ${f(x.splitHalf)} (${f(x.splitHalfSB)}) | ${f(x.resVsGames)} | ${f(x.resVsPropensity)} | ${f(x.resVsSupport)} | ${f(x.resVsSwift)} | ${f(x.resVsLobby)} | ${f(x.firstShort)} | ${x.meanAbsLogErr.toFixed(3)} |`); }
console.log("\nscenarios:", all.map((r) => `${r.scenario.key}=${r.scenario.label} (truth tau ${r.diag.tauTruth.toFixed(2)}, ${r.boards} boards)`).join("; "));
