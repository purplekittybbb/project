"use client";

/**
 * Maliyet Merkezi (Product Cost Editor)
 *
 * THE missing piece behind the product's core promise. A live marketplace sync
 * can only ever return order-side figures — it stores COGS, shipping, packaging,
 * return rate and ad spend as 0 (no marketplace API knows the seller's own
 * costs). Without these, "gerçek net kâr" collapses to revenue − commission −
 * VAT and the loss alarm never fires. This editor lets the seller enter/edit a
 * per-SKU cost profile that lib/calc/enrich.ts merges into every synced row
 * (persisted in product_costs, migration 0015 — RLS-scoped to the user).
 *
 * Dark ("financial terminal") surface to match the dashboard shell it renders in.
 */

import { useEffect, useMemo, useState } from "react";
import type { StoredRow } from "@/lib/supabase/user-data";
import { buildSkuEconomicsMap } from "@/lib/tools/sku-economics";
import { loadProductCosts, upsertProductCost } from "@/lib/supabase/product-costs";
import type { ProductCost } from "@/lib/calc/enrich";

interface Draft {
  unitCost: string;
  shippingPerUnit: string;
  packagingPerUnit: string;
  adSpendPerUnit: string;
  returnRatePct: string; // shown as %, stored as 0..1
  commissionRatePct: string; // shown as %, stored as 0..1; blank/0 = use category rate
}

type SaveState = "idle" | "saving" | "saved" | "error";

function fmtMoney(n: number): string {
  return `₺${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n)}`;
}

