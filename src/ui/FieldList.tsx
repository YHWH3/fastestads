import type { FieldStat, Issue } from '@core/platform/types';

export interface FieldListProps {
  kind: 'headline' | 'description' | 'path';
  label: string;
  values: string[];
  stats: FieldStat[] | undefined;
  issuesByField: Map<string, Issue[]>;
  max: number;
  maxChars: number;
  countedLength: (s: string) => number;
  onUpdate: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

const SINGULAR: Record<FieldListProps['kind'], string> = {
  headline: 'Headline',
  description: 'Description',
  path: 'Path',
};

export function FieldList(props: FieldListProps) {
  const { kind, label, values, max, maxChars } = props;
  const singular = SINGULAR[kind];
  return (
    <fieldset>
      <legend>{label}</legend>
      {values.map((value, index) => {
        const counted = props.countedLength(value);
        const over = counted > maxChars;
        const stat = props.stats?.[index];
        const status = stat?.status ?? (value.trim() === '' ? 'empty' : over ? 'over' : 'ok');
        const counterId = `fa-${kind}-${index}-counter`;
        const issuesId = `fa-${kind}-${index}-issues`;
        const fieldIssues = props.issuesByField.get(`${kind}:${index}`) ?? [];
        const hasError = fieldIssues.some((i) => i.severity === 'error');
        const describedBy = fieldIssues.length > 0 ? `${counterId} ${issuesId}` : counterId;
        return (
          <div class="fa-field-row" key={index}>
            <label for={`fa-${kind}-${index}`}>
              {singular} {index + 1}
            </label>
            <div class="fa-field-line">
              <input
                id={`fa-${kind}-${index}`}
                type="text"
                value={value}
                data-status={status}
                aria-invalid={hasError || undefined}
                aria-describedby={describedBy}
                onInput={(e) => props.onUpdate(index, (e.target as HTMLInputElement).value)}
              />
              <span class="fa-field-side">
                <span class="fa-counter" id={counterId} data-status={status}>
                  {counted} / {maxChars}
                </span>
                {over && <span class="fa-over-text">Over limit by {counted - maxChars}</span>}
              </span>
              {values.length > 1 && (
                <button
                  type="button"
                  class="fa-remove-btn"
                  aria-label={`Remove ${singular.toLowerCase()} ${index + 1}`}
                  onClick={() => props.onRemove(index)}
                >
                  ×
                </button>
              )}
            </div>
            {fieldIssues.length > 0 && (
              <ul class="fa-field-issues" id={issuesId}>
                {fieldIssues.map((issue) => (
                  <li key={issue.id}>{issue.title}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {values.length < max && (
        <button type="button" class="fa-btn" onClick={props.onAdd}>
          Add {singular.toLowerCase()}
        </button>
      )}
    </fieldset>
  );
}
