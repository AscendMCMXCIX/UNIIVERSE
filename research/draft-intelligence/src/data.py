"""Loading the professional drafts and the repository's champion tables (read only)."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]
TRAIT_KEYS = [
    "engage", "counterEngage", "frontline", "peel", "dive", "pick", "poke", "burst", "sustainedDps", "waveclear",
    "sideLane", "scaling", "earlyGame", "objectiveDamage", "siege", "mobility", "range", "reliableCC",
    "physicalDamage", "magicDamage",
]


def load_drafts(data_dir: str | Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Games (one row each) and actions (20 per game), in time order. Only complete 20-action drafts."""
    data_dir = Path(data_dir)
    games_parts, action_parts = [], []
    for year_dir in sorted(p for p in data_dir.iterdir() if p.is_dir() and p.name.isdigit()):
        inter = year_dir / "all_patches" / "all_patches.inter"
        meta = year_dir / "games.csv"
        if not inter.exists() or not meta.exists():
            continue
        a = pd.read_csv(inter, sep="\t", dtype=str)
        a.columns = [c.split(":")[0] for c in a.columns]
        action_parts.append(a)
        games_parts.append(pd.read_csv(meta, dtype=str))
    actions = pd.concat(action_parts, ignore_index=True)
    games = pd.concat(games_parts, ignore_index=True).drop_duplicates("match_id")

    actions = actions.assign(
        side=actions["user_id"].str.rsplit("_", n=1).str[-1].astype(int),
        champ=actions["item_id"].astype(int),
        slot=actions["timestamp"].astype(float).astype(int),
        pick=actions["label"].astype(float).astype(int) == 1,
        start=actions["start_time"].astype(float).astype(int),
    )[["match_id", "side", "champ", "hero_name", "slot", "pick", "start", "series_id", "game_number", "tournament", "tier"]]
    actions = actions.drop_duplicates(["match_id", "slot"])
    complete = actions.groupby("match_id")["slot"].agg(lambda s: sorted(s.tolist()) == list(range(20)))
    keep = set(complete[complete].index)
    actions = actions[actions["match_id"].isin(keep)]

    games = games[games["match_id"].isin(keep)].copy()
    start = actions.groupby("match_id")["start"].first()
    games["start"] = games["match_id"].map(start).astype(int)
    games["blue_win"] = (games["winner_side"] == "blue").astype(int)
    games = games.sort_values(["start", "match_id"]).reset_index(drop=True)
    games["order"] = range(len(games))
    order = dict(zip(games["match_id"], games["order"]))
    actions = actions.assign(order=actions["match_id"].map(order)).sort_values(["order", "slot"]).reset_index(drop=True)
    return games, actions


def load_champion_tables(repo_root: str | Path) -> tuple[dict[int, str], dict[str, dict[str, float]], dict[str, list[float]]]:
    """Champion key -> id, id -> role prior, id -> 20 trait values (the unreviewed curated table)."""
    repo_root = Path(repo_root)
    fixture = json.loads((repo_root / "src/server/riot/fixtures/champions.fixture.json").read_text())
    key_to_id = {int(c["key"]): c["id"] for c in fixture["champions"]}
    text = (repo_root / "src/domain/champion-model/curated-data.ts").read_text()
    priors: dict[str, dict[str, float]] = {}
    traits: dict[str, list[float]] = {}
    for m in re.finditer(r'^\s+(\w+): \[\[([^\]]*)\], "([^"]*)"\]', text, re.M):
        cid, values, prior = m.group(1), m.group(2), m.group(3)
        traits[cid] = [float(v) for v in values.split(",")]
        priors[cid] = {r.split(":")[0]: float(r.split(":")[1]) for r in prior.split(",") if ":" in r}
    return key_to_id, priors, traits


def fearless_tournaments(actions: pd.DataFrame, min_series: int = 20) -> set[str]:
    """Tournaments where no champion is ever picked twice within a series (with enough multi-game series)."""
    picks = actions[actions["pick"]]
    out = set()
    for tournament, t in picks.groupby("tournament"):
        multi = t.groupby("series_id")["match_id"].nunique()
        multi = multi[multi >= 2]
        if len(multi) < min_series:
            continue
        sub = t[t["series_id"].isin(multi.index)]
        repeats = sub.groupby(["series_id", "champ"])["match_id"].nunique()
        if (repeats > 1).sum() == 0:
            out.add(tournament)
    return out
