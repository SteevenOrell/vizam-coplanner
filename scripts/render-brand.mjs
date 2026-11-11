// Renders CoPlanner's brand PNGs from the original SVG mark (no third-party marks).
// Mark: an open "C" ring (the plan cycle) around three rising bars (a month that ends better than it started).
// Usage: node scripts/render-brand.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const mark = (stroke) => `
  <path d="M352 168a128 128 0 1 0 0 176" fill="none" stroke="${stroke}" stroke-width="44" stroke-linecap="round"/>
  <rect x="214" y="262" width="30" height="58" rx="15" fill="${stroke}"/>
  <rect x="262" y="226" width="30" height="94" rx="15" fill="${stroke}"/>
  <rect x="310" y="190" width="30" height="130" rx="15" fill="${stroke}" opacity="0.9"/>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#111C3A"/><stop offset="1" stop-color="#3778F6"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <circle cx="420" cy="80" r="150" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="2"/>
  ${mark('#FFFFFF')}
</svg>`;

// Adaptive icon foreground: mark only, inside the 66% safe zone, transparent background.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <g transform="translate(256 256) scale(0.62) translate(-256 -256)">${mark('#FFFFFF')}</g>
</svg>`;

const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${mark('#FFFFFF')}</svg>`;

function render(svg, file, width) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  writeFileSync(file, png);
  console.log(file, png.length, 'bytes');
}

mkdirSync('assets', { recursive: true });
render(icon, 'assets/icon.png', 1024);
render(foreground, 'assets/android-icon-foreground.png', 1024);
render(splash, 'assets/splash-icon.png', 512);
render(icon, 'assets/favicon.png', 64);
writeFileSync('assets/brand-mark.svg', icon);
