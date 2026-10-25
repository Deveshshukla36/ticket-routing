'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatMetric } from '@/lib/utils';
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
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[34px] font-light leading-tight tracking-tight text-ink">Models</h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-3">
            The models the API can serve. Accuracy is measured on the independent 200-ticket holdout.
          </p>
        </div>

        <button
          onClick={loadModels}
          className="p-1.5 rounded-md bg-surface border border-line text-ink-2 hover:bg-track transition-colors self-start sm:self-auto"
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
              className={`p-5 rounded-2xl bg-surface border transition-all flex flex-col justify-between shadow-sm ${ isSelected ? 'border-accent/40 ring-1 ring-accent/40 ' : 'border-line' }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] tabular-nums font-medium text-ink-3">
                    {model.version}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded ${ model.status.includes('Active') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40' : isRoBERTa ? 'bg-accent-soft text-accent border border-accent/40 ' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40' }`}
                  >
                    {model.status}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-ink">
                  {model.name}
                </h3>
                <p className="text-xs text-ink-3 mt-1 leading-relaxed">
                  {model.description}
                </p>

                <div className="mt-4 pt-3 border-t border-line/70 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-3">Architecture:</span>
                    <span className="font-medium text-ink text-right truncate max-w-[160px]" title={model.architecture}>
                      {model.architecture}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-3" title={model.evaluated_on ?? undefined}>Holdout Accuracy:</span>
                    <span className="tabular-nums font-semibold text-ink">
                      {formatMetric(model.accuracy)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-3">F1 Weighted:</span>
                    <span className="tabular-nums font-semibold text-ink">
                      {formatMetric(model.f1_score)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-3">
                <button
                  type="button"
                  onClick={() => setSelectedVariant(model.variant)}
                  className={`w-full py-2 px-3 rounded-md text-xs font-medium transition-colors ${ isSelected ? 'bg-ink text-surface shadow-sm' : 'bg-track/70 text-ink-2 hover:bg-track' }`}
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
        <div className="panel p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-line/70 pb-3">
            <div>
              <h3 className="text-[15px] font-medium text-ink">
                Evaluation Metrics: {metrics.model_version || selectedVariant}
              </h3>
              <p className="text-[11px] text-ink-3">
                Per-class scores from the original training split ({metrics.test_samples} samples; it shares templates with training, so these are optimistic). Holdout accuracy: {formatMetric(metrics.holdout_accuracy)}
              </p>
            </div>
            <span className="text-xs tabular-nums font-semibold text-accent">
              Split accuracy: {formatMetric(metrics.accuracy)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas/60 text-ink-3 font-semibold border-b border-line">
                <tr>
                  <th className="py-2 px-3.5">Intent Class</th>
                  <th className="py-2 px-3.5">Precision</th>
                  <th className="py-2 px-3.5">Recall</th>
                  <th className="py-2 px-3.5">F1-Score</th>
                  <th className="py-2 px-3.5">Test Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70 text-ink-2 tabular-nums">
                {Object.entries(metrics.per_class)
                  .filter(([key]) => !['accuracy', 'macro avg', 'weighted avg'].includes(key))
                  .map(([intent, data]: [string, any]) => (
                    <tr key={intent} className="hover:bg-track">
                      <td className="py-2 px-3.5 font-sans font-medium text-ink">
                        {intent}
                      </td>
                      <td className="py-2 px-3.5">{(data.precision * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3.5">{(data.recall * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3.5 font-semibold text-accent">
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
