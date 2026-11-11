# CoPlanner brief (from Steeven, 2026-11-11)

PART 4 — PROJECT 03: COPLANNER

## 4.1 Product overview
CoPlanner is a personal finance management application focused on monthly expenses, income tracking, savings, and
budget planning. It is not intended to function as a real banking service. The product should help users understand
their spending, organize their finances, set savings targets, and plan future expenses.

## 4.2 Technology stack
- Mobile: React Native
- Framework: Expo
- Language: TypeScript
- Backend: Supabase
- Database: PostgreSQL
- Authentication: Supabase Auth
- Offline storage: SQLite
- Notifications: Expo Notifications
- Charts: a suitable, maintained React Native chart library

Use Supabase Row Level Security to protect user-specific financial information.

## 4.3 UI/UX references
Use the two banking and finance app screenshots Steeven provided. A written description is in
`docs/REFERENCES.md`; Steeven may re-attach the images.

Reference A, light financial interface. Study:
- minimal, spacious layouts
- soft gradients
- clean account summaries
- refined transaction lists
- rounded financial cards
- elegant onboarding
- simple quick actions

Reference B, blue financial dashboard. Study:
- blue gradient treatments
- premium card design
- financial metrics
- strong data hierarchy
- compact navigation
- progress indicators
- sophisticated dark surfaces

Combine these into an original CoPlanner visual identity. Do not reproduce banking card brands or imply access to real
banking accounts.

Suggested palette:

| Role | Colour |
|---|---|
| Primary navy | #111C3A |
| Electric blue | #3778F6 |
| Soft blue | #DDE8FC |
| Background | #F6F8FC |
| Text | #172033 |
| Positive | #16A34A |
| Warning | #F59E0B |

Support both light and dark themes.

## 4.4 Required screens
1. Onboarding
2. Authentication
3. Financial dashboard
4. Income overview
5. Expenses
6. Transaction details
7. Add/edit transaction
8. Monthly budgets
9. Budget category details
10. Savings goals
11. Recurring bills
12. Financial calendar
13. Reports and analytics
14. Notifications
15. Settings and currencies

## 4.5 Core functional requirements

### Income and expenses
- Add, edit, and delete transactions.
- Separate income and expenses.
- Categorize transactions.
- Add descriptions and dates.
- Filter and search transactions.
- View monthly summaries.

### Budget management
- Create monthly budgets.
- Set spending limits by category.
- Track the available budget.
- Calculate remaining balances.
- Display budget usage.
- Show over-budget warnings.
- Plan upcoming expenses.

### Savings
- Create savings goals.
- Set target amounts and dates.
- Record contributions.
- Calculate remaining targets.
- Visualize savings progress.

### Recurring expenses
- Track subscriptions.
- Set recurring bills.
- Record due dates.
- Create reminders.
- Forecast upcoming obligations.

### Analytics
- Income versus expenses.
- Category spending.
- Monthly trends.
- Savings progress.
- Cash-flow overview.
- Budget performance.

### Currency support
- Support at least CAD and XOF (FCFA).
- Store currency codes explicitly.
- Use integer minor units or another precise monetary representation, and account for currencies with different
  decimal conventions.
- Do not automatically combine amounts from different currencies without a defined exchange-rate policy.

### Reporting
- Monthly summaries.
- Category reports.
- CSV export.
- Savings reports.

## 4.6 Architecture requirements
Design PostgreSQL tables for:
- Users/profiles
- Accounts
- Transactions
- Categories
- Budgets
- BudgetAllocations
- SavingsGoals
- SavingsContributions
- RecurringBills
- Notifications
- UserPreferences

Other requirements:
- Enforce Row Level Security policies.
- Use safe database operations for financial changes.
- Do not connect real bank accounts or payment networks in the MVP.
- Use synthetic demonstration data.
