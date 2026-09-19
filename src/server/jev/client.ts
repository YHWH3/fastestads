import type { JevQuestion, SemanticState } from '../../core/semantic/questions';

export interface JevClientConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Additional retries after the first attempt. */
  maxRetries?: number;
  /** Wall-clock budget across all attempts. */
  totalBudgetMs?: number;
}

export type JevFailureReason =
  'not_configured' | 'timeout' | 'rate_limited' | 'upstream_error' | 'invalid_response' | 'network';

export type JevOutcome =
  | {
      ok: true;
      /** Raw answers map from the upstream response. */
      raw: unknown;
      model: string;
      latencyMs: number;
      usage?: { input_tokens: number; output_tokens: number };
    }
  | { ok: false; reason: JevFailureReason; httpStatus?: number; latencyMs: number };

export interface JevClient {
  evaluate(
    state: SemanticState,
    questions: Record<string, JevQuestion>,
    opts?: { signal?: AbortSignal },
  ): Promise<JevOutcome>;
}

const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
const DEFAULT_MODEL = 'jev-latest';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_BUDGET_MS = 12000;
const MAX_RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry-After (seconds) or retry-after-ms (milliseconds), capped at 2s. */
function retryDelayMs(res: Response): number {
  const afterMs = res.headers.get('retry-after-ms');
  if (afterMs !== null) {
    const parsed = Number(afterMs);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed, MAX_RETRY_DELAY_MS);
  }
  const after = res.headers.get('retry-after');
  if (after !== null) {
    const seconds = Number(after);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  return 0;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function failureReason(status: number): JevFailureReason {
  if (status === 429) return 'rate_limited';
  if (status === 408) return 'timeout';
  return 'upstream_error';
}

type TimeoutSignal = (ms: number) => AbortSignal;
const timeoutSignal: TimeoutSignal = (ms) => AbortSignal.timeout(ms);

function combineSignals(external: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  if (!external) return timeout;
  const anySignal = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return anySignal ? anySignal([external, timeout]) : timeout;
}

/**
 * Thin typed client for `POST {baseUrl}/v1/systemone`. Direct HTTPS — no SDK.
 * Never logs request or response bodies.
 */
export function createJevClient(cfg: JevClientConfig): JevClient {
  const doFetch = cfg.fetch ?? fetch;
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = cfg.model ?? DEFAULT_MODEL;
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = cfg.maxRetries ?? DEFAULT_MAX_RETRIES;
  const totalBudgetMs = cfg.totalBudgetMs ?? DEFAULT_BUDGET_MS;

  async function evaluate(
    state: SemanticState,
    questions: Record<string, JevQuestion>,
    opts?: { signal?: AbortSignal },
  ): Promise<JevOutcome> {
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;

    if (!cfg.apiKey) {
      return { ok: false, reason: 'not_configured', latencyMs: 0 };
    }

    const body = JSON.stringify({ state, model, questions });
    const url = `${baseUrl}/v1/systemone`;

    let lastOutcome: JevOutcome | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const remaining = totalBudgetMs - elapsed();
      if (remaining <= 0) break;
      const attemptTimeout = Math.min(timeoutMs, remaining);
      const signal = combineSignals(opts?.signal, timeoutSignal(attemptTimeout));

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          signal,
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        const timedOut =
          name === 'TimeoutError' || name === 'AbortError' || opts?.signal?.aborted === true;
        lastOutcome = {
          ok: false,
          reason: timedOut ? 'timeout' : 'network',
          latencyMs: elapsed(),
        };
        if (attempt < maxRetries && totalBudgetMs - elapsed() > 0) continue;
        break;
      }

      if (!res.ok) {
        const status = res.status;
        if (isRetryableStatus(status)) {
          lastOutcome = {
            ok: false,
            reason: failureReason(status),
            httpStatus: status,
            latencyMs: elapsed(),
          };
          if (attempt < maxRetries) {
            const delay = Math.min(retryDelayMs(res), Math.max(0, totalBudgetMs - elapsed()));
            if (delay > 0) await sleep(delay);
            if (totalBudgetMs - elapsed() > 0) continue;
          }
          break;
        }
        return {
          ok: false,
          reason: 'upstream_error',
          httpStatus: status,
          latencyMs: elapsed(),
        };
      }

      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        return { ok: false, reason: 'invalid_response', latencyMs: elapsed() };
      }
      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof (payload as Record<string, unknown>).answers !== 'object' ||
        (payload as Record<string, unknown>).answers === null ||
        Array.isArray((payload as Record<string, unknown>).answers)
      ) {
        return { ok: false, reason: 'invalid_response', latencyMs: elapsed() };
      }
      const record = payload as Record<string, unknown>;
      const usage =
        typeof record.usage === 'object' && record.usage !== null
          ? (record.usage as { input_tokens?: number; output_tokens?: number })
          : undefined;
      return {
        ok: true,
        raw: record.answers,
        model: typeof record.model === 'string' ? record.model : model,
        latencyMs: elapsed(),
        usage:
          usage && typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number'
            ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens }
            : undefined,
      };
    }

    return lastOutcome ?? { ok: false, reason: 'timeout', latencyMs: elapsed() };
  }

  return { evaluate };
}
