/**
 * Tolerant CSV parser for real marketplace settlement/sales exports.
 *
 * Sellers rarely export a clean, fixed schema — Trendyol and Amazon files differ
 * in column names (Turkish vs English), delimiter (comma vs semicolon vs tab),
 * decimal style (1.234,56 vs 1,234.56), and often carry preamble rows before the
 * real header. This parser is deliberately forgiving:
 *
 *   - auto-detects the delimiter
 *   - auto-detects the header row (skips metadata preamble)
 *   - maps a wide set of column aliases (TR + EN, Trendyol + Amazon) to our fields
 *   - parses numbers in both Turkish and English formats
 *   - only truly needs an item identifier + a revenue amount; the rest default
 *
 * Output raw rows are persisted to Supabase and run through the engine's fee model
 * to compute the real margin.
 */

// Shape stored per row (matches the user_transactions table, minus id/user_id).
export interface UserRawRow {
  order_id: string;
  sku: string;
  category: string;
  sale_date: string; // YYYY-MM-DD
  units: number;
  gross_revenue: number;
  unit_cost: number;
  shipping: number;
  return_rate: number;
  ad_spend: number;
  /** Packaging cost per line (box/filler/label). Optional — defaults to 0. */
  packaging?: number;
  /**
   * Seller's own marketplace commission rate for this SKU (0..1). Optional —
   * filled from the per-SKU cost profile (product_costs) during enrichment when
   * the seller has entered their real contract rate. When absent/0 the adapter
   * uses the representative per-category rate. Never comes from the marketplace
   * API (it can't report the seller's negotiated rate).
   */
  commissionRate?: number;
  marketplace: string;
  /**
   * Human-readable product title from the marketplace API (e.g. Trendyol's
   * productName field). Used by the visibility scan cron as the search keyword.
   * Optional — populated on API syncs, not always available from CSV imports.
   * Added in migration 0022.
   */
  product_name?: string;
  /**
   * EAN/GTIN barcode for cross-marketplace product matching.
   * Optional — populated by Trendyol/N11 adapters on sync (migration 0020).
   * CSV imports pick it up from a dedicated barcode/ean/gtin column when present.
   */
  barcode?: string;
}

type Field =
  | "order_id" | "sku" | "category" | "sale_date" | "units"
  | "gross_revenue" | "unit_cost" | "shipping" | "return_rate" | "ad_spend"
  | "packaging" | "barcode";

export interface CsvParseResult {
  ok: boolean;
  rows: UserRawRow[];
  rowCount: number;
  error?: string;
  detectedHeaders: string[];
  delimiter: string;
  marketplace: string;
  /** field → the source header we matched it to (for UI transparency). */
  mapping: Partial<Record<Field, string>>;
  warnings: string[];
}

// ─── header alias dictionary (ascii-folded, underscored) ───────────────────────

const ALIASES: Record<Field, string[]> = {
  order_id: [
    "order_id", "siparis_no", "siparis_numarasi", "order_number", "amazon_order_id",
    "order_item_id", "fatura_no", "islem_no", "transaction_id", "paket_no",
  ],
  sku: [
    "sku", "seller_sku", "msku", "stok_kodu", "stok_kod", "urun_kodu", "barkod",
    "model_kodu", "product_sku", "asin", "urun", "product", "product_name",
    "urun_adi", "item", "item_name", "urun_ismi", "stok",
  ],
  category: [
    "category", "kategori", "urun_grubu", "product_category", "kategori_adi", "grup",
  ],
  sale_date: [
    "sale_date", "date", "tarih", "siparis_tarihi", "order_date", "islem_tarihi",
    "transaction_date", "satis_tarihi", "teslim_tarihi", "purchase_date",
    "posted_date", "posted_date_time", "odeme_tarihi",
  ],
  units: [
    "units", "adet", "quantity", "qty", "miktar", "satilan_adet",
    "quantity_purchased", "shipped_quantity", "urun_adedi",
  ],
  gross_revenue: [
    "gross_revenue", "satis_tutari", "tutar", "product_sales", "revenue", "gross",
    "ciro", "brut_gelir", "toplam_satis", "order_amount", "sales", "gmv",
    "faturalanan_tutar", "satis_geliri", "toplam_tutar", "birim_fiyat_toplam",
    "satis_fiyati", "item_price",
  ],
  unit_cost: [
    "unit_cost", "birim_maliyet", "maliyet", "cost", "cogs", "alis_fiyati",
    "urun_maliyeti", "birim_alis", "birim_alis_fiyati",
  ],
  shipping: [
    "shipping", "kargo", "kargo_bedeli", "kargo_ucreti", "shipping_cost",
    "fulfillment_fee", "fba_fee", "kargo_tutari", "gonderi_ucreti", "shipping_fee",
    "kargo_gideri",
  ],
  return_rate: [
    "return_rate", "iade_orani", "returns_rate", "iade_rate",
  ],
  ad_spend: [
    "ad_spend", "reklam", "reklam_harcamasi", "advertising", "ad_cost",
    "reklam_gideri", "ppc", "advertising_cost", "reklam_bedeli", "reklam_gideri_tl",
  ],
  packaging: [
    "packaging", "packaging_cost", "ambalaj", "ambalaj_maliyeti", "ambalaj_bedeli",
    "paketleme", "paketleme_maliyeti", "koli_maliyeti", "kutu_maliyeti",
  ],
  // Dedicated EAN/GTIN column — "barkod" stays a SKU alias (Turkish CSVs often
  // use it as the item identifier). These names are unambiguous barcode fields.
  barcode: [
    "barcode", "ean", "gtin", "ean13", "ean_13", "gtin13", "gtin_13",
    "upc", "barkod_no", "barkod_numarasi",
  ],
};

