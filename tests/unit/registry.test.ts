import { describe, expect, it } from 'vitest';
import { TOOLS, getTool, liveTools } from '@core/tools/registry';

describe('tool registry', () => {
  it('contains exactly one live tool', () => {
    const live = liveTools();
    expect(live).toHaveLength(1);
    expect(live[0].slug).toBe('google-ads-headline-checker');
  });

  it('lists every planned tool from the design', () => {
    const planned = TOOLS.filter((t) => t.status === 'planned').map((t) => t.slug);
    for (const slug of [
      'google-ads-description-checker',
      'responsive-search-ad-checker',
      'ad-copy-character-counter',
      'roas-calculator',
      'cpc-calculator',
      'utm-builder',
      'meta-ad-copy-checker',
    ]) {
      expect(planned).toContain(slug);
    }
  });

  it('has unique slugs', () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every related slug points at a real tool', () => {
    for (const tool of TOOLS) {
      for (const rel of tool.related) {
        expect(getTool(rel), `${tool.slug} -> ${rel}`).toBeDefined();
      }
    }
  });

  it('getTool returns definitions and undefined for unknown slugs', () => {
    const tool = getTool('google-ads-headline-checker');
    expect(tool?.status).toBe('live');
    expect(tool?.platform).toBe('google-ads');
    expect(tool?.category).toBe('copy-checker');
    expect(getTool('does-not-exist')).toBeUndefined();
  });

  it('live tools carry source references', () => {
    for (const tool of liveTools()) {
      expect(tool.sources?.length).toBeGreaterThan(0);
      for (const src of tool.sources ?? []) {
        expect(src.url).toMatch(/^https:\/\//);
        expect(src.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
