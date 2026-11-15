import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { RawCache } from './collect/cache.js';
import { FileRawCache } from './collect/cache.js';
import { loadCompanyConfig } from './collect/config.js';
import { GitHubFetcher } from './collect/fetcher.js';
import { GhCliClient, type GhApiClient } from './collect/gh-client.js';
import { normalizeGitHubData } from './collect/normalizer.js';
import type { NormalizedEvent } from './collect/schemas.js';
import {
  buildFacts,
  type EmployeeActivity,
  type Facts,
} from './facts/index.js';
import {
  calculateMetrics,
  classifySpeaker,
  extractEventCandidates,
} from './metrics/index.js';
import {
  ClaudeCliClient,
  loadCharacters,
  type ClaudeClient,
  type Character,
  writeDailyReport,
} from './write/index.js';

const DailyDateSchema = z.iso.date();
const TOKYO_OFFSET = '+09:00';
const EMPLOYEES = [
  { role: 'president', name: '織田家康' },
  { role: 'pm', name: '竹中官兵衛' },
  { role: 'engineer', name: '藤堂秀吉' },
  { role: 'reviewer', name: '大岡三成' },
] as const satisfies readonly Pick<EmployeeActivity, 'role' | 'name'>[];

export interface DailyDependencies {
  configPath?: string;
  charactersDirectory?: string;
  outputDirectory?: string;
  githubClient?: GhApiClient;
  cache?: RawCache;
  claude?: ClaudeClient;
  output?: (contents: string) => void;
}

export interface DailyOptions {
  dryRun: boolean;
}

export interface TokyoDayPeriod {
  start: string;
  end: string;
}

export function createTokyoDayPeriod(date: string): TokyoDayPeriod {
  const validatedDate = DailyDateSchema.parse(date);
  const start = new Date(`${validatedDate}T00:00:00${TOKYO_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start: start.toISOString(), end: end.toISOString() };
}

export function inPeriod(
  event: NormalizedEvent,
  period: TokyoDayPeriod,
): boolean {
  const timestamp = Date.parse(event.timestamp);
  return (
    timestamp >= Date.parse(period.start) && timestamp < Date.parse(period.end)
  );
}

function describeEvent(event: NormalizedEvent): string {
  const subject = `${event.repository} #${event.number} 「${event.title}」`;
  switch (event.type) {
    case 'issue_created':
      return `${subject} を作成。`;
    case 'pr_created':
      return `${subject} を作成。`;
    case 'review_submitted':
      return `${subject} をレビュー（${event.reviewState}）。`;
    case 'comment_added':
      return `${subject} にコメント。`;
    default:
      return `${subject} に関する活動。`;
  }
}

export function buildEmployeeActivities(
  events: readonly NormalizedEvent[],
  noActivitySummary = '本日の活動なし',
): EmployeeActivity[] {
  return EMPLOYEES.map((employee) => {
    const summaries = events
      .filter((event) => classifySpeaker(event) === employee.role)
      .map(describeEvent);

    return {
      ...employee,
      summary:
        summaries.length === 0 ? noActivitySummary : summaries.join('\n'),
    };
  });
}

export function referencesFor(
  events: readonly NormalizedEvent[],
  subject: NormalizedEvent['subject'],
): Facts['issues'] {
  const references = new Map<string, Facts['issues'][number]>();
  for (const event of events) {
    if (event.subject !== subject) continue;
    const key = `${event.repository}#${event.number}`;
    references.set(key, {
      repository: event.repository,
      number: event.number,
      title: event.title,
    });
  }
  return [...references.values()];
}

export async function collectRepository(
  repository: string,
  fetcher: GitHubFetcher,
): Promise<NormalizedEvent[]> {
  const [issues, pullRequests, issueComments, reviewComments] =
    await Promise.all([
      fetcher.fetchIssues(repository),
      fetcher.fetchPullRequests(repository),
      fetcher.fetchIssueComments(repository),
      fetcher.fetchReviewComments(repository),
    ]);
  const reviews = await Promise.all(
    pullRequests.map(
      async ({ number }) =>
        [number, await fetcher.fetchReviews(repository, number)] as const,
    ),
  );
  const subjectNumbers = [...issues, ...pullRequests].map(
    ({ number }) => number,
  );
  const timelines = await Promise.all(
    [...new Set(subjectNumbers)].map(
      async (number) =>
        [
          number,
          await fetcher.fetchTimelineEvents(repository, number),
        ] as const,
    ),
  );

  return normalizeGitHubData(repository, {
    issues,
    pullRequests,
    issueComments,
    reviewComments,
    reviewsByPullRequest: Object.fromEntries(reviews),
    timelineEventsByNumber: Object.fromEntries(timelines),
  });
}

export async function runDaily(
  date: string,
  options: DailyOptions,
  dependencies: DailyDependencies = {},
): Promise<Facts> {
  const period = createTokyoDayPeriod(date);
  const config = await loadCompanyConfig(
    dependencies.configPath ?? 'company.config.json',
  );
  const fetcher = new GitHubFetcher(
    dependencies.githubClient ?? new GhCliClient(),
    dependencies.cache ?? new FileRawCache(),
  );
  const events = (
    await Promise.all(
      config.repos.map((repository) => collectRepository(repository, fetcher)),
    )
  ).flat();
  const dailyEvents = events.filter((event) => inPeriod(event, period));
  const facts = buildFacts({
    period: { kind: 'daily', date },
    metrics: calculateMetrics(events, period),
    eventCandidates: extractEventCandidates(events, period),
    issues: referencesFor(dailyEvents, 'issue'),
    pullRequests: referencesFor(dailyEvents, 'pull_request'),
    employeeActivities: buildEmployeeActivities(dailyEvents),
  });

  if (options.dryRun) {
    (dependencies.output ?? ((contents) => process.stdout.write(contents)))(
      `${JSON.stringify(facts, null, 2)}\n`,
    );
    return facts;
  }

  const characters: Character[] = await loadCharacters(
    dependencies.charactersDirectory ?? 'characters',
  );
  const report = await writeDailyReport(
    facts,
    characters,
    dependencies.claude ?? new ClaudeCliClient(),
  );
  const outputDirectory = dependencies.outputDirectory ?? 'issues/daily';
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, `${date}.md`), report, 'utf8');

  return facts;
}
