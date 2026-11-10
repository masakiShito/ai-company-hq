import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FileRawCache } from './cache.js';

const temporaryDirectories: string[] = [];

async function createCache(): Promise<{
  cache: FileRawCache;
  directory: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'raw-cache-'));
  temporaryDirectories.push(root);
  const directory = path.join(root, 'nested', 'raw');
  return { cache: new FileRawCache(directory), directory };
}

function filenameFor(key: string): string {
  return `${createHash('sha256').update(key).digest('hex')}.json`;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('FileRawCache', () => {
  it('returns undefined when a key is not cached', async () => {
    const { cache } = await createCache();

    await expect(cache.get('missing')).resolves.toBeUndefined();
  });

  it('creates the cache directory and stores JSON under a hashed key', async () => {
    const { cache, directory } = await createCache();
    const value = { items: [{ number: 1 }], next: null };

    await cache.set('repos/octo/example/issues', value);

    await expect(cache.get('repos/octo/example/issues')).resolves.toEqual(
      value,
    );
    await expect(
      readFile(
        path.join(directory, filenameFor('repos/octo/example/issues')),
        'utf8',
      ),
    ).resolves.toBe(`${JSON.stringify(value, null, 2)}\n`);
  });

  it('overwrites an existing cached value', async () => {
    const { cache } = await createCache();

    await cache.set('key', { version: 1 });
    await cache.set('key', { version: 2 });

    await expect(cache.get('key')).resolves.toEqual({ version: 2 });
  });

  it('propagates invalid cached JSON', async () => {
    const { cache, directory } = await createCache();
    await cache.set('key', { valid: true });
    await writeFile(
      path.join(directory, filenameFor('key')),
      '{invalid',
      'utf8',
    );

    await expect(cache.get('key')).rejects.toBeInstanceOf(SyntaxError);
  });
});
