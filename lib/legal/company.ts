/**
 * Şirket / yasal bilgiler — TEK KAYNAK.
 *
 * PDF §2 (Fogg web güvenilirliği): "gerçek ve dürüst insanların olduğunu fiziksel
 * adresler ve iletişim bilgileriyle kanıtlamak" güveni doğrudan artırır.
 *
 * ÖNEMLİ: Gerçek tüzel kişilik bilgileri buraya girilene kadar alanlar BOŞ
 * bırakılır. Sahte bir MERSİS/vergi no/adres yazmak, hiç yazmamaktan daha büyük
 * bir güven (ve yasal) ihlalidir. Bu yüzden boş alanlar arayüzde GÖSTERİLMEZ;
 * buraya gerçek değerleri yazdığın an footer ve Hakkımızda sayfasında otomatik
 * olarak görünürler. Sadece aşağıdaki tırnak içlerini doldurman yeterli.
 */
export interface CompanyInfo {
  /** Ticaret unvanı (örn. "Örnek Yazılım A.Ş.") */
  legalName: string;
  /** Açık adres */
  address: string;
  /** MERSİS numarası */
  mersisNo: string;
  /** Vergi dairesi */
  taxOffice: string;
  /** Vergi numarası */
  taxNo: string;
  /** Destek / KVKK e-postası */
  email: string;
  /** Telefon (opsiyonel) */
  phone: string;
}

export const COMPANY_INFO: CompanyInfo = {
  legalName: "",
  address: "",
  mersisNo: "",
  taxOffice: "",
  taxNo: "",
  email: "destek@truemargin.app",
  phone: "",
};

/** Doldurulmuş (boş olmayan) yasal alanları etiketleriyle döndürür. */
export function filledCompanyFields(): { label: string; value: string }[] {
  return [
    { label: "Ticaret unvanı", value: COMPANY_INFO.legalName },
    { label: "Adres", value: COMPANY_INFO.address },
    { label: "MERSİS No", value: COMPANY_INFO.mersisNo },
    { label: "Vergi dairesi", value: COMPANY_INFO.taxOffice },
    { label: "Vergi No", value: COMPANY_INFO.taxNo },
    { label: "Telefon", value: COMPANY_INFO.phone },
  ].filter((r) => r.value.trim().length > 0);
}

/** Footer için tek satırlık yasal özet — yalnızca ilgili alanlar doluysa. */
export function companyFooterLine(): string {
  const parts = [COMPANY_INFO.legalName, COMPANY_INFO.mersisNo ? `MERSİS: ${COMPANY_INFO.mersisNo}` : ""].filter(
    (p) => p.trim().length > 0,
  );
  return parts.join(" · ");
}
