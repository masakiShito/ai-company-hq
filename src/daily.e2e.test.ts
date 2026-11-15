import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RawCache } from './collect/cache.js';
import type { GhApiClient } from './collect/gh-client.js';
import { createTokyoDayPeriod } from './daily.js';
import { FactsSchema } from './facts/index.js';
import { runCli } from './index.js';
import type { ClaudeClient } from './write/index.js';

const repository = 'octo/example';
const issues = [
  {
    number: 7,
    title: 'Tokyo day issue',
    state: 'open',
    created_at: '2026-11-06T15:00:00Z',
    closed_at: null,
    user: { login: 'pm' },
    labels: [],
  },
  {
    number: 8,
    title: 'Previous day issue',
    state: 'open',
    created_at: '2026-11-06T14:59:59Z',
    closed_at: null,
    user: { login: 'pm' },
    labels: [],
  },
];
const pullRequests = [
  {
    number: 9,
    title: 'Daily CLI',
    state: 'closed',
    created_at: '2026-11-07T01:00:00Z',
    closed_at: '2026-11-07T03:00:00Z',
    merged_at: '2026-11-07T03:00:00Z',
    user: { login: 'engineer' },
    merged_by: { login: 'president' },
    labels: [],
  },
];

function createGitHubMock(): {
  client: GhApiClient;
  api: ReturnType<typeof vi.fn<GhApiClient['api']>>;
} {
  const api = vi.fn<GhApiClient['api']>(async (endpoint) => {
    if (endpoint.includes('issues?state=all')) return issues;
    if (endpoint.includes('pulls?state=all')) return pullRequests;
    if (endpoint.includes('issues/comments')) return [];
    if (endpoint.includes('pulls/comments')) return [];
    if (endpoint.includes('pulls/9/reviews')) {
      return [
        {
          submitted_at: '2026-11-07T02:00:00Z',
          user: { login: 'reviewer' },
          state: 'APPROVED',
          body: 'Approved',
        },
      ];
    }
    if (endpoint.includes('/timeline')) return [];
    throw new Error(`Unexpected gh api endpoint: ${endpoint}`);
  });
  return { client: { api }, api };
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

describe('daily CLI E2E', () => {
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

  it('mocks gh api and claude -p to generate a verified daily report', async () => {
    const github = createGitHubMock();
    const generate = vi.fn<ClaudeClient['generate']>(
      async () => '# Daily\nIssue #7 and PR #9',
    );
    const outputDirectory = path.join(temporaryDirectory, 'issues', 'daily');
    const errors: string[] = [];

    const exitCode = await runCli(['daily', '2026-11-07'], {
      configPath,
      charactersDirectory: 'characters',
      outputDirectory,
      githubClient: github.client,
      cache: createMemoryCache(),
      claude: { generate },
      errorOutput: (contents) => errors.push(contents),
    });

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(generate).toHaveBeenCalledOnce();
    expect(github.api).toHaveBeenCalled();
    await expect(
      readFile(path.join(outputDirectory, '2026-11-07.md'), 'utf8'),
    ).resolves.toBe('# Daily\nIssue #7 and PR #9');
  });

  it('prints facts as JSON without calling claude in dry-run mode', async () => {
    const github = createGitHubMock();
    const generate = vi.fn<ClaudeClient['generate']>();
    const output: string[] = [];

    const exitCode = await runCli(['daily', '2026-11-07', '--dry-run'], {
      configPath,
      githubClient: github.client,
      cache: createMemoryCache(),
      claude: { generate },
      output: (contents) => output.push(contents),
    });

    expect(exitCode).toBe(0);
    expect(generate).not.toHaveBeenCalled();
    const facts = FactsSchema.parse(JSON.parse(output.join('')));
    expect(facts.period).toEqual({ kind: 'daily', date: '2026-11-07' });
    expect(facts.issues.map(({ number }) => number)).toEqual([7]);
    expect(facts.pullRequests.map(({ number }) => number)).toEqual([9]);
  });

  it('returns exit code 1 on repeated report validation failure', async () => {
    const github = createGitHubMock();
    const generate = vi.fn<ClaudeClient['generate']>(
      async () => 'Unknown issue #99',
    );
    const errors: string[] = [];

    const exitCode = await runCli(['daily', '2026-11-07'], {
      configPath,
      charactersDirectory: 'characters',
      outputDirectory: path.join(temporaryDirectory, 'issues', 'daily'),
      githubClient: github.client,
      cache: createMemoryCache(),
      claude: { generate },
      errorOutput: (contents) => errors.push(contents),
    });

    expect(exitCode).toBe(1);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(errors.join('')).toContain('numbers missing from facts: #99');
  });
});

describe('createTokyoDayPeriod', () => {
  it('uses midnight-to-midnight in Asia/Tokyo', () => {
    expect(createTokyoDayPeriod('2026-11-07')).toEqual({
      start: '2026-11-06T15:00:00.000Z',
      end: '2026-11-07T15:00:00.000Z',
    });
  });
});
