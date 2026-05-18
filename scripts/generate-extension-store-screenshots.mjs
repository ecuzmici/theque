import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "docs", "chrome-store");
const viewport = { width: 1280, height: 800 };

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pageShell({ title, subtitle, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        --paper: #faf8f5;
        --card: #fffefb;
        --ink: #1c1917;
        --muted: #78716c;
        --line: rgba(28, 25, 23, 0.12);
        --amber: #b45309;
        --amber-dark: #92400e;
        --stone: #57534e;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        width: 1280px;
        height: 800px;
        overflow: hidden;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(180, 83, 9, 0.14), transparent 32rem),
          linear-gradient(135deg, #faf8f5 0%, #f5f0e8 100%);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .stage {
        display: grid;
        grid-template-columns: 430px 1fr;
        gap: 52px;
        align-items: center;
        width: 100%;
        height: 100%;
        padding: 72px;
      }

      .copy {
        max-width: 420px;
      }

      .eyebrow {
        margin: 0 0 14px;
        color: var(--amber-dark);
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-family: ui-serif, Georgia, "Times New Roman", serif;
        font-size: 64px;
        line-height: 0.96;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .subtitle {
        margin: 22px 0 0;
        color: var(--muted);
        font-size: 22px;
        line-height: 1.45;
      }

      .browser {
        overflow: hidden;
        border: 1px solid rgba(28, 25, 23, 0.16);
        border-radius: 28px;
        background: var(--card);
        box-shadow: 0 30px 90px rgba(87, 83, 78, 0.22);
      }

      .browser-top {
        display: flex;
        align-items: center;
        gap: 14px;
        height: 56px;
        padding: 0 18px;
        border-bottom: 1px solid var(--line);
        background: rgba(255, 254, 251, 0.86);
      }

      .traffic {
        display: flex;
        gap: 8px;
      }

      .dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: #d6d3d1;
      }

      .address {
        flex: 1;
        min-width: 0;
        padding: 9px 14px;
        border-radius: 999px;
        color: var(--muted);
        background: #f5f0e8;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .toolbar-icon {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--paper);
      }

      .toolbar-icon img {
        width: 24px;
        height: 24px;
      }

      .browser-body {
        position: relative;
        min-height: 528px;
        padding: 34px;
      }

      ${body.css}
    </style>
  </head>
  <body>
    <main class="stage">
      <section class="copy">
        <p class="eyebrow">thèque capture</p>
        <h1>${title}</h1>
        <p class="subtitle">${subtitle}</p>
      </section>
      ${body.html}
    </main>
  </body>
</html>`;
}

function popupScene(iconUri) {
  return pageShell({
    title: "Save the page before you forget it.",
    subtitle: "Capture the current tab with an optional note and shelf hint, then find it later in your personal thèque library.",
    body: {
      css: `
      .article {
        max-width: 220px;
      }

      .article-kicker {
        margin: 0 0 12px;
        color: var(--amber-dark);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .article h2 {
        margin: 0;
        font-family: ui-serif, Georgia, "Times New Roman", serif;
        font-size: 31px;
        line-height: 1.02;
      }

      .article p {
        margin: 18px 0 0;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.6;
      }

      .popup {
        position: absolute;
        top: 24px;
        right: 28px;
        width: 340px;
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid rgba(28, 25, 23, 0.14);
        border-radius: 18px;
        background: var(--paper);
        box-shadow: 0 22px 60px rgba(28, 25, 23, 0.2);
      }

      .popup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .popup-brand {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-family: ui-serif, Georgia, "Times New Roman", serif;
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: lowercase;
      }

      .popup-brand img {
        width: 24px;
        height: 24px;
      }

      .link-btn {
        border: 1px solid rgba(28, 25, 23, 0.09);
        border-radius: 999px;
        background: var(--card);
        color: var(--amber-dark);
        font-size: 12px;
        font-weight: 700;
        padding: 7px 10px;
      }

      .status {
        margin: 0;
        color: #166534;
        font-size: 12px;
        line-height: 1.35;
      }

      .label {
        display: block;
        margin: 6px 0 4px;
        color: #44403c;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .optional {
        color: var(--muted);
        font-weight: 400;
        letter-spacing: normal;
        text-transform: none;
      }

      .input {
        width: 100%;
        border: 1px solid rgba(28, 25, 23, 0.15);
        border-radius: 8px;
        background: var(--card);
        color: var(--ink);
        font: inherit;
        padding: 9px 10px;
      }

      .textarea {
        min-height: 86px;
        resize: none;
      }

      .save {
        width: 100%;
        border: none;
        border-radius: 10px;
        background: var(--amber);
        color: var(--card);
        font: inherit;
        font-weight: 700;
        padding: 11px 12px;
      }`,
      html: `
      <section class="browser" aria-label="Browser screenshot mockup">
        <div class="browser-top">
          <div class="traffic" aria-hidden="true">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <div class="address">https://example.com/design-notes</div>
          <div class="toolbar-icon"><img src="${iconUri}" alt="" /></div>
        </div>
        <div class="browser-body">
          <article class="article">
            <p class="article-kicker">Design Notes</p>
            <h2>A beautiful place you want to remember</h2>
            <p>
              Keep track of articles, restaurants, books, products, recipes, and travel ideas without losing the context that made them interesting.
            </p>
          </article>

          <aside class="popup" aria-label="thèque extension popup">
            <header class="popup-header">
              <h3 class="popup-brand"><img src="${iconUri}" alt="" /> thèque</h3>
              <button class="link-btn" type="button">Open library</button>
            </header>
            <p class="status">Connected as you@example.com.</p>
            <label class="label">Shelf hint <span class="optional">(optional)</span></label>
            <select class="input">
              <option>Auto detect</option>
              <option selected>Read</option>
            </select>
            <label class="label">Note <span class="optional">(optional)</span></label>
            <textarea class="input textarea">Good reference for the reading list.</textarea>
            <button class="save" type="button">Save to thèque</button>
          </aside>
        </div>
      </section>`,
    },
  });
}

function libraryScene(iconUri) {
  return pageShell({
    title: "Everything lands in your library.",
    subtitle: "Saved pages become organized cards across your shelves, ready to revisit when you need them.",
    body: {
      css: `
      .library-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 28px;
      }

      .library-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: ui-serif, Georgia, "Times New Roman", serif;
        font-size: 24px;
        font-weight: 600;
        letter-spacing: 0.04em;
      }

      .library-brand img {
        width: 32px;
        height: 32px;
      }

      .tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 24px;
      }

      .tab {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 8px 13px;
        color: var(--muted);
        background: var(--card);
        font-size: 13px;
        font-weight: 700;
      }

      .tab.active {
        color: var(--card);
        background: var(--ink);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
      }

      .item-card {
        min-height: 172px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--card);
        padding: 18px;
        box-shadow: 0 10px 30px rgba(87, 83, 78, 0.08);
      }

      .item-type {
        color: var(--amber-dark);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .item-title {
        margin: 14px 0 8px;
        font-family: ui-serif, Georgia, "Times New Roman", serif;
        font-size: 23px;
        line-height: 1.1;
      }

      .item-note {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.45;
      }

      .item-meta {
        margin-top: 22px;
        color: var(--muted);
        font-size: 12px;
      }`,
      html: `
      <section class="browser" aria-label="thèque library screenshot mockup">
        <div class="browser-top">
          <div class="traffic" aria-hidden="true">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <div class="address">https://theque.app/library</div>
          <div class="toolbar-icon"><img src="${iconUri}" alt="" /></div>
        </div>
        <div class="browser-body">
          <header class="library-header">
            <div class="library-brand"><img src="${iconUri}" alt="" /> thèque</div>
            <div class="tab active">All shelves</div>
          </header>
          <nav class="tabs" aria-label="Shelves">
            <span class="tab active">All</span>
            <span class="tab">Read</span>
            <span class="tab">Watch</span>
            <span class="tab">Shop</span>
            <span class="tab">Travel</span>
          </nav>
          <section class="grid">
            <article class="item-card">
              <div>
                <div class="item-type">Read</div>
                <h2 class="item-title">Design notes worth saving</h2>
                <p class="item-note">Good reference for the reading list.</p>
              </div>
              <div class="item-meta">Saved from the extension</div>
            </article>
            <article class="item-card">
              <div>
                <div class="item-type">Watch</div>
                <h2 class="item-title">A film for later</h2>
                <p class="item-note">Remember the director and soundtrack.</p>
              </div>
              <div class="item-meta">Auto-enriched</div>
            </article>
            <article class="item-card">
              <div>
                <div class="item-type">Shop</div>
                <h2 class="item-title">A beautiful object</h2>
                <p class="item-note">Potential gift idea.</p>
              </div>
              <div class="item-meta">Shelf hint: Shop</div>
            </article>
            <article class="item-card">
              <div>
                <div class="item-type">Eat</div>
                <h2 class="item-title">Tiny dinner spot</h2>
                <p class="item-note">For the next weekend list.</p>
              </div>
              <div class="item-meta">Captured today</div>
            </article>
            <article class="item-card">
              <div>
                <div class="item-type">Travel</div>
                <h2 class="item-title">Quiet hotel by the sea</h2>
                <p class="item-note">Save for spring planning.</p>
              </div>
              <div class="item-meta">In your library</div>
            </article>
            <article class="item-card">
              <div>
                <div class="item-type">Cook</div>
                <h2 class="item-title">Weeknight recipe</h2>
                <p class="item-note">Simple enough to make again.</p>
              </div>
              <div class="item-meta">Recipe shelf</div>
            </article>
          </section>
        </div>
      </section>`,
    },
  });
}

async function capture(page, filename, html) {
  await page.setViewportSize(viewport);
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(outDir, filename),
    fullPage: false,
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const iconSvg = await readFile(path.join(rootDir, "src", "app", "icon.svg"), "utf8");
  const iconUri = svgDataUri(iconSvg);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport });
    await capture(page, "extension-popup-1280x800.png", popupScene(iconUri));
    await capture(page, "library-result-1280x800.png", libraryScene(iconUri));
  } finally {
    await browser.close();
  }

  console.log(`Generated Chrome Web Store screenshots in ${path.relative(rootDir, outDir)}:`);
  console.log("- extension-popup-1280x800.png");
  console.log("- library-result-1280x800.png");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
