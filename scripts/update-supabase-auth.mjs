import fs from "node:fs";

const ref = "jucaqjkgyhyzixzaisjr";
let token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token && fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/);
    if (m) token = m[1].trim().replace(/^["']|["']$/g, "");
  }
}

if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens",
  );
  console.error("Then add to .env.local or run: $env:SUPABASE_ACCESS_TOKEN='sbp_...'");
  process.exit(1);
}

const confirmationTemplate = fs.readFileSync("supabase/templates/confirmation.html", "utf8");
const magicLinkTemplate = fs.readFileSync("supabase/templates/magic_link.html", "utf8");

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const addUrls = [
  "http://localhost:3000/**",
  "http://localhost:3000/auth/callback",
  "https://theque.app/**",
  "https://theque.app/auth/callback",
  "https://theque.vercel.app/**",
  "https://theque.vercel.app/auth/callback",
];

const getRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  headers,
});
if (!getRes.ok) {
  console.error("GET_AUTH", getRes.status, await getRes.text());
  process.exit(1);
}

const auth = await getRes.json();
const allow = (auth.uri_allow_list || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

for (const u of addUrls) {
  if (!allow.includes(u)) allow.push(u);
}

const patchAuth = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    site_url: "https://theque.app",
    uri_allow_list: allow.join(","),
    mailer_subjects_confirmation: "Your thèque sign-in code",
    mailer_templates_confirmation_content: confirmationTemplate,
    mailer_subjects_magic_link: "Your thèque sign-in code",
    mailer_templates_magic_link_content: magicLinkTemplate,
  }),
});
console.log("PATCH_AUTH", patchAuth.status);
if (!patchAuth.ok) {
  console.error(await patchAuth.text());
  process.exit(1);
}

const patchProject = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ name: "theque" }),
});
console.log("PATCH_PROJECT", patchProject.status);
if (!patchProject.ok) {
  console.error(await patchProject.text());
  process.exit(1);
}

console.log(
  "OK — site_url, redirect URLs, auth email subjects/templates updated; project renamed to theque.",
);
