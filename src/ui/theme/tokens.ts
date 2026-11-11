/**
 * CoPlanner design tokens. Brand palette from the brief (navy #111C3A, electric blue #3778F6, soft blue #DDE8FC,
 * background #F6F8FC, text #172033, positive #16A34A, warning #F59E0B), extended into a light and a dark theme.
 * The identity mixes a calm, airy light UI (generous radius, thin display type) with a deep-navy dark UI and a
 * blue gradient "plan card" as the signature element. Text colours meet WCAG AA on their surfaces
 * (src/ui/theme/__tests__/contrast.test.ts).
 */
export type ColorScheme = 'light' | 'dark';

export interface Palette {
  bg: string;
  /** Sky gradient behind every screen, top to bottom (ends on bg). Text on the top of it stays AA. */
  skyTop: string;
  skyMid: string;
  surface: string;
  surfaceAlt: string;
  /** Raised surface on top of surface (inputs, chips). */
  surfaceRaised: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Brand blue for fills (buttons, progress, icons). */
  accent: string;
  /** Blue that reads as text on bg/surface. */
  accentText: string;
  accentSoft: string;
  onAccent: string;
  navy: string;
  positive: string;
  positiveSoft: string;
  warning: string;
  warningSoft: string;
  /** Warning colour for text (amber is too light as text on white). */
  warningText: string;
  danger: string;
  dangerSoft: string;
  /** Hero / plan card gradient (always light text on top). */
  heroFrom: string;
  heroTo: string;
  heroText: string;
  heroTextSecondary: string;
  overlay: string;
  focus: string;
  tabBar: string;
  /** Series colours for charts, in order. */
  chart: readonly string[];
}

export const lightPalette: Palette = {
  bg: '#F6F8FC',
  skyTop: '#C6DBFF',
  skyMid: '#E3EDFF',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2FA',
  surfaceRaised: '#F3F6FC',
  border: '#E1E7F2',
  text: '#172033',
  textSecondary: '#556079',
  textMuted: '#626C87',
  accent: '#3778F6',
  accentText: '#2360D8',
  accentSoft: '#DDE8FC',
  onAccent: '#FFFFFF',
  navy: '#111C3A',
  positive: '#16A34A',
  positiveSoft: '#DCF5E5',
  warning: '#F59E0B',
  warningSoft: '#FDF0D5',
  warningText: '#A15C00',
  danger: '#DC2626',
  dangerSoft: '#FCE4E4',
  heroFrom: '#111C3A',
  heroTo: '#2F5FD0',
  heroText: '#FFFFFF',
  heroTextSecondary: '#C9D6F5',
  overlay: 'rgba(17, 28, 58, 0.45)',
  focus: '#3778F6',
  tabBar: '#FFFFFF',
  chart: ['#3778F6', '#16A34A', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#64748B'],
};

export const darkPalette: Palette = {
  bg: '#0C1A46',
  skyTop: '#1A3E9C',
  skyMid: '#14306F',
  surface: '#132559',
  surfaceAlt: '#1A2E69',
  surfaceRaised: '#20367A',
  border: '#2C4185',
  text: '#EEF2FB',
  textSecondary: '#A9B4D1',
  textMuted: '#97A3C4',
  accent: '#4C86F7',
  accentText: '#8AB1FF',
  accentSoft: '#1F3A80',
  onAccent: '#FFFFFF',
  navy: '#0C1A46',
  positive: '#34C46A',
  positiveSoft: '#123A3A',
  warning: '#F7B23B',
  warningSoft: '#3A3320',
  warningText: '#F7B23B',
  danger: '#F87171',
  dangerSoft: '#3D1E3A',
  heroFrom: '#1E46B8',
  heroTo: '#2C60D6',
  heroText: '#FFFFFF',
  heroTextSecondary: '#D3E0FF',
  overlay: 'rgba(0, 0, 0, 0.6)',
  focus: '#7FA9FF',
  tabBar: '#0F1F52',
  chart: ['#4C86F7', '#34C46A', '#F7B23B', '#A78BFA', '#F472B6', '#2DD4BF', '#FB923C', '#94A3B8'],
};

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radii = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Content column on wide screens (web, tablets). */
export const CONTENT_MAX_WIDTH = 720;

export const fonts = {
  light: 'PlusJakartaSans_300Light',
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const type = {
  /** Big balances. Thin weight; decimals rendered lighter by <Money>. */
  display: { fontFamily: fonts.light, fontSize: 40, lineHeight: 48, letterSpacing: -0.8 },
  title: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  amount: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, fontVariant: ['tabular-nums'] as const },
} as const;

export type TypeVariant = keyof typeof type;
