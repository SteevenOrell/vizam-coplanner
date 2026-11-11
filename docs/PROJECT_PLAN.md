# CoPlanner — project plan (kickoff 2026-11-11)

Steeven already said go (relayed by the orchestrating session) and validates at the end, so this plan was written and
then executed without waiting. Tick boxes as steps finish.

## Kickoff

```
PROJECT KICKOFF
What I understood: Personal finance planner (not a bank): transactions, budgets, savings goals, recurring bills,
  calendar, analytics, CSV export, CAD + XOF in integer minor units, light + dark, 15 screens. Expo + TS + Supabase
  (Postgres, Auth, RLS) + SQLite offline + Expo Notifications. Synthetic demo data only.
Size: Big
Approach: Expo SDK 58 + Expo Router (typed routes), same infra as vizam-ticktack (SQLite driver interface,
  better-sqlite3 for Node tests, migrations by user_version, outbox sync, i18n en/fr). Local-first: the app runs fully
  in "demo mode" with no keys; Supabase sync turns on when EXPO_PUBLIC_SUPABASE_* exist. Money = bigint minor units +
  ISO currency code everywhere; never summed across currencies (no FX policy in MVP: totals are per currency, the
  dashboard shows the primary currency and a separate line for the other). Charts: react-native-gifted-charts (SVG,
  works on web). No Docker on this machine: Supabase migrations are plain SQL, RLS tested with PGlite (real Postgres
  in WASM) under Jest with stubbed auth.uid() / roles that mirror Supabase.
Will create: whole repo (app/, src/, supabase/migrations, tests, scripts, docs).
Skills & agents: vizam-token-efficiency, vizam-model-efficiency, vizam-session-handoff, vizam-quality-gate
  (adapted to Expo web); foundation by the main session (Opus: schema, RLS, money domain); screens by two
  vizam-fullstack-developer agents on Sonnet in parallel with disjoint files; QA and screenshots by the main session.
Estimate: ~1.5-2.1M tokens (incl. 25% buffer)
Usage limit: weekly all-models ~15-21 points (now 21% -> ~36-42%); 5-hour window ~85-110 points, so it spans 2
  windows (source: get_usage 2026-11-11 + usage-baseline.md calibration ~1 pt weekly-all per 100k, 5h: Opus ~6.5,
  Sonnet ~4.5 per 100k; estimate). Below the 40%-of-weekly stop rule, so the whole MVP is in scope.
Risks / needs from Steeven (batched at the end): hosted Supabase project + keys in a git-ignored .env, Expo/EAS
  account link, re-attach the two reference images if pixel accuracy matters, device test in Expo Go.
```

## Steps

### Phase 0 — kickoff

- [x] 0.1 Read brief, references, ticktack quirks; write this plan. (main, ~40k)

### Phase 1 — foundation (main session, Opus) ~450-600k

- [x] 1.1 Scaffold: package.json (SDK 58 versions from ticktack), app.config.ts, tsconfig, metro (wasm), jest,
      eslint, prettier, .gitignore, .env.example. Verify `expo start --web` boots. (~60k)
- [x] 1.2 Money domain `src/domain/money`: currencies (CAD exp 2, XOF exp 0), parse/format without floats, per-currency
      sums, budget math, savings math, recurrence (monthly/weekly/yearly due dates), forecast, CSV. Jest tests. (~90k)
- [x] 1.3 Supabase: `supabase/migrations/*.sql` (profiles, user_preferences, accounts, categories, transactions,
      budgets, budget_allocations, savings_goals, savings_contributions, recurring_bills, notifications), checks,
      indexes, RLS on every table, safe RPCs (record contribution, upsert budget with allocations). PGlite test harness + RLS tests (owner can, other user cannot, anon cannot, cross-user FK cannot). (~130k)
- [x] 1.4 Local data: SQLite schema mirroring Postgres, repositories, outbox, sync service (no-op without keys),
      synthetic demo seed (CAD + XOF), data tests. (~120k)
- [x] 1.5 Theme (light/dark tokens from the brief palette), UI kit, i18n en/fr, tab + stack skeleton with every route,
      session/onboarding gate. (~90k)
- [x] 1.6 Commit, handoff note. Verify tsc + jest. (~15k)

### Phase 2 — screens (two Sonnet agents in parallel, disjoint files) ~600-850k

- [x] 2A Onboarding, Auth, Dashboard, Income overview, Expenses, Activity (search/filter), Transaction details,
      Add/edit transaction. (Sonnet, ~300-420k)
- [x] 2B Budgets, Budget category details, Savings goals (+ detail/contribute), Recurring bills, Financial calendar,
      Reports & analytics (+ CSV export), Notifications, Settings & currencies. (Sonnet, ~300-420k)

### Phase 3 — integration and QA (main session) ~250-350k

- [x] 3.1 Review both slices, fix integration issues, local notifications for bills/budgets.
- [x] 3.2 Quality gate: tsc, lint, prettier, jest, npm audit, secret scan, web layout at 240/390/768/1440.
- [x] 3.3 Screenshots of key screens in light and dark (web, Playwright), reviewed and fixed.

### Phase 4 — delivery ~20k

- [x] 4.1 `docs/AGENT_HANDOFF.md` with exact next steps and the batched ask for Steeven.

## Decisions

- Exchange rates: none in the MVP. Amounts in different currencies are never added together; every total is per
  currency. A future FX policy would store dated rates and label converted totals as estimates.
- Accounts are user-defined "wallets" (cash, chequing, savings…) with a currency. No bank connection, no card
  brands, no account numbers.
- Deferred / rejected: real banking, payments, transfers between users, receipts OCR.

## Changes approved during the build (2026-11-11)

- Blue-sky gradient background on every screen; bluer dark mode; animated splash.
- More currencies (10) with a currency picker.
- Bank CSV import (paste or file, column matching, remembered layouts, duplicates, category rules, undo).
