export type AnalyticsEvent =
  | 'tool_view'
  | 'analysis_started'
  | 'analysis_completed'
  | 'semantic_analysis_success'
  | 'semantic_analysis_failure'
  | 'example_loaded'
  | 'issue_type_detected'
  | 'calculation_completed'
  | 'related_tool_clicked'
  | 'paste_headlines_used'
  | 'recommendation_copied';

export type AnalyticsProps = Record<string, string | number | boolean>;

const MAX_PROP_LENGTH = 64;

declare global {
  interface Window {
    __faTrack?: (name: AnalyticsEvent, props?: AnalyticsProps) => void;
  }
}

function sanitize(props: AnalyticsProps | undefined): AnalyticsProps {
  const safe: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    safe[key] = typeof value === 'string' ? value.slice(0, MAX_PROP_LENGTH) : value;
  }
  return safe;
}

/**
 * Fires a `fa:track` CustomEvent and calls `window.__faTrack` when a backend
 * (e.g. Cloudflare Web Analytics) is installed. Props are truncated at 64
 * chars; callers must only pass ruleIds/counts — never ad copy.
 */
export function track(name: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === 'undefined') return;
  const safe = sanitize(props);
  window.dispatchEvent(new CustomEvent('fa:track', { detail: { name, props: safe } }));
  window.__faTrack?.(name, safe);
}
