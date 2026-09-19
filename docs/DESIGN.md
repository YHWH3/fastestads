# FastestAds — Engineering Design

Status: authoritative design for the first microtool (Google Ads Headline & Ad Copy Checker)
and the reusable platform beneath it. Keep this document current when boundaries change.

## 1. Stack (decided)

| Concern           | Choice                                                                                                             | Why                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | Astro (latest stable) — static pages + one on-demand API route                                                     | SEO content is static HTML; near-zero JS by default; endpoints/middleware for the Jev proxy                                            |
| Islands           | Preact via `@astrojs/preact`                                                                                       | ~4 KB runtime; the tool is the only island                                                                                             |
| Hosting           | Cloudflare Workers via `@astrojs/cloudflare` (static assets + Worker)                                              | Cheapest production-grade edge hosting; env/MCP already Cloudflare-oriented                                                            |
| Package manager   | pnpm                                                                                                               | Installed locally; lockfile committed                                                                                                  |
| Language          | TypeScript `strict`                                                                                                |                                                                                                                                        |
| Server validation | zod (server only)                                                                                                  | Never shipped to the browser                                                                                                           |
| Tests             | Vitest (unit/integration), Playwright (+ `@axe-core/playwright`)                                                   |                                                                                                                                        |
| Lint/format       | ESLint (typescript-eslint, astro plugin), Prettier                                                                 |                                                                                                                                        |
| Jev               | Direct HTTPS call to `POST https://api.typesafe.ai/v1/systemone` via a ~100-line typed client in `src/server/jev/` | Official HTTP contract; avoids taking a dependency on an SDK version published <7 days ago; full control over timeout/retry in workerd |
| Rate limiting     | Cloudflare Workers Rate Limiting binding (`ratelimits`) with in-memory fallback in dev/tests                       | No database; no latency                                                                                                                |
| Persistence       | None. Ad copy is never stored.                                                                                     | Privacy default                                                                                                                        |

## 2. Layering

```
src/core/        framework-agnostic domain. No DOM, no fetch, no Astro. Runs in browser AND worker.
  text/          grapheme segmentation, Google "counted characters", normalization, invisible chars
  platform/      shared types: PlatformDefinition, FieldSpec, Rule, Issue, Severity, SourceRef
  platforms/     one folder per platform: google-ads/ (rsa spec registry + rules)
  checker/       deterministic engine: runDeterministic(input, platform) -> DeterministicResult
  semantic/      Jev question TEMPLATES (static), answer schema types, banding — no network code
  aggregate/     dimensions, bands, summary status, explanation templates -> AnalysisReport
  tools/         tool registry (slug, name, description, category, seo, related, sources)
src/server/      worker-only: jev client, request validation (zod), rate limit, cache, structured logs
src/ui/          Preact island(s) — presentation only
src/pages, layouts, components, styles   Astro pages/SEO shell
```

Rule: `src/core` imports nothing from `src/server`, `src/ui`, or Astro.

## 3. Domain model

