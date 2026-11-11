import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useSession, type AuthError } from '../../state/session';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SegmentedControl } from '../../ui/Chip';
import { TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';

type AuthMode = 'signIn' | 'signUp';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ERROR_KEYS = {
  invalid: 'auth.errors.invalid',
  exists: 'auth.errors.exists',
  weak: 'auth.errors.weak',
  network: 'auth.errors.network',
  unavailable: 'auth.errors.unavailable',
  unknown: 'auth.errors.unknown',
} as const satisfies Record<Exclude<AuthError, 'confirm'>, string>;

export function AuthScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { cloudAvailable, signIn, signUp, startDemo } = useSession();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const tryDemo = async () => {
    setBusy(true);
    try {
      await startDemo();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  if (!cloudAvailable) {
    return (
      <Screen title={t('auth.title')} back>
        <Card style={styles.noCloud} testID="auth-no-cloud">
          <Icon name="cloudOff" size={28} color={colors.textMuted} />
          <Text variant="heading">{t('auth.noCloudTitle')}</Text>
          <Text variant="body" color="textSecondary">
            {t('auth.noCloudBody')}
          </Text>
          <Button label={t('auth.tryDemo')} onPress={() => void tryDemo()} loading={busy} icon="sparkle" />
        </Card>
        <Text variant="caption" color="textMuted" align="center">
          {t('common.conceptNote')}
        </Text>
      </Screen>
    );
  }

  const submit = async () => {
    const next: typeof errors = {};
    if (!EMAIL.test(email.trim())) next.email = t('auth.errors.emailInvalid');
    if (mode === 'signUp') {
      if (password.length < 8) next.password = t('auth.errors.passwordShort');
      if (!name.trim()) next.name = t('auth.errors.nameRequired');
    } else if (!password) {
      next.password = t('auth.errors.passwordRequired');
    }
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      // Credentials stay in component state and go only to the session; they are never logged.
      const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password, name);
      if (result.ok) {
        router.replace('/');
      } else if (result.error === 'confirm') {
        setConfirm(true);
        setMode('signIn');
        setPassword('');
      } else {
        setFormError(t(ERROR_KEYS[result.error]));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('auth.title')} back>
      <Text variant="body" color="textSecondary">
        {t('auth.subtitle')}
      </Text>
      <SegmentedControl
        testID="auth-mode"
        value={mode}
        options={[
          { value: 'signIn', label: t('auth.signIn') },
          { value: 'signUp', label: t('auth.createAccount') },
        ]}
        onChange={(m) => {
          setMode(m);
          setErrors({});
          setFormError(null);
        }}
      />

      {confirm ? (
        <Card tone="accentSoft" style={styles.confirm} testID="auth-confirm">
          <Icon name="mail" size={22} color={colors.accentText} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{t('auth.confirmTitle')}</Text>
            <Text variant="body" color="textSecondary">
              {t('auth.confirmBody')}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card style={styles.form}>
        {mode === 'signUp' ? (
          <TextField
            label={t('auth.displayName')}
            value={name}
            onChangeText={setName}
            error={errors.name}
            icon="user"
            autoComplete="name"
            textContentType="name"
            maxLength={80}
            returnKeyType="next"
          />
        ) : null}
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          icon="mail"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <TextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          help={mode === 'signUp' ? t('auth.passwordHelp') : null}
          icon="lock"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        {formError ? (
          <View style={styles.formError} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Icon name="alert" size={18} color={colors.danger} />
            <Text variant="label" color="danger" style={styles.flex}>
              {formError}
            </Text>
          </View>
        ) : null}
        <Button
          label={mode === 'signIn' ? t('auth.signIn') : t('auth.createAccount')}
          onPress={() => void submit()}
          loading={busy}
        />
      </Card>
      <Text variant="caption" color="textMuted" align="center">
        {t('common.conceptNote')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  noCloud: { gap: space.md, alignItems: 'flex-start' },
  confirm: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  form: { gap: space.lg },
  formError: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
