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
    name: "Ev & Yaşam senaryosu",
    role: "Trendyol · temsili",
    quote:
      "Panelde kârlı görünen üç ürün, komisyon ve iade sonrası zararda kalabilir. Bunu satır satır görmeden aynı fiyatla devam etmek yaygın bir hata.",
    initials: "EY",
  },
  {
    name: "Çoklu pazaryeri senaryosu",
    role: "Hepsiburada + N11 · temsili",
    quote:
      "İki kanalı bağlayınca komisyon ve iade düşülmüş net kâr tek ekranda durur. Excel’de kaybolan fark burada görünür.",
    initials: "ÇP",
  },
  {
    name: "Kampanya senaryosu",
    role: "Trendyol · temsili",
    quote:
      "Başabaş fiyatı net olunca indirimde körlemesine gitmek zorlaşır. Sessiz zarar, kampanya bitmeden yakalanır.",
    initials: "KA",
  },
];
