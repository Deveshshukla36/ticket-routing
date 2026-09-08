'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ModelComparisonResponse, ClassificationResult } from '@/types';
import { formatLatency } from '@/lib/utils';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 mb-1">
            <span>EVALUATION</span>
            <span>/</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">A/B TESTING & BENCHMARKS</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Model A/B Evaluation & Transformer Benchmark
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Compare the production calibrated LinearSVC against challenger Naive Bayes and the RoBERTa 94% benchmark.
          </p>
        </div>

        <button
          onClick={loadComparison}
          className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors self-start sm:self-auto"
          title="Refresh comparison metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${fetchingComparison ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Side-by-Side Model Spec Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Model A */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              Variant A (Production)
            </span>
            <span className="text-[11px] font-mono text-slate-400">{modelA.model_version || 'v1.0.0'}</span>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Calibrated LinearSVC
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Production standard with Platt probability calibration
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Test Accuracy:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {((modelA.accuracy || 0.9219) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">F1 Weighted:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {((modelA.f1_weighted || 0.9219) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Avg Latency:</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                ~2.8 ms
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Traffic Allocation:</span>
              <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">80% Serving</span>
            </div>
          </div>
        </div>

        {/* Model B */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
              Variant B (Challenger)
            </span>
            <span className="text-[11px] font-mono text-slate-400">{modelB.model_version || 'v1.1.0'}</span>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Multinomial Naive Bayes
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Alternative challenger pipeline for drift & variance tests
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Test Accuracy:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {((modelB.accuracy || 0.8854) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">F1 Weighted:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {((modelB.f1_weighted || 0.8845) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Avg Latency:</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                ~1.6 ms
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Traffic Allocation:</span>
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">20% Canary</span>
            </div>
          </div>
        </div>

        {/* RoBERTa Benchmark */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
              Benchmark Standard
            </span>
            <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">94.0% SOTA</span>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              RoBERTa-base Fine-Tuned
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              12-layer deep contextual transformer gold standard
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Test Accuracy:</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {((transformer.accuracy || 0.9400) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">F1 Weighted:</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {((transformer.f1_weighted || 0.9408) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Test Set Size:</span>
              <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                {transformer.test_samples || 770} samples
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Benchmark Role:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">Target Ceiling</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Dual Inference Simulator */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Side-by-Side Dual Inference Simulator
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Simultaneously execute one inquiry on both Model A and Model B to inspect delta in classification & confidence
          </p>
        </div>

        <form onSubmit={handleRunSideBySide} className="space-y-3">
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={3}
            placeholder="Type ticket inquiry to test against both variants simultaneously..."
            className="w-full text-xs p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
          />

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading || !testText.trim()}
              className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Evaluating Dual Inference...' : 'Run Dual Inference (A vs B)'}</span>
            </button>
          </div>
        </form>

        {/* Dual results comparison */}
        {(resultA || resultB) && (
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            {/* Agreement Status Banner */}
            {resultA && resultB && (
              <div
                className={`p-2.5 rounded-lg flex items-center gap-2 text-xs border ${
                  resultA.predicted_intent === resultB.predicted_intent
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300'
                }`}
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
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">Model A Result (LinearSVC)</span>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatLatency(resultA?.latency_ms || 0)}
                  </span>
                </div>
                <div className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                  {resultA?.predicted_intent}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 flex justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700">
                  <span>Confidence:</span>
                  <span className="font-mono font-semibold">
                    {((resultA?.confidence || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 flex justify-between">
                  <span>Routed Team:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{resultA?.routed_team}</span>
                </div>
              </div>

              {/* Result B */}
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">Model B Result (Naive Bayes)</span>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatLatency(resultB?.latency_ms || 0)}
                  </span>
                </div>
                <div className="text-base font-bold text-amber-600 dark:text-amber-400">
                  {resultB?.predicted_intent}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 flex justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700">
                  <span>Confidence:</span>
                  <span className="font-mono font-semibold">
                    {((resultB?.confidence || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 flex justify-between">
                  <span>Routed Team:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{resultB?.routed_team}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
