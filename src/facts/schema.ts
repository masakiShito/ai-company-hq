import { z } from 'zod';

import { RepositorySchema } from '../collect/config.js';

const NonNegativeNumberSchema = z.number().finite().nonnegative();

export const FactsPeriodSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('daily'),
      date: z.iso.date(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('monthly'),
      month: z
        .string()
        .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'month must use YYYY-MM format'),
    })
    .strict(),
]);

export const FactsMetricsSchema = z
  .object({
    issuesCreated: z.number().int().nonnegative(),
    issuesClosed: z.number().int().nonnegative(),
    pullRequestsCreated: z.number().int().nonnegative(),
    pullRequestsMerged: z.number().int().nonnegative(),
    firstReviewApprovalRate: z.number().finite().min(0).max(1),
    averageChangesRequestedPerPullRequest: NonNegativeNumberSchema,
    medianIssueLeadTimeMilliseconds: NonNegativeNumberSchema,
    questionTime: z
      .object({
        totalMilliseconds: NonNegativeNumberSchema,
        longestMilliseconds: NonNegativeNumberSchema,
      })
      .strict(),
    escalationCount: z.number().int().nonnegative(),
  })
  .strict();

export const SpeakerRoleSchema = z.enum([
  'reviewer',
  'engineer',
  'pm',
  'organization',
]);

const EventCandidateCommonSchema = z.object({
  repository: RepositorySchema,
  number: z.number().int().positive(),
  title: z.string(),
  timestamp: z.iso.datetime({ offset: true }),
  speaker: SpeakerRoleSchema,
});

export const FactsEventCandidateSchema = z.discriminatedUnion('kind', [
  EventCandidateCommonSchema.extend({
    kind: z.literal('escalation'),
  }).strict(),
  EventCandidateCommonSchema.extend({
    kind: z.literal('repeated_changes_requested'),
    changesRequestedCount: z.number().int().min(3),
  }).strict(),
  EventCandidateCommonSchema.extend({
    kind: z.literal('pull_request_merged'),
  }).strict(),
]);

export const FactsReferenceSchema = z
  .object({
    repository: RepositorySchema,
    number: z.number().int().positive(),
    title: z.string(),
  })
  .strict();

export const EmployeeActivitySchema = z
  .object({
    role: z.enum(['president', 'pm', 'engineer', 'reviewer']),
    name: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

const EMPLOYEE_ROLES = ['president', 'pm', 'engineer', 'reviewer'] as const;

export const FactsSchema = z
  .object({
    period: FactsPeriodSchema,
    metrics: FactsMetricsSchema,
    eventCandidates: z.array(FactsEventCandidateSchema),
    issues: z.array(FactsReferenceSchema),
    pullRequests: z.array(FactsReferenceSchema),
    employeeActivities: z.array(EmployeeActivitySchema),
  })
  .strict()
  .superRefine((facts, context) => {
    if (facts.period.kind !== 'daily') return;

    const roles = facts.employeeActivities.map((activity) => activity.role);
    const hasEveryEmployeeExactlyOnce =
      roles.length === EMPLOYEE_ROLES.length &&
      EMPLOYEE_ROLES.every(
        (role) => roles.filter((candidate) => candidate === role).length === 1,
      );

    if (!hasEveryEmployeeExactlyOnce) {
      context.addIssue({
        code: 'custom',
        path: ['employeeActivities'],
        message:
          'daily facts must contain exactly one summary for each employee',
      });
    }
  });

export type Facts = z.infer<typeof FactsSchema>;
export type FactsPeriod = z.infer<typeof FactsPeriodSchema>;
export type FactsReference = z.infer<typeof FactsReferenceSchema>;
export type EmployeeActivity = z.infer<typeof EmployeeActivitySchema>;
