import { describe, expect, it, vi } from 'vitest';

import type { Facts } from '../facts/index.js';

import type { Character } from './characters.js';
import {
  buildDailyPrompt,
  ClaudeCliClient,
  type ClaudeClient,
  type ClaudeCommandRunner,
  writeDailyReport,
} from './prompt.js';

const facts: Facts = {
  period: { kind: 'daily', date: '2026-11-07' },
  metrics: {
    issuesCreated: 1,
    issuesClosed: 0,
    pullRequestsCreated: 1,
    pullRequestsMerged: 0,
    firstReviewApprovalRate: 0,
    averageChangesRequestedPerPullRequest: 0,
    medianIssueLeadTimeMilliseconds: 0,
    questionTime: { totalMilliseconds: 0, longestMilliseconds: 0 },
    escalationCount: 0,
  },
  eventCandidates: [],
  issues: [{ repository: 'octo/example', number: 23, title: '日報を書く' }],
  pullRequests: [],
  employeeActivities: [
    { role: 'pm', name: '竹中官兵衛', summary: 'Issue #23 を整理した。' },
    { role: 'engineer', name: '藤堂秀吉', summary: 'PR を実装した。' },
    { role: 'reviewer', name: '大岡三成', summary: '本日の活動なし' },
    { role: 'president', name: '織田家康', summary: '本日の活動なし' },
  ],
};

const characters: Character[] = [
  { role: 'pm', name: '竹中官兵衛', description: '落ち着いた武家言葉' },
  { role: 'engineer', name: '藤堂秀吉', description: '短文。体言止め' },
  { role: 'reviewer', name: '大岡三成', description: '申し渡し調' },
  { role: 'president', name: '織田家康', description: '簡潔に話す' },
];

describe('buildDailyPrompt', () => {
  it('combines daily facts with the matching character settings', () => {
    const prompt = buildDailyPrompt(facts, characters);

    expect(prompt).toContain('2026-11-07 の日報');
    expect(prompt).toContain('"number": 23');
    expect(prompt).toContain('"name": "藤堂秀吉"');
    expect(prompt).toContain('"character": "短文。体言止め"');
    expect(prompt).toContain(
      'activity が「本日の活動なし」の社員は、見出しの下に「本日の活動なし」とだけ書く。',
    );
    expect(prompt).toContain('facts にない出来事');
  });

  it('rejects monthly facts', () => {
    expect(() =>
      buildDailyPrompt(
        { ...facts, period: { kind: 'monthly', month: '2026-11' } },
        characters,
      ),
    ).toThrow('requires daily facts');
  });

  it('rejects missing character settings', () => {
    expect(() => buildDailyPrompt(facts, characters.slice(1))).toThrow(
      'Missing character definition for pm',
    );
  });
});

describe('ClaudeCliClient', () => {
  it('runs claude -p through the injected command runner', async () => {
    const run = vi
      .fn<ClaudeCommandRunner['run']>()
      .mockResolvedValue('# 日報\n');
    const client = new ClaudeCliClient({ run });

    await expect(client.generate('日報プロンプト')).resolves.toBe('# 日報\n');
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith('claude', ['-p', '日報プロンプト']);
  });

  it('supports a custom executable', async () => {
    const run = vi.fn<ClaudeCommandRunner['run']>().mockResolvedValue('日報');
    const client = new ClaudeCliClient({ run }, '/opt/bin/claude-test');

    await client.generate('prompt');

    expect(run).toHaveBeenCalledWith('/opt/bin/claude-test', ['-p', 'prompt']);
  });
});

describe('writeDailyReport', () => {
  it('passes the assembled prompt to the injected Claude client', async () => {
    const generate = vi
      .fn<ClaudeClient['generate']>()
      .mockResolvedValue('# 2026-11-07 日報');

    await expect(
      writeDailyReport(facts, characters, { generate }),
    ).resolves.toBe('# 2026-11-07 日報');
    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(buildDailyPrompt(facts, characters));
  });
});
