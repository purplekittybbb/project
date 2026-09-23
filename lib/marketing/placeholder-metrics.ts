/**
 * TEMP PLACEHOLDER — görsel mock sosyal kanıt / büyüme metrikleri.
 *
 * ⚠️ KAPATILDI (2026-09): Bu metrikler UYDURMA (₺2,4M ARR, 420+ satıcı vb.) ve
 * landing'de hero altında, "Yatırımcı diligence" linkinin yanında görünüyordu.
 * Reklamdan gelen gerçek satıcılara yanıltıcı reklam + yatırımcı diligence'ında
 * yakalanınca güveni bitiren bir risk olduğu için (ve projenin sahte-veri
 * göstermeme ilkesine aykırı) yayından kaldırıldı. Yapı ve örnek değerler
 * aşağıda duruyor: GERÇEK ve doğrulanabilir ARR/GMV/satıcı sayısı olduğunda
 * bu bayrağı true yapıp değerleri gerçek verilerle güncelle — uydurma değil.
 *
 * TODO(replace): gerçek metrikleri bağla; gerçek veri yoksa bu bayrak false kalsın.
 */
export const PLACEHOLDER_METRICS_ACTIVE = false;

export const PLACEHOLDER_METRICS = {
  /** Görünen ARR (yıllık yinelenen gelir) — TEMP */
  arrLabel: "₺2,4M",
  arrHint: "Yıllık yinelenen gelir (ARR)",
  /** Pazaryeri sipariş GMV kapsamı — TEMP */
  gmvLabel: "₺180M+",
  gmvHint: "Bağlı mağaza GMV kapsamı",
  /** Aktif satıcı / mağaza — TEMP */
  sellersLabel: "420+",
  sellersHint: "Aktif satıcı hesabı",
  /** Ortalama marj görünürlüğü kazanımı — TEMP */
  marginDeltaLabel: "+8,2 puan",
  marginDeltaHint: "Ort. gerçek marj farkı",
} as const;
