import { describe, expect, it } from 'vitest';

import type { NormalizedEvent } from '../collect/schemas.js';

import { extractEventCandidates } from './candidates.js';

const common = {
  repository: 'octo/example',
  actor: 'alice',
};

function review(number: number, day: number): NormalizedEvent {
  return {
    ...common,
    type: 'review_submitted',
    subject: 'pull_request',
    number,
    title: `PR ${number}`,
    timestamp: `2026-05-0${day}T00:00:00Z`,
    reviewState: 'CHANGES_REQUESTED',
    body: 'Please revise',
  };
}

describe('extractEventCandidates', () => {
  it('extracts escalations, PRs changed at least three times, and merged PRs', () => {
    const events: NormalizedEvent[] = [
      {
        ...common,
        type: 'label_added',
        subject: 'issue',
        number: 1,
        title: 'Need a decision',
        timestamp: '2026-05-01T00:00:00Z',
        label: 'status:escalated',
      },
      {
        ...common,
        type: 'label_added',
        subject: 'issue',
        number: 1,
        title: 'Need a decision',
        timestamp: '2026-05-02T00:00:00Z',
        label: 'status:escalated',
      },
      review(2, 2),
      review(2, 3),
      review(2, 4),
      review(3, 2),
      {
        ...common,
        type: 'pr_merged',
        subject: 'pull_request',
        number: 4,
        title: 'Ship newsletter',
        timestamp: '2026-05-05T00:00:00Z',
      },
    ];

    expect(
      extractEventCandidates(events, {
        start: '2026-05-01T00:00:00Z',
        end: '2026-06-01T00:00:00Z',
      }),
    ).toEqual([
      expect.objectContaining({
        kind: 'escalation',
        number: 1,
        speaker: 'organization',
      }),
      expect.objectContaining({
        kind: 'repeated_changes_requested',
        number: 2,
        changesRequestedCount: 3,
        speaker: 'reviewer',
      }),
      expect.objectContaining({
        kind: 'pull_request_merged',
        number: 4,
      }),
    ]);
  });

  it('returns no candidates for events outside the period', () => {
    expect(
      extractEventCandidates([review(1, 2), review(1, 3), review(1, 4)], {
        start: '2026-06-01T00:00:00Z',
        end: '2026-07-01T00:00:00Z',
      }),
    ).toEqual([]);
  });
});
