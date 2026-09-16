/**
 * PDF/Excel rapor dışa aktarma — client-side CSV üretimi.
 *
 * Neden gerçek .xlsx değil: yeni bir bağımlılık (exceljs/xlsx) eklemeden,
 * Türkçe Excel ile tam uyumlu (noktalı virgül ayraç + UTF-8 BOM, böylece
 * "İ/ı/ş/ğ" karakterleri ve ondalık virgül doğru görünür) bir CSV üretmek
 * hem daha hafif hem de her tarayıcıda ekstra kütüphane gerektirmeden
 * çalışıyor. Excel, Google Sheets ve LibreOffice bu dosyayı doğrudan açar.
 *
 * "PDF" tarafı için ayrı bir rapor üretmiyoruz — tarayıcının kendi
 * "Yazdır → PDF olarak kaydet" özelliği zaten mevcut sayfayı birebir PDF'e
 * çevirir; bunu tekrar icat etmek yerine printExportView() bu akışı tetikler.
 */

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

function csvEscape(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCell(v: string | number): string {
  if (typeof v === "number") {
    // Türkçe Excel ondalık ayracı: virgül. Tamsayıları olduğu gibi bırak.
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
  }
  return csvEscape(v);
}

/** rows'u noktalı-virgül ayraçlı, BOM'lu bir CSV Blob'una çevirir (tr-TR Excel uyumlu). */
export function buildCsv<T>(rows: T[], columns: ExportColumn<T>[]): Blob {
  const lines: string[] = [];
  lines.push(columns.map((c) => csvEscape(c.header)).join(";"));
  for (const row of rows) {
    lines.push(columns.map((c) => formatCell(c.value(row))).join(";"));
  }
  const csv = lines.join("\r\n");
  // UTF-8 BOM: Excel'in Türkçe karakterleri doğru okuması için gerekli.
  return new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
}

/** Bir Blob'u kullanıcının indirilenler klasörüne kaydettirir. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** rows'u doğrudan indirilebilir bir CSV (Excel uyumlu) dosyasına çevirir. */
export function exportRowsAsCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string): void {
  const blob = buildCsv(rows, columns);
  downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportFilename(base: string): string {
  return `truemargin_${base}_${todayStamp()}.csv`;
}