```ts
type Platform = 'google-ads';
type AdFormat = 'rsa';
type FieldKind = 'headline' | 'description' | 'path' | 'finalUrl' | 'keyword';
interface FieldRef {
  field: FieldKind;
  index: number;
} // index 0-based; display 1-based

interface AdInput {
  platform: Platform;
  format: AdFormat;
  headlines: string[];
  descriptions: string[];
  paths: string[]; // raw, untrimmed, as typed
  finalUrl?: string;
  keyword?: string;
}

type Severity = 'error' | 'warning' | 'info';
type IssueKind =
  'platform_limit' | 'editorial_indicator' | 'structure' | 'keyword' | 'best_practice' | 'semantic';
interface SourceRef {
  label: string;
  url: string;
  lastVerified: string; /* YYYY-MM-DD */
}

interface Issue {
  id: string; // unique per occurrence, e.g. "headline.length.max:h2"
  ruleId: string; // registry id, e.g. "headline.length.max"
  severity: Severity;
  kind: IssueKind;
  origin: 'deterministic' | 'semantic';
  fields: FieldRef[];
  title: string;
  detail: string;
  recommendation?: string;
  meta?: Record<string, string | number | boolean>;
  source?: SourceRef;
}

interface FieldStat {
  ref: FieldRef;
  original: string;
  counted: number; // platform counted characters (Google: double-width = 2)
  graphemes: number;
  limit: number | null;
  remaining: number | null;
  status: 'empty' | 'ok' | 'near' | 'over'; // near = remaining <= 3 (headline) / <= 8 (description)
  issueIds: string[];
}

interface KeywordCoverage {
  raw: string;
  normalized: string;
  terms: string[];
  phraseInHeadlines: number[];
  phraseInDescriptions: number[];
  termsCovered: string[];
  termsMissing: string[];
  headlineShareWithPhrase: number; // 0..1
}

interface DeterministicResult {
  fields: {
    headlines: FieldStat[];
    descriptions: FieldStat[];
    paths: FieldStat[];
    finalUrl?: FieldStat;
  };
  counts: { headlines: number; descriptions: number; paths: number }; // non-empty only
  issues: Issue[];
  keyword?: KeywordCoverage;
  hasBlockingErrors: boolean; // any platform_limit error
  evaluable: boolean; // >= 1 non-empty headline OR description (semantic is worth running)
}
```

Semantic (Phase 2) — `SemanticResult` holds typed answers keyed by stable question ids plus
`status: 'ok' | 'partial'`, `model`, `latencyMs`. Aggregation merges both into `AnalysisReport`:

```ts
type Band = 'strong' | 'good' | 'needs_work' | 'weak';
interface Dimension {
  id:
    | 'completeness'
    | 'structure'
    | 'differentiation'
    | 'relevance'
    | 'clarity'
    | 'specificity'
    | 'cta';
  label: string;
  basis: 'deterministic' | 'semantic' | 'mixed';
  band: Band | 'not_evaluated' | 'unavailable';
  lowConfidence?: boolean;
  reasons: string[];
}
interface AnalysisReport {
  status: 'blocked' | 'needs_work' | 'ready'; // blocked = platform_limit errors present
  deterministic: DeterministicResult;
  semantic: {
    state: 'ok' | 'partial' | 'unavailable' | 'skipped' | 'not_requested';
    reason?: string;
    result?: SemanticResult;
  };
  dimensions: Dimension[];
  issues: Issue[]; // deterministic + semantic-derived, sorted by severity
}
```

No overall numeric score. Dimension bands only, with reasons.

## 4. Text engine (core/text)

- `segmentGraphemes(s)`: `Intl.Segmenter('und', {granularity:'grapheme'})`, fallback `Array.from`.
- `countedLength(s, platform)`: Google Ads counts each **double-width** character as 2 (Korean, Japanese, Chinese per Google). Implement `isDoubleWidth(cp)` over East Asian Wide/Fullwidth ranges (CJK Unified Ideographs + ext A/B, Hiragana, Katakana, Hangul Jamo/Syllables, CJK Symbols & Punctuation U+3000–303F, Fullwidth Forms U+FF01–FF60, U+FFE0–FFE6, CJK Compatibility). Emoji count 1 grapheme but are flagged by rule. Halfwidth katakana (U+FF61–FF9F) counts 1 and is flagged.
- `normalizeForCompare(s)`: NFKC → casefold → strip punctuation/symbols → collapse whitespace → trim.
- `tokenize(s)`: normalizeForCompare then split on whitespace; `stopwords` small English list (the, a, an, and, or, for, to, of, in, on, with, your, our, you, we, is, at, by).
- `detectInvisible(s)`: U+200B, U+200C, U+200D, U+2060, U+FEFF, U+00AD → list of {cp, index}. Do NOT flag U+200E/U+200F (legit RTL marks).
- `detectNonstandardSpaces(s)`: U+00A0, U+2000–200A, U+202F, U+205F, U+3000 (U+3000 only flagged when text is not predominantly CJK).
- `containsLineBreak`, `hasDoubleSpace`, `hasEdgeWhitespace`, `isPredominantlyCJK`, `hasRTL`.
- NEVER mutate user copy for display; every FieldStat carries `original`.

