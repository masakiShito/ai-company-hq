import type { Facts } from '../facts/index.js';

const REFERENCE_PATTERN = /#(\d+)/gu;
const MAX_GENERATION_ATTEMPTS = 2;

export interface ReportGenerator {
  generate(prompt: string): Promise<string>;
}

/** Extracts every `#number` reference from generated Markdown. */
export function extractReferencedNumbers(report: string): number[] {
  return Array.from(report.matchAll(REFERENCE_PATTERN), (match) =>
    Number(match[1]),
  );
}

function collectFactNumbers(facts: Facts): Set<number> {
  return new Set([
    ...facts.issues.map(({ number }) => number),
    ...facts.pullRequests.map(({ number }) => number),
    ...facts.eventCandidates.map(({ number }) => number),
  ]);
}

/** Rejects generated Markdown that references a number absent from facts. */
export function validateReportReferences(report: string, facts: Facts): void {
  const factNumbers = collectFactNumbers(facts);
  const missingNumbers = [
    ...new Set(
      extractReferencedNumbers(report).filter(
        (number) => !factNumbers.has(number),
      ),
    ),
  ];

  if (missingNumbers.length > 0) {
    throw new Error(
      `Generated report references numbers missing from facts: ${missingNumbers
        .map((number) => `#${number}`)
        .join(', ')}`,
    );
  }
}

/** Generates and validates a report, retrying once after validation failure. */
export async function generateVerifiedReport(
  prompt: string,
  facts: Facts,
  generator: ReportGenerator,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const report = await generator.generate(prompt);

    try {
      validateReportReferences(report, facts);
      return report;
    } catch (error) {
      if (attempt === MAX_GENERATION_ATTEMPTS) throw error;
    }
  }

  throw new Error('Report generation exhausted all attempts');
}
