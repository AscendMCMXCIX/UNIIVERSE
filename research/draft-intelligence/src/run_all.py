"""Runs the pre-registered pilot (PROTOCOL.md) on the professional drafts.

Writes results/results.json and results/REPORT.md. Every feature of a game is computed from games
that started before it; the test period (2025-01-01 to 2026-08-31) is never used for fitting.
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import sys
import time
from collections import Counter, defaultdict, deque
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

sys.path.insert(0, str(Path(__file__).parent))
from data import ROLES, TRAIT_KEYS, fearless_tournaments, load_champion_tables, load_drafts  # noqa: E402

DAY = 86_400
TS = lambda d: int(pd.Timestamp(d, tz="UTC").timestamp())  # noqa: E731
TEST_START = TS("2025-01-01")
OUTCOME_FIT_START = TS("2020-07-01")
ELO_TUNE_START = TS("2021-01-01")
CHOICE_FIT_START = TS("2023-01-01")
COMFORT_WINDOW, POP_WINDOW, META_WINDOW = 180 * DAY, 30 * DAY, 60 * DAY
META_PSEUDO = 20
CHOICE_FIT_SHARE = 0.30
BOOTSTRAPS = 1000
SEED = 7
TOPK = (1, 5, 10, 15, 20, 30, 40, 50)  # 30-50: exploratory coverage (PROTOCOL.md, changes after freezing)
TRAIT_FEATURES = ["engage", "frontline", "peel", "poke", "scaling", "earlyGame"]


def elo_run(games: pd.DataFrame, k: float, bonus: float) -> tuple[np.ndarray, np.ndarray]:
    rating: dict[str, float] = defaultdict(lambda: 1500.0)
    diffs, probs = np.empty(len(games)), np.empty(len(games))
    for i, (b, r, y) in enumerate(zip(games["blue_team"], games["red_team"], games["blue_win"])):
        d = rating[b] - rating[r]
        p = 1.0 / (1.0 + 10 ** (-(d + bonus) / 400))
        diffs[i], probs[i] = d, p
        rating[b] += k * (y - p)
        rating[r] -= k * (y - p)
    return diffs, probs


def tune_elo(games: pd.DataFrame) -> dict:
    tune = (games["start"] >= ELO_TUNE_START) & (games["start"] < TEST_START)
    best = None
    for k in (16, 24, 32, 48):
        for bonus in (0, 20, 40):
            _, p = elo_run(games, k, bonus)
            loss = log_loss(games.loc[tune, "blue_win"], p[tune.to_numpy()], labels=[0, 1])
            if best is None or loss < best["devLogLoss"]:
                best = {"k": k, "blueBonus": bonus, "devLogLoss": round(loss, 5)}
    return best


def best_role_assignment(prior_rows: list[np.ndarray]) -> set[int]:
    """Roles taken by a team's earlier picks under the most likely assignment."""
    if not prior_rows:
        return set()
    logp = [np.log(np.maximum(r, 1e-3)) for r in prior_rows]
    best, best_roles = -1e18, ()
    for roles in itertools.permutations(range(5), len(prior_rows)):
        s = sum(lp[r] for lp, r in zip(logp, roles))
        if s > best:
            best, best_roles = s, roles
    return set(best_roles)


def expected_hits(scores: np.ndarray, mask: np.ndarray, true_idx: int) -> tuple[list[float], float]:
    """Top-k hit probabilities and reciprocal rank, ties broken at random (in expectation)."""
    avail = scores[mask]
    s = scores[true_idx]
    above = int((avail > s).sum())
    ties = int((avail == s).sum())
    hits = [min(1.0, max(0.0, (k - above) / ties)) for k in TOPK]
    rr = float(np.mean(1.0 / np.arange(above + 1, above + ties + 1)))
    return hits, rr


def random_hits(n: int) -> tuple[list[float], float]:
    return [min(k, n) / n for k in TOPK], float(np.sum(1.0 / np.arange(1, n + 1)) / n)


def cluster_ci(values: np.ndarray, clusters: np.ndarray, rng: np.random.Generator) -> dict:
    """Mean and a 95% interval from resampling clusters (series) with replacement."""
    df = pd.DataFrame({"v": values, "c": clusters})
    g = df.groupby("c")["v"].agg(["sum", "count"])
    sums, counts = g["sum"].to_numpy(), g["count"].to_numpy()
    idx = rng.integers(0, len(g), size=(BOOTSTRAPS, len(g)))
    boots = sums[idx].sum(axis=1) / counts[idx].sum(axis=1)
    return {"mean": float(values.mean()), "ci95": [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))], "clusters": int(len(g)), "n": int(len(values))}


