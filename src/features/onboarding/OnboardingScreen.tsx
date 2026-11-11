import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePreferences } from '../../state/preferences';
import { useSession } from '../../state/session';
import { Button } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { SegmentedControl } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { CategoryBadge } from '../../ui/ListRow';
import { Money } from '../../ui/Money';
import { ProgressBar, ProgressRing } from '../../ui/Progress';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';

const STEPS = ['one', 'two', 'three'] as const;

/** Original mini illustration: stacked plan card, budget bar and goal ring (no bank card, no card brand). */
function Illustration({ step }: { step: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('onboarding.illustration.a11y')}
      style={styles.illustration}
    >
      <View style={[styles.backCard, { backgroundColor: colors.accentSoft }]} />
      <View style={styles.frontStack}>
        {step === 0 ? (
          <HeroCard style={styles.heroMini}>
            <Text variant="overline" color="heroTextSecondary">
              {t('onboarding.illustration.plan')}
            </Text>
            <Money amountMinor={248000} currency="CAD" variant="title" color="heroText" lightDecimals />
            <View style={styles.heroBars}>
              <ProgressBar ratio={0.62} onHero height={6} />
              <ProgressBar ratio={0.34} onHero height={6} />
            </View>
          </HeroCard>
        ) : null}
        {step === 1 ? (
          <Card style={styles.miniCard}>
            <Text variant="overline" color="textSecondary">
              {t('onboarding.illustration.budget')}
            </Text>
            <ProgressBar ratio={0.45} />
            <ProgressBar ratio={0.86} status="near" />
            <ProgressBar ratio={1} status="over" />
          </Card>
        ) : null}
        {step === 2 ? (
          <Card style={[styles.miniCard, styles.goalRow]}>
            <ProgressRing ratio={0.68} size={64} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {t('onboarding.illustration.goal')}
              </Text>
              <Money amountMinor={238000} currency="CAD" variant="caption" color="textSecondary" />
            </View>
            <CategoryBadge icon="plane" color={colors.accent} size={40} />
          </Card>
        ) : null}
        <Card style={[styles.miniCard, styles.chipsCard]}>
          <View style={styles.chipRow}>
            <CategoryBadge icon="cart" color={colors.chart[2] ?? colors.accent} size={32} />
            <CategoryBadge icon="home" color={colors.accent} size={32} />
            <CategoryBadge icon="bolt" color={colors.chart[1] ?? colors.accent} size={32} />
          </View>
        </Card>
      </View>
    </View>
  );
}

export function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefs, update } = usePreferences();
  const { mode, startDemo, cloudAvailable } = useSession();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const last = step === STEPS.length - 1;
  const key = STEPS[step] ?? 'one';

  if (mode === 'demo' || mode === 'cloud') return <Redirect href="/" />;

  const tryDemo = async () => {
    setBusy(true);
    try {
      await startDemo();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="onboarding-screen">
      <View style={styles.topRow}>
        <View
          accessible
          accessibilityLabel={t('onboarding.stepA11y', { current: step + 1, total: STEPS.length })}
          style={[styles.stepPill, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text variant="label" color="textSecondary">
            {t('onboarding.stepOf', { current: step + 1, total: STEPS.length })}
          </Text>
        </View>
        {!last ? (
          <Pressable
            onPress={() => setStep(STEPS.length - 1)}
            accessibilityRole="button"
            accessibilityLabel={t('common.actions.skip')}
            style={[styles.skip, { backgroundColor: colors.surfaceAlt }]}
          >
            <Text variant="label" color="textSecondary">
              {t('common.actions.skip')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Illustration step={step} />

      <View style={styles.copy}>
        <Text variant="display" accessibilityRole="header" style={styles.headline}>
          {t(`onboarding.steps.${key}.title`)}
        </Text>
        <Text variant="body" color="textSecondary">
          {t(`onboarding.steps.${key}.body`)}
        </Text>
      </View>

      {step === 0 ? (
        <View style={styles.language}>
          <Text variant="label" color="textSecondary">
            {t('onboarding.language')}
          </Text>
          <SegmentedControl
            testID="onboarding-language"
            value={prefs.locale}
            options={[
              { value: 'en', label: t('settings.language.en') },
              { value: 'fr', label: t('settings.language.fr') },
            ]}
            onChange={(locale) => void update({ locale })}
          />
        </View>
      ) : null}

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.dot,
              { backgroundColor: i === step ? colors.accent : colors.border },
              i === step && styles.dotOn,
            ]}
          />
        ))}
      </View>

      {last ? (
        <View style={styles.actions}>
          <Button label={t('onboarding.demoCta')} onPress={() => void tryDemo()} loading={busy} icon="sparkle" />
          <Button
            label={t('onboarding.authCta')}
            onPress={() => router.push('/auth')}
            variant="secondary"
            disabled={busy}
          />
          {!cloudAvailable ? (
            <View style={styles.noCloud}>
              <Icon name="info" size={16} color={colors.textMuted} />
              <Text variant="caption" color="textSecondary" style={styles.flex}>
                {t('onboarding.noCloud')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.actions}>
          <Button label={t('common.actions.next')} onPress={() => setStep((s) => s + 1)} icon="arrowRight" />
        </View>
      )}

      <Text variant="caption" color="textMuted" align="center">
        {t('common.conceptNote')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  stepPill: { borderRadius: radii.pill, paddingHorizontal: space.md, minHeight: 36, justifyContent: 'center' },
  skip: {
    borderRadius: radii.pill,
    paddingHorizontal: space.lg,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustration: { height: 210, alignItems: 'center', justifyContent: 'center' },
  backCard: {
    position: 'absolute',
    width: '84%',
    height: 170,
    borderRadius: radii.xl,
    transform: [{ rotate: '-4deg' }],
  },
  frontStack: { width: '88%', gap: space.sm },
  heroMini: { gap: space.xs, padding: space.lg },
  heroBars: { gap: space.xs, marginTop: space.xs },
  miniCard: { gap: space.sm, padding: space.md },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chipsCard: { alignSelf: 'flex-end', paddingVertical: space.sm },
  chipRow: { flexDirection: 'row', gap: space.sm },
  copy: { gap: space.sm },
  headline: { fontSize: 32, lineHeight: 40 },
  language: { gap: space.sm },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { width: 24 },
  actions: { gap: space.sm },
  noCloud: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