## 5. Google Ads RSA registry (core/platforms/google-ads)

Spec (verified 2026-09-19 against official Google docs):

| Rule                                                                  | Value                  | Source                                                         |
| --------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| headlines min/max                                                     | 3 / 15                 | https://support.google.com/google-ads/answer/7684791           |
| headline max chars                                                    | 30                     | same                                                           |
| descriptions min/max                                                  | 2 / 4                  | same                                                           |
| description max chars                                                 | 90                     | same                                                           |
| path fields                                                           | 2 × 15 chars, optional | same                                                           |
| double-width chars count as 2                                         | yes                    | same                                                           |
| emoji / single-byte katakana unsupported                              | editorial              | https://support.google.com/adspolicy/answer/14847994           |
| repeated punctuation ("flowers!!"), decorative symbols, gimmicky caps | editorial              | 14847994, https://support.google.com/adspolicy/answer/14848295 |
| repetition of words/phrases within/across assets                      | editorial              | https://support.google.com/adspolicy/answer/14848296           |
| unacceptable spacing (missing/extra spaces)                           | editorial              | https://support.google.com/adspolicy/answer/14848500           |
| phone number in ad text not allowed                                   | editorial              | https://support.google.com/adspolicy/answer/14848200           |
| editorial overview                                                    |                        | https://support.google.com/adspolicy/answer/6021546            |

Registry shape:

```ts
export const googleAdsRsa: PlatformDefinition = {
  platform: 'google-ads', format: 'rsa', label: 'Google Ads · Responsive search ad',
  fields: { headline: { min: 3, max: 15, maxChars: 30, nearThreshold: 3 }, description: { min: 2, max: 4, maxChars: 90, nearThreshold: 8 }, path: { min: 0, max: 2, maxChars: 15, nearThreshold: 2 } },
  countedLength: (s) => countedLength(s, 'google-ads'),
  sources: { rsaSpec: SourceRef, editorial: SourceRef, punctuation: SourceRef, capitalization: SourceRef, repetition: SourceRef, spacing: SourceRef, phone: SourceRef },
  rules: Rule[],   // each: { id, kind, severity, source?, check(ctx) => Issue[] }
};
```

