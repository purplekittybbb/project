import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { parseBarcodeMappingCsv } from "@/lib/tools/barcode-csv";
import { applyBarcodeMappings, rebuildUserCanonicalProducts } from "@/lib/tools/barcode-sync";

export const runtime = "nodejs";

async function getUserId(): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });
  }

  let body: { csv?: string; mappings?: Array<{ sku: string; barcode: string }> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  let mappings = body.mappings ?? [];
  const warnings: string[] = [];

  if (body.csv?.trim()) {
    const parsed = parseBarcodeMappingCsv(body.csv);
    warnings.push(...parsed.errors);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.errors[0] ?? "CSV okunamadı.", warnings }, { status: 400 });
    }
    mappings = parsed.mappings;
  }

  if (mappings.length === 0) {
    return NextResponse.json({ error: "En az bir SKU–barkod eşleşmesi gerekli." }, { status: 400 });
  }

  const applied = await applyBarcodeMappings(supabase, userId, mappings);
  if (applied.error) {
    return NextResponse.json({ error: applied.error }, { status: 500 });
  }

  const rebuilt = await rebuildUserCanonicalProducts(supabase, userId);
  if (rebuilt.error) {
    return NextResponse.json(
      { error: "Barkodlar kaydedildi ancak analiz yenilenemedi.", warnings: [rebuilt.error] },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    updatedSkus: applied.updatedSkus,
    productCount: rebuilt.productCount,
    warnings,
  });
}
