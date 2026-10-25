import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLatency(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  return `${ms.toFixed(1)}ms`;
}

/** Percentage for an evaluation metric that may not exist yet (e.g. an untrained model). */
export function formatMetric(val: number | null | undefined): string {
  return typeof val === 'number' ? `${(val * 100).toFixed(1)}%` : '—';
}

export function formatPercentage(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

// Badge colours: soft fill + deep text (>= 4.5:1 for small text), always shown with the label.
const BADGE = {
  bad: 'bg-bad-soft text-bad-strong dark:text-bad border-bad/30',
  warn: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
  info: 'bg-accent-soft text-blue-800 dark:text-blue-200 border-accent/30',
  good: 'bg-good-soft text-good-strong dark:text-good border-good/30',
  neutral: 'bg-track/70 text-ink-2 border-line',
};

export function getPriorityBadgeColor(priority: string) {
  switch (priority?.toLowerCase()) {
    case 'urgent':
      return BADGE.bad;
    case 'high':
      return BADGE.warn;
    case 'medium':
      return BADGE.info;
    case 'low':
      return BADGE.good;
    case 'needs manual triage':
      return BADGE.bad;
    default:
      return BADGE.neutral;
  }
}

export function getSentimentBadgeColor(sentiment: string) {
  switch (sentiment?.toLowerCase()) {
    case 'positive':
      return BADGE.good;
    case 'negative':
    case 'urgent':
      return BADGE.bad;
    default:
      return BADGE.neutral;
  }
}
