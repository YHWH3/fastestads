# The Jev boundary

What the model decides, what code decides, and how the integration stays safe.

## What Jev decides

Jev (TypeSafe's System One) answers a fixed questionnaire per analysis:

- Ad-level scores: `clarity_offer`, `value_proposition`, `specificity`, `cta_clarity`,
  `headline_complementarity`
- Ad-level nouls (probabilities): `hype`, `unsupported_claims`
- Choices: `primary_language`, `audience_alignment` (keyword-only)
- Keyword scores (only when a target query exists): `topic_match`, `intent_match`
- Per-headline `vague_H{n}` and per-pair `redundant_Ha_Hb` nouls

## What code decides

Everything else — and the model's answers are _never_ trusted raw:

- `src/core/semantic/request.ts` builds the request. Questions contain only stable field paths
  (`headlines.H3`) and static text; ad copy travels only inside `state` values.
- `src/core/semantic/answers.ts` structurally validates every answer (type match, ranges, choice
  membership, score bounds). Invalid or absent answers become `missing` — never defaults.
- `src/core/semantic/bands.ts` converts scores/probabilities to bands and verdicts using fixed
  `THRESHOLDS` (score: strong ≥ 0.8, good ≥ 0.55, needs work ≥ 0.3 of the level range; noul:
  flagged ≥ 0.70, possible ≥ 0.45; low confidence < 0.5).
- `src/core/aggregate/report.ts` maps answers to dimensions and hedged issues, applies
  downgrade/cap rules, and marks `lowConfidence` from answer confidence.
- All platform limits, editorial indicators, duplication, keyword coverage and CTA detection are
  deterministic rules — Jev never touches them.

## Injection invariant

Advertiser copy is untrusted data and can never become instructions. The request builder keeps it
inside `state` only; tests assert that `JSON.stringify(questions)` contains none of the input
strings for prompt-injection and HTML-payload fixtures, and that an injection payload produces a
question set deeply equal to a benign ad's.

## Failure modes (server → UI)

| Reason             | Meaning                                    | UX                                    |
| ------------------ | ------------------------------------------ | ------------------------------------- |
| `not_configured`   | No `TYPESAFE_API_KEY`                      | "isn't configured on this deployment" |
| `timeout`          | Attempt timed out (8s/attempt, 12s budget) | "took too long to respond"            |
| `rate_limited`     | Upstream 429 (or our limiter 429)          | "Too many requests"                   |
| `upstream_error`   | 5xx/401/403/422                            | "temporarily unavailable"             |
| `invalid_response` | Non-JSON or missing `answers`              | "temporarily unavailable"             |
| `network`          | Fetch `TypeError`                          | "Couldn't reach the analysis service" |

The client retries once on network/timeout/408/429/5xx, honoring `Retry-After` capped at 2s and a
12s total budget. Partial answers still produce a `partial` report — missing questions degrade to
`unavailable`/no-issue rather than inventing values.

## Cost estimate

Roughly: ~20 questions for a 10-headline/3-description ad (8 ad-level + 3 keyword + 10 vague + N
redundant pairs − deterministic-dup exclusions). At ~150 prompt tokens/question + ~80 completion
tokens each, one analysis is on the order of **~4–6k tokens** — an estimate, not a measurement.
The in-isolate LRU cache dedupes identical payloads for 10 minutes.
