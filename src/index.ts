import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { runDaily, type DailyDependencies } from './daily.js';

const CliArgumentsSchema = z
  .tuple([z.literal('daily'), z.iso.date()])
  .rest(z.literal('--dry-run'));

export async function runCli(
  args: readonly string[],
  dependencies: DailyDependencies & {
    errorOutput?: (contents: string) => void;
  } = {},
): Promise<number> {
  try {
    const parsed = CliArgumentsSchema.parse(args);
    await runDaily(
      parsed[1],
      { dryRun: parsed.slice(2).includes('--dry-run') },
      dependencies,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    (
      dependencies.errorOutput ?? ((contents) => process.stderr.write(contents))
    )(`newsletter: ${message}\n`);
    return 1;
  }
}

const entryPoint = process.argv[1];
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
