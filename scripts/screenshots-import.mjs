// Walks the bank import on web with the synthetic Canadian export and screenshots each step (light, dark, 300 px).
// Usage: node scripts/screenshots-import.mjs [baseUrl] [outDir]
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8101';
const out = process.argv[3] ?? 'docs/screenshots';
const csv = readFileSync('tests/fixtures/bank/canadian.csv', 'utf8');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems = [];

async function run(theme, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${theme}/${width}] ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`[${theme}/${width}] ${e.message}`));
  const tag = `${theme}${width === 390 ? '' : `-${width}`}`;
  const shot = async (name) => {
    await page.waitForTimeout(600);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 1) problems.push(`[${tag}] ${name}: horizontal overflow ${o}px`);
    await page.screenshot({ path: `${out}/import-${name}-${tag}.png` });
  };
  await page.goto(`${base}/import?demo=reset&theme=${theme}&today=2026-11-11`, { waitUntil: 'networkidle' });
  await page.getByTestId('import-paste-toggle').waitFor({ timeout: 60000 });
  await shot('1-source');
  await page.getByTestId('import-paste-toggle').click();
  await page.getByTestId('import-paste-input').fill(csv);
  await page.getByTestId('import-paste-continue').click();
  await page.getByTestId('import-date-col').waitFor();
  await shot('2-columns');
  await page.getByTestId('import-next').click();
  await page.getByTestId('import-summary').waitFor();
  await shot('3-review');
  await page.getByTestId('import-confirm').click();
  await page.getByTestId('import-done').waitFor();
  await shot('4-done');
  await ctx.close();
}

await run('light', 390);
await run('dark', 390);
await run('light', 300);
await browser.close();
console.log(problems.length ? problems.join('\n') : 'Import flow OK: no overflow, no console errors.');
