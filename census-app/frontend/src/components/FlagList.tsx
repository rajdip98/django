/** Renders data-quality flags produced by the validation engine. */

import { useApp } from '../lib/store';
import { summariseFlags } from '../lib/validation';
import type { Household, ValidationFlag } from '../lib/types';

const SEVERITY_ORDER: Record<ValidationFlag['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function FlagList({
  flags,
  household,
  limit,
}: {
  flags: ValidationFlag[];
  /** Used to name the member a flag belongs to. */
  household?: Household;
  limit?: number;
}): JSX.Element | null {
  const { t } = useApp();

  if (!flags.length) return null;

  const sorted = [...flags].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const hidden = sorted.length - shown.length;

  return (
    <div className="flag-list">
      {shown.map((flag, index) => {
        const memberIndex = flag.memberId
          ? household?.members.findIndex((member) => member.id === flag.memberId)
          : undefined;
        const member =
          memberIndex !== undefined && memberIndex >= 0
            ? household?.members[memberIndex]
            : undefined;

        return (
          <div className={`flag ${flag.severity}`} key={`${flag.code}-${flag.memberId ?? ''}-${index}`}>
            <div>
              {member ? (
                <span className="flag-where">
                  {t('validation.forMember', {
                    index: (memberIndex ?? 0) + 1,
                    name: member.name || t('common.unknown'),
                  })}
                </span>
              ) : null}
              {t(flag.messageKey, flag.values)}
            </div>
          </div>
        );
      })}
      {hidden > 0 ? <p className="tiny">+{hidden}</p> : null}
    </div>
  );
}

export function FlagSummaryChips({ flags }: { flags: ValidationFlag[] }): JSX.Element | null {
  const { t } = useApp();
  const summary = summariseFlags(flags);

  if (!summary.total) {
    return <span className="badge badge-approved">✓ {t('form.review.noIssues')}</span>;
  }

  return (
    <div className="row-wrap">
      {summary.errors > 0 ? (
        <span className="badge badge-flagged">
          {t('form.review.errors', { count: summary.errors })}
        </span>
      ) : null}
      {summary.warnings > 0 ? (
        <span className="badge badge-warning">
          {t('form.review.warnings', { count: summary.warnings })}
        </span>
      ) : null}
      {summary.infos > 0 ? (
        <span className="badge badge-submitted">
          {t('form.review.infos', { count: summary.infos })}
        </span>
      ) : null}
    </div>
  );
}
