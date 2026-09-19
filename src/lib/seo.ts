import type { ToolDefinition } from '../core/tools/registry';

/** Absolute canonical URL for a site-relative path. */
export function canonicalFor(path: string): string {
  return new URL(path, import.meta.env.SITE).toString();
}

export function toolMeta(tool: ToolDefinition): {
  title: string;
  description: string;
  canonical: string;
} {
  return {
    title: tool.seo?.title ?? `${tool.name} — FastestAds`,
    description: tool.seo?.description ?? tool.description,
    canonical: canonicalFor(tool.path ?? `/tools/${tool.slug}/`),
  };
}

/** Serialize JSON-LD safely for inline <script> (escapes `<`). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'FastestAds',
    url: canonicalFor('/'),
    publisher: organizationRef(),
  };
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FastestAds',
    url: canonicalFor('/'),
    logo: canonicalFor('/icon-512.png'),
  };
}

function organizationRef(): Record<string, unknown> {
  return { '@type': 'Organization', name: 'FastestAds', url: canonicalFor('/') };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: canonicalFor(item.path),
    })),
  };
}

export function softwareApplicationJsonLd(tool: ToolDefinition): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    description: tool.seo?.description ?? tool.description,
    url: canonicalFor(tool.path ?? `/tools/${tool.slug}/`),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: organizationRef(),
  };
}
