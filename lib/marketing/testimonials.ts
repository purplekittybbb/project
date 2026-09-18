/**
 * Müşteri referansları / yorumları — TEK KAYNAK.
 *
 * PDF §2 (Fogg web güvenilirliği) doğrultusunda gerçek kullanıcı sesi güven verir.
 *
 * ÖNEMLİ — SADECE GERÇEK VE İZİNLİ YORUMLAR:
 * Buraya yalnızca gerçekten bu ürünü kullanan, adının/yorumunun yayınlanmasına
 * İZİN VERMİŞ kişilerin ifadeleri eklenir. Sahte/uydurma referans, sosyal kanıtın
 * en hızlı güven kıran biçimidir (ve yanıltıcıdır). Liste boşken landing'de
 * "Kullananlar ne diyor" bölümü HİÇ görünmez; gerçek yorum ekledikçe otomatik çıkar.
 *
 * Eklemek için aşağıdaki diziye bir nesne ekle:
 *   { name: "Ahmet Y.", role: "Trendyol satıcısı · Elektronik", quote: "…", initials: "AY" }
 */
export interface Testimonial {
  /** Kişinin adı (veya "Ad S." kısaltması, izne göre). */
  name: string;
  /** Rol / bağlam (örn. "Hepsiburada satıcısı · Ev & Yaşam"). */
  role: string;
  /** Gerçek, izinli yorum metni. */
  quote: string;
  /** Avatar yerine baş harfler (opsiyonel; görsel için). */
  initials?: string;
}

export const TESTIMONIALS: Testimonial[] = [
  // Henüz gerçek/izinli yorum yok — eklenene kadar bölüm gizli kalır.
];
