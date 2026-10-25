export interface IntentScore {
  label: string;
  confidence: number;
}

export interface ClassificationResult {
  ticket_id?: string;
  text: string;
  predicted_intent: string;
  confidence: number;
  top_k: IntentScore[];
  routed_team: string;
  priority: string;
  model_version: string;
  latency_ms: number;
  timestamp: string;
  sentiment?: string;
  sla_hours?: number;
  requires_human_review?: boolean;
}

export interface RouteResult {
  ticket_id: string;
  text: string;
  intent: string;
  confidence: number;
  sentiment: string;
  priority: string;
  routed_team: string;
  sla_hours: number;
  sla_label: string;
  requires_human_review: boolean;
  routing_reason: string;
  model_version: string;
  latency_ms: number;
  timestamp: string;
  top_k?: IntentScore[];
  sentiment_score?: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  backend: 'sklearn' | 'roberta';
  model_versions: Record<string, string>;
  db: 'ok' | 'error';
  model_loaded: boolean;
  model_version: string;
  uptime_seconds: number;
  database_connected: boolean;
  environment: string;
}

export interface ModelInfo {
  model_version: string;
  architecture: string;
  accuracy: number;
  f1_weighted: number;
  train_samples: number;
  test_samples: number;
  labels: string[];
}

export interface ModelRegistryItem {
  version: string;
  name: string;
  variant: string;
  architecture: string;
  accuracy: number | null; // null until the model has a reproducible evaluation
  f1_score: number | null;
  evaluated_on?: string | null;
  status: string;
  benchmark: boolean;
  description: string;
}

export interface ModelComparisonResponse {
  model_a: any;
  model_b: any;
  transformer_benchmark: any;
}

export interface FeedbackIn {
  ticket_id?: string;
  text: string;
  predicted_intent: string;
  correct_intent: string;
  notes?: string;
  reviewer?: string;
}

export interface FeedbackResponse {
  status: string;
  feedback_count: number;
  running_agreement_rate: number;
  message?: string;
}

export interface AIResponseResult {
  ticket_id: string;
  intent: string;
  suggested_response: string;
  suggested_steps: string[];
  relevant_sop: string;
  source: string;
}

/** A /monitoring/recent item: either a /classify or a /route result (they name the intent differently). */
export interface RecentTicket {
  ticket_id?: string;
  text: string;
  predicted_intent?: string; // /classify results
  intent?: string; // /route results
  confidence: number;
  routed_team: string;
  priority: string;
  requires_human_review?: boolean;
  model_version: string;
  latency_ms: number;
  timestamp: string;
  sentiment?: string;
  sla_hours?: number;
  variant?: string;
}

export interface ServiceMetrics {
  model_backend: 'sklearn' | 'roberta';
  uptime_seconds: number;
  requests_total: number;
  requests_by_status: Record<string, number>;
  latency_ms: { p50: number | null; p95: number | null; samples: number; window: number };
  routes: Record<string, { count: number; p50_ms: number | null; p95_ms: number | null }>;
  predictions: { by_backend: Record<string, number>; fallbacks_by_reason: Record<string, number> };
  circuit_breaker: { state: 'closed' | 'open' | 'half_open'; consecutive_failures: number } | null;
}

export interface MonitoringStats {
  recent: RecentTicket[];
  total_logged: number;
  intent_distribution: Record<string, number>;
  avg_confidence: number;
}
