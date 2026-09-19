import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJevClient } from '@server/jev/client';
import type { SemanticState } from '@core/semantic/questions';

const STATE: SemanticState = {
  context: 'test context',
  headlines: { H1: 'Secret headline text 9f8d' },
  descriptions: {},
};
const QUESTIONS = { hype: { type: 'noul' as const, instructions: 'x' } };
const CONFIG = { apiKey: 'test-key', baseUrl: 'https://example.test', model: 'jev-1' };

function answersResponse(
  body: unknown = { answers: { hype: { type: 'noul', noul: 0.2 } }, model: 'jev-1' },
) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
  vi.useRealTimers();
});

function assertNoAdTextInLogs() {
  for (const call of consoleSpy.mock.calls) {
    expect(String(call)).not.toContain('Secret headline text 9f8d');
  }
}

describe('createJevClient', () => {
  it('returns ok with parsed answers and sends Authorization', async () => {
    const fetchStub = vi.fn().mockResolvedValue(answersResponse());
    const client = createJevClient({ ...CONFIG, fetch: fetchStub });
    const outcome = await client.evaluate(STATE, QUESTIONS);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.model).toBe('jev-1');
      expect((outcome.raw as Record<string, unknown>).hype).toBeDefined();
    }
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/v1/systemone');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(init.method).toBe('POST');
    assertNoAdTextInLogs();
  });

  it('retries once after 429 and honors Retry-After capped at 2000ms', async () => {
    vi.useFakeTimers();
    const rateLimited = new Response('slow down', {
      status: 429,
      headers: { 'Retry-After': '30' }, // capped to 2000ms
    });
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(answersResponse());
    const client = createJevClient({ ...CONFIG, fetch: fetchStub });
    const pending = client.evaluate(STATE, QUESTIONS);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const outcome = await pending;
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(outcome.ok).toBe(true);
  });

  it('returns upstream_error after two 500s', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const client = createJevClient({ ...CONFIG, fetch: fetchStub });
    const outcome = await client.evaluate(STATE, QUESTIONS);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('upstream_error');
      expect(outcome.httpStatus).toBe(500);
    }
    expect(fetchStub).toHaveBeenCalledTimes(2);
    assertNoAdTextInLogs();
  });

  it('returns network after two TypeError rejections', async () => {
    const fetchStub = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const client = createJevClient({ ...CONFIG, fetch: fetchStub });
    const outcome = await client.evaluate(STATE, QUESTIONS);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('network');
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('returns timeout when fetch never resolves', async () => {
    const fetchStub = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          // Behaves like a real fetch: rejects when the attempt's signal aborts.
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('timed out');
            err.name = 'TimeoutError';
            reject(err);
          });
        }),
    );
    const client = createJevClient({
      ...CONFIG,
      fetch: fetchStub,
      timeoutMs: 50,
      maxRetries: 0,
    });
    const outcome = await client.evaluate(STATE, QUESTIONS);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('timeout');
  });

  it('returns invalid_response for malformed JSON', async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValue(
        new Response('<not json', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      );
    const client = createJevClient({ ...CONFIG, fetch: fetchStub });
    const outcome = await client.evaluate(STATE, QUESTIONS);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('invalid_response');
  });

  it('returns invalid_response when answers is missing', async () => {
    const fetchStub = vi.fn().mockResolvedValue(answersResponse({ nope: true }));
    const client = createJevClient({ ...CONFIG, fetch: fetchStub });
    const outcome = await client.evaluate(STATE, QUESTIONS);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('invalid_response');
  });

  it('returns not_configured without calling fetch when the key is missing', async () => {
    const fetchStub = vi.fn();
    const client = createJevClient({ ...CONFIG, apiKey: undefined, fetch: fetchStub });
    const outcome = await client.evaluate(STATE, QUESTIONS);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('not_configured');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('maps 401/403 to upstream_error without retry', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    const client = createJevClient({ ...CONFIG, fetch: fetchStub });
    const outcome = await client.evaluate(STATE, QUESTIONS);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('upstream_error');
      expect(outcome.httpStatus).toBe(401);
    }
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
