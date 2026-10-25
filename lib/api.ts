import {
  ClassificationResult,
  RouteResult,
  HealthStatus,
  ModelInfo,
  ModelRegistryItem,
  ModelComparisonResponse,
  FeedbackIn,
  FeedbackResponse,
  AIResponseResult,
  MonitoringStats,
} from '@/types';

// On Vercel: NEXT_PUBLIC_API_URL='' → relative paths routed by vercel.json
// On local dev: unset → '' → next.config.js rewrites /api/* to FastAPI on 8000
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

async function fetchJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const errorBody = await res.text();
      let errorMsg = `API Error (${res.status}): ${res.statusText}`;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.detail) {
          errorMsg = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
        }
      } catch {
        if (errorBody) errorMsg = errorBody;
      }
      throw new Error(errorMsg);
    }

    return await res.json();
  } catch (err: any) {
    console.error(`Fetch failed for ${endpoint}:`, err);
    throw err;
  }
}

export const api = {
  getHealth: async (): Promise<HealthStatus> => {
    return fetchJson<HealthStatus>('/api/v1/health');
  },

  getModelInfo: async (variant: string = 'A'): Promise<ModelInfo> => {
    return fetchJson<ModelInfo>(`/api/v1/model/info?variant=${encodeURIComponent(variant)}`);
  },

  getModelMetrics: async (variant: string = 'A'): Promise<any> => {
    return fetchJson<any>(`/api/v1/model/metrics?variant=${encodeURIComponent(variant)}`);
  },

  getModelComparison: async (): Promise<ModelComparisonResponse> => {
    return fetchJson<ModelComparisonResponse>('/api/v1/model/compare');
  },

  getModels: async (): Promise<ModelRegistryItem[]> => {
    return fetchJson<ModelRegistryItem[]>('/api/v1/models');
  },

  classifyTicket: async (
    text: string,
    ticketId?: string,
    variant: string = 'A'
  ): Promise<ClassificationResult> => {
    return fetchJson<ClassificationResult>(`/api/v1/classify?variant=${encodeURIComponent(variant)}`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        ticket_id: ticketId || `TCK-${Date.now().toString().slice(-6)}`,
      }),
    });
  },

  routeTicket: async (
    text: string,
    ticketId?: string,
    confidenceThreshold?: number,
    variant: string = 'A'
  ): Promise<RouteResult> => {
    return fetchJson<RouteResult>('/api/v1/route', {
      method: 'POST',
      body: JSON.stringify({
        text,
        ticket_id: ticketId || `TCK-${Date.now().toString().slice(-6)}`,
        confidence_threshold: confidenceThreshold,
        variant,
      }),
    });
  },

  getMonitoringRecent: async (limit: number = 50): Promise<MonitoringStats> => {
    return fetchJson<MonitoringStats>(`/api/v1/monitoring/recent?limit=${limit}`);
  },

  getHistory: async (limit: number = 50): Promise<ClassificationResult[]> => {
    return fetchJson<ClassificationResult[]>(`/api/v1/history?limit=${limit}`);
  },

  submitFeedback: async (feedback: FeedbackIn): Promise<FeedbackResponse> => {
    return fetchJson<FeedbackResponse>('/api/v1/feedback', {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  },

  getFeedbackList: async (limit: number = 50): Promise<FeedbackIn[]> => {
    return fetchJson<FeedbackIn[]>(`/api/v1/feedback/list?limit=${limit}`);
  },

  getKnowledgeBase: async (): Promise<Record<string, any>> => {
    return fetchJson<Record<string, any>>('/api/v1/knowledge-base');
  },

  suggestResponse: async (text: string, ticketId?: string, intent?: string): Promise<AIResponseResult> => {
    return fetchJson<AIResponseResult>('/api/v1/suggest-response', {
      method: 'POST',
      body: JSON.stringify({
        text,
        ticket_id: ticketId || `TCK-${Date.now().toString().slice(-6)}`,
        intent,
      }),
    });
  },
};
