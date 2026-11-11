// Loads a page of the web build in headless Chromium, prints visible text, console errors and an optional
// screenshot. Usage: node scripts/web-probe.mjs <url> [screenshot.png] [width] [height] [colorScheme]
import { chromium } from 'playwright';

const [url = 'http://localhost:8101/', shot, width = '390', height = '844', scheme = 'light'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  colorScheme: scheme,
  deviceScaleFactor: 2,
});
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(2500);
const text = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 1500);
console.log('URL:', page.url());
console.log('TEXT:', text);
console.log('PROBLEMS:', problems.length ? problems.slice(0, 15).join('\n') : 'none');
if (shot) {
  await page.screenshot({ path: shot, fullPage: false });
  console.log('SHOT:', shot);
}
await browser.close();
