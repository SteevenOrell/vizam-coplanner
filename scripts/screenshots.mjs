// Key-screen screenshots in light and dark (web build, demo data) plus a layout sweep.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
// Needs the web dev server (npx expo start --web --port 8101). Writes PNGs and prints overflow / console problems.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8101';
const out = process.argv[3] ?? 'docs/screenshots';
const TODAY = '2026-11-11';
mkdirSync(out, { recursive: true });

const screens = [
  ['onboarding', '/onboarding'],
  ['dashboard', '/'],
  ['activity', '/activity'],
  ['income', '/income'],
  ['expenses', '/expenses'],
  ['transaction-new', '/transaction/new?kind=expense'],
  ['budgets', '/budgets'],
  ['goals', '/goals'],
  ['bills', '/bills'],
  ['calendar', '/calendar'],
  ['reports', '/reports'],
  ['notifications', '/notifications'],
  ['settings', '/settings'],
  ['auth', '/auth'],
];

const sweepWidths = [240, 300, 390, 768, 1440];
const browser = await chromium.launch();
const problems = [];

async function open(page, path, theme) {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${base}${path}${sep}demo=1&theme=${theme}&today=${TODAY}`, { waitUntil: 'networkidle' });
  // Past the boot spinner: wait for real text, then let charts measure and settle.
  await page.waitForFunction(() => document.body.innerText.trim().length > 40, null, { timeout: 60000 });
  await page.waitForTimeout(900);
}

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${theme}] console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`[${theme}] pageerror: ${e.message}`));
  // First load seeds the demo database for this browser context.
  await open(page, '/?demo=reset', theme);
  for (const [name, path] of screens) {
    if (name === 'onboarding') continue;
    await open(page, path, theme);
    await page.screenshot({ path: `${out}/${name}-${theme}.png` });
  }
  await ctx.close();
}

// Onboarding needs a fresh context (no demo mode).
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/onboarding?theme=${theme}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.innerText.trim().length > 40, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/onboarding-${theme}.png` });
  await ctx.close();
}

// Layout sweep: horizontal overflow from 300 px up, and the 250 px lock.
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();
await open(page, '/?demo=reset', 'light');
for (const [name, path] of screens) {
  if (name === 'onboarding') continue;
  for (const w of sweepWidths) {
    await page.setViewportSize({ width: w, height: 900 });
    await open(page, path, 'light');
    const r = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      root: document.getElementById('root')?.getBoundingClientRect().width ?? 0,
    }));
    if (w < 250) {
      if (Math.round(r.root) !== 500) problems.push(`${name}@${w}: root ${r.root}px, expected 500 lock`);
    } else if (r.scroll > r.client + 1) {
      problems.push(`${name}@${w}: horizontal overflow ${r.scroll - r.client}px`);
    }
  }
}
await browser.close();
console.log(
  problems.length ? `PROBLEMS (${problems.length}):\n${problems.join('\n')}` : 'No overflow or console errors.',
);
