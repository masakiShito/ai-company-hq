import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Facts } from '../facts/index.js';

import type { Character, CharacterRole } from './characters.js';
import { generateVerifiedReport } from './verify.js';

const execFileAsync = promisify(execFile);
const MONTHLY_METRICS_TABLE_MARKER = '<!-- MONTHLY_METRICS_TABLE -->';
const CHARACTER_ROLES: readonly CharacterRole[] = [
  'president',
  'pm',
  'engineer',
  'reviewer',
];

export interface ClaudeClient {
  generate(prompt: string): Promise<string>;
}

export interface ClaudeCommandRunner {
  run(command: string, args: readonly string[]): Promise<string>;
}

class NodeClaudeCommandRunner implements ClaudeCommandRunner {
  async run(command: string, args: readonly string[]): Promise<string> {
    const { stdout } = await execFileAsync(command, [...args], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });

    return stdout;
  }
}

export class ClaudeCliClient implements ClaudeClient {
  constructor(
    private readonly runner: ClaudeCommandRunner = new NodeClaudeCommandRunner(),
    private readonly executable = 'claude',
  ) {}

  async generate(prompt: string): Promise<string> {
    return this.runner.run(this.executable, ['-p', prompt]);
  }
}

function charactersByRole(
  characters: readonly Character[],
): Map<CharacterRole, Character> {
  const result = new Map<CharacterRole, Character>();

  for (const character of characters) {
    if (result.has(character.role)) {
      throw new Error(`Duplicate character definition for ${character.role}`);
    }
    result.set(character.role, character);
  }

  return result;
}

function requireCharacter(
  characterMap: ReadonlyMap<CharacterRole, Character>,
  role: CharacterRole,
): Character {
  const character = characterMap.get(role);
  if (character === undefined) {
    throw new Error(`Missing character definition for ${role}`);
  }

  return character;
}

function formatDecimal(value: number): string {
  return value
    .toFixed(2)
    .replace(/\.00$/u, '')
    .replace(/(\.\d)0$/u, '$1');
}

function formatDuration(milliseconds: number): string {
  if (milliseconds === 0) return '0秒';

  const units = [
    ['日', 24 * 60 * 60 * 1000],
    ['時間', 60 * 60 * 1000],
    ['分', 60 * 1000],
    ['秒', 1000],
    ['ミリ秒', 1],
  ] as const;
  const parts: string[] = [];
  let remaining = milliseconds;

  for (const [label, unitMilliseconds] of units) {
    const amount = Math.floor(remaining / unitMilliseconds);
    if (amount > 0) {
      parts.push(`${amount}${label}`);
      remaining -= amount * unitMilliseconds;
    }
  }

  return parts.join(' ');
}

