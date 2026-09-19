# FastestAds

Fast, privacy-conscious checks for ad copy quality and platform fit. Paste a draft ad, get
deterministic platform-rule checks immediately and an optional semantic quality review powered by
TypeSafe's Jev model — all without storing anything.

**Live tool:** [Google Ads Headline & Ad Copy Checker](https://fastestads.com/tools/google-ads-headline-checker/)

## Stack

- [Astro](https://astro.build) 7 (static output) on Cloudflare Workers via `@astrojs/cloudflare`
- Preact islands (the checker UI is the only client JavaScript)
- Framework-agnostic domain core in `src/core` (no Astro/Preact/zod imports — enforced by ESLint)
- TypeSafe Jev (`POST /v1/systemone`) for semantic evaluation, proxied by `src/server`
- Vitest (unit/integration/build), Playwright + axe-core (e2e/a11y), Lighthouse (perf)

## Local setup

```bash
pnpm install
cp .dev.vars.example .dev.vars   # optional: set TYPESAFE_API_KEY for live semantic calls
pnpm dev
```

Without `TYPESAFE_API_KEY` the API returns `503 not_configured` and the UI shows the honest
fallback state — everything else works.

## Scripts

| Command                                        | What it does                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                                     | Astro dev server (workerd)                                        |
| `pnpm build`                                   | `astro check` + production build into `dist/`                     |
| `pnpm preview`                                 | Preview the built worker locally                                  |
| `pnpm test`                                    | Unit + integration tests (Vitest)                                 |
| `pnpm test:build`                              | Bundle-budget/secret-leak tests against `dist/` (run after build) |
| `pnpm e2e`                                     | Playwright end-to-end, a11y and SEO gates                         |
| `pnpm perf`                                    | Lighthouse mobile audits for `/` and the tool page                |
| `pnpm live:jev`                                | One real Jev API call (needs `TYPESAFE_API_KEY`) — never in CI    |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | ESLint / Prettier / astro check                                   |
| `pnpm icons`                                   | Regenerate PNG icons from `public/favicon.svg`                    |

## Environment variables

| Name                     | Where                                               | Purpose                                                  |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| `TYPESAFE_API_KEY`       | secret (`wrangler secret put`, `.dev.vars` locally) | Jev auth. Never public.                                  |
| `TYPESAFE_BASE_URL`      | var, optional                                       | default `https://api.typesafe.ai`                        |
| `TYPESAFE_MODEL`         | var, optional                                       | default `jev-latest`                                     |
| `SITE_URL`               | var                                                 | canonical origin (`https://fastestads.com`)              |
| `PUBLIC_CF_BEACON_TOKEN` | var, optional                                       | Cloudflare Web Analytics (cookie-less); off when absent  |
| `PUBLIC_ADS_ENABLED`     | var, optional                                       | `'true'` renders ad-slot containers (CMP required first) |

## Test matrix

| Layer       | Location                 | Covers                                                                                           |
| ----------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Unit        | `tests/unit/`            | text engine, rules, checker, semantic request/answers/bands, report, analytics, registry, robots |
| Integration | `tests/integration/`     | Jev client retries/timeouts/failure mapping, API handler guards/cache/privacy                    |
| Build       | `tests/build/`           | gz bundle budget, no sourcemaps, no secret leakage into `dist/`                                  |
| E2E         | `tests/e2e/`             | happy path, fallbacks, form, keyboard, mobile, axe-core, SEO meta/JSON-LD                        |
| Perf        | `scripts/lighthouse.mjs` | Lighthouse scores + LCP/CLS/TBT budgets                                                          |

## Privacy

Ad copy is processed in memory only. Deterministic checks run in the browser and on our Worker;
the semantic evaluation sends headlines, descriptions and the target query to TypeSafe's Jev
service — nothing is stored or logged, analytics never contain ad text, and the form draft lives
in tab-scoped `sessionStorage`. See [`/privacy/`](https://fastestads.com/privacy/).

## Docs

- [`docs/DESIGN.md`](docs/DESIGN.md) — the authoritative design
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — secrets, deploy, domain, previews
- [`docs/ADDING_A_TOOL.md`](docs/ADDING_A_TOOL.md) — add tools, platforms, Jev questions
- [`docs/JEV_BOUNDARY.md`](docs/JEV_BOUNDARY.md) — what Jev decides vs code
