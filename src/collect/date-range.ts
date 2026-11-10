import { z } from 'zod';

import {
  NormalizedEventArraySchema,
  type NormalizedEvent,
} from './schemas.js';

const DateOnlySchema = z.iso.date();
const TOKYO_OFFSET = '+09:00';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateRange {
  from: string;
  to: string;
}

function tokyoDayStart(date: string): number {
  return Date.parse(`${date}T00:00:00${TOKYO_OFFSET}`);
}

export function filterEventsByTokyoDateRange(
  events: readonly NormalizedEvent[],
  range: DateRange,
): NormalizedEvent[] {
  const from = DateOnlySchema.parse(range.from);
  const to = DateOnlySchema.parse(range.to);
  const start = tokyoDayStart(from);
  const endExclusive = tokyoDayStart(to) + MILLISECONDS_PER_DAY;

  if (start >= endExclusive) {
    throw new RangeError('date range "from" must be before or equal to "to"');
  }

  return NormalizedEventArraySchema.parse(events).filter((event) => {
    const timestamp = Date.parse(event.timestamp);
    return timestamp >= start && timestamp < endExclusive;
  });
}
