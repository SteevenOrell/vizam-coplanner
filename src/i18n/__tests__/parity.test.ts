import { resources } from '..';

function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('i18n', () => {
  it('French has exactly the English keys', () => {
    expect(keys(resources.fr.translation).sort()).toEqual(keys(resources.en.translation).sort());
  });

  it('no empty strings', () => {
    for (const lang of [resources.en.translation, resources.fr.translation]) {
      const flat = keys(lang);
      expect(flat.length).toBeGreaterThan(0);
      const get = (path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lang);
      for (const k of flat) expect(String(get(k)).trim()).not.toBe('');
    }
  });

  it('interpolation placeholders match between languages', () => {
    const get = (lang: object, path: string) =>
      String(path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lang));
    const vars = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((v) => v.replace(/\s/g, '')).sort();
    for (const k of keys(resources.en.translation)) {
      expect([k, vars(get(resources.fr.translation, k))]).toEqual([k, vars(get(resources.en.translation, k))]);
    }
  });
});
