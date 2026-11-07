---
tags: [lepetitmonde/feature]
---

# Polls

Up: [[Feed]] · Code: `actions/polls.ts`, `PollVoter` in the post card

- Zero or one poll per post, with 2 to 6 free-text options.
- One vote per user, which can be changed.
- A poll can't be edited once it has votes.
- A database constraint checks that a vote's option belongs to the voted poll.

Tables: `polls`, `poll_options`, `poll_votes` ([[Data model]]).
