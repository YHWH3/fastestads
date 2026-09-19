import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { SemanticResult } from '../../core/semantic/answers';
import { handleSemanticRequest } from '../../server/http/handler';
import { LruCache } from '../../server/http/cache';
import { bindingRateLimiter, memoryRateLimiter } from '../../server/http/rateLimit';

export const prerender = false;

// Module-scoped instances: per-isolate LRU + a dev/test fallback limiter when
// the SEMANTIC_RATE_LIMITER binding is not present.
const cache = new LruCache<SemanticResult>();
const rateLimiter =
  typeof env.SEMANTIC_RATE_LIMITER !== 'undefined'
    ? bindingRateLimiter(env.SEMANTIC_RATE_LIMITER)
    : memoryRateLimiter({ limit: 30, periodMs: 60_000 });

export const ALL: APIRoute = ({ request }) =>
  handleSemanticRequest(request, {
    env: {
      TYPESAFE_API_KEY: env.TYPESAFE_API_KEY,
      TYPESAFE_BASE_URL: env.TYPESAFE_BASE_URL,
      TYPESAFE_MODEL: env.TYPESAFE_MODEL,
    },
    rateLimiter,
    cache,
  });
