/**
 * Deterministic advertising-metric math for the CPM calculator.
 *
 * CPM = (cost ÷ impressions) × 1000 — the price of one thousand ad
 * impressions. The same three-way relationship rearranges to solve for
 * cost or impressions, and optional clicks/conversions/revenue inputs
 * derive CPC, CTR, CPA, ROAS and profit. All math is plain arithmetic;
 * no semantic evaluation is involved.
 */

export type SolveTarget = 'cpm' | 'cost' | 'impressions';

export interface CalcField {
  /** Parsed value, or null when the input was empty. */
  value: number | null;
  /** Validation message when the raw input could not be parsed. */
  error: string | null;
}

export interface CalcInputs {
  /** Raw field text — parsing happens inside solve(). */
  cost: string;
  impressions: string;
  cpm: string;
  clicks: string;
  conversions: string;
  revenue: string;
  solveFor: SolveTarget;
}

export interface CalcOptions {
  currency?: Currency;
  locale?: string;
}

export interface DerivedMetric {
  id: 'cpc' | 'ctr' | 'cpa' | 'roas' | 'profit';
  /** Formatted value for display, e.g. "$2.50", "1.5%", "4.0×". */
  display: string;
  /** Plain-English explanation, e.g. "Each click cost $2.50". */
  sentence: string;
}

export interface CalcResult {
  /** Which primary field was solved. */
  solveFor: SolveTarget;
  /** Resolved primary values after solving. */
  cost: number;
  impressions: number;
  cpm: number;
  /** Headline result, formatted. */
  primaryDisplay: string;
  /** Plain-English summary of the primary result. */
  summary: string;
  /** Extra metrics derived from the optional inputs. */
  derived: DerivedMetric[];
  /** Non-blocking observations (e.g. CTR above 100%). */
  notes: string[];
}

export type CalcOutcome =
  | { ok: true; result: CalcResult }
  | { ok: false; fields: Record<keyof Omit<CalcInputs, 'solveFor'>, CalcField> };

