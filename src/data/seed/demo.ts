import { addDays, addMonthKey, addMonths, monthOf, monthStart, type IsoDate } from '../../domain/dates';
import type {
  Account,
  BudgetAllocation,
  Category,
  RecurringBill,
  SavingsContribution,
  SavingsGoal,
  Transaction,
} from '../../domain/models';
import { nextDueAfter } from '../../domain/recurrence';
import type { SqlDriver } from '../db/driver';
import { setMeta, updatePreferences } from '../repos/core';
import {
  accountsSpec,
  allocationsSpec,
  billsSpec,
  budgetsSpec,
  categoriesSpec,
  contributionsSpec,
  goalsSpec,
  newId,
  nowIso,
  putRow,
  transactionsSpec,
  write,
} from '../tables';

/**
 * Synthetic demo data: a fictional person ("Alex Demo") who earns in CAD in Canada and supports family in a West
 * African CFA franc (XOF) country. Six months of history, this month's budgets, three goals and recurring bills.
 * Every value is made up. Deterministic for a given `today` (seeded PRNG), so screenshots are stable.
 */
export const DEMO_DISPLAY_NAME = 'Alex Demo';

type CategoryKey =
  | 'salary'
  | 'freelance'
  | 'otherIncome'
  | 'housing'
  | 'groceries'
  | 'transport'
  | 'dining'
  | 'utilities'
  | 'health'
  | 'subscriptions'
  | 'family'
  | 'other';

export interface DemoNames {
  categories: Record<CategoryKey, string>;
  accounts: { chequing: string; savings: string; cash: string };
  goals: { emergency: string; trip: string; family: string };
  bills: {
    rent: string;
    phone: string;
    internet: string;
    streaming: string;
    gym: string;
    insurance: string;
    family: string;
  };
  descriptions: Record<
    'salary' | 'freelance' | 'groceries' | 'transit' | 'dining' | 'pharmacy' | 'market' | 'transfer',
    string
  >;
}

export const DEMO_NAMES_EN: DemoNames = {
  categories: {
    salary: 'Salary',
    freelance: 'Freelance',
    otherIncome: 'Other income',
    housing: 'Housing',
    groceries: 'Groceries',
    transport: 'Transport',
    dining: 'Dining',
    utilities: 'Utilities',
    health: 'Health',
    subscriptions: 'Subscriptions',
    family: 'Family support',
    other: 'Other',
  },
  accounts: { chequing: 'Everyday account', savings: 'Savings', cash: 'FCFA wallet' },
  goals: { emergency: 'Emergency fund', trip: 'Trip home', family: 'Family project' },
  bills: {
    rent: 'Rent',
    phone: 'Phone plan',
    internet: 'Home internet',
    streaming: 'Streaming',
    gym: 'Gym',
    insurance: 'Renters insurance',
    family: 'Family support',
  },
  descriptions: {
    salary: 'Pay day',
    freelance: 'Design project',
    groceries: 'Grocery run',
    transit: 'Transit pass top-up',
    dining: 'Lunch out',
    pharmacy: 'Pharmacy',
    market: 'Market',
    transfer: 'Sent home',
  },
};

export const DEMO_NAMES_FR: DemoNames = {
  categories: {
    salary: 'Salaire',
    freelance: 'Travail autonome',
    otherIncome: 'Autres revenus',
    housing: 'Logement',
    groceries: 'Épicerie',
    transport: 'Transport',
    dining: 'Restaurants',
    utilities: 'Services',
    health: 'Santé',
    subscriptions: 'Abonnements',
    family: 'Soutien familial',
    other: 'Autre',
  },
  accounts: { chequing: 'Compte courant', savings: 'Épargne', cash: 'Portefeuille FCFA' },
  goals: { emergency: "Fonds d'urgence", trip: 'Voyage au pays', family: 'Projet familial' },
  bills: {
    rent: 'Loyer',
    phone: 'Forfait mobile',
    internet: 'Internet maison',
    streaming: 'Streaming',
    gym: 'Gym',
    insurance: 'Assurance locataire',
    family: 'Soutien familial',
  },
  descriptions: {
    salary: 'Paie',
    freelance: 'Projet de design',
    groceries: 'Épicerie',
    transit: 'Recharge transport',
    dining: 'Dîner au resto',
    pharmacy: 'Pharmacie',
    market: 'Marché',
    transfer: 'Envoi au pays',
  },
};

