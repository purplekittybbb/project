/**
 * One-off: create a confirmed test auth user via service role.
 * Usage: npx tsx scripts/create-test-user.ts <email> [password]
 * Does not print secrets from env.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function randomPassword(): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function main() {
  loadEnvLocal();
  const email = (process.argv[2] || "").trim().toLowerCase();
  const password = (process.argv[3] || randomPassword()).trim();
  if (!email || !email.includes("@")) {
    console.error("Usage: npx tsx scripts/create-test-user.ts <email> [password]");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) {
    console.error("listUsers failed:", listErr.message);
    process.exit(1);
  }
  const existing = listed.users.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        full_name: existing.user_metadata?.full_name ?? "Zeynep Test",
        company: existing.user_metadata?.company ?? "TrueMargin QA",
      },
    });
    if (updErr) {
      console.error("updateUser failed:", updErr.message);
      process.exit(1);
    }
    console.log(JSON.stringify({ action: "updated", userId: existing.id, email, password }, null, 2));
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "Zeynep Test",
      company: "TrueMargin QA",
    },
  });

  if (error) {
    console.error("createUser failed:", error.message);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      { action: "created", userId: data.user?.id, email, password },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
