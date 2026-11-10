import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { loadCompanyConfig } from './config.js';

const temporaryDirectories: string[] = [];

async function writeConfig(value: unknown): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'company-config-'));
  temporaryDirectories.push(directory);
  const configPath = path.join(directory, 'company.config.json');
  await writeFile(configPath, JSON.stringify(value), 'utf8');
  return configPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadCompanyConfig', () => {
  it('loads a valid company configuration', async () => {
    const config = {
      name: 'Example Company',
      timezone: 'Asia/Tokyo',
      repos: ['octo-org/alpha', 'octo-org/beta.js'],
    };
    const configPath = await writeConfig(config);

    await expect(loadCompanyConfig(configPath)).resolves.toEqual(config);
  });

  it.each([
    [
      'an unsupported timezone',
      { name: 'Example', timezone: 'UTC', repos: ['a/b'] },
    ],
    [
      'an invalid repository',
      { name: 'Example', timezone: 'Asia/Tokyo', repos: ['invalid'] },
    ],
    [
      'an empty repository list',
      { name: 'Example', timezone: 'Asia/Tokyo', repos: [] },
    ],
    [
      'an unknown property',
      {
        name: 'Example',
        timezone: 'Asia/Tokyo',
        repos: ['a/b'],
        token: 'secret',
      },
    ],
  ])('rejects %s', async (_description, config) => {
    const configPath = await writeConfig(config);

    await expect(loadCompanyConfig(configPath)).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});
