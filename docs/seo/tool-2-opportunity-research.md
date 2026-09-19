# Tool #2 opportunity research

Date: 2026-09-19
Author: Devin (automated research + manual SERP review)

## Research sources actually used

| Source                                                   | What it provided                                                                                                                                  | Access                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Google Autocomplete (`suggestqueries.google.com`)        | Real query variants for ~85 seed/expanded keywords                                                                                                | Free endpoint         |
| Google Trends (trends.google.com, US, 12 months, weekly) | Relative interest data exported as CSV for 15 terms across 3 comparisons                                                                          | Authenticated browser |
| Web search (SERP composition)                            | Page-1 competitors, content type, feature quality for ~10 candidate queries                                                                       | Search API            |
| Google Keyword Planner                                   | NOT AVAILABLE — no signed-in Google profile has a Google Ads account; all profiles land on "New Google Ads Account" setup. Volume marked UNKNOWN. | Blocked               |
| Search Console (fastestads.com domain property)          | Immature — verified and sitemap submitted, but the site is days old. No meaningful query/impression data yet.                                     | Verified earlier      |
| Ahrefs/Semrush/Similarweb/etc.                           | NOT AVAILABLE — no subscriptions found. Metrics from these tools marked UNKNOWN.                                                                  | Not subscribed        |

## Method

1. Generated ~85 candidate queries across calculator, checker, counter, preview/mockup, generator, and UTM families for Google Ads, Meta/Facebook/Instagram, TikTok, and LinkedIn.
2. Pulled Google Autocomplete expansions for each seed — this reveals the queries humans actually type and their cluster depth.
3. Exported Google Trends weekly interest (US, 12 months) for the strongest terms in three comparison batches.
4. Manually reviewed page-1 SERPs for the ~10 most promising queries — recording who ranks and how good the tools are.

## Key evidence

### Google Trends (relative interest, US, trailing 12 months, weekly)

Scale note: Trends reports 0–100 relative to the max term in each comparison. Sub-scale terms report `<1` or `0` weekly — this does NOT mean zero absolute volume, only that they are far below the batch anchor.

| Term                          | Avg index | Weeks with data | Notes                                                                                    |
| ----------------------------- | --------- | --------------- | ---------------------------------------------------------------------------------------- |
| cpm calculator                | 63.2      | 53/53           | Strongest sustained demand in the entire universe researched                             |
| utm builder                   | 13.1      | 53/53           | Sustained, clean intent                                                                  |
| cpc calculator                | 9.6       | 25/53           | Some non-ad pollution (pay-commission, Mercedes)                                         |
| utm generator                 | 5.1       | 36/53           | Sustained                                                                                |
| ctr calculator                | 3.0       | 10/53           | Moderate                                                                                 |
| campaign url builder          | 2.4       | 20/53           | Sustained; overlaps UTM intent                                                           |
| roas calculator               | 0.5–0.9   | 3/53            | Surprisingly weak at weekly granularity — bursty, much lower than autocomplete suggested |
| google ads preview tool       | 0.4       | 2/53            | Sub-scale                                                                                |
| google ads mockup             | 0.8       | 1/53            | Sub-scale                                                                                |
| facebook ad mockup            | 0.1       | 2/53            | Sub-scale                                                                                |
| meta ad mockup                | 0         | 0/53            | No data                                                                                  |
| facebook ad character counter | 0         | 0/53            | Sub-scale                                                                                |
| google ads character counter  | 0         | 0/53            | Sub-scale                                                                                |
| ad copy checker               | 0         | 0/53            | Sub-scale                                                                                |

Polluted terms excluded from consideration: `cpa calculator` (39 avg — dominated by CGPA college-GPA intent), `cac calculator` (coronary calcium), `ltv calculator` (mortgage loan-to-value), `link builder`/`url builder` (SEO/general intent), `ppc calculator` (cement/South-Africa pollution).

### Autocomplete cluster depth (number of distinct real suggestions per seed)

- **Mockup/preview cluster**: facebook ad mockup (10), meta ad mockup (10), instagram ad mockup (10), facebook ad preview (10), google ads mockup (10), ad mockup generator (10, multi-platform), tiktok ad mockup (10), linkedin ad mockup (10). Deepest cluster by breadth — but Trends shows each individual term is small.
- **UTM cluster**: utm builder, utm generator, utm link builder, campaign url builder, free utm builder, utm builder template — all 10-deep, sustained Trends demand.
- **Calculator cluster**: cpm calculator (10), cpc calculator (10 but polluted), ctr calculator (10), roas calculator (10 incl. dropshipping/meta/google-ads variants), break even roas calculator (10), google ads budget calculator (10), ad spend calculator (10).
- **Character counter cluster**: meta ad character counter (10), google ads character counter (5), facebook ad character counter (5), tiktok ad character counter (5).
- **Checker/analyzer**: facebook ad copy checker (5), meta ad copy checker (5), search intent checker (5), keyword intent checker (6).
- **Generator**: google ads headline generator (7), ad headline generator (5), ad copy generator variants.
- **Semantic/Jev-native queries are nearly invisible in autocomplete** — `keyword ad relevance checker`, `ad strength checker`, `message match checker` returned zero or polluted suggestions. Real demand for these is low.

## SERP observations (manual review, page 1)

Every candidate SERP already contains dedicated free tools. There is no empty SERP in this vertical. Differentiation must come from being genuinely better, not from filling a void.

