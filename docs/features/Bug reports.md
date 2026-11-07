---
tags: [lepetitmonde/feature]
---

# Bug reports

Up: [[Le petit monde]] · Code: `components/bug_report_button.tsx`, `actions/bug_reports.ts`, `/api/bug-reports/[...path]`

A floating button (on every page, `z-40` in the [[z-index]] scale) captures a screenshot of the current page with `html2canvas-pro`, plus a description, and submits it.

- Screenshots go to a shared bucket, served only to admins of at least one baby through `/api/bug-reports/...` ([[Storage and media]]).
- The page URL is stored with token query parameters stripped.
- Admins triage them in the [[Admin console]]; marking one `fixed` notifies the reporter.

Table: `bug_reports` (not baby-scoped).