// ─── string / number helpers ───────────────────────────────────────────────────

function foldAscii(s: string): string {
  return s
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c");
}

function normalizeHeader(h: string): string {
  // Fold Turkish letters *before* lowercasing (İ→i etc.) so the dotted capital
  // İ doesn't lowercase into "i + combining dot" and break alias matching.
  return foldAscii(h)
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // strip any combining marks
    .replace(/\(.*?\)/g, " ")          // drop "(TL)", "(USD)" notes
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Parse a number tolerant of Turkish (1.234,56) and English (1,234.56) formats. */
function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  let s = raw.trim().replace(/[^\d.,\-]/g, ""); // strip currency symbols, spaces
  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // The rightmost separator is the decimal point.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // tr: 1.234,56
    } else {
      s = s.replace(/,/g, "");                     // en: 1,234.56
    }
  } else if (hasComma) {
    // Only commas: decimal comma if it looks like one (≤2 trailing digits).
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasDot) {
    // Only dots: disambiguate thousands vs decimal.
    const parts = s.split(".");
    if (parts.length > 2) {
      s = s.replace(/\./g, "");                     // 1.234.567 = thousands
    } else if (parts[1]?.length === 3) {
      s = s.replace(/\./g, "");                     // 4.000 = 4000 (tr thousands)
    }
    // else keep as decimal (e.g. 180.00, 1.5)
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize a return-rate cell to a 0..1 fraction. Sellers commonly write the
 * rate as a whole percent ("8" meaning 8%), which the old code clamped straight
 * to 1.0 = 100% and wrecked every margin. Heuristic: a value > 1 is a percent
 * (÷100); a value in [0,1] is already a fraction. Then clamp to [0,1].
 */
function normalizeReturnRate(v: number): number {
  const frac = v > 1 ? v / 100 : v;
  return Math.min(1, Math.max(0, frac));
}

/** Normalize a date-ish string to YYYY-MM-DD; falls back to today when unparseable. */
function normalizeDate(raw: string | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!raw) return today;
  const s = raw.trim();

  // ISO already (optionally with time)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD.MM.YYYY or DD/MM/YYYY (Turkish common)
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? today : parsed.toISOString().slice(0, 10);
}

// ─── CSV tokenizer ──────────────────────────────────────────────────────────────

