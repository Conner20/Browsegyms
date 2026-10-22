# Fitting In

Find the right gym at the right price.

## Tech Stack

Next.js (TypeScript), Tailwind CSS, NextAuth.js, PostgreSQL via Prisma, Next.js API Routes, Railway

### Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Environment variables

Create a `.env.local` (or configure variables in Vercel) containing at least:

```
DATABASE_URL=postgres://...
NEXTAUTH_SECRET=your-secret
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-scoped-r2-access-key
R2_SECRET_ACCESS_KEY=your-scoped-r2-secret-key
R2_BUCKET_NAME=fitting-in-media
R2_PUBLIC_BASE_URL=https://media.example.com
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=metrics-sync@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CRON_SECRET=a-random-secret-with-at-least-16-characters
```

Without the Google keys NextAuth disables OAuth and Google sign-in buttons will remain inactive. 

R2 credentials must remain server-only; never prefix them with `NEXT_PUBLIC_`. Browser uploads use
authenticated, short-lived presigned URLs from `/api/uploads/r2`.

### Google Sheets metrics sync

The production route `/api/cron/google-sheets` rebuilds the managed Google Sheet tabs from PostgreSQL. The Sheet is a one-way reporting copy: editing it never changes application data. The service-account email must have Editor access to the spreadsheet; human viewers can be granted Viewer access. Vercel Hobby runs a free daily fallback at 04:00 UTC. The free Cloudflare Worker in `cloudflare/` calls the same protected route every 15 minutes.

### UploadThing to R2 migration

Keep UploadThing configured and all source files intact until migration verification is complete.
The migration tool is dry-run-only by default:

```bash
npm run media:migrate:dry-run
```

It inventories every UploadThing URL referenced by users, posts, announcements, search galleries,
and messages. It also compares those references with the UploadThing file list when UploadThing
credentials are available.

After taking a production database backup and reviewing the inventory, explicitly apply the copy:

```bash
npm run media:migrate:apply
```

The apply command copies each referenced source object to R2, stores a SHA-256 checksum in R2
metadata, verifies the destination size and checksum metadata, and writes a resumable local manifest.
Database URLs are updated only if every referenced file verifies successfully. The manifest is ignored
by Git and must be stored securely with the database backup until the rollback window closes.

### Metrics workbook layout

The workbook mirrors the admin overview with these 15 tabs, in page order:
Overview, Users, Gym claim log, Landing-page demand, User and demand growth,
Gym demand funnel, Gym claim clicks, Popular cities, Filter usage,
Financial Metrics, Financial growth, Revenue by gym, Unclaimed gym opportunity,
User spending, and Revenue by offer. Users retains gym permissions; the funnel
includes the overview's day-pass and membership click rates.

The sync removes only these retired managed tabs, after replacement reports and
charts succeed: User gym access, Signup activity, Financial ledger, Daily metrics,
Daily gym demand, Daily filter usage, Daily city activity, Raw events, Audit notes,
Claim activity log, Claim activity, Start here, and the old Fitting In Metrics combined tab. Custom tabs are preserved.
Removed tabs are no longer generated in the Excel export or Google Sheet. Source
records remain in PostgreSQL; clearing metrics in the app still removes event
history and is reflected in the next successful sheet sync.

Event timestamps (clicks, confirmations, gym claims, user activity, etc.) are
converted from their recorded UTC instants to America/New_York wall-clock values
before writing native sortable date-time cells. Displays include seconds, AM/PM,
and ET. EST applies in winter; EDT applies during daylight saving time. The Sheet
also uses America/New_York as its timezone. Changing only the Sheet timezone
would not fix numeric date serials. Export time is labeled with EST or EDT.
Calendar-only dates and both existing growth reports retain their UTC daily
boundaries, matching the admin overview charts; event display conversion does
not shift a billing date or rewrite the growth calculations.

Each sync preserves renamed tab IDs, orders tabs, freezes headings, and applies
filters and alternating rows. Keep handwritten notes in a separate custom tab;
managed content is regenerated. Revenue and estimates remain distinct.

Both growth pages retain their native charts and dropdowns. Financial growth
uses B1 to select a gym (default All gyms), and both pages use E1 to select a
metric (default All metrics). Valid selections and chart IDs survive refreshes.
The financial table under the graph shows only the selected gym's data and
compacts to Date plus the selected metric. Full financial source data remains in
hidden columns AD:AK, not an extra tab. This table is formula-driven and ordered
by date; use the dropdowns instead of sorting its spill cells. Revenue and MRR
use the chart's dollar axis; customers use a separate count axis. The selected
table uses neutral number formatting and a USD note. Unselected chart series
are blank, not #N/A or zero. Dropdown interaction requires edit access. Charts
are created by the Google sync; the Excel export contains the report tables.

Run `node scripts/test-metrics-workbook.cjs` for isolated workbook and Google
request tests, including report coverage, Eastern time and DST conversion,
chart preservation, and safe retirement of old tabs. No external services are
used by these tests. To apply changes, deploy the sync code and run the existing
authenticated `/api/cron/google-sheets` route or wait for its scheduled run.

The Overview and Landing-page demand tabs contain only the dashboard metrics, and Gym demand funnel uses the dashboard column order. Gym claim clicks shows all claim clicks, newest first, when the dropdown is “Select a gym”; choosing a gym filters all claim-click and confirmation detail fields to that gym; the selected gym persists across refreshes.

Overview has an All time (default), Past week, Past month, or Past year dropdown. Periods match the admin overview’s rolling 7/30/365-day windows at sync time, and selections persist across refreshes.
