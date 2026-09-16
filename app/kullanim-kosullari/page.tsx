import type { ReactNode } from "react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Reveal } from "@/components/reveal";
import { SITE_NAME } from "@/lib/seo";

export const metadata = {
  title: `Kullanım Koşulları · ${SITE_NAME}`,
  description: `${SITE_NAME} web uygulamasını ve Chrome uzantısını kullanırken geçerli olan koşullar.`,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-10">
      <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export default function KullanimKosullariPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">Keşfet</p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            Kullanım Koşulları
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Son güncelleme: {new Date().toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <div className="mt-8 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              {`${SITE_NAME} web uygulamasını veya "TrueMargin Asistan" Chrome uzantısını kullanarak aşağıdaki koşulları kabul etmiş olursunuz. Kabul etmiyorsanız lütfen hizmeti kullanmayın.`}
            </p>
          </div>

          <Section title="1. Hizmetin tanımı">
            <p>
              {SITE_NAME}, satıcıların pazaryeri satış verilerini (Trendyol, Hepsiburada, N11, Amazon,
              Shopify) işleyerek gerçek net kâr marjını, başabaş fiyatını ve hakediş durumunu hesaplayan
              bir analiz aracıdır. Bir muhasebe, hukuk veya yatırım danışmanlığı hizmeti değildir;
              hesaplanan rakamlar sizin girdiğiniz veya bağladığınız verilere dayanır ve nihai karar
              sorumluluğu size aittir.
            </p>
          </Section>

          <Section title="2. Hesap ve ücretsiz deneme">
            <p>
              Kayıt olduğunuzda 30 günlük ücretsiz deneme süreniz başlar. Deneme süresi boyunca kart
              bilgisi girmeniz zorunlu değildir. Deneme sonrası hizmete devam etmek isterseniz, seçtiğiniz
              plana göre aylık ₺400 (Başlangıç) veya ₺800 (Profesyonel) ücretlendirilirsiniz — bu
              tutarlar KDV hariçtir. Güncel fiyatlar her zaman{" "}
              <a href="/pricing" className="text-foreground underline underline-offset-2">/pricing</a>{" "}
              sayfasında geçerlidir.
            </p>
            <p>
              Hesabınızın güvenliğinden (şifrenizin gizliliği, hesabınızda yapılan işlemler) siz
              sorumlusunuz. Şüpheli bir erişim fark ederseniz bizimle iletişime geçin.
            </p>
          </Section>

          <Section title="3. Kabul edilebilir kullanım">
            <p>
              Hizmeti yalnızca kendi mağaza verinizi analiz etmek için kullanabilirsiniz. Şunları
              yapamazsınız: hizmeti tersine mühendislikle kopyalamak, otomatik araçlarla aşırı yük
              bindirmek, başka bir satıcının hesabına/verisine izinsiz erişmeye çalışmak veya hizmeti
              yasa dışı bir amaçla kullanmak. Bu kurallara aykırı kullanım tespit edilirse hesabınızı
              askıya alabiliriz.
            </p>
          </Section>

          <Section title="4. Bağlı pazaryeri hesapları">
            <p>
              Bir pazaryerini bağladığınızda, o pazaryerinin sağladığı salt-okunur API erişimini
              kullanırız — sipariş vermeyiz, fiyat değiştirmeyiz, ödeme bilgisine erişmeyiz. Bağlantıyı
              istediğiniz zaman Ayarlar sayfasından kesebilirsiniz.
            </p>
          </Section>

          <Section title="5. Sorumluluk sınırı">
            <p>
              Hesaplanan marj, başabaş fiyatı ve hakediş rakamları, size ait veya bağladığınız verilerin
              doğruluğuna bağlıdır — yanlış veya eksik veri yanlış sonuç üretir. {SITE_NAME}, bu
              rakamlara dayanarak alınan ticari kararların sonuçlarından sorumlu tutulamaz. Hizmet
              &quot;olduğu gibi&quot; sunulur; kesintisiz veya hatasız çalışacağı garanti edilmez.
            </p>
          </Section>

          <Section title="6. Değişiklikler">
            <p>
              Bu koşulları zaman zaman güncelleyebiliriz. Önemli değişikliklerde kayıtlı e-posta
              adresinize bilgi veririz. Güncel sürüm her zaman bu sayfada yayındadır.
            </p>
          </Section>

          <Section title="7. İletişim">
            <p>
              Sorularınız için: <strong>destek@truemargin.app</strong>
            </p>
          </Section>
        </Reveal>
      </section>
    </MarketingPage>
  );
}
