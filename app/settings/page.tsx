'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { HealthStatus, ServiceMetrics } from '@/types';
import { IconButton, PanelTitle } from '@/components/ui/primitives';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

function Field({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-surface/90 p-4">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="mt-1 text-sm text-ink">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

function StatusLabel({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'muted'; children: React.ReactNode }) {
  const dot = { good: 'bg-good', warn: 'bg-amber-500', bad: 'bg-bad', muted: 'bg-ink-3' }[tone];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

const fmtMs = (v: number | null | undefined) => (typeof v === 'number' ? `${v.toFixed(1)} ms` : '—');

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, m] = await Promise.all([api.getHealth(), api.getServiceMetrics().catch(() => null)]);
      setHealth(h);
      setMetrics(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusTone = !health ? 'muted' : health.status === 'ok' ? 'good' : health.status === 'degraded' ? 'warn' : 'bad';
  const statusText = !health ? (error ? 'Unreachable' : 'Checking…') : health.status === 'ok' ? 'Healthy' : health.status === 'degraded' ? 'Degraded' : 'Error';
  const breaker = metrics?.circuit_breaker;
  const fallbacks = metrics ? Object.entries(metrics.predictions.fallbacks_by_reason) : [];

  return (
    <div className="animate-fade-in max-w-5xl space-y-5">
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[34px] font-light leading-tight tracking-tight text-ink">Settings</h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-3">
            Live backend health and service metrics, and where each setting is configured.
          </p>
        </div>
        <IconButton label="Refresh" onClick={load}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </IconButton>
      </div>

      {error && (
        <div className="panel p-4 text-sm text-ink">
          Can&apos;t reach the API at <span className="text-ink-2">{API_BASE || 'this origin (/api)'}</span>: {error}
        </div>
      )}

      <section className="panel space-y-4 p-5" aria-label="Backend health">
        <PanelTitle title="Backend health" subtitle="From GET /api/v1/health" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status" value={<StatusLabel tone={statusTone}>{statusText}</StatusLabel>} hint={health ? `Uptime ${Math.floor(health.uptime_seconds / 60)} min` : undefined} />
          <Field
            label="Database"
            value={health ? <StatusLabel tone={health.db === 'ok' ? 'good' : 'bad'}>{health.db === 'ok' ? 'Connected' : 'Unreachable'}</StatusLabel> : '—'}
            hint="Checked with SELECT 1"
          />
          <Field label="Model backend" value={health?.backend ?? '—'} hint={health?.backend === 'roberta' ? 'Hugging Face, sklearn A fallback' : 'Local sklearn models'} />
          <Field label="Environment" value={health?.environment ?? '—'} />
        </div>
        {health && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(health.model_versions).map(([k, v]) => (
              <Field key={k} label={k.replace(/_/g, ' ')} value={<span className="tabular-nums">{v}</span>} />
            ))}
          </div>
        )}
      </section>

      <section className="panel space-y-4 p-5" aria-label="Service metrics">
        <PanelTitle title="Service metrics" subtitle="From GET /api/v1/metrics · in-memory, resets when the API restarts" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Requests" value={<span className="tabular-nums">{metrics?.requests_total.toLocaleString() ?? '—'}</span>} />
          <Field label="Latency p50 / p95" value={<span className="tabular-nums">{fmtMs(metrics?.latency_ms.p50)} / {fmtMs(metrics?.latency_ms.p95)}</span>} hint="Excludes health and metrics probes" />
          <Field
            label="Circuit breaker"
            value={breaker ? <StatusLabel tone={breaker.state === 'closed' ? 'good' : breaker.state === 'half_open' ? 'warn' : 'bad'}>{breaker.state.replace('_', '-')}</StatusLabel> : 'Not active'}
            hint={breaker ? `${breaker.consecutive_failures} consecutive failures` : 'Only used with the RoBERTa backend'}
          />
          <Field
            label="Fallbacks to sklearn"
            value={<span className="tabular-nums">{fallbacks.reduce((s, [, n]) => s + n, 0)}</span>}
            hint={fallbacks.length ? fallbacks.map(([r, n]) => `${r}: ${n}`).join(' · ') : 'None recorded'}
          />
        </div>
      </section>

      <section className="panel space-y-4 p-5" aria-label="Configuration">
        <PanelTitle
          title="Configuration"
          subtitle="These are set on the server and the dashboard host; the dashboard cannot change them."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] text-ink-3">
              <tr>
                <th className="py-2 pr-4 font-normal">Setting</th>
                <th className="py-2 pr-4 font-normal">Where</th>
                <th className="py-2 font-normal">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70 text-ink-2">
              <tr>
                <td className="py-2.5 pr-4 text-ink">CONFIDENCE_THRESHOLD</td>
                <td className="py-2.5 pr-4">Render env var (default 0.60)</td>
                <td className="py-2.5">Predictions below it go to the human review queue. Route a ticket can override it per request.</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-ink">MODEL_BACKEND</td>
                <td className="py-2.5 pr-4">Render env var</td>
                <td className="py-2.5"><code>sklearn</code> (default) or <code>roberta</code> via Hugging Face (needs HF_API_TOKEN and HF_MODEL_ID).</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-ink">DATABASE_URL</td>
                <td className="py-2.5 pr-4">Render env var</td>
                <td className="py-2.5">Neon Postgres in production; a local SQLite file otherwise.</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-ink">NEXT_PUBLIC_API_BASE</td>
                <td className="py-2.5 pr-4">Vercel env var</td>
                <td className="py-2.5">
                  API this dashboard calls. Currently: <span className="text-ink">{API_BASE || 'same origin /api (local dev proxy to :8000)'}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
