'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw, Route } from 'lucide-react';
import { api } from '@/lib/api';
import type { HealthStatus, ModelRegistryItem, MonitoringStats, ServiceMetrics } from '@/types';
import { buildQueues, chunked, median, normalizeTicket, pct, type Ticket } from '@/lib/routing';
import { DeltaBadge, IconButton, Meter, PanelTitle } from '@/components/ui/primitives';
import { SparkBars } from '@/components/viz/spark-bars';
import { ConfidenceBars } from '@/components/viz/confidence-bars';
import { LatencyLine } from '@/components/viz/latency-line';
import { RoutingMap } from '@/components/overview/routing-map';
import { QueuePanel } from '@/components/overview/queue-panel';
import { FeedbackModal } from '@/components/feedback-modal';

const CHART_WINDOW = 40;
const ACCURACY_GATE = 0.9; // backend/tests/test_model_accuracy.py

/** Time-bucketed counts across the window's span (one bucket if all tickets share a timestamp). */
function volumeBuckets(tickets: Ticket[], buckets = 12): number[] {
  if (tickets.length === 0) return [];
  const t0 = tickets[0].timestamp;
  const span = tickets[tickets.length - 1].timestamp - t0;
  if (span <= 0) return [tickets.length];
  const out = new Array(buckets).fill(0);
  tickets.forEach((t) => {
    out[Math.min(buckets - 1, Math.floor(((t.timestamp - t0) / span) * buckets))] += 1;
  });
  return out;
}

function KpiStat({ value, label, badge, spark }: { value: string; label: string; badge?: React.ReactNode; spark?: React.ReactNode }) {
  return (
    <div className="flex items-end gap-4">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-[28px] font-light leading-none text-ink">{value}</span>
          {badge}
        </div>
        <div className="mt-1.5 text-[11px] text-ink-3">{label}</div>
      </div>
      {spark}
    </div>
  );
}

