import { spawnSync } from "node:child_process";
import fs from "node:fs";

const SKIP = new Set(["VERCEL_OIDC_TOKEN", "CRON_SYNC_DELAY_MS"]);
const TARGET_ENVS = ["production", "preview", "development"];

/** @type {Record<string, string>} */
const vars = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const [, key, raw] = m;
  if (SKIP.has(key)) continue;
  const value = raw.trim();
  if (!value) continue;
  vars[key] = value;
}

for (const [key, value] of Object.entries(vars)) {
  for (const env of TARGET_ENVS) {
    const result = spawnSync("npx", ["vercel", "env", "add", key, env, "--force"], {
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });
    if (result.status !== 0) {
      process.stderr.write(`FAILED ${key} (${env})\n${result.stderr ?? ""}\n`);
      process.exit(1);
    }
    process.stdout.write(`OK ${key} -> ${env}\n`);
  }
}

process.stdout.write(`Pushed ${Object.keys(vars).length} variable(s) to Vercel.\n`);
