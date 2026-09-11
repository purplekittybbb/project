/**
 * Parse a minimal SKU ↔ barcode mapping CSV for manual enrichment.
 * Expected columns: sku + barcode (aliases: stok_kodu, ean, gtin, barkod).
 */

export interface BarcodeMapping {
  sku: string;
  barcode: string;
}

export interface BarcodeCsvParseResult {
  ok: boolean;
  mappings: BarcodeMapping[];
  errors: string[];
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/\s+/g, "_");
}

function detectDelimiter(line: string): string {
  if (line.includes(";")) return ";";
  if (line.includes("\t")) return "\t";
  return ",";
}

export function parseBarcodeMappingCsv(text: string): BarcodeCsvParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { ok: false, mappings: [], errors: ["En az bir başlık satırı ve bir veri satırı gerekli."] };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const headers = lines[0]!.split(delimiter).map(normalizeHeader);

  const skuIdx = headers.findIndex((h) =>
    ["sku", "stok_kodu", "stok_kod", "urun_kodu", "stock_code"].includes(h),
  );
  const barcodeIdx = headers.findIndex((h) =>
    ["barcode", "barkod", "ean", "gtin", "ean13"].includes(h),
  );

  if (skuIdx < 0 || barcodeIdx < 0) {
    return {
      ok: false,
      mappings: [],
      errors: ["CSV'de SKU ve barkod sütunları bulunamadı (sku, barkod / ean / gtin)."],
    };
  }

  const mappings: BarcodeMapping[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(delimiter);
    const sku = (cols[skuIdx] ?? "").trim();
    const barcode = (cols[barcodeIdx] ?? "").trim().replace(/\s/g, "");
    if (!sku || !barcode) {
      errors.push(`Satır ${i + 1}: SKU veya barkod boş — atlandı.`);
      continue;
    }
    if (seen.has(sku)) continue;
    seen.add(sku);
    mappings.push({ sku, barcode });
  }

  if (mappings.length === 0) {
    return { ok: false, mappings: [], errors: [...errors, "Geçerli eşleşme bulunamadı."] };
  }

  return { ok: true, mappings, errors };
}
