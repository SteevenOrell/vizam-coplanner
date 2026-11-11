import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { getPreferences } from '../../../data/repos/core';
import { renderScreen, routerMock } from '../../../test/render';
import { AuthScreen } from '../../auth/AuthScreen';
import { OnboardingScreen } from '../OnboardingScreen';

describe('onboarding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('walks through three steps and starts the demo', async () => {
    await renderScreen(<OnboardingScreen />, { seed: 'none' });
    expect(await screen.findByText('1/3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('2/3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('3/3')).toBeTruthy();
    // Cloud sync is not configured in tests: the sign-in button stays and the reason is explained.
    expect(screen.getByRole('button', { name: 'Sign in or create an account' })).toBeTruthy();
    expect(screen.getByText(/Cloud sync is not set up in this build/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Try with demo data' }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'));
  });

  it('switches the language on the first step', async () => {
    const { db } = await renderScreen(<OnboardingScreen />, { seed: 'none' });
    await fireEvent.press(await screen.findByRole('tab', { name: 'Français' }));
    await waitFor(async () => expect((await getPreferences(db)).locale).toBe('fr'));
  });
});

describe('auth', () => {
  it('explains that accounts are unavailable without a cloud configuration', async () => {
    await renderScreen(<AuthScreen />, { seed: 'none' });
    expect(await screen.findByText('Accounts are not available in this build')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start with demo data' })).toBeTruthy();
  });
});
