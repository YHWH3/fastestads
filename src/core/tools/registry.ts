import type { Platform, SourceRef } from '../platform/types';
import { SOURCES as GOOGLE_ADS_SOURCES } from '../platforms/google-ads/spec';

export type ToolCategory = 'copy-checker' | 'calculator' | 'utility';
export type ToolStatus = 'live' | 'planned';

export interface ToolDefinition {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  category: ToolCategory;
  platform?: Platform;
  status: ToolStatus;
  /** Canonical route path with trailing slash. Required for live tools. */
  path?: string;
  /** Page title/description for SEO. Required for live tools. */
  seo?: { title: string; description: string };
  /** Visible breadcrumb items (last item = current page, no path needed). */
  breadcrumb?: Array<{ label: string; path?: string }>;
  /** Editorial metadata for the content on the tool page. */
  content?: { lastReviewed: string };
  /** Slugs of related tools. */
  related: string[];
  sources?: SourceRef[];
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    slug: 'google-ads-headline-checker',
    name: 'Google Ads Headline Checker',
    shortName: 'Headline Checker',
    description:
      'Check Google Ads headlines and ad copy against RSA limits, editorial policies, and best practices before you publish.',
    category: 'copy-checker',
    platform: 'google-ads',
    status: 'live',
    path: '/tools/google-ads-headline-checker/',
    seo: {
      title: 'Google Ads Headline Checker — Free RSA Copy Check',
      description:
        'Check Google Ads headlines and descriptions against RSA limits and editorial rules, with a semantic quality review. Free, private, no sign-up.',
    },
    breadcrumb: [
      { label: 'Home', path: '/' },
      { label: 'Tools', path: '/tools/' },
      { label: 'Headline Checker' },
    ],
    content: { lastReviewed: '2026-09-19' },
    related: [
      'cpm-calculator',
      'responsive-search-ad-checker',
      'google-ads-description-checker',
      'ad-copy-character-counter',
    ],
    sources: [GOOGLE_ADS_SOURCES.rsaSpec, GOOGLE_ADS_SOURCES.editorial],
  },
  {
    slug: 'cpm-calculator',
    name: 'CPM Calculator',
    shortName: 'CPM Calc',
    description:
      'Calculate cost per thousand impressions from spend and impressions — or solve backwards — plus derived CPC, CTR, CPA and ROAS.',
    category: 'calculator',
    status: 'live',
    path: '/tools/cpm-calculator/',
    seo: {
      title: 'CPM Calculator — Free Cost Per Mille Solver',
      description:
        'Free CPM calculator: enter any two of ad spend, impressions and CPM to get the third, plus CPC, CTR, CPA and ROAS. Instant, private, no sign-up.',
    },
    breadcrumb: [
      { label: 'Home', path: '/' },
      { label: 'Tools', path: '/tools/' },
      { label: 'CPM Calculator' },
    ],
    content: { lastReviewed: '2026-09-19' },
    related: ['google-ads-headline-checker', 'roas-calculator', 'cpc-calculator'],
    sources: [
      {
        label: 'Google Ads Help — Cost-per-thousand impressions (CPM): Definition',
        url: 'https://support.google.com/google-ads/answer/6310',
        lastVerified: '2026-09-19',
      },
      {
        label: 'Google Ads Help — Media purchase options on the Display Network',
        url: 'https://support.google.com/google-ads/answer/172621',
        lastVerified: '2026-09-19',
      },
    ],
  },
  {
    slug: 'google-ads-description-checker',
    name: 'Google Ads Description Checker',
    shortName: 'Description Checker',
    description:
      'Validate Google Ads descriptions against the 90-character limit and editorial rules.',
    category: 'copy-checker',
    platform: 'google-ads',
    status: 'planned',
    related: ['google-ads-headline-checker', 'responsive-search-ad-checker'],
  },
  {
    slug: 'responsive-search-ad-checker',
    name: 'Responsive Search Ad Checker',
    shortName: 'RSA Checker',
    description:
      'Check a full responsive search ad — headlines, descriptions, and paths — against every Google Ads requirement.',
    category: 'copy-checker',
    platform: 'google-ads',
    status: 'planned',
    related: ['google-ads-headline-checker', 'google-ads-description-checker'],
  },
  {
    slug: 'ad-copy-character-counter',
    name: 'Ad Copy Character Counter',
    shortName: 'Character Counter',
    description:
      'Count ad copy characters the way Google does, including double-width CJK characters.',
    category: 'utility',
    status: 'planned',
    related: ['google-ads-headline-checker'],
  },
  {
    slug: 'roas-calculator',
    name: 'ROAS Calculator',
    shortName: 'ROAS Calc',
    description: 'Calculate return on ad spend from revenue and ad cost.',
    category: 'calculator',
    status: 'planned',
    related: ['cpm-calculator', 'cpc-calculator'],
  },
  {
    slug: 'cpc-calculator',
    name: 'CPC Calculator',
    shortName: 'CPC Calc',
    description: 'Calculate cost per click from spend and click counts.',
    category: 'calculator',
    status: 'planned',
    related: ['cpm-calculator', 'roas-calculator'],
  },
  {
    slug: 'utm-builder',
    name: 'UTM Builder',
    shortName: 'UTM Builder',
    description: 'Build campaign URLs with utm_source, utm_medium, and utm_campaign parameters.',
    category: 'utility',
    status: 'planned',
    related: ['google-ads-headline-checker'],
  },
  {
    slug: 'meta-ad-copy-checker',
    name: 'Meta Ad Copy Checker',
    shortName: 'Meta Checker',
    description: 'Check Facebook and Instagram ad copy against Meta field limits and policies.',
    category: 'copy-checker',
    status: 'planned',
    related: ['google-ads-headline-checker'],
  },
];

const BY_SLUG: ReadonlyMap<string, ToolDefinition> = new Map(
  TOOLS.map((tool) => [tool.slug, tool]),
);

export function liveTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.status === 'live');
}

export function getTool(slug: string): ToolDefinition | undefined {
  return BY_SLUG.get(slug);
}

/** Related tools that are live — planned tools are never linked. */
export function relatedLive(tool: ToolDefinition): ToolDefinition[] {
  return tool.related
    .map((slug) => BY_SLUG.get(slug))
    .filter((t): t is ToolDefinition => t !== undefined && t.status === 'live');
}
