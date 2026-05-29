import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Shield, Globe, TrendingUp, Layers, Mic, Brain, Zap, ArrowRight,
  CheckCircle, RefreshCw, Send, LogOut, User, Mail, KeyRound,
  ThumbsUp, ThumbsDown, BarChart3, Target, Briefcase, Play,
  AlertTriangle, Database, Search, Clock, Eye as EyeIcon, ChevronRight,
  GitBranch
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════════════════ */
const T = {
  bg: "#080a0d", bgSub: "#101419", bgCard: "#151a21", bgInset: "#07090c",
  border: "rgba(190,200,210,0.08)", borderL: "rgba(190,200,210,0.14)",
  text: "#eef2f6", muted: "#a7b0bb", dim: "#6f7a86",
  accent: "#12b5cb", glow: "rgba(18,181,203,0.14)",
};
const matC = m => m === "critical" ? "#dc2626" : m === "high" ? "#ef4444" : m === "medium" ? "#f59e0b" : m === "low" ? "#22c55e" : "#64748b";
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
const API = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000" : "");
const KEY = import.meta.env.VITE_API_KEY || "dev-local-key-change-me";
const headers = () => ({ "Content-Type": "application/json", "X-API-Key": KEY });
async function api(method, path, body, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { method, headers: headers(), signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${path} timed out. The live backend did not respond fast enough.`);
    if (error instanceof TypeError) throw new Error(`${path} failed to fetch. Check the API connection and deployment proxy.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const endpoints = {
  health: () => api("GET", "/health"),
  listPacks: () => api("GET", "/workspaces/packages"),
  createWorkspace: data => api("POST", "/workspaces", data),
  research: data => api("POST", "/agent/research", data, 70000),
  listRuns: (topicId, limit = 50) => api("GET", `/runs?topic_id=${encodeURIComponent(topicId)}&limit=${limit}`),
  getRun: runId => api("GET", `/runs/${encodeURIComponent(runId)}`),
  listRecords: () => api("GET", "/intelligence/records"),
  listTopicRecords: topicId => api("GET", `/intelligence/records?topic_id=${encodeURIComponent(topicId)}`),
  createTopic: data => api("POST", "/intelligence/topics", data),
  discoverSources: (topicId, limit = 6) => api("POST", `/intelligence/topics/${encodeURIComponent(topicId)}/discover?limit=${limit}`, null, 45000),
  refreshTopic: (topicId, maxSources = 4) => api("POST", `/intelligence/topics/${encodeURIComponent(topicId)}/refresh?max_sources=${maxSources}`, null, 70000),
  retrieveContext: data => api("POST", "/intelligence/retrieval/context", data),
  gatewayFetch: data => api("POST", "/gateway/fetch", data),
  graphStatus: () => api("GET", "/graph/status"),
  graphTopic: topicId => api("GET", `/graph/topics/${encodeURIComponent(topicId)}`),
  graphBackfill: topicId => api("POST", `/graph/topics/${encodeURIComponent(topicId)}/backfill`),
  graphEntity: entity => api("GET", `/graph/entities/${encodeURIComponent(entity)}`),
  monitorSummary: workspaceId => api("GET", `/monitor/${encodeURIComponent(workspaceId)}`),
  runMonitor: workspaceId => api("POST", `/monitor/${encodeURIComponent(workspaceId)}/run`, null, 70000),
  listChat: (workspaceId, limit = 80) => api("GET", `/chat/${encodeURIComponent(workspaceId)}?limit=${limit}`),
  createChat: (workspaceId, data) => api("POST", `/chat/${encodeURIComponent(workspaceId)}`, data),
  clearChat: workspaceId => api("DELETE", `/chat/${encodeURIComponent(workspaceId)}`),
  listActions: (wsId, status) => api("GET", `/actions/${wsId}${status ? `?status=${status}` : ""}`),
  approveAction: (id, data) => api("POST", `/actions/${id}/approve`, data),
  executeAction: id => api("POST", `/actions/${id}/execute`),
  recordOutcome: data => api("POST", "/outcomes", data),
  listOutcomes: wsId => api("GET", `/outcomes/${wsId}`),
  outcomeStats: wsId => api("GET", `/outcomes/${wsId}/stats`),
  transcribeAudio: async (blob, language = "en") => {
    const form = new FormData();
    form.append("audio", blob, `recording-${Date.now()}.webm`);
    form.append("language", language);
    const res = await fetch(`${API}/transcriptions/upload`, {
      method: "POST",
      headers: { "X-API-Key": KEY },
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
const PUB = ["Home", "Solution", "Pricing", "Docs", "Developer"];
const PRIV = ["Monitor", "Analyst", "Evidence", "Actions", "Outcomes", "Settings"];

export default function App() {
  const [page, setPage] = useState("Home");
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
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
  useEffect(() => {
    if (packId !== effectivePackId) setPackId(effectivePackId);
  }, [packId, effectivePackId]);
  useEffect(() => {
    endpoints.health().then(status => setBackendOk(status)).catch(() => setBackendOk(false));
  }, []);
  useEffect(() => {
    if (!user || !["Analyst", "Actions", "Outcomes", "Monitor"].includes(page)) return;
    endpoints.listActions(ws.id).then(items => { if (items.length) setActions(items); }).catch(() => {});
  }, [user, page, ws.id]);
  const saveWorkspace = async () => {
    const payload = {
      id: ws.id || slug(ws.name),
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
    const result = await endpoints.research({
      task,
      conversation_context: options.conversation_context || null,
      workspace_id: ws.id,
      topic_id: ws.id,
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
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans','Manrope',system-ui,sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{CSS}</style>
      <Nav page={page} setPage={nav} user={user} onAuth={() => setShowAuth(true)} onOut={() => { setUser(null); setPage("Home"); }} backendOk={backendOk} />
      {page === "Home" && <HomePage nav={nav} user={user} auth={() => setShowAuth(true)} />}
      {page === "Solution" && <SolutionManualPage nav={nav} />}
      {page === "Pricing" && <PricingPage nav={nav} tierId={tierId} setTierId={setTierId} selDomains={selDomains} toggleDomain={toggleDomain} tier={tier} user={user} auth={() => setShowAuth(true)} />}
      {page === "Docs" && <DocsManualPage />}
      {page === "Developer" && <DevPage />}
      {page === "Monitor" && user && <MonitorPage ws={ws} nav={nav} saveWorkspace={saveWorkspace} report={report} setReport={setReport} setActions={setActions} backendOk={backendOk} />}
      {page === "Workspace" && user && <WsPage tierId={tierId} setTierId={setTierId} selDomains={selDomains} toggleDomain={toggleDomain} tier={tier} activeDomains={activeDomains} pack={pack} packId={packId} setPackId={setPackId} ws={ws} setWs={setWs} nav={nav} saveWorkspace={saveWorkspace} report={report} actions={actions} backendOk={backendOk} />}
      {page === "Settings" && user && <WsPage tierId={tierId} setTierId={setTierId} selDomains={selDomains} toggleDomain={toggleDomain} tier={tier} activeDomains={activeDomains} pack={pack} packId={packId} setPackId={setPackId} ws={ws} setWs={setWs} nav={nav} saveWorkspace={saveWorkspace} report={report} actions={actions} backendOk={backendOk} />}
      {page === "Analyst" && user && <AgentWorkbenchPage pack={pack} ws={ws} actions={actions} setActions={setActions} runResearch={runResearch} report={report} backendOk={backendOk} />}
      {page === "Agent" && user && <AgentWorkbenchPage pack={pack} ws={ws} actions={actions} setActions={setActions} runResearch={runResearch} report={report} backendOk={backendOk} />}
      {page === "Evidence" && user && <IntelPage ws={ws} />}
      {page === "Intelligence" && user && <IntelPage ws={ws} />}
      {page === "Gateway" && user && <GwPage />}
      {page === "Actions" && user && <ActPage actions={actions} setActions={setActions} />}
      {page === "Outcomes" && user && <OutPage ws={ws} user={user} />}
      {showAuth && <Auth onClose={() => setShowAuth(false)} onAuth={u => { setUser(u); setShowAuth(false); setPage("Monitor"); }} />}
    </div>
  );
}

/* ═══════ AUTH ═══════ */
function Auth({ onClose, onAuth }) {
  const [email, setEmail] = useState("analyst@company.com"); const [name, setName] = useState("Analyst");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.6)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center" }}>
      <div onClick={e => e.stopPropagation()} className="au" style={{ width: 400, maxWidth: "92vw", padding: "32px 28px", borderRadius: 22, background: T.bgCard, border: `1px solid ${T.border}`, position: "relative", boxShadow: "0 40px 80px rgba(0,0,0,.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, margin: "0 auto 12px", background: `linear-gradient(135deg,${T.accent},#0891b2)`, display: "grid", placeItems: "center" }}><Layers size={18} color="#fff" /></div>
          <h2 style={{ fontSize: 20 }}>Sign in to WebDataOS</h2>
          <p style={{ color: T.dim, fontSize: 13, marginTop: 6 }}>Access your intelligence workspaces</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FI icon={<User size={14} />} ph="Name" v={name} set={setName} />
          <FI icon={<Mail size={14} />} ph="Email" v={email} set={setEmail} type="email" />
          <button onClick={() => onAuth({ name: name || "Analyst", initials: (name || "A")[0].toUpperCase(), email: email || "analyst@company.com" })} style={{ padding: "12px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${T.accent},#0891b2)`, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", width: "100%" }}>Sign in</button>
        </div>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: T.dim, fontSize: 20, cursor: "pointer" }}>&times;</button>
      </div>
    </div>
  );
}
function FI({ icon, ph, v, set, type = "text" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderRadius: 10, background: T.bgSub, border: `1px solid ${T.borderL}` }}>
      <span style={{ color: T.dim, flexShrink: 0 }}>{icon}</span>
      <input type={type} placeholder={ph} value={v} onChange={e => set(e.target.value)} style={{ flex: 1, border: "none", background: "transparent", outline: "none", padding: "10px 0", fontSize: 13, color: T.text }} />
    </div>
  );
}

/* ═══════ NAV ═══════ */
function Nav({ page, setPage, user, onAuth, onOut, backendOk }) {
  const navItems = user ? PRIV : PUB;
  const brandTarget = user ? "Monitor" : "Home";
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${T.border}`, background: "rgba(8,10,13,.86)", backdropFilter: "blur(20px)", padding: "0 20px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <button onClick={() => setPage(brandTarget)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: T.text }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${T.accent},#0891b2)`, display: "grid", placeItems: "center" }}><Layers size={15} color="#fff" /></div>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.02em" }}>WebDataOS</span>
      </button>
      <nav style={{ display: "flex", gap: 20, alignItems: "center" }}>
        {navItems.map(n => {
          const active = page === n;
          return <button key={n} onClick={() => setPage(n)} style={{ border: "none", borderBottom: active ? `2px solid ${T.accent}` : "2px solid transparent", padding: "4px 0 6px", fontSize: 12, fontWeight: active ? 800 : 600, background: "transparent", color: active ? T.text : T.dim, cursor: "pointer" }}>{n}</button>;
        })}
      </nav>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {user ? <><div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px 5px 6px", borderRadius: 999, background: "rgba(255,255,255,.04)", border: `1px solid ${T.border}` }}><div style={{ width: 24, height: 24, borderRadius: 999, background: `linear-gradient(135deg,${T.accent},#0891b2)`, display: "grid", placeItems: "center", color: "#000", fontSize: 10, fontWeight: 700 }}>{user.initials}</div><span style={{ fontSize: 12, color: T.muted }}>{user.name}</span></div><button onClick={onOut} style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${T.border}`, background: "transparent", color: T.dim, fontSize: 12, cursor: "pointer" }}><LogOut size={12} /></button></> : <><button onClick={onAuth} style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${T.borderL}`, background: "transparent", fontSize: 12, color: T.muted, cursor: "pointer" }}>Sign in</button><button onClick={onAuth} style={{ padding: "7px 14px", borderRadius: 999, border: "none", background: `linear-gradient(135deg,${T.accent},#0891b2)`, color: "#000", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Get started</button></>}
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HOME — hero + packages + capabilities
   ═══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   HOME (Public) — product overview, no tier selection
   ═══════════════════════════════════════════════════════════════════════ */
function HomePage({ nav, user, auth }) {
  const go = user ? () => nav("Monitor") : auth;
  const label = user ? "Go to monitor" : "Get started free";
  return (
    <div>
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px 50px", textAlign: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle,${T.glow},transparent 70%)`, pointerEvents: "none" }} />
        <div className="au" style={{ display: "inline-flex", gap: 6, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
          {["Bright Data", "Speechmatics", "Cognee", "TriggerWare", "OpenAI + AIMLAPI"].map(p => <span key={p} style={{ padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 500, border: `1px solid rgba(6,182,212,.2)`, color: T.accent, background: `rgba(6,182,212,.06)` }}>{p}</span>)}
        </div>
        <h1 className="au s1" style={{ fontSize: "clamp(36px,5vw,64px)", fontWeight: 700, letterSpacing: "-.04em", lineHeight: .95, background: "linear-gradient(180deg,#f1f5f9 30%,#64748b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", maxWidth: 840, margin: "0 auto" }}>Live web intelligence for enterprise decisions</h1>
        <p className="au s2" style={{ maxWidth: 680, margin: "20px auto 0", fontSize: 16, lineHeight: 1.7, color: T.muted }}>WebDataOS monitors vendors, competitors, markets, regulations, and public signals, then turns what changed into source-backed evidence, business reasoning, and approval-ready actions.</p>
        <div className="au s3" style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28 }}>
          <button onClick={go} style={{ padding: "12px 24px", borderRadius: 999, border: "none", background: `linear-gradient(135deg,${T.accent},#0891b2)`, color: "#000", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, boxShadow: `0 8px 24px ${T.glow}`, cursor: "pointer" }}>{label} <ArrowRight size={15} /></button>
          <button onClick={() => nav("Solution")} style={{ padding: "12px 24px", borderRadius: 999, border: `1px solid ${T.borderL}`, background: "rgba(255,255,255,.03)", color: T.muted, fontSize: 14, cursor: "pointer" }}>How it works</button>
        </div>
        <div className="au s3" style={{ display: "flex", justifyContent: "center", gap: 0, margin: "34px auto 0", maxWidth: 900, textAlign: "left", flexWrap: "wrap" }}>
          {[
            ["Monitor", "Watch external signals."],
            ["Collect", "Save web evidence."],
            ["Reason", "Assess business impact."],
            ["Act", "Create next steps."],
            ["Prove", "Show receipts."],
          ].map(([title, text], i) => (
            <div key={title} style={{ width: 160, padding: "0 16px", borderLeft: i ? `1px solid ${T.border}` : "none" }}>
              <div style={{ color: T.text, fontSize: 12, fontWeight: 800 }}>{title}</div>
              <div style={{ marginTop: 4, color: T.dim, fontSize: 11, lineHeight: 1.35 }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section style={{ borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: "rgba(255,255,255,.02)", padding: "28px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 20, textAlign: "center" }}>
          {[{ n: "5", l: "Core workflows" }, { n: "3", l: "Signal domains" }, { n: "6", l: "Runtime services" }, { n: "25+", l: "API endpoints" }, { n: "1", l: "Run receipt" }].map((s, i) => (
            <div key={i} className="au" style={{ animationDelay: `${i * .06}s` }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.accent, fontFamily: "'JetBrains Mono'" }}>{s.n}</div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 900, margin: "24px auto 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, textAlign: "left", paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
          {[
            ["For enterprises", "Continuously track external risk, market, vendor, and regulatory changes. Get evidence, business impact, recommended actions, and outcome tracking."],
            ["For developers", "Use the API/runtime when agents need live web retrieval, memory, graph context, LLM fallback, workflow events, and auditable receipts."],
          ].map(([title, text], i) => (
            <div key={title} style={{ paddingLeft: i ? 28 : 0, borderLeft: i ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
              <div style={{ marginTop: 6, color: T.muted, fontSize: 12, lineHeight: 1.6 }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Runtime partners */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px" }}>
        <Eye>Runtime architecture</Eye>
        <h2 style={{ fontSize: 26, marginTop: 6 }}>Each partner has one job</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 1, borderRadius: 18, overflow: "hidden", border: `1px solid ${T.border}`, marginTop: 24 }}>
          {[
            { icon: <Mic size={18} />, name: "Speechmatics", role: "Voice \u2192 Text", desc: "Voice becomes structured text before enrichment.", color: "#a855f7" },
            { icon: <Brain size={18} />, name: "Cognee", role: "Memory \u2192 Graph", desc: "Knowledge graph memory for reusable context.", color: "#f59e0b" },
            { icon: <Globe size={18} />, name: "Bright Data", role: "Web \u2192 Evidence", desc: "Self-healing gateway across SERP, Scraper, Browser, and Unlocker routes.", color: T.accent },
            { icon: <Zap size={18} />, name: "TriggerWare", role: "Signal \u2192 Action", desc: "Alerts, tasks, and workflow automations.", color: "#ef4444" },
            { icon: <Search size={18} />, name: "OpenAI + AIMLAPI", role: "Evidence \u2192 Intel", desc: "LLM synthesis with provider fallback.", color: "#818cf8" },
          ].map((p, i) => (
            <div key={i} className="au" style={{ animationDelay: `${i * .05}s`, padding: 20, background: T.bgSub, borderRight: i < 4 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${p.color}10`, border: `1px solid ${p.color}20`, display: "grid", placeItems: "center", color: p.color, marginBottom: 10 }}>{p.icon}</div>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: p.color, marginBottom: 2 }}>{p.name}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{p.role}</div>
              <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Intelligence domains — informational */}
      <section style={{ borderTop: `1px solid ${T.border}`, background: T.bgSub, padding: "56px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Eye>Intelligence domains</Eye>
          <h2 style={{ fontSize: 26, marginTop: 6 }}>Three domains. One runtime.</h2>
          <p style={{ color: T.dim, marginTop: 6, maxWidth: 550 }}>Choose your domains after signing in.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 24 }}>
            {DOMAINS.map((d, i) => (
              <div key={d.id} className="au" style={{ animationDelay: `${i * .06}s`, padding: 20, borderRadius: 14, background: T.bgCard, border: `1px solid ${T.border}` }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `${d.color}12`, border: `1px solid ${d.color}20`, display: "grid", placeItems: "center", color: d.color, marginBottom: 10 }}>{packIcon(d.icon)}</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.5, marginBottom: 8 }}>{d.description}</div>
                {d.signals.map(s => <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.muted, padding: "2px 0" }}><CheckCircle size={10} color={d.color} />{s}</div>)}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => nav("Pricing")} style={{ padding: "9px 18px", borderRadius: 999, border: `1px solid ${T.borderL}`, background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>View pricing <ArrowRight size={12} style={{ marginLeft: 4 }} /></button>
          </div>
        </div>
      </section>

      {/* Platform capabilities */}
      <section style={{ padding: "56px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Eye>Platform capabilities</Eye>
          <h2 style={{ fontSize: 26, marginTop: 6 }}>From data collection to decision engine</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 24 }}>
            {[
              { icon: <Briefcase size={18} />, title: "Org Context", desc: "Contracts, thresholds, exposure, priorities.", color: "#818cf8", ph: "Phase 1" },
              { icon: <Brain size={18} />, title: "LLM Reasoning", desc: "Package frameworks evaluate evidence against context with run receipts.", color: "#f59e0b", ph: "Phase 2" },
              { icon: <Zap size={18} />, title: "Auto Actions", desc: "Draft emails, schedule reviews. Approval gates.", color: "#22c55e", ph: "Phase 3" },
              { icon: <Target size={18} />, title: "Learning", desc: "Hit rate and signal accuracy improve over time.", color: "#ef4444", ph: "Phase 4" },
            ].map((c, i) => (
              <div key={i} className="au hl" style={{ animationDelay: `${i * .06}s`, padding: 18, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${c.color}10`, border: `1px solid ${c.color}20`, display: "grid", placeItems: "center", color: c.color, marginBottom: 8 }}>{c.icon}</div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: c.color }}>{c.ph}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, marginBottom: 3 }}>{c.title}</div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${T.border}`, padding: "50px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 28, fontWeight: 700 }}>Ready to wire live intelligence?</h2>
        <p style={{ color: T.dim, marginTop: 8 }}>Sign in, choose your plan, run your first research task.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
          <button onClick={go} style={{ padding: "12px 24px", borderRadius: 999, border: "none", background: T.accent, color: "#000", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{label}</button>
          <button onClick={() => nav("Pricing")} style={{ padding: "12px 24px", borderRadius: 999, border: `1px solid ${T.borderL}`, background: "transparent", color: T.muted, fontSize: 14, cursor: "pointer" }}>Pricing</button>
        </div>
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${T.border}`, color: T.dim, fontSize: 11 }}>WebDataOS &middot; Enterprise Live-Web Intelligence Runtime</div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PRICING PAGE (Public) — tier cards + domain picker
   ═══════════════════════════════════════════════════════════════════════ */
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
        <button onClick={go} style={{ padding: "12px 20px", borderRadius: 999, border: "none", background: `linear-gradient(135deg,${T.accent},#0891b2)`, color: "#000", fontWeight: 800, fontSize: 13, boxShadow: `0 8px 24px ${T.glow}`, cursor: "pointer", whiteSpace: "nowrap" }}>{user ? "Continue to monitor" : "Sign in to configure"} <ArrowRight size={14} style={{ marginLeft: 4 }} /></button>
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
          {s === "api" && <DS t="API Reference"><p>All endpoints require X-API-Key header.</p><div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${T.border}`, marginTop: 10 }}>{[
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
X-API-Key: <key>

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
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderTop: `1px solid ${T.border}` }}><span style={{ color: T.dim }}>Auth header</span><span style={{ color: T.text, fontFamily: "'JetBrains Mono'" }}>X-API-Key</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderTop: `1px solid ${T.border}` }}><span style={{ color: T.dim }}>Format</span><span style={{ color: T.text, fontFamily: "'JetBrains Mono'" }}>application/json</span></div>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,.85fr)", gap: 14 }}>
        <section style={{ borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 800 }}>Quick request</div>
          <pre style={{ margin: 0, padding: 14, color: T.muted, fontSize: 11, lineHeight: 1.65, fontFamily: "'JetBrains Mono'", overflow: "auto" }}>{`curl -X POST "$WEBDATAOS_API/agent/research" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $WEBDATAOS_API_KEY" \\
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
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await endpoints.monitorSummary(ws.id));
    } catch (e) {
      setError(e.message || "Monitor is not configured yet.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [ws.id]);
  useEffect(() => { load(); }, [load]);

  const ensureWorkspace = async () => {
    await saveWorkspace();
    await new Promise(resolve => setTimeout(resolve, 250));
  };
  const runNow = async () => {
    setRunning(true);
    setError("");
    try {
      await ensureWorkspace();
      const result = await endpoints.runMonitor(ws.id);
      setReport(result);
      try { setActions(await endpoints.listActions(ws.id)); } catch (_) {}
      await load();
    } catch (e) {
      setError(e.message || "Monitoring run failed.");
    } finally {
      setRunning(false);
    }
  };
  const saveAndLoad = async () => {
    setRunning(true);
    setError("");
    try {
      await ensureWorkspace();
      await load();
    } catch (e) {
      setError(e.message || "Could not save monitoring workspace.");
    } finally {
      setRunning(false);
    }
  };

  const s = summary || {};
  const counts = s.counts || {};
  const latest = s.latest_run || (report ? { summary: report.summary, risk_posture: report.reasoning?.risk_posture, counts: report.run_receipt?.counts || {} } : null);
  const status = s.status || {};
  const nextDue = status.next_due_at ? new Date(status.next_due_at).toLocaleString() : "After first run";
  const lastRun = status.last_run_at ? new Date(status.last_run_at).toLocaleString() : "No run yet";
  const records = s.records || report?.records_used || [];
  const actions = s.actions || [];
  const runs = s.runs || [];
  const capability = [
    ["Retrieval", backendOk?.brightdata_live ? "Bright Data live" : backendOk?.mock_brightdata ? "Mock mode" : "Not ready", backendOk?.brightdata_live],
    ["Reasoning", backendOk?.llm_available ? backendOk.llm_provider : "Not ready", backendOk?.llm_available],
    ["Memory", backendOk?.partner_apis?.cognee_local ? "Cognee + local" : "Local fallback", true],
    ["Graph", backendOk?.neo4j || "checking", backendOk?.neo4j === "ok"],
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
        <section style={{ marginTop: 16, padding: 18, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Monitoring is not configured yet</div>
            <div style={{ color: T.dim, fontSize: 12, marginTop: 5 }}>Save the current workspace mission, then the system can run scheduled updates and build the report view.</div>
          </div>
          <button onClick={saveAndLoad} disabled={running} style={{ padding: "9px 15px", borderRadius: 8, border: "none", background: T.accent, color: "#000", fontWeight: 800, fontSize: 12 }}>{running ? "Saving..." : "Save workspace"}</button>
        </section>
      )}

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 14, alignItems: "start" }}>
        <main style={{ display: "grid", gap: 14 }}>
          <section style={{ padding: 18, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Current update</div>
                <div style={{ color: T.dim, fontSize: 11, marginTop: 4 }}>Last run: {lastRun}</div>
              </div>
              <span style={{ padding: "4px 8px", borderRadius: 999, background: status.due ? "rgba(245,158,11,.12)" : "rgba(34,197,94,.1)", color: status.due ? "#f59e0b" : "#22c55e", fontSize: 11, fontWeight: 800 }}>{status.due ? "due" : "on schedule"}</span>
            </div>
            {latest ? <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>{latest.risk_posture ? `Posture: ${latest.risk_posture}` : "Latest monitoring brief"}</div>
              <p style={{ marginTop: 10, color: T.muted, fontSize: 14, lineHeight: 1.75 }}>{latest.summary || "The latest run did not include a summary."}</p>
            </div> : <div style={{ marginTop: 14, color: T.dim, fontSize: 13 }}>No monitoring brief yet. Run monitoring now to create the first update.</div>}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            <MC l="Runs" v={counts.runs || runs.length || 0} c={T.accent} />
            <MC l="Evidence" v={counts.records || records.length || 0} c="#22c55e" />
            <MC l="New 24h" v={counts.new_records_24h || 0} c="#818cf8" />
            <MC l="Actions" v={counts.pending_actions || actions.length || 0} c="#f59e0b" />
          </section>

          <section style={{ padding: 16, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Signals needing attention</div>
              <button onClick={() => nav("Evidence")} style={{ border: "none", background: "transparent", color: T.accent, fontSize: 12, fontWeight: 700 }}>Open evidence</button>
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {records.slice(0, 5).map(record => <div key={record.id} style={{ padding: 11, borderRadius: 8, background: T.bgCard, border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{record.entity_name || "Evidence signal"}</div>
                  <span style={{ fontSize: 10, color: T.accent }}>{fmt(record.confidence || 0)}</span>
                </div>
                <div style={{ marginTop: 5, color: T.muted, fontSize: 12, lineHeight: 1.5 }}>{record.summary || "No summary saved."}</div>
              </div>)}
              {!records.length && <div style={{ color: T.dim, fontSize: 12 }}>No evidence yet. Monitoring will populate this from live retrieval.</div>}
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
            <div style={{ fontSize: 14, fontWeight: 800 }}>Capability</div>
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
  const r = report?.reasoning || { executive_summary: "", risk_posture: "waiting", materiality_assessments: [], recommendations: [], confidence: 0, reasoning_trace: [] };
  const summary = report?.summary || r.executive_summary;
  const speakText = async text => {
    const cleanText = (text || "").trim();
    if (!cleanText) return;
    setTtsBusy(true);
    setError(null);
    try {
      const blob = await endpoints.synthesizeSpeech(cleanText.slice(0, 1200));
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(cleanText.slice(0, 1200)));
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
            <div style={{ fontSize: 11, color: T.muted }}>Sources: {report.sources?.length || 0}</div>
            <div style={{ fontSize: 11, color: T.muted }}>Partner trace: {report.partner_trace?.length || 0}</div>
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
    setRuns(prev => prev.some(run => run.id === report.run_id) ? prev : [{ id: report.run_id, task: report.task, status: "success", mode: report.transcript ? "voice/audio" : "text", at: new Date().toLocaleString(), summary: report.summary, counts: report.run_receipt?.counts || {}, providers: report.run_receipt?.providers || {}, report }, ...prev].slice(0, 50));
    setSelectedRunId(report.run_id);
  }, [report]);

  const activeRun = runs.find(run => run.id === selectedRunId) || runs[0] || (report ? { id: report.run_id, task: report.task, status: "success", mode: "text", at: "", report } : null);
  const activeReport = activeRun?.report || (activeRun ? null : report);
  const r = activeReport?.reasoning || { executive_summary: "", risk_posture: "waiting", materiality_assessments: [], recommendations: [], confidence: 0, reasoning_trace: [] };
  const summary = activeReport?.summary || r.executive_summary;
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
    let cancelled = false;
    endpoints.getRun(run.id)
      .then(detail => {
        if (cancelled) return;
        setRuns(prev => prev.map(item => item.id === run.id ? mapRun({ ...detail, report: detail.report }) : item));
      })
      .catch(e => {
        if (!cancelled) setError(e.message || "Could not load run detail.");
      });
    return () => { cancelled = true; };
  }, [selectedRunId, runs, mapRun]);

  const speakText = async text => {
    const cleanText = (text || "").trim();
    if (!cleanText) return;
    setTtsBusy(true);
    setError(null);
    try {
      const blob = await endpoints.synthesizeSpeech(cleanText.slice(0, 1200));
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(cleanText.slice(0, 1200)));
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
      setRuns(prev => prev.map(run => run.id === tempId ? { id: result.run_id, task: cleanTask, status: "success", mode, at: run.at, summary: result.summary, counts: result.run_receipt?.counts || {}, providers: result.run_receipt?.providers || {}, report: result } : run));
      setSelectedRunId(result.run_id);
      const assistantMessage = {
        id: `${result.run_id}-assistant`,
        role: "assistant",
        content: result.summary || result.reasoning?.executive_summary || "Analysis completed.",
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
      if (readAloud) await speakText(result?.summary || result?.reasoning?.executive_summary || "Analysis completed.");
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
    ["Retrieval", compactProviders.retrieval || (backendOk?.brightdata_live ? "Bright Data live" : backendOk?.mock_brightdata ? "mock mode" : "pending")],
    ["Reasoning", compactProviders.llm || (backendOk?.llm_available ? backendOk.llm_provider : "pending")],
    ["Memory", compactProviders.memory || (backendOk?.partner_apis?.cognee_local ? "Cognee + local" : "local fallback")],
    ["Workflow", compactProviders.workflow || (backendOk?.partner_apis?.triggerware ? "TriggerWare" : "manual")],
    ["Neo4j", graphStatus?.status || "checking"],
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
      content: summary || activeReport.reasoning?.executive_summary || "Saved analysis completed.",
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
              <div style={{ minHeight: 360, display: "grid", alignContent: "center", justifyItems: "center", textAlign: "center" }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg,${T.accent},#0891b2)`, display: "grid", placeItems: "center", marginBottom: 14 }}><Brain size={20} color="#001018" /></div>
                <h2 style={{ fontSize: 24, margin: 0 }}>What should we investigate?</h2>
                <p style={{ color: T.dim, fontSize: 13, lineHeight: 1.6, maxWidth: 520, marginTop: 8 }}>Ask a follow-up, investigate a monitoring signal, or request an evidence-backed action brief.</p>
                <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, width: "100%" }}>
                  {starterPrompts.map(prompt => <button key={prompt} onClick={() => setTask(prompt)} style={{ minHeight: 74, textAlign: "left", padding: 12, borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgSub, color: T.muted, fontSize: 12, lineHeight: 1.45 }}>{prompt}</button>)}
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
                  <div style={{ color: T.text, fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{message.content}</div>
                  {messageReport && <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {!!messageReport.key_findings?.length && <div style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Key findings</div>{messageReport.key_findings.slice(0, 4).map((finding, i) => <div key={i} style={{ color: T.muted, fontSize: 12, lineHeight: 1.6, padding: "4px 0" }}>{finding}</div>)}</div>}
                    {!!messageReasoning?.recommendations?.length && <div style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Recommended actions</div>{messageReasoning.recommendations.slice(0, 3).map((item, i) => <div key={i} style={{ color: T.muted, fontSize: 12, lineHeight: 1.6, padding: "4px 0" }}>{item.action || item.title || item.recommendation || JSON.stringify(item)}</div>)}</div>}
                    <details style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}>
                      <summary style={{ cursor: "pointer", color: T.muted, fontSize: 12 }}>Evidence and receipt</summary>
                      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        {(messageReport.records_used || []).slice(0, 4).map(rec => <div key={rec.id} style={{ fontSize: 11, color: T.dim, lineHeight: 1.45, wordBreak: "break-word" }}>{rec.entity_name || "Evidence"} - {rec.source_url}</div>)}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                          {(messageReport.run_receipt?.stages || []).slice(0, 6).map(stage => <div key={`${stage.name}-${stage.status}`} style={{ padding: 7, borderRadius: 7, background: T.bgCard, border: `1px solid ${T.border}` }}><div style={{ fontSize: 9, color: T.dim }}>{stage.name}</div><div style={{ marginTop: 3, color: statusColor(stage.status), fontSize: 10, fontWeight: 800 }}>{stage.status}</div></div>)}
                        </div>
                      </div>
                    </details>
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
        <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${T.border}`, background: "rgba(8,10,13,.9)" }}>
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
              {activeReport && <div style={{ padding: 18, borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><div><div style={{ fontSize: 13, fontWeight: 800 }}>Sourced intelligence brief</div><div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>Run {activeReport.run_id}</div></div><span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 999, color: matC(r.risk_posture), background: `${matC(r.risk_posture)}12` }}>{r.risk_posture}</span></div><p style={{ color: T.muted, fontSize: 14, lineHeight: 1.8, marginTop: 12 }}>{summary}</p><div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}><MC l="Confidence" v={fmt(r.confidence)} c="#22c55e" /><MC l="Evidence" v={activeReport.records_used?.length || 0} c={T.accent} /><MC l="Memory" v={activeReport.memories_used?.length || 0} c="#818cf8" /><MC l="Actions" v={reportActions.length} c="#f59e0b" /></div></div>}
              {activeReport && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div style={{ padding: 14, borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Material findings</div>{(r.materiality_assessments || []).slice(0, 4).map((a, i) => <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{a.finding}</div><div style={{ marginTop: 3, fontSize: 10, color: matC(a.materiality) }}>{a.materiality}</div></div>)}{!r.materiality_assessments?.length && <div style={{ fontSize: 12, color: T.dim }}>No material findings for this run.</div>}</div><div style={{ padding: 14, borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Actions</div>{reportActions.map(a => <div key={a.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 12, color: T.text }}>{a.title}</span><span style={{ fontSize: 10, color: stC(a.status) }}>{a.status}</span></div>{a.status === "pending_approval" && <div style={{ display: "flex", gap: 4, marginTop: 7 }}><button onClick={() => approve(a.id)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#22c55e", color: "#000", fontSize: 10, fontWeight: 800 }}>Approve</button><button onClick={() => reject(a.id)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.borderL}`, background: "transparent", color: T.dim, fontSize: 10 }}>Reject</button></div>}</div>)}{!reportActions.length && <div style={{ fontSize: 12, color: T.dim }}>No workflow actions proposed.</div>}</div></div>}
            </div>
          </div>
        </main>

        <aside style={{ borderRadius: 14, background: T.bgSub, border: `1px solid ${T.border}`, minHeight: 700, overflow: "hidden" }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 800 }}>Live inspector</div><div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Transcript, memory, evidence, graph, workflow</div></div>
          <div style={{ padding: 12, display: "grid", gap: 10, maxHeight: 650, overflowY: "auto" }}>
            <div style={{ padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><Lb>Providers</Lb><div style={{ marginTop: 8, display: "grid", gap: 6 }}>{providerRows.map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}><span style={{ color: T.dim }}>{label}</span><span style={{ color: value === "disabled" || value === "not used" ? T.dim : T.text }}>{value}</span></div>)}</div></div>
            <div style={{ padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><Lb>Evidence used</Lb>{(activeReport?.records_used || []).slice(0, 5).map(rec => <div key={rec.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}><div style={{ fontSize: 11, color: T.text }}>{rec.entity_name || "Evidence"}</div><div style={{ fontSize: 10, color: T.dim, wordBreak: "break-all" }}>{rec.source_url}</div></div>)}{!activeReport?.records_used?.length && <div style={{ marginTop: 8, fontSize: 11, color: T.dim }}>No evidence selected yet.</div>}</div>
            <div style={{ padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><Lb>Reasoning trace</Lb>{(r.reasoning_trace || []).slice(0, 8).map((trace, i) => <div key={i} style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>{trace}</div>)}{!r.reasoning_trace?.length && <div style={{ marginTop: 8, fontSize: 11, color: T.dim }}>Trace appears after reasoning.</div>}</div>
            {receipt && <div style={{ padding: 12, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><Lb>Run receipt</Lb><pre style={{ margin: "8px 0 0", maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", color: T.muted, fontSize: 10, lineHeight: 1.5, fontFamily: "'JetBrains Mono'" }}>{JSON.stringify(receipt, null, 2)}</pre></div>}
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
      if (step === "discover") setSources(await endpoints.discoverSources(ws.id, 6));
      if (step === "refresh") {
        await endpoints.refreshTopic(ws.id, 4);
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
            {!displayRecords.length && <div style={{ padding: 14, color: T.dim, fontSize: 12, lineHeight: 1.6 }}>No evidence yet. Discover sources, save records, then rank them against the current question.</div>}
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
              <GraphMini graph={graphView} title={graphLabel} />
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
function ActPage({ actions, setActions }) {
  const [f, setF] = useState("all");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const list = f === "all" ? actions : actions.filter(a => a.status === f);
  const patchAction = updated => setActions(p => p.map(a => a.id === updated.id ? updated : a));
  const approve = async id => {
    setBusy(id); setErr("");
    try { patchAction(await endpoints.approveAction(id, { approve: true, approved_by: "analyst" })); }
    catch (e) { setErr(e.message || "Could not approve action."); }
    finally { setBusy(""); }
  };
  const reject = async id => {
    setBusy(id); setErr("");
    try { patchAction(await endpoints.approveAction(id, { approve: false, approved_by: "analyst" })); }
    catch (e) { setErr(e.message || "Could not reject action."); }
    finally { setBusy(""); }
  };
  const execute = async id => {
    setBusy(id); setErr("");
    try { patchAction(await endpoints.executeAction(id)); }
    catch (e) { setErr(e.message || "Could not execute action."); }
    finally { setBusy(""); }
  };
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 24px" }}>
      <Eye>Autonomous actions</Eye><h2 style={{ fontSize: 22, marginTop: 4 }}>Approval queue</h2>
      {err && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", color: "#ef4444", fontSize: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 999, background: "rgba(255,255,255,.04)", border: `1px solid ${T.border}`, marginTop: 12, width: "fit-content" }}>
        {[["all", "All"], ["pending_approval", "Pending"], ["approved", "Approved"], ["executed", "Executed"], ["rejected", "Rejected"]].map(([id, l]) => <button key={id} onClick={() => setF(id)} style={{ border: "none", borderRadius: 999, padding: "5px 10px", fontSize: 11, background: f === id ? T.accent : "transparent", color: f === id ? "#000" : T.muted, cursor: "pointer" }}>{l} ({id === "all" ? actions.length : actions.filter(a => a.status === id).length})</button>)}
      </div>
      <div style={{ marginTop: 12, borderRadius: 14, overflow: "hidden", background: T.bgSub, border: `1px solid ${T.border}` }}>
        {list.map(a => <div key={a.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 2 }}><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${stC(a.status)}12`, color: stC(a.status), fontWeight: 600 }}>{a.status}</span><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,.04)", color: T.dim }}>{a.action_type}</span></div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{a.title}</div>
            <div style={{ fontSize: 11, color: T.dim }}>{a.description}</div>
          </div>
          <div style={{ display: "flex", gap: 3, flexShrink: 0, marginLeft: 8 }}>
            {a.status === "pending_approval" && <><button disabled={busy === a.id} onClick={() => approve(a.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "#22c55e", color: "#000", fontSize: 10, fontWeight: 600, cursor: busy === a.id ? "wait" : "pointer" }}>Approve</button><button disabled={busy === a.id} onClick={() => reject(a.id)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.borderL}`, background: "transparent", color: T.dim, fontSize: 10, cursor: busy === a.id ? "wait" : "pointer" }}>Reject</button></>}
            {(a.status === "approved" || a.status === "auto_approved") && <button disabled={busy === a.id} onClick={() => execute(a.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: T.accent, color: "#000", fontSize: 10, fontWeight: 600, cursor: busy === a.id ? "wait" : "pointer" }}><Play size={10} /> Execute</button>}
          </div>
        </div>)}
        {!list.length && <div style={{ padding: 14, color: T.dim, fontSize: 12 }}>No actions in this view.</div>}
      </div>
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
      await load();
    } catch (e) {
      setErr(e.message || "Could not record outcome");
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
        {!loading && !hasOutcomes && <div style={{ padding: 18, color: T.dim, fontSize: 12 }}>No outcomes recorded yet. Save the first live outcome above after a recommendation is acted on, dismissed, or confirmed useful.</div>}
        {loading && <div style={{ padding: 18, color: T.dim, fontSize: 12 }}>Loading live outcomes...</div>}
        {outcomes.map(o => <div key={o.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${oC(o.outcome_type)}12`, color: oC(o.outcome_type), fontWeight: 600, marginRight: 6 }}>{o.outcome_type}</span><span style={{ fontSize: 12, fontWeight: 500 }}>{o.entity_name || "Unspecified entity"}</span><span style={{ fontSize: 11, color: T.dim, marginLeft: 6 }}>{o.feedback_text || o.signal_type || "No feedback"}</span></div>
          <span style={{ fontSize: 10, color: T.dim, whiteSpace: "nowrap" }}>{o.recorded_by || o.created_at || "system"}</span>
        </div>)}
      </div>
    </div>
  );
}

/* ═══════ SHARED ═══════ */
function Eye({ children }) { return <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: T.accent }}>{children}</div>; }
function Lb({ children, style }) { return <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, ...style }}>{children}</div>; }
function MC({ l, v, c }) { return <div style={{ padding: "6px 7px", borderRadius: 6, background: "rgba(255,255,255,.02)", border: `1px solid ${T.border}` }}><div style={{ fontSize: 8, color: T.dim, textTransform: "uppercase", letterSpacing: ".05em" }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700, color: c, marginTop: 1, fontFamily: "'JetBrains Mono'" }}>{v}</div></div>; }
function GraphMini({ graph, title }) {
  const nodes = (graph?.nodes || []).slice(0, 8);
  const relationships = (graph?.relationships || []).slice(0, 8);
  const short = value => String(value || "").replace(/^(Company|Workspace|Source|IntelligenceRecord|Product|Feature|PricingModel):/, "").slice(0, 46);
  if (!nodes.length && !relationships.length) {
    return <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: T.bgSub, border: `1px solid ${T.border}`, color: T.dim, fontSize: 11, lineHeight: 1.5 }}>No graph relationships yet. Saving fresh evidence will populate the relationship map.</div>;
  }
  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: T.bgSub, border: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ fontSize: 9, color: T.dim }}>{nodes.length} nodes</span>
      </div>
      <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {nodes.map(node => <span key={node.id} title={`${node.type}: ${node.label}`} style={{ maxWidth: "100%", padding: "4px 7px", borderRadius: 999, background: node.type === "Company" ? "rgba(18,181,203,.12)" : "rgba(255,255,255,.04)", border: `1px solid ${T.border}`, color: node.type === "Company" ? T.accent : T.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.type}: {short(node.label)}</span>)}
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 5 }}>
        {relationships.map((rel, i) => <div key={`${rel.source}-${rel.type}-${rel.target}-${i}`} style={{ fontSize: 10, color: T.dim, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ color: T.muted }}>{short(rel.source)}</span> <span style={{ color: T.accent }}>{rel.type.replace(/_/g, " ").toLowerCase()}</span> <span style={{ color: T.muted }}>{short(rel.target)}</span>
        </div>)}
      </div>
    </div>
  );
}
function DS({ t, children }) { return <div className="ai" style={{ marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>{t}</h3><div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div></div>; }
function DC({ t, children }) { return <div style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: T.text }}>{t}</div><div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>{children}</div></div>; }
function JB({ children }) { return <pre style={{ padding: 14, borderRadius: 10, background: T.bgInset, border: `1px solid ${T.border}`, fontSize: 11, fontFamily: "'JetBrains Mono'", color: T.accent, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: "6px 0", overflow: "auto" }}>{children}</pre>; }
const IS = { width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 7, background: T.bgCard, border: `1px solid ${T.borderL}`, fontSize: 12, color: T.text, outline: "none" };


const CSS = `@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;margin:0;padding:0}button,input,textarea,select{font:inherit;color:inherit}button{cursor:pointer}::selection{background:rgba(6,182,212,.25)}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:3px}.au{animation:fadeUp .5s ease both}.ai{animation:fadeIn .4s ease both}.s1{animation-delay:.08s}.s2{animation-delay:.16s}.s3{animation-delay:.24s}.hl{transition:transform .2s,box-shadow .2s}.hl:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3)}@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`;

createRoot(document.getElementById("root")).render(<App />);
