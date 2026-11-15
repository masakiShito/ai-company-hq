import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { normalizeGitHubData, type GitHubRawData } from './normalizer.js';
import { NormalizedEventArraySchema } from './schemas.js';

function rawData(): GitHubRawData {
  return {
    issues: [
      {
        number: 1,
        title: 'Fix a bug',
        body: 'Bug details <!-- ai-company:actor=pm -->',
        state: 'closed',
        created_at: '2026-11-03T00:00:00Z',
        closed_at: '2026-11-09T00:00:00Z',
        user: { login: 'alice' },
        closed_by: { login: 'bob' },
        labels: [],
      },
    ],
    pullRequests: [
      {
        number: 2,
        title: 'Add a feature',
        body: 'Feature details <!-- ai-company:actor=engineer -->',
        state: 'closed',
        created_at: '2026-11-01T00:00:00Z',
        closed_at: '2026-11-08T00:00:00Z',
        merged_at: '2026-11-08T00:00:00Z',
        user: { login: 'carol' },
        merged_by: { login: 'dave' },
        head: { ref: 'feat/add-feature' },
        labels: [],
      },
    ],
    issueComments: [
      {
        issue_url: 'https://api.github.com/repos/octo/example/issues/1',
        created_at: '2026-11-04T00:00:00Z',
        user: null,
        body: null,
      },
    ],
    reviewComments: [
      {
        pull_request_url: 'https://api.github.com/repos/octo/example/pulls/2',
        created_at: '2026-11-07T00:00:00Z',
        user: { login: 'frank' },
        body: 'Please update this line',
      },
    ],
    reviewsByPullRequest: {
      2: [
        {
          submitted_at: '2026-11-06T00:00:00Z',
          user: { login: 'erin' },
          state: 'APPROVED',
          body: 'Looks good',
        },
        {
          submitted_at: null,
          user: { login: 'pending' },
          state: 'PENDING',
          body: null,
        },
      ],
    },
    timelineEventsByNumber: {
      1: [
        {
          event: 'labeled',
          created_at: '2026-11-02T00:00:00-05:00',
          actor: { login: 'alice' },
          label: { name: 'bug' },
        },
        {
          event: 'unlabeled',
          created_at: '2026-11-05T00:00:00Z',
          actor: { login: 'bob' },
          label: { name: 'bug' },
        },
        { event: 'closed', created_at: '2026-11-09T00:00:00Z' },
      ],
    },
  };
}

describe('normalizeGitHubData', () => {
  it('converts every supported GitHub payload and sorts by timestamp', () => {
    const events = normalizeGitHubData('octo/example', rawData());

    expect(events.map((event) => event.type)).toEqual([
      'pr_created',
      'label_added',
      'issue_created',
      'comment_added',
      'label_removed',
      'review_submitted',
      'comment_added',
      'pr_merged',
      'issue_closed',
    ]);
    expect(events).toContainEqual({
      repository: 'octo/example',
      timestamp: '2026-11-09T00:00:00Z',
      actor: 'bob',
      number: 1,
      title: 'Fix a bug',
      subject: 'issue',
      type: 'issue_closed',
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'issue_created',
        body: 'Bug details <!-- ai-company:actor=pm -->',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'pr_created',
        body: 'Feature details <!-- ai-company:actor=engineer -->',
        headRefName: 'feat/add-feature',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'pr_merged',
        actor: 'dave',
        subject: 'pull_request',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'review_submitted',
        reviewState: 'APPROVED',
        body: 'Looks good',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'comment_added',
        commentKind: 'issue',
        actor: 'ghost',
        body: '',
      }),
    );
    expect(NormalizedEventArraySchema.safeParse(events).success).toBe(true);
  });

  it('classifies a general issue comment on a PR as a PR comment', () => {
    const input = rawData();
    input.issueComments = [
      {
        issue_url: 'https://api.github.com/repos/octo/example/issues/2',
        created_at: '2026-11-04T00:00:00Z',
        user: { login: 'alice' },
        body: 'General PR comment',
      },
    ];

    const comment = normalizeGitHubData('octo/example', input).find(
      (event) => event.type === 'comment_added',
    );

    expect(comment).toEqual(
      expect.objectContaining({
        subject: 'pull_request',
        commentKind: 'issue',
        number: 2,
        title: 'Add a feature',
      }),
    );
  });

  it('rejects raw GitHub data that does not match its schema', () => {
    const input = rawData();
    input.issues = [{ ...input.issues[0], created_at: 'not-a-date' }];

    expect(() => normalizeGitHubData('octo/example', input)).toThrow(ZodError);
  });

  it('rejects comments whose parent was not provided', () => {
    const input = rawData();
    input.issueComments = [
      {
        issue_url: 'https://api.github.com/repos/octo/example/issues/99',
        created_at: '2026-11-04T00:00:00Z',
        user: { login: 'alice' },
        body: 'Orphaned comment',
      },
    ];

    expect(() => normalizeGitHubData('octo/example', input)).toThrow(
      'GitHub data references unknown issue or PR #99',
    );
  });
});
