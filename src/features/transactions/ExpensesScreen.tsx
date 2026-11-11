import { Screen } from '../../ui/Screen';
import { EmptyState } from '../../ui/states';

/** Placeholder: built in phase 2 (see docs/PROJECT_PLAN.md). */
export function ExpensesScreen() {
  return (
    <Screen title="Expenses" back>
      <EmptyState title="Expenses" />
    </Screen>
  );
}
