import type { NormalizedEvent } from '../collect/schemas.js';

import type { MetricsPeriod } from './calculations.js';
import { classifySpeaker, type SpeakerRole } from './speaker.js';

export type EventCandidateKind =
  'escalation' | 'repeated_changes_requested' | 'pull_request_merged';

export interface EventCandidate {
  kind: EventCandidateKind;
  repository: string;
  number: number;
  title: string;
  timestamp: string;
  speaker: SpeakerRole;
  changesRequestedCount?: number;
}

function subjectKey(event: NormalizedEvent): string {
  return `${event.repository}#${event.number}`;
}

export function extractEventCandidates(
  events: readonly NormalizedEvent[],
  period: MetricsPeriod,
): EventCandidate[] {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new RangeError(
      'metrics period must contain valid timestamps and start before end',
    );
  }

  const inPeriod = (event: NormalizedEvent): boolean => {
    const timestamp = Date.parse(event.timestamp);
    return timestamp >= start && timestamp < end;
  };
  const candidates: EventCandidate[] = [];
  const escalatedIssues = new Set<string>();

  for (const event of events) {
    if (!inPeriod(event)) continue;
    if (
      event.type === 'label_added' &&
      event.subject === 'issue' &&
      event.label === 'status:escalated'
    ) {
      const key = subjectKey(event);
      if (escalatedIssues.has(key)) continue;
      escalatedIssues.add(key);
      candidates.push({
        kind: 'escalation',
        repository: event.repository,
        number: event.number,
        title: event.title,
        timestamp: event.timestamp,
        speaker: classifySpeaker(event),
      });
    } else if (event.type === 'pr_merged') {
      candidates.push({
        kind: 'pull_request_merged',
        repository: event.repository,
        number: event.number,
        title: event.title,
        timestamp: event.timestamp,
        speaker: classifySpeaker(event),
      });
    }
  }

  const changesByPullRequest = new Map<
    string,
    { count: number; last: NormalizedEvent }
  >();
  for (const event of events) {
    if (
      event.type !== 'review_submitted' ||
      !inPeriod(event) ||
      event.reviewState.toUpperCase() !== 'CHANGES_REQUESTED'
    ) {
      continue;
    }
    const key = subjectKey(event);
    const current = changesByPullRequest.get(key);
    changesByPullRequest.set(key, {
      count: (current?.count ?? 0) + 1,
      last:
        current === undefined || current.last.timestamp < event.timestamp
          ? event
          : current.last,
    });
  }

  for (const { count, last } of changesByPullRequest.values()) {
    if (count < 3) continue;
    candidates.push({
      kind: 'repeated_changes_requested',
      repository: last.repository,
      number: last.number,
      title: last.title,
      timestamp: last.timestamp,
      speaker: classifySpeaker(last),
      changesRequestedCount: count,
    });
  }

  return candidates.toSorted((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
}
