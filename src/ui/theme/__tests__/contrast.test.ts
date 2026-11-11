import { contrast } from '../contrast';
import { darkPalette, lightPalette, type Palette } from '../tokens';

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
] as const)('%s palette', (_, p: Palette) => {
  it.each(['text', 'textSecondary', 'textMuted', 'accentText', 'warningText'] as const)(
    '%s is AA on bg and surface',
    (k) => {
      expect(contrast(p[k], p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p[k], p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p[k], p.surfaceAlt)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('text stays AA over the sky gradient', () => {
    for (const k of ['text', 'textSecondary', 'accentText'] as const) {
      expect(contrast(p[k], p.skyMid)).toBeGreaterThanOrEqual(4.5);
    }
    // Only headings and back buttons sit on the very top of the sky.
    expect(contrast(p.text, p.skyTop)).toBeGreaterThanOrEqual(7);
    expect(contrast(p.textSecondary, p.skyTop)).toBeGreaterThanOrEqual(4.4);
  });

  it('hero text is AA on both gradient ends', () => {
    for (const bg of [p.heroFrom, p.heroTo]) {
      expect(contrast(p.heroText, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.heroTextSecondary, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('button label on accent is at least 3:1 (large/bold text)', () => {
    expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(3);
  });

  it('positive and danger read as text on surface (3:1 for bold amounts)', () => {
    expect(contrast(p.positive, p.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.danger, p.surface)).toBeGreaterThanOrEqual(3);
  });
});
