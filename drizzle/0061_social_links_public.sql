-- Social links: one switch per link ("Show publicly") instead of three audiences.
-- Each stored link { value, show } becomes { value, public }. Only the "public" audience is
-- switched on (true). The team-only ("team") and owner-only ("hidden") audiences, and anything
-- unrecognised, are switched off (false), so no link is shown to anyone who could not see it
-- before. A link already in the new shape keeps its switch (only a JSON true counts). Each value,
-- and anything else stored with it, is kept as it was: the pages check a value again before they
-- show it. Entries that are not objects, empty objects and rows without links are left alone.
UPDATE "players" AS p
SET "social_links" = (
  SELECT jsonb_object_agg(
    e.key,
    CASE
      WHEN jsonb_typeof(e.value) = 'object' THEN
        (e.value - 'show' - 'public')
        || jsonb_build_object('public', COALESCE(e.value ->> 'show' = 'public', false) OR COALESCE(e.value -> 'public' = 'true'::jsonb, false))
      ELSE e.value
    END
  )
  FROM jsonb_each(p."social_links") AS e(key, value)
)
WHERE jsonb_typeof(p."social_links") = 'object' AND p."social_links" <> '{}'::jsonb;
