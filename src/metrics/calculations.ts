import type { NormalizedEvent } from '../collect/schemas.js';

const QUESTION_LABEL = 'status:question';
const ESCALATED_LABEL = 'status:escalated';

export interface MetricsPeriod {
  /** Inclusive ISO 8601 timestamp. */
  start: string;
  /** Exclusive ISO 8601 timestamp. */
  end: string;
}

export interface QuestionTime {
  totalMilliseconds: number;
  longestMilliseconds: number;
}

export interface Metrics {
  issuesCreated: number;
  issuesClosed: number;
  pullRequestsCreated: number;
  pullRequestsMerged: number;
  firstReviewApprovalRate: number;
  averageChangesRequestedPerPullRequest: number;
  medianIssueLeadTimeMilliseconds: number;
  questionTime: QuestionTime;
  escalationCount: number;
}

interface ParsedPeriod {
  start: number;
  end: number;
}

function parsePeriod(period: MetricsPeriod): ParsedPeriod {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new RangeError(
      'metrics period must contain valid timestamps and start before end',
    );
  }

  return { start, end };
}

function inPeriod(event: NormalizedEvent, period: ParsedPeriod): boolean {
  const timestamp = Date.parse(event.timestamp);
  return timestamp >= period.start && timestamp < period.end;
}

function subjectKey(event: NormalizedEvent): string {
  return `${event.repository}#${event.number}`;
}

function countType(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
  type: NormalizedEvent['type'],
): number {
  const parsed = parsePeriod(period);
  return events.filter(
    (event) => event.type === type && inPeriod(event, parsed),
  ).length;
}

export function countIssuesCreated(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): number {
  return countType(events, period, 'issue_created');
}

export function countIssuesClosed(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): number {
  return countType(events, period, 'issue_closed');
}

export function countPullRequestsCreated(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): number {
  return countType(events, period, 'pr_created');
}

export function countPullRequestsMerged(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): number {
  return countType(events, period, 'pr_merged');
}

function pullRequestsCreatedInPeriod(
  events: readonly NormalizedEvent[],
  period: ParsedPeriod,
): Set<string> {
  return new Set(
    events
      .filter((event) => event.type === 'pr_created' && inPeriod(event, period))
      .map(subjectKey),
  );
}

export function calculateFirstReviewApprovalRate(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): number {
  const parsed = parsePeriod(period);
  const pullRequests = pullRequestsCreatedInPeriod(events, parsed);
  if (pullRequests.size === 0) return 0;

  const firstReviews = new Map<string, NormalizedEvent>();
  const reviews = events
    .filter(
      (event) =>
        event.type === 'review_submitted' &&
        pullRequests.has(subjectKey(event)) &&
        Date.parse(event.timestamp) < parsed.end,
    )
    .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp));

  for (const review of reviews) {
    const key = subjectKey(review);
    if (!firstReviews.has(key)) firstReviews.set(key, review);
  }

  const approved = [...firstReviews.values()].filter(
    (event) =>
      event.type === 'review_submitted' &&
      event.reviewState.toUpperCase() === 'APPROVED',
  ).length;
  return approved / pullRequests.size;
}

export function calculateAverageChangesRequested(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): number {
  const parsed = parsePeriod(period);
  const pullRequests = pullRequestsCreatedInPeriod(events, parsed);
  if (pullRequests.size === 0) return 0;

  const changesRequested = events.filter(
    (event) =>
      event.type === 'review_submitted' &&
      pullRequests.has(subjectKey(event)) &&
      inPeriod(event, parsed) &&
      event.reviewState.toUpperCase() === 'CHANGES_REQUESTED',
  ).length;

  return changesRequested / pullRequests.size;
}

export function calculateMedianIssueLeadTime(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): number {
  const parsed = parsePeriod(period);
  const createdAt = new Map<string, number>();

  for (const event of events) {
    if (event.type !== 'issue_created') continue;
    const timestamp = Date.parse(event.timestamp);
    const key = subjectKey(event);
    const existing = createdAt.get(key);
    if (existing === undefined || timestamp < existing)
      createdAt.set(key, timestamp);
  }

  const leadTimes = events
    .filter((event) => event.type === 'issue_closed' && inPeriod(event, parsed))
    .flatMap((event) => {
      const closedAt = Date.parse(event.timestamp);
      const created = createdAt.get(subjectKey(event));
      return created !== undefined && created <= closedAt
        ? [closedAt - created]
        : [];
    })
    .toSorted((left, right) => left - right);

  if (leadTimes.length === 0) return 0;
  const middle = Math.floor(leadTimes.length / 2);
  return leadTimes.length % 2 === 1
    ? leadTimes[middle]
    : (leadTimes[middle - 1] + leadTimes[middle]) / 2;
}

export function calculateQuestionTime(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): QuestionTime {
  const parsed = parsePeriod(period);
  const labelEvents = events
    .filter(
      (event) =>
        (event.type === 'label_added' || event.type === 'label_removed') &&
        event.subject === 'issue' &&
        event.label === QUESTION_LABEL &&
        Date.parse(event.timestamp) < parsed.end,
    )
    .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp));
  const activeSince = new Map<string, number>();
  const durations: number[] = [];

  for (const event of labelEvents) {
    const key = subjectKey(event);
    const timestamp = Date.parse(event.timestamp);
    if (event.type === 'label_added') {
      if (!activeSince.has(key)) activeSince.set(key, timestamp);
      continue;
    }

    const addedAt = activeSince.get(key);
    if (addedAt === undefined) continue;
    durations.push(Math.max(0, timestamp - Math.max(addedAt, parsed.start)));
    activeSince.delete(key);
  }

  for (const addedAt of activeSince.values()) {
    durations.push(parsed.end - Math.max(addedAt, parsed.start));
  }

  return {
    totalMilliseconds: durations.reduce(
      (total, duration) => total + duration,
      0,
    ),
    longestMilliseconds: durations.length === 0 ? 0 : Math.max(...durations),
  };
}

export function countEscalations(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): number {
  const parsed = parsePeriod(period);
  return new Set(
    events
      .filter(
        (event) =>
          event.type === 'label_added' &&
          event.subject === 'issue' &&
          event.label === ESCALATED_LABEL &&
          inPeriod(event, parsed),
      )
      .map(subjectKey),
  ).size;
}

export function calculateMetrics(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): Metrics {
  return {
    issuesCreated: countIssuesCreated(events, period),
    issuesClosed: countIssuesClosed(events, period),
    pullRequestsCreated: countPullRequestsCreated(events, period),
    pullRequestsMerged: countPullRequestsMerged(events, period),
    firstReviewApprovalRate: calculateFirstReviewApprovalRate(events, period),
    averageChangesRequestedPerPullRequest: calculateAverageChangesRequested(
      events,
      period,
    ),
    medianIssueLeadTimeMilliseconds: calculateMedianIssueLeadTime(
      events,
      period,
    ),
    questionTime: calculateQuestionTime(events, period),
    escalationCount: countEscalations(events, period),
  };
}
