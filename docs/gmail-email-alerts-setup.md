# Setup Plan — Gmail email-alert ingestion (Composio)

A step-by-step runbook to take the **CIBC email-alert → expense** feature from
"built" to "live". OAuth is brokered by **Composio**, so there's **no Google
Cloud project**. Each step is marked **[You]** (a human action) or **[Claude]**
(a command Claude can run and verify).

> Goal: new CIBC purchase alerts in Gmail → the app reads them through Composio →
> they appear as **provisional** expenses, reconciled later by the monthly PDF.

---

## 0. Context — what's already built / verified

- Code is in place; `tsc`, `npm test` (200), and `npm run build` are green.
- The Composio key works: a Gmail auth config (`ac_…`) was created and the
  connect flow returns a hosted consent URL (verified via
  `scripts/composio-verify.ts`).
- Key files: `src/lib/gmail.ts` (Composio transport), `src/lib/parse-alert-email.ts`
  (parser, validated on a real alert), `src/lib/ingest.ts` (categorize/dedupe +
  `reconcileProvisional`), `src/app/api/gmail/{connect,callback}`, the Settings
  card, and `scripts/poll-email.ts` + `scripts/com.budget.pollemail.plist`.

What's left is **connecting the account and a first sync.**

---

## Phase 1 — Credentials  **[You] + [Claude]**

- [ ] **1.1 [You]** Create a Composio account at <https://app.composio.dev> and
  copy an **API key** (Settings → API Keys).
- [ ] **1.2 [You]** Put it in `.env` as `COMPOSIO_API_KEY="ak_…"`. (Already done
  for the current key. `COMPOSIO_GMAIL_AUTH_CONFIG_ID` is pinned to the
  auto-created config; leave `COMPOSIO_USER_ID` as is.)
- [ ] **1.3 [Claude]** Verify the key + connect wiring end-to-end:
  ```bash
  npx tsx scripts/composio-verify.ts
  ```
  Expect: `API key present: true`, a `Gmail auth config id: ac_…`, and a
  `consent URL starts with: https://connect.composio.dev/link/… `.

> ⚠️ Security: the API key is a secret. If it was ever pasted into a chat, rotate
> it in the Composio dashboard. It lives only in the gitignored `.env`.

---

## Phase 2 — Connect Gmail in the app  **[You] + [Claude]**

- [ ] **2.1 [Claude]** Start the app: `npm run dev` (http://localhost:3000).
- [ ] **2.2 [You]** Log in → **Settings → Email connection → Connect Gmail**.
- [ ] **2.3 [You]** On the Composio-hosted Google consent screen, pick the alert
  inbox (`jackl32482005@gmail.com`) and approve. You'll land back on Settings
  with a "Gmail connected" toast.
- [ ] **2.4 [Claude]** Confirm the connection persisted:
  ```bash
  node -e "require('dotenv').config(); const {PrismaClient}=require('@prisma/client'); new PrismaClient().gmailConnection.findUnique({where:{id:'singleton'}}).then(c=>{console.log(c); process.exit(0)})"
  ```
  Expect a row with a `connectedAccountId` (`ca_…`).

---

## Phase 3 — First sync (prove end-to-end)  **[Claude]**

- [ ] **3.1** Dry run (parse only, no writes). Add `--raw` once to confirm the
  Composio response field names match `lib/gmail.ts`'s extractors:
  ```bash
  npm run poll:email -- --dry-run --raw
  ```
  Expect lines like `• 2026-06-16  SP DRMERS CLOTHING  124.30`. If the parsed
  list is empty but `--raw` shows emails, adjust the field readers in
  `src/lib/gmail.ts` (`emailText` / `emailDate` / `extractMessages`).
- [ ] **3.2** Real sync (writes provisional expenses):
  ```bash
  npm run poll:email
  ```
  Or click **Sync now** in Settings — same code path.
- [ ] **3.3** Confirm rows in **/expenses** (or **/review**), flagged provisional.
- [ ] **3.4** Idempotency: run `npm run poll:email` again → creates nothing new.

---

## Phase 4 — Automate (background polling)  **[You]**

- [ ] **4.1** Review `scripts/com.budget.pollemail.plist` (project path + 600s interval).
- [ ] **4.2** Install + start:
  ```bash
  cp scripts/com.budget.pollemail.plist ~/Library/LaunchAgents/
  launchctl load ~/Library/LaunchAgents/com.budget.pollemail.plist
  ```
- [ ] **4.3** Check after one interval: `cat /tmp/budget-pollemail.out.log`.
- [ ] Stop with `launchctl unload ~/Library/LaunchAgents/com.budget.pollemail.plist`.

---

## Phase 5 — Reconciliation sanity check (optional)

- [ ] After provisional rows exist, import the month's PDF (Import screen or
  `npm run import:statements`). `commitImport` runs `reconcileProvisional()` —
  the provisional alert row is removed once its posted statement row lands, so
  each purchase appears **once**.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Gmail is not configured…` | `COMPOSIO_API_KEY` missing from `.env`. |
| `…initiate… no longer supported… use …/link` | Already handled — `lib/gmail.ts` uses `connectedAccounts.link`. If seen, ensure you're on the current code. |
| Connect returns to Settings with an error | Re-run `scripts/composio-verify.ts` to isolate; check the key and that the toolkit is `gmail`. |
| Sync finds 0 emails | Check `GMAIL_SEARCH_QUERY` (default `from:cibc.com`) matches the alert sender. |
| Parsed list empty but `--raw` has emails | Composio response field names differ; tune `emailText`/`emailDate`/`extractMessages` in `src/lib/gmail.ts`. |
| Wrong merchant/amount parsed | Adjust regexes in `src/lib/parse-alert-email.ts`; add the email as a fixture in `tests/parse-alert-email.test.ts`. |

## Rollback / disconnect

- In-app: **Settings → Email connection → Disconnect** (deletes the Composio
  connection + the local record).
- Stop automation: `launchctl unload ~/Library/LaunchAgents/com.budget.pollemail.plist`.
- Remove provisional rows: delete in /expenses, or via Prisma Studio filtering
  `provisional = true`.

---

## Definition of done

- [ ] Settings shows **Connected · <your gmail>** with a recent "Last synced".
- [ ] A real recent CIBC purchase shows up in /expenses as a provisional row.
- [ ] Re-running the poller creates no duplicates.
- [ ] launchd job is loaded and writing to `/tmp/budget-pollemail.out.log`.
