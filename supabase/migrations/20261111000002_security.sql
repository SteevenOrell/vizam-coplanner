-- Row Level Security, grants, integrity triggers and safe financial operations.
-- Policy pattern: authenticated users see and change only rows whose user_id is their own auth.uid(); anon gets
-- nothing except the public currency list. `(select auth.uid())` is evaluated once per statement (Supabase advice).

-- ---------------------------------------------------------------------------------------------------------------
-- Grants: start from nothing, then allow exactly what the policies cover.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.currencies to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update, delete on
  public.accounts, public.categories, public.recurring_bills, public.transactions, public.budgets,
  public.budget_allocations, public.savings_goals, public.savings_contributions, public.notifications
  to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------------------------
alter table public.currencies enable row level security;
create policy currencies_read on public.currencies for select to anon, authenticated using (true);

alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.user_preferences enable row level security;
create policy user_preferences_select_own on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_preferences_insert_own on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_preferences_update_own on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'recurring_bills', 'transactions', 'budgets',
                           'budget_allocations', 'savings_goals', 'savings_contributions', 'notifications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated
                    with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
                   t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated
                    using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Integrity triggers (run as the caller; RLS still applies to the lookups)
-- ---------------------------------------------------------------------------------------------------------------

-- A transaction's currency is its account's currency, and its category kind matches its own kind.
create or replace function public.transactions_check_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  acc_currency char(3);
  cat_kind text;
  bill_currency char(3);
begin
  select a.currency into acc_currency from public.accounts a where a.id = new.account_id and a.user_id = new.user_id;
  if acc_currency is null then
    raise exception 'account not found' using errcode = '23503';
  end if;
  if acc_currency <> new.currency then
    raise exception 'transaction currency % does not match account currency %', new.currency, acc_currency
      using errcode = '23514';
  end if;
  if new.category_id is not null then
    select c.kind into cat_kind from public.categories c where c.id = new.category_id and c.user_id = new.user_id;
    if cat_kind is distinct from new.kind then
      raise exception 'category kind does not match transaction kind' using errcode = '23514';
    end if;
  end if;
  if new.recurring_bill_id is not null then
    select b.currency into bill_currency from public.recurring_bills b
      where b.id = new.recurring_bill_id and b.user_id = new.user_id;
    if bill_currency is distinct from new.currency or new.kind <> 'expense' then
      raise exception 'bill payment must be an expense in the bill currency' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_check_consistency before insert or update on public.transactions
  for each row execute function public.transactions_check_consistency();

-- Budget allocations only target expense categories.
create or replace function public.budget_allocations_check_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.categories c
                 where c.id = new.category_id and c.user_id = new.user_id and c.kind = 'expense') then
    raise exception 'budget allocations need an expense category' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger budget_allocations_check_category before insert or update on public.budget_allocations
  for each row execute function public.budget_allocations_check_category();

-- A recurring bill's account (if any) has the bill's currency; its category (if any) is an expense category.
create or replace function public.recurring_bills_check_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id and a.currency = new.currency
  ) then
    raise exception 'bill account must use the bill currency' using errcode = '23514';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id and c.kind = 'expense'
  ) then
    raise exception 'bill category must be an expense category' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger recurring_bills_check_consistency before insert or update on public.recurring_bills
  for each row execute function public.recurring_bills_check_consistency();

-- A goal's balance (sum of live contributions) can never go below zero. The goal row is locked so two concurrent
-- withdrawals cannot both pass the check.
create or replace function public.savings_contributions_keep_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  balance bigint;
  goal uuid := case when tg_op = 'DELETE' then old.goal_id else new.goal_id end;
  owner uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  row_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  perform 1 from public.savings_goals g
    where g.id = goal and g.user_id = owner and g.deleted_at is null for update;
  if not found then
    -- The goal is gone or tombstoned: removing its contributions is always fine, adding to it is not.
    if tg_op = 'DELETE' or new.deleted_at is not null then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    raise exception 'goal not found' using errcode = '23503';
  end if;
  select coalesce(sum(c.amount_minor), 0) into balance
    from public.savings_contributions c
    where c.goal_id = goal and c.deleted_at is null and c.id <> row_id;
  if tg_op <> 'DELETE' and new.deleted_at is null then
    balance := balance + new.amount_minor;
  end if;
  if balance < 0 then
    raise exception 'withdrawal exceeds the saved amount' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger savings_contributions_keep_balance before insert or update or delete on public.savings_contributions
  for each row execute function public.savings_contributions_keep_balance();

