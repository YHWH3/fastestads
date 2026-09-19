import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  CURRENCIES,
  solve,
  type CalcInputs,
  type Currency,
  type SolveTarget,
} from '../core/calc/cpm';
import { track } from './analytics';

const DRAFT_KEY = 'fa:cpm-calculator:draft';

interface Draft {
  inputs: Omit<CalcInputs, 'solveFor'>;
  solveFor: SolveTarget;
  currency: Currency;
}

function loadDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || typeof parsed !== 'object' || !parsed.inputs) return null;
    return parsed as Draft;
  } catch {
    return null;
  }
}

const EMPTY: Omit<CalcInputs, 'solveFor'> = {
  cost: '',
  impressions: '',
  cpm: '',
  clicks: '',
  conversions: '',
  revenue: '',
};

const TARGETS: Array<{ value: SolveTarget; label: string; hint: string }> = [
  { value: 'cpm', label: 'CPM', hint: 'cost per 1,000 impressions' },
  { value: 'cost', label: 'Ad spend', hint: 'total campaign cost' },
  { value: 'impressions', label: 'Impressions', hint: 'how many times the ad shows' },
];

const PRIMARY_FIELD: Record<keyof Omit<CalcInputs, 'solveFor'>, { label: string; hint: string }> = {
  cost: { label: 'Ad spend', hint: 'total you paid or plan to pay' },
  impressions: { label: 'Impressions', hint: 'times the ad was shown' },
  cpm: { label: 'CPM', hint: 'cost per 1,000 impressions' },
  clicks: { label: 'Clicks', hint: 'optional — derives CPC and CTR' },
  conversions: { label: 'Conversions', hint: 'optional — derives CPA' },
  revenue: { label: 'Revenue from ads', hint: 'optional — derives ROAS and profit' },
};

const OPTIONAL_KEYS = ['clicks', 'conversions', 'revenue'] as const;

