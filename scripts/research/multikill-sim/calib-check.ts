import { makeRng, makeWorld, ROLES, QUEUES, BASE_QUEUE_MIX, ROLE_KILLS, burstEvents, convVector, pts } from "./lib";
const rng = makeRng(7);
const t0 = Date.now();
const world = makeWorld(rng);
console.log("calibrated in", Date.now() - t0, "ms");
for (const r of ROLES) {
  const c = world.c[r];
  const ev = [0, 0, 0, 0]; let K = 0; const N = 40000; let P = 0;
  for (let i = 0; i < N; i++) {
    const q = rng.pick(QUEUES, BASE_QUEUE_MIX);
    const D = Math.max(15, q.dMean + q.dSd * rng.gauss());
    const ch = rng.pick(world.byRole[r].champs, world.byRole[r].weights);
    const mu = ROLE_KILLS[r] * q.pace * (D / q.dMean) ** 0.9 * (rng.gamma(8) / 8) * Math.exp(0.25 * rng.gauss()) * ch.vol * (rng.gamma(4) / 4);
    const k = rng.poisson(mu); K += k;
    const e = burstEvents(rng, k, convVector(c, q.conv * ch.conv));
    for (let j = 0; j < 4; j++) ev[j]! += e[j]!; P += pts(e);
  }
  console.log(r, c.map((x) => x.toFixed(3)).join(","), "kills/g", (K / N).toFixed(2), "events/g", ev.map((x) => (x / N).toFixed(4)).join(" "), "pts/g", (P / N).toFixed(3));
}
// champion spread: per champion expected pts relative to role
