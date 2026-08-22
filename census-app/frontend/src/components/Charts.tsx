/** Lightweight charts.
 *
 * Hand-rolled rather than pulling in a charting library: the shapes needed here
 * are simple, and every kilobyte matters on a phone that installs the app over
 * a rural connection.
 */

import { useT } from '../lib/store';
import { formatDate } from '../lib/utils';

export interface BarDatum {
  label: string;
  value: number;
  /** Optional secondary figure shown after the value, e.g. a target. */
  suffix?: string;
  color?: string;
}

const SERIES_COLORS = [
  'var(--saffron)',
  'var(--green)',
  'var(--navy)',
  '#8a5cf6',
  '#0891b2',
  '#d946ab',
  '#b26a00',
  '#4a5262',
];

export function BarChart({
  data,
  max,
  emptyLabel,
  formatValue,
}: {
  data: BarDatum[];
  max?: number;
  emptyLabel?: string;
  formatValue?: (value: number) => string;
}): JSX.Element {
  const t = useT();
  const rows = data.filter((row) => Number.isFinite(row.value));
  const ceiling = Math.max(max ?? 0, ...rows.map((row) => row.value), 1);

  if (!rows.length) {
    return <p className="muted">{emptyLabel ?? t('analytics.noData')}</p>;
  }

  return (
    <div className="bar-chart">
      {rows.map((row, index) => (
        <div className="bar-row" key={`${row.label}-${index}`}>
          <span className="bar-label" title={row.label}>
            {row.label}
          </span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${Math.max(0, Math.min(100, (row.value / ceiling) * 100))}%`,
                background: row.color ?? SERIES_COLORS[index % SERIES_COLORS.length],
              }}
            />
          </div>
          <span className="bar-value">
            {formatValue ? formatValue(row.value) : row.value.toLocaleString('en-IN')}
            {row.suffix ? <span className="tiny"> {row.suffix}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Distribution of a `Record<key, count>` where keys are i18n option keys. */
export function DistributionChart({
  counts,
  keyPrefix,
  emptyLabel,
}: {
  counts: Record<string, number>;
  /** e.g. `opt.gender.` — the value is appended to build the i18n key. */
  keyPrefix: string;
  emptyLabel?: string;
}): JSX.Element {
  const t = useT();
  const entries = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  return (
    <BarChart
      emptyLabel={emptyLabel}
      data={entries.map(([key, value]) => ({
        label: t(`${keyPrefix}${key}`),
        value,
        suffix: total ? `(${Math.round((value / total) * 100)}%)` : undefined,
      }))}
    />
  );
}

/** Daily counts as a compact bar sparkline. */
export function Sparkline({
  data,
  locale = 'en-IN',
}: {
  data: Array<{ date: string; count: number }>;
  locale?: string;
}): JSX.Element {
  const t = useT();
  if (!data.length) return <p className="muted">{t('analytics.noData')}</p>;

  const max = Math.max(1, ...data.map((point) => point.count));

  return (
    <div>
      <div className="spark" role="img" aria-label={t('analytics.daily')}>
        {data.map((point) => (
          <div
            key={point.date}
            className="spark-bar"
            style={{ height: `${Math.max(4, (point.count / max) * 100)}%` }}
            title={`${formatDate(point.date, locale)}: ${point.count}`}
          />
        ))}
      </div>
      <div className="row-between tiny" style={{ marginTop: 6 }}>
        <span>{formatDate(data[0]?.date, locale)}</span>
        <span>{formatDate(data[data.length - 1]?.date, locale)}</span>
      </div>
    </div>
  );
}

/** Coverage ring used on the supervisor and admin overviews. */
export function CoverageRing({
  percent,
  label,
  size = 108,
}: {
  percent: number;
  label: string;
  size?: number;
}): JSX.Element {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} role="img" aria-label={`${label}: ${clamped}%`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-sunken)"
          strokeWidth="12"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--green)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size / 4.2}
          fontWeight="800"
          fill="var(--ink)"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      <span className="tiny" style={{ fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

export function Stat({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone?: 'accent' | 'green' | 'navy' | 'danger';
}): JSX.Element {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="value">{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
