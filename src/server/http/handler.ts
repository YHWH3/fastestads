import { runDeterministic } from '../../core/checker';
import { googleAdsRsa } from '../../core/platforms/google-ads';
import { parseAnswers, type SemanticResult } from '../../core/semantic/answers';
import { buildSemanticRequest } from '../../core/semantic/request';
import { createJevClient } from '../jev/client';
import { logEvent } from '../log';
import { semanticCacheKey, type LruCache } from './cache';
import type { RateLimiter } from './rateLimit';
import { semanticRequestSchema } from './schema';

export interface SemanticHandlerDeps {
  env: {
    TYPESAFE_API_KEY?: string;
    TYPESAFE_BASE_URL?: string;
    TYPESAFE_MODEL?: string;
  };
  rateLimiter: RateLimiter;
  cache: LruCache<SemanticResult>;
  fetch?: typeof fetch;
  now?: () => number;
}

const MAX_BODY_BYTES = 8192;

function baseHeaders(requestId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
  };
}

function json(
  body: unknown,
  status: number,
  requestId: string,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseHeaders(requestId), ...extra },
  });
}

/**
 * `POST /api/semantic/` — validates, rate-limits, calls Jev once, returns the
 * typed SemanticResult. Paths and finalUrl are never sent upstream.
 */
export async function handleSemanticRequest(
  request: Request,
  deps: SemanticHandlerDeps,
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const requestId = crypto.randomUUID();

  const finish = (
    response: Response,
    outcome: string,
    extra?: {
      httpStatus?: number;
      jevLatencyMs?: number;
      model?: string;
      questionCount?: number;
      cached?: boolean;
      rateLimited?: boolean;
      reason?: string;
    },
  ): Response => {
    logEvent({
      requestId,
      outcome,
      httpStatus: extra?.httpStatus ?? response.status,
      latencyMs: now() - startedAt,
      jevLatencyMs: extra?.jevLatencyMs,
      model: extra?.model,
      questionCount: extra?.questionCount,
      cached: extra?.cached,
      rateLimited: extra?.rateLimited,
      reason: extra?.reason,
    });
    return response;
  };

  if (request.method !== 'POST') {
    return finish(
      json({ status: 'method_not_allowed' }, 405, requestId, { Allow: 'POST' }),
      'method_not_allowed',
    );
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return finish(json({ status: 'forbidden' }, 403, requestId), 'forbidden');
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return finish(
      json({ status: 'unsupported_media_type' }, 415, requestId),
      'unsupported_media_type',
    );
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return finish(json({ status: 'payload_too_large' }, 413, requestId), 'payload_too_large');
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return finish(json({ status: 'payload_too_large' }, 413, requestId), 'payload_too_large');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return finish(json({ status: 'invalid', errors: ['body'] }, 400, requestId), 'invalid_json');
  }

  const parsed = semanticRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.path.join('.'));
    return finish(json({ status: 'invalid', errors }, 400, requestId), 'schema_invalid');
  }

  const rateKey = request.headers.get('cf-connecting-ip') ?? 'anonymous';
  const rate = await deps.rateLimiter.limit(rateKey);
  if (!rate.success) {
    return finish(
      json({ status: 'rate_limited' }, 429, requestId, { 'Retry-After': '60' }),
      'rate_limited',
      { rateLimited: true },
    );
  }

  const { headlines, descriptions, keyword } = parsed.data;
  const det = runDeterministic(
    { platform: 'google-ads', format: 'rsa', headlines, descriptions, paths: [] },
    googleAdsRsa,
  );
  const plan = buildSemanticRequest(det, { headlines, descriptions, keyword });
  if (plan === null) {
    return finish(
      json({ status: 'skipped', reason: 'nothing_to_evaluate' }, 200, requestId),
      'skipped',
    );
  }
  const questionCount = plan.expectedIds.length;

  const cacheKey = await semanticCacheKey({ headlines, descriptions, keyword });
  const cached = deps.cache.get(cacheKey);
  if (cached !== undefined) {
    return finish(
      json({ status: cached.status, cached: true, result: cached }, 200, requestId),
      'cache_hit',
      { cached: true, questionCount, model: cached.model },
    );
  }

  const client = createJevClient({
    apiKey: deps.env.TYPESAFE_API_KEY,
    baseUrl: deps.env.TYPESAFE_BASE_URL,
    model: deps.env.TYPESAFE_MODEL,
    fetch: deps.fetch,
  });
  const outcome = await client.evaluate(plan.state, plan.questions);

  if (!outcome.ok) {
    return finish(
      json({ status: 'unavailable', reason: outcome.reason }, 503, requestId, {
        ...(outcome.reason === 'rate_limited' ? { 'Retry-After': '15' } : {}),
      }),
      'unavailable',
      { jevLatencyMs: outcome.latencyMs, reason: outcome.reason, questionCount },
    );
  }

  const { answers, missing } = parseAnswers(outcome.raw, plan.expectedIds, plan.questions);
  if (Object.keys(answers).length === 0) {
    return finish(
      json({ status: 'unavailable', reason: 'invalid_response' }, 503, requestId),
      'invalid_response',
      { jevLatencyMs: outcome.latencyMs, model: outcome.model, questionCount },
    );
  }

  const result: SemanticResult = {
    status: missing.length === 0 ? 'ok' : 'partial',
    model: outcome.model,
    latencyMs: outcome.latencyMs,
    answers,
    missing,
  };
  deps.cache.set(cacheKey, result);

  return finish(json({ status: result.status, result }, 200, requestId), 'ok', {
    jevLatencyMs: outcome.latencyMs,
    model: outcome.model,
    questionCount,
  });
}