export default function OverviewPage() {
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [models, setModels] = useState<ModelRegistryItem[]>([]);
  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusTeam, setFocusTeam] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Ticket | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, h, m, sm] = await Promise.all([
        api.getMonitoringRecent(200),
        api.getHealth().catch(() => null),
        api.getModels().catch(() => [] as ModelRegistryItem[]),
        api.getServiceMetrics().catch(() => null),
      ]);
      setStats(s);
      setHealth(h);
      setModels(m);
      setMetrics(sm);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const tickets = useMemo(() => (stats?.recent ?? []).map(normalizeTicket), [stats]);
  const windowed = tickets.slice(-CHART_WINDOW);
  const queues = useMemo(() => buildQueues(tickets), [tickets]);
  const reviewTickets = tickets.filter((t) => t.needsReview);
  const routedShare = tickets.length ? (tickets.length - reviewTickets.length) / tickets.length : null;
  const modelA = models.find((m) => m.variant === 'A') ?? null;
  const accuracy = modelA?.accuracy ?? null;
  const medianLatency = median(windowed.map((t) => t.latencyMs));
  const backend = health?.backend ?? metrics?.model_backend ?? null;
  const fallbacks = metrics ? Object.values(metrics.predictions.fallbacks_by_reason).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header: title + KPI strip, as in the reference */}
      <div className="flex flex-col gap-6 pt-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[34px] font-light leading-tight tracking-tight text-ink">Operations</h1>
          <p className="mt-1 text-xs text-ink-3">
            Model {health?.model_versions?.sklearn_a ?? modelA?.version ?? '—'} · {backend ?? '—'} backend ·{' '}
            {tickets.length} tickets in window
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <KpiStat
            value={stats ? stats.total_logged.toLocaleString() : '—'}
            label="Tickets processed"
            spark={<SparkBars values={volumeBuckets(tickets)} format={(v) => `${v} tickets`} label="Ticket volume over the window" />}
          />
          <KpiStat
            value={pct(accuracy)}
            label={`Holdout accuracy · gate ${ACCURACY_GATE * 100}%`}
            badge={
              accuracy === null ? undefined : accuracy >= ACCURACY_GATE ? (
                <DeltaBadge direction="up" tone="good" label="Meets the CI accuracy gate" />
              ) : (
                <DeltaBadge direction="down" tone="bad" label={`Below the ${ACCURACY_GATE * 100}% CI gate`} />
              )
            }
          />
          <KpiStat
            value={pct(routedShare, 0)}
            label="Auto-routed"
            spark={
              <SparkBars
                values={chunked(tickets, 12, (c) => c.filter((t) => !t.needsReview).length / c.length)}
                format={(v) => `${Math.round(v * 100)}% auto-routed`}
                label="Auto-routed share across the window"
              />
            }
          />
          <div className="flex items-center gap-2">
            <IconButton label="Refresh" onClick={load}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </IconButton>
            <Link
              href="/inference"
              className="flex h-8 items-center gap-1.5 rounded-full bg-ink px-4 text-xs text-surface transition-opacity hover:opacity-90"
            >
              <Route className="h-3.5 w-3.5" />
              Route ticket
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="panel flex items-center justify-between gap-4 border-bad/30 p-4 text-sm">
          <span className="text-ink">
            Can&apos;t reach the API: <span className="text-ink-2">{error}</span>
          </span>
          <button type="button" onClick={load} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink">
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="order-2 xl:order-1">
          <QueuePanel queues={queues} reviewTickets={reviewTickets} focusTeam={focusTeam} onFeedback={setFeedbackFor} />
        </div>

        <div className="order-1 min-w-0 space-y-5 xl:order-2">
          <section className="panel p-5" aria-label="Routing map">
            <PanelTitle
              title="Routing map"
              subtitle="Where recent tickets went. Select a queue for details."
              actions={
                <>
                  <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-ink-2">
                    Backend: <span className="text-ink">{backend ?? '—'}</span>
                  </span>
                  {backend === 'roberta' && (
                    <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-ink-2">
                      Fallbacks: <span className="text-ink">{fallbacks}</span>
                    </span>
                  )}
                </>
              }
            />
            <div className="-mx-1 mt-3 overflow-x-auto px-1">
              <div className="min-w-[680px]">
                <RoutingMap
                  queues={queues}
                  reviewCount={reviewTickets.length}
                  intakeCount={tickets.length}
                  backend={backend}
                  selected={selected}
                  onSelect={setSelected}
                  onShowInQueue={(team) => setFocusTeam(team)}
                />
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="panel p-5" aria-label="Ticket workload">
              <PanelTitle
                title="Ticket workload"
                subtitle={`Model confidence, last ${windowed.length} tickets`}
                actions={
                  <Link href="/analytics" aria-label="Open analytics" title="Open analytics" className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:text-ink">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="mt-4 flex items-end justify-between gap-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[34px] font-light leading-none text-ink">{stats ? stats.total_logged.toLocaleString() : '—'}</span>
                  <span className="text-xs text-ink-3">/ tickets</span>
                </div>
                <div className="w-40">
                  <Meter label="Auto-routed" value={routedShare} tone="good" />
                </div>
              </div>
              <div className="mt-5">
                <ConfidenceBars tickets={windowed} />
              </div>
            </section>

            <section className="panel p-5" aria-label="Model latency">
              <PanelTitle
                title="Model latency"
                subtitle={`Inference time per ticket, last ${windowed.length}`}
              />
              <div className="mt-4 flex items-end justify-between gap-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[34px] font-light leading-none text-ink">
                    {medianLatency === null ? '—' : medianLatency.toFixed(1)}
                  </span>
                  <span className="text-xs text-ink-3">ms / median</span>
                </div>
                <div className="text-right text-[11px] text-ink-3">
                  HTTP p95
                  <div className="text-sm text-ink tabular-nums">
                    {metrics?.latency_ms.p95 != null ? `${metrics.latency_ms.p95.toFixed(1)} ms` : '—'}
                  </div>
                </div>
              </div>
              <div className="mt-5 pt-[26px]">
                <LatencyLine tickets={windowed} />
              </div>
            </section>
          </div>
        </div>
      </div>

      {feedbackFor && (
        <FeedbackModal
          isOpen
          onClose={() => setFeedbackFor(null)}
          ticketId={feedbackFor.id}
          ticketText={feedbackFor.text}
          predictedIntent={feedbackFor.intent}
          onSuccess={load}
        />
      )}
    </div>
  );
}
