import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useTheme } from './theme/ThemeProvider';

/**
 * Blue-sky backdrop behind every screen: sky blue at the top fading into the app background (light), night blue
 * into deep navy (dark), with a soft sun-glow at the upper right. Fixed behind scrolling content.
 */
export function SkyBackground() {
  const { colors, scheme } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[colors.skyTop, colors.skyMid, colors.bg]}
        locations={[0, 0.38, 0.78]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.glow,
          { backgroundColor: scheme === 'dark' ? 'rgba(127,169,255,0.10)' : 'rgba(255,255,255,0.45)' },
        ]}
      />
      <View
        style={[
          styles.glowSmall,
          { backgroundColor: scheme === 'dark' ? 'rgba(127,169,255,0.08)' : 'rgba(255,255,255,0.35)' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', width: 360, height: 360, borderRadius: 180, top: -170, right: -120 },
  glowSmall: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: -60, right: -40 },
});