const CATEGORY_STYLE: Record<CategoryKey, { kind: 'income' | 'expense'; icon: string; color: string }> = {
  salary: { kind: 'income', icon: 'briefcase', color: '#16A34A' },
  freelance: { kind: 'income', icon: 'laptop', color: '#0EA5E9' },
  otherIncome: { kind: 'income', icon: 'plus-circle', color: '#64748B' },
  housing: { kind: 'expense', icon: 'home', color: '#3778F6' },
  groceries: { kind: 'expense', icon: 'cart', color: '#F59E0B' },
  transport: { kind: 'expense', icon: 'bus', color: '#8B5CF6' },
  dining: { kind: 'expense', icon: 'utensils', color: '#EF4444' },
  utilities: { kind: 'expense', icon: 'bolt', color: '#14B8A6' },
  health: { kind: 'expense', icon: 'heart', color: '#EC4899' },
  subscriptions: { kind: 'expense', icon: 'repeat', color: '#6366F1' },
  family: { kind: 'expense', icon: 'users', color: '#F97316' },
  other: { kind: 'expense', icon: 'tag', color: '#64748B' },
};

/** Mulberry32: small seeded PRNG (demo data only). */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Starter categories for a new local (non-demo) user; same set as the server's handle_new_user. */
export async function seedStarterCategories(db: SqlDriver, names: DemoNames = DEMO_NAMES_EN): Promise<void> {
  await write(db, async () => {
    const now = nowIso();
    for (const key of Object.keys(CATEGORY_STYLE) as CategoryKey[]) {
      await putRow(db, categoriesSpec, {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        name: names.categories[key],
        ...CATEGORY_STYLE[key],
      });
    }
  });
}

