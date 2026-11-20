import { chromium } from '@playwright/test';
import { PAGES, applySetup, contextOptions, findPlayerId, openAndMeasure } from './page-budgets.mjs';
const [setup, text, ...keys] = process.argv.slice(2);
const BASE='http://127.0.0.1:3901'; const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p0 = await b.newPage(); const pid = await findPlayerId(p0, BASE); await p0.close();
for (const admin of [false, true]) { const ctx = await b.newContext(contextOptions(setup)); await ctx.addCookies([{ name: 'uniiverse_view', value: admin ? 'admin' : 'player', url: BASE }]); const page = await ctx.newPage(); await applySetup(page, setup, +text);
 for (const k of Object.keys(PAGES).filter((k) => !!PAGES[k].admin === admin && (!keys.length || keys.includes(k)))) { const f = await openAndMeasure(page, BASE, k, pid); console.log(k, JSON.stringify(f)); } await ctx.close(); }
await b.close();
