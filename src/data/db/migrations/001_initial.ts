/**
 * Local SQLite schema. Mirrors supabase/migrations column for column (minus user_id: one user per device database),
 * with the same CHECK limits so a row that saves offline also passes the server constraints. Money columns are
 * INTEGER minor units. Booleans are 0/1. Dates are ISO TEXT. Soft deletes (deleted_at) are tombstones for sync.
 */
export const migration001 = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL DEFAULT '' CHECK (length(display_name) <= 80),
  primary_currency TEXT NOT NULL DEFAULT 'CAD' CHECK (primary_currency IN ('CAD', 'XOF')),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr')),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  notify_bills INTEGER NOT NULL DEFAULT 1,
  notify_budgets INTEGER NOT NULL DEFAULT 1,
  bill_reminder_days INTEGER NOT NULL DEFAULT 2 CHECK (bill_reminder_days BETWEEN 0 AND 14),
  hide_balances INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  kind TEXT NOT NULL CHECK (kind IN ('cash', 'checking', 'savings', 'credit', 'other')),
  currency TEXT NOT NULL CHECK (currency IN ('CAD', 'XOF')),
  opening_balance_minor INTEGER NOT NULL DEFAULT 0
    CHECK (opening_balance_minor BETWEEN -1000000000000000 AND 1000000000000000),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  icon TEXT NOT NULL DEFAULT 'tag',
  color TEXT NOT NULL DEFAULT '#3778F6',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE recurring_bills (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000000000),
  currency TEXT NOT NULL CHECK (currency IN ('CAD', 'XOF')),
  account_id TEXT REFERENCES accounts (id),
  category_id TEXT REFERENCES categories (id),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval BETWEEN 1 AND 12),
  anchor_date TEXT NOT NULL,
  next_due_on TEXT NOT NULL,
  end_on TEXT,
  remind_days_before INTEGER NOT NULL DEFAULT 2 CHECK (remind_days_before BETWEEN 0 AND 14),
  is_subscription INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (next_due_on >= anchor_date),
  CHECK (end_on IS NULL OR end_on >= anchor_date)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  category_id TEXT REFERENCES categories (id),
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000000000),
  currency TEXT NOT NULL CHECK (currency IN ('CAD', 'XOF')),
  occurred_on TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 120),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  recurring_bill_id TEXT REFERENCES recurring_bills (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX transactions_date_idx ON transactions (occurred_on DESC) WHERE deleted_at IS NULL;

CREATE TABLE budgets (
  id TEXT PRIMARY KEY NOT NULL,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-01'),
  currency TEXT NOT NULL CHECK (currency IN ('CAD', 'XOF')),
  name TEXT NOT NULL DEFAULT '' CHECK (length(name) <= 60),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX budgets_one_per_month_currency ON budgets (month, currency) WHERE deleted_at IS NULL;

CREATE TABLE budget_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  budget_id TEXT NOT NULL REFERENCES budgets (id),
  category_id TEXT NOT NULL REFERENCES categories (id),
  limit_minor INTEGER NOT NULL CHECK (limit_minor BETWEEN 0 AND 1000000000000000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX budget_allocations_one_per_category ON budget_allocations (budget_id, category_id)
  WHERE deleted_at IS NULL;

CREATE TABLE savings_goals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  target_minor INTEGER NOT NULL CHECK (target_minor BETWEEN 1 AND 1000000000000000),
  currency TEXT NOT NULL CHECK (currency IN ('CAD', 'XOF')),
  target_date TEXT,
  icon TEXT NOT NULL DEFAULT 'piggy',
  color TEXT NOT NULL DEFAULT '#3778F6',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE savings_contributions (
  id TEXT PRIMARY KEY NOT NULL,
  goal_id TEXT NOT NULL REFERENCES savings_goals (id),
  amount_minor INTEGER NOT NULL
    CHECK (amount_minor <> 0 AND amount_minor BETWEEN -1000000000000000 AND 1000000000000000),
  contributed_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX savings_contributions_goal_idx ON savings_contributions (goal_id) WHERE deleted_at IS NULL;

CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bill_due', 'budget_near', 'budget_over', 'goal_reached', 'system')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 500),
  related_id TEXT,
  scheduled_for TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Local writes waiting to be pushed, in order. Soft deletes are upserts of the tombstone.
CREATE TABLE outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX outbox_row_idx ON outbox (table_name, row_id);
`;