export async function seedDemoData(db: SqlDriver, today: IsoDate, names: DemoNames = DEMO_NAMES_EN): Promise<void> {
  const rand = prng(20261111);
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const now = nowIso();
  const stamp = { createdAt: now, updatedAt: now };

  await write(db, async () => {
    const cat = {} as Record<CategoryKey, Category>;
    for (const key of Object.keys(CATEGORY_STYLE) as CategoryKey[]) {
      cat[key] = { id: newId(), ...stamp, name: names.categories[key], ...CATEGORY_STYLE[key] };
      await putRow(db, categoriesSpec, cat[key]);
    }

    const acc = (name: string, kind: Account['kind'], currency: Account['currency'], opening: number): Account => ({
      id: newId(),
      ...stamp,
      name,
      kind,
      currency,
      openingBalanceMinor: opening,
      archived: false,
    });
    const chequing = acc(names.accounts.chequing, 'checking', 'CAD', 182_540);
    const savings = acc(names.accounts.savings, 'savings', 'CAD', 640_000);
    const cash = acc(names.accounts.cash, 'cash', 'XOF', 85_000);
    for (const a of [chequing, savings, cash]) await putRow(db, accountsSpec, a);

    const txs: Transaction[] = [];
    const add = (
      p: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'note' | 'recurringBillId'> & {
        note?: string;
        recurringBillId?: string | null;
      },
    ) => {
      if (p.occurredOn > today) return;
      txs.push({ id: newId(), ...stamp, note: '', recurringBillId: null, ...p });
    };

    const thisMonth = monthOf(today);
    for (let back = 5; back >= 0; back--) {
      const month = addMonthKey(thisMonth, -back);
      const start = monthStart(month);
      const day = (d: number) => addDays(start, d - 1);
      const cad = (
        categoryId: string,
        kind: 'income' | 'expense',
        amountMinor: number,
        occurredOn: IsoDate,
        description: string,
      ) => add({ accountId: chequing.id, categoryId, kind, amountMinor, currency: 'CAD', occurredOn, description });

      cad(cat.salary.id, 'income', 241_500, day(1), names.descriptions.salary);
      cad(cat.salary.id, 'income', 241_500, day(15), names.descriptions.salary);
      if (back % 2 === 1)
        cad(cat.freelance.id, 'income', between(30_000, 85_000), day(between(8, 22)), names.descriptions.freelance);
      cad(cat.housing.id, 'expense', 152_000, day(1), names.bills.rent);
      cad(cat.utilities.id, 'expense', 6_500, day(5), names.bills.phone);
      cad(cat.utilities.id, 'expense', 7_999, day(12), names.bills.internet);
      cad(cat.subscriptions.id, 'expense', 1_699, day(18), names.bills.streaming);
      cad(cat.health.id, 'expense', 4_200, day(3), names.bills.gym);
      cad(cat.transport.id, 'expense', 15_600, day(2), names.descriptions.transit);
      for (const d of [4, 11, 18, 25]) {
        cad(cat.groceries.id, 'expense', between(7_500, 14_500), day(d), names.descriptions.groceries);
      }
      for (let i = 0; i < 4; i++) {
        cad(cat.dining.id, 'expense', between(1_400, 5_800), day(between(2, 27)), names.descriptions.dining);
      }
      if (rand() > 0.5)
        cad(cat.health.id, 'expense', between(1_200, 4_500), day(between(6, 24)), names.descriptions.pharmacy);
      // Family support in XOF from the FCFA wallet, plus a top-up to that wallet recorded as income.
      add({
        accountId: cash.id,
        categoryId: cat.otherIncome.id,
        kind: 'income',
        amountMinor: 150_000,
        currency: 'XOF',
        occurredOn: day(9),
        description: names.descriptions.transfer,
      });
      add({
        accountId: cash.id,
        categoryId: cat.family.id,
        kind: 'expense',
        amountMinor: 100_000,
        currency: 'XOF',
        occurredOn: day(10),
        description: names.bills.family,
      });
      add({
        accountId: cash.id,
        categoryId: cat.groceries.id,
        kind: 'expense',
        amountMinor: between(8, 22) * 1_000,
        currency: 'XOF',
        occurredOn: day(between(11, 26)),
        description: names.descriptions.market,
      });
    }
    // A note on one recent transaction (shown on the details screen).
    const recentDining = txs.filter((t) => t.categoryId === cat.dining.id).at(-1);
    if (recentDining)
      recentDining.note =
        names === DEMO_NAMES_FR ? 'Dîner d’équipe, partagé à trois.' : 'Team lunch, split three ways.';
    for (const t of txs) await putRow(db, transactionsSpec, t);

    // This month's budgets (CAD + XOF).
    const budgetCad = { id: newId(), ...stamp, month: thisMonth, currency: 'CAD' as const, name: '' };
    const budgetXof = { id: newId(), ...stamp, month: thisMonth, currency: 'XOF' as const, name: '' };
    await putRow(db, budgetsSpec, budgetCad);
    await putRow(db, budgetsSpec, budgetXof);
    const alloc = (budgetId: string, categoryId: string, limitMinor: number): BudgetAllocation => ({
      id: newId(),
      ...stamp,
      budgetId,
      categoryId,
      limitMinor,
    });
    for (const a of [
      alloc(budgetCad.id, cat.housing.id, 152_000),
      alloc(budgetCad.id, cat.groceries.id, 45_000),
      alloc(budgetCad.id, cat.dining.id, 12_000),
      alloc(budgetCad.id, cat.transport.id, 16_000),
      alloc(budgetCad.id, cat.utilities.id, 15_000),
      alloc(budgetCad.id, cat.subscriptions.id, 2_500),
      alloc(budgetCad.id, cat.health.id, 8_000),
      alloc(budgetXof.id, cat.family.id, 100_000),
      alloc(budgetXof.id, cat.groceries.id, 25_000),
    ]) {
      await putRow(db, allocationsSpec, a);
    }

    // Goals with contributions.
    const goal = (
      name: string,
      targetMinor: number,
      currency: 'CAD' | 'XOF',
      targetDate: IsoDate | null,
      icon: string,
      color: string,
    ): SavingsGoal => ({
      id: newId(),
      ...stamp,
      name,
      targetMinor,
      currency,
      targetDate,
      icon,
      color,
      archived: false,
    });
    const emergency = goal(names.goals.emergency, 1_200_000, 'CAD', addMonths(today, 10), 'shield', '#16A34A');
    const trip = goal(names.goals.trip, 350_000, 'CAD', addMonths(today, 7), 'plane', '#3778F6');
    const family = goal(names.goals.family, 2_000_000, 'XOF', addMonths(today, 14), 'home', '#F59E0B');
    for (const g of [emergency, trip, family]) await putRow(db, goalsSpec, g);
    const contrib = (goalId: string, amountMinor: number, contributedOn: IsoDate): SavingsContribution => ({
      id: newId(),
      ...stamp,
      goalId,
      amountMinor,
      contributedOn,
      note: '',
    });
    for (let back = 5; back >= 0; back--) {
      const d = addDays(monthStart(addMonthKey(thisMonth, -back)), 1);
      if (d > today) continue;
      await putRow(db, contributionsSpec, contrib(emergency.id, 80_000, d));
      await putRow(db, contributionsSpec, contrib(trip.id, 25_000, d));
      await putRow(db, contributionsSpec, contrib(family.id, 125_000, addDays(d, 9) > today ? d : addDays(d, 9)));
    }
    await putRow(db, contributionsSpec, contrib(trip.id, -15_000, addDays(today, -20)));

    // Recurring bills: next due dates follow from the paid history above.
    const bill = (
      p: Pick<RecurringBill, 'name' | 'amountMinor' | 'currency' | 'accountId' | 'categoryId' | 'frequency'> &
        Partial<RecurringBill> & { day: number },
    ): RecurringBill => {
      const anchorDate = p.anchorDate ?? addDays(monthStart(addMonthKey(thisMonth, -5)), p.day - 1);
      const schedule = { frequency: p.frequency, interval: p.interval ?? 1, anchorDate, endOn: null };
      let nextDueOn = anchorDate;
      while (nextDueOn < today) nextDueOn = nextDueAfter(schedule, nextDueOn)!;
      return {
        id: newId(),
        ...stamp,
        interval: 1,
        endOn: null,
        remindDaysBefore: 2,
        isSubscription: false,
        active: true,
        anchorDate,
        nextDueOn,
        ...p,
      };
    };
    const bills = [
      bill({
        name: names.bills.rent,
        amountMinor: 152_000,
        currency: 'CAD',
        accountId: chequing.id,
        categoryId: cat.housing.id,
        frequency: 'monthly',
        day: 1,
        remindDaysBefore: 3,
      }),
      bill({
        name: names.bills.phone,
        amountMinor: 6_500,
        currency: 'CAD',
        accountId: chequing.id,
        categoryId: cat.utilities.id,
        frequency: 'monthly',
        day: 5,
      }),
      bill({
        name: names.bills.internet,
        amountMinor: 7_999,
        currency: 'CAD',
        accountId: chequing.id,
        categoryId: cat.utilities.id,
        frequency: 'monthly',
        day: 12,
      }),
      bill({
        name: names.bills.streaming,
        amountMinor: 1_699,
        currency: 'CAD',
        accountId: chequing.id,
        categoryId: cat.subscriptions.id,
        frequency: 'monthly',
        day: 18,
        isSubscription: true,
      }),
      bill({
        name: names.bills.gym,
        amountMinor: 4_200,
        currency: 'CAD',
        accountId: chequing.id,
        categoryId: cat.health.id,
        frequency: 'monthly',
        day: 3,
        isSubscription: true,
      }),
      bill({
        name: names.bills.insurance,
        amountMinor: 26_400,
        currency: 'CAD',
        accountId: chequing.id,
        categoryId: cat.utilities.id,
        frequency: 'yearly',
        day: 1,
        anchorDate: addDays(monthStart(addMonthKey(thisMonth, 1)), 19),
        remindDaysBefore: 7,
      }),
      bill({
        name: names.bills.family,
        amountMinor: 100_000,
        currency: 'XOF',
        accountId: cash.id,
        categoryId: cat.family.id,
        frequency: 'monthly',
        day: 10,
      }),
    ];
    for (const b of bills) await putRow(db, billsSpec, b);
  });

  await updatePreferences(db, { displayName: DEMO_DISPLAY_NAME, primaryCurrency: 'CAD' });
  await setMeta(db, 'demo', '1');
  // Demo rows are never pushed to a server.
  await db.run('DELETE FROM outbox');
}
