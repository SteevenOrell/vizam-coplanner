// Splash screenshots (held on screen with ?holdSplash=1), light and dark, phone and desktop widths.
// Usage: node scripts/screenshots-splash.mjs [baseUrl] [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8101';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems = [];
for (const theme of ['light', 'dark']) {
  for (const [w, h, suffix] of [
    [390, 844, ''],
    [1440, 900, '-desktop'],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 2,
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && problems.push(`[${theme}] ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`[${theme}] ${e.message}`));
    await page.goto(`${base}/?demo=1&theme=${theme}&holdSplash=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="app-splash"]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/splash-${theme}${suffix}.png` });
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no console errors');
