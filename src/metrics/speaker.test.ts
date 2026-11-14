import { describe, expect, it } from 'vitest';

import type { NormalizedEvent } from '../collect/schemas.js';

import { classifySpeaker } from './speaker.js';

const common = {
  repository: 'octo/example',
  timestamp: '2026-05-01T00:00:00Z',
  actor: 'alice',
  number: 1,
  title: 'Work item',
};

describe('classifySpeaker', () => {
  it.each([
    [
      'reviewer',
      {
        ...common,
        type: 'review_submitted',
        subject: 'pull_request',
        reviewState: 'APPROVED',
        body: '',
      },
    ],
    [
      'reviewer',
      {
        ...common,
        type: 'comment_added',
        subject: 'pull_request',
        commentKind: 'review',
        body: 'Inline comment',
      },
    ],
    ['engineer', { ...common, type: 'pr_created', subject: 'pull_request' }],
    ['pm', { ...common, type: 'issue_created', subject: 'issue' }],
    [
      'organization',
      {
        ...common,
        type: 'label_added',
        subject: 'issue',
        label: 'status:escalated',
      },
    ],
  ] as const)('classifies the author as %s', (expected, value) => {
    expect(classifySpeaker(value as NormalizedEvent)).toBe(expected);
  });
});
