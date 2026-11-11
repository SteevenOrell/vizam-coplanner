// Splash + sky-background screenshots (light and dark). Usage: node scripts/screenshots-sky.mjs [baseUrl] [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8101';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems = [];
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${theme}] ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`[${theme}] ${e.message}`));
  await page.goto(`${base}/?demo=reset&theme=${theme}&today=2026-11-11&holdSplash=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="app-splash"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/splash-${theme}.png` });
  for (const [name, path] of [
    ['dashboard', '/'],
    ['budgets', '/budgets'],
    ['goals', '/goals'],
    ['activity', '/activity'],
  ]) {
    await page.goto(`${base}${path}?demo=1&theme=${theme}&today=2026-11-11`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="app-splash"]') && document.body.innerText.length > 40,
      null,
      {
        timeout: 60000,
      },
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}-${theme}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no console errors');
