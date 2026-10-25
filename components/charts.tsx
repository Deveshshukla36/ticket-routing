'use client';

import React from 'react';

/**
 * Ranked horizontal bars: one series (counts per category), so one hue, sorted by
 * value, value at the bar tip, native tooltip per row. Replaces the earlier
 * rainbow bar chart and 8-slice pie, where colour carried no meaning.
 */
function RankedBars({ rows, unit, empty }: { rows: { label: string; value: number }[]; unit: string; empty: string }) {
  const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((r) => r.value), 1);
  const total = sorted.reduce((s, r) => s + r.value, 0);

  if (sorted.length === 0) {
    return <div className="grid h-56 place-items-center text-xs text-ink-3">{empty}</div>;
  }
  return (
    <ul className="space-y-2.5" aria-label={`${unit} by category`}>
      {sorted.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[minmax(0,140px)_1fr] items-center gap-3 text-xs"
          title={`${r.label}: ${r.value} ${unit} (${Math.round((r.value / total) * 100)}%)`}
        >
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-2 rounded-r-[4px] bg-accent" style={{ width: `${(r.value / max) * 85}%`, minWidth: 4 }} />
            <span className="tabular-nums text-ink">{r.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function IntentDistributionChart({ data }: { data: Record<string, number> }) {
  return (
    <RankedBars
      rows={Object.entries(data).map(([label, value]) => ({ label, value }))}
      unit="tickets"
      empty="No intent data recorded yet"
    />
  );
}

export function RoutingPerformanceChart({ data }: { data: { team: string; count: number }[] }) {
  return (
    <RankedBars rows={data.map((d) => ({ label: d.team, value: d.count }))} unit="tickets" empty="No routing history yet" />
  );
}
