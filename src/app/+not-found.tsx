import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '../ui/Screen';
import { EmptyState } from '../ui/states';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen back>
      <EmptyState
        icon="info"
        title={t('common.states.emptyTitle')}
        action={{ label: t('common.tabs.home'), onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