| Query                                                | Who ranks                                                                                                            | Quality assessment                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cpm calculator                                       | webfx, omnicalculator, cpmcalculator.ai, cpmchecker.com, cpmcalculator.dev, clickz/marketingdive                     | Exact-match microsites + generic calculator platforms. Mostly simple two-field calculators. Winnable — no ad-industry authority dominating; several are dated or thin on interpretation. |
| utm builder / utm generator                          | utm.io (entrenched SaaS), Google's own Campaign URL Builder, utmsbuilder, utmgenerator.io, yotpo, toolita, superflow | Crowded and includes a first-party Google tool plus an entrenched SaaS brand. Harder.                                                                                                    |
| roas calculator                                      | roascalculator.org (excellent), ordio, adverthunt, calculatorlib, criticalmkt                                        | Strong tools already; and demand is weaker than expected.                                                                                                                                |
| facebook/meta ad mockup                              | adquisition.ai, vaizle, novabrand.ai, aipostmockup, heysage.com.au                                                   | 5+ genuinely good free tools — pixel-accurate, PNG export, multi-placement. Competitive.                                                                                                 |
| google ads mockup / RSA preview                      | ad-preview.tools, vaizle, portside.wales, davidtamachi.ca, digitalroyalty, posttruncate.com, nexusad, jonnyswiftppc  | Several excellent tools (pinning simulation, combination rendering, pixel-width measurement). Competitive.                                                                               |
| meta ad character counter / facebook ad copy checker | getadly, adplus, postify.tech, uplads, adligator, arbsbuy, adflint                                                   | Several good counters + truncation previews. Competitive, demand sub-Trends-scale.                                                                                                       |
| headline analyzer                                    | CoSchedule ecosystem, MonsterInsights, OptinMonster + many small tools                                               | Big established brands. Avoid.                                                                                                                                                           |
| google ads headline generator                        | HubSpot, CoSchedule, + AI tool swarm                                                                                 | Generation is commoditized. Avoid.                                                                                                                                                       |
| google ads budget calculator                         | Google's own estimator (first-party) + adpredictor, mezvic, digitalroyalty, keygrow                                  | First-party competition + strong tools.                                                                                                                                                  |
| keyword/search intent checker                        | seo.ai, crawltide, seorocket, goseo, completeseotools                                                                | Simplistic tools, but off-topical for an advertising site (SEO-intent audience).                                                                                                         |

## Shortlist (~5)

1. **cpm calculator** — Trends 63 avg (highest clean demand), direct calculation intent, mid-tier SERP, trivial build, zero ongoing cost, perfect advertising topical fit.
2. **utm builder** — ~20 combined cluster demand, sustained, direct tool intent; but SERP includes entrenched SaaS (utm.io) + Google first-party.
3. **Meta/Facebook ad preview + copy checker** — largest combined autocomplete cluster, real product differentiation possible (nobody combines mockup + validation); but individual terms are sub-Trends-scale and mockup competition is strong. Best medium-term candidate.
4. **cpc calculator** — 9.6 avg sustained-ish; pollution risk; SERP similar to CPM. Natural follow-on sharing the same calculator engine.
5. **google ads budget calculator** — real cluster but Google's own estimator ranks first-party + strong third-party tools.

## Selection

**Tool #2: CPM Calculator** at `/tools/cpm-calculator/`.

Primary keyword: `cpm calculator`
Supporting cluster: `cpm calculator online`, `cost per mille calculator`, `cpm formula`, `ad spend calculator`, `cpm calculator google ads/meta/youtube`, plus partial coverage of `cpc calculator`, `ctr calculator`, `cpa calculator` (marketing intent) via optional derived metrics.

### Why it won

- Highest sustained clean ad-intent demand of anything researched (Trends 63 avg, 53/53 weeks nonzero).
- Pure tool intent — every searcher wants exactly a calculator.
- SERP is winnable: incumbent tools are simple two-field calculators on microsites or generic calculator platforms; none combine the full ad-metrics relationship set (CPM↔CPC↔CTR↔CPA↔ROAS) with careful interpretation.
- Build cost is the lowest of all candidates while still being genuinely useful — deterministic math, client-side, no API, no Jev.
- Fits the registry's `calculator` category (roas/cpc calculators were already planned) and creates the reusable calculator engine for Tools #3+.

### Why the others lost (evidence-based, not vibes)

- **UTM builder**: strong demand but the SERP has an entrenched SaaS incumbent (utm.io) AND a first-party Google tool; second-place prize is smaller.
- **Meta ad mockup/preview cluster**: biggest combined breadth but each term is small, competitors are already good, and build cost is highest (uploads, placements, export). Better as Tool #3 with a combined preview+validation product.
- **ROAS calculator**: demand turned out much weaker than autocomplete suggested; SERP already has excellent margin-aware tools.
- **Google Ads RSA preview**: closest topical neighbor but several genuinely strong tools exist (davidtamachi, digitalroyalty, posttruncate) and it partially overlaps Tool #1's purpose.
- **Generators/analyzers**: commoditized AI tools, big brands.
- **Intent checkers**: off-topical (SEO audience, not advertisers).

## Jev decision

**Not used.** CPM/CPC/CPA/CTR/ROAS are arithmetic — semantic judgment adds nothing. The tool is fully deterministic and client-side; there is no Worker round-trip and no API cost.

## Uncertainties

- Absolute monthly volumes: UNKNOWN (Keyword Planner inaccessible; Trends gives only relative index). `cpm calculator` is clearly the largest clean term by relative demand but absolute volume is unquantified.
- AIO presence on these SERPs was not directly observable via text search; simple calculators are somewhat AIO-exposed, but the multi-input solver + interpretation content mitigates.
- `cpm calculator` has minor non-advertising pollution (trucking cost-per-mile, YouTube creator earnings); the dominant intent is advertising CPM, and the page notes the difference.
