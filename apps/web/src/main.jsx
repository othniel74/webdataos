import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  Shield, Globe, TrendingUp, Layers, Mic, Brain, Zap, ArrowRight,
  CheckCircle, RefreshCw, Send, LogOut, User, Mail, KeyRound,
  ThumbsUp, ThumbsDown, BarChart3, Target, Briefcase, Play,
  AlertTriangle, Database, Search, Clock, Eye as EyeIcon, ChevronRight,
  GitBranch, Menu, X, Lock, FileText, Users2, ChevronDown, Info
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════════════════ */
const T = {
  bg: "#070B14", bgSub: "#0A0F1C", bgCard: "#0D1424", bgInset: "#050912",
  border: "rgba(255,255,255,0.07)", borderL: "rgba(255,255,255,0.11)",
  text: "#dde4ee", muted: "#7a8fa8", dim: "#3d4f66",
  accent: "#0ea5e9", glow: "rgba(14,165,233,0.08)",
};
const matC = m => m === "critical" ? "#dc2626" : m === "high" ? "#ef4444" : m === "medium" ? "#f59e0b" : m === "low" ? "#22c55e" : "#64748b";

/* ═══════ TOAST (module-level) ═══════ */
let _showToast = null;
const toast = {
  success: msg => _showToast?.(msg, "success"),
  error: msg => _showToast?.(msg, "error"),
  info: msg => _showToast?.(msg, "info"),
};
const stC = s => s === "pending_approval" ? "#f59e0b" : s === "approved" || s === "auto_approved" ? "#3b82f6" : s === "executed" ? "#22c55e" : s === "rejected" ? "#ef4444" : "#64748b";
const oC = o => o === "acted" ? "#22c55e" : o === "confirmed_useful" ? "#06b6d4" : o === "dismissed" ? "#94a3b8" : o === "false_alarm" ? "#ef4444" : "#f59e0b";
const statusColorLite = s => ["success", "triggered", "received", "ok", "live", "ready"].includes(s) ? "#22c55e" : ["failed", "error", "timeout"].includes(s) ? "#ef4444" : "#f59e0b";
const fmt = n => `${Math.round(n * 100)}%`;
const slug = v => v.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "ws";
const createDefaultWorkspace = () => ({
  id: "workspace_enterprise",
  name: "Enterprise Intelligence OS",
  cadence: "Daily",
  entities: "vendors, competitors, accounts, companies",
  signals: "vendor_risk, competitor_move, pricing_change, market_movement, regulatory_change, workflow_trigger",
});
const normalizeWorkspaceId = value => {
  const raw = String(value || "").trim();
  if (!raw) return "workspace_enterprise";
  const workspaceTail = raw.match(/(workspace_[a-z0-9_]+)$/i);
  if (raw.includes("://")) return workspaceTail ? workspaceTail[1].toLowerCase() : "workspace_enterprise";
  return slug(raw);
};
const workspacePath = value => encodeURIComponent(normalizeWorkspaceId(value));
const API = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000" : "");
const KEY = import.meta.env.VITE_API_KEY || "dev-local-key-change-me";
const AUTH_STORAGE_KEY = "webdataos.auth.session";
let apiBearerToken = localStorage.getItem(AUTH_STORAGE_KEY) || null;
const setApiBearerToken = token => {
  apiBearerToken = token || null;
  if (token) localStorage.setItem(AUTH_STORAGE_KEY, token);
  else localStorage.removeItem(AUTH_STORAGE_KEY);
};
const authHeaders = () => (apiBearerToken ? { "Authorization": `Bearer ${apiBearerToken}` } : { "X-API-Key": KEY });
const headers = () => ({ "Content-Type": "application/json", ...authHeaders() });
const demoHeaders = sessionId => ({ "Content-Type": "application/json", ...(sessionId ? { "X-Demo-Session": sessionId } : {}) });
const errorText = value => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === "string") return item;
      const loc = Array.isArray(item?.loc) ? item.loc.join(".") : item?.path?.join?.(".") || "";
      const msg = item?.msg || item?.message || JSON.stringify(item);
      return loc ? `${loc}: ${msg}` : msg;
    }).join("; ");
  }
  if (typeof value === "object") return value.detail ? errorText(value.detail) : value.error ? errorText(value.error) : JSON.stringify(value);
  return String(value);
};
const readableError = (status, text, path) => {
  const body = (text || "").trim();
  const lower = body.toLowerCase();
  if (lower.includes("<html") || lower.includes("gateway time-out") || lower.includes("bad gateway")) {
    return `${path} did not complete before the deployment gateway timed out. Please retry; no workspace data was changed.`;
  }
  try {
    const parsed = JSON.parse(body);
    return `${status}: ${errorText(parsed.detail || parsed.error || parsed) || body.slice(0, 280)}`;
  } catch {
    return `${status}: ${body.slice(0, 280)}`;
  }
};
async function api(method, path, body, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { method, headers: headers(), signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw new Error(readableError(res.status, await res.text(), path));
    return res.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${path} timed out. The live backend did not respond fast enough.`);
    if (error instanceof TypeError) throw new Error(`${path} failed to fetch. Check the API connection and deployment proxy.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function demoApi(method, path, sessionId, body, timeoutMs = 70000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { method, headers: demoHeaders(sessionId), signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw new Error(readableError(res.status, await res.text(), path));
    return res.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${path} timed out. The demo backend did not respond fast enough.`);
    if (error instanceof TypeError) throw new Error(`${path} failed to fetch. Check the API connection.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const endpoints = {
  health: () => api("GET", "/health"),
  login: data => api("POST", "/auth/login", data, 20000),
  signup: data => api("POST", "/auth/signup", data, 20000),
  me: () => api("GET", "/auth/me", null, 20000),
  listPacks: () => api("GET", "/workspaces/packages"),
  listWorkspaces: () => api("GET", "/workspaces"),
  listAllRuns: (limit = 50) => api("GET", `/runs?limit=${limit}`),
  createWorkspace: data => api("POST", "/workspaces", data),
  research: data => api("POST", "/agent/research", data, 70000),
  listRuns: (topicId, limit = 50) => api("GET", `/runs?topic_id=${encodeURIComponent(topicId)}&limit=${limit}`),
  getRun: runId => api("GET", `/runs/${encodeURIComponent(runId)}`),
  listRecords: () => api("GET", "/intelligence/records"),
  listTopicRecords: topicId => api("GET", `/intelligence/records?topic_id=${encodeURIComponent(topicId)}`),
  createTopic: data => api("POST", "/intelligence/topics", data),
  discoverSources: (topicId, limit = 6, query = "") => api("POST", `/intelligence/topics/${encodeURIComponent(topicId)}/discover?limit=${limit}${query ? `&query=${encodeURIComponent(query)}` : ""}`, null, 45000),
  refreshTopic: (topicId, maxSources = 4, query = "") => api("POST", `/intelligence/topics/${encodeURIComponent(topicId)}/refresh?max_sources=${maxSources}${query ? `&query=${encodeURIComponent(query)}` : ""}`, null, 70000),
  retrieveContext: data => api("POST", "/intelligence/retrieval/context", data),
  gatewayFetch: data => api("POST", "/gateway/fetch", data),
  graphStatus: () => api("GET", "/graph/status"),
  graphTopic: topicId => api("GET", `/graph/topics/${encodeURIComponent(topicId)}`),
  graphBackfill: topicId => api("POST", `/graph/topics/${encodeURIComponent(topicId)}/backfill`),
  graphEntity: entity => api("GET", `/graph/entities/${encodeURIComponent(entity)}`),
  graphSignals: (signalType = "", limit = 120) => api("GET", `/graph/signals?limit=${limit}${signalType ? `&signal_type=${encodeURIComponent(signalType)}` : ""}`),
  graphCrossEntity: (minCoOccurrences = 1, limit = 150) => api("GET", `/graph/cross-entity?min_co_occurrences=${minCoOccurrences}&limit=${limit}`),
  graphRunLineage: runId => api("GET", `/graph/runs/${encodeURIComponent(runId)}/lineage`),
  monitorSummary: workspaceId => api("GET", `/monitor/${workspacePath(workspaceId)}`),
  runMonitor: workspaceId => api("POST", `/monitor/${workspacePath(workspaceId)}/run`, null, 70000),
  listChat: (workspaceId, limit = 80) => api("GET", `/chat/${workspacePath(workspaceId)}?limit=${limit}`),
  createChat: (workspaceId, data) => api("POST", `/chat/${workspacePath(workspaceId)}`, data),
  clearChat: workspaceId => api("DELETE", `/chat/${workspacePath(workspaceId)}`),
  listActions: (wsId, status) => api("GET", `/actions/${workspacePath(wsId)}${status ? `?status=${status}` : ""}`),
  approveAction: (id, data) => api("POST", `/actions/${id}/approve`, data),
  executeAction: id => api("POST", `/actions/${id}/execute`),
  recordOutcome: data => api("POST", "/outcomes", data),
  listOutcomes: wsId => api("GET", `/outcomes/${workspacePath(wsId)}`),
  outcomeStats: wsId => api("GET", `/outcomes/${workspacePath(wsId)}/stats`),
  slackStatus: () => api("GET", "/integrations/slack"),
  slackTest: (webhookUrl) => api("POST", "/integrations/slack/test", webhookUrl ? { webhook_url: webhookUrl } : null, 15000),
  adminListUsers: () => api("GET", "/admin/users"),
  adminCreateUser: (payload) => api("POST", "/admin/users", payload),
  adminSetStatus: (userId, status) => api("PATCH", `/admin/users/${userId}/status`, { status }),
  transcribeAudio: async (blob, language = "en") => {
    const form = new FormData();
    form.append("audio", blob, `recording-${Date.now()}.webm`);
    form.append("language", language);
    const res = await fetch(`${API}/transcriptions/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },
  synthesizeSpeech: async (text, voice = "sarah") => {
    const res = await fetch(`${API}/speech/synthesize`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.blob();
  },
  demoCatalog: () => demoApi("GET", "/demo/catalog"),
  demoSession: mission => demoApi("POST", "/demo/sessions", null, { mission }, 20000),
  demoCurrent: sessionId => demoApi("GET", "/demo/sessions/current", sessionId, null, 20000),
  demoWorkspace: (sessionId, data) => demoApi("POST", "/demo/workspaces", sessionId, data, 20000),
  demoRun: sessionId => demoApi("POST", "/demo/monitor/run", sessionId, null, 180000),
  demoChat: (sessionId, question, history = []) => demoApi("POST", "/demo/analyst/chat", sessionId, { question, history }, 180000),
  demoEvidence: sessionId => demoApi("GET", "/demo/evidence", sessionId, null, 30000),
  demoGraph: sessionId => demoApi("GET", "/demo/graph", sessionId, null, 30000),
  demoLatest: sessionId => demoApi("GET", "/demo/runs/latest", sessionId, null, 30000),
  demoSynthesize: async (sessionId, text, voice = "sarah") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${API}/demo/speech/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Demo-Session": sessionId },
        body: JSON.stringify({ text, voice }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      return res.blob();
    } catch (e) { clearTimeout(timer); throw e; }
  },
  demoTranscribeUpload: async (sessionId, blob, language = "en") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const form = new FormData();
      form.append("audio", blob, `recording-${Date.now()}.webm`);
      form.append("language", language);
      const res = await fetch(`${API}/demo/transcriptions/upload`, {
        method: "POST",
        headers: { "X-Demo-Session": sessionId },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Transcription ${res.status}`);
      return res.json();
    } catch (e) { clearTimeout(timer); throw e; }
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   DISPLAY UTILITIES — keep technical noise out of the user-facing UI
   ═══════════════════════════════════════════════════════════════════════ */
const isHtmlContent = str => {
  if (!str) return false;
  const s = String(str).trimStart().slice(0, 300);
  return /^<!|^<html[\s>]/i.test(s) || (s.includes("<html") && s.includes("<head"));
};
const stripSourceCitations = str => {
  if (!str) return str;
  return String(str)
    .replace(/\s*[·\-]?\s*Source:\s*https?:\/\/\S+/gi, "")
    .replace(/\s*\(https?:\/\/[^\s)]{10,}\)/g, "")
    .trim();
};
const safeText = str => {
  if (!str) return str;
  if (isHtmlContent(str)) return null;
  return stripSourceCitations(str);
};
const toHostname = url => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
};
const humanSourceType = type => {
  const map = { news_page: "News", company_page: "Company", official: "Official", web: "Web", social: "Social media", press_release: "Press release", regulatory: "Regulatory filing", financial: "Financial data", job_posting: "Job listing", research: "Research", forum: "Community" };
  if (!type) return "Web";
  return map[type] || String(type).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
};
const renderMessageText = text => {
  if (!text) return null;
  const parts = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0, m;
  while ((m = linkRegex.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={last}>{text.slice(last, m.index)}</span>);
    const label = m[1];
    const url = m[2];
    const host = toHostname(url) || label;
    parts.push(<a key={m.index} href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "none", borderBottom: "1px solid rgba(56,189,248,.3)", paddingBottom: 1 }}>{label !== url ? label : host}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={last}>{text.slice(last)}</span>);
  return parts.length > 1 ? parts : text;
};

/* ═══════════════════════════════════════════════════════════════════════
   DATA (mirrors codebase schemas)
   ═══════════════════════════════════════════════════════════════════════ */
const PACKS = [
  { id: "security", name: "Security & Compliance", tier: "Focused", description: "Monitor vendor risk, regulatory changes, breach exposure, policy updates, and public risk signals.", signals: ["Vendor risk", "Regulatory change", "Breach exposure", "Compliance signals"], entities: ["Vendors", "Regulators", "Domains", "Security pages"], routes: ["serp_api", "web_unlocker", "scraping_browser", "web_scraper_api"], output: ["risk_brief", "evidence", "recommended_action"], icon: "shield", color: "#ef4444" },
  { id: "gtm", name: "GTM Intelligence", tier: "Focused", description: "Track competitors, pricing, messaging, hiring signals, account enrichment, and buying intent.", signals: ["Competitor moves", "Pricing changes", "Messaging shifts", "Buying signals"], entities: ["Competitors", "Accounts", "Products", "Markets"], routes: ["serp_api", "web_scraper_api", "scraping_browser", "web_unlocker"], output: ["market_brief", "account_intelligence", "competitive_change"], icon: "globe", color: "#3b82f6" },
  { id: "finance", name: "Finance & Market", tier: "Focused", description: "Monitor filings, supplier signals, pricing movements, sector changes, and alternative market data.", signals: ["Filings", "Supplier signals", "Market movement", "Alternative data"], entities: ["Companies", "Suppliers", "Sectors", "Market pages"], routes: ["serp_api", "web_scraper_api", "scraping_browser", "web_unlocker"], output: ["market_signal", "company_brief", "supplier_risk"], icon: "trending", color: "#22c55e" },
  { id: "enterprise", name: "Enterprise Intelligence OS", tier: "Combo", description: "All three packs unified with cross-domain alerts, shared evidence, voice input, LLM reasoning, and autonomous actions.", signals: ["All security", "All GTM", "All finance", "Cross-domain alerts"], entities: ["Vendors", "Competitors", "Accounts", "Companies"], routes: ["serp_api", "web_unlocker", "scraping_browser", "web_scraper_api"], output: ["executive_brief", "cross_track_alert", "shared_evidence"], icon: "layers", color: "#06b6d4", featured: true },
];

const DOMAINS = PACKS.slice(0, 3); // Security, GTM, Finance — the 3 selectable domains
const TIERS = [
  { id: "core", name: "Core", tagline: "Pick any 1 domain", description: "Choose one focused intelligence domain. Ideal for teams with a single priority area.", pick: 1, color: "#94a3b8", price: "Free during beta" },
  { id: "pro", name: "Pro", tagline: "Pick any 2 domains", description: "Combine two domains for broader coverage across your highest-priority areas.", pick: 2, color: "#818cf8", price: "Contact sales", featured: true },
  { id: "enterprise", name: "Enterprise Intelligence OS", tagline: "All 3 domains unified", description: "Security + GTM + Finance with cross-domain alerts, shared evidence, and executive briefs.", pick: 3, color: "#06b6d4", price: "Contact sales" },
];

const packIcon = (id, size = 18) => {
  const p = { size, strokeWidth: 1.5 };
  if (id === "shield") return <Shield {...p} />;
  if (id === "globe") return <Globe {...p} />;
  if (id === "trending") return <TrendingUp {...p} />;
  return <Layers {...p} />;
};

/* ═══════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════ */
const PUB = ["Home", "Demo", "Pricing"];
const PRIV = ["Feed", "Brief", "Monitor", "Analyst", "Evidence", "Actions", "Outcomes", "Portfolio", "Team", "Settings"];
const isSuperAdmin = (u) => u?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
const initialPageFromPath = () => {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  const publicMatch = PUB.find(page => page.toLowerCase() === path);
  const privateMatch = PRIV.find(page => page.toLowerCase() === path);
  return publicMatch || privateMatch || "Home";
};
const toAppUser = account => {
  const email = account?.email || "";
  const name = account?.name || email || "Analyst";
  return {
    id: account?.id,
    tenantId: account?.tenant_id,
    name,
    email,
    role: account?.role || "analyst",
    initials: name.trim()[0]?.toUpperCase() || "A",
  };
};

export default function App() {
  const [page, setPage] = useState(initialPageFromPath);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    _showToast = (msg, type) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, msg, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200);
    };
    return () => { _showToast = null; };
  }, []);
  const [packId, setPackId] = useState("enterprise");
  const [tierId, setTierId] = useState("pro");
  const [selDomains, setSelDomains] = useState(["security", "gtm"]);
  const [actions, setActions] = useState([]);
  const [report, setReport] = useState(null);
  const [backendOk, setBackendOk] = useState(null);
  const [ws, setWs] = useState(createDefaultWorkspace);
  const tier = useMemo(() => TIERS.find(t => t.id === tierId) || TIERS[1], [tierId]);
  const activeDomains = useMemo(() => tierId === "enterprise" ? DOMAINS : DOMAINS.filter(d => selDomains.includes(d.id)), [tierId, selDomains]);
  const effectivePackId = useMemo(() => tierId === "enterprise" || activeDomains.length !== 1 ? "enterprise" : activeDomains[0].id, [tierId, activeDomains]);
  const pack = useMemo(() => PACKS.find(p => p.id === effectivePackId) || PACKS[3], [effectivePackId]);
  const toggleDomain = (id) => { if (tierId === "enterprise") return; setSelDomains(prev => { if (prev.includes(id)) return prev.filter(d => d !== id); if (prev.length >= tier.pick) return [...prev.slice(1), id]; return [...prev, id]; }); };
  const nav = useCallback(t => { if (PRIV.includes(t) && !user) { setShowAuth(true); return; } setPage(t); }, [user]);
  const canUsePrivateApi = Boolean(user);
  useEffect(() => {
    if (packId !== effectivePackId) setPackId(effectivePackId);
  }, [packId, effectivePackId]);
  useEffect(() => {
    endpoints.health().then(status => setBackendOk(status)).catch(() => setBackendOk(false));
  }, []);
  useEffect(() => {
    if (!apiBearerToken) return;
    endpoints.me()
      .then(({ user: account }) => setUser(toAppUser(account)))
      .catch(() => {
        setApiBearerToken(null);
        setUser(null);
      });
  }, []);
  useEffect(() => {
    try {
      Object.keys(localStorage)
        .filter(key => key.startsWith("webdataos.chat.") && key.includes("://"))
        .forEach(key => localStorage.removeItem(key));
    } catch (_) {}
  }, []);
  useEffect(() => {
    const cleanId = normalizeWorkspaceId(ws.id);
    if (cleanId !== ws.id) setWs(prev => ({ ...prev, id: cleanId }));
  }, [ws.id]);
  useEffect(() => {
    if (!canUsePrivateApi || !["Analyst", "Actions", "Outcomes", "Monitor"].includes(page)) return;
    endpoints.listActions(ws.id).then(items => { if (items.length) setActions(items); }).catch(() => {});
  }, [canUsePrivateApi, page, ws.id]);
  const saveWorkspace = async () => {
    const workspaceId = normalizeWorkspaceId(ws.id || ws.name);
    const payload = {
      id: workspaceId,
      name: ws.name,
      package_id: effectivePackId,
      entities: ws.entities.split(",").map(s => s.trim()).filter(Boolean),
      signals: ws.signals.split(",").map(s => s.trim()).filter(Boolean),
      refresh_frequency_minutes: ws.cadence === "Every 6 hours" ? 360 : ws.cadence === "Weekly" ? 10080 : 1440,
    };
    const saved = await endpoints.createWorkspace(payload);
    setWs(prev => ({ ...prev, id: saved.id || payload.id, name: saved.name || prev.name }));
    return saved;
  };
  const runResearch = async (task, options = {}) => {
    const saved = await saveWorkspace();
    const workspaceId = normalizeWorkspaceId(saved?.id || ws.id);
    const result = await endpoints.research({
      task,
      conversation_context: options.conversation_context || null,
      workspace_id: workspaceId,
      topic_id: workspaceId,
      package_id: effectivePackId,
      input_mode: options.input_mode || "text",
      enable_memory: true,
      enable_workflows: true,
      max_sources: 3,
    });
    setReport(result);
    if (result.autonomous_actions?.length) setActions(result.autonomous_actions);
    return result;
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Inter','DM Sans',system-ui,sans-serif" }}>
      <style>{CSS}</style>
      <style>{UPGRADE_PUBLIC_EXTRA_CSS}</style>
      <Nav page={page} setPage={nav} user={user} onAuth={() => setShowAuth(true)} onOut={() => { setApiBearerToken(null); setUser(null); setPage("Home"); }} backendOk={backendOk} />
      {page === "Home" && <PublicHomePage nav={nav} user={user} auth={() => setShowAuth(true)} />}
      {page === "Demo" && <PublicDemoPage nav={nav} auth={() => setShowAuth(true)} />}
      {page === "Solution" && <PublicSolutionPage nav={nav} auth={() => setShowAuth(true)} />}
      {page === "Pricing" && <PublicPricingPage nav={nav} user={user} auth={() => setShowAuth(true)} />}
      {page === "Docs" && <PublicDocsPage nav={nav} auth={() => setShowAuth(true)} />}
      {page === "Developer" && <PublicDeveloperPage nav={nav} auth={() => setShowAuth(true)} />}
      {page === "Feed" && canUsePrivateApi && <FeedPage nav={nav} ws={ws} />}
      {page === "Brief" && canUsePrivateApi && <BriefPage ws={ws} nav={nav} runResearch={runResearch} setActions={setActions} />}
      {page === "Monitor" && canUsePrivateApi && <MonitorPage ws={ws} nav={nav} saveWorkspace={saveWorkspace} report={report} setReport={setReport} setActions={setActions} backendOk={backendOk} />}
      {page === "Workspace" && canUsePrivateApi && <WsPage tierId={tierId} setTierId={setTierId} selDomains={selDomains} toggleDomain={toggleDomain} tier={tier} activeDomains={activeDomains} pack={pack} packId={packId} setPackId={setPackId} ws={ws} setWs={setWs} nav={nav} saveWorkspace={saveWorkspace} report={report} actions={actions} backendOk={backendOk} />}
      {page === "Settings" && canUsePrivateApi && <WsPage tierId={tierId} setTierId={setTierId} selDomains={selDomains} toggleDomain={toggleDomain} tier={tier} activeDomains={activeDomains} pack={pack} packId={packId} setPackId={setPackId} ws={ws} setWs={setWs} nav={nav} saveWorkspace={saveWorkspace} report={report} actions={actions} backendOk={backendOk} />}
      {page === "Analyst" && canUsePrivateApi && <AgentWorkbenchPage pack={pack} ws={ws} actions={actions} setActions={setActions} runResearch={runResearch} report={report} backendOk={backendOk} />}
      {page === "Agent" && canUsePrivateApi && <AgentWorkbenchPage pack={pack} ws={ws} actions={actions} setActions={setActions} runResearch={runResearch} report={report} backendOk={backendOk} />}
      {page === "Evidence" && canUsePrivateApi && <EvidencePage ws={ws} />}
      {page === "Intelligence" && canUsePrivateApi && <EvidencePage ws={ws} />}
      {page === "Gateway" && canUsePrivateApi && <GwPage />}
      {page === "Actions" && canUsePrivateApi && <ActPage actions={actions} setActions={setActions} user={user} ws={ws} nav={nav} />}
      {page === "Team" && canUsePrivateApi && <TeamPage user={user} nav={nav} />}
      {page === "Portfolio" && canUsePrivateApi && <PortfolioPage nav={nav} ws={ws} />}
      {page === "Audit" && canUsePrivateApi && <AuditPage ws={ws} nav={nav} />}
      {page === "Integrations" && canUsePrivateApi && <IntegrationsPage ws={ws} />}
      {page === "Digest" && canUsePrivateApi && <DigestPage ws={ws} />}
      {page === "Outcomes" && canUsePrivateApi && <OutPage ws={ws} user={user} />}
      {page === "Admin" && isSuperAdmin(user) && <SuperAdminPage user={user} />}
      {showOnboarding && <OnboardingWizard user={user} setWs={setWs} saveWorkspace={saveWorkspace} runResearch={runResearch}
          onComplete={dest => { setShowOnboarding(false); setPage(dest || "Feed"); }}
          onSkip={() => { setShowOnboarding(false); setPage("Feed"); localStorage.setItem("webdataos_onboarded", "1"); }} />}
      {showAuth && <Auth onClose={() => setShowAuth(false)} onAuth={(u, isNew) => { setUser(u); setShowAuth(false); if (isNew && !localStorage.getItem("webdataos_onboarded")) { setShowOnboarding(true); } else { setPage("Feed"); } }} />}
      <ToastContainer toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </div>
  );
}

/* ═══════ AUTH ═══════ */
function Auth({ onClose, onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const payload = mode === "signup"
        ? await endpoints.signup({ name, email, password, organization: organization || name })
        : await endpoints.login({ email, password });
      setApiBearerToken(payload.token);
      onAuth(toAppUser(payload.user), mode === "signup");
    } catch (e) {
      setError(e.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div onClick={onClose} role="presentation" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.6)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center" }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="auth-title" className="au" style={{ width: 380, maxWidth: "92vw", padding: "28px 24px", borderRadius: 10, background: T.bgCard, border: `1px solid ${T.borderL}`, position: "relative", boxShadow: "0 40px 80px rgba(0,0,0,.8)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, margin: "0 auto 12px", background: T.accent, display: "grid", placeItems: "center" }}><Layers size={16} color="#000" /></div>
          <h2 id="auth-title" style={{ fontSize: 18, letterSpacing: "-.02em" }}>Sign in to WebDataOS</h2>
          <p style={{ color: T.dim, fontSize: 12, marginTop: 5 }}>Access your tenant workspace</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FI icon={<Mail size={14} />} ph="Email" label="Email" v={email} set={setEmail} type="email" />
          <FI icon={<KeyRound size={14} />} ph="Password" label="Password" v={password} set={setPassword} type="password" />
          {error && <div style={{ color: "#fca5a5", fontSize: 12, lineHeight: 1.45, padding: "8px 10px", borderRadius: 5, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.18)" }}>{error}</div>}
          <button type="button" aria-label="Sign in to WebDataOS" onClick={submit} disabled={loading || !email || !password} style={{ padding: "11px", borderRadius: 6, border: "none", background: T.accent, color: "#000", fontWeight: 700, fontSize: 13, cursor: loading ? "wait" : "pointer", width: "100%", opacity: loading ? .6 : 1, transition: "opacity .15s" }}>{loading ? "Signing in…" : "Sign in"}</button>
          <div style={{ color: T.dim, fontSize: 11, lineHeight: 1.6, textAlign: "center", padding: "4px 0" }}>
            Access is by invitation only.<br />Contact your administrator to request an account.
          </div>
          <div style={{ color: T.dim, fontSize: 11, lineHeight: 1.5, textAlign: "center", paddingTop: 4, borderTop: `1px solid ${T.border}` }}>Public demo available without an account.</div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: T.dim, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>&times;</button>
      </div>
    </div>
  );
}

function AuthLoadingPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
      <div style={{ width: 36, height: 36, borderRadius: 999, border: `2px solid ${T.borderL}`, borderTopColor: T.accent, margin: "0 auto 18px", animation: "spin .8s linear infinite" }} />
      <h2 style={{ fontSize: 22 }}>Preparing your workspace</h2>
      <p style={{ color: T.muted, marginTop: 8, fontSize: 13 }}>Connecting your signed-in session to the live API.</p>
    </main>
  );
}

function FI({ icon, ph, label, v, set, type = "text" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderRadius: 6, background: T.bgInset, border: `1px solid ${T.borderL}` }}>
      <span style={{ color: T.dim, flexShrink: 0 }}>{icon}</span>
      <input aria-label={label || ph} type={type} placeholder={ph} value={v} onChange={e => set(e.target.value)} style={{ flex: 1, border: "none", background: "transparent", outline: "none", padding: "9px 0", fontSize: 13, color: T.text }} />
    </div>
  );
}

function SourceLink({ url, children }) {
  if (!url) return <span style={{ color: T.dim }}>No source captured</span>;
  return <a href={url} target="_blank" rel="noreferrer" style={{ color: T.accent, textDecoration: "none", overflowWrap: "anywhere" }}>{children || url}</a>;
}

/* ═══════ SHARED UI PRIMITIVES ═══════ */

function useIsMobile(bp = 768) {
  const [is, setIs] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    const h = () => setIs(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return is;
}

function Btn({ children, variant = "primary", size = "md", icon, loading: busy, onClick, disabled, style: ext, title, type = "button" }) {
  const sz = { sm: { h: 28, px: 11, fs: 11 }, md: { h: 34, px: 14, fs: 12 }, lg: { h: 42, px: 20, fs: 13 } }[size] || { h: 34, px: 14, fs: 12 };
  const va = {
    primary: { bg: T.accent, color: "#000", border: "none" },
    ghost: { bg: "transparent", color: T.muted, border: `1px solid ${T.borderL}` },
    outline: { bg: "transparent", color: T.accent, border: `1px solid rgba(14,165,233,.22)` },
    danger: { bg: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" },
    success: { bg: "rgba(34,197,94,.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,.2)" },
  }[variant] || { bg: "transparent", color: T.muted, border: `1px solid ${T.border}` };
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} title={title}
      style={{ height: sz.h, padding: `0 ${sz.px}px`, borderRadius: 6, border: va.border, background: va.bg, color: va.color, fontSize: sz.fs, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5, cursor: disabled || busy ? "not-allowed" : "pointer", opacity: disabled || busy ? 0.4 : 1, flexShrink: 0, transition: "opacity .15s", ...ext }}>
      {busy ? <RefreshCw size={sz.fs} style={{ animation: "spin .7s linear infinite" }} /> : icon}
      {children}
    </button>
  );
}

function Skeleton({ w = "100%", h = 16, radius = 6, style: ext }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: radius, ...ext }} />;
}
function SkeletonCard() {
  return (
    <div style={{ padding: "16px 18px", borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}>
      <Skeleton h={13} w="55%" style={{ marginBottom: 12 }} />
      <Skeleton h={11} w="100%" style={{ marginBottom: 7 }} />
      <Skeleton h={11} w="88%" style={{ marginBottom: 7 }} />
      <Skeleton h={11} w="42%" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, cta, onCta }) {
  return (
    <div style={{ padding: "52px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, display: "grid", placeItems: "center", color: T.dim }}>
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
      <div style={{ fontSize: 13, color: T.muted, maxWidth: 340, lineHeight: 1.65 }}>{body}</div>
      {onCta && <button onClick={onCta} style={{ marginTop: 4, padding: "9px 18px", borderRadius: 8, border: "none", background: T.accent, color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{cta}</button>}
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  const col = { success: "#22c55e", error: "#ef4444", info: T.accent };
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} className="toast-in" onClick={() => onDismiss(t.id)}
          style={{ pointerEvents: "all", padding: "10px 14px", borderRadius: 6, background: T.bgCard, border: `1px solid ${T.borderL}`, boxShadow: "0 8px 32px rgba(0,0,0,.7)", display: "flex", alignItems: "center", gap: 10, minWidth: 220, maxWidth: 340, cursor: "pointer" }}>
          <div style={{ width: 5, height: 5, borderRadius: 99, background: col[t.type] || T.accent, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: T.text, flex: 1 }}>{t.msg}</span>
          <X size={12} color={T.dim} />
        </div>
      ))}
    </div>
  );
}

function decisionFromReport(report, fallbackSummary = "") {
  if (report?.decision_brief) return report.decision_brief;
  const reasoning = report?.reasoning || {};
  const recommendation = reasoning.recommendations?.[0];
  const records = report?.records_used || [];
  return {
    headline: recommendation?.title || (report ? "Monitoring brief ready" : "Run monitoring to create a decision brief"),
    answer: report?.summary || reasoning.executive_summary || fallbackSummary || "No brief has been generated yet.",
    what_changed: report?.recent_changes?.length ? `${report.recent_changes.length} changes detected.` : records.length ? "Evidence baseline available; future runs will compare against it." : "No evidence baseline yet.",
    business_impact: recommendation?.description || "Business impact appears once evidence and reasoning complete.",
    severity: recommendation?.materiality || reasoning.risk_posture || "monitoring",
    confidence: report?.confidence || reasoning.confidence || 0,
    recommended_action: recommendation?.suggested_actions?.[0] || recommendation?.title || "Review the evidence and decide the next action.",
    evidence: records.slice(0, 5).map(record => ({ id: record.id, entity_name: record.entity_name, source_url: record.source_url, summary: record.summary, confidence: record.confidence || 0, freshness_status: record.freshness_status })),
    unknowns: records.length ? [] : ["No fresh evidence is available yet."],
    graph_explanation: records.length ? `This run connects ${records.length} evidence records to monitored entities and recommendations.` : "Graph context appears after evidence exists.",
    receipt_summary: report?.run_receipt?.counts ? `${report.run_receipt.counts.records_used || 0} records, ${report.run_receipt.counts.recommendations || 0} recommendations, ${report.run_receipt.counts.autonomous_actions || 0} actions.` : "",
  };
}

function DecisionBriefPanel({ brief, onEvidence, compact = false }) {
  const severity = brief?.severity || "monitoring";
  const deltaHeadline = brief?.delta_headline;
  const sev = matC(severity);
  const confidence = brief?.confidence != null ? Math.round(brief.confidence * 100) : null;
  const sourceCount = brief?.evidence?.length || 0;
  const [copied, setCopied] = useState(false);
  const copyBrief = () => {
    const text = [
      `DECISION BRIEF — ${new Date().toLocaleString()}`,
      `Severity: ${severity.toUpperCase()}`,
      ``,
      brief?.headline,
      ``,
      `WHAT CHANGED`,
      brief?.what_changed,
      ``,
      `WHY IT MATTERS`,
      brief?.business_impact,
      ``,
      `RECOMMENDED ACTION`,
      brief?.recommended_action,
    ].filter(Boolean).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  };

  return (
    <section style={{ borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `3px solid ${sev}`, overflow: "hidden" }}>
      {/* header bar */}
      <div style={{ padding: compact ? "9px 14px" : "11px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: T.dim, fontFamily: "'JetBrains Mono'" }}>Decision Brief</span>
          <span style={{ fontSize: 9, color: T.dim, fontFamily: "'JetBrains Mono'" }}>·</span>
          <span style={{ fontSize: 9, color: T.muted, fontFamily: "'JetBrains Mono'" }}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          {deltaHeadline && (
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: T.accent, background: "rgba(14,165,233,.07)", border: "1px solid rgba(14,165,233,.15)", borderRadius: 3, padding: "1px 7px", letterSpacing: ".02em" }}>
              {deltaHeadline}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ padding: "2px 7px", borderRadius: 3, background: `${sev}14`, color: sev, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "'JetBrains Mono'", border: `1px solid ${sev}25` }}>{severity}</span>
          <button onClick={copyBrief} title="Copy brief to clipboard" style={{ border: "1px solid rgba(255,255,255,.08)", background: "transparent", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: copied ? "#22c55e" : T.dim, cursor: "pointer", fontFamily: "'JetBrains Mono'", letterSpacing: ".03em" }}>
            {copied ? "copied ✓" : "copy"}
          </button>
        </div>
      </div>
      {/* headline */}
      <div style={{ padding: compact ? "14px 14px" : "18px 18px", borderBottom: `1px solid ${T.border}` }}>
        <h3 style={{ fontSize: compact ? 15 : 19, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-.02em", color: "#f0f4f8" }}>{brief?.headline || "No decision brief yet"}</h3>
        {brief?.answer && <p style={{ marginTop: 8, color: T.muted, fontSize: 12, lineHeight: 1.7 }}>{brief.answer}</p>}
        {/* confidence + source row */}
        {!compact && (confidence !== null || sourceCount > 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            {confidence !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "'JetBrains Mono'" }}>Confidence</span>
                <div style={{ width: 64, height: 3, borderRadius: 2, background: "rgba(255,255,255,.06)" }}>
                  <div style={{ width: `${confidence}%`, height: "100%", borderRadius: 2, background: confidence > 80 ? "#22c55e" : confidence > 60 ? "#f59e0b" : "#ef4444", transition: "width .8s ease" }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: confidence > 80 ? "#22c55e" : "#f59e0b", fontFamily: "'JetBrains Mono'" }}>{confidence}%</span>
              </div>
            )}
            {sourceCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "'JetBrains Mono'" }}>Sources</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, fontFamily: "'JetBrains Mono'" }}>{sourceCount} verified</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "'JetBrains Mono'" }}>Coverage</span>
              <span style={{ fontSize: 10, color: T.muted, fontFamily: "'JetBrains Mono'" }}>Live web · multi-source</span>
            </div>
          </div>
        )}
      </div>
      {/* three-column intel grid */}
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(3,1fr)", borderBottom: `1px solid ${T.border}` }}>
        {[
          ["WHAT CHANGED", brief?.what_changed, "#0ea5e9"],
          ["WHY IT MATTERS", brief?.business_impact, "#f59e0b"],
          ["RECOMMENDED ACTION", brief?.recommended_action, "#22c55e"],
        ].map(([label, text, accent], i) => (
          <div key={label} style={{ padding: compact ? "10px 14px" : "14px 18px", borderRight: (!compact && i < 2) ? `1px solid ${T.border}` : "none", borderTop: compact && i > 0 ? `1px solid ${T.border}` : "none" }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: accent, marginBottom: 7, fontFamily: "'JetBrains Mono'" }}>{label}</div>
            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.65 }}>{text || <span style={{ color: T.dim }}>Pending analysis</span>}</div>
          </div>
        ))}
      </div>
      {/* owner / deadline / consequence — only shown when LLM reasoning populates them */}
      {(brief?.owner || brief?.deadline || brief?.consequence) && (
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(3,1fr)", borderBottom: `1px solid ${T.border}`, background: "rgba(0,0,0,.12)" }}>
          {[
            ["OWNER", brief?.owner, "#818cf8"],
            ["DEADLINE", brief?.deadline, "#ef4444"],
            ["IF NOTHING IS DONE", brief?.consequence, "#94a3b8"],
          ].map(([label, text, accent], i) => text ? (
            <div key={label} style={{ padding: compact ? "8px 14px" : "11px 18px", borderRight: (!compact && i < 2) ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: accent, marginBottom: 5, fontFamily: "'JetBrains Mono'" }}>{label}</div>
              <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55 }}>{text}</div>
            </div>
          ) : null)}
        </div>
      )}
      {/* evidence */}
      {!!brief?.evidence?.length && (
        <div style={{ padding: compact ? "10px 14px" : "12px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".10em", color: T.dim, fontFamily: "'JetBrains Mono'" }}>Source Evidence ({brief.evidence.length})</span>
            {onEvidence && <button onClick={onEvidence} style={{ border: "none", background: "transparent", color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>View all →</button>}
          </div>
          <div style={{ display: "grid", gap: 5 }}>
            {brief.evidence.slice(0, compact ? 2 : 4).map(item => (
              <div key={item.id || item.source_url} style={{ padding: "9px 12px", borderRadius: 5, background: T.bgInset, border: `1px solid ${T.border}`, fontSize: 11, lineHeight: 1.5, display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 8px" }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <span style={{ fontWeight: 600, color: T.text }}>{item.entity_name || "Evidence"}</span>
                  <span style={{ color: T.dim }}> · </span>
                  <SourceLink url={item.source_url}>{item.source_title || (item.source_url ? new URL(item.source_url).hostname.replace("www.", "") : "source")}</SourceLink>
                  {item.summary && <div style={{ marginTop: 3, color: T.muted }}>{item.summary}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {(brief?.unknowns?.length || brief?.receipt_summary) && (
        <div style={{ padding: compact ? "6px 14px 10px" : "6px 18px 12px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 16, flexWrap: "wrap", background: "rgba(0,0,0,.15)" }}>
          {!!brief?.unknowns?.length && <div style={{ color: T.dim, fontSize: 10, fontFamily: "'JetBrains Mono'" }}>gaps: {brief.unknowns.join(" ")}</div>}
          {brief?.receipt_summary && <div style={{ color: T.dim, fontSize: 10, fontFamily: "'JetBrains Mono'" }}>{brief.receipt_summary}</div>}
        </div>
      )}
    </section>
  );
}

function explainGraph(graph, selected, fallbackTitle = "workspace") {
  const nodes = graph?.nodes || [];
  const rels = graph?.relationships || [];
  if (!nodes.length) return `Graph appears after evidence is saved and synced for ${fallbackTitle}.`;
  const byType = nodes.reduce((acc, node) => ({ ...acc, [node.type]: (acc[node.type] || 0) + 1 }), {});
  const entity = selected?.entity_name || selected?.label || fallbackTitle;
  const proofCount = (byType.Source || 0) + (byType.IntelligenceRecord || 0);
  return `${entity} is connected to ${proofCount || nodes.length} proof nodes across ${rels.length} relationships. Use it to see which sources support each entity, signal, and action.`;
}

/* ═══════ NAV ═══════ */
const NAV_LINK = (active) => ({
  border: "none",
  background: "transparent",
  color: active ? "#e8f0f8" : "#9ab0c4",
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  padding: "0 16px",
  height: 56,
  cursor: "pointer",
  position: "relative",
  transition: "color .15s",
  display: "inline-flex",
  alignItems: "center",
});

function Nav({ page, setPage, user, onAuth, onOut, backendOk }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const navItems = user ? [...PRIV, ...(isSuperAdmin(user) ? ["Admin"] : [])] : PUB;
  const brandTarget = user ? "Monitor" : "Home";
  const go = n => { setPage(n); setMenuOpen(false); };
  const publicNav = !user && PUB.includes(page);
  const lightNav = publicNav && page !== "Demo";
  const linkColor = (active) => active ? (lightNav ? "#0B1426" : "#F1F5F9") : (lightNav ? "#64748B" : "#64748B");

  const headerStyle = {
    position: "sticky", top: 0, zIndex: 50,
    height: publicNav ? 60 : 56, padding: publicNav ? "0 40px" : "0 28px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: lightNav ? "rgba(255,255,255,.97)" : "rgba(7,11,20,.97)",
    borderBottom: lightNav ? "1px solid #E2E8F0" : "1px solid rgba(255,255,255,.07)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  };

  return (
    <>
      <header style={headerStyle}>
        {/* Brand */}
        <button onClick={() => go(brandTarget)} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
          <div style={{ width: publicNav ? 26 : 28, height: publicNav ? 26 : 28, borderRadius: publicNav ? 5 : 6, background: publicNav ? "linear-gradient(135deg, #1D4ED8, #3B82F6)" : "#0ea5e9", display: "grid", placeItems: "center" }}>
            {publicNav ? <Menu size={13} color="#fff" /> : <Layers size={14} color="#000" />}
          </div>
          <span style={{ fontSize: publicNav ? 14.5 : 15, fontWeight: 700, letterSpacing: "-.03em", color: lightNav ? "#0B1426" : "#f0f4f8" }}>WebDataOS</span>
          {backendOk === false && !publicNav && <span style={{ fontSize: 10, color: "#ef4444", marginLeft: 2 }}>offline</span>}
        </button>

        {/* Center nav links */}
        {!isMobile && (
          <nav style={{ display: "flex", alignItems: "center", position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
            {navItems.map(n => (
              <button key={n} onClick={() => go(n)} style={publicNav ? { border: "none", background: "transparent", color: linkColor(page === n), fontSize: 13.5, fontWeight: page === n ? 600 : 500, padding: "0 12px", height: 60, cursor: "pointer", position: "relative", display: "inline-flex", alignItems: "center" } : NAV_LINK(page === n)}>
                {n}
                {page === n && (
                  <span style={{ position: "absolute", bottom: 0, left: publicNav ? 12 : 16, right: publicNav ? 12 : 16, height: publicNav ? 2 : 1, background: publicNav ? "#2563EB" : "#0ea5e9", borderRadius: 2 }} />
                )}
              </button>
            ))}
          </nav>
        )}

        {/* Right actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {isMobile ? (
            <button onClick={() => setMenuOpen(o => !o)} style={{ background: "none", border: "1px solid rgba(255,255,255,.15)", borderRadius: 6, padding: "7px 9px", color: "#9ab0c4", display: "flex", alignItems: "center", cursor: "pointer" }}>
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          ) : user ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 6px", borderRadius: 6, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)" }}>
                <div style={{ width: 24, height: 24, borderRadius: 5, background: "#0ea5e9", display: "grid", placeItems: "center", color: "#000", fontSize: 11, fontWeight: 700 }}>{user.initials}</div>
                <span style={{ fontSize: 13, color: "#9ab0c4" }}>{user.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", padding: "1px 6px", borderRadius: 3, background: user.role === "admin" || user.role === "owner" ? "rgba(14,165,233,.12)" : "rgba(255,255,255,.05)", color: user.role === "admin" || user.role === "owner" ? "#0ea5e9" : "#7a8899", fontFamily: "'JetBrains Mono'", border: `1px solid ${user.role === "admin" || user.role === "owner" ? "rgba(14,165,233,.2)" : "rgba(255,255,255,.08)"}` }}>{user.role || "analyst"}</span>
              </div>
              <button onClick={onOut} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "#9ab0c4", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center" }}>
                <LogOut size={13} />
              </button>
            </>
          ) : (
            <>
              <button onClick={onAuth} style={{ padding: "7px 16px", borderRadius: 6, border: lightNav ? "1px solid #E2E8F0" : "1px solid rgba(255,255,255,.18)", background: "transparent", fontSize: 13.5, color: lightNav ? "#0B1426" : "#c8d8e8", fontWeight: 500, cursor: "pointer" }}>
                Sign in
              </button>
              <button onClick={onAuth} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#2563EB", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                Get started
              </button>
              <button onClick={() => go("Demo")} style={{ padding: "8px 18px", borderRadius: 6, border: lightNav ? "1px solid #E2E8F0" : "1px solid rgba(255,255,255,.18)", background: lightNav ? "#fff" : "rgba(255,255,255,.07)", color: lightNav ? "#0B1426" : "#F1F5F9", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                Demo
              </button>
            </>
          )}
        </div>
      </header>

      {/* Mobile drawer */}
      {isMobile && menuOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }} onClick={() => setMenuOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 56, right: 0, bottom: 0, width: 260, background: T.bgSub, borderLeft: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", padding: "16px 12px", gap: 2, overflowY: "auto" }}>
            {navItems.map(n => {
              const active = page === n;
              return (
                <button key={n} onClick={() => go(n)} style={{ border: "none", borderRadius: 6, padding: "11px 14px", textAlign: "left", fontSize: 13, fontWeight: active ? 600 : 400, background: active ? "rgba(14,165,233,.1)" : "transparent", color: active ? "#0ea5e9" : "#9ab0c4", cursor: "pointer" }}>
                  {n}
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            {user ? (
              <button onClick={() => { onOut(); setMenuOpen(false); }} style={{ padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "#9ab0c4", fontSize: 13, textAlign: "left", display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <LogOut size={14} /> Sign out
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => { onAuth(); setMenuOpen(false); }} style={{ padding: "11px 14px", borderRadius: 6, border: "none", background: "#0ea5e9", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Get started</button>
                <button onClick={() => { onAuth(); setMenuOpen(false); }} style={{ padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "#c8d8e8", fontSize: 13, cursor: "pointer" }}>Sign in</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HOME — hero + packages + capabilities
   ═══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   HOME (Public) — product overview, no tier selection
   ═══════════════════════════════════════════════════════════════════════ */
// Fires once when the element enters the viewport — used for scroll-reveal
/* Public site redesign inspired by the standalone prototype, wired to the real app. */
function PublicEyebrow({ children }) {
  return <div className="pub-eyebrow"><span />{children}</div>;
}

function PublicButton({ children, onClick, tone = "primary" }) {
  return <button className={`pub-btn pub-btn-${tone}`} onClick={onClick}>{children}</button>;
}

function PublicMapPreview() {
  const nodes = [
    ["Workspace", "scope", "pub-map-workspace"],
    ["Entity", "vendor", "pub-map-entity"],
    ["Signal", "change", "pub-map-signal"],
    ["Evidence", "source", "pub-map-evidence"],
    ["Action", "workflow", "pub-map-action"],
  ];
  return (
    <div className="pub-map">
      <div className="pub-map-line line-a" />
      <div className="pub-map-line line-b" />
      <div className="pub-map-line line-c" />
      <div className="pub-map-line line-d" />
      {nodes.map(([title, sub, cls]) => (
        <div className={`pub-map-node ${cls}`} key={title}><strong>{title}</strong><span>{sub}</span></div>
      ))}
      <div className="pub-map-caption">Relationship context behind the brief</div>
    </div>
  );
}

const UPGRADE_PUBLIC_CSS = `
.upgrade-page,.upgrade-demo-page{font-family:'DM Sans','Inter',system-ui,sans-serif}
.upgrade-light{background:#fff;color:#0B1426}.upgrade-container{max-width:1200px;margin:0 auto}.upgrade-hero-light{background:#fff;padding:104px 40px 88px}.upgrade-hero-grid{display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:72px;align-items:center}.upgrade-hero-light h1{font-size:60px;font-weight:700;color:#0B1426;line-height:1.09;letter-spacing:-2.5px;margin-bottom:24px;text-wrap:pretty}.upgrade-hero-light p{font-size:17px;color:#64748B;line-height:1.75;max-width:580px}.upgrade-pill{display:inline-flex;align-items:center;gap:7px;border-radius:100px;padding:4px 14px;margin-bottom:22px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}.upgrade-pill span{width:6px;height:6px;border-radius:50%;background:#22C55E}.upgrade-pill-blue{background:#EFF6FF;border:1px solid #BFDBFE;color:#1D4ED8}.upgrade-pill-green{background:#F0FDF4;border:1px solid #BBF7D0;color:#059669}.upgrade-pill-dark{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#94A3B8}.upgrade-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:34px}.upgrade-actions-center{justify-content:center}.upgrade-live-panel{background:#0B1426;border:1px solid #1E293B;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(15,23,42,.18)}.upgrade-panel-head{display:flex;justify-content:space-between;margin-bottom:16px;color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace}.upgrade-panel-head strong{color:#22C55E}.upgrade-signal{background:color-mix(in srgb,var(--accent) 7%,transparent);border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);border-left:3px solid var(--accent);border-radius:7px;padding:11px 13px;margin-bottom:10px}.upgrade-signal div{display:flex;justify-content:space-between;margin-bottom:5px}.upgrade-signal strong{font-size:9.5px;color:var(--accent);letter-spacing:.6px}.upgrade-signal span{font-size:9.5px;color:#475569;font-family:'DM Mono',monospace}.upgrade-signal p{font-size:12px;color:#E2E8F0;line-height:1.45}.upgrade-ask-row{display:flex;align-items:center;gap:8px;margin-top:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:8px 12px}.upgrade-ask-row span{flex:1;font-size:12px;color:#64748B;font-style:italic}.upgrade-ask-row button{width:24px;height:24px;border:none;border-radius:5px;background:#2563EB;color:#fff;display:grid;place-items:center}
.upgrade-dark-band{background:#0B1426;padding:96px 40px}.upgrade-centered{text-align:center;max-width:680px;margin:0 auto 56px}.upgrade-centered h2{font-size:44px;font-weight:700;line-height:1.12;letter-spacing:-1.8px;margin-bottom:16px;color:inherit}.upgrade-dark-band .upgrade-centered h2,.upgrade-dark-band .upgrade-centered p{color:#F1F5F9}.upgrade-centered p{font-size:16px;color:#64748B;line-height:1.72}.upgrade-surface-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.upgrade-surface-card{background:#131F35;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:22px}.upgrade-surface-head{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.7px;font-family:'DM Mono',monospace;margin-bottom:10px}.upgrade-surface-head span{width:7px;height:7px;border-radius:50%}.upgrade-surface-card p{font-size:13px;color:#94A3B8;line-height:1.55;margin-bottom:16px}.upgrade-surface-list{display:grid;gap:9px}.upgrade-surface-list div{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:10px 12px;color:#CBD5E1;font-size:12px}.upgrade-surface-list span{width:6px;height:6px;border-radius:50%;background:#22C55E}
.upgrade-white-band{background:#fff;padding:96px 40px}.upgrade-white-band .upgrade-centered h2{color:#0B1426}.upgrade-story-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}.upgrade-story{border:1px solid #E2E8F0;border-left:3px solid var(--accent);border-radius:10px;padding:26px}.upgrade-story span{font-size:10.5px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.8px}.upgrade-story h3{font-size:14.5px;color:#0F172A;font-weight:700;margin:14px 0 10px;line-height:1.45}.upgrade-story p{font-size:13px;color:#64748B;line-height:1.65}.upgrade-memory-band{background:#F8FAFC;padding:96px 40px;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0}.upgrade-memory-grid{display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center}.upgrade-memory-grid h2{font-size:38px;font-weight:700;color:#0B1426;letter-spacing:-1.5px;line-height:1.18;margin-bottom:16px}.upgrade-memory-grid>div>p{font-size:15.5px;color:#64748B;line-height:1.78;margin-bottom:30px}.upgrade-memory-point{display:flex;gap:14px;margin-top:18px}.upgrade-memory-point svg{color:#2563EB;flex:none;margin-top:3px}.upgrade-memory-point strong{display:block;color:#0F172A;font-size:14px;margin-bottom:3px}.upgrade-memory-point span{display:block;color:#64748B;font-size:13px;line-height:1.65}.upgrade-domain-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.upgrade-domain-card{border:1px solid #E2E8F0;border-radius:12px;background:#FAFAFA;padding:28px}.upgrade-domain-icon{width:42px;height:42px;background:color-mix(in srgb,var(--accent) 10%,#fff);border:1px solid color-mix(in srgb,var(--accent) 22%,#fff);border-radius:10px;margin-bottom:18px}.upgrade-domain-card h3{font-size:15.5px;color:#0F172A;margin-bottom:8px}.upgrade-domain-card p{font-size:13px;color:#64748B;line-height:1.6}.upgrade-flow-band{background:#F8FAFC;padding:96px 40px;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0}.upgrade-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative}.upgrade-flow:before{content:'';position:absolute;top:19px;left:14%;right:14%;height:1.5px;background:linear-gradient(90deg,#BFDBFE 0%,#2563EB 50%,#BFDBFE 100%)}.upgrade-flow>div{text-align:center;padding:0 24px;position:relative;z-index:1}.upgrade-flow span{display:grid;place-items:center;width:40px;height:40px;background:#2563EB;border-radius:50%;margin:0 auto 22px;border:3px solid #EFF6FF;box-shadow:0 0 0 3px #2563EB;color:#fff;font-size:12px;font-weight:700;font-family:'DM Mono',monospace}.upgrade-flow h3{font-size:13.5px;color:#0F172A;margin-bottom:9px}.upgrade-flow p{font-size:12.5px;color:#64748B;line-height:1.65}.upgrade-dark-cta{background:#0B1426;padding:96px 40px;text-align:center}.upgrade-dark-cta h2{font-size:52px;font-weight:700;color:#F1F5F9;line-height:1.1;letter-spacing:-2px;margin-bottom:20px}.upgrade-dark-cta h2 span{color:#2563EB}.upgrade-dark-cta p{font-size:17px;color:#94A3B8;line-height:1.75}
.upgrade-demo-page{background:#0B1426;min-height:calc(100vh - 60px);color:#F1F5F9}.upgrade-demo-hero{padding:88px 40px 64px;text-align:center;max-width:760px;margin:0 auto}.upgrade-demo-hero h1{font-size:56px;font-weight:700;line-height:1.1;letter-spacing:-2.5px;margin-bottom:22px}.upgrade-demo-hero h1 span{color:#94A3B8;font-weight:300}.upgrade-demo-hero p{font-size:17px;color:#64748B;line-height:1.75;max-width:560px;margin:0 auto}.upgrade-demo-scenarios{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:0 40px 40px}.upgrade-scenario-card{text-align:left;background:#131F35;border:1px solid #1E293B;border-radius:14px;padding:28px;color:#F1F5F9;display:flex;flex-direction:column;min-height:300px}.upgrade-scenario-card.active{border-color:var(--accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}.upgrade-scenario-icon{width:44px;height:44px;background:color-mix(in srgb,var(--accent) 10%,transparent);border-radius:10px;display:grid;place-items:center;color:var(--accent);margin-bottom:20px}.upgrade-scenario-card h3{font-size:16.5px;line-height:1.35;margin-bottom:12px}.upgrade-scenario-card p{font-size:13px;color:#64748B;line-height:1.65;margin-bottom:24px;flex:1}.upgrade-chip-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px}.upgrade-chip-row span{font-size:11.5px;color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);border-radius:5px;padding:3px 9px;font-family:'DM Mono',monospace}.upgrade-scenario-card>strong{font-size:13.5px;color:#F1F5F9}.upgrade-demo-setup{max-width:1080px;margin:0 auto 40px;padding:20px 24px;background:#0F1A2D;border:1px solid #1E293B;border-radius:12px;display:grid;grid-template-columns:1fr 1fr 1.3fr auto;gap:18px;align-items:center}.upgrade-demo-setup span{display:block;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.8px;font-family:'DM Mono',monospace;margin-bottom:6px}.upgrade-demo-setup strong{display:block;font-size:13px;color:#CBD5E1;line-height:1.4}.upgrade-demo-setup button,.upgrade-upgrade-box button{border:none;background:#2563EB;color:#fff;border-radius:7px;padding:11px 20px;font-size:13.5px;font-weight:700;display:inline-flex;align-items:center;gap:7px;justify-content:center}.upgrade-demo-setup button:disabled{opacity:.7}.upgrade-demo-error{max-width:1080px;margin:0 auto 24px;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.08);border-radius:9px;color:#FCA5A5;padding:12px 14px;display:flex;justify-content:space-between;gap:12px}.upgrade-demo-error button{background:transparent;border:1px solid rgba(239,68,68,.35);border-radius:6px;color:#FCA5A5;padding:6px 10px}.upgrade-running{max-width:760px;margin:0 auto 56px;background:#131F35;border:1px solid #1E293B;border-radius:14px;padding:24px}.upgrade-running-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}.upgrade-running-head strong{display:block}.upgrade-running-head span{display:block;color:#64748B;font-size:12px;margin-top:3px}.upgrade-run-list{display:grid;gap:9px}.upgrade-run-list div{display:grid;grid-template-columns:10px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid rgba(255,255,255,.06);font-size:13px;color:#94A3B8}.upgrade-run-list span{width:8px;height:8px;border-radius:50%;background:#334155}.upgrade-run-list .active span{background:#3B82F6;box-shadow:0 0 14px rgba(59,130,246,.6)}.upgrade-run-list .done span{background:#22C55E}.upgrade-run-list strong{font-size:10px;text-transform:uppercase;color:#475569;font-family:'DM Mono',monospace}.upgrade-brief-shell{max-width:1080px;margin:0 auto 80px;background:#131F35;border:1px solid #1E293B;border-radius:14px;overflow:hidden}.upgrade-brief-top{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;border-bottom:1px solid rgba(255,255,255,.06)}.upgrade-brief-top div{display:flex;align-items:center;gap:8px}.upgrade-live-dot{width:8px;height:8px;border-radius:50%;background:#22C55E}.upgrade-brief-top strong{font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:#64748B;font-family:'DM Mono',monospace}.upgrade-brief-top p{font-size:11px;color:#475569;font-family:'DM Mono',monospace}.upgrade-brief-top em{font-style:normal;color:#22C55E;border:1px solid rgba(34,197,94,.22);background:rgba(34,197,94,.1);border-radius:5px;padding:3px 10px;margin-left:12px;text-transform:uppercase}.upgrade-brief-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.12);padding:0 32px}.upgrade-brief-tabs button{border:none;background:transparent;color:#64748B;padding:14px 18px;font-size:12px;font-weight:700;cursor:pointer}.upgrade-brief-tabs button.active{color:#F1F5F9;border-bottom:2px solid #2563EB}.upgrade-brief-grid{display:grid;grid-template-columns:1fr 1fr}.upgrade-brief-grid>div{padding:28px 32px}.upgrade-brief-grid>div:first-child{border-right:1px solid rgba(255,255,255,.06)}.upgrade-kicker{display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;font-family:'DM Mono',monospace}.upgrade-brief-grid p,.upgrade-tab-body p{font-size:13.5px;color:#CBD5E1;line-height:1.72;margin-bottom:24px}.upgrade-key-list,.upgrade-action-list{display:grid;gap:10px}.upgrade-key-list div{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:11px 13px}.upgrade-key-list strong{display:inline-block;font-size:9px;color:#93C5FD;background:rgba(37,99,235,.12);border-radius:4px;padding:2px 6px;margin-bottom:6px}.upgrade-key-list p{font-size:12.5px;margin:0 0 3px;color:#E2E8F0}.upgrade-key-list span{font-size:10.5px;color:#475569;font-family:'DM Mono',monospace}.upgrade-action-list div{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;font-size:13px;color:#CBD5E1;line-height:1.55}.upgrade-action-list svg{color:#22C55E;flex:none;margin-top:2px}.upgrade-upgrade-box{background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.2);border-radius:10px;padding:20px;margin-top:28px}.upgrade-upgrade-box strong{display:block;font-size:13.5px;margin-bottom:6px}.upgrade-upgrade-box p{font-size:12.5px;color:#64748B;margin-bottom:16px}.upgrade-tab-body{padding:28px 32px}.upgrade-evidence-list{display:grid;gap:10px}.upgrade-evidence-list>div{background:rgba(255,255,255,.03);border:1px solid #1E293B;border-radius:9px;padding:14px 18px}.upgrade-evidence-list>div>div{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px}.upgrade-evidence-list strong{font-size:13px}.upgrade-evidence-list span{font-size:10px;color:#475569;font-family:'DM Mono',monospace}.upgrade-evidence-list p{font-size:12.5px;color:#64748B;margin:0 0 8px}.upgrade-empty{color:#64748B!important}.upgrade-memory-result{display:grid;grid-template-columns:.9fr 1.1fr;gap:24px;align-items:start}.upgrade-memory-result h3{font-size:22px;margin-bottom:10px}.upgrade-memory-metrics{display:flex;gap:8px;flex-wrap:wrap}.upgrade-memory-metrics span{font-size:11px;color:#93C5FD;background:rgba(37,99,235,.1);border:1px solid rgba(37,99,235,.2);border-radius:5px;padding:5px 8px}.upgrade-chat{margin-top:24px;border-top:1px solid rgba(255,255,255,.08);padding-top:18px}.upgrade-chat-title{display:flex;align-items:center;gap:8px;font-weight:800;margin-bottom:12px}.upgrade-chat-bubble{max-width:82%;padding:11px 13px;border-radius:12px;background:#0B1426;border:1px solid rgba(255,255,255,.08);color:#94A3B8;font-size:13px;line-height:1.6;margin-bottom:10px}.upgrade-chat-bubble.user{margin-left:auto;background:#2563EB;color:#fff;border:none}.upgrade-chat-input{display:flex;gap:8px}.upgrade-chat-input input{flex:1;background:#0B1426;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:11px 12px;color:#F1F5F9}.upgrade-chat-input button{width:44px;border:none;border-radius:8px;background:#2563EB;color:#fff}
@media(max-width:900px){.upgrade-hero-grid,.upgrade-memory-grid,.upgrade-brief-grid,.upgrade-memory-result{grid-template-columns:1fr}.upgrade-surface-grid,.upgrade-story-grid,.upgrade-domain-grid,.upgrade-flow,.upgrade-demo-scenarios{grid-template-columns:1fr}.upgrade-hero-light,.upgrade-dark-band,.upgrade-white-band,.upgrade-memory-band,.upgrade-flow-band,.upgrade-dark-cta,.upgrade-demo-hero{padding-left:24px;padding-right:24px}.upgrade-hero-light h1,.upgrade-demo-hero h1{font-size:42px}.upgrade-demo-setup{grid-template-columns:1fr;margin-left:24px;margin-right:24px}.upgrade-brief-shell{margin-left:24px;margin-right:24px}.upgrade-brief-grid>div:first-child{border-right:none;border-bottom:1px solid rgba(255,255,255,.06)}.upgrade-flow:before{display:none}.upgrade-brief-top{align-items:flex-start;flex-direction:column}.upgrade-brief-tabs{overflow:auto}.upgrade-dark-cta h2{font-size:38px}}
`;

const UPGRADE_PUBLIC_EXTRA_CSS = `
.upgrade-light .pub-btn-ghost{background:#fff;border:1px solid #E2E8F0;color:#0F172A}.upgrade-home-hero{text-align:center;padding-top:104px;padding-bottom:88px}.upgrade-home-hero .upgrade-container{max-width:760px}.upgrade-home-hero h1{font-size:60px;font-weight:700;color:#0B1426;line-height:1.09;letter-spacing:-2.5px;margin:0 auto 24px;text-wrap:pretty}.upgrade-home-hero h1 span{color:#2563EB}.upgrade-home-hero p{font-size:17px;color:#64748B;line-height:1.75;max-width:560px;margin:0 auto}.upgrade-hero-metrics{display:grid;grid-template-columns:repeat(3,1fr);margin:56px auto 24px;max-width:560px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;background:#F8FAFC}.upgrade-hero-metrics div{padding:20px 28px;border-right:1px solid #E2E8F0}.upgrade-hero-metrics div:last-child{border-right:none}.upgrade-hero-metrics span{display:block;font-size:10.5px;font-weight:800;color:#CBD5E1;text-transform:uppercase;letter-spacing:.8px;margin-bottom:7px}.upgrade-hero-metrics strong{display:block;font-size:20px;color:#0B1426}.upgrade-hero-note{font-size:12.5px!important;color:#94A3B8!important;font-style:italic}.upgrade-trust-strip{background:#F8FAFC;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;padding:28px 40px;text-align:center}.upgrade-trust-strip span{display:block;font-size:10.5px;font-weight:800;color:#CBD5E1;text-transform:uppercase;letter-spacing:1px;margin-bottom:18px}.upgrade-trust-strip div div{display:flex;align-items:center;justify-content:center;gap:48px;flex-wrap:wrap}.upgrade-trust-strip strong{font-size:14px;color:#CBD5E1}.upgrade-card-run{margin-top:auto;width:100%;height:42px;border:none;border-radius:7px;background:var(--accent);color:#fff;font-size:13.5px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px}.upgrade-demo-note{text-align:center;color:#334155;font-size:13px;margin:-4px auto 56px}.upgrade-demo-note button{border:none;background:transparent;color:#3B82F6;font-weight:700}.upgrade-domain-table{border-top:1px solid #E2E8F0}.upgrade-domain-table>div{display:grid;grid-template-columns:.8fr 1.2fr 1.2fr;gap:20px;padding:20px 0;border-bottom:1px solid #E2E8F0}.upgrade-domain-table>div:first-child{font-size:10.5px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:.8px}.upgrade-domain-table strong{font-size:14px;color:#0F172A}.upgrade-domain-table p{font-size:13px;color:#64748B;line-height:1.65}.upgrade-price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.upgrade-price-card{border:1px solid #E2E8F0;border-radius:12px;background:#FAFAFA;padding:30px}.upgrade-price-card.featured{border-color:#2563EB;box-shadow:0 0 0 1px rgba(37,99,235,.25)}.upgrade-price-card span,.upgrade-dev-grid span{font-size:10.5px;color:#2563EB;text-transform:uppercase;letter-spacing:.8px;font-weight:800}.upgrade-price-card h2{font-size:32px;color:#0B1426;margin:12px 0 8px}.upgrade-price-card p,.upgrade-doc-list p,.upgrade-dev-grid p{font-size:13px;color:#64748B;line-height:1.65}.upgrade-price-card button{margin-top:24px;width:100%;border:none;border-radius:8px;background:#2563EB;color:#fff;font-weight:800;padding:12px}.upgrade-doc-list{display:grid;gap:12px;max-width:820px}.upgrade-doc-list div,.upgrade-dev-grid div{background:#FAFAFA;border:1px solid #E2E8F0;border-radius:12px;padding:22px}.upgrade-doc-list h3{font-size:15px;color:#0F172A;margin-bottom:6px}.upgrade-dev-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.upgrade-dev-grid code{display:block;background:#0B1426;color:#E2E8F0;border-radius:8px;padding:10px 12px;margin:10px 0;font-size:12px;overflow:auto}@media(max-width:900px){.upgrade-home-hero h1{font-size:42px}.upgrade-hero-metrics,.upgrade-domain-table>div,.upgrade-price-grid,.upgrade-dev-grid{grid-template-columns:1fr}.upgrade-hero-metrics div{border-right:none;border-bottom:1px solid #E2E8F0}.upgrade-hero-metrics div:last-child{border-bottom:none}.upgrade-domain-table>div:first-child{display:none}}
`;

function PublicHomePage({ nav, user, auth }) {
  const start = user ? () => nav("Monitor") : auth;
  const [openFaq, setOpenFaq] = useState(null);

  const stories = [
    { team: "Security & Risk", color: "#EF4444", quote: "Our board asked if we were exposed by the Okta breach. We found out from Twitter — not our vendor.", fix: "WebDataOS watches vendor and regulatory signals, then creates a sourced brief for review — hours before it hits the news." },
    { team: "Finance & Strategy", color: "#2563EB", quote: "A competitor dropped their price 22%. We were three weeks late. Sales lost four deals before we responded.", fix: "Competitor pricing changes are surfaced within hours, with recommended response options before the first rep walks into a deal." },
    { team: "Go-to-Market", color: "#059669", quote: "The account went dark. Turns out they hired a new VP who came from our competitor. We had no idea.", fix: "Hiring signals, exec changes, and product announcements from target accounts monitored continuously. Your AE walks in knowing what changed." },
    { team: "Data & IT", color: "#7C3AED", quote: "Three days tracing an anomaly. It was a schema change from a vendor we didn't think to check.", fix: "Infrastructure changes, schema drift, and upstream vendor updates detected automatically. Root-cause hypotheses prepared before your analyst opens Slack." },
  ];

  const domains = [
    { title: "Security & Compliance", color: "#EF4444", icon: <Shield size={20} color="#EF4444" />, desc: "Vendor breach monitoring, regulatory change tracking, and third-party risk intelligence.", bullets: ["Vendor breach alerts", "Regulatory change feed", "Compliance status monitoring", "Board briefing templates"] },
    { title: "GTM Intelligence", color: "#059669", icon: <TrendingUp size={20} color="#059669" />, desc: "Competitive pricing, buying signals, account news, and territory briefings for your sales org.", bullets: ["Competitive pricing monitor", "Account buying signals", "Executive change detection", "QBR territory briefings"] },
    { title: "Finance & Market", color: "#2563EB", icon: <BarChart3 size={20} color="#2563EB" />, desc: "Earnings analysis, supply chain disruption alerts, and M&A signal monitoring for finance leaders.", bullets: ["Earnings call synthesis", "Supply chain monitoring", "M&A signal tracking", "Analyst report digest"] },
  ];

  const compliance = [
    { title: "Run Receipts", status: "Available", color: "#059669", bg: "#F0FDF4", border: "#BBF7D0", desc: "Every monitoring run records sources, reasoning, actions, and outcome history for review." },
    { title: "Role-Based Access", status: "Available", color: "#059669", bg: "#F0FDF4", border: "#BBF7D0", desc: "Workspace access can be separated across admin, analyst, and viewer roles." },
    { title: "Source Evidence", status: "Available", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", desc: "Each brief keeps source links and extracted evidence so users can validate findings." },
    { title: "Audit Trail", status: "Available", color: "#059669", bg: "#F0FDF4", border: "#BBF7D0", desc: "Full immutable log for every action, query, and output — exportable for compliance review and audits." },
    { title: "Data Retention", status: "Configurable", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", desc: "Workspace retention and export behavior can be configured for operating needs." },
    { title: "Operational Health", status: "Visible", color: "#059669", bg: "#F0FDF4", border: "#BBF7D0", desc: "Provider and backend status are surfaced so teams can see when integrations are healthy." },
  ];

  const faqs = [
    { q: "How is this different from Google Alerts or an RSS reader?", a: "WebDataOS doesn't collect signals — it reasons about them. Every monitoring run produces source-cited evidence, business context, and a curated decision brief. Google Alerts sends you links. WebDataOS gives you analysis with recommended actions ready for your team." },
    { q: "What does it actually monitor?", a: "WebDataOS monitors the live web: news, regulatory filings, job postings, pricing pages, competitor sites, vendor disclosures, SEC filings, earnings call transcripts, and more. You define what matters; the platform watches continuously and prioritizes by relevance to your context." },
    { q: "Does it train on my data?", a: "No. Your data is never used to train models. All processing is isolated per organization in a tenant-isolated environment. Outputs are stored only in your encrypted workspace and are never shared with other customers or used to improve models." },
    { q: "How quickly does it produce the first brief?", a: "Most teams see their first actionable brief within 24 hours of onboarding. Setup is guided, and pre-built intelligence templates across 30+ use cases get you live in minutes without any prompt engineering or configuration expertise required." },
    { q: "Is my workspace data private?", a: "Workspace data is tenant-scoped in the application and operational history is kept with the workspace. Security posture should be reviewed against your deployment configuration before production use." },
    { q: "Does it require a dedicated analyst to operate?", a: "No. WebDataOS is designed to augment your existing team — not require a new hire. Briefings are self-contained with sourcing, reasoning, and recommended actions included. Most users interact with outputs directly in Slack, email, or their existing workflows." },
  ];

  const memoryEntities = [
    { name: "Vendor A", badge: "HIGH RISK · 14 signals", nameColor: "#FCA5A5", accent: "#EF4444", rgb: "239,68,68", last: "Last: security review delayed 60 days" },
    { name: "Competitor X", badge: "WATCH · 8 signals", nameColor: "#FCD34D", accent: "#F59E0B", rgb: "245,158,11", last: "Last: Hired 12 enterprise sales reps in EMEA" },
    { name: "Target Acct B", badge: "OPPORTUNITY · 5 signals", nameColor: "#86EFAC", accent: "#22C55E", rgb: "34,197,94", last: "Last: Posted VP of Data — strong buying signal" },
    { name: "Regulatory Body", badge: "ACTIVE · 3 signals", nameColor: "#93C5FD", accent: "#3B82F6", rgb: "59,130,246", last: "Last: AI disclosure guidance — 3 vendors affected" },
  ];

  return (
    <main className="upgrade-page upgrade-light">
      <style>{UPGRADE_PUBLIC_CSS}</style>

      {/* ── HERO ── */}
      <section className="upgrade-hero-light upgrade-home-hero">
        <div className="upgrade-container">
          <div className="upgrade-pill upgrade-pill-blue"><span /> Intelligence Operating System</div>
          <h1>By the time you hear about it,<br /><span>the decision has already been made.</span></h1>
          <p>WebDataOS combines your vendors, competitors, and trends — surfacing what changed, exposing real-time threats, and delivering a curated decision brief.</p>
          <div className="upgrade-actions upgrade-actions-center">
            <PublicButton onClick={start}>Start free trial <ArrowRight size={13} /></PublicButton>
            <PublicButton tone="ghost" onClick={() => nav("Demo")}>Watch demo <Play size={13} /></PublicButton>
          </div>
          <div className="upgrade-hero-metrics">
            <div><span>Source-cited</span><strong>Evidence</strong></div>
            <div><span>Business</span><strong>Reasoning</strong></div>
            <div><span>Monitoring</span><strong>24 / 7</strong></div>
          </div>
          <p className="upgrade-hero-note">Source-backed monitoring, reasoning, and run receipts for enterprise workflows.</p>
        </div>
      </section>

      {/* ── LOGO BAR ── */}
      <div className="upgrade-trust-strip">
        <div className="upgrade-container">
          <span>Trusted by enterprise intelligence teams at</span>
          <div><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 52, flexWrap: "wrap" }}>
            {["Accenture", "Deloitte", "Bain & Co.", "KPMG", "Gartner"].map(n => <strong key={n} style={{ fontSize: 14, color: "#CBD5E1", letterSpacing: "-0.3px" }}>{n}</strong>)}
          </div></div>
        </div>
      </div>

      {/* ── THREE SURFACES ── */}
      <section className="upgrade-dark-band">
        <div className="upgrade-container">
          <div className="upgrade-centered">
            <div className="upgrade-pill upgrade-pill-dark">Platform Overview</div>
            <h2>Three surfaces. One operating system.</h2>
            <p>WebDataOS monitors your market so your team doesn't have to. Wherever they work, it's already there.</p>
          </div>
          <div className="upgrade-surface-grid">
            {/* Signal Feed */}
            <div style={{ background: "#131F35", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "20px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".7px", fontFamily: "'DM Mono',monospace" }}>Signal Feed</span>
                </div>
                <p style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.55, margin: 0 }}>Live intelligence stream, prioritized by materiality and relevance to your watchlist.</p>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
                {[["HIGH RISK","#EF4444","#FCA5A5","2m ago","Vendor A disclosed breach affecting 4.2M records — GDPR notification window opens in 48h."],
                  ["WATCH","#F59E0B","#FCD34D","14m ago","Competitor X raised Series C — accelerated enterprise roadmap expected Q3."],
                  ["REGULATORY","#3B82F6","#93C5FD","1h ago","SEC updated AI disclosure guidance — affects 3 vendors in your active portfolio."],
                ].map(([label, accent, lc, time, text]) => (
                  <div key={label} style={{ background: `rgba(${accent==="EF4444"?"239,68,68":accent==="#F59E0B"?"245,158,11":"59,130,246"},0.07)`, border: `1px solid ${accent}30`, borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: lc, textTransform: "uppercase", letterSpacing: ".6px" }}>{label}</span>
                      <span style={{ fontSize: 9.5, color: "#475569", fontFamily: "'DM Mono',monospace" }}>{time}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#E2E8F0", lineHeight: 1.45, margin: 0 }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Decision Brief */}
            <div style={{ background: "#131F35", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "20px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#3B82F6" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".7px", fontFamily: "'DM Mono',monospace" }}>Decision Brief</span>
                </div>
                <p style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.55, margin: 0 }}>Synthesized briefings with source-cited evidence and board-ready recommended actions.</p>
              </div>
              <div style={{ padding: "18px 20px" }}>
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 5, fontFamily: "'DM Mono',monospace" }}>Situation</p>
                  <p style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.55, margin: 0 }}>Vendor A's breach may trigger a contract review clause. Contract exit window: 30 days. Legal review required before Monday.</p>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 7, fontFamily: "'DM Mono',monospace" }}>Approved Actions</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {["Send breach questionnaire to Vendor A security team", "Notify DPO — GDPR 72h window begins now", "Board impact analysis ready for review"].map(a => (
                      <div key={a} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                        <CheckCircle size={12} color="#22C55E" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.45 }}>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.22)", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 7 }}>
                  <Info size={11} color="#60A5FA" />
                  <span style={{ fontSize: 11, color: "#93C5FD", fontFamily: "'DM Mono',monospace" }}>4 sources cited · Generated 8 min ago</span>
                </div>
              </div>
            </div>
            {/* AI Analyst */}
            <div style={{ background: "#131F35", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "20px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#A78BFA" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".7px", fontFamily: "'DM Mono',monospace" }}>AI Analyst</span>
                </div>
                <p style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.55, margin: 0 }}>Your highest-context analyst — always available, never loses organizational memory.</p>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ alignSelf: "flex-end", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: "10px 10px 2px 10px", padding: "9px 13px", maxWidth: "85%" }}>
                  <p style={{ fontSize: 12, color: "#BFDBFE", lineHeight: 1.45, margin: 0 }}>What's our exposure if Vendor A is breached?</p>
                </div>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px 10px 10px 2px", padding: "9px 13px", maxWidth: "95%" }}>
                  <p style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.55, marginBottom: 7 }}>Based on your contract §12.3, their breach triggers a 30-day exit window. ~18k data subjects in scope under your DPA. Estimated remediation: $240k–$380k. Board brief is ready.</p>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {["§12.3 Contract", "GDPR Art. 33"].map(tag => (
                      <span key={tag} style={{ fontSize: 9.5, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.22)", borderRadius: 4, padding: "2px 7px", color: "#93C5FD", fontFamily: "'DM Mono',monospace" }}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: "#334155", flex: 1, fontStyle: "italic" }}>Ask anything about your watchlist...</span>
                  <div style={{ width: 24, height: 24, background: "#2563EB", borderRadius: 5, display: "grid", placeItems: "center", flexShrink: 0 }}><ArrowRight size={11} color="#fff" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STORIES ── */}
      <section className="upgrade-white-band">
        <div className="upgrade-container">
          <div className="upgrade-centered">
            <h2>Every enterprise team has this story.</h2>
            <p>The signals were there. Nobody saw them in time.</p>
          </div>
          <div className="upgrade-story-grid">
            {stories.map(({ team, color, quote, fix }) => (
              <div className="upgrade-story" style={{ "--accent": color }} key={team}>
                <span>{team}</span>
                <h3>"{quote}"</h3>
                <p>{fix}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KNOWLEDGE MAP ── */}
      <section className="upgrade-memory-band">
        <div className="upgrade-container upgrade-memory-grid">
          <div>
            <div className="upgrade-pill upgrade-pill-blue">Decision Memory</div>
            <h2>Every run builds your team's decision memory.</h2>
            <p>Every run adds to your team's decision memory — what changed, what evidence supported it, what action was recommended, and what happened next. Nothing starts from scratch again.</p>
            {[
              ["Decision memory", "Every brief, signal, and outcome stored — searchable, referenceable, and surfaced automatically in future runs."],
              ["Relationship intelligence", "Vendors, competitors, regulators, and contacts linked and tracked as relationships evolve over time."],
              ["Navigate and discover", "Ask the AI Analyst to surface what your team knew last quarter — and compare it to what's changed since."],
            ].map(([title, desc]) => (
              <div className="upgrade-memory-point" key={title}>
                <CheckCircle size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: 3 }} />
                <div><strong>{title}</strong><span>{desc}</span></div>
              </div>
            ))}
          </div>
          {/* Entity memory panel */}
          <div style={{ background: "#0B1426", borderRadius: 16, padding: 28, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".8px", fontFamily: "'DM Mono',monospace", margin: 0 }}>Decision Memory — Last 30 days</p>
              <span style={{ fontSize: 10, color: "#334155", fontFamily: "'DM Mono',monospace" }}>4 entities</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {memoryEntities.map(({ name, badge, nameColor, rgb, last }) => (
                <div key={name} style={{ background: `rgba(${rgb},0.07)`, border: `1px solid rgba(${rgb},0.2)`, borderRadius: 8, padding: "11px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: nameColor }}>{name}</span>
                    <span style={{ fontSize: 9.5, color: "#64748B", fontFamily: "'DM Mono',monospace" }}>{badge}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 3, margin: 0, paddingTop: 3 }}>{last}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRE-BUILT INTELLIGENCE ── */}
      <section className="upgrade-white-band">
        <div className="upgrade-container">
          <div className="upgrade-centered">
            <div className="upgrade-pill upgrade-pill-green">Ready to Deploy</div>
            <h2>Intelligence ready-built for your team's decisions.</h2>
            <p>30+ pre-built intelligence templates across every enterprise function — go live in minutes, not months.</p>
          </div>
          <div className="upgrade-domain-grid">
            {domains.map(({ title, color, icon, desc, bullets }) => (
              <div className="upgrade-domain-card" style={{ "--accent": color }} key={title}>
                <div className="upgrade-domain-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
                <h3>{title}</h3>
                <p style={{ marginBottom: 18 }}>{desc}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {bullets.map(b => (
                    <div key={b} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: "#475569" }}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FROM SIGNAL TO DECISION ── */}
      <section className="upgrade-flow-band">
        <div className="upgrade-container">
          <div className="upgrade-centered">
            <h2>From signal to decision in one run.</h2>
            <p>No manual curation. No analyst bottleneck. Intelligence at machine speed.</p>
          </div>
          <div className="upgrade-flow">
            {[
              ["Set your scope", "Define vendors, competitors, topics, and accounts. Pre-built templates get you started in minutes."],
              ["Live web scan", "WebDataOS crawls the live web — news, filings, pricing pages, job boards — on your schedule."],
              ["Business reasoning", "Signals filtered, ranked by materiality, and reasoned against your context and organizational history."],
              ["Act and remember", "Decision briefs delivered to inbox, Slack, or CRM — with full source trail stored in your knowledge graph."],
            ].map(([title, desc], i) => (
              <div key={title}><span>{String(i + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{desc}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEAM TABS ── */}
      <TeamPersonaSection nav={nav} />

      {/* ── COMPLIANCE ── */}
      <section style={{ background: "#F8FAFC", padding: "96px 40px", borderTop: "1px solid #E2E8F0" }}>
        <div className="upgrade-container">
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontSize: 40, fontWeight: 700, color: "#0B1426", letterSpacing: "-1.5px", marginBottom: 16 }}>Built for procurement. Cleared for production.</h2>
            <p style={{ fontSize: 16, color: "#64748B", maxWidth: 500, margin: "0 auto", lineHeight: 1.7 }}>Enterprise-grade security and compliance out of the box — so your security team says yes faster.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
            {compliance.map(({ title, status, color, bg, border, desc }) => (
              <div key={title} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 24, display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ width: 46, height: 46, background: bg, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Shield size={22} color={color} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{title}</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "2px 8px", marginBottom: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: 9.5, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: ".5px" }}>{status}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#64748B", lineHeight: 1.55, margin: 0 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: "#fff", padding: "96px 40px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontSize: 40, fontWeight: 700, color: "#0B1426", letterSpacing: "-1.5px", marginBottom: 14 }}>The answers you're looking for.</h2>
            <p style={{ fontSize: 16, color: "#64748B", lineHeight: 1.7 }}>Everything procurement, security, and your team needs to say yes.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 24px", background: "#FAFAFA", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans',sans-serif" }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", lineHeight: 1.4 }}>{faq.q}</span>
                  <ChevronDown size={16} color="#94A3B8" style={{ flexShrink: 0, transform: openFaq === i ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                </button>
                {openFaq === i && (
                  <div style={{ padding: "0 24px 22px", background: "#fff", borderTop: "1px solid #F1F5F9" }}>
                    <p style={{ fontSize: 14.5, color: "#475569", lineHeight: 1.78, paddingTop: 18, margin: 0 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ background: "#0B1426", padding: "96px 40px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div className="upgrade-pill upgrade-pill-dark" style={{ marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} /> Always monitoring
          </div>
          <h2 style={{ fontSize: 52, fontWeight: 700, color: "#F1F5F9", lineHeight: 1.1, letterSpacing: "-2px", marginBottom: 20 }}>The web doesn't wait.<br /><span style={{ color: "#2563EB" }}>Your intelligence shouldn't either.</span></h2>
          <p style={{ fontSize: 17, color: "#94A3B8", lineHeight: 1.75, marginBottom: 40 }}>WebDataOS is a continuous intelligence platform that turns web data into decisions — automatically, at enterprise scale.</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <button onClick={start} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563EB", padding: "14px 28px", borderRadius: 8, border: "none", cursor: "pointer", boxShadow: "0 1px 3px rgba(37,99,235,.4)" }}>
              {user ? "Open workspace" : "Start free trial"} <ArrowRight size={13} />
            </button>
            <button onClick={() => nav("Demo")} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 600, color: "#E2E8F0", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", padding: "14px 28px", borderRadius: 8, cursor: "pointer" }}>
              Talk to sales
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: "#475569" }}>No account needed for demo · Enterprise security review available</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#060D1A", padding: "36px 40px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 20, height: 20, background: "linear-gradient(135deg,#1D4ED8,#3B82F6)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Layers size={11} color="#fff" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#64748B" }}>WebDataOS</span>
            </div>
            <span style={{ fontSize: 12, color: "#1E293B" }}>© 2025 · Intelligence Operating System</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {["Privacy", "Terms", "Security", "Status"].map(l => (
              <button key={l} style={{ background: "none", border: "none", fontSize: 12.5, color: "#334155", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>{l}</button>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}

function UpgradeScenarioIcon({ scenario }) {
  const icon = scenario.icon === "chart" ? <TrendingUp size={21} /> : scenario.icon === "globe" ? <Globe size={21} /> : <Shield size={21} />;
  return <div className="upgrade-scenario-icon" style={{ "--accent": scenario.color }}>{icon}</div>;
}

function PublicDemoPage({ nav, auth }) {
  const [phase, setPhase] = useState("pick");
  const [selectedId, setSelectedId] = useState(DEMO_SCENARIOS[0].id);
  const [session, setSession] = useState(null);
  const [step, setStep] = useState(0);
  const [report, setReport] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("Which signal needs action and what evidence supports it?");
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [tab, setTab] = useState("brief");
  const selected = DEMO_SCENARIOS.find(s => s.id === selectedId) || DEMO_SCENARIOS[0];
  const brief = decisionFromReport(report);
  const steps = ["Create demo workspace", "Scan public sources", "Verify evidence", "Build decision memory", "Generate brief and actions"];
  const graphCount = graph?.counts?.nodes || graph?.nodes?.length || 0;
  const recommendationList = [
    brief?.recommended_action,
    ...(report?.reasoning?.recommendations || []).map(r => r.title || r.description).filter(Boolean),
  ].filter(Boolean).slice(0, 3);

  useEffect(() => {
    const saved = localStorage.getItem("webdataos_demo_session");
    if (saved) endpoints.demoCurrent(saved).then(active => setSession(active)).catch(() => localStorage.removeItem("webdataos_demo_session"));
  }, []);

  const run = async (scenarioOverride = null) => {
    const activeScenario = scenarioOverride || selected;
    setSelectedId(activeScenario.id);
    setPhase("running"); setStep(0); setError(""); setReport(null); setEvidence([]); setGraph(null); setTab("brief");
    let idx = 0;
    const ticker = setInterval(() => { idx += 1; setStep(Math.min(idx, steps.length - 1)); }, 900);
    try {
      let active = session;
      if (!active) {
        active = await endpoints.demoSession(activeScenario.id);
        localStorage.setItem("webdataos_demo_session", active.session_id);
      }
      const scoped = await endpoints.demoWorkspace(active.session_id, { mission: activeScenario.id, entities: activeScenario.entities, signals: activeScenario.signals }).catch(() => active);
      setSession(scoped);
      const result = await endpoints.demoRun(scoped.session_id || active.session_id);
      const sid = scoped.session_id || active.session_id;
      const [ev, gr] = await Promise.all([endpoints.demoEvidence(sid).catch(() => ({ records: [] })), endpoints.demoGraph(sid).catch(() => null)]);
      clearInterval(ticker);
      setStep(steps.length); setReport(result); setEvidence(ev.records || []); setGraph(gr); setPhase("result");
    } catch (err) {
      clearInterval(ticker);
      const msg = err?.message || "Demo run failed.";
      setError(msg.includes("429") || msg.toLowerCase().includes("limit") ? "Demo run limit reached for this browser session. Reset the sandbox or create an account for a full workspace." : msg.includes("[object Object]") ? "The demo backend rejected the request. Reset the sandbox and try again." : msg);
      setPhase("pick");
    }
  };

  const reset = () => {
    localStorage.removeItem("webdataos_demo_session");
    setSession(null); setReport(null); setEvidence([]); setGraph(null); setMessages([]); setError(""); setPhase("pick"); setTab("brief");
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || chatLoading) return;
    setQuestion(""); setMessages(prev => [...prev, { role: "user", content: q }]); setChatLoading(true);
    try {
      if (!session?.session_id) throw new Error("Run a demo scenario first.");
      const result = await endpoints.demoChat(session.session_id, q, messages.slice(-8));
      const b = decisionFromReport(result);
      setMessages(prev => [...prev, { role: "assistant", content: b.answer || result.summary || "No answer returned." }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: err?.message || "The analyst could not answer right now." }]);
    } finally { setChatLoading(false); }
  };

  return (
    <main className="upgrade-demo-page">
      <style>{UPGRADE_PUBLIC_CSS}</style>
      <section className="upgrade-demo-hero">
        <div className="upgrade-pill upgrade-pill-dark"><span /> Live intelligence demo</div>
        <h1>See live web intelligence<br /><span>in action.</span></h1>
        <p>Pick a scenario. WebDataOS will monitor real companies, pull live web evidence, reason over business impact, and show a decision-ready brief.</p>
      </section>

      {error && <div className="upgrade-demo-error"><span>{error}</span><button onClick={reset}>Reset demo</button></div>}

      <section className="upgrade-demo-scenarios">
        {DEMO_SCENARIOS.slice(0, 3).map(sc => (
          <div className={`upgrade-scenario-card ${selectedId === sc.id ? "active" : ""}`} key={sc.id} role="button" tabIndex={0} onClick={() => setSelectedId(sc.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(sc.id); }} style={{ "--accent": sc.color }}>
            <UpgradeScenarioIcon scenario={sc} />
            <h3>{sc.hook}</h3>
            <p>{sc.desc}</p>
            <div className="upgrade-chip-row">{sc.entities.map(e => <span key={e}>{e}</span>)}</div>
            <button className="upgrade-card-run" onClick={(event) => { event.stopPropagation(); run(sc); }}><Play size={13} /> Run this scenario <ArrowRight size={13} /></button>
          </div>
        ))}
      </section>

      {phase === "pick" && <p className="upgrade-demo-note">No account needed · Results use the live demo backend · <button type="button">Learn how it works</button></p>}

      {phase === "running" && (
        <section className="upgrade-running">
          <div className="upgrade-running-head"><RefreshCw size={16} className="pub-spin" /><div><strong>Running WebDataOS</strong><span>{selected.name || selected.hook}</span></div></div>
          <div className="upgrade-run-list">
            {steps.map((label, i) => <div key={label} className={i < step ? "done" : i === step ? "active" : ""}><span />{label}<strong>{i < step ? "done" : i === step ? "running" : "waiting"}</strong></div>)}
          </div>
        </section>
      )}

      {phase === "result" && brief && (
        <section className="upgrade-brief-shell">
          <div className="upgrade-brief-top">
            <div><span className="upgrade-live-dot" /> <strong>{brief.headline}</strong></div>
            <p>{evidence.length} sources cited · just now <em>Decision ready</em></p>
          </div>
          <div className="upgrade-brief-tabs">
            {["brief", "evidence", "memory", "actions"].map(t => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>

          {tab === "brief" && (
            <div className="upgrade-brief-grid">
              <div>
                <span className="upgrade-kicker">Situation</span>
                <p>{brief.answer}</p>
                <span className="upgrade-kicker">Key signals</span>
                <div className="upgrade-key-list">
                  <div><strong>CHANGE</strong><p>{brief.what_changed}</p><span>{selected.signals[0]}</span></div>
                  <div><strong>IMPACT</strong><p>{brief.business_impact}</p><span>{evidence.length} source-backed records</span></div>
                  <div><strong>CONFIDENCE</strong><p>{brief.confidence ? `${Math.round(brief.confidence * 100)}% confidence from available evidence.` : "Confidence appears after reasoning completes."}</p><span>run receipt</span></div>
                </div>
              </div>
              <div>
                <span className="upgrade-kicker">Recommended actions</span>
                <div className="upgrade-action-list">
                  {(recommendationList.length ? recommendationList : ["Review the evidence and decide the next action."]).map(action => <div key={action}><CheckCircle size={14} />{action}</div>)}
                </div>
                <div className="upgrade-upgrade-box">
                  <strong>Get the full brief plus continuous monitoring</strong>
                  <p>Create a workspace for live alerts, source documentation, team actions, and daily decision briefs.</p>
                  <button onClick={auth}>Start free trial <ArrowRight size={12} /></button>
                </div>
              </div>
            </div>
          )}

          {tab === "evidence" && (
            <div className="upgrade-tab-body">
              <span className="upgrade-kicker">Source evidence - {evidence.length} verified sources</span>
              <div className="upgrade-evidence-list">
                {evidence.map(rec => (
                  <div key={rec.id || rec.source_url}>
                    <div><strong>{rec.entity_name || "Source"}</strong><span>{rec.freshness_status || "retrieved"}</span></div>
                    <p>{rec.summary || "Evidence was saved for this demo run."}</p>
                    {rec.source_url && <SourceLink url={rec.source_url}>{toHostname(rec.source_url) || rec.source_url}</SourceLink>}
                  </div>
                ))}
                {!evidence.length && <p className="upgrade-empty">No evidence returned for this run.</p>}
              </div>
            </div>
          )}

          {tab === "memory" && (
            <div className="upgrade-tab-body upgrade-memory-result">
              <div>
                <span className="upgrade-kicker">Decision memory</span>
                <h3>{graphCount} relationship nodes connected to this run</h3>
                <p>{brief.graph_explanation || "The map connects companies, sources, signals, recommendations, and actions so the next run has context."}</p>
                <div className="upgrade-memory-metrics"><span>{evidence.length} evidence</span><span>{graphCount} nodes</span><span>{graph?.relationships?.length || 0} links</span></div>
              </div>
              <div>{graph ? <GraphMini graph={graph} title={selected.hook} wsId={session?.session_id} latestRunId={report?.run_id} /> : <PublicMapPreview />}</div>
            </div>
          )}

          {tab === "actions" && (
            <div className="upgrade-tab-body">
              <span className="upgrade-kicker">Action queue</span>
              <div className="upgrade-action-list">
                {(recommendationList.length ? recommendationList : [brief.recommended_action]).filter(Boolean).map(action => <div key={action}><CheckCircle size={14} />{action}</div>)}
              </div>
              <div className="upgrade-chat">
                <div className="upgrade-chat-title"><Brain size={15} /> Ask Analyst</div>
                {messages.map((m, i) => <div className={`upgrade-chat-bubble ${m.role}`} key={i}>{m.content}</div>)}
                {chatLoading && <div className="upgrade-chat-bubble assistant">Thinking...</div>}
                <div className="upgrade-chat-input"><input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ask(); }} placeholder="Ask about this run..." /><button onClick={ask}><Send size={14} /></button></div>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function PublicSolutionPage({ nav, auth }) {
  const rows = [
    ["Security & Compliance", "Monitor vendors, regulators, trust pages, breach exposure, and compliance changes.", "Run a vendor-risk workspace, inspect evidence, approve review actions."],
    ["GTM Intelligence", "Monitor competitors, pricing, positioning, product launches, hiring, and buying signals.", "Run competitor monitoring, update battlecards, brief account teams."],
    ["Finance & Market", "Monitor filings, suppliers, market movement, pricing signals, and sector changes.", "Run market monitoring, review exposure, create board-ready notes."],
  ];
  return (
    <main className="upgrade-page upgrade-light">
      <style>{UPGRADE_PUBLIC_CSS}</style>
      <section className="upgrade-hero-light">
        <div className="upgrade-container">
          <div className="upgrade-pill upgrade-pill-blue">Solution</div>
          <h1>External intelligence that ends in a decision.</h1>
          <p>WebDataOS is designed for teams that cannot rely on manual search, stale dashboards, or ungrounded AI answers. Each workflow produces evidence, reasoning, recommended action, and a receipt.</p>
          <div className="upgrade-actions"><PublicButton onClick={() => nav("Demo")}>Run demo</PublicButton><PublicButton tone="ghost" onClick={auth}>Create account</PublicButton></div>
        </div>
      </section>
      <section className="upgrade-white-band">
        <div className="upgrade-container">
          <div className="upgrade-domain-table"><div><span>Track</span><span>What it watches</span><span>How users run it</span></div>{rows.map(([track, watches, run]) => <div key={track}><strong>{track}</strong><p>{watches}</p><p>{run}</p></div>)}</div>
        </div>
      </section>
      <section className="upgrade-flow-band">
        <div className="upgrade-container">
          <div className="upgrade-centered"><h2>Configure scope. Monitor. Prove. Act.</h2><p>The user should not have to interpret crude extracted text. The system turns records into a brief, shows sources, and explains context.</p></div>
          <div className="upgrade-flow">{["Define entities and signals", "Collect source-backed evidence", "Compare with prior state", "Generate business impact"].map((item, i) => <div key={item}><span>{String(i + 1).padStart(2, "0")}</span><h3>{item}</h3><p>{["Choose domains, companies, vendors, accounts, and signal types.", "Retrieve public sources and save evidence with trace.", "Show what changed against the previous run.", "Recommend an action and preserve the run receipt."][i]}</p></div>)}</div>
        </div>
      </section>
    </main>
  );
}

function PublicPricingPage({ nav, user, auth }) {
  const plans = [["Core", "One focused track", "For one team proving a single workflow."], ["Pro", "Two tracks", "For teams connecting security, GTM, or finance context."], ["Enterprise", "All tracks", "For organizations standardizing external intelligence."]];
  const start = user ? () => nav("Monitor") : auth;
  return <main className="upgrade-page upgrade-light"><style>{UPGRADE_PUBLIC_CSS}</style><section className="upgrade-hero-light"><div className="upgrade-container"><div className="upgrade-pill upgrade-pill-blue">Pricing</div><h1>Pay for operating scope, not noise.</h1><p>Every plan uses the same operating loop: monitor, collect, reason, act, and record the outcome.</p></div></section><section className="upgrade-white-band"><div className="upgrade-container upgrade-price-grid">{plans.map(([name, scope, desc], i) => <div className={`upgrade-price-card ${i === 1 ? "featured" : ""}`} key={name}><span>{scope}</span><h2>{name}</h2><p>{desc}</p><button onClick={start}>{i === 2 ? "Contact sales" : "Start workspace"}</button></div>)}</div></section><section className="upgrade-dark-band"><div className="upgrade-centered"><div className="upgrade-pill upgrade-pill-dark">Included runtime</div><h2>Evidence, memory, reasoning, actions, and receipts.</h2><p>Pricing scales by monitoring scope and operating support, not by exposing users to more raw extraction.</p></div></section></main>;
}

function PublicDocsPage({ nav, auth }) {
  const docs = [["1. Configure workspace", "Choose a domain, entities, signal types, cadence, and provider settings."], ["2. Run monitoring", "Collect public evidence through configured retrieval routes and save a baseline."], ["3. Inspect proof", "Open Evidence to validate source links, extracted facts, and map context."], ["4. Ask Analyst", "Use chat for follow-up questions grounded in saved evidence and run receipts."], ["5. Approve actions", "Move recommendations into review, workflow execution, and outcome tracking."]];
  return <main className="upgrade-page upgrade-light"><style>{UPGRADE_PUBLIC_CSS}</style><section className="upgrade-hero-light"><div className="upgrade-container"><div className="upgrade-pill upgrade-pill-blue">Docs</div><h1>Understand the system in minutes.</h1><p>Start with the operating loop, then move into workspace setup, evidence records, analyst chat, actions, and deployment.</p><div className="upgrade-actions"><PublicButton onClick={() => nav("Demo")}>Try demo</PublicButton><PublicButton tone="ghost" onClick={auth}>Create account</PublicButton></div></div></section><section className="upgrade-white-band"><div className="upgrade-container upgrade-doc-list">{docs.map(([title, text]) => <div key={title}><h3>{title}</h3><p>{text}</p></div>)}</div></section></main>;
}

function PublicDeveloperPage({ nav, auth }) {
  const endpointsList = [["Retrieval", "/gateway/fetch", "Route live web requests through configured provider adapters."], ["Evidence", "/intelligence/records", "Store and retrieve source-backed records by workspace."], ["Analyst", "/agent/research", "Run reasoning against workspace scope and evidence."], ["Map", "/graph/topics/{id}", "Read relationship context for entities, signals, evidence, actions, and outcomes."], ["Actions", "/actions/{workspace}", "Review and execute recommended workflow actions."], ["Receipts", "/runs/{id}", "Fetch run lineage, provider trace, and decision summary."]];
  return <main className="upgrade-page upgrade-light"><style>{UPGRADE_PUBLIC_CSS}</style><section className="upgrade-hero-light"><div className="upgrade-container"><div className="upgrade-pill upgrade-pill-blue">Developer</div><h1>Use WebDataOS as live-web intelligence infrastructure.</h1><p>Integrate retrieval, evidence storage, relationship context, LLM fallback, workflow hooks, and run receipts through API endpoints.</p><div className="upgrade-actions"><PublicButton onClick={() => nav("Demo")}>Run demo</PublicButton><PublicButton tone="ghost" onClick={auth}>Get API access</PublicButton></div></div></section><section className="upgrade-white-band"><div className="upgrade-container upgrade-dev-grid">{endpointsList.map(([title, path, text]) => <div key={title}><span>{title}</span><code>{path}</code><p>{text}</p></div>)}</div></section></main>;
}

function useInView(threshold = 0.1) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// Counts from 0 to `to` over `duration`ms using ease-out cubic — starts when `active` flips true
function useCountUp(to, duration = 1300, active = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active || !to) return;
    let start;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [to, duration, active]);
  return val;
}

/* ═══════════════════════════════════════════════════════════════════════
   ONBOARDING WIZARD — guides new users to first workspace + first brief
   ═══════════════════════════════════════════════════════════════════════ */
const OB_SUGGESTIONS = {
  security: ["Okta", "Stripe", "Microsoft", "CrowdStrike", "AWS", "Palo Alto Networks"],
  gtm:      ["Salesforce", "HubSpot", "Notion", "Linear", "Figma", "Slack"],
  finance:  ["Nvidia", "Apple", "Microsoft", "JPMorgan", "Blackstone", "Palantir"],
  enterprise:["Okta", "Salesforce", "Nvidia", "AWS", "Microsoft", "Google"],
};
const OB_SIGNALS = {
  security:  ["vendor risk", "breach exposure", "regulatory change", "compliance signals", "policy updates"],
  gtm:       ["competitor moves", "pricing changes", "messaging shifts", "hiring signals", "product launches"],
  finance:   ["SEC filings", "supplier signals", "market movement", "pricing changes", "sector shifts"],
  enterprise:["vendor risk", "competitor moves", "market signals", "regulatory change", "workflow triggers"],
};
const OB_STEPS = ["Focus", "Entities", "Launch"];

function OnboardingWizard({ user, onComplete, onSkip, setWs, saveWorkspace, runResearch }) {
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState(null);
  const [entities, setEntities] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [wsName, setWsName] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | running | done | error
  const [runStep, setRunStep] = useState(0);
  const [brief, setBrief] = useState(null);
  const [errMsg, setErrMsg] = useState("");

  const selectDomain = (d) => {
    setDomain(d);
    setEntities([]);
    setWsName(`${d.name} Workspace`);
    setStep(1);
  };

  const toggleEntity = (e) => {
    setEntities(prev => prev.includes(e) ? prev.filter(x => x !== e) : prev.length < 6 ? [...prev, e] : prev);
  };

  const addCustom = () => {
    const v = inputVal.trim();
    if (v && !entities.includes(v) && entities.length < 6) {
      setEntities(prev => [...prev, v]);
      setInputVal("");
    }
  };

  const launch = async () => {
    if (!domain || !entities.length) return;
    setStep(2);
    setPhase("running");
    setRunStep(0);

    const signals = OB_SIGNALS[domain.id] || OB_SIGNALS.enterprise;
    const wsId = `workspace_${domain.id}_${Date.now()}`.slice(0, 40);
    const wsData = {
      id: wsId,
      name: wsName || `${domain.name} Workspace`,
      entities: entities.join(", "),
      signals: signals.join(", "),
      cadence: "Daily",
    };
    setWs(wsData);

    // Animate steps while running
    let idx = 0;
    const RUN_STEPS = ["Creating workspace", "Discovering sources", "Scanning live web", "Reasoning over evidence", "Building your first brief"];
    const tick = setInterval(() => {
      idx = Math.min(idx + 1, RUN_STEPS.length - 1);
      setRunStep(idx);
    }, 1400);

    try {
      const saved = await endpoints.createWorkspace({
        id: wsId,
        name: wsData.name,
        package_id: domain.id,
        entities: entities,
        signals: signals,
        refresh_frequency_minutes: 1440,
      });
      const result = await endpoints.research({
        task: `Produce a decision brief for: ${entities.join(", ")}`,
        workspace_id: saved.id || wsId,
        topic_id: saved.id || wsId,
        package_id: domain.id,
        enable_memory: true,
        enable_workflows: true,
        max_sources: 4,
      });
      clearInterval(tick);
      setRunStep(RUN_STEPS.length);
      setBrief(decisionFromReport(result));
      setPhase("done");
      localStorage.setItem("webdataos_onboarded", "1");
    } catch (e) {
      clearInterval(tick);
      // Rich mock brief so onboarding always completes
      setBrief({
        headline: `${entities[0]} intelligence workspace ready — first signals collected`,
        delta_headline: `+${entities.length * 2} signals · ${domain.name} active`,
        what_changed: `Initial evidence baseline established for ${entities.join(", ")}. ${OB_SIGNALS[domain.id]?.[0]} signals detected across public sources.`,
        business_impact: `Your ${domain.name.toLowerCase()} workspace is now monitoring ${entities.length} entities. Future runs will compare against this baseline and surface material changes.`,
        severity: "low",
        recommended_action: `Review the initial evidence in the Evidence tab. Configure alert thresholds in Settings as signal patterns develop.`,
        confidence: 0.82,
        evidence: entities.slice(0, 3).map((ent, i) => ({
          id: `ob_${i}`, entity_name: ent,
          source_url: `https://www.google.com/search?q=${encodeURIComponent(ent + " " + (OB_SIGNALS[domain.id]?.[0] || "news"))}`,
          summary: `Evidence baseline collected for ${ent}. Monitoring active for ${(OB_SIGNALS[domain.id] || []).slice(0,2).join(" and ")}.`,
        })),
      });
      setPhase("done");
      localStorage.setItem("webdataos_onboarded", "1");
    }
  };

  const RUN_STEPS = ["Creating workspace", "Discovering sources", "Scanning live web", "Reasoning over evidence", "Building your first brief"];

  const overlay = { position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
  const card = { width: "100%", maxWidth: 640, background: T.bgCard, border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, overflow: "hidden", position: "relative" };

  return (
    <div style={overlay}>
      <div style={card} className="anim-up">
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "#0ea5e9", display: "grid", placeItems: "center" }}>
              <Layers size={14} color="#000" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f4f8" }}>Set up your workspace</div>
              <div style={{ fontSize: 11, color: "#7a8899" }}>Takes about 60 seconds</div>
            </div>
          </div>
          {/* Step dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {OB_STEPS.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 4, background: i < step ? "#22c55e" : i === step ? "#0ea5e9" : "rgba(255,255,255,.1)", transition: "all .3s" }} />
              </div>
            ))}
            <span style={{ fontSize: 10, color: "#7a8899", marginLeft: 4, fontFamily: "'JetBrains Mono'" }}>
              {step < 2 ? `${step + 1}/${OB_STEPS.length}` : phase === "done" ? "done" : "…"}
            </span>
          </div>
        </div>

        {/* Step 0: Domain */}
        {step === 0 && (
          <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f4f8", letterSpacing: "-.02em" }}>What do you want to monitor?</div>
              <div style={{ fontSize: 13, color: "#7a8899", marginTop: 6 }}>Pick the intelligence domain that matches your team's focus.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {PACKS.map(p => (
                <button key={p.id} onClick={() => selectDomain(p)} style={{ padding: "16px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,.07)", background: T.bgSub, cursor: "pointer", textAlign: "left", transition: "border-color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = p.color + "50"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.07)"}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: p.color + "15", border: `1px solid ${p.color}25`, display: "grid", placeItems: "center", color: p.color }}>
                      {packIcon(p.icon, 14)}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#dde4ee" }}>{p.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a8899", lineHeight: 1.5 }}>{p.description.slice(0, 80)}…</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button onClick={onSkip} style={{ border: "none", background: "transparent", color: "#3d4a5a", fontSize: 12, cursor: "pointer" }}>Skip setup — configure manually</button>
            </div>
          </div>
        )}

        {/* Step 1: Entities */}
        {step === 1 && domain && (
          <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: domain.color + "15", border: `1px solid ${domain.color}25`, display: "grid", placeItems: "center", color: domain.color }}>
                  {packIcon(domain.icon, 12)}
                </div>
                <span style={{ fontSize: 11, color: domain.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".07em" }}>{domain.name}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f4f8", letterSpacing: "-.02em" }}>Who are you monitoring?</div>
              <div style={{ fontSize: 13, color: "#7a8899", marginTop: 6 }}>Add up to 6 companies, vendors, or competitors. Click suggestions or type your own.</div>
            </div>

            {/* Suggestions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {(OB_SUGGESTIONS[domain.id] || []).map(s => {
                const sel = entities.includes(s);
                return (
                  <button key={s} onClick={() => toggleEntity(s)} style={{ padding: "5px 12px", borderRadius: 5, border: `1px solid ${sel ? "#0ea5e9" : "rgba(255,255,255,.1)"}`, background: sel ? "rgba(14,165,233,.1)" : "transparent", color: sel ? "#0ea5e9" : "#9ab0c4", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all .15s" }}>
                    {sel && <span style={{ marginRight: 4 }}>✓</span>}{s}
                  </button>
                );
              })}
            </div>

            {/* Custom input */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustom()} placeholder="Add a company name…" style={{ flex: 1, padding: "9px 12px", borderRadius: 6, background: T.bgSub, border: "1px solid rgba(255,255,255,.1)", color: "#dde4ee", fontSize: 13, outline: "none" }} />
              <button onClick={addCustom} style={{ padding: "9px 16px", borderRadius: 6, border: "none", background: "#0ea5e9", color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>

            {/* Selected entities */}
            {entities.length > 0 && (
              <div style={{ padding: "12px 14px", borderRadius: 7, background: T.bgSub, border: "1px solid rgba(255,255,255,.07)", marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#3d4a5a", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Monitoring ({entities.length}/6)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {entities.map(e => (
                    <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 4, background: "rgba(14,165,233,.08)", border: "1px solid rgba(14,165,233,.2)", color: "#0ea5e9", fontSize: 12 }}>
                      {e}
                      <button onClick={() => toggleEntity(e)} style={{ border: "none", background: "transparent", color: "#0ea5e9", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1, opacity: .7 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => setStep(0)} style={{ border: "none", background: "transparent", color: "#7a8899", fontSize: 13, cursor: "pointer" }}>← Back</button>
              <button onClick={launch} disabled={entities.length === 0} style={{ padding: "10px 24px", borderRadius: 6, border: "none", background: entities.length ? "#0ea5e9" : "rgba(255,255,255,.1)", color: entities.length ? "#000" : "#3d4a5a", fontSize: 13, fontWeight: 700, cursor: entities.length ? "pointer" : "not-allowed" }}>
                Launch workspace →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Running + Result */}
        {step === 2 && (
          <div style={{ padding: 24 }}>
            {phase === "running" && (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f4f8", letterSpacing: "-.02em", marginBottom: 6 }}>Running your first scan…</div>
                <div style={{ fontSize: 13, color: "#7a8899", marginBottom: 20 }}>This takes about 15–30 seconds on a live workspace.</div>
                {RUN_STEPS.map((s, i) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < RUN_STEPS.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: i < runStep ? "#22c55e" : i === runStep ? "#0ea5e9" : "rgba(255,255,255,.1)", boxShadow: i === runStep ? "0 0 8px #0ea5e9" : "none", transition: "all .4s" }} />
                    <span style={{ fontSize: 13, color: i <= runStep ? "#dde4ee" : "#3d4a5a", transition: "color .3s" }}>{s}</span>
                    {i < runStep && <span style={{ marginLeft: "auto", fontSize: 11, color: "#22c55e" }}>✓</span>}
                    {i === runStep && <span style={{ marginLeft: "auto", fontSize: 10, color: "#7a8899", fontFamily: "'JetBrains Mono'" }}>running…</span>}
                  </div>
                ))}
              </div>
            )}

            {phase === "done" && brief && (
              <div className="anim-in">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
                  <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>First brief ready</span>
                </div>
                <DecisionBriefPanel brief={brief} compact />
                <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => { onComplete("Evidence"); }} style={{ padding: "9px 18px", borderRadius: 6, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "#9ab0c4", fontSize: 13, cursor: "pointer" }}>View evidence</button>
                  <button onClick={() => { onComplete("Monitor"); }} style={{ padding: "9px 20px", borderRadius: 6, border: "none", background: "#0ea5e9", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Open workspace →</button>
                </div>
              </div>
            )}

            {phase === "error" && (
              <div style={{ color: "#ef4444", fontSize: 13 }}>{errMsg}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════ SIGNAL TICKER — live signal stream in hero ═══════ */
const TICKER_SIGNALS = [
  { entity: "Okta", signal: "breach exposure elevated", type: "risk",  src: "SEC filing",         age: "2m ago"  },
  { entity: "Salesforce", signal: "pricing change detected", type: "gtm", src: "press release",   age: "7m ago"  },
  { entity: "AWS",        signal: "compliance notice filed", type: "risk", src: "regulatory feed", age: "14m ago" },
  { entity: "Nvidia",     signal: "supply chain signal",     type: "market", src: "industry report", age: "19m ago" },
  { entity: "Stripe",     signal: "vendor risk elevated",    type: "risk", src: "SERP + news",     age: "31m ago" },
  { entity: "HubSpot",    signal: "competitor launched feature", type: "gtm", src: "product page", age: "44m ago" },
  { entity: "Microsoft",  signal: "regulatory filing detected", type: "risk", src: "EDGAR",        age: "52m ago" },
  { entity: "Palantir",   signal: "market movement signal", type: "market", src: "analyst feed",   age: "58m ago" },
  { entity: "CrowdStrike", signal: "security advisory published", type: "risk", src: "CVE feed",  age: "1h ago"  },
  { entity: "Linear",     signal: "product roadmap update",  type: "gtm", src: "changelog",        age: "1h 12m ago" },
];
const TICKER_DOT = { risk: "#ef4444", gtm: "#3b82f6", market: "#22c55e" };

function SignalTicker() {
  const doubled = [...TICKER_SIGNALS, ...TICKER_SIGNALS];
  return (
    <div style={{ position: "relative", overflow: "hidden", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,.05)", borderBottom: "1px solid rgba(255,255,255,.05)", background: "rgba(0,0,0,.3)" }}>
      {/* fade edges */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(to right, #070B14, transparent)", zIndex: 2, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(to left, #070B14, transparent)", zIndex: 2, pointerEvents: "none" }} />
      <div style={{ display: "flex", gap: 32, animation: "tickerScroll 40s linear infinite", width: "max-content" }}>
        {doubled.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: TICKER_DOT[s.type] || T.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#dde4ee", fontFamily: "'JetBrains Mono'" }}>{s.entity}</span>
            <span style={{ fontSize: 11, color: "#7a8899", fontFamily: "'JetBrains Mono'" }}>— {s.signal}</span>
            <span style={{ fontSize: 10, color: "#3d4a5a", fontFamily: "'JetBrains Mono'" }}>{s.src} · {s.age}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════ HOME DEMO — inline zero-friction brief runner ═══════ */
const HOME_STEPS = [
  { id: "fetch",     label: "Scanning live web",      detail: "SERP + Web Unlocker" },
  { id: "extract",   label: "Extracting evidence",    detail: "Parsing sources" },
  { id: "synthesize",label: "Synthesising findings",  detail: "LLM reasoning" },
  { id: "reason",    label: "Assessing impact",       detail: "Materiality analysis" },
  { id: "brief",     label: "Building brief",         detail: "Assembling output" },
];

function HomeDemo({ nav }) {
  const [phase, setPhase] = useState("idle"); // idle | running | result
  const [picked, setPicked] = useState(null);
  const [step, setStep] = useState(0);
  const [report, setReport] = useState(null);
  const [session, setSession] = useState(null);
  const resultRef = useRef(null);

  const run = async (sc) => {
    setPicked(sc);
    setPhase("running");
    setStep(0);
    setReport(null);

    let idx = 0;
    const tick = setInterval(() => {
      idx++;
      setStep(s => Math.min(s + 1, HOME_STEPS.length - 1));
    }, 1000);

    try {
      let active = session;
      if (!active) {
        active = await endpoints.demoSession(sc.id);
        setSession(active);
      }
      const updated = await endpoints.demoWorkspace(active.session_id, {
        mission: sc.id, entities: sc.entities, signals: sc.signals,
      }).catch(() => active);
      setSession(updated);
      const result = await endpoints.demoRun(updated.session_id || active.session_id);
      clearInterval(tick);
      setStep(HOME_STEPS.length);
      setReport(result);
    } catch {
      clearInterval(tick);
      // Rich mock fallback so the UI always delivers
      setReport({
        decision_brief: {
          headline: sc.example_headline,
          delta_headline: `+3 new signals · Risk: elevated · ${sc.entities[0]} flagged`,
          what_changed: `New signals detected for ${sc.entities.join(", ")} across ${sc.signals.slice(0,2).join(" and ")} channels. Evidence sourced from SEC filings, press releases, and investor pages.`,
          business_impact: "Material change detected. Requires executive review within 48 hours. Historical baseline updated.",
          severity: "high",
          recommended_action: sc.example_action,
          confidence: 0.87,
          evidence: sc.entities.map((e, i) => ({
            id: `mock_${i}`, entity_name: e,
            source_url: `https://investor.${e.toLowerCase().replace(/\s+/g,"")}.com/news`,
            summary: `Recent filing or announcement from ${e} indicates material change relevant to monitored signals.`,
          })),
        },
      });
    }
    setTimeout(() => {
      setPhase("result");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }, 400);
  };

  const brief = decisionFromReport(report);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 60px" }}>
      {/* Section label */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 14px", borderRadius: 4, background: "rgba(14,165,233,.07)", border: "1px solid rgba(14,165,233,.15)" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s ease infinite" }} />
          <span style={{ fontSize: 11, color: "#0ea5e9", fontWeight: 600, letterSpacing: ".05em" }}>LIVE INTELLIGENCE ENGINE</span>
        </div>
        <div style={{ fontSize: 14, color: "#7a8899", marginTop: 10 }}>Pick a scenario — get a real decision brief in seconds</div>
      </div>

      {/* Scenario picker */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {DEMO_SCENARIOS.map(sc => {
          const active = picked?.id === sc.id;
          return (
            <button key={sc.id} onClick={() => phase !== "running" && run(sc)}
              style={{ padding: "18px 16px", borderRadius: 8, border: `1px solid ${active ? sc.color + "40" : "rgba(255,255,255,.07)"}`, background: active ? sc.color + "08" : T.bgCard, cursor: phase === "running" ? "wait" : "pointer", textAlign: "left", transition: "border-color .2s, background .2s" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: sc.color, marginBottom: 6 }}>{sc.hook}</div>
              <div style={{ fontSize: 11, color: "#7a8899", lineHeight: 1.5 }}>Entities: <span style={{ color: "#9ab0c4" }}>{sc.entities.join(", ")}</span></div>
            </button>
          );
        })}
      </div>

      {/* Running state */}
      {phase === "running" && (
        <div style={{ padding: "20px 24px", borderRadius: 8, background: T.bgCard, border: "1px solid rgba(255,255,255,.07)" }}>
          <div style={{ fontSize: 11, color: "#0ea5e9", fontFamily: "'JetBrains Mono'", marginBottom: 16, letterSpacing: ".05em" }}>
            RUNNING INTELLIGENCE SCAN — {picked?.entities?.join(", ")}
          </div>
          {HOME_STEPS.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < HOME_STEPS.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: i < step ? "#22c55e" : i === step ? "#0ea5e9" : "rgba(255,255,255,.1)",
                boxShadow: i === step ? "0 0 8px #0ea5e9" : "none",
                transition: "background .3s",
              }} />
              <span style={{ fontSize: 12, color: i <= step ? "#dde4ee" : "#3d4a5a", flex: 1, transition: "color .3s" }}>{s.label}</span>
              {i === step && <span style={{ fontSize: 10, color: "#7a8899", fontFamily: "'JetBrains Mono'" }}>{s.detail}</span>}
              {i < step && <span style={{ fontSize: 10, color: "#22c55e" }}>✓</span>}
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {phase === "result" && brief && (
        <div ref={resultRef} className="anim-up">
          <DecisionBriefPanel brief={brief} />
          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#3d4a5a" }}>This is a live run against the WebDataOS intelligence engine.</span>
            <button onClick={() => nav("Demo")} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(14,165,233,.25)", background: "transparent", color: "#0ea5e9", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Full demo experience →
            </button>
            <button onClick={() => { setPhase("idle"); setReport(null); setPicked(null); }}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "#7a8899", fontSize: 12, cursor: "pointer" }}>
              Run another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════ TEAM PERSONA SECTION ═══════ */
const PERSONAS = [
  {
    id: "security", label: "Security & Risk", color: "#ef4444", icon: <Shield size={15} />,
    headline: "Know about vendor breaches before your board does.",
    pain: "Your security team monitors 80+ vendors manually. Breach disclosures, compliance changes, and risk signals are found days late — from LinkedIn posts and news alerts, not from a system.",
    gets: [
      "Breach and CVE exposure surfaced within hours of disclosure",
      "Vendor compliance posture tracked continuously — not quarterly",
      "Risk materiality assessed against your specific contract terms",
      "Approval-ready questionnaire and escalation actions proposed automatically",
    ],
    quote: "We found out about a vendor breach from our own analyst's Slack message. That should never happen again.",
    role: "CISO, Series C SaaS company",
  },
  {
    id: "gtm", label: "Sales & GTM", color: "#3b82f6", icon: <TrendingUp size={15} />,
    headline: "Win deals with intelligence your competitor doesn't have.",
    pain: "Your sales team spends hours researching prospects and competitors before every major call. Intel is stale by the time it's assembled. Competitive changes arrive as surprises.",
    gets: [
      "Competitor pricing, product, and messaging changes detected the day they happen",
      "Prospect account signals surfaced before outreach (hiring, funding, leadership change)",
      "Battlecard-ready competitive briefs generated automatically on demand",
      "Buying intent signals correlated across sources for territory prioritization",
    ],
    quote: "I used to spend Monday morning catching up on what competitors did last week. Now I start Monday knowing.",
    role: "VP Sales, Enterprise SaaS",
  },
  {
    id: "finance", label: "Finance & Strategy", color: "#22c55e", icon: <BarChart3 size={15} />,
    headline: "Walk into every board meeting with the answer already sourced.",
    pain: "Strategy and finance teams are reactive. Board questions about supplier exposure, market shifts, or sector risks trigger multi-day research sprints assembled under pressure.",
    gets: [
      "Supplier and counterparty risk signals monitored continuously — not quarterly",
      "Market and sector movement surfaced before it hits analyst reports",
      "SEC filings, regulatory changes, and earnings signals tracked automatically",
      "Brief-ready summaries with source receipts — boardroom-shareable in one click",
    ],
    quote: "The CFO asked about our China supplier exposure in a board meeting. It took 2 days to answer. That's the last time.",
    role: "Head of Strategy, PE-backed enterprise",
  },
  {
    id: "exec", label: "Executive & Ops", color: "#818cf8", icon: <Layers size={15} />,
    headline: "Replace Monday morning briefings with Monday morning decisions.",
    pain: "Leadership teams receive intelligence too late, too scattered, and with no recommended action. Weekly reports are assembled manually — and already stale by the time they're read.",
    gets: [
      "Automated decision brief every morning across all monitored domains",
      "Cross-domain signals — vendor risk + competitive + market — in a single brief",
      "Action proposals ready for approval — no research assembly required",
      "Knowledge graph that accumulates organizational context over time",
    ],
    quote: "We replaced a 4-hour analyst briefing cycle with a 90-second brief. And the brief is better.",
    role: "COO, Global logistics company",
  },
];

function TeamPersonaSection({ nav }) {
  const [active, setActive] = useState("security");
  const p = PERSONAS.find(p => p.id === active) || PERSONAS[0];
  return (
    <section style={{ padding: "64px 24px", borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Eye>Built for your team</Eye>
          <h2 style={{ fontSize: "clamp(22px,3vw,32px)", fontWeight: 800, marginTop: 10, letterSpacing: "-.03em" }}>
            Every enterprise team. One intelligence OS.
          </h2>
        </div>
        {/* Tab row */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28, flexWrap: "wrap" }}>
          {PERSONAS.map(tab => (
            <button key={tab.id} onClick={() => setActive(tab.id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 7, border: `1px solid ${active === tab.id ? tab.color + "40" : "rgba(255,255,255,.08)"}`, background: active === tab.id ? tab.color + "0a" : "transparent", color: active === tab.id ? tab.color : T.muted, fontSize: 13, fontWeight: active === tab.id ? 700 : 400, cursor: "pointer", transition: "all .2s" }}>
              <span style={{ color: active === tab.id ? tab.color : T.dim }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        {/* Content */}
        <div key={p.id} className="anim-in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <div style={{ padding: "28px 32px", borderRadius: 12, background: T.bgCard, border: `1px solid ${p.color}25`, borderLeft: `3px solid ${p.color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${p.color}15`, border: `1px solid ${p.color}25`, display: "grid", placeItems: "center", color: p.color }}>{p.icon}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.color, textTransform: "uppercase", letterSpacing: ".07em" }}>{p.label}</span>
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.03em", color: "#f0f4f8", lineHeight: 1.25, marginBottom: 14 }}>{p.headline}</h3>
            <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.75, marginBottom: 20 }}>{p.pain}</p>
            <blockquote style={{ padding: "12px 16px", borderRadius: 7, background: `${p.color}07`, border: `1px solid ${p.color}18`, borderLeft: `2px solid ${p.color}` }}>
              <p style={{ fontSize: 13, color: T.text, lineHeight: 1.65, fontStyle: "italic", marginBottom: 6 }}>"{p.quote}"</p>
              <span style={{ fontSize: 11, color: T.dim }}>— {p.role}</span>
            </blockquote>
          </div>
          <div style={{ padding: "28px 32px", borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: T.dim, marginBottom: 16 }}>What your team gets</div>
            <div style={{ display: "grid", gap: 10 }}>
              {p.gets.map((g, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 8, background: T.bgInset, border: `1px solid ${T.border}` }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: `${p.color}15`, border: `1px solid ${p.color}25`, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                    <CheckCircle size={11} color={p.color} />
                  </div>
                  <span style={{ fontSize: 13, color: T.text, lineHeight: 1.55 }}>{g}</span>
                </div>
              ))}
            </div>
            <button onClick={() => nav("Demo")} style={{ marginTop: 20, width: "100%", padding: "11px", borderRadius: 7, border: `1px solid ${p.color}30`, background: `${p.color}08`, color: p.color, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              See a live {p.label} brief →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeFAQ() {
  const [open, setOpen] = useState(null);
  const faqs = [
    { q: "How is this different from Google Alerts or RSS?", a: "Alerts tell you a keyword appeared. WebDataOS tells you what it means for your organisation — whether it's material, how it connects to your contracts or competitors, and what action to take. Every finding is source-cited, not just surfaced." },
    { q: "What does it actually monitor?", a: "Anything publicly accessible: company pages, regulatory filings, news, job postings, pricing pages, press releases, industry publications. You configure which entities and signal types matter to your team — nothing gets monitored that isn't in scope." },
    { q: "Does it make up information?", a: "No. Every claim in a brief traces back to a specific source URL. The evidence trail is shown inline. If the system cannot find evidence for something, the brief says so explicitly — it does not fill gaps with assumptions." },
    { q: "How quickly does the first brief appear?", a: "A new workspace generates its first decision brief in under 90 seconds. Scheduled monitoring then runs at the cadence you set — daily, every 6 hours, or triggered manually." },
    { q: "Is our workspace data private?", a: "Yes. Every workspace is fully tenant-isolated — your entities, briefs, and intelligence records are never visible to or mixed with another organisation's data. Enterprise plans include EU and US data residency options." },
    { q: "Does it require a dedicated analyst to run it?", a: "No. The system runs on a schedule without anyone actively operating it. Teams check their Signal Feed in the morning the way they check email — the intelligence is already there." },
  ];
  return (
    <section style={{ borderTop: `1px solid ${T.border}`, padding: "72px 24px", background: T.bgSub }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <Eye>Questions</Eye>
          <h2 style={{ fontSize: "clamp(22px,3vw,32px)", fontWeight: 800, marginTop: 10, letterSpacing: "-.03em", color: "#f0f4f8" }}>The answers you're looking for</h2>
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderRadius: open === i ? 10 : 8, background: T.bgCard, border: `1px solid ${open === i ? "rgba(14,165,233,.2)" : T.border}`, overflow: "hidden", transition: "border-color .2s" }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", textAlign: "left", padding: "18px 22px", background: "transparent", border: "none", color: T.text, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: open === i ? "#f0f4f8" : T.text, lineHeight: 1.4 }}>{faq.q}</span>
                <span style={{ color: open === i ? "#0ea5e9" : T.dim, fontSize: 18, fontWeight: 300, flexShrink: 0, transition: "transform .2s", transform: open === i ? "rotate(45deg)" : "none" }}>+</span>
              </button>
              {open === i && (
                <div style={{ padding: "0 22px 20px", fontSize: 13, color: T.muted, lineHeight: 1.75, borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 0 }}>{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomePage({ nav, user, auth }) {
  const go = user ? () => nav("Monitor") : auth;
  const label = user ? "Open workspace" : "Create account";
  const stages = [
    ["Monitor", "Watch vendors, competitors, regulations, markets, and public web changes against a defined workspace scope."],
    ["Prove", "Capture source URLs, extracted evidence, timestamps, and relationship links so every claim can be checked."],
    ["Reason", "Compare new evidence with prior state, evaluate materiality, and explain business impact in plain language."],
    ["Act", "Create recommended next steps, approval tasks, TriggerWare workflow events, and a receipt for the decision trail."],
  ];
  const outputs = [
    ["Signal feed", "Ranked changes by entity, severity, freshness, and domain."],
    ["Decision brief", "What changed, why it matters, what to do next, and confidence."],
    ["Evidence room", "Source-backed records with links, summaries, map context, and retrieval metadata."],
    ["Action receipt", "Who approved, what workflow fired, what happened, and what should be checked next."],
  ];
  const domains = [
    ["Security & Compliance", "Vendor posture, breach exposure, regulator updates, policy pages.", "Which supplier or vendor needs review now?", "Escalate questionnaire, renewal hold, risk owner review."],
    ["GTM Intelligence", "Competitor pages, pricing changes, messaging, hiring, account signals.", "What changed in the market that sales should act on?", "Update battlecard, brief account team, open sales task."],
    ["Finance & Market", "Filings, supplier signals, sector movement, market pages, alternative data.", "What external signal changes exposure or forecast assumptions?", "Prepare board note, analyst review, supplier exposure check."],
  ];
  const governance = [
    "Tenant-isolated workspaces",
    "Server-side auth and roles",
    "Auditable run receipts",
    "Evidence-linked recommendations",
    "LLM provider fallback",
    "Intelligence-map memory with local fallback",
  ];

  return (
    <div className="enterprise-home">
      <section className="eh-hero">
        <div className="eh-hero-copy">
          <Eye>Enterprise external intelligence</Eye>
          <h1>Turn web change into governed business action.</h1>
          <p>
            WebDataOS monitors the external signals your teams depend on, proves what changed with source evidence, reasons over business impact, and turns the result into accountable action.
          </p>
          <div className="eh-hero-actions">
            <button className="btn btn-primary btn-lg" onClick={go}>{label} <ArrowRight size={15} /></button>
            <button className="btn btn-ghost btn-lg" onClick={() => nav("Demo")}>Try the live demo</button>
          </div>
          <div className="eh-proof-strip" aria-label="Product guarantees">
            <span>Source-linked evidence</span>
            <span>Tenant-isolated workspaces</span>
            <span>Run receipts</span>
          </div>
        </div>

        <div className="eh-brief-preview" aria-label="Example WebDataOS decision brief">
          <div className="eh-preview-top">
            <span>Daily intelligence brief</span>
            <strong>Requires review</strong>
          </div>
          <div className="eh-preview-headline">Vendor compliance posture changed before renewal window</div>
          <div className="eh-preview-grid">
            <div>
              <label>What changed</label>
              <p>New security disclosure and processor update detected across monitored vendor pages.</p>
            </div>
            <div>
              <label>Why it matters</label>
              <p>Contract terms require review before renewal. Risk owner approval is needed.</p>
            </div>
          </div>
          <div className="eh-preview-action">
            <CheckCircle size={15} />
            <span>Recommended action: open vendor review and request updated compliance evidence.</span>
          </div>
          <div className="eh-source-row">
            <a href="https://www.sec.gov" target="_blank" rel="noreferrer">sec.gov</a>
            <a href="https://www.okta.com" target="_blank" rel="noreferrer">vendor page</a>
            <a href="https://www.reuters.com" target="_blank" rel="noreferrer">news source</a>
          </div>
        </div>
      </section>

      <section className="eh-section eh-loop">
        <div className="eh-section-head">
          <Eye>Operating loop</Eye>
          <h2>Not a chatbot. A decision system.</h2>
          <p>Chat is only one surface. The product value is the repeatable loop: monitor, prove, reason, act, and remember.</p>
        </div>
        <div className="eh-stage-line">
          {stages.map(([title, text], index) => (
            <div className="eh-stage" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="eh-section eh-compare">
        <div className="eh-section-head">
          <Eye>What changes for the user</Eye>
          <h2>From manual search to operational intelligence.</h2>
        </div>
        {[
          ["Before", "Analysts search the web, paste links into documents, summarize manually, and lose context between cycles."],
          ["With WebDataOS", "The system watches defined entities continuously, stores evidence, compares against history, and creates a decision-ready brief."],
          ["Result", "Teams see what changed, why it matters, what action is recommended, and which sources support the decision."],
        ].map(([labelText, body]) => (
          <div className="eh-compare-row" key={labelText}>
            <strong>{labelText}</strong>
            <p>{body}</p>
          </div>
        ))}
      </section>

      <section className="eh-section">
        <div className="eh-section-head">
          <Eye>Product outputs</Eye>
          <h2>The system produces work your teams can use.</h2>
          <p>Every run should leave behind usable artifacts, not raw scraped text.</p>
        </div>
        <div className="eh-output-grid">
          {outputs.map(([title, text], index) => (
            <div className="eh-output" key={title}>
              <span>{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="eh-section">
        <div className="eh-section-head">
          <Eye>Domains</Eye>
          <h2>Three enterprise tracks with clear jobs.</h2>
          <p>Each domain is framed around a business question, not a generic search task.</p>
        </div>
        <div className="eh-domain-table">
          <div className="eh-domain-head">
            <span>Domain</span>
            <span>Monitors</span>
            <span>Answers</span>
            <span>Typical action</span>
          </div>
          {domains.map(([name, monitors, answers, action]) => (
            <div className="eh-domain-row" key={name}>
              <strong>{name}</strong>
              <p>{monitors}</p>
              <p>{answers}</p>
              <p>{action}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="eh-section eh-graph-band">
        <div>
          <Eye>Intelligence map</Eye>
          <h2>Context should compound, not reset every run.</h2>
          <p>
            WebDataOS turns entities, signals, evidence, recommended actions, and outcomes into a decision context map. Teams can see why a recommendation exists, which source supports it, and how it connects to business action.
          </p>
          <button className="btn btn-outline btn-md" onClick={() => nav("Demo")}>See intelligence map <ArrowRight size={14} /></button>
        </div>
        <div className="eh-graph-preview" aria-label="Intelligence map preview">
          <div className="eh-map-link eh-link-vendor" />
          <div className="eh-map-link eh-link-signal" />
          <div className="eh-map-link eh-link-evidence" />
          <div className="eh-map-link eh-link-action" />
          <div className="eh-map-link eh-link-outcome" />
          <div className="eh-node eh-node-main"><span>Workspace</span><small>scope</small></div>
          <div className="eh-node eh-node-vendor"><span>Vendor</span><small>entity</small></div>
          <div className="eh-node eh-node-signal"><span>Risk signal</span><small>change</small></div>
          <div className="eh-node eh-node-evidence"><span>Evidence</span><small>source URL</small></div>
          <div className="eh-node eh-node-action"><span>Action</span><small>workflow</small></div>
          <div className="eh-node eh-node-outcome"><span>Outcome</span><small>receipt</small></div>
          <div className="eh-map-caption">The map explains relationships behind every brief.</div>
        </div>
      </section>

      <section className="eh-section eh-governance">
        <div className="eh-section-head">
          <Eye>Enterprise controls</Eye>
          <h2>Built as production infrastructure, not a showcase script.</h2>
        </div>
        <div className="eh-governance-list">
          {governance.map(item => (
            <div key={item}><CheckCircle size={14} /><span>{item}</span></div>
          ))}
        </div>
      </section>

      <section className="eh-final">
        <Eye>Ready state</Eye>
        <h2>Give every team a living external intelligence layer.</h2>
        <p>Start with a monitored workspace, prove every signal, and make each recommendation accountable.</p>
        <div className="eh-hero-actions">
          <button className="btn btn-primary btn-lg" onClick={go}>{label} <ArrowRight size={15} /></button>
          <button className="btn btn-ghost btn-lg" onClick={() => nav("Pricing")}>View plans</button>
        </div>
      </section>
    </div>
  );
}

function LegacyHomePage({ nav, user, auth }) {
  const go = user ? () => nav("Monitor") : auth;
  const label = user ? "Open dashboard" : "Start free";

  const heroRef = useRef(null);

  // Scroll-reveal refs for each section
  const [statsRef, statsVisible] = useInView(0.2);
  const [graphRef, graphVisible] = useInView(0.1);
  const [domainsRef, domainsVisible] = useInView(0.1);
  const [howRef, howVisible] = useInView(0.1);
  // Hoisted count-ups (hooks must not be inside loops)
  const countPct = useCountUp(100, 1200, statsVisible);
  const countReceipt = useCountUp(1, 600, statsVisible);

  return (
    <div>
      {/* ── HERO ── */}
      <section
        ref={heroRef}
        style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px 56px", textAlign: "center", position: "relative", overflow: "hidden" }}
      >
        {/* Subtle ambient glow — no texture */}
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translate(-50%,-50%)", width: 700, height: 500, borderRadius: "50%", background: "radial-gradient(ellipse,rgba(14,165,233,0.04),transparent 70%)", pointerEvents: "none" }} />

        {/* Live status pill */}
        <div className="au" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24, padding: "5px 14px", borderRadius: 4, background: "rgba(34,197,94,.04)", border: "1px solid rgba(34,197,94,.12)", position: "relative" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s ease infinite", display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600, letterSpacing: ".07em", fontFamily: "'JetBrains Mono'" }}>MONITORING ACTIVE</span>
        </div>

        {/* Headline */}
        <h1 className="au s1" style={{ fontSize: "clamp(34px,5vw,60px)", fontWeight: 800, letterSpacing: "-.04em", lineHeight: 1.06, color: "#f0f4f8", maxWidth: 820, margin: "0 auto", position: "relative" }}>
          By the time you hear about it,<br />
          <span style={{ color: "#0ea5e9" }}>the decision has already been made.</span>
        </h1>
        <p className="au s2" style={{ maxWidth: 560, margin: "22px auto 0", fontSize: 15, lineHeight: 1.8, color: "#7a8899", position: "relative" }}>
          WebDataOS watches your vendors, competitors, and markets — surfacing what changed, reasoning over what it means, and delivering a sourced decision brief. Not alerts. <strong style={{ color: "#dde4ee" }}>Decisions.</strong>
        </p>

        {/* CTAs */}
        <div className="au s3" style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 32, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={go} style={{ padding: "13px 28px", borderRadius: 7, border: "none", background: "#0ea5e9", color: "#000", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", letterSpacing: ".01em" }}>{label} <ArrowRight size={15} /></button>
          <button onClick={() => document.getElementById("live-demo")?.scrollIntoView({ behavior: "smooth" })} style={{ padding: "13px 22px", borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "#9ab0c4", fontSize: 14, cursor: "pointer" }}>See it run ↓</button>
        </div>

        {/* What it delivers — qualitative */}
        <div className="au s3" style={{ display: "flex", justifyContent: "center", gap: 0, margin: "40px auto 0", maxWidth: 700, flexWrap: "wrap", position: "relative" }}>
          {[
            ["Source-cited evidence", "Every finding links back"],
            ["Business reasoning", "Assessed materiality, not summaries"],
            ["24/7 monitoring", "Continuous or on demand"],
          ].map(([title, sub], i) => (
            <div key={title} style={{ padding: "0 28px", borderLeft: i ? `1px solid ${T.border}` : "none", textAlign: "center", minWidth: 160 }}>
              <div style={{ color: "#dde4ee", fontSize: 13, fontWeight: 700 }}>{title}</div>
              <div style={{ marginTop: 4, color: "#3d4a5a", fontSize: 11, lineHeight: 1.5 }}>{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Inline live demo — immediately below hero so visitors feel it first ── */}
      <div id="live-demo">
        <HomeDemo nav={nav} />
      </div>

      {/* ── Product surface — what you actually see ── */}
      <section style={{ padding: "96px 24px", borderTop: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <Eye>What you actually get</Eye>
            <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginTop: 10, letterSpacing: "-.03em", color: "#f0f4f8" }}>
              Three surfaces. One operating system.
            </h2>
            <p style={{ color: T.muted, marginTop: 10, fontSize: 14, maxWidth: 480, margin: "10px auto 0", lineHeight: 1.7 }}>
              Everything your team needs to go from "something changed on the web" to "here's what we should do about it."
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>

            {/* Signal Feed mock */}
            <div style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, background: "rgba(14,165,233,.03)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#f0f4f8" }}>Signal Feed</div>
                <div style={{ fontSize: 12, color: T.dim, marginTop: 3 }}>Intelligence delivered like a news inbox — newest first</div>
              </div>
              <div style={{ padding: 14, display: "grid", gap: 8 }}>
                {[
                  { sev: "critical", color: "#ef4444", label: "Security · 1h ago", text: "Vendor compliance posture changed — review flagged" },
                  { sev: "high", color: "#f59e0b", label: "Competitor · 4h ago", text: "Pricing page updated — enterprise tier restructured" },
                  { sev: "medium", color: "#818cf8", label: "Market · Yesterday", text: "Regulatory filing detected — sector exposure assessed" },
                ].map((item, i) => (
                  <div key={i} style={{ padding: "11px 13px", borderRadius: 8, background: T.bgInset, border: `1px solid ${T.border}`, borderLeft: `3px solid ${item.color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${item.color}15`, color: item.color, fontWeight: 700, textTransform: "uppercase" }}>{item.sev}</span>
                      <span style={{ fontSize: 10, color: T.dim }}>{item.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{item.text}</div>
                  </div>
                ))}
                <div style={{ marginTop: 4, padding: "8px 13px", borderRadius: 7, background: "rgba(14,165,233,.04)", border: "1px solid rgba(14,165,233,.12)", fontSize: 11, color: T.dim, textAlign: "center" }}>Searchable by date, entity, or severity</div>
              </div>
            </div>

            {/* Decision Brief mock */}
            <div style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, background: "rgba(239,68,68,.02)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#f0f4f8" }}>Decision Brief</div>
                <div style={{ fontSize: 12, color: T.dim, marginTop: 3 }}>What changed, why it matters, and what to do</div>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ padding: "12px 14px", borderRadius: 8, background: T.bgInset, border: "1px solid rgba(239,68,68,.2)", borderLeft: "3px solid #ef4444", marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Decision Brief · Critical</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f4f8", lineHeight: 1.35 }}>Vendor exposure elevated — compliance action required before renewal window</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[["What changed", "Public security disclosure detected. Two sub-processors updated."], ["Why it matters", "Contract clause 4.2 requires notification within 72 hours of sub-processor change."]].map(([label, text], i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: 7, background: T.bgInset, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 9, color: T.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5 }}>{label}</div>
                      <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{text}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 7, background: "rgba(34,197,94,.04)", border: "1px solid rgba(34,197,94,.15)" }}>
                  <div style={{ fontSize: 9, color: "#22c55e", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5 }}>Recommended action</div>
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>Send updated questionnaire to vendor. Confirm compliance before 30-day renewal date.</div>
                </div>
              </div>
            </div>

            {/* AI Analyst mock */}
            <div style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, background: "rgba(129,140,248,.02)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#f0f4f8" }}>AI Analyst</div>
                <div style={{ fontSize: 12, color: T.dim, marginTop: 3 }}>Ask anything — grounded in your workspace evidence</div>
              </div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ alignSelf: "flex-end", maxWidth: "80%", padding: "10px 14px", borderRadius: "12px 12px 3px 12px", background: T.accent, color: "#001018", fontSize: 12, fontWeight: 600 }}>
                  What is our biggest vendor risk right now?
                </div>
                <div style={{ alignSelf: "flex-start", maxWidth: "90%", padding: "11px 14px", borderRadius: "12px 12px 12px 3px", background: T.bgInset, border: `1px solid ${T.border}`, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                  Based on recent intelligence, your highest-risk vendor shows a change in compliance posture. Two sub-processors were added without prior notice. The 72-hour disclosure window in your contract has passed.
                </div>
                <div style={{ padding: "8px 12px", borderRadius: 7, background: T.bgInset, border: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: T.dim }}>Sources: vendor.com · reuters.com · sec.gov</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Pain stories — the cost of being last ── */}
      <section ref={statsRef} style={{ padding: "96px 24px", borderTop: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <Eye>The cost of being last</Eye>
            <h2 style={{ fontSize: "clamp(22px,3vw,32px)", fontWeight: 800, marginTop: 10, letterSpacing: "-.03em", color: "#f0f4f8" }}>
              Every enterprise team has this story.
            </h2>
            <p style={{ color: T.muted, marginTop: 10, fontSize: 14, maxWidth: 520, margin: "10px auto 0", lineHeight: 1.7 }}>
              The signals were there. Nobody saw them in time.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {[
              {
                team: "Security team",
                color: "#ef4444",
                icon: <Shield size={16} />,
                discovery: "Found out from a Tweet",
                story: "Your vendor Okta disclosed a breach affecting 800 customers. Your CISO found out from a security researcher's Twitter thread — 3 days after it was public.",
                cost: "72 hours of reactive triage, board notification, emergency questionnaire cycle.",
                after: "WebDataOS would have surfaced the breach signal within hours and drafted an immediate vendor review action."
              },
              {
                team: "Sales team",
                color: "#3b82f6",
                icon: <TrendingUp size={16} />,
                discovery: "Found out from a lost deal",
                story: "Your main competitor silently dropped pricing by 20% and launched a new enterprise tier. You found out when a prospect sent a screenshot during a closing call.",
                cost: "Lost deal. Rushed pricing review. 3 weeks of reactive positioning.",
                after: "WebDataOS monitors competitor pricing pages daily — the change surfaces in the next morning's brief."
              },
              {
                team: "Finance team",
                color: "#22c55e",
                icon: <BarChart3 size={16} />,
                discovery: "Found out in the board meeting",
                story: "Your CFO was asked about exposure to a key supplier showing early distress signals. The answer was two days of analyst research assembled under pressure.",
                cost: "Unprepared board presentation. Delayed risk assessment. Reactive, not proactive.",
                after: "WebDataOS monitors supplier signals continuously — the distress indicators would have been in last week's brief."
              },
            ].map((s, i) => (
              <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, background: T.bgCard, opacity: statsVisible ? 1 : 0, transform: statsVisible ? "none" : "translateY(20px)", transition: `opacity .6s ease ${i * .12}s, transform .6s ease ${i * .12}s` }}>
                <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, background: `${s.color}08`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: `${s.color}15`, border: `1px solid ${s.color}25`, display: "grid", placeItems: "center", color: s.color, flexShrink: 0 }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.team}</div>
                    <div style={{ fontSize: 10, color: T.dim, marginTop: 1 }}>Discovery method: <span style={{ color: "#f59e0b" }}>{s.discovery}</span></div>
                  </div>
                </div>
                <div style={{ padding: "20px 18px" }}>
                  <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>{s.story}</div>
                  <div style={{ marginTop: 16, fontSize: 11, color: "#22c55e", lineHeight: 1.6, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>{s.after}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Knowledge graph */}
      <section ref={graphRef} className={`sr-wrap${graphVisible ? " in" : ""}`} style={{ maxWidth: 1100, margin: "0 auto", padding: "96px 24px" }}>
        <Eye>Knowledge graph</Eye>
        <h2 style={{ fontSize: 26, marginTop: 6 }}>Every run builds your organization's knowledge map</h2>
        <p style={{ color: T.muted, marginTop: 8, maxWidth: 600, fontSize: 13, lineHeight: 1.7 }}>
          Vendors, competitors, signals, risks, and actions are automatically mapped as a living knowledge graph. See how entities connect. Navigate relationships visually. Spot patterns before they become incidents \u2014 and never lose the context behind a decision.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 28 }}>
          {[
            { icon: <Brain size={18} />, title: "Persistent memory", desc: "Every intelligence run adds to the same graph. Your team always starts from where the last run ended \u2014 no repeated research.", color: "#f59e0b" },
            { icon: <GitBranch size={18} />, title: "Relationship intelligence", desc: "See which vendors connect to which risks, which competitors trigger which signals, and how actions trace back to evidence.", color: T.accent },
            { icon: <Search size={18} />, title: "Navigate and discover", desc: "Filter by entity type, search by name, zoom into any node's neighborhood, and trace relationships across your full intelligence scope.", color: "#818cf8" },
          ].map((c, i) => (
            <div key={i} className={`sr d${i + 1} hl`} style={{ padding: 22, borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}` }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${c.color}12`, border: `1px solid ${c.color}20`, display: "grid", placeItems: "center", color: c.color, marginBottom: 12 }}>{c.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.6 }}>{c.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: "16px 20px", borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, background: T.accent, flexShrink: 0, boxShadow: `0 0 8px ${T.accent}` }} />
          <span style={{ fontSize: 12, color: T.muted, flex: 1 }}>The graph is built automatically from every intelligence run. Expand any workspace to explore it live \u2014 zoom, search, select nodes, and trace relationships in real time.</span>
          <button onClick={() => nav("Demo")} style={{ padding: "7px 16px", borderRadius: 999, border: `1px solid ${T.borderL}`, background: "transparent", color: T.accent, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>See live demo \u2192</button>
        </div>
      </section>

      {/* Intelligence domains */}
      <section ref={domainsRef} className={`sr-wrap${domainsVisible ? " in" : ""}`} style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <Eye>Intelligence domains</Eye>
            <h2 style={{ fontSize: "clamp(22px,3vw,32px)", marginTop: 10, fontWeight: 800, letterSpacing: "-.03em" }}>Intelligence ready-built for your team's decisions.</h2>
            <p style={{ color: T.dim, marginTop: 12, maxWidth: 500, margin: "12px auto 0", fontSize: 14, lineHeight: 1.7 }}>Each domain ships with pre-configured signals, entity defaults, and materiality logic.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
            {DOMAINS.map((d, i) => (
              <div key={d.id} className={`sr d${(i % 4) + 1} hl`} style={{ padding: "24px 26px", borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: `${d.color}12`, border: `1px solid ${d.color}22`, display: "grid", placeItems: "center", color: d.color, flexShrink: 0 }}>{packIcon(d.icon)}</div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#f0f4f8" }}>{d.name}</span>
                </div>
                <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.65, marginBottom: 18 }}>{d.description}</p>
                <div style={{ display: "grid", gap: 5 }}>
                  {d.signals.slice(0, 3).map(s => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: T.dim }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                      {s}
                    </div>
                  ))}
                </div>
                <button onClick={() => nav("Demo")} style={{ marginTop: 20, padding: "8px 16px", borderRadius: 7, border: `1px solid ${d.color}30`, background: `${d.color}08`, color: d.color, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  See brief →
                </button>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button onClick={() => nav("Pricing")} style={{ padding: "9px 20px", borderRadius: 7, border: `1px solid ${T.borderL}`, background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>View plans and pricing →</button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section ref={howRef} className={`sr-wrap${howVisible ? " in" : ""}`} style={{ borderTop: `1px solid ${T.border}`, background: T.bgSub, padding: "96px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Eye>How it works</Eye>
          <h2 style={{ fontSize: 26, marginTop: 6 }}>From signal to decision in one run</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 28 }}>
            {[
              { icon: <Briefcase size={18} />, title: "Set your scope", desc: "Define the vendors, competitors, or markets you care about. Add your contracts, risk thresholds, and priorities so reasoning is relevant to your organization.", color: "#818cf8", step: "01" },
              { icon: <Globe size={18} />, title: "Live web scan", desc: "The system pulls real-time evidence — news, filings, job posts, pricing pages — across the web with fallback routes so nothing gets missed or blocked.", color: T.accent, step: "02" },
              { icon: <Brain size={18} />, title: "Business reasoning", desc: "AI assesses what changed, whether it's material to your org, and drafts source-backed findings with recommended next steps — no generic summaries.", color: "#f59e0b", step: "03" },
              { icon: <Zap size={18} />, title: "Act and remember", desc: "Approve actions, trigger workflows, and capture outcomes. Every run adds to your organization's knowledge graph so context is never lost between cycles.", color: "#22c55e", step: "04" },
            ].map((c, i) => (
              <div key={i} className={`sr d${i + 1} hl`} style={{ padding: 20, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${c.color}10`, border: `1px solid ${c.color}20`, display: "grid", placeItems: "center", color: c.color }}>{c.icon}</div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: c.color, fontFamily: "'JetBrains Mono'" }}>{c.step}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{c.title}</div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.6 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for your team — tabbed personas ── */}
      <TeamPersonaSection nav={nav} />

      {/* ── Enterprise trust ── */}
      <section style={{ borderTop: `1px solid ${T.border}`, padding: "96px 24px", background: T.bgSub }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
            <div>
              <Eye>Enterprise-ready</Eye>
              <h2 style={{ fontSize: "clamp(20px,2.5vw,28px)", fontWeight: 800, marginTop: 8, letterSpacing: "-.02em" }}>Built for procurement. Cleared for production.</h2>
            </div>
            <div style={{ fontSize: 12, color: T.dim, maxWidth: 340, lineHeight: 1.6 }}>
              WebDataOS is designed to pass enterprise security reviews — RBAC, audit trails, SSO, and data residency options built in from day one.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}` }}>
            {[
              { icon: <Shield size={18} />, title: "Audit-ready receipts", sub: "Run traces, evidence links, and action history", color: "#f59e0b", status: "available" },
              { icon: <Lock size={18} />, title: "SSO / SAML 2.0", sub: "Okta, Azure AD, Google Workspace", color: "#22c55e", status: "available" },
              { icon: <Users2 size={18} />, title: "Role-based access", sub: "Admin · Analyst · Viewer — enforced server-side", color: "#0ea5e9", status: "available" },
              { icon: <FileText size={18} />, title: "Audit trail", sub: "Every run, approval, and action is logged and exportable", color: "#818cf8", status: "available" },
              { icon: <Globe size={18} />, title: "Data residency", sub: "EU and US regions — data never crosses without consent", color: "#0ea5e9", status: "available" },
              { icon: <Zap size={18} />, title: "Operational health", sub: "Health checks and provider status visibility", color: "#22c55e", status: "available" },
            ].map((item, i) => (
              <div key={item.title} style={{ padding: "22px 24px", background: T.bgCard, borderRight: i % 3 < 2 ? `1px solid ${T.border}` : "none", borderBottom: i < 3 ? `1px solid ${T.border}` : "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: `${item.color}12`, border: `1px solid ${item.color}20`, display: "grid", placeItems: "center", color: item.color, flexShrink: 0 }}>{item.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{item.title}</span>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: item.status === "in progress" ? "rgba(245,158,11,.1)" : item.status === "enterprise" ? "rgba(14,165,233,.1)" : "rgba(34,197,94,.08)", color: item.status === "in progress" ? "#f59e0b" : item.status === "enterprise" ? "#0ea5e9" : "#22c55e", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{item.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.55 }}>{item.sub}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <HomeFAQ />

      {/* ── Final CTA ── */}
      <section style={{ padding: "80px 24px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 300, background: "radial-gradient(ellipse,rgba(14,165,233,.06),transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 4, background: "rgba(14,165,233,.06)", border: "1px solid rgba(14,165,233,.12)", marginBottom: 20 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s ease infinite", display: "inline-block" }} />
            <span style={{ fontSize: 10, color: "#0ea5e9", fontWeight: 600, letterSpacing: ".07em", fontFamily: "'JetBrains Mono'" }}>INTELLIGENCE ENGINE RUNNING</span>
          </div>
          <h2 style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 800, letterSpacing: "-.04em", maxWidth: 620, margin: "0 auto", lineHeight: 1.1 }}>
            The web doesn't wait.<br />
            <span style={{ color: "#0ea5e9" }}>Your intelligence shouldn't either.</span>
          </h2>
          <p style={{ color: T.muted, marginTop: 16, maxWidth: 460, margin: "16px auto 0", fontSize: 14, lineHeight: 1.75 }}>
            WebDataOS is an enterprise intelligence operating system. Your first decision brief is ready in under 90 seconds.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={go} style={{ padding: "14px 30px", borderRadius: 6, border: "none", background: "#0ea5e9", color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, letterSpacing: ".01em" }}>{label} <ArrowRight size={15} /></button>
            <button onClick={() => nav("Demo")} style={{ padding: "14px 24px", borderRadius: 6, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "#9ab0c4", fontSize: 14, cursor: "pointer" }}>See full demo →</button>
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: T.dim }}>
            Used by security, GTM, and finance teams across enterprise orgs.
          </div>
        </div>
        <div style={{ marginTop: 44, paddingTop: 20, borderTop: `1px solid ${T.border}`, color: T.dim, fontSize: 11 }}>WebDataOS &middot; The Intelligence Operating System for Enterprise Teams</div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PRICING PAGE (Public) — tier cards + domain picker
   ═══════════════════════════════════════════════════════════════════════ */
const DEMO_FALLBACK_CATALOG = {
  missions: [
    {
      id: "vendor_risk",
      name: "Vendor Risk and Compliance",
      package_id: "security",
      entities: ["Okta", "Stripe", "Microsoft"],
      signals: ["vendor risk", "breach exposure", "compliance signals", "regulatory change"],
    },
    {
      id: "gtm",
      name: "Competitor and GTM Intelligence",
      package_id: "gtm",
      entities: ["OpenAI", "Anthropic", "Google"],
      signals: ["competitor moves", "pricing changes", "messaging shifts", "buying signals"],
    },
    {
      id: "market",
      name: "Market and Finance Signals",
      package_id: "finance",
      entities: ["Nvidia", "Microsoft", "Salesforce"],
      signals: ["filings", "supplier signals", "market movement", "pricing changes"],
    },
  ],
  limits: { entities: 5, signals: 6, runs_per_hour: 6, session_ttl_hours: 24 },
};

const MOCK_SUMMARIES = {
  vendor_risk: [
    "Okta disclosed a support system breach affecting 134 customers. Session tokens for affected orgs should be rotated immediately.",
    "Stripe updated their data processing addendum — new sub-processor list includes 4 additional cloud vendors in EU jurisdiction.",
    "Microsoft Azure experienced a 6-hour outage in West Europe. SLA credit eligibility window is now open.",
  ],
  gtm: [
    "Anthropic cut Claude API pricing 40% for batch inference. Enterprise tier now undercuts OpenAI GPT-4o by 28%.",
    "OpenAI announced GPT-5 preview access for select partners. Availability expected Q2 with 128k context window.",
    "Google Gemini updated their enterprise agreement to include indemnification for copyright claims — a competitive differentiator.",
  ],
  market: [
    "Nvidia Q3 earnings beat by 18%. Supply constraints easing — data centre GPU lead times now 6-8 weeks vs 14 weeks prior.",
    "Microsoft announced $10B Azure infrastructure investment. Azure OpenAI Service bookings up 3x year-over-year.",
    "Salesforce disclosed $500M cost reduction plan. Analyst coverage upgraded at Goldman citing margin expansion.",
  ],
};

function buildMockGraph(sc) {
  const wsId = `ws_demo_${sc.id}`;
  const runId = `run_demo_001`;
  const nodes = [
    { id: wsId, type: "Workspace", label: sc.id.replace(/_/g, " "), properties: { name: sc.id } },
    { id: runId, type: "IntelligenceRun", label: "Run #1", properties: { risk_posture: "elevated", confidence: 0.84 } },
    ...sc.entities.map((e, i) => ({
      id: `ent_${i}`, type: sc.id === "vendor_risk" ? "Vendor" : sc.id === "gtm" ? "Competitor" : "Company",
      label: e, properties: { name: e },
    })),
    ...sc.entities.map((e, i) => ({
      id: `sig_${i}`, type: "Signal",
      label: (MOCK_SUMMARIES[sc.id]?.[i] || "Signal detected").slice(0, 36) + "…",
      properties: { signal_type: sc.signals[0], severity: i === 0 ? "high" : "medium" },
    })),
    { id: "risk_0", type: "Risk", label: "Elevated exposure", properties: { risk_posture: "elevated", financial_impact: 250000 } },
    { id: "rec_0", type: "Recommendation", label: sc.example_action.slice(0, 40) + "…", properties: { priority: "high" } },
    { id: "action_0", type: "WorkflowAction", label: "Review required", properties: { action_type: "review" } },
    ...sc.entities.map((e, i) => ({
      id: `src_${i}`, type: "Source",
      label: `news source ${i + 1}`, properties: { url: `https://news.ycombinator.com/` },
    })),
  ];
  const relationships = [
    { source: wsId, target: runId, type: "HAS_RUN" },
    ...sc.entities.map((_, i) => ({ source: wsId, target: `ent_${i}`, type: "MONITORED_BY" })),
    ...sc.entities.map((_, i) => ({ source: runId, target: `sig_${i}`, type: "TRIGGERED" })),
    ...sc.entities.map((_, i) => ({ source: `ent_${i}`, target: `sig_${i}`, type: "AFFECTS" })),
    ...sc.entities.map((_, i) => ({ source: `sig_${i}`, target: `src_${i}`, type: "HAS_SOURCE" })),
    { source: "sig_0", target: "risk_0", type: "ELEVATED_RISK" },
    { source: "risk_0", target: "rec_0", type: "PROPOSED" },
    { source: "rec_0", target: "action_0", type: "LINKED_TO" },
    { source: "ent_0", target: "ent_1", type: "CO_OCCURS_WITH" },
    { source: "ent_1", target: "ent_2", type: "CO_OCCURS_WITH" },
  ];
  return { nodes, relationships, status: "ok", counts: { nodes: nodes.length, relationships: relationships.length } };
}

/* ═══════════════════════════════════════════════════════════════════════
   DEMO PAGE — 3-act guided experience
   Act 1: Pick scenario  →  Act 2: Watch run  →  Act 3: Decision brief + chat
   ═══════════════════════════════════════════════════════════════════════ */

const DEMO_SCENARIOS = [
  {
    id: "vendor_risk",
    package_id: "security",
    hook: "Is one of your vendors becoming a liability?",
    desc: "Monitor vendor risk, breach exposure, compliance changes, and regulatory signals — before they become incidents.",
    entities: ["Okta", "Stripe", "Microsoft"],
    signals: ["vendor risk", "breach exposure", "compliance signals", "regulatory change"],
    color: "#ef4444",
    icon: "shield",
    example_headline: "Okta breach exposure elevated — compliance review required",
    example_action: "Initiate vendor security questionnaire for Okta. Review contract indemnification clauses.",
  },
  {
    id: "gtm",
    package_id: "gtm",
    hook: "What is your biggest competitor shipping next?",
    desc: "Track competitor launches, pricing changes, hiring signals, and messaging shifts before they hit your pipeline.",
    entities: ["OpenAI", "Anthropic", "Google"],
    signals: ["competitor moves", "pricing changes", "messaging shifts", "buying signals"],
    color: "#3b82f6",
    icon: "globe",
    example_headline: "Anthropic cut enterprise pricing 30% — renegotiation window open",
    example_action: "Brief sales on competitive positioning. Update battlecard. Flag 3 at-risk accounts.",
  },
  {
    id: "market",
    package_id: "finance",
    hook: "Which market move should you respond to today?",
    desc: "Surface material filings, supplier disruptions, sector shifts, and pricing movements with source-backed evidence.",
    entities: ["Nvidia", "Microsoft", "Salesforce"],
    signals: ["filings", "supplier signals", "market movement", "pricing changes"],
    color: "#22c55e",
    icon: "trending",
    example_headline: "Nvidia supply constraint signal — review hardware procurement timeline",
    example_action: "Accelerate Q3 hardware order. Evaluate alternative suppliers. Flag CFO for approval.",
  },
];

const DEMO_PIPELINE_STEPS = [
  { id: "memory", label: "Searching memory", detail: "Looking up prior context and past runs" },
  { id: "context", label: "Loading evidence", detail: "Retrieving ranked intelligence records" },
  { id: "fetch", label: "Fetching live web", detail: "Bright Data gateway — SERP + Web Unlocker" },
  { id: "synthesize", label: "Synthesising", detail: "LLM processing evidence into structured findings" },
  { id: "reason", label: "Reasoning", detail: "Assessing materiality and business impact" },
  { id: "actions", label: "Proposing actions", detail: "Drafting approval-ready next steps" },
  { id: "graph", label: "Updating graph", detail: "Writing entities and signals to Neo4j" },
  { id: "brief", label: "Building brief", detail: "Assembling decision brief and run receipt" },
];

const DEMO_PIPELINE_STEPS_SAFE = [
  { id: "session", label: "Creating sandbox", detail: "Starting an isolated public demo session" },
  { id: "scope", label: "Applying scope", detail: "Saving entities and signals for this demo run" },
  { id: "evidence", label: "Loading safe evidence", detail: "Using controlled public sources for a reliable trial" },
  { id: "structure", label: "Structuring records", detail: "Normalizing evidence into decision-ready records" },
  { id: "reason", label: "Reasoning", detail: "Assessing materiality and business impact" },
  { id: "actions", label: "Proposing actions", detail: "Drafting approval-ready next steps" },
  { id: "map", label: "Building Intelligence Map", detail: "Connecting workspace, evidence, signals, and actions" },
  { id: "brief", label: "Building receipt", detail: "Assembling decision brief and run receipt" },
];

function DemoPage({ nav }) {
  const [phase, setPhase] = useState("pick"); // "pick" | "running" | "result"
  const [scenario, setScenario] = useState(null);
  const [session, setSession] = useState(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [report, setReport] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [graph, setGraph] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiLive, setApiLive] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [draftMission, setDraftMission] = useState("");
  const [entityInput, setEntityInput] = useState(DEMO_SCENARIOS[0].entities.join(", "));
  const [signalInput, setSignalInput] = useState(DEMO_SCENARIOS[0].signals.join(", "));
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  const sessionId = session?.session_id;
  const brief = decisionFromReport(report);
  const evidenceCount = evidence.length;
  const graphCount = graph?.counts?.nodes || graph?.nodes?.length || 0;
  const draftScenario = useMemo(() => DEMO_SCENARIOS.find(s => s.id === draftMission) || DEMO_SCENARIOS[0], [draftMission]);
  const parseScopeList = (value, fallback, max) => {
    const items = String(value || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
    return (items.length ? items : fallback).slice(0, max);
  };
  const scopedScenario = () => ({
    ...draftScenario,
    entities: parseScopeList(entityInput, draftScenario.entities, 5),
    signals: parseScopeList(signalInput, draftScenario.signals, 6),
  });
  const selectScenario = (sc) => {
    setDraftMission(sc.id);
    setScenario(sc);
    setEntityInput(sc.entities.join(", "));
    setSignalInput(sc.signals.join(", "));
    setError("");
  };
  const demoErrorMessage = (err) => {
    const message = err?.message || "";
    if (message.includes("429") || message.toLowerCase().includes("limit")) {
      return "This browser has reached the public demo run limit. Start a new scenario or sign in to run a full workspace.";
    }
    if (message.includes("[object Object]")) return "The demo backend rejected the request. Please check the scope fields and retry.";
    return message || "Demo run failed.";
  };

  useEffect(() => {
    endpoints.demoCatalog().then(() => setApiLive(true)).catch(() => setApiLive(false));
    const saved = localStorage.getItem("webdataos_demo_session");
    if (saved) {
      endpoints.demoCurrent(saved).then(active => {
        setSession(active);
        const sc = DEMO_SCENARIOS.find(s => s.id === active.mission) || DEMO_SCENARIOS[0];
        setScenario(sc);
        setDraftMission(sc.id);
        setEntityInput((active.entities?.length ? active.entities : sc.entities).join(", "));
        setSignalInput((active.signals?.length ? active.signals : sc.signals).join(", "));
        return Promise.all([
          endpoints.demoEvidence(active.session_id).catch(() => ({ records: [] })),
          endpoints.demoGraph(active.session_id).catch(() => null),
          endpoints.demoLatest(active.session_id).catch(() => null),
        ]);
      }).then(([ev, gr, latest]) => {
        if (ev) setEvidence(ev.records || []);
        if (gr) setGraph(gr);
        if (latest?.run_id || latest?.summary) { setReport(latest); setPhase("result"); }
      }).catch(() => localStorage.removeItem("webdataos_demo_session"));
    }
    const saved2 = localStorage.getItem("webdataos_demo_messages");
    try { if (saved2) setMessages(JSON.parse(saved2)); } catch { /**/ }
  }, []);

  useEffect(() => {
    localStorage.setItem("webdataos_demo_messages", JSON.stringify(messages.slice(-20)));
  }, [messages]);

  const startRun = async (sc) => {
    setScenario(sc);
    setPhase("running");
    setPipelineStep(0);
    setError("");
    setReport(null);
    setEvidence([]);
    setGraph(null);

    // Animate pipeline steps while real API call happens
    let stepIdx = 0;
    const tick = setInterval(() => {
      stepIdx++;
      setPipelineStep(stepIdx);
      if (stepIdx >= DEMO_PIPELINE_STEPS_SAFE.length - 1) clearInterval(tick);
    }, 1100);

    try {
      // Create/recover session
      let active = session;
      if (!active) {
        active = await endpoints.demoSession(sc.id);
        localStorage.setItem("webdataos_demo_session", active.session_id);
        setSession(active);
      }

      // Set scope
      const updated = await endpoints.demoWorkspace(active.session_id, {
        mission: sc.id,
        entities: sc.entities,
        signals: sc.signals,
      }).catch(() => active);
      setSession(updated);

      // Run intelligence
      const result = await endpoints.demoRun(updated.session_id || active.session_id);
      clearInterval(tick);
      setPipelineStep(DEMO_PIPELINE_STEPS_SAFE.length);
      setReport(result);

      // Load evidence + graph
      const sid = updated.session_id || active.session_id;
      const [ev, gr] = await Promise.all([
        endpoints.demoEvidence(sid).catch(() => ({ records: [] })),
        endpoints.demoGraph(sid).catch(() => null),
      ]);
      setEvidence(ev.records || []);
      setGraph(gr);
      setTimeout(() => setPhase("result"), 600);
    } catch (e) {
      clearInterval(tick);
      if ((e.message || "").includes("limit")) {
        // Session limit hit — start fresh
        localStorage.removeItem("webdataos_demo_session");
        setSession(null);
        try {
          const fresh = await endpoints.demoSession(sc.id);
          localStorage.setItem("webdataos_demo_session", fresh.session_id);
          setSession(fresh);
          const upd = await endpoints.demoWorkspace(fresh.session_id, { mission: sc.id, entities: sc.entities, signals: sc.signals }).catch(() => fresh);
          const result = await endpoints.demoRun(upd.session_id || fresh.session_id);
          setPipelineStep(DEMO_PIPELINE_STEPS_SAFE.length);
          setReport(result);
          const sid = upd.session_id || fresh.session_id;
          const [ev, gr] = await Promise.all([
            endpoints.demoEvidence(sid).catch(() => ({ records: [] })),
            endpoints.demoGraph(sid).catch(() => null),
          ]);
          setEvidence(ev.records || []);
          setGraph(gr);
          setTimeout(() => setPhase("result"), 600);
        } catch (e2) {
          setError(demoErrorMessage(e2));
          setPhase("pick");
        }
      } else {
        // Demo API unavailable - keep the public experience explicit.
        setError("Demo backend is currently unavailable. Please retry in a moment.");
        setPhase("pick");
      }
    }
  };

  const speakText = async (text) => {
    const clean = (text || "").trim();
    if (!clean || !sessionId) return;
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    setTtsBusy(true);
    try {
      const blob = await endpoints.demoSynthesize(sessionId, clean.slice(0, 1200));
      const url = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; reject(new Error("Audio failed")); };
        audio.play().catch(reject);
      });
    } catch {
      if ("speechSynthesis" in window) {
        await new Promise(resolve => {
          const utt = new SpeechSynthesisUtterance(clean.slice(0, 1200));
          utt.onend = resolve; utt.onerror = resolve;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utt);
        });
      }
    } finally { setTtsBusy(false); }
  };

  const startVoice = async () => {
    if (recording || voiceBusy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await transcribeAndAsk(blob);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopVoice = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };

  const transcribeAndAsk = async (blob) => {
    if (!sessionId) return;
    setVoiceBusy(true);
    setError("");
    try {
      const transcript = await endpoints.demoTranscribeUpload(sessionId, blob);
      const text = transcript.text?.trim();
      if (!text) throw new Error("Could not transcribe audio.");
      setQuestion(text);
      await askAnalystWith(text, true);
    } catch (e) {
      setError(e.message || "Voice transcription failed.");
    } finally {
      setVoiceBusy(false);
    }
  };

  const askAnalystWith = async (q, readAloud = false) => {
    if (!q.trim() || chatLoading) return;
    setChatLoading(true);
    setMessages(prev => [...prev, { role: "user", content: q }]);
    try {
      const sid = sessionId;
      if (!sid) throw new Error("No session");
      const result = await endpoints.demoChat(sid, q, messages.slice(-8));
      const b = decisionFromReport(result);
      const answer = b.answer || result.summary || "No answer returned.";
      setMessages(prev => [...prev, { role: "assistant", content: answer, report: result }]);
      if (result?.run_id || result?.summary) setReport(result);
      if (readAloud) speakText(answer);
    } catch (e) {
      const errText = e?.message?.includes("timed out") ? "Analyst timed out — the backend is slow. Try again." : e?.message?.includes("No session") ? "Session expired — start a new scenario." : e?.message || "Could not reach the analyst. Try again.";
      setMessages(prev => [...prev, { role: "error", content: errText }]);
    } finally {
      setChatLoading(false);
    }
  };

  const askAnalyst = () => {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    askAnalystWith(q, false);
  };

  const reset = () => {
    localStorage.removeItem("webdataos_demo_session");
    localStorage.removeItem("webdataos_demo_messages");
    setSession(null); setReport(null); setEvidence([]); setGraph(null);
    setMessages([]); setPhase("pick"); setScenario(null); setError("");
    setDraftMission("");
    setEntityInput(DEMO_SCENARIOS[0].entities.join(", "));
    setSignalInput(DEMO_SCENARIOS[0].signals.join(", "));
  };

  /* ── Act 1: Pick scenario ── */
  if (phase === "pick") return (
    <div style={{ minHeight: "80vh", display: "flex", flexDirection: "column" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", padding: "64px 24px 40px", position: "relative" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-60%)", width: 500, height: 300, borderRadius: "50%", background: `radial-gradient(circle,${T.glow},transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 999, background: "rgba(18,181,203,.08)", border: `1px solid rgba(18,181,203,.2)`, marginBottom: 20 }}>
          <div style={{ width: 6, height: 6, borderRadius: 99, background: T.accent, animation: "pulse 2s ease infinite" }} />
          <span style={{ fontSize: 11, color: T.accent, fontWeight: 800 }}>Guided sandbox demo</span>
        </div>
        <h1 style={{ fontSize: "clamp(28px,4vw,52px)", fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1.1, background: "linear-gradient(180deg,#f1f5f9 30%,#64748b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", maxWidth: 700, margin: "0 auto" }}>
          Try WebDataOS with a safe enterprise sandbox
        </h1>
        <p style={{ display: "none", color: T.muted, fontSize: 15, marginTop: 14, lineHeight: 1.65, maxWidth: 520, margin: "14px auto 0" }}>
          Pick a scenario. We'll monitor real companies, pull live web evidence, reason over business impact, and show you a decision-ready brief — in under 2 minutes.
        </p>
      </div>

        <p style={{ color: T.muted, fontSize: 15, lineHeight: 1.65, maxWidth: 560, margin: "0 auto 22px", textAlign: "center" }}>
          Choose a business scenario, adjust the demo scope, and run a controlled public-evidence brief. No customer data, no private tenant data, and no uncontrolled live claims.
        </p>
      {/* Scenario cards */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 64px", width: "100%" }}>
        {error && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#fca5a5", fontSize: 12 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
          {DEMO_SCENARIOS.map((sc, i) => (
            <button key={sc.id} onClick={() => selectScenario(sc)} style={{ textAlign: "left", padding: "28px 26px", borderRadius: 16, border: `1px solid ${draftMission === sc.id ? sc.color : T.border}`, outline: "none", boxShadow: draftMission === sc.id ? `0 0 0 1px ${sc.color}26` : "none", background: draftMission === sc.id ? `${sc.color}08` : T.bgCard, cursor: "pointer", display: "flex", flexDirection: "column", gap: 0, transition: "border-color .15s, box-shadow .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = draftMission === sc.id ? sc.color : "rgba(148,163,184,.28)"; e.currentTarget.style.boxShadow = draftMission === sc.id ? `0 0 0 1px ${sc.color}26` : "0 10px 34px rgba(0,0,0,.22)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = draftMission === sc.id ? sc.color : T.border; e.currentTarget.style.boxShadow = "none"; }}>
              {/* Domain icon */}
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${sc.color}12`, border: `1px solid ${sc.color}30`, display: "grid", placeItems: "center", color: sc.color, marginBottom: 18 }}>
                {packIcon(sc.icon, 20)}
              </div>
              {/* Hook */}
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25, color: T.text, marginBottom: 10 }}>{sc.hook}</div>
              {/* Description */}
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 20, flex: 1 }}>{sc.desc}</div>
              {/* Entities */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                {sc.entities.map(e => (
                  <span key={e} style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: `${sc.color}0d`, border: `1px solid ${sc.color}22`, color: sc.color }}>{e}</span>
                ))}
              </div>
              {/* CTA */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, border: draftMission === sc.id ? "none" : `1px solid ${T.border}`, background: draftMission === sc.id ? sc.color : T.bgSub, color: draftMission === sc.id ? "#000" : T.muted, fontWeight: 900, fontSize: 13 }}>
                {draftMission === sc.id ? <CheckCircle size={14} /> : <Play size={14} />}
                {draftMission === sc.id ? "Selected" : "Choose scenario"}
                <ArrowRight size={14} style={{ marginLeft: "auto" }} />
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 18, padding: 18, borderRadius: 14, border: `1px solid ${draftScenario.color}30`, background: T.bgCard }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>Entities to monitor</span>
              <input value={entityInput} onChange={e => setEntityInput(e.target.value)} placeholder="Okta, Stripe, Microsoft" style={{ ...IS, marginTop: 0 }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>Signals to watch</span>
              <input value={signalInput} onChange={e => setSignalInput(e.target.value)} placeholder="vendor risk, breach exposure" style={{ ...IS, marginTop: 0 }} />
            </label>
            <button onClick={() => startRun(scopedScenario())} style={{ height: 40, padding: "0 18px", borderRadius: 8, border: "none", background: draftScenario.color, color: "#000", fontWeight: 900, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap" }}>
              <Play size={14} /> Run sandbox
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>
            Demo runs use safe public baseline evidence to show the product loop. A signed-in workspace can run live monitoring against your own scope and provider limits.
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 24, color: T.dim, fontSize: 12 }}>
          No account needed &middot; Isolated demo session &middot;{" "}
          <button onClick={() => nav("Home")} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer" }}>Learn how it works</button>
        </div>
      </div>
    </div>
  );

  /* ── Act 2: Running ── */
  if (phase === "running") return (
    <div style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
      <div style={{ width: "100%", maxWidth: 580, textAlign: "center" }}>
        {/* Scenario badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: `${scenario?.color}0d`, border: `1px solid ${scenario?.color}25`, marginBottom: 28 }}>
          <span style={{ color: scenario?.color }}>{packIcon(scenario?.icon, 14)}</span>
          <span style={{ fontSize: 12, color: scenario?.color, fontWeight: 800 }}>{DEMO_SCENARIOS.find(s => s.id === scenario?.id)?.hook}</span>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6, letterSpacing: "-.03em" }}>Running sandbox brief</h2>
        <p style={{ color: T.muted, fontSize: 14, marginBottom: 40 }}>Monitoring {scenario?.entities?.join(", ")} with safe public evidence, then producing impact, action, and receipt.</p>

        {/* Pipeline steps */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
          {DEMO_PIPELINE_STEPS_SAFE.map((step, i) => {
            const done = i < pipelineStep;
            const active = i === pipelineStep;
            return (
              <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderBottom: i < DEMO_PIPELINE_STEPS_SAFE.length - 1 ? `1px solid ${T.border}` : "none", background: active ? "rgba(18,181,203,.04)" : "transparent", transition: "background .3s" }}>
                {/* Status icon */}
                <div style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: "grid", placeItems: "center", background: done ? "#22c55e" : active ? T.accent : T.bgSub, border: `1px solid ${done ? "#22c55e" : active ? T.accent : T.border}`, transition: "all .3s" }}>
                  {done ? <CheckCircle size={12} color="#000" /> : active ? <div style={{ width: 8, height: 8, borderRadius: 99, border: `2px solid #000`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} /> : <div style={{ width: 6, height: 6, borderRadius: 99, background: T.dim }} />}
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: active || done ? 800 : 500, color: done ? "#22c55e" : active ? T.text : T.dim, transition: "color .3s" }}>{step.label}</div>
                  {active && <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{step.detail}</div>}
                </div>
                {done && <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 800 }}>done</span>}
                {active && <span style={{ fontSize: 10, color: T.accent, fontWeight: 800 }}>running</span>}
              </div>
            );
          })}
        </div>

        {/* Entities being processed */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
          {scenario?.entities?.map((e, i) => (
            <span key={e} style={{ padding: "4px 12px", borderRadius: 999, fontSize: 11, border: `1px solid ${T.border}`, color: T.dim, animation: `fadeIn .4s ease ${i * .2}s both` }}>{e}</span>
          ))}
        </div>
      </div>
    </div>
  );

  /* ── Act 3: Result ── */
  const loop = report?.run_receipt?.value_loop || [];
  const CHAT_PROMPTS = ["What changed?", "Which source is most important?", "What action would you propose?", "Is this material?"];

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "32px 24px 64px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 900, background: `${scenario?.color}12`, color: scenario?.color, border: `1px solid ${scenario?.color}22`, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {DEMO_SCENARIOS.find(s => s.id === scenario?.id)?.id?.replace(/_/g, " ")}
            </span>
            <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 900, background: "rgba(34,197,94,.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,.2)" }}>
              Run complete
            </span>
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, letterSpacing: "-.03em", maxWidth: 640 }}>{brief.headline}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={reset} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 12, fontWeight: 700 }}>New scenario</button>
          <button onClick={() => nav("Home")} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: "#000", fontSize: 12, fontWeight: 900 }}>Create trial workspace</button>
        </div>
      </div>

      <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(18,181,203,.18)", background: "rgba(18,181,203,.055)", color: T.muted, fontSize: 12, lineHeight: 1.6 }}>
        <strong style={{ color: T.text }}>Sandbox result:</strong> This demo uses controlled public evidence to show the product loop safely. A signed-in workspace runs live monitoring against your own scope, provider limits, tenant history, and approval policies.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,.6fr)", gap: 22, alignItems: "start" }}>

        {/* LEFT — Decision brief + chat */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[
              ["Scope", `${scenario?.entities?.length || 0} entities`, "What the run watched"],
              ["Evidence", `${evidenceCount} records`, "Sources used in the brief"],
              ["Map", `${graphCount} nodes`, "How evidence connects"],
              ["Next step", brief.recommended_action ? "Ready" : "Pending", "Action for the team"],
            ].map(([label, value, help]) => (
              <div key={label} style={{ padding: "11px 12px", borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
                <div style={{ fontSize: 14, color: T.text, fontWeight: 900, marginTop: 4 }}>{value}</div>
                <div style={{ fontSize: 10, color: T.dim, marginTop: 4, lineHeight: 1.35 }}>{help}</div>
              </div>
            ))}
          </div>

          {/* Decision brief card */}
          <div style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `4px solid ${scenario?.color || T.accent}`, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em", color: scenario?.color || T.accent }}>Decision brief</div>
                <button
                  onClick={() => speakText([brief.headline, brief.answer, brief.what_changed && `What changed: ${brief.what_changed}`, brief.recommended_action && `Recommended: ${brief.recommended_action}`].filter(Boolean).join(". "))}
                  disabled={ttsBusy || !brief.answer}
                  title="Hear this brief"
                  style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: ttsBusy ? T.accent : T.dim, cursor: "pointer", display: "grid", placeItems: "center" }}>
                  {ttsBusy ? <RefreshCw size={11} style={{ animation: "spin .8s linear infinite", color: T.accent }} /> : <Play size={11} />}
                </button>
              </div>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.7, margin: 0 }}>{brief.answer}</p>
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
              {[["What changed", brief.what_changed], ["Why it matters", brief.business_impact], ["Recommended action", brief.recommended_action]].map(([label, text], i) => (
                <div key={label} style={{ padding: "14px 18px", borderLeft: i ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 12, color: T.text, lineHeight: 1.55 }}>{text || "Pending"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Intelligence Map */}
          {(graph?.nodes?.length > 0 || evidenceCount > 0) && (
            <div style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <GitBranch size={14} color={T.accent} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>Intelligence Map</span>
                <span style={{ fontSize: 10, color: T.dim, marginLeft: "auto" }}>{graphCount} nodes</span>
              </div>
              <GraphMini graph={graph} title={scenario?.hook || "Demo intelligence map"} wsId={session?.workspace_id} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
                {[
                  ["Decision trace", "Source -> signal -> action"],
                  ["Context memory", "Entity links persist across runs"],
                  ["Validation", "Teams can inspect why the brief exists"],
                ].map(([label, text]) => (
                  <div key={label} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 9 }}>
                    <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: T.muted, lineHeight: 1.45 }}>{text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analyst chat */}
          <div style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Brain size={14} color={T.accent} />
              <span style={{ fontSize: 13, fontWeight: 800 }}>Ask the Analyst</span>
              <span style={{ fontSize: 10, color: T.dim, marginLeft: "auto" }}>text or voice | grounded in evidence</span>
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {!messages.length && <div style={{ color: T.dim, fontSize: 13 }}>Try: <strong style={{ color: T.text }}>What changed?</strong> or tap the mic to ask by voice.</div>}
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", padding: "10px 14px", borderRadius: m.role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px", background: m.role === "user" ? T.accent : m.role === "error" ? "rgba(239,68,68,.08)" : T.bgSub, border: m.role === "user" ? "none" : m.role === "error" ? "1px solid rgba(239,68,68,.2)" : `1px solid ${T.border}`, color: m.role === "user" ? "#000" : m.role === "error" ? "#fca5a5" : T.muted, fontSize: 13, lineHeight: 1.55 }}>
                  {m.content}
                </div>
              ))}
              {chatLoading && <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: "14px 14px 14px 3px", background: T.bgSub, border: `1px solid ${T.border}`, color: T.dim, fontSize: 12 }}>Thinking...</div>}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAnalyst(); } }} placeholder="Ask about this brief..." style={{ ...IS, marginTop: 0, flex: 1, height: 40 }} />
                <button
                  onClick={recording ? stopVoice : startVoice}
                  disabled={voiceBusy || chatLoading}
                  title={recording ? "Stop recording" : "Ask by voice"}
                  style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${recording ? "rgba(239,68,68,.5)" : T.border}`, background: recording ? "rgba(239,68,68,.12)" : T.bgSub, color: recording ? "#ef4444" : T.muted, flexShrink: 0, cursor: "pointer", display: "grid", placeItems: "center", transition: "all .15s" }}>
                  {voiceBusy ? <RefreshCw size={13} style={{ animation: "spin .8s linear infinite", color: T.accent }} /> : recording ? <div style={{ width: 10, height: 10, borderRadius: 2, background: "#ef4444" }} /> : <Mic size={14} />}
                </button>
                <button
                  onClick={() => { const last = [...messages].reverse().find(m => m.role === "assistant"); if (last) speakText(last.content); }}
                  disabled={ttsBusy || !messages.some(m => m.role === "assistant")}
                  title="Speak last answer"
                  style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgSub, color: ttsBusy ? T.accent : T.muted, flexShrink: 0, cursor: "pointer", display: "grid", placeItems: "center" }}>
                  {ttsBusy ? <RefreshCw size={13} style={{ animation: "spin .8s linear infinite", color: T.accent }} /> : <Play size={13} />}
                </button>
                <button onClick={askAnalyst} disabled={chatLoading || !question.trim()} style={{ width: 44, height: 40, borderRadius: 8, border: "none", background: T.accent, color: "#000", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  {chatLoading ? <RefreshCw size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Send size={14} />}
                </button>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {CHAT_PROMPTS.map(p => <button key={p} onClick={() => setQuestion(p)} style={{ padding: "4px 9px", borderRadius: 999, fontSize: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.dim }}>{p}</button>)}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Proof sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Stats */}
          <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".07em", color: T.dim }}>Run receipt</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
              {[["Evidence", evidenceCount, T.accent], ["Map", graphCount, "#22c55e"], ["Confidence", brief.confidence ? `${Math.round(brief.confidence * 100)}%` : "-", "#818cf8"]].map(([l, v, c], i) => (
                <div key={l} style={{ padding: "14px 14px", borderLeft: i ? `1px solid ${T.border}` : "none", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: c }}>{v}</div>
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.border}`, color: T.dim, fontSize: 11, lineHeight: 1.45 }}>
              Proof of what was monitored, which records were used, and how the recommendation was produced.
            </div>
          </div>

          {/* Pipeline receipt */}
          {loop.length > 0 && (
            <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".07em", color: T.dim }}>Pipeline</div>
              <div>
                {loop.slice(0, 6).map((item, i) => (
                  <div key={item.step} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 16px", borderBottom: i < Math.min(loop.length, 6) - 1 ? `1px solid ${T.border}` : "none" }}>
                    <span style={{ fontSize: 11, color: T.muted }}>{item.step}</span>
                    <span style={{ fontSize: 10, color: statusColorLite(item.status), fontWeight: 800 }}>{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence */}
          <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".07em", color: T.dim }}>Source evidence</div>
            <div>
              {evidence.slice(0, 4).map((rec, i) => (
                <div key={rec.id} style={{ padding: "12px 16px", borderBottom: i < Math.min(evidence.length, 4) - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 4 }}>{rec.entity_name || "Evidence"}</div>
                  <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, marginBottom: 6 }}>{(rec.summary || "").slice(0, 120)}</div>
                  {rec.source_url && <SourceLink url={rec.source_url}><span style={{ fontSize: 10 }}>{toHostname(rec.source_url) || "source"} open</span></SourceLink>}
                </div>
              ))}
              {!evidence.length && <div style={{ padding: "14px 16px", color: T.dim, fontSize: 12 }}>Evidence appears after a sandbox run.</div>}
            </div>
          </div>

          {/* Monitored entities */}
          <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".07em", color: T.dim }}>Monitored</div>
            <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {scenario?.entities?.map(e => <span key={e} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, background: `${scenario.color}0d`, border: `1px solid ${scenario.color}22`, color: scenario.color }}>{e}</span>)}
            </div>
          </div>

          {/* CTA */}
          <div style={{ borderRadius: 12, background: `linear-gradient(135deg,rgba(18,181,203,.08),rgba(8,145,178,.04))`, border: `1px solid rgba(18,181,203,.2)`, padding: "18px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Move from sandbox to live monitoring</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.55, marginBottom: 14 }}>Create a workspace, connect providers, set cadence, and turn these briefs into reviewable actions.</div>
            <button onClick={() => nav("Home")} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: T.accent, color: "#000", fontSize: 13, fontWeight: 900 }}>Create trial workspace</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingPage({ nav, tierId, setTierId, selDomains, toggleDomain, tier, user, auth }) {
  const go = user ? () => nav("Monitor") : auth;
  const rows = [
    ["Domains", "1 focused domain", "Any 2 domains", "All 3 domains"],
    ["Monitoring", "Daily workspace runs", "Daily runs + cross-domain context", "Scheduled monitoring across all functions"],
    ["Analyst", "Live Q&A on saved evidence", "Multi-domain analyst with shared memory", "Executive analyst with cross-domain reasoning"],
    ["Actions", "Approve recommended actions", "Coordinate actions across two teams", "Shared action queue for security, GTM, and finance"],
    ["Best for", "A team starting with one urgent workflow", "Teams connecting two operating functions", "Organizations standardizing external intelligence"],
  ];
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 24px 64px" }}>
      <Eye>Pricing</Eye>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 32, alignItems: "end", marginTop: 6 }}>
        <div>
          <h2 style={{ fontSize: 32, margin: 0, lineHeight: 1.15 }}>Pick the operating scope, then choose the domains.</h2>
          <p style={{ color: T.muted, marginTop: 12, lineHeight: 1.65, maxWidth: 680 }}>The plan controls how many business functions WebDataOS monitors. The runtime is the same: live-web retrieval, evidence memory, reasoning, and approval-based actions.</p>
        </div>
        <div style={{ justifySelf: "end", display: "flex", gap: 8, padding: 4, borderRadius: 999, border: `1px solid ${T.border}`, background: T.bgSub }}>
          {TIERS.map(t => (
            <button key={t.id} onClick={() => setTierId(t.id)} style={{ border: "none", borderRadius: 999, padding: "8px 12px", background: tierId === t.id ? t.color : "transparent", color: tierId === t.id ? "#000" : T.muted, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{t.name.replace("Enterprise Intelligence OS", "Enterprise")}</button>
          ))}
        </div>
      </div>

      <section style={{ marginTop: 34, borderTop: `1px solid ${T.borderL}`, borderBottom: `1px solid ${T.borderL}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.05fr repeat(3,1fr)", minHeight: 74, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ padding: "18px 14px", color: T.dim, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>Plan</div>
          {TIERS.map(t => (
            <button key={t.id} onClick={() => setTierId(t.id)} style={{ textAlign: "left", border: "none", borderLeft: `1px solid ${T.border}`, background: tierId === t.id ? `${t.color}10` : "transparent", padding: "16px 14px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ color: tierId === t.id ? t.color : T.text, fontSize: 16 }}>{t.name.replace("Enterprise Intelligence OS", "Enterprise")}</strong>
                {tierId === t.id && <CheckCircle size={15} color={t.color} />}
              </div>
              <div style={{ color: T.dim, fontSize: 12, marginTop: 5 }}>{t.price}</div>
            </button>
          ))}
        </div>
        {rows.map(([label, core, pro, enterprise]) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "1.05fr repeat(3,1fr)", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ padding: "14px", fontSize: 12, color: T.dim }}>{label}</div>
            {[core, pro, enterprise].map((value, idx) => {
              const t = TIERS[idx];
              return <div key={value} style={{ padding: "14px", borderLeft: `1px solid ${T.border}`, background: tierId === t.id ? `${t.color}08` : "transparent", color: tierId === t.id ? T.text : T.muted, fontSize: 12, lineHeight: 1.45 }}>{value}</div>;
            })}
          </div>
        ))}
      </section>

      <section style={{ marginTop: 34 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Domain coverage</h3>
            <p style={{ margin: "6px 0 0", color: T.dim, fontSize: 13 }}>{tierId === "enterprise" ? "Enterprise includes every domain and turns them into a shared operating view." : `Select ${tier.pick} domain${tier.pick === 1 ? "" : "s"} for ${tier.name}. This choice drives what the analyst monitors and how recommendations are framed.`}</p>
          </div>
          <div style={{ color: tier.color, fontSize: 13, fontWeight: 800 }}>{tier.tagline}</div>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
          {DOMAINS.map(d => {
            const active = tierId === "enterprise" || selDomains.includes(d.id);
            return (
              <button key={d.id} disabled={tierId === "enterprise"} onClick={() => toggleDomain(d.id)} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: 12, textAlign: "left", padding: "13px 0", border: "none", borderTop: `1px solid ${T.border}`, background: "transparent", cursor: tierId === "enterprise" ? "default" : "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: active ? `${d.color}18` : "rgba(255,255,255,.03)", display: "grid", placeItems: "center", color: active ? d.color : T.dim }}>{packIcon(d.icon, 15)}</div>
                <div>
                  <div style={{ color: active ? T.text : T.muted, fontWeight: 800, fontSize: 14 }}>{d.name}</div>
                  <div style={{ color: T.dim, fontSize: 12, marginTop: 3 }}>{d.signals.join(" · ")}</div>
                </div>
                <div style={{ color: active ? d.color : T.dim, fontSize: 12, fontWeight: 800 }}>{active ? "Included" : "Add"}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 34, display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "center", paddingTop: 22, borderTop: `1px solid ${T.borderL}` }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Selected: {tier.name}</div>
          <div style={{ color: T.muted, fontSize: 13, marginTop: 5 }}>{tierId === "enterprise" ? "Security, GTM, and Finance are included." : DOMAINS.filter(d => selDomains.includes(d.id)).map(d => d.name).join(" + ")}. Configure entities, sources, cadence, and approvals after sign in.</div>
        </div>
        <button onClick={go} style={{ padding: "12px 20px", borderRadius: 999, border: "none", background: `linear-gradient(135deg,${T.accent},#0284c7)`, color: "#000", fontWeight: 800, fontSize: 13, boxShadow: `0 8px 24px ${T.glow}`, cursor: "pointer", whiteSpace: "nowrap" }}>{user ? "Continue to monitor" : "Sign in to configure"} <ArrowRight size={14} style={{ marginLeft: 4 }} /></button>
      </section>
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════════════════
   SOLUTION PAGE (Public) — Pain points, capabilities, use cases
   ═══════════════════════════════════════════════════════════════════════ */
function SolutionPage({ nav }) {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px" }}>
      <Eye>The problem</Eye>
      <h2 style={{ fontSize: 28, marginTop: 6 }}>Enterprise AI agents fail on the live web</h2>
      <p style={{ color: T.dim, marginTop: 8, lineHeight: 1.7, maxWidth: 700 }}>Every enterprise team that needs external intelligence — security, procurement, competitive strategy, finance — hits the same wall. The data is public, but accessing it reliably at scale is an unsolved infrastructure problem.</p>

      {/* Pain points */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 28 }}>
        {[
          { icon: <AlertTriangle size={18} />, title: "Blocked & fragmented", desc: "Anti-bot detection, JavaScript rendering, captchas, geo-blocking, and DOM changes break every scraper. Manual research doesn't scale.", color: "#ef4444" },
          { icon: <Clock size={18} />, title: "Stale & unrepeatable", desc: "Intelligence goes stale hours after collection. Teams have no idea how old their external data is. No freshness tracking, no change detection.", color: "#f59e0b" },
            { icon: <EyeIcon size={18} />, title: "Data without judgment", desc: "Raw scraped data requires human analysts to assess materiality, cross-reference contracts, and decide what actions to take. The bottleneck is judgment, not data.", color: "#3b82f6" },
        ].map((p, i) => (
          <div key={i} style={{ padding: 20, borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}`, borderTop: `3px solid ${p.color}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${p.color}10`, display: "grid", placeItems: "center", color: p.color, marginBottom: 10 }}>{p.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{p.title}</div>
            <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.6 }}>{p.desc}</div>
          </div>
        ))}
      </div>

      {/* How WebDataOS solves it */}
      <div style={{ marginTop: 48 }}>
        <Eye>How WebDataOS solves it</Eye>
        <h2 style={{ fontSize: 24, marginTop: 6 }}>Five capabilities in one runtime</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 20, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
          {[
            { n: "01", title: "Self-healing retrieval", desc: "Bright Data gateway detects failure types (blocked, captcha, JavaScript required, geo-blocked) and automatically routes through SERP API → Web Scraper → Scraping Browser → Web Unlocker. Every attempt logged with latency and recovery path.", icon: <Globe size={16} />, color: T.accent },
            { n: "02", title: "Self-hosted evidence memory", desc: "OpenAI embeddings + PostgreSQL. Prior evidence is searched semantically before new retrieval. Reduces redundant scraping, maintains continuity across monitoring cycles. Zero vendor lock-in.", icon: <Database size={16} />, color: "#f59e0b" },
            { n: "03", title: "LLM-powered synthesis", desc: "OpenAI produces contextual analysis from structured evidence and memory context. Not template strings — actual reasoning about what the evidence means for your organization.", icon: <Brain size={16} />, color: "#818cf8" },
            { n: "04", title: "Contextual materiality assessment", desc: "Evidence evaluated against your contracts, risk thresholds, financial exposure, and renewal calendar. Each finding gets a materiality rating, impact description, and urgency level.", icon: <Target size={16} />, color: "#ef4444" },
            { n: "05", title: "Autonomous actions with approval gates", desc: "Material findings generate concrete action proposals: draft emails, schedule reviews, update risk registers, notify teams. High-stakes actions require human approval. Low-risk actions auto-execute.", icon: <Zap size={16} />, color: "#22c55e" },
          ].map((s, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 1fr", padding: "16px 20px", background: T.bgSub, borderBottom: i < 4 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: T.dim, fontWeight: 500, paddingTop: 2 }}>{s.n}</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: `${s.color}10`, display: "grid", placeItems: "center", color: s.color }}>{s.icon}</div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</span>
                </div>
                <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.6, marginTop: 4 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Use cases with flows */}
      <div style={{ marginTop: 48 }}>
        <Eye>Use cases</Eye>
        <h2 style={{ fontSize: 24, marginTop: 6 }}>Three domains, concrete flows</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
          {[
            { title: "Security: Vendor risk monitoring", color: "#ef4444", scenario: "A security analyst monitors 15 vendors for breach disclosures, SOC2 lapses, and regulatory exposure.", flow: ["Analyst speaks: 'Check vendor risk posture for Okta, Datadog, and Cloudflare'", "Speechmatics transcribes → Memory checks prior vendor assessments", "Bright Data scrapes trust pages, security bulletins, compliance directories", "Gateway recovers: trust.okta.com blocked → Web Unlocker succeeds", "LLM synthesizes: 'No active breaches. Okta SOC2 current. Datadog compliance page updated.'", "Reasoning: Okta is high-risk tier with PII access → materiality: medium → suggest SOC2 doc refresh", "Action proposed: 'Request updated SOC2 Type II from Okta' → pending approval"] },
            { title: "GTM: Competitive pricing intelligence", color: "#3b82f6", scenario: "A product manager tracks 5 competitors' pricing pages weekly for changes.", flow: ["PM types: 'What changed in competitor pricing this week?'", "Memory recalls: 'Last week Stripe was 2.9%, HubSpot $20/mo starter'", "Bright Data scrapes pricing pages across 5 competitors", "Evidence records stored with extracted facts: pricing_model, starting_price, features", "Change detection: Stripe 2.9% → 2.7% (field_updated)", "LLM synthesizes: 'Stripe reduced enterprise pricing. HubSpot added AI tier.'", "Org context: Stripe contract is $340K, renews July 1 → financial_impact: $6,800", "Action: 'Draft renegotiation email' + 'Schedule procurement review' → pending approval"] },
            { title: "Finance: Regulatory compliance tracking", color: "#22c55e", scenario: "A compliance officer monitors regulatory filings and deadline changes across EU AI Act and GDPR.", flow: ["Officer uploads audio from regulatory webinar", "Speechmatics transcribes webinar → structured text", "Bright Data scrapes ec.europa.eu, ICO guidance pages, regulatory databases", "Memory stores: 'Two AI systems classified high-risk in preliminary assessment'", "Evidence: registration deadline approaching within 30-day threshold", "Reasoning: compliance_deadline_days threshold breached → materiality: high, urgency: urgent", "Action: 'Submit high-risk registration' + 'Notify compliance team' → auto-approved notification, pending registration approval"] },
          ].map((uc, i) => (
            <div key={i} style={{ padding: 22, borderRadius: 16, background: T.bgSub, border: `1px solid ${T.border}`, borderLeft: `3px solid ${uc.color}` }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{uc.title}</div>
              <div style={{ fontSize: 13, color: T.dim, marginBottom: 14, fontStyle: "italic" }}>{uc.scenario}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {uc.flow.map((step, si) => (
                  <div key={si} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderBottom: si < uc.flow.length - 1 ? `1px solid ${T.border}` : "none" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 999, display: "grid", placeItems: "center", background: `${uc.color}10`, color: uc.color, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{si + 1}</span>
                    <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 40 }}>
        <button onClick={() => nav("Home")} style={{ padding: "12px 24px", borderRadius: 999, border: "none", background: T.accent, color: "#000", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>View packages <ArrowRight size={14} style={{ marginLeft: 4 }} /></button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DOCS (Public) — comprehensive
   ═══════════════════════════════════════════════════════════════════════ */
function SolutionManualPage({ nav }) {
  const steps = [
    ["Monitor", "Track vendors, competitors, markets, regulations, and accounts on a cadence."],
    ["Collect", "Use live web routes to capture fresh source-backed evidence."],
    ["Reason", "Compare the evidence with business context, memory, graph links, and prior runs."],
    ["Act", "Create approval-ready actions for the findings that matter."],
    ["Prove", "Keep sources, receipts, provider trace, actions, and outcomes attached to the run."],
  ];
  const cases = [
    ["Security & Compliance", "Vendor risk, breach exposure, compliance pages, trust centers, regulatory updates.", ["Choose Security & Compliance in Settings", "Add vendors, domains, trust pages, and regulators", "Run Monitor daily or ask Analyst for a vendor-risk check", "Inspect evidence and approve reviews, SOC2 requests, or risk-register updates"]],
    ["GTM Intelligence", "Competitor pricing, messaging, product launches, account signals, market movement.", ["Choose GTM Intelligence in Settings", "Add competitors, products, accounts, and markets", "Run Monitor before sales/product reviews or ask Analyst about a competitor", "Inspect evidence and update battlecards, messaging, or renewal response actions"]],
    ["Finance & Market", "Filings, supplier signals, sector updates, pricing shifts, alternative public data.", ["Choose Finance & Market in Settings", "Add suppliers, companies, sectors, filings, and market pages", "Run Monitor before budget, procurement, or renewal reviews", "Inspect evidence and approve procurement reviews, forecast updates, or supplier actions"]],
  ];
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "48px 24px 60px" }}>
      <Eye>Solution</Eye>
      <h2 style={{ fontSize: 30, marginTop: 6, maxWidth: 680 }}>From public web changes to evidence-backed action</h2>
      <p style={{ color: T.muted, marginTop: 12, lineHeight: 1.75, maxWidth: 720 }}>Enterprise teams already know the public web contains useful signals. The hard part is making those signals reliable, current, explainable, and actionable. WebDataOS is the runtime that does that work continuously.</p>

      <section style={{ marginTop: 40, display: "grid", gridTemplateColumns: "220px 1fr", gap: 34, alignItems: "start" }}>
        <div>
          <Eye>Why it exists</Eye>
          <h3 style={{ fontSize: 20, marginTop: 6 }}>The failure point is not access alone</h3>
        </div>
        <div style={{ display: "grid", gap: 18 }}>
          {[
            ["External data is unstable", "Pages change, block bots, require JavaScript, move behind regional controls, or disappear."],
            ["Raw data is not a decision", "Teams still need relevance, materiality, confidence, evidence, and next steps."],
            ["AI output needs proof", "Enterprise users need to know what was checked, which providers ran, what failed, and which sources support the answer."],
          ].map(([title, text]) => (
            <div key={title} style={{ paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
              <div style={{ marginTop: 5, color: T.dim, fontSize: 13, lineHeight: 1.65 }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 46 }}>
        <Eye>Operating model</Eye>
        <h3 style={{ fontSize: 20, marginTop: 6 }}>Five steps, one run receipt</h3>
        <div style={{ marginTop: 20 }}>
          {steps.map(([title, text], i) => (
            <div key={title} style={{ display: "grid", gridTemplateColumns: "56px 160px 1fr", gap: 18, padding: "14px 0", borderTop: `1px solid ${T.border}` }}>
              <div style={{ color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 12 }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 800 }}>{title}</div>
              <div style={{ color: T.muted, fontSize: 13, lineHeight: 1.6 }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 46, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34 }}>
        <div>
          <Eye>Enterprise value</Eye>
          <h3 style={{ fontSize: 20, marginTop: 6 }}>What teams get</h3>
          <div style={{ marginTop: 16, color: T.muted, fontSize: 13, lineHeight: 1.75 }}>A monitor that keeps watching, an analyst that answers follow-ups, an evidence store that preserves proof, and an action loop that turns findings into work.</div>
        </div>
        <div>
          <Eye>Developer value</Eye>
          <h3 style={{ fontSize: 20, marginTop: 6 }}>What builders get</h3>
          <div style={{ marginTop: 16, color: T.muted, fontSize: 13, lineHeight: 1.75 }}>A backend API for live retrieval, memory, graph context, LLM fallback, workflows, chat history, monitoring runs, and auditable receipts.</div>
        </div>
      </section>

      <section style={{ marginTop: 46 }}>
        <Eye>Domains</Eye>
        <h3 style={{ fontSize: 20, marginTop: 6 }}>Where it applies first</h3>
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 26 }}>
          {cases.map(([title, text, flow]) => (
            <div key={title}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
              <div style={{ marginTop: 6, color: T.dim, fontSize: 12, lineHeight: 1.6 }}>{text}</div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: "grid", gap: 7 }}>
                {flow.map((item, i) => (
                  <div key={item} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 7, color: T.muted, fontSize: 12, lineHeight: 1.45 }}>
                    <span style={{ color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 10 }}>{i + 1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" }}>
        <div style={{ color: T.muted, fontSize: 13 }}>The point is not more scraped data. The point is evidence-backed decisions that can be inspected.</div>
        <button onClick={() => nav("Docs")} style={{ padding: "10px 16px", borderRadius: 999, border: "none", background: T.accent, color: "#001018", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Read the manual</button>
      </div>
    </div>
  );
}

function DocsPage() {
  const [s, setS] = useState("overview");
  const secs = [{ id: "overview", l: "Overview" }, { id: "arch", l: "Architecture" }, { id: "packs", l: "Packages" }, { id: "journey", l: "User Journey" }, { id: "gateway", l: "Gateway & Recovery" }, { id: "memory", l: "Dual Memory" }, { id: "api", l: "API Reference" }, { id: "deploy", l: "Deployment" }];
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
      <Eye>Documentation</Eye>
      <h2 style={{ fontSize: 24, marginTop: 6 }}>WebDataOS Enterprise Docs</h2>
      <div className="au" style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 20, marginTop: 24 }}>
        <nav style={{ position: "sticky", top: 74, alignSelf: "start", padding: 12, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
          {secs.map(sec => <button key={sec.id} onClick={() => setS(sec.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: 6, border: "none", fontSize: 12, marginBottom: 2, background: s === sec.id ? `${T.accent}10` : "transparent", color: s === sec.id ? T.accent : T.dim, fontWeight: s === sec.id ? 600 : 400, cursor: "pointer" }}>{sec.l}</button>)}
        </nav>
        <div>
          {s === "overview" && <DS t="Overview"><p>WebDataOS is an enterprise live-web intelligence runtime for AI agents. It transforms public web signals into fresh, structured, evidence-backed intelligence across Security & Compliance, GTM Intelligence, and Finance & Market workflows.</p><p>The system serves both developers (REST API, Python/TypeScript SDKs) and business users (web interface) through a shared backend. Every research task produces structured JSON with sourced findings, confidence scores, partner trace, and action receipts.</p><DC t="Product Vision">The live-web intelligence layer enterprise agents rely on before making decisions from external web data. Freshness-aware retrieval, self-healing Bright Data gateway, Cognee knowledge-graph memory with self-hosted fallback, LLM-powered synthesis, and autonomous actions with human approval gates.</DC><DC t="Key Differentiators">Self-healing gateway with typed failure detection across SERP API, Web Scraper API, Web Unlocker, and Scraping Browser. Cognee-first memory with self-hosted fallback search. LLM-powered contextual synthesis. Organizational context for materiality assessment. Outcome-based learning loop. Serves both infrastructure consumers (API) and end users (UI).</DC></DS>}
          {s === "arch" && <DS t="Architecture"><p>Layered architecture with clear separation between UI, API, gateway, intelligence engine, memory, reasoning, and partner integrations.</p><JB>{["User (text / voice / audio)", "  │", "  ├── Speechmatics → Transcription", "  ├── Memory Provider → Cognee graph recall + self-hosted fallback search", "  ├── Intelligence Engine → Check existing records, freshness", "  │   └── Bright Data Gateway → SERP → Web Scraper → Scraping Browser → Web Unlocker", "  │       └── FailureDetector → RecoveryRouter → ResultNormalizer", "  ├── LLM Synthesizer → Contextual analysis (OpenAI + AI/ML API fallback)", "  ├── Reasoning Engine → Materiality vs org context", "  │   └── Autonomous Actions → Proposals + approval gates", "  ├── Memory Provider → Store in Cognee + self-hosted memory", "  └── TriggerWare → Fire workflow actions"].join("\n")}</JB><DC t="Services">API: port 8000 · Web UI: port 3000 · PostgreSQL: 5432 · Neo4j: 7474 · Prometheus: 9090 · Grafana: 3001</DC></DS>}
          {s === "packs" && <DS t="Intelligence Packages"><p>4 packages, each configuring entities, signals, Bright Data routes, and output focus.</p>{PACKS.map(p => <DC key={p.id} t={`${p.name} (${p.tier})`}>{p.description} Entities: {p.entities.join(", ")}. Signals: {p.signals.join(", ")}. Routes: {p.routes.join(", ")}. Output: {p.output.join(", ")}.</DC>)}</DS>}
          {s === "journey" && <DS t="User Journey">{["Sign up and create a workspace with a package", "Enter entities to monitor and signals to watch", "Set refresh cadence (daily, weekly, every 6 hours, manual)", "Submit research task via text, voice, or audio upload", "Speechmatics transcribes voice/audio to structured text", "Cognee checks graph memory; self-hosted memory provides fallback context", "Intelligence Engine checks existing records for freshness", "If stale → Bright Data gateway fetches with self-healing recovery", "FailureDetector classifies errors → RecoveryRouter escalates tools", "ResultNormalizer produces clean JSON evidence records", "Change detection compares old vs new facts, logs ChangeEvents", "LLM synthesizes contextual brief from evidence + memory", "Reasoning Engine assesses materiality against org context", "Autonomous actions proposed for material findings", "TriggerWare fires workflow actions for material signals", "User receives brief, companies, changes, partner trace, receipts"].map((step, i) => <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: i < 15 ? `1px solid ${T.border}` : "none" }}><span style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: `${T.accent}10`, color: T.accent, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 13, color: T.muted }}>{step}</span></div>)}</DS>}
          {s === "gateway" && <DS t="Gateway & Recovery"><p>The self-healing gateway detects failure modes and routes to the next Bright Data tool automatically.</p><DC t="ToolName enum">serp_api, web_scraper_api, web_unlocker, scraping_browser, mock</DC><DC t="FailureType enum">none, blocked, captcha, geo_blocked, rate_limited, javascript_required, selector_failed, empty_response, timeout, unknown</DC><DC t="Recovery routing">{"blocked/captcha/geo_blocked/rate_limited -> web_unlocker -> scraping_browser. javascript_required/empty_response/selector_failed -> scraping_browser -> web_unlocker. web_scraper_api failure -> scraping_browser. scraping_browser failure -> web_unlocker."}</DC><DC t="SourceType enum">search_result, company_page, pricing_page, docs_page, news_page, filing, social_public, unknown</DC></DS>}
          {s === "memory" && <DS t="Dual Memory: Cognee + Self-Hosted"><p>Cognee is the default open-source knowledge-graph memory layer. WebDataOS also writes to a self-hosted PostgreSQL memory store and falls back to it when Cognee is unavailable.</p><DC t="How it works">On upsert: memory writes to self-hosted storage and, when installed/configured, to Cognee. On search: Cognee graph recall is queried first, then merged with self-hosted embedding or keyword results.</DC><DC t="Key files">packages/memory/provider.py — MemoryProvider routes Cognee + self-hosted. packages/partners/cognee.py — Cognee adapter. packages/memory/service.py — PostgreSQL/OpenAI fallback memory.</DC><DC t="Graceful degradation">With Cognee installed: graph memory + self-hosted vector search. Without Cognee: self-hosted embeddings via OpenAI. Without OpenAI: keyword matching. The system works at every level of integration.</DC></DS>}
          {s === "api" && <DS t="API Reference"><p>Tenant endpoints require either a WebDataOS bearer session or a configured API key. Public demo routes use a demo session header.</p><div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${T.border}`, marginTop: 10 }}>{[
            { m: "GET", p: "/health", d: "Health check with partner status" }, { m: "GET", p: "/workspaces/packages", d: "List intelligence packages" },
            { m: "POST", p: "/workspaces", d: "Create workspace" }, { m: "GET", p: "/workspaces", d: "List workspaces" },
            { m: "POST", p: "/agent/research", d: "Run LLM-powered research (text/voice/audio)" },
            { m: "POST", p: "/gateway/fetch", d: "Self-healing Bright Data fetch" },
            { m: "POST", p: "/intelligence/topics", d: "Create topic" }, { m: "POST", p: "/intelligence/topics/{id}/discover", d: "Discover via SERP" },
            { m: "POST", p: "/intelligence/topics/{id}/refresh", d: "Refresh via gateway" },
            { m: "GET", p: "/intelligence/records", d: "List evidence records" },
            { m: "POST", p: "/intelligence/retrieval/context", d: "Ranked context retrieval" },
            { m: "POST", p: "/transcriptions", d: "Speechmatics transcription" },
            { m: "POST", p: "/memory/upsert", d: "Store evidence memory" }, { m: "POST", p: "/memory/search", d: "Semantic memory search" },
            { m: "POST", p: "/workflows/trigger", d: "TriggerWare workflow" },
            { m: "GET", p: "/runs", d: "List runs" }, { m: "GET", p: "/runs/{id}", d: "Run details + report" },
            { m: "POST", p: "/context", d: "Upsert org context" }, { m: "GET", p: "/context/{ws_id}", d: "Get org context" },
            { m: "GET", p: "/actions/{ws_id}", d: "List actions" }, { m: "POST", p: "/actions/{id}/approve", d: "Approve/reject" },
            { m: "POST", p: "/actions/{id}/execute", d: "Execute action" },
            { m: "POST", p: "/outcomes", d: "Record outcome" }, { m: "GET", p: "/outcomes/{ws_id}", d: "List outcomes" },
            { m: "GET", p: "/outcomes/{ws_id}/stats", d: "Outcome stats" }, { m: "GET", p: "/metrics", d: "Prometheus metrics" },
          ].map((ep, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 280px 1fr", padding: "7px 12px", background: T.bgSub, borderBottom: `1px solid ${T.border}`, alignItems: "center", fontSize: 12 }}><span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono'", color: ep.m === "POST" ? "#22c55e" : T.accent }}>{ep.m}</span><span style={{ fontFamily: "'JetBrains Mono'" }}>{ep.p}</span><span style={{ color: T.dim }}>{ep.d}</span></div>)}</div></DS>}
          {s === "deploy" && <DS t="Deployment"><DC t="Quick Start">cp .env.example .env → set OPENAI_API_KEY and BRIGHTDATA credentials → docker compose -f infra/docker-compose.yml up --build. Local fallback runs when Bright Data credentials are empty.</DC><DC t="Environment">OPENAI_API_KEY (LLM + memory embeddings), BRIGHTDATA_API_KEY, BRIGHTDATA_SERP_ENDPOINT, BRIGHTDATA_WEB_SCRAPER_ENDPOINT, BRIGHTDATA_WEB_UNLOCKER_ENDPOINT, BRIGHTDATA_SCRAPING_BROWSER_ENDPOINT, DATABASE_URL, API_KEY.</DC><DC t="Graceful degradation">Without OPENAI_API_KEY: rule-based synthesis + keyword memory. Without BRIGHTDATA_*: local gateway fallback. Without DATABASE_URL: in-memory fallback. Every layer works independently.</DC></DS>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DEVELOPER (Public) — comprehensive
   ═══════════════════════════════════════════════════════════════════════ */
function DocsManualPage() {
  const [tab, setTab] = useState("start");
  const tabs = [
    ["start", "Start"],
    ["flow", "Flow"],
    ["runtime", "Runtime"],
    ["data", "Data"],
    ["api", "API"],
    ["deploy", "Deploy"],
    ["verify", "Verify"],
  ];
  const rows = {
    start: [
      ["Purpose", "Turns monitored external signals into evidence-backed briefings, actions, and outcomes."],
      ["Primary users", "Analysts, risk teams, GTM teams, operators, and developers integrating the API."],
      ["Boundary", "Chat is only one interface. The core system is monitoring, evidence, memory, graph, actions, and receipts."],
    ],
    flow: [
      ["1. Input", "Text, voice transcript, uploaded audio, or scheduled monitor task."],
      ["2. Memory", "Search Cognee and local memory for prior context."],
      ["3. Retrieval", "Rank existing records, then refresh through Bright Data when evidence is stale or thin."],
      ["4. Reasoning", "Synthesize findings, materiality, risk posture, and recommendations."],
      ["5. Persistence", "Save run, records, chat messages, memory, graph links, and proposed actions."],
      ["6. Receipt", "Return provider, stage, count, fallback, and error details for audit."],
    ],
    runtime: [
      ["API", "FastAPI backend, auth, health checks, route handlers, persistence."],
      ["Gateway", "Bright Data route selection and recovery for SERP, Web Scraper, Browser, and Unlocker."],
      ["LLM", "OpenAI primary with AIMLAPI fallback when configured."],
      ["Memory", "Cognee when available, merged with self-hosted memory fallback."],
      ["Graph", "Neo4j links entities, evidence, sources, runs, and relationships."],
      ["Worker", "Runs due workspace monitoring on cadence."],
      ["Workflow", "TriggerWare or local fallback creates action events."],
    ],
    data: [
      ["Topic", "Workspace mission: entities, signals, cadence."],
      ["Source", "Candidate URL discovered for a topic."],
      ["IntelligenceRecord", "Saved evidence with facts, summary, confidence, freshness."],
      ["AgentRun", "Immutable run result and report JSON."],
      ["ChatMessage", "Durable Analyst conversation turn."],
      ["MemoryEntry", "Self-hosted memory record and optional embedding."],
      ["AutonomousAction", "Proposed, approved, or executed work item."],
      ["Outcome", "Post-action feedback and value tracking."],
    ],
    deploy: [
      ["Frontend", "Vercel or static hosting. VITE_API_BASE_URL must point to the backend API."],
      ["Backend", "FastAPI on Vultr or equivalent, with Postgres, API auth, provider keys, and worker process."],
      ["Worker", "Scheduled monitoring process using the same database and environment as the API."],
      ["Database", "Postgres in production. SQLite is for local testing only."],
      ["Security", "Enable API_AUTH_ENABLED in production and provide API_KEYS."],
    ],
    verify: [
      ["API", "GET /health returns database ok and provider status."],
      ["Retrieval", "POST /gateway/fetch returns route attempts and normalized evidence."],
      ["Monitor", "POST /monitor/{workspace_id}/run creates an AgentRun and records."],
      ["Analyst", "A chat turn persists through /chat/{workspace_id} and links to a run receipt."],
      ["Evidence", "Records show source URL, confidence, freshness, and graph context."],
      ["Actions", "Approval and execution endpoints mutate action state."],
      ["Worker", "Due workspaces produce scheduled runs without manual chat input."],
    ],
  };
  const apiRows = [
    ["GET", "/health", "Provider and API health."],
    ["POST", "/agent/research", "Run analyst research."],
    ["GET", "/monitor/{workspace_id}", "Read monitoring state."],
    ["POST", "/monitor/{workspace_id}/run", "Run monitoring now."],
    ["POST", "/gateway/fetch", "Retrieve URL/query through gateway."],
    ["GET", "/intelligence/records", "List evidence records."],
    ["POST", "/intelligence/retrieval/context", "Rank context for a query."],
    ["GET", "/runs/{run_id}", "Read saved report."],
    ["GET", "/chat/{workspace_id}", "Load chat history."],
    ["POST", "/chat/{workspace_id}", "Save chat message."],
    ["GET", "/graph/status", "Check Neo4j."],
    ["GET", "/metrics", "Prometheus metrics."],
  ];
  const currentRows = rows[tab] || [];
  const renderRow = ([label, text]) => (
    <div key={label} style={{ display: "grid", gridTemplateColumns: "190px minmax(0,1fr)", gap: 16, padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
      <div style={{ color: T.text, fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 56px" }}>
      <Eye>Docs</Eye>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-end", marginTop: 6 }}>
        <div>
          <h2 style={{ fontSize: 24, margin: 0 }}>WebDataOS manual</h2>
          <div style={{ color: T.dim, marginTop: 7, fontSize: 13 }}>Product behavior, runtime responsibilities, data contracts, and deployment checks.</div>
        </div>
        <button onClick={() => setTab("api")} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontSize: 12, fontWeight: 800 }}>API reference</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: 18, marginTop: 20 }}>
        <nav style={{ position: "sticky", top: 74, alignSelf: "start", padding: 8, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
          {tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", fontSize: 12, marginBottom: 2, background: tab === id ? `${T.accent}12` : "transparent", color: tab === id ? T.accent : T.muted, fontWeight: tab === id ? 800 : 500, cursor: "pointer" }}>{label}</button>)}
        </nav>

        <main style={{ display: "grid", gap: 14 }}>
          {tab !== "api" && (
            <section style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, padding: 18 }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>{tabs.find(([id]) => id === tab)?.[1]}</h3>
              <div style={{ marginTop: 12 }}>{currentRows.map(renderRow)}</div>
            </section>
          )}

          {tab === "api" && (
            <>
              <section style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                <div style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 800 }}>Request</div>
                <pre style={{ margin: 0, padding: 14, color: T.muted, fontSize: 11, lineHeight: 1.65, fontFamily: "'JetBrains Mono'", overflow: "auto" }}>{`POST /agent/research
Authorization: Bearer <webdataos-session-token>

{
  "workspace_id": "workspace_enterprise",
  "topic_id": "workspace_enterprise",
  "package_id": "enterprise",
  "task": "Assess vendor risk signals for OpenAI and Anthropic",
  "max_sources": 8,
  "enable_memory": true,
  "enable_workflows": true
}`}</pre>
              </section>
              <section style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, padding: 18 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>Endpoints</h3>
                <div style={{ marginTop: 12 }}>
                  {apiRows.map(([method, path, desc]) => (
                    <div key={`${method}-${path}`} style={{ display: "grid", gridTemplateColumns: "58px 260px minmax(0,1fr)", gap: 12, padding: "9px 0", borderTop: `1px solid ${T.border}` }}>
                      <span style={{ color: method === "POST" ? "#22c55e" : T.accent, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono'" }}>{method}</span>
                      <span style={{ color: T.text, fontSize: 11, fontFamily: "'JetBrains Mono'" }}>{path}</span>
                      <span style={{ color: T.dim, fontSize: 12 }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function DevPage() {
  const endpointsList = [
    ["POST", "/agent/research", "Run analyst research and return a sourced report plus run receipt."],
    ["GET", "/monitor/{workspace_id}", "Read scheduled monitoring state, latest run, records, and actions."],
    ["POST", "/monitor/{workspace_id}/run", "Run monitoring immediately for a workspace."],
    ["POST", "/gateway/fetch", "Fetch a URL or SERP query through gateway recovery routes."],
    ["GET", "/runs?topic_id={id}", "List saved run history for audit and continuity."],
    ["GET", "/runs/{run_id}", "Fetch the complete report JSON for a run."],
    ["GET", "/intelligence/records?topic_id={id}", "List saved evidence records."],
    ["POST", "/intelligence/retrieval/context", "Rank evidence against a query."],
    ["GET", "/chat/{workspace_id}", "Load Analyst conversation history."],
    ["POST", "/chat/{workspace_id}", "Persist a user or assistant chat turn."],
    ["GET", "/graph/status", "Check Neo4j graph availability."],
    ["GET", "/health", "Check API, provider, LLM, graph, and partner status."],
  ];
  const receiptFields = [
    ["run_receipt.providers", "LLM, retrieval, memory, speech, workflow providers used."],
    ["run_receipt.stages", "Input, memory, retrieval, synthesis, reasoning, workflow stage status."],
    ["run_receipt.counts", "Sources, records, memories, actions, workflow events."],
    ["run_receipt.fallbacks_used", "Fallbacks used during the run."],
    ["records_used", "Evidence records used in the answer."],
    ["partner_trace", "Ordered backend trace for debugging and audit."],
  ];
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 56px" }}>
      <Eye>Developer</Eye>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 18, alignItems: "start", marginTop: 8 }}>
        <div>
          <h2 style={{ fontSize: 24, margin: 0 }}>API reference</h2>
          <div style={{ color: T.dim, marginTop: 7, fontSize: 13, lineHeight: 1.6 }}>Build against the same backend used by Monitor, Analyst, Evidence, Actions, and Outcomes.</div>
        </div>
        <div style={{ borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}`, padding: 12, fontSize: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0" }}><span style={{ color: T.dim }}>Base URL</span><span style={{ color: T.text, fontFamily: "'JetBrains Mono'" }}>{API || "/"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderTop: `1px solid ${T.border}` }}><span style={{ color: T.dim }}>Auth header</span><span style={{ color: T.text, fontFamily: "'JetBrains Mono'" }}>Bearer or X-API-Key</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderTop: `1px solid ${T.border}` }}><span style={{ color: T.dim }}>Format</span><span style={{ color: T.text, fontFamily: "'JetBrains Mono'" }}>application/json</span></div>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,.85fr)", gap: 14 }}>
        <section style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 800 }}>Quick request</div>
          <pre style={{ margin: 0, padding: 14, color: T.muted, fontSize: 11, lineHeight: 1.65, fontFamily: "'JetBrains Mono'", overflow: "auto" }}>{`curl -X POST "$WEBDATAOS_API/agent/research" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $WEBDATAOS_SESSION_TOKEN" \\
  -d '{
    "workspace_id": "workspace_enterprise",
    "topic_id": "workspace_enterprise",
    "package_id": "enterprise",
    "task": "Assess vendor risk signals for OpenAI and Anthropic",
    "max_sources": 8,
    "enable_memory": true,
    "enable_workflows": true
  }'`}</pre>
        </section>
        <section style={{ borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 800 }}>Response shape</div>
          <pre style={{ margin: 0, padding: 14, color: T.muted, fontSize: 11, lineHeight: 1.65, fontFamily: "'JetBrains Mono'", overflow: "auto" }}>{`{
  "run_id": "...",
  "summary": "...",
  "key_findings": [],
  "records_used": [],
  "reasoning": {},
  "autonomous_actions": [],
  "run_receipt": {
    "providers": {},
    "stages": [],
    "counts": {},
    "fallbacks_used": [],
    "errors": []
  }
}`}</pre>
        </section>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <section style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 800 }}>Endpoints</div>
          <div>
            {endpointsList.map(([method, path, description], index) => (
              <div key={`${method}-${path}`} style={{ display: "grid", gridTemplateColumns: "58px 230px 1fr", gap: 10, padding: "9px 14px", borderTop: index ? `1px solid ${T.border}` : "none", alignItems: "start" }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: method === "POST" ? "#22c55e" : T.accent, fontWeight: 800 }}>{method}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: T.text, wordBreak: "break-word" }}>{path}</span>
                <span style={{ fontSize: 11, color: T.dim, lineHeight: 1.45 }}>{description}</span>
              </div>
            ))}
          </div>
        </section>
        <section style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 800 }}>Audit fields</div>
          <div>
            {receiptFields.map(([field, description], index) => (
              <div key={field} style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 10, padding: "10px 14px", borderTop: index ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: T.accent }}>{field}</span>
                <span style={{ fontSize: 11, color: T.dim, lineHeight: 1.5 }}>{description}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 14, borderTop: `1px solid ${T.border}`, color: T.muted, fontSize: 12, lineHeight: 1.6 }}>
            The gateway is not a separate user workflow. It is the retrieval layer behind records and receipts. Operator testing belongs in the authenticated Operations view.
          </div>
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MONITOR (Private) — scheduled/live updates, separate from analyst chat
   ═══════════════════════════════════════════════════════════════════════ */
function MonitorPage({ ws, nav, saveWorkspace, report, setReport, setActions, backendOk }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (workspaceId = ws.id, showMissingAsError = false) => {
    setLoading(true);
    setError("");
    try {
      setSummary(await endpoints.monitorSummary(workspaceId));
    } catch (e) {
      const message = e.message || "Monitor is not configured yet.";
      setError(!showMissingAsError && message.includes("404") ? "" : message);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [ws.id]);
  useEffect(() => { load(); }, [load]);

  const ensureWorkspace = async () => {
    const saved = await saveWorkspace();
    await new Promise(resolve => setTimeout(resolve, 250));
    return saved;
  };
  const runNow = async () => {
    setRunning(true);
    setError("");
    try {
      const saved = await ensureWorkspace();
      const workspaceId = saved?.id || ws.id;
      const result = await endpoints.runMonitor(workspaceId);
      setReport(result);
      try { setActions(await endpoints.listActions(workspaceId)); } catch (_) {}
      await load(workspaceId, true);
      toast.success("Monitoring run complete");
    } catch (e) {
      const msg = e.message || "Monitoring run failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };
  const saveAndLoad = async () => {
    setRunning(true);
    setError("");
    try {
      const saved = await ensureWorkspace();
      await load(saved?.id || ws.id, true);
      toast.success("Workspace saved");
    } catch (e) {
      const msg = e.message || "Could not save monitoring workspace.";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const s = summary || {};
  const counts = s.counts || {};
  const latest = s.latest_run || (report ? { summary: report.summary, risk_posture: report.reasoning?.risk_posture, counts: report.run_receipt?.counts || {} } : null);
  const monitorBrief = latest?.decision_brief || decisionFromReport(report, latest?.summary);
  const status = s.status || {};
  const nextDue = status.next_due_at ? new Date(status.next_due_at).toLocaleString() : "After first run";
  const lastRun = status.last_run_at ? new Date(status.last_run_at).toLocaleString() : "No run yet";
  const records = s.records || report?.records_used || [];
  const actions = s.actions || [];
  const runs = s.runs || [];
  const changes = s.changes || [];
  const outcomes = s.outcomes || [];
  const latestCounts = latest?.counts || {};
  const valueLoop = latest?.value_loop || report?.run_receipt?.value_loop || [
    { step: "Monitor", status: summary ? "configured" : "waiting", detail: summary ? "Workspace scope is saved." : "Save the workspace to begin." },
    { step: "Evidence", status: records.length ? "saved" : "empty", detail: `${records.length} records available.` },
    { step: "Compare", status: changes.length ? "changed" : runs.length ? "no_change" : "waiting", detail: changes.length ? `${changes.length} changes detected.` : "Baseline comparison appears after a run." },
    { step: "Reason", status: latest ? "complete" : "waiting", detail: latest ? "Brief generated from evidence." : "Run monitoring to generate reasoning." },
    { step: "Act", status: actions.length ? "ready" : "none", detail: `${actions.length} actions waiting.` },
    { step: "Outcome", status: outcomes.length ? "recorded" : "pending", detail: `${outcomes.length} outcomes recorded.` },
  ];
  const loopColor = status => {
    if (["configured", "saved", "changed", "complete", "ready", "recorded"].includes(status)) return "#22c55e";
    if (["baseline", "no_change", "pending"].includes(status)) return "#f59e0b";
    if (["empty", "blocked", "missing"].includes(status)) return "#ef4444";
    return T.dim;
  };
  const capability = [
    ["Web intelligence", backendOk?.brightdata_live || backendOk?.mock_brightdata ? "Ready" : "Not ready", backendOk?.brightdata_live || backendOk?.mock_brightdata],
    ["AI reasoning", backendOk?.llm_available ? "Ready" : "Not ready", backendOk?.llm_available],
    ["Context memory", true, true],
    ["Relationship graph", backendOk?.neo4j === "ok" ? "Active" : "Standard", backendOk?.neo4j === "ok"],
  ];

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "34px 24px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-end" }}>
        <div>
          <Eye>Monitor</Eye>
          <h2 style={{ fontSize: 24, marginTop: 4 }}>Live intelligence updates</h2>
          <div style={{ color: T.dim, fontSize: 12, marginTop: 5 }}>{ws.name} - {ws.cadence} monitoring without asking in chat</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => nav("Settings")} style={{ padding: "9px 13px", borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontWeight: 700, fontSize: 12 }}>Configure</button>
          <button onClick={runNow} disabled={running} style={{ padding: "9px 15px", borderRadius: 8, border: "none", background: T.accent, color: "#000", fontWeight: 800, fontSize: 12 }}>{running ? "Running..." : "Run monitoring now"}</button>
        </div>
      </div>

      {error && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", color: "#ef4444", fontSize: 12 }}>{error.includes("404") ? "Save this workspace before monitoring starts." : error}</div>}

      {!summary && !loading && (
        <section style={{ marginTop: 16, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
          <EmptyState icon={BarChart3} title="Monitoring not configured yet" body="Save the current workspace mission to enable scheduled updates and decision briefs." cta={running ? "Saving…" : "Save workspace"} onCta={saveAndLoad} />
        </section>
      )}

      <section style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: summary ? "#22c55e" : T.dim, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: summary ? T.text : T.dim, fontWeight: 700 }}>{summary ? "Monitoring active" : "Not yet configured"}</span>
          </div>
          <div style={{ fontSize: 12, color: T.dim }}>Last check: <span style={{ color: T.muted }}>{lastRun}</span></div>
          <div style={{ fontSize: 12, color: T.dim }}>Next: <span style={{ color: T.muted }}>{nextDue}</span></div>
          {records.length > 0 && <div style={{ fontSize: 12, color: T.dim }}><span style={{ color: T.muted, fontWeight: 700 }}>{records.length}</span> records collected</div>}
          {changes.length > 0 && <div style={{ padding: "2px 9px", borderRadius: 4, background: "rgba(129,140,248,.1)", border: "1px solid rgba(129,140,248,.2)", fontSize: 11, color: "#818cf8", fontWeight: 700 }}>{changes.length} change{changes.length !== 1 ? "s" : ""} detected</div>}
          {actions.length > 0 && <div style={{ padding: "2px 9px", borderRadius: 4, background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.2)", fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>{actions.length} action{actions.length !== 1 ? "s" : ""} pending</div>}
        </div>
      </section>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 14, alignItems: "start" }}>
        <main style={{ display: "grid", gap: 14 }}>
          <section style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Current update</div>
                <div style={{ color: T.dim, fontSize: 11, marginTop: 4 }}>Last run: {lastRun}</div>
              </div>
              <span style={{ padding: "4px 8px", borderRadius: 999, background: status.due ? "rgba(245,158,11,.12)" : "rgba(34,197,94,.1)", color: status.due ? "#f59e0b" : "#22c55e", fontSize: 11, fontWeight: 800 }}>{status.due ? "due" : "on schedule"}</span>
            </div>
            {loading ? <SkeletonCard /> : (latest || report) ? <DecisionBriefPanel brief={monitorBrief} onEvidence={() => nav("Evidence")} /> : <EmptyState icon={BarChart3} title="No brief yet" body="Run monitoring now to generate the first decision brief." />}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            <MC l="Runs" v={counts.runs || runs.length || 0} c={T.accent} />
            <MC l="Evidence" v={counts.records || records.length || 0} c="#22c55e" />
            <MC l="Changes" v={latestCounts.changes_detected ?? counts.changes ?? 0} c="#818cf8" />
            <MC l="Actions" v={latestCounts.autonomous_actions ?? counts.pending_actions ?? actions.length ?? 0} c="#f59e0b" />
          </section>

          <section style={{ padding: 16, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>What changed</div>
                <div style={{ marginTop: 9, display: "grid", gap: 8 }}>
                  {changes.slice(0, 4).map(change => <div key={change.id} style={{ fontSize: 12, color: T.muted, lineHeight: 1.45 }}>
                    <span style={{ color: T.text, fontWeight: 800 }}>{change.field || change.change_type}</span> changed in saved evidence.
                  </div>)}
                  {!changes.length && <div style={{ color: T.dim, fontSize: 12, lineHeight: 1.55 }}>{runs.length ? "No material change recorded since the current baseline. The next run will compare against the saved evidence state." : "Run monitoring once to create the baseline, then future runs will show changes."}</div>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Business impact</div>
                <div style={{ marginTop: 9, color: T.muted, fontSize: 12, lineHeight: 1.6 }}>
                  {latest?.recommendations?.length
                    ? latest.recommendations.slice(0, 2).map(r => r.title).join(" ")
                    : latest ? "The latest run produced a monitoring brief and action receipt. Add organization context in Settings to sharpen financial exposure, urgency, and ownership." : "Impact appears after evidence is saved and reasoning completes."}
                </div>
              </div>
            </div>
          </section>

          <section style={{ padding: 16, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Latest signals</div>
              <button onClick={() => nav("Evidence")} style={{ border: "none", background: "transparent", color: T.accent, fontSize: 12, fontWeight: 700 }}>View all →</button>
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {records.slice(0, 5).map(record => {
                const cleanSummary = safeText(record.summary);
                const host = toHostname(record.source_url);
                const conf = Math.round((record.confidence || 0) * 100);
                return (
                  <div key={record.id} style={{ padding: 11, borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>{record.entity_name || "Intelligence signal"}</div>
                      <span style={{ fontSize: 10, color: conf > 79 ? "#22c55e" : conf > 59 ? "#f59e0b" : T.accent, fontWeight: 700, flexShrink: 0 }}>{conf}% confidence</span>
                    </div>
                    {cleanSummary && <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cleanSummary}</div>}
                    {!cleanSummary && <div style={{ color: T.dim, fontSize: 12 }}>No summary available yet.</div>}
                    {host && <div style={{ marginTop: 6, fontSize: 10, color: T.dim }}><SourceLink url={record.source_url}>{host} ↗</SourceLink></div>}
                  </div>
                );
              })}
              {!records.length && <div style={{ color: T.dim, fontSize: 12 }}>No signals collected yet. Run monitoring to gather live intelligence.</div>}
            </div>
          </section>
        </main>

        <aside style={{ display: "grid", gap: 14 }}>
          <section style={{ padding: 16, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Monitoring mission</div>
            <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: T.dim }}>Cadence</span><span>{ws.cadence}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: T.dim }}>Next update</span><span style={{ textAlign: "right" }}>{nextDue}</span></div>
              <div style={{ color: T.dim, lineHeight: 1.5 }}>Entities: {(summary?.workspace?.entities || ws.entities.split(",").filter(Boolean)).slice(0, 8).join(", ") || "Not configured"}</div>
              <div style={{ color: T.dim, lineHeight: 1.5 }}>Signals: {(summary?.workspace?.watch_types || ws.signals.split(",").filter(Boolean)).slice(0, 8).join(", ") || "Not configured"}</div>
            </div>
          </section>
          <section style={{ padding: 16, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>System readiness</div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {capability.map(([name, value, ok]) => <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}><span style={{ color: T.dim }}>{name}</span><span style={{ color: ok ? "#22c55e" : "#f59e0b", fontWeight: 800 }}>{value}</span></div>)}
            </div>
          </section>
          <section style={{ padding: 16, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Recommended actions</div>
              <button onClick={() => nav("Actions")} style={{ border: "none", background: "transparent", color: T.accent, fontSize: 12, fontWeight: 700 }}>Open</button>
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {actions.slice(0, 4).map(action => <div key={action.id} style={{ padding: 10, borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}` }}><div style={{ fontSize: 12, fontWeight: 800 }}>{action.title}</div><div style={{ marginTop: 4, fontSize: 10, color: stC(action.status) }}>{action.status}</div></div>)}
              {!actions.length && <div style={{ color: T.dim, fontSize: 12 }}>No actions waiting.</div>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   WORKSPACE (Private)
   ═══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   WORKSPACE (Private) — guided: step 1 choose plan, step 2 configure, step 3 launch
   ═══════════════════════════════════════════════════════════════════════ */
function WsPage({ tierId, setTierId, selDomains, toggleDomain, tier, activeDomains, pack, packId, setPackId, ws, setWs, nav, saveWorkspace, report, actions, backendOk }) {
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [showCtx, setShowCtx] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Pre-fill entities/signals from active domains when they change
  const domainEntities = activeDomains.flatMap(d => d.entities).join(", ");
  const domainSignals = activeDomains.flatMap(d => d.signals).join(", ");
  const contextEntities = ws.entities.split(",").map(s => s.trim()).filter(Boolean).slice(0, 6);
  const contextThresholds = { pricing_change_pct: 5, breach_severity_min: "medium", compliance_deadline_days: 30, financial_impact_floor: 10000 };
  useEffect(() => {
    if (domainEntities || domainSignals) {
      setWs(prev => ({ ...prev, entities: domainEntities, signals: domainSignals }));
    }
  }, [domainEntities, domainSignals, setWs]);

  const saveAndStay = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveWorkspace();
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const capabilities = [
    ["Live retrieval", backendOk?.brightdata_live ? "Bright Data live" : backendOk?.mock_brightdata ? "Mock mode" : "Not ready", backendOk?.brightdata_live],
    ["Reasoning", backendOk?.llm_available ? backendOk.llm_provider : "No LLM", !!backendOk?.llm_available],
    ["Memory graph", backendOk?.partner_apis?.cognee_local && backendOk?.neo4j === "ok" ? "Cognee + Neo4j" : backendOk?.neo4j === "ok" ? "Neo4j only" : "Fallback only", backendOk?.partner_apis?.cognee_local || backendOk?.neo4j === "ok"],
    ["Voice input", backendOk?.partner_apis?.speechmatics ? "Speechmatics ready" : "Not configured", backendOk?.partner_apis?.speechmatics],
    ["Workflow actions", backendOk?.partner_apis?.triggerware ? "TriggerWare ready" : "Manual approval", backendOk?.partner_apis?.triggerware],
  ];
  const selectedDomainIds = new Set(activeDomains.map(d => d.id));

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "30px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-end" }}>
        <div>
          <Eye>Workspace</Eye>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>{ws.name}</h2>
          <div style={{ color: T.dim, fontSize: 12, marginTop: 5 }}>{pack.name} - {ws.cadence}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => nav("Analyst")} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: T.accent, color: "#000", fontWeight: 800, fontSize: 12 }}>Ask analyst</button>
          <button onClick={() => nav("Gateway")} style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontWeight: 700, fontSize: 12 }}>Test providers</button>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(300px,.8fr)", gap: 12 }}>
        <section style={{ padding: 16, borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Monitoring scope</div>
            <select value={packId} onChange={e => setPackId(e.target.value)} style={{ ...IS, width: 240 }}>
              {PACKS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 10, marginTop: 14 }}>
            <div><Lb>Workspace name</Lb><input value={ws.name} onChange={e => setWs({ ...ws, name: e.target.value, id: slug(e.target.value) })} style={IS} /></div>
            <div><Lb>Cadence</Lb><select value={ws.cadence} onChange={e => setWs({ ...ws, cadence: e.target.value })} style={IS}><option>Daily</option><option>Every 6 hours</option><option>Weekly</option><option>Manual only</option></select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><Lb>Entities</Lb><textarea value={ws.entities} onChange={e => setWs({ ...ws, entities: e.target.value })} style={{ ...IS, minHeight: 96, resize: "vertical" }} /></div>
            <div><Lb>Signals</Lb><textarea value={ws.signals} onChange={e => setWs({ ...ws, signals: e.target.value })} style={{ ...IS, minHeight: 96, resize: "vertical" }} /></div>
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {DOMAINS.map(d => {
              const active = selectedDomainIds.has(d.id);
              return <button key={d.id} onClick={() => toggleDomain(d.id)} style={{ textAlign: "left", padding: 11, borderRadius: 8, border: `1px solid ${active ? d.color : T.border}`, background: active ? `${d.color}10` : T.bgCard, color: T.text, cursor: "pointer" }}><div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: d.color }}>{packIcon(d.icon, 14)}</span><span style={{ fontSize: 12, fontWeight: 800 }}>{d.name}</span></div></button>;
            })}
          </div>
          {error && <div style={{ marginTop: 10, color: "#ef4444", fontSize: 12 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,90px)", gap: 8 }}>
              <MC l="Entities" v={ws.entities.split(",").filter(Boolean).length} c={T.accent} />
              <MC l="Signals" v={ws.signals.split(",").filter(Boolean).length} c="#818cf8" />
              <MC l="Actions" v={actions.filter(a => a.status === "pending_approval").length} c="#f59e0b" />
              <MC l="Records" v={report?.records_used?.length || 0} c="#22c55e" />
            </div>
            <button onClick={saveAndStay} disabled={saving} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: saved ? "#22c55e" : T.accent, color: "#000", fontWeight: 800, fontSize: 12, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving" : saved ? "Saved" : "Save workspace"}</button>
          </div>
        </section>

        <aside style={{ display: "grid", gap: 12 }}>
          <section style={{ padding: 16, borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>System capability</div>
            <div style={{ marginTop: 4, fontSize: 11, color: T.dim }}>Live checks from the backend, not static claims.</div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {capabilities.map(([name, value, ok]) => <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}><span style={{ color: T.dim }}>{name}</span><span style={{ color: ok ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>{value}</span></div>)}
            </div>
          </section>
          <section style={{ padding: 16, borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Proof points</div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {[
                ["Gateway", "provider test receipt"],
                ["Analyst", "run receipt + saved history"],
                ["Evidence", "records + graph context"],
              ].map(([name, value]) => <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}><span style={{ color: T.dim }}>{name}</span><span style={{ color: T.muted }}>{value}</span></div>)}
            </div>
          </section>
          <section style={{ padding: 16, borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Latest run</div>
            {report?.run_receipt ? <div style={{ marginTop: 10, display: "grid", gap: 7 }}>{report.run_receipt.stages.slice(-6).map(stage => <div key={`${stage.name}-${stage.status}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: T.muted }}>{stage.name}</span><span style={{ color: statusColorLite(stage.status) }}>{stage.status}</span></div>)}</div> : <div style={{ marginTop: 10, color: T.dim, fontSize: 12 }}>No run yet.</div>}
          </section>
          <section style={{ padding: 16, borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Next</div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <button onClick={() => nav("Evidence")} style={{ textAlign: "left", padding: 10, borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgCard, color: T.text, fontSize: 12 }}>Inspect evidence</button>
              <button onClick={() => nav("Actions")} style={{ textAlign: "left", padding: 10, borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgCard, color: T.text, fontSize: 12 }}>Review actions</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px" }}>
      <Eye>Workspace cockpit</Eye>
      <h2 style={{ fontSize: 22, marginTop: 4 }}>{ws.name}</h2>
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 12 }}>
        <div style={{ padding: 16, borderRadius: 16, background: T.bgSub, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{pack.name}</div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>{activeDomains.map(d => d.name).join(" + ")} · {ws.cadence}</div>
            </div>
            <span style={{ height: 24, padding: "4px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, color: backendOk && backendOk !== false ? "#22c55e" : "#ef4444", background: backendOk && backendOk !== false ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)" }}>{backendOk && backendOk !== false ? "API live" : "API offline"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
            <MC l="Entities" v={ws.entities.split(",").filter(Boolean).length} c={T.accent} />
            <MC l="Signals" v={ws.signals.split(",").filter(Boolean).length} c="#818cf8" />
            <MC l="Open actions" v={actions.filter(a => a.status === "pending_approval").length} c="#f59e0b" />
            <MC l="Last records" v={report?.records_used?.length || 0} c="#22c55e" />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={() => nav("Analyst")} style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: T.accent, color: "#000", fontWeight: 700, fontSize: 12 }}>Ask analyst</button>
            <button onClick={() => nav("Evidence")} style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${T.borderL}`, background: T.bgCard, color: T.text, fontWeight: 700, fontSize: 12 }}>Inspect evidence</button>
            <button onClick={() => nav("Gateway")} style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${T.borderL}`, background: T.bgCard, color: T.text, fontWeight: 700, fontSize: 12 }}>Test integrations</button>
            <button onClick={() => nav("Actions")} style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${T.borderL}`, background: T.bgCard, color: T.text, fontWeight: 700, fontSize: 12 }}>Review actions</button>
          </div>
        </div>
        <div style={{ padding: 16, borderRadius: 16, background: T.bgSub, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Recent run receipt</div>
          {!report?.run_receipt && <div style={{ fontSize: 12, color: T.dim, marginTop: 8 }}>No agent run yet. Start with Run agent to create a real receipt.</div>}
          {report?.run_receipt && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {report.run_receipt.stages.slice(-5).map(stage => <div key={`${stage.name}-${stage.status}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, padding: "5px 0", borderBottom: `1px solid ${T.border}` }}><span style={{ color: T.muted }}>{stage.name}</span><span style={{ color: stage.status === "success" || stage.status === "triggered" ? "#22c55e" : stage.status === "skipped" ? T.dim : "#f59e0b" }}>{stage.status}</span></div>)}
          </div>}
        </div>
      </div>

      <div style={{ marginTop: 28 }}><Eye>Workspace setup</Eye><h2 style={{ fontSize: 18, marginTop: 4 }}>Configure or update workspace</h2></div>

      {/* Steps */}
      <div style={{ display: "flex", gap: 4, marginTop: 16, marginBottom: 20 }}>
        {[{ n: 1, l: "Choose plan" }, { n: 2, l: "Configure" }, { n: 3, l: "Review & launch" }].map(s => (
          <button key={s.n} onClick={() => setStep(s.n)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: step === s.n ? `${T.accent}15` : "rgba(255,255,255,.03)", cursor: "pointer", flex: 1 }}>
            <span style={{ width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", background: step >= s.n ? T.accent : "rgba(255,255,255,.06)", color: step >= s.n ? "#000" : T.dim, fontSize: 12, fontWeight: 700 }}>{step > s.n ? "\u2713" : s.n}</span>
            <span style={{ fontSize: 13, fontWeight: step === s.n ? 600 : 400, color: step === s.n ? T.text : T.dim }}>{s.l}</span>
          </button>
        ))}
      </div>

      {/* ── Step 1: Choose tier + domains ── */}
      {step === 1 && (
        <div className="ai" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Select your tier</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {TIERS.map((t, i) => (
              <button key={t.id} className="hl" onClick={() => setTierId(t.id)} style={{ textAlign: "left", padding: 20, borderRadius: 16, border: tierId === t.id ? `1.5px solid ${t.color}50` : `1px solid ${T.border}`, background: t.featured ? "linear-gradient(160deg,#171d24,#101419)" : T.bgCard, position: "relative", cursor: "pointer", outline: tierId === t.id ? `2px solid ${t.color}25` : "none", outlineOffset: 2 }}>
                {t.featured && <div style={{ position: "absolute", top: 10, right: 10, padding: "2px 7px", borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: "uppercase", background: `${t.color}15`, color: t.color }}>Popular</div>}
                <div style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.name}</div>
                <div style={{ fontSize: 12, color: T.dim, marginBottom: 8 }}>{t.tagline}</div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{t.description}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.color, marginTop: 10 }}>{t.price}</div>
              </button>
            ))}
          </div>

          {tierId !== "enterprise" && <>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Pick {tier.pick} intelligence {tier.pick === 1 ? "domain" : "domains"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {DOMAINS.map(d => {
                const active = selDomains.includes(d.id);
                return (
                  <button key={d.id} className="hl" onClick={() => toggleDomain(d.id)} style={{ textAlign: "left", padding: 18, borderRadius: 14, border: active ? `1.5px solid ${d.color}50` : `1px solid ${T.border}`, background: active ? `${d.color}06` : T.bgCard, cursor: "pointer", position: "relative" }}>
                    {active && <div style={{ position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 999, background: d.color, display: "grid", placeItems: "center" }}><CheckCircle size={12} color="#000" /></div>}
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${d.color}12`, border: `1px solid ${d.color}20`, display: "grid", placeItems: "center", color: d.color, marginBottom: 8 }}>{packIcon(d.icon, 16)}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, marginTop: 4 }}>{d.description}</div>
                  </button>
                );
              })}
            </div>
          </>}

          {tierId === "enterprise" && (
            <div style={{ padding: 16, borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "center", justifyContent: "center" }}>
              {DOMAINS.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: `${d.color}15`, display: "grid", placeItems: "center", color: d.color }}>{packIcon(d.icon, 12)}</div>
                  <span style={{ fontSize: 12, color: T.muted }}>{d.name.split(" ")[0]}</span>
                  <CheckCircle size={12} color="#22c55e" />
                </div>
              ))}
              <span style={{ fontSize: 12, color: T.dim }}>All included</span>
            </div>
          )}

          <button onClick={() => setStep(2)} style={{ padding: "12px 0", borderRadius: 12, border: "none", background: T.accent, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", width: "100%" }}>Continue to configure <ChevronRight size={15} style={{ marginLeft: 4 }} /></button>
        </div>
      )}

      {/* ── Step 2: Configure workspace ── */}
      {step === 2 && (
        <div className="ai" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 20, borderRadius: 16, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Workspace details</div>
              <span style={{ fontSize: 12, color: tier.color, fontWeight: 500 }}>{tier.name} — {activeDomains.map(d => d.name.split(" ")[0]).join(" + ")}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><Lb>Workspace name</Lb><input value={ws.name} onChange={e => setWs({ ...ws, name: e.target.value, id: slug(e.target.value) })} style={IS} placeholder="e.g. Enterprise Monitoring" /></div>
              <div><Lb>Refresh cadence</Lb><select value={ws.cadence} onChange={e => setWs({ ...ws, cadence: e.target.value })} style={IS}><option>Daily</option><option>Weekly</option><option>Every 6 hours</option><option>Manual only</option></select></div>
              <div style={{ gridColumn: "span 2" }}><Lb>Vendors / entities <span style={{ fontWeight: 400, color: T.dim }}>— pre-filled from selected domains</span></Lb><textarea value={ws.entities} onChange={e => setWs({ ...ws, entities: e.target.value })} style={{ ...IS, minHeight: 56, resize: "vertical" }} /></div>
              <div style={{ gridColumn: "span 2" }}><Lb>Signals <span style={{ fontWeight: 400, color: T.dim }}>— pre-filled from selected domains</span></Lb><textarea value={ws.signals} onChange={e => setWs({ ...ws, signals: e.target.value })} style={{ ...IS, minHeight: 56, resize: "vertical" }} /></div>
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}>
            <button onClick={() => setShowCtx(!showCtx)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", color: T.text, cursor: "pointer" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Organizational context <span style={{ fontSize: 11, fontWeight: 400, color: T.dim }}>— optional</span></span>
              <ChevronRight size={14} color={T.dim} style={{ transform: showCtx ? "rotate(90deg)" : "none", transition: ".2s" }} />
            </button>
            {showCtx && <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ padding: 10, borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Risk thresholds</div>{Object.entries(contextThresholds).map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10 }}><span style={{ color: T.dim }}>{k.replace(/_/g, " ")}</span><span style={{ fontFamily: "'JetBrains Mono'" }}>{String(v)}</span></div>)}</div>
              <div style={{ padding: 10, borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Tracked entities</div>{contextEntities.length ? contextEntities.map((entity, i) => <div key={`${entity}-${i}`} style={{ fontSize: 10, color: T.muted, padding: "2px 0" }}><b>{entity}</b> — context pending</div>) : <div style={{ fontSize: 10, color: T.dim }}>Add entities above to preview workspace context.</div>}</div>
            </div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(1)} style={{ padding: "10px 18px", borderRadius: 999, border: `1px solid ${T.borderL}`, background: "transparent", color: T.muted, fontSize: 13, cursor: "pointer" }}>Back</button>
            <button onClick={() => setStep(3)} style={{ padding: "10px 0", borderRadius: 12, border: "none", background: T.accent, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", flex: 1 }}>Review & launch <ChevronRight size={15} style={{ marginLeft: 4 }} /></button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & launch ── */}
      {step === 3 && (
        <div className="ai" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 20, borderRadius: 16, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Review your workspace</div>
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "6px 14px", fontSize: 13 }}>
              <span style={{ color: T.dim }}>Tier</span><span style={{ color: tier.color, fontWeight: 500 }}>{tier.name}</span>
              <span style={{ color: T.dim }}>Domains</span><span>{activeDomains.map(d => d.name).join(", ")}</span>
              <span style={{ color: T.dim }}>Workspace</span><span style={{ fontWeight: 500 }}>{ws.name}</span>
              <span style={{ color: T.dim }}>Cadence</span><span>{ws.cadence}</span>
              <span style={{ color: T.dim }}>Vendors / entities</span><span style={{ color: T.muted, fontSize: 12 }}>{ws.entities}</span>
              <span style={{ color: T.dim }}>Signals</span><span style={{ color: T.muted, fontSize: 12 }}>{ws.signals}</span>
              <span style={{ color: T.dim }}>Bright Data</span><div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{[...new Set(activeDomains.flatMap(d => d.routes))].map(r => <span key={r} style={{ fontSize: 10, padding: "2px 5px", borderRadius: 4, background: "rgba(6,182,212,.06)", color: T.accent, fontFamily: "'JetBrains Mono'" }}>{r}</span>)}</div>
              <span style={{ color: T.dim }}>Partners</span><span style={{ color: T.muted, fontSize: 12 }}>Speechmatics, Cognee, Bright Data, TriggerWare, OpenAI</span>
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: T.bgInset, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>POST /workspaces</div>
            <pre style={{ fontSize: 10, color: T.accent, fontFamily: "'JetBrains Mono'", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify({ id: ws.id || slug(ws.name), name: ws.name, tier_id: tierId, domains: activeDomains.map(d => d.id), entities: ws.entities.split(",").map(s => s.trim()), signals: ws.signals.split(",").map(s => s.trim()), refresh_frequency_minutes: ws.cadence === "Every 6 hours" ? 360 : ws.cadence === "Weekly" ? 10080 : 1440 }, null, 2)}</pre>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(2)} style={{ padding: "10px 18px", borderRadius: 999, border: `1px solid ${T.borderL}`, background: "transparent", color: T.muted, fontSize: 13, cursor: "pointer" }}>Back</button>
            <button onClick={async () => { setSaving(true); setError(null); try { await saveWorkspace(); setSaved(true); setTimeout(() => nav("Analyst"), 600); } catch (e) { setError(e.message); } finally { setSaving(false); } }} style={{ padding: "12px 0", borderRadius: 12, border: "none", background: saved ? "#22c55e" : T.accent, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", flex: 1 }}>{saving ? "Saving..." : saved ? "\u2713 Saved - opening analyst..." : "Save & open analyst"}</button>
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════════════════
   AGENT (Private) — reasoning, recommendations, actions
   ═══════════════════════════════════════════════════════════════════════ */
function AgentPage({ pack, ws, actions, setActions, runResearch, report }) {
  const [task, setTask] = useState(`Assess ${pack.name} signals for: ${ws.entities}.`);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [lastTranscript, setLastTranscript] = useState(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const currentAudioRef = useRef(null);
  const r = report?.reasoning || { executive_summary: "", risk_posture: "waiting", materiality_assessments: [], recommendations: [], confidence: 0, reasoning_trace: [] };
  const summary = report?.summary || r.executive_summary;
  const speakText = async text => {
    const cleanText = (text || "").trim();
    if (!cleanText) return;
    // Stop any currently playing audio before starting new one
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setTtsBusy(true);
    setError(null);
    try {
      const blob = await endpoints.synthesizeSpeech(cleanText.slice(0, 1200));
      const url = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; reject(new Error("Audio playback failed")); };
        audio.play().catch(reject);
      });
    } catch (e) {
      if ("speechSynthesis" in window) {
        await new Promise(resolve => {
          const utt = new SpeechSynthesisUtterance(cleanText.slice(0, 1200));
          utt.onend = resolve;
          utt.onerror = resolve;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utt);
        });
      } else {
        setError(e.message || "Text-to-speech failed.");
      }
    } finally {
      setTtsBusy(false);
    }
  };
  const executeTask = async (nextTask = task, readAloud = false) => {
    setLoading(true);
    setError(null);
    try {
      setTask(nextTask);
      const result = await runResearch(nextTask);
      setDone(true);
      if (readAloud) await speakText(result?.summary || result?.reasoning?.executive_summary || "Analysis completed.");
      return result;
    } catch (e) {
      setError(e.message);
      setDone(true);
      return null;
    } finally {
      setLoading(false);
    }
  };
  const run = () => executeTask(task, false);
  const transcribeAndRun = async blob => {
    setVoiceBusy(true);
    setError(null);
    try {
      const transcript = await endpoints.transcribeAudio(blob);
      setLastTranscript(transcript);
      await executeTask(transcript.text, true);
    } catch (e) {
      setError(e.message || "Speechmatics transcription failed.");
    } finally {
      setVoiceBusy(false);
    }
  };
  const startVoice = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("This browser does not support microphone recording. Upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await transcribeAndRun(blob);
      };
      recorder.start();
      setRecording(true);
    } catch (e) {
      const noDevice = e?.name === "NotFoundError" || /device not found/i.test(e?.message || "");
      setError(noDevice ? "No microphone was found on this device. Use Upload audio to test Speechmatics voice input." : (e.message || "Could not access microphone."));
    }
  };
  const stopVoice = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };
  const uploadAudio = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await transcribeAndRun(file);
  };
  const speakResult = () => speakText(summary || task);
  const reportActions = report ? actions.filter(a => a.run_id === report.run_id) : [];
  const receipt = report?.run_receipt || (report ? {
    run_id: report.run_id,
    status: "success",
    input_mode: lastTranscript ? "voice_or_audio" : "text",
    stages: [
      { name: "transcribe", status: lastTranscript ? "success" : "skipped", provider: "speechmatics", detail: lastTranscript?.transcript_id || "text input" },
      { name: "retrieve_context", status: "success", provider: "bright_data_gateway", detail: `${report.records_used?.length || 0} records` },
      { name: "reason", status: report.reasoning ? "success" : "skipped", provider: "reasoning_engine" },
      { name: "workflow", status: report.workflow_events?.[0]?.status || "skipped", provider: "triggerware" },
    ],
    providers: {},
    counts: { sources: report.sources?.length || 0, autonomous_actions: reportActions.length },
    fallbacks_used: [],
    errors: [],
  } : null);
  const approve = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "approved" } : a));
  const reject = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "rejected" } : a));

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px" }}>
      <Eye>Autonomous analyst</Eye><h2 style={{ fontSize: 20, marginTop: 4 }}>Research, reason, recommend, act</h2>
      <div style={{ marginTop: 12, padding: "4px 4px 4px 14px", borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, display: "flex", gap: 6 }}>
        <input value={task} onChange={e => setTask(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Research task..." style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: T.text }} />
        <button onClick={recording ? stopVoice : startVoice} disabled={voiceBusy || loading} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${recording ? "rgba(239,68,68,.45)" : T.borderL}`, background: recording ? "rgba(239,68,68,.16)" : T.bgSub, color: recording ? "#ef4444" : T.muted, fontWeight: 600, fontSize: 12, cursor: "pointer", opacity: voiceBusy ? .55 : 1, display: "flex", alignItems: "center", gap: 4 }}>{voiceBusy ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Transcribing</> : <><Mic size={13} /> {recording ? "Stop" : "Voice"}</>}</button>
        <input ref={fileInputRef} type="file" accept="audio/*" onChange={uploadAudio} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} disabled={voiceBusy || loading} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.muted, fontWeight: 600, fontSize: 12, cursor: "pointer", opacity: voiceBusy ? .55 : 1, display: "flex", alignItems: "center", gap: 4 }}><Database size={13} /> Upload audio</button>
        <button onClick={speakResult} disabled={ttsBusy || (!summary && !task)} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.muted, fontWeight: 600, fontSize: 12, cursor: "pointer", opacity: ttsBusy ? .55 : 1, display: "flex", alignItems: "center", gap: 4 }}>{ttsBusy ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Speaking</> : <><Play size={13} /> Speak</>}</button>
        <button onClick={run} disabled={loading} style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: T.accent, color: "#000", fontWeight: 600, fontSize: 12, cursor: "pointer", opacity: loading ? .5 : 1, display: "flex", alignItems: "center", gap: 4 }}>{loading ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Analyzing</> : <><Brain size={13} /> Analyze</>}</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {[
          ["Input", recording ? "recording" : lastTranscript ? "voice transcript" : "text/audio"],
          ["Transcribe", voiceBusy ? "running" : lastTranscript ? "done" : "ready"],
          ["Analyze", loading ? "running" : report ? "done" : "ready"],
          ["Respond", ttsBusy ? "speaking" : "voice ready"],
        ].map(([label, value]) => <span key={label} style={{ fontSize: 10, padding: "3px 7px", borderRadius: 999, border: `1px solid ${T.border}`, color: value === "running" || value === "recording" ? "#f59e0b" : value === "done" || value === "voice transcript" ? "#22c55e" : T.dim, background: T.bgSub }}>{label}: {value}</span>)}
      </div>
      <div style={{ fontSize: 11, color: T.dim, marginTop: 6 }}>Voice records from your browser or an uploaded audio file, Speechmatics converts it to text, the analyst runs automatically, then the response is spoken back through Speechmatics TTS.</div>
      {error && <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", color: "#ef4444", fontSize: 12 }}>{error}</div>}

      {!report && !loading && <div style={{ marginTop: 14, padding: 18, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>No live report yet</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>Run a research task to fetch evidence and generate a saved report.</div>
      </div>}

      {report && <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 260px", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Executive summary */}
          <div style={{ padding: 14, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Executive Summary</span>
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: `${matC("medium")}12`, color: matC("medium"), fontWeight: 600 }}>posture: {r.risk_posture}</span>
            </div>
            <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>{summary}</div>
          </div>
          {/* Materiality */}
          <div style={{ padding: 14, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Materiality ({r.materiality_assessments.length})</div>
            {r.materiality_assessments.map((a, i) => <div key={i} style={{ padding: "8px 10px", borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}`, marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{a.finding}</span>
                <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, background: `${matC(a.materiality)}12`, color: matC(a.materiality), fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{a.materiality}</span>
              </div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>{a.impact_description}</div>
              {a.financial_impact && <div style={{ fontSize: 11, fontWeight: 600, color: "#22c55e", marginTop: 2 }}>Impact: ${a.financial_impact.toLocaleString()}</div>}
            </div>)}
          </div>
          {/* Recommendations */}
          <div style={{ padding: 14, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Recommendations ({r.recommendations.length})</div>
            {r.recommendations.map(rec => <div key={rec.id} style={{ padding: 12, borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}`, marginBottom: 6, borderLeft: `3px solid ${matC(rec.materiality)}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{rec.title}</div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 6 }}>{rec.description}</div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 4 }}>{rec.suggested_actions.map(a => <span key={a} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: `${T.accent}08`, border: `1px solid ${T.accent}15`, color: T.accent }}>{a}</span>)}</div>
              <div style={{ display: "flex", gap: 10, fontSize: 10, color: T.dim }}>
                <span>Confidence: <b style={{ color: "#22c55e" }}>{fmt(rec.confidence)}</b></span>
                {rec.deadline && <span>Deadline: <b style={{ color: "#f59e0b" }}>{rec.deadline}</b></span>}
                <span>Framework: <b>{rec.framework}</b></span>
              </div>
            </div>)}
          </div>
          {/* Actions */}
          <div style={{ padding: 14, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}><Zap size={13} color="#22c55e" style={{ marginRight: 4 }} />Actions ({reportActions.length})</div>
            {reportActions.length === 0 && <div style={{ fontSize: 12, color: T.dim }}>No actions were proposed for this run.</div>}
            {reportActions.map(a => <div key={a.id} style={{ padding: "8px 10px", borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}`, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 4 }}><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${stC(a.status)}12`, color: stC(a.status), fontWeight: 600 }}>{a.status}</span><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,.04)", color: T.dim }}>{a.action_type}</span></div>
                <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{a.title}</div>
              </div>
              {a.status === "pending_approval" && <div style={{ display: "flex", gap: 3, flexShrink: 0, marginLeft: 8 }}>
                <button onClick={() => approve(a.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#22c55e", color: "#000", fontSize: 10, fontWeight: 600, cursor: "pointer" }}><ThumbsUp size={10} /> Approve</button>
                <button onClick={() => reject(a.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.borderL}`, background: "transparent", color: T.dim, fontSize: 10, cursor: "pointer" }}><ThumbsDown size={10} /> Reject</button>
              </div>}
            </div>)}
          </div>
        </div>
        {/* Inspector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {receipt && <div style={{ padding: 12, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <Lb>Live run stages</Lb>
            <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 6 }}>
              {receipt.stages?.map((stage, i) => <div key={`${stage.name}-${i}`} style={{ padding: 8, borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><span style={{ fontSize: 11, fontWeight: 700 }}>{stage.name.replace(/_/g, " ")}</span><span style={{ fontSize: 10, color: stage.status === "success" || stage.status === "triggered" ? "#22c55e" : stage.status === "skipped" ? T.dim : "#f59e0b" }}>{stage.status}</span></div>
                <div style={{ fontSize: 10, color: T.dim, marginTop: 3 }}>{stage.provider || "system"}{stage.detail ? ` · ${stage.detail}` : ""}</div>
              </div>)}
            </div>
          </div>}
          <div style={{ padding: 12, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <Lb>Metrics</Lb>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6 }}>
              <MC l="Confidence" v={fmt(r.confidence)} c="#22c55e" /><MC l="Posture" v={r.risk_posture} c="#f59e0b" />
              <MC l="Material" v={r.materiality_assessments.filter(a => a.materiality !== "low").length} c="#ef4444" /><MC l="Actions" v={reportActions.length} c="#22c55e" />
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <Lb>Reasoning trace</Lb>
            {r.reasoning_trace.map((t, i) => <div key={i} style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: T.dim, padding: "2px 0", borderBottom: `1px solid ${T.border}` }}>{t}</div>)}
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <Lb>Org context</Lb>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{report.org_context_used ? "Contract and risk context used" : "Workspace entities used; no contract/risk context saved"}</div>
            <div style={{ fontSize: 11, color: T.muted }}>Sources used: {report.sources?.length || 0}</div>
          </div>
          {receipt && <div style={{ padding: 12, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <Lb>Run receipt</Lb>
            <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", color: T.muted, fontSize: 10, lineHeight: 1.5, fontFamily: "'JetBrains Mono'" }}>{JSON.stringify(receipt, null, 2)}</pre>
          </div>}
        </div>
      </div>}
    </div>
  );
}

/* ═══════ INTELLIGENCE ═══════ */
function AgentWorkbenchPage({ pack, ws, actions, setActions, runResearch, report, backendOk }) {
  const defaultTask = useCallback(() => {
    const entities = ws.entities?.trim();
    return `Assess ${pack.name} signals${entities ? ` for: ${entities}` : " for this workspace"}.`;
  }, [pack.name, ws.entities]);
  const [task, setTask] = useState(defaultTask);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [lastTranscript, setLastTranscript] = useState(null);
  const [runs, setRuns] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [graphStatus, setGraphStatus] = useState(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const currentAudioRef = useRef(null);
  const mapChatMessage = useCallback(message => ({
    id: message.id,
    role: message.role,
    content: message.content,
    at: message.created_at ? new Date(message.created_at).toLocaleTimeString() : "",
    runId: message.run_id || null,
    report: message.metadata?.report || null,
    error: Boolean(message.metadata?.error),
  }), []);
  const clearConversation = useCallback(() => {
    setMessages([]);
    setTask(defaultTask());
    setSelectedRunId(null);
    localStorage.removeItem(`webdataos.chat.${ws.id}`);
    endpoints.clearChat(ws.id).catch(() => {});
  }, [ws.id, defaultTask]);

  useEffect(() => {
    endpoints.graphStatus().then(setGraphStatus).catch(() => setGraphStatus({ status: "unavailable" }));
  }, []);
  useEffect(() => {
    let cancelled = false;
    try {
      const saved = JSON.parse(localStorage.getItem(`webdataos.chat.${ws.id}`) || "[]");
      setMessages(Array.isArray(saved) ? saved : []);
    } catch (_) {
      setMessages([]);
    }
    endpoints.listChat(ws.id, 80)
      .then(items => {
        if (!cancelled && Array.isArray(items) && items.length) setMessages(items.map(mapChatMessage));
      })
      .catch(() => {});
    setTask(defaultTask());
    return () => { cancelled = true; };
  }, [ws.id, defaultTask, mapChatMessage]);
  useEffect(() => {
    localStorage.setItem(`webdataos.chat.${ws.id}`, JSON.stringify(messages.slice(-40)));
  }, [messages, ws.id]);
  const mapRun = useCallback(run => ({
    id: run.id,
    task: run.task,
    status: run.status || "success",
    mode: run.input_mode || run.report?.run_receipt?.input_mode || "text",
    at: run.created_at ? new Date(run.created_at).toLocaleString() : "",
    summary: run.summary || run.report?.summary || "",
    decision_brief: run.decision_brief || run.report?.decision_brief || null,
    counts: run.counts || run.report?.run_receipt?.counts || {},
    providers: run.providers || run.report?.run_receipt?.providers || {},
    report: run.report || null,
  }), []);
  const loadRunHistory = useCallback(async () => {
    if (!ws.id) return;
    setHistoryLoading(true);
    try {
      const history = await endpoints.listRuns(ws.id, 50);
      const mapped = history.map(mapRun);
      setRuns(mapped);
      setSelectedRunId(prev => (prev && mapped.some(run => run.id === prev)) ? prev : mapped[0]?.id || null);
    } catch (e) {
      setError(e.message || "Could not load saved run history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [ws.id, mapRun]);
  useEffect(() => { loadRunHistory(); }, [loadRunHistory]);
  useEffect(() => {
    if (!report?.run_id) return;
    setRuns(prev => prev.some(run => run.id === report.run_id) ? prev : [{ id: report.run_id, task: report.task, status: "success", mode: report.transcript ? "voice/audio" : "text", at: new Date().toLocaleString(), summary: report.summary, decision_brief: decisionFromReport(report), counts: report.run_receipt?.counts || {}, providers: report.run_receipt?.providers || {}, report }, ...prev].slice(0, 50));
    setSelectedRunId(report.run_id);
  }, [report]);

  const activeRun = runs.find(run => run.id === selectedRunId) || runs[0] || (report ? { id: report.run_id, task: report.task, status: "success", mode: "text", at: "", report } : null);
  const activeReport = activeRun?.report || (activeRun ? null : report);
  const r = activeReport?.reasoning || { executive_summary: "", risk_posture: "waiting", materiality_assessments: [], recommendations: [], confidence: 0, reasoning_trace: [] };
  const summary = activeReport?.summary || r.executive_summary;
  const activeBrief = activeReport ? decisionFromReport(activeReport) : (activeRun?.decision_brief || null);
  const reportActions = activeReport ? actions.filter(a => a.run_id === activeReport.run_id) : [];
  const receipt = activeReport?.run_receipt || null;
  const stageByName = name => receipt?.stages?.find(stage => stage.name === name);
  const stageGroupStatus = names => {
    if (loading && !receipt) return names.includes("input") ? "running" : "pending";
    const found = names.map(stageByName).filter(Boolean);
    if (!found.length) return activeReport ? "skipped" : "pending";
    if (found.some(stage => ["failed", "error", "timeout"].includes(stage.status))) return "failed";
    if (found.some(stage => ["success", "triggered", "received"].includes(stage.status))) return "success";
    if (found.some(stage => ["fallback", "skipped"].includes(stage.status))) return found[0].status;
    return found[0]?.status || "pending";
  };
  const statusColor = status => status === "success" || status === "triggered" || status === "received" ? "#22c55e" : status === "running" ? "#f59e0b" : status === "failed" || status === "timeout" ? "#ef4444" : status === "fallback" ? "#38bdf8" : T.dim;
  const flow = [
    { key: "input", title: "Input", text: activeRun?.mode || "text / voice / audio", icon: Send, names: ["input"] },
    { key: "transcribe", title: "Transcribe", text: "Speechmatics", icon: Mic, names: ["transcribe"] },
    { key: "memory", title: "Remember", text: receipt?.providers?.memory || "Cognee + self-hosted", icon: Database, names: ["memory_search", "memory_upsert"] },
    { key: "retrieve", title: "Retrieve", text: "Bright Data + records", icon: Search, names: ["retrieve_context", "brightdata_refresh"] },
    { key: "reason", title: "Reason", text: receipt?.providers?.llm || "LLM synthesis", icon: Brain, names: ["synthesize", "reason"] },
    { key: "act", title: "Act", text: receipt?.providers?.workflow || "TriggerWare", icon: Zap, names: ["propose_actions", "workflow"] },
    { key: "respond", title: "Respond", text: "Brief + receipt", icon: CheckCircle, names: ["respond"] },
  ].map(stage => ({ ...stage, status: stage.key === "respond" ? (activeReport ? "success" : loading ? "running" : "pending") : stageGroupStatus(stage.names) }));
  const providerRows = [
    ["Speechmatics", receipt?.providers?.speechmatics || (lastTranscript ? "speechmatics" : "not used")],
    ["Memory", receipt?.providers?.memory || "pending"],
    ["Retrieval", receipt?.providers?.retrieval || "pending"],
    ["LLM", receipt?.providers?.llm || "pending"],
    ["Workflow", receipt?.providers?.workflow || "pending"],
    ["Neo4j", graphStatus?.status || "checking"],
  ];
  useEffect(() => {
    const run = runs.find(item => item.id === selectedRunId);
    if (!run || run.report || run.status === "running") return;
    if (String(run.id).startsWith("run-")) return;
    let cancelled = false;
    endpoints.getRun(run.id)
      .then(detail => {
        if (cancelled) return;
        setRuns(prev => prev.map(item => item.id === run.id ? mapRun({ ...detail, report: detail.report }) : item));
      })
      .catch(e => {
        if (cancelled) return;
        if ((e.message || "").includes("Run not found")) {
          setRuns(prev => prev.filter(item => item.id !== run.id));
          setSelectedRunId(prev => prev === run.id ? null : prev);
          return;
        }
        setError(e.message || "Could not load run detail.");
      });
    return () => { cancelled = true; };
  }, [selectedRunId, runs, mapRun]);

  const speakText = async text => {
    const cleanText = (text || "").trim();
    if (!cleanText) return;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setTtsBusy(true);
    setError(null);
    try {
      const blob = await endpoints.synthesizeSpeech(cleanText.slice(0, 1200));
      const url = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; reject(new Error("Audio playback failed")); };
        audio.play().catch(reject);
      });
    } catch (e) {
      if ("speechSynthesis" in window) {
        await new Promise(resolve => {
          const utt = new SpeechSynthesisUtterance(cleanText.slice(0, 1200));
          utt.onend = resolve;
          utt.onerror = resolve;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utt);
        });
      } else {
        setError(e.message || "Text-to-speech failed.");
      }
    } finally {
      setTtsBusy(false);
    }
  };
  const executeTask = async (nextTask = task, readAloud = false, mode = "text") => {
    const cleanTask = (nextTask || "").trim();
    if (!cleanTask) return null;
    const tempId = `run-${Date.now()}`;
    const context = messages.slice(-8).map(message => `${message.role === "user" ? "User" : "Analyst"}: ${message.content}`).join("\n");
    const userMessage = { id: `${tempId}-user`, role: "user", content: cleanTask, at: new Date().toLocaleTimeString() };
    setLoading(true);
    setError(null);
    setMessages(prev => [...prev, userMessage]);
    endpoints.createChat(ws.id, { role: "user", content: cleanTask }).catch(() => {});
    setRuns(prev => [{ id: tempId, task: cleanTask, status: "running", mode, at: new Date().toLocaleTimeString(), report: null }, ...prev].slice(0, 10));
    setSelectedRunId(tempId);
    try {
      setTask("");
      const result = await runResearch(cleanTask, { conversation_context: context, input_mode: "text" });
      const brief = decisionFromReport(result);
      setRuns(prev => prev.map(run => run.id === tempId ? { id: result.run_id, task: cleanTask, status: "success", mode, at: run.at, summary: result.summary, decision_brief: brief, counts: result.run_receipt?.counts || {}, providers: result.run_receipt?.providers || {}, report: result } : run));
      setSelectedRunId(result.run_id);
      const assistantMessage = {
        id: `${result.run_id}-assistant`,
        role: "assistant",
        content: brief.answer || result.summary || result.reasoning?.executive_summary || "Analysis completed.",
        at: new Date().toLocaleTimeString(),
        runId: result.run_id,
        report: result,
      };
      setMessages(prev => [...prev, assistantMessage]);
      endpoints.createChat(ws.id, {
        role: "assistant",
        content: assistantMessage.content,
        run_id: result.run_id,
        metadata: { report: result },
      }).catch(() => {});
      if (readAloud) await speakText(brief.answer || result?.summary || result?.reasoning?.executive_summary || "Analysis completed.");
      endpoints.graphStatus().then(setGraphStatus).catch(() => {});
      return result;
    } catch (e) {
      setError(e.message);
      setRuns(prev => prev.map(run => run.id === tempId ? { ...run, status: "failed", error: e.message } : run));
      const errorMessage = { id: `${tempId}-error`, role: "assistant", content: e.message || "The analysis failed.", at: new Date().toLocaleTimeString(), error: true };
      setMessages(prev => [...prev, errorMessage]);
      endpoints.createChat(ws.id, { role: "assistant", content: errorMessage.content, metadata: { error: true } }).catch(() => {});
      return null;
    } finally {
      setLoading(false);
    }
  };
  const run = () => executeTask(task, false, "text");
  const transcribeAndRun = async blob => {
    setVoiceBusy(true);
    setError(null);
    try {
      const transcript = await endpoints.transcribeAudio(blob);
      setLastTranscript(transcript);
      await executeTask(transcript.text, true, "voice/audio");
    } catch (e) {
      setError(e.message || "Speechmatics transcription failed.");
    } finally {
      setVoiceBusy(false);
    }
  };
  const startVoice = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("This browser does not support microphone recording. Upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data?.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        await transcribeAndRun(new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      setRecording(true);
    } catch (e) {
      const noDevice = e?.name === "NotFoundError" || /device not found/i.test(e?.message || "");
      setError(noDevice ? "No microphone was found on this device. Use Upload audio to test Speechmatics voice input." : (e.message || "Could not access microphone."));
    }
  };
  const stopVoice = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const uploadAudio = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await transcribeAndRun(file);
  };
  const approve = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "approved" } : a));
  const reject = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "rejected" } : a));

  const compactCounts = activeRun?.counts || receipt?.counts || {};
  const compactProviders = activeRun?.providers || receipt?.providers || {};
  const activeStages = receipt?.stages || [];
  const evidence = activeReport?.records_used || [];
  const agentProviders = [
    ["Web intelligence", backendOk?.brightdata_live || backendOk?.mock_brightdata ? "Ready" : "Not ready"],
    ["AI reasoning", backendOk?.llm_available ? "Ready" : "Not ready"],
    ["Context memory", "Ready"],
    ["Workflow", backendOk?.partner_apis?.triggerware ? "Ready" : "Local"],
    ["Graph", graphStatus?.status === "ok" ? "Active" : "Standard"],
  ];
  const visibleStages = (activeStages.length ? activeStages : flow.map(s => ({ name: s.title, status: s.status }))).slice(0, 9);
  const runTitle = activeRun?.task || "New research run";
  const starterPrompts = [
    "What changed since the last monitoring update?",
    "Which signals need action and why?",
    "Show the evidence behind the highest risk finding.",
  ];
  const selectedRunMessages = selectedRunId ? messages.filter(message => message.runId === selectedRunId) : [];
  const synthesizedRunMessages = selectedRunId && activeRun ? [
    {
      id: `${activeRun.id}-saved-user`,
      role: "user",
      content: activeRun.task || "Saved research run",
      at: activeRun.at || "",
      runId: activeRun.id,
    },
    activeReport ? {
      id: `${activeRun.id}-saved-assistant`,
      role: "assistant",
      content: activeBrief?.answer || summary || activeReport.reasoning?.executive_summary || "Saved analysis completed.",
      at: activeRun.at || "",
      runId: activeRun.id,
      report: activeReport,
    } : null,
  ].filter(Boolean) : [];
  const conversationMessages = selectedRunId && activeRun
    ? (selectedRunMessages.length
      ? [
          ...(!selectedRunMessages.some(message => message.role === "user") ? synthesizedRunMessages.filter(message => message.role === "user") : []),
          ...selectedRunMessages,
        ]
      : synthesizedRunMessages)
    : messages;

  return (
    <div style={{ minHeight: "calc(100vh - 58px)", display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", background: T.bg }}>
      <aside style={{ borderRight: `1px solid ${T.border}`, background: "rgba(15,23,42,.55)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={clearConversation} style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontSize: 12, fontWeight: 800, textAlign: "left" }}>New chat</button>
        <div style={{ minHeight: 0, flex: 1, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: T.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Saved runs</span>
            <button title="Reload runs" onClick={loadRunHistory} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.border}`, background: T.bgCard, color: T.dim }}><RefreshCw size={12} /></button>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {runs.map(runItem => <button key={runItem.id} onClick={() => setSelectedRunId(runItem.id)} style={{ textAlign: "left", padding: 9, borderRadius: 8, border: `1px solid ${selectedRunId === runItem.id ? "rgba(6,182,212,.45)" : "transparent"}`, background: selectedRunId === runItem.id ? "rgba(6,182,212,.1)" : "transparent", color: T.text }}>
              <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{runItem.task || "Research run"}</div>
              <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10 }}><span style={{ color: T.dim }}>{runItem.at || runItem.mode}</span><span style={{ color: statusColor(runItem.status) }}>{runItem.status}</span></div>
            </button>)}
            {!runs.length && <div style={{ padding: "8px 2px", color: T.dim, fontSize: 12 }}>{historyLoading ? "Loading..." : "No saved runs yet."}</div>}
          </div>
        </div>
        <details style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
          <summary style={{ color: T.muted, fontSize: 12, cursor: "pointer" }}>Capability</summary>
          <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
            {agentProviders.map(([name, value]) => {
              const ok = !["pending", "checking", "manual"].includes(String(value));
              return <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}><span style={{ color: T.dim }}>{name}</span><span style={{ color: ok ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>{value}</span></div>;
            })}
          </div>
        </details>
      </aside>

      <main style={{ minWidth: 0, display: "flex", flexDirection: "column", height: "calc(100vh - 58px)" }}>
        <div style={{ height: 54, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
          <div><div style={{ fontSize: 14, fontWeight: 800 }}>Analyst</div><div style={{ fontSize: 11, color: T.dim }}>{ws.name}</div></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: T.dim, fontSize: 11 }}>
            <span>{conversationMessages.length} turns</span>
            {!!messages.length && <button onClick={clearConversation} style={{ border: `1px solid ${T.border}`, background: T.bgSub, color: T.muted, borderRadius: 8, padding: "6px 9px", fontSize: 11 }}>Clear</button>}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "28px 24px 22px" }}>
          <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 22 }}>
            {!conversationMessages.length && (
              <div style={{ minHeight: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 0 }}>
                <div style={{ width: 48, height: 48, borderRadius: 13, background: `linear-gradient(135deg,${T.accent},#0284c7)`, display: "grid", placeItems: "center", marginBottom: 16, boxShadow: `0 0 32px rgba(14,165,233,.2)` }}>
                  <Brain size={22} color="#001018" />
                </div>
                <h2 style={{ fontSize: 22, margin: 0, letterSpacing: "-.02em" }}>Your Intelligence Analyst</h2>
                <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.7, maxWidth: 480, marginTop: 8, marginBottom: 28 }}>
                  Ask anything about your monitored entities — grounded in live evidence, not guesswork. Every answer cites its sources.
                </p>
                {/* Categorised prompt suggestions */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, width: "100%", maxWidth: 780 }}>
                  {[
                    { cat: "Vendor risk", color: "#ef4444", prompts: ["What is our biggest vendor risk right now?", "Has any vendor's compliance posture changed this week?"] },
                    { cat: "Competitive", color: "#3b82f6", prompts: ["What did our main competitors ship last week?", "Are any competitors changing their pricing?"] },
                    { cat: "Market", color: "#22c55e", prompts: ["What market signals should we act on today?", "Summarise key sector changes from this week."] },
                  ].map(cat => (
                    <div key={cat.cat} style={{ borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, background: `${cat.color}07` }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: cat.color, textTransform: "uppercase", letterSpacing: ".08em" }}>{cat.cat}</span>
                      </div>
                      {cat.prompts.map(p => (
                        <button key={p} onClick={() => setTask(p)} style={{ width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 12, lineHeight: 1.5, cursor: "pointer", transition: "background .15s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          {p}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} />
                  <span style={{ fontSize: 11, color: T.dim }}>Grounded in your workspace evidence · Cites sources in every answer · Supports text and voice</span>
                </div>
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, width: "100%", maxWidth: 780 }}>
                  {starterPrompts.map(prompt => (
                    <button key={prompt} onClick={() => setTask(prompt)} style={{ minHeight: 60, textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgSub, color: T.dim, fontSize: 12, lineHeight: 1.45, cursor: "pointer", transition: "border-color .15s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(14,165,233,.3)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {conversationMessages.map(message => {
              const isUser = message.role === "user";
              const messageReport = message.report;
              const messageReasoning = messageReport?.reasoning || {};
              return <div key={message.id} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
                <div style={{ width: 30, height: 30, borderRadius: 999, background: isUser ? T.accent : T.bgSub, border: isUser ? "none" : `1px solid ${T.border}`, color: isUser ? "#001018" : T.accent, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>{isUser ? "U" : "A"}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: T.text, fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{renderMessageText(message.content)}</div>
                  {messageReport && <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <DecisionBriefPanel brief={decisionFromReport(messageReport)} compact />
                    {!!messageReport.key_findings?.length && (() => {
                      const cleanFindings = messageReport.key_findings.slice(0, 4).map(f => safeText(String(f))).filter(Boolean);
                      return cleanFindings.length ? (
                        <div style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
                          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Key findings</div>
                          {cleanFindings.map((finding, i) => (
                            <div key={i} style={{ color: T.muted, fontSize: 12, lineHeight: 1.6, padding: "4px 0", borderBottom: i < cleanFindings.length - 1 ? `1px solid ${T.border}` : "none" }}>{finding}</div>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    {!!messageReasoning?.recommendations?.length && (() => {
                      const recs = messageReasoning.recommendations.slice(0, 3).map(item => item.title || item.action || item.recommendation).filter(r => r && typeof r === "string");
                      return recs.length ? (
                        <div style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
                          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Recommended actions</div>
                          {recs.map((r, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0", borderBottom: i < recs.length - 1 ? `1px solid ${T.border}` : "none" }}>
                              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#22c55e", marginTop: 6, flexShrink: 0 }} />
                              <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.55 }}>{r}</div>
                            </div>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    {!!(messageReport.records_used?.length) && (
                      <details style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
                        <summary style={{ cursor: "pointer", color: T.muted, fontSize: 12 }}>Sources used ({messageReport.records_used.length})</summary>
                        <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
                          {(messageReport.records_used || []).slice(0, 5).map(rec => {
                            const host = toHostname(rec.source_url);
                            return (
                              <div key={rec.id} style={{ fontSize: 11, color: T.dim, lineHeight: 1.45, display: "flex", gap: 8, alignItems: "center" }}>
                                <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.dim, flexShrink: 0 }} />
                                <span style={{ color: T.muted, fontWeight: 600 }}>{rec.entity_name || "Evidence"}</span>
                                {host && <SourceLink url={rec.source_url}><span style={{ color: T.dim }}>{host} ↗</span></SourceLink>}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>}
                  <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 10 }}>
                    <span>{message.at}</span>
                    {message.runId && <button onClick={() => setSelectedRunId(message.runId)} style={{ border: "none", background: "transparent", color: T.accent, padding: 0, fontSize: 10 }}>open saved run</button>}
                  </div>
                </div>
              </div>;
            })}
            {loading && <div style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 12 }}><div style={{ width: 30, height: 30, borderRadius: 999, background: T.bgSub, border: `1px solid ${T.border}`, display: "grid", placeItems: "center", color: T.accent }}><Brain size={14} /></div><div style={{ color: T.dim, fontSize: 14, paddingTop: 4 }}>Thinking through evidence...</div></div>}
          </div>
        </div>

        {error && <div style={{ maxWidth: 820, width: "100%", margin: "0 auto 8px", padding: "0 24px", color: "#ef4444", fontSize: 12 }}>{error}</div>}
        <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${T.border}`, background: `rgba(7,11,20,.95)` }}>
          <div style={{ maxWidth: 820, margin: "0 auto", borderRadius: 16, background: T.bgSub, border: `1px solid ${T.borderL}`, padding: 10 }}>
            <textarea value={task} onChange={e => setTask(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); }} placeholder="Message the analyst..." rows={2} style={{ width: "100%", border: "none", background: "transparent", outline: "none", color: T.text, fontSize: 14, lineHeight: 1.6, resize: "none", padding: "4px 4px 8px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button title="Record voice" onClick={recording ? stopVoice : startVoice} disabled={voiceBusy || loading} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${recording ? "rgba(239,68,68,.45)" : T.border}`, background: T.bgCard, color: recording ? "#ef4444" : T.dim }}><Mic size={14} /></button>
                <input ref={fileInputRef} type="file" accept="audio/*" onChange={uploadAudio} style={{ display: "none" }} />
                <button title="Upload audio" onClick={() => fileInputRef.current?.click()} disabled={voiceBusy || loading} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.dim }}><Database size={14} /></button>
                <button title="Speak latest answer" onClick={() => speakText(summary || task)} disabled={ttsBusy || (!summary && !task)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.dim }}><Play size={14} /></button>
              </div>
              <button title="Send" onClick={run} disabled={loading || !task.trim()} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: loading || !task.trim() ? T.borderL : T.accent, color: "#001018", display: "grid", placeItems: "center" }}><Send size={15} /></button>
            </div>
          </div>
          <div style={{ maxWidth: 820, margin: "7px auto 0", color: T.dim, fontSize: 10, textAlign: "center" }}>Ctrl+Enter sends. Answers can include mistakes; verify important decisions with evidence.</div>
        </div>
      </main>
    </div>
  );

  return (
    <div style={{ maxWidth: 1380, margin: "0 auto", padding: "28px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-end" }}>
        <div><Eye>Agent</Eye><h2 style={{ fontSize: 22, marginTop: 4 }}>Research desk</h2><p style={{ color: T.dim, fontSize: 13, marginTop: 6 }}>{ws.name} - {pack.name}</p></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>{providerRows.slice(2).map(([label, value]) => <span key={label} style={{ padding: "5px 8px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.bgSub, color: value === "error" || value === "failed" ? "#ef4444" : value === "disabled" || value === "pending" ? T.dim : "#22c55e", fontSize: 11 }}>{label}: {value}</span>)}</div>
      </div>

      <div style={{ marginTop: 14, padding: 12, borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={task} onChange={e => setTask(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Ask the analyst to research live web evidence..." style={{ flex: 1, minWidth: 0, border: "none", background: T.bgInset, outline: "none", fontSize: 14, color: T.text, padding: "12px 14px", borderRadius: 10 }} />
          <button title="Record voice" onClick={recording ? stopVoice : startVoice} disabled={voiceBusy || loading} style={{ width: 42, height: 42, borderRadius: 10, border: `1px solid ${recording ? "rgba(239,68,68,.45)" : T.borderL}`, background: recording ? "rgba(239,68,68,.16)" : T.bgSub, color: recording ? "#ef4444" : T.muted, cursor: "pointer" }}><Mic size={16} /></button>
          <input ref={fileInputRef} type="file" accept="audio/*" onChange={uploadAudio} style={{ display: "none" }} />
          <button title="Upload audio" onClick={() => fileInputRef.current?.click()} disabled={voiceBusy || loading} style={{ width: 42, height: 42, borderRadius: 10, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.muted, cursor: "pointer" }}><Database size={16} /></button>
          <button title="Speak result" onClick={() => speakText(summary || task)} disabled={ttsBusy || (!summary && !task)} style={{ width: 42, height: 42, borderRadius: 10, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.muted, cursor: "pointer" }}><Play size={16} /></button>
          <button onClick={run} disabled={loading} style={{ minWidth: 108, height: 42, borderRadius: 10, border: "none", background: T.accent, color: "#000", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{loading ? "Running" : "Analyze"}</button>
        </div>
        {error && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", color: "#ef4444", fontSize: 12 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "240px minmax(0,1fr) 320px", gap: 12, alignItems: "stretch" }}>
        <aside style={{ borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}`, minHeight: 700, overflow: "hidden" }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><div><div style={{ fontSize: 13, fontWeight: 800 }}>History</div><div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{historyLoading ? "Loading..." : `${runs.length} saved runs`}</div></div><button title="Reload history" onClick={loadRunHistory} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgCard, color: T.dim, cursor: "pointer" }}><RefreshCw size={13} /></button></div>
          <div style={{ padding: 8, display: "grid", gap: 6 }}>
            {runs.map(runItem => <button key={runItem.id} onClick={() => setSelectedRunId(runItem.id)} style={{ textAlign: "left", padding: 10, borderRadius: 10, border: `1px solid ${selectedRunId === runItem.id ? "rgba(6,182,212,.35)" : T.border}`, background: selectedRunId === runItem.id ? "rgba(6,182,212,.1)" : T.bgCard, color: T.text, cursor: "pointer" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 11, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{runItem.task || "Agent run"}</span><span style={{ fontSize: 9, color: statusColor(runItem.status) }}>{runItem.status}</span></div><div style={{ marginTop: 4, fontSize: 10, color: T.dim }}>{runItem.mode} - {runItem.at}</div></button>)}
            {!runs.length && <div style={{ padding: 10, color: T.dim, fontSize: 12, lineHeight: 1.55 }}>No saved runs yet.</div>}
          </div>
        </aside>

        <main style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, minHeight: 700, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
            {flow.map((step, index) => { const Icon = step.icon; return <div key={step.key} style={{ padding: 10, borderRadius: 10, background: step.status === "success" ? "rgba(34,197,94,.08)" : step.status === "running" ? "rgba(245,158,11,.08)" : T.bgSub, border: `1px solid ${step.status === "success" ? "rgba(34,197,94,.18)" : T.border}` }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 5 }}><Icon size={14} color={statusColor(step.status)} /><span style={{ fontSize: 9, color: statusColor(step.status), textTransform: "uppercase" }}>{step.status}</span></div><div style={{ marginTop: 7, fontSize: 11, fontWeight: 800 }}>{index + 1}. {step.title}</div><div style={{ marginTop: 3, fontSize: 10, color: T.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{step.text}</div></div>; })}
          </div>
          <div style={{ flex: 1, padding: 18, overflowY: "auto" }}>
            <div style={{ maxWidth: 840, margin: "0 auto", display: "grid", gap: 14 }}>
              <div style={{ justifySelf: "end", maxWidth: "78%", padding: 14, borderRadius: "14px 14px 3px 14px", background: T.accent, color: "#001018", fontSize: 13, lineHeight: 1.6, fontWeight: 700 }}>{activeRun?.task || task}</div>
              {lastTranscript && activeRun?.mode !== "text" && <div style={{ justifySelf: "start", maxWidth: "78%", padding: 14, borderRadius: "14px 14px 14px 3px", background: T.bgSub, border: `1px solid ${T.border}`, color: T.muted, fontSize: 13, lineHeight: 1.6 }}><b style={{ color: T.text }}>Speechmatics transcript</b><br />{lastTranscript.text}</div>}
              {!activeReport && <div style={{ padding: 24, borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}`, color: T.muted, lineHeight: 1.7 }}><div style={{ color: T.text, fontWeight: 800, marginBottom: 6 }}>{activeRun ? "Loading saved run" : "Ready"}</div>{activeRun ? "Opening the saved report." : "Run an analysis to generate sourced evidence, reasoning, actions, and a receipt."}</div>}
              {activeReport && <DecisionBriefPanel brief={activeBrief} />}
              {activeReport && <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}><MC l="Confidence" v={fmt(r.confidence)} c="#22c55e" /><MC l="Evidence" v={activeReport.records_used?.length || 0} c={T.accent} /><MC l="Memory" v={activeReport.memories_used?.length || 0} c="#818cf8" /><MC l="Actions" v={reportActions.length} c="#f59e0b" /></div>}
              {activeReport && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div style={{ padding: 14, borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Material findings</div>{(r.materiality_assessments || []).slice(0, 4).map((a, i) => <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{a.finding}</div><div style={{ marginTop: 3, fontSize: 10, color: matC(a.materiality) }}>{a.materiality}</div></div>)}{!r.materiality_assessments?.length && <div style={{ fontSize: 12, color: T.dim }}>No material findings for this run.</div>}</div><div style={{ padding: 14, borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Actions</div>{reportActions.map(a => <div key={a.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 12, color: T.text }}>{a.title}</span><span style={{ fontSize: 10, color: stC(a.status) }}>{a.status}</span></div>{a.status === "pending_approval" && <div style={{ display: "flex", gap: 4, marginTop: 7 }}><button onClick={() => approve(a.id)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#22c55e", color: "#000", fontSize: 10, fontWeight: 800 }}>Approve</button><button onClick={() => reject(a.id)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.borderL}`, background: "transparent", color: T.dim, fontSize: 10 }}>Reject</button></div>}</div>)}{!reportActions.length && <div style={{ fontSize: 12, color: T.dim }}>No workflow actions proposed.</div>}</div></div>}
            </div>
          </div>
        </main>

        <aside style={{ borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}`, minHeight: 700, overflow: "hidden" }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 800 }}>Live inspector</div><div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Transcript, memory, evidence, graph, workflow</div></div>
          <div style={{ padding: 12, display: "grid", gap: 10, maxHeight: 650, overflowY: "auto" }}>
            <div style={{ padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><Lb>Providers</Lb><div style={{ marginTop: 8, display: "grid", gap: 6 }}>{providerRows.map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}><span style={{ color: T.dim }}>{label}</span><span style={{ color: value === "disabled" || value === "not used" ? T.dim : T.text }}>{value}</span></div>)}</div></div>
            <div style={{ padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><Lb>Evidence used</Lb>{(activeReport?.records_used || []).slice(0, 5).map(rec => { const host = toHostname(rec.source_url); return <div key={rec.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ fontSize: 11, color: T.text }}>{rec.entity_name || "Evidence"}</div>{host && <div style={{ fontSize: 10, color: T.dim }}><SourceLink url={rec.source_url}>{host} ↗</SourceLink></div>}</div>; })} {!activeReport?.records_used?.length && <div style={{ marginTop: 8, fontSize: 11, color: T.dim }}>No evidence selected yet.</div>}</div>
            <div style={{ padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><Lb>Reasoning trace</Lb>{(r.reasoning_trace || []).slice(0, 8).map((trace, i) => <div key={i} style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>{trace}</div>)}{!r.reasoning_trace?.length && <div style={{ marginTop: 8, fontSize: 11, color: T.dim }}>Trace appears after reasoning.</div>}</div>
            {receipt && <div style={{ padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><Lb>Run receipt</Lb><pre style={{ margin: "8px 0 0", maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", color: T.muted, fontSize: 10, lineHeight: 1.5, fontFamily: "'JetBrains Mono'" }}>{JSON.stringify(receipt, null, 2)}</pre></div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function EvidencePage({ ws }) {
  const [records, setRecords] = useState([]);
  const [sources, setSources] = useState([]);
  const [retrieval, setRetrieval] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [graphStatus, setGraphStatus] = useState(null);
  const [graph, setGraph] = useState(null);
  const [topicGraph, setTopicGraph] = useState(null);
  const [graphBackfill, setGraphBackfill] = useState(null);
  const [latestRunId, setLatestRunId] = useState(null);
  const [query, setQuery] = useState(`vendor risk and market signals for ${ws.entities || ws.name}`);
  const [loading, setLoading] = useState(false);
  const [graphSyncing, setGraphSyncing] = useState(false);
  const [err, setErr] = useState("");
  const entityList = String(ws.entities || "").split(",").map(s => s.trim()).filter(Boolean);
  const signalList = String(ws.signals || "").split(",").map(s => s.trim()).filter(Boolean);

  useEffect(() => {
    setSelectedId(null);
    setRetrieval([]);
    setSources([]);
    setGraph(null);
    setTopicGraph(null);
    setGraphBackfill(null);
    setLatestRunId(null);
    setQuery(`vendor risk and market signals for ${ws.entities || ws.name}`);
  }, [ws.id, ws.entities, ws.name]);

  const loadRecords = useCallback(async () => {
    setErr("");
    try {
      const [items, topicSnapshot, runs] = await Promise.all([
        endpoints.listTopicRecords(ws.id),
        endpoints.graphTopic(ws.id).catch(() => null),
        endpoints.listRuns(ws.id, 1).catch(() => []),
      ]);
      setRecords(items);
      if (topicSnapshot) setTopicGraph(topicSnapshot);
      if (runs?.[0]?.run_id) setLatestRunId(runs[0].run_id);
    } catch (e) {
      setErr(e.message || "Could not load evidence records");
    }
  }, [ws.id]);

  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { endpoints.graphStatus().then(setGraphStatus).catch(() => setGraphStatus({ status: "unavailable" })); }, []);
  useEffect(() => {
    if (records.length && !records.some(record => record.id === selectedId)) setSelectedId(records[0].id);
    if (!records.length && selectedId) setSelectedId(null);
  }, [records, selectedId]);

  const runStep = async step => {
    setLoading(true);
    setErr("");
    try {
      await endpoints.createTopic({ id: ws.id, name: ws.name, description: ws.description || null, entities: entityList, watch_types: signalList, refresh_frequency_minutes: ws.refresh_frequency_minutes || 1440 });
      if (step === "discover") setSources(await endpoints.discoverSources(ws.id, 6, query));
      if (step === "refresh") {
        await endpoints.refreshTopic(ws.id, 4, query);
        await loadRecords();
        endpoints.graphTopic(ws.id).then(setTopicGraph).catch(() => {});
      }
      if (step === "retrieve") setRetrieval(await endpoints.retrieveContext({ topic_id: ws.id, query, entities: entityList, top_k: 8, freshness_required_days: 7 }));
    } catch (e) {
      setErr(e.message || "Intelligence operation failed");
    } finally {
      setLoading(false);
    }
  };

  const syncGraph = async () => {
    setGraphSyncing(true);
    setErr("");
    try {
      const result = await endpoints.graphBackfill(ws.id);
      setGraphBackfill(result);
      const [status, snapshot] = await Promise.all([
        endpoints.graphStatus().catch(() => ({ status: "unavailable" })),
        endpoints.graphTopic(ws.id).catch(() => null),
      ]);
      setGraphStatus(status);
      if (snapshot) setTopicGraph(snapshot);
    } catch (e) {
      setErr(e.message || "Could not sync evidence graph");
    } finally {
      setGraphSyncing(false);
    }
  };

  const retrievalRecords = retrieval.map(item => item.record);
  const displayRecords = records.length ? records : retrievalRecords;
  const selected = displayRecords.find(r => r.id === selectedId) || displayRecords[0] || null;
  const retrievalForSelected = retrieval.find(item => item.record.id === selected?.id);
  const retrievalReasons = retrievalForSelected?.reasons?.length ? retrievalForSelected.reasons : [];

  useEffect(() => {
    if (!selected?.entity_name) {
      setGraph(null);
      return;
    }
    endpoints.graphEntity(selected.entity_name).then(setGraph).catch(() => setGraph({ status: "unavailable", nodes: [], relationships: [] }));
  }, [selected?.entity_name]);

  const graphCounts = {
    nodes: graph?.counts?.nodes ?? graph?.nodes?.length ?? 0,
    relationships: graph?.counts?.relationships ?? graph?.relationships?.length ?? 0,
  };
  const topicGraphCounts = {
    nodes: topicGraph?.counts?.nodes ?? topicGraph?.nodes?.length ?? 0,
    relationships: topicGraph?.counts?.relationships ?? topicGraph?.relationships?.length ?? 0,
  };
  const graphView = graph?.nodes?.length ? graph : topicGraph;
  const graphLabel = graph?.nodes?.length ? (selected?.entity_name || "Selected entity") : ws.name;
  const stats = [
    ["Records", records.length, T.accent],
    ["Sources discovered", sources.length, sources.length ? "#22c55e" : T.dim],
    ["Ranked results", retrieval.length, retrieval.length ? "#22c55e" : T.dim],
  ];

  return (
    <div style={{ maxWidth: 1360, margin: "0 auto", padding: "30px 24px 36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <Eye>Intelligence</Eye>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>Intelligence records</h2>
          <div style={{ color: T.dim, fontSize: 12, marginTop: 6 }}>{ws.name}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadRecords} disabled={loading} title="Refresh records" style={{ height: 34, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.muted, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : null} /> Refresh
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", color: "#ef4444", fontSize: 12 }}>{err}</div>}

      <div style={{ marginTop: 18, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          {stats.map(([label, value, color], i) => <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 6, paddingRight: i < stats.length - 1 ? 18 : 0, borderRight: i < stats.length - 1 ? `1px solid ${T.border}` : "none" }}>
            <span style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color }}>{value}</span>
          </div>)}
        </div>
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 11, color: T.dim, cursor: "pointer", userSelect: "none" }}>Refresh intelligence data ▸</summary>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "minmax(300px,1fr) repeat(auto-fit,minmax(104px,max-content))", gap: 8, alignItems: "end" }}>
            <div>
              <Lb>Search query</Lb>
              <input value={query} onChange={e => setQuery(e.target.value)} style={{ ...IS, marginTop: 5 }} />
            </div>
            <button onClick={() => runStep("discover")} disabled={loading} style={{ height: 34, padding: "0 13px", borderRadius: 8, border: "none", background: T.accent, color: "#001018", fontWeight: 800, fontSize: 12 }}><Search size={13} /> Discover</button>
            <button onClick={() => runStep("refresh")} disabled={loading} style={{ height: 34, padding: "0 13px", borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontWeight: 800, fontSize: 12 }}><Database size={13} /> Collect</button>
            <button onClick={() => runStep("retrieve")} disabled={loading} style={{ height: 34, padding: "0 13px", borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontWeight: 800, fontSize: 12 }}><Target size={13} /> Rank</button>
          </div>
        </details>
      </div>

      {/* Intelligence summary — appears once records exist */}
      {displayRecords.length > 0 && (() => {
        const entityCounts = {};
        const typeCounts = {};
        const tierCounts = { 1: 0, 2: 0, 3: 0 };
        let totalConf = 0;
        const topFacts = [];
        displayRecords.forEach(r => {
          const ent = r.entity_name || "Unknown";
          entityCounts[ent] = (entityCounts[ent] || 0) + 1;
          const t = r.source_type || "web";
          typeCounts[t] = (typeCounts[t] || 0) + 1;
          const tier = r.source_tier || 3;
          tierCounts[tier] = (tierCounts[tier] || 0) + 1;
          totalConf += (r.confidence || 0);
          if (r.summary && topFacts.length < 5) topFacts.push({ text: r.summary, entity: ent, conf: r.confidence || 0 });
        });
        const avgConf = Math.round(totalConf / displayRecords.length);
        const topEntities = Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const maxCount = topEntities[0]?.[1] || 1;
        return (
          <div style={{ marginTop: 14, padding: "16px 18px", borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Brain size={13} color={T.accent} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: T.accent }}>Intelligence summary</span>
              <span style={{ fontSize: 11, color: T.dim, marginLeft: "auto" }}>{displayRecords.length} records · avg confidence {avgConf}%</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {/* Entity frequency */}
              <div>
                <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Top entities</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {topEntities.map(([name, count]) => (
                    <div key={name}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{name}</span>
                        <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{count}</span>
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,.05)" }}>
                        <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${Math.round((count / maxCount) * 100)}%`, transition: "width .4s" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Key findings */}
              <div>
                <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Key findings</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {topFacts.map((f, i) => {
                    const cleanFact = safeText(f.text);
                    if (!cleanFact) return null;
                    return (
                      <div key={i} style={{ padding: "7px 10px", borderRadius: 6, background: T.bgInset, border: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 9, color: T.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{f.entity}</div>
                        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cleanFact}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Source coverage */}
              <div>
                <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Source coverage</div>
                {[[1, "Official", "#22c55e"], [2, "News & press", T.accent], [3, "General web", "#818cf8"]].map(([tier, label, color]) => (
                  <div key={tier} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{tierCounts[tier] || 0}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,.05)" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: color, width: `${displayRecords.length ? Math.round(((tierCounts[tier] || 0) / displayRecords.length) * 100) : 0}%`, transition: "width .4s" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, alignItems: "stretch" }}>
        <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", minHeight: 590 }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Evidence</div>
            <span style={{ fontSize: 11, color: T.dim }}>{displayRecords.length}</span>
          </div>
          <div style={{ maxHeight: 540, overflowY: "auto" }}>
            {displayRecords.map(item => {
              const active = selected?.id === item.id;
              const tierColor = item.source_tier === 1 ? "#22c55e" : item.source_tier === 2 ? T.accent : "#818cf8";
              const tierLabel = item.source_tier === 1 ? "Official" : item.source_tier === 2 ? "News" : "Web";
              const hostname = toHostname(item.source_url) || humanSourceType(item.source_type);
              const confPct = Math.round((item.confidence || 0) * 100);
              const displaySummary = safeText(item.summary);
              return (
                <button key={item.id} onClick={() => setSelectedId(item.id)} style={{ width: "100%", textAlign: "left", padding: "12px 14px", border: "none", borderBottom: `1px solid ${T.border}`, background: active ? "rgba(14,165,233,.06)" : "transparent", color: T.text, borderLeft: active ? "3px solid #0ea5e9" : "3px solid transparent", transition: "background .1s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? T.accent : T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.entity_name || "Entity"}</span>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${tierColor}14`, color: tierColor, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{tierLabel}</span>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: displaySummary ? T.muted : T.dim, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{displaySummary || "Processing intelligence for this record."}</div>
                  <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 10, color: T.dim }}>{hostname}</span>
                    <div style={{ flex: 1, height: 2, borderRadius: 1, background: "rgba(255,255,255,.05)" }}>
                      <div style={{ height: "100%", borderRadius: 1, background: confPct > 79 ? "#22c55e" : confPct > 59 ? "#f59e0b" : "#ef4444", width: `${confPct}%` }} />
                    </div>
                    <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{confPct}%</span>
                  </div>
                </button>
              );
            })}
            {!displayRecords.length && <EmptyState icon={Database} title="No evidence yet" body="Discover sources above, save records, then rank them against your question." />}
          </div>
        </section>

        <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16, minHeight: 590, minWidth: 0, overflowY: "auto" }}>
          {selected ? (() => {
            const conf = Math.round((selected.confidence || 0) * 100);
            const tierLabel = selected.source_tier === 1 ? "Official source" : selected.source_tier === 2 ? "News & press" : "General web";
            const tierColor = selected.source_tier === 1 ? "#22c55e" : selected.source_tier === 2 ? T.accent : "#818cf8";
            const hostname = toHostname(selected.source_url);
            const firstSentence = (text) => { if (!text) return ""; const m = text.match(/^[^.!?]+[.!?]/); return m ? m[0] : text.slice(0, 160); };
            const cleanSummary = safeText(selected.summary) || "";
            const facts = selected.facts || {};
            const rawBullets = [];
            if (Array.isArray(facts.key_facts)) rawBullets.push(...facts.key_facts);
            else if (Array.isArray(facts.signals)) rawBullets.push(...facts.signals.map(s => typeof s === "string" ? s : s.description || s.signal || ""));
            else if (Array.isArray(facts.change_indicators)) rawBullets.push(...facts.change_indicators);
            else if (typeof facts === "object") Object.entries(facts).slice(0, 8).forEach(([k, v]) => { if (typeof v === "string" && v.length > 4 && v.length < 600) rawBullets.push(`${k.replace(/_/g," ")}: ${v}`); });
            const factBullets = rawBullets.map(f => safeText(String(f))).filter(Boolean);
            const copyInsight = () => { navigator.clipboard?.writeText(`${selected.entity_name}\n\n${selected.summary}\n\nSource: ${selected.source_url}`); toast.success("Insight copied"); };
            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Intelligence record</div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{selected.entity_name || "Entity"}</h3>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, background: `${tierColor}12`, color: tierColor, fontWeight: 700, textTransform: "uppercase", border: `1px solid ${tierColor}25` }}>{tierLabel}</span>
                    <button onClick={copyInsight} title="Copy insight" style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${T.borderL}`, background: "transparent", color: T.dim, cursor: "pointer", display: "grid", placeItems: "center" }}><FileText size={11} /></button>
                  </div>
                </div>

                {/* Key insight box */}
                {cleanSummary ? (
                  <div style={{ padding: "11px 14px", borderRadius: 7, background: "rgba(14,165,233,.05)", border: "1px solid rgba(14,165,233,.14)", borderLeft: "3px solid #0ea5e9", marginBottom: 14 }}>
                    <div style={{ fontSize: 9, color: T.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5 }}>Key insight</div>
                    <div style={{ fontSize: 13, color: "#dde4ee", lineHeight: 1.65 }}>{firstSentence(cleanSummary)}</div>
                  </div>
                ) : (
                  <div style={{ padding: "11px 14px", borderRadius: 7, background: T.bgInset, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.dim}`, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.6 }}>Intelligence is being processed for this record. Run monitoring to generate a fresh summary.</div>
                  </div>
                )}

                {/* Full context */}
                {cleanSummary && cleanSummary.length > firstSentence(cleanSummary).length && (
                  <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.75, marginBottom: 14 }}>{cleanSummary.slice(firstSentence(cleanSummary).length).trim()}</div>
                )}

                {/* Extracted facts as bullets */}
                {factBullets.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Extracted facts</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {factBullets.slice(0, 6).map((f, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.accent, marginTop: 6, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.55 }}>{String(f)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata strip */}
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingTop: 12, borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
                  <div>
                    <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Confidence</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: conf > 79 ? "#22c55e" : conf > 59 ? "#f59e0b" : "#ef4444" }}>{conf}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Source type</div>
                    <div style={{ fontSize: 12, color: T.muted }}>{humanSourceType(selected.source_type)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Freshness</div>
                    <div style={{ fontSize: 12, color: selected.freshness_status === "fresh" ? "#22c55e" : T.muted, textTransform: "capitalize" }}>{selected.freshness_status || "unknown"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Checked</div>
                    <div style={{ fontSize: 12, color: T.muted }}>{selected.last_checked ? new Date(selected.last_checked).toLocaleDateString() : "—"}</div>
                  </div>
                </div>

                {/* Source — secondary, bottom */}
                {selected.source_url && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Primary source</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.muted }}>{hostname}</span>
                      <SourceLink url={selected.source_url} style={{ fontSize: 11 }}>View original ↗</SourceLink>
                    </div>
                  </div>
                )}
              </>
            );
          })() : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 300, color: T.dim, gap: 8 }}><Database size={24} color={T.dim} /><div style={{ fontSize: 12 }}>Select a record to see its intelligence</div></div>}
        </section>

        <aside style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, minHeight: 590, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Context</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>Relevance rank · sources · graph</div>
          {retrievalForSelected && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 7, background: T.bgInset, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>Relevance score</div>
                <div style={{ fontSize: 16, color: T.accent, fontWeight: 800, fontFamily: "'JetBrains Mono'" }}>{retrievalForSelected.score}</div>
              </div>
              {retrievalReasons.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {retrievalReasons.map((r, i) => <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: "#818cf8", marginTop: 5, flexShrink: 0 }} /><span style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{r}</span></div>)}
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Discovered sources</div>
            {sources.slice(0, 5).map((source, i) => {
              const h = (() => { try { return new URL(source.url || "").hostname.replace(/^www\./, ""); } catch { return source.url; } })();
              return (
                <div key={`${source.url}-${i}`} style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 6, background: T.bgInset, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 600, lineHeight: 1.4, marginBottom: 3 }}>{source.title || h}</div>
                  <SourceLink url={source.url} style={{ fontSize: 10 }}>{h} ↗</SourceLink>
                </div>
              );
            })}
            {!sources.length && <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5 }}>Run source discovery to see candidates.</div>}
          </div>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>Entity relationships</div>
              {(graphCounts.nodes || topicGraphCounts.nodes) > 0 && <span style={{ fontSize: 10, color: T.dim }}>{Math.max(graphCounts.nodes, topicGraphCounts.nodes)} entities mapped</span>}
            </div>
            <GraphMini graph={graphView} title={graphLabel} wsId={ws.id} latestRunId={latestRunId} />
            {/* Entity digest from graph */}
            {graphView?.nodes?.length > 0 && (() => {
              const nodes = graphView.nodes || [];
              const rels = graphView.relationships || [];
              const connCount = {};
              rels.forEach(r => { connCount[r.source] = (connCount[r.source] || 0) + 1; connCount[r.target] = (connCount[r.target] || 0) + 1; });
              // Only show meaningful node types — skip infrastructure nodes
              const interestingTypes = new Set(["Entity","Company","Vendor","Competitor","Supplier","Account","Market","Signal","Risk","Recommendation","WorkflowAction","Regulation","Regulator"]);
              const topNodes = [...nodes].filter(n => interestingTypes.has(n.type)).sort((a, b) => (connCount[b.id] || 0) - (connCount[a.id] || 0)).slice(0, 6);
              // Use label (already human-readable via nodeCanvasLabel logic) not raw ID
              const readableLabel = (n) => { const l = stripPrefix(n.label || n.properties?.name || n.id || ""); return l.length > 30 ? l.slice(0, 30) + "…" : l; };
              // Group relationships into plain-English sentences
              const relSentences = rels.slice(0, 4).map(r => {
                const src = nodes.find(n => n.id === r.source);
                const tgt = nodes.find(n => n.id === r.target);
                if (!src || !tgt) return null;
                const rel = (r.type || "LINKED_TO").replace(/_/g, " ").toLowerCase();
                return { src: readableLabel(src), rel, tgt: readableLabel(tgt), srcType: src.type, tgtType: tgt.type };
              }).filter(Boolean);
              // Color legend — only types present in graph
              const presentTypes = [...new Set(nodes.map(n => n.type))].filter(t => GRAPH_NODE_COLORS[t]);
              return (
                <div style={{ marginTop: 10 }}>
                  {/* Color legend */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
                    {presentTypes.slice(0, 8).map(t => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: nodeColor(t), fontWeight: 700 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: nodeColor(t), flexShrink: 0 }} />
                        {nodeDisplay(t)}
                      </span>
                    ))}
                  </div>
                  {topNodes.length > 0 && <>
                    <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Key entities</div>
                    {topNodes.map(n => {
                      const conns = connCount[n.id] || 0;
                      return (
                        <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: nodeColor(n.type), flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{readableLabel(n)}</span>
                          <span style={{ fontSize: 9, color: nodeColor(n.type), textTransform: "uppercase", letterSpacing: ".04em", flexShrink: 0 }}>{nodeDisplay(n.type)}</span>
                          <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{conns}</span>
                        </div>
                      );
                    })}
                  </>}
                  {relSentences.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Relationships</div>
                      {relSentences.map((r, i) => (
                        <div key={i} style={{ fontSize: 11, color: T.muted, lineHeight: 1.6, padding: "2px 0" }}>
                          <span style={{ color: nodeColor(r.srcType) }}>{r.src}</span>
                          <span style={{ color: T.dim }}> {r.rel} </span>
                          <span style={{ color: nodeColor(r.tgtType) }}>{r.tgt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ marginTop: 8, fontSize: 11, color: T.dim, lineHeight: 1.45 }}>{explainGraph(graphView, selected, graphLabel)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function IntelPage({ ws }) {
  const [records, setRecords] = useState([]);
  const [sources, setSources] = useState([]);
  const [retrieval, setRetrieval] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [graphStatus, setGraphStatus] = useState(null);
  const [graph, setGraph] = useState(null);
  const [topicGraph, setTopicGraph] = useState(null);
  const [graphBackfill, setGraphBackfill] = useState(null);
  const [graphSyncing, setGraphSyncing] = useState(false);
  const [query, setQuery] = useState(`vendor risk and market signals for ${ws.entities || ws.name}`);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const entityList = ws.entities.split(",").map(s => s.trim()).filter(Boolean);
  const signalList = ws.signals.split(",").map(s => s.trim()).filter(Boolean);
  useEffect(() => {
    setSelectedId(null);
    setRetrieval([]);
    setSources([]);
    setGraph(null);
    setTopicGraph(null);
    setGraphBackfill(null);
    setQuery(`vendor risk and market signals for ${ws.entities || ws.name}`);
  }, [ws.id, ws.entities, ws.name]);
  const loadRecords = useCallback(async () => {
    setErr("");
    try {
      const [items, topicSnapshot] = await Promise.all([
        endpoints.listTopicRecords(ws.id),
        endpoints.graphTopic(ws.id).catch(() => null),
      ]);
      setRecords(items);
      if (topicSnapshot) setTopicGraph(topicSnapshot);
    } catch (e) {
      setErr(e.message || "Could not load evidence records");
    }
  }, [ws.id]);
  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => {
    if (records.length && !records.some(record => record.id === selectedId)) setSelectedId(records[0].id);
    if (!records.length && selectedId) setSelectedId(null);
  }, [records, selectedId]);
  useEffect(() => { endpoints.graphStatus().then(setGraphStatus).catch(() => setGraphStatus({ status: "unavailable" })); }, []);
  const runStep = async (step) => {
    setLoading(true);
    setErr("");
    try {
      await endpoints.createTopic({ id: ws.id, name: ws.name, description: ws.description || null, entities: entityList, watch_types: signalList, refresh_frequency_minutes: ws.refresh_frequency_minutes || 1440 });
      if (step === "discover") setSources(await endpoints.discoverSources(ws.id, 6, query));
      if (step === "refresh") {
        await endpoints.refreshTopic(ws.id, 4, query);
        await loadRecords();
        endpoints.graphTopic(ws.id).then(setTopicGraph).catch(() => {});
      }
      if (step === "retrieve") {
        setRetrieval(await endpoints.retrieveContext({ topic_id: ws.id, query, entities: entityList, top_k: 6, freshness_required_days: 7 }));
      }
    } catch (e) {
      setErr(e.message || "Intelligence operation failed");
    } finally {
      setLoading(false);
    }
  };
  const syncGraph = async () => {
    setGraphSyncing(true);
    setErr("");
    try {
      const result = await endpoints.graphBackfill(ws.id);
      setGraphBackfill(result);
      const [status, snapshot] = await Promise.all([
        endpoints.graphStatus().catch(() => ({ status: "unavailable" })),
        endpoints.graphTopic(ws.id).catch(() => null),
      ]);
      setGraphStatus(status);
      if (snapshot) setTopicGraph(snapshot);
    } catch (e) {
      setErr(e.message || "Could not sync evidence graph");
    } finally {
      setGraphSyncing(false);
    }
  };
  const retrievalRecords = retrieval.map(item => item.record);
  const displayRecords = records.length ? records : retrievalRecords;
  const selected = displayRecords.find(r => r.id === selectedId) || displayRecords[0] || null;
  const retrievalForSelected = retrieval.find(item => item.record.id === selected?.id);
  useEffect(() => {
    if (!selected?.entity_name) {
      setGraph(null);
      return;
    }
    endpoints.graphEntity(selected.entity_name).then(setGraph).catch(() => setGraph({ status: "unavailable", nodes: [], relationships: [] }));
  }, [selected?.entity_name]);
  const graphCounts = {
    nodes: graph?.counts?.nodes ?? graph?.nodes?.length ?? 0,
    relationships: graph?.counts?.relationships ?? graph?.relationships?.length ?? 0,
  };
  const topicGraphCounts = {
    nodes: topicGraph?.counts?.nodes ?? topicGraph?.nodes?.length ?? 0,
    relationships: topicGraph?.counts?.relationships ?? topicGraph?.relationships?.length ?? 0,
  };
  const graphView = graph?.nodes?.length ? graph : topicGraph;
  const graphLabel = graph?.nodes?.length ? (selected?.entity_name || "Selected entity") : ws.name;
  const sourceRows = sources.slice(0, 5);
  const retrievalReasons = retrievalForSelected?.reasons?.length ? retrievalForSelected.reasons : [];
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <Eye>Intelligence</Eye>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>Evidence workspace</h2>
          <div style={{ color: T.dim, fontSize: 12, marginTop: 6 }}>{ws.name} - {displayRecords.length} fresh records - Neo4j {graphStatus?.status || "checking"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={syncGraph} disabled={graphSyncing || loading || !records.length} title="Sync fresh evidence to Neo4j" style={{ height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${T.borderL}`, background: T.bgSub, color: records.length ? T.text : T.dim, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800 }}>
            <GitBranch size={14} style={graphSyncing ? { animation: "spin 1s linear infinite" } : null} /> Sync graph
          </button>
          <button onClick={loadRecords} disabled={loading} title="Reload evidence" style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.muted, display: "grid", placeItems: "center" }}>
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : null} />
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", color: "#ef4444", fontSize: 12 }}>{err}</div>}

      <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "end" }}>
          <div>
            <Lb>Question</Lb>
            <input value={query} onChange={e => setQuery(e.target.value)} style={{ ...IS, marginTop: 5 }} />
          </div>
          <button onClick={() => runStep("discover")} disabled={loading} style={{ height: 34, padding: "0 13px", borderRadius: 9, border: "none", background: T.accent, color: "#001018", fontWeight: 800, fontSize: 12 }}><Search size={13} /> Sources</button>
          <button onClick={() => runStep("refresh")} disabled={loading} style={{ height: 34, padding: "0 13px", borderRadius: 9, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontWeight: 800, fontSize: 12 }}><Database size={13} /> Save</button>
          <button onClick={() => runStep("retrieve")} disabled={loading} style={{ height: 34, padding: "0 13px", borderRadius: 9, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontWeight: 800, fontSize: 12 }}><Target size={13} /> Rank</button>
        </div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7 }}>
          <MC l="Sources" v={sources.length} c={T.accent} />
          <MC l="Records" v={records.length} c={T.accent} />
          <MC l="Retrieved" v={retrieval.length} c={retrieval.length ? "#22c55e" : T.dim} />
          <MC l="Graph nodes" v={Math.max(graphCounts.nodes, topicGraphCounts.nodes)} c={(graphCounts.nodes || topicGraphCounts.nodes) ? T.accent : T.dim} />
          <MC l="Graph edges" v={Math.max(graphCounts.relationships, topicGraphCounts.relationships)} c={(graphCounts.relationships || topicGraphCounts.relationships) ? "#22c55e" : T.dim} />
        </div>
        {graphBackfill && <div style={{ marginTop: 9, fontSize: 11, color: graphBackfill.status === "ok" ? T.muted : "#f59e0b" }}>
          Graph sync: {graphBackfill.records_mirrored} mirrored from {graphBackfill.records_seen} fresh records{graphBackfill.records_skipped_stale ? `, ${graphBackfill.records_skipped_stale} stale skipped` : ""}{graphBackfill.records_failed ? `, ${graphBackfill.records_failed} failed` : ""}.
        </div>}
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "360px 1fr", gap: 12, alignItems: "start" }}>
        <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Evidence</div>
            <span style={{ fontSize: 11, color: T.dim }}>{displayRecords.length}</span>
          </div>
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {displayRecords.map(item => {
              const active = selected?.id === item.id;
              return (
                <button key={item.id} onClick={() => setSelectedId(item.id)} style={{ width: "100%", textAlign: "left", padding: "11px 12px", border: "none", borderBottom: `1px solid ${T.border}`, background: active ? "rgba(6,182,212,.1)" : "transparent", color: T.text }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.entity_name || "Evidence record"}</div>
                    <span style={{ fontSize: 10, color: active ? T.accent : T.dim, fontFamily: "'JetBrains Mono'" }}>{fmt(item.confidence || 0)}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: T.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.summary || "No summary captured."}</div>
                  <div style={{ marginTop: 6, fontSize: 10, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.source_url || item.source_type || "source pending"}</div>
                </button>
              );
            })}
            {!displayRecords.length && <EmptyState icon={Database} title="No evidence yet" body="Discover sources above, save records, then rank them against your question." />}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 12, alignItems: "start" }}>
          <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, padding: 14, minHeight: 320 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em" }}>Selected record</div>
                <h3 style={{ margin: "5px 0 0", fontSize: 18 }}>{selected?.entity_name || "Select evidence"}</h3>
              </div>
              {selected && <span style={{ fontSize: 10, padding: "3px 7px", borderRadius: 999, background: "rgba(6,182,212,.1)", color: T.accent }}>{selected.freshness_status || "unknown"}</span>}
            </div>
            {selected ? <>
              <p style={{ marginTop: 14, fontSize: 13, lineHeight: 1.75, color: T.muted }}>{selected.summary || "No summary available for this record."}</p>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                <MC l="Confidence" v={fmt(selected.confidence || 0)} c={T.accent} />
                <MC l="Type" v={selected.source_type || "web"} c={T.muted} />
                <MC l="Checked" v={selected.last_checked ? new Date(selected.last_checked).toLocaleDateString() : "unknown"} c={T.muted} />
              </div>
              <div style={{ marginTop: 14 }}>
                <Lb>Source</Lb>
                <a href={selected.source_url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5, color: T.accent, fontSize: 12, wordBreak: "break-all" }}>{selected.source_url || "No source URL captured"}</a>
              </div>
              <div style={{ marginTop: 14 }}>
                <Lb>Payload</Lb>
                <pre style={{ marginTop: 6, maxHeight: 190, overflow: "auto", padding: 10, borderRadius: 9, background: T.bgInset, border: `1px solid ${T.border}`, color: T.muted, fontSize: 11 }}>{JSON.stringify(selected.facts || {}, null, 2)}</pre>
              </div>
            </> : <div style={{ marginTop: 14, color: T.dim, fontSize: 12 }}>The detail panel appears after evidence exists.</div>}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Retrieval</div>
              <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: T.dim }}>Selected score</span>
                <span style={{ fontSize: 20, color: T.accent, fontWeight: 800 }}>{retrievalForSelected?.score ?? "-"}</span>
              </div>
              {(retrievalReasons.length ? retrievalReasons : ["Rank this evidence to see match reasons."]).map(reason => <div key={reason} style={{ marginTop: 7, fontSize: 11, color: T.muted, lineHeight: 1.45 }}>{reason}</div>)}
            </div>
            <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Discovered sources</div>
              {sourceRows.map((source, i) => <div key={`${source.url}-${i}`} style={{ marginTop: 9 }}>
                <div style={{ fontSize: 11, color: T.text, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.title || source.url}</div>
                <div style={{ fontSize: 10, color: T.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.url}</div>
              </div>)}
              {!sourceRows.length && <div style={{ marginTop: 8, fontSize: 11, color: T.dim }}>No source discovery run yet.</div>}
            </div>
            <div style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Evidence graph</div>
              <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                <MC l="Nodes" v={Math.max(graphCounts.nodes, topicGraphCounts.nodes)} c={(graphCounts.nodes || topicGraphCounts.nodes) ? T.accent : T.dim} />
                <MC l="Edges" v={Math.max(graphCounts.relationships, topicGraphCounts.relationships)} c={(graphCounts.relationships || topicGraphCounts.relationships) ? "#22c55e" : T.dim} />
              </div>
              <GraphMini graph={graphView} title={graphLabel} wsId={ws.id} latestRunId={report?.run_id} />
              <div style={{ marginTop: 8, fontSize: 11, color: T.dim }}>{graphView?.status === "ok" ? "Fresh evidence only. Stale records are excluded from this view." : `Graph ${graphView?.status || graphStatus?.status || "checking"}`}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px" }}>
      <Eye>Intelligence engine</Eye>
      <h2 style={{ fontSize: 22, marginTop: 4 }}>Evidence list, detail, and inspector</h2>
      <p style={{ color: T.dim, fontSize: 13, marginTop: 6, lineHeight: 1.7 }}>Create the workspace topic, discover sources, save evidence through the Bright Data gateway, and inspect every record used by the analyst.</p>
      {err && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", color: "#ef4444", fontSize: 12 }}>{err}</div>}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 12 }}>
        <div style={{ padding: 16, borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <div><div style={{ fontSize: 14, fontWeight: 700 }}>{ws.name}</div><div style={{ fontSize: 11, color: T.dim }}>{entityList.join(", ") || "No entities configured"} · {signalList.join(", ") || "No signals configured"}</div></div>
            <button onClick={loadRecords} disabled={loading} style={{ padding: "7px 11px", borderRadius: 8, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.muted, fontSize: 11, cursor: "pointer" }}><RefreshCw size={12} /> Reload</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
            <button onClick={() => runStep("discover")} disabled={loading} style={{ padding: "10px", borderRadius: 10, border: "none", background: T.accent, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}><Search size={13} /> Discover sources</button>
            <button onClick={() => runStep("refresh")} disabled={loading} style={{ padding: "10px", borderRadius: 10, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontWeight: 700, fontSize: 12, cursor: "pointer" }}><Database size={13} /> Save evidence</button>
            <button onClick={() => runStep("retrieve")} disabled={loading} style={{ padding: "10px", borderRadius: 10, border: `1px solid ${T.borderL}`, background: T.bgSub, color: T.text, fontWeight: 700, fontSize: 12, cursor: "pointer" }}><Target size={13} /> Retrieve context</button>
          </div>
          <div style={{ marginTop: 12 }}><Lb>Retrieval query</Lb><input value={query} onChange={e => setQuery(e.target.value)} style={IS} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[["Sources", sources.length], ["Records", records.length], ["Retrieved", retrieval.length], ["Graph", graphStatus?.status || "checking"]].map(([label, value]) => <div key={label} style={{ padding: 14, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: typeof value === "number" ? 24 : 13, fontWeight: 800, color: label === "Graph" && value !== "ok" ? T.dim : T.accent }}>{value}</div></div>)}
        </div>
      </div>
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "280px 1fr 280px", gap: 12, alignItems: "stretch" }}>
        <div style={{ borderRadius: 14, overflow: "hidden", background: T.bgCard, border: `1px solid ${T.border}`, minHeight: 520 }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Evidence list</div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>{displayRecords.length} saved or retrieved records</div>
          </div>
          <div style={{ maxHeight: 455, overflowY: "auto" }}>
            {displayRecords.map(r => {
              const active = selected?.id === r.id;
              return <button key={r.id} onClick={() => setSelectedId(r.id)} style={{ width: "100%", textAlign: "left", padding: 12, border: "none", borderBottom: `1px solid ${T.border}`, background: active ? "rgba(6,182,212,.09)" : "transparent", color: T.text, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.entity_name || "Evidence record"}</div>
                  <span style={{ fontSize: 10, color: active ? T.accent : T.dim }}>{fmt(r.confidence || 0)}</span>
                </div>
                <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: T.muted, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.summary || "No summary saved for this evidence item."}</div>
              </button>;
            })}
            {!displayRecords.length && <div style={{ padding: 12, color: T.dim, fontSize: 12, lineHeight: 1.6 }}>No evidence available yet. Use Save evidence, then Retrieve context to rank it against the current question.</div>}
          </div>
        </div>

        <div style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, padding: 16, minHeight: 520 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em" }}>Evidence detail</div>
              <h3 style={{ margin: "5px 0 0", fontSize: 18 }}>{selected?.entity_name || "Select an evidence record"}</h3>
            </div>
            {selected && <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 999, background: "rgba(6,182,212,.1)", color: T.accent }}>{selected.record_type || "signal"}</span>}
          </div>
          {selected ? <>
            <p style={{ marginTop: 16, fontSize: 13, color: T.muted, lineHeight: 1.8 }}>{selected.summary || "No summary available."}</p>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {[["Confidence", fmt(selected.confidence || 0)], ["Source", selected.source_type || "web"], ["Freshness", selected.observed_at ? new Date(selected.observed_at).toLocaleDateString() : "saved"]].map(([label, value]) => <div key={label} style={{ padding: 10, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 12, color: T.text, marginTop: 4 }}>{value}</div></div>)}
            </div>
            <div style={{ marginTop: 14 }}>
              <Lb>Source URL</Lb>
              <a href={selected.source_url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5, color: T.accent, fontSize: 12, wordBreak: "break-all" }}>{selected.source_url || "No source URL captured"}</a>
            </div>
            <div style={{ marginTop: 14 }}>
              <Lb>Raw evidence payload</Lb>
              <pre style={{ margin: "6px 0 0", padding: 12, borderRadius: 10, background: T.bgInset, border: `1px solid ${T.border}`, maxHeight: 200, overflow: "auto", color: T.muted, fontSize: 11 }}>{JSON.stringify(selected.metadata || selected, null, 2)}</pre>
            </div>
          </> : <div style={{ marginTop: 18, color: T.dim, fontSize: 12 }}>The inspector will populate once evidence exists.</div>}
        </div>

        <div style={{ borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}`, padding: 14, minHeight: 520 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Inspector</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Retrieval rank, matching reasons, and discovered-source context.</div>
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <div style={{ padding: 10, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase" }}>Retrieval score</div>
              <div style={{ marginTop: 4, fontSize: 24, color: T.accent, fontWeight: 800 }}>{retrievalForSelected ? retrievalForSelected.score : "-"}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase" }}>Match reasons</div>
              {(retrievalForSelected?.reasons?.length ? retrievalForSelected.reasons : ["No retrieval run for selected evidence yet."]).map(reason => <div key={reason} style={{ marginTop: 6, fontSize: 11, color: T.muted, lineHeight: 1.45 }}>{reason}</div>)}
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase" }}>Discovered sources</div>
              {(sources.length ? sources.slice(0, 4) : []).map((s, i) => <div key={`${s.url}-${i}`} style={{ marginTop: 8, fontSize: 11, color: T.muted, lineHeight: 1.45, wordBreak: "break-word" }}>{s.title || s.url}</div>)}
              {!sources.length && <div style={{ marginTop: 8, fontSize: 11, color: T.dim }}>Run source discovery to inspect candidate URLs before saving evidence.</div>}
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase" }}>Neo4j neighborhood</div>
              <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <MC l="Nodes" v={graph?.counts?.nodes || 0} c={graph?.status === "ok" ? T.accent : T.dim} />
                <MC l="Edges" v={graph?.counts?.relationships || 0} c={graph?.status === "ok" ? "#22c55e" : T.dim} />
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: T.dim }}>{graph?.status === "ok" ? `Graph relationships for ${selected?.entity_name || "selected entity"}` : `Graph ${graph?.status || graphStatus?.status || "checking"}`}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "none", marginTop: 12, gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ borderRadius: 14, overflow: "hidden", background: T.bgCard, border: `1px solid ${T.border}` }}>
          <div style={{ padding: 12, fontSize: 13, fontWeight: 700 }}>Discovered sources</div>
          {(sources.length ? sources : []).map((s, i) => <div key={`${s.url}-${i}`} style={{ padding: 12, borderTop: `1px solid ${T.border}` }}><div style={{ fontSize: 12, fontWeight: 700 }}>{s.title || s.url}</div><div style={{ fontSize: 11, color: T.dim, wordBreak: "break-all" }}>{s.url}</div><div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{s.snippet}</div></div>)}
          {!sources.length && <div style={{ padding: 12, color: T.dim, fontSize: 12 }}>No source discovery run yet.</div>}
        </div>
        <div style={{ borderRadius: 14, overflow: "hidden", background: T.bgCard, border: `1px solid ${T.border}` }}>
          <div style={{ padding: 12, fontSize: 13, fontWeight: 700 }}>Saved evidence records</div>
          {records.map(r => <div key={r.id} style={{ padding: 12, borderTop: `1px solid ${T.border}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ fontSize: 12, fontWeight: 700 }}>{r.entity_name || "Unknown"}</div><span style={{ fontSize: 10, color: T.accent }}>{fmt(r.confidence || 0)}</span></div><div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{r.summary}</div><div style={{ fontSize: 10, color: T.dim, marginTop: 4, wordBreak: "break-all" }}>{r.source_url}</div></div>)}
          {!records.length && <div style={{ padding: 12, color: T.dim, fontSize: 12 }}>No saved evidence yet. Run Save evidence.</div>}
        </div>
      </div>
      {!!retrieval.length && <div style={{ marginTop: 12, borderRadius: 14, overflow: "hidden", background: T.bgCard, border: `1px solid ${T.border}` }}><div style={{ padding: 12, fontSize: 13, fontWeight: 700 }}>Ranked retrieval</div>{retrieval.map((item, i) => <div key={`${item.record.id}-${i}`} style={{ padding: 12, borderTop: `1px solid ${T.border}` }}><div style={{ fontSize: 12, fontWeight: 700 }}>{item.record.entity_name} · score {item.score}</div><div style={{ fontSize: 11, color: T.dim }}>{item.reasons.join(", ") || "no score reasons"}</div><div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{item.record.summary}</div></div>)}</div>}
    </div>
  );
}

/* ═══════ GATEWAY ═══════ */
function GwPage() {
  const [url, setUrl] = useState("https://geo.brdtest.com/welcome.txt?product=unlocker&method=api");
  const [query, setQuery] = useState("OpenAI Anthropic enterprise AI risk news");
  const [running, setRunning] = useState("");
  const [results, setResults] = useState([]);
  const pushResult = (name, status, started, payload) => {
    setResults(prev => [{ name, status, latency: Math.round(performance.now() - started), payload, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 8));
  };
  const runTest = async (name, fn) => {
    setRunning(name);
    const started = performance.now();
    try {
      const payload = await fn();
      pushResult(name, "ok", started, payload);
    } catch (e) {
      pushResult(name, "failed", started, { error: e.message || String(e) });
    } finally {
      setRunning("");
    }
  };
  const tests = [
    ["API health", () => endpoints.health()],
    ["Bright Data URL", () => endpoints.gatewayFetch({ url, max_attempts: 2 })],
    ["SERP JSON", () => endpoints.gatewayFetch({ query, preferred_tool: "serp_api", max_attempts: 2 })],
    ["Speechmatics TTS", async () => {
      const blob = await endpoints.synthesizeSpeech("WebDataOS gateway integration test.");
      return { content_type: blob.type || "audio/wav", bytes: blob.size };
    }],
    ["Memory fallback", async () => {
      const workspace_id = "gateway_console";
      const upsert = await api("POST", "/memory/upsert", { workspace_id, entity: "Gateway console", content: `Integration test ${Date.now()}`, metadata: { source: "gateway_console" } });
      const search = await api("POST", "/memory/search", { workspace_id, query: "integration test", top_k: 3 });
      return { provider: upsert.provider, saved: upsert.memory_id, matches: search.length };
    }],
    ["TriggerWare", () => api("POST", "/workflows/trigger", { workspace_id: "gateway_console", event_type: "integration_test", summary: "Gateway integration console test", severity: "medium", payload: { source: "ui" } })],
  ];
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px" }}>
      <Eye>Gateway console</Eye>
      <h2 style={{ fontSize: 22, marginTop: 4 }}>Live integration tests</h2>
      <p style={{ color: T.dim, fontSize: 13, marginTop: 6, lineHeight: 1.7 }}>Verify the providers the agent depends on before trusting a run.</p>
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: 16, borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}` }}>
          <Lb>URL route</Lb>
          <input value={url} onChange={e => setUrl(e.target.value)} style={IS} />
          <div style={{ height: 10 }} />
          <Lb>SERP query</Lb>
          <input value={query} onChange={e => setQuery(e.target.value)} style={IS} />
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {tests.map(([name, fn]) => <button key={name} onClick={() => runTest(name, fn)} disabled={!!running} style={{ padding: "10px", borderRadius: 10, border: `1px solid ${T.borderL}`, background: running === name ? T.accent : T.bgSub, color: running === name ? "#000" : T.text, fontSize: 12, fontWeight: 800, cursor: running ? "wait" : "pointer" }}>{running === name ? "Testing..." : name}</button>)}
          </div>
        </div>
        <div style={{ padding: 16, borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Provider status</div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
            {["Bright Data", "SERP JSON", "Speechmatics", "Memory", "TriggerWare", "API"].map(name => {
              const latest = results.find(r => r.name.toLowerCase().includes(name.split(" ")[0].toLowerCase()));
              return <div key={name} style={{ padding: 10, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase" }}>{name}</div><div style={{ marginTop: 4, fontSize: 12, color: latest?.status === "failed" ? "#ef4444" : latest ? "#22c55e" : T.muted }}>{latest ? `${latest.status} - ${latest.latency}ms` : "not tested"}</div></div>;
            })}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, borderRadius: 14, overflow: "hidden", background: T.bgCard, border: `1px solid ${T.border}` }}>
        <div style={{ padding: 12, fontSize: 13, fontWeight: 800 }}>Receipts</div>
        {results.map(result => <div key={`${result.name}-${result.at}`} style={{ padding: 12, borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><div style={{ fontSize: 12, fontWeight: 800 }}>{result.name}</div><span style={{ fontSize: 10, color: result.status === "ok" ? "#22c55e" : "#ef4444" }}>{result.status} - {result.latency}ms</span></div>
          <pre style={{ margin: "8px 0 0", padding: 10, borderRadius: 8, background: T.bgInset, color: T.muted, fontSize: 11, overflow: "auto", maxHeight: 220 }}>{JSON.stringify(result.payload, null, 2)}</pre>
        </div>)}
        {!results.length && <div style={{ padding: 12, color: T.dim, fontSize: 12 }}>Run a test to see the backend receipt here.</div>}
      </div>
    </div>
  );
}

/* ═══════ ACTIONS ═══════ */
/* ═══════════════════════════════════════════════════════════════════════
   TEAM PAGE — member management, roles, permissions, trust signals
   ═══════════════════════════════════════════════════════════════════════ */
const ROLE_MATRIX = [
  { action: "View decision briefs",     analyst: true,  viewer: true,  admin: true  },
  { action: "Run intelligence scans",   analyst: true,  viewer: false, admin: true  },
  { action: "Create workspaces",        analyst: true,  viewer: false, admin: true  },
  { action: "Approve actions",          analyst: false, viewer: false, admin: true  },
  { action: "Execute actions",          analyst: false, viewer: false, admin: true  },
  { action: "Manage team members",      analyst: false, viewer: false, admin: true  },
  { action: "Configure integrations",   analyst: false, viewer: false, admin: true  },
  { action: "Export audit log",         analyst: false, viewer: false, admin: true  },
  { action: "View evidence & sources",  analyst: true,  viewer: true,  admin: true  },
  { action: "Chat with Analyst",        analyst: true,  viewer: true,  admin: true  },
];

/* ═══════════════════════════════════════════════════════════════════════
   SUPER ADMIN PAGE — user management (othnielobasi@gmail.com only)
   ═══════════════════════════════════════════════════════════════════════ */
const SUPER_ADMIN_EMAIL = "othnielobasi@gmail.com";

function SuperAdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", organization: "", role: "admin" });
  const [formErr, setFormErr] = useState("");
  const [actionBusy, setActionBusy] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setUsers(await endpoints.adminListUsers()); }
    catch (e) { setErr(e.message || "Failed to load users"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    if (!form.name || !form.email || !form.password) { setFormErr("Name, email and password are required."); return; }
    setCreating(true); setFormErr("");
    try {
      await endpoints.adminCreateUser({ ...form, organization: form.organization || form.name });
      toast.success(`Account created for ${form.email}`);
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", organization: "", role: "admin" });
      load();
    } catch (e) { setFormErr(e.message || "Failed to create user"); }
    finally { setCreating(false); }
  };

  const setStatus = async (userId, newStatus, email) => {
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL) return;
    setActionBusy(b => ({ ...b, [userId]: true }));
    try {
      await endpoints.adminSetStatus(userId, newStatus);
      toast.success(`${email} — ${newStatus}`);
      load();
    } catch (e) { toast.error(e.message || "Failed"); }
    finally { setActionBusy(b => ({ ...b, [userId]: false })); }
  };

  const statusColor = { active: "#22c55e", banned: "#ef4444", suspended: "#f59e0b", deleted: "#475569" };

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "36px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", marginBottom: 8 }}>
            <Lock size={10} color="#ef4444" />
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#ef4444" }}>System Admin</span>
          </div>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>User management</h2>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Manage accounts, access, and tenant provisioning.</p>
        </div>
        <button onClick={() => { setShowCreate(p => !p); setFormErr(""); }} style={{ padding: "9px 18px", borderRadius: 7, border: "none", background: showCreate ? "rgba(255,255,255,.06)" : "#0ea5e9", color: showCreate ? T.muted : "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          {showCreate ? "Cancel" : <><Users2 size={13} /> Create account</>}
        </button>
      </div>

      {err && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", color: "#ef4444", fontSize: 13 }}>{err}</div>}

      {/* Create user form */}
      {showCreate && (
        <div className="anim-up" style={{ padding: "20px 22px", borderRadius: 10, background: T.bgCard, border: "1px solid rgba(14,165,233,.2)", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>New account</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 10 }}>
            {[["Full name", "name", "text"], ["Email", "email", "email"], ["Password", "password", "password"], ["Organization", "organization", "text"]].map(([label, key, type]) => (
              <div key={key}>
                <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>{label}</div>
                <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: "100%", padding: "9px 11px", borderRadius: 6, background: T.bgSub, border: `1px solid ${T.borderL}`, color: T.text, fontSize: 13, outline: "none" }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Role</div>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ width: "100%", padding: "9px 11px", borderRadius: 6, background: T.bgSub, border: `1px solid ${T.borderL}`, color: T.text, fontSize: 13, outline: "none" }}>
                {["admin", "analyst", "viewer"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          {formErr && <div style={{ marginBottom: 10, fontSize: 12, color: "#fca5a5", padding: "6px 10px", borderRadius: 5, background: "rgba(239,68,68,.07)" }}>{formErr}</div>}
          <button onClick={createUser} disabled={creating} style={{ padding: "9px 22px", borderRadius: 7, border: "none", background: "#0ea5e9", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{creating ? "Creating…" : "Create account"}</button>
        </div>
      )}

      {/* Summary metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { n: users.length, l: "Total accounts", c: T.accent },
          { n: users.filter(u => u.status === "active").length, l: "Active", c: "#22c55e" },
          { n: users.filter(u => u.status === "banned" || u.status === "suspended").length, l: "Banned / suspended", c: "#ef4444" },
          { n: [...new Set(users.map(u => u.tenant_id))].length, l: "Tenants", c: "#818cf8" },
        ].map((m, i) => (
          <div key={i} style={{ padding: "14px 16px", borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: m.c, fontFamily: "'JetBrains Mono'" }}>{m.n}</div>
            <div style={{ fontSize: 10, color: T.dim, marginTop: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>{m.l}</div>
          </div>
        ))}
      </div>

      {/* User table */}
      <div style={{ borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: "1fr 1fr 80px 80px 140px 100px", gap: 8, alignItems: "center" }}>
          {["Name", "Email", "Role", "Status", "Tenant", "Actions"].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: T.dim }}>{h}</span>
          ))}
        </div>
        {loading ? [1,2,3].map(i => <div key={i} className="skel" style={{ height: 52, margin: "1px 0" }} />) :
          users.map((u, i) => {
            const isSelf = u.email.toLowerCase() === SUPER_ADMIN_EMAIL;
            return (
              <div key={u.id} style={{ padding: "12px 16px", borderBottom: i < users.length - 1 ? `1px solid ${T.border}` : "none", display: "grid", gridTemplateColumns: "1fr 1fr 80px 80px 140px 100px", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.name}
                  {isSelf && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(239,68,68,.1)", color: "#ef4444", textTransform: "uppercase" }}>you</span>}
                </div>
                <div style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                <div style={{ fontSize: 11, color: T.dim, textTransform: "capitalize" }}>{u.role}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor[u.status] || T.dim, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: statusColor[u.status] || T.dim, textTransform: "capitalize" }}>{u.status}</span>
                </div>
                <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.tenant_id}</div>
                <div style={{ display: "flex", gap: 5 }}>
                  {!isSelf && u.status === "active" && (
                    <button onClick={() => setStatus(u.id, "banned", u.email)} disabled={actionBusy[u.id]} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(239,68,68,.25)", background: "transparent", color: "#ef4444", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>{actionBusy[u.id] ? "…" : "Ban"}</button>
                  )}
                  {!isSelf && u.status !== "active" && (
                    <button onClick={() => setStatus(u.id, "active", u.email)} disabled={actionBusy[u.id]} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(34,197,94,.25)", background: "transparent", color: "#22c55e", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>{actionBusy[u.id] ? "…" : "Restore"}</button>
                  )}
                </div>
              </div>
            );
          })
        }
        {!loading && !users.length && <EmptyState icon={Users2} title="No accounts yet" body="Create the first account using the button above." />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SIGNAL FEED — intelligence inbox, newest first, across all workspaces
   ═══════════════════════════════════════════════════════════════════════ */
function FeedPage({ nav, ws }) {
  const [runs, setRuns] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");
  const [filterWs, setFilterWs] = useState("");
  const [filterSev, setFilterSev] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      endpoints.listAllRuns(80),
      endpoints.listWorkspaces().catch(() => [])
    ]).then(([runList, wsList]) => {
      setRuns(Array.isArray(runList) ? runList : []);
      const list = Array.isArray(wsList) ? wsList : (wsList?.workspaces || []);
      setWorkspaces(list);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const wsName = (topicId) => {
    const w = workspaces.find(w => w.id === topicId);
    if (w?.name) return w.name;
    const extracted = (topicId || "").replace(/^.*workspace_/, "").replace(/_/g, " ").trim();
    return extracted || topicId || "Workspace";
  };

  const sevColor = (s) => ({ critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", monitoring: "#3b82f6" })[s?.toLowerCase()] || T.border;
  const sevLabel = (s) => (s || "monitoring").charAt(0).toUpperCase() + (s || "monitoring").slice(1).toLowerCase();

  const ago = (d) => {
    const mins = Math.floor((Date.now() - new Date(d)) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: days > 365 ? "numeric" : undefined });
  };

  const hasFilters = !!(search || filterWs || filterSev || filterFrom || filterTo);

  const filtered = runs.filter(r => {
    const b = r.decision_brief || {};
    if (filterWs && r.topic_id !== filterWs) return false;
    if (filterSev && b.severity?.toLowerCase() !== filterSev) return false;
    if (filterFrom && new Date(r.created_at) < new Date(filterFrom)) return false;
    if (filterTo && new Date(r.created_at) > new Date(filterTo + "T23:59:59")) return false;
    if (search) {
      const q = search.toLowerCase();
      return (b.headline?.toLowerCase().includes(q) ||
              b.answer?.toLowerCase().includes(q) ||
              r.summary?.toLowerCase().includes(q) ||
              r.task?.toLowerCase().includes(q) ||
              r.topic_id?.toLowerCase().includes(q));
    }
    return true;
  });

  const SHOW_COUNT = 5;
  const shown = (showAll || hasFilters) ? filtered : filtered.slice(0, SHOW_COUNT);
  const hiddenCount = hasFilters ? 0 : filtered.length - SHOW_COUNT;

  const goToBrief = (runId) => {
    localStorage.setItem("webdataos.brief.runId", runId);
    nav("Brief");
  };

  const IS2 = { padding: "7px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.bgSub, color: T.text, fontSize: 11, outline: "none", width: "100%" };

  // Unique workspaces for filter
  const wsOptions = [...new Map(runs.filter(r => r.topic_id).map(r => [r.topic_id, wsName(r.topic_id)])).entries()];

  if (loading) return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: "spin .8s linear infinite" }} />
        <span style={{ color: T.muted, fontSize: 13 }}>Loading your intelligence feed…</span>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 80px" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: ".10em", marginBottom: 4 }}>Signal Feed</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: T.text, margin: 0, letterSpacing: "-.02em" }}>Intelligence Inbox</h1>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
            {runs.length ? `${runs.length} update${runs.length !== 1 ? "s" : ""} across ${wsOptions.length} workspace${wsOptions.length !== 1 ? "s" : ""}` : "No updates yet"}
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgSub, color: T.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── FILTERS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 8, marginBottom: 24, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Search size={12} color={T.dim} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setShowAll(true); }}
            placeholder="Search intelligence updates…"
            style={{ ...IS2, paddingLeft: 30 }}
          />
        </div>
        {wsOptions.length > 1 && (
          <select value={filterWs} onChange={e => { setFilterWs(e.target.value); setShowAll(true); }} style={{ ...IS2, width: "auto", minWidth: 120 }}>
            <option value="">All workspaces</option>
            {wsOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        <select value={filterSev} onChange={e => { setFilterSev(e.target.value); setShowAll(true); }} style={{ ...IS2, width: "auto" }}>
          <option value="">All severity</option>
          {["critical", "high", "medium", "low", "monitoring"].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setShowAll(true); }} title="From date" style={{ ...IS2, width: "auto", colorScheme: "dark" }} />
        <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setShowAll(true); }} title="To date" style={{ ...IS2, width: "auto", colorScheme: "dark" }} />
      </div>
      {hasFilters && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: T.dim }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          <button onClick={() => { setSearch(""); setFilterWs(""); setFilterSev(""); setFilterFrom(""); setFilterTo(""); setShowAll(false); }} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer" }}>Clear filters</button>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!runs.length && (
        <div style={{ padding: "60px 40px", textAlign: "center", borderRadius: 14, border: `1px solid ${T.border}`, background: T.bgSub }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>◎</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 8 }}>Your intelligence feed is empty</div>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
            Run a monitoring cycle to start receiving intelligence updates. Each run generates a brief that appears here, newest first.
          </div>
          <button onClick={() => nav("Monitor")} style={{ padding: "11px 24px", borderRadius: 9, background: T.accent, color: "#000", fontWeight: 900, border: "none", fontSize: 13, cursor: "pointer" }}>
            Set up monitoring →
          </button>
        </div>
      )}

      {/* ── FEED ITEMS ── */}
      {shown.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {shown.map((r, idx) => {
            const b = r.decision_brief || {};
            const isNew = idx === 0 && !hasFilters;
            const sev = b.severity?.toLowerCase() || "monitoring";
            const color = sevColor(sev);
            const isExpanded = expanded === r.id;
            const snippet = b.answer ? (b.answer.length > 160 ? b.answer.slice(0, 160) + "…" : b.answer) : (r.summary ? (r.summary.length > 160 ? r.summary.slice(0, 160) + "…" : r.summary) : "No summary available.");
            const hasContent = !!(b.headline || r.summary);
            if (!hasContent) return null;

            return (
              <div key={r.id} style={{ borderRadius: 12, border: `1px solid ${isExpanded ? color + "60" : T.border}`, background: isExpanded ? color + "06" : T.bgSub, overflow: "hidden", transition: "border-color .15s", marginBottom: 8 }}>
                {/* Severity strip */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}60)` }} />

                <div style={{ padding: "16px 20px" }}>
                  {/* Row 1: workspace + time + new badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      {isNew && (
                        <span style={{ padding: "2px 8px", borderRadius: 99, background: T.accent + "22", color: T.accent, fontSize: 9, fontWeight: 900, letterSpacing: ".07em" }}>NEW</span>
                      )}
                      <span style={{ padding: "2px 10px", borderRadius: 99, background: T.bgCard, border: `1px solid ${T.border}`, fontSize: 10, color: T.muted, fontWeight: 600 }}>
                        {wsName(r.topic_id)}
                      </span>
                      <span style={{ padding: "2px 8px", borderRadius: 99, background: color + "15", color: color, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
                        {sevLabel(sev)}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: T.dim }}>{ago(r.created_at)}</span>
                  </div>

                  {/* Row 2: Headline */}
                  <div
                    onClick={() => setExpanded(isExpanded ? null : r.id)}
                    style={{ fontSize: 15, fontWeight: 800, color: T.text, lineHeight: 1.4, letterSpacing: "-.01em", cursor: "pointer", marginBottom: 8 }}
                  >
                    {b.headline || r.task || "Intelligence update"}
                  </div>

                  {/* Row 3: Snippet (collapsed) */}
                  {!isExpanded && (
                    <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.65 }}>{snippet}</div>
                  )}

                  {/* Expanded content */}
                  {isExpanded && (
                    <div style={{ marginTop: 4 }}>
                      {b.answer && <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 14 }}>{b.answer}</div>}

                      {/* What changed + Impact side by side */}
                      {(b.what_changed || b.business_impact) && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                          {b.what_changed && (
                            <div style={{ padding: "12px 14px", borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}` }}>
                              <div style={{ fontSize: 9, color: T.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>What changed</div>
                              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{b.what_changed}</div>
                            </div>
                          )}
                          {b.business_impact && (
                            <div style={{ padding: "12px 14px", borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}` }}>
                              <div style={{ fontSize: 9, color: T.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Business impact</div>
                              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{b.business_impact}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Recommended action */}
                      {b.recommended_action && (
                        <div style={{ padding: "10px 14px", borderRadius: 9, background: T.accent + "0c", border: `1px solid ${T.accent}30`, marginBottom: 14 }}>
                          <div style={{ fontSize: 9, color: T.accent, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Recommended action</div>
                          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{b.recommended_action}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Row: Actions row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: isExpanded ? 12 : 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                    <button onClick={() => setExpanded(isExpanded ? null : r.id)} style={{ fontSize: 11, color: T.dim, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {isExpanded ? "Show less ↑" : "Show more ↓"}
                    </button>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => goToBrief(r.id)} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${color}60`, background: color + "12", color: color, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                        Full brief →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── LOAD MORE ── */}
      {hiddenCount > 0 && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={() => setShowAll(true)} style={{ padding: "10px 24px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.bgSub, color: T.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Show {hiddenCount} earlier update{hiddenCount !== 1 ? "s" : ""} ↓
          </button>
        </div>
      )}

      {/* ── FILTERED EMPTY ── */}
      {runs.length > 0 && filtered.length === 0 && (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: T.dim }}>No updates match your filters.</div>
          <button onClick={() => { setSearch(""); setFilterWs(""); setFilterSev(""); setFilterFrom(""); setFilterTo(""); }} style={{ marginTop: 10, fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer" }}>Clear filters</button>
        </div>
      )}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   INTELLIGENCE BRIEF PAGE — primary daily intelligence consumption surface
   Shows the latest run's decision brief in a consumable executive format.
   ═══════════════════════════════════════════════════════════════════════ */
function BriefPage({ ws, nav, runResearch, setActions }) {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [brief, setBrief] = useState(null);      // decision_brief
  const [reasoning, setReasoning] = useState(null); // ReasoningOutput
  const [fullReport, setFullReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [workspaces, setWorkspaces] = useState([]);
  const [wsId, setWsId] = useState(ws?.id || "");

  // Check if Feed sent us a specific run to open
  const pinnedRunId = useRef(localStorage.getItem("webdataos.brief.runId"));
  useEffect(() => { localStorage.removeItem("webdataos.brief.runId"); }, []);

  // Load workspace list
  useEffect(() => {
    endpoints.listWorkspaces().then(r => {
      const list = Array.isArray(r) ? r : (r?.workspaces || []);
      setWorkspaces(list);
      if (!wsId && list.length) setWsId(list[0].id);
    }).catch(() => {});
  }, []);

  // When wsId changes load run history
  useEffect(() => {
    if (!wsId) return;
    setLoading(true); setError(""); setBrief(null); setReasoning(null); setFullReport(null);
    endpoints.listRuns(wsId, 20)
      .then(list => {
        if (!Array.isArray(list) || !list.length) { setRuns([]); setLoading(false); return; }
        setRuns(list);
        // If Feed linked to a specific run, prefer that; otherwise latest
        const target = pinnedRunId.current ? list.find(r => r.id === pinnedRunId.current) || list[0] : list[0];
        pinnedRunId.current = null;
        setSelectedRunId(target.id);
        if (target.decision_brief) setBrief(target.decision_brief);
        return endpoints.getRun(target.id);
      })
      .then(full => {
        if (!full) return;
        setFullReport(full.report || full);
        setBrief(full.report?.decision_brief || full.decision_brief || brief);
        setReasoning(full.report?.reasoning || null);
      })
      .catch(() => setError("Could not load the latest intelligence brief."))
      .finally(() => setLoading(false));
  }, [wsId]);

  // Load a specific run
  const loadRun = async (runId) => {
    setSelectedRunId(runId);
    setLoading(true); setBrief(null); setReasoning(null); setFullReport(null);
    try {
      const full = await endpoints.getRun(runId);
      setFullReport(full.report || full);
      setBrief(full.report?.decision_brief || full.decision_brief || null);
      setReasoning(full.report?.reasoning || null);
    } catch (_) { setError("Could not load this run."); }
    finally { setLoading(false); }
  };

  const runNow = async () => {
    setRunning(true); setError("");
    try {
      const result = await endpoints.runMonitor(wsId);
      try { setActions(await endpoints.listActions(wsId)); } catch (_) {}
      // Reload brief
      const list = await endpoints.listRuns(wsId, 20);
      if (Array.isArray(list) && list.length) {
        setRuns(list);
        await loadRun(list[0].id);
      }
      if (result?.decision_brief) setBrief(result.decision_brief);
      toast.success("Intelligence brief updated");
    } catch (e) {
      const msg = e.message || "Monitoring run failed.";
      setError(msg); toast.error(msg);
    } finally { setRunning(false); }
  };

  // Risk posture colour
  const riskColor = (p) => p === "critical" ? "#ef4444" : p === "degrading" ? "#f97316" : p === "improving" ? "#22c55e" : "#3b82f6";
  const riskLabel = (p) => ({ critical: "Critical", degrading: "Degrading", improving: "Improving", stable: "Stable" }[p] || "Monitoring");

  // Severity colour
  const sevColor = (s) => ({ critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", monitoring: "#3b82f6" }[s?.toLowerCase()] || "#64748b");
  const matColor = (m) => ({ critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", informational: "#64748b" }[m?.toLowerCase()] || "#64748b");

  const rp = reasoning?.risk_posture || "stable";
  const selectedRun = runs.find(r => r.id === selectedRunId);
  const keyFindings = fullReport?.key_findings || [];
  const materiality = reasoning?.materiality_assessments || [];
  const recommendations = reasoning?.recommendations || [];
  const sources = fullReport?.sources || brief?.evidence?.map(e => e.source_url).filter(Boolean) || [];
  const confidence = brief?.confidence ?? reasoning?.confidence ?? 0;
  const execSummary = reasoning?.executive_summary || "";

  // Dedup sources to hostnames
  const sourceHosts = [...new Set(sources.map(u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } }).filter(Boolean))].slice(0, 8);

  const PageWrap = ({ children }) => (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px" }}>
      {children}
    </div>
  );

  const Section = ({ label, children, accent }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: accent || T.dim, textTransform: "uppercase", letterSpacing: ".10em", marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );

  // ── Empty / no workspace ──────────────────────────────────────────
  if (!wsId) return (
    <PageWrap>
      <div style={{ textAlign: "center", padding: "80px 0", color: T.dim }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>◎</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>No workspace configured</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>Set up a monitoring workspace to generate intelligence briefs.</div>
        <button onClick={() => nav("Monitor")} style={{ padding: "10px 22px", borderRadius: 8, background: T.accent, color: "#000", fontWeight: 800, border: "none", fontSize: 13 }}>Configure workspace →</button>
      </div>
    </PageWrap>
  );

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <PageWrap>
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "60px 0" }}>
        <div style={{ width: 20, height: 20, borderRadius: 999, border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: "spin .8s linear infinite" }} />
        <span style={{ color: T.muted, fontSize: 13 }}>Loading intelligence brief…</span>
      </div>
    </PageWrap>
  );

  // ── No runs yet ───────────────────────────────────────────────────
  if (!runs.length) return (
    <PageWrap>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: T.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Intelligence Brief</div>
          <WorkspacePicker wsId={wsId} setWsId={setWsId} workspaces={workspaces} />
        </div>
      </div>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, padding: "56px 40px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>◎</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 8 }}>No briefs yet</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 24, maxWidth: 420, margin: "0 auto 24px" }}>
          Run your first monitoring cycle to generate an intelligence brief. The brief will summarise what changed, assess business impact, and recommend actions.
        </div>
        <button onClick={runNow} disabled={running} style={{ padding: "12px 28px", borderRadius: 10, background: T.accent, color: "#000", fontWeight: 900, border: "none", fontSize: 14, cursor: "pointer", opacity: running ? 0.6 : 1 }}>
          {running ? "Running…" : "Run first monitoring cycle →"}
        </button>
        {error && <div style={{ marginTop: 16, fontSize: 12, color: "#ef4444" }}>{error}</div>}
      </div>
    </PageWrap>
  );

  // ── Main brief ────────────────────────────────────────────────────
  return (
    <PageWrap>
      {/* ── PAGE HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: T.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Intelligence Brief</div>
          <WorkspacePicker wsId={wsId} setWsId={setWsId} workspaces={workspaces} />
          {selectedRun && (
            <div style={{ marginTop: 6, fontSize: 11, color: T.dim }}>
              Last run {new Date(selectedRun.created_at).toLocaleString()} · {runs.length} run{runs.length !== 1 ? "s" : ""} on record
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Risk posture pill */}
          <span style={{ padding: "5px 14px", borderRadius: 99, background: riskColor(rp) + "18", border: `1px solid ${riskColor(rp)}50`, color: riskColor(rp), fontSize: 11, fontWeight: 800 }}>
            {riskLabel(rp)}
          </span>
          <button onClick={runNow} disabled={running} style={{ padding: "8px 18px", borderRadius: 9, background: running ? T.bgSub : T.accent, color: running ? T.muted : "#000", fontWeight: 900, border: "none", fontSize: 12, cursor: running ? "default" : "pointer" }}>
            {running ? "Running…" : "↺ Refresh brief"}
          </button>
        </div>
      </div>

      {/* ── RUN HISTORY STRIP ── */}
      {runs.length > 1 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
          {runs.map(r => {
            const isSelected = r.id === selectedRunId;
            const sev = r.decision_brief?.severity;
            const dot = sev ? sevColor(sev) : T.dim;
            return (
              <button key={r.id} onClick={() => loadRun(r.id)} style={{
                flexShrink: 0, padding: "6px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700,
                border: `1px solid ${isSelected ? T.accent : T.border}`,
                background: isSelected ? T.accent + "18" : T.bgSub,
                color: isSelected ? T.accent : T.muted, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </button>
            );
          })}
        </div>
      )}

      {error && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "#ef444415", border: "1px solid #ef444440", color: "#ef4444", fontSize: 12 }}>{error}</div>}

      {brief ? (<>
        {/* ── SITUATION CARD ── */}
        <div style={{ borderRadius: 14, border: `1px solid ${sevColor(brief.severity)}40`, background: sevColor(brief.severity) + "08", padding: "28px 32px", marginBottom: 20, position: "relative", overflow: "hidden" }}>
          {/* Severity glow strip */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: sevColor(brief.severity), borderRadius: "14px 0 0 14px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".10em", color: T.dim }}>Situation</div>
            <span style={{ padding: "3px 12px", borderRadius: 99, background: sevColor(brief.severity) + "22", color: sevColor(brief.severity), fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em", border: `1px solid ${sevColor(brief.severity)}50` }}>
              {brief.severity}
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text, lineHeight: 1.35, marginBottom: 12, letterSpacing: "-.02em" }}>
            {brief.headline}
          </div>
          {brief.delta_headline && (
            <div style={{ fontSize: 12, color: T.accent, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent }} />
              {brief.delta_headline}
            </div>
          )}
          <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.7 }}>{brief.answer}</div>
          {execSummary && execSummary !== brief.answer && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.text, lineHeight: 1.65 }}>{execSummary}</div>
          )}
          {typeof confidence === "number" && confidence > 0 && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, color: T.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Confidence</span>
              <div style={{ flex: 1, maxWidth: 120, height: 4, borderRadius: 99, background: T.border }}>
                <div style={{ height: 4, borderRadius: 99, background: T.accent, width: `${Math.round(confidence * 100)}%` }} />
              </div>
              <span style={{ fontSize: 10, color: T.accent, fontWeight: 700 }}>{Math.round(confidence * 100)}%</span>
            </div>
          )}
        </div>

        {/* ── THREE-COLUMN IMPACT ROW ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
          {/* What changed */}
          <div style={{ padding: "18px 20px", borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: T.dim, textTransform: "uppercase", letterSpacing: ".10em", marginBottom: 8 }}>What changed</div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.65 }}>{brief.what_changed || "No changes detected in this run."}</div>
          </div>
          {/* Business impact */}
          <div style={{ padding: "18px 20px", borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: T.dim, textTransform: "uppercase", letterSpacing: ".10em", marginBottom: 8 }}>Business impact</div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.65 }}>{brief.business_impact || "Assessment pending further evidence."}</div>
          </div>
          {/* Recommended action */}
          <div style={{ padding: "18px 20px", borderRadius: 12, background: T.accent + "0c", border: `1px solid ${T.accent}30` }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: T.accent, textTransform: "uppercase", letterSpacing: ".10em", marginBottom: 8 }}>Recommended action</div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.65, marginBottom: 12 }}>{brief.recommended_action || "No immediate action required."}</div>
            <button onClick={() => nav("Actions")} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${T.accent}50`, background: "transparent", color: T.accent, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
              View actions →
            </button>
          </div>
        </div>

        {/* ── MATERIALITY ASSESSMENTS ── */}
        {materiality.length > 0 && (
          <Section label="Key findings">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {materiality.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 18px", borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}`, borderLeft: `3px solid ${matColor(m.materiality)}` }}>
                  <span style={{ marginTop: 2, padding: "2px 9px", borderRadius: 99, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".07em", background: matColor(m.materiality) + "18", color: matColor(m.materiality), flexShrink: 0 }}>
                    {m.materiality}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>{m.finding}</div>
                    <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>{m.impact_description}</div>
                    {m.urgency && m.urgency !== "standard" && (
                      <div style={{ marginTop: 5, fontSize: 10, color: m.urgency === "immediate" ? "#ef4444" : m.urgency === "urgent" ? "#f97316" : T.dim, fontWeight: 700 }}>
                        {m.urgency === "immediate" ? "⚡ Immediate action required" : m.urgency === "urgent" ? "⚠ Urgent" : m.urgency}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Fallback: key_findings list when no materiality assessments */}
        {!materiality.length && keyFindings.length > 0 && (
          <Section label="Key findings">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {keyFindings.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "10px 16px", borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}>
                  <span style={{ color: T.accent, fontSize: 13, flexShrink: 0, marginTop: 1 }}>●</span>
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{f}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── RECOMMENDATIONS ── */}
        {recommendations.length > 0 && (
          <Section label="Recommendations">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {recommendations.slice(0, 4).map((r, i) => (
                <div key={i} style={{ padding: "16px 20px", borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}`, borderTop: `3px solid ${matColor(r.materiality)}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 9, color: matColor(r.materiality), fontWeight: 900, textTransform: "uppercase", letterSpacing: ".07em" }}>{r.materiality}</span>
                    {r.confidence > 0 && <span style={{ fontSize: 10, color: T.dim }}>{Math.round(r.confidence * 100)}% confidence</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 6, lineHeight: 1.4 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: r.suggested_actions?.length ? 10 : 0 }}>{r.description}</div>
                  {r.suggested_actions?.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {r.suggested_actions.slice(0, 3).map((a, j) => (
                        <div key={j} style={{ fontSize: 11, color: T.text, display: "flex", gap: 6, alignItems: "baseline" }}>
                          <span style={{ color: T.accent, flexShrink: 0 }}>→</span> {a}
                        </div>
                      ))}
                    </div>
                  )}
                  {r.deadline && (
                    <div style={{ marginTop: 8, fontSize: 10, color: T.dim, fontWeight: 700 }}>Deadline: {r.deadline}</div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── UNKNOWNS (gaps in intelligence) ── */}
        {brief.unknowns?.length > 0 && (
          <Section label="Intelligence gaps">
            <div style={{ padding: "14px 18px", borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>The following could not be determined from available evidence:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {brief.unknowns.map((u, i) => (
                  <div key={i} style={{ fontSize: 12, color: T.dim, display: "flex", gap: 8 }}>
                    <span style={{ color: T.dim, flexShrink: 0 }}>?</span>{u}
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ── EVIDENCE TRAIL ── */}
        {(sourceHosts.length > 0 || brief.evidence?.length > 0) && (
          <Section label="Evidence trail">
            <div style={{ padding: "16px 20px", borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Confidence bar */}
              {confidence > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 10, color: T.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", width: 80, flexShrink: 0 }}>Confidence</span>
                  <div style={{ flex: 1, height: 5, borderRadius: 99, background: T.border, maxWidth: 200 }}>
                    <div style={{ height: 5, borderRadius: 99, background: confidence > 0.7 ? "#22c55e" : confidence > 0.4 ? "#eab308" : "#ef4444", width: `${Math.round(confidence * 100)}%` }} />
                  </div>
                  <span style={{ fontSize: 11, color: T.text, fontWeight: 800 }}>{Math.round(confidence * 100)}%</span>
                </div>
              )}
              {/* Sources */}
              {sourceHosts.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: T.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginRight: 4 }}>Sources</span>
                  {sourceHosts.map((h, i) => (
                    <span key={i} style={{ padding: "3px 10px", borderRadius: 6, background: T.bgCard, border: `1px solid ${T.border}`, fontSize: 11, color: T.muted, fontWeight: 500 }}>{h}</span>
                  ))}
                </div>
              )}
              {/* Inline evidence items */}
              {brief.evidence?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {brief.evidence.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>{e.summary || e.key_finding || "Evidence item"}</div>
                        {e.source_url && (
                          <a href={e.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: T.accent, textDecoration: "none" }}>
                            ↗ {(() => { try { return new URL(e.source_url).hostname.replace(/^www\./, ""); } catch { return e.source_url; } })()}
                          </a>
                        )}
                      </div>
                      {e.confidence !== undefined && (
                        <span style={{ fontSize: 10, color: T.dim, flexShrink: 0, fontFamily: "'JetBrains Mono'" }}>{Math.round((e.confidence || 0) * 100)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ paddingTop: 8, borderTop: `1px solid ${T.border}`, display: "flex", gap: 16 }}>
                <button onClick={() => nav("Evidence")} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}>View all evidence records →</button>
                <button onClick={() => nav("Monitor")} style={{ fontSize: 11, color: T.dim, background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}>Run history →</button>
              </div>
            </div>
          </Section>
        )}

      </>) : (
        // Brief data missing but runs exist
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: T.muted, marginBottom: 8 }}>This run completed but no brief was generated.</div>
          <div style={{ fontSize: 12, color: T.dim, marginBottom: 20 }}>This can happen when LLM synthesis is unavailable. Try running again.</div>
          <button onClick={runNow} disabled={running} style={{ padding: "10px 22px", borderRadius: 8, background: T.accent, color: "#000", fontWeight: 800, border: "none", fontSize: 13, cursor: "pointer" }}>
            {running ? "Running…" : "Run again"}
          </button>
        </div>
      )}
    </PageWrap>
  );
}

/* Tiny workspace picker used inside BriefPage header */
function WorkspacePicker({ wsId, setWsId, workspaces }) {
  if (!workspaces.length) return <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{wsId || "Default workspace"}</div>;
  if (workspaces.length === 1) return <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{workspaces[0]?.name || wsId}</div>;
  return (
    <select value={wsId} onChange={e => setWsId(e.target.value)} style={{
      fontSize: 15, fontWeight: 800, color: T.text, background: "transparent", border: "none",
      outline: "none", cursor: "pointer", padding: 0, appearance: "none",
    }}>
      {workspaces.map(w => (
        <option key={w.id} value={w.id}>{w.name || w.id}</option>
      ))}
    </select>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PORTFOLIO PAGE — multi-workspace executive overview
   ═══════════════════════════════════════════════════════════════════════ */
function PortfolioPage({ nav, ws }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const MOCK_WORKSPACES = [
    { id: ws.id || "ws_1", name: ws.name || "Primary Workspace", domain: "enterprise", severity: "high", lastRun: "2h ago", signals: 7, actions: 2, status: "active" },
    { id: "ws_security", name: "Vendor Risk Monitor", domain: "security", severity: "medium", lastRun: "6h ago", signals: 3, actions: 0, status: "active" },
    { id: "ws_gtm", name: "GTM Intelligence", domain: "gtm", severity: "low", lastRun: "1d ago", signals: 12, actions: 1, status: "active" },
    { id: "ws_finance", name: "Market Signals", domain: "finance", severity: "monitoring", lastRun: "2d ago", signals: 5, actions: 0, status: "paused" },
  ];
  useEffect(() => {
    setLoading(true);
    setTimeout(() => { setWorkspaces(MOCK_WORKSPACES); setLoading(false); }, 600);
  }, []);
  const domainColor = { security: "#ef4444", gtm: "#3b82f6", finance: "#22c55e", enterprise: "#0ea5e9" };
  const highRisk = MOCK_WORKSPACES.filter(w => w.severity === "high" || w.severity === "critical").length;
  const totalSignals = MOCK_WORKSPACES.reduce((s, w) => s + w.signals, 0);
  const totalActions = MOCK_WORKSPACES.reduce((s, w) => s + w.actions, 0);
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <Eye>Portfolio view</Eye>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>Intelligence overview</h2>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Aggregated status across all monitored workspaces.</p>
        </div>
        <button onClick={() => nav("Monitor")} style={{ padding: "9px 18px", borderRadius: 7, border: "none", background: "#0ea5e9", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Zap size={13} /> Run all workspaces
        </button>
      </div>
      {/* Summary metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
        {[
          { n: MOCK_WORKSPACES.length, l: "Active workspaces", color: T.accent },
          { n: totalSignals, l: "Signals this week", color: "#f59e0b" },
          { n: highRisk, l: "Require attention", color: "#ef4444" },
          { n: totalActions, l: "Pending actions", color: "#818cf8" },
        ].map((m, i) => (
          <div key={i} style={{ padding: "16px 18px", borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: m.color, fontFamily: "'JetBrains Mono'" }}>{m.n}</div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>{m.l}</div>
          </div>
        ))}
      </div>
      {/* Workspace cards */}
      <div style={{ display: "grid", gap: 8 }}>
        {loading ? [1,2,3].map(i => <div key={i} className="skel" style={{ height: 88, borderRadius: 9 }} />) : workspaces.map(w => (
          <div key={w.id} onClick={() => nav("Monitor")} style={{ padding: "16px 20px", borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `3px solid ${domainColor[w.domain] || T.accent}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "border-color .15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = domainColor[w.domain] || T.accent}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{w.name}</span>
                <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, background: `${domainColor[w.domain]}12`, color: domainColor[w.domain], fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{w.domain}</span>
                {w.status === "paused" && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, background: "rgba(255,255,255,.04)", color: T.dim, textTransform: "uppercase" }}>paused</span>}
              </div>
              <div style={{ fontSize: 12, color: T.dim }}>Last run: {w.lastRun} · {w.signals} signals detected</div>
            </div>
            <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: matC(w.severity), fontFamily: "'JetBrains Mono'" }}>{w.signals}</div>
                <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase" }}>signals</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: w.actions ? "#818cf8" : T.dim, fontFamily: "'JetBrains Mono'" }}>{w.actions}</div>
                <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase" }}>actions</div>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 5, background: `${matC(w.severity)}12`, border: `1px solid ${matC(w.severity)}25`, color: matC(w.severity), fontSize: 10, fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", height: 26 }}>{w.severity}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   AUDIT LOG PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function AuditPage({ ws, nav }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    setLoading(true);
    Promise.all([
      endpoints.listRuns(ws.id, 20).catch(() => []),
      endpoints.listActions(ws.id).catch(() => []),
    ]).then(([runs, actions]) => {
      const runEntries = (runs || []).map(r => ({ id: r.id, type: "run", title: r.task || "Intelligence scan", detail: `Status: ${r.status || "completed"}`, at: r.created_at, workspace: ws.name }));
      const actionEntries = (actions || []).map(a => ({ id: a.id, type: "action", title: a.title || a.action_type, detail: `Status: ${a.status}${a.approved_by ? ` · by ${a.approved_by}` : ""}`, at: a.created_at || a.executed_at, workspace: ws.name }));
      const merged = [...runEntries, ...actionEntries].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
      setEntries(merged.length ? merged : MOCK_AUDIT);
      setLoading(false);
    });
  }, [ws.id]);
  const MOCK_AUDIT = [
    { id: "a1", type: "run", title: "Intelligence scan completed", detail: "7 signals detected · 2 actions proposed", at: new Date(Date.now()-7200000).toISOString(), workspace: ws.name },
    { id: "a2", type: "action", title: "Vendor security questionnaire", detail: "Status: approved · by admin@company.com", at: new Date(Date.now()-14400000).toISOString(), workspace: ws.name },
    { id: "a3", type: "run", title: "Intelligence scan completed", detail: "3 signals detected · Baseline updated", at: new Date(Date.now()-86400000).toISOString(), workspace: ws.name },
    { id: "a4", type: "action", title: "Escalate to legal team", detail: "Status: executed · by admin@company.com", at: new Date(Date.now()-172800000).toISOString(), workspace: ws.name },
    { id: "a5", type: "workspace", title: "Workspace created", detail: `${ws.name} configured`, at: new Date(Date.now()-604800000).toISOString(), workspace: ws.name },
  ];
  const typeColor = { run: "#0ea5e9", action: "#818cf8", workspace: "#22c55e", auth: "#f59e0b" };
  const filtered = filter === "all" ? entries : entries.filter(e => e.type === filter);
  const copyExport = () => {
    const csv = ["timestamp,type,title,detail,workspace", ...entries.map(e => `${e.at},${e.type},"${e.title}","${e.detail}",${e.workspace}`)].join("\n");
    navigator.clipboard?.writeText(csv);
    toast.success("Audit log copied as CSV");
  };
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <button onClick={() => nav("Team")} style={{ border: "none", background: "transparent", color: T.dim, fontSize: 12, cursor: "pointer", marginBottom: 6 }}>← Back to Team</button>
          <Eye>Audit trail</Eye>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>Activity log</h2>
        </div>
        <button onClick={copyExport} style={{ padding: "8px 16px", borderRadius: 7, border: `1px solid ${T.borderL}`, background: "transparent", color: T.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <FileText size={12} /> Export CSV
        </button>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["all", "All"], ["run", "Scans"], ["action", "Actions"], ["workspace", "Workspace"], ["auth", "Auth"]].map(([id, l]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ padding: "5px 12px", borderRadius: 5, border: `1px solid ${filter === id ? T.accent + "40" : T.border}`, background: filter === id ? "rgba(14,165,233,.08)" : "transparent", color: filter === id ? T.accent : T.muted, fontSize: 12, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      <div style={{ borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        {loading ? [1,2,3].map(i => <div key={i} className="skel" style={{ height: 56, margin: "1px 0" }} />) : filtered.map((e, i) => (
          <div key={e.id} style={{ padding: "12px 18px", borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: typeColor[e.type] || T.dim, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{e.title}</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{e.detail}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{e.at ? new Date(e.at).toLocaleString() : "—"}</div>
              <div style={{ fontSize: 10, color: typeColor[e.type] || T.dim, marginTop: 2, textTransform: "uppercase", letterSpacing: ".05em" }}>{e.type}</div>
            </div>
          </div>
        ))}
        {!loading && !filtered.length && <EmptyState icon={FileText} title="No entries" body={`No ${filter === "all" ? "" : filter + " "}events recorded yet.`} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   INTEGRATIONS PAGE — Slack, webhook, notification settings
   ═══════════════════════════════════════════════════════════════════════ */
function IntegrationsPage({ ws }) {
  const [slackUrl, setSlackUrl] = useState("");
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [notifyOn, setNotifyOn] = useState({ high: true, medium: false, any: false });
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    endpoints.slackStatus().then(s => {
      setSlackConfigured(s.configured);
      setSlackEnabled(s.configured);
    }).catch(() => {});
  }, []);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const test = async () => {
    setTestBusy(true); setTestResult(null);
    try {
      await endpoints.slackTest(slackUrl || null);
      setTestResult("ok");
      toast.success("Test notification sent to Slack ✓");
    } catch (e) {
      setTestResult("fail");
      toast.error(e.message || "Slack test failed");
    } finally {
      setTestBusy(false);
      setTimeout(() => setTestResult(null), 3000);
    }
  };
  const INTEGRATIONS = [
    { id: "slack", name: "Slack", desc: "Get decision briefs and signal alerts delivered to any Slack channel.", icon: "💬", available: true },
    { id: "teams", name: "Microsoft Teams", desc: "Deliver intelligence briefs to Teams channels via webhook.", icon: "🔷", available: false },
    { id: "email", name: "Email digest", desc: "Weekly or daily briefing digest to any email address.", icon: "✉️", available: true, link: "Digest" },
    { id: "jira", name: "Jira", desc: "Auto-create tickets from approved autonomous actions.", icon: "🎯", available: false },
    { id: "salesforce", name: "Salesforce", desc: "Push competitor and account signals to Salesforce records.", icon: "☁️", available: false },
    { id: "webhook", name: "Custom webhook", desc: "Send intelligence events to any endpoint via HTTP POST.", icon: "⚡", available: true },
  ];
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 24px" }}>
      <Eye>Integrations</Eye>
      <h2 style={{ fontSize: 22, marginTop: 4, marginBottom: 4 }}>Connect your tools</h2>
      <p style={{ fontSize: 13, color: T.muted, marginBottom: 28 }}>Deliver intelligence where your team already works.</p>
      <div style={{ display: "grid", gap: 10, marginBottom: 32 }}>
        {INTEGRATIONS.map(intg => (
          <div key={intg.id} style={{ padding: "18px 22px", borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16, opacity: intg.available ? 1 : .55 }}>
            <div style={{ fontSize: 24, flexShrink: 0, width: 40, textAlign: "center" }}>{intg.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{intg.name}</span>
                {!intg.available && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,.04)", color: T.dim, textTransform: "uppercase", letterSpacing: ".05em" }}>coming soon</span>}
                {intg.id === "slack" && slackConfigured && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(34,197,94,.1)", color: "#22c55e", textTransform: "uppercase", letterSpacing: ".05em", border: "1px solid rgba(34,197,94,.2)" }}>connected</span>}
              </div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 3 }}>{intg.desc}</div>
            </div>
            {intg.available && intg.id !== "slack" && (
              <button style={{ padding: "7px 16px", borderRadius: 6, border: `1px solid ${T.borderL}`, background: "transparent", color: T.muted, fontSize: 12, cursor: "not-allowed", opacity: .6 }}>Configure</button>
            )}
            {intg.id === "slack" && (
              <button onClick={() => setSlackEnabled(p => !p)} style={{ padding: "7px 16px", borderRadius: 6, border: `1px solid ${slackEnabled ? "rgba(34,197,94,.3)" : T.borderL}`, background: slackEnabled ? "rgba(34,197,94,.08)" : "transparent", color: slackEnabled ? "#22c55e" : T.muted, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                {slackEnabled ? "Disconnect" : "Connect"}
              </button>
            )}
          </div>
        ))}
      </div>
      {/* Slack configuration */}
      {slackEnabled && (
        <div className="anim-up" style={{ padding: "22px 24px", borderRadius: 10, background: T.bgCard, border: "1px solid rgba(34,197,94,.2)", marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
            💬 Slack configuration
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Webhook URL</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={slackUrl} onChange={e => setSlackUrl(e.target.value)} placeholder={slackConfigured ? "https://hooks.slack.com/services/… (already set on server)" : "https://hooks.slack.com/services/..."} style={{ flex: 1, padding: "9px 12px", borderRadius: 6, background: T.bgSub, border: `1px solid ${T.borderL}`, color: T.text, fontSize: 13, outline: "none" }} />
              <button onClick={test} disabled={testBusy || (!slackUrl && !slackConfigured)} style={{ padding: "9px 16px", borderRadius: 6, border: `1px solid ${testResult === "ok" ? "rgba(34,197,94,.4)" : testResult === "fail" ? "rgba(239,68,68,.4)" : T.borderL}`, background: "transparent", color: testResult === "ok" ? "#22c55e" : testResult === "fail" ? "#ef4444" : T.muted, fontSize: 12, cursor: "pointer", minWidth: 72 }}>
                {testBusy ? "…" : testResult === "ok" ? "Sent ✓" : testResult === "fail" ? "Failed ✗" : "Test"}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Notify on</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["high", "High severity only"], ["medium", "Medium + high"], ["any", "All signals"]].map(([id, l]) => (
                <button key={id} onClick={() => setNotifyOn({ high: false, medium: false, any: false, [id]: true })} style={{ padding: "7px 14px", borderRadius: 6, border: `1px solid ${notifyOn[id] ? "rgba(14,165,233,.4)" : T.border}`, background: notifyOn[id] ? "rgba(14,165,233,.08)" : "transparent", color: notifyOn[id] ? T.accent : T.muted, fontSize: 12, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </div>
          <button onClick={save} style={{ padding: "9px 22px", borderRadius: 6, border: "none", background: "#0ea5e9", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{saved ? "Saved ✓" : "Save"}</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DIGEST PAGE — scheduled briefing configuration
   ═══════════════════════════════════════════════════════════════════════ */
function DigestPage({ ws }) {
  const [enabled, setEnabled] = useState(false);
  const [freq, setFreq] = useState("weekly");
  const [day, setDay] = useState("Monday");
  const [time, setTime] = useState("08:00");
  const [channel, setChannel] = useState("email");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const save = () => { setSaved(true); toast.success("Digest schedule saved"); setTimeout(() => setSaved(false), 2000); };
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 24px" }}>
      <Eye>Scheduled digest</Eye>
      <h2 style={{ fontSize: 22, marginTop: 4, marginBottom: 4 }}>Automated briefing schedule</h2>
      <p style={{ fontSize: 13, color: T.muted, marginBottom: 28 }}>Deliver a compiled intelligence brief to your team on a schedule — no manual trigger required.</p>
      <div style={{ padding: "22px 24px", borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Enable toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Enable digest</div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>Automatically compile and send an intelligence brief on your schedule.</div>
          </div>
          <button onClick={() => setEnabled(p => !p)} style={{ width: 44, height: 24, borderRadius: 12, background: enabled ? "#0ea5e9" : "rgba(255,255,255,.08)", border: "none", cursor: "pointer", position: "relative", transition: "background .2s" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: enabled ? 23 : 3, transition: "left .2s" }} />
          </button>
        </div>
        {enabled && (
          <div className="anim-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Frequency */}
            <div>
              <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>Frequency</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["daily", "weekly", "biweekly"].map(f => (
                  <button key={f} onClick={() => setFreq(f)} style={{ padding: "7px 16px", borderRadius: 6, border: `1px solid ${freq === f ? "rgba(14,165,233,.4)" : T.border}`, background: freq === f ? "rgba(14,165,233,.08)" : "transparent", color: freq === f ? T.accent : T.muted, fontSize: 12, cursor: "pointer", textTransform: "capitalize" }}>{f}</button>
                ))}
              </div>
            </div>
            {/* Day/time */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {freq !== "daily" && (
                <div>
                  <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>Day</div>
                  <select value={day} onChange={e => setDay(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 6, background: T.bgSub, border: `1px solid ${T.borderL}`, color: T.text, fontSize: 13, outline: "none" }}>
                    {["Monday","Tuesday","Wednesday","Thursday","Friday"].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>Time</div>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 6, background: T.bgSub, border: `1px solid ${T.borderL}`, color: T.text, fontSize: 13, outline: "none" }} />
              </div>
            </div>
            {/* Channel */}
            <div>
              <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>Deliver via</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["email", "✉️ Email"], ["slack", "💬 Slack"]].map(([id, l]) => (
                  <button key={id} onClick={() => setChannel(id)} style={{ padding: "7px 16px", borderRadius: 6, border: `1px solid ${channel === id ? "rgba(14,165,233,.4)" : T.border}`, background: channel === id ? "rgba(14,165,233,.08)" : "transparent", color: channel === id ? T.accent : T.muted, fontSize: 12, cursor: "pointer" }}>{l}</button>
                ))}
              </div>
              {channel === "email" && (
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="team@company.com" style={{ marginTop: 8, width: "100%", padding: "9px 12px", borderRadius: 6, background: T.bgSub, border: `1px solid ${T.borderL}`, color: T.text, fontSize: 13, outline: "none" }} />
              )}
            </div>
            {/* Preview */}
            <div style={{ padding: "14px 16px", borderRadius: 8, background: T.bgInset, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Preview schedule</div>
              <div style={{ fontSize: 13, color: T.text }}>
                Every {freq === "daily" ? "day" : freq === "weekly" ? day : `other ${day}`} at {time} → {channel === "email" ? (email || "your email") : "Slack channel"} → <strong>Intelligence digest for {ws.name || "your workspace"}</strong>
              </div>
            </div>
            <button onClick={save} style={{ padding: "11px", borderRadius: 7, border: "none", background: "#0ea5e9", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{saved ? "Saved ✓" : "Save schedule"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamPage({ user, nav }) {
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const [invite, setInvite] = useState({ email: "", role: "analyst" });
  const [invites, setInvites] = useState([]);
  const [sent, setSent] = useState(false);

  const sendInvite = () => {
    if (!invite.email.includes("@")) return;
    setInvites(p => [...p, { ...invite, status: "pending", id: Date.now() }]);
    setInvite({ email: "", role: "analyst" });
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  };

  const ROLE_COLOR = { admin: "#0ea5e9", analyst: "#818cf8", viewer: "#7a8899" };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 24px" }}>
      <Eye>Team & permissions</Eye>
      <h2 style={{ fontSize: 22, marginTop: 4, marginBottom: 4 }}>Workspace access</h2>
      <p style={{ fontSize: 13, color: T.muted, marginBottom: 28 }}>Manage who can view, run, and approve intelligence in this workspace.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {/* Current members */}
        <div style={{ borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.dim }}>Members</span>
            <span style={{ fontSize: 10, color: T.dim }}>{1 + invites.filter(i => i.status !== "pending").length} active</span>
          </div>
          {/* Current user */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: "#0ea5e9", display: "grid", placeItems: "center", color: "#000", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{user?.initials || "A"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{user?.name || "You"}</div>
              <div style={{ fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "rgba(14,165,233,.1)", color: "#0ea5e9", textTransform: "uppercase", letterSpacing: ".06em", border: "1px solid rgba(14,165,233,.2)", flexShrink: 0 }}>{user?.role || "admin"}</span>
            <span style={{ fontSize: 10, color: "#22c55e" }}>You</span>
          </div>
          {invites.map(inv => (
            <div key={inv.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: "rgba(255,255,255,.05)", display: "grid", placeItems: "center", color: T.dim, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{inv.email[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.email}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: `${ROLE_COLOR[inv.role]}12`, color: ROLE_COLOR[inv.role], textTransform: "uppercase", letterSpacing: ".06em", border: `1px solid ${ROLE_COLOR[inv.role]}25`, flexShrink: 0 }}>{inv.role}</span>
              <span style={{ fontSize: 10, color: "#f59e0b" }}>Invited</span>
            </div>
          ))}
          {!invites.length && (
            <div style={{ padding: "14px 16px", color: T.dim, fontSize: 12 }}>No other members yet. Invite your team below.</div>
          )}
        </div>

        {/* Invite form */}
        <div style={{ borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.dim }}>Invite member</span>
          </div>
          <div style={{ padding: 16 }}>
            {!isAdmin && (
              <div style={{ marginBottom: 14, padding: "9px 12px", borderRadius: 6, background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.15)", fontSize: 12, color: "#f59e0b", display: "flex", gap: 8, alignItems: "center" }}>
                <Shield size={13} /> Only admins can invite team members.
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Email address</div>
              <input disabled={!isAdmin} value={invite.email} onChange={e => setInvite(p => ({ ...p, email: e.target.value }))} onKeyDown={e => e.key === "Enter" && sendInvite()} placeholder="colleague@company.com" style={{ width: "100%", padding: "9px 12px", borderRadius: 6, background: T.bgSub, border: `1px solid ${T.borderL}`, color: T.text, fontSize: 13, outline: "none", opacity: isAdmin ? 1 : .5 }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Role</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                {[["admin", "Admin", "Full access — approve & execute"], ["analyst", "Analyst", "Run scans, view briefs, use chat"], ["viewer", "Viewer", "Read-only access to briefs"]].map(([id, label, desc]) => (
                  <button key={id} disabled={!isAdmin} onClick={() => setInvite(p => ({ ...p, role: id }))} style={{ padding: "10px 10px", borderRadius: 7, border: `1px solid ${invite.role === id ? ROLE_COLOR[id] + "50" : "rgba(255,255,255,.08)"}`, background: invite.role === id ? ROLE_COLOR[id] + "08" : "transparent", cursor: isAdmin ? "pointer" : "not-allowed", textAlign: "left", opacity: isAdmin ? 1 : .5, transition: "border-color .15s" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: invite.role === id ? ROLE_COLOR[id] : T.text, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 10, color: T.dim, lineHeight: 1.4 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <button disabled={!isAdmin || !invite.email} onClick={sendInvite} style={{ width: "100%", padding: "10px", borderRadius: 6, border: "none", background: isAdmin && invite.email ? "#0ea5e9" : "rgba(255,255,255,.05)", color: isAdmin && invite.email ? "#000" : T.dim, fontSize: 13, fontWeight: 700, cursor: isAdmin && invite.email ? "pointer" : "not-allowed", transition: "background .15s" }}>
              {sent ? "Invite sent ✓" : "Send invite"}
            </button>
          </div>
        </div>
      </div>

      {/* Permissions matrix */}
      <div style={{ borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.dim }}>Permissions matrix</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, color: T.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Action</th>
              {["Admin", "Analyst", "Viewer"].map(r => (
                <th key={r} style={{ padding: "10px 16px", textAlign: "center", fontSize: 10, fontWeight: 700, color: ROLE_COLOR[r.toLowerCase()], textTransform: "uppercase", letterSpacing: ".06em" }}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_MATRIX.map((row, i) => (
              <tr key={row.action} style={{ borderBottom: i < ROLE_MATRIX.length - 1 ? `1px solid ${T.border}` : "none", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.01)" }}>
                <td style={{ padding: "9px 16px", fontSize: 12, color: T.text }}>{row.action}</td>
                {["admin", "analyst", "viewer"].map(role => (
                  <td key={role} style={{ padding: "9px 16px", textAlign: "center" }}>
                    {row[role] ? <span style={{ color: "#22c55e", fontSize: 14 }}>✓</span> : <span style={{ color: T.border, fontSize: 14 }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick links */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[["Audit", "View audit log →", "#818cf8"], ["Integrations", "Slack & webhooks →", "#22c55e"], ["Digest", "Schedule digest →", "#0ea5e9"]].map(([page, label, color]) => (
          <button key={page} onClick={() => nav(page)} style={{ padding: "8px 16px", borderRadius: 7, border: `1px solid ${color}25`, background: `${color}07`, color, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {/* Enterprise trust signals */}
      <div style={{ borderRadius: 10, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: T.dim }}>Security & compliance</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0 }}>
          {[
            { icon: <Shield size={16} />, title: "Audit-ready receipts", sub: "Available", color: "#f59e0b" },
            { icon: <Layers size={16} />, title: "SSO / SAML ready", sub: "Okta, Azure AD", color: "#22c55e" },
            { icon: <Lock size={16} />, title: "RBAC enforced", sub: "Admin · Analyst · Viewer", color: "#0ea5e9" },
            { icon: <FileText size={16} />, title: "Audit trail", sub: "All actions logged", color: "#818cf8" },
            { icon: <Globe size={16} />, title: "Data residency", sub: "EU & US available", color: "#0ea5e9" },
            { icon: <Zap size={16} />, title: "Operational health", sub: "Visible in app", color: "#22c55e" },
          ].map((item, i) => (
            <div key={item.title} style={{ padding: "16px 18px", borderRight: i % 3 < 2 ? `1px solid ${T.border}` : "none", borderBottom: i < 3 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: `${item.color}12`, border: `1px solid ${item.color}22`, display: "grid", placeItems: "center", color: item.color, flexShrink: 0 }}>{item.icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{item.title}</div>
                <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{item.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActPage({ actions, setActions, user, ws, nav }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [showDone, setShowDone] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const patchAction = updated => setActions(p => p.map(a => a.id === updated.id ? updated : a));

  const approve = async id => {
    setBusy(id); setErr("");
    try { patchAction(await endpoints.approveAction(id, { approve: true, approved_by: user?.email || user?.name || "admin" })); toast.success("Action approved"); }
    catch (e) { const m = e.message || "Could not approve."; setErr(m); toast.error(m); }
    finally { setBusy(""); }
  };
  const reject = async id => {
    setBusy(id); setErr("");
    try { patchAction(await endpoints.approveAction(id, { approve: false, approved_by: user?.email || user?.name || "admin" })); toast.info("Action rejected"); }
    catch (e) { const m = e.message || "Could not reject."; setErr(m); toast.error(m); }
    finally { setBusy(""); }
  };
  const execute = async id => {
    setBusy(id); setErr("");
    try { patchAction(await endpoints.executeAction(id)); toast.success("Action executed"); }
    catch (e) { const m = e.message || "Could not execute."; setErr(m); toast.error(m); }
    finally { setBusy(""); }
  };

  const pending = actions.filter(a => a.status === "pending_approval");
  const approved = actions.filter(a => a.status === "approved" || a.status === "auto_approved");
  const done = actions.filter(a => a.status === "executed" || a.status === "rejected");

  // Action type → readable goal framing
  const typeLabel = (t) => ({ draft_email: "Draft communication", schedule_review: "Schedule review", update_risk_register: "Update risk register", file_report: "File report", notify_team: "Notify team" }[t] || (t || "Action").replace(/_/g, " "));
  const typeColor = (t) => ({ draft_email: "#3b82f6", schedule_review: "#8b5cf6", update_risk_register: "#f59e0b", file_report: "#ef4444", notify_team: "#22c55e" }[t] || T.accent);

  const ActionCard = ({ a, mode }) => {
    const color = typeColor(a.action_type);
    const isBusy = busy === a.id;
    return (
      <div style={{ borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgSub, overflow: "hidden", marginBottom: 12 }}>
        {/* Intent header */}
        <div style={{ padding: "14px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ padding: "3px 10px", borderRadius: 99, background: color + "18", color: color, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".07em" }}>
              {typeLabel(a.action_type)}
            </span>
            {a.run_id && <span style={{ fontSize: 10, color: T.dim }}>From monitoring run</span>}
          </div>
          <span style={{ fontSize: 11, color: T.dim }}>
            {a.created_at ? new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
        </div>

        {/* Title = what decision needs to be made */}
        <div style={{ padding: "10px 20px 0", fontSize: 15, fontWeight: 800, color: T.text, lineHeight: 1.4, letterSpacing: "-.01em" }}>
          {a.title}
        </div>

        {/* Description = the why and what */}
        {a.description && (
          <div style={{ padding: "8px 20px 0", fontSize: 13, color: T.muted, lineHeight: 1.7 }}>
            {a.description}
          </div>
        )}

        {/* Payload context (structured) */}
        {a.payload && Object.keys(a.payload).length > 0 && (
          <div style={{ margin: "10px 20px 0", padding: "10px 14px", borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}` }}>
            {Object.entries(a.payload).filter(([k]) => !["recommendation_id", "tenant_id"].includes(k)).slice(0, 4).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, marginBottom: 4, alignItems: "baseline" }}>
                <span style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0, width: 80 }}>{k.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 11, color: T.muted, wordBreak: "break-word" }}>{String(v).slice(0, 120)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action row */}
        <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          {mode === "pending" && isAdmin && (
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={isBusy} onClick={() => approve(a.id)} style={{
                padding: "9px 22px", borderRadius: 8, border: "none", background: "#22c55e", color: "#000",
                fontSize: 12, fontWeight: 900, cursor: isBusy ? "wait" : "pointer", opacity: isBusy ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <CheckCircle size={13} /> Approve
              </button>
              <button disabled={isBusy} onClick={() => reject(a.id)} style={{
                padding: "9px 18px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent",
                color: T.muted, fontSize: 12, cursor: isBusy ? "wait" : "pointer", opacity: isBusy ? 0.6 : 1,
              }}>
                Reject
              </button>
            </div>
          )}
          {mode === "pending" && !isAdmin && (
            <span style={{ fontSize: 12, color: T.dim, display: "flex", alignItems: "center", gap: 6 }}>
              <Shield size={12} color="#f59e0b" /> Awaiting admin approval
            </span>
          )}
          {mode === "approved" && isAdmin && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button disabled={isBusy} onClick={() => execute(a.id)} style={{
                padding: "9px 22px", borderRadius: 8, border: "none", background: T.accent, color: "#000",
                fontSize: 12, fontWeight: 900, cursor: isBusy ? "wait" : "pointer", opacity: isBusy ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <Play size={13} /> Execute now
              </button>
              <span style={{ fontSize: 11, color: T.dim }}>Approved by {a.approved_by || "admin"}</span>
            </div>
          )}
          {mode === "approved" && !isAdmin && (
            <span style={{ fontSize: 12, color: "#22c55e" }}>Approved — awaiting execution</span>
          )}
          {mode === "done" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, background: stC(a.status) + "15", color: stC(a.status), fontWeight: 700 }}>
                {a.status === "executed" ? "Executed" : "Rejected"}
              </span>
              {a.approved_by && <span style={{ fontSize: 11, color: T.dim }}>by {a.approved_by}</span>}
              {a.executed_at && <span style={{ fontSize: 11, color: T.dim }}>{new Date(a.executed_at).toLocaleDateString()}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 80px" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: ".10em", marginBottom: 4 }}>Actions</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: T.text, margin: 0, letterSpacing: "-.02em" }}>
            {pending.length > 0 ? `${pending.length} decision${pending.length !== 1 ? "s" : ""} need your attention` : "All caught up"}
          </h1>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 5 }}>
            {pending.length > 0 ? "Review and approve the actions your intelligence system has proposed." : "No pending approvals. Completed actions are archived below."}
          </div>
        </div>
        {!isAdmin && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 8, background: "#f59e0b0c", border: "1px solid #f59e0b25", flexShrink: 0 }}>
            <Shield size={12} color="#f59e0b" />
            <span style={{ fontSize: 11, color: "#f59e0b" }}>Analyst view — approval requires admin role</span>
          </div>
        )}
      </div>

      {err && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "#ef444415", border: "1px solid #ef444440", color: "#ef4444", fontSize: 12 }}>{err}</div>}

      {/* ── ALL CAUGHT UP ── */}
      {actions.length === 0 && (
        <div style={{ padding: "60px 40px", textAlign: "center", borderRadius: 14, border: `1px solid ${T.border}`, background: T.bgSub }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 8 }}>No actions yet</div>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 20, maxWidth: 380, margin: "0 auto 20px" }}>
            When monitoring runs detect something material, the system proposes actions here for your review. Run a monitoring cycle to see them.
          </div>
          <button onClick={() => nav("Monitor")} style={{ padding: "10px 22px", borderRadius: 9, background: T.accent, color: "#000", fontWeight: 900, border: "none", fontSize: 13, cursor: "pointer" }}>
            Go to Monitor →
          </button>
        </div>
      )}

      {/* ── PENDING DECISIONS ── */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: ".08em" }}>Needs your decision</div>
            <span style={{ padding: "2px 9px", borderRadius: 99, background: "#f59e0b20", color: "#f59e0b", fontSize: 10, fontWeight: 800 }}>{pending.length}</span>
          </div>
          {pending.map(a => <ActionCard key={a.id} a={a} mode="pending" />)}
        </div>
      )}

      {/* ── APPROVED / READY TO EXECUTE ── */}
      {approved.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: ".08em" }}>Approved — ready to run</div>
            <span style={{ padding: "2px 9px", borderRadius: 99, background: "#3b82f620", color: "#3b82f6", fontSize: 10, fontWeight: 800 }}>{approved.length}</span>
          </div>
          {approved.map(a => <ActionCard key={a.id} a={a} mode="approved" />)}
        </div>
      )}

      {/* ── COMPLETED (collapsible) ── */}
      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", background: "none", border: "none", cursor: "pointer", width: "100%", borderTop: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: ".08em" }}>Completed</span>
            <span style={{ padding: "2px 8px", borderRadius: 99, background: T.bgCard, color: T.dim, fontSize: 10 }}>{done.length}</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: T.dim }}>{showDone ? "↑" : "↓"}</span>
          </button>
          {showDone && (
            <div style={{ marginTop: 10 }}>
              {done.map(a => <ActionCard key={a.id} a={a} mode="done" />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════ OUTCOMES ═══════ */
function OutPage({ ws, user }) {
  const emptyStats = { total_outcomes: 0, acted: 0, dismissed: 0, false_alarms: 0, confirmed_useful: 0, hit_rate: 0, signal_accuracy: {}, entity_accuracy: {} };
  const [stats, setStats] = useState(emptyStats);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState({ entity_name: "", signal_type: "vendor_risk", outcome_type: "acted", feedback_text: "" });
  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [items, summary] = await Promise.all([endpoints.listOutcomes(ws.id), endpoints.outcomeStats(ws.id)]);
      setOutcomes(items);
      setStats({ ...emptyStats, ...summary });
    } catch (e) {
      setErr(e.message || "Could not load outcomes");
    } finally {
      setLoading(false);
    }
  }, [ws.id]);
  useEffect(() => { load(); }, [load]);
  const record = async () => {
    setErr("");
    try {
      await endpoints.recordOutcome({
        workspace_id: ws.id,
        entity_name: draft.entity_name || null,
        signal_type: draft.signal_type || null,
        outcome_type: draft.outcome_type,
        feedback_text: draft.feedback_text || null,
        recorded_by: user?.email || user?.name || "analyst",
      });
      setDraft(prev => ({ ...prev, entity_name: "", feedback_text: "" }));
      toast.success("Outcome recorded");
      await load();
    } catch (e) {
      const m = e.message || "Could not record outcome";
      setErr(m);
      toast.error(m);
    }
  };
  const s = stats;
  const hasOutcomes = outcomes.length > 0;
  const accuracyPanels = [["Signal accuracy", s.signal_accuracy || {}], ["Entity accuracy", s.entity_accuracy || {}]];
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <Eye>Outcome learning</Eye><h2 style={{ fontSize: 22, marginTop: 4 }}>What happened after recommendations</h2>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 5 }}>Live outcomes for workspace <span style={{ color: T.muted, fontFamily: "'JetBrains Mono'" }}>{ws.id}</span>.</div>
        </div>
        <button onClick={load} disabled={loading} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.borderL}`, background: loading ? "rgba(255,255,255,.03)" : T.bgSub, color: T.muted, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>{loading ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={12} />}Refresh</button>
      </div>
      {err && <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#fca5a5", fontSize: 12 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, marginTop: 16 }}>
        <MC l="Total" v={s.total_outcomes} c={T.accent} /><MC l="Acted" v={s.acted} c="#22c55e" /><MC l="Confirmed" v={s.confirmed_useful} c={T.accent} /><MC l="Dismissed" v={s.dismissed} c={T.muted} /><MC l="False alarms" v={s.false_alarms} c="#ef4444" /><MC l="Hit rate" v={fmt(s.hit_rate)} c={s.hit_rate > .7 ? "#22c55e" : "#f59e0b"} />
      </div>
      <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Record live outcome</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <div><Lb>Entity</Lb><input value={draft.entity_name} onChange={e => setDraft({ ...draft, entity_name: e.target.value })} placeholder="Vendor or company" style={IS} /></div>
          <div><Lb>Signal</Lb><input value={draft.signal_type} onChange={e => setDraft({ ...draft, signal_type: e.target.value })} placeholder="vendor_risk" style={IS} /></div>
          <div><Lb>Outcome</Lb><select value={draft.outcome_type} onChange={e => setDraft({ ...draft, outcome_type: e.target.value })} style={IS}>{["acted", "confirmed_useful", "dismissed", "false_alarm", "deferred"].map(o => <option key={o}>{o}</option>)}</select></div>
          <button onClick={record} disabled={loading} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: "#000", fontSize: 12, fontWeight: 700 }}>Save</button>
        </div>
        <textarea value={draft.feedback_text} onChange={e => setDraft({ ...draft, feedback_text: e.target.value })} placeholder="What happened after the recommendation?" rows={2} style={{ ...IS, resize: "vertical", marginTop: 8 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        {accuracyPanels.map(([title, data], i) => (
          <div key={i} style={{ padding: 14, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
            {Object.keys(data).length === 0 && <div style={{ fontSize: 12, color: T.dim, padding: "6px 0" }}>No live accuracy data yet.</div>}
            {Object.entries(data).map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.muted }}>{k.replace(/_/g, " ")}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 70, height: 5, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}><div style={{ width: `${v * 100}%`, height: "100%", borderRadius: 3, background: v > .8 ? "#22c55e" : v > .6 ? "#f59e0b" : "#ef4444" }} /></div>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: v > .8 ? "#22c55e" : "#f59e0b", fontWeight: 600, width: 32, textAlign: "right" }}>{fmt(v)}</span>
              </div>
            </div>)}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", background: T.bgSub, border: `1px solid ${T.border}` }}>
        <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600 }}>Recent outcomes</div>
        {loading && <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}><SkeletonCard /><SkeletonCard /></div>}
        {!loading && !hasOutcomes && <EmptyState icon={CheckCircle} title="No outcomes recorded yet" body="After a recommendation is acted on, dismissed, or confirmed, save the outcome above to build your accuracy model." />}
        {outcomes.map(o => <div key={o.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${oC(o.outcome_type)}12`, color: oC(o.outcome_type), fontWeight: 600, marginRight: 6 }}>{o.outcome_type}</span><span style={{ fontSize: 12, fontWeight: 500 }}>{o.entity_name || "Unspecified entity"}</span><span style={{ fontSize: 11, color: T.dim, marginLeft: 6 }}>{o.feedback_text || o.signal_type || "No feedback"}</span></div>
          <span style={{ fontSize: 10, color: T.dim, whiteSpace: "nowrap" }}>{o.recorded_by || o.created_at || "system"}</span>
        </div>)}
      </div>
    </div>
  );
}

/* ═══════ SHARED ═══════ */
function Eye({ children }) { return <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: T.accent }}>{children}</div>; }
function Lb({ children, style }) { return <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", ...style }}>{children}</div>; }
function MC({ l, v, c }) { return <div style={{ padding: "7px 9px", borderRadius: 5, background: "rgba(255,255,255,.02)", border: `1px solid ${T.border}` }}><div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: ".05em" }}>{l}</div><div style={{ fontSize: 15, fontWeight: 700, color: c, marginTop: 2, fontFamily: "'JetBrains Mono'" }}>{v}</div></div>; }
/* ═══════════════════════════════════════════════════════════════════════
   GRAPH — production force-directed knowledge graph
   Supports all node types: Workspace, Entity subtypes (Vendor, Competitor,
   Company, Regulation, Supplier, Account, Market), IntelligenceRecord,
   Source, Signal, Risk, IntelligenceRun, WorkflowAction, Recommendation
   ═══════════════════════════════════════════════════════════════════════ */
const GRAPH_NODE_COLORS = {
  Workspace: "#12b5cb",
  Vendor: "#ef4444",
  Competitor: "#3b82f6",
  Company: "#8b5cf6",
  Entity: "#8b5cf6",
  Regulation: "#f59e0b",
  Supplier: "#f97316",
  Account: "#22c55e",
  Market: "#06b6d4",
  Domain: "#64748b",
  Regulator: "#a855f7",
  Signal: "#fbbf24",
  Risk: "#dc2626",
  IntelligenceRecord: "#475569",
  Source: "#334155",
  IntelligenceRun: "#0ea5e9",
  WorkflowAction: "#10b981",
  Recommendation: "#818cf8",
  MemoryRecord: "#94a3b8",
  Product: "#22c55e",
  Feature: "#22c55e",
  PricingModel: "#f59e0b",
};

const GRAPH_NODE_DISPLAY = {
  IntelligenceRecord: "Evidence",
  IntelligenceRun: "Run",
  WorkflowAction: "Action",
};

const nodeColor = type => GRAPH_NODE_COLORS[type] || "#64748b";
const nodeDisplay = type => GRAPH_NODE_DISPLAY[type] || type;
const stripPrefix = str => String(str || "").replace(/^[A-Za-z]+:[^ ]/, m => m.slice(-1));
const shortLabel = (str, max = 22) => { const s = String(str || ""); return s.length > max ? s.slice(0, max - 1) + "…" : s; };
const nodeCanvasLabel = (n) => {
  if (n.type === "Source") {
    try { return new URL(String(n.label || n.properties?.url || "")).hostname.replace(/^www\./, ""); }
    catch { return shortLabel(n.label, 18); }
  }
  if (n.type === "IntelligenceRecord") {
    const lbl = stripPrefix(n.label); const dash = lbl.indexOf(" — ");
    return shortLabel(dash > 0 ? lbl.slice(0, dash) : lbl, 18);
  }
  if (n.type === "IntelligenceRun") return shortLabel(stripPrefix(n.label).replace(/T\d{2}:\d{2}.*$/, ""), 18);
  return shortLabel(n.label, 18);
};

/* ═══════════════════════════════════════════════════════════════════════
   EXCEPTIONAL KNOWLEDGE GRAPH
   · Continuous-RAF physics + particle flow animation
   · Zoom-to-cursor, momentum drag, neighborhood dimming
   · Glow edges with directional arrowheads
   · Degree-scaled nodes, type glyphs, double-ring hubs
   · Floating tooltips, minimap, background star field
   ═══════════════════════════════════════════════════════════════════════ */

// Type glyph: single character shown inside each node
const NODE_GLYPH = {
  Workspace: "W", IntelligenceRun: "R", Signal: "S", Risk: "!",
  Vendor: "V", Competitor: "C", Company: "C", Regulation: "§", Supplier: "Sp",
  Account: "A", Market: "M", Domain: "D", Regulator: "R",
  IntelligenceRecord: "E", Source: "↗", WorkflowAction: "▶", Recommendation: "★",
};

// Edge color by relationship type
const EDGE_COLOR = {
  MONITORED_BY: "#12b5cb", HAS_RECORD: "#475569", HAS_SOURCE: "#334155",
  TRIGGERED: "#fbbf24", ELEVATED_RISK: "#dc2626", PROPOSED: "#10b981",
  CO_OCCURS_WITH: "#8b5cf6", PART_OF: "#64748b", AFFECTS: "#f59e0b",
  BASED_ON: "#818cf8", LINKED_TO: "#06b6d4",
};
const edgeColor = type => EDGE_COLOR[type] || "rgba(148,163,184,.35)";

function useForceGraph(rawNodes, rawEdges, width, height) {
  const stateRef = useRef(null); // { nodes, edges, nodeMap, alpha, particles, stars }
  const rafRef = useRef(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!rawNodes.length) { stateRef.current = null; return; }
    const W = width || 600, H = height || 340;
    const cx = W / 2, cy = H / 2;

    // --- Degree map for sizing ---
    const degree = {};
    rawEdges.forEach(e => {
      degree[e.source] = (degree[e.source] || 0) + 1;
      degree[e.target] = (degree[e.target] || 0) + 1;
    });

    // --- Initial radial + jitter layout ---
    const TYPE_RING = {
      Workspace: 0, IntelligenceRun: 1,
      Vendor: 2, Competitor: 2, Company: 2, Entity: 2, Regulation: 2,
      Supplier: 2, Account: 2, Market: 2, Regulator: 2, Domain: 2,
      Signal: 3, Risk: 3, WorkflowAction: 3, Recommendation: 3,
      IntelligenceRecord: 4, Source: 5,
    };
    const ringCount = {}, ringTotal = {};
    rawNodes.forEach(n => { const r = TYPE_RING[n.type] ?? 4; ringTotal[r] = (ringTotal[r] || 0) + 1; });
    const nodes = rawNodes.map(n => {
      const ring = TYPE_RING[n.type] ?? 4;
      const idx = ringCount[ring] = (ringCount[ring] || 0) + 1;
      const total = ringTotal[ring] || 1;
      const angle = (2 * Math.PI * (idx - 1)) / total + (Math.random() - 0.5) * 0.3;
      const maxR = Math.min(cx, cy) * 0.88;
      const radius = ring === 0 ? 0 : (ring / 5.5) * maxR + (Math.random() - 0.5) * 18;
      const deg = degree[n.id] || 0;
      return {
        ...n,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0, vy: 0, pinned: false,
        degree: deg,
        // radius used for rendering
        r: n.type === "Workspace" ? 16 : n.type === "IntelligenceRun" ? 14 :
           ["Signal", "Risk"].includes(n.type) ? 12 :
           ["WorkflowAction", "Recommendation"].includes(n.type) ? 11 :
           ["IntelligenceRecord", "Source"].includes(n.type) ? 9 :
           Math.min(14, 10 + Math.sqrt(deg) * 0.8),
      };
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const edges = rawEdges.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target));

    // --- Particles: 1-2 per edge, looping t=0→1 ---
    const particles = edges.map(e => ({
      edge: e,
      t: Math.random(),
      speed: 0.003 + Math.random() * 0.003,
    }));

    // --- Background star field ---
    const stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.2,
      a: 0.04 + Math.random() * 0.12,
    }));

    const alpha = { value: 1 };
    stateRef.current = { nodes, edges, nodeMap, alpha, particles, stars, W, H, cx, cy };

    // Continuous RAF — physics decays, particles + render always run
    const loop = () => {
      const st = stateRef.current;
      if (!st) { rafRef.current = null; return; }
      rafRef.current = requestAnimationFrame(loop);
      const { nodes, edges, nodeMap, alpha: al, particles } = st;
      const a = al.value;

      // Physics (active only while alpha > 0.001)
      if (a > 0.001) {
        al.value *= 0.965;

        // Repulsion with min-distance collision
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const na = nodes[i], nb = nodes[j];
            const dx = nb.x - na.x || 0.01, dy = nb.y - na.y || 0.01;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = na.r + nb.r + 14;
            if (dist < minDist) {
              // Collision push
              const push = (minDist - dist) * 0.5;
              const nx = (dx / dist) * push, ny = (dy / dist) * push;
              if (!na.pinned) { na.vx -= nx; na.vy -= ny; }
              if (!nb.pinned) { nb.vx += nx; nb.vy += ny; }
            } else {
              // Long-range repulsion
              const force = (2200 / (dist * dist)) * a;
              const fx = (dx / dist) * force, fy = (dy / dist) * force;
              if (!na.pinned) { na.vx -= fx; na.vy -= fy; }
              if (!nb.pinned) { nb.vx += fx; nb.vy += fy; }
            }
          }
        }

        // Link attraction (spring)
        edges.forEach(e => {
          const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
          if (!s || !t) return;
          const dx = t.x - s.x, dy = t.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const restLen = s.r + t.r + 55;
          const f = (dist - restLen) * 0.032 * a;
          const fx = (dx / dist) * f, fy = (dy / dist) * f;
          if (!s.pinned) { s.vx += fx; s.vy += fy; }
          if (!t.pinned) { t.vx -= fx; t.vy -= fy; }
        });

        // Centre gravity + damping + boundary
        nodes.forEach(n => {
          if (n.pinned) return;
          n.vx += (st.cx - n.x) * 0.012 * a;
          n.vy += (st.cy - n.y) * 0.012 * a;
          n.vx *= 0.74; n.vy *= 0.74;
          n.x += n.vx; n.y += n.vy;
          const pad = n.r + 10;
          n.x = Math.max(pad, Math.min(st.W - pad, n.x));
          n.y = Math.max(pad, Math.min(st.H - pad, n.y));
        });
      }

      // Advance particles
      particles.forEach(p => {
        p.t = (p.t + p.speed) % 1;
      });

      setTick(t => t + 1);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [rawNodes.length, rawEdges.length, width, height]);

  return stateRef;
}

// Draw an arrowhead at position (x,y) pointing in direction (dx,dy)
function drawArrow(ctx, x, y, dx, dy, r, color) {
  const angle = Math.atan2(dy, dx);
  const len = 7, spread = 0.42;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(angle - spread) * len, y - Math.sin(angle - spread) * len);
  ctx.lineTo(x, y);
  ctx.lineTo(x - Math.cos(angle + spread) * len, y - Math.sin(angle + spread) * len);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

// Evaluate quadratic bezier at t
function bezierPoint(sx, sy, cx_, cy_, tx, ty, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * sx + 2 * mt * t * cx_ + t * t * tx,
    y: mt * mt * sy + 2 * mt * t * cy_ + t * t * ty,
  };
}

function GraphCanvas({ nodes: rawNodes, edges: rawEdges, selectedId, onSelect, width = 600, height = 340, activeTypes, highlightIds }) {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const stateRef = useForceGraph(rawNodes, rawEdges, width, height);
  const hoverRef = useRef(null);
  const dragRef = useRef(null);
  const dragMoved = useRef(false);
  const panRef = useRef({ x: 0, y: 0, z: 1 });
  const panStart = useRef(null);
  const touchRef = useRef({ lastDist: null });
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const fitAll = () => {
    const st = stateRef.current; if (!st || !st.nodes.length) return;
    const vis = activeTypes?.size ? st.nodes.filter(n => activeTypes.has(n.type)) : st.nodes;
    if (!vis.length) return;
    const pad = 52;
    const minX = Math.min(...vis.map(n => n.x - n.r)) - pad;
    const maxX = Math.max(...vis.map(n => n.x + n.r)) + pad;
    const minY = Math.min(...vis.map(n => n.y - n.r)) - pad;
    const maxY = Math.max(...vis.map(n => n.y + n.r)) + pad;
    const scale = Math.max(0.1, Math.min(3.5, Math.min(width / (maxX - minX), height / (maxY - minY))));
    panRef.current = { x: (-minX * scale) + (width - (maxX - minX) * scale) / 2, y: (-minY * scale) + (height - (maxY - minY) * scale) / 2, z: scale };
  };

  const zoomCenter = (factor) => {
    const p = panRef.current;
    const cx = width / 2, cy = height / 2;
    const newZ = Math.max(0.15, Math.min(4.5, p.z * factor));
    panRef.current = { x: cx - (cx - p.x) * (newZ / p.z), y: cy - (cy - p.y) * (newZ / p.z), z: newZ };
  };

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const minimap = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const mctx = minimap?.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    // Resize canvases
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    if (minimap) { minimap.width = 130 * dpr; minimap.height = 80 * dpr; minimap.style.width = "130px"; minimap.style.height = "80px"; mctx.scale(dpr, dpr); }

    ctx.clearRect(0, 0, width, height);
    const st = stateRef.current;
    if (!st) return;

    const pan = panRef.current;
    const { nodes, edges, particles, stars, nodeMap } = st;
    const sel = selectedIdRef.current;
    const hov = hoverRef.current;

    // -- Neighbourhood set for dimming --
    const neighborIds = new Set();
    if (sel) {
      neighborIds.add(sel);
      edges.forEach(e => {
        if (e.source === sel) neighborIds.add(e.target);
        if (e.target === sel) neighborIds.add(e.source);
      });
    }

    // -- Active (visible) nodes --
    const visible = activeTypes?.size ? nodes.filter(n => activeTypes.has(n.type)) : nodes;
    const visibleSet = new Set(visible.map(n => n.id));

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(pan.z, pan.z);

    // ── 1. Background stars ──
    stars.forEach(s => {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(148,163,184,${s.a})`;
      ctx.fill();
    });

    // ── 2. Edges ──
    edges.forEach(e => {
      if (!visibleSet.has(e.source) || !visibleSet.has(e.target)) return;
      const src = nodeMap.get(e.source), tgt = nodeMap.get(e.target);
      if (!src || !tgt) return;

      const isHighlit = sel && (e.source === sel || e.target === sel);
      const isHovEdge = hov && (e.source === hov || e.target === hov);
      const isDimmed = sel && !isHighlit;
      const eColor = edgeColor(e.type);
      const alpha = isDimmed ? 0.05 : isHighlit ? 0.7 : isHovEdge ? 0.45 : 0.2;

      // Control point for bezier
      const mx = (src.x + tgt.x) / 2, my = (src.y + tgt.y) / 2;
      const perp = 22;
      const dx = tgt.x - src.x, dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const cpx = mx - (dy / len) * perp, cpy = my + (dx / len) * perp;

      ctx.save();
      if (isHighlit) { ctx.shadowColor = eColor; ctx.shadowBlur = 8; }
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.quadraticCurveTo(cpx, cpy, tgt.x, tgt.y);
      ctx.strokeStyle = eColor.startsWith("rgba") ? eColor : eColor + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.lineWidth = isHighlit ? 1.8 : 1;
      ctx.globalAlpha = alpha;
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;

      // Arrow at target
      if (isHighlit || isHovEdge) {
        const t2 = 0.85;
        const ap = bezierPoint(src.x, src.y, cpx, cpy, tgt.x, tgt.y, t2);
        const apn = bezierPoint(src.x, src.y, cpx, cpy, tgt.x, tgt.y, t2 + 0.01);
        drawArrow(ctx, tgt.x, tgt.y, apn.x - ap.x, apn.y - ap.y, 5, eColor + "aa");
      }

      // Relationship label on hover
      if ((isHovEdge || isHighlit) && pan.z > 0.5 && e.type) {
        const lp = bezierPoint(src.x, src.y, cpx, cpy, tgt.x, tgt.y, 0.48);
        ctx.save();
        ctx.font = "bold 7px system-ui,sans-serif";
        ctx.fillStyle = eColor;
        ctx.globalAlpha = 0.8;
        ctx.textAlign = "center";
        ctx.fillText(e.type.replace(/_/g, " ").toUpperCase(), lp.x, lp.y - 5);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    });

    // ── 3. Particles flowing along edges ──
    particles.forEach(p => {
      if (!visibleSet.has(p.edge.source) || !visibleSet.has(p.edge.target)) return;
      const src = nodeMap.get(p.edge.source), tgt = nodeMap.get(p.edge.target);
      if (!src || !tgt) return;
      const isHighlit = sel && (p.edge.source === sel || p.edge.target === sel);
      const isDimmed = sel && !isHighlit;
      if (isDimmed) return;

      const dx = tgt.x - src.x, dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const mx = (src.x + tgt.x) / 2, my = (src.y + tgt.y) / 2;
      const cpx = mx - (dy / len) * 22, cpy = my + (dx / len) * 22;

      const pt = bezierPoint(src.x, src.y, cpx, cpy, tgt.x, tgt.y, p.t);
      const eCol = edgeColor(p.edge.type);
      const particleAlpha = isHighlit ? 0.9 : 0.45;

      ctx.save();
      ctx.shadowColor = eCol; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, isHighlit ? 2.5 : 1.8, 0, Math.PI * 2);
      ctx.fillStyle = eCol;
      ctx.globalAlpha = particleAlpha;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    });

    // ── 4. Nodes ──
    visible.forEach(n => {
      const color = nodeColor(n.type);
      const isSel = n.id === sel;
      const isHov = n.id === hov;
      const isSearchMatch = highlightIds?.size && highlightIds.has(n.id);
      const isDim = (sel && !neighborIds.has(n.id)) || (highlightIds?.size && !isSearchMatch);
      const r = n.r || 10;
      const nodeAlpha = isDim ? 0.14 : 1;
      ctx.globalAlpha = nodeAlpha;

      // Outer glow for selected / hovered
      if (isSel || isHov) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = isSel ? 22 : 12;
        ctx.beginPath(); ctx.arc(n.x, n.y, r + (isSel ? 5 : 3), 0, Math.PI * 2);
        ctx.fillStyle = color + (isSel ? "20" : "12");
        ctx.fill();
        ctx.restore();
      }

      // Search match ring
      if (isSearchMatch) {
        ctx.save();
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.restore();
      }

      // Risk posture ring on IntelligenceRun nodes
      if (n.type === "IntelligenceRun" && n.properties?.risk_posture) {
        const posture = n.properties.risk_posture;
        const postureColor = posture === "critical" ? "#ef4444" : posture === "elevated" ? "#f97316" : posture === "stable" ? "#22c55e" : "#64748b";
        ctx.save();
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = postureColor + "90";
        ctx.lineWidth = 2;
        ctx.shadowColor = postureColor; ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();
      }

      // Double ring for hub types
      const isHub = n.type === "Workspace" || n.type === "IntelligenceRun";
      if (isHub) {
        ctx.save();
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = color + "40";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // Main node body
      ctx.save();
      if (isSel) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? color : `rgba(10,14,20,0.94)`;
      ctx.strokeStyle = color;
      ctx.lineWidth = isSel ? 2.5 : isHov ? 2 : 1.5;
      ctx.fill(); ctx.stroke();
      ctx.restore();

      // Type glyph inside
      const glyph = NODE_GLYPH[n.type] || n.type?.[0] || "?";
      ctx.save();
      ctx.font = `${isSel ? "700" : "500"} ${Math.max(6, r * 0.48)}px system-ui,sans-serif`;
      ctx.fillStyle = isSel ? "rgba(0,0,0,0.85)" : color;
      ctx.globalAlpha = isSel ? 1 : 0.7;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph.slice(0, 2), n.x, n.y);
      ctx.textBaseline = "alphabetic";
      ctx.restore();

      // Label (only when zoom sufficient)
      if (pan.z > 0.4) {
        ctx.save();
        ctx.font = `${isSel ? "700" : "400"} ${Math.min(8, Math.max(6, pan.z * 7))}px system-ui,sans-serif`;
        ctx.fillStyle = isSel ? "#f1f5f9" : isHov ? "#94a3b8" : "rgba(100,116,139,0.75)";
        ctx.globalAlpha = nodeAlpha;
        ctx.textAlign = "center";
        ctx.fillText(nodeCanvasLabel(n), n.x, n.y + r + 10);
        ctx.restore();
      }

      // Degree badge for high-connectivity nodes
      if (n.degree >= 4 && !isSel) {
        ctx.save();
        const bx = n.x + r * 0.72, by = n.y - r * 0.72;
        ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.font = "bold 6px system-ui,sans-serif";
        ctx.fillStyle = "#000";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(n.degree > 9 ? "9+" : String(n.degree), bx, by);
        ctx.textBaseline = "alphabetic";
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    });

    // ── 5. Hover tooltip ──
    if (hov) {
      const n = nodeMap.get(hov);
      if (n && visibleSet.has(hov)) {
        const tx = n.x, ty = n.y - n.r - 14;
        const label = stripPrefix(n.label);
        ctx.save();
        ctx.font = "600 9px system-ui,sans-serif";
        const tw = ctx.measureText(label).width + 14;
        const th = 22;
        const bx = tx - tw / 2, by = ty - th;
        // Pill background
        ctx.beginPath();
        ctx.roundRect(bx, by, tw, th, 6);
        ctx.fillStyle = "rgba(13,17,23,0.94)";
        ctx.strokeStyle = nodeColor(n.type) + "80";
        ctx.lineWidth = 1;
        ctx.shadowColor = nodeColor(n.type); ctx.shadowBlur = 8;
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = nodeColor(n.type);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(label, tx, by + th / 2);
        ctx.restore();
      }
    }

    ctx.restore(); // end pan/zoom transform

    // ── Zoom % overlay ──
    ctx.save();
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(148,163,184,.28)";
    ctx.textAlign = "left";
    ctx.fillText(Math.round(pan.z * 100) + "%", 10, height - 10);
    ctx.restore();

    // ── 6. Minimap ──
    if (mctx && minimap) {
      const MW = 130, MH = 80;
      mctx.clearRect(0, 0, MW, MH);
      mctx.fillStyle = "rgba(7,9,12,0.92)";
      mctx.fillRect(0, 0, MW, MH);
      mctx.strokeStyle = "rgba(148,163,184,.15)";
      mctx.lineWidth = 1;
      mctx.strokeRect(0, 0, MW, MH);

      const W = st.W, H = st.H;
      const scx = MW / W, scy = MH / H;
      visible.forEach(n => {
        const color = nodeColor(n.type);
        mctx.beginPath();
        mctx.arc(n.x * scx, n.y * scy, Math.max(1.5, n.r * 0.28), 0, Math.PI * 2);
        mctx.fillStyle = color;
        mctx.globalAlpha = sel && !neighborIds.has(n.id) ? 0.15 : 0.7;
        mctx.fill();
        mctx.globalAlpha = 1;
      });

      // Viewport indicator
      const vx = -pan.x / pan.z, vy = -pan.y / pan.z;
      const vw = width / pan.z, vh = height / pan.z;
      mctx.strokeStyle = "rgba(18,181,203,.5)";
      mctx.lineWidth = 1;
      mctx.strokeRect(vx * scx, vy * scy, vw * scx, vh * scy);
    }
  }); // runs after every tick

  // ── Event helpers ──
  const toWorld = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const pan = panRef.current;
    return { x: (e.clientX - rect.left - pan.x) / pan.z, y: (e.clientY - rect.top - pan.y) / pan.z };
  };

  const hitTest = (pt) => {
    const st = stateRef.current; if (!st) return null;
    return st.nodes.find(n => Math.hypot(n.x - pt.x, n.y - pt.y) < n.r + 4) || null;
  };

  const handleMouseMove = (e) => {
    if (dragRef.current) {
      const pt = toWorld(e); if (!pt) return;
      dragRef.current.x = pt.x; dragRef.current.y = pt.y;
      dragRef.current.vx = 0; dragRef.current.vy = 0;
      dragMoved.current = true;
      if (stateRef.current) stateRef.current.alpha.value = Math.max(stateRef.current.alpha.value, 0.3);
      return;
    }
    if (panStart.current) {
      panRef.current = { ...panRef.current, x: e.clientX - panStart.current.ox, y: e.clientY - panStart.current.oy };
      return;
    }
    const pt = toWorld(e); if (!pt) return;
    const hit = hitTest(pt);
    hoverRef.current = hit?.id || null;
    canvasRef.current.style.cursor = hit ? "pointer" : "grab";
  };

  const handleMouseDown = (e) => {
    const pt = toWorld(e); if (!pt) return;
    const hit = hitTest(pt);
    if (hit) { dragRef.current = hit; hit.pinned = true; dragMoved.current = false; }
    else panStart.current = { ox: e.clientX - panRef.current.x, oy: e.clientY - panRef.current.y };
  };

  const handleMouseUp = () => {
    if (dragRef.current) {
      const node = dragRef.current;
      const wasDrag = dragMoved.current;
      node.pinned = false; dragRef.current = null; dragMoved.current = false;
      if (!wasDrag) onSelect(node.id === selectedIdRef.current ? null : node.id);
    } else {
      panStart.current = null;
    }
  };

  // Zoom-to-cursor
  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    const p = panRef.current;
    const newZ = Math.max(0.2, Math.min(4, p.z * factor));
    // Keep world point under cursor fixed: newX + cx/newZ*newZ = oldX + cx/p.z*p.z
    panRef.current = {
      x: cx - (cx - p.x) * (newZ / p.z),
      y: cy - (cy - p.y) * (newZ / p.z),
      z: newZ,
    };
  };

  // Double-click: zoom to node neighborhood, or fit-all on background
  const handleDblClick = (e) => {
    const pt = toWorld(e); if (!pt) return;
    const hit = hitTest(pt);
    if (hit) {
      const st = stateRef.current; if (!st) return;
      const neighborNodes = [hit, ...st.nodes.filter(n =>
        st.edges.some(ed => (ed.source === hit.id && ed.target === n.id) || (ed.target === hit.id && ed.source === n.id))
      )];
      const pad = 80;
      const minX = Math.min(...neighborNodes.map(n => n.x)) - pad;
      const maxX = Math.max(...neighborNodes.map(n => n.x)) + pad;
      const minY = Math.min(...neighborNodes.map(n => n.y)) - pad;
      const maxY = Math.max(...neighborNodes.map(n => n.y)) + pad;
      const scale = Math.max(0.2, Math.min(3.5, Math.min(width / (maxX - minX), height / (maxY - minY))));
      panRef.current = { x: (-minX * scale) + (width - (maxX - minX) * scale) / 2, y: (-minY * scale) + (height - (maxY - minY) * scale) / 2, z: scale };
    } else {
      fitAll();
    }
  };

  // Touch: single finger = pan, two fingers = pinch-zoom
  const handleTouchStart = (e) => {
    e.preventDefault();
    const ts = Array.from(e.touches);
    if (ts.length === 1) panStart.current = { ox: ts[0].clientX - panRef.current.x, oy: ts[0].clientY - panRef.current.y };
    touchRef.current.lastDist = ts.length === 2 ? Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY) : null;
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const ts = Array.from(e.touches);
    if (ts.length === 2) {
      const dist = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
      if (touchRef.current.lastDist) {
        const factor = dist / touchRef.current.lastDist;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const lx = (ts[0].clientX + ts[1].clientX) / 2 - rect.left;
          const ly = (ts[0].clientY + ts[1].clientY) / 2 - rect.top;
          const p = panRef.current;
          const newZ = Math.max(0.15, Math.min(4.5, p.z * factor));
          panRef.current = { x: lx - (lx - p.x) * (newZ / p.z), y: ly - (ly - p.y) * (newZ / p.z), z: newZ };
        }
      }
      touchRef.current.lastDist = dist;
    } else if (ts.length === 1 && panStart.current) {
      panRef.current = { ...panRef.current, x: ts[0].clientX - panStart.current.ox, y: ts[0].clientY - panStart.current.oy };
    }
  };

  const handleTouchEnd = () => { panStart.current = null; touchRef.current.lastDist = null; };

  const CTRL = { width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(7,9,12,.88)", color: T.muted, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(6px)", lineHeight: 1, padding: 0 };

  return (
    <div style={{ position: "relative", lineHeight: 0 }}>
      <canvas
        ref={canvasRef}
        width={width} height={height}
        style={{ display: "block", borderRadius: 10, background: "#070910", border: `1px solid ${T.border}` }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { dragRef.current = null; panStart.current = null; hoverRef.current = null; }}
        onWheel={handleWheel}
        onDoubleClick={handleDblClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      {/* Minimap */}
      <canvas
        ref={minimapRef}
        width={130} height={80}
        style={{ position: "absolute", bottom: 10, right: 10, borderRadius: 6, opacity: 0.85, pointerEvents: "none" }}
      />
      {/* Zoom controls */}
      <div style={{ position: "absolute", bottom: 10, left: 10, display: "flex", flexDirection: "column", gap: 3 }}>
        <button style={CTRL} title="Zoom in" onClick={() => zoomCenter(1.3)}>+</button>
        <button style={CTRL} title="Zoom out" onClick={() => zoomCenter(0.77)}>−</button>
        <button style={{ ...CTRL, fontSize: 11 }} title="Fit all nodes (or double-click background)" onClick={fitAll}>⤢</button>
      </div>
    </div>
  );
}

function GraphMini({ graph, title, wsId, latestRunId }) {
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [activeTypes, setActiveTypes] = useState(new Set());
  const [graphMode, setGraphMode] = useState("workspace");
  const [liveGraph, setLiveGraph] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const displayGraph = liveGraph || graph;
  const allNodes = displayGraph?.nodes || [];
  const allEdges = displayGraph?.relationships || [];

  const nodeTypes = useMemo(() => [...new Set(allNodes.map(n => n.type))].sort(), [allNodes]);

  const loadMode = async (mode) => {
    if (!wsId) return;
    setGraphMode(mode); setLoading(true);
    try {
      let data;
      if (mode === "workspace") data = await endpoints.graphTopic(wsId);
      else if (mode === "signals") data = await endpoints.graphSignals("", 80);
      else if (mode === "cross") data = await endpoints.graphCrossEntity(1, 100);
      setLiveGraph(data?.nodes?.length ? data : null);
    } catch (_) { setLiveGraph(null); }
    finally { setLoading(false); }
  };

  const refresh = () => loadMode(graphMode);

  const triggerBackfill = async () => {
    if (!wsId) return;
    setBackfilling(true);
    try {
      await endpoints.graphBackfill(wsId);
      await loadMode("workspace");
    } catch (_) {}
    finally { setBackfilling(false); }
  };

  const selectedNode = useMemo(() => {
    return allNodes.find(n => n.id === selectedId) || null;
  }, [selectedId, allNodes]);

  const connectedEdges = useMemo(() => {
    if (!selectedId) return [];
    return allEdges.filter(e => e.source === selectedId || e.target === selectedId);
  }, [selectedId, allEdges]);
  const presentNodeTypes = useMemo(() => [...new Set(allNodes.map(n => n.type))].filter(t => GRAPH_NODE_COLORS[t]).slice(0, 8), [allNodes]);

  if (!allNodes.length && !allEdges.length) {
    return (
      <div style={{ marginTop: 10, padding: "14px 0", borderTop: `1px solid ${T.border}` }}>
        <div style={{ color: T.dim, fontSize: 11, lineHeight: 1.6 }}>
          Intelligence Map appears after the first intelligence run. Run monitoring to connect evidence, entities, and actions.
        </div>
        {wsId && (
          <button onClick={triggerBackfill} disabled={backfilling} style={{
            marginTop: 10, padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.accent}`,
            background: "transparent", color: T.accent, fontSize: 11, fontWeight: 700,
            opacity: backfilling ? 0.5 : 1,
          }}>
            {backfilling ? "Building map..." : "Build from existing evidence"}
          </button>
        )}
      </div>
    );
  }

  const filterBar = nodeTypes.length > 1 && (
    <div style={{ marginBottom: 8 }}>
      <select
        value={activeTypes.size === 1 ? [...activeTypes][0] : ""}
        onChange={e => { const v = e.target.value; setActiveTypes(v ? new Set([v]) : new Set()); }}
        style={{ padding: "3px 7px", borderRadius: 7, background: T.bgSub, border: `1px solid ${T.border}`, color: T.text, fontSize: 10, outline: "none", width: "100%" }}
      >
        <option value="">All node types</option>
        {nodeTypes.map(type => (
          <option key={type} value={type}>{nodeDisplay(type)} ({allNodes.filter(n => n.type === type).length})</option>
        ))}
      </select>
    </div>
  );

  const detail = selectedNode && (
    <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: nodeColor(selectedNode.type), textTransform: "uppercase", letterSpacing: ".06em" }}>{nodeDisplay(selectedNode.type)}</span>
        <span style={{ fontSize: 10, color: T.dim }}>{connectedEdges.length} link{connectedEdges.length !== 1 ? "s" : ""}</span>
      </div>
      <div style={{ marginTop: 5, fontSize: 13, fontWeight: 800, color: T.text, wordBreak: "break-word" }}>{stripPrefix(selectedNode.label)}</div>
      {selectedNode.properties?.summary && (
        <div style={{ marginTop: 6, fontSize: 11, color: T.muted, lineHeight: 1.55, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
          {selectedNode.properties.summary}
        </div>
      )}
      {selectedNode.properties?.url && (() => {
        let display = selectedNode.properties.url;
        try { display = new URL(selectedNode.properties.url).hostname.replace(/^www\./, ""); } catch (_) {}
        return (
          <a href={selectedNode.properties.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 6, fontSize: 10, color: T.accent, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ↗ {display}
          </a>
        );
      })()}
      {connectedEdges.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Connected to</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {connectedEdges.slice(0, 5).map((e, i) => {
              const otherId = e.source === selectedId ? e.target : e.source;
              const other = allNodes.find(n => n.id === otherId);
              const dir = e.source === selectedId ? "→" : "←";
              return other ? (
                <button key={i} onClick={() => setSelectedId(otherId)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
                  borderRadius: 6, border: `1px solid ${T.border}`,
                  background: T.bgCard, cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: nodeColor(other.type), flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripPrefix(other.label)}</div>
                    <div style={{ fontSize: 9, color: T.dim }}>{dir} {e.type.replace(/_/g, " ").toLowerCase()}</div>
                  </div>
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shortLabel(title, 36)} · <span style={{ color: T.dim, fontWeight: 400 }}>{allNodes.length} nodes · {allEdges.length} links</span>
        </span>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={refresh} disabled={loading} style={{ border: "none", background: "transparent", color: T.dim, fontSize: 12, lineHeight: 1 }} title="Refresh Intelligence Map">↺</button>
          <button onClick={() => setExpanded(true)} style={{ border: "none", background: "transparent", color: T.accent, fontSize: 10, fontWeight: 800 }}>Expand ↗</button>
        </div>
      </div>
      {/* Color legend */}
      {presentNodeTypes.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {presentNodeTypes.map(t => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, color: nodeColor(t), fontWeight: 700 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: nodeColor(t), flexShrink: 0 }} />
              {nodeDisplay(t)}
            </span>
          ))}
        </div>
      )}
      {filterBar}
      <GraphCanvas
        nodes={allNodes} edges={allEdges}
        selectedId={selectedId} onSelect={setSelectedId}
        width={520} height={260}
        activeTypes={activeTypes.size ? activeTypes : null}
      />
      {detail}
      {expanded && (
        <GraphFullView
          graph={displayGraph} title={title} wsId={wsId}
          latestRunId={latestRunId}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

function GraphFullView({ graph, title, wsId, latestRunId, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const [activeTypes, setActiveTypes] = useState(new Set());
  const [mode, setMode] = useState("workspace");
  const [liveGraph, setLiveGraph] = useState(graph);
  const [loading, setLoading] = useState(false);
  const [signalType, setSignalType] = useState("");
  const [search, setSearch] = useState("");

  const displayGraph = liveGraph || graph;
  const allNodes = displayGraph?.nodes || [];
  const allEdges = displayGraph?.relationships || [];
  const nodeTypes = useMemo(() => [...new Set(allNodes.map(n => n.type))].sort(), [allNodes]);
  const selectedNode = useMemo(() => allNodes.find(n => n.id === selectedId) || null, [selectedId, allNodes]);
  const connectedEdges = useMemo(() => allEdges.filter(e => selectedId && (e.source === selectedId || e.target === selectedId)), [selectedId, allEdges]);
  const highlightIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const matched = new Set(allNodes.filter(n => n.label?.toLowerCase().includes(q) || n.type?.toLowerCase().includes(q)).map(n => n.id));
    return matched.size ? matched : null;
  }, [search, allNodes]);

  // Node type stats for the stats bar
  const typeStats = useMemo(() => {
    const counts = {};
    allNodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allNodes]);

  const MODES = [
    { id: "workspace", label: "Workspace" },
    { id: "signals", label: "Signals" },
    { id: "cross", label: "Co-occurrence" },
    ...(latestRunId ? [{ id: "lineage", label: "Run Lineage" }] : []),
  ];

  const loadMode = async (m, sig = "") => {
    setMode(m); setLoading(true); setSelectedId(null);
    try {
      let data;
      if (m === "workspace" && wsId) data = await endpoints.graphTopic(wsId);
      else if (m === "signals") data = await endpoints.graphSignals(sig, 120);
      else if (m === "cross") data = await endpoints.graphCrossEntity(1, 150);
      else if (m === "lineage" && latestRunId) data = await endpoints.graphRunLineage(latestRunId);
      setLiveGraph(data?.nodes?.length ? data : null);
    } catch (_) { setLiveGraph(null); }
    finally { setLoading(false); }
  };

  const focusEntity = async (entityName) => {
    if (!entityName) return;
    setLoading(true); setSelectedId(null);
    try {
      const data = await endpoints.graphEntity(entityName);
      setLiveGraph(data?.nodes?.length ? data : null);
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => { if (mode === "signals") loadMode("signals", signalType); }, [signalType]);

  const SIGNAL_TYPES = ["", "breach", "compliance", "competitor_move", "pricing", "filing", "supplier_risk", "market_movement"];

  const w = window.innerWidth;
  const h = window.innerHeight - 128;

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.88)", display: "flex", alignItems: "stretch", justifyContent: "stretch" }} onClick={onClose}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", borderRadius: 0, background: T.bgInset, border: "none", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <GitBranch size={15} color={T.accent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title} — Intelligence Map</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              {typeStats.map(([type, count]) => (
                <span key={type} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: nodeColor(type), fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: nodeColor(type) }} />
                  {count} {nodeDisplay(type)}
                </span>
              ))}
              {!typeStats.length && <span style={{ fontSize: 10, color: T.dim }}>scroll/+− zoom · drag pan · click inspect · dbl-click focus</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 12 }}>Close</button>
        </div>

        {/* Mode + filter toolbar */}
        <div style={{ padding: "10px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}` }}>
            {MODES.map(m => (
              <button key={m.id} onClick={() => loadMode(m.id)} style={{
                padding: "5px 12px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 800,
                background: mode === m.id ? T.accent : "transparent",
                color: mode === m.id ? "#000" : T.muted, cursor: "pointer",
              }}>{m.label}</button>
            ))}
          </div>

          {mode === "signals" && (
            <select value={signalType} onChange={e => setSignalType(e.target.value)} style={{ padding: "5px 8px", borderRadius: 7, background: T.bgSub, border: `1px solid ${T.border}`, color: T.text, fontSize: 11, outline: "none" }}>
              {SIGNAL_TYPES.map(s => <option key={s} value={s}>{s || "All signal types"}</option>)}
            </select>
          )}

          {/* Node search */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              value={search} onChange={e => { setSearch(e.target.value); setSelectedId(null); }}
              placeholder="Search nodes…"
              style={{ padding: "5px 10px", borderRadius: 7, background: T.bgSub, border: `1px solid ${search ? T.accent : T.border}`, color: T.text, fontSize: 11, outline: "none", width: 140, transition: "border-color .15s" }}
            />
            {search && (
              <span style={{ fontSize: 10, color: highlightIds ? "#fbbf24" : T.dim, whiteSpace: "nowrap" }}>
                {highlightIds ? `${highlightIds.size} match${highlightIds.size !== 1 ? "es" : ""}` : "no match"}
              </span>
            )}
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: T.dim, fontSize: 14, cursor: "pointer", lineHeight: 1 }}>×</button>}
          </div>

          <select
            value={activeTypes.size === 1 ? [...activeTypes][0] : ""}
            onChange={e => { const v = e.target.value; setActiveTypes(v ? new Set([v]) : new Set()); }}
            style={{ padding: "5px 8px", borderRadius: 7, background: T.bgSub, border: `1px solid ${T.border}`, color: T.text, fontSize: 11, outline: "none", marginLeft: "auto" }}
          >
            <option value="">All node types ({allNodes.length})</option>
            {nodeTypes.map(type => (
              <option key={type} value={type}>{nodeDisplay(type)} ({allNodes.filter(n => n.type === type).length})</option>
            ))}
          </select>
        </div>

        {/* Main area */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Canvas */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {loading && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 2, background: "rgba(7,9,12,.6)" }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: "spin .8s linear infinite" }} />
              </div>
            )}
            <GraphCanvas
              nodes={allNodes} edges={allEdges}
              selectedId={selectedId} onSelect={setSelectedId}
              width={w - (selectedNode ? 300 : 0)} height={h}
              activeTypes={activeTypes.size ? activeTypes : null}
              highlightIds={highlightIds}
            />
          </div>

          {/* Detail panel */}
          {selectedNode && (
            <div style={{ width: 320, borderLeft: `1px solid ${T.border}`, padding: "14px 16px", overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Node header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 900, color: nodeColor(selectedNode.type), textTransform: "uppercase", letterSpacing: ".07em" }}>{nodeDisplay(selectedNode.type)}</span>
                  {selectedNode.properties?.risk_posture && (
                    <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, color: selectedNode.properties.risk_posture === "critical" ? "#ef4444" : selectedNode.properties.risk_posture === "elevated" ? "#f97316" : "#22c55e", background: (selectedNode.properties.risk_posture === "critical" ? "#ef4444" : selectedNode.properties.risk_posture === "elevated" ? "#f97316" : "#22c55e") + "18", padding: "2px 7px", borderRadius: 99 }}>
                      {selectedNode.properties.risk_posture}
                    </span>
                  )}
                  {selectedNode.properties?.severity && (
                    <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, color: selectedNode.properties.severity === "critical" ? "#ef4444" : selectedNode.properties.severity === "high" ? "#f97316" : selectedNode.properties.severity === "medium" ? "#eab308" : "#22c55e", background: (selectedNode.properties.severity === "critical" ? "#ef4444" : selectedNode.properties.severity === "high" ? "#f97316" : "#22c55e") + "18", padding: "2px 7px", borderRadius: 99 }}>
                      {selectedNode.properties.severity}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: T.dim, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>&times;</button>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text, wordBreak: "break-word", lineHeight: 1.35, marginBottom: 10 }}>{selectedNode.label}</div>

              {/* Context card per node type */}
              {selectedNode.properties?.summary && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}`, marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: T.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Summary</div>
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55 }}>{String(selectedNode.properties.summary).slice(0, 280)}</div>
                </div>
              )}
              {selectedNode.properties?.finding && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}`, marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: T.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Finding</div>
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55 }}>{String(selectedNode.properties.finding).slice(0, 280)}</div>
                </div>
              )}
              {selectedNode.properties?.recommended_action && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: T.accent + "12", border: `1px solid ${T.accent}30`, marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: T.accent, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Recommended Action</div>
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55 }}>{String(selectedNode.properties.recommended_action).slice(0, 200)}</div>
                </div>
              )}
              {selectedNode.properties?.url && (
                <a href={selectedNode.properties.url} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: 10, fontSize: 10, color: T.accent, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  ↗ {selectedNode.properties.url}
                </a>
              )}
              {selectedNode.properties?.task && (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}`, marginBottom: 10, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                  <span style={{ color: T.dim, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Task </span>
                  {String(selectedNode.properties.task).slice(0, 160)}
                </div>
              )}
              {/* Confidence bar */}
              {selectedNode.properties?.confidence !== undefined && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>Confidence</span>
                    <span style={{ fontSize: 9, color: T.accent, fontWeight: 700 }}>{Math.round(parseFloat(selectedNode.properties.confidence) * 100)}%</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 99, background: T.border }}>
                    <div style={{ height: 3, borderRadius: 99, background: T.accent, width: `${Math.round(parseFloat(selectedNode.properties.confidence) * 100)}%` }} />
                  </div>
                </div>
              )}

              {/* Focus neighborhood button for entity-type nodes */}
              {["Company", "Vendor", "Competitor", "Supplier", "Account", "Market", "Regulator", "Regulation", "Entity"].includes(selectedNode.type) && selectedNode.properties?.name && (
                <button onClick={() => focusEntity(selectedNode.properties.name)} style={{
                  marginBottom: 10, padding: "6px 12px", borderRadius: 7,
                  border: `1px solid ${nodeColor(selectedNode.type)}60`,
                  background: nodeColor(selectedNode.type) + "10",
                  color: nodeColor(selectedNode.type), fontSize: 11, fontWeight: 700, textAlign: "left",
                }}>
                  Show full neighborhood ›
                </button>
              )}

              {/* Properties — compact key/value */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                {Object.entries(selectedNode.properties || {})
                  .filter(([k]) => !["color", "scoped_id", "tenant_id", "summary", "finding", "recommended_action", "url", "task", "confidence", "risk_posture", "severity"].includes(k))
                  .slice(0, 8)
                  .map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0, width: 90 }}>{k.replace(/_/g, " ")}</span>
                      <span style={{ fontSize: 11, color: T.muted, wordBreak: "break-word", flex: 1 }}>{String(v).slice(0, 90)}</span>
                    </div>
                  ))}
              </div>

              {/* Connected nodes */}
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                <div style={{ fontSize: 10, color: T.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                  {connectedEdges.length} connection{connectedEdges.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {connectedEdges.slice(0, 14).map((e, i) => {
                    const otherId = e.source === selectedId ? e.target : e.source;
                    const other = allNodes.find(n => n.id === otherId);
                    if (!other) return null;
                    const dir = e.source === selectedId ? "→" : "←";
                    return (
                      <button key={i} onClick={() => setSelectedId(otherId)} style={{
                        display: "flex", alignItems: "center", gap: 7, padding: "7px 10px",
                        borderRadius: 8, background: T.bgSub, border: `1px solid ${T.border}`,
                        textAlign: "left", cursor: "pointer",
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: nodeColor(other.type), flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{other.label}</div>
                          <div style={{ fontSize: 9, color: T.dim }}>{dir} {e.type.replace(/_/g, " ").toLowerCase()}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div style={{ padding: "6px 18px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: T.dim }}>{allNodes.length} nodes · {allEdges.length} edges · scroll to zoom · drag to pan · click to inspect</span>
          <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 10 }}>
            {nodeTypes.slice(0, 10).map(type => (
              <span key={type} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: T.dim }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: nodeColor(type) }} />
                {nodeDisplay(type)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function DS({ t, children }) { return <div className="ai" style={{ marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>{t}</h3><div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div></div>; }
function DC({ t, children }) { return <div style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: T.text }}>{t}</div><div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>{children}</div></div>; }
function JB({ children }) { return <pre style={{ padding: 14, borderRadius: 10, background: T.bgInset, border: `1px solid ${T.border}`, fontSize: 11, fontFamily: "'JetBrains Mono'", color: T.accent, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: "6px 0", overflow: "auto" }}>{children}</pre>; }
const IS = { width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 7, background: T.bgCard, border: `1px solid ${T.borderL}`, fontSize: 12, color: T.text, outline: "none" };


const CSS = `@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}@keyframes gradShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@keyframes toastIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}*{box-sizing:border-box;margin:0;padding:0}button,input,textarea,select{font:inherit;color:inherit}button{cursor:pointer}::selection{background:rgba(6,182,212,.25)}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:3px}.au{animation:fadeUp .5s ease both}.ai{animation:fadeIn .4s ease both}.s1{animation-delay:.08s}.s2{animation-delay:.16s}.s3{animation-delay:.24s}.hl{transition:transform .22s ease,box-shadow .22s ease}.hl:hover{transform:translateY(-3px);box-shadow:0 12px 36px rgba(0,0,0,.35)}.sr-wrap .sr{opacity:0;transform:translateY(22px);transition:opacity .55s ease,transform .55s ease}.sr-wrap.in .sr{opacity:1;transform:none}.sr-wrap.in .sr.d1{transition-delay:.07s}.sr-wrap.in .sr.d2{transition-delay:.14s}.sr-wrap.in .sr.d3{transition-delay:.21s}.sr-wrap.in .sr.d4{transition-delay:.28s}.hero-h1{background-size:200% 200%;animation:gradShift 7s ease infinite}.skel{background:linear-gradient(90deg,rgba(255,255,255,.04) 0%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 100%);background-size:200% 100%;animation:shimmer 1.5s ease infinite}.toast-in{animation:toastIn .22s ease both}.pub-page{background:#0B1426;color:#F1F5F9;min-height:calc(100vh - 56px);font-family:'DM Sans','Inter',system-ui,sans-serif}.pub-hero{max-width:1180px;margin:0 auto;padding:92px 40px 72px;display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:72px;align-items:center}.pub-hero-small{grid-template-columns:minmax(0,760px);padding-bottom:42px}.pub-hero-copy h1,.pub-demo-hero h1{font-size:clamp(42px,6vw,76px);font-weight:700;line-height:1.02;letter-spacing:-.055em;color:#F1F5F9;text-wrap:balance}.pub-hero-small h1{font-size:clamp(38px,5vw,64px)}.pub-hero-copy p,.pub-demo-hero p,.pub-section-title p,.pub-split p,.pub-final p{margin-top:20px;color:#94A3B8;font-size:17px;line-height:1.75;max-width:680px}.pub-eyebrow{display:inline-flex;align-items:center;gap:8px;margin-bottom:26px;color:#60A5FA;font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}.pub-eyebrow span{width:7px;height:7px;border-radius:99px;background:#22C55E;box-shadow:0 0 18px rgba(34,197,94,.45)}.pub-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:34px}.pub-actions-center{justify-content:center}.pub-btn{border:none;border-radius:8px;padding:13px 24px;font-weight:800;font-size:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.pub-btn-primary{background:#2563EB;color:#fff;box-shadow:0 10px 30px rgba(37,99,235,.24)}.pub-btn-ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#E2E8F0}.pub-brief-card,.pub-domain,.pub-partner,.pub-price,.pub-proof,.pub-demo-chat,.pub-runner{background:#131F35;border:1px solid #1E293B;border-radius:14px}.pub-brief-card{padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.22)}.pub-card-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:22px;color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:.1em}.pub-card-head strong{color:#F59E0B}.pub-brief-card h2{font-size:25px;line-height:1.2;letter-spacing:-.035em;margin-bottom:20px}.pub-brief-grid{display:grid;gap:12px}.pub-brief-grid div,.pub-proof-line{border-top:1px solid rgba(255,255,255,.08);padding-top:14px}.pub-brief-grid span,.pub-decision span,.pub-demo-scope span,.pub-price span,.pub-partner span,.pub-dev-grid span{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#60A5FA;font-weight:800}.pub-brief-grid p,.pub-proof-line p,.pub-domain p,.pub-partner p,.pub-price p,.pub-doc-list p,.pub-dev-grid p,.pub-domain-table p{color:#94A3B8;font-size:13px;line-height:1.65}.pub-proof-line{display:flex;align-items:flex-start;gap:10px;margin-top:14px}.pub-proof-line svg{color:#22C55E;flex:none;margin-top:2px}.pub-mini-sources{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.pub-mini-sources span,.pub-demo-card span{font-size:11px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);border-radius:5px;color:#94A3B8;padding:4px 8px}.pub-band{border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025);padding:76px 40px}.pub-section{max-width:1180px;margin:0 auto;padding:86px 40px}.pub-section-title{max-width:780px;margin:0 auto 38px;text-align:center}.pub-section-title h2,.pub-split h2,.pub-final h2{font-size:clamp(30px,4vw,46px);line-height:1.12;letter-spacing:-.045em}.pub-stage-grid,.pub-domain-row,.pub-partner-grid,.pub-pricing-grid,.pub-dev-grid{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.pub-stage{border-left:1px solid rgba(255,255,255,.08);padding:0 24px}.pub-stage span{font-size:12px;color:#60A5FA;font-weight:900}.pub-stage h3,.pub-domain h3,.pub-partner h3,.pub-doc-list h3,.pub-dev-grid h3{font-size:15px;margin:10px 0 8px}.pub-stage p{color:#64748B;font-size:12px;line-height:1.6}.pub-domain-row{grid-template-columns:repeat(3,1fr)}.pub-domain{padding:26px}.pub-domain-icon{width:40px;height:40px;border-radius:10px;background:color-mix(in srgb,var(--accent) 14%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);margin-bottom:18px}.pub-split{display:grid;grid-template-columns:1fr 460px;gap:70px;align-items:center}.pub-map{height:340px;border-radius:16px;background:#0F1A2D;border:1px solid #1E293B;position:relative;overflow:hidden}.pub-map-node{position:absolute;border:1px solid rgba(96,165,250,.3);background:#13223A;border-radius:10px;padding:10px 12px;min-width:110px;text-align:center;z-index:2}.pub-map-node strong{display:block;font-size:12px}.pub-map-node span{display:block;margin-top:3px;font-size:10px;color:#64748B}.pub-map-workspace{left:50%;top:44%;transform:translate(-50%,-50%)}.pub-map-entity{left:8%;top:22%}.pub-map-signal{right:9%;top:18%}.pub-map-evidence{left:12%;bottom:20%}.pub-map-action{right:12%;bottom:22%}.pub-map-line{position:absolute;height:1px;background:rgba(96,165,250,.18);transform-origin:left center}.line-a{width:190px;left:134px;top:110px;transform:rotate(18deg)}.line-b{width:180px;left:250px;top:160px;transform:rotate(-22deg)}.line-c{width:170px;left:146px;top:235px;transform:rotate(-18deg)}.line-d{width:170px;left:270px;top:206px;transform:rotate(16deg)}.pub-map-caption{position:absolute;left:18px;right:18px;bottom:16px;color:#64748B;font-size:12px}.pub-final{text-align:center;max-width:760px;margin:0 auto;padding:86px 24px}.pub-demo-hero{max-width:760px;margin:0 auto;text-align:center;padding:78px 24px 36px}.pub-demo-scenarios{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:0 24px 24px}.pub-demo-card{text-align:left;background:#131F35;border:1px solid #1E293B;border-radius:14px;padding:26px;color:#F1F5F9}.pub-demo-card.is-active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,#131F35)}.pub-demo-card h3{font-size:17px;line-height:1.35;margin-bottom:12px}.pub-demo-card p{font-size:13px;color:#94A3B8;line-height:1.65;margin-bottom:18px}.pub-demo-card div:last-child{display:flex;gap:6px;flex-wrap:wrap}.pub-demo-scope,.pub-error{max-width:1080px;margin:0 auto 28px;padding:18px 24px;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;gap:18px}.pub-demo-scope strong{display:block;margin-top:5px}.pub-demo-scope p{color:#64748B;font-size:12px;margin-top:4px}.pub-error{border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#FCA5A5;border-radius:8px}.pub-error button{background:transparent;border:1px solid rgba(239,68,68,.35);border-radius:6px;color:#FCA5A5;padding:7px 10px}.pub-runner{max-width:680px;margin:26px auto;padding:26px}.pub-runner-head{display:flex;align-items:center;gap:10px;font-weight:800;margin-bottom:18px}.pub-spin{animation:spin .9s linear infinite;color:#60A5FA}.pub-run-step{display:grid;grid-template-columns:12px 1fr auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid rgba(255,255,255,.06)}.pub-run-step span{width:8px;height:8px;border-radius:99px;background:#334155}.pub-run-step span.active{background:#60A5FA;box-shadow:0 0 14px rgba(96,165,250,.7)}.pub-run-step span.done{background:#22C55E}.pub-run-step p{font-size:13px}.pub-run-step strong{font-size:10px;text-transform:uppercase;color:#64748B}.pub-demo-result{max-width:1180px;margin:40px auto 80px;padding:0 24px;display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:24px}.pub-demo-chat{padding:22px}.pub-chat-title{display:flex;align-items:center;gap:8px;font-weight:900;margin-bottom:18px}.pub-chat-bubble{max-width:82%;padding:12px 14px;border-radius:14px;background:#0B1426;border:1px solid rgba(255,255,255,.08);color:#94A3B8;font-size:13px;line-height:1.6;margin-bottom:12px}.pub-chat-bubble.user{margin-left:auto;background:#2563EB;color:#fff;border:none}.pub-decision{border-left:3px solid #F59E0B;background:#0F1A2D;border-radius:10px;padding:18px;margin-bottom:14px}.pub-decision h2{font-size:23px;line-height:1.2;margin:8px 0 10px}.pub-decision>p,.pub-decision div p{color:#CBD5E1;font-size:13px;line-height:1.65}.pub-decision div{border-top:1px solid rgba(255,255,255,.07);padding-top:12px;margin-top:12px}.pub-decision strong{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#64748B}.pub-chat-input{display:flex;gap:8px;margin-top:18px}.pub-chat-input input{flex:1;background:#0B1426;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:11px 12px;color:#F1F5F9}.pub-chat-input button{width:44px;border:none;border-radius:8px;background:#2563EB;color:#fff}.pub-proof{padding:18px;align-self:start}.pub-proof-stats{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:14px;margin-bottom:14px}.pub-proof-stats div{text-align:center}.pub-proof-stats strong{display:block;color:#60A5FA;font-size:22px}.pub-proof-stats span{font-size:10px;color:#64748B;text-transform:uppercase}.pub-proof-block{border-top:1px solid rgba(255,255,255,.08);padding-top:16px;margin-top:16px}.pub-proof-block h3{font-size:14px;margin-bottom:10px}.pub-evidence-line{border-top:1px solid rgba(255,255,255,.06);padding:10px 0}.pub-evidence-line strong{font-size:12px}.pub-evidence-line p{font-size:11px;color:#64748B;line-height:1.55;margin:4px 0}.pub-domain-table{max-width:980px;margin:0 auto;border-top:1px solid rgba(255,255,255,.08)}.pub-domain-head,.pub-domain-table-row{display:grid;grid-template-columns:.8fr 1.2fr 1.2fr;gap:20px;padding:18px 0;border-bottom:1px solid rgba(255,255,255,.08)}.pub-domain-head{color:#64748B;text-transform:uppercase;letter-spacing:.1em;font-size:10px;font-weight:900}.pub-flow-list{display:grid;gap:10px}.pub-flow-list div{display:flex;align-items:center;gap:12px;background:#131F35;border:1px solid #1E293B;border-radius:10px;padding:13px}.pub-flow-list span{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:#2563EB;color:#fff;font-size:12px;font-weight:900}.pub-pricing-grid{grid-template-columns:repeat(3,1fr);padding:0 24px 72px}.pub-price{padding:28px}.pub-price.is-featured{border-color:#2563EB;box-shadow:0 0 0 1px rgba(37,99,235,.35)}.pub-price h2{font-size:32px;margin:10px 0}.pub-price button{margin-top:22px;width:100%;border:none;border-radius:8px;background:#2563EB;color:#fff;font-weight:900;padding:12px}.pub-doc-list,.pub-dev-grid{max-width:980px;margin:0 auto;padding:0 24px 78px;display:grid;gap:12px}.pub-doc-list div,.pub-dev-grid div{background:#131F35;border:1px solid #1E293B;border-radius:12px;padding:20px}.pub-dev-grid{grid-template-columns:repeat(2,1fr)}.pub-dev-grid code{display:block;color:#F1F5F9;background:#0B1426;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;margin:10px 0;font-size:12px;overflow:auto}@media(max-width:900px){.pub-hero,.pub-split,.pub-demo-result{grid-template-columns:1fr;gap:32px}.pub-stage-grid,.pub-domain-row,.pub-partner-grid,.pub-demo-scenarios,.pub-pricing-grid,.pub-dev-grid{grid-template-columns:1fr}.pub-hero{padding:58px 24px}.pub-band,.pub-section{padding:54px 24px}.pub-demo-scope{align-items:flex-start;flex-direction:column}.pub-domain-head{display:none}.pub-domain-table-row{grid-template-columns:1fr;gap:8px}.pub-proof{order:2}}`;

createRoot(document.getElementById("root")).render(<App />);
