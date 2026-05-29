import { useState, useEffect, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Shield, Globe, TrendingUp, Layers, Mic, Brain, Zap, ArrowRight,
  CheckCircle, RefreshCw, Send, LogOut, User, Mail, KeyRound,
  ThumbsUp, ThumbsDown, BarChart3, Target, Briefcase, Play,
  AlertTriangle, Database, Search, Clock, Eye as EyeIcon, ChevronRight
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════════════════ */
const T = {
  bg: "#0b1120", bgSub: "#0f172a", bgCard: "#131c31", bgInset: "#0a0f1e",
  border: "rgba(148,163,184,0.08)", borderL: "rgba(148,163,184,0.12)",
  text: "#e2e8f0", muted: "#94a3b8", dim: "#64748b",
  accent: "#06b6d4", glow: "rgba(6,182,212,0.15)",
};
const matC = m => m === "critical" ? "#dc2626" : m === "high" ? "#ef4444" : m === "medium" ? "#f59e0b" : m === "low" ? "#22c55e" : "#64748b";
const stC = s => s === "pending_approval" ? "#f59e0b" : s === "approved" || s === "auto_approved" ? "#3b82f6" : s === "executed" ? "#22c55e" : s === "rejected" ? "#ef4444" : "#64748b";
const oC = o => o === "acted" ? "#22c55e" : o === "confirmed_useful" ? "#06b6d4" : o === "dismissed" ? "#94a3b8" : o === "false_alarm" ? "#ef4444" : "#f59e0b";
const fmt = n => `${Math.round(n * 100)}%`;
const slug = v => v.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "ws";
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
  listRecords: () => api("GET", "/intelligence/records"),
  listTopicRecords: topicId => api("GET", `/intelligence/records?topic_id=${encodeURIComponent(topicId)}`),
  createTopic: data => api("POST", "/intelligence/topics", data),
  discoverSources: (topicId, limit = 6) => api("POST", `/intelligence/topics/${encodeURIComponent(topicId)}/discover?limit=${limit}`, null, 45000),
  refreshTopic: (topicId, maxSources = 4) => api("POST", `/intelligence/topics/${encodeURIComponent(topicId)}/refresh?max_sources=${maxSources}`, null, 70000),
  retrieveContext: data => api("POST", "/intelligence/retrieval/context", data),
  gatewayFetch: data => api("POST", "/gateway/fetch", data),
  listActions: (wsId, status) => api("GET", `/actions/${wsId}${status ? `?status=${status}` : ""}`),
  approveAction: (id, data) => api("POST", `/actions/${id}/approve`, data),
  executeAction: id => api("POST", `/actions/${id}/execute`),
  recordOutcome: data => api("POST", "/outcomes", data),
  listOutcomes: wsId => api("GET", `/outcomes/${wsId}`),
  outcomeStats: wsId => api("GET", `/outcomes/${wsId}/stats`),
};

/* ═══════════════════════════════════════════════════════════════════════
   DATA (mirrors codebase schemas)
   ═══════════════════════════════════════════════════════════════════════ */
