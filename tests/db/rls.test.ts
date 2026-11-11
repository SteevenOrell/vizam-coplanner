import type { PGlite } from '@electric-sql/pglite';

import { as, createDb, createUser, pgError } from './harness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const OWNED_TABLES = [
  'accounts',
  'categories',
  'recurring_bills',
  'transactions',
  'budgets',
  'budget_allocations',
  'savings_goals',
  'savings_contributions',
  'notifications',
  'user_preferences',
] as const;

let db: PGlite;
const ids: Record<string, string> = {};

async function seedFor(user: string, prefix: string) {
  await as(
    db,
    'authenticated',
    user,
    async (q) => {
      const [acc] = await q<{ id: string }>(
        `insert into public.accounts (name, kind, currency) values ('Chequing', 'checking', 'CAD') returning id`,
      );
      const [cat] = await q<{ id: string }>(
        `select id from public.categories where name = 'Groceries' and user_id = auth.uid()`,
      );
      const [tx] = await q<{ id: string }>(
        `insert into public.transactions (account_id, category_id, kind, amount_minor, currency, occurred_on, description)
         values ($1, $2, 'expense', 4250, 'CAD', '2026-11-03', 'Market') returning id`,
        [acc!.id, cat!.id],
      );
      const [budget] = await q<{ id: string }>(
        `insert into public.budgets (month, currency) values ('2026-11-01', 'CAD') returning id`,
      );
      await q(`insert into public.budget_allocations (budget_id, category_id, limit_minor) values ($1, $2, 50000)`, [
        budget!.id,
        cat!.id,
      ]);
      const [goal] = await q<{ id: string }>(
        `insert into public.savings_goals (name, target_minor, currency) values ('Trip', 200000, 'CAD') returning id`,
      );
      await q(
        `insert into public.savings_contributions (goal_id, amount_minor, contributed_on) values ($1, 10000, '2026-11-01')`,
        [goal!.id],
      );
      const [bill] = await q<{ id: string }>(
        `insert into public.recurring_bills (name, amount_minor, currency, account_id, category_id, frequency, anchor_date, next_due_on)
         values ('Phone', 6500, 'CAD', $1, $2, 'monthly', '2026-11-15', '2026-11-15') returning id`,
        [acc!.id, cat!.id],
      );
      await q(`insert into public.notifications (kind, title) values ('system', 'Welcome')`);
      Object.assign(ids, {
        [`${prefix}Account`]: acc!.id,
        [`${prefix}Category`]: cat!.id,
        [`${prefix}Tx`]: tx!.id,
        [`${prefix}Budget`]: budget!.id,
        [`${prefix}Goal`]: goal!.id,
        [`${prefix}Bill`]: bill!.id,
      });
    },
    { commit: true },
  );
}

beforeAll(async () => {
  db = await createDb();
  await createUser(db, ALICE, 'Alice');
  await createUser(db, BOB, 'Bob');
  await seedFor(ALICE, 'a');
  await seedFor(BOB, 'b');
});

afterAll(async () => {
  await db.close();
});

describe('new user bootstrap', () => {
  it('creates a profile, preferences and starter categories', async () => {
    await as(db, 'authenticated', ALICE, async (q) => {
      const [profile] = await q<{ display_name: string }>(`select display_name from public.profiles`);
      expect(profile!.display_name).toBe('Alice');
      const [prefs] = await q<{ primary_currency: string }>(`select primary_currency from public.user_preferences`);
      expect(prefs!.primary_currency).toBe('CAD');
      const cats = await q(`select id from public.categories`);
      expect(cats.length).toBe(12);
    });
  });
});

