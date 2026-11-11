# Agent handoff — CoPlanner

## Objective

Personal finance planner (not a bank) for Steeven's portfolio: Expo + TypeScript, SQLite offline-first, Supabase
(Postgres + Auth + RLS) sync, Expo Notifications. Brief: `docs/BRIEF.md`. Plan and estimates: `docs/PROJECT_PLAN.md`.
Architecture, money rules and design identity: `docs/ARCHITECTURE.md`.

## Repository

- Path: `C:\Users\SteevenWemin\Documents\Projects\vizam-coplanner`. Remote: none (nothing pushed).
- Branches: `feat/setup` → `feat/data-layer` → `feat/screens` (current, contains everything). `main` has no commits.
- Agent worktrees under `.claude/worktrees/` are leftovers (their work is merged or copied); jest and Metro ignore
  `.claude/`. They can be removed with `git worktree remove --force <path>` once nobody needs them.

## Approved decisions

- Stack as in the brief; Expo SDK 58, Expo Router typed routes (`src/app`), Plus Jakarta Sans.
- Money: integer minor units + ISO code; never summed across currencies (no FX policy). 10 currencies: CAD, XOF,
  USD, EUR, GBP, CHF, XAF, NGN, GHS, MAD (add more in `src/domain/money/currency.ts`, Supabase migration, i18n).
- No Docker on this machine: Supabase migrations tested on PGlite (`npm run test:db`).
- Design (Steeven, 2026-11-11): blue-sky gradient behind every screen; dark mode clearly blue (not black);
  animated splash with the mark on a blue sky. Reference images were never received in this session (written
  description only, `docs/REFERENCES.md`).
- Expenses are entered manually (no bank connection). Bulk entry via bank CSV import (approved 2026-11-11):
  column matching, remembered layouts, duplicate detection, keyword/rule categories, undoable batches.
- Demo mode with synthetic data ("Alex Demo", CAD + XOF) works without any keys.

## Done

- Supabase: `supabase/migrations/` (schema, RLS on all tables, integrity triggers, `record_bill_payment`,
  `delete_my_account`, more currencies); `supabase/README.md`.
- Domain: `src/domain` (money, dates, budget, savings, recurrence, reports, CSV export, `import/` parsing).
- Data: `src/data` (SQLite migrations 001–002, repos, outbox sync, demo seed, import repo).
- UI: all 15 brief screens + bank import (`src/features/*`), UI kit `src/ui`, sky background, splash, currency picker.
- i18n en/fr with a parity test.

## Pending (priority order)

1. Quality gate leftovers: `npm audit` review (`vizam-dependency-audit-fix`), secret scan,
   `vizam-mobile-export-check` (web export + Android bundle), full screenshot refresh (`node scripts/screenshots.mjs`).
2. Device test in Expo Go (SQLite, notifications, document picker, CSV share) — not possible from this machine.
3. Steeven's items below, then an end-to-end cloud sync test against a real Supabase project.
4. Importer: test against a real (anonymised) bank export; OFX/QFX import; quick-add favourites.
5. Remove the leftover agent worktrees under `.claude/worktrees/` when convenient.

## Last verified checks (2026-11-11, branch feat/screens)

| Check                   | Command                                      | Result                                                                                     |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Typecheck               | `npx tsc --noEmit`                           | pass                                                                                       |
| Lint                    | `npm run lint`                               | pass (0 errors, 0 warnings)                                                                |
| All tests               | `npm test` (app + db projects)               | 21 suites, 268 tests passed                                                                |
| DB / RLS                | included above (`npm run test:db` alone: 43) | pass                                                                                       |
| Import flow on web      | `node scripts/screenshots-import.mjs`        | pass: paste → columns → review → import, light/dark/300 px, no overflow, no console errors |
| Layout sweep            | `node scripts/screenshots.mjs`               | earlier run (before currencies/import): 0 overflow 300–1440 px, 240 px lock OK             |
| Screenshots             | `docs/screenshots/`                          | key screens, splash, sky and import steps reviewed (light + dark)                          |
| npm audit, export check | —                                            | not run                                                                                    |

## Known issues and risks

- Native runtime (SQLite, reminders, document picker, sharing) only unit-tested; needs a device run.
- Sync is last-write-wins per row; Supabase session in AsyncStorage; local SQLite unencrypted (ARCHITECTURE §8).
- Import categories/rules/layouts are local only (not synced).
- Metro: never run a dev server inside `.claude/worktrees` (cache collides with the main checkout).

## Setup

- Install: `npm ci --ignore-scripts` (better-sqlite3 prebuilds load fine; no node-gyp/Python needed).
- Web: `npx expo start --web --port 8101`, then `http://localhost:8101/?demo=1` (`&theme=dark`, `&lang=fr`,
  `&today=YYYY-MM-DD`, `&holdSplash=1` for the splash).
- Tests: `npm test`, `npm run test:db`. Lint/format: `npm run lint`, `npx prettier --check .`.
- Env var names (values only in the git-ignored `.env`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Next step

Run `vizam-mobile-export-check` (web export + Android bundle) and `npm audit`, fix what they find, refresh all
screenshots with `node scripts/screenshots.mjs`, then hand the batched list below to Steeven.

## Waiting for approval / Steeven only

- Create the hosted Supabase project, apply the three migrations (`supabase/README.md`), put URL + anon key in `.env`.
- Expo / EAS account link for builds (owner `vizam`?) and a device test in Expo Go.
- Push / remote: none created yet; say where to push.
- Optional: a real (anonymised) bank export from one Canadian bank and one XOF bank / mobile-money account to
  test the importer against.