const PACKS = [
  { id: "security", name: "Security & Compliance", tier: "Focused", description: "Monitor vendor risk, regulatory changes, breach exposure, policy updates, and public risk signals.", signals: ["Vendor risk", "Regulatory change", "Breach exposure", "Compliance signals"], entities: ["Vendors", "Regulators", "Domains", "Security pages"], routes: ["serp_api", "web_unlocker", "scraping_browser", "web_scraper_api"], output: ["risk_brief", "evidence", "recommended_action"], icon: "shield", color: "#ef4444" },
  { id: "gtm", name: "GTM Intelligence", tier: "Focused", description: "Track competitors, pricing, messaging, hiring signals, account enrichment, and buying intent.", signals: ["Competitor moves", "Pricing changes", "Messaging shifts", "Buying signals"], entities: ["Competitors", "Accounts", "Products", "Markets"], routes: ["serp_api", "web_scraper_api", "scraping_browser", "mcp_server"], output: ["market_brief", "account_intelligence", "competitive_change"], icon: "globe", color: "#3b82f6" },
  { id: "finance", name: "Finance & Market", tier: "Focused", description: "Monitor filings, supplier signals, pricing movements, sector changes, and alternative market data.", signals: ["Filings", "Supplier signals", "Market movement", "Alternative data"], entities: ["Companies", "Suppliers", "Sectors", "Market pages"], routes: ["serp_api", "web_scraper_api", "scraping_browser", "mcp_server"], output: ["market_signal", "company_brief", "supplier_risk"], icon: "trending", color: "#22c55e" },
  { id: "enterprise", name: "Enterprise Intelligence OS", tier: "Combo", description: "All three packs unified with cross-domain alerts, shared evidence, voice input, LLM reasoning, and autonomous actions.", signals: ["All security", "All GTM", "All finance", "Cross-domain alerts"], entities: ["Vendors", "Competitors", "Accounts", "Companies"], routes: ["serp_api", "web_unlocker", "scraping_browser", "web_scraper_api", "mcp_server"], output: ["executive_brief", "cross_track_alert", "shared_evidence"], icon: "layers", color: "#06b6d4", featured: true },
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
const PRIV = ["Workspace", "Agent", "Intelligence", "Gateway", "Actions", "Outcomes"];

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
  const [ws, setWs] = useState({ id: "ws_enterprise", name: "Enterprise Workspace", cadence: "Daily", entities: "", signals: "" });
  const pack = useMemo(() => PACKS.find(p => p.id === packId) || PACKS[3], [packId]);
  const tier = useMemo(() => TIERS.find(t => t.id === tierId) || TIERS[1], [tierId]);
  const activeDomains = useMemo(() => tierId === "enterprise" ? DOMAINS : DOMAINS.filter(d => selDomains.includes(d.id)), [tierId, selDomains]);
  const toggleDomain = (id) => { if (tierId === "enterprise") return; setSelDomains(prev => { if (prev.includes(id)) return prev.filter(d => d !== id); if (prev.length >= tier.pick) return [...prev.slice(1), id]; return [...prev, id]; }); };
  const nav = useCallback(t => { if (PRIV.includes(t) && !user) { setShowAuth(true); return; } setPage(t); }, [user]);
  useEffect(() => {
    endpoints.health().then(status => setBackendOk(status)).catch(() => setBackendOk(false));
  }, []);
  useEffect(() => {
    if (!user || !["Agent", "Actions", "Outcomes"].includes(page)) return;
    endpoints.listActions(ws.id).then(items => { if (items.length) setActions(items); }).catch(() => {});
  }, [user, page, ws.id]);
  const saveWorkspace = async () => {
    const payload = {
      id: ws.id || slug(ws.name),
      name: ws.name,
      package_id: packId,
      entities: ws.entities.split(",").map(s => s.trim()).filter(Boolean),
      signals: ws.signals.split(",").map(s => s.trim()).filter(Boolean),
      refresh_frequency_minutes: ws.cadence === "Every 6 hours" ? 360 : ws.cadence === "Weekly" ? 10080 : 1440,
    };
    const saved = await endpoints.createWorkspace(payload);
    setWs(prev => ({ ...prev, id: saved.id || payload.id, name: saved.name || prev.name }));
    return saved;
  };
  const runResearch = async task => {
    const result = await endpoints.research({
      task,
      workspace_id: ws.id,
      topic_id: ws.id,
      package_id: packId,
      input_mode: "text",
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
      {page === "Solution" && <SolutionPage nav={nav} />}
      {page === "Pricing" && <PricingPage nav={nav} tierId={tierId} setTierId={setTierId} selDomains={selDomains} toggleDomain={toggleDomain} tier={tier} user={user} auth={() => setShowAuth(true)} />}
      {page === "Docs" && <DocsPage />}
      {page === "Developer" && <DevPage />}
      {page === "Workspace" && user && <WsPage tierId={tierId} setTierId={setTierId} selDomains={selDomains} toggleDomain={toggleDomain} tier={tier} activeDomains={activeDomains} pack={pack} packId={packId} setPackId={setPackId} ws={ws} setWs={setWs} nav={nav} saveWorkspace={saveWorkspace} />}
      {page === "Agent" && user && <AgentPage pack={pack} ws={ws} actions={actions} setActions={setActions} runResearch={runResearch} report={report} />}
      {page === "Intelligence" && user && <IntelPage ws={ws} />}
      {page === "Gateway" && user && <GwPage />}
      {page === "Actions" && user && <ActPage actions={actions} setActions={setActions} />}
      {page === "Outcomes" && user && <OutPage ws={ws} user={user} />}
      {showAuth && <Auth onClose={() => setShowAuth(false)} onAuth={u => { setUser(u); setShowAuth(false); setPage("Workspace"); }} />}
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
  const apiLive = backendOk && backendOk !== false && backendOk.status !== "offline";
  const llmLive = apiLive && backendOk.llm_available;
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${T.border}`, background: "rgba(11,17,32,.84)", backdropFilter: "blur(20px)", padding: "0 20px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <button onClick={() => setPage("Home")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: T.text }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${T.accent},#0891b2)`, display: "grid", placeItems: "center" }}><Layers size={15} color="#fff" /></div>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.02em" }}>WebDataOS</span>
        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: apiLive ? "rgba(34,197,94,.1)" : backendOk === false ? "rgba(239,68,68,.1)" : "rgba(255,255,255,.04)", color: apiLive ? "#22c55e" : backendOk === false ? "#ef4444" : T.dim }}>{apiLive ? "API live" : backendOk === false ? "API offline" : "checking API"}</span>
        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: llmLive ? "rgba(34,197,94,.1)" : "rgba(245,158,11,.1)", color: llmLive ? "#22c55e" : "#f59e0b" }}>{llmLive ? `LLM ${backendOk.llm_provider}` : "LLM fallback"}</span>
      </button>
      <nav style={{ display: "flex", gap: 2, padding: 3, borderRadius: 999, background: "rgba(255,255,255,.04)", border: `1px solid ${T.border}` }}>
        {PUB.map(n => <button key={n} onClick={() => setPage(n)} style={{ border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 500, background: page === n ? T.accent : "transparent", color: page === n ? "#000" : T.muted, cursor: "pointer" }}>{n}</button>)}
        {user && <><div style={{ width: 1, background: T.borderL, margin: "3px" }} />{PRIV.map(n => <button key={n} onClick={() => setPage(n)} style={{ border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 500, background: page === n ? T.accent : "transparent", color: page === n ? "#000" : T.muted, cursor: "pointer" }}>{n}</button>)}</>}
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
  const go = user ? () => nav("Workspace") : auth;
  const label = user ? "Go to workspace" : "Get started free";
  return (
    <div>
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px 50px", textAlign: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle,${T.glow},transparent 70%)`, pointerEvents: "none" }} />
        <div className="au" style={{ display: "inline-flex", gap: 6, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
          {["Bright Data", "Speechmatics", "Cognee", "TriggerWare", "OpenAI"].map(p => <span key={p} style={{ padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 500, border: `1px solid rgba(6,182,212,.2)`, color: T.accent, background: `rgba(6,182,212,.06)` }}>{p}</span>)}
        </div>
        <h1 className="au s1" style={{ fontSize: "clamp(36px,5vw,64px)", fontWeight: 700, letterSpacing: "-.04em", lineHeight: .95, background: "linear-gradient(180deg,#f1f5f9 30%,#64748b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", maxWidth: 820, margin: "0 auto" }}>Live-web intelligence that listens, remembers, retrieves, and acts</h1>
        <p className="au s2" style={{ maxWidth: 600, margin: "20px auto 0", fontSize: 16, lineHeight: 1.7, color: T.muted }}>Enterprise AI agents backed by fresh public-web evidence. LLM-powered analysis, Cognee graph memory, self-healing Bright Data retrieval, and autonomous actions with approval gates.</p>
        <div className="au s3" style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28 }}>
          <button onClick={go} style={{ padding: "12px 24px", borderRadius: 999, border: "none", background: `linear-gradient(135deg,${T.accent},#0891b2)`, color: "#000", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, boxShadow: `0 8px 24px ${T.glow}`, cursor: "pointer" }}>{label} <ArrowRight size={15} /></button>
          <button onClick={() => nav("Solution")} style={{ padding: "12px 24px", borderRadius: 999, border: `1px solid ${T.borderL}`, background: "rgba(255,255,255,.03)", color: T.muted, fontSize: 14, cursor: "pointer" }}>How it works</button>
        </div>
      </section>

      {/* Stats */}
      <section style={{ borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: "rgba(255,255,255,.02)", padding: "28px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 20, textAlign: "center" }}>
          {[{ n: "3", l: "Pricing tiers" }, { n: "3", l: "Intelligence domains" }, { n: "5", l: "Partners" }, { n: "25+", l: "API endpoints" }, { n: "4", l: "Analyst phases" }].map((s, i) => (
            <div key={i} className="au" style={{ animationDelay: `${i * .06}s` }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.accent, fontFamily: "'JetBrains Mono'" }}>{s.n}</div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{s.l}</div>
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
            { icon: <Globe size={18} />, name: "Bright Data", role: "Web \u2192 Evidence", desc: "Self-healing gateway, 5 tools, recovery routing.", color: T.accent },
            { icon: <Zap size={18} />, name: "TriggerWare", role: "Signal \u2192 Action", desc: "Alerts, tasks, and workflow automations.", color: "#ef4444" },
            { icon: <Search size={18} />, name: "OpenAI", role: "Evidence \u2192 Intel", desc: "LLM synthesis + semantic memory search.", color: "#818cf8" },
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
              { icon: <Brain size={18} />, title: "LLM Reasoning", desc: "Package frameworks evaluate evidence against context.", color: "#f59e0b", ph: "Phase 2" },
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
  const go = user ? () => nav("Workspace") : auth;
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px" }}>
      <Eye>Pricing</Eye>
      <h2 style={{ fontSize: 28, marginTop: 6 }}>Choose your tier, pick your domains</h2>
      <p style={{ color: T.dim, marginTop: 6, lineHeight: 1.6 }}>Every tier uses the same runtime: Speechmatics, Cognee, Bright Data, OpenAI, TriggerWare. Pick your plan here, then configure your workspace after signing in.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 28 }}>
        {TIERS.map((t, i) => (
          <button key={t.id} className="au hl" onClick={() => setTierId(t.id)} style={{ animationDelay: `${i * .06}s`, textAlign: "left", padding: 24, borderRadius: 18, border: tierId === t.id ? `1.5px solid ${t.color}50` : `1px solid ${T.border}`, background: t.featured ? "linear-gradient(160deg,#141d35,#0f172a)" : T.bgCard, position: "relative", overflow: "hidden", cursor: "pointer", outline: tierId === t.id ? `2px solid ${t.color}25` : "none", outlineOffset: 2 }}>
            {t.featured && <div style={{ position: "absolute", top: 12, right: 12, padding: "2px 8px", borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: "uppercase", background: `${t.color}15`, color: t.color, border: `1px solid ${t.color}25` }}>Most popular</div>}
            <div style={{ fontSize: 22, fontWeight: 700, color: t.color, marginBottom: 2 }}>{t.name}</div>
            <div style={{ fontSize: 12, color: T.dim, marginBottom: 10 }}>{t.tagline}</div>
            <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55, marginBottom: 14 }}>{t.description}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.color }}>{t.price}</div>
          </button>
        ))}
      </div>

      {tierId !== "enterprise" && (
        <div className="au" style={{ marginTop: 24 }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: T.muted }}>Select <strong style={{ color: T.text }}>{tier.pick}</strong> intelligence {tier.pick === 1 ? "domain" : "domains"} for <strong style={{ color: tier.color }}>{tier.name}</strong>:</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {DOMAINS.map(d => {
              const active = selDomains.includes(d.id);
              return (
                <button key={d.id} className="hl" onClick={() => toggleDomain(d.id)} style={{ textAlign: "left", padding: 20, borderRadius: 14, border: active ? `1.5px solid ${d.color}50` : `1px solid ${T.border}`, background: active ? `${d.color}06` : T.bgCard, cursor: "pointer", position: "relative" }}>
                  {active && <div style={{ position: "absolute", top: 12, right: 12, width: 20, height: 20, borderRadius: 999, background: d.color, display: "grid", placeItems: "center" }}><CheckCircle size={12} color="#000" /></div>}
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${d.color}12`, border: `1px solid ${d.color}20`, display: "grid", placeItems: "center", color: d.color, marginBottom: 10 }}>{packIcon(d.icon)}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.5 }}>{d.description}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>
                    {d.signals.map(s => <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.muted }}><CheckCircle size={10} color={d.color} />{s}</div>)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tierId === "enterprise" && (
        <div className="au" style={{ marginTop: 24, textAlign: "center" }}>
          <div style={{ display: "inline-flex", gap: 10, padding: "12px 20px", borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}>
            {DOMAINS.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: `${d.color}15`, display: "grid", placeItems: "center", color: d.color }}>{packIcon(d.icon, 12)}</div>
                <span style={{ fontSize: 12, color: T.muted }}>{d.name.split(" ")[0]}</span>
                <CheckCircle size={12} color="#22c55e" />
              </div>
            ))}
            <span style={{ fontSize: 12, color: T.dim, marginLeft: 4 }}>All included</span>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 28 }}>
        <button onClick={go} style={{ padding: "13px 28px", borderRadius: 999, border: "none", background: `linear-gradient(135deg,${T.accent},#0891b2)`, color: "#000", fontWeight: 600, fontSize: 14, boxShadow: `0 8px 24px ${T.glow}`, cursor: "pointer" }}>{user ? "Continue to workspace" : "Sign in to get started"} <ArrowRight size={14} style={{ marginLeft: 4 }} /></button>
      </div>
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
          {s === "overview" && <DS t="Overview"><p>WebDataOS is an enterprise live-web intelligence runtime for AI agents. It transforms public web signals into fresh, structured, evidence-backed intelligence across Security & Compliance, GTM Intelligence, and Finance & Market workflows.</p><p>The system serves both developers (REST API, Python/TypeScript SDKs) and business users (web interface) through a shared backend. Every research task produces structured JSON with sourced findings, confidence scores, partner trace, and action receipts.</p><DC t="Product Vision">The live-web intelligence layer enterprise agents rely on before making decisions from external web data. Freshness-aware retrieval, self-healing Bright Data gateway, Cognee knowledge-graph memory with self-hosted fallback, LLM-powered synthesis, and autonomous actions with human approval gates.</DC><DC t="Key Differentiators">Self-healing gateway with typed failure detection across SERP API, Web Scraper API, Web Unlocker, Scraping Browser, and optional MCP Server. Cognee-first memory with PostgreSQL/OpenAI fallback search. LLM-powered contextual synthesis. Organizational context for materiality assessment. Outcome-based learning loop. Serves both infrastructure consumers (API) and end users (UI).</DC></DS>}
          {s === "arch" && <DS t="Architecture"><p>Layered architecture with clear separation between UI, API, gateway, intelligence engine, memory, reasoning, and partner integrations.</p><JB>{["User (text / voice / audio)", "  │", "  ├── Speechmatics → Transcription", "  ├── Memory Provider → Cognee graph recall + self-hosted fallback search", "  ├── Intelligence Engine → Check existing records, freshness", "  │   └── Bright Data Gateway → SERP → Web Scraper → Scraping Browser → Web Unlocker → optional MCP", "  │       └── FailureDetector → RecoveryRouter → ResultNormalizer", "  ├── LLM Synthesizer → Contextual analysis (OpenAI + AI/ML API fallback)", "  ├── Reasoning Engine → Materiality vs org context", "  │   └── Autonomous Actions → Proposals + approval gates", "  ├── Memory Provider → Store in Cognee + self-hosted memory", "  └── TriggerWare → Fire workflow actions"].join("\n")}</JB><DC t="Services">API: port 8000 · Web UI: port 3000 · PostgreSQL: 5432 · Neo4j: 7474 · Prometheus: 9090 · Grafana: 3001</DC></DS>}
          {s === "packs" && <DS t="Intelligence Packages"><p>4 packages, each configuring entities, signals, Bright Data routes, and output focus.</p>{PACKS.map(p => <DC key={p.id} t={`${p.name} (${p.tier})`}>{p.description} Entities: {p.entities.join(", ")}. Signals: {p.signals.join(", ")}. Routes: {p.routes.join(", ")}. Output: {p.output.join(", ")}.</DC>)}</DS>}
          {s === "journey" && <DS t="User Journey">{["Sign up and create a workspace with a package", "Enter entities to monitor and signals to watch", "Set refresh cadence (daily, weekly, every 6 hours, manual)", "Submit research task via text, voice, or audio upload", "Speechmatics transcribes voice/audio to structured text", "Cognee checks graph memory; self-hosted memory provides fallback context", "Intelligence Engine checks existing records for freshness", "If stale → Bright Data gateway fetches with self-healing recovery", "FailureDetector classifies errors → RecoveryRouter escalates tools", "ResultNormalizer produces clean JSON evidence records", "Change detection compares old vs new facts, logs ChangeEvents", "LLM synthesizes contextual brief from evidence + memory", "Reasoning Engine assesses materiality against org context", "Autonomous actions proposed for material findings", "TriggerWare fires workflow actions for material signals", "User receives brief, companies, changes, partner trace, receipts"].map((step, i) => <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: i < 15 ? `1px solid ${T.border}` : "none" }}><span style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: `${T.accent}10`, color: T.accent, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 13, color: T.muted }}>{step}</span></div>)}</DS>}
          {s === "gateway" && <DS t="Gateway & Recovery"><p>The self-healing gateway detects failure modes and routes to the next Bright Data tool automatically.</p><DC t="ToolName enum">serp_api, web_scraper_api, web_unlocker, scraping_browser, mcp_server, mock</DC><DC t="FailureType enum">none, blocked, captcha, geo_blocked, rate_limited, javascript_required, selector_failed, empty_response, timeout, unknown</DC><DC t="Recovery routing">blocked/captcha/geo_blocked/rate_limited → web_unlocker → scraping_browser → mcp_server. javascript_required/empty_response/selector_failed → scraping_browser → web_unlocker → mcp_server. web_scraper_api failure → scraping_browser. scraping_browser failure → web_unlocker. web_unlocker failure → mcp_server.</DC><DC t="SourceType enum">search_result, company_page, pricing_page, docs_page, news_page, filing, social_public, unknown</DC></DS>}
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
function DevPage() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
      <Eye>Developer</Eye>
      <h2 style={{ fontSize: 24, marginTop: 6 }}>SDKs, authentication, and examples</h2>
      <p style={{ color: T.dim, marginTop: 6, lineHeight: 1.6 }}>All requests require <code style={{ background: T.bgInset, padding: "2px 6px", borderRadius: 4, fontFamily: "'JetBrains Mono'", fontSize: 12 }}>X-API-Key</code> header. Base URL defaults to <code style={{ background: T.bgInset, padding: "2px 6px", borderRadius: 4, fontFamily: "'JetBrains Mono'", fontSize: 12 }}>http://localhost:8000</code>.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
        {[
          { lang: "Python", lines: ["# pip install webdataos", "", 'client = WebDataOS(api_key="key", workspace_id="ws")', "", "# LLM-powered research", "brief = client.agent.research(", '    task="Assess vendor risk and pricing signals",', '    input_mode="text"', ")", "print(brief.summary)          # contextual LLM analysis", "print(brief.key_findings)      # sourced findings", "print(brief.companies)         # extracted entities", "print(brief.recent_changes)    # field-level diffs", "print(brief.partner_trace)     # audit trail", "", "# Voice research", "brief = client.agent.research(", '    audio_file="earnings_call.wav",', '    input_mode="voice"', ")", "", "# Self-hosted memory", 'mems = client.memory.search(query="Okta risk")', "", "# Gateway with recovery routing", 'result = client.gateway.fetch(url="https://stripe.com/pricing")', "print(result.recovery_path)    # which tools tried", "print(result.data)             # extracted facts", "", "# Org context", "client.context.upsert(", '    workspace_id="ws",', "    contracts=[...],", "    risk_thresholds={...}", ")", "", "# Outcome recording", "client.outcomes.record(", '    entity="Stripe",', '    signal="pricing_change",', '    outcome="acted",', '    value={"savings": 6800}', ")"] },
          { lang: "TypeScript", lines: ["// npm install webdataos", "", 'const client = new WebDataOS({ apiKey: "key", workspaceId: "ws" });', "", "// LLM-powered research", "const brief = await client.agent.research({", '  task: "Assess vendor risk",', '  inputMode: "text",', "});", "console.log(brief.summary);", "console.log(brief.reasoning?.recommendations);", "", "// Gateway with recovery", "const result = await client.gateway.fetch({", '  url: "https://stripe.com/pricing"', "});", "console.log(result.recoveryPath);", "console.log(result.data);", "", "// Self-hosted memory", "const mems = await client.memory.search({", '  query: "Okta risk"', "});", "", "// Autonomous actions", "const actions = await client.actions.list(wsId);", 'await client.actions.approve(actionId, { approvedBy: "analyst@co.com" });', "await client.actions.execute(actionId);", "", "// Outcome stats", "const stats = await client.outcomes.stats(wsId);", "console.log(stats.hitRate);", "console.log(stats.signalAccuracy);"] },
        ].map((sdk, i) => (
          <div key={i} style={{ borderRadius: 14, background: T.bgInset, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600 }}>{sdk.lang}</div>
            <div style={{ padding: 16, fontSize: 11, lineHeight: 1.6, fontFamily: "'JetBrains Mono',monospace" }}>
              {sdk.lines.map((l, li) => <div key={li} style={{ color: l.startsWith("#") || l.startsWith("//") ? T.dim : T.muted, minHeight: l === "" ? 8 : "auto" }}>{l}</div>)}
            </div>
          </div>
        ))}
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
function WsPage({ tierId, setTierId, selDomains, toggleDomain, tier, activeDomains, pack, packId, setPackId, ws, setWs, nav, saveWorkspace }) {
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

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <Eye>Workspace setup</Eye>
      <h2 style={{ fontSize: 22, marginTop: 4 }}>Set up your intelligence workspace</h2>

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
              <button key={t.id} className="hl" onClick={() => setTierId(t.id)} style={{ textAlign: "left", padding: 20, borderRadius: 16, border: tierId === t.id ? `1.5px solid ${t.color}50` : `1px solid ${T.border}`, background: t.featured ? "linear-gradient(160deg,#141d35,#0f172a)" : T.bgCard, position: "relative", cursor: "pointer", outline: tierId === t.id ? `2px solid ${t.color}25` : "none", outlineOffset: 2 }}>
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
            <button onClick={async () => { setSaving(true); setError(null); try { await saveWorkspace(); setSaved(true); setTimeout(() => nav("Agent"), 600); } catch (e) { setError(e.message); } finally { setSaving(false); } }} style={{ padding: "12px 0", borderRadius: 12, border: "none", background: saved ? "#22c55e" : T.accent, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", flex: 1 }}>{saving ? "Saving..." : saved ? "\u2713 Saved \u2014 launching agent..." : "Save & launch agent"}</button>
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
  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      await runResearch(task);
      setDone(true);
    } catch (e) {
      setError(e.message);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };
  const r = report?.reasoning || { executive_summary: "", risk_posture: "waiting", materiality_assessments: [], recommendations: [], confidence: 0, reasoning_trace: [] };
  const summary = report?.summary || r.executive_summary;
  const reportActions = report ? actions.filter(a => a.run_id === report.run_id) : [];
  const approve = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "approved" } : a));
  const reject = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "rejected" } : a));

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px" }}>
      <Eye>Autonomous analyst</Eye><h2 style={{ fontSize: 20, marginTop: 4 }}>Research, reason, recommend, act</h2>
      <div style={{ marginTop: 12, padding: "4px 4px 4px 14px", borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}`, display: "flex", gap: 6 }}>
        <input value={task} onChange={e => setTask(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Research task..." style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: T.text }} />
        <button onClick={run} disabled={loading} style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: T.accent, color: "#000", fontWeight: 600, fontSize: 12, cursor: "pointer", opacity: loading ? .5 : 1, display: "flex", alignItems: "center", gap: 4 }}>{loading ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Analyzing</> : <><Brain size={13} /> Analyze</>}</button>
      </div>
      {error && <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", color: "#ef4444", fontSize: 12 }}>{error}</div>}

      {!report && !loading && <div style={{ marginTop: 14, padding: 18, borderRadius: 12, background: T.bgSub, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>No live report yet</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>Run a research task to fetch live Bright Data evidence and generate a backend report. The UI no longer preloads mock actions or mock reasoning here.</div>
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
            {reportActions.length === 0 && <div style={{ fontSize: 12, color: T.dim }}>No backend actions were proposed for this run.</div>}
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
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{report.org_context_used ? "Backend org context used" : "No backend org context for this run"}</div>
            <div style={{ fontSize: 11, color: T.muted }}>Sources: {report.sources?.length || 0}</div>
            <div style={{ fontSize: 11, color: T.muted }}>Partner trace: {report.partner_trace?.length || 0}</div>
          </div>
        </div>
      </div>}
    </div>
  );
}

/* ═══════ INTELLIGENCE ═══════ */
function IntelPage({ ws }) {
  const [records, setRecords] = useState([]);
  const [sources, setSources] = useState([]);
  const [retrieval, setRetrieval] = useState([]);
  const [query, setQuery] = useState(`vendor risk and market signals for ${ws.entities || ws.name}`);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const entityList = ws.entities.split(",").map(s => s.trim()).filter(Boolean);
  const signalList = ws.signals.split(",").map(s => s.trim()).filter(Boolean);
  const loadRecords = useCallback(async () => {
    setErr("");
    try {
      setRecords(await endpoints.listTopicRecords(ws.id));
    } catch (e) {
      setErr(e.message || "Could not load evidence records");
    }
  }, [ws.id]);
  useEffect(() => { loadRecords(); }, [loadRecords]);
  const runStep = async (step) => {
    setLoading(true);
    setErr("");
    try {
      await endpoints.createTopic({ id: ws.id, name: ws.name, description: ws.description || null, entities: entityList, watch_types: signalList, refresh_frequency_minutes: ws.refresh_frequency_minutes || 1440 });
      if (step === "discover") setSources(await endpoints.discoverSources(ws.id, 6));
      if (step === "refresh") {
        await endpoints.refreshTopic(ws.id, 4);
        await loadRecords();
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
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px" }}>
      <Eye>Intelligence engine</Eye>
      <h2 style={{ fontSize: 22, marginTop: 4 }}>Evidence records & retrieval</h2>
      <p style={{ color: T.dim, fontSize: 13, marginTop: 6, lineHeight: 1.7 }}>Create the workspace topic, discover live SERP sources, refresh evidence through the Bright Data gateway, and retrieve ranked context from saved records.</p>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {[["Sources", sources.length], ["Records", records.length], ["Retrieved", retrieval.length]].map(([label, value]) => <div key={label} style={{ padding: 14, borderRadius: 12, background: T.bgCard, border: `1px solid ${T.border}` }}><div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase" }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800, color: T.accent }}>{value}</div></div>)}
        </div>
      </div>
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
  return (<div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 24px" }}><Eye>Bright Data gateway</Eye><h2 style={{ fontSize: 22, marginTop: 4 }}>Self-healing retrieval with recovery routing</h2><p style={{ color: T.dim, fontSize: 13, marginTop: 6, lineHeight: 1.7 }}>Live Bright Data routes (SERP API, Web Scraper API, Web Unlocker, Scraping Browser, and optional MCP Server) with automatic failure detection (blocked, captcha, geo_blocked, rate_limited, javascript_required, selector_failed, empty_response, timeout) and recovery routing. Every attempt logged with tool, status, failure type, latency, and recovery path.</p></div>);
}

/* ═══════ ACTIONS ═══════ */
function ActPage({ actions, setActions }) {
  const [f, setF] = useState("all");
  const list = f === "all" ? actions : actions.filter(a => a.status === f);
  const approve = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "approved" } : a));
  const reject = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "rejected" } : a));
  const execute = id => setActions(p => p.map(a => a.id === id ? { ...a, status: "executed" } : a));
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 24px" }}>
      <Eye>Autonomous actions</Eye><h2 style={{ fontSize: 22, marginTop: 4 }}>Approval queue</h2>
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
            {a.status === "pending_approval" && <><button onClick={() => approve(a.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "#22c55e", color: "#000", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Approve</button><button onClick={() => reject(a.id)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.borderL}`, background: "transparent", color: T.dim, fontSize: 10, cursor: "pointer" }}>Reject</button></>}
            {(a.status === "approved" || a.status === "auto_approved") && <button onClick={() => execute(a.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: T.accent, color: "#000", fontSize: 10, fontWeight: 600, cursor: "pointer" }}><Play size={10} /> Execute</button>}
          </div>
        </div>)}
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
function DS({ t, children }) { return <div className="ai" style={{ marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>{t}</h3><div style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div></div>; }
function DC({ t, children }) { return <div style={{ padding: 12, borderRadius: 10, background: T.bgSub, border: `1px solid ${T.border}` }}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: T.text }}>{t}</div><div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>{children}</div></div>; }
function JB({ children }) { return <pre style={{ padding: 14, borderRadius: 10, background: T.bgInset, border: `1px solid ${T.border}`, fontSize: 11, fontFamily: "'JetBrains Mono'", color: T.accent, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: "6px 0", overflow: "auto" }}>{children}</pre>; }
const IS = { width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 7, background: T.bgCard, border: `1px solid ${T.borderL}`, fontSize: 12, color: T.text, outline: "none" };


const CSS = `@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;margin:0;padding:0}button,input,textarea,select{font:inherit;color:inherit}button{cursor:pointer}::selection{background:rgba(6,182,212,.25)}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:3px}.au{animation:fadeUp .5s ease both}.ai{animation:fadeIn .4s ease both}.s1{animation-delay:.08s}.s2{animation-delay:.16s}.s3{animation-delay:.24s}.hl{transition:transform .2s,box-shadow .2s}.hl:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3)}@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`;

createRoot(document.getElementById("root")).render(<App />);