export function CpmCalculator() {
  const [inputs, setInputs] = useState<Omit<CalcInputs, 'solveFor'>>(EMPTY);
  const [solveFor, setSolveFor] = useState<SolveTarget>('cpm');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const hydratedRef = useRef(false);
  const trackedRef = useRef(false);
  const trackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setInputs({ ...EMPTY, ...draft.inputs });
      setSolveFor(draft.solveFor);
      setCurrency(draft.currency);
    }
    hydratedRef.current = true;
    track('tool_view', { tool: 'cpm-calculator' });
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ inputs, solveFor, currency }));
    } catch {
      // Draft persistence is best-effort.
    }
  }, [inputs, solveFor, currency]);

  const outcome = useMemo(
    () => solve({ ...inputs, solveFor }, { currency }),
    [inputs, solveFor, currency],
  );

  // Fire once per page session when the first valid calculation lands,
  // then again if the user switches solve target. Never sends numbers.
  useEffect(() => {
    if (!outcome.ok) return;
    if (trackTimer.current) clearTimeout(trackTimer.current);
    trackTimer.current = setTimeout(() => {
      if (!trackedRef.current) {
        track('calculation_completed', {
          tool: 'cpm-calculator',
          solved_for: outcome.result.solveFor,
        });
        trackedRef.current = true;
      }
    }, 1200);
    return () => {
      if (trackTimer.current) clearTimeout(trackTimer.current);
    };
  }, [outcome]);

  const requiredFor = TARGETS.find((t) => t.value === solveFor)!;
  const inputKeys = (['cost', 'impressions', 'cpm'] as const).filter((k) => k !== solveFor);

  const setField = (key: keyof Omit<CalcInputs, 'solveFor'>) => (e: Event) => {
    setInputs((prev) => ({ ...prev, [key]: (e.target as HTMLInputElement).value }));
    setDirty((prev) => new Set(prev).add(key));
    setCopied(false);
  };

  const copySummary = async () => {
    if (!outcome.ok) return;
    const r = outcome.result;
    const lines = [
      `CPM calculation — ${new Date().toISOString().slice(0, 10)}`,
      `Ad spend: ${r.cost}`,
      `Impressions: ${r.impressions}`,
      `CPM: ${r.cpm}`,
      ...r.derived.map((d) => d.sentence),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      track('recommendation_copied', { tool: 'cpm-calculator' });
    } catch {
      // Clipboard unavailable — the results stay visible anyway.
    }
  };

  // Required-field errors only appear after the user has touched the form;
  // parse errors always show (they can only exist after typing).
  const fieldError = (key: keyof Omit<CalcInputs, 'solveFor'>): string | null => {
    if (outcome.ok) return null;
    const err = outcome.fields[key].error;
    if (err && err.startsWith('Required') && dirty.size === 0) return null;
    return err;
  };

  return (
    <div class="fa-tool fa-calc">
      <fieldset>
        <legend>I want to calculate</legend>
        <div class="fa-solvefor" role="radiogroup" aria-label="What to calculate">
          {TARGETS.map((t) => (
            <label class="fa-solvefor-option" data-active={solveFor === t.value}>
              <input
                type="radio"
                name="solve-for"
                value={t.value}
                checked={solveFor === t.value}
                onChange={() => setSolveFor(t.value)}
              />
              <span class="fa-solvefor-label">{t.label}</span>
              <span class="fa-solvefor-hint">{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div class="fa-calc-grid">
        {inputKeys.map((key) => (
          <div class="fa-field-row" key={key}>
            <label for={`calc-${key}`}>
              {PRIMARY_FIELD[key].label}
              <span class="fa-field-hint">{PRIMARY_FIELD[key].hint}</span>
            </label>
            <div class="fa-field-line">
              <input
                id={`calc-${key}`}
                type="text"
                inputmode="decimal"
                autocomplete="off"
                value={inputs[key]}
                onInput={setField(key)}
                aria-invalid={fieldError(key) ? 'true' : undefined}
                aria-describedby={fieldError(key) ? `calc-${key}-err` : undefined}
              />
            </div>
            {fieldError(key) && (
              <p class="fa-over-text" id={`calc-${key}-err`} role="alert">
                {fieldError(key)}
              </p>
            )}
          </div>
        ))}

        <div class="fa-field-row">
          <label for="calc-currency">Currency</label>
          <div class="fa-field-line">
            <select
              id="calc-currency"
              value={currency}
              onChange={(e) => setCurrency((e.target as HTMLSelectElement).value as Currency)}
            >
              {CURRENCIES.map((c) => (
                <option value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <details>
        <summary>Also have clicks, conversions or revenue?</summary>
        <div class="fa-calc-grid">
          {OPTIONAL_KEYS.map((key) => (
            <div class="fa-field-row" key={key}>
              <label for={`calc-${key}`}>
                {PRIMARY_FIELD[key].label}
                <span class="fa-field-hint">{PRIMARY_FIELD[key].hint}</span>
              </label>
              <div class="fa-field-line">
                <input
                  id={`calc-${key}`}
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  value={inputs[key]}
                  onInput={setField(key)}
                  aria-invalid={fieldError(key) ? 'true' : undefined}
                />
              </div>
              {fieldError(key) && (
                <p class="fa-over-text" role="alert">
                  {fieldError(key)}
                </p>
              )}
            </div>
          ))}
        </div>
      </details>

      <div class="fa-results" aria-live="polite">
        {outcome.ok ? (
          <>
            <div class="fa-summary fa-summary--result" data-status="ready">
              <span class="fa-result-value">{outcome.result.primaryDisplay}</span>
              <span class="fa-result-label">
                {requiredFor.label === 'CPM'
                  ? 'CPM (cost per 1,000 impressions)'
                  : requiredFor.label}
              </span>
            </div>
            <p class="fa-calc-sentence">{outcome.result.summary}</p>

            {outcome.result.derived.length > 0 && (
              <ul class="fa-derived">
                {outcome.result.derived.map((d) => (
                  <li class="fa-derived-item" key={d.id}>
                    <span class="fa-derived-name">{d.id.toUpperCase()}</span>
                    <span class="fa-derived-value">{d.display}</span>
                    <span class="fa-derived-sentence">{d.sentence}</span>
                  </li>
                ))}
              </ul>
            )}

            {outcome.result.notes.map((note) => (
              <p class="fa-notice">{note}</p>
            ))}

            <div class="fa-actions">
              <button type="button" class="fa-btn" onClick={copySummary} data-copied={copied}>
                {copied ? 'Copied' : 'Copy results'}
              </button>
            </div>
          </>
        ) : (
          <p class="fa-calc-empty">
            Enter the two values for {requiredFor.label.toLowerCase()} above — the result appears
            instantly.
          </p>
        )}
      </div>
    </div>
  );
}
