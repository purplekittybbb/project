/**
 * Minimal Resend (https://resend.com) client via raw fetch — no new npm
 * dependency added on purpose (matches this project's existing pattern of
 * keeping the dependency surface small; see package.json).
 *
 * Server-only. Requires two env vars that are NOT configured yet in this
 * project (see .env.local docs the user must add themselves):
 *   RESEND_API_KEY        — from resend.com/api-keys
 *   RESEND_FROM_EMAIL      — a verified sending address, e.g. "TrueMargin <bildirim@truemargin.app>"
 *
 * Without them, sendEmail() is a documented no-op that returns a clear error
 * string instead of throwing — a cron run must never crash just because
 * email hasn't been set up yet.
 */

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { ok: false, error: "RESEND_API_KEY / RESEND_FROM_EMAIL yapılandırılmadı." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Bilinmeyen e-posta hatası." };
  }
}