def fit_conditional_logit(x: np.ndarray, mask: np.ndarray, y: np.ndarray) -> np.ndarray:
    n, c, f = x.shape
    xs = x.reshape(n * c, f)

    def nll(w: np.ndarray) -> tuple[float, np.ndarray]:
        s = (xs @ w).reshape(n, c)
        s = np.where(mask, s, -np.inf)
        m = s.max(axis=1, keepdims=True)
        e = np.exp(s - m)
        z = e.sum(axis=1, keepdims=True)
        p = e / z
        ll = s[np.arange(n), y] - (m[:, 0] + np.log(z[:, 0]))
        grad = x[np.arange(n), y].sum(axis=0) - np.einsum("nc,ncf->f", p, x)
        return -float(ll.sum()), -grad

    res = minimize(nll, np.zeros(f), jac=True, method="L-BFGS-B")
    return res.x


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parents[3]))
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "results"))
    args = ap.parse_args()
    t0 = time.time()
    rng = np.random.default_rng(SEED)

    games, actions = load_drafts(args.data)
    key_to_id, priors, traits = load_champion_tables(args.repo)
    fearless = fearless_tournaments(actions)
    champs = sorted(actions["champ"].unique())
    cidx = {c: i for i, c in enumerate(champs)}
    C = len(champs)
    prior_mat = np.full((C, 5), 0.2)
    trait_mat = np.zeros((C, len(TRAIT_KEYS)))
    has_traits = np.zeros(C, dtype=bool)
    for c, i in cidx.items():
        cid = key_to_id.get(c)
        if cid in priors and priors[cid]:
            row = np.array([priors[cid].get(r, 0.0) for r in ROLES])
            if row.sum() > 0:
                prior_mat[i] = row / row.sum()
        if cid in traits and len(traits[cid]) == len(TRAIT_KEYS):
            trait_mat[i] = traits[cid]
            has_traits[i] = True
    print(f"loaded {len(games)} games, {len(actions)} actions, {C} champions, {len(fearless)} Fearless tournaments ({time.time() - t0:.0f}s)", flush=True)

    elo_params = tune_elo(games)
    elo_diff, _ = elo_run(games, elo_params["k"], elo_params["blueBonus"])
    games["elo_diff"] = elo_diff

    dev_choice_games = set(games.loc[(games["start"] >= CHOICE_FIT_START) & (games["start"] < TEST_START), "match_id"].sample(frac=CHOICE_FIT_SHARE, random_state=SEED))

    # Rolling as-of state.
    team_events: dict[str, deque] = defaultdict(deque)
    team_times: dict[str, dict[int, deque]] = defaultdict(lambda: defaultdict(deque))
    pop_events: deque = deque()
    pop_arr = np.zeros(C)
    pop_games = 0
    meta_events: deque = deque()
    meta_games = np.zeros(C)
    meta_wins = np.zeros(C)
    seen = np.zeros(C, dtype=bool)
    series_picked: dict[str, set[int]] = defaultdict(set)

    rows = []
    choice = {"pick": {"dev": [], "test": []}, "ban": {"dev": [], "test": []}}
    by_match = {m: g for m, g in actions.groupby("match_id", sort=False)}

    for gi, game in enumerate(games.itertuples(index=False)):
        now = game.start
        # Expire old events.
        while pop_events and pop_events[0][0] < now - POP_WINDOW:
            _, picked = pop_events.popleft()
            pop_arr[picked] -= 1
            pop_games -= 1
        while meta_events and meta_events[0][0] < now - META_WINDOW:
            _, i, w = meta_events.popleft()
            meta_games[i] -= 1
            meta_wins[i] -= w
        teams = {0: game.blue_team, 1: game.red_team}
        for team in teams.values():
            ev = team_events[team]
            while ev and ev[0][0] < now - COMFORT_WINDOW:
                _, i = ev.popleft()
                team_times[team][i].popleft()
        acts = by_match[game.match_id]
        picks = {s: [cidx[c] for c in acts.loc[acts["pick"] & (acts["side"] == s), "champ"]] for s in (0, 1)}

        # Game-level features (RQ1, RQ5).
        def draft_comfort(side: int) -> float:
            t = team_times[teams[side]]
            return float(np.mean([math.log1p(len(t[i])) for i in picks[side]]))

        shrunk = (meta_wins + 0.5 * META_PSEUDO) / (meta_games + META_PSEUDO)

        def draft_meta(side: int) -> float:
            return float(np.mean([shrunk[i] - 0.5 for i in picks[side]]))

        def draft_traits(side: int) -> np.ndarray:
            m = trait_mat[picks[side]]
            sums = np.array([m[:, TRAIT_KEYS.index(k)].sum() for k in TRAIT_FEATURES])
            phys, mag = m[:, TRAIT_KEYS.index("physicalDamage")].sum(), m[:, TRAIT_KEYS.index("magicDamage")].sum()
            gap = abs(phys - mag) / (phys + mag) if phys + mag > 0 else 0.0
            return np.append(sums, gap)

        tdiff = draft_traits(0) - draft_traits(1)
        rows.append({
            "match_id": game.match_id, "start": now, "series": game.series_id, "tier": game.tier, "blue_win": game.blue_win,
            "elo_diff": game.elo_diff, "comfort_diff": draft_comfort(0) - draft_comfort(1), "meta_diff": draft_meta(0) - draft_meta(1),
            **{f"trait_{k}": tdiff[j] for j, k in enumerate(TRAIT_FEATURES + ["damageGap"])},
            "trait_coverage": float(np.mean(has_traits[picks[0] + picks[1]])),
        })

        # Choice tasks (RQ2 to RQ4) on the fitting sample and the test period.
        period = "test" if now >= TEST_START else ("dev" if game.match_id in dev_choice_games else None)
        if period is not None:
            pop_share = (pop_arr + 0.5) / (pop_games + 1)
            log_pop = np.log(pop_share)
            comfort_w = {}
            for s, team in teams.items():
                v = np.zeros(C)
                for i, q in team_times[team].items():
                    if q:
                        v[i] = float(np.exp(-(now - np.fromiter(q, float)) / (60 * DAY)).sum())
                comfort_w[s] = v
            unavailable = np.zeros(C, dtype=bool)
            if game.tournament in fearless:
                for i in series_picked[game.series_id]:
                    unavailable[i] = True
            taken_by = {0: [], 1: []}
            for a in acts.itertuples(index=False):
                i = cidx[a.champ]
                mask = seen & ~unavailable
                if mask[i]:
                    acting, other = a.side, 1 - a.side
                    if a.pick:
                        own = taken_by[acting]
                        open_roles = [r for r in range(5) if r not in best_role_assignment([prior_mat[j] for j in own])] or list(range(5))
                        rolefit = prior_mat[:, open_roles].max(axis=1)
                        x = np.stack([log_pop, np.log1p(comfort_w[acting]), rolefit], axis=1)
                    else:
                        opp = taken_by[other]
                        open_roles = [r for r in range(5) if r not in best_role_assignment([prior_mat[j] for j in opp])] or list(range(5))
                        rolefit = prior_mat[:, open_roles].max(axis=1)
                        x = np.stack([log_pop, np.log1p(comfort_w[other]), rolefit], axis=1)
                    choice["pick" if a.pick else "ban"][period].append((x.astype(np.float32), mask.copy(), i, a.slot, game.series_id, game.tier))
                unavailable[i] = True
                if a.pick:
                    taken_by[a.side].append(i)

        # Update the rolling state with this game.
        all_picks = picks[0] + picks[1]
        pop_events.append((now, np.array(all_picks)))
        pop_arr[all_picks] += 1
        pop_games += 1
        for s in (0, 1):
            win = game.blue_win if s == 0 else 1 - game.blue_win
            for i in picks[s]:
                meta_events.append((now, i, win))
                meta_games[i] += 1
                meta_wins[i] += win
                team_events[teams[s]].append((now, i))
                team_times[teams[s]][i].append(now)
        for c in acts["champ"]:
            seen[cidx[c]] = True
        series_picked[game.series_id].update(all_picks)
        if gi % 10000 == 0:
            print(f"  {gi} games ({time.time() - t0:.0f}s)", flush=True)

    feat = pd.DataFrame(rows)
    results: dict = {
        "data": {
            "games": int(len(games)), "actions": int(len(actions)), "champions": C,
            "fearlessTournaments": len(fearless), "first": str(pd.Timestamp(games["start"].min(), unit="s").date()),
            "last": str(pd.Timestamp(games["start"].max(), unit="s").date()),
            "devGames": int((feat["start"] < TEST_START).sum()), "testGames": int((feat["start"] >= TEST_START).sum()),
            "testByTier": feat.loc[feat["start"] >= TEST_START, "tier"].value_counts().to_dict(),
            "championsWithTraits": int(has_traits.sum()), "championsWithRolePrior": int((prior_mat != 0.2).any(axis=1).sum()),
        },
        "elo": elo_params,
    }

    # RQ1 and RQ5: outcome models.
    fit = feat[(feat["start"] >= OUTCOME_FIT_START) & (feat["start"] < TEST_START)]
    test = feat[feat["start"] >= TEST_START]
    specs = {
        "M0": [], "M1": ["elo_diff"], "Mmeta": ["elo_diff", "meta_diff"], "M2": ["elo_diff", "comfort_diff"],
        "M3": ["elo_diff", "comfort_diff", "meta_diff"],
        "M3traits": ["elo_diff", "comfort_diff", "meta_diff"] + [f"trait_{k}" for k in TRAIT_FEATURES + ["damageGap"]],
    }
    preds, losses, rq1 = {}, {}, {}
    y_test = test["blue_win"].to_numpy()
    for name, cols in specs.items():
        if cols:
            model = LogisticRegression(C=1e6, max_iter=1000).fit(fit[cols].to_numpy(), fit["blue_win"].to_numpy())
            p = model.predict_proba(test[cols].to_numpy())[:, 1]
            coef = dict(zip(cols, map(float, model.coef_[0])))
        else:
            p = np.full(len(test), fit["blue_win"].mean())
            coef = {}
        p = np.clip(p, 1e-6, 1 - 1e-6)
        preds[name] = p
        losses[name] = -(y_test * np.log(p) + (1 - y_test) * np.log(1 - p))
        bins = pd.cut(p, np.linspace(0, 1, 11), include_lowest=True)
        cal = pd.DataFrame({"p": p, "y": y_test, "b": bins}).groupby("b", observed=True).agg(predicted=("p", "mean"), observed=("y", "mean"), n=("y", "size"))
        rq1[name] = {
            "logLoss": float(losses[name].mean()), "brier": float(brier_score_loss(y_test, p)),
            "auc": float(roc_auc_score(y_test, p)) if cols else 0.5, "coefficients": coef,
            "calibration": [{"predicted": round(r.predicted, 3), "observed": round(r.observed, 3), "n": int(r.n)} for r in cal.itertuples()],
        }
    series_test = test["series"].to_numpy()
    comparisons = {
        "M2_minus_M1": ("M2", "M1"), "M3_minus_Mmeta": ("M3", "Mmeta"), "M2_minus_Mmeta": ("M2", "Mmeta"),
        "Mmeta_minus_M1": ("Mmeta", "M1"), "M1_minus_M0": ("M1", "M0"), "M3traits_minus_M3": ("M3traits", "M3"),
    }
    rq1["comparisons"] = {k: cluster_ci(losses[a] - losses[b], series_test, rng) for k, (a, b) in comparisons.items()}
    primary_mask = (test["tier"] == "primary").to_numpy()
    rq1["comparisonsPrimaryTier"] = {k: cluster_ci((losses[a] - losses[b])[primary_mask], series_test[primary_mask], rng) for k, (a, b) in comparisons.items()}
    rq1["traitCoverage"] = float(test["trait_coverage"].mean())
    # Exploratory diagnostics (not a decision input): is the comfort feature informative at all?
    def describe(col):
        v = test[col].to_numpy()
        return {"mean": float(v.mean()), "std": float(v.std()), "p10": float(np.percentile(v, 10)), "p50": float(np.percentile(v, 50)), "p90": float(np.percentile(v, 90))}
    rq1["featureDiagnosticsExploratory"] = {
        "comfort_diff": describe("comfort_diff"), "meta_diff": describe("meta_diff"), "elo_diff": describe("elo_diff"),
        "corr_with_blue_win": {c: float(np.corrcoef(test[c], test["blue_win"])[0, 1]) for c in ("comfort_diff", "meta_diff", "elo_diff")},
        "corr_comfort_elo": float(np.corrcoef(test["comfort_diff"], test["elo_diff"])[0, 1]),
    }
    results["rq1"] = rq1

    # RQ2 to RQ4: choice models.
    def stack(items):
        x = np.stack([it[0] for it in items])
        mask = np.stack([it[1] for it in items])
        y = np.array([it[2] for it in items])
        meta = pd.DataFrame([{"slot": it[3], "series": it[4], "tier": it[5]} for it in items])
        return x, mask, y, meta

    def evaluate(kind: str) -> dict:
        xd, md, yd, _ = stack(choice[kind]["dev"])
        w_full = fit_conditional_logit(xd, md, yd)
        w_norole = fit_conditional_logit(xd[:, :, :2], md, yd)
        w_poprole = fit_conditional_logit(xd[:, :, [0, 2]], md, yd)  # exploratory
        del xd, md
        xt, mt, yt, meta = stack(choice[kind]["test"])
        n = len(yt)
        scorers = {
            "popularity": xt[:, :, 0],
            "comfort": xt[:, :, 1] + 1e-6 * xt[:, :, 0],
            "mix": np.einsum("ncf,f->nc", xt, w_full.astype(np.float32)),
            "mixWithoutRole": np.einsum("ncf,f->nc", xt[:, :, :2], w_norole.astype(np.float32)),
            "popularityRoleExploratory": np.einsum("ncf,f->nc", xt[:, :, [0, 2]], w_poprole.astype(np.float32)),
        }
        out = {"weights": {"mix": dict(zip(["logPopularity", "logComfort", "roleFit"], map(float, w_full))), "mixWithoutRole": dict(zip(["logPopularity", "logComfort"], map(float, w_norole)))}, "n": int(n), "devN": int(len(yd))}
        per = {}
        for name, s in scorers.items():
            hits = np.zeros((n, len(TOPK)))
            rr = np.zeros(n)
            for j in range(n):
                h, r = expected_hits(s[j], mt[j], yt[j])
                hits[j], rr[j] = h, r
            per[name] = (hits, rr)
        rand_hits = np.zeros((n, len(TOPK)))
        rand_rr = np.zeros(n)
        for j in range(n):
            h, r = random_hits(int(mt[j].sum()))
            rand_hits[j], rand_rr[j] = h, r
        per["random"] = (rand_hits, rand_rr)
        summary = {}
        for name, (hits, rr) in per.items():
            summary[name] = {**{f"top{k}": float(hits[:, t].mean()) for t, k in enumerate(TOPK)}, "mrr": float(rr.mean())}
        out["scorers"] = summary
        slots = meta["slot"].to_numpy()
        out["bySlot"] = {int(sl): {name: float(per[name][0][slots == sl, TOPK.index(5)].mean()) for name in per} for sl in sorted(set(slots))}
        series = meta["series"].to_numpy()
        top5 = TOPK.index(5)
        out["primaryDiff_mix_minus_popularity_top5"] = cluster_ci(per["mix"][0][:, top5] - per["popularity"][0][:, top5], series, rng)
        out["diff_mix_minus_comfort_top5"] = cluster_ci(per["mix"][0][:, top5] - per["comfort"][0][:, top5], series, rng)
        out["diff_role_effect_top5"] = cluster_ci(per["mix"][0][:, top5] - per["mixWithoutRole"][0][:, top5], series, rng)
        primary = (meta["tier"] == "primary").to_numpy()
        out["primaryTier"] = {name: {f"top{k}": float(per[name][0][primary, t].mean()) for t, k in enumerate(TOPK)} for name in per}
        if kind == "ban":
            phase = np.where(slots < 6, "phase1", "phase2")
            out["byPhase"] = {ph: {name: float(per[name][0][phase == ph, top5].mean()) for name in per} for ph in ("phase1", "phase2")}
        return out

    results["rq2_rq3_picks"] = evaluate("pick")
    print(f"picks done ({time.time() - t0:.0f}s)", flush=True)
    results["rq4_bans"] = evaluate("ban")
    print(f"bans done ({time.time() - t0:.0f}s)", flush=True)
    results["runtimeSeconds"] = round(time.time() - t0, 1)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").write_text(json.dumps(results, indent=2, default=float))
    print(json.dumps({k: results[k] for k in ("data", "elo")}, indent=2, default=float))


if __name__ == "__main__":
    main()
