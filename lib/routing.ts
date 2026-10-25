import type { RecentTicket } from '@/types';

/** Mirrors ROUTING_TABLE in backend/ml/classifier.py (team, base priority, default SLA). */
export const TEAMS = [
  { intent: 'Billing', code: 'BIL', team: 'Billing & Payments', priority: 'Medium', slaHours: 4 },
  { intent: 'Technical Issue', code: 'TEC', team: 'Technical Support L2', priority: 'High', slaHours: 2 },
  { intent: 'Account Access', code: 'ACC', team: 'Identity & Access', priority: 'High', slaHours: 2 },
  { intent: 'Bug Report', code: 'BUG', team: 'Engineering', priority: 'High', slaHours: 12 },
  { intent: 'Complaint', code: 'CMP', team: 'Escalations', priority: 'Urgent', slaHours: 1 },
  { intent: 'Cancellation', code: 'CAN', team: 'Retention Team', priority: 'Medium', slaHours: 2 },
  { intent: 'Feature Request', code: 'FEA', team: 'Product Management', priority: 'Low', slaHours: 24 },
  { intent: 'General Inquiry', code: 'GEN', team: 'Tier 1 Support', priority: 'Low', slaHours: 8 },
] as const;

export const REVIEW_QUEUE = 'Human Review Queue';

export function intentCode(intent: string | undefined): string {
  return TEAMS.find((t) => t.intent === intent)?.code ?? '—';
}

export interface Ticket {
  id: string;
  text: string;
  intent: string; // normalised: /classify uses predicted_intent, /route uses intent
  confidence: number;
  team: string; // the intent's team, even when the ticket is held for review
  needsReview: boolean;
  priority: string;
  latencyMs: number;
  modelVersion: string;
  timestamp: number;
}

export function normalizeTicket(t: RecentTicket, index: number): Ticket {
  const intent = t.predicted_intent ?? t.intent ?? 'Unknown';
  const intentTeam = TEAMS.find((x) => x.intent === intent)?.team;
  return {
    id: t.ticket_id || `ticket-${index}`,
    text: t.text,
    intent,
    confidence: t.confidence,
    // /route moves review tickets to "Human Review Queue"; keep the intent's team for grouping.
    team: t.routed_team === REVIEW_QUEUE ? intentTeam ?? REVIEW_QUEUE : t.routed_team,
    needsReview: Boolean(t.requires_human_review),
    priority: t.priority,
    latencyMs: t.latency_ms,
    modelVersion: t.model_version,
    timestamp: Date.parse(t.timestamp) || 0,
  };
}

export interface TeamQueue {
  team: string;
  intent: string;
  code: string;
  slaHours: number;
  routed: Ticket[]; // auto-routed to this team
  review: Ticket[]; // classified to this team's intent but held for human review
  avgConfidence: number | null;
}

export function buildQueues(tickets: Ticket[]): TeamQueue[] {
  return TEAMS.map((t) => {
    const mine = tickets.filter((x) => x.intent === t.intent);
    const routed = mine.filter((x) => !x.needsReview);
    const review = mine.filter((x) => x.needsReview);
    const avg = mine.length ? mine.reduce((s, x) => s + x.confidence, 0) / mine.length : null;
    return { team: t.team, intent: t.intent, code: t.code, slaHours: t.slaHours, routed, review, avgConfidence: avg };
  });
}

/** Split values into `buckets` consecutive chunks and reduce each (for sparklines). */
export function chunked<T>(items: T[], buckets: number, reduce: (chunk: T[]) => number): number[] {
  if (items.length === 0) return [];
  const n = Math.min(buckets, items.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i * items.length) / n);
    const end = Math.floor(((i + 1) * items.length) / n);
    out.push(reduce(items.slice(start, end)));
  }
  return out;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const pct = (v: number | null | undefined, digits = 1) =>
  typeof v === 'number' ? `${(v * 100).toFixed(digits)}%` : '—';
