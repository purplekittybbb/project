"use client";

/**
 * Verilerim — the signed-in user's own data.
 *
 * CSV upload + manual single-row entry, persisted to Supabase (RLS-scoped).
 * Presentational: all persistence is delegated to the parent via callbacks so the
 * dashboard can re-register the runtime seller and re-render after any change.
 */

import { useCallback, useRef, useState } from "react";
import { Database, Trash2, Upload } from "lucide-react";
import { parseCsv, SAMPLE_CSV, type CsvParseResult, type UserRawRow } from "@/lib/adapters/csv";
import { validateUserRawRow, validateUserRawRows } from "@/lib/domain/schemas";
import type { StoredRow } from "@/lib/supabase/user-data";

const FIELD_LABELS: Record<string, string> = {
  order_id: "Sipariş No", sku: "SKU / Ürün", category: "Kategori", sale_date: "Tarih",
  units: "Adet", gross_revenue: "Brüt Gelir", unit_cost: "Birim Maliyet",
  shipping: "Kargo", return_rate: "İade Oranı", ad_spend: "Reklam",
};

const DELIM_LABEL: Record<string, string> = { ",": "virgül", ";": "noktalı virgül", "\t": "sekme" };

// ─── helpers ─────────────────────────────────────────────────────────────────

function money(v: number) {
  return `₺${Math.round(v).toLocaleString("tr-TR")}`;
}

const EMPTY_FORM = {
  sku: "", category: "", sale_date: "", units: "",
  gross_revenue: "", unit_cost: "", shipping: "", return_rate: "", ad_spend: "",
};

// ─── dropzone ────────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed cursor-pointer transition-colors px-6 py-8 text-center ${
        dragging ? "border-zinc-500 bg-zinc-900/40" : "border-zinc-800 hover:border-zinc-700 bg-zinc-950/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <Upload size={18} className="mx-auto mb-2 text-zinc-600" />
      <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-[0.15em]">
        CSV sürükleyin veya tıklayın
      </div>
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

interface Props {
  rows: StoredRow[];
  authConfigured: boolean;
  busy: boolean;
  onUpload: (rows: UserRawRow[]) => Promise<void>;
  onDeleteRow: (id: string) => Promise<void>;
  onClear: () => Promise<void>;
}

