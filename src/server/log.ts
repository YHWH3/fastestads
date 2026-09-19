/**
 * Structured logging. Only allowlisted keys may be logged — advertiser copy
 * (headlines, descriptions, keyword, ad text) must never reach the logs.
 * Non-allowlisted keys are dropped and recorded in `dropped`.
 */
const LOG_ALLOWLIST: ReadonlySet<string> = new Set([
  'ts',
  'requestId',
  'outcome',
  'httpStatus',
  'latencyMs',
  'jevLatencyMs',
  'model',
  'questionCount',
  'cached',
  'rateLimited',
  'reason',
  'status',
  'dropped',
]);

export function logEvent(obj: Record<string, unknown>): void {
  const safe: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (LOG_ALLOWLIST.has(key)) safe[key] = value;
    else dropped.push(key);
  }
  if (dropped.length > 0) safe.dropped = dropped;
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...safe }));
}
