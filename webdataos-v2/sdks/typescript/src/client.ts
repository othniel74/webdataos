import type {
  GatewayFetchRequest,
  GatewayFetchResponse,
  ResearchRequest,
  ResearchResponse,
  RetrievalRequest,
  RetrievalResponse,
  TopicCreate,
  TopicResponse,
} from "./types";

export interface WebDataGatewayClientOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class WebDataGatewayError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: string) {
    super(message);
    this.name = "WebDataGatewayError";
  }
}

export class WebDataGatewayClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WebDataGatewayClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.WEB_DATA_GATEWAY_URL ?? "http://localhost:8000").replace(/\/$/, "");
    this.apiKey = options.apiKey ?? process.env.WEB_DATA_GATEWAY_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "webdata-gateway-typescript-sdk/0.1.0",
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new WebDataGatewayError(`Gateway returned ${response.status}`, response.status, text);
    }

    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  fetch(request: GatewayFetchRequest): Promise<GatewayFetchResponse> {
    return this.request<GatewayFetchResponse>("POST", "/gateway/fetch", request);
  }

  createTopic(topic: TopicCreate): Promise<TopicResponse> {
    return this.request<TopicResponse>("POST", "/intelligence/topics", topic);
  }

  listTopics(): Promise<TopicResponse[]> {
    return this.request<TopicResponse[]>("GET", "/intelligence/topics");
  }

  refreshTopic(topicId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("POST", `/intelligence/topics/${encodeURIComponent(topicId)}/refresh`);
  }

  retrieveContext(request: RetrievalRequest): Promise<RetrievalResponse> {
    return this.request<RetrievalResponse>("POST", "/intelligence/retrieve", request);
  }

  research(request: ResearchRequest): Promise<ResearchResponse> {
    return this.request<ResearchResponse>("POST", "/agent/research", request);
  }

  listRuns(): Promise<Array<Record<string, unknown>>> {
    return this.request<Array<Record<string, unknown>>>("GET", "/runs");
  }
}
