/** Household list with search and status filters. */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PlusIcon, SearchIcon } from '../components/Icons';
import { AppShell, EmptyState } from '../components/Layout';
import { useApp } from '../lib/store';
import type { Household, HouseholdStatus } from '../lib/types';
import { relativeTime } from '../lib/utils';

type Filter = 'all' | HouseholdStatus;

const FILTERS: Array<{ value: Filter; labelKey: string }> = [
  { value: 'all', labelKey: 'households.filter.all' },
  { value: 'draft', labelKey: 'households.filter.draft' },
  { value: 'submitted', labelKey: 'households.filter.submitted' },
  { value: 'approved', labelKey: 'households.filter.approved' },
  { value: 'flagged', labelKey: 'households.filter.flagged' },
];

function matches(household: Household, query: string): boolean {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    household.householdNumber,
    household.acknowledgementId ?? '',
    household.address.houseNumber,
    household.address.buildingName,
    household.address.street,
    household.address.locality,
    household.address.village,
    household.address.district,
    household.address.pincode,
    household.enumeratorName,
    ...household.members.map((member) => member.name),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export function HouseholdsScreen(): JSX.Element {
  const { t, households } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: households.length,
      draft: 0,
      submitted: 0,
      approved: 0,
      flagged: 0,
    };
    for (const household of households) result[household.status] += 1;
    return result;
  }, [households]);

  const visible = useMemo(
    () =>
      households.filter(
        (household) =>
          (filter === 'all' || household.status === filter) && matches(household, query),
      ),
    [filter, households, query],
  );

  return (
    <AppShell title={t('households.title')} subtitle={`${households.length}`}>
      <div className="stack">
        <div className="field">
          <label className="sr-only" htmlFor="household-search">
            {t('households.search')}
          </label>
          <div className="input-with-action">
            <input
              id="household-search"
              type="search"
              value={query}
              placeholder={t('households.search')}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span className="mic-btn" aria-hidden="true">
              <SearchIcon />
            </span>
          </div>
        </div>

        <div className="tabs" role="tablist">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={filter === option.value}
              className={`tab${filter === option.value ? ' active' : ''}`}
              onClick={() => setFilter(option.value)}
            >
              {t(option.labelKey)} ({counts[option.value]})
            </button>
          ))}
        </div>

        {visible.length ? (
          <div className="list">
            {visible.map((household) => (
              <HouseholdCard key={household.id} household={household} />
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon={households.length ? '🔍' : '🏠'}
              title={households.length ? t('households.noMatches') : t('households.empty')}
              hint={households.length ? undefined : t('households.emptyHint')}
              action={
                households.length ? undefined : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => navigate('/households/new')}
                  >
                    <PlusIcon />
                    {t('households.new')}
                  </button>
                )
              }
            />
          </div>
        )}
      </div>

      <Link className="btn btn-primary fab" to="/households/new" aria-label={t('households.new')}>
        <PlusIcon />
        {t('common.add')}
      </Link>
    </AppShell>
  );
}

function HouseholdCard({ household }: { household: Household }): JSX.Element {
  const { t } = useApp();

  const errors = household.flags.filter((flag) => flag.severity === 'error').length;
  const address =
    [household.address.houseNumber, household.address.village || household.address.locality]
      .filter(Boolean)
      .join(', ') || t('common.notSet');

  const memberLabel =
    household.members.length === 1
      ? t('households.member')
      : t('households.members', { count: household.members.length });

  return (
    <Link className="list-item" to={`/households/${household.id}`}>
      <div className="row-between">
        <span className="title mono">{household.householdNumber}</span>
        <span className={`badge badge-${household.status}`}>{t(`status.${household.status}`)}</span>
      </div>
      <div className="meta">{address}</div>
      <div className="meta row-wrap" style={{ gap: 6 }}>
        <span>{memberLabel}</span>
        <span>·</span>
        <span>{relativeTime(household.updatedAt)}</span>
        {household.location ? <span title="Geo-tagged">· 📍</span> : null}
        {household.sync === 'pending' ? <span className="badge badge-warning">⇅</span> : null}
        {household.sync === 'error' ? <span className="badge badge-flagged">!</span> : null}
        {errors > 0 ? (
          <span className="badge badge-flagged">{t('form.review.errors', { count: errors })}</span>
        ) : null}
      </div>
    </Link>
  );
}
