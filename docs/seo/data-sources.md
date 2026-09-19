# First-party SEO & analytics data stack

Purpose: future keyword research and SEO decisions must be grounded in
authoritative first-party data, not web search or LLM estimates.

## Current stack state (2026-09-19)

| Source                       | Status                                                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Search Console        | **Live** — `sc-domain:fastestads.com` domain property, verified owner (DNS TXT)                                                                                       | Immature: site is days old, Pages report "Processing data", 0 discovered pages from sitemap yet. Do not over-read early numbers.                                                                                                                                                                         |
| XML sitemap                  | `https://fastestads.com/sitemap-index.xml` — submitted, **Success**                                                                                                   | Stale `http://www.fastestads.com/sitemap` submission removed 2026-09-19.                                                                                                                                                                                                                                 |
| Google Analytics 4           | **Not created** — `analytics.google.com` unreachable (ERR_CONNECTION_REFUSED, DNS-level block on this network)                                                        | Integration code is shipped and dormant: set `PUBLIC_GA_MEASUREMENT_ID=G-…` (build env / wrangler var) to activate gtag.js site-wide. Then link GA4 → Search Console via GA4 Admin > Product links.                                                                                                      |
| Google Ads / Keyword Planner | **Blocked at onboarding** — CID `957-744-1358` exists but is stuck on forced "Create your first campaign" flow; no Expert Mode link surfaced; observed INR/IST locale | Keyword Planner unreachable until onboarding completes or billing info is added. Stopped before any payment step. No campaigns created, no spend.                                                                                                                                                        |
| Google Trends                | **Working** — authenticated; geo + time-range filters verified; related-queries section present                                                                       | 0–100 relative index, NOT absolute volume. Always anchor comparisons with one known-demand term (e.g. `cpm calculator`).                                                                                                                                                                                 |
| Ahrefs (free AWT)            | **Live** — account via Google OAuth `paulsameasow@gmail.com`; `fastestads.com` verified via GSC import                                                                | Site Explorer, Site Audit, backlinks + organic keywords for the verified site. First audit 2026-09-19: Health 100, 8 URLs, 0 errors, 3 warnings, 9 notices (3XX/HTTP→HTTPS redirects are intentional; structured-data rich-result notices worth a look). Never subscribe to paid plans without approval. |
| Bing Webmaster Tools         | **Live** — signed in via `paulsameasow@gmail.com`; site imported from GSC, auto-verified admin                                                                        | `sitemap-index.xml` submitted manually (GSC import carried 0 sitemaps) — status Success. Data populates up to ~48h. IndexNow available for future use.                                                                                                                                                   |
| Cloudflare Web Analytics     | Supported via `PUBLIC_CF_BEACON_TOKEN` (cookieless) — currently **not set** in the build env, so no beacon renders                                                    | Optional; GA4 is the richer dataset once its console is reachable.                                                                                                                                                                                                                                       |
| DataForSEO                   | User-managed $1 trial — credentials handled outside this repo                                                                                                         | Not configured here by design.                                                                                                                                                                                                                                                                           |

## Data-source hierarchy (use this order)

### Our own real performance

1. **Google Search Console** — queries, impressions, CTR, indexing. The only
   authoritative record of what Google actually showed us for.
2. **GA4** — on-site behavior once installed.
3. **Bing Webmaster Tools** — second engine's view + IndexNow.

### Keyword demand

1. **Google Keyword Planner** — volume ranges + top-of-page bids (once Ads
   onboarding is cleared).
2. **DataForSEO** — volume/CPC via API when the trial credentials arrive.
3. **Google Trends** — relative demand + seasonality + geo. Relative only.
4. **Ahrefs/other secondary tools** — cross-checks.

### Live SERP / competitors

1. **DataForSEO SERP data** — structured page-1 results.
2. **Direct Google SERP inspection** — for shortlisted queries only.
3. Secondary SEO platforms as available.

### Product/platform facts

- Official first-party documentation/APIs are the only authority (Google Ads
  Help, Meta docs, etc.). Store provenance with `lastVerified` in the tool
  registry. Never let LLM estimates overwrite platform facts.

## GA4 activation checklist (when console is reachable)

1. `analytics.google.com` → create GA4 property "FastestAds" → Web stream for
   `https://fastestads.com` → Enhanced Measurement on → copy `G-…` ID.
2. Add `PUBLIC_GA_MEASUREMENT_ID=G-…` to the build environment (Workers Builds
   env or `.dev.vars` locally) and redeploy.
3. GA4 Admin → Product links → Search Console links → link
   `sc-domain:fastestads.com` + the web stream.
4. CSP already allows `googletagmanager.com` / `google-analytics.com`.
   Privacy policy already discloses GA4.
