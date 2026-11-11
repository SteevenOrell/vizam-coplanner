import { Redirect, router, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '../../state/session';
import { Icon, type IconName } from '../../ui/Icon';
import { fonts, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';

const TABS: {
  name: string;
  title: 'common.tabs.home' | 'common.tabs.activity' | 'common.tabs.budgets' | 'common.tabs.goals';
  icon: IconName;
}[] = [
  { name: 'index', title: 'common.tabs.home', icon: 'home' },
  { name: 'activity', title: 'common.tabs.activity', icon: 'activity' },
  { name: 'budgets', title: 'common.tabs.budgets', icon: 'budget' },
  { name: 'goals', title: 'common.tabs.goals', icon: 'goal' },
];

/** Raised round "+" in the middle of the tab bar: opens Add transaction (it is not a real tab). */
function AddButton() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.addWrap}>
      <Pressable
        testID="tab-add"
        onPress={() => router.push('/transaction/new')}
        accessibilityRole="button"
        accessibilityLabel={t('common.tabs.add')}
        style={({ pressed }) => [
          styles.add,
          { backgroundColor: colors.accent, borderColor: colors.tabBar, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Icon name="plus" size={28} color={colors.onAccent} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { mode } = useSession();
  const insets = useSafeAreaInsets();
  if (mode === 'new') return <Redirect href="/onboarding" />;
  const bottom = Math.max(insets.bottom, space.xs);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: 62 + bottom,
          paddingTop: 6,
          paddingBottom: bottom,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.slice(0, 2).map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarAccessibilityLabel: t(tab.title),
            tabBarButtonTestID: `tab-${tab.name}`,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} color={String(color)} size={24} />,
          }}
        />
      ))}
      <Tabs.Screen name="add" options={{ title: t('common.tabs.add'), tabBarButton: () => <AddButton /> }} />
      {TABS.slice(2).map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarAccessibilityLabel: t(tab.title),
            tabBarButtonTestID: `tab-${tab.name}`,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} color={String(color)} size={24} />,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addWrap: { flex: 1, alignItems: 'center' },
  add: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    shadowColor: '#111C3A',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