describe('row level security', () => {
  it.each(OWNED_TABLES)('%s: a user only sees their own rows', async (table) => {
    await as(db, 'authenticated', ALICE, async (q) => {
      const rows = await q<{ user_id: string }>(`select user_id from public.${table}`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === ALICE)).toBe(true);
    });
  });

  it.each([...OWNED_TABLES, 'profiles'])('%s: anon sees nothing and cannot read', async (table) => {
    const msg = await pgError(as(db, 'anon', null, (q) => q(`select * from public.${table}`)));
    expect(msg).toMatch(/permission denied/);
  });

  it('anon can read the currency list', async () => {
    const rows = await as(db, 'anon', null, (q) =>
      q<{ code: string }>(`select code from public.currencies order by code`),
    );
    expect(rows.map((r) => r.code)).toEqual(['CAD', 'XOF']);
  });

  it('profiles: only your own', async () => {
    const rows = await as(db, 'authenticated', BOB, (q) => q<{ id: string }>(`select id from public.profiles`));
    expect(rows).toEqual([{ id: BOB }]);
  });

  it('cannot insert a row owned by someone else', async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(`insert into public.accounts (user_id, name, kind, currency) values ($1, 'Sneaky', 'cash', 'CAD')`, [BOB]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("cannot update or delete someone else's rows (silently matches nothing)", async () => {
    await as(db, 'authenticated', ALICE, async (q) => {
      const updated = await q(`update public.transactions set amount_minor = 1 where id = $1 returning id`, [ids.bTx]);
      expect(updated).toEqual([]);
      const deleted = await q(`delete from public.transactions where id = $1 returning id`, [ids.bTx]);
      expect(deleted).toEqual([]);
    });
    const [row] = await as(db, 'authenticated', BOB, (q) =>
      q<{ amount_minor: string }>(`select amount_minor from public.transactions where id = $1`, [ids.bTx]),
    );
    expect(Number(row!.amount_minor)).toBe(4250);
  });

  it('cannot move a row to another user', async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(`update public.accounts set user_id = $1 where id = $2`, [BOB, ids.aAccount]),
      ),
    );
    expect(msg).toMatch(/row-level security|user_id cannot change/);
  });

  it("cannot reference another user's account or category", async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(
          `insert into public.transactions (account_id, kind, amount_minor, currency, occurred_on) values ($1, 'expense', 100, 'CAD', '2026-11-05')`,
          [ids.bAccount],
        ),
      ),
    );
    expect(msg).toMatch(/foreign key|account not found/);
    const msg2 = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(`insert into public.budget_allocations (budget_id, category_id, limit_minor) values ($1, $2, 100)`, [
          ids.aBudget,
          ids.bCategory,
        ]),
      ),
    );
    expect(msg2).toMatch(/foreign key|expense category/);
  });

  it('authenticated users cannot touch auth.users or call the bootstrap function', async () => {
    expect(await pgError(as(db, 'authenticated', ALICE, (q) => q(`select * from auth.users`)))).toMatch(
      /permission denied/,
    );
    expect(
      await pgError(as(db, 'authenticated', ALICE, (q) => q(`insert into auth.users (id) values (gen_random_uuid())`))),
    ).toMatch(/permission denied/);
  });
});

describe('money integrity', () => {
  it('rejects zero, negative and oversized transaction amounts', async () => {
    for (const amount of [0, -5, '1000000000000001']) {
      const msg = await pgError(
        as(db, 'authenticated', ALICE, (q) =>
          q(
            `insert into public.transactions (account_id, kind, amount_minor, currency, occurred_on) values ($1, 'income', $2, 'CAD', '2026-11-05')`,
            [ids.aAccount, amount],
          ),
        ),
      );
      expect(msg).toMatch(/check constraint/);
    }
  });

  it('rejects a transaction whose currency differs from its account', async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(
          `insert into public.transactions (account_id, kind, amount_minor, currency, occurred_on) values ($1, 'expense', 1500, 'XOF', '2026-11-05')`,
          [ids.aAccount],
        ),
      ),
    );
    expect(msg).toMatch(/does not match account currency/);
  });

  it('rejects an income transaction in an expense category', async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(
          `insert into public.transactions (account_id, category_id, kind, amount_minor, currency, occurred_on) values ($1, $2, 'income', 100, 'CAD', '2026-11-05')`,
          [ids.aAccount, ids.aCategory],
        ),
      ),
    );
    expect(msg).toMatch(/category kind/);
  });

  it('rejects unknown currencies and a budget month that is not the 1st', async () => {
    expect(
      await pgError(
        as(db, 'authenticated', ALICE, (q) =>
          q(`insert into public.accounts (name, kind, currency) values ('Euro', 'cash', 'EUR')`),
        ),
      ),
    ).toMatch(/foreign key/);
    expect(
      await pgError(
        as(db, 'authenticated', ALICE, (q) =>
          q(`insert into public.budgets (month, currency) values ('2026-12-15', 'CAD')`),
        ),
      ),
    ).toMatch(/check constraint/);
  });

  it('allows one live budget per month and currency', async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(`insert into public.budgets (month, currency) values ('2026-11-01', 'CAD')`),
      ),
    );
    expect(msg).toMatch(/duplicate key/);
    await as(db, 'authenticated', ALICE, async (q) => {
      await q(`insert into public.budgets (month, currency) values ('2026-11-01', 'XOF')`);
    });
  });

  it('keeps a savings goal balance at or above zero', async () => {
    await as(db, 'authenticated', ALICE, async (q) => {
      await q(
        `insert into public.savings_contributions (goal_id, amount_minor, contributed_on) values ($1, -10000, '2026-11-02')`,
        [ids.aGoal],
      );
    });
    const msg = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(
          `insert into public.savings_contributions (goal_id, amount_minor, contributed_on) values ($1, -10001, '2026-11-02')`,
          [ids.aGoal],
        ),
      ),
    );
    expect(msg).toMatch(/exceeds the saved amount/);
  });

  it('does not let a deposit be removed when a withdrawal depends on it', async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, async (q) => {
        const [dep] = await q<{ id: string }>(`select id from public.savings_contributions where goal_id = $1`, [
          ids.aGoal,
        ]);
        await q(
          `insert into public.savings_contributions (goal_id, amount_minor, contributed_on) values ($1, -6000, '2026-11-02')`,
          [ids.aGoal],
        );
        await q(`update public.savings_contributions set deleted_at = now() where id = $1`, [dep!.id]);
      }),
    );
    expect(msg).toMatch(/exceeds the saved amount/);
  });

  it('sets updated_at on the server', async () => {
    await as(db, 'authenticated', ALICE, async (q) => {
      const [row] = await q<{ updated_at: Date }>(
        `insert into public.accounts (name, kind, currency, updated_at) values ('Wallet', 'cash', 'XOF', '2000-01-01') returning updated_at`,
      );
      expect(new Date(row!.updated_at).getFullYear()).toBeGreaterThan(2000);
    });
  });
});

