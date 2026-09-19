import type { FieldRef, Issue, Rule, RuleContext } from './types';

export interface IssueBody {
  title: string;
  detail: string;
  recommendation?: string;
  meta?: Record<string, string | number | boolean>;
}

/**
 * Builds a deterministic Issue for one occurrence of a rule violation.
 * `id` = `${rule.id}:${occurrenceKey}`; kind/severity/source come from the rule.
 */
export function makeIssue(
  rule: Rule,
  fields: FieldRef[],
  body: IssueBody,
  occurrenceKey: string,
): Issue {
  return {
    id: `${rule.id}:${occurrenceKey}`,
    ruleId: rule.id,
    severity: rule.severity,
    kind: rule.kind,
    origin: 'deterministic',
    fields,
    title: body.title,
    detail: body.detail,
    recommendation: body.recommendation,
    meta: body.meta,
    source: rule.source,
  };
}

type RuleDef = Omit<Rule, 'check'> & {
  check(ctx: RuleContext, rule: Rule): Issue[];
};

/** Defines a rule whose `check` receives the rule itself for makeIssue calls. */
export function defineRule(def: RuleDef): Rule {
  const rule: Rule = {
    id: def.id,
    label: def.label,
    kind: def.kind,
    severity: def.severity,
    source: def.source,
    check: (ctx) => def.check(ctx, rule),
  };
  return rule;
}
