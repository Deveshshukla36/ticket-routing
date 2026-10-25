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
    <div className="w-full rounded-2xl border border-line bg-surface shadow-sm overflow-hidden p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line/70 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <h4 className="text-[15px] font-medium text-ink">
            Execution Pipeline
          </h4>
          <span className="text-[11px] text-ink-3 tabular-nums">
            {isProcessing ? `Step ${currentStep + 1} of 6 • Processing...` : '6 Stages Executed'}
          </span>
        </div>

        {result && !isProcessing && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-3">Target Destination:</span>
            <span className="font-semibold text-accent bg-accent-soft px-2 py-0.5 rounded border border-accent/40">
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
                  ? 'bg-accent-soft border-accent/40 shadow-sm ring-1 ring-accent/40'
                  : isDone
                  ? 'bg-canvas/60 border-line/60'
                  : isActive
                  ? 'bg-accent-soft border-accent/40 ring-2 ring-accent/40'
                  : 'bg-surface border-line/70/60 opacity-60'
              )}
            >
              {/* Header: Icon + Stage Indicator */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className={cn(
                    'w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold',
                    stage.isFinal && isDone
                      ? 'bg-ink text-surface'
                      : isDone
                      ? 'bg-track/70 text-ink-2'
                      : isActive
                      ? 'bg-ink text-surface animate-pulse'
                      : 'bg-track/70 text-ink-3'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[10px] tabular-nums text-ink-3">0{stage.id}</span>
                  {isDone ? (
                    <CheckCircle2
                      className={cn(
                        'w-3.5 h-3.5',
                        stage.isFinal ? 'text-accent' : 'text-good-strong dark:text-good'
                      )}
                    />
                  ) : isActive ? (
                    <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                  ) : null}
                </div>
              </div>

              {/* Stage Names */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink truncate">
                    {stage.title}
                  </span>
                </div>
                <p className="text-[10px] text-ink-3 truncate">
                  {stage.label}
                </p>

                {/* Derived Value */}
                <div className="pt-1.5 border-t border-line/70">
                  <p
                    className={cn(
                      'text-xs font-semibold truncate',
                      stage.isFinal && isDone
                        ? 'text-accent'
                        : isDone
                        ? 'text-ink'
                        : isActive
                        ? 'text-accent'
                        : 'text-ink-3'
                    )}
                  >
                    {stage.value}
                  </p>
                  <p className="text-[10px] text-ink-3 truncate mt-0.5">
                    {stage.detail}
                  </p>
                </div>
              </div>

              {/* Stage arrow indicator */}
              {idx < 5 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-ink-3">
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
              ? 'bg-bad-soft/60 border-bad/30'
              : 'bg-good-soft/60 border-good/30'
          )}
        >
          <div className="flex items-center gap-2.5">
            {result.requires_human_review ? (
              <AlertTriangle className="w-4 h-4 text-bad-strong dark:text-bad shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-good-strong dark:text-good shrink-0" />
            )}
            <div>
              <span className="font-semibold text-ink">
                {result.requires_human_review ? 'Dispatched to Human Review Queue' : 'Dispatched to Department Queue'}
              </span>
              <span className="mx-1.5 text-ink-3">•</span>
              <span className="text-ink-2">
                Routed to <strong className="text-ink font-semibold">{result.routed_team}</strong> with SLA target of <strong className="text-ink font-semibold">{result.sla_label}</strong>.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] tabular-nums text-ink-3 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {result.latency_ms.toFixed(1)}ms execution
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
