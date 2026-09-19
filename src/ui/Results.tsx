import { useEffect, useRef, useState } from 'preact/hooks';
import type { AnalysisReport, Dimension } from '@core/aggregate/types';
import type { FieldRef, Issue } from '@core/platform/types';
import { LAST_VERIFIED } from '@core/platforms/google-ads';
import { track } from './analytics';

export type UiState =
  'idle' | 'analyzing' | 'complete' | 'semantic_unavailable' | 'rate_limited' | 'error';

const BAND_LABEL: Record<string, string> = {
  strong: 'Strong',
  good: 'Good',
  needs_work: 'Needs work',
  weak: 'Weak',
  not_evaluated: 'Not evaluated',
  unavailable: 'Unavailable',
};

const BASIS_LABEL: Record<Dimension['basis'], string> = {
  deterministic: 'Rules',
  semantic: 'Jev',
  mixed: 'Rules + Jev',
};

const SEVERITY_LABEL: Record<Issue['severity'], string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

const FIELD_LABEL: Record<FieldRef['field'], string> = {
  headline: 'Headline',
  description: 'Description',
  path: 'Path',
  finalUrl: 'Final URL',
  keyword: 'Target query',
};

const UNAVAILABLE_REASON: Record<string, string> = {
  not_configured: "Semantic evaluation isn't configured on this deployment",
  timeout: 'Jev took too long to respond',
  rate_limited: 'Too many requests right now — try again in a minute',
  network: "Couldn't reach the analysis service",
};

function unavailableText(reason: string | undefined): string {
  return (reason && UNAVAILABLE_REASON[reason]) ?? 'Semantic evaluation is temporarily unavailable';
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable — select a transient textarea as fallback.
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    track('recommendation_copied');
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" class="fa-copy-btn" data-copied={copied} onClick={copy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <li class="fa-issue" data-severity={issue.severity}>
      <div class="fa-issue-head">
        <span class="fa-severity" data-severity={issue.severity}>
          {SEVERITY_LABEL[issue.severity]}
        </span>
        <span class="fa-issue-title">{issue.title}</span>
        {issue.fields.map((ref) => (
          <span class="fa-field-chip" key={`${ref.field}:${ref.index}`}>
            {ref.field === 'finalUrl' || ref.field === 'keyword'
              ? FIELD_LABEL[ref.field]
              : `${FIELD_LABEL[ref.field]} ${ref.index + 1}`}
          </span>
        ))}
      </div>
      <p class="fa-issue-detail">{issue.detail}</p>
      {issue.recommendation && <p class="fa-issue-rec">{issue.recommendation}</p>}
      {(issue.recommendation || issue.source) && (
        <div class="fa-issue-foot">
          {issue.recommendation && <CopyButton text={issue.recommendation} />}
          {issue.source && (
            <a
              class="fa-source-link"
              href={issue.source.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              Source: {issue.source.label} (verified {issue.source.lastVerified})
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function DimensionCard({ dimension }: { dimension: Dimension }) {
  return (
    <li class="fa-dimension">
      <header>
        <h3>{dimension.label}</h3>
        <span class="fa-basis-tag">{BASIS_LABEL[dimension.basis]}</span>
      </header>
      <span class="fa-band" data-band={dimension.band}>
        {BAND_LABEL[dimension.band]}
      </span>
      {dimension.lowConfidence && <span class="fa-low-conf"> (low confidence)</span>}
      <ul>
        {dimension.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
    </li>
  );
}

export interface ResultsProps {
  report: AnalysisReport;
  uiState: UiState;
  onRetrySemantic?: () => void;
}

export function Results({ report, uiState, onRetrySemantic }: ResultsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const blockingErrors = report.issues.filter(
    (i) => i.kind === 'platform_limit' && i.severity === 'error',
  ).length;
  const summary =
    report.status === 'blocked'
      ? `Blocked: fix ${blockingErrors} Google Ads limit ${blockingErrors === 1 ? 'error' : 'errors'}`
      : report.status === 'needs_work'
        ? 'Needs work'
        : 'Ready';

  const deterministicIssues = report.issues.filter((i) => i.origin === 'deterministic');
  const semanticIssues = report.issues.filter((i) => i.origin === 'semantic');
  const semanticUnavailable = report.semantic.state === 'unavailable' || uiState === 'rate_limited';
  const reason = uiState === 'rate_limited' ? 'rate_limited' : report.semantic.reason;

  return (
    <section class="fa-results" aria-labelledby="fa-results-heading">
      <h2 id="fa-results-heading" tabIndex={-1} ref={headingRef}>
        Analysis results
      </h2>
      <p class="fa-summary" role="status" data-status={report.status}>
        {summary}
      </p>

      <ul class="fa-dimensions">
        {report.dimensions.map((d) => (
          <DimensionCard key={d.id} dimension={d} />
        ))}
      </ul>

      <section aria-labelledby="fa-det-issues">
        <h3 id="fa-det-issues">Google Ads rules &amp; structure</h3>
        {deterministicIssues.length === 0 ? (
          <p>No rule issues found.</p>
        ) : (
          <ul class="fa-issues">
            {deterministicIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fa-sem-issues" aria-busy={uiState === 'analyzing'}>
        <h3 id="fa-sem-issues">Semantic evaluation (Jev)</h3>
        {uiState === 'analyzing' && <p class="fa-busy">Evaluating with Jev…</p>}
        {semanticUnavailable && uiState !== 'analyzing' && (
          <div class="fa-notice" role="note">
            <p>{unavailableText(reason)}</p>
            {onRetrySemantic && (
              <button type="button" class="fa-btn" onClick={onRetrySemantic}>
                Retry semantic evaluation
              </button>
            )}
          </div>
        )}
        {uiState !== 'analyzing' && !semanticUnavailable && (
          <>
            {semanticIssues.length === 0 ? (
              <p>No semantic issues found.</p>
            ) : (
              <ul class="fa-issues">
                {semanticIssues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <p class="fa-disclaimer">
        Rule checks reflect Google's published limits and editorial policies as of {LAST_VERIFIED};
        semantic judgments are AI estimates. This tool is not affiliated with Google and cannot
        guarantee ad approval.
      </p>
    </section>
  );
}
