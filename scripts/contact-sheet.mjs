// Builds a contact sheet PNG from screenshots: node scripts/contact-sheet.mjs <dir> <pattern> <out.png> [cols]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [dir, pattern, out, cols = '5'] = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.png') && f.includes(pattern))
  .sort();
const cells = files
  .map((f) => {
    const b64 = readFileSync(join(dir, f)).toString('base64');
    return `<figure><img src="data:image/png;base64,${b64}"/><figcaption>${f}</figcaption></figure>`;
  })
  .join('');
const html = `<html><body style="margin:0;background:#888;font:14px sans-serif">
<div style="display:grid;grid-template-columns:repeat(${cols},300px);gap:8px;padding:8px">${cells}</div>
<style>figure{margin:0}img{width:300px;display:block}figcaption{color:#fff}</style></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(cols) * 308 + 8, height: 800 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out, files.length);
