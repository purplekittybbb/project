/**
 * Skeleton — PDF §2 yükleme iskeleti.
 *
 * Boş bir "Yükleniyor…" metni yerine, gelecek içeriğin biçimini shimmer ile
 * önceden gösterir (algılanan hız + güven artar). Stil `globals.css` → .tm-skeleton.
 */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`tm-skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Hazır blok: birkaç satırlık metin iskeleti. */
export function SkeletonLines({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`} role="status" aria-label="Yükleniyor">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}
