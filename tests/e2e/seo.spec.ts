import { test, expect } from '@playwright/test';

const SITE = 'https://fastestads.com';
const TOOL = '/tools/google-ads-headline-checker/';

const ROUTES: Array<{ path: string; types: string[] }> = [
  { path: '/', types: ['WebSite', 'Organization'] },
  { path: '/tools/', types: ['BreadcrumbList'] },
  { path: '/privacy/', types: ['BreadcrumbList'] },
  { path: TOOL, types: ['SoftwareApplication', 'BreadcrumbList'] },
];

const titles = new Set<string>();

test.describe('SEO gates', () => {
  for (const { path, types } of ROUTES) {
    test(`${path}: status, h1, title, description, canonical, JSON-LD`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(page.locator('h1')).toHaveCount(1);

      const title = await page.title();
      expect(title.length).toBeLessThanOrEqual(60);
      expect(titles.has(title), `duplicate title "${title}"`).toBe(false);
      titles.add(title);

      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();
      expect(description!.length).toBeGreaterThanOrEqual(70);
      expect(description!.length).toBeLessThanOrEqual(160);

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBe(`${SITE}${path}`);

      const robotsMeta = page.locator('meta[name="robots"]');
      if ((await robotsMeta.count()) > 0) {
        expect(await robotsMeta.getAttribute('content')).toMatch(/index|follow/);
      }

      const foundTypes: string[] = [];
      const scripts = await page.locator('script[type="application/ld+json"]').all();
      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts) {
        const json = JSON.parse((await script.textContent()) ?? 'null');
        foundTypes.push(json['@type']);
      }
      for (const t of types) {
        expect(foundTypes, `${path} missing JSON-LD ${t}`).toContain(t);
      }
    });
  }

  test('robots.txt responds (disallow-all on preview hosts)', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('User-agent: *');
    // Preview host ≠ SITE_URL host → disallow-all (canonical branch is unit-tested).
    expect(body).toContain('Disallow: /');
  });

  test('sitemap lists the tool page, never /api or 404', async ({ request }) => {
    const index = await (await request.get('/sitemap-index.xml')).text();
    expect(index).toContain('sitemap');
    const sitemapUrl = /https:\/\/fastestads\.com\/sitemap-\d+\.xml/.exec(index)?.[0];
    expect(sitemapUrl).toBeTruthy();
    const path = new URL(sitemapUrl!).pathname;
    const sitemap = await (await request.get(path)).text();
    expect(sitemap).toContain(`${SITE}${TOOL}`);
    expect(sitemap).toContain(`${SITE}/privacy/`);
    expect(sitemap).not.toContain('/api/');
    expect(sitemap).not.toContain('/404');
  });

  test('GET /api/semantic is 405 with X-Robots-Tag: noindex', async ({ request }) => {
    const res = await request.get('/api/semantic');
    expect(res.status()).toBe(405);
    expect(res.headers()['x-robots-tag']).toBe('noindex');
  });

  test('non-trailing-slash tool URL redirects to canonical', async ({ request }) => {
    const res = await request.get('/tools/google-ads-headline-checker', {
      maxRedirects: 0,
    });
    expect([301, 302, 307, 308]).toContain(res.status());
    expect(res.headers()['location']).toMatch(/google-ads-headline-checker\/$/);
  });

  test('unknown route returns 404 status', async ({ request }) => {
    const res = await request.get('/this-page-does-not-exist/');
    expect(res.status()).toBe(404);
  });

  test('tool page raw HTML contains h1, limits table values and inputs before JS', async ({
    request,
  }) => {
    const res = await request.get(TOOL);
    const html = await res.text();
    expect(html).toContain('Google Ads Headline');
    expect(html).toContain('>30<');
    expect(html).toContain('>90<');
    expect((html.match(/<input/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });
});