function splitLine(line: string, delim: string): string[] {
  const cols: string[] = [];
  let inQuote = false;
  let cur = "";
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === delim && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function detectDelimiter(lines: string[]): string {
  const candidates = [";", "\t", ","];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    // Score by median column count across the first few lines.
    const counts = lines.slice(0, 8).map((l) => splitLine(l, d).length);
    const score = Math.max(...counts, 0);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** Build field → column-index mapping for a header row. */
function mapHeaders(headers: string[]): { byField: Partial<Record<Field, number>>; matched: number } {
  const norm = headers.map(normalizeHeader);
  const byField: Partial<Record<Field, number>> = {};
  (Object.keys(ALIASES) as Field[]).forEach((field) => {
    for (const alias of ALIASES[field]) {
      const idx = norm.indexOf(alias);
      if (idx >= 0 && byField[field] === undefined) { byField[field] = idx; break; }
    }
  });
  // Second pass: fuzzy contains-match for anything still unmapped.
  // Only consider headers with real content (>=3 chars) so blank/short cells
  // — e.g. a "TOTAL,,,," footer row — can't spuriously match every field.
  const usedIdx = new Set(Object.values(byField));
  (Object.keys(ALIASES) as Field[]).forEach((field) => {
    if (byField[field] !== undefined) return;
    for (const alias of ALIASES[field]) {
      const idx = norm.findIndex(
        (h, i) => h.length >= 3 && !usedIdx.has(i) && (h.includes(alias) || alias.includes(h)),
      );
      if (idx >= 0) { byField[field] = idx; usedIdx.add(idx); break; }
    }
  });
  return { byField, matched: Object.keys(byField).length };
}

function detectMarketplace(headers: string[]): string {
  const joined = headers.map(normalizeHeader).join(" ");
  if (/asin|amazon|fba|msku/.test(joined)) return "amazon_us";
  if (/hepsiburada|hepsi_burada|\bhb_/.test(joined)) return "hepsiburada";
  return "trendyol";
}

// ─── main entry ──────────────────────────────────────────────────────────────

export function parseCsv(csvText: string): CsvParseResult {
  const base: CsvParseResult = {
    ok: false, rows: [], rowCount: 0, detectedHeaders: [],
    delimiter: ",", marketplace: "trendyol", mapping: {}, warnings: [],
  };

  const allLines = csvText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (allLines.length < 2) {
    return { ...base, error: "CSV dosyasında yeterli satır yok." };
  }

  const delimiter = detectDelimiter(allLines);

  // Find the header row: the line (within the first 15) that maps the most fields.
  let headerLineIdx = 0;
  let bestMap = { byField: {} as Partial<Record<Field, number>>, matched: -1 };
  const scanLimit = Math.min(15, allLines.length);
  for (let i = 0; i < scanLimit; i++) {
    const cols = splitLine(allLines[i], delimiter);
    if (cols.length < 2) continue;
    const m = mapHeaders(cols);
    if (m.matched > bestMap.matched) { bestMap = m; headerLineIdx = i; }
  }

  const headers = splitLine(allLines[headerLineIdx], delimiter);
  const { byField } = bestMap;

  // Minimum viable mapping: an item identifier + a revenue amount.
  if (byField.sku === undefined) {
    return { ...base, delimiter, detectedHeaders: headers, error: "Ürün/SKU sütunu bulunamadı." };
  }
  if (byField.gross_revenue === undefined) {
    return { ...base, delimiter, detectedHeaders: headers, error: "Satış tutarı / gelir sütunu bulunamadı." };
  }

  const marketplace = detectMarketplace(headers);
  const warnings: string[] = [];
  if (byField.unit_cost === undefined) warnings.push("Birim maliyet sütunu yok — 0 alındı, marj olduğundan yüksek görünebilir. Sonra düzenleyebilirsiniz.");
  if (byField.sale_date === undefined) warnings.push("Tarih sütunu yok — bugünün tarihi atandı.");
  if (byField.units === undefined) warnings.push("Adet sütunu yok — 1 alındı.");

  const cell = (cols: string[], f: Field): string | undefined => {
    const i = byField[f];
    return i === undefined ? undefined : cols[i];
  };

  const rows: UserRawRow[] = [];
  // Refund / return / platform-deduction lines (negative revenue) collected per
  // SKU so we can NET them into that SKU's realized revenue + units below —
  // instead of silently dropping them (which would inflate "true" margin) or
  // emitting negative-revenue rows (the engine requires positive per-line
  // revenue, see UserRawRowSchema). This models realized NET sales: a returned
  // order removes its revenue and units from the SKU's totals.
  const refunds = new Map<string, { amount: number; units: number }>();
  let refundLineCount = 0;
  for (let i = headerLineIdx + 1; i < allLines.length; i++) {
    const cols = splitLine(allLines[i], delimiter);
    if (cols.length < 2) continue;

    const grossRevenue = parseNumber(cell(cols, "gross_revenue"));
    const skuVal = (cell(cols, "sku") ?? "").trim();
    if (grossRevenue < 0 && skuVal) {
      const key = skuVal.slice(0, 120);
      const prev = refunds.get(key) ?? { amount: 0, units: 0 };
      prev.amount += -grossRevenue;
      prev.units += Math.max(1, Math.round(Math.abs(parseNumber(cell(cols, "units")) || 1)));
      refunds.set(key, prev);
      refundLineCount++;
      continue;
    }
    if (grossRevenue <= 0 || !skuVal) continue; // skip totals/blank/footer rows

    const barcodeVal = (cell(cols, "barcode") ?? "").trim();
    // Fallback: if SKU itself looks like an EAN/GTIN (8–14 digits), use it.
    const barcodeFromSku = /^\d{8,14}$/.test(skuVal) ? skuVal : "";
    const barcode = (barcodeVal || barcodeFromSku) || undefined;

    rows.push({
      order_id: (cell(cols, "order_id") ?? `row-${i}`).slice(0, 120),
      sku: skuVal.slice(0, 120),
      category: (cell(cols, "category") ?? "Diğer").trim() || "Diğer",
      sale_date: normalizeDate(cell(cols, "sale_date")),
      units: Math.max(1, Math.round(parseNumber(cell(cols, "units")) || 1)),
      gross_revenue: grossRevenue,
      unit_cost: parseNumber(cell(cols, "unit_cost")),
      shipping: parseNumber(cell(cols, "shipping")),
      return_rate: normalizeReturnRate(parseNumber(cell(cols, "return_rate"))),
      ad_spend: parseNumber(cell(cols, "ad_spend")),
      packaging: parseNumber(cell(cols, "packaging")),
      marketplace,
      ...(barcode ? { barcode } : {}),
    });
  }

  // ── Net refunds into each SKU's realized revenue + units ────────────────────
  // Greedy reduction over that SKU's positive sale rows (most recent first, so a
  // refund lands against the sale it most likely belongs to): subtract the
  // refunded amount and units, clamping each row at 0 and dropping rows that hit
  // 0. Reducing units also reduces COGS/shipping downstream (adapters scale
  // those by units), so a returned unit stops counting as a profitable sale.
  // A refund larger than all recorded sales for a SKU simply zeroes them out.
  let netMoreThanSales = 0;
  if (refunds.size > 0) {
    for (const [sku, refund] of refunds) {
      let amountLeft = refund.amount;
      let unitsLeft = refund.units;
      // Most-recent sale rows first.
      const idxs = rows
        .map((r, idx) => ({ idx, r }))
        .filter((x) => x.r.sku === sku)
        .sort((a, b) => (a.r.sale_date < b.r.sale_date ? 1 : -1))
        .map((x) => x.idx);
      if (idxs.length === 0) { netMoreThanSales++; continue; }
      for (const idx of idxs) {
        if (amountLeft <= 0 && unitsLeft <= 0) break;
        const row = rows[idx];
        const takeAmount = Math.min(amountLeft, row.gross_revenue);
        row.gross_revenue -= takeAmount;
        amountLeft -= takeAmount;
        const takeUnits = Math.min(unitsLeft, row.units);
        row.units -= takeUnits;
        unitsLeft -= takeUnits;
      }
      if (amountLeft > 0.01) netMoreThanSales++;
    }
    // Drop rows fully cancelled by refunds (0 revenue or 0 units left).
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].gross_revenue <= 0 || rows[i].units <= 0) rows.splice(i, 1);
    }
  }

  if (refundLineCount > 0) {
    warnings.push(
      `${refundLineCount} iade/kesinti satırı, ilgili ürünlerin net cirosundan ve satış adedinden düşüldü — böylece gerçek kâr olduğundan yüksek görünmez.`,
    );
  }
  if (netMoreThanSales > 0) {
    warnings.push(
      `${netMoreThanSales} üründe iade tutarı, o dönemdeki satıştan fazlaydı — bu ürünlerin net satışı sıfırlandı; veriyi kontrol edin.`,
    );
  }

  if (rows.length === 0) {
    // If every sale row was cancelled out by refund/return lines, say so
    // explicitly — a generic "no valid rows" would mislead a seller whose file
    // actually parsed fine but netted to zero (PDF §3.3 yol gösterici hata).
    const error =
      refundLineCount > 0
        ? "Tüm satışlar iade/kesinti satırlarıyla sıfırlandı — net satış kalmadı. İade tutarlarını ve tarih aralığını kontrol edin."
        : "Geçerli satır bulunamadı (gelir > 0 ve SKU dolu olmalı).";
    return { ...base, delimiter, detectedHeaders: headers, marketplace, error };
  }

  const mapping: Partial<Record<Field, string>> = {};
  (Object.keys(byField) as Field[]).forEach((f) => {
    const i = byField[f];
    if (i !== undefined) mapping[f] = headers[i];
  });

  return {
    ok: true,
    rows,
    rowCount: rows.length,
    detectedHeaders: headers,
    delimiter,
    marketplace,
    mapping,
    warnings,
  };
}

/** A small sample CSV users can download to see one accepted format. */
export const SAMPLE_CSV =
  "order_id,sku,category,sale_date,units,gross_revenue,unit_cost,shipping,return_rate,ad_spend\n" +
  "DEMO-1,MY-SKU-01,Elektronik,2026-05-10,200,80000,180,4000,0.08,12000\n" +
  "DEMO-2,MY-SKU-02,Elektronik,2026-05-24,150,60000,200,3000,0.06,8000\n" +
  "DEMO-3,MY-SKU-01,Elektronik,2026-06-08,220,88000,180,4400,0.09,14000\n";
