import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { GhCliClient, type CommandRunner } from './gh-client.js';

describe('GhCliClient', () => {
  it('runs gh api through the injected runner and combines paginated results', async () => {
    const run = vi
      .fn<CommandRunner['run']>()
      .mockResolvedValue(
        JSON.stringify([[{ number: 1 }], [{ number: 2 }, { number: 3 }]]),
      );
    const client = new GhCliClient({ run });

    await expect(client.api('repos/octo/example/issues')).resolves.toEqual([
      { number: 1 },
      { number: 2 },
      { number: 3 },
    ]);
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith('gh', [
      'api',
      '--paginate',
      '--slurp',
      '-H',
      'Accept: application/vnd.github+json',
      'repos/octo/example/issues',
    ]);
  });

  it('supports a custom executable', async () => {
    const run = vi.fn<CommandRunner['run']>().mockResolvedValue('[]');
    const client = new GhCliClient({ run }, '/opt/bin/gh-test');

    await client.api('/user');

    expect(run).toHaveBeenCalledWith('/opt/bin/gh-test', expect.any(Array));
  });

  it('rejects malformed JSON returned by gh', async () => {
    const run = vi.fn<CommandRunner['run']>().mockResolvedValue('{invalid');
    const client = new GhCliClient({ run });

    await expect(client.api('/user')).rejects.toBeInstanceOf(SyntaxError);
  });

  it('rejects a response that is not a slurped page array', async () => {
    const run = vi
      .fn<CommandRunner['run']>()
      .mockResolvedValue(JSON.stringify([{ number: 1 }]));
    const client = new GhCliClient({ run });

    await expect(client.api('/user')).rejects.toBeInstanceOf(ZodError);
  });
});
