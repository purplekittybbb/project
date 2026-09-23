import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export function userScopedClient(accessToken: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

/**
 * Authenticate via user JWT, then return a service-role client for
 * billing_subscriptions writes (user INSERT/UPDATE policies removed in 0040).
 */
export async function requireBillingActor(accessToken: string): Promise<
  | { ok: true; user: User; auth: SupabaseClient; svc: SupabaseClient }
  | { ok: false; status: number; error: string }
> {
  if (!accessToken) {
    return { ok: false, status: 401, error: "Oturum bulunamadı — lütfen tekrar giriş yapın." };
  }

  const auth = userScopedClient(accessToken);
  if (!auth) {
    return { ok: false, status: 500, error: "Supabase yapılandırılmamış." };
  }

  const { data: userData, error: userError } = await auth.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return { ok: false, status: 401, error: "Oturum geçersiz." };
  }

  const svc = createServiceRoleClient();
  if (!svc) {
    return { ok: false, status: 500, error: "Sunucu faturalama yapılandırması eksik." };
  }

  return { ok: true, user, auth, svc };
}
