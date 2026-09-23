/**
 * Müşteri referansları / yorumları — TEK KAYNAK.
 *
 * TEMP: Aşağıdaki kayıtlar görsel mock'tur (kullanıcı isteği — sonra gerçek/
 * izinli yorumlarla değiştirilecek). Gerçek veri gelince PLACEHOLDER_*
 * girdilerini silip yalnızca izinli yorum bırak.
 *
 * Eklemek için:
 *   { name: "Ahmet Y.", role: "Trendyol satıcısı · Elektronik", quote: "…", initials: "AY" }
 */
export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  initials?: string;
}

/** TODO(replace): gerçek izinli yorumlarla değiştir; uydurma satırları sil. */
export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Elif K.",
    role: "Trendyol satıcısı · Ev & Yaşam",
    quote:
      "Panelde kârlı sandığım üç SKU aslında zarardaymış. TrueMargin göstermeseydi aynı fiyatla devam edecektim.",
    initials: "EK",
  },
  {
    name: "Mert A.",
    role: "Hepsiburada + N11 · Elektronik",
    quote:
      "İki pazaryerini bağladım; komisyon ve iade düşülmüş net kârı tek ekranda görüyorum. Excel’i bıraktım.",
    initials: "MA",
  },
  {
    name: "Selin Y.",
    role: "Shopify + Trendyol · Moda",
    quote:
      "Başabaş fiyatı net olunca kampanya indiriminde artık körlemesine gitmiyorum. İlk ay sessiz zararlar kapandı.",
    initials: "SY",
  },
];
