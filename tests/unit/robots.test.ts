import { describe, expect, it } from 'vitest';
import { GET } from '../../src/pages/robots.txt';

function call(url: string) {
  return GET({ request: new Request(url) } as Parameters<typeof GET>[0]);
}

describe('robots.txt route', () => {
  it('allows crawling and lists the sitemap on the canonical host', async () => {
    const res = await call('https://fastestads.com/robots.txt');
    const body = await res.text();
    expect(body).toContain('Allow: /');
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('Sitemap: https://fastestads.com/sitemap-index.xml');
  });

  it('disallows everything on any other host (previews)', async () => {
    for (const host of ['fastestads.workers.dev', 'localhost:4321', '127.0.0.1:4399']) {
      const res = await call(`https://${host}/robots.txt`);
      const body = await res.text();
      expect(body).toBe('User-agent: *\nDisallow: /\n');
    }
  });
});
