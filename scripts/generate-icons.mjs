// Rendert die SVG-Icons in PNG-Dateien (für Manifest, Apple-Touch-Icon und Favicon).
// Benötigt Playwright/Chromium: `npx playwright` oder ein vorhandenes Chromium (PLAYWRIGHT_BROWSERS_PATH).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('playwright');

const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'favicon-32.png', 32],
  ['maskable.svg', 'maskable-512.png', 512],
  ['maskable.svg', 'apple-touch-icon.png', 180],
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = await readFile(path.join(root, 'public/icons', src), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
  );
  await page.screenshot({ path: path.join(root, 'public/icons', out), omitBackground: true });
  console.log('✓', out);
}
await browser.close();
