import type { PlatformDefinition } from '../../platform/types';
import { countedLength } from '../../text';
import { FIELD_LIMITS, SOURCES } from './spec';
import { limitRules } from './rules/limits';
import { duplicateRules } from './rules/duplicates';
import { editorialRules } from './rules/editorial';
import { keywordRules } from './rules/keyword';
import { bestPracticeRules } from './rules/bestPractice';

export const googleAdsRsa: PlatformDefinition = {
  platform: 'google-ads',
  format: 'rsa',
  label: 'Google Ads · Responsive search ad',
  fields: FIELD_LIMITS,
  countedLength: (s) => countedLength(s, 'google-ads'),
  sources: SOURCES,
  rules: [
    ...limitRules,
    ...duplicateRules,
    ...editorialRules,
    ...keywordRules,
    ...bestPracticeRules,
  ],
};

export { SOURCES, FIELD_LIMITS, LAST_VERIFIED } from './spec';
