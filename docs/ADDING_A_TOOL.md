# Adding a tool, platform, or semantic question

## Add a tool

1. Add an entry to `TOOLS` in `src/core/tools/registry.ts` with `status: 'planned'` while it is
   being built. Keep `related` slugs pointed at real tools.
2. When it goes live set `status: 'live'` and fill the required metadata:
   `path` (`/tools/<slug>/`), `seo` (`title` ≤ 60 chars, `description` 70–160 chars),
   `breadcrumb`, `content.lastReviewed`, `sources`.
3. Create the page at `src/pages/tools/<slug>/index.astro` using `src/layouts/Base.astro` — read
   all metadata from the registry entry, never duplicate it.
4. The registry unit tests assert the invariant automatically: every live tool must have a page
   file and every `src/pages/tools/<dir>` must be a live tool. Sitemap, breadcrumbs, "coming next"
   lists and related-tool sections all derive from the registry.

## Add a platform

1. Create `src/core/platforms/<platform>/`:
   - `spec.ts` — `SourceRef` constants with `lastVerified` dates and official doc URLs, plus
     `FIELD_LIMITS` (`min`, `max`, `maxChars`, `nearThreshold`).
   - `rules/*.ts` — rules via `defineRule`, each with a stable `id`, a human `label`, `kind`,
     `severity` and a `source`. Editorial indicators must hedge ("may be flagged"), never predict
     disapproval.
   - `index.ts` — export a `PlatformDefinition` with `countedLength` bound to the platform's
     counting rules in `src/core/text`.
2. Register the platform's `Platform` union member in `src/core/platform/types.ts` if it is new.
3. Add fixtures to `tests/fixtures/ads.ts` and rule tests to `tests/unit/rules.test.ts`.
4. Add the tool entry to the registry (steps above).

`src/core` must stay framework-agnostic: no `src/server`, `src/ui`, Astro, Preact or zod imports —
ESLint rejects them.

## Add a semantic question

1. Add the question in `src/core/semantic/questions.ts` (see that file's security invariant —
   never interpolate user text into `instructions`/`criteria`; ad copy travels only inside
   `state`).
2. Give it a stable id and add it to `AD_LEVEL_QUESTIONS`, `KEYWORD_QUESTIONS`, or a generator
   like `vagueHeadlineQuestion`.
3. Update `tests/helpers/mockAnswers.ts` only if the new question type is not already covered.
4. Map the answer in `src/core/aggregate/report.ts` — either a semantic issue (`kind: 'semantic'`,
   hedged wording, `meta.lowConfidence`) and/or a dimension contribution. Cite the thresholds you
   use from `THRESHOLDS` in `src/core/semantic/bands.ts`.
5. Extend `tests/unit/report.test.ts` for the new mapping and `semantic-request.test.ts` if the
   question is conditional (e.g. keyword-only).
