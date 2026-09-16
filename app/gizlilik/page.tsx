import type { ReactNode } from "react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Reveal } from "@/components/reveal";
import { SITE_NAME, siteOrigin } from "@/lib/seo";

export const metadata = {
  title: `Gizlilik Politikası · ${SITE_NAME}`,
  description:
    `${SITE_NAME} web uygulaması ve Chrome uzantısının hangi verileri topladığı, nasıl kullandığı ve nasıl sakladığı.`,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-10">
      <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export default function GizlilikPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">
            Keşfet
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            Gizlilik Politikası
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Son güncelleme: {new Date().toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <div className="mt-8 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              {`Bu sayfa hem ${SITE_NAME} web uygulamasını hem de "TrueMargin Asistan" Chrome uzantısını kapsar. Amacımız net: yalnızca sizin kendi mağaza verinizi işleriz, hiçbir zaman rakip verisi toplamayız ve topladığımız her veriyi neden topladığımızı burada açıkça yazıyoruz.`}
            </p>
          </div>

          <Section title="1. Web uygulamasında hangi verileri topluyoruz">
            <p>
              Hesap oluşturduğunuzda e-posta adresinizi ve şifrenizin hash&apos;ini (asla düz metin
              olarak değil) saklarız. Bir pazaryeri hesabını bağladığınızda, o pazaryerinin size
              verdiği API anahtarı/token&apos;ı şifrelenmiş olarak saklarız — yalnızca sizin siparişlerinizi
              ve ürün verilerinizi okumak için kullanılır.
            </p>
            <p>
              Kayıt olmadan kullandığınız misafir araçları (Net Kâr Hesaplama, Görünürlük Tespiti vb.)
              için yalnızca kötüye kullanımı önlemek amacıyla IP bazlı, geçici bir sorgu sayacı tutulur;
              kimliğinizle ilişkilendirilmez.
            </p>
          </Section>

          <Section title="2. Chrome uzantısı ne okur, ne göndermez">
            <p>
              Uzantı yalnızca <strong>partner.trendyol.com</strong>, <strong>partner.hepsiburada.com</strong> ve{" "}
              <strong>so.n11.com</strong> adreslerinde çalışır. Bu sayfalarda, o an baktığınız ürünün{" "}
              <strong>kendi</strong> satış fiyatını, ürün adını ve barkodunu okumayı dener (best-effort —
              panel arayüzü değişirse sessizce boş döner, asla uydurma bir değer göstermez).
            </p>
            <p>
              {`Uzantı; rakip fiyatlarını kazımaz, üçüncü taraf hesaplara erişmez ve arka planda otomatik hiçbir ağ isteği göndermez. Yalnızca siz popup'ta "Hesaptan Getir"e bastığınızda ve hesabınızı bağladığınızda, kendi hesabınızdaki kendi verinizi eşleştirmek için ${SITE_NAME} sunucusuna (${siteOrigin()}/api/extension/lookup) tek bir istek gönderilir.`}
            </p>
            <p>
              Hesabı bağlarken oluşturduğunuz kişisel token yalnızca cihazınızdaki{" "}
              <code className="rounded bg-secondary px-1 py-0.5 text-[13px]">chrome.storage.local</code>&apos;da
              tutulur; sunucu tarafında yalnızca bu token&apos;ın SHA-256 özeti saklanır, ham token hiçbir
              zaman kaydedilmez.
            </p>
          </Section>

          <Section title="3. Verilerinizi kimlerle paylaşırız">
            <p>
              Verilerinizi reklam amacıyla satmayız veya üçüncü taraflarla paylaşmayız. Ödeme işlemleri
              iyzico üzerinden, barındırma Vercel ve Supabase altyapısı üzerinden yürütülür — bu
              sağlayıcılar yalnızca hizmeti çalıştırmak için gereken asgari veriyi işler.
            </p>
          </Section>

          <Section title="4. Verilerinizi silme hakkınız">
            <p>
              Hesabınızı ve bağlı mağaza verilerinizi dashboard üzerinden istediğiniz zaman silebilir,
              Chrome uzantısını hesabınızdan &quot;Bağlantıyı Kes&quot; ile ayırabilirsiniz. Tam hesap
              silme talebi için bizimle iletişime geçebilirsiniz.
            </p>
          </Section>

          <Section title="5. KVKK kapsamındaki haklarınız">
            <p>
              6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında veri sorumlusu
              sıfatıyla; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin
              bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,
              yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse
              düzeltilmesini isteme, KVKK madde 7&apos;de öngörülen şartlar çerçevesinde silinmesini/yok
              edilmesini isteme ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme
              haklarına sahipsiniz (KVKK madde 11). Bu haklarınızı kullanmak için aşağıdaki iletişim
              kanalından bize ulaşabilirsiniz.
            </p>
          </Section>

          <Section title="6. İletişim">
            <p>
              Gizlilikle ve KVKK başvurularıyla ilgili sorularınız için: <strong>destek@truemargin.app</strong>
            </p>
          </Section>
        </Reveal>
      </section>
    </MarketingPage>
  );
}
