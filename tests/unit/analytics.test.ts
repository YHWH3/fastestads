import { afterEach, describe, expect, it, vi } from 'vitest';
import { track, type AnalyticsEvent } from '@ui/analytics';

interface Captured {
  name: AnalyticsEvent;
  props: Record<string, string | number | boolean>;
}

function installWindow() {
  const captured: Captured[] = [];
  const faTrack = vi.fn();
  const listeners = new Map<string, EventListener[]>();
  const win = {
    dispatchEvent: (event: Event) => {
      const detail = (event as CustomEvent).detail as Captured;
      captured.push(detail);
      for (const l of listeners.get(event.type) ?? []) l(event);
      return true;
    },
    addEventListener: (type: string, l: EventListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), l]);
    },
    __faTrack: faTrack,
  };
  (globalThis as { window?: unknown }).window = win;
  return { captured, faTrack, win };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe('track', () => {
  it('dispatches a fa:track CustomEvent with the event name and props', () => {
    const { captured } = installWindow();
    track('analysis_completed', { issueCount: 3 });
    expect(captured).toEqual([{ name: 'analysis_completed', props: { issueCount: 3 } }]);
  });

  it('calls window.__faTrack when installed', () => {
    const { faTrack } = installWindow();
    track('tool_view', { tool: 'google-ads-headline-checker' });
    expect(faTrack).toHaveBeenCalledWith('tool_view', { tool: 'google-ads-headline-checker' });
  });

  it('truncates string props at 64 characters', () => {
    const { captured, faTrack } = installWindow();
    const long = 'x'.repeat(100);
    track('issue_type_detected', { ruleId: long });
    expect(captured[0].props.ruleId).toBe('x'.repeat(64));
    expect((faTrack.mock.calls[0][1] as Record<string, string>).ruleId).toBe('x'.repeat(64));
  });

  it('cannot carry ad text longer than 64 chars', () => {
    const { captured } = installWindow();
    const adText =
      'This is a very long headline that the advertiser typed into the tool for review';
    track('analysis_started', { note: adText });
    expect(String(captured[0].props.note).length).toBe(64);
    expect(captured[0].props.note).not.toBe(adText);
  });

  it('is a no-op without window', () => {
    expect(() => track('tool_view')).not.toThrow();
  });
});
