# Supabase (CoPlanner)

Plain SQL migrations for a Supabase project. The app works without Supabase (local demo mode); these are needed only
for accounts and sync.

## Files

- `migrations/20261111000001_schema.sql`: tables (profiles, user_preferences, accounts, categories, recurring_bills,
  transactions, budgets, budget_allocations, savings_goals, savings_contributions, notifications), checks, indexes,
  `updated_at` triggers.
- `migrations/20261111000002_security.sql`: grants, RLS policies on every table, integrity triggers, new-user
  bootstrap, `record_bill_payment` and `delete_my_account` RPCs.

## Tests (no Docker needed)

`npm run test:db` runs both migrations on PGlite (Postgres compiled to WASM) with a small stand-in for Supabase's
`auth` schema and roles (`tests/db/supabase-stub.sql`) and checks RLS isolation, anon access, cross-user references,
money constraints, goal balances and the RPCs.

## Applying to a hosted project (Steeven)

1. Create a Supabase project (region close to users, e.g. Canada Central).
2. Apply the migrations, either with the CLI:
   ```bash
   npx supabase@latest link --project-ref <project-ref>
   ```
   ```bash
   npx supabase@latest db push
   ```
   or by pasting the two files, in order, into the SQL editor.
3. Auth → Providers → Email: enabled. Decide whether to require email confirmation (the app handles both).
4. Put the project URL and the **anon** public key in the app's git-ignored `.env` (see `.env.example`). Never put
   the service-role key in the app.
5. Optional: run the advisors (Database → Advisors) and confirm "RLS enabled" on every table.
