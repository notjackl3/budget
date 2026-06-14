# Budget — a personal spending tracker

A clean, fast personal budget & spending tracker. Light mode by default with a
dark-mode toggle, designed for quick entry and an at-a-glance overview of where
your money goes. Built to upgrade a Notion spending table into a real web app.

The headline feature is **statement import**: drop in your bank/credit-card PDF
statements and the app extracts every transaction, guesses a category, flags
likely duplicates, and shows you an **editable preview** before anything is
written to the database.

---

## Tech stack

- **Next.js 15** (App Router, TypeScript, React Server Components)
- **Tailwind CSS** + a small set of **shadcn/ui**-style primitives
- **Prisma** ORM. Defaults to **SQLite** for zero-setup local dev; swap to
  **Postgres** for hosted/multi-device use (see _Deploying_).
- **pdf-parse** for text extraction from statement PDFs
- Lightweight **password auth** with a signed session cookie (`jose`)
- **Vitest** for tests; **recharts** for the (minimal) charts

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    then edit .env — at minimum set APP_PASSWORD and AUTH_SECRET

# 3. Create the database and seed categories / payment methods
npm run setup            # = prisma db push + seed

# 4. (Optional) Import the included sample statements as real data
npm run import:statements

# 5. Run it
npm run dev              # http://localhost:3000
```

Log in with the `APP_PASSWORD` you set in `.env`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma connection string. Default: `file:./dev.db` (SQLite). |
| `APP_PASSWORD` | The password you log in with. |
| `AUTH_SECRET` | Secret used to sign the session cookie (≥16 chars; use a long random string in production). |
| `NEXT_PUBLIC_DEFAULT_CURRENCY` | Display currency code; the symbol is also editable in Settings. Defaults to CAD. |

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` / `npm run start` | Production build / serve. |
| `npm test` | Run the Vitest suite (parser, categorizer, money, aggregation). |
| `npm run setup` | `prisma db push` + seed default categories/payment methods. |
| `npm run db:seed` | (Re)seed categories, payment methods, settings. |
| `npm run db:reset` | Drop & recreate the schema, then seed. |
| `npm run db:studio` | Open Prisma Studio to inspect data. |
| `npm run import:statements` | Parse every PDF in `statements/` and load it into the DB. Add `-- --reset` to wipe first. |

---

## Features

- **Dashboard** — for the selected month: total spent, Needs/Wants split bar,
  category breakdown (donut), biggest category, and a spend-by-month trend for
  the year. Month is selectable; "Add expense" is always one click away.
- **Quick add** — add an expense in seconds. Press **Enter** to save and keep
  adding (the date stays put); everything but description/amount is optional.
- **All expenses** — sortable, searchable, **inline-editable** table (category,
  need/want, and reviewed are editable right in the row; full edit in a dialog).
  Bulk actions: mark reviewed/unreviewed, set category, delete.
- **Filtered views** — preset tabs that work relative to today: This Week, This
  Month, By Category, Needs vs Wants, Recurring, Unreviewed.
- **By Month** — every calendar month with its total front-and-centre, plus a
  persisted free-text **reflection** per month.
- **Weekly Review** — a focused flow listing unreviewed expenses so you can
  confirm category/need-want and tick them off, with a progress bar.
- **Statement import** — upload one or more PDFs, get an editable review table
  with best-guess categories and duplicate flags, then commit in one action.
  Each imported expense records which statement it came from.
- **Settings** — configure the currency symbol/code and manage your categories
  (rename, recolor, add, archive) and payment methods.

---

## Data model

Each **Expense** mirrors the original tracker:

| Field | Notes |
| --- | --- |
| `description` | Main label. |
| `date` | Transaction date. Month/week are **derived**, never stored. |
| `amountCents` | Stored as integer cents; displayed as currency. |
| `category` | Relation to an editable Category (seeded with defaults). |
| `paymentMethod` | Relation to an editable PaymentMethod. |
| `needWant` | `Need` / `Want` / unset. |
| `notes` | Optional free text. |
| `recurring` | Repeats monthly. |
| `reviewed` | Toggled during weekly review. |
| `sourceStatement` | Which uploaded PDF it came from (traceability). |
| `dedupeHash` | `date|cents|normalized-description` — used for duplicate detection. |

**Default categories:** Rent / Housing · Groceries · Eating Out · Coffee /
Snacks · Transit · Subscriptions · Shopping · School · Tech / Tools · Travel ·
Social · Health · Miscellaneous. **Payment methods:** Credit Card · Debit ·
Cash · e-Transfer · Other. All editable in Settings.

---

## The statement parser

Tuned for **CIBC Visa "online statement"** PDFs (the format in `statements/`).
The pipeline is split for testability:

- `src/lib/parse-statement.ts` — **pure** text → transactions. It reads the
  statement period (handling periods that cross a year boundary, e.g. Dec→Jan),
  isolates the "Your new charges and credits" section (so card payments are
  excluded), and extracts each row even when the PDF splits it across multiple
  lines. Amounts are parsed to integer cents; trailing-minus credits are kept as
  negatives.
- `src/lib/parse-pdf.ts` — server-only PDF buffer → text via `pdf-parse`.
- `src/lib/categorize.ts` — merchant-keyword rules first, then the bank's own
  spend-category hint, then Miscellaneous; also guesses Need/Want.

The parser is validated against all 16 real statements: the extracted
transaction **count and total match each statement's own spend-report** (e.g.
February 2025 → 47 charges totalling C$1,363.85). See `tests/`.

**Adapting to another bank:** the row anchors (`BANK_CATEGORIES`) and the period
regex in `parse-statement.ts` are CIBC-specific. For a different statement
layout, adjust those and add fixtures under `tests/fixtures/`. The import
endpoint returns a clear error if a PDF can't be parsed (e.g. a scanned/image
statement — those would need an OCR step, noted as a future enhancement).

---

## Tests

```bash
npm test
```

Covers: the money helpers, the auto-categorizer rules + fallbacks, the
aggregation/totals logic, and the statement parser (against real statement text
fixtures, including year-boundary handling and duplicate hashing).

---

## Deploying (Vercel + hosted Postgres)

SQLite is great locally but Vercel's filesystem is ephemeral, so use hosted
Postgres in production (Supabase, Neon, or Vercel Postgres).

1. In `prisma/schema.prisma`, change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set the project's environment variables in Vercel: `DATABASE_URL`
   (your Postgres connection string), `APP_PASSWORD`, `AUTH_SECRET`, and
   `NEXT_PUBLIC_DEFAULT_CURRENCY`.
3. Generate and apply the schema against Postgres:
   ```bash
   npx prisma migrate dev --name init   # locally, against the Postgres URL
   npx prisma db seed
   ```
   On Vercel, run `prisma generate && prisma migrate deploy` as the build/start
   step (the `build` script already runs `prisma generate`).
4. Deploy. Import your statements from the **Import** screen, or run
   `npm run import:statements` against the production `DATABASE_URL`.

All field types in the schema are Postgres-compatible, so no model changes are
needed beyond the provider switch.

---

## Notes & trade-offs

- **Auth** is intentionally minimal (single shared password + signed cookie) —
  enough to keep finances private, not a multi-user system.
- **Amounts as cents** everywhere avoids floating-point rounding.
- **Duplicate detection** uses a `date|cents|normalized-description` fingerprint.
  Genuinely identical same-day purchases share a fingerprint; the import preview
  flags them so you decide, and the seed script keeps them (it only dedupes
  against rows already in the database, so re-imports are idempotent).
