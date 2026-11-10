import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { filterEventsByTokyoDateRange } from './date-range.js';
import type { NormalizedEvent } from './schemas.js';

function eventAt(timestamp: string, number: number): NormalizedEvent {
  return {
    type: 'issue_created',
    subject: 'issue',
    repository: 'octo/example',
    timestamp,
    actor: 'octocat',
    number,
    title: `Issue ${number}`,
  };
}

describe('filterEventsByTokyoDateRange', () => {
  it('includes both endpoint dates using Asia/Tokyo day boundaries', () => {
    const events = [
      eventAt('2026-04-30T14:59:59Z', 1),
      eventAt('2026-04-30T15:00:00Z', 2),
      eventAt('2026-05-02T14:59:59Z', 3),
      eventAt('2026-05-02T15:00:00Z', 4),
    ];

    const filtered = filterEventsByTokyoDateRange(events, {
      from: '2026-05-01',
      to: '2026-05-02',
    });

    expect(filtered.map((event) => event.number)).toEqual([2, 3]);
  });

  it('accepts a single-day range', () => {
    const events = [eventAt('2026-05-01T03:00:00Z', 1)];

    expect(
      filterEventsByTokyoDateRange(events, {
        from: '2026-05-01',
        to: '2026-05-01',
      }),
    ).toEqual(events);
  });

  it('rejects a reversed range', () => {
    expect(() =>
      filterEventsByTokyoDateRange([], {
        from: '2026-05-02',
        to: '2026-05-01',
      }),
    ).toThrow(RangeError);
  });

  it('rejects an invalid calendar date', () => {
    expect(() =>
      filterEventsByTokyoDateRange([], {
        from: '2026-02-30',
        to: '2026-03-01',
      }),
    ).toThrow(ZodError);
  });
});
