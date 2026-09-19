import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Canonical-host robots.txt. Any other host (workers.dev previews, staging
 * domains) gets a disallow-all file so previews are never indexed.
 */
const SITE = import.meta.env.SITE ?? 'https://fastestads.com';

export const GET: APIRoute = ({ request }) => {
  const siteHost = new URL(SITE).host;
  const requestHost = new URL(request.url).host;
  const body =
    requestHost === siteHost
      ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap-index.xml\n`
      : 'User-agent: *\nDisallow: /\n';
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
