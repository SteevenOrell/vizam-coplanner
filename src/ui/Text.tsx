import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { type as typeScale, type Palette, type TypeVariant } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

export type TextColor = keyof Pick<
  Palette,
  | 'text'
  | 'textSecondary'
  | 'textMuted'
  | 'accentText'
  | 'positive'
  | 'danger'
  | 'warningText'
  | 'onAccent'
  | 'heroText'
  | 'heroTextSecondary'
>;

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
}

/** Every piece of text goes through this so type scale, colour tokens and font scaling stay consistent. */
export function Text({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[typeScale[variant] as TextStyle, { color: colors[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}
