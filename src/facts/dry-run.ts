import { FactsSchema, type Facts } from './schema.js';

export type FactsOutput = (contents: string) => void;

/** Writes validated facts as JSON when the CLI arguments contain --dry-run. */
export function outputFactsForDryRun(
  facts: Facts,
  args: readonly string[] = process.argv.slice(2),
  output: FactsOutput = (contents) => process.stdout.write(contents),
): boolean {
  if (!args.includes('--dry-run')) return false;

  const validatedFacts = FactsSchema.parse(facts);
  output(`${JSON.stringify(validatedFacts, null, 2)}\n`);
  return true;
}
