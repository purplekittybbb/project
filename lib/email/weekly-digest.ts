/**
 * Haftalık kâr özeti — e-posta içeriği üretimi.
 *
 * buildUserSeller/buildSellerView (lib/supabase/user-data.ts, lib/engine.ts)
 * saf fonksiyonlardır — React'e veya tarayıcı istemcisine bağımlı değildir,
 * bu yüzden cron rotasında (service-role ile okunan satırlardan) doğrudan
 * kullanılabilirler. Bu dosya, o SellerView çıktısını gerçek bir e-posta
 * gövdesine çevirir. Hiçbir sayı uydurulmaz — hepsi kullanıcının kendi
 * işlem verisinden hesaplanır.
 */

import type { SellerView } from "../engine";

function money(v: number, currency = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

function pct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export interface DigestInput {
  sellerLabel: string;
  view: SellerView;
  dashboardUrl: string;
}

export function buildDigestSubject(input: DigestInput): string {
  return `Haftalık kâr özetiniz — gerçek marj ${pct(input.view.trueMarginPct)}`;
}

export function buildDigestHtml(input: DigestInput): string {
  const { view, dashboardUrl } = input;
  const topLosers = [...view.silentLosers]
    .sort((a, b) => a.netContribution - b.netContribution)
    .slice(0, 3);

  const loserRows = topLosers.length
    ? topLosers
        .map(
          (s) => `
        <tr>
          <td style="padding:6px 0;color:#3f3f46;font-family:monospace;font-size:13px;">${s.sku}</td>
          <td style="padding:6px 0;color:#dc2626;font-family:monospace;font-size:13px;text-align:right;">${money(s.netContribution)}</td>
        </tr>`
        )
        .join("")
    : `<tr><td style="padding:6px 0;color:#71717a;font-size:13px;">Bu hafta sessiz zarar eden ürün tespit edilmedi.</td></tr>`;

  const s = view.settlement;
  const settlementLine = s.isRealSettlementData
    ? s.hasGap
      ? `${s.marketplaceLabel}, beklenenden ${money(s.gap, view.currency)} eksik ödedi.`
      : `${s.marketplaceLabel} tam mutabık.`
    : `${s.marketplaceLabel} için henüz gerçek hakediş tutarınızı girmediniz — panelden "Hakediş Mutabakatı" bölümüne bakın.`;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#18181b;">
    <h2 style="font-size:18px;margin:24px 0 4px;">Haftalık Kâr Özetiniz</h2>
    <p style="color:#71717a;font-size:13px;margin:0 0 20px;">${input.sellerLabel}</p>

    <div style="border:1px solid #e4e4e7;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin-bottom:6px;">Gerçek Marj</div>
      <div style="font-size:32px;font-family:monospace;color:${view.trueMarginPct >= 0 ? "#16a34a" : "#dc2626"};">${pct(view.trueMarginPct)}</div>
      <div style="font-size:12px;color:#71717a;margin-top:4px;">Algılanan marj: ${pct(view.perceivedMarginPct)}</div>
    </div>

    <div style="border:1px solid #e4e4e7;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin-bottom:8px;">En çok zarar eden ürünler</div>
      <table style="width:100%;border-collapse:collapse;">${loserRows}</table>
    </div>

    <div style="border:1px solid #e4e4e7;padding:16px;margin-bottom:24px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin-bottom:6px;">Hakediş Durumu</div>
      <div style="font-size:13px;color:#3f3f46;">${settlementLine}</div>
    </div>

    <a href="${dashboardUrl}" style="display:inline-block;background:#18181b;color:#fafafa;padding:10px 20px;text-decoration:none;font-size:13px;">Panele git</a>

    <p style="color:#a1a1aa;font-size:11px;margin-top:32px;">
      Bu e-postayı almak istemiyorsanız TrueMargin panelinde Ayarlar → Haftalık özet bölümünden kapatabilirsiniz.
    </p>
  </div>`;
}
