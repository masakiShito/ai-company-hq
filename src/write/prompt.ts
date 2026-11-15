import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Facts } from '../facts/index.js';

import type { Character, CharacterRole } from './characters.js';

const execFileAsync = promisify(execFile);

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
    const character = characterMap.get(activity.role);
    if (character === undefined) {
      throw new Error(`Missing character definition for ${activity.role}`);
    }

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

/** Generates a daily report through an injected Claude-compatible client. */
export async function writeDailyReport(
  facts: Facts,
  characters: readonly Character[],
  claude: ClaudeClient,
): Promise<string> {
  return claude.generate(buildDailyPrompt(facts, characters));
}
