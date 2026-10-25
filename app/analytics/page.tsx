'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MonitoringStats, FeedbackIn } from '@/types';
import { IntentDistributionChart, RoutingPerformanceChart } from '@/components/charts';
import {
  BarChart3,
  CheckCircle2,
  RefreshCw,
  MessageSquare,
  Smile,
  Frown,
  Meh,
} from 'lucide-react';

export default function AnalyticsPage() {
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [feedbackList, setFeedbackList] = useState<FeedbackIn[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [monData, feedbackData] = await Promise.all([
        api.getMonitoringRecent(100),
        api.getFeedbackList(50).catch(() => []),
      ]);
      setStats(monData);
      setFeedbackList(feedbackData);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  // Compute sentiment breakdown
  const recent = stats?.recent || [];
  let pos = 0,
    neu = 0,
    neg = 0;
  recent.forEach((r) => {
    const s = r.sentiment?.toLowerCase();
    if (s === 'positive') pos++;
    else if (s === 'negative') neg++;
    else neu++;
  });
  const totalSentiment = recent.length || 1;

  // Build team distribution data
  const teamMap: Record<string, number> = {};
  recent.forEach((r) => {
    const team = r.routed_team || 'General Queue';
    teamMap[team] = (teamMap[team] || 0) + 1;
  });
  const teamChartData = Object.entries(teamMap).map(([team, count]) => ({ team, count }));

  // Calculate actual agreement rate if feedback exists
  const agreements = feedbackList.filter((f) => f.predicted_intent === f.correct_intent).length;
  const agreementRate = feedbackList.length > 0 ? (agreements / feedbackList.length) * 100 : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[34px] font-light leading-tight tracking-tight text-ink">Analytics</h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-3">
            Intent volume, sentiment and human feedback from recent traffic.
          </p>
        </div>

        <button
          onClick={loadAnalytics}
          className="p-1.5 rounded-md bg-surface border border-line text-ink-2 hover:bg-track transition-colors self-start sm:self-auto"
          title="Refresh telemetry"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Top Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Sentiment Ratio */}
        <div className="panel p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium text-ink">
              Customer Sentiment Valence
            </span>
            <Smile className="w-4 h-4 text-ink-3" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40">
              <span className="text-[10px] font-semibold text-good-strong dark:text-good block">Positive</span>
              <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 tabular-nums">
                {Math.round((pos / totalSentiment) * 100)}%
              </span>
            </div>
            <div className="p-2 rounded-md bg-canvas/60 border border-line">
              <span className="text-[10px] font-semibold text-ink-2 block">Neutral</span>
              <span className="text-sm font-semibold text-ink tabular-nums">
                {Math.round((neu / totalSentiment) * 100)}%
              </span>
            </div>
            <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/40">
              <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 block">Negative</span>
              <span className="text-sm font-semibold text-rose-800 dark:text-rose-300 tabular-nums">
                {Math.round((neg / totalSentiment) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Human Review Agreement */}
        <div className="panel p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium text-ink">
              Review Agreement Rate
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-[28px] font-light leading-none text-ink tabular-nums">
              {agreementRate === null ? '—' : `${agreementRate.toFixed(1)}%`}
            </div>
            <p className="text-[11px] text-ink-3 mt-1">
              Agreement rate between model predictions and agent reviews
            </p>
          </div>
        </div>

        {/* Feedback Samples Stored */}
        <div className="panel p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium text-ink">
              Ground Truth Samples
            </span>
            <MessageSquare className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="text-[28px] font-light leading-none text-ink tabular-nums">
              {feedbackList.length}
            </div>
            <p className="text-[11px] text-ink-3 mt-1">
              Curated correction records logged in database for retraining
            </p>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="panel p-5 space-y-3">
          <div className="border-b border-line/70 pb-2.5">
            <h3 className="text-[15px] font-medium text-ink">
              Intent Category Frequency
            </h3>
            <p className="text-[11px] text-ink-3">
              Aggregated incoming volume across 8 intent classes
            </p>
          </div>
          <IntentDistributionChart data={stats?.intent_distribution || {}} />
        </div>

        <div className="panel p-5 space-y-3">
          <div className="border-b border-line/70 pb-2.5">
            <h3 className="text-[15px] font-medium text-ink">
              Queue Load by Department
            </h3>
            <p className="text-[11px] text-ink-3">
              Dispatched volume to specialized support queues
            </p>
          </div>
          <RoutingPerformanceChart data={teamChartData} />
        </div>
      </div>

      {/* Feedback Records Table */}
      <div className="panel overflow-hidden">
        <div className="p-4 border-b border-line">
          <h3 className="text-[15px] font-medium text-ink">
            Human Feedback & Correction Telemetry
          </h3>
          <p className="text-[11px] text-ink-3">
            Recorded feedback instances for continuous retraining dataset curation
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas/60 text-ink-3 font-semibold border-b border-line">
              <tr>
                <th className="py-2.5 px-3.5">Ticket Text</th>
                <th className="py-2.5 px-3.5">Model Prediction</th>
                <th className="py-2.5 px-3.5">Agent Correction</th>
                <th className="py-2.5 px-3.5">Reviewer</th>
                <th className="py-2.5 px-3.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70 text-ink-2">
              {feedbackList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-3">
                    No human feedback recorded yet. Use the "Correct" button on any ticket to submit!
                  </td>
                </tr>
              ) : (
                feedbackList.map((f, idx) => (
                  <tr key={idx} className="hover:bg-track">
                    <td className="py-2.5 px-3.5 max-w-sm truncate" title={f.text}>
                      {f.text}
                    </td>
                    <td className="py-2.5 px-3.5 tabular-nums text-ink-3">{f.predicted_intent}</td>
                    <td className="py-2.5 px-3.5 tabular-nums font-semibold text-accent">
                      {f.correct_intent}
                    </td>
                    <td className="py-2.5 px-3.5">{f.reviewer || 'Agent'}</td>
                    <td className="py-2.5 px-3.5 text-ink-3 italic">{f.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
