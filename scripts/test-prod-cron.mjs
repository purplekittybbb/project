import fs from "node:fs";

function readEnvKey(key) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] === key) return m[2].trim();
  }
  throw new Error(`Missing ${key} in .env.local`);
}

const base = process.argv[2] ?? "https://matsorular.vercel.app";
const secret = readEnvKey("CRON_SECRET");
const url = `${base.replace(/\/$/, "")}/api/cron/sync-marketplaces`;

async function call(label) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await res.json().catch(() => ({}));
  console.log(`${label}: HTTP ${res.status}`);
  console.log(JSON.stringify(body, null, 2));
  return { status: res.status, body };
}

const noAuth = await fetch(url);
console.log(`no-auth: HTTP ${noAuth.status} (expect 401)`);

const run1 = await call("run-1");
const run2 = await call("run-2");

if (noAuth.status !== 401) process.exitCode = 1;
if (run1.status !== 200 || run2.status !== 200) process.exitCode = 1;

if (typeof run1.body.totalNewRows === "number" && typeof run2.body.totalNewRows === "number") {
  console.log(`duplicate-check: run1 new=${run1.body.totalNewRows}, run2 new=${run2.body.totalNewRows}`);
  if (run2.body.totalDuplicatesSkipped >= 0) {
    console.log(`run2 duplicatesSkipped=${run2.body.totalDuplicatesSkipped}`);
  }
}
