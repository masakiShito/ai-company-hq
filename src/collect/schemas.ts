import { z } from 'zod';

import { RepositorySchema } from './config.js';

const GitHubTimestampSchema = z.iso.datetime({ offset: true });

const GitHubUserSchema = z
  .object({
    login: z.string().min(1),
  })
  .passthrough()
  .nullable();

const GitHubLabelSchema = z
  .object({
    name: z.string(),
  })
  .passthrough();

export const GitHubIssueSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    state: z.enum(['open', 'closed']),
    created_at: GitHubTimestampSchema,
    closed_at: GitHubTimestampSchema.nullable(),
    user: GitHubUserSchema,
    closed_by: GitHubUserSchema.optional(),
    labels: z.array(z.union([GitHubLabelSchema, z.string()])),
    pull_request: z.unknown().optional(),
  })
  .passthrough();

export const GitHubPullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    state: z.enum(['open', 'closed']),
    created_at: GitHubTimestampSchema,
    closed_at: GitHubTimestampSchema.nullable(),
    merged_at: GitHubTimestampSchema.nullable(),
    user: GitHubUserSchema,
    merged_by: GitHubUserSchema.optional(),
    labels: z.array(z.union([GitHubLabelSchema, z.string()])),
  })
  .passthrough();

export const GitHubIssueCommentSchema = z
  .object({
    issue_url: z.url(),
    created_at: GitHubTimestampSchema,
    user: GitHubUserSchema,
    body: z.string().nullable(),
  })
  .passthrough();

export const GitHubReviewSchema = z
  .object({
    submitted_at: GitHubTimestampSchema.nullable(),
    user: GitHubUserSchema,
    state: z.string().min(1),
    body: z.string().nullable(),
  })
  .passthrough();

export const GitHubReviewCommentSchema = z
  .object({
    pull_request_url: z.url(),
    created_at: GitHubTimestampSchema,
    user: GitHubUserSchema,
    body: z.string().nullable(),
  })
  .passthrough();

export const GitHubTimelineEventSchema = z
  .object({
    event: z.string(),
    created_at: GitHubTimestampSchema.optional(),
    actor: GitHubUserSchema.optional(),
    label: GitHubLabelSchema.optional(),
  })
  .passthrough();

const EventCommonSchema = z.object({
  repository: RepositorySchema,
  timestamp: GitHubTimestampSchema,
  actor: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string(),
});

export const NormalizedEventSchema = z.union([
  EventCommonSchema.extend({
    type: z.literal('issue_created'),
    subject: z.literal('issue'),
  }),
  EventCommonSchema.extend({
    type: z.literal('issue_closed'),
    subject: z.literal('issue'),
  }),
  EventCommonSchema.extend({
    type: z.literal('pr_created'),
    subject: z.literal('pull_request'),
  }),
  EventCommonSchema.extend({
    type: z.literal('pr_merged'),
    subject: z.literal('pull_request'),
  }),
  EventCommonSchema.extend({
    type: z.literal('review_submitted'),
    subject: z.literal('pull_request'),
    reviewState: z.string().min(1),
    body: z.string(),
  }),
  EventCommonSchema.extend({
    type: z.literal('label_added'),
    subject: z.enum(['issue', 'pull_request']),
    label: z.string(),
  }),
  EventCommonSchema.extend({
    type: z.literal('label_removed'),
    subject: z.enum(['issue', 'pull_request']),
    label: z.string(),
  }),
  EventCommonSchema.extend({
    type: z.literal('comment_added'),
    subject: z.enum(['issue', 'pull_request']),
    commentKind: z.enum(['issue', 'review']),
    body: z.string(),
  }),
]);

export const NormalizedEventArraySchema = z.array(NormalizedEventSchema);

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubIssueComment = z.infer<typeof GitHubIssueCommentSchema>;
export type GitHubReview = z.infer<typeof GitHubReviewSchema>;
export type GitHubReviewComment = z.infer<
  typeof GitHubReviewCommentSchema
>;
export type GitHubTimelineEvent = z.infer<typeof GitHubTimelineEventSchema>;
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
