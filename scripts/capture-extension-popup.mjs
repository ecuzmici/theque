/*
  Capture a store screenshot of the extension popup in its connected state.
  Serves the built extension/ over HTTP (module scripts need a JS MIME type),
  stubs the chrome.* APIs to simulate a connected account viewing a real tab,
  then renders the populated popup centered on a 1280x800 brand canvas.

  Requires the extension to be built first (npm run build:extension).
  Run: node scripts/capture-extension-popup.mjs
*/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const extDir = path.join(rootDir, "extension");
const outDir = path.join(rootDir, "docs", "chrome-store");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "");
      const file = path.join(extDir, rel || "popup.html");
      if (!file.startsWith(extDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const chromeStub = () => {
  const store = {
    theque_capture_token: "bmly_demoTokenForStoreScreenshot",
    theque_connected_email: "hello@theque.app",
    theque_api_base_url: "https://theque.app",
  };
  // @ts-expect-error injected test double
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (k in store) out[k] = store[k];
          return out;
        },
        set: async () => {},
      },
    },
    tabs: {
      query: async () => [
        {
          id: 1,
          url: "https://www.goodreads.com/book/show/77566.Hyperion",
          title: "Hyperion (Hyperion Cantos, #1) by Dan Simmons",
        },
      ],
      create: async () => {},
    },
    runtime: { id: "demo-extension-id" },
    scripting: { executeScript: async () => [{ result: null }] },
  };
};

async function main() {
  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.addInitScript(chromeStub);

  try {
    await page.goto(`${base}/popup.html`, { waitUntil: "networkidle" });
    await page.fill("#ks-note", "Loved the Shrike — read before the sequel.").catch(() => {});
    await page.selectOption("#ks-category", "books").catch(() => {});

    // Re-style the standalone popup as a centered card on a brand canvas.
    await page.addStyleTag({
      content: `
        html, body { height: 100%; width: 100%; margin: 0; }
        body {
          background:
            radial-gradient(circle at top left, rgba(180,83,9,0.16), transparent 60%),
            linear-gradient(135deg, #faf8f5 0%, #f5f0e8 100%);
        }
        .ks-popup {
          position: fixed; top: 50%; left: 50%;
          transform: translate(-50%, -50%) scale(1.7); transform-origin: center;
          box-shadow: 0 30px 90px rgba(87,83,78,0.28); border-radius: 18px;
        }
      `,
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, "app-extension-popup-1280x800.png") });
    console.log("- app-extension-popup-1280x800.png");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
