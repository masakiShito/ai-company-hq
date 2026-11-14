import type { EventCandidate, Metrics } from '../metrics/index.js';

import {
  FactsSchema,
  type EmployeeActivity,
  type Facts,
  type FactsPeriod,
  type FactsReference,
} from './schema.js';

export interface BuildFactsInput {
  period: FactsPeriod;
  metrics: Metrics;
  eventCandidates: readonly EventCandidate[];
  issues: readonly FactsReference[];
  pullRequests: readonly FactsReference[];
  employeeActivities: readonly EmployeeActivity[];
}

/** Builds and validates the complete, sole input passed to the newsletter LLM. */
export function buildFacts(input: BuildFactsInput): Facts {
  return FactsSchema.parse({
    period: input.period,
    metrics: input.metrics,
    eventCandidates: input.eventCandidates,
    issues: input.issues,
    pullRequests: input.pullRequests,
    employeeActivities: input.employeeActivities,
  });
}
