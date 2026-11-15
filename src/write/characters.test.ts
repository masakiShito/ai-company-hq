import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { loadCharacters } from './characters.js';

const temporaryDirectories: string[] = [];

async function createCharactersDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'characters-'));
  temporaryDirectories.push(directory);
  const charactersDirectory = path.join(directory, 'characters');
  await mkdir(charactersDirectory);
  return charactersDirectory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadCharacters', () => {
  it('loads typed character definitions in file-name order', async () => {
    const directory = await createCharactersDirectory();
    await Promise.all([
      writeFile(
        path.join(directory, 'pm.md'),
        '# 竹中官兵衛（たけなか かんべえ）— PM\n\n- 性格：軍師気質\n- 文体：武家言葉\n',
        'utf8',
      ),
      writeFile(
        path.join(directory, 'engineer.md'),
        '# 藤堂秀吉（とうどう ひでよし）— エンジニア\n\n- 性格：寡黙\n',
        'utf8',
      ),
      writeFile(
        path.join(directory, 'README.md'),
        '# 社員名簿\n\n共通ルール',
        'utf8',
      ),
    ]);

    await expect(loadCharacters(directory)).resolves.toEqual([
      {
        role: 'engineer',
        name: '藤堂秀吉（とうどう ひでよし）',
        description: '- 性格：寡黙',
      },
      {
        role: 'pm',
        name: '竹中官兵衛（たけなか かんべえ）',
        description: '- 性格：軍師気質\n- 文体：武家言葉',
      },
    ]);
  });

  it('rejects a character with a malformed heading', async () => {
    const directory = await createCharactersDirectory();
    await writeFile(
      path.join(directory, 'reviewer.md'),
      '# 大岡三成\n\n- 性格：公正',
      'utf8',
    );

    await expect(loadCharacters(directory)).rejects.toThrow(
      'expected "# <name> — <role>"',
    );
  });

  it('rejects an unsupported role', async () => {
    const directory = await createCharactersDirectory();
    await writeFile(
      path.join(directory, 'intern.md'),
      '# 見習い — インターン\n\n- 性格：熱心',
      'utf8',
    );

    await expect(loadCharacters(directory)).rejects.toBeInstanceOf(ZodError);
  });
});
