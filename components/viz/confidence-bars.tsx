'use client';

import React, { useState } from 'react';
import { useWidth } from './use-width';
import type { Ticket } from '@/lib/routing';

const AXIS_W = 34;
const TOP = 8;

/** Top-rounded column (square at the baseline), per the mark spec. */
function column(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * One column per recent ticket, height = model confidence. Auto-routed tickets are
 * green, held-for-review tickets neutral grey (CVD-separable pair; also named in the
 * legend and tooltip, and listed in the queue panel as the table view).
 */
export function ConfidenceBars({ tickets, height = 150 }: { tickets: Ticket[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const plotW = Math.max(1, width - AXIS_W);
  const plotH = height - TOP;
  const slot = tickets.length ? plotW / tickets.length : plotW;
  const barW = Math.max(2, Math.min(8, slot - 2));
  const y = (v: number) => TOP + (1 - v) * plotH;

  const hovered = hover === null ? null : tickets[hover];
  const tipLeft = hover === null ? 0 : Math.min(Math.max(AXIS_W + hover * slot + slot / 2, 90), width - 90);

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-4 text-[11px] text-ink-2" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-good" />Auto-routed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-mark-muted" />Needs review</span>
      </div>
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {tickets.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-ink-3">No tickets in the window yet</div>
        ) : (
          <svg width={width} height={height} role="img" aria-label={`Model confidence for the last ${tickets.length} tickets`}>
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1={AXIS_W} x2={width} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
                <text x={AXIS_W - 6} y={y(t) + 3} textAnchor="end" className="fill-ink-3 text-[10px] tabular-nums">
                  {t * 100}%
                </text>
              </g>
            ))}
            {tickets.map((t, i) => {
              const x = AXIS_W + i * slot + (slot - barW) / 2;
              const h = Math.max(2, t.confidence * plotH);
              return (
                <g key={`${t.id}-${i}`} onMouseEnter={() => setHover(i)}>
                  <rect x={AXIS_W + i * slot} y={TOP} width={slot} height={plotH} fill="transparent" />
                  <path
                    d={column(x, TOP + plotH - h, barW, h, 2)}
                    className={t.needsReview ? 'fill-mark-muted' : 'fill-good'}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {hovered && (
          <div
            className="pointer-events-none absolute -top-2 z-10 w-44 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-[11px] shadow-panel"
            style={{ left: tipLeft }}
          >
            <div className="font-medium text-ink">{hovered.id}</div>
            <div className="text-ink-2">{hovered.intent}</div>
            <div className="mt-1 flex justify-between text-ink-2">
              <span>{(hovered.confidence * 100).toFixed(1)}% conf.</span>
              <span>{hovered.needsReview ? 'Needs review' : 'Auto-routed'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
