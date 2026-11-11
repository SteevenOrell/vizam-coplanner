# CoPlanner — architecture and design guide

Personal finance planner (not a bank). Expo SDK 58 + Expo Router (typed routes, `src/app`), TypeScript strict,
SQLite local-first, Supabase (Postgres + Auth + RLS) for sync, Expo Notifications for local reminders.

## 1. Layers

| Layer            | Where                 | Rules                                                                                                                                                                                                                                          |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain (pure TS) | `src/domain`          | Money, dates, budgets, savings, recurrence, reports, CSV. No React, no I/O. Fully unit-tested.                                                                                                                                                 |
| Data (SQLite)    | `src/data`            | `db/` driver + migrations, `tables.ts` (column specs, outbox), `repos/*` (all reads/writes + validation), `sync.ts`, `seed/demo.ts`, `hooks.ts`.                                                                                               |
| State            | `src/state`           | `preferences.tsx` (prefs, locale, `useToday`), `session.tsx` (demo / cloud mode, auth, sync scheduling).                                                                                                                                       |
| UI kit           | `src/ui`              | Theme tokens, Text, Button, Card/HeroCard, Chip/SegmentedControl, Field (Text/Amount/Select), Money, ListRow, Progress, Sheet/SelectSheet/ConfirmDialog, MonthGrid/DatePickerSheet, Snackbar, states, Icon, finance/TransactionRow, format.ts. |
| Features         | `src/features/<area>` | One folder per area; screens + area-only components. Route files in `src/app` only re-export screens.                                                                                                                                          |
| Server           | `supabase/migrations` | Schema, RLS, triggers, RPCs. Tested on PGlite (`tests/db`).                                                                                                                                                                                    |

## 2. Money (non-negotiable)

- Amounts are **integer minor units** (`amountMinor: number`, safe integer, ≤ 1e15) plus an explicit `CurrencyCode`
  (`'CAD'` 2 decimals, `'XOF'` 0 decimals). Never floats for storage or math.
- Parse user input with `parseAmount(text, currency)` (`src/domain/money/format.ts`); show with `<Money>` or
  `useMoneyFormat()`; CSV/edit fields with `minorToDecimalString` / `amountToInput`.
- **Never add amounts in different currencies.** Totals are per currency (`sumByCurrency`). Screens that summarise
  show the primary currency (`prefs.primaryCurrency`) and list the other currency separately, with the note
  `common.currency.noConversion` where relevant. There is no exchange-rate policy in the MVP.
- A transaction's currency is its account's currency (repos enforce it). Transaction amounts are always positive;
  `kind` ('income' | 'expense') gives the sign.

## 3. Data access from screens

```tsx
const db = useDb();
const today = useToday();
const state = useDbQuery((db) => listTransactions(db, { kind: 'expense', from, to }), [from, to]);
return <QueryView state={state}>{(rows) => ...}</QueryView>;
```

- `useDbQuery` re-runs after every local write and sync pull. Deps must be primitives.
- Writes: call repo functions (`createTransaction`, `saveBudget`, `addContribution`, `markBillPaid`, …). They
  validate and throw `ValidationError` with `code` → show `t(\`errors.${code}\`)`. Catch anything else as
`errors.generic`.
- `useLookups()` gives category and account maps for rows.
- Never write SQL in screens; add a repo/query function in `src/data/repos` (or a feature-local `queries.ts` that
  only uses repo functions) if needed.

## 4. Sessions

- `useSession()`: `mode` is `new` (→ onboarding), `demo` (synthetic local data, nothing leaves the device) or
  `cloud` (Supabase; offline-first, syncs in the background). `startDemo()`, `signIn()`, `signUp()`, `signOut()`,
  `leaveDemo()`, `resetDemo()`, `sync`, `syncNow()`, `cloudAvailable` (false when the build has no Supabase env).
- Dev web only: `?demo=1` (or `?demo=reset`) seeds demo mode; `&lang=fr`, `&theme=dark|light`,
  `&today=YYYY-MM-DD` for screenshots.

## 5. Design identity

Original identity combining the two references: airy light UI (white rounded cards on #F6F8FC, thin display type,
soft gradients, round quick actions, raised round "+" in the tab bar) and a deep-navy dark UI with premium blue
gradient cards, strong data hierarchy and progress indicators. No bank names, card brands, card numbers or
anything implying a real bank connection.

- Palette (`src/ui/theme/tokens.ts`): navy #111C3A, electric blue #3778F6, soft blue #DDE8FC, bg #F6F8FC,
  text #172033, positive #16A34A, warning #F59E0B (+ danger). Use tokens only, never hex in screens (category
  colours from data are the exception).
- Type: Plus Jakarta Sans. `display` (thin, big balances with lighter decimals via `<Money lightDecimals>`),
  `title`, `heading`, `body`, `bodyStrong`, `label`, `caption`, `overline`, `amount` (tabular numbers).
- Signature element: `HeroCard` (navy → blue gradient with faint concentric "plan" rings). One per screen at most.
- Radius: cards 20, hero 28, inputs 14, pills full. Spacing scale `space.*`. Content column max 720 px.
- Progress: `ProgressBar` (status ok / near (amber) / over (red) / goal (blue→green)), `ProgressRing`.
- Empty, loading and error states on every data screen (`EmptyState`, `Skeleton`, `ErrorState`, `QueryView`).
- Accessibility: every pressable has a role + label; amounts have readable labels; touch targets ≥ 44 px;
  text via `<Text>` (font scaling capped at 1.6); colour is never the only signal (icons/labels for status).

## 6. i18n

English + French (`src/i18n/locales/{en,fr}/<area>.json`, keys `area.key`). Every UI string goes through `t()`.
The parity test fails if French misses a key. Money/dates use `usePreferences().locale` (`en-CA` / `fr-CA`).

## 7. Server (Supabase)

`supabase/migrations/*.sql`: all tables have `user_id`, RLS on, `(select auth.uid())` policies for
select/insert/update/delete, composite FKs `(id, user_id)` so rows cannot reference other users' rows, triggers
for currency/kind consistency and non-negative goal balances, `record_bill_payment` RPC (row lock, no double pay),
`delete_my_account`, `handle_new_user` (profile, preferences, starter categories). Tests: `npm run test:db`.

## 8. Known limits (MVP)

- Sync is last-write-wins per row with server `updated_at` cursors (2-minute overlap). No field-level merge.
- Supabase session in AsyncStorage (localStorage on web), not hardware-encrypted; local SQLite unencrypted.
- No exchange rates; no bank connections; no payments.
