import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RawCache } from './collect/cache.js';
import type { GhApiClient } from './collect/gh-client.js';
import { FactsSchema } from './facts/index.js';
import { runCli } from './index.js';
import { createTokyoMonthPeriod } from './monthly.js';
import { buildMonthlyMetricsTable, type ClaudeClient } from './write/index.js';

const repository = 'octo/example';
const issues = [
  {
    number: 7,
    title: 'November issue',
    state: 'closed',
    created_at: '2026-10-31T15:00:00Z',
    closed_at: '2026-11-30T14:59:59Z',
    user: { login: 'pm' },
    closed_by: { login: 'engineer' },
    labels: [],
  },
  {
    number: 8,
    title: 'December issue',
    state: 'open',
    created_at: '2026-11-30T15:00:00Z',
    closed_at: null,
    user: { login: 'pm' },
    labels: [],
  },
];
const pullRequests = [
  {
    number: 9,
    title: 'Monthly CLI',
    state: 'closed',
    created_at: '2026-11-10T01:00:00Z',
    closed_at: '2026-11-11T03:00:00Z',
    merged_at: '2026-11-11T03:00:00Z',
    user: { login: 'engineer' },
    merged_by: { login: 'president' },
    head: { ref: 'feat/monthly-cli' },
    labels: [],
  },
];

const november2026PullRequests = [
  ...[
    {
      number: 10,
      title: 'chore: 秀吉への依頼を codex exec に改める',
      createdAt: '2026-11-07T12:01:44Z',
      mergedAt: '2026-11-07T12:01:48Z',
      headRef: 'chore/codex-exec',
    },
    {
      number: 12,
      title: 'chore: 秀吉に見張り番を付ける',
      createdAt: '2026-11-07T23:55:33Z',
      mergedAt: '2026-11-07T23:55:37Z',
      headRef: 'chore/codex-watchdog',
    },
    {
      number: 13,
      title: 'chore: 秀吉の考え込みすぎを改める',
      createdAt: '2026-11-10T00:37:30Z',
      mergedAt: '2026-11-10T00:37:36Z',
      headRef: 'chore/codex-tuning',
    },
    {
      number: 18,
      title: 'chore: 自律モード化 — PM がマージまで行う',
      createdAt: '2026-11-14T06:06:25Z',
      mergedAt: '2026-11-14T06:10:22Z',
      headRef: 'chore/autonomous-mode',
    },
  ].map(({ number, title, createdAt, mergedAt, headRef }) => ({
    number,
    title,
    state: 'closed',
    created_at: createdAt,
    closed_at: mergedAt,
    merged_at: mergedAt,
    user: { login: 'company-owner' },
    merged_by: { login: 'company-owner' },
    head: { ref: headRef },
    labels: [],
  })),
  {
    number: 11,
    title: 'chore: プロジェクト基盤をセットアップ',
    state: 'closed',
    created_at: '2026-11-07T12:09:28Z',
    closed_at: '2026-11-07T12:18:04Z',
    merged_at: '2026-11-07T12:18:04Z',
    user: { login: 'engineer' },
    merged_by: { login: 'company-owner' },
    head: { ref: 'feat/1-project-setup' },
    labels: [],
  },
];

function createGitHubMock(): GhApiClient {
  return {
    api: vi.fn<GhApiClient['api']>(async (endpoint) => {
      if (endpoint.includes('issues?state=all')) return issues;
      if (endpoint.includes('pulls?state=all')) return pullRequests;
      if (endpoint.includes('issues/comments')) return [];
      if (endpoint.includes('pulls/comments')) return [];
      if (endpoint.includes('pulls/9/reviews')) return [];
      if (endpoint.includes('/timeline')) return [];
      throw new Error(`Unexpected gh api endpoint: ${endpoint}`);
    }),
  };
}

function createNovember2026GitHubMock(): GhApiClient {
  return {
    api: vi.fn<GhApiClient['api']>(async (endpoint) => {
      if (endpoint.includes('issues?state=all')) return [];
      if (endpoint.includes('pulls?state=all')) {
        return november2026PullRequests;
      }
      if (endpoint.includes('issues/comments')) {
        return [
          {
            issue_url: `https://api.github.com/repos/${repository}/issues/11`,
            created_at: '2026-11-07T12:14:47Z',
            user: { login: 'company-owner' },
            body: '判定: APPROVE\n\n必須の指摘なし',
          },
        ];
      }
      if (endpoint.includes('pulls/comments')) return [];
      if (endpoint.includes('/reviews')) return [];
      if (endpoint.includes('/timeline')) return [];
      throw new Error(`Unexpected gh api endpoint: ${endpoint}`);
    }),
  };
}

function createMemoryCache(): RawCache {
  const values = new Map<string, unknown>();
  return {
    get: async (key) => values.get(key),
    set: async (key, value) => {
      values.set(key, value);
    },
  };
}

