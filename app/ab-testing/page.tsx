'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ModelComparisonResponse, ClassificationResult } from '@/types';
import { formatLatency, formatMetric } from '@/lib/utils';
import { toast } from 'sonner';
import {
  GitCompare,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Layers,
} from 'lucide-react';

export default function ABTestingPage() {
  const [comparison, setComparison] = useState<ModelComparisonResponse | null>(null);
  const [testText, setTestText] = useState(
    'My payment went through twice for invoice #98124 and I demand an immediate refund to my Visa card.'
  );
  const [loading, setLoading] = useState(false);
  const [fetchingComparison, setFetchingComparison] = useState(true);
  const [resultA, setResultA] = useState<ClassificationResult | null>(null);
  const [resultB, setResultB] = useState<ClassificationResult | null>(null);

  const loadComparison = async () => {
    try {
      setFetchingComparison(true);
      const data = await api.getModelComparison();
      setComparison(data);
    } catch (err) {
      console.error('Failed to load model comparison:', err);
    } finally {
      setFetchingComparison(false);
    }
  };

  useEffect(() => {
    loadComparison();
  }, []);

  const handleRunSideBySide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testText.trim()) return;

    setLoading(true);
    try {
      const [resA, resB] = await Promise.all([
        api.classifyTicket(testText, undefined, 'A'),
        api.classifyTicket(testText, undefined, 'B'),
      ]);
      setResultA(resA);
      setResultB(resB);
      toast.success('Dual inference completed successfully');
    } catch (err: any) {
      toast.error(err.message || 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  const modelA = comparison?.model_a || {};
  const modelB = comparison?.model_b || {};
  const transformer = comparison?.transformer_benchmark || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[34px] font-light leading-tight tracking-tight text-ink">A/B evaluation</h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-3">
            Model A against challenger B on the same holdout, plus a side-by-side run on any ticket.
          </p>
        </div>

        <button
          onClick={loadComparison}
          className="p-1.5 rounded-md bg-surface border border-line text-ink-2 hover:bg-track transition-colors self-start sm:self-auto"
          title="Refresh comparison metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${fetchingComparison ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Side-by-Side Model Spec Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Model A */}
        <div className="panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              Variant A (Production)
            </span>
            <span className="text-[11px] tabular-nums text-ink-3">{modelA.model_version || 'v1.0.0'}</span>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">
              Calibrated LinearSVC
            </h3>
            <p className="text-xs text-ink-3 mt-0.5">
              Default model, with calibrated probabilities
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-line/70">
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">Holdout Accuracy:</span>
              <span className="tabular-nums font-semibold text-ink">
                {formatMetric(modelA.holdout_accuracy)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">F1 Weighted:</span>
              <span className="tabular-nums font-semibold text-ink">
                {formatMetric(modelA.holdout_f1_weighted)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3" title="Original random split; shares templates with training, so optimistic">Training-split accuracy:</span>
              <span className="tabular-nums text-ink-2">
                {formatMetric(modelA.accuracy)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">Serves:</span>
              <span className="font-medium text-ink">Every request by default</span>
            </div>
          </div>
        </div>

        {/* Model B */}
        <div className="panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
              Variant B (Challenger)
            </span>
            <span className="text-[11px] tabular-nums text-ink-3">{modelB.model_version || 'v1.1.0'}</span>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">
              Multinomial Naive Bayes
            </h3>
            <p className="text-xs text-ink-3 mt-0.5">
              Challenger baseline, compared on the same holdout
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-line/70">
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">Holdout Accuracy:</span>
              <span className="tabular-nums font-semibold text-ink">
                {formatMetric(modelB.holdout_accuracy)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">F1 Weighted:</span>
              <span className="tabular-nums font-semibold text-ink">
                {formatMetric(modelB.holdout_f1_weighted)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3" title="Original random split; shares templates with training, so optimistic">Training-split accuracy:</span>
              <span className="tabular-nums text-ink-2">
                {formatMetric(modelB.accuracy)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">Serves:</span>
              <span className="font-medium text-ink">Only with ?variant=B</span>
            </div>
          </div>
        </div>

        {/* RoBERTa Benchmark */}
        <div className="p-5 rounded-2xl bg-surface border border-accent/40 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-accent-soft text-blue-800 dark:text-blue-200 border border-accent/40">
              {transformer.verified ? 'Verified Benchmark' : 'Not Trained'}
            </span>
            <span className="text-[11px] tabular-nums text-accent font-semibold">{formatMetric(transformer.accuracy)}</span>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">
              RoBERTa-base Fine-Tuned
            </h3>
            <p className="text-xs text-ink-3 mt-0.5">
              Served via Hugging Face when MODEL_BACKEND=roberta
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-line/70">
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">Holdout Accuracy:</span>
              <span className="tabular-nums font-semibold text-accent">
                {formatMetric(transformer.accuracy)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">F1 Weighted:</span>
              <span className="tabular-nums font-semibold text-accent">
                {formatMetric(transformer.f1_weighted)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">Test Set Size:</span>
              <span className="tabular-nums font-medium text-ink">
                {transformer.test_samples ? `${transformer.test_samples} samples` : '—'}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">Benchmark Role:</span>
              <span className="font-medium text-ink-2">{transformer.verified ? 'Benchmark' : 'Planned (gate ≥ 92%)'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Dual Inference Simulator */}
      <div className="panel p-5 space-y-4">
        <div className="border-b border-line/70 pb-3">
          <h3 className="text-[15px] font-medium text-ink">
            Side-by-Side Dual Inference Simulator
          </h3>
          <p className="text-[11px] text-ink-3">
            Simultaneously execute one inquiry on both Model A and Model B to inspect delta in classification & confidence
          </p>
        </div>

        <form onSubmit={handleRunSideBySide} className="space-y-3">
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={3}
            placeholder="Type ticket inquiry to test against both variants simultaneously..."
            className="w-full text-xs p-3 rounded-lg bg-canvas/60 border border-line text-ink focus:outline-none focus:ring-1 focus:ring-accent/40 font-sans"
          />

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading || !testText.trim()}
              className="px-4 py-2 rounded-md bg-ink text-surface hover:opacity-90 font-medium text-xs shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Evaluating Dual Inference...' : 'Run Dual Inference (A vs B)'}</span>
            </button>
          </div>
        </form>

        {/* Dual results comparison */}
        {(resultA || resultB) && (
          <div className="space-y-3 pt-3 border-t border-line/70">
            {/* Agreement Status Banner */}
            {resultA && resultB && (
              <div
                className={`p-2.5 rounded-lg flex items-center gap-2 text-xs border ${ resultA.predicted_intent === resultB.predicted_intent ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300' : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300' }`}
              >
                {resultA.predicted_intent === resultB.predicted_intent ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Models Agree: Both variants classified this ticket as <strong>{resultA.predicted_intent}</strong>.</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Model Divergence: Model A classified as <strong>{resultA.predicted_intent}</strong>, Model B as <strong>{resultB.predicted_intent}</strong>.</span>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Result A */}
              <div className="p-4 rounded-lg bg-canvas/60 border border-line space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">Model A Result (LinearSVC)</span>
                  <span className="text-[11px] tabular-nums text-ink-3 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatLatency(resultA?.latency_ms || 0)}
                  </span>
                </div>
                <div className="text-base font-medium text-accent">
                  {resultA?.predicted_intent}
                </div>
                <div className="text-xs text-ink-2 flex justify-between pt-1 border-t border-line">
                  <span>Confidence:</span>
                  <span className="tabular-nums font-semibold">
                    {((resultA?.confidence || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-ink-2 flex justify-between">
                  <span>Routed Team:</span>
                  <span className="font-medium text-ink">{resultA?.routed_team}</span>
                </div>
              </div>

              {/* Result B */}
              <div className="p-4 rounded-lg bg-canvas/60 border border-line space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">Model B Result (Naive Bayes)</span>
                  <span className="text-[11px] tabular-nums text-ink-3 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatLatency(resultB?.latency_ms || 0)}
                  </span>
                </div>
                <div className="text-base font-medium text-amber-600 dark:text-amber-400">
                  {resultB?.predicted_intent}
                </div>
                <div className="text-xs text-ink-2 flex justify-between pt-1 border-t border-line">
                  <span>Confidence:</span>
                  <span className="tabular-nums font-semibold">
                    {((resultB?.confidence || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-ink-2 flex justify-between">
                  <span>Routed Team:</span>
                  <span className="font-medium text-ink">{resultB?.routed_team}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
