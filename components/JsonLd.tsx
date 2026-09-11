/**
 * Renders one JSON-LD <script type="application/ld+json"> block.
 * Server-safe: no secrets, no user data.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
