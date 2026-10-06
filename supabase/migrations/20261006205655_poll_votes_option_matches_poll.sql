-- A vote's option must belong to the vote's poll. The separate FKs on
-- option_id and poll_id allowed a vote on poll X pointing at an option of
-- poll Y, inflating Y's count (one stuffed vote per user per other poll).
-- votePoll now checks this in the action; this makes the DB reject it too.

-- Expected to affect 0 rows. Check first (read-only):
--   SELECT count(*) FROM public.poll_votes v
--     JOIN public.poll_options o ON o.id = v.option_id
--     WHERE o.poll_id <> v.poll_id;
-- Any rows it finds are stuffed votes and are safe to drop.
DELETE FROM public.poll_votes v USING public.poll_options o
  WHERE v.option_id = o.id AND o.poll_id <> v.poll_id;

-- Composite FK target. id is already the PK, so this is unique by
-- construction; it only exists so (option_id, poll_id) can reference it.
ALTER TABLE ONLY public.poll_options
  ADD CONSTRAINT poll_options_id_poll_id_key UNIQUE (id, poll_id);

ALTER TABLE ONLY public.poll_votes DROP CONSTRAINT poll_votes_option_id_fkey;

-- ON DELETE CASCADE keeps the old behavior: deleting an option (updatePoll
-- only does this when the poll has no votes) or a poll removes its votes.
ALTER TABLE ONLY public.poll_votes
  ADD CONSTRAINT poll_votes_option_id_poll_id_fkey
  FOREIGN KEY (option_id, poll_id) REFERENCES public.poll_options(id, poll_id) ON DELETE CASCADE;
