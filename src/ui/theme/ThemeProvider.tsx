import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { ThemePreference } from '../../domain/models';
import { usePreferences } from '../../state/preferences';
import { darkPalette, lightPalette, type ColorScheme, type Palette } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
}

export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function buildTheme(scheme: ColorScheme): Theme {
  return { scheme, colors: scheme === 'dark' ? darkPalette : lightPalette };
}

const ThemeContext = createContext<Theme>(buildTheme('light'));

/** Theme from the user's preference (system / light / dark). Dev web builds accept `?theme=dark|light`. */
export function ThemeProvider({ children, scheme: forced }: { children: ReactNode; scheme?: ColorScheme }) {
  const system = useColorScheme();
  const { prefs } = usePreferences();
  const override = devThemeOverride();
  const scheme = forced ?? override ?? resolveScheme(prefs.theme, system);
  const value = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function devThemeOverride(): ColorScheme | null {
  if (!__DEV__ || typeof window === 'undefined' || typeof window.location?.search !== 'string') return null;
  const v = new URLSearchParams(window.location.search).get('theme');
  return v === 'dark' || v === 'light' ? v : null;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
