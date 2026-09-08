'use client';

import React, { useEffect, useState } from 'react';
import { RouteResult } from '@/types';
import {
  FileText,
  Cpu,
  Gauge,
  Activity,
  GitMerge,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LivePipelineProps {
  result: RouteResult | null;
  isProcessing: boolean;
}

export function LivePipeline({ result, isProcessing }: LivePipelineProps) {
  const [currentStep, setCurrentStep] = useState(isProcessing ? 0 : 5);

  useEffect(() => {
    if (isProcessing) {
      setCurrentStep(0);
      const timer1 = setTimeout(() => setCurrentStep(1), 100);
      const timer2 = setTimeout(() => setCurrentStep(2), 220);
      const timer3 = setTimeout(() => setCurrentStep(3), 360);
      const timer4 = setTimeout(() => setCurrentStep(4), 500);
      const timer5 = setTimeout(() => setCurrentStep(5), 650);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(timer4);
        clearTimeout(timer5);
      };
    } else if (result) {
      setCurrentStep(5);
    }
  }, [isProcessing, result]);

  if (!isProcessing && !result) {
    return null;
  }

  const confidencePct = result ? (result.confidence * 100).toFixed(1) + '%' : '...';
  const charCount = result?.text ? result.text.length : 0;

  const stages = [
    {
      id: 1,
      title: 'Ticket',
      label: 'Query Ingestion',
      icon: FileText,
      value: result ? `${charCount} chars • #${result.ticket_id.slice(-6)}` : 'Ingesting query...',
      detail: 'Normalized text stream',
      status: currentStep >= 0 ? (currentStep === 0 && isProcessing ? 'active' : 'completed') : 'pending',
    },
    {
      id: 2,
      title: 'Classification',
      label: 'Intent Detection',
      icon: Cpu,
      value: result ? result.intent : 'Predicting intent...',
      detail: result ? result.model_version : 'LinearSVC / Transformer',
      status: currentStep >= 1 ? (currentStep === 1 && isProcessing ? 'active' : 'completed') : 'pending',
    },
    {
      id: 3,
      title: 'Confidence',
      label: 'Threshold Gate',
      icon: Gauge,
      value: result ? confidencePct : 'Calculating score...',
      detail: result
        ? result.requires_human_review
          ? 'Below threshold → Triage'
          : 'High confidence verified'
        : 'Evaluating threshold',
      status: currentStep >= 2 ? (currentStep === 2 && isProcessing ? 'active' : 'completed') : 'pending',
    },
    {
      id: 4,
      title: 'Priority / Sentiment',
      label: 'Urgency & Valence',
      icon: Activity,
      value: result ? `${result.priority} • ${result.sentiment}` : 'Scanning sentiment...',
      detail: result ? (result.sentiment === 'Urgent' ? 'Critical keywords flagged' : 'Calibrated priority') : 'Sentiment analysis',
      status: currentStep >= 3 ? (currentStep === 3 && isProcessing ? 'active' : 'completed') : 'pending',
    },
    {
      id: 5,
      title: 'Routing',
      label: 'Policy Engine',
      icon: GitMerge,
      value: result ? result.sla_label.split('(')[0].trim() : 'Assigning SLA...',
      detail: result ? (result.requires_human_review ? 'Human Review Fallback' : 'SLA Matrix Matched') : 'Evaluating matrix',
      status: currentStep >= 4 ? (currentStep === 4 && isProcessing ? 'active' : 'completed') : 'pending',
    },
    {
      id: 6,
      title: 'Assigned Team',
      label: 'Final Destination',
      icon: Users,
      value: result ? result.routed_team : 'Routing to team...',
      detail: result ? (result.requires_human_review ? 'Requires Human Dispatch' : 'Auto-Dispatched Queue') : 'Final queue assignment',
      status: currentStep >= 5 ? (isProcessing ? 'active' : 'completed') : 'pending',
      isFinal: true,
    },
  ];

  return (
    <div className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Execution Pipeline
          </h4>
          <span className="text-[11px] text-slate-400 font-mono">
            {isProcessing ? `Step ${currentStep + 1} of 6 • Processing...` : '6 Stages Executed'}
          </span>
        </div>

        {result && !isProcessing && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Target Destination:</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200/60 dark:border-indigo-800/40">
              {result.routed_team}
            </span>
          </div>
        )}
      </div>

      {/* Pipeline Stages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 relative">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const isDone = stage.status === 'completed';
          const isActive = stage.status === 'active';

          return (
            <div
              key={stage.id}
              className={cn(
                'relative flex flex-col justify-between p-3.5 rounded-lg border transition-all',
                stage.isFinal && isDone
                  ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700/70 shadow-sm ring-1 ring-indigo-500/30'
                  : isDone
                  ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60'
                  : isActive
                  ? 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/60 opacity-60'
              )}
            >
              {/* Header: Icon + Stage Indicator */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className={cn(
                    'w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold',
                    stage.isFinal && isDone
                      ? 'bg-indigo-600 text-white'
                      : isDone
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      : isActive
                      ? 'bg-indigo-600 text-white animate-pulse'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-slate-400">0{stage.id}</span>
                  {isDone ? (
                    <CheckCircle2
                      className={cn(
                        'w-3.5 h-3.5',
                        stage.isFinal ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'
                      )}
                    />
                  ) : isActive ? (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                  ) : null}
                </div>
              </div>

              {/* Stage Names */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {stage.title}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                  {stage.label}
                </p>

                {/* Derived Value */}
                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <p
                    className={cn(
                      'text-xs font-bold truncate',
                      stage.isFinal && isDone
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : isDone
                        ? 'text-slate-800 dark:text-slate-200'
                        : isActive
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-400'
                    )}
                  >
                    {stage.value}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {stage.detail}
                  </p>
                </div>
              </div>

              {/* Stage arrow indicator */}
              {idx < 5 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-slate-300 dark:text-slate-700">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Destination Final Banner */}
      {result && !isProcessing && (
        <div
          className={cn(
            'p-3.5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border',
            result.requires_human_review
              ? 'bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900/50'
              : 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
          )}
        >
          <div className="flex items-center gap-2.5">
            {result.requires_human_review ? (
              <AlertTriangle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {result.requires_human_review ? 'Dispatched to Human Review Queue' : 'Dispatched to Department Queue'}
              </span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700">•</span>
              <span className="text-slate-600 dark:text-slate-400">
                Routed to <strong className="text-slate-900 dark:text-white font-semibold">{result.routed_team}</strong> with SLA target of <strong className="text-slate-900 dark:text-white font-semibold">{result.sla_label}</strong>.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {result.latency_ms.toFixed(1)}ms execution
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
