import { MarketingPage } from "@/components/marketing/marketing-page";
import { Reveal } from "@/components/reveal";
import { SITE_NAME, MARKETING_MARKETPLACE_LIST_TR } from "@/lib/seo";

export default function HakkimizdaPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
            Keşfet
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            Hakkımızda
          </h1>
          <div className="mt-8 space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              {SITE_NAME}, Türkiye pazaryeri satıcıları için net kâr odaklı analiz araçları sunar.
              {MARKETING_MARKETPLACE_LIST_TR} siparişlerinizden gerçek maliyet düşülmüş kârı
              hesaplar; sessiz zararları erken yakalamanızı hedefler.
            </p>
            <p>
              Ücretsiz araçlarla mağaza bağlamadan keşfedebilir; mağazanızı bağladığınızda SKU
              bazlı net kâr, zarar alarmı, güvenli fiyat ve barkod analizi devreye girer.
            </p>
          </div>

          <div className="mt-12 border-t border-border pt-8">
            <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              İletişim
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Sorularınız, iş birliği talepleriniz veya KVKK başvurularınız için:{" "}
              <strong className="text-foreground">destek@truemargin.app</strong>
            </p>
            {/* TODO(şirket bilgisi): Ticaret unvanı, açık adres ve MERSİS/vergi
                numarası — bu, gerçek tüzel kişilik bilgileri elde edilene kadar
                bilerek boş bırakıldı; sahte bir kayıt numarası veya adres
                yazmak, gerçek şirket bilgisi yazmaktan daha kötü bir güven
                sorunu yaratır. Gerçek bilgiler eklendiğinde bu not silinebilir. */}
          </div>
        </Reveal>
      </section>
    </MarketingPage>
  );
}
