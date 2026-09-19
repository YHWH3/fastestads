import { useEffect, useRef, useState } from 'preact/hooks';
import type { AdInput, Issue } from '@core/platform/types';
import { runDeterministic } from '@core/checker';
import { googleAdsRsa } from '@core/platforms/google-ads';
import { buildReport } from '@core/aggregate/report';
import type { AnalysisReport, SemanticSlice } from '@core/aggregate/types';
import { FieldList } from './FieldList';
import { Results, type UiState } from './Results';
import { track } from './analytics';

interface Fields {
  headlines: string[];
  descriptions: string[];
  paths: string[];
  finalUrl: string;
  keyword: string;
}

const INITIAL: Fields = {
  headlines: ['', '', ''],
  descriptions: ['', ''],
  paths: ['', ''],
  finalUrl: '',
  keyword: '',
};

const EXAMPLE: Fields = {
  headlines: [
    'Powerful Business Software',
    'Manage Clients With Ease',
    'Grow Revenue Faster Now',
    'Track Every Deal In One Place',
    'Simple Pricing For Teams',
    'Try It Free For 14 Days',
  ],
  descriptions: [
    'Streamline how your team handles every account.',
    'Built for companies that want clearer pipelines.',
  ],
  paths: ['', ''],
  finalUrl: '',
  keyword: 'best crm for small business',
};

// Draft is tab-scoped (sessionStorage) and never sent anywhere — the API call
// only happens on explicit Analyze. Keyed per tool.
const DRAFT_KEY = 'fa:draft:google-ads-rsa';

function loadDraft(): Fields | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Fields>;
    if (!Array.isArray(parsed.headlines) || !Array.isArray(parsed.descriptions)) return null;
    return {
      headlines: parsed.headlines.filter((v) => typeof v === 'string'),
      descriptions: parsed.descriptions.filter((v) => typeof v === 'string'),
      paths: Array.isArray(parsed.paths)
        ? parsed.paths.filter((v) => typeof v === 'string')
        : INITIAL.paths,
      finalUrl: typeof parsed.finalUrl === 'string' ? parsed.finalUrl : '',
      keyword: typeof parsed.keyword === 'string' ? parsed.keyword : '',
    };
  } catch {
    return null;
  }
}

function toAdInput(fields: Fields): AdInput {
  return {
    platform: 'google-ads',
    format: 'rsa',
    headlines: fields.headlines,
    descriptions: fields.descriptions,
    paths: fields.paths,
    finalUrl: fields.finalUrl === '' ? undefined : fields.finalUrl,
    keyword: fields.keyword === '' ? undefined : fields.keyword,
  };
}

function buildIssuesByField(report: AnalysisReport): Map<string, Issue[]> {
  const map = new Map<string, Issue[]>();
  for (const issue of report.issues) {
    for (const ref of issue.fields) {
      const key = `${ref.field}:${ref.index}`;
      const list = map.get(key) ?? [];
      list.push(issue);
      map.set(key, list);
    }
  }
  return map;
}