-- user_id never changes after insert (belt and braces on top of the update policies).
create or replace function public.forbid_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['user_preferences', 'accounts', 'categories', 'recurring_bills', 'transactions', 'budgets',
                           'budget_allocations', 'savings_goals', 'savings_contributions', 'notifications']
  loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.forbid_owner_change()', t || '_forbid_owner_change', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- New users: profile, preferences and starter categories. SECURITY DEFINER because it runs for auth.users inserts;
-- it only writes rows for NEW.id and pins search_path.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80));
  insert into public.user_preferences (user_id) values (new.id);
  insert into public.categories (user_id, name, kind, icon, color) values
    (new.id, 'Salary', 'income', 'briefcase', '#16A34A'),
    (new.id, 'Freelance', 'income', 'laptop', '#0EA5E9'),
    (new.id, 'Other income', 'income', 'plus-circle', '#64748B'),
    (new.id, 'Housing', 'expense', 'home', '#3778F6'),
    (new.id, 'Groceries', 'expense', 'cart', '#F59E0B'),
    (new.id, 'Transport', 'expense', 'bus', '#8B5CF6'),
    (new.id, 'Dining', 'expense', 'utensils', '#EF4444'),
    (new.id, 'Utilities', 'expense', 'bolt', '#14B8A6'),
    (new.id, 'Health', 'expense', 'heart', '#EC4899'),
    (new.id, 'Subscriptions', 'expense', 'repeat', '#6366F1'),
    (new.id, 'Family support', 'expense', 'users', '#F97316'),
    (new.id, 'Other', 'expense', 'tag', '#64748B');
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------------------------
-- Safe financial operations (SECURITY INVOKER: RLS applies; each call is one transaction)
-- ---------------------------------------------------------------------------------------------------------------

-- Marks one due date of a bill as paid: records the expense and moves next_due_on forward atomically. The bill row
-- is locked, and paying a date other than the current next_due_on is rejected, so a double tap cannot pay twice.
create or replace function public.record_bill_payment(
  p_bill_id uuid,
  p_due_on date,
  p_paid_on date,
  p_account_id uuid,
  p_next_due_on date,
  p_transaction_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bill public.recurring_bills%rowtype;
begin
  select * into bill from public.recurring_bills b
    where b.id = p_bill_id and b.user_id = (select auth.uid()) and b.deleted_at is null
    for update;
  if not found then
    raise exception 'bill not found' using errcode = 'P0002';
  end if;
  if bill.next_due_on <> p_due_on then
    raise exception 'this due date is already paid' using errcode = '40001';
  end if;
  if p_next_due_on is not null and p_next_due_on <= p_due_on then
    raise exception 'next due date must be after the paid one' using errcode = '22023';
  end if;

  insert into public.transactions (id, user_id, account_id, category_id, kind, amount_minor, currency, occurred_on,
                                   description, recurring_bill_id)
    values (p_transaction_id, bill.user_id, p_account_id, bill.category_id, 'expense', bill.amount_minor,
            bill.currency, p_paid_on, bill.name, bill.id);

  update public.recurring_bills
    set next_due_on = coalesce(p_next_due_on, next_due_on),
        active = p_next_due_on is not null
    where id = bill.id;
  return p_transaction_id;
end;
$$;

grant execute on function public.record_bill_payment(uuid, date, date, uuid, date, uuid) to authenticated;
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.transactions_check_consistency() to authenticated;
grant execute on function public.budget_allocations_check_category() to authenticated;
grant execute on function public.recurring_bills_check_consistency() to authenticated;
grant execute on function public.savings_contributions_keep_balance() to authenticated;
grant execute on function public.forbid_owner_change() to authenticated;

-- Deleting the account (from Settings) removes the auth user; ON DELETE CASCADE removes every row above.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
