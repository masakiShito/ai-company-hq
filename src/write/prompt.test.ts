import { describe, expect, it, vi } from 'vitest';

import type { Facts } from '../facts/index.js';

import type { Character } from './characters.js';
import {
  buildDailyPrompt,
  buildMonthlyMetricsTable,
  buildMonthlyPrompt,
  ClaudeCliClient,
  type ClaudeClient,
  type ClaudeCommandRunner,
  insertMonthlyMetricsTable,
  writeDailyReport,
  writeMonthlyReport,
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

const monthlyFacts: Facts = {
  period: { kind: 'monthly', month: '2026-11' },
  metrics: {
    issuesCreated: 12,
    issuesClosed: 8,
    pullRequestsCreated: 10,
    pullRequestsMerged: 9,
    firstReviewApprovalRate: 0.75,
    averageChangesRequestedPerPullRequest: 1.5,
    medianIssueLeadTimeMilliseconds: 2 * 24 * 60 * 60 * 1000 + 3_600_000,
    questionTime: {
      totalMilliseconds: 3 * 24 * 60 * 60 * 1000 + 7_200_000,
      longestMilliseconds: 24 * 60 * 60 * 1000 + 1_800_000,
    },
    escalationCount: 2,
  },
  eventCandidates: [
    {
      kind: 'repeated_changes_requested',
      repository: 'octo/example',
      number: 24,
      title: '月刊社内報を書く',
      timestamp: '2026-11-15T09:00:00+09:00',
      speaker: 'reviewer',
      changesRequestedCount: 3,
    },
  ],
  issues: [
    { repository: 'octo/example', number: 24, title: '月刊社内報を書く' },
  ],
  pullRequests: [
    { repository: 'octo/example', number: 30, title: '月刊社内報を実装' },
  ],
  employeeActivities: [],
};

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

describe('buildMonthlyPrompt', () => {
  it('combines monthly facts, required sections, and character settings', () => {
    const prompt = buildMonthlyPrompt(monthlyFacts, characters);

    expect(prompt).toContain('2026-11 の月刊社内報');
    expect(prompt).toContain('巻頭言（竹中官兵衛の語り口）');
    expect(prompt).toContain('今月の出来事（事件簿）');
    expect(prompt).toContain('今月のMVP指摘（大岡三成が選び');
    expect(prompt).toContain('社長の返信待ち時間ランキング');
    expect(prompt).toContain('編集後記');
    expect(prompt).toContain('<!-- MONTHLY_METRICS_TABLE -->');
    expect(prompt).toContain('"changesRequestedCount": 3');
    expect(prompt).toContain('Issue 別の待ち時間や順位を創作しない');
    expect(prompt).toContain('"description": "落ち着いた武家言葉"');
  });

  it('rejects daily facts', () => {
    expect(() => buildMonthlyPrompt(facts, characters)).toThrow(
      'requires monthly facts',
    );
  });

  it('rejects missing character settings', () => {
    expect(() => buildMonthlyPrompt(monthlyFacts, characters.slice(1))).toThrow(
      'Missing character definition for pm',
    );
  });
});

describe('buildMonthlyMetricsTable', () => {
  it('formats every monthly metric as a Markdown table', () => {
    const table = buildMonthlyMetricsTable(monthlyFacts);

    expect(table).toContain('| 作成 Issue 数 | 12件 |');
    expect(table).toContain('| 初回レビュー承認率 | 75% |');
    expect(table).toContain('| PR あたり平均差し戻し回数 | 1.5回 |');
    expect(table).toContain('| Issue リードタイム中央値 | 2日 1時間 |');
    expect(table).toContain('| 社長の返信待ち時間（合計） | 3日 2時間 |');
    expect(table).toContain('| 社長の返信待ち時間（最長） | 1日 30分 |');
    expect(table).toContain('| エスカレーション件数 | 2件 |');
  });

  it('rejects daily facts', () => {
    expect(() => buildMonthlyMetricsTable(facts)).toThrow(
      'requires monthly facts',
    );
  });
});

describe('insertMonthlyMetricsTable', () => {
  it('replaces the marker with the code-generated table', () => {
    const report = insertMonthlyMetricsTable(
      '# 今月の数字\n\n<!-- MONTHLY_METRICS_TABLE -->\n\n# 編集後記',
      monthlyFacts,
    );

    expect(report).toContain(buildMonthlyMetricsTable(monthlyFacts));
    expect(report).not.toContain('MONTHLY_METRICS_TABLE');
  });

  it('rejects a generated report without the marker', () => {
    expect(() =>
      insertMonthlyMetricsTable('# 月刊社内報', monthlyFacts),
    ).toThrow('missing the metrics table marker');
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

describe('writeMonthlyReport', () => {
  it('uses the injected Claude client and inserts the metrics table', async () => {
    const generate = vi
      .fn<ClaudeClient['generate']>()
      .mockResolvedValue(
        [
          '# 2026-11 月刊社内報',
          '',
          '## 今月の数字',
          '<!-- MONTHLY_METRICS_TABLE -->',
        ].join('\n'),
      );

    const report = await writeMonthlyReport(monthlyFacts, characters, {
      generate,
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(
      buildMonthlyPrompt(monthlyFacts, characters),
    );
    expect(report).toContain(buildMonthlyMetricsTable(monthlyFacts));
    expect(report).not.toContain('MONTHLY_METRICS_TABLE');
  });
});
