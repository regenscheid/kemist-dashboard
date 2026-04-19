# Opting a domain out of kemist-fleet scans

If you own a domain on one of our scan cohorts and want it excluded
from future scans, follow one of the two paths below. This document
is public-facing — linked from the About page.

## Option 1 — File an issue (preferred)

Go to
[kemist-orchestrator/issues/new](https://github.com/regenscheid/kemist-orchestrator/issues/new)
and include:

- The full domain (e.g. `example.gov`).
- A brief reason (so the operator can decide whether it's a blanket
  opt-out or a temporary pause while a specific issue is fixed).
- Whether you're the domain owner or a delegated operator. The
  orchestrator operator may ask for verification for contested cases.

Issues are triaged manually. Expected turnaround: within the week,
so the next Sunday scan already honors the opt-out.

## Option 2 — Email the operator

If you can't file a public issue, email the operator directly (see
repo profile for contact). Same information required.

## What actually happens when you opt out

The orchestrator maintains an opt-out list at
`s3://kemist-fleet-data-<account>-us-east-1/targets/opt-out.txt`.
Each line is a domain (lowercased) or a `#`-prefixed comment.

On every weekly scan, the `refresh_targets` Lambda:

1. Fetches the CISA federal `.gov` feed (or whichever upstream cohort
   list applies).
2. Reads `opt-out.txt`.
3. Writes `targets/<date>/filtered.txt` as the set difference.

Only domains in `filtered.txt` get scanned. A domain added to
`opt-out.txt` after 2026-04-19 would be absent from the
2026-04-26 scan and every scan after.

## What does NOT happen

**Historical data is not deleted.** Scans that already ran will
continue to appear on the dashboard for as long as the data is
retained (retention policy lives alongside the scan corpus in S3,
currently indefinite). Only future scans are affected.

If you specifically want historical records removed from the
public dashboard, mention that in your issue. That's a manual
operator action (the scan pipeline doesn't re-write history), so
it takes longer than a plain opt-out.

## Verifying your domain was removed

The next scan after your opt-out lands will have one fewer row in
the domains table. Search for your domain at
`/domains?q=<your-domain>` — it should return nothing.

If you previously bookmarked a detail URL like
`/domains/<your-domain>`, the redirect will land on the latest
scan's detail view and render "target not found" since the domain
is no longer in the index.

## Adding a domain back

If you want to rejoin the scan cohort later, file a new issue
asking to remove the entry from `opt-out.txt`. Same turnaround.
