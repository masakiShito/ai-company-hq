import { describe, expect, it, vi } from 'vitest';

import type { Facts } from '../facts/index.js';

import {
  extractReferencedNumbers,
  generateVerifiedReport,
  validateReportReferences,
} from './verify.js';

const facts: Facts = {
  period: { kind: 'monthly', month: '2026-11' },
  metrics: {
    issuesCreated: 1,
    issuesClosed: 1,
    pullRequestsCreated: 1,
    pullRequestsMerged: 1,
    firstReviewApprovalRate: 1,
    averageChangesRequestedPerPullRequest: 0,
    medianIssueLeadTimeMilliseconds: 0,
    questionTime: { totalMilliseconds: 0, longestMilliseconds: 0 },
    escalationCount: 0,
  },
  eventCandidates: [
    {
      kind: 'pull_request_merged',
      repository: 'octo/example',
      number: 30,
      title: '社内報を実装',
      timestamp: '2026-11-15T09:00:00+09:00',
      speaker: 'organization',
    },
  ],
  issues: [{ repository: 'octo/example', number: 6, title: '本文を検証' }],
  pullRequests: [
    { repository: 'octo/example', number: 30, title: '社内報を実装' },
  ],
  employeeActivities: [],
};

describe('extractReferencedNumbers', () => {
  it('extracts every #number in occurrence order', () => {
    expect(
      extractReferencedNumbers('Issue #6 を PR #30 で解決。再掲: #6'),
    ).toEqual([6, 30, 6]);
  });
});

describe('validateReportReferences', () => {
  it('accepts references present in facts', () => {
    expect(() =>
      validateReportReferences('Issue #6 と PR #30', facts),
    ).not.toThrow();
  });

  it('reports every referenced number missing from facts', () => {
    expect(() =>
      validateReportReferences('存在しない Issue #99 と PR #100', facts),
    ).toThrow('numbers missing from facts: #99, #100');
  });
});

describe('generateVerifiedReport', () => {
  it('regenerates once after validation failure', async () => {
    const generate = vi
      .fn<(prompt: string) => Promise<string>>()
      .mockResolvedValueOnce('存在しない #99')
      .mockResolvedValueOnce('確認済み #6');

    await expect(
      generateVerifiedReport('prompt', facts, { generate }),
    ).resolves.toBe('確認済み #6');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenNthCalledWith(1, 'prompt');
    expect(generate).toHaveBeenNthCalledWith(2, 'prompt');
  });

  it('fails after the regenerated report is also invalid', async () => {
    const generate = vi
      .fn<(prompt: string) => Promise<string>>()
      .mockResolvedValueOnce('存在しない #99')
      .mockResolvedValueOnce('やはり存在しない #100');

    await expect(
      generateVerifiedReport('prompt', facts, { generate }),
    ).rejects.toThrow('numbers missing from facts: #100');
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
