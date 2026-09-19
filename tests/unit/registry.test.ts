import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLS, getTool, liveTools, relatedLive } from '@core/tools/registry';

const PAGES_TOOLS_DIR = join(import.meta.dirname, '../../src/pages/tools');

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

  it('live tools carry path, seo, breadcrumb and content metadata', () => {
    for (const tool of liveTools()) {
      expect(tool.path, tool.slug).toBe(`/tools/${tool.slug}/`);
      expect(tool.seo?.title, tool.slug).toBeTruthy();
      expect(tool.seo?.description, tool.slug).toBeTruthy();
      expect(tool.seo!.description.length).toBeGreaterThanOrEqual(70);
      expect(tool.seo!.description.length).toBeLessThanOrEqual(160);
      expect(tool.seo!.title.length).toBeLessThanOrEqual(60);
      expect(tool.breadcrumb?.length, tool.slug).toBeGreaterThan(1);
      expect(tool.content?.lastReviewed, tool.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('every live tool has a page file', () => {
    for (const tool of liveTools()) {
      const page = join(PAGES_TOOLS_DIR, tool.slug, 'index.astro');
      expect(existsSync(page), `${tool.slug} missing ${page}`).toBe(true);
    }
  });

  it('every page under src/pages/tools/ belongs to a live tool', () => {
    const dirs = readdirSync(PAGES_TOOLS_DIR).filter((name) =>
      statSync(join(PAGES_TOOLS_DIR, name)).isDirectory(),
    );
    const liveSlugs = new Set(liveTools().map((t) => t.slug));
    for (const dir of dirs) {
      expect(liveSlugs.has(dir), `${dir} has a page but is not a live tool`).toBe(true);
    }
  });

  it('relatedLive returns only live related tools', () => {
    const tool = getTool('google-ads-headline-checker')!;
    expect(relatedLive(tool)).toHaveLength(0); // all related tools are planned
  });
});
