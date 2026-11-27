import { describe, expect, it } from 'vitest';

import type { NormalizedEvent } from '../collect/schemas.js';

import {
  calculateAverageChangesRequested,
  calculateFirstReviewApprovalRate,
  calculateMedianIssueLeadTime,
  calculateMetrics,
  calculateQuestionTime,
  countEscalations,
  countIssuesClosed,
  countIssuesCreated,
  countPullRequestsCreated,
  countPullRequestsMerged,
  type MetricsPeriod,
} from './calculations.js';

const DAY = 24 * 60 * 60 * 1000;
const period: MetricsPeriod = {
  start: '2026-05-01T00:00:00Z',
  end: '2026-06-01T00:00:00Z',
};

const common = {
  repository: 'octo/example',
  actor: 'alice',
  title: 'Work item',
};

function event(
  type: 'issue_created' | 'issue_closed' | 'pr_created' | 'pr_merged',
  number: number,
  timestamp: string,
): NormalizedEvent {
  const subject = type.startsWith('issue_') ? 'issue' : 'pull_request';
  return { ...common, type, subject, number, timestamp } as NormalizedEvent;
}

function review(
  number: number,
  timestamp: string,
  reviewState: string,
): NormalizedEvent {
  return {
    ...common,
    type: 'review_submitted',
    subject: 'pull_request',
    number,
    timestamp,
    reviewState,
    body: '',
  };
}

function comment(
  number: number,
  timestamp: string,
  body: string,
): NormalizedEvent {
  return {
    ...common,
    type: 'comment_added',
    subject: 'pull_request',
    number,
    timestamp,
    commentKind: 'issue',
    body,
  };
}

function label(
  type: 'label_added' | 'label_removed',
  number: number,
  timestamp: string,
  value: string,
  subject: 'issue' | 'pull_request' = 'issue',
): NormalizedEvent {
  return {
    ...common,
    type,
    subject,
    number,
    timestamp,
    label: value,
  };
}

describe('event counts', () => {
  const events = [
    event('issue_created', 1, '2026-05-01T00:00:00Z'),
    event('issue_created', 2, '2026-06-01T00:00:00Z'),
    event('issue_closed', 1, '2026-05-03T00:00:00Z'),
    event('pr_created', 3, '2026-05-04T00:00:00Z'),
    event('pr_merged', 3, '2026-05-05T00:00:00Z'),
  ];

  it('counts issues created in the half-open period', () => {
    expect(countIssuesCreated(events, period)).toBe(1);
  });

  it('counts issues closed in the period', () => {
    expect(countIssuesClosed(events, period)).toBe(1);
  });

  it('counts pull requests created in the period', () => {
    expect(countPullRequestsCreated(events, period)).toBe(1);
  });

  it('counts pull requests merged in the period', () => {
    expect(countPullRequestsMerged(events, period)).toBe(1);
  });
});

describe('calculateFirstReviewApprovalRate', () => {
  it('calculates the rate using only PRs with decision comments', () => {
    const events = [
      event('pr_created', 1, '2026-05-01T00:00:00Z'),
      event('pr_created', 2, '2026-05-01T00:00:00Z'),
      event('pr_created', 3, '2026-05-01T00:00:00Z'),
      comment(1, '2026-05-02T00:00:00Z', '判定: APPROVE\nLooks good'),
      comment(2, '2026-05-02T00:00:00Z', '判定: REQUEST_CHANGES'),
      comment(2, '2026-05-03T00:00:00Z', '判定: APPROVE'),
      review(3, '2026-05-02T00:00:00Z', 'APPROVED'),
      comment(3, '2026-05-03T00:00:00Z', 'Review complete\n判定: APPROVE'),
    ];

    expect(calculateFirstReviewApprovalRate(events, period)).toBe(1 / 2);
  });

  it('returns zero when no PR has a decision comment', () => {
    const events = [
      event('pr_created', 1, '2026-05-01T00:00:00Z'),
      review(1, '2026-05-02T00:00:00Z', 'APPROVED'),
      comment(1, '2026-05-03T00:00:00Z', 'Review complete\n判定: APPROVE'),
    ];

    expect(calculateFirstReviewApprovalRate(events, period)).toBe(0);
  });
});