export function AdChecker() {
  const [fields, setFields] = useState<Fields>(INITIAL);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [uiState, setUiState] = useState<UiState>('idle');
  const [announcement, setAnnouncement] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);

  // Restore the tab-scoped draft on mount, then persist on every change.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) setFields(draft);
    hydratedRef.current = true;
    track('tool_view', { tool: 'google-ads-headline-checker' });
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(fields));
    } catch {
      // Storage full or unavailable — draft persistence is best-effort.
    }
  }, [fields]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const updateField =
    (kind: 'headlines' | 'descriptions' | 'paths') => (index: number, value: string) => {
      setFields((prev) => {
        const next = [...prev[kind]];
        next[index] = value;
        return { ...prev, [kind]: next };
      });
    };

  const addField = (kind: 'headlines' | 'descriptions' | 'paths') => () => {
    setFields((prev) => ({ ...prev, [kind]: [...prev[kind], ''] }));
  };

  const removeField = (kind: 'headlines' | 'descriptions' | 'paths') => (index: number) => {
    setFields((prev) => ({
      ...prev,
      [kind]: prev[kind].filter((_, i) => i !== index),
    }));
  };

  const runSemantic = async (
    input: AdInput,
    det: ReturnType<typeof runDeterministic>,
  ): Promise<void> => {
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const finish = (slice: SemanticSlice, state: UiState) => {
      if (seqRef.current !== seq) return; // stale response — a newer request is in flight
      setReport(buildReport(det, slice, googleAdsRsa));
      setUiState(state);
    };

    try {
      const res = await fetch('/api/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: input.platform,
          format: input.format,
          headlines: input.headlines,
          descriptions: input.descriptions,
          ...(input.keyword ? { keyword: input.keyword } : {}),
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        finish({ state: 'unavailable', reason: 'rate_limited' }, 'rate_limited');
        track('semantic_analysis_failure', { reason: 'rate_limited' });
        setAnnouncement('Semantic evaluation unavailable — deterministic results shown.');
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        status?: string;
        reason?: string;
        result?: SemanticSlice['result'];
      } | null;

      if (res.ok && body && (body.status === 'ok' || body.status === 'partial') && body.result) {
        finish({ state: body.status, result: body.result }, 'complete');
        track('semantic_analysis_success');
      } else if (res.ok && body?.status === 'skipped') {
        finish({ state: 'skipped', reason: body.reason }, 'complete');
        track('semantic_analysis_success', { skipped: true });
      } else if (res.status === 503) {
        finish({ state: 'unavailable', reason: body?.reason }, 'semantic_unavailable');
        track('semantic_analysis_failure', { reason: body?.reason ?? 'upstream_error' });
        setAnnouncement('Semantic evaluation unavailable — deterministic results shown.');
      } else {
        finish({ state: 'unavailable', reason: 'network' }, 'error');
        track('semantic_analysis_failure', { reason: 'unexpected_response' });
        setAnnouncement('Semantic evaluation unavailable — deterministic results shown.');
      }
    } catch {
      if (controller.signal.aborted) return;
      finish({ state: 'unavailable', reason: 'network' }, 'semantic_unavailable');
      track('semantic_analysis_failure', { reason: 'network' });
      setAnnouncement('Semantic evaluation unavailable — deterministic results shown.');
    }
  };

  const analyze = async () => {
    const input = toAdInput(fields);
    const det = runDeterministic(input, googleAdsRsa);
    track('analysis_started');
    setUiState('analyzing');
    // Deterministic results render immediately; semantic section shows busy.
    setReport(buildReport(det, { state: 'not_requested' }, googleAdsRsa));
    await runSemantic(input, det);
    if (seqRef.current !== 0) {
      // Announce after the semantic pass settles (or fails).
      setAnnouncement((prev) =>
        prev === 'Semantic evaluation unavailable — deterministic results shown.'
          ? prev
          : `Analysis complete. ${det.issues.length} issues found.`,
      );
    }
    track('analysis_completed');
    for (const ruleId of new Set(det.issues.map((i) => i.ruleId))) {
      track('issue_type_detected', { ruleId });
    }
  };

  const retrySemantic = async () => {
    if (!report) return;
    const input = toAdInput(fields);
    setUiState('analyzing');
    await runSemantic(input, report.deterministic);
  };

  const reset = () => {
    abortRef.current?.abort();
    seqRef.current += 1;
    setFields(INITIAL);
    setReport(null);
    setUiState('idle');
    setPasteText('');
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // best-effort
    }
    setAnnouncement('Form cleared');
  };

  const loadExample = () => {
    setFields(EXAMPLE);
    track('example_loaded');
  };

  const applyPaste = () => {
    const lines = pasteText.split('\n').map((l) => l.replace(/\r$/, ''));
    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) return;
    setFields((prev) => ({ ...prev, headlines: lines.slice(0, 15) }));
    track('paste_headlines_used');
  };

  const issuesByField = report ? buildIssuesByField(report) : new Map<string, Issue[]>();

  return (
    <div class="fa-tool">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void analyze();
        }}
      >
        <FieldList
          kind="headline"
          label="Headlines"
          values={fields.headlines}
          stats={report?.deterministic.fields.headlines}
          issuesByField={issuesByField}
          max={15}
          maxChars={30}
          countedLength={googleAdsRsa.countedLength}
          onUpdate={updateField('headlines')}
          onAdd={addField('headlines')}
          onRemove={removeField('headlines')}
        />
        <FieldList
          kind="description"
          label="Descriptions"
          values={fields.descriptions}
          stats={report?.deterministic.fields.descriptions}
          issuesByField={issuesByField}
          max={4}
          maxChars={90}
          countedLength={googleAdsRsa.countedLength}
          onUpdate={updateField('descriptions')}
          onAdd={addField('descriptions')}
          onRemove={removeField('descriptions')}
        />
        <details>
          <summary>Display path &amp; final URL (optional)</summary>
          <FieldList
            kind="path"
            label="Display paths"
            values={fields.paths}
            stats={report?.deterministic.fields.paths}
            issuesByField={issuesByField}
            max={2}
            maxChars={15}
            countedLength={googleAdsRsa.countedLength}
            onUpdate={updateField('paths')}
            onAdd={addField('paths')}
            onRemove={removeField('paths')}
          />
          <div class="fa-field-row">
            <label for="fa-finalurl">Final URL</label>
            <div class="fa-field-line">
              <input
                id="fa-finalurl"
                type="url"
                value={fields.finalUrl}
                placeholder="https://example.com/landing-page"
                onInput={(e) =>
                  setFields((prev) => ({ ...prev, finalUrl: (e.target as HTMLInputElement).value }))
                }
              />
            </div>
          </div>
        </details>
        <div class="fa-field-row">
          <label for="fa-keyword">Target search query (optional)</label>
          <div class="fa-field-line">
            <input
              id="fa-keyword"
              type="text"
              value={fields.keyword}
              placeholder="best crm for small business"
              onInput={(e) =>
                setFields((prev) => ({ ...prev, keyword: (e.target as HTMLInputElement).value }))
              }
            />
          </div>
        </div>
        <details open={showPaste}>
          <summary
            onClick={(e) => {
              e.preventDefault();
              setShowPaste((v) => !v);
            }}
          >
            Paste headlines
          </summary>
          <div class="fa-field-row">
            <label for="fa-paste">One headline per line</label>
            <textarea
              id="fa-paste"
              rows={6}
              value={pasteText}
              onInput={(e) => setPasteText((e.target as HTMLTextAreaElement).value)}
              onBlur={applyPaste}
            />
          </div>
          <button type="button" class="fa-btn" onClick={applyPaste}>
            Split into headline rows
          </button>
        </details>
        <div class="fa-actions">
          <button type="submit" class="fa-btn fa-btn--primary">
            Analyze ad
          </button>
          <button type="button" class="fa-btn" onClick={loadExample}>
            Load example
          </button>
          <button type="button" class="fa-btn" onClick={reset}>
            Reset
          </button>
        </div>
      </form>

      <div class="fa-visually-hidden" aria-live="polite">
        {announcement}
      </div>

      {report && <Results report={report} uiState={uiState} onRetrySemantic={retrySemantic} />}
    </div>
  );
}
