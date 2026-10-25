'use client';

import React from 'react';
import { REVIEW_QUEUE, type TeamQueue } from '@/lib/routing';
import { Meter } from '@/components/ui/primitives';

// Fixed diagram coordinates (viewBox units); the SVG scales to the panel width.
const VB_W = 1000;
const VB_H = 440;
const BLOCK_W = 150;
const BLOCK_H = 88;
const COLS = [470, 640, 810];
const ROWS = [34, 172, 310];
const TRUNK_X = 420;
const ROUTER = { x: 250, y: 196, w: 124, h: 56 };
const INTAKE = { x: 40, y: 200, w: 130, h: 48 };
const GRID_COLS = 10;
const GRID_ROWS = 4;
const CAPACITY = GRID_COLS * GRID_ROWS;

type Block = { key: string; label: string; count: number; review: boolean; queue?: TeamQueue; x: number; y: number };

function Cells({ x, y, filled, review }: { x: number; y: number; filled: number; review: boolean }) {
  const pad = 9;
  const gap = 2.5;
  const cw = (BLOCK_W - pad * 2 - gap * (GRID_COLS - 1)) / GRID_COLS;
  const ch = (BLOCK_H - pad * 2 - gap * (GRID_ROWS - 1)) / GRID_ROWS;
  const cells = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const i = r * GRID_COLS + c;
      const on = i < filled;
      cells.push(
        <rect
          key={i}
          x={x + pad + c * (cw + gap)}
          y={y + pad + r * (ch + gap)}
          width={cw}
          height={ch}
          rx={1.5}
          className={review ? (on ? 'fill-bad' : 'fill-bad-soft') : on ? 'fill-accent' : 'fill-accent-soft'}
        />,
      );
    }
  }
  return <>{cells}</>;
}

function Junction({ x, y }: { x: number; y: number }) {
  return <rect x={x - 4} y={y - 4} width={8} height={8} rx={1.5} className="fill-surface stroke-ink-3" strokeWidth={1} />;
}

