import type { NormalizedEvent } from '../collect/schemas.js';

export type SpeakerRole = 'reviewer' | 'engineer' | 'pm' | 'organization';

const ACTOR_MARKER_PATTERN =
  /<!-- ai-company:actor=(pm|engineer|reviewer) -->\s*$/;

/** Returns the actor declared by a marker at the end of a body. */
export function parseActorMarker(
  body: string,
): 'pm' | 'engineer' | 'reviewer' | null {
  const actor = ACTOR_MARKER_PATTERN.exec(body)?.[1];
  if (actor === 'pm' || actor === 'engineer' || actor === 'reviewer') {
    return actor;
  }
  return null;
}

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
