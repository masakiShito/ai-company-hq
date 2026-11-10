import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

const execFileAsync = promisify(execFile);

export interface GhApiClient {
  api(endpoint: string): Promise<unknown>;
}

export interface CommandRunner {
  run(command: string, args: readonly string[]): Promise<string>;
}

class NodeCommandRunner implements CommandRunner {
  async run(command: string, args: readonly string[]): Promise<string> {
    const { stdout } = await execFileAsync(command, [...args], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });

    return stdout;
  }
}

export class GhCliClient implements GhApiClient {
  constructor(
    private readonly runner: CommandRunner = new NodeCommandRunner(),
    private readonly executable = 'gh',
  ) {}

  async api(endpoint: string): Promise<unknown> {
    const stdout = await this.runner.run(this.executable, [
      'api',
      '--paginate',
      '--slurp',
      '-H',
      'Accept: application/vnd.github+json',
      endpoint,
    ]);
    const parsed: unknown = JSON.parse(stdout);
    const pages = z.array(z.array(z.unknown())).parse(parsed);

    return pages.flat();
  }
}
