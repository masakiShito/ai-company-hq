import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { RawCache } from './collect/cache.js';
import { FileRawCache } from './collect/cache.js';
import { loadCompanyConfig } from './collect/config.js';
import { GitHubFetcher } from './collect/fetcher.js';
import { GhCliClient, type GhApiClient } from './collect/gh-client.js';
import {
  buildEmployeeActivities,
  collectRepository,
  inPeriod,
  referencesFor,
} from './daily.js';
import { buildFacts, type Facts } from './facts/index.js';
import { calculateMetrics, extractEventCandidates } from './metrics/index.js';
import {
  ClaudeCliClient,
  loadCharacters,
  type ClaudeClient,
  type Character,
  writeMonthlyReport,
} from './write/index.js';

const MonthlyDateSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u, 'month must use YYYY-MM format');
const TOKYO_OFFSET = '+09:00';

export interface MonthlyDependencies {
  configPath?: string;
  charactersDirectory?: string;
  outputDirectory?: string;
  githubClient?: GhApiClient;
  cache?: RawCache;
  claude?: ClaudeClient;
  output?: (contents: string) => void;
}

export interface MonthlyOptions {
  dryRun: boolean;
}

export interface TokyoMonthPeriod {
  start: string;
  end: string;
}

export function createTokyoMonthPeriod(month: string): TokyoMonthPeriod {
  const validatedMonth = MonthlyDateSchema.parse(month);
  const [year, monthNumber] = validatedMonth.split('-').map(Number);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonthText = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

  return {
    start: new Date(
      `${validatedMonth}-01T00:00:00${TOKYO_OFFSET}`,
    ).toISOString(),
    end: new Date(`${nextMonthText}-01T00:00:00${TOKYO_OFFSET}`).toISOString(),
  };
}

export async function runMonthly(
  month: string,
  options: MonthlyOptions,
  dependencies: MonthlyDependencies = {},
): Promise<Facts> {
  const period = createTokyoMonthPeriod(month);
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
  const monthlyEvents = events.filter((event) => inPeriod(event, period));
  const facts = buildFacts({
    period: { kind: 'monthly', month },
    metrics: calculateMetrics(events, period),
    eventCandidates: extractEventCandidates(events, period),
    issues: referencesFor(monthlyEvents, 'issue'),
    pullRequests: referencesFor(monthlyEvents, 'pull_request'),
    employeeActivities: buildEmployeeActivities(
      monthlyEvents,
      '今月の活動なし',
    ),
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
  const report = await writeMonthlyReport(
    facts,
    characters,
    dependencies.claude ?? new ClaudeCliClient(),
  );
  const outputDirectory = dependencies.outputDirectory ?? 'issues/monthly';
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, `${month}.md`), report, 'utf8');

  return facts;
}
