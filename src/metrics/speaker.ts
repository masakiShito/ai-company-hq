import type { NormalizedEvent } from '../collect/schemas.js';

export type SpeakerRole = 'reviewer' | 'engineer' | 'pm' | 'organization';

/**
 * Maps the author of a normalized event to its organizational role.
 * Events that do not represent one of the explicitly known author contexts
 * intentionally fall back to the organization.
 */
export function classifySpeaker(event: NormalizedEvent): SpeakerRole {
  if (
    event.type === 'review_submitted' ||
    (event.type === 'comment_added' && event.commentKind === 'review')
  ) {
    return 'reviewer';
  }

  if (event.type === 'pr_created') {
    return 'engineer';
  }

  if (event.type === 'issue_created') {
    return 'pm';
  }

  return 'organization';
}
