'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import { RouteResult, AIResponseResult } from '@/types';
import { FeedbackModal } from '@/components/feedback-modal';
import { LivePipeline } from '@/components/live-pipeline';
import { formatLatency, getPriorityBadgeColor, getSentimentBadgeColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Route,
  Clock,
  Send,
  Sparkles,
  Bot,
  UserCheck,
  CheckCircle2,
  ChevronRight,
  Copy,
  AlertTriangle,
  RotateCcw,
  Info,
  ShieldCheck,
  Zap,
} from 'lucide-react';

const SAMPLE_TICKETS = [
  {
    title: 'Billing Overcharge',
    tag: 'Billing',
    text: 'I noticed an unexpected charge of $49.99 on my credit card statement this month even though I cancelled my pro subscription.',
  },
  {
    title: 'API Authentication Failure',
    tag: 'Technical',
    text: 'Getting HTTP 401 Unauthorized errors on every request to /v1/tokens despite using a newly generated valid JWT bearer key.',
  },
  {
    title: 'Password Reset Delivery',
    tag: 'Access',
    text: 'I submitted a password reset request 3 times but never received the verification email in my inbox or spam folder.',
  },
  {
    title: 'Export to Parquet Option',
    tag: 'Feature',
    text: 'Can you please add native support for downloading analytics query results in Apache Parquet format instead of just CSV?',
  },
  {
    title: 'Production Outage Critical',
    tag: 'Urgent',
    text: 'All our production dashboard webhooks stopped triggering 30 minutes ago and our customers are reporting widespread data loss!',
  },
];

