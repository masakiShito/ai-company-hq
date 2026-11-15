import { describe, expect, it } from 'vitest';

import type { NormalizedEvent } from '../collect/schemas.js';

import { classifySpeaker, parseActorMarker } from './speaker.js';

const common = {
  repository: 'octo/example',
  timestamp: '2026-05-01T00:00:00Z',
  actor: 'alice',
  number: 1,
  title: 'Work item',
};

describe('parseActorMarker', () => {
  it.each([
    ['pm', 'Issue details\n\n<!-- ai-company:actor=pm -->'],
    ['engineer', '<!-- ai-company:actor=engineer -->'],
    ['reviewer', 'Review details<!-- ai-company:actor=reviewer -->\n'],
  ] as const)(
    'returns %s from a marker at the end of the body',
    (actor, body) => {
      expect(parseActorMarker(body)).toBe(actor);
    },
  );

  it.each([
    'no marker',
    '<!-- ai-company:actor=organization -->',
    '<!-- ai-company:actor=pm --> trailing text',
  ])('returns null for %j', (body) => {
    expect(parseActorMarker(body)).toBeNull();
  });
});

describe('classifySpeaker', () => {
  it('uses an actor marker before all other rules', () => {
    expect(
      classifySpeaker({
        ...common,
        type: 'pr_created',
        subject: 'pull_request',
        body: '<!-- ai-company:actor=pm -->',
        headRefName: 'chore/update-settings',
      }),
    ).toBe('pm');
  });

  it('classifies a PR from a chore branch as the president', () => {
    expect(
      classifySpeaker({
        ...common,
        type: 'pr_created',
        subject: 'pull_request',
        body: '',
        headRefName: 'chore/update-settings',
      }),
    ).toBe('president');
  });

  it('classifies a comment whose first line starts with 判定: as the reviewer', () => {
    expect(
      classifySpeaker({
        ...common,
        type: 'comment_added',
        subject: 'issue',
        commentKind: 'issue',
        body: '判定: 修正が必要\n詳細',
      }),
    ).toBe('reviewer');
  });

  it.each([
    ['president', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'],
    ['pm', '2026-05-02T00:00:00Z', '2026-05-02T00:00:00Z'],
    ['pm', '2026-05-03T00:00:00Z', '2026-05-02T00:00:00Z'],
    ['pm', '2026-05-01T00:00:00Z', undefined],
  ] as const)(
    'classifies a merged PR as %s when merged at %s and autonomousSince is %s',
    (expected, timestamp, autonomousSince) => {
      expect(
        classifySpeaker(
          {
            ...common,
            type: 'pr_merged',
            subject: 'pull_request',
            timestamp,
          },
          autonomousSince,
        ),
      ).toBe(expected);
    },
  );

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
    [
      'engineer',
      {
        ...common,
        type: 'pr_created',
        subject: 'pull_request',
        headRefName: 'feat/reporting',
      },
    ],
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
