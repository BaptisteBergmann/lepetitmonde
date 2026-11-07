---
tags: [lepetitmonde/feature]
---

# Health

Up: [[Le petit monde]] · Route: `/baby/[babyId]/health` · Code: `health/`, `actions/health.ts`, `health-core.ts`, `growth-who*.ts`, `vaccine-*.ts`

Health records for the baby, members-only.

- **Profile** (`baby_health_profiles`): sex, birth date and the vaccine schedule to follow (`fr` or `ca_qc`).
- **Growth** (`growth_measurements`): weight, length/height, head circumference, plotted against the WHO Child Growth Standards percentiles (3, 15, 50, 85, 97) with the LMS method (`growth-who.ts`). Length switches from lying to standing at 24 months.
- **Vaccinations** (`vaccinations`): shots given, matched by vaccine code and dose to the national schedule (`vaccine-schedule.ts`, static and versioned), with due and overdue status (`vaccine-status.ts`). Switching schedule never loses a recorded shot.
- Reading is open to members with page access; writing needs an admin.
- [[MCP server]] tools: `get_health_summary`, `set_health_profile`, growth and vaccination list/add/delete, `list_upcoming_vaccines`.

RLS is on for all three tables ([[Row Level Security]]).
