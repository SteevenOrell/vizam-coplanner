// Production-build smoke test (no dev server): first visit, onboarding, demo start, deep links, reload persistence,
// import route, 300 px layout. Usage: node scripts/prod-probe.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8110';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => r.status() >= 400 && problems.push(`http ${r.status()}: ${r.url()}`));
const ok = (cond, msg) => (cond ? console.log(`ok   ${msg}`) : problems.push(`FAIL ${msg}`));
const text = () => page.evaluate(() => document.body.innerText);
const ready = () =>
  page.waitForFunction(
    () => !document.querySelector('[data-testid="app-splash"]') && document.body.innerText.length > 40,
    null,
    { timeout: 60000 },
  );

await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await ready();
ok(page.url().endsWith('/onboarding'), 'first visit goes to onboarding');
ok((await text()).includes('Plan your money'), 'onboarding copy visible');

// Walk onboarding to the demo button.
for (let i = 0; i < 3; i++) {
  const demo = page.getByText('Try with demo data');
  if (await demo.count()) break;
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(400);
}
await page.getByText('Try with demo data').first().click();
await page.waitForFunction(() => document.body.innerText.includes('Total balance'), null, { timeout: 60000 });
ok((await text()).includes('Total balance'), 'demo data loads (SQLite works over https-like localhost)');

await page.goto(`${base}/budgets`, { waitUntil: 'networkidle' });
await ready();
ok((await text()).includes('Spent this month'), 'deep link /budgets works (rewrite to index.html)');
await page.reload({ waitUntil: 'networkidle' });
await ready();
ok((await text()).includes('Spent this month'), 'reload keeps data (persisted in the browser)');
await page.goto(`${base}/import`, { waitUntil: 'networkidle' });
await ready();
ok((await text()).includes('Import from your bank'), 'import screen opens');

await page.setViewportSize({ width: 300, height: 800 });
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await ready();
const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(o <= 1, `no horizontal overflow at 300 px (${o}px)`);
await browser.close();

const real = problems.filter((p) => !/DevTools/.test(p));
console.log(
  real.length ? `\nPROBLEMS (${real.length}):\n${real.join('\n')}` : '\nProduction build: no errors, no warnings.',
);
process.exit(real.length ? 1 : 0);
