export type ToolName =
  | "serp_api"
  | "web_scraper_api"
  | "web_unlocker"
  | "scraping_browser"
  | "mcp_server";

export interface GatewayFetchRequest {
  url?: string | null;
  query?: string | null;
  task_type?: string;
  preferred_tool?: ToolName | null;
  output_schema?: Record<string, unknown>;
  country?: string | null;
  max_attempts?: number | null;
  metadata?: Record<string, unknown>;
}

export interface RecoveryStep {
  attempt: number;
  tool: ToolName;
  status: string;
  failure_type?: string;
  reason?: string | null;
  latency_ms?: number | null;
}

export interface GatewayFetchResponse {
  status: string;
  request_id: string;
  source_url?: string | null;
  query?: string | null;
  tool_used: ToolName;
  recovery_path: RecoveryStep[];
  data: Record<string, unknown>;
  raw_text?: string | null;
  confidence: number;
  extracted_at: string;
  error?: string | null;
}

export interface TopicCreate {
  id: string;
  name: string;
  description?: string | null;
  entities?: string[];
  watch_types?: string[];
  refresh_frequency_minutes?: number;
}

export interface TopicResponse extends TopicCreate {
  created_at?: string | null;
}

export interface RetrievalRequest {
  query: string;
  topic_id?: string | null;
  entities?: string[];
  freshness_required_days?: number | null;
  source_types?: string[];
  top_k?: number;
}

export interface RetrievalResponse {
  results: Array<Record<string, unknown>>;
}

export interface ResearchRequest {
  task: string;
  topic_id?: string | null;
  freshness_required?: string;
  max_sources?: number;
}

export interface ResearchResponse {
  summary: string;
  report: Record<string, unknown>;
  sources: Array<Record<string, unknown>>;
  records_used: number;
  sources_refreshed: number;
  confidence: number;
}