describe('record_bill_payment', () => {
  it('records the expense and advances the due date atomically', async () => {
    await as(db, 'authenticated', ALICE, async (q) => {
      const [{ record_bill_payment: txId }] = (await q<{ record_bill_payment: string }>(
        `select public.record_bill_payment($1, '2026-11-15', '2026-11-14', $2, '2026-12-15')`,
        [ids.aBill, ids.aAccount],
      )) as [{ record_bill_payment: string }];
      const [tx] = await q<{ amount_minor: string; recurring_bill_id: string; kind: string }>(
        `select amount_minor, recurring_bill_id, kind from public.transactions where id = $1`,
        [txId],
      );
      expect(Number(tx!.amount_minor)).toBe(6500);
      expect(tx!.recurring_bill_id).toBe(ids.aBill);
      const [bill] = await q<{ next_due_on: Date }>(
        `select next_due_on::text as next_due_on from public.recurring_bills where id = $1`,
        [ids.aBill],
      );
      expect(String(bill!.next_due_on)).toBe('2026-12-15');
    });
  });

  it('refuses to pay the same due date twice', async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, async (q) => {
        await q(`select public.record_bill_payment($1, '2026-11-15', '2026-11-14', $2, '2026-12-15')`, [
          ids.aBill,
          ids.aAccount,
        ]);
        await q(`select public.record_bill_payment($1, '2026-11-15', '2026-11-14', $2, '2026-12-15')`, [
          ids.aBill,
          ids.aAccount,
        ]);
      }),
    );
    expect(msg).toMatch(/already paid/);
  });

  it("cannot pay someone else's bill", async () => {
    const msg = await pgError(
      as(db, 'authenticated', ALICE, (q) =>
        q(`select public.record_bill_payment($1, '2026-11-15', '2026-11-14', $2, '2026-12-15')`, [
          ids.bBill,
          ids.aAccount,
        ]),
      ),
    );
    expect(msg).toMatch(/bill not found/);
  });

  it('anon cannot call it', async () => {
    const msg = await pgError(
      as(db, 'anon', null, (q) =>
        q(`select public.record_bill_payment($1, '2026-11-15', '2026-11-14', $2, '2026-12-15')`, [
          ids.aBill,
          ids.aAccount,
        ]),
      ),
    );
    expect(msg).toMatch(/permission denied/);
  });
});

describe('delete_my_account', () => {
  it("removes the caller's data and nobody else's", async () => {
    const CAROL = '33333333-3333-4333-8333-333333333333';
    await createUser(db, CAROL);
    await as(db, 'authenticated', CAROL, (q) => q(`select public.delete_my_account()`), { commit: true });
    const left = await db.query<{ n: number }>(`select count(*)::int as n from public.categories where user_id = $1`, [
      CAROL,
    ]);
    expect(left.rows[0]!.n).toBe(0);
    const others = await db.query<{ n: number }>(
      `select count(*)::int as n from public.categories where user_id = $1`,
      [ALICE],
    );
    expect(others.rows[0]!.n).toBe(12);
  });
});

describe('sync order for a deleted goal', () => {
  it('accepts the goal tombstone, then tombstones of its contributions in any order', async () => {
    await as(db, 'authenticated', BOB, async (q) => {
      const [g] = await q<{ id: string }>(
        `insert into public.savings_goals (name, target_minor, currency) values ('Bike', 50000, 'CAD') returning id`,
      );
      const [dep] = await q<{ id: string }>(
        `insert into public.savings_contributions (goal_id, amount_minor, contributed_on) values ($1, 5000, '2026-11-01') returning id`,
        [g!.id],
      );
      await q(
        `insert into public.savings_contributions (goal_id, amount_minor, contributed_on) values ($1, -3000, '2026-11-02')`,
        [g!.id],
      );
      await q(`update public.savings_goals set deleted_at = now() where id = $1`, [g!.id]);
      await q(`update public.savings_contributions set deleted_at = now() where id = $1`, [dep!.id]);
      const left = await q(`select id from public.savings_contributions where goal_id = $1 and deleted_at is null`, [
        g!.id,
      ]);
      expect(left).toHaveLength(1);
      // Adding to a tombstoned goal is refused.
      await q(`savepoint s`);
      await expect(
        q(
          `insert into public.savings_contributions (goal_id, amount_minor, contributed_on) values ($1, 100, '2026-11-03')`,
          [g!.id],
        ),
      ).rejects.toThrow(/goal not found/);
      await q(`rollback to savepoint s`);
    });
  });
});
