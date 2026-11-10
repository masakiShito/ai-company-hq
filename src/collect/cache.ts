import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface RawCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

export class FileRawCache implements RawCache {
  constructor(private readonly directory = 'data/raw') {}

  async get(key: string): Promise<unknown | undefined> {
    try {
      const contents = await readFile(this.pathFor(key), 'utf8');
      const parsed: unknown = JSON.parse(contents);
      return parsed;
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const destination = this.pathFor(key);
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, destination);
  }

  private pathFor(key: string): string {
    const digest = createHash('sha256').update(key).digest('hex');
    return path.join(this.directory, `${digest}.json`);
  }
}
