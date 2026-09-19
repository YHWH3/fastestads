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
    related: [
      'responsive-search-ad-checker',
      'google-ads-description-checker',
      'ad-copy-character-counter',
    ],
    sources: [GOOGLE_ADS_SOURCES.rsaSpec, GOOGLE_ADS_SOURCES.editorial],
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
    related: ['cpc-calculator'],
  },
  {
    slug: 'cpc-calculator',
    name: 'CPC Calculator',
    shortName: 'CPC Calc',
    description: 'Calculate cost per click from spend and click counts.',
    category: 'calculator',
    status: 'planned',
    related: ['roas-calculator'],
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
