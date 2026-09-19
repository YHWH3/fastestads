import { describe, expect, it } from 'vitest';
import { formatMoney, parseNumeric, solve, type CalcInputs } from '@core/calc/cpm';

function inputs(partial: Partial<CalcInputs>): CalcInputs {
  return {
    cost: '',
    impressions: '',
    cpm: '',
    clicks: '',
    conversions: '',
    revenue: '',
    solveFor: 'cpm',
    ...partial,
  };
}

describe('parseNumeric', () => {
  it('accepts plain numbers, decimals, currency symbols, commas and whitespace', () => {
    for (const raw of ['1250', '4.75', '$1,250.50', '1 000', ' 42 ', '€99.9', '.5', '10%']) {
      const field = parseNumeric(raw);
      expect(field.error, raw).toBeNull();
      expect(field.value, raw).not.toBeNull();
    }
    expect(parseNumeric('$1,250.50').value).toBe(1250.5);
    expect(parseNumeric('1 000').value).toBe(1000);
  });

  it('returns null for empty input', () => {
    expect(parseNumeric('')).toEqual({ value: null, error: null });
    expect(parseNumeric('   ')).toEqual({ value: null, error: null });
  });

  it('rejects malformed, negative and non-finite input', () => {
    for (const raw of ['abc', '1.2.3', '12a', '-5', 'Infinity', 'NaN', '1e3x']) {
      const field = parseNumeric(raw);
      expect(field.error, raw).toBeTruthy();
      expect(field.value, raw).toBeNull();
    }
  });
});

describe('solve — cpm target', () => {
  it('computes CPM from cost and impressions', () => {
    const out = solve(inputs({ cost: '2500', impressions: '500000' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.cpm).toBe(5);
    expect(out.result.primaryDisplay).toBe('$5.00');
    expect(out.result.summary).toContain('$2,500.00');
    expect(out.result.summary).toContain('500,000');
  });

  it('requires both cost and impressions', () => {
    const out = solve(inputs({ cost: '100' }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fields.impressions.error).toContain('Required');
  });

  it('rejects zero impressions (division by zero)', () => {
    const out = solve(inputs({ cost: '100', impressions: '0' }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fields.impressions.error).toContain('above 0');
  });

  it('handles zero spend', () => {
    const out = solve(inputs({ cost: '0', impressions: '1000' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.cpm).toBe(0);
  });
});

describe('solve — cost target', () => {
  it('computes spend from CPM and impressions', () => {
    const out = solve(inputs({ solveFor: 'cost', cpm: '6', impressions: '1000000' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.cost).toBe(6000);
    expect(out.result.primaryDisplay).toBe('$6,000.00');
  });

  it('requires cpm and impressions, not cost', () => {
    const out = solve(inputs({ solveFor: 'cost' }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fields.cpm.error).toContain('Required');
    expect(out.fields.impressions.error).toContain('Required');
  });
});

describe('solve — impressions target', () => {
  it('computes impressions from cost and CPM', () => {
    const out = solve(inputs({ solveFor: 'impressions', cost: '500', cpm: '2.5' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.impressions).toBe(200000);
    expect(out.result.primaryDisplay).toBe('200,000');
  });

  it('rejects zero CPM (division by zero)', () => {
    const out = solve(inputs({ solveFor: 'impressions', cost: '100', cpm: '0' }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fields.cpm.error).toContain('above 0');
  });
});

describe('solve — derived metrics', () => {
  it('derives CPC, CTR, CPA, ROAS and profit', () => {
    const out = solve(
      inputs({
        cost: '1000',
        impressions: '50000',
        clicks: '400',
        conversions: '20',
        revenue: '2500',
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const byId = Object.fromEntries(out.result.derived.map((d) => [d.id, d]));
    expect(byId.cpc.display).toBe('$2.50');
    expect(byId.ctr.display).toBe('0.8%');
    expect(byId.cpa.display).toBe('$50.00');
    expect(byId.roas.display).toBe('2.5×');
    expect(byId.profit.display).toBe('$1,500.00');
  });

  it('uses resolved values for derivation when solving for cost', () => {
    const out = solve(
      inputs({ solveFor: 'cost', cpm: '10', impressions: '100000', clicks: '500' }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.cost).toBe(1000);
    const cpc = out.result.derived.find((d) => d.id === 'cpc');
    expect(cpc?.display).toBe('$2.00');
  });

  it('reports em-dash for zero clicks and zero conversions', () => {
    const out = solve(inputs({ cost: '100', impressions: '1000', clicks: '0', conversions: '0' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const byId = Object.fromEntries(out.result.derived.map((d) => [d.id, d]));
    expect(byId.cpc.display).toBe('—');
    expect(byId.cpa.display).toBe('—');
  });

  it('reports em-dash ROAS when spend is zero but keeps profit', () => {
    const out = solve(inputs({ solveFor: 'cost', cpm: '0', impressions: '0', revenue: '100' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const byId = Object.fromEntries(out.result.derived.map((d) => [d.id, d]));
    expect(byId.roas.display).toBe('—');
    expect(byId.profit.display).toBe('$100.00');
  });

  it('notes when clicks exceed impressions', () => {
    const out = solve(inputs({ cost: '100', impressions: '10', clicks: '50' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.notes.join(' ')).toContain('Clicks exceed impressions');
  });

  it('notes negative profit', () => {
    const out = solve(inputs({ cost: '1000', impressions: '1000', revenue: '200' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const profit = out.result.derived.find((d) => d.id === 'profit');
    expect(profit?.sentence).toContain('exceeds revenue');
  });
});

describe('solve — validation and formatting', () => {
  it('fails fast on malformed input without running the solver', () => {
    const out = solve(inputs({ cost: 'abc', impressions: '1000' }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fields.cost.error).toBeTruthy();
    expect(out.fields.impressions.error).toBeNull();
  });

  it('formats in the selected currency', () => {
    const out = solve(inputs({ cost: '2500', impressions: '500000' }), { currency: 'EUR' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.primaryDisplay).toContain('€');
    expect(out.result.primaryDisplay).toContain('5.00');
  });
});

describe('formatMoney', () => {
  it('formats USD by default', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });
});