export function MyDataPanel({ rows, authConfigured, busy, onUpload, onDeleteRow, onClear }: Props) {
  const [csvError, setCsvError] = useState("");
  const [preview, setPreview] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  async function handleFile(file: File) {
    setCsvError("");
    setPreview(null);
    const text = await file.text();
    const res = parseCsv(text);
    if (!res.ok) { setCsvError(res.error ?? "CSV ayrıştırılamadı."); return; }

    // Re-check every parsed row against the canonical schema (catches values
    // parseCsv's own tolerant parsing let through, e.g. a fractional unit
    // count) before the user ever sees an import preview.
    const { valid, warnings } = validateUserRawRows(res.rows);
    if (valid.length === 0) {
      setCsvError("Hiçbir satır geçerli veri içermiyor — dosyayı kontrol edin.");
      return;
    }

    setFileName(file.name);
    setPreview({
      ...res,
      rows: valid,
      rowCount: valid.length,
      warnings: [...res.warnings, ...warnings],
    });
  }

  async function confirmImport() {
    if (!preview) return;
    await onUpload(preview.rows);
    setPreview(null);
    setFileName("");
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "truemargin-ornek.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const row: UserRawRow = {
      order_id: `manual-${Date.now()}`,
      sku: form.sku.trim(),
      category: form.category.trim() || "Diğer",
      sale_date: form.sale_date,
      units: Number(form.units) || 1,
      gross_revenue: Number(form.gross_revenue) || 0,
      unit_cost: Number(form.unit_cost) || 0,
      shipping: Number(form.shipping) || 0,
      return_rate: Number(form.return_rate) || 0,
      ad_spend: Number(form.ad_spend) || 0,
      marketplace: "trendyol",
    };

    const check = validateUserRawRow(row);
    if (!check.ok) { setFormError(check.message); return; }

    await onUpload([check.data]);
    setForm(EMPTY_FORM);
  }

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls =
    "w-full border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-200 font-mono tabular-nums placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-zinc-600";

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-1 border-l border-zinc-800 pl-4 flex items-center gap-2">
          <Database size={12} /> Verilerim
        </h2>
        <p className="text-zinc-700 text-[11px] font-mono pl-4">
          Verileriniz hesabınıza kayıtlıdır — çıkıp tekrar girdiğinizde burada durur. Sadece siz görebilirsiniz.
        </p>
      </div>

      {/* Not configured warning */}
      {!authConfigured && (
        <div className="border border-amber-900/50 bg-amber-950/20 px-4 py-3 font-mono text-[11px] text-amber-400">
          Supabase anahtarları tanımlı değil — bu oturumda kayıt kalıcı olmayacak.
          Kalıcılık için .env.local içine NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY ekleyin.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* CSV upload */}
        <div className="space-y-3">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">CSV Yükle</div>
          {!preview && <DropZone onFile={handleFile} />}
          {csvError && (
            <div className="border border-[#c0392b]/40 bg-[#c0392b]/10 px-3 py-2 text-[11px] text-red-400 font-mono">
              {csvError}
            </div>
          )}

          {/* Detected-mapping preview / confirm */}
          {preview && (
            <div className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-zinc-300 font-mono text-[12px] truncate">{fileName}</span>
                <span className="text-zinc-600 font-mono text-[10px] uppercase tracking-widest">
                  {preview.rowCount} satır · {preview.marketplace} · {DELIM_LABEL[preview.delimiter] ?? "?"}
                </span>
              </div>

              <div>
                <div className="text-zinc-600 text-[10px] uppercase tracking-[0.15em] font-sans mb-1.5">Eşlenen sütunlar</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(preview.mapping).map(([field, src]) => (
                    <span key={field} className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px]">
                      <span className="text-zinc-500">{FIELD_LABELS[field] ?? field}</span>
                      <span className="text-zinc-700">←</span>
                      <span className="text-zinc-300">{src}</span>
                    </span>
                  ))}
                </div>
              </div>

              {preview.warnings.length > 0 && (
                <ul className="space-y-1">
                  {preview.warnings.map((w, i) => (
                    <li key={i} className="text-amber-500/80 font-mono text-[10px] leading-snug">— {w}</li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setPreview(null); setFileName(""); }}
                  className="flex-1 border border-zinc-800 px-3 py-2 font-mono text-[12px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  onClick={confirmImport}
                  disabled={busy}
                  className="flex-1 bg-zinc-100 text-zinc-950 px-3 py-2 font-mono text-[12px] font-semibold hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                >
                  İçe aktar →
                </button>
              </div>
            </div>
          )}

          {!preview && (
            <div className="flex items-center justify-between">
              <button onClick={downloadSample} className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors">
                ↓ Örnek CSV indir
              </button>
              <span className="text-zinc-700 text-[10px] font-mono">Trendyol / Amazon dışa aktarımı da olur</span>
            </div>
          )}
        </div>

        {/* Manual entry */}
        <div className="space-y-3">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">Manuel Satır Ekle</div>
          <form onSubmit={handleManualAdd} className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="SKU" value={form.sku} onChange={set("sku")} />
            <input className={inputCls} placeholder="Kategori" value={form.category} onChange={set("category")} />
            <input className={inputCls} type="date" value={form.sale_date} onChange={set("sale_date")} />
            <input className={inputCls} placeholder="Adet" inputMode="numeric" value={form.units} onChange={set("units")} />
            <input className={inputCls} placeholder="Brüt gelir ₺" inputMode="numeric" value={form.gross_revenue} onChange={set("gross_revenue")} />
            <input className={inputCls} placeholder="Birim maliyet ₺" inputMode="numeric" value={form.unit_cost} onChange={set("unit_cost")} />
            <input className={inputCls} placeholder="Kargo ₺" inputMode="numeric" value={form.shipping} onChange={set("shipping")} />
            <input className={inputCls} placeholder="İade oranı (0-1)" inputMode="decimal" value={form.return_rate} onChange={set("return_rate")} />
            <input className={inputCls} placeholder="Reklam ₺" inputMode="numeric" value={form.ad_spend} onChange={set("ad_spend")} />
            <button
              type="submit"
              disabled={busy}
              className="bg-zinc-100 text-zinc-950 px-3 py-2 text-sm font-mono font-semibold hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              Ekle
            </button>
          </form>
          {formError && <div className="text-[11px] text-red-400 font-mono">{formError}</div>}
        </div>
      </div>

      {/* Rows table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans">
            Kayıtlı Satırlar · {rows.length}
          </div>
          {rows.length > 0 && (
            <button
              onClick={onClear}
              disabled={busy}
              className="text-[10px] font-mono text-zinc-600 hover:text-red-400 uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              Tümünü sil
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="border border-zinc-900 bg-zinc-950/40 px-4 py-10 text-center text-zinc-700 font-mono text-[11px]">
            Henüz veri yok. CSV yükleyin veya manuel satır ekleyin.
          </div>
        ) : (
          <div className="border border-zinc-800 overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="bg-zinc-900/40 text-zinc-600 text-[10px] uppercase tracking-[0.12em]">
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Kategori</th>
                  <th className="text-left px-3 py-2">Tarih</th>
                  <th className="text-right px-3 py-2">Adet</th>
                  <th className="text-right px-3 py-2">Brüt Gelir</th>
                  <th className="text-right px-3 py-2">İade</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-900/60 hover:bg-zinc-900/20">
                    <td className="px-3 py-2 text-zinc-300">{r.sku}</td>
                    <td className="px-3 py-2 text-zinc-500">{r.category}</td>
                    <td className="px-3 py-2 text-zinc-500 tabular-nums">{r.sale_date}</td>
                    <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">{r.units}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{money(r.gross_revenue)}</td>
                    <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">{(r.return_rate * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onDeleteRow(r.id)}
                        disabled={busy}
                        className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-50"
                        aria-label="Satırı sil"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
