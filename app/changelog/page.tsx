import type { ReactNode } from "react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Reveal } from "@/components/reveal";
import { SITE_NAME } from "@/lib/seo";

export const metadata = {
  title: `Değişiklik Günlüğü · ${SITE_NAME}`,
  description: `${SITE_NAME}'e eklenen yeni özellikler, düzeltmeler ve iyileştirmelerin geçmişi.`,
};

type Kind = "feature" | "fix" | "improvement";

interface Entry {
  date: string; // YYYY-MM-DD
  kind: Kind;
  title: string;
  body: string;
}

// Gerçek, bu üründe fiilen yapılmış değişiklikler — pazarlama amaçlı uydurma
// madde eklenmez. Yeni bir sürüm yayınlandığında en üste yeni bir Entry eklenir.
const ENTRIES: Entry[] = [
  {
    date: "2026-09-16",
    kind: "feature",
    title: "Hakediş mutabakatı — gerçek tutar girişi",
    body:
      "Artık pazaryerinden gelen gerçek hakediş/ödeme tutarınızı girebiliyorsunuz. TrueMargin bunu, kendi hesapladığı beklenen tutarla karşılaştırıp gerçek bir fark (mutabakat) gösteriyor — önceden bu alan yalnızca temsili bir modele dayanıyordu.",
  },
  {
    date: "2026-09-16",
    kind: "feature",
    title: "Ekip erişimi (salt-okunur davet)",
    body:
      "Hesap sahipleri artık Ayarlar'dan e-posta ile ekip arkadaşı davet edebiliyor. Davet edilen kişi kendi hesabıyla giriş yaptığında, sahibinin verilerini salt-okunur olarak görüntüleyebiliyor.",
  },
  {
    date: "2026-09-16",
    kind: "feature",
    title: "Haftalık kâr özeti e-postası",
    body:
      "İsteğe bağlı olarak her hafta, gerçek marjınızı, en çok zarar eden ürünlerinizi ve hakediş durumunuzu özetleyen bir e-posta alabilirsiniz. Ayarlar'dan açıp kapatabilirsiniz.",
  },
  {
    date: "2026-09-16",
    kind: "feature",
    title: "Excel/CSV rapor dışa aktarma",
    body:
      "Ürün bazlı kârlılık tablosunu tek tıkla, Türkçe Excel ile uyumlu bir CSV dosyası olarak indirebiliyorsunuz.",
  },
  {
    date: "2026-09-16",
    kind: "improvement",
    title: "Yeni hesaplar için başlangıç kontrol listesi",
    body:
      "Panelde, hesabınızı tam olarak kullanmaya başlamanız için gereken adımları gösteren bir ilerleme çubuğu eklendi (pazaryeri bağlama, ilk veri, hakediş girişi gibi).",
  },
  {
    date: "2026-09-12",
    kind: "fix",
    title: "Demo modu kaldırıldı",
    body:
      "Gerçek verisi olmayan bir hesapta sahte pazaryeri sekmeleri veya anlamsız deneme-süresi rozetleri gösterilmiyor artık — herkes yalnızca kendi gerçek verisini görüyor.",
  },
  {
    date: "2026-09-12",
    kind: "fix",
    title: "Başabaş fiyatı hesaplama hatası",
    body:
      "Birden fazla ürün satan hesaplarda başabaş fiyatı, toplam ciro üzerinden değil doğru şekilde birim başına hesaplanacak şekilde düzeltildi.",
  },
  {
    date: "2026-09-12",
    kind: "fix",
    title: "Sahte veri güvenliği",
    body:
      "Bağlı olmayan pazaryerleri için artık hesabınıza hiçbir örnek/sahte işlem yazılmıyor; her sayı gerçek verinize dayanıyor.",
  },
];

const KIND_LABEL: Record<Kind, string> = {
  feature: "Yeni özellik",
  fix: "Düzeltme",
  improvement: "İyileştirme",
};

const KIND_CLASS: Record<Kind, string> = {
  feature: "border-[var(--tm-copper)]/40 text-[var(--tm-copper)]",
  fix: "border-red-500/30 text-red-400",
  improvement: "border-zinc-600/40 text-zinc-400",
};

function Badge({ kind }: { kind: Kind }): ReactNode {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest shrink-0 ${KIND_CLASS[kind]}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

export default function ChangelogPage() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-3xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--tm-copper)]">Keşfet</p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground">
            Değişiklik Günlüğü
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            TrueMargin&apos;e eklenen yeni özellikler ve düzeltmelerin gerçek, güncel listesi. Uydurma bir
            &ldquo;sürüm notları&rdquo; değil — burada yalnızca ürüne fiilen eklenmiş değişiklikler yer alır.
          </p>
        </Reveal>

        <div className="mt-14 space-y-10">
          {ENTRIES.map((e, i) => (
            <Reveal key={`${e.date}-${i}`}>
              <div className="border-l border-border pl-6">
                <div className="flex flex-wrap items-center gap-3">
                  <time className="text-xs font-mono tabular-nums text-muted-foreground">{e.date}</time>
                  <Badge kind={e.kind} />
                </div>
                <h2 className="mt-2 font-heading text-lg font-semibold tracking-tight text-foreground">
                  {e.title}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{e.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </MarketingPage>
  );
}