/** Builds the deterministic "今月の数字" Markdown table without using an LLM. */
export function buildMonthlyMetricsTable(facts: Facts): string {
  if (facts.period.kind !== 'monthly') {
    throw new Error('Monthly metrics table requires monthly facts');
  }

  const { metrics } = facts;
  const rows: readonly [string, string][] = [
    ['作成 Issue 数', `${metrics.issuesCreated}件`],
    ['クローズ Issue 数', `${metrics.issuesClosed}件`],
    ['作成 PR 数', `${metrics.pullRequestsCreated}件`],
    ['マージ PR 数', `${metrics.pullRequestsMerged}件`],
    [
      '初回レビュー承認率',
      `${formatDecimal(metrics.firstReviewApprovalRate * 100)}%`,
    ],
    [
      'PR あたり平均差し戻し回数',
      `${formatDecimal(metrics.averageChangesRequestedPerPullRequest)}回`,
    ],
    [
      'Issue リードタイム中央値',
      formatDuration(metrics.medianIssueLeadTimeMilliseconds),
    ],
    [
      '社長の返信待ち時間（合計）',
      formatDuration(metrics.questionTime.totalMilliseconds),
    ],
    [
      '社長の返信待ち時間（最長）',
      formatDuration(metrics.questionTime.longestMilliseconds),
    ],
    ['エスカレーション件数', `${metrics.escalationCount}件`],
  ];

  return [
    '| 指標 | 値 |',
    '| --- | ---: |',
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join('\n');
}

/** Inserts the code-generated metrics table at the prompt's fixed marker. */
export function insertMonthlyMetricsTable(
  report: string,
  facts: Facts,
): string {
  if (!report.includes(MONTHLY_METRICS_TABLE_MARKER)) {
    throw new Error('Monthly report is missing the metrics table marker');
  }

  return report.replace(
    MONTHLY_METRICS_TABLE_MARKER,
    buildMonthlyMetricsTable(facts),
  );
}

/** Builds the prompt used to write a daily report from validated facts. */
export function buildDailyPrompt(
  facts: Facts,
  characters: readonly Character[],
): string {
  if (facts.period.kind !== 'daily') {
    throw new Error('Daily report prompt requires daily facts');
  }

  const characterMap = charactersByRole(characters);
  const employees = facts.employeeActivities.map((activity) => {
    const character = requireCharacter(characterMap, activity.role);

    return {
      role: activity.role,
      name: character.name,
      character: character.description,
      activity: activity.summary,
    };
  });

  return [
    `以下の facts とキャラ設定だけを根拠に、${facts.period.date} の日報を Markdown で作成してください。`,
    '',
    'ルール:',
    '- 社員ごとに見出しを付け、その社員の活動を数行で書く。',
    '- 各社員の文章は、その社員のキャラ設定にある文体で書く。',
    '- activity が「本日の活動なし」の社員は、見出しの下に「本日の活動なし」とだけ書く。キャラ付けや補足を加えない。',
    '- facts にない出来事、数値、感情の原因を創作・推測・誇張しない。',
    '- キャラ設定は語り口だけに使い、事実を変更しない。',
    '',
    'facts:',
    '```json',
    JSON.stringify(facts, null, 2),
    '```',
    '',
    '社員とキャラ設定:',
    '```json',
    JSON.stringify(employees, null, 2),
    '```',
  ].join('\n');
}

/** Builds the prompt used to write a monthly newsletter from validated facts. */
export function buildMonthlyPrompt(
  facts: Facts,
  characters: readonly Character[],
): string {
  if (facts.period.kind !== 'monthly') {
    throw new Error('Monthly report prompt requires monthly facts');
  }

  const characterMap = charactersByRole(characters);
  const monthlyCharacters = CHARACTER_ROLES.map((role) =>
    requireCharacter(characterMap, role),
  );
  const pm = requireCharacter(characterMap, 'pm');
  const reviewer = requireCharacter(characterMap, 'reviewer');

  return [
    `以下の facts とキャラ設定だけを根拠に、${facts.period.month} の月刊社内報を Markdown で作成してください。`,
    '',
    '必須の構成:',
    `1. 巻頭言（${pm.name}の語り口）`,
    `2. 今月の数字（見出しの直下に ${MONTHLY_METRICS_TABLE_MARKER} をそのまま1回だけ出力する）`,
    '3. 今月の出来事（事件簿）',
    `4. 今月のMVP指摘（${reviewer.name}が選び、同人の語り口で講評する）`,
    '5. 社長の返信待ち時間ランキング',
    '6. 編集後記',
    '',
    'ルール:',
    '- 「今月の数字」の表や数値は書かず、指定されたマーカーだけを出力する。表は後からコードで差し込まれる。',
    '- 今月の出来事は eventCandidates から選び、repository・番号・title・kind を変えない。候補がなければ「該当なし」と書く。',
    '- 今月のMVP指摘は facts に含まれる活動だけを根拠に選ぶ。根拠がなければ「該当なし」と書く。',
    '- 社長の返信待ち時間ランキングは questionTime の合計と最長だけを使う。Issue 別の待ち時間や順位を創作しない。',
    '- facts にない出来事、数値、人物の行動、感情の原因を創作・推測・誇張しない。',
    '- キャラ設定は語り口だけに使い、事実を変更しない。',
    '',
    'facts:',
    '```json',
    JSON.stringify(facts, null, 2),
    '```',
    '',
    'キャラ設定:',
    '```json',
    JSON.stringify(monthlyCharacters, null, 2),
    '```',
  ].join('\n');
}

/** Generates a daily report through an injected Claude-compatible client. */
export async function writeDailyReport(
  facts: Facts,
  characters: readonly Character[],
  claude: ClaudeClient,
): Promise<string> {
  return generateVerifiedReport(
    buildDailyPrompt(facts, characters),
    facts,
    claude,
  );
}

/** Generates a monthly newsletter and inserts its deterministic metrics table. */
export async function writeMonthlyReport(
  facts: Facts,
  characters: readonly Character[],
  claude: ClaudeClient,
): Promise<string> {
  const report = await generateVerifiedReport(
    buildMonthlyPrompt(facts, characters),
    facts,
    claude,
  );
  return insertMonthlyMetricsTable(report, facts);
}