export function RoutingMap({
  queues,
  reviewCount,
  intakeCount,
  backend,
  selected,
  onSelect,
  onShowInQueue,
}: {
  queues: TeamQueue[];
  reviewCount: number;
  intakeCount: number;
  backend: 'sklearn' | 'roberta' | null;
  selected: string | null;
  onSelect: (team: string | null) => void;
  onShowInQueue: (team: string) => void;
}) {
  const blocks: Block[] = queues.map((q, i) => ({
    key: q.team,
    label: q.team,
    count: q.routed.length,
    review: false,
    queue: q,
    x: COLS[i % 3],
    y: ROWS[Math.floor(i / 3)],
  }));
  blocks.push({ key: REVIEW_QUEUE, label: 'Human review', count: reviewCount, review: true, x: COLS[2], y: ROWS[2] });

  const routerOut = { x: ROUTER.x + ROUTER.w, y: ROUTER.y + ROUTER.h / 2 };
  const pathTo = (b: Block) => {
    const chan = b.y - 14;
    const cx = b.x + BLOCK_W / 2;
    return `M${routerOut.x},${routerOut.y}H${TRUNK_X}V${chan}H${cx}V${b.y}`;
  };
  const state = (b: Block) => (b.count === 0 ? 'idle' : b.review ? 'review' : 'routed');
  const ordered = blocks.slice().sort((a, b) => {
    const rank = { idle: 0, routed: 1, review: 2 } as const;
    return rank[state(a)] - rank[state(b)];
  });
  const sel = blocks.find((b) => b.key === selected) ?? null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-auto w-full select-none" role="group" aria-label="Routing map: intake, model router, and team queues">
        {/* Intake -> router */}
        <path
          d={`M${INTAKE.x + INTAKE.w},${INTAKE.y + INTAKE.h / 2}H${ROUTER.x}`}
          fill="none"
          strokeWidth={1.5}
          className={intakeCount ? 'stroke-good' : 'stroke-line'}
        />

        {/* Router -> queues (idle drawn first, review last so live paths sit on top) */}
        {ordered.map((b) => {
          const s = state(b);
          const active = selected === b.key;
          return (
            <path
              key={`p-${b.key}`}
              d={pathTo(b)}
              fill="none"
              strokeLinejoin="round"
              strokeWidth={active ? 2.5 : 1.5}
              className={s === 'idle' ? 'stroke-line' : s === 'review' ? 'stroke-bad' : 'stroke-good'}
            />
          );
        })}
        {ROWS.map((r) => <Junction key={r} x={TRUNK_X} y={r - 14} />)}

        {/* Intake: the green conveyor strip from the reference */}
        <g>
          <rect x={INTAKE.x} y={INTAKE.y} width={INTAKE.w} height={INTAKE.h} rx={8} className="fill-good-soft stroke-good" strokeWidth={1} />
          {Array.from({ length: 6 }).map((_, i) => (
            <rect key={i} x={INTAKE.x + 10 + i * 19} y={INTAKE.y + 14} width={13} height={20} rx={2} className="fill-surface stroke-good" strokeWidth={0.75} />
          ))}
          <text x={INTAKE.x} y={INTAKE.y - 10} className="fill-ink-2 text-[12px]">Intake</text>
          <text x={INTAKE.x + INTAKE.w} y={INTAKE.y - 10} textAnchor="end" className="fill-ink text-[12px] font-medium">{intakeCount}</text>
        </g>

        {/* Router */}
        <g>
          <rect x={ROUTER.x} y={ROUTER.y} width={ROUTER.w} height={ROUTER.h} rx={10} className="fill-good-strong" />
          <text x={ROUTER.x + ROUTER.w / 2} y={ROUTER.y + 24} textAnchor="middle" className="fill-white text-[12px] font-semibold">ModelRouter</text>
          <text x={ROUTER.x + ROUTER.w / 2} y={ROUTER.y + 41} textAnchor="middle" className="fill-white text-[10px]" opacity={0.9}>
            {backend === 'roberta' ? 'RoBERTa · HF' : backend === 'sklearn' ? 'sklearn A' : '…'}
          </text>
          {/* Fallback engine chip */}
          <path d={`M${ROUTER.x + ROUTER.w / 2},${ROUTER.y + ROUTER.h}V${ROUTER.y + ROUTER.h + 34}`} className="stroke-ink-3" strokeDasharray="3 3" strokeWidth={1} />
          <rect x={ROUTER.x + 12} y={ROUTER.y + ROUTER.h + 34} width={ROUTER.w - 24} height={28} rx={8} className="fill-surface stroke-line" strokeWidth={1} />
          <text x={ROUTER.x + ROUTER.w / 2} y={ROUTER.y + ROUTER.h + 52} textAnchor="middle" className="fill-ink-2 text-[10px]">
            {backend === 'roberta' ? 'fallback: sklearn A' : 'RoBERTa: off'}
          </text>
        </g>

        {/* Queues */}
        {blocks.map((b) => {
          const active = selected === b.key;
          return (
            <g
              key={b.key}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`${b.label}: ${b.count} ${b.review ? 'held for review' : 'auto-routed'}`}
              className="cursor-pointer outline-none"
              onClick={() => onSelect(active ? null : b.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(active ? null : b.key);
                }
              }}
            >
              <rect
                x={b.x - 3}
                y={b.y - 3}
                width={BLOCK_W + 6}
                height={BLOCK_H + 6}
                rx={11}
                className={active ? (b.review ? 'fill-bad-soft stroke-bad' : 'fill-accent-soft stroke-accent') : 'fill-transparent stroke-transparent'}
                strokeWidth={1.5}
              />
              <rect x={b.x} y={b.y} width={BLOCK_W} height={BLOCK_H} rx={8} className="fill-surface stroke-line" strokeWidth={1} />
              <Cells x={b.x} y={b.y} filled={Math.min(b.count, CAPACITY)} review={b.review} />
              <text x={b.x} y={b.y + BLOCK_H + 16} className="fill-ink-2 text-[11px]">{b.label}</text>
              <text x={b.x + BLOCK_W} y={b.y + BLOCK_H + 16} textAnchor="end" className="fill-ink text-[11px] font-medium tabular-nums">
                {b.count}{b.count > CAPACITY ? '+' : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {sel && (
        <div
          className="absolute z-10 w-56 rounded-2xl border border-line bg-surface/95 p-4 shadow-panel backdrop-blur"
          style={{
            left: `${(Math.min(sel.x, COLS[1]) / VB_W) * 100 - 24}%`,
            top: `${((sel.y + BLOCK_H * 0.35) / VB_H) * 100}%`,
          }}
        >
          <div className="text-sm font-medium text-ink">{sel.review ? 'Human review queue' : sel.label}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-2">
            <span className={`h-1.5 w-1.5 rounded-full ${sel.count === 0 ? 'bg-ink-3' : sel.review ? 'bg-bad' : 'bg-good'}`} />
            {sel.review
              ? `${sel.count} held below the confidence threshold`
              : `${sel.count} auto-routed · ${sel.queue?.review.length ?? 0} held · SLA ${sel.queue?.slaHours}h`}
          </div>
          {!sel.review && (
            <div className="mt-4">
              <Meter label="Avg confidence" value={sel.queue?.avgConfidence ?? null} tone="good" />
            </div>
          )}
          <button
            type="button"
            onClick={() => onShowInQueue(sel.key)}
            className="mt-4 w-full rounded-xl border border-line bg-canvas/60 py-2 text-xs text-ink transition-colors hover:bg-track"
          >
            Show in queue
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-good" />Routed traffic</span>
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-bad" />To human review</span>
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-line" />Idle</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />1 cell = 1 ticket</span>
      </div>
    </div>
  );
}