describe('monthly CLI E2E', () => {
  let temporaryDirectory: string;
  let configPath: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'newsletter-e2e-'));
    configPath = path.join(temporaryDirectory, 'company.config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        name: 'Test Company',
        timezone: 'Asia/Tokyo',
        repos: [repository],
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('mocks gh api and claude -p to generate a verified monthly report', async () => {
    const generate = vi.fn<ClaudeClient['generate']>(async () =>
      [
        '# 2026-11 月刊社内報',
        '## 巻頭言',
        '## 今月の数字',
        '<!-- MONTHLY_METRICS_TABLE -->',
        '## 今月の出来事（事件簿）',
        'PR #9',
        '## 今月のMVP指摘',
        '## 社長の返信待ち時間ランキング',
        '## 編集後記',
      ].join('\n'),
    );
    const outputDirectory = path.join(temporaryDirectory, 'issues', 'monthly');

    const exitCode = await runCli(['monthly', '2026-11'], {
      configPath,
      charactersDirectory: 'characters',
      outputDirectory,
      githubClient: createGitHubMock(),
      cache: createMemoryCache(),
      claude: { generate },
    });

    expect(exitCode).toBe(0);
    expect(generate).toHaveBeenCalledOnce();
    const report = await readFile(
      path.join(outputDirectory, '2026-11.md'),
      'utf8',
    );
    expect(report).toContain('| 作成 Issue 数 | 1件 |');
    expect(report).toContain('## 巻頭言');
    expect(report).not.toContain('MONTHLY_METRICS_TABLE');
  });

  it('prints monthly facts as JSON without calling claude in dry-run mode', async () => {
    const generate = vi.fn<ClaudeClient['generate']>();
    const output: string[] = [];

    const exitCode = await runCli(['monthly', '2026-11', '--dry-run'], {
      configPath,
      githubClient: createGitHubMock(),
      cache: createMemoryCache(),
      claude: { generate },
      output: (contents) => output.push(contents),
    });

    expect(exitCode).toBe(0);
    expect(generate).not.toHaveBeenCalled();
    const facts = FactsSchema.parse(JSON.parse(output.join('')));
    expect(facts.period).toEqual({ kind: 'monthly', month: '2026-11' });
    expect(facts.issues.map(({ number }) => number)).toEqual([7]);
    expect(facts.pullRequests.map(({ number }) => number)).toEqual([9]);
    expect(buildMonthlyMetricsTable(facts)).toContain(
      '| 作成 Issue 数 | 1件 |',
    );
  });

  it('reports president and reviewer activity from November 2026 data in dry-run mode', async () => {
    const output: string[] = [];

    const exitCode = await runCli(['monthly', '2026-11', '--dry-run'], {
      configPath,
      githubClient: createNovember2026GitHubMock(),
      cache: createMemoryCache(),
      output: (contents) => output.push(contents),
    });

    expect(exitCode).toBe(0);
    const facts = FactsSchema.parse(JSON.parse(output.join('')));
    const reviewer = facts.employeeActivities.find(
      ({ role }) => role === 'reviewer',
    );
    const president = facts.employeeActivities.find(
      ({ role }) => role === 'president',
    );

    expect(reviewer).toMatchObject({
      name: '大岡三成',
      role: 'reviewer',
    });
    expect(reviewer?.summary).not.toBe('今月の活動なし');
    expect(president).toMatchObject({
      name: '織田家康',
      role: 'president',
    });
    expect(president?.summary).not.toBe('今月の活動なし');
    for (const number of [10, 12, 13, 18]) {
      expect(president?.summary).toContain(`#${number}`);
    }
    expect(facts.metrics.firstReviewApprovalRate).toBeGreaterThan(0);
  });

  it('returns exit code 1 when report validation repeatedly fails', async () => {
    const generate = vi.fn<ClaudeClient['generate']>(
      async () => '# 月刊社内報\nUnknown issue #99',
    );
    const errors: string[] = [];

    const exitCode = await runCli(['monthly', '2026-11'], {
      configPath,
      charactersDirectory: 'characters',
      outputDirectory: path.join(temporaryDirectory, 'issues', 'monthly'),
      githubClient: createGitHubMock(),
      cache: createMemoryCache(),
      claude: { generate },
      errorOutput: (contents) => errors.push(contents),
    });

    expect(exitCode).toBe(1);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(errors.join('')).toContain('numbers missing from facts: #99');
  });
});

describe('createTokyoMonthPeriod', () => {
  it('uses Tokyo midnight at both November boundaries', () => {
    expect(createTokyoMonthPeriod('2026-11')).toEqual({
      start: '2026-10-31T15:00:00.000Z',
      end: '2026-11-30T15:00:00.000Z',
    });
  });

  it('rolls December into January of the following year', () => {
    expect(createTokyoMonthPeriod('2026-12')).toEqual({
      start: '2026-11-30T15:00:00.000Z',
      end: '2026-12-31T15:00:00.000Z',
    });
  });
});