/** Parse a Turkish-or-plain numeric input ("12,50" or "12.50") to a number. */
function parseNum(s: string): number {
  if (!s) return 0;
  const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function ProductCostEditor({
  rows,
  onSaved,
}: {
  rows: StoredRow[];
  onSaved?: () => void | Promise<void>;
}) {
  const economics = useMemo(() => buildSkuEconomicsMap(rows), [rows]);
  const skuList = useMemo(
    () => [...economics.values()].sort((a, b) => b.totalUnits - a.totalUnits),
    [economics],
  );

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");

  // Prefill each SKU's editable fields: a saved profile (product_costs) wins;
  // otherwise the effective per-unit values already on the rows (CSV or 0).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadProductCosts();
      if (cancelled) return;
      const next: Record<string, Draft> = {};
      for (const e of economics.values()) {
        const s = saved.get(e.sku);
        next[e.sku] = {
          unitCost: fieldStr(s?.unitCost, e.unitCost),
          shippingPerUnit: fieldStr(s?.shippingPerUnit, e.shippingPerUnit),
          packagingPerUnit: fieldStr(s?.packagingPerUnit, e.packagingPerUnit),
          adSpendPerUnit: fieldStr(s?.adSpendPerUnit, e.adSpendPerUnit),
          returnRatePct: fieldStr(
            s?.returnRate != null ? s.returnRate * 100 : undefined,
            e.returnRate * 100,
          ),
          // Commission has no row-derived default (it's computed, not stored on
          // the row) — prefill only from a saved profile, else blank.
          commissionRatePct: fieldStr(
            s?.commissionRate != null && s.commissionRate > 0 ? s.commissionRate * 100 : undefined,
            0,
          ),
        };
      }
      setDrafts(next);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [economics]);

  function fieldStr(saved: number | undefined, fallback: number): string {
    const v = saved != null ? saved : fallback;
    if (!v) return "";
    return String(Math.round(v * 100) / 100).replace(".", ",");
  }

  function setField(sku: string, key: keyof Draft, value: string) {
    setDrafts((d) => ({ ...d, [sku]: { ...d[sku], [key]: value } }));
    setSaveStates((s) => ({ ...s, [sku]: "idle" }));
  }

  async function save(sku: string, marketplace: string) {
    const d = drafts[sku];
    if (!d) return;
    setSaveStates((s) => ({ ...s, [sku]: "saving" }));
    const cost: ProductCost = {
      unitCost: parseNum(d.unitCost),
      shippingPerUnit: parseNum(d.shippingPerUnit),
      packagingPerUnit: parseNum(d.packagingPerUnit),
      adSpendPerUnit: parseNum(d.adSpendPerUnit),
      returnRate: Math.min(1, Math.max(0, parseNum(d.returnRatePct) / 100)),
      commissionRate: Math.min(1, Math.max(0, parseNum(d.commissionRatePct) / 100)),
    };
    const { error } = await upsertProductCost(marketplace, sku, cost);
    if (error) {
      setSaveStates((s) => ({ ...s, [sku]: "error" }));
      return;
    }
    setSaveStates((s) => ({ ...s, [sku]: "saved" }));
    await onSaved?.();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return skuList;
    return skuList.filter(
      (e) => e.sku.toLocaleLowerCase("tr").includes(q) || e.productTitle.toLocaleLowerCase("tr").includes(q),
    );
  }, [skuList, query]);

  if (skuList.length === 0) {
    return (
      <p className="text-zinc-600 font-mono text-[12px]">
        Henüz ürün yok — Verilerim sekmesinden veri yükleyin veya bir mağaza bağlayın. Ürünleriniz
        geldikçe maliyetlerini buradan girebilirsiniz.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-6 border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 rounded-sm">
        <p className="text-[12px] text-amber-200/90 leading-relaxed">
          <span className="font-semibold">Neden önemli?</span> Pazaryeri bağlantısı yalnızca satış ve
          komisyon verisini getirir; alış fiyatı, kargo, ambalaj ve iade oranını yalnızca siz
          bilirsiniz. Bunları girdiğinizde <span className="text-amber-100">gerçek net kârınız</span> ve{" "}
          <span className="text-amber-100">zarar alarmları</span> doğru hesaplanır. Girmezseniz kâr
          olduğundan yüksek görünür.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün adı veya SKU ara…"
          className="w-full max-w-xs bg-zinc-950 border border-zinc-800 text-zinc-100 text-[13px] px-3 py-2 focus:outline-none focus:border-zinc-600 placeholder-zinc-700"
        />
        <span className="text-zinc-600 text-[11px] font-mono whitespace-nowrap">
          {filtered.length} / {skuList.length} ürün
        </span>
      </div>

      {!loaded ? (
        <p className="text-zinc-600 font-mono text-[12px]">Maliyetler yükleniyor…</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const d = drafts[e.sku] ?? {
              unitCost: "", shippingPerUnit: "", packagingPerUnit: "", adSpendPerUnit: "", returnRatePct: "", commissionRatePct: "",
            };
            const perUnitCost =
              parseNum(d.unitCost) + parseNum(d.shippingPerUnit) + parseNum(d.packagingPerUnit) + parseNum(d.adSpendPerUnit);
            const roughPerUnit = e.avgSalePrice - perUnitCost; // komisyon/KDV hariç
            const st = saveStates[e.sku] ?? "idle";
            return (
              <div key={e.sku} className="border border-zinc-900 bg-zinc-950/40 p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="text-zinc-200 text-[13px] font-medium truncate">{e.productTitle}</div>
                    <div className="text-zinc-600 text-[11px] font-mono mt-0.5">
                      {e.sku} · {e.marketplace} · {e.totalUnits} adet · ort. satış {fmtMoney(e.avgSalePrice)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-zinc-600 text-[10px] uppercase tracking-widest font-mono">Kaba birim (kom./KDV hariç)</div>
                    <div className={`font-mono text-[15px] tabular-nums ${roughPerUnit >= 0 ? "text-zinc-200" : "text-[var(--tm-alert-clay,#c0563e)]"}`}>
                      {fmtMoney(roughPerUnit)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <CostField label="Alış fiyatı ₺/adet" value={d.unitCost} onChange={(v) => setField(e.sku, "unitCost", v)} />
                  <CostField label="Kargo ₺/adet" value={d.shippingPerUnit} onChange={(v) => setField(e.sku, "shippingPerUnit", v)} />
                  <CostField label="Ambalaj ₺/adet" value={d.packagingPerUnit} onChange={(v) => setField(e.sku, "packagingPerUnit", v)} />
                  <CostField label="Reklam ₺/adet" value={d.adSpendPerUnit} onChange={(v) => setField(e.sku, "adSpendPerUnit", v)} />
                  <CostField label="İade oranı %" value={d.returnRatePct} onChange={(v) => setField(e.sku, "returnRatePct", v)} />
                  <CostField label="Komisyon %" value={d.commissionRatePct} onChange={(v) => setField(e.sku, "commissionRatePct", v)} hint="Boş bırakırsanız kategori oranı" />
                </div>

                <div className="flex items-center justify-end gap-3 mt-3">
                  {st === "saved" && <span className="text-[11px] text-[var(--tm-ledger-green,#3f9668)]">Kaydedildi ✓</span>}
                  {st === "error" && <span className="text-[11px] text-[var(--tm-alert-clay,#c0563e)]">Kaydedilemedi — tekrar deneyin</span>}
                  <button
                    type="button"
                    onClick={() => save(e.sku, e.marketplace)}
                    disabled={st === "saving"}
                    className="h-8 px-4 bg-zinc-100 text-zinc-950 text-[12px] font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {st === "saving" ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CostField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-zinc-600 text-[10px] uppercase tracking-wider font-mono mb-1" title={hint}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 text-[13px] font-mono tabular-nums px-2.5 py-1.5 focus:outline-none focus:border-zinc-600 placeholder-zinc-700"
      />
      {hint && <span className="block text-zinc-700 text-[9px] mt-0.5 leading-tight">{hint}</span>}
    </label>
  );
}
