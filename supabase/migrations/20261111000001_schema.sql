-- CoPlanner schema. Every user-owned table carries user_id, Row Level Security is enabled on every table, and
-- cross-row references use composite (id, user_id) foreign keys so a row can never point at another user's data.
-- Money: bigint minor units + explicit ISO currency code; amounts in different currencies are never combined here.
-- Sync: clients create UUIDs offline, write with upsert, and soft-delete with deleted_at (tombstones); updated_at is
-- set by the server on every write and is the pull cursor.

-- ---------------------------------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------------------------------
create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  minor_unit smallint not null check (minor_unit between 0 and 4),
  name text not null
);

insert into public.currencies (code, minor_unit, name) values
  ('CAD', 2, 'Canadian dollar'),
  ('XOF', 0, 'West African CFA franc');

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Users / profiles and preferences
-- ---------------------------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  primary_currency char(3) not null default 'CAD' references public.currencies (code),
  locale text not null default 'en' check (locale in ('en', 'fr')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notify_bills boolean not null default true,
  notify_budgets boolean not null default true,
  bill_reminder_days smallint not null default 2 check (bill_reminder_days between 0 and 14),
  hide_balances boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------------
-- Accounts (user-defined wallets; never connected to a bank)
-- ---------------------------------------------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('cash', 'checking', 'savings', 'credit', 'other')),
  currency char(3) not null references public.currencies (code),
  opening_balance_minor bigint not null default 0
    check (opening_balance_minor between -1000000000000000 and 1000000000000000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  icon text not null default 'tag' check (char_length(icon) <= 40),
  color text not null default '#3778F6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Recurring bills (declared before transactions, which may reference the bill they paid)
-- ---------------------------------------------------------------------------------------------------------------
create table public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000000),
  currency char(3) not null references public.currencies (code),
  account_id uuid,
  category_id uuid,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  "interval" smallint not null default 1 check ("interval" between 1 and 12),
  anchor_date date not null,
  next_due_on date not null,
  end_on date,
  remind_days_before smallint not null default 2 check (remind_days_before between 0 and 14),
  is_subscription boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  check (next_due_on >= anchor_date),
  check (end_on is null or end_on >= anchor_date),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  kind text not null check (kind in ('income', 'expense')),
  -- Always positive; the sign comes from kind.
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000000),
  currency char(3) not null references public.currencies (code),
  occurred_on date not null,
  description text not null default '' check (char_length(description) <= 120),
  note text not null default '' check (char_length(note) <= 1000),
  recurring_bill_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (recurring_bill_id, user_id) references public.recurring_bills (id, user_id)
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc) where deleted_at is null;
create index transactions_user_updated_idx on public.transactions (user_id, updated_at);

-- ---------------------------------------------------------------------------------------------------------------
-- Budgets and allocations (one budget per user, month and currency)
-- ---------------------------------------------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  currency char(3) not null references public.currencies (code),
  name text not null default '' check (char_length(name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create unique index budgets_one_per_month_currency
  on public.budgets (user_id, month, currency) where deleted_at is null;

create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  budget_id uuid not null,
  category_id uuid not null,
  limit_minor bigint not null check (limit_minor between 0 and 1000000000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (budget_id, user_id) references public.budgets (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

create unique index budget_allocations_one_per_category
  on public.budget_allocations (budget_id, category_id) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------------------------
-- Savings goals and contributions
-- ---------------------------------------------------------------------------------------------------------------
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  target_minor bigint not null check (target_minor between 1 and 1000000000000000),
  currency char(3) not null references public.currencies (code),
  target_date date,
  icon text not null default 'piggy' check (char_length(icon) <= 40),
  color text not null default '#3778F6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  -- Positive = deposit, negative = withdrawal; in the goal's currency.
  amount_minor bigint not null
    check (amount_minor <> 0 and amount_minor between -1000000000000000 and 1000000000000000),
  contributed_on date not null,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade
);

create index savings_contributions_goal_idx on public.savings_contributions (goal_id) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('bill_due', 'budget_near', 'budget_over', 'goal_reached', 'system')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 500),
  related_id uuid,
  scheduled_for timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, scheduled_for desc) where deleted_at is null;

-- Pull cursors for sync.
create index accounts_user_updated_idx on public.accounts (user_id, updated_at);
create index categories_user_updated_idx on public.categories (user_id, updated_at);
create index recurring_bills_user_updated_idx on public.recurring_bills (user_id, updated_at);
create index budgets_user_updated_idx on public.budgets (user_id, updated_at);
create index budget_allocations_user_updated_idx on public.budget_allocations (user_id, updated_at);
create index savings_goals_user_updated_idx on public.savings_goals (user_id, updated_at);
create index savings_contributions_user_updated_idx on public.savings_contributions (user_id, updated_at);
create index notifications_user_updated_idx on public.notifications (user_id, updated_at);

-- updated_at on every write
do $$
declare t text;
begin
  foreach t in array array['profiles', 'user_preferences', 'accounts', 'categories', 'recurring_bills', 'transactions',
                           'budgets', 'budget_allocations', 'savings_goals', 'savings_contributions', 'notifications']
  loop
    execute format('create trigger %I before insert or update on public.%I
                    for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end;
$$;
