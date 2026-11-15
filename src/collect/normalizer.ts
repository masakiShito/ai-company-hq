import { z } from 'zod';

import { RepositorySchema } from './config.js';
import {
  GitHubIssueCommentSchema,
  GitHubIssueSchema,
  GitHubPullRequestSchema,
  GitHubReviewCommentSchema,
  GitHubReviewSchema,
  GitHubTimelineEventSchema,
  NormalizedEventArraySchema,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubPullRequest,
  type GitHubReview,
  type GitHubReviewComment,
  type GitHubTimelineEvent,
  type NormalizedEvent,
} from './schemas.js';

export interface GitHubRawData {
  issues: readonly GitHubIssue[];
  pullRequests: readonly GitHubPullRequest[];
  issueComments: readonly GitHubIssueComment[];
  reviewComments: readonly GitHubReviewComment[];
  reviewsByPullRequest: Readonly<Record<number, readonly GitHubReview[]>>;
  timelineEventsByNumber: Readonly<
    Record<number, readonly GitHubTimelineEvent[]>
  >;
}

interface Subject {
  number: number;
  title: string;
  subject: 'issue' | 'pull_request';
}

const GHOST_ACTOR = 'ghost';

function actorLogin(user: { login: string } | null | undefined): string {
  return user?.login ?? GHOST_ACTOR;
}

function referencedNumber(url: string): number {
  const lastSegment = new URL(url).pathname.split('/').filter(Boolean).at(-1);
  return z.coerce.number().int().positive().parse(lastSegment);
}

function findSubject(
  subjects: ReadonlyMap<number, Subject>,
  url: string,
): Subject {
  const number = referencedNumber(url);
  const subject = subjects.get(number);

  if (subject === undefined) {
    throw new Error(`GitHub data references unknown issue or PR #${number}`);
  }

  return subject;
}

/** Converts validated GitHub API payloads into chronological newsletter events. */
export function normalizeGitHubData(
  repository: string,
  rawData: GitHubRawData,
): NormalizedEvent[] {
  const validatedRepository = RepositorySchema.parse(repository);
  const issues = z.array(GitHubIssueSchema).parse(rawData.issues);
  const pullRequests = z
    .array(GitHubPullRequestSchema)
    .parse(rawData.pullRequests);
  const issueComments = z
    .array(GitHubIssueCommentSchema)
    .parse(rawData.issueComments);
  const reviewComments = z
    .array(GitHubReviewCommentSchema)
    .parse(rawData.reviewComments);
  const events: NormalizedEvent[] = [];
  const subjects = new Map<number, Subject>();

  for (const issue of issues) {
    const subject = {
      number: issue.number,
      title: issue.title,
      subject: 'issue' as const,
    };
    subjects.set(issue.number, subject);
    events.push({
      repository: validatedRepository,
      timestamp: issue.created_at,
      actor: actorLogin(issue.user),
      ...subject,
      type: 'issue_created',
      body: issue.body ?? '',
    });

    if (issue.closed_at !== null) {
      events.push({
        repository: validatedRepository,
        timestamp: issue.closed_at,
        actor: actorLogin(issue.closed_by ?? issue.user),
        ...subject,
        type: 'issue_closed',
      });
    }
  }

  for (const pullRequest of pullRequests) {
    const subject = {
      number: pullRequest.number,
      title: pullRequest.title,
      subject: 'pull_request' as const,
    };
    subjects.set(pullRequest.number, subject);
    events.push({
      repository: validatedRepository,
      timestamp: pullRequest.created_at,
      actor: actorLogin(pullRequest.user),
      ...subject,
      type: 'pr_created',
      body: pullRequest.body ?? '',
      headRefName: pullRequest.head.ref,
    });

    if (pullRequest.merged_at !== null) {
      events.push({
        repository: validatedRepository,
        timestamp: pullRequest.merged_at,
        actor: actorLogin(pullRequest.merged_by ?? pullRequest.user),
        ...subject,
        type: 'pr_merged',
      });
    }
  }

  for (const [numberText, rawReviews] of Object.entries(
    rawData.reviewsByPullRequest,
  )) {
    const number = z.coerce.number().int().positive().parse(numberText);
    const subject = subjects.get(number);
    if (subject?.subject !== 'pull_request') {
      throw new Error(`Reviews reference unknown PR #${number}`);
    }

    for (const review of z.array(GitHubReviewSchema).parse(rawReviews)) {
      if (review.submitted_at === null) continue;
      events.push({
        repository: validatedRepository,
        timestamp: review.submitted_at,
        actor: actorLogin(review.user),
        number: subject.number,
        title: subject.title,
        subject: 'pull_request',
        type: 'review_submitted',
        reviewState: review.state,
        body: review.body ?? '',
      });
    }
  }

  for (const [numberText, rawTimelineEvents] of Object.entries(
    rawData.timelineEventsByNumber,
  )) {
    const number = z.coerce.number().int().positive().parse(numberText);
    const subject = subjects.get(number);
    if (subject === undefined) {
      throw new Error(
        `Timeline events reference unknown issue or PR #${number}`,
      );
    }

    for (const timelineEvent of z
      .array(GitHubTimelineEventSchema)
      .parse(rawTimelineEvents)) {
      if (
        (timelineEvent.event !== 'labeled' &&
          timelineEvent.event !== 'unlabeled') ||
        timelineEvent.created_at === undefined ||
        timelineEvent.label === undefined
      ) {
        continue;
      }

      events.push({
        repository: validatedRepository,
        timestamp: timelineEvent.created_at,
        actor: actorLogin(timelineEvent.actor),
        ...subject,
        type:
          timelineEvent.event === 'labeled' ? 'label_added' : 'label_removed',
        label: timelineEvent.label.name,
      });
    }
  }

  for (const comment of issueComments) {
    const subject = findSubject(subjects, comment.issue_url);
    events.push({
      repository: validatedRepository,
      timestamp: comment.created_at,
      actor: actorLogin(comment.user),
      ...subject,
      type: 'comment_added',
      commentKind: 'issue',
      body: comment.body ?? '',
    });
  }

  for (const comment of reviewComments) {
    const subject = findSubject(subjects, comment.pull_request_url);
    if (subject.subject !== 'pull_request') {
      throw new Error(`Review comment references non-PR #${subject.number}`);
    }
    events.push({
      repository: validatedRepository,
      timestamp: comment.created_at,
      actor: actorLogin(comment.user),
      ...subject,
      type: 'comment_added',
      commentKind: 'review',
      body: comment.body ?? '',
    });
  }

  events.sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
  return NormalizedEventArraySchema.parse(events);
}