/** Currency codes offered in the UI. Purely presentational — math is unitless. */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(value: number, currency: Currency = 'USD', locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCount(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function formatPercent(value: number, locale?: string): string {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

/**
 * Parses a user-typed number. Accepts "$1,250.50", "1250.5", "1 000", "%"
 * suffixes and stray whitespace; rejects empty, negative, malformed and
 * non-finite input. Empty input returns null (field not provided).
 */
export function parseNumeric(raw: string): CalcField {
  const cleaned = raw.trim().replace(/[$,£€₹\s%]/g, '');
  if (cleaned === '') return { value: null, error: null };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
    return { value: null, error: 'Enter a number, e.g. 1250 or 4.75' };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { value: null, error: 'That number is too large' };
  if (value < 0) return { value: null, error: 'Negative values do not apply here' };
  if (value > Number.MAX_SAFE_INTEGER) {
    return { value: null, error: 'That number is too large' };
  }
  return { value, error: null };
}

type FieldKey = keyof Omit<CalcInputs, 'solveFor'>;

const FIELD_KEYS: FieldKey[] = ['cost', 'impressions', 'cpm', 'clicks', 'conversions', 'revenue'];

const TARGET_REQUIRED: Record<SolveTarget, [FieldKey, FieldKey]> = {
  cpm: ['cost', 'impressions'],
  cost: ['cpm', 'impressions'],
  impressions: ['cost', 'cpm'],
};

const TARGET_LABEL: Record<SolveTarget, string> = {
  cpm: 'CPM',
  cost: 'ad spend',
  impressions: 'impressions',
};

/** Solves the CPM relationship and derives optional metrics. */
export function solve(inputs: CalcInputs, options: CalcOptions = {}): CalcOutcome {
  const currency = options.currency ?? 'USD';
  const money = (value: number) => formatMoney(value, currency, options.locale);
  const fields = {} as Record<FieldKey, CalcField>;
  for (const key of FIELD_KEYS) fields[key] = parseNumeric(inputs[key]);
  for (const field of Object.values(fields)) {
    if (field.error) return { ok: false, fields };
  }

  const [a, b] = TARGET_REQUIRED[inputs.solveFor];
  const missing = [a, b].filter((key) => fields[key].value === null);
  if (missing.length > 0) {
    for (const key of missing) {
      fields[key] = {
        value: null,
        error: `Required to calculate ${TARGET_LABEL[inputs.solveFor]}`,
      };
    }
    return { ok: false, fields };
  }

  const v = (key: FieldKey): number | null => fields[key].value;
  const cost = v('cost');
  const impressions = v('impressions');
  const cpm = v('cpm');
  const clicks = v('clicks');
  const conversions = v('conversions');
  const revenue = v('revenue');

  let rCost = cost ?? 0;
  let rImpressions = impressions ?? 0;
  let rCpm = cpm ?? 0;
  const notes: string[] = [];

  switch (inputs.solveFor) {
    case 'cpm':
      if (rImpressions === 0) {
        fields.impressions = {
          value: 0,
          error: 'Impressions must be above 0 — CPM divides by them',
        };
        return { ok: false, fields };
      }
      rCpm = (rCost / rImpressions) * 1000;
      break;
    case 'cost':
      rCost = (rCpm * rImpressions) / 1000;
      break;
    case 'impressions':
      if (rCpm === 0) {
        fields.cpm = { value: 0, error: 'CPM must be above 0 to estimate impressions' };
        return { ok: false, fields };
      }
      rImpressions = (rCost / rCpm) * 1000;
      break;
  }

  const derived: DerivedMetric[] = [];
  if (clicks !== null) {
    if (clicks === 0) {
      derived.push({
        id: 'cpc',
        display: '—',
        sentence: 'With zero clicks there is no CPC to compute.',
      });
    } else {
      const cpc = rCost / clicks;
      derived.push({
        id: 'cpc',
        display: money(cpc),
        sentence: `Each click cost ${money(cpc)}.`,
      });
    }
    if (rImpressions > 0) {
      const ctr = (clicks / rImpressions) * 100;
      derived.push({
        id: 'ctr',
        display: formatPercent(ctr, options.locale),
        sentence: `${formatPercent(ctr, options.locale)} of impressions produced a click.`,
      });
      if (ctr > 100) {
        notes.push(
          'Clicks exceed impressions — check that both cover the same period and placement.',
        );
      }
    } else if (clicks > 0) {
      notes.push('CTR needs impressions above 0.');
    }
  }
  if (conversions !== null) {
    if (conversions === 0) {
      derived.push({
        id: 'cpa',
        display: '—',
        sentence: 'With zero conversions there is no CPA to compute.',
      });
    } else {
      const cpa = rCost / conversions;
      derived.push({
        id: 'cpa',
        display: money(cpa),
        sentence: `Each conversion cost ${money(cpa)}.`,
      });
    }
  }
  if (revenue !== null) {
    if (rCost === 0) {
      derived.push({
        id: 'roas',
        display: '—',
        sentence: 'ROAS needs ad spend above 0.',
      });
    } else {
      const roas = revenue / rCost;
      derived.push({
        id: 'roas',
        display: `${new Intl.NumberFormat(options.locale, { maximumFractionDigits: 2 }).format(roas)}×`,
        sentence: `Revenue of ${money(revenue)} on ${money(rCost)} spend is a ${formatPercent(roas * 100, options.locale)} ROAS.`,
      });
    }
    const profit = revenue - rCost;
    derived.push({
      id: 'profit',
      display: money(profit),
      sentence:
        profit >= 0
          ? `Revenue minus ad spend leaves ${money(profit)} before other costs.`
          : `Ad spend exceeds revenue by ${money(-profit)} before other costs.`,
    });
  }

  const moneyCost = money(rCost);
  const countImpr = formatCount(rImpressions, options.locale);
  const moneyCpm = money(rCpm);

  let primaryDisplay: string;
  let summary: string;
  switch (inputs.solveFor) {
    case 'cpm':
      primaryDisplay = moneyCpm;
      summary =
        rCost === 0
          ? `With no ad spend the CPM is ${moneyCpm} — you paid nothing per thousand impressions.`
          : `${moneyCost} bought ${countImpr} impressions — a CPM of ${moneyCpm} per thousand.`;
      break;
    case 'cost':
      primaryDisplay = moneyCost;
      summary = `${countImpr} impressions at a ${moneyCpm} CPM cost ${moneyCost}.`;
      break;
    case 'impressions':
      primaryDisplay = countImpr;
      summary =
        rCost === 0
          ? `With no ad spend you buy no impressions — enter a budget above ${money(0)}.`
          : `${moneyCost} at a ${moneyCpm} CPM buys about ${countImpr} impressions.`;
      break;
  }

  return {
    ok: true,
    result: {
      solveFor: inputs.solveFor,
      cost: rCost,
      impressions: rImpressions,
      cpm: rCpm,
      primaryDisplay,
      summary,
      derived,
      notes,
    },
  };
}
