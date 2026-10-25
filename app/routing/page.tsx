'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ClassificationResult } from '@/types';
import { getPriorityBadgeColor } from '@/lib/utils';
import {
  GitMerge,
  ShieldAlert,
  Clock,
  Users,
  Search,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

const ROUTING_RULES = [
  { intent: 'Billing', team: 'Billing & Payments', priority: 'Medium', sla: '4.0 hrs', desc: 'Invoices, refunds, chargebacks, subscriptions' },
  { intent: 'Technical Issue', team: 'Technical Support L2', priority: 'High', sla: '2.0 hrs', desc: '500 errors, crashes, latency, API timeouts' },
  { intent: 'Account Access', team: 'Identity & Access', priority: 'High', sla: '2.0 hrs', desc: 'SSO, password reset, 2FA, session locks' },
  { intent: 'Feature Request', team: 'Product Management', priority: 'Low', sla: '24.0 hrs', desc: 'Enhancements, export formats, integrations' },
  { intent: 'Bug Report', team: 'Engineering', priority: 'High', sla: '12.0 hrs', desc: 'Data anomalies, layout bugs, filter issues' },
  { intent: 'General Inquiry', team: 'Tier 1 Support', priority: 'Low', sla: '8.0 hrs', desc: 'Plan comparisons, onboarding questions' },
  { intent: 'Cancellation', team: 'Retention Team', priority: 'Medium', sla: '2.0 hrs', desc: 'Account closure, plan downgrade requests' },
  { intent: 'Complaint', team: 'Escalations Management', priority: 'Urgent', sla: '1.0 hr', desc: 'Frustrated customers, manager escalations' },
];

export default function RoutingPage() {
  const [history, setHistory] = useState<ClassificationResult[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await api.getHistory(50);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredHistory = history.filter(
    (h) =>
      h.text?.toLowerCase().includes(search.toLowerCase()) ||
      h.predicted_intent?.toLowerCase().includes(search.toLowerCase()) ||
      h.routed_team?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 mb-1">
            <span>DISPATCH MATRIX</span>
            <span>/</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">ROUTING POLICIES</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Smart Routing & SLA Dispatch Rules
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automated multi-factor SLA assignment, department queue distribution, and confidence-driven manual triage rules.
          </p>
        </div>

        <button
          onClick={fetchHistory}
          className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors self-start sm:self-auto"
          title="Refresh audit history"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Rules Grid */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Department Queue Matrix
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Deterministic routing matrix configured with target SLAs and auto-escalation
            </p>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
            8 Active Department Rules
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {ROUTING_RULES.map((rule) => (
            <div
              key={rule.intent}
              className="p-3.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-900 dark:text-white">
                  {rule.intent}
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${getPriorityBadgeColor(rule.priority)}`}>
                  {rule.priority}
                </span>
              </div>
              <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>{rule.team}</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                {rule.desc}
              </p>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 pt-1.5 border-t border-slate-200/60 dark:border-slate-800">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Target SLA: {rule.sla}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fallback / Human Review Policy */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Confidence-Driven Human-in-the-Loop Fallback Policy
          </h3>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
          When calibrated prediction probability falls below the configured threshold (default <strong className="font-semibold text-slate-900 dark:text-white">60%</strong>), the engine automatically assigns <span className="font-mono text-[11px] bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">requires_human_review = true</span>, sets priority to <strong className="font-semibold text-purple-600 dark:text-purple-400">Needs Manual Triage</strong>, and routes the ticket to the Human Review Queue with an accelerated 1-hour SLA target.
        </p>
      </div>

      {/* Routing History Log */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Routing & Dispatch Audit History
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Persistent routing records logged to database
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history by query, intent, team..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3.5">Ticket ID</th>
                <th className="py-2.5 px-3.5">Customer Inquiry</th>
                <th className="py-2.5 px-3.5">Intent</th>
                <th className="py-2.5 px-3.5">Confidence</th>
                <th className="py-2.5 px-3.5">Dispatched Team</th>
                <th className="py-2.5 px-3.5">SLA</th>
                <th className="py-2.5 px-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No routing history records found.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3.5 font-mono font-medium text-slate-900 dark:text-slate-200">
                      {item.ticket_id || `TCK-${idx + 100}`}
                    </td>
                    <td className="py-2.5 px-3.5 max-w-sm truncate" title={item.text}>
                      {item.text}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-slate-900 dark:text-white">
                      {item.predicted_intent}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono">{(item.confidence * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3.5 font-medium text-indigo-600 dark:text-indigo-400">
                      {item.routed_team}
                    </td>
                    <td className="py-2.5 px-3.5">{item.sla_hours ? `${item.sla_hours}h` : '4.0h'}</td>
                    <td className="py-2.5 px-3.5">
                      {item.requires_human_review ? (
                        <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400">
                          Manual Triage
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          Automated
                        </span>
                      )}
                    </td>
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
