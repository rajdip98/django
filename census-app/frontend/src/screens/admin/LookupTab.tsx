/** The support desk: find any household, and move it to another enumerator.
 *
 * Two things happen in every real census operation. A citizen rings up with an
 * acknowledgement number and wants to know their household was counted. And an
 * enumerator leaves mid-survey, stranding their records where nobody else can
 * see them.
 */

import { useState } from 'react';

import { LocationIcon, SearchIcon } from '../../components/Icons';
import { Banner, EmptyState } from '../../components/Layout';
import { Sheet } from '../../components/Sheet';
import * as api from '../../lib/api';
import { googleMapsUrl } from '../../lib/maps';
import { useApp } from '../../lib/store';
import type { Household, User } from '../../lib/types';
import { relativeTime } from '../../lib/utils';

export function LookupTab(): JSX.Element {
  const { t, backend, users, toast } = useApp();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Household[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [reassigning, setReassigning] = useState<Household | null>(null);

  const search = async () => {
    const needle = query.trim();
    if (needle.length < 2) return;
    setSearching(true);
    try {
      setResults(await api.lookupHouseholds(needle));
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    } finally {
      setSearching(false);
    }
  };

  const reassign = async (household: Household, enumeratorId: string, reason: string) => {
    try {
      await api.reassignHousehold(household.id, enumeratorId, reason);
      toast(t('lookup.reassigned'), 'success');
      setReassigning(null);
      await search();
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };

  if (!backend) {
    return (
      <Banner kind="warning" icon="⚠">
        {t('admin.serverRequired')}
      </Banner>
    );
  }

  return (
    <div className="stack">
      <Banner kind="info" icon="🔎">
        {t('lookup.hint')}
      </Banner>

      <form
        className="card stack-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="lookup-query">
            {t('lookup.title')}
          </label>
          <input
            id="lookup-query"
            type="search"
            value={query}
            placeholder={t('lookup.placeholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={searching || query.trim().length < 2}
        >
          <SearchIcon />
          {searching ? t('common.loading') : t('common.search')}
        </button>
      </form>

      {results === null ? null : results.length ? (
        <div className="list">
          {results.map((household) => (
            <ResultCard
              key={household.id}
              household={household}
              onReassign={() => setReassigning(household)}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="🔍" title={t('lookup.noResults')} />
        </div>
      )}

      {reassigning ? (
        <ReassignSheet
          household={reassigning}
          users={users}
          onClose={() => setReassigning(null)}
          onSubmit={(enumeratorId, reason) => void reassign(reassigning, enumeratorId, reason)}
        />
      ) : null}
    </div>
  );
}

function ResultCard({
  household,
  onReassign,
}: {
  household: Household;
  onReassign: () => void;
}): JSX.Element {
  const { t } = useApp();
  const address =
    [household.address.houseNumber, household.address.village || household.address.locality]
      .filter(Boolean)
      .join(', ') || '—';

  return (
    <div className="card stack-sm">
      <div className="row-between">
        <span className="title mono">{household.householdNumber}</span>
        <span className={`badge badge-${household.status}`}>{t(`status.${household.status}`)}</span>
      </div>
      {household.acknowledgementId ? (
        <div className="meta mono tiny">{household.acknowledgementId}</div>
      ) : null}
      <div className="meta">{address}</div>
      <div className="meta tiny">
        {t('lookup.collectedBy', { name: household.enumeratorName || t('common.unknown') })} ·{' '}
        {t('households.members', { count: household.members.length })} ·{' '}
        {relativeTime(household.updatedAt)}
      </div>

      <div className="row-wrap">
        {household.location ? (
          <a
            className="btn btn-outline btn-sm"
            href={googleMapsUrl(household.location)}
            target="_blank"
            rel="noreferrer"
          >
            <LocationIcon />
            {t('maps.view')}
          </a>
        ) : null}
        <button type="button" className="btn btn-accent btn-sm" onClick={onReassign}>
          {t('lookup.reassign')}
        </button>
      </div>
    </div>
  );
}

function ReassignSheet({
  household,
  users,
  onClose,
  onSubmit,
}: {
  household: Household;
  users: User[];
  onClose: () => void;
  onSubmit: (enumeratorId: string, reason: string) => void;
}): JSX.Element {
  const { t } = useApp();
  const [enumeratorId, setEnumeratorId] = useState('');
  const [reason, setReason] = useState('');

  // Households belong to field staff, never to a citizen account.
  const candidates = users.filter(
    (user) => user.active && user.role !== 'citizen' && user.id !== household.enumeratorId,
  );

  return (
    <Sheet
      title={t('lookup.reassign')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!enumeratorId}
            onClick={() => onSubmit(enumeratorId, reason)}
          >
            {t('lookup.reassign')}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">
          <span className="mono">{household.householdNumber}</span> —{' '}
          {t('lookup.collectedBy', { name: household.enumeratorName || t('common.unknown') })}
        </p>

        <div className="field">
          <label className="field-label" htmlFor="reassign-to">
            {t('lookup.reassignTo')}
          </label>
          {candidates.length ? (
            <select
              id="reassign-to"
              value={enumeratorId}
              onChange={(event) => setEnumeratorId(event.target.value)}
            >
              <option value="">{t('lookup.chooseEnumerator')}</option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} — {t(`role.${user.role}`)}
                </option>
              ))}
            </select>
          ) : (
            <p className="tiny">{t('admin.noUsers')}</p>
          )}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reassign-reason">
            {t('lookup.reassignReason')}
            <span className="optional">({t('common.optional')})</span>
          </label>
          <textarea
            id="reassign-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>
    </Sheet>
  );
}
