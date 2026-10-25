'use client';

import React, { useState } from 'react';
import { useWidth } from './use-width';
import type { Ticket } from '@/lib/routing';

const AXIS_W = 34;
const TOP = 10;
const RIGHT = 44; // room for the end label

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((m) => m >= v) ?? v;
}

/** Single-series line: model latency per ticket. 2px line, 10% wash, end dot + label, crosshair tooltip. */
export function LatencyLine({ tickets, height = 150 }: { tickets: Ticket[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = tickets.map((t) => t.latencyMs);
  const max = niceMax(Math.max(...values, 0));
  const plotW = Math.max(1, width - AXIS_W - RIGHT);
  const plotH = height - TOP - 4;
  const x = (i: number) => AXIS_W + (values.length <= 1 ? plotW : (i / (values.length - 1)) * plotW);
  const y = (v: number) => TOP + (1 - v / max) * plotH;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const area = values.length ? `${line}L${x(values.length - 1)},${TOP + plotH}L${x(0)},${TOP + plotH}Z` : '';
  const last = values.length - 1;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (values.length === 0) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = Math.round(((px - AXIS_W) / plotW) * (values.length - 1));
    setHover(Math.max(0, Math.min(values.length - 1, i)));
  };

  const hovered = hover === null ? null : tickets[hover];

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {values.length === 0 ? (
        <div className="grid h-full place-items-center text-xs text-ink-3">No tickets in the window yet</div>
      ) : (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Model latency for the last ${values.length} tickets, latest ${values[last].toFixed(1)} ms`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={AXIS_W + plotW} y1={y(t * max)} y2={y(t * max)} className="stroke-line" strokeWidth={1} />
              <text x={AXIS_W - 6} y={y(t * max) + 3} textAnchor="end" className="fill-ink-3 text-[10px] tabular-nums">
                {+(t * max).toFixed(1)}
              </text>
            </g>
          ))}
          <path d={area} className="fill-good" opacity={0.1} />
          <path d={line} fill="none" className="stroke-good" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={TOP + plotH} className="stroke-ink-3" strokeWidth={1} />
          )}
          <circle cx={x(hover ?? last)} cy={y(values[hover ?? last])} r={4} className="fill-good stroke-surface" strokeWidth={2} />
          {hover === null && (
            <text x={x(last) + 8} y={y(values[last]) + 3} className="fill-ink-2 text-[10px] tabular-nums">
              {values[last].toFixed(1)} ms
            </text>
          )}
        </svg>
      )}
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-[11px] shadow-panel"
          style={{ left: Math.min(Math.max(x(hover), 80), width - 80) }}
        >
          <div className="font-medium text-ink">{hovered.id}</div>
          <div className="text-ink-2">{hovered.latencyMs.toFixed(2)} ms · {hovered.modelVersion}</div>
        </div>
      )}
    </div>
  );
}
