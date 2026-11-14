import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import type { RawCache } from './cache.js';
import { GitHubFetcher } from './fetcher.js';
import type { GhApiClient } from './gh-client.js';

const issue = {
  number: 1,
  title: 'Issue',
  state: 'open',
  created_at: '2026-11-01T00:00:00Z',
  closed_at: null,
  user: { login: 'alice' },
  labels: [],
};

const pullRequest = {
  number: 2,
  title: 'Pull request',
  state: 'closed',
  created_at: '2026-11-02T00:00:00Z',
  closed_at: '2026-11-03T00:00:00Z',
  merged_at: '2026-11-03T00:00:00Z',
  user: { login: 'bob' },
  labels: [],
};

function createDependencies(): {
  client: GhApiClient;
  cache: RawCache;
  api: ReturnType<typeof vi.fn<GhApiClient['api']>>;
  get: ReturnType<typeof vi.fn<RawCache['get']>>;
  set: ReturnType<typeof vi.fn<RawCache['set']>>;
} {
  const values = new Map<string, unknown>();
  const api = vi.fn<GhApiClient['api']>();
  const get = vi.fn<RawCache['get']>(async (key) => values.get(key));
  const set = vi.fn<RawCache['set']>(async (key, value) => {
    values.set(key, value);
  });

  return { client: { api }, cache: { get, set }, api, get, set };
}

describe('GitHubFetcher', () => {
  it('fetches all six GitHub data types from their endpoints', async () => {
    const dependencies = createDependencies();
    const fetcher = new GitHubFetcher(dependencies.client, dependencies.cache);
    const issueComment = {
      issue_url: 'https://api.github.com/repos/octo/example/issues/1',
      created_at: '2026-11-02T00:00:00Z',
      user: { login: 'bob' },
      body: 'Comment',
    };
    const review = {
      submitted_at: '2026-11-03T00:00:00Z',
      user: { login: 'reviewer' },
      state: 'APPROVED',
      body: 'Looks good',
    };
    const reviewComment = {
      pull_request_url: 'https://api.github.com/repos/octo/example/pulls/2',
      created_at: '2026-11-03T00:00:00Z',
      user: { login: 'reviewer' },
      body: 'Inline comment',
    };
    const timelineEvent = {
      event: 'labeled',
      created_at: '2026-11-04T00:00:00Z',
      actor: { login: 'alice' },
      label: { name: 'status:question' },
    };

    dependencies.api
      .mockResolvedValueOnce([
        issue,
        { ...issue, number: 2, pull_request: { url: 'pull' } },
      ])
      .mockResolvedValueOnce([issueComment])
      .mockResolvedValueOnce([pullRequest])
      .mockResolvedValueOnce([review])
      .mockResolvedValueOnce([reviewComment])
      .mockResolvedValueOnce([timelineEvent]);

    await expect(fetcher.fetchIssues('octo/example')).resolves.toEqual([issue]);
    await expect(fetcher.fetchIssueComments('octo/example')).resolves.toEqual([
      issueComment,
    ]);
    await expect(fetcher.fetchPullRequests('octo/example')).resolves.toEqual([
      pullRequest,
    ]);
    await expect(fetcher.fetchReviews('octo/example', 2)).resolves.toEqual([
      review,
    ]);
    await expect(fetcher.fetchReviewComments('octo/example')).resolves.toEqual([
      reviewComment,
    ]);
    await expect(
      fetcher.fetchTimelineEvents('octo/example', 1),
    ).resolves.toEqual([timelineEvent]);

    expect(dependencies.api.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      '/repos/octo/example/issues?state=all&per_page=100',
      '/repos/octo/example/issues/comments?per_page=100',
      '/repos/octo/example/pulls?state=all&per_page=100',
      '/repos/octo/example/pulls/2/reviews?per_page=100',
      '/repos/octo/example/pulls/comments?per_page=100',
      '/repos/octo/example/issues/1/timeline?per_page=100',
    ]);
  });

  it('uses a validated cached response without calling the API again', async () => {
    const dependencies = createDependencies();
    dependencies.api.mockResolvedValue([issue]);
    const fetcher = new GitHubFetcher(dependencies.client, dependencies.cache);

    await expect(fetcher.fetchIssues('octo/example')).resolves.toEqual([issue]);
    await expect(fetcher.fetchIssues('octo/example')).resolves.toEqual([issue]);

    expect(dependencies.api).toHaveBeenCalledOnce();
    expect(dependencies.set).toHaveBeenCalledOnce();
    expect(dependencies.get).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid API response and does not cache it', async () => {
    const dependencies = createDependencies();
    dependencies.api.mockResolvedValue([{ ...issue, number: '1' }]);
    const fetcher = new GitHubFetcher(dependencies.client, dependencies.cache);

    await expect(fetcher.fetchIssues('octo/example')).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(dependencies.set).not.toHaveBeenCalled();
  });

  it('validates cached responses', async () => {
    const dependencies = createDependencies();
    dependencies.get.mockResolvedValue([{ ...issue, state: 'invalid' }]);
    const fetcher = new GitHubFetcher(dependencies.client, dependencies.cache);

    await expect(fetcher.fetchIssues('octo/example')).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(dependencies.api).not.toHaveBeenCalled();
  });
});
