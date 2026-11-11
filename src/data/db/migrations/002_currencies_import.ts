import { migration001 } from './001_initial';

/**
 * 1. More currencies: the CAD/XOF CHECKs become "three capital letters" (the supported list lives in
 *    src/domain/money/currency.ts and in Postgres' currencies table). SQLite cannot alter a CHECK, so each affected
 *    table is rebuilt from its 001 definition (12-step procedure; the runner turns foreign keys off around it).
 * 2. Bank-file import (local only, never synced): saved column layouts per account, keyword → category rules, and
 *    import batches so a whole import can be undone.
 */
const REBUILT = ['preferences', 'accounts', 'recurring_bills', 'transactions', 'budgets', 'savings_goals'] as const;

function createStatement(table: string): string {
  const m = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(migration001);
  if (!m) throw new Error(`No CREATE TABLE for ${table} in 001`);
  return `CREATE TABLE ${table}__new (${m[1]!}\n);`
    .replace(/primary_currency IN \('CAD', 'XOF'\)/g, "primary_currency GLOB '[A-Z][A-Z][A-Z]'")
    .replace(/currency IN \('CAD', 'XOF'\)/g, "currency GLOB '[A-Z][A-Z][A-Z]'");
}

function indexes(table: string): string {
  return migration001
    .split(';')
    .map((s) => s.trim())
    .filter((s) => new RegExp(`^CREATE (UNIQUE )?INDEX \\w+ ON ${table} `).test(s))
    .map((s) => `${s};`)
    .join('\n');
}

const rebuild = REBUILT.map(
  (t) => `
${createStatement(t)}
INSERT INTO ${t}__new SELECT * FROM ${t};
DROP TABLE ${t};
ALTER TABLE ${t}__new RENAME TO ${t};
${indexes(t)}`,
).join('\n');

export const migration002 = `
${rebuild}

CREATE TABLE import_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  -- JSON ImportMapping (src/domain/import): columns, date format, decimal mark, sign handling.
  mapping TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX import_profiles_account_idx ON import_profiles (account_id);

CREATE TABLE category_rules (
  id TEXT PRIMARY KEY NOT NULL,
  -- Case-insensitive substring of the bank description, e.g. 'NETFLIX'.
  pattern TEXT NOT NULL CHECK (length(pattern) BETWEEN 2 AND 60),
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  category_id TEXT NOT NULL REFERENCES categories (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX category_rules_pattern_kind ON category_rules (lower(pattern), kind);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  source_name TEXT NOT NULL DEFAULT '' CHECK (length(source_name) <= 120),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE import_batch_items (
  batch_id TEXT NOT NULL REFERENCES import_batches (id),
  transaction_id TEXT NOT NULL REFERENCES transactions (id),
  PRIMARY KEY (batch_id, transaction_id)
);
`;
