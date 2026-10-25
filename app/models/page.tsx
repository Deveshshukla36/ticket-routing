'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ModelRegistryItem } from '@/types';
import {
  Layers,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRegistryItem[]>([]);
  const [selectedVariant, setSelectedVariant] = useState('A');
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadModels = async () => {
    try {
      setLoading(true);
      const [modelsList, metricsData] = await Promise.all([
        api.getModels(),
        api.getModelMetrics(selectedVariant),
      ]);
      setModels(modelsList);
      setMetrics(metricsData);
    } catch (err) {
      console.error('Error fetching models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, [selectedVariant]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 mb-1">
            <span>REGISTRY</span>
            <span>/</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">MODEL CATALOG</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Model Registry & Benchmarks
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Production calibrated linear models, challenger baselines, and fine-tuned transformer benchmark metrics.
          </p>
        </div>

        <button
          onClick={loadModels}
          className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors self-start sm:self-auto"
          title="Refresh registry"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Models Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {models.map((model) => {
          const isRoBERTa = model.benchmark;
          const isSelected = selectedVariant === model.variant;

          return (
            <div
              key={model.version}
              className={`p-5 rounded-xl bg-white dark:bg-slate-900 border transition-all flex flex-col justify-between shadow-sm ${
                isSelected
                  ? 'border-indigo-500/80 ring-1 ring-indigo-500/30 dark:ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400">
                    {model.version}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                      model.status.includes('Active')
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                        : isRoBERTa
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40'
                    }`}
                  >
                    {model.status}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {model.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {model.description}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Architecture:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 text-right truncate max-w-[160px]" title={model.architecture}>
                      {model.architecture}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Test Accuracy:</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {(model.accuracy * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">F1 Weighted:</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {(model.f1_score * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-3">
                <button
                  type="button"
                  onClick={() => setSelectedVariant(model.variant)}
                  className={`w-full py-2 px-3 rounded-md text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {isSelected ? 'Active Selection' : 'Inspect Class Metrics'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed Classification Report for Selected Model */}
      {metrics && metrics.per_class && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Evaluation Metrics: {metrics.model_version || selectedVariant}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Class-level precision, recall, and F1 performance on held-out test split ({metrics.test_samples || 193} samples)
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
              Accuracy: {((metrics.accuracy || 0.94) * 100).toFixed(1)}%
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 px-3.5">Intent Class</th>
                  <th className="py-2 px-3.5">Precision</th>
                  <th className="py-2 px-3.5">Recall</th>
                  <th className="py-2 px-3.5">F1-Score</th>
                  <th className="py-2 px-3.5">Test Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                {Object.entries(metrics.per_class)
                  .filter(([key]) => !['accuracy', 'macro avg', 'weighted avg'].includes(key))
                  .map(([intent, data]: [string, any]) => (
                    <tr key={intent} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3.5 font-sans font-medium text-slate-900 dark:text-white">
                        {intent}
                      </td>
                      <td className="py-2 px-3.5">{(data.precision * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3.5">{(data.recall * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3.5 font-semibold text-indigo-600 dark:text-indigo-400">
                        {(data['f1-score'] * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-3.5">{data.support}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
