import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { runDaily, type DailyDependencies } from './daily.js';
import { runMonthly } from './monthly.js';

const MonthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u, 'month must use YYYY-MM format');
const CliArgumentsSchema = z.union([
  z.tuple([z.literal('daily'), z.iso.date()]).rest(z.literal('--dry-run')),
  z.tuple([z.literal('monthly'), MonthSchema]).rest(z.literal('--dry-run')),
]);

export async function runCli(
  args: readonly string[],
  dependencies: DailyDependencies & {
    errorOutput?: (contents: string) => void;
  } = {},
): Promise<number> {
  try {
    const parsed = CliArgumentsSchema.parse(args);
    const options = { dryRun: parsed.slice(2).includes('--dry-run') };
    if (parsed[0] === 'daily') {
      await runDaily(parsed[1], options, dependencies);
    } else {
      await runMonthly(parsed[1], options, dependencies);
    }
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