export default function InferencePage() {
  const [ticketText, setTicketText] = useState('');
  const [variant, setVariant] = useState('A');
  const [threshold, setThreshold] = useState(0.6);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AIResponseResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleRoute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ticketText.trim()) {
      toast.error('Please enter ticket text before routing');
      return;
    }

    setLoading(true);
    setResult(null);
    setAiSuggestion(null);

    try {
      const routeRes = await api.routeTicket(
        ticketText.trim(),
        undefined,
        threshold,
        variant
      );
      setResult(routeRes);
      toast.success(`Routed to ${routeRes.routed_team} in ${formatLatency(routeRes.latency_ms)}`);
    } catch (err: any) {
      toast.error(err.message || 'Routing failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAiSuggestion = async () => {
    if (!result) return;
    setAiLoading(true);
    try {
      const res = await api.suggestResponse(result.text, result.ticket_id, result.intent);
      setAiSuggestion(res);
      toast.success('RAG Playbook & response generated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate AI playbook');
    } finally {
      setAiLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[34px] font-light leading-tight tracking-tight text-ink">Route a ticket</h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-3">
            Classify a ticket, see where it is routed and why, and correct the label if the model is wrong.
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Input Form & Sample Presets */}
        <div className="lg:col-span-5 space-y-5">
          <div className="panel p-5 space-y-4">
            <form onSubmit={handleRoute} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-ink-2">
                    Customer Ticket Text
                  </label>
                  <span className="text-[11px] tabular-nums text-ink-3">
                    {ticketText.length} chars
                  </span>
                </div>
                <textarea
                  value={ticketText}
                  onChange={(e) => setTicketText(e.target.value)}
                  rows={5}
                  placeholder="Paste raw support inquiry, customer email, or incident log here..."
                  className="w-full text-xs p-3.5 rounded-lg bg-canvas/60 border border-line text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent/40 font-sans leading-relaxed"
                />
              </div>

              {/* Controls: Model Pipeline & Confidence Threshold */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1">
                    Model Variant
                  </label>
                  <select
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 rounded-md bg-canvas/60 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-accent/40"
                  >
                    <option value="A">Variant A (LinearSVC - Prod)</option>
                    <option value="B">Variant B (MultinomialNB - Challenger)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1 flex items-center justify-between">
                    <span>Threshold</span>
                    <span className="tabular-nums text-accent font-semibold">
                      {(threshold * 100).toFixed(0)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0.30"
                    max="0.95"
                    step="0.05"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="w-full accent-[rgb(var(--accent))] cursor-pointer h-1.5 bg-track/70 rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] text-ink-3 mt-1">
                    <span>30%</span>
                    <span>Triage Cutoff</span>
                    <span>95%</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={loading || !ticketText.trim()}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-ink text-surface hover:opacity-90 font-medium text-xs shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Executing Pipeline...' : 'Route Ticket'}</span>
                </button>
                {ticketText && (
                  <button
                    type="button"
                    onClick={() => {
                      setTicketText('');
                      setResult(null);
                      setAiSuggestion(null);
                    }}
                    className="py-2.5 px-3 rounded-lg bg-track/70 hover:bg-track text-ink-2 font-medium text-xs transition-colors flex items-center gap-1"
                    title="Clear input"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Quick Presets */}
          <div className="panel p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium text-ink">
                Sample Test Tickets
              </span>
              <span className="text-[11px] text-ink-3">Click to load</span>
            </div>

            <div className="space-y-1.5">
              {SAMPLE_TICKETS.map((sample, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTicketText(sample.text)}
                  className="w-full text-left p-2.5 rounded-lg border border-line hover:border-accent/40 bg-canvas/60 hover:bg-accent-soft transition-all text-xs group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink group-hover:text-accent dark:group-hover:text-accent">
                      {sample.title}
                    </span>
                    <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-track/70 text-ink-3">
                      {sample.tag}
                    </span>
                  </div>
                  <p className="text-ink-3 line-clamp-1 mt-0.5 text-[11px]">
                    {sample.text}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Routing Results & Explainability */}
        <div className="lg:col-span-7 space-y-5">
          {result ? (
            <div className="panel p-5 space-y-5">
              {/* Header result row */}
              <div className="flex items-start justify-between border-b border-line/70 pb-4">
                <div>
                  <span className="text-xs tabular-nums text-ink-3">
                    TICKET ID: #{result.ticket_id}
                  </span>
                  <h3 className="text-lg font-medium text-ink mt-0.5 flex items-center gap-2">
                    <span>{result.intent}</span>
                    <span className="text-xs tabular-nums font-normal px-2 py-0.5 rounded bg-track/70 text-ink-2">
                      {result.model_version}
                    </span>
                  </h3>
                </div>

                <div className="text-right">
                  <div className="text-base font-medium text-accent tabular-nums">
                    {(result.confidence * 100).toFixed(1)}% Confidence
                  </div>
                  <span className="text-[11px] text-ink-3 flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" />
                    {formatLatency(result.latency_ms)}
                  </span>
                </div>
              </div>

              {/* 4 Core Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg bg-canvas/60 border border-line/70">
                  <span className="block text-[11px] text-ink-3 mb-1">
                    Priority
                  </span>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${getPriorityBadgeColor(result.priority)}`}>
                    {result.priority}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-canvas/60 border border-line/70">
                  <span className="block text-[11px] text-ink-3 mb-1">
                    Sentiment
                  </span>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${getSentimentBadgeColor(result.sentiment)}`}>
                    {result.sentiment}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-canvas/60 border border-line/70">
                  <span className="block text-[11px] text-ink-3 mb-1">
                    SLA Target
                  </span>
                  <span className="text-xs font-semibold text-ink">
                    {result.sla_label.split('(')[0].trim()}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-canvas/60 border border-line/70">
                  <span className="block text-[11px] text-ink-3 mb-1">
                    Review Status
                  </span>
                  {result.requires_human_review ? (
                    <span className="text-xs font-semibold text-bad-strong dark:text-bad flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Manual Triage
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-good-strong dark:text-good flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Auto-Routed
                    </span>
                  )}
                </div>
              </div>

              {/* Explainability Breakdown Card */}
              <div className="p-4 rounded-lg bg-canvas/60 border border-line space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <Info className="w-3.5 h-3.5 text-accent" />
                  <span>Explainability & Decision Breakdown</span>
                </div>

                {/* Candidate intent probabilities */}
                {result.top_k && result.top_k.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-ink-3 font-medium">
                      Intent Probability Candidates:
                    </span>
                    <div className="space-y-1">
                      {result.top_k.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="w-28 truncate text-ink-2 font-medium">
                            {item.label}
                          </span>
                          <div className="flex-1 h-2 bg-track/70 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full"
                              style={{ width: `${Math.round(item.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="w-12 text-right tabular-nums text-[11px] text-ink-3">
                            {(item.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Routing Reason Log */}
                <div className="pt-2 border-t border-line/70 text-xs text-ink-2 space-y-1">
                  <span className="text-[11px] font-semibold text-ink-3 block">
                    Routing Justification:
                  </span>
                  <p className="bg-surface p-2.5 rounded border border-line/70 tabular-nums text-[11px] leading-relaxed">
                    {result.routing_reason}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  className="text-xs font-medium px-3 py-2 rounded-md bg-track/70 hover:bg-track text-ink-2 transition-colors flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5 text-accent" />
                  <span>Submit Human Correction</span>
                </button>

                <button
                  type="button"
                  onClick={handleFetchAiSuggestion}
                  disabled={aiLoading}
                  className="text-xs font-medium px-3.5 py-2 rounded-md bg-ink text-surface hover:opacity-90 shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>{aiLoading ? 'Retrieving SOP...' : 'Generate Resolution Playbook'}</span>
                </button>
              </div>

              {/* RAG AI Playbook Box */}
              {aiSuggestion && (
                <div className="p-4 rounded-lg bg-canvas/60 border border-line space-y-2.5 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      Suggested Agent Response • SOP: {aiSuggestion.relevant_sop}
                    </span>
                    <button
                      onClick={() => copyToClipboard(aiSuggestion.suggested_response)}
                      className="text-xs text-ink-3 hover:text-ink-2 p-1 rounded hover:bg-track flex items-center gap-1"
                      title="Copy response"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <div className="p-3 rounded bg-surface border border-line text-xs text-ink-2 font-sans leading-relaxed whitespace-pre-line">
                    {aiSuggestion.suggested_response}
                  </div>
                  {aiSuggestion.suggested_steps && aiSuggestion.suggested_steps.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[11px] font-semibold text-ink-3 block mb-1">
                        Recommended Action Checklist:
                      </span>
                      <ul className="list-disc list-inside text-xs text-ink-2 space-y-0.5">
                        {aiSuggestion.suggested_steps.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="min-h-[280px] p-8 panel flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-lg bg-track/70 text-ink-3 flex items-center justify-center mb-3">
                <Route className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-ink">
                Awaiting Ticket Routing
              </h3>
              <p className="text-xs text-ink-3 max-w-sm mt-1 leading-relaxed">
                Enter ticket message on the left or select a sample inquiry, then click <strong>Route Ticket</strong> to trigger the multi-factor inference pipeline.
              </p>
            </div>
          )}

          {/* Live 6-Stage Execution Pipeline displayed below result */}
          <LivePipeline result={result} isProcessing={loading} />
        </div>
      </div>

      {/* Human Review Modal */}
      {result && feedbackOpen && (
        <FeedbackModal
          isOpen={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          ticketId={result.ticket_id}
          ticketText={result.text}
          predictedIntent={result.intent}
        />
      )}
    </div>
  );
}