describe('calculateAverageChangesRequested', () => {
  it('calculates request-changes decision comments per PR', () => {
    const events = [
      event('pr_created', 1, '2026-05-01T00:00:00Z'),
      event('pr_created', 2, '2026-05-01T00:00:00Z'),
      comment(1, '2026-05-02T00:00:00Z', '判定: REQUEST_CHANGES'),
      comment(
        1,
        '2026-05-03T00:00:00Z',
        '判定: REQUEST_CHANGES\nPlease add a test',
      ),
      comment(2, '2026-05-04T00:00:00Z', '判定: APPROVE'),
      review(2, '2026-05-05T00:00:00Z', 'CHANGES_REQUESTED'),
    ];

    expect(calculateAverageChangesRequested(events, period)).toBe(1);
    expect(calculateAverageChangesRequested([], period)).toBe(0);
  });
});

describe('calculateMedianIssueLeadTime', () => {
  it('uses issues closed in the period and creation events from before it', () => {
    const events = [
      event('issue_created', 1, '2026-04-28T00:00:00Z'),
      event('issue_closed', 1, '2026-05-03T00:00:00Z'),
      event('issue_created', 2, '2026-05-01T00:00:00Z'),
      event('issue_closed', 2, '2026-05-04T00:00:00Z'),
      event('issue_created', 3, '2026-05-01T00:00:00Z'),
      event('issue_closed', 3, '2026-06-02T00:00:00Z'),
    ];

    expect(calculateMedianIssueLeadTime(events, period)).toBe(4 * DAY);
    expect(calculateMedianIssueLeadTime([], period)).toBe(0);
  });
});

describe('calculateQuestionTime', () => {
  it('clips intervals to the period, closes open labels at the end, and ignores PR labels', () => {
    const events = [
      label('label_added', 1, '2026-04-30T00:00:00Z', 'status:question'),
      label('label_removed', 1, '2026-05-03T00:00:00Z', 'status:question'),
      label('label_added', 2, '2026-05-30T00:00:00Z', 'status:question'),
      label(
        'label_added',
        3,
        '2026-05-01T00:00:00Z',
        'status:question',
        'pull_request',
      ),
    ];

    expect(calculateQuestionTime(events, period)).toEqual({
      totalMilliseconds: 4 * DAY,
      longestMilliseconds: 2 * DAY,
    });
    expect(calculateQuestionTime([], period)).toEqual({
      totalMilliseconds: 0,
      longestMilliseconds: 0,
    });
  });
});

describe('countEscalations', () => {
  it('counts each issue once even when the escalation label is re-added', () => {
    const events = [
      label('label_added', 1, '2026-05-02T00:00:00Z', 'status:escalated'),
      label('label_added', 1, '2026-05-03T00:00:00Z', 'status:escalated'),
      label('label_added', 2, '2026-05-04T00:00:00Z', 'other'),
    ];

    expect(countEscalations(events, period)).toBe(1);
  });
});

describe('calculateMetrics', () => {
  it('returns all metrics without mutating the input', () => {
    const events = [event('issue_created', 1, '2026-05-01T00:00:00Z')];
    const snapshot = structuredClone(events);

    expect(calculateMetrics(events, period)).toMatchObject({
      issuesCreated: 1,
      issuesClosed: 0,
      pullRequestsCreated: 0,
      escalationCount: 0,
    });
    expect(events).toEqual(snapshot);
  });

  it('rejects invalid periods', () => {
    expect(() =>
      calculateMetrics([], {
        start: '2026-06-01T00:00:00Z',
        end: '2026-05-01T00:00:00Z',
      }),
    ).toThrow(RangeError);
  });
});
