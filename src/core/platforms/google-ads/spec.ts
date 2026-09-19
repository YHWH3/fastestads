import type { FieldLimits, SourceRef } from '../../platform/types';

export const LAST_VERIFIED = '2026-09-19';

export const SOURCES = {
  rsaSpec: {
    label: 'Google Ads Help — About responsive search ads',
    url: 'https://support.google.com/google-ads/answer/7684791',
    lastVerified: LAST_VERIFIED,
  },
  editorial: {
    label: 'Google Ads Policy — Editorial overview',
    url: 'https://support.google.com/adspolicy/answer/6021546',
    lastVerified: LAST_VERIFIED,
  },
  punctuation: {
    label: 'Google Ads Policy — Punctuation and symbols',
    url: 'https://support.google.com/adspolicy/answer/14847994',
    lastVerified: LAST_VERIFIED,
  },
  capitalization: {
    label: 'Google Ads Policy — Capitalization',
    url: 'https://support.google.com/adspolicy/answer/14848295',
    lastVerified: LAST_VERIFIED,
  },
  repetition: {
    label: 'Google Ads Policy — Repetition',
    url: 'https://support.google.com/adspolicy/answer/14848296',
    lastVerified: LAST_VERIFIED,
  },
  spacing: {
    label: 'Google Ads Policy — Spacing',
    url: 'https://support.google.com/adspolicy/answer/14848500',
    lastVerified: LAST_VERIFIED,
  },
  phone: {
    label: 'Google Ads Policy — Phone numbers in ad text',
    url: 'https://support.google.com/adspolicy/answer/14848200',
    lastVerified: LAST_VERIFIED,
  },
} satisfies Record<string, SourceRef>;

export const FIELD_LIMITS: Record<'headline' | 'description' | 'path', FieldLimits> = {
  headline: { min: 3, max: 15, maxChars: 30, nearThreshold: 3 },
  description: { min: 2, max: 4, maxChars: 90, nearThreshold: 8 },
  path: { min: 0, max: 2, maxChars: 15, nearThreshold: 2 },
};
