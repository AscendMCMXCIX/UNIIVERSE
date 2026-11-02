-- Draft Intelligence pilot, RQ6 (optional): one row per member game, pseudonymous.
-- Read-only. Run in the Supabase SQL editor, then use "Download CSV".
-- Pseudonyms follow the data-audit job's order (p1, p2 ... by player id). No Riot ID, PUUID,
-- account, name or non-member data leaves the database; the match id is hashed so two members'
-- rows of the same game still line up.
SELECT
  'p' || dense_rank() OVER (ORDER BY ra.player_id) AS player,
  left(md5(am.match_id), 12) AS game,
  am.game_creation AS start_ms,
  am.queue_id AS queue,
  am.patch,
  am.champion_id AS champion,
  am.role,
  am.win,
  am.team_id AS team,
  am.kills,
  am.deaths,
  am.assists,
  am.cs,
  am.game_duration AS duration_s
FROM account_matches am
JOIN riot_accounts ra ON ra.id = am.account_id
WHERE ra.owner_type = 'player' AND ra.player_id IS NOT NULL AND am.champion_id IS NOT NULL
ORDER BY am.game_creation;
