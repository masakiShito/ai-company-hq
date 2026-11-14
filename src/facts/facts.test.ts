import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { buildFacts, type BuildFactsInput } from './builder.js';
import { outputFactsForDryRun } from './dry-run.js';
import { FactsSchema } from './schema.js';

const validInput = {
  period: { kind: 'daily', date: '2026-11-07' } as const,
  metrics: {
    issuesCreated: 2,
    issuesClosed: 1,
    pullRequestsCreated: 1,
    pullRequestsMerged: 1,
    firstReviewApprovalRate: 1,
    averageChangesRequestedPerPullRequest: 3,
    medianIssueLeadTimeMilliseconds: 86_400_000,
    questionTime: {
      totalMilliseconds: 7_200_000,
      longestMilliseconds: 7_200_000,
    },
    escalationCount: 1,
  },
  eventCandidates: [
    {
      kind: 'repeated_changes_requested',
      repository: 'octo/example',
      number: 12,
      title: 'Build facts',
      timestamp: '2026-11-07T03:00:00Z',
      speaker: 'reviewer',
      changesRequestedCount: 3,
    },
  ] as const,
  issues: [
    { repository: 'octo/example', number: 4, title: 'Newsletter facts' },
  ],
  pullRequests: [
    { repository: 'octo/example', number: 12, title: 'Build facts' },
  ],
  employeeActivities: [
    {
      role: 'pm',
      name: '竹中官兵衛',
      summary: 'Issue #4 の進捗を確認した。',
    },
    {
      role: 'engineer',
      name: '藤堂秀吉',
      summary: 'PR #12 を実装した。',
    },
    {
      role: 'reviewer',
      name: '大岡三成',
      summary: 'PR #12 をレビューした。',
    },
    {
      role: 'president',
      name: '織田家康',
      summary: '本日の活動なし',
    },
  ],
} satisfies BuildFactsInput;

describe('buildFacts', () => {
  it('builds facts from metrics output and related factual records', () => {
    const facts = buildFacts(validInput);

    expect(facts).toEqual(validInput);
    expect(FactsSchema.parse(facts)).toEqual(facts);
  });

  it('supports a monthly period', () => {
    const facts = buildFacts({
      ...validInput,
      period: { kind: 'monthly', month: '2026-11' },
    });

    expect(facts.period).toEqual({ kind: 'monthly', month: '2026-11' });
  });

  it('rejects facts that cannot be safely passed to the LLM', () => {
    expect(() =>
      buildFacts({
        ...validInput,
        metrics: { ...validInput.metrics, firstReviewApprovalRate: 1.2 },
      }),
    ).toThrow(ZodError);
  });

  it('rejects a daily summary when an employee is missing', () => {
    expect(() =>
      buildFacts({
        ...validInput,
        employeeActivities: validInput.employeeActivities.slice(1),
      }),
    ).toThrow(ZodError);
  });
});

describe('outputFactsForDryRun', () => {
  it('writes parseable JSON to stdout for --dry-run', () => {
    const facts = buildFacts(validInput);
    const output = vi.fn<(contents: string) => void>();

    expect(outputFactsForDryRun(facts, ['daily', '--dry-run'], output)).toBe(
      true,
    );
    expect(output).toHaveBeenCalledOnce();
    expect(FactsSchema.parse(JSON.parse(output.mock.calls[0][0]))).toEqual(
      facts,
    );
  });

  it('does not write output without --dry-run', () => {
    const output = vi.fn<(contents: string) => void>();

    expect(outputFactsForDryRun(buildFacts(validInput), [], output)).toBe(
      false,
    );
    expect(output).not.toHaveBeenCalled();
  });
});
