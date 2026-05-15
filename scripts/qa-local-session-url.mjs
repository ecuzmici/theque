import fs from "node:fs";

function readEnvLocal() {
  const vars = {};
  if (!fs.existsSync(".env.local")) return vars;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = { ...process.env, ...readEnvLocal() };
const secret = env.QA_DEV_SESSION_SECRET;
const port = env.PORT || "3000";
const base = env.QA_DEV_BASE_URL || `http://localhost:${port}`;

if (!secret) {
  console.error("Missing QA_DEV_SESSION_SECRET in .env.local");
  console.error("Add a random string, plus QA_DEV_EMAIL=your Supabase login email.");
  process.exit(1);
}

const next = process.argv[2] || "/library";
const url = `${base.replace(/\/+$/, "")}/api/dev/qa-session?secret=${encodeURIComponent(secret)}&next=${encodeURIComponent(next)}`;

console.log(url);
console.log("\nOpen this URL once (or let Playwright navigate here) to start QA without sending a magic-link email.");
