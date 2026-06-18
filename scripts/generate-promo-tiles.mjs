/*
  Generate Chrome Web Store promo tiles (brand-styled, no app data needed):
    - promo-small-440x280.png   (required to be featured)
    - promo-marquee-1400x560.png (optional marquee)
  Run: node scripts/generate-promo-tiles.mjs
*/

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "docs", "chrome-store");

const SWATCHES = [
  "linear-gradient(135deg, #b4530933, #1c191712)",
  "linear-gradient(135deg, #4c1d9533, #1c191712)",
  "linear-gradient(135deg, #9f123733, #1c191712)",
  "linear-gradient(135deg, #134e4a33, #1c191712)",
  "linear-gradient(135deg, #57534e33, #1c191712)",
];

const baseStyle = `
  * { box-sizing: border-box; margin: 0; }
  body {
    color: #1c1917;
    background:
      radial-gradient(circle at top left, rgba(180,83,9,0.16), transparent 60%),
      linear-gradient(135deg, #faf8f5 0%, #f5f0e8 100%);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    overflow: hidden;
  }
  .wordmark { font-family: ui-serif, Georgia, "Times New Roman", serif; font-weight: 600; letter-spacing: 0.03em; line-height: 1; }
  .tagline { color: #57534e; }
  .swatch { border-radius: 10px; border: 1px solid rgba(28,25,23,0.12); box-shadow: 0 8px 24px rgba(87,83,78,0.12); }
`;

function smallTile() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyle}
    body { width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 28px; }
    .wordmark { font-size: 62px; }
    .tagline { font-size: 17px; }
    .shelf { display: flex; align-items: flex-end; gap: 9px; }
    .swatch { width: 34px; }
  </style></head><body>
    <div class="wordmark">thèque</div>
    <div class="tagline">your private taste library</div>
    <div class="shelf">
      ${SWATCHES.map((bg, i) => `<div class="swatch" style="height:${i % 2 ? 46 : 60}px;background-image:${bg}"></div>`).join("")}
    </div>
  </body></html>`;
}

function marqueeTile() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyle}
    body { width: 1400px; height: 560px; display: grid; grid-template-columns: 620px 1fr; align-items: center; gap: 48px; padding: 0 96px; }
    .wordmark { font-size: 132px; }
    .tagline { font-size: 30px; margin-top: 22px; max-width: 520px; line-height: 1.4; }
    .shelf { display: flex; align-items: flex-end; justify-content: center; gap: 20px; }
    .swatch { width: 116px; }
  </style></head><body>
    <div>
      <div class="wordmark">thèque</div>
      <div class="tagline">Save books, films, and places. Each link becomes a card on a shelf — private, no feed, no ads.</div>
    </div>
    <div class="shelf">
      ${SWATCHES.map((bg, i) => `<div class="swatch" style="height:${[180, 210, 150, 200, 170][i]}px;background-image:${bg}"></div>`).join("")}
    </div>
  </body></html>`;
}

async function capture(page, file, size, html) {
  await page.setViewportSize(size);
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outDir, file), fullPage: false });
  console.log(`- ${file}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await capture(page, "promo-small-440x280.png", { width: 440, height: 280 }, smallTile());
    await capture(page, "promo-marquee-1400x560.png", { width: 1400, height: 560 }, marqueeTile());
  } finally {
    await browser.close();
  }
  console.log(`\nDone. Promo tiles in ${path.relative(rootDir, outDir)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
