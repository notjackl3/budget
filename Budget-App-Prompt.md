# Build me a personal budget & spending tracker web app

## Who this is for
I'm a student tracking personal spending. I currently use a simple Notion table and want to upgrade it into a real web app. Prioritize **clarity, speed of entry, and an intuitive, well-designed interface** over feature bloat. Think "clean personal finance tool," not "corporate budgeting dashboard." Please apply strong frontend design judgment — thoughtful typography, spacing, hierarchy, and a calm, modern aesthetic. Light mode by default with a dark-mode toggle.

**I will attach my bank/credit-card account statements as PDFs.** A core feature is that the app (and you, while building) can read those PDFs, extract individual transactions, and populate the database automatically — so I don't have to enter months of history by hand.

---

## Tech stack
- **Next.js** (App Router, TypeScript, React Server Components where sensible).
- **Tailwind CSS** for styling; **shadcn/ui** for base components.
- **Real backend with a persistent database** — use **Postgres via Prisma** (or Supabase if you prefer a hosted option). Data must survive restarts and be accessible across devices.
- Single-user is fine, but include lightweight auth (email magic link or a simple password) so my finances aren't public.
- **PDF parsing**: use a robust approach (e.g. `pdf-parse`/`pdfjs` for text-based statements; fall back to an OCR/LLM-assisted extraction step for scanned ones). Build a server-side endpoint that accepts a PDF upload, extracts transactions, and returns a structured, **editable preview** before anything is written to the database.
- Sensible currency handling: **default to CAD (C$)**, formatted consistently, with the symbol configurable.

---

## Data model

Mirror my existing tracker. Each **Expense** record has:

| Field | Type | Notes |
| --- | --- | --- |
| `description` | string | Item / description; the main label. |
| `date` | date | Transaction date. Drives Month/Week. |
| `amount` | decimal | Stored in cents/precise decimal; displayed as CAD. |
| `category` | enum | See category list below. |
| `paymentMethod` | enum | Credit Card, Debit, Cash, e-Transfer, Other. |
| `needWant` | enum | Need or Want. |
| `notes` | string? | Optional free text. |
| `recurring` | boolean | Repeats monthly (rent, subscriptions). |
| `reviewed` | boolean | Toggled during my weekly review. |
| `month` | derived | Computed from date (e.g. `2026-06`). Don't store; derive. |
| `week` | derived | Computed from date (ISO week). Derive. |
| `sourceStatement` | string? | Which uploaded PDF this came from (for traceability). |

**Categories:** Rent / Housing · Groceries · Eating Out · Coffee / Snacks · Transit · Subscriptions · Shopping · School · Tech / Tools · Travel · Social · Health · Miscellaneous.

Make categories and payment methods editable in a settings area, but seed them with the above.

---

## Core features & screens

1. **Dashboard (home)** — the landing view. Show, for the selected month:
   - Total spent, total Needs, total Wants (with a Need/Want split bar).
   - Biggest category and a simple category breakdown (bar or donut — keep it clean).
   - A small spend-by-month trend across the year.
   - "Add expense" should always be one click away.

2. **Quick add** — adding an expense should take **under 10 seconds**: description, amount, category, date (defaults to today), with everything else optional. Keyboard-friendly; support adding several in a row without leaving the form.

3. **All expenses table** — sortable, filterable, inline-editable. Columns match the data model. Bulk actions: mark reviewed, change category, delete.

4. **Filtered views** (as quick presets/tabs): This Week, This Month, By Category, Needs vs Wants, Recurring, Unreviewed. These should "just work" relative to today's date — no manual reconfiguration.

5. **By Month view** — spending grouped by each calendar month of the year, each group showing its total. This is important to me; make per-month totals obvious.

6. **Monthly summary / reflection** — per month: total spent, needs, wants, biggest category, and a free-text reflection field I can write in. Persist these.

7. **Weekly review flow** — a focused screen listing unreviewed expenses so I can confirm category/need-want and tick "reviewed" quickly.

8. **Statement import (key feature)**:
   - Upload one or more **PDF statements**.
   - Parse them into individual transactions.
   - Show an **editable review table**: each row pre-filled with date, description, amount, and a **best-guess category** (auto-categorize from the merchant/description using rules + sensible heuristics; let me correct any).
   - Detect and flag likely **duplicates** against existing data.
   - Let me confirm, then commit all rows to the database in one action.
   - Keep a record of which statement each transaction came from.

---

## Design direction
- Clean, generous whitespace; clear visual hierarchy; a restrained palette (one accent color, neutral grays). No clutter, no gratuitous color-coding, no heavy gradients.
- Numbers should be easy to scan — tabular figures, right-aligned amounts.
- Charts should be minimal and legible, not flashy.
- Fully responsive; great on mobile (I'll often add expenses on my phone).
- Smooth, subtle interactions; empty states and loading states handled gracefully.
- Accessible (keyboard nav, sufficient contrast, ARIA where needed).

---

## Deliverables
1. A working Next.js project I can run locally with clear setup steps (`README` with env vars, DB setup, and `npm run dev`).
2. Prisma schema + migrations seeded with the categories/payment methods.
3. The screens and the PDF-import pipeline described above.
4. Reasonable tests around the statement parser and the totals/aggregation logic.
5. Notes on how to deploy (e.g. Vercel + hosted Postgres).

---

## How to proceed
1. Start by confirming the schema and proposing the parsing approach, then scaffold the project.
2. Build the data layer and core expense CRUD + dashboard first, then the filtered/monthly views, then the statement-import pipeline.
3. **I will attach my PDF account statements** — use a couple of them to validate the parser, build a robust extraction + auto-categorization step, and show me the editable preview before writing to the database. Ask me about anything ambiguous in the statement format rather than guessing silently.

Please use your best frontend design instincts throughout. Make it something I'll actually enjoy opening every day.
