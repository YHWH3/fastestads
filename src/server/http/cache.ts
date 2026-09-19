/** In-isolate LRU with TTL — duplicate-request suppression for semantic calls. */
export class LruCache<T> {
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly map = new Map<string, { value: T; expires: number }>();

  constructor(max = 200, ttlMs = 600_000) {
    this.max = max;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (entry.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

export interface CanonicalSemanticPayload {
  headlines: string[];
  descriptions: string[];
  keyword?: string;
}

/**
 * Canonical form for cache keys: trimmed strings, non-empty entries only,
 * keyword lowercased — so cosmetic differences share a cache entry.
 */
export function canonicalizePayload(payload: CanonicalSemanticPayload): string {
  const canonical = {
    d: payload.descriptions.map((s) => s.trim()).filter((s) => s !== ''),
    h: payload.headlines.map((s) => s.trim()).filter((s) => s !== ''),
    k: payload.keyword?.trim().toLowerCase() ?? '',
  };
  return JSON.stringify(canonical);
}

export async function semanticCacheKey(payload: CanonicalSemanticPayload): Promise<string> {
  const data = new TextEncoder().encode(canonicalizePayload(payload));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
