export interface RateLimiter {
  limit(key: string): Promise<{ success: boolean }>;
}

/** Minimal shape of the Cloudflare Workers `ratelimits` binding. */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Wraps the Workers rate-limiting binding. */
export function bindingRateLimiter(binding: RateLimitBinding): RateLimiter {
  return {
    limit: (key) => binding.limit({ key }),
  };
}

/**
 * In-memory sliding-window limiter for dev/tests (per-isolate, non-shared).
 */
export function memoryRateLimiter(options?: { limit?: number; periodMs?: number }): RateLimiter {
  const limit = options?.limit ?? 30;
  const periodMs = options?.periodMs ?? 60_000;
  const hits = new Map<string, number[]>();
  return {
    limit: async (key) => {
      const now = Date.now();
      const cutoff = now - periodMs;
      let stamps = hits.get(key) ?? [];
      if (stamps.length > 0) {
        stamps = stamps.filter((t) => t > cutoff);
      }
      if (stamps.length >= limit) {
        hits.set(key, stamps);
        return { success: false };
      }
      stamps.push(now);
      hits.set(key, stamps);
      return { success: true };
    },
  };
}
