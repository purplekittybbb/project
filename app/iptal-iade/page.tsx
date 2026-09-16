import type { ReactNode } from "react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Reveal } from "@/components/reveal";
import { SITE_NAME } from "@/lib/seo";

export const metadata = {
  title: `İptal ve İade Politikası · ${SITE_NAME}`,
  description: `${SITE_NAME} aboneliğinizi nasıl iptal edebileceğiniz ve iade koşulları.`,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-10">
      <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export default function IptalIadePage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">Keşfet</p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            İptal ve İade Politikası
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Son güncelleme: {new Date().toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <div className="mt-8 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              {SITE_NAME} abonelikleri aylık, otomatik yenilenen bir modelle çalışır. Bu sayfa,
              aboneliğinizi nasıl iptal edeceğinizi ve hangi durumlarda ücret iadesi yapıldığını açıklar.
            </p>
          </div>

          <Section title="1. Ücretsiz deneme">
            <p>
              Yeni hesaplar 30 günlük ücretsiz deneme ile başlar. Deneme süresi boyunca herhangi bir
              ücret talep edilmez ve deneme süresi bitmeden istediğiniz zaman hesabınızı kullanmayı
              bırakabilirsiniz — bir ücretlendirme yapılmamışsa iade edilecek bir tutar da olmaz.
            </p>
          </Section>

          <Section title="2. Aboneliği iptal etme">
            <p>
              Aboneliğinizi Ayarlar → Faturalandırma bölümünden istediğiniz zaman iptal edebilirsiniz.
              İptal ettiğinizde, o anki fatura döneminin sonuna kadar hizmete erişiminiz devam eder;
              bir sonraki dönem için ücretlendirilmezsiniz. İptal, kısmi kullanılan günler için orantılı
              (pro-rata) bir iade doğurmaz.
            </p>
          </Section>

          <Section title="3. İade koşulları">
            <p>
              Zaten tahsil edilmiş bir aylık ücret, kural olarak iade edilmez — çünkü o dönem boyunca
              hizmete erişiminiz açık kalır. Şu istisnalarda tam iade yaparız:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sizin hesabınızdan kaynaklanmayan bir hata nedeniyle mükerrer (aynı dönem için iki kez) ücretlendirme yapılmışsa.</li>
              <li>Hizmet, ödeme alınan dönemin tamamında bizim tarafımızdan kaynaklanan bir teknik arıza nedeniyle kullanılamaz durumdaysa.</li>
            </ul>
            <p>
              İade talebiniz varsa, ödeme tarihinden itibaren 14 gün içinde aşağıdaki iletişim adresinden
              bize ulaşın; talebinizi değerlendirip 5 iş günü içinde dönüş yaparız.
            </p>
          </Section>

          <Section title="4. Ödeme sağlayıcı">
            <p>
              Ödemeler iyzico üzerinden, kart bilgileriniz hiçbir zaman bizim sunucularımızda
              saklanmadan işlenir. İade işlemi de aynı ödeme yöntemine, iyzico üzerinden yapılır ve
              bankanıza yansıması birkaç iş günü sürebilir.
            </p>
          </Section>

          <Section title="5. İletişim">
            <p>
              İptal veya iade talepleriniz için: <strong>destek@truemargin.app</strong>
            </p>
          </Section>
        </Reveal>
      </section>
    </MarketingPage>
  );
}
