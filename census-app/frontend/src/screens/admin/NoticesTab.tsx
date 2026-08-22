/** Publish a notice once; it reaches every enumerator and supervisor it names.
 *
 * Notices travel on the sync, so one written while a team is in the field
 * appears the next time their phones come back online.
 */

import { useCallback, useEffect, useState } from 'react';

import { PlusIcon, TrashIcon } from '../../components/Icons';
import { Banner, EmptyState } from '../../components/Layout';
import { ConfirmSheet, Sheet } from '../../components/Sheet';
import * as api from '../../lib/api';
import { useApp } from '../../lib/store';
import type { Notice, NoticeAudience, NoticeLevel } from '../../lib/types';
import { formatDateTime } from '../../lib/utils';

const AUDIENCES: NoticeAudience[] = ['all', 'enumerator', 'supervisor'];
const LEVELS: NoticeLevel[] = ['info', 'important', 'urgent'];

const LEVEL_BADGE: Record<NoticeLevel, string> = {
  info: 'badge-submitted',
  important: 'badge-warning',
  urgent: 'badge-flagged',
};

export function NoticesTab(): JSX.Element {
  const { t, locale, backend, toast, refreshNotices } = useApp();

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partial<Notice> | null>(null);
  const [removing, setRemoving] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    if (!backend) return;
    setLoading(true);
    try {
      // Administrators see withdrawn notices too, so they can republish one.
      setNotices(await api.listNotices(true));
    } catch (error) {
      console.warn('census: could not load notices', error);
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (draft: Partial<Notice>) => {
    if (!draft.title?.trim() || !draft.body?.trim()) {
      toast(t('notices.titleRequired'), 'error');
      return;
    }
    try {
      await api.saveNotice(draft);
      await load();
      await refreshNotices();
      setEditing(null);
      toast(t('notices.saved'), 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };

  const setActive = async (notice: Notice, active: boolean) => {
    try {
      await api.saveNotice({ id: notice.id, active });
      await load();
      await refreshNotices();
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error');
    }
  };

  const remove = async (notice: Notice) => {
    try {
      await api.deleteNotice(notice.id);
      await load();
      await refreshNotices();
      setRemoving(null);
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
      <Banner kind="info" icon="📣">
        {t('notices.hint')}
      </Banner>

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => setEditing({ audience: 'all', level: 'info', title: '', body: '' })}
      >
        <PlusIcon />
        {t('notices.new')}
      </button>

      {loading ? <p className="tiny">{t('common.loading')}</p> : null}

      {notices.length ? (
        <div className="list">
          {notices.map((notice) => (
            <div className="card stack-sm" key={notice.id}>
              <div className="row-between">
                <span className="title">{notice.title}</span>
                <span className={`badge ${LEVEL_BADGE[notice.level]}`}>
                  {t(`notices.level.${notice.level}`)}
                </span>
              </div>
              <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {notice.body}
              </p>
              <div className="meta tiny">
                {t(`notices.audience.${notice.audience}`)} ·{' '}
                {t('notices.from', { name: notice.createdByName || t('role.admin') })} ·{' '}
                {formatDateTime(notice.createdAt, locale)}
              </div>
              <div className="row-wrap">
                <span className={`badge ${notice.active ? 'badge-approved' : 'badge-draft'}`}>
                  {notice.active ? t('notices.published') : t('notices.withdrawn')}
                </span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm grow"
                  onClick={() => setEditing(notice)}
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm grow"
                  onClick={() => void setActive(notice, !notice.active)}
                >
                  {notice.active ? t('notices.withdraw') : t('notices.republish')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setRemoving(notice)}
                  aria-label={t('common.delete')}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="📣" title={t('notices.empty')} hint={t('notices.emptyHint')} />
        </div>
      )}

      {editing ? (
        <NoticeSheet
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => void save(next)}
        />
      ) : null}

      {removing ? (
        <ConfirmSheet
          title={t('common.delete')}
          message={t('notices.deleteConfirm', { title: removing.title })}
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
        />
      ) : null}
    </div>
  );
}

function NoticeSheet({
  draft,
  onClose,
  onSave,
}: {
  draft: Partial<Notice>;
  onClose: () => void;
  onSave: (notice: Partial<Notice>) => void;
}): JSX.Element {
  const { t } = useApp();
  const [form, setForm] = useState<Partial<Notice>>(draft);

  return (
    <Sheet
      title={form.id ? t('notices.edit') : t('notices.new')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(form)}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label className="field-label" htmlFor="notice-title">
            {t('notices.noticeTitle')}
          </label>
          <input
            id="notice-title"
            maxLength={120}
            value={form.title ?? ''}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="notice-body">
            {t('notices.body')}
          </label>
          <textarea
            id="notice-body"
            rows={5}
            maxLength={2000}
            value={form.body ?? ''}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
          />
        </div>

        <div className="field">
          <span className="field-label">{t('notices.audience')}</span>
          <div className="chip-group">
            {AUDIENCES.map((audience) => (
              <button
                key={audience}
                type="button"
                className={`chip${form.audience === audience ? ' selected' : ''}`}
                aria-pressed={form.audience === audience}
                onClick={() => setForm({ ...form, audience })}
              >
                {t(`notices.audience.${audience}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">{t('notices.level')}</span>
          <div className="chip-group">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={`chip${form.level === level ? ' selected accent' : ''}`}
                aria-pressed={form.level === level}
                onClick={() => setForm({ ...form, level })}
              >
                {t(`notices.level.${level}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
