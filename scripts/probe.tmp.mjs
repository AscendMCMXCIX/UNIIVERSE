import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:3900/resources/matchups?champion=Ambessa&vs=Renekton");
for (const t of [0, 1500]) { await p.waitForTimeout(t); console.log(await p.evaluate(() => ["matchup-briefing", "matchup-enemy-abilities", "matchup-dashboard"].map((id) => [id, Math.round(document.querySelector(`[data-testid=${id}]`).getBoundingClientRect().y)]).join(" "))); }
await b.close();
