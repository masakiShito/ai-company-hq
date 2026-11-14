import { z } from 'zod';

import { FileRawCache, type RawCache } from './cache.js';
import { RepositorySchema } from './config.js';
import { GhCliClient, type GhApiClient } from './gh-client.js';
import {
  GitHubIssueCommentSchema,
  GitHubIssueSchema,
  GitHubPullRequestSchema,
  GitHubReviewCommentSchema,
  GitHubReviewSchema,
  GitHubTimelineEventSchema,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubPullRequest,
  type GitHubReview,
  type GitHubReviewComment,
  type GitHubTimelineEvent,
} from './schemas.js';

const PositiveIntegerSchema = z.number().int().positive();

export class GitHubFetcher {
  constructor(
    private readonly client: GhApiClient = new GhCliClient(),
    private readonly cache: RawCache = new FileRawCache(),
  ) {}

  async fetchIssues(repository: string): Promise<GitHubIssue[]> {
    const issues = await this.fetch(
      this.repositoryEndpoint(repository, 'issues?state=all&per_page=100'),
      z.array(GitHubIssueSchema),
    );

    return issues.filter((issue) => issue.pull_request === undefined);
  }

  async fetchIssueComments(repository: string): Promise<GitHubIssueComment[]> {
    return this.fetch(
      this.repositoryEndpoint(repository, 'issues/comments?per_page=100'),
      z.array(GitHubIssueCommentSchema),
    );
  }

  async fetchPullRequests(repository: string): Promise<GitHubPullRequest[]> {
    return this.fetch(
      this.repositoryEndpoint(repository, 'pulls?state=all&per_page=100'),
      z.array(GitHubPullRequestSchema),
    );
  }

  async fetchReviews(
    repository: string,
    pullNumber: number,
  ): Promise<GitHubReview[]> {
    const number = PositiveIntegerSchema.parse(pullNumber);
    return this.fetch(
      this.repositoryEndpoint(
        repository,
        `pulls/${number}/reviews?per_page=100`,
      ),
      z.array(GitHubReviewSchema),
    );
  }

  async fetchReviewComments(
    repository: string,
  ): Promise<GitHubReviewComment[]> {
    return this.fetch(
      this.repositoryEndpoint(repository, 'pulls/comments?per_page=100'),
      z.array(GitHubReviewCommentSchema),
    );
  }

  async fetchTimelineEvents(
    repository: string,
    issueNumber: number,
  ): Promise<GitHubTimelineEvent[]> {
    const number = PositiveIntegerSchema.parse(issueNumber);
    return this.fetch(
      this.repositoryEndpoint(
        repository,
        `issues/${number}/timeline?per_page=100`,
      ),
      z.array(GitHubTimelineEventSchema),
    );
  }

  private async fetch<T>(endpoint: string, schema: z.ZodType<T>): Promise<T> {
    const cached = await this.cache.get(endpoint);
    if (cached !== undefined) {
      return schema.parse(cached);
    }

    const value = schema.parse(await this.client.api(endpoint));
    await this.cache.set(endpoint, value);
    return value;
  }

  private repositoryEndpoint(repository: string, resource: string): string {
    const validatedRepository = RepositorySchema.parse(repository);
    return `/repos/${validatedRepository}/${resource}`;
  }
}
