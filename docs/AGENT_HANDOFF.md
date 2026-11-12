# Agent handoff — CoPlanner

## Objective

Personal finance planner (not a bank) for Steeven's portfolio: Expo + TypeScript, SQLite offline-first, Supabase
(Postgres + Auth + RLS) sync, Expo Notifications. Brief: `docs/BRIEF.md`. Plan and estimates: `docs/PROJECT_PLAN.md`.
Architecture, money rules and design identity: `docs/ARCHITECTURE.md`.

## Repository

- Path: `C:\Users\SteevenWemin\Documents\Projects\vizam-coplanner`. Remote: `origin` (GitHub, private).
- Branches: `feat/setup` → `feat/data-layer` → `feat/screens` (current, contains everything); `main` = `feat/screens`.
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

1. Secret scan of git history before the first push (no keys were ever written; `.env` is git-ignored).
2. Device test in Expo Go (SQLite, notifications, document picker, CSV share) — not possible from this machine.
3. Steeven's items below, then an end-to-end cloud sync test against a real Supabase project.
4. Importer: test against a real (anonymised) bank export; OFX/QFX import; quick-add favourites.
5. Remove the leftover agent worktrees under `.claude/worktrees/` when convenient.

## Last verified checks (2026-11-11, branch feat/screens)

| Check              | Command                                               | Result                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck          | `npx tsc --noEmit`                                    | pass                                                                                                                                                                                                    |
| Lint               | `npm run lint`                                        | pass (0 errors, 0 warnings)                                                                                                                                                                             |
| All tests          | `npm test` (app + db projects)                        | 21 suites, 268 tests passed                                                                                                                                                                             |
| DB / RLS           | included above (`npm run test:db` alone: 43)          | pass                                                                                                                                                                                                    |
| Import flow on web | `node scripts/screenshots-import.mjs`                 | pass: paste → columns → review → import, light/dark/300 px, no overflow, no console errors                                                                                                              |
| Layout sweep       | `node scripts/screenshots.mjs`                        | earlier run (before currencies/import): 0 overflow 300–1440 px, 240 px lock OK                                                                                                                          |
| Screenshots        | `docs/screenshots/`                                   | key screens, splash, sky and import steps reviewed (light + dark)                                                                                                                                       |
| Web export         | `npx expo export --platform web`                      | pass                                                                                                                                                                                                    |
| Android export     | `npx expo export --platform android` (TMP in `.tmp/`) | pass, Hermes bytecode bundle                                                                                                                                                                            |
| npm audit          | `npm audit --omit=dev`                                | 3 advisories kept (1 low, 2 moderate: deepmerge, glob, minimatch) — all via Jest test tooling, not in the app bundle; only fix is `--force` (downgrades Expo). Recheck after the next Expo/Jest update. |

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

## Deploy (Vercel)

- Config is in `vercel.json`: install `npm ci --ignore-scripts`, build `npx expo export --platform web`, output `dist`,
  SPA fallback to `index.html`, security + cache headers. Node 22 (`engines`). Framework preset: Other.
- **No environment variables are required**: without `EXPO_PUBLIC_SUPABASE_*` the app runs in local demo mode. When
  the Supabase project exists, add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as "config" visibility
  (public anon key; never the service-role key) and redeploy.
- Verified (2026-11-12): production build served like Vercel (`node scripts/serve-dist.mjs`, `node scripts/prod-probe.mjs`):
  no console errors or warnings, onboarding → demo data, deep links, reload persistence, import screen, no overflow at 300 px.
- Web limits: the local database needs a secure context (https or localhost); some in-app browsers / private modes
  block it and the app then shows its error state with Retry. Vercel is https, so normal browsers are fine.
- Preview deployments are behind Vercel Authentication by default (team members only).
- GitHub: private repo `SteevenOrell/vizam-coplanner` (remote `origin`); `main` = `feat/screens`.
- Vercel (Hobby team "Steeven's projects", project `vizam-coplanner`, connected to the repo, Framework Preset Other, no env vars):
  production **https://vizam-coplanner.vercel.app** (from `main`), branch preview
  https://vizam-coplanner-git-feat-screens-steeven-s-projects.vercel.app (behind Vercel sign-in).
  Verified live 2026-11-12: `node scripts/prod-probe.mjs https://vizam-coplanner.vercel.app` passes (no console errors,
  demo data, deep links, reload persistence, import, 300 px), security headers and immutable asset caching present.
- **Commit author must be the GitHub no-reply address** (repo-local git config; global config is the company email).
  Vercel Hobby blocks deployments from commits whose email is not linked to the GitHub account (the first build
  was "Blocked" for that reason). Alternative: add the company email to the GitHub account.
- Vercel CLI: `npx vercel@latest` (logged in as steevenwemin). Local `vercel deploy` upload failed on this network
  ("Upload aborted"); deploy by pushing to GitHub instead. In Git Bash use `MSYS_NO_PATHCONV=1` with `vercel curl`.

## Next step

Phone check of the production site (splash, demo data, budgets, add transaction, import, dark mode), then the Supabase
project + keys (add `EXPO_PUBLIC_SUPABASE_*` in Vercel as config values and redeploy), EAS, device test in Expo Go.

## Waiting for approval / Steeven only

- Create the hosted Supabase project, apply the three migrations (`supabase/README.md`), put URL + anon key in `.env`.
- Expo / EAS account link for builds (owner `vizam`?) and a device test in Expo Go.
- Push / remote: none created yet; say where to push.
- Optional: a real (anonymised) bank export from one Canadian bank and one XOF bank / mobile-money account to
  test the importer against.
