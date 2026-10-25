import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={onClick ? active : undefined}
      className={`grid h-8 w-8 place-items-center rounded-full border transition-colors ${
        active
          ? 'border-accent/40 bg-accent-soft text-accent'
          : 'border-line bg-surface text-ink-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** Rounded filter chip with an optional status dot (dot + label, never colour alone). */
export function FilterPill({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: 'good' | 'bad';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
        active ? 'border-line bg-surface text-ink shadow-pill' : 'border-transparent bg-track/60 text-ink-2 hover:text-ink'
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot === 'good' ? 'bg-good' : 'bg-bad'}`} />}
      {children}
    </button>
  );
}

export function StatusPill({ status }: { status: 'routed' | 'review' }) {
  return status === 'routed' ? (
    <span className="inline-flex min-w-[52px] justify-center rounded-md bg-good-strong px-2 py-0.5 text-[10px] font-semibold text-white">
      Routed
    </span>
  ) : (
    <span className="inline-flex min-w-[52px] justify-center rounded-md bg-bad-strong px-2 py-0.5 text-[10px] font-semibold text-white">
      Review
    </span>
  );
}

/**
 * Battery-style meter from the reference: thin track, filled portion, a small
 * triangle marker at the value, and the value printed above the marker.
 */
export function Meter({
  label,
  value,
  tone = 'good',
}: {
  label: string;
  value: number | null; // 0..1
  tone?: 'good' | 'bad' | 'accent';
}) {
  const v = value === null ? null : Math.max(0, Math.min(1, value));
  const fill = tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-bad' : 'bg-accent';
  const marker = tone === 'good' ? 'border-t-good' : tone === 'bad' ? 'border-t-bad' : 'border-t-accent';
  return (
    <div className="w-full" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v === null ? undefined : Math.round(v * 100)}>
      <div className="flex items-end justify-between text-[11px] text-ink-2">
        <span>{label}</span>
      </div>
      <div className="relative mt-3 h-[3px] rounded-full bg-track">
        {v !== null && (
          <>
            <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${v * 100}%` }} />
            <div className="absolute -top-[15px] -translate-x-1/2 text-[10px] text-ink-2" style={{ left: `${v * 100}%` }}>
              {Math.round(v * 100)}%
            </div>
            <div
              className={`absolute top-[3px] h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[5px] border-x-transparent ${marker}`}
              style={{ left: `${v * 100}%` }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Small square badge with an arrow, as next to the reference's KPI numbers. */
export function DeltaBadge({ direction, tone, label }: { direction: 'up' | 'down'; tone: 'good' | 'bad'; label: string }) {
  const Icon = direction === 'up' ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-grid h-4 w-4 place-items-center rounded-[4px] ${tone === 'good' ? 'bg-good-strong' : 'bg-bad-strong'} text-white`}
      title={label}
      aria-label={label}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
    </span>
  );
}

export function PanelTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}
