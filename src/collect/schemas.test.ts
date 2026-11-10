import { describe, expect, it } from 'vitest';

import {
  GitHubIssueCommentSchema,
  GitHubIssueSchema,
  GitHubPullRequestSchema,
  GitHubReviewCommentSchema,
  GitHubReviewSchema,
  GitHubTimelineEventSchema,
  NormalizedEventSchema,
} from './schemas.js';

const githubCases = [
  {
    name: 'issue',
    schema: GitHubIssueSchema,
    value: {
      number: 12,
      title: 'Fix reporting',
      state: 'closed',
      created_at: '2026-05-01T00:00:00Z',
      closed_at: '2026-05-02T00:00:00Z',
      user: { login: 'alice', id: 1 },
      closed_by: null,
      labels: [{ name: 'bug', color: 'red' }, 'legacy-label'],
      url: 'https://api.github.com/repos/octo/example/issues/12',
    },
  },
  {
    name: 'pull request',
    schema: GitHubPullRequestSchema,
    value: {
      number: 13,
      title: 'Add reporting',
      state: 'closed',
      created_at: '2026-05-01T00:00:00+09:00',
      closed_at: '2026-05-02T00:00:00+09:00',
      merged_at: '2026-05-02T00:00:00+09:00',
      user: { login: 'bob' },
      merged_by: { login: 'alice' },
      labels: [],
    },
  },
  {
    name: 'issue comment',
    schema: GitHubIssueCommentSchema,
    value: {
      issue_url: 'https://api.github.com/repos/octo/example/issues/12',
      created_at: '2026-05-01T00:00:00Z',
      user: null,
      body: null,
    },
  },
  {
    name: 'review',
    schema: GitHubReviewSchema,
    value: {
      submitted_at: null,
      user: { login: 'reviewer' },
      state: 'APPROVED',
      body: 'Looks good',
    },
  },
  {
    name: 'review comment',
    schema: GitHubReviewCommentSchema,
    value: {
      pull_request_url: 'https://api.github.com/repos/octo/example/pulls/13',
      created_at: '2026-05-01T00:00:00Z',
      user: { login: 'reviewer' },
      body: 'Please adjust this line',
    },
  },
  {
    name: 'timeline event',
    schema: GitHubTimelineEventSchema,
    value: {
      event: 'labeled',
      created_at: '2026-05-01T00:00:00Z',
      actor: { login: 'alice' },
      label: { name: 'priority' },
    },
  },
] as const;

const commonEvent = {
  repository: 'octo/example',
  timestamp: '2026-05-01T00:00:00Z',
  actor: 'alice',
  number: 12,
  title: 'Reporting work',
};

const normalizedEvents = [
  { ...commonEvent, type: 'issue_created', subject: 'issue' },
  { ...commonEvent, type: 'issue_closed', subject: 'issue' },
  { ...commonEvent, type: 'pr_created', subject: 'pull_request' },
  { ...commonEvent, type: 'pr_merged', subject: 'pull_request' },
  {
    ...commonEvent,
    type: 'review_submitted',
    subject: 'pull_request',
    reviewState: 'APPROVED',
    body: 'Looks good',
  },
  {
    ...commonEvent,
    type: 'label_added',
    subject: 'issue',
    label: 'bug',
  },
  {
    ...commonEvent,
    type: 'label_removed',
    subject: 'pull_request',
    label: 'draft',
  },
  {
    ...commonEvent,
    type: 'comment_added',
    subject: 'pull_request',
    commentKind: 'review',
    body: 'Please adjust this line',
  },
] as const;

describe('GitHub API schemas', () => {
  it.each(githubCases)(
    'accepts a representative $name payload',
    ({ schema, value }) => {
      expect(schema.safeParse(value).success).toBe(true);
    },
  );

  it('rejects invalid API field types', () => {
    expect(
      GitHubIssueSchema.safeParse({
        ...githubCases[0].value,
        number: '12',
      }).success,
    ).toBe(false);
  });
});

describe('NormalizedEventSchema', () => {
  it.each(normalizedEvents)('accepts $type', (event) => {
    expect(NormalizedEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects a type and subject mismatch', () => {
    expect(
      NormalizedEventSchema.safeParse({
        ...commonEvent,
        type: 'issue_created',
        subject: 'pull_request',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid repository name', () => {
    expect(
      NormalizedEventSchema.safeParse({
        ...commonEvent,
        repository: 'missing-owner',
        type: 'issue_created',
        subject: 'issue',
      }).success,
    ).toBe(false);
  });
});
