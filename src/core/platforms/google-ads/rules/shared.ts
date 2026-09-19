import type { FieldKind, FieldRef, NonEmptyEntry, RuleContext } from '../../../platform/types';

export const FIELD_LABEL: Record<'headline' | 'description' | 'path', string> = {
  headline: 'Headline',
  description: 'Description',
  path: 'Path',
};

const FIELD_PREFIX: Record<'headline' | 'description' | 'path', string> = {
  headline: 'h',
  description: 'd',
  path: 'p',
};

/** "Headline 2", "Description 1", "Path 2" — display is 1-based. */
export function displayName(kind: 'headline' | 'description' | 'path', index: number): string {
  return `${FIELD_LABEL[kind]} ${index + 1}`;
}

export function ref(kind: 'headline' | 'description' | 'path', index: number): FieldRef {
  return { field: kind, index };
}

export function occurrenceKey(kind: 'headline' | 'description' | 'path', index: number): string {
  return `${FIELD_PREFIX[kind]}${index + 1}`;
}

export function nonEmptyFor(
  ctx: RuleContext,
  kind: 'headline' | 'description' | 'path',
): NonEmptyEntry[] {
  return ctx.nonEmpty[
    kind === 'headline' ? 'headlines' : kind === 'description' ? 'descriptions' : 'paths'
  ];
}

export function countFor(ctx: RuleContext, kind: 'headline' | 'description' | 'path'): number {
  return ctx.counts[
    kind === 'headline' ? 'headlines' : kind === 'description' ? 'descriptions' : 'paths'
  ];
}

/** All non-empty ad-text assets (headlines, descriptions, paths). */
export function allAssets(ctx: RuleContext): Array<{
  kind: 'headline' | 'description' | 'path';
  entry: NonEmptyEntry;
}> {
  const out: Array<{ kind: 'headline' | 'description' | 'path'; entry: NonEmptyEntry }> = [];
  for (const entry of ctx.nonEmpty.headlines) out.push({ kind: 'headline', entry });
  for (const entry of ctx.nonEmpty.descriptions) out.push({ kind: 'description', entry });
  for (const entry of ctx.nonEmpty.paths) out.push({ kind: 'path', entry });
  return out;
}

export function fieldRefFor(
  kind: 'headline' | 'description' | 'path' | 'finalUrl' | 'keyword',
  index: number,
): FieldRef {
  return { field: kind as FieldKind, index };
}
