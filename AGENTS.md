# AGENTS.md — working in this repo

FastestAds: fast, privacy-conscious checks for ad copy quality and platform fit.
Astro 7 (static) on Cloudflare Workers via `@astrojs/cloudflare`; Preact islands only where
interactive. Live site: https://fastestads.com

## Setup and gates

```bash
pnpm install        # pnpm ^11.11.0 (devEngines enforces)
pnpm dev            # Astro dev server (workerd)
pnpm build          # astro check + build into dist/
pnpm test           # Vitest unit + integration
pnpm test:build     # bundle-budget/secret-leak assertions against dist/ (after build)
pnpm e2e            # Playwright + axe-core
pnpm lint && pnpm typecheck && pnpm format:check
```

Copy `.dev.vars.example` → `.dev.vars` for local dev. Without `TYPESAFE_API_KEY` the semantic
endpoint returns `503 not_configured` and the UI shows its designed fallback — that is correct
behavior, not a bug.

## Layout

- `src/core/` — domain core. Framework-agnostic: **no Astro/Preact/zod/`src/server`/`src/ui`
  imports; ESLint rejects them.** All platform rules, text metrics, semantic shaping, and report
  aggregation live here.
- `src/ui/` — Preact islands (checker UI, CPM calculator).
- `src/server/` — worker-side API: Jev proxy, rate limit, cache, schema.
- `src/pages/` — Astro pages; tool pages read all metadata from the tool registry, never
  duplicate it.
- `src/core/tools/registry.ts` — single source of truth for tools; sitemap, breadcrumbs and
  related-tool lists derive from it.
- `tests/` — `unit/`, `integration/`, `fixtures/`; Playwright config at repo root.
- `docs/` — `ADDING_A_TOOL.md` (how to add tools/platforms/questions), `DEPLOYMENT.md`,
  `DESIGN.md`, `JEV_BOUNDARY.md`, `seo/` (data-source stack, keyword research, backlog).

## Invariants that will break silently if ignored

- **Semantic security:** never interpolate user text into Jev `instructions`/`criteria` — ad copy
  travels only inside `state` values (`src/core/semantic/questions.ts`).
- **Jev answers are untrusted input** — validated structurally; invalid → `missing`, never
  defaults. Scores→bands use fixed thresholds in `bands.ts`.
- **Platform facts need provenance** — `SourceRef` with `lastVerified` + official doc URL.
  Editorial indicators hedge ("may be flagged"); never predict disapproval. Never let LLM
  estimates overwrite platform facts.
- **Secrets:** `TYPESAFE_API_KEY` via `wrangler secret put` / `.dev.vars` — never in `vars`, never
  committed. Build strips `dist/server/.dev.vars`; `pnpm test:build` asserts it. `PUBLIC_*` vars
  are bundled into client code — public values only.
- **Registry invariant:** every live tool needs a page file and vice versa (unit-tested).

## Current project state

- Tools live: Google Ads headline checker, CPM calculator.
- SEO/data stack status and open items are tracked in `docs/seo/data-sources.md` — GA4 property
  not yet created (activation checklist lives there); Google Ads account stuck at onboarding;
  GSC/Bing/Ahrefs live.
- Deploy: Cloudflare Workers Builds from `main` (see `docs/DEPLOYMENT.md`; `wrangler deploy`
  for manual).
