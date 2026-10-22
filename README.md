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

The Google Sheet and Excel export use the same section-based layout: Overview,
Users, Gym claim log, Landing-page demand, Financial Metrics, and separate tabs
for the tables and growth series within those sections. Overview is the first tab.
Gym fields lead the relevant detail tables; User gym access has one row per
assignment so multi-gym accounts can be filtered by an exact gym name. Daily
supporting reports, raw events, and audit notes are retained in hidden tabs.

Each sync preserves the IDs of renamed managed tabs, orders the managed tabs,
freezes headers and the first column, applies filters and alternating rows, and
formats Google Sheets dates as native dates and money as USD. Existing custom
tabs are left alone. Managed data and formatting are regenerated on refresh;
keep handwritten notes in a separate custom tab. Summaries cover all retained
history and growth series are cumulative UTC end-of-day snapshots, not additive
daily counts. Raw records cannot restore activity removed by a metrics reset.

Run `node scripts/test-metrics-workbook.cjs` for isolated workbook and Google
request tests (no database or Google access required). To apply changes to the
live Sheet, deploy the updated sync code and run the existing authenticated
`/api/cron/google-sheets` route, or wait for its scheduled run. Google service
account configuration is required in that environment.

The Google Sheets growth tabs include native line charts. Financial growth has a
**Choose gym** dropdown at B1, initially **All gyms**; its chart
updates immediately via a formula using the selected gym ID. The sync preserves
valid selections and falls back to All gyms when a gym is removed. Revenue and
MRR use the dollar axis; customers use a separate count axis. User and demand
growth charts all seven cumulative series. Chart IDs are reused on refresh, and
unrelated user-created charts remain unchanged. Dropdown interaction requires
edit access to the sheet. Charts are added by the Google sync, not the XLSX export.
The retired **Fitting In Metrics** and **Start here** tabs are deleted only after
the replacement reports and charts are successfully written; no other custom
tabs are removed.

Growth charts appear above their data tables (headers on row 28). Financial
growth shows only the selected gym (or the combined All gyms totals), in date
order. Selecting one metric narrows that table to Date and that metric. The full
financial source remains in hidden columns AD:AK. The selected table is a live
formula result, so use the dropdowns rather than manually sorting its cells.

Both growth charts have a **Choose metric** dropdown at E1, defaulting to
**All metrics**. Pick one metric to isolate its line; choose All metrics to restore
all lines. On Financial growth this works together with the gym selection at B1.
Valid gym and metric choices survive scheduled refreshes. Metrics are masked in
hidden chart-only ranges, preserving the complete source data and the separate
dollar/customer axes. Suppressed series use blank values instead of #N/A; chart
data labels are disabled. The selected financial table uses neutral numeric
formatting with a USD note, so a customer count is never formatted as dollars. Blank dates and inactive series are not plotted as
zero. Chart controls require Google Sheets edit access.
