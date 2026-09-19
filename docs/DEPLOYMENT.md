# Deployment

FastestAds deploys to Cloudflare Workers with Workers Static Assets.

## One-time setup

```bash
wrangler login
wrangler secret put TYPESAFE_API_KEY   # Jev credential — never in vars, never committed
```

Non-secret configuration lives in `wrangler.jsonc` `vars` (`SITE_URL`, `TYPESAFE_BASE_URL`,
`TYPESAFE_MODEL`). Optional public flags `PUBLIC_CF_BEACON_TOKEN` and `PUBLIC_ADS_ENABLED` can be
added there too — anything `PUBLIC_*` is bundled into client code, so only put public values in.

## Deploy

```bash
pnpm build
wrangler deploy
```

## Production hardening

For the production `fastestads.com` service:

- Set `workers_dev: false` and `preview_urls: false` in `wrangler.jsonc` so the app is only
  reachable on the custom domain.
- Route the custom domain in the Cloudflare dashboard (Workers → Triggers → Custom Domains).
- `SITE_URL` must equal the canonical origin — `robots.txt`, canonical links, sitemap URLs and
  JSON-LD all derive from it.

## Preview protection

Any host that is not `new URL(SITE_URL).host` is treated as a preview:

- `GET /robots.txt` returns `User-agent: *\nDisallow: /` (the canonical host gets the allow-all
  file with `Disallow: /api/` and the sitemap reference).
- The API always sends `X-Robots-Tag: noindex`.

This keeps workers.dev and staging URLs out of indexes without extra configuration.

## Ads readiness

`src/components/AdSlot.astro` renders reserved containers only when `PUBLIC_ADS_ENABLED === 'true'`.
**Do not enable ads until a consent-management platform (CMP) covering ad personalization is
integrated** — the slots are placeholders, not an ad-network integration.

## Secrets inventory

| Secret             | Storage                         | Used by                                           |
| ------------------ | ------------------------------- | ------------------------------------------------- |
| `TYPESAFE_API_KEY` | `wrangler secret` / `.dev.vars` | `src/server/jev/client.ts` `Authorization` header |

There are no other credentials. `pnpm test:build` asserts no secret value or upstream URL reaches
`dist/client`.