Rules (ids are stable public identifiers; add, don't rename):

Platform limits (`platform_limit`, error): `headline.count.min`, `headline.count.max`, `description.count.min`, `description.count.max`, `path.count.max`, `headline.length.max`, `description.length.max`, `path.length.max`, `field.line_break` (any field), `finalUrl.invalid` (only if provided: must parse, scheme http/https, hostname contains a dot).

Structure (`structure`): `duplicate.exact` (error; same original text after trim), `duplicate.normalized` (warning; same `normalizeForCompare`, different original), `duplicate.near` (warning; token Jaccard ≥ 0.75 after stopword removal and both ≥ 2 tokens, not already exact/normalized dup). Duplicates are computed within headlines and within descriptions separately; issue `fields` lists all members of a group once.

Editorial indicators (`editorial_indicator`, warning unless noted; wording must say "may be flagged", never "will be disapproved"): `chars.emoji` (Extended_Pictographic or emoji presentation), `chars.halfwidth_katakana`, `chars.invisible`, `whitespace.edge`, `whitespace.double`, `whitespace.nonstandard`, `whitespace.missing_after_punct` (`[,.!?;:][A-Za-z]` excluding URLs/decimals/ellipsis), `punct.repeated` (`!!`, `??`, `!?`, `?!`, `***`, `--` ; ellipsis `...`/`…` allowed once), `punct.exclamation_excess` (>1 `!` in one asset), `symbols.decorative` (`•`, `★`, `☆`, `►`, `→`, `✓`, `^`, `*text*`, `~text~`), `caps.all_caps_word` (word ≥ 4 letters all caps not in allowlist `ASAP USA UK EU CRM SEO PPC SEM B2B B2C SAAS SAAS API HVAC CEO CPA ROI ROAS LLC INC FAQ VIP DIY HD 4K USB GPS LED AI IT HR`— case-insensitive membership; and words that are all caps everywhere across the ad in ≥ 2 assets are treated as brand allowlisted), `caps.alternating` (≥ 3 case alternations within one word of ≥ 5 letters), `caps.spaced_letters` (`F.L.O.W.E.R.S` pattern: ≥ 4 single letters separated by `.` or spaces), `phone.in_text` (≥ 7 digits with typical separators/parentheses/+; skip when digits are part of a price/percent/year like `$1,299`, `24/7`, `2026`), `repetition.word_within_asset` (same non-stopword token ≥ 4 letters appears ≥ 2 times in one asset).

Keyword (`keyword`, only when keyword non-empty): `keyword.missing_in_headlines` (warning: phrase not in any headline; detail lists missing terms; recommendation: include the phrase or its key terms in ≥ 1 headline — Google's own RSA tip), `keyword.terms_missing` (info: some terms appear nowhere), `keyword.stuffing` (warning: phrase in > 60% of headlines when ≥ 5 headlines).

Best practice (`best_practice`, info): `headline.utilization.low` (< 8 non-empty headlines; cite RSA page "as many unique headlines as you can"), `description.utilization.low` (< 3), `cta.none_detected` (warning: no CTA verb/phrase in any asset; lexicon: get, buy, shop, order, start, try, book, download, sign up, signup, subscribe, learn more, request, compare, call, claim, join, discover, see, find, save, apply, schedule, reserve, register, contact, explore, upgrade, browse, view, visit, grab, unlock, talk to, speak to, free trial, get a quote, get started).

`hasBlockingErrors` = any issue with kind `platform_limit` and severity `error`.

## 6. Semantic engine (Phase 2 — Jev boundary)

- Jev answers **typed questions only**. All `instructions`/`criteria` are static code constants; user text only ever appears inside `state` values. Never interpolate user text into instructions.
- One batched request per analysis. State shape: `{ target_query?: string, headlines: { H1: string, ... }, descriptions: { D1: string, ... } }` (only non-empty fields; over-limit text still sent, capped at 200/400 chars server-side).
- Question set (ids stable):
  - Ad-level Scores: `clarity_offer` (what is offered), `value_proposition`, `specificity`, `cta_clarity`, `headline_complementarity`.
  - Ad-level Nouls: `hype`, `unsupported_claims`.
  - Choice `primary_language`: `english | other | mixed` → drives the non-English accuracy notice.
  - Per-headline Noul `vague_H{n}`: headline could apply to almost any business / does not say what is offered.
  - Pairwise Noul `redundant_H{a}_H{b}` for pairs not already deterministic duplicates: communicate essentially the same idea.
  - Keyword (when present): Score `topic_match`, Score `intent_match`, Choice `audience_alignment`: `no_audience_in_query | matches | mismatch`.
- Thresholds (initial, documented as uncalibrated): Noul ≥ 0.70 → flagged; 0.45–0.70 → "possible" (info, hedged wording); Score bands by expected level index / (levels-1): ≥ 0.8 strong, ≥ 0.55 good, ≥ 0.3 needs_work, else weak; `confidence < 0.5` → `lowConfidence` and hedged copy.
- Server skips Jev when `!evaluable`; response states are explicit: `ok | partial | unavailable(reason: not_configured | timeout | rate_limited | upstream_error | invalid_response | network)`.

## 7. API (Phase 2)

`POST /api/semantic/` (canonical trailing-slash URL; `/api/semantic` 308-redirects here under `trailingSlash: 'always'`) — JSON `{ platform, format, headlines[], descriptions[], keyword? }`. Paths/final URL are not sent (not needed for semantics; privacy). Limits: ≤ 15 headlines ≤ 200 chars, ≤ 4 descriptions ≤ 400 chars, keyword ≤ 120 chars, body ≤ 8 KB. 405 for non-POST; 415 for non-JSON; 400 on schema failure; 403 when `Sec-Fetch-Site` is present and not `same-origin`/`none`; 429 from our rate limiter (Retry-After); 503 JSON `{status:'unavailable', reason}` on upstream failure. All responses `Cache-Control: no-store`, `X-Robots-Tag: noindex`. Duplicate-request suppression: in-isolate LRU (≤ 200 entries, 10 min TTL) keyed by SHA-256 of the canonical payload. Structured JSON logs carry request id, latency, status, model, question count — never text.

## 8. UI states (Phase 2)

`idle → analyzing → complete | semantic_unavailable | rate_limited | error`. Deterministic result renders immediately on Analyze; semantic section shows a live region "Evaluating with Jev…" then results or an honest unavailable notice with Retry. Request sequence ids discard stale responses; in-flight request aborted on resubmit. Input is never cleared by errors. Counters update on input (no network). No network on keystrokes.

## 9. SEO / IA (Phase 3)

Routes: `/` (home: what FastestAds is + tool cards), `/tools/` (hub), `/tools/google-ads-headline-checker/` (the tool), `/privacy/`, `/methodology/` only if content is materially distinct (otherwise a section on the tool page), `/robots.txt`, `/sitemap-index.xml`. Tool registry drives sitemap, breadcrumbs, related links, and OG metadata; only `status: 'live'` tools are routable/indexable. Preview hosts (anything not `SITE_URL` host) get `X-Robots-Tag: noindex` and a disallow-all robots.txt via middleware.

## 10. Environment variables

| Name                       | Where                                               | Purpose                                                  |
| -------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `TYPESAFE_API_KEY`         | secret (`wrangler secret put`, `.dev.vars` locally) | Jev auth. Never public.                                  |
| `TYPESAFE_BASE_URL`        | var, optional                                       | default `https://api.typesafe.ai`                        |
| `TYPESAFE_MODEL`           | var, optional                                       | default `jev-latest`                                     |
| `SITE_URL`                 | var                                                 | canonical origin, e.g. `https://fastestads.com`          |
| `PUBLIC_CF_BEACON_TOKEN`   | var, optional                                       | Cloudflare Web Analytics; analytics off when absent      |
| `PUBLIC_ADS_ENABLED`       | var, optional                                       | `'true'` renders ad-slot containers (CMP required first) |
| `PUBLIC_GA_MEASUREMENT_ID` | var, optional                                       | GA4 `G-…` id; gtag snippet renders only when set         |

## 11. Deviations from this document (implementation notes)

Recorded where the shipped implementation differs from or refines the design above:

- **Fractional Jev scores accepted** — Score answers are probability-weighted and can land
  between levels (e.g. `1.6`); `parseAnswers` validates finite + range, not integers.
- **`semantic.cta_weak` suppression** — suppressed only for the `weak`→warning case when
  `cta.none_detected` already fired; the `needs_work` info may still emit.
- **Cache-hit status** — cached responses return the stored `result.status` (`ok` or `partial`)
  rather than a literal `'ok'`.
- **`Rule.label`** — every rule carries a short human label so the tool page can render the rule
  registry without duplicating names.
- **`isEmoji` keycap extension** — U+20E3 keycap detection added because the runtime's ICU does
  not classify bare `0-9`/`#`/`*` as `Extended_Pictographic`.
- **Robots on non-canonical hosts** — `robots.txt` itself serves disallow-all on any non-`SITE_URL`
  host (workers.dev previews, local preview), in addition to the `X-Robots-Tag` header.
- **TypeScript 6.0.3** — pinned below 7 because `typescript-eslint`/`@astrojs/check` peer ranges
  cap at `<6.1.0`.
