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
  status: 'healthy' | 'degraded' | 'unhealthy';
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
  accuracy: number;
  f1_score: number;
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

export interface MonitoringStats {
  recent: ClassificationResult[];
  total_logged: number;
  intent_distribution: Record<string, number>;
  avg_confidence: number;
}
