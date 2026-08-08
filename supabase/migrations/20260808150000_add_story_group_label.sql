-- Optional shared label (e.g. "Beach day") so several stories — even from
-- different admins — cluster into one tray bubble instead of each author's
-- own. Purely a presentation grouping key: expiry, visibility, and viewing
-- still work per-story exactly as before.
ALTER TABLE "public"."stories" ADD COLUMN "group_label" character varying;
