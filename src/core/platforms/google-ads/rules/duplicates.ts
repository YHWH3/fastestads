import type { Issue, NonEmptyEntry, Rule } from '../../../platform/types';
import { defineRule, makeIssue } from '../../../platform/issue';
import { contentTokens, jaccard, normalizeForCompare } from '../../../text';
import { SOURCES } from '../spec';
import { displayName, occurrenceKey, ref } from './shared';

const NEAR_DUPLICATE_THRESHOLD = 0.75;
const MIN_NEAR_TOKENS = 2;

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }

  groups(): number[][] {
    const byRoot = new Map<number, number[]>();
    for (let i = 0; i < this.parent.length; i += 1) {
      const root = this.find(i);
      const list = byRoot.get(root) ?? [];
      list.push(i);
      byRoot.set(root, list);
    }
    return [...byRoot.values()].filter((g) => g.length > 1);
  }
}

function membersKey(kind: 'headline' | 'description', indices: number[]): string {
  return indices.map((i) => occurrenceKey(kind, i)).join('-');
}

function memberNames(kind: 'headline' | 'description', indices: number[]): string {
  return indices.map((i) => displayName(kind, i)).join(', ');
}

/** Groups entries by normalizeForCompare; returns groups with >= 2 members. */
function normalizedGroups(entries: NonEmptyEntry[]): NonEmptyEntry[][] {
  const byNormalized = new Map<string, NonEmptyEntry[]>();
  for (const entry of entries) {
    const key = normalizeForCompare(entry.text);
    const list = byNormalized.get(key) ?? [];
    list.push(entry);
    byNormalized.set(key, list);
  }
  return [...byNormalized.values()].filter((g) => g.length > 1);
}

function sortedIndices(group: NonEmptyEntry[]): number[] {
  return group.map((e) => e.index).sort((a, b) => a - b);
}

/** True when every member's trimmed original is identical (an exact group). */
function isExactGroup(group: NonEmptyEntry[]): boolean {
  return new Set(group.map((e) => e.text.trim())).size === 1;
}

function duplicateRule(
  id: 'duplicate.exact' | 'duplicate.normalized',
  severity: 'error' | 'warning',
  wantExact: boolean,
): Rule {
  return defineRule({
    id,
    label: wantExact ? 'Exact duplicate assets' : 'Duplicates after normalization',
    kind: 'structure',
    severity,
    source: SOURCES.repetition,
    check(ctx, rule) {
      const issues: Issue[] = [];
      for (const kind of ['headline', 'description'] as const) {
        const entries = kind === 'headline' ? ctx.nonEmpty.headlines : ctx.nonEmpty.descriptions;
        for (const group of normalizedGroups(entries)) {
          if (isExactGroup(group) !== wantExact) continue;
          const indices = sortedIndices(group);
          const names = memberNames(kind, indices);
          issues.push(
            makeIssue(
              rule,
              indices.map((i) => ref(kind, i)),
              wantExact
                ? {
                    title: `${names} are exact duplicates`,
                    detail: `${names} contain identical text. Google needs each asset to say something different.`,
                    recommendation:
                      'Rewrite each duplicate so every asset adds distinct information.',
                    meta: { members: indices.length },
                  }
                : {
                    title: `${names} differ only in punctuation or casing`,
                    detail: `${names} normalize to the same text once casing and punctuation are ignored.`,
                    recommendation: 'Differentiate these assets with genuinely different wording.',
                    meta: { members: indices.length },
                  },
              membersKey(kind, indices),
            ),
          );
        }
      }
      return issues;
    },
  });
}

const duplicateNear = defineRule({
  id: 'duplicate.near',
  label: 'Near-duplicate wording',
  kind: 'structure',
  severity: 'warning',
  source: SOURCES.repetition,
  check(ctx, rule) {
    const issues: Issue[] = [];
    for (const kind of ['headline', 'description'] as const) {
      const entries = kind === 'headline' ? ctx.nonEmpty.headlines : ctx.nonEmpty.descriptions;
      const tokenSets = entries.map((e) => new Set(contentTokens(e.text)));
      const normalized = entries.map((e) => normalizeForCompare(e.text));
      const uf = new UnionFind(entries.length);
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          // Pairs already caught as exact/normalized duplicates are skipped.
          if (normalized[i] === normalized[j]) continue;
          if (tokenSets[i].size < MIN_NEAR_TOKENS || tokenSets[j].size < MIN_NEAR_TOKENS) continue;
          if (jaccard(tokenSets[i], tokenSets[j]) >= NEAR_DUPLICATE_THRESHOLD) {
            uf.union(i, j);
          }
        }
      }
      for (const group of uf.groups()) {
        const indices = group.map((g) => entries[g].index).sort((a, b) => a - b);
        const names = memberNames(kind, indices);
        issues.push(
          makeIssue(
            rule,
            indices.map((i) => ref(kind, i)),
            {
              title: `${names} are near-duplicates`,
              detail: `${names} share at least 75% of their content words, so they largely repeat each other.`,
              recommendation: 'Rewrite them so each asset highlights a different benefit or angle.',
              meta: { members: indices.length, threshold: NEAR_DUPLICATE_THRESHOLD },
            },
            membersKey(kind, indices),
          ),
        );
      }
    }
    return issues;
  },
});

export const duplicateRules: Rule[] = [
  duplicateRule('duplicate.exact', 'error', true),
  duplicateRule('duplicate.normalized', 'warning', false),
  duplicateNear,
];
