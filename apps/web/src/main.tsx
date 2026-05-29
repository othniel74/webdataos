import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowRight, BarChart3, Brain, Briefcase, CheckCircle2, Code2, Database,
  Globe, KeyRound, Layers3, LogOut, Mail, Mic, Network, Play, RefreshCw, Scale,
  Send, Shield, ShieldCheck, Target, TerminalSquare, ThumbsDown, ThumbsUp,
  TrendingUp, User, Workflow, Zap,
} from 'lucide-react';
import './styles.css';

/* ═══════════════════════════════════════════════════════════════════════
   API LAYER
   ═══════════════════════════════════════════════════════════════════════ */
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const KEY = import.meta.env.VITE_API_KEY || 'dev-local-key-change-me';
const hdrs = (): HeadersInit => ({ 'Content-Type': 'application/json', 'X-API-Key': KEY });

async function api<T>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: hdrs(), ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

const endpoints = {
  health: () => api<any>('GET', '/health'),
  listPacks: () => api<any[]>('GET', '/workspaces/packages'),
  createWorkspace: (data: any) => api<any>('POST', '/workspaces', data),
  listWorkspaces: () => api<any[]>('GET', '/workspaces'),
  getWorkspace: (id: string) => api<any>('GET', `/workspaces/${id}`),
  research: (data: any) => api<any>('POST', '/agent/research', data),
  listRuns: () => api<any[]>('GET', '/runs'),
  getRun: (id: string) => api<any>('GET', `/runs/${id}`),
  gatewayFetch: (data: any) => api<any>('POST', '/gateway/fetch', data),
  listRecords: (topicId?: string) => api<any[]>('GET', `/intelligence/records${topicId ? `?topic_id=${topicId}` : ''}`),
  refreshTopic: (id: string) => api<any>('POST', `/intelligence/topics/${id}/refresh`),
  discoverSources: (id: string) => api<any[]>('POST', `/intelligence/topics/${id}/discover`),
  upsertContext: (data: any) => api<any>('POST', '/context', data),
  getContext: (wsId: string) => api<any>('GET', `/context/${wsId}`),
  listActions: (wsId: string, status?: string) => api<any[]>('GET', `/actions/${wsId}${status ? `?status=${status}` : ''}`),
  approveAction: (id: string, data: any) => api<any>('POST', `/actions/${id}/approve`, data),
  executeAction: (id: string) => api<any>('POST', `/actions/${id}/execute`),
  recordOutcome: (data: any) => api<any>('POST', '/outcomes', data),
  listOutcomes: (wsId: string) => api<any[]>('GET', `/outcomes/${wsId}`),
  outcomeStats: (wsId: string) => api<any>('GET', `/outcomes/${wsId}/stats`),
  transcribe: (data: any) => api<any>('POST', '/transcriptions', data),
  memorySearch: (data: any) => api<any[]>('POST', '/memory/search', data),
  workflowTrigger: (data: any) => api<any>('POST', '/workflows/trigger', data),
};

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */
type PackId = 'security' | 'gtm' | 'finance' | 'enterprise';
type Page = 'Landing' | 'Docs' | 'Developer' | 'Workspace' | 'Agent' | 'Intelligence' | 'Gateway' | 'Actions' | 'Outcomes';

interface Pack { id: PackId; name: string; tier: string; description: string; entities: string[]; signals: string[]; brightdata_routes: string[]; output_focus: string[]; input_channels: string[]; partner_routes: string[]; }
interface Workspace { id: string; name: string; package_id: PackId; cadence: string; entities: string; signals: string; }
interface AppUser { name: string; initials: string; email: string; }

const PUBLIC: Page[] = ['Landing', 'Docs', 'Developer'];
const PRIVATE: Page[] = ['Workspace', 'Agent', 'Intelligence', 'Gateway', 'Actions', 'Outcomes'];

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'workspace';
const pct = (n: number) => `${Math.round(n * 100)}%`;

/* ═══════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════ */
function App() {
  const [page, setPage] = useState<Page>('Landing');
  const [user, setUser] = useState<AppUser | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [packId, setPackId] = useState<PackId>('enterprise');
  const [packs, setPacks] = useState<Pack[]>([]);
  const [ws, setWs] = useState<Workspace>({ id: 'workspace_enterprise', name: 'Enterprise Intelligence Workspace', package_id: 'enterprise', cadence: 'Daily', entities: 'Okta, Stripe, HubSpot, OpenAI, Anthropic', signals: 'breach_exposure, regulatory_update, pricing_change, supplier_risk' });
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  const pack = useMemo(() => packs.find(p => p.id === packId) || packs[0], [packs, packId]);
  const nav = useCallback((target: Page) => {
    if ((PRIVATE as string[]).includes(target) && !user) { setShowAuth(true); return; }
    setPage(target);
  }, [user]);

  useEffect(() => {
    endpoints.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    endpoints.listPacks().then(setPacks).catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <Header page={page} setPage={nav} user={user} onAuth={() => setShowAuth(true)} onSignOut={() => { setUser(null); setPage('Landing'); }} backendOk={backendOk} />
      {page === 'Landing' && <Landing setPage={nav} packId={packId} setPackId={setPackId} packs={packs} user={user} openAuth={() => setShowAuth(true)} />}
      {page === 'Docs' && <DocsPage />}
      {page === 'Developer' && <DeveloperPage />}
      {page === 'Workspace' && user && <WorkspacePage pack={pack} packId={packId} setPackId={setPackId} packs={packs} ws={ws} setWs={setWs} setPage={nav} />}
      {page === 'Agent' && user && <AgentPage pack={pack} ws={ws} />}
      {page === 'Intelligence' && user && <IntelligencePage ws={ws} />}
      {page === 'Gateway' && user && <GatewayPage />}
      {page === 'Actions' && user && <ActionsPage ws={ws} />}
      {page === 'Outcomes' && user && <OutcomesPage ws={ws} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={u => { setUser(u); setShowAuth(false); setPage('Workspace'); }} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTH MODAL
   ═══════════════════════════════════════════════════════════════════════ */
function AuthModal({ onClose, onAuth }: { onClose: () => void; onAuth: (u: AppUser) => void }) {
  const [email, setEmail] = useState(''); const [name, setName] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); if (!email) return; onAuth({ email, name: name || email.split('@')[0], initials: (name || email)[0].toUpperCase() }); };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center' }}>
      <div onClick={e => e.stopPropagation()} className="anim-up card" style={{ width: 400, maxWidth: '92vw', padding: '32px 28px', position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, margin: '0 auto 12px', background: 'linear-gradient(135deg, var(--accent), #0891b2)', display: 'grid', placeItems: 'center' }}><Layers3 size={18} color="#fff" /></div>
          <h2 style={{ fontSize: 20 }}>Sign in to WebDataOS</h2>
          <p style={{ color: 'var(--text-d)', fontSize: 13, marginTop: 6 }}>Access your intelligence workspaces</p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 10, background: 'var(--bg-sub)', border: '1px solid var(--border-l)' }}><User size={14} color="var(--text-d)" /><input className="input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} style={{ border: 'none', background: 'transparent', padding: '10px 0' }} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 10, background: 'var(--bg-sub)', border: '1px solid var(--border-l)' }}><Mail size={14} color="var(--text-d)" /><input className="input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ border: 'none', background: 'transparent', padding: '10px 0' }} required /></div>
          <button type="submit" className="btn btn-primary btn-md" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>Sign in</button>
        </form>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: 'var(--text-d)', fontSize: 18 }}>&times;</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════════════════════════════════ */
function Header({ page, setPage, user, onAuth, onSignOut, backendOk }: { page: Page; setPage: (p: Page) => void; user: AppUser | null; onAuth: () => void; onSignOut: () => void; backendOk: boolean | null }) {
  return (
    <header className="header">
      <button onClick={() => setPage('Landing')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), #0891b2)', display: 'grid', placeItems: 'center' }}><Layers3 size={15} color="#fff" /></div>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em' }}>WebDataOS</span>
        <span className="badge" style={{ background: backendOk === true ? 'rgba(34,197,94,.1)' : backendOk === false ? 'rgba(239,68,68,.1)' : 'rgba(255,255,255,.04)', color: backendOk === true ? 'var(--green)' : backendOk === false ? 'var(--red)' : 'var(--text-d)', fontSize: 10 }}>{backendOk === true ? 'API connected' : backendOk === false ? 'API offline' : 'checking...'}</span>
      </button>
      <nav className="nav-pill">
        {PUBLIC.map(n => <button key={n} className={page === n ? 'active' : ''} onClick={() => setPage(n)}>{n}</button>)}
        {user && <><div className="nav-divider" />{PRIVATE.map(n => <button key={n} className={page === n ? 'active' : ''} onClick={() => setPage(n)}>{n}</button>)}</>}
      </nav>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {user ? <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px 5px 6px', borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)' }}>
            <div style={{ width: 24, height: 24, borderRadius: 999, background: 'linear-gradient(135deg, var(--accent), #0891b2)', display: 'grid', placeItems: 'center', color: '#000', fontSize: 11, fontWeight: 700 }}>{user.initials}</div>
            <span style={{ fontSize: 12, color: 'var(--text-m)' }}>{user.name}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onSignOut}><LogOut size={12} /></button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={onAuth}>Sign in</button>
          <button className="btn btn-primary btn-sm" onClick={onAuth}>Get started</button>
        </>}
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LANDING (Public)
   ═══════════════════════════════════════════════════════════════════════ */
function Landing({ setPage, packId, setPackId, packs, user, openAuth }: { setPage: (p: Page) => void; packId: PackId; setPackId: (id: PackId) => void; packs: Pack[]; user: AppUser | null; openAuth: () => void }) {
  const go = user ? () => setPage('Workspace') : openAuth;
  return <div>
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 60px', textAlign: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, var(--accent-glow), transparent 70%)', pointerEvents: 'none' }} />
      <div className="anim-up" style={{ display: 'inline-flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['Bright Data', 'Speechmatics', 'Cognee', 'TriggerWare', 'OpenAI'].map(p => <span key={p} className="chip chip-accent">{p}</span>)}
      </div>
      <h1 className="anim-up stagger-1" style={{ fontSize: 'clamp(36px,5vw,64px)', background: 'linear-gradient(180deg, #f1f5f9 30%, #64748b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', maxWidth: 800, margin: '0 auto' }}>
        Live-web intelligence that listens, remembers, retrieves, and acts
      </h1>
      <p className="anim-up stagger-2" style={{ maxWidth: 580, margin: '20px auto 0', fontSize: 16, lineHeight: 1.7, color: 'var(--text-m)' }}>
        Enterprise AI agents backed by fresh public-web evidence. LLM-powered analysis with Cognee memory, Bright Data retrieval, and TriggerWare workflow automation.
      </p>
      <div className="anim-up stagger-3" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28 }}>
        <button className="btn btn-primary btn-lg" onClick={go}>{user ? 'Go to workspace' : 'Get started'} <ArrowRight size={15} /></button>
        <button className="btn btn-ghost btn-lg" onClick={() => setPage('Developer')}>API docs</button>
      </div>
    </section>
    {packs.length > 0 && <section style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 60px' }}>
      <div className="eyebrow" style={{ textAlign: 'center' }}>Intelligence packages</div>
      <h2 style={{ textAlign: 'center', fontSize: 28, marginTop: 6 }}>Start focused. Upgrade to the full OS.</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 28 }}>
        {packs.map(p => <button key={p.id} className={`card hover-lift anim-up ${packId === p.id ? 'selected' : ''}`} onClick={() => setPackId(p.id as PackId)} style={{ textAlign: 'left', padding: 20, cursor: 'pointer', border: packId === p.id ? '1.5px solid rgba(6,182,212,.4)' : '1px solid var(--border)', outline: packId === p.id ? '2px solid rgba(6,182,212,.2)' : 'none', outlineOffset: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-d)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{p.tier}</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, marginBottom: 6 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-d)', lineHeight: 1.5, marginBottom: 10 }}>{p.description}</div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{p.brightdata_routes.map(r => <span key={r} className="mono" style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: 'rgba(6,182,212,.06)', color: 'var(--accent)' }}>{r}</span>)}</div>
        </button>)}
      </div>
    </section>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   WORKSPACE (Private) — real API calls
   ═══════════════════════════════════════════════════════════════════════ */
function WorkspacePage({ pack, packId, setPackId, packs, ws, setWs, setPage }: { pack: Pack; packId: PackId; setPackId: (id: PackId) => void; packs: Pack[]; ws: Workspace; setWs: (w: Workspace) => void; setPage: (p: Page) => void }) {
  const [tab, setTab] = useState<'workspace' | 'context'>('workspace');
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<any>(null);

  useEffect(() => { endpoints.getContext(ws.id).then(setCtx).catch(() => {}); }, [ws.id]);

  async function saveWorkspace() {
    setSaving(true); setError(null);
    try {
      const result = await endpoints.createWorkspace({
        id: ws.id || slug(ws.name), name: ws.name, package_id: packId,
        entities: ws.entities.split(',').map(s => s.trim()).filter(Boolean),
        signals: ws.signals.split(',').map(s => s.trim()).filter(Boolean),
        refresh_frequency_minutes: ws.cadence === 'Every 6 hours' ? 360 : ws.cadence === 'Weekly' ? 10080 : 1440,
      });
      setWs({ ...ws, id: result.id, package_id: result.package_id });
      setSaved(true);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  return <div className="container">
    <div className="eyebrow">Workspace setup</div>
    <h2 style={{ fontSize: 24, marginTop: 6 }}>Configure workspace & context</h2>
    <div className="nav-pill" style={{ marginTop: 14, width: 'fit-content' }}>
      <button className={tab === 'workspace' ? 'active' : ''} onClick={() => setTab('workspace')}>Workspace</button>
      <button className={tab === 'context' ? 'active' : ''} onClick={() => setTab('context')}>Org Context</button>
    </div>

    {tab === 'workspace' && <div className="anim-in panel-grid" style={{ marginTop: 16, gridTemplateColumns: '240px 1fr' }}>
      <div style={{ padding: 18, borderRight: '1px solid var(--border)' }}>
        <div className="label">Package</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          {packs.map(p => <button key={p.id} onClick={() => setPackId(p.id as PackId)} style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 12, border: packId === p.id ? '1px solid rgba(6,182,212,.3)' : '1px solid transparent', background: packId === p.id ? 'rgba(6,182,212,.06)' : 'transparent', color: packId === p.id ? 'var(--text)' : 'var(--text-d)', cursor: 'pointer' }}>{p.name}</button>)}
        </div>
        {pack && <>
          <div className="label" style={{ marginTop: 14 }}>Bright Data routes</div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>{pack.brightdata_routes?.map(r => <span key={r} className="mono" style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: 'rgba(6,182,212,.06)', color: 'var(--accent)' }}>{r}</span>)}</div>
          <div className="label" style={{ marginTop: 10 }}>Partners</div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>{pack.partner_routes?.map(r => <span key={r} className="chip chip-accent">{r}</span>)}</div>
        </>}
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label><span className="label">Workspace name</span><input className="input" value={ws.name} onChange={e => setWs({ ...ws, name: e.target.value, id: slug(e.target.value) })} /></label>
          <label><span className="label">Cadence</span><select className="input" value={ws.cadence} onChange={e => setWs({ ...ws, cadence: e.target.value })}><option>Daily</option><option>Weekly</option><option>Every 6 hours</option><option>Manual only</option></select></label>
          <label style={{ gridColumn: 'span 2' }}><span className="label">Entities to monitor</span><textarea className="textarea" value={ws.entities} onChange={e => setWs({ ...ws, entities: e.target.value })} /></label>
          <label style={{ gridColumn: 'span 2' }}><span className="label">Signals to watch</span><textarea className="textarea" value={ws.signals} onChange={e => setWs({ ...ws, signals: e.target.value })} /></label>
        </div>
        {error && <div className="error-msg" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className={`btn ${saved ? 'btn-success' : 'btn-primary'} btn-md`} onClick={saveWorkspace} disabled={saving}>{saving ? 'Saving...' : saved ? '✓ Saved' : 'Save workspace'}</button>
          <button className="btn btn-ghost btn-md" onClick={() => setPage('Agent')}>Launch agent →</button>
        </div>
      </div>
    </div>}

    {tab === 'context' && <div className="anim-in card" style={{ marginTop: 16, padding: 20 }}>
      {ctx ? <>
        <h3 style={{ fontSize: 16, marginBottom: 14 }}>Organizational Context Loaded</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="card-inset" style={{ padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Scale size={14} color="var(--purple)" /> Risk Thresholds</div>
            {ctx.risk_thresholds && Object.entries(ctx.risk_thresholds).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}><span style={{ color: 'var(--text-d)' }}>{k.replace(/_/g, ' ')}</span><span className="mono">{String(v)}</span></div>)}
          </div>
          <div className="card-inset" style={{ padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={14} color="var(--green)" /> Financial Exposure</div>
            {ctx.financial_exposure && Object.entries(ctx.financial_exposure).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}><span style={{ color: 'var(--text-d)' }}>{k.replace(/_/g, ' ')}</span><span className="mono">{typeof v === 'number' ? `$${(v as number).toLocaleString()}` : String(v)}</span></div>)}
          </div>
        </div>
        {ctx.contracts?.length > 0 && <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Contracts ({ctx.contracts.length})</div>
          {ctx.contracts.map((c: any, i: number) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <span><b>{c.entity_name}</b> — {c.vendor_type}</span>
            <span className="mono">${c.annual_value?.toLocaleString()} · renews {c.renewal_date}</span>
          </div>)}
        </div>}
      </> : <div style={{ color: 'var(--text-d)', fontSize: 13 }}>
        <p>No organizational context configured for this workspace.</p>
        <p style={{ marginTop: 6 }}>Use <code className="mono" style={{ background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: 4 }}>POST /context</code> to add contracts, risk thresholds, financial exposure, and strategic priorities. The reasoning engine uses this context to assess materiality of each finding.</p>
      </div>}
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   AGENT (Private) — real research API call
   ═══════════════════════════════════════════════════════════════════════ */
function AgentPage({ pack, ws }: { pack: Pack; ws: Workspace }) {
  const [task, setTask] = useState(`Assess current ${pack?.name || 'enterprise'} signals for: ${ws.entities}.`);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => { endpoints.listRuns().then(setRuns).catch(() => {}); }, []);

  async function runResearch(e?: FormEvent) {
    e?.preventDefault(); setLoading(true); setError(null);
    try {
      const result = await endpoints.research({
        task, workspace_id: ws.id, topic_id: ws.id, package_id: ws.package_id,
        freshness_required_days: 7, max_sources: 8, input_mode: inputMode,
        transcript_text: inputMode === 'voice' ? task : undefined,
        enable_memory: true, enable_workflows: true,
      });
      setReport(result);
      endpoints.listRuns().then(setRuns).catch(() => {});
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  return <div className="container-lg">
    <div className="eyebrow">Intelligence agent</div>
    <h2 style={{ fontSize: 22, marginTop: 4 }}>Ask, remember, retrieve, and act</h2>
    <div style={{ color: 'var(--text-d)', fontSize: 12, marginTop: 2 }}>{ws.name} · {pack?.name} · {inputMode} mode</div>

    <div className="anim-up panel-grid" style={{ marginTop: 14, gridTemplateColumns: '170px 1fr 230px', minHeight: 480 }}>
      {/* Runs */}
      <div style={{ padding: 12, borderRight: '1px solid var(--border)' }}>
        <div className="label" style={{ marginBottom: 8 }}>Runs ({runs.length})</div>
        {runs.slice(0, 8).map(r => <div key={r.id} style={{ padding: '5px 8px', borderRadius: 6, marginBottom: 2, background: report?.run_id === r.id ? 'rgba(255,255,255,.03)' : 'transparent', cursor: 'pointer' }} onClick={() => endpoints.getRun(r.id).then(d => d.report && setReport(d.report)).catch(() => {})}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.task?.slice(0, 28)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-d)' }}>{r.status} · {r.id?.slice(0, 8)}</div>
        </div>)}
      </div>

      {/* Chat */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><b style={{ fontSize: 13 }}>{pack?.name || 'Agent'}</b><div style={{ fontSize: 11, color: 'var(--text-d)' }}>LLM-powered intelligence agent</div></div>
          <div className="nav-pill" style={{ border: 'none', background: 'rgba(255,255,255,.04)' }}>
            <button className={inputMode === 'text' ? 'active' : ''} onClick={() => setInputMode('text')}>text</button>
            <button className={inputMode === 'voice' ? 'active' : ''} onClick={() => setInputMode('voice')}>voice</button>
          </div>
        </div>
        <div style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {report && <>
            <div style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: '10px 14px', borderRadius: '12px 12px 4px 12px', background: 'rgba(6,182,212,.1)', border: '1px solid rgba(6,182,212,.15)', fontSize: 13, lineHeight: 1.5 }}>{report.task}</div>
            <div style={{ maxWidth: '88%', padding: '12px 14px', borderRadius: '12px 12px 12px 4px', background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.6, color: 'var(--text-m)' }}>{report.summary}</div>
            {report.key_findings?.length > 0 && <div className="card-inset" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--accent)' }}>Key findings ({report.key_findings.length})</div>
              {report.key_findings.slice(0, 6).map((f: string, i: number) => <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '4px 0', fontSize: 12, color: 'var(--text-m)', borderBottom: i < Math.min(report.key_findings.length, 6) - 1 ? '1px solid var(--border)' : 'none' }}><CheckCircle2 size={12} color="var(--green)" style={{ marginTop: 2, flexShrink: 0 }} />{f}</div>)}
            </div>}
            {report.companies?.length > 0 && <div className="card-inset" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--amber)' }}>Companies ({report.companies.length})</div>
              {report.companies.slice(0, 4).map((c: any, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-m)', padding: '3px 0' }}><b style={{ color: 'var(--text)' }}>{c.name}</b> · {c.positioning} · {c.pricing_model}</div>)}
            </div>}
            {report.recent_changes?.length > 0 && <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.1)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--red)' }}>Changes detected</div>
              {report.recent_changes.map((c: any, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-m)' }}><b>{c.field || c.entity}</b>: {c.old_value && JSON.stringify(c.old_value)} → {c.new_value && JSON.stringify(c.new_value)}</div>)}
            </div>}
            {report.reasoning && <div className="card-inset" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--purple)' }}>Reasoning — {report.reasoning.materiality_assessments?.length || 0} assessments, {report.reasoning.recommendations?.length || 0} recommendations</div>
              {report.reasoning.recommendations?.slice(0, 3).map((r: any, i: number) => <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ color: 'var(--text)' }}>{r.title}</b><span className={`badge badge-${r.materiality}`}>{r.materiality}</span></div>
                <div style={{ color: 'var(--text-d)', marginTop: 2 }}>{r.description}</div>
              </div>)}
            </div>}
          </>}
          {loading && <div className="loader"><RefreshCw size={14} className="spin-icon" /> Researching...</div>}
          {error && <div className="error-msg">{error}</div>}
          {!report && !loading && <div style={{ color: 'var(--text-d)', fontSize: 13, padding: 20, textAlign: 'center' }}>Submit a research task to begin.</div>}
        </div>
        <form className="anim-in" onSubmit={runResearch} style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6, padding: '4px 4px 4px 12px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <input className="input" value={task} onChange={e => setTask(e.target.value)} placeholder="Research task..." style={{ border: 'none', background: 'transparent', padding: '8px 0' }} />
            <button className="btn btn-primary btn-sm" disabled={loading} type="submit">{inputMode === 'voice' ? <Mic size={14} /> : <Send size={14} />}</button>
          </div>
        </form>
      </div>

      {/* Inspector */}
      <div style={{ padding: 12, overflowY: 'auto', fontSize: 12 }}>
        <div className="label" style={{ marginBottom: 10 }}>Inspector</div>
        {report && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 12 }}>
            <div className="metric"><div className="label">Confidence</div><div className="value" style={{ color: 'var(--green)' }}>{pct(report.confidence || 0)}</div></div>
            <div className="metric"><div className="label">Sources</div><div className="value" style={{ color: 'var(--accent)' }}>{report.sources?.length || 0}</div></div>
            <div className="metric"><div className="label">Memories</div><div className="value" style={{ color: 'var(--amber)' }}>{report.memories_used?.length || 0}</div></div>
            <div className="metric"><div className="label">Events</div><div className="value" style={{ color: 'var(--red)' }}>{report.workflow_events?.length || 0}</div></div>
          </div>
          {report.org_context_used && <div className="chip chip-accent" style={{ marginBottom: 8 }}>Org context applied</div>}
          <div className="label" style={{ marginBottom: 4 }}>Partner trace</div>
          {report.partner_trace?.map((t: string, i: number) => <div key={i} className="mono" style={{ color: 'var(--text-d)', padding: '2px 0', fontSize: 11 }}>● {t}</div>)}
          <div className="label" style={{ marginTop: 10, marginBottom: 4 }}>Plan</div>
          {report.plan?.map((s: any, i: number) => <div key={i} style={{ color: 'var(--text-d)', padding: '2px 0', fontSize: 11 }}><b style={{ color: 'var(--text)' }}>{s.step}.</b> {s.action}{s.tool_hint ? ` [${s.tool_hint}]` : ''}</div>)}
        </>}
      </div>
    </div>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   INTELLIGENCE (Private) — real records API
   ═══════════════════════════════════════════════════════════════════════ */
function IntelligencePage({ ws }: { ws: Workspace }) {
  const [records, setRecords] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { endpoints.listRecords(ws.id).then(r => { setRecords(r); if (r.length > 0) setSelected(r[0]); }).catch(() => {}).finally(() => setLoading(false)); }, [ws.id]);

  async function refresh() { setRefreshing(true); try { await endpoints.refreshTopic(ws.id); const r = await endpoints.listRecords(ws.id); setRecords(r); } catch {} finally { setRefreshing(false); } }

  return <div className="container">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
      <div><div className="eyebrow">Intelligence engine</div><h2 style={{ fontSize: 22, marginTop: 4 }}>Evidence records</h2><div style={{ color: 'var(--text-d)', fontSize: 12, marginTop: 2 }}>{records.length} records · {records.filter(r => r.freshness_status === 'fresh').length} fresh</div></div>
      <button className="btn btn-primary btn-md" onClick={refresh} disabled={refreshing}><RefreshCw size={13} /> {refreshing ? 'Refreshing...' : 'Refresh'}</button>
    </div>
    {loading ? <div className="loader"><RefreshCw size={14} className="spin-icon" /> Loading records...</div> : records.length === 0 ? <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-d)' }}>No records yet. Click Refresh to discover and extract sources via Bright Data.</div> :
    <div className="panel-grid" style={{ gridTemplateColumns: '1fr 340px' }}>
      <div style={{ borderRight: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 60px', padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-d)', textTransform: 'uppercase', letterSpacing: '.06em' }}><span>Entity</span><span>Type</span><span>Status</span><span>Score</span></div>
        {records.map(r => <button key={r.id} onClick={() => setSelected(r)} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 60px', padding: '10px 14px', width: '100%', textAlign: 'left', borderBottom: '1px solid var(--border)', border: 'none', background: selected?.id === r.id ? 'rgba(255,255,255,.03)' : 'transparent', cursor: 'pointer', alignItems: 'center' }}>
          <div><div style={{ fontSize: 13, fontWeight: 500 }}>{r.entity_name}</div><div style={{ fontSize: 10, color: 'var(--text-d)', marginTop: 1 }}>{r.source_url}</div></div>
          <span style={{ fontSize: 11, color: 'var(--text-d)' }}>{r.source_type}</span>
          <span className={`badge badge-${r.freshness_status === 'fresh' ? 'fresh' : 'stale'}`}>{r.freshness_status}</span>
          <span className="mono" style={{ fontSize: 12, color: (r.confidence || 0) > 0.7 ? 'var(--green)' : 'var(--amber)' }}>{pct(r.confidence || 0)}</span>
        </button>)}
      </div>
      <div style={{ padding: 14 }}>
        {selected && <div className="anim-in">
          <h3 style={{ fontSize: 16 }}>{selected.entity_name}</h3>
          <div style={{ fontSize: 11, color: 'var(--text-d)', marginTop: 2 }}>{selected.entity_type} · {selected.source_type}</div>
          {selected.summary && <div className="card-inset" style={{ padding: 10, marginTop: 10, fontSize: 12, color: 'var(--text-m)', lineHeight: 1.55 }}>{selected.summary}</div>}
          {selected.facts && Object.keys(selected.facts).length > 0 && <div style={{ marginTop: 10 }}><div className="label" style={{ marginBottom: 4 }}>Extracted facts</div><div className="card-inset" style={{ padding: 10 }}>{Object.entries(selected.facts).map(([k, v]) => <div key={k} style={{ display: 'flex', gap: 6, padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}><span className="mono" style={{ color: 'var(--text-d)', minWidth: 100 }}>{k}:</span><span style={{ color: 'var(--text-m)' }}>{Array.isArray(v) ? (v as string[]).join(', ') : String(v)}</span></div>)}</div></div>}
        </div>}
      </div>
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   GATEWAY (Private) — real gateway fetch
   ═══════════════════════════════════════════════════════════════════════ */
function GatewayPage() {
  const [url, setUrl] = useState('https://stripe.com/pricing');
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function runFetch() { setRunning(true); setError(null); try { const r = await endpoints.gatewayFetch({ url: url || undefined, query: query || undefined, task_type: 'competitive_intelligence_extraction' }); setResponse(r); } catch (e: any) { setError(e.message); } finally { setRunning(false); } }

  return <div className="container">
    <div className="eyebrow">Bright Data gateway</div>
    <h2 style={{ fontSize: 22, marginTop: 4 }}>Self-healing retrieval with recovery routing</h2>
    <div className="card" style={{ padding: 16, marginTop: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <label><span className="label">URL</span><input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." /></label>
        <label><span className="label">Query (alternative to URL)</span><input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search query..." /></label>
        <button className="btn btn-primary btn-md" onClick={runFetch} disabled={running}>{running ? 'Fetching...' : 'Fetch'}</button>
      </div>
    </div>
    {error && <div className="error-msg" style={{ marginTop: 10 }}>{error}</div>}
    {response && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Recovery path</div>
        {response.recovery_path?.map((s: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span className={`badge ${s.status === 'success' ? 'badge-fresh' : 'badge-stale'}`}>{s.attempt}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.tool}</span><span className={`badge ${s.status === 'success' ? 'badge-fresh' : 'badge-stale'}`}>{s.status}</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-d)', marginTop: 2 }}>{s.latency_ms}ms{s.failure_type && s.failure_type !== 'none' ? ` · ${s.failure_type}` : ''}{s.reason ? ` · ${s.reason}` : ''}</div>
          </div>
        </div>)}
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Extracted data</div>
        <pre className="json-block">{JSON.stringify(response.data || {}, null, 2)}</pre>
      </div>
      <div className="card-inset" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Full response</div>
        <pre className="json-block">{JSON.stringify({ status: response.status, request_id: response.request_id, receipt_id: response.receipt_id, tool_used: response.tool_used, confidence: response.confidence, extracted_at: response.extracted_at, metadata: response.metadata }, null, 2)}</pre>
      </div>
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   ACTIONS (Private) — real actions API
   ═══════════════════════════════════════════════════════════════════════ */
function ActionsPage({ ws }: { ws: Workspace }) {
  const [actions, setActions] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => endpoints.listActions(ws.id, filter || undefined).then(setActions).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, [ws.id, filter]);

  async function approve(id: string) { try { await endpoints.approveAction(id, { approved_by: 'analyst@company.com', approve: true }); load(); } catch {} }
  async function reject(id: string) { try { await endpoints.approveAction(id, { approved_by: 'analyst@company.com', approve: false }); load(); } catch {} }
  async function execute(id: string) { try { await endpoints.executeAction(id); load(); } catch {} }

  const statusColor = (s: string) => s === 'pending_approval' ? 'var(--amber)' : s === 'approved' || s === 'auto_approved' ? 'var(--blue)' : s === 'executed' ? 'var(--green)' : s === 'rejected' ? 'var(--red)' : 'var(--text-d)';

  return <div className="container">
    <div className="eyebrow">Autonomous actions</div>
    <h2 style={{ fontSize: 22, marginTop: 4 }}>Approval queue</h2>
    <div className="nav-pill" style={{ marginTop: 12, width: 'fit-content' }}>
      {[['', 'All'], ['pending_approval', 'Pending'], ['approved', 'Approved'], ['executed', 'Executed'], ['rejected', 'Rejected']].map(([id, l]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{l}</button>)}
    </div>
    {loading ? <div className="loader" style={{ marginTop: 16 }}><RefreshCw size={14} className="spin-icon" /> Loading...</div> : actions.length === 0 ? <div className="card" style={{ padding: 20, marginTop: 12, textAlign: 'center', color: 'var(--text-d)' }}>No actions{filter ? ` with status "${filter}"` : ''}. Run a research task to generate autonomous action proposals.</div> :
    <div className="panel-grid" style={{ marginTop: 12 }}>
      {actions.map(a => <div key={a.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
            <span className="badge" style={{ background: `${statusColor(a.status)}15`, color: statusColor(a.status) }}>{a.status}</span>
            <span className="badge" style={{ background: 'rgba(255,255,255,.04)', color: 'var(--text-d)' }}>{a.action_type}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{a.title}</div>
          {a.description && <div style={{ fontSize: 11, color: 'var(--text-d)', marginTop: 2 }}>{a.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 10 }}>
          {a.status === 'pending_approval' && <><button className="btn btn-success btn-sm" onClick={() => approve(a.id)}><ThumbsUp size={11} /> Approve</button><button className="btn btn-danger btn-sm" onClick={() => reject(a.id)}><ThumbsDown size={11} /> Reject</button></>}
          {(a.status === 'approved' || a.status === 'auto_approved') && <button className="btn btn-primary btn-sm" onClick={() => execute(a.id)}><Play size={11} /> Execute</button>}
        </div>
      </div>)}
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   OUTCOMES (Private) — real outcomes API
   ═══════════════════════════════════════════════════════════════════════ */
function OutcomesPage({ ws }: { ws: Workspace }) {
  const [stats, setStats] = useState<any>(null);
  const [outcomes, setOutcomes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([endpoints.outcomeStats(ws.id), endpoints.listOutcomes(ws.id)])
      .then(([s, o]) => { setStats(s); setOutcomes(o); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [ws.id]);

  const outcomeColor = (o: string) => o === 'acted' ? 'var(--green)' : o === 'confirmed_useful' ? 'var(--accent)' : o === 'dismissed' ? 'var(--text-m)' : o === 'false_alarm' ? 'var(--red)' : 'var(--amber)';

  if (loading) return <div className="container"><div className="loader"><RefreshCw size={14} className="spin-icon" /> Loading...</div></div>;

  return <div className="container">
    <div className="eyebrow">Outcome learning</div>
    <h2 style={{ fontSize: 22, marginTop: 4 }}>What happened after recommendations</h2>
    {stats && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginTop: 16 }}>
        <div className="metric"><div className="label">Total</div><div className="value" style={{ color: 'var(--accent)' }}>{stats.total_outcomes}</div></div>
        <div className="metric"><div className="label">Acted</div><div className="value" style={{ color: 'var(--green)' }}>{stats.acted}</div></div>
        <div className="metric"><div className="label">Confirmed</div><div className="value" style={{ color: 'var(--accent)' }}>{stats.confirmed_useful}</div></div>
        <div className="metric"><div className="label">Dismissed</div><div className="value" style={{ color: 'var(--text-m)' }}>{stats.dismissed}</div></div>
        <div className="metric"><div className="label">False alarms</div><div className="value" style={{ color: 'var(--red)' }}>{stats.false_alarms}</div></div>
        <div className="metric"><div className="label">Hit rate</div><div className="value" style={{ color: stats.hit_rate > 0.7 ? 'var(--green)' : 'var(--amber)' }}>{pct(stats.hit_rate)}</div></div>
      </div>
      {stats.signal_accuracy && Object.keys(stats.signal_accuracy).length > 0 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Signal accuracy</div>
          {Object.entries(stats.signal_accuracy).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-m)' }}>{k.replace(/_/g, ' ')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="progress-bar"><div className="fill" style={{ width: `${(v as number) * 100}%`, background: (v as number) > 0.8 ? 'var(--green)' : (v as number) > 0.6 ? 'var(--amber)' : 'var(--red)' }} /></div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: (v as number) > 0.8 ? 'var(--green)' : 'var(--amber)', width: 36, textAlign: 'right' }}>{pct(v as number)}</span>
            </div>
          </div>)}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Entity accuracy</div>
          {Object.entries(stats.entity_accuracy).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-m)' }}>{k}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="progress-bar"><div className="fill" style={{ width: `${(v as number) * 100}%`, background: (v as number) > 0.8 ? 'var(--green)' : (v as number) > 0.6 ? 'var(--amber)' : 'var(--red)' }} /></div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: (v as number) > 0.8 ? 'var(--green)' : 'var(--amber)', width: 36, textAlign: 'right' }}>{pct(v as number)}</span>
            </div>
          </div>)}
        </div>
      </div>}
    </>}
    {outcomes.length > 0 && <div className="panel-grid" style={{ marginTop: 12 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>Recent outcomes</div>
      {outcomes.map((o: any) => <div key={o.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><span className="badge" style={{ background: `${outcomeColor(o.outcome_type)}15`, color: outcomeColor(o.outcome_type) }}>{o.outcome_type}</span><span style={{ fontSize: 12, fontWeight: 500 }}>{o.entity_name}</span></div>{o.feedback_text && <div style={{ fontSize: 11, color: 'var(--text-d)', marginTop: 2 }}>{o.feedback_text}</div>}</div>
        <span style={{ fontSize: 11, color: 'var(--text-d)' }}>{o.recorded_by}</span>
      </div>)}
    </div>}
    {!stats?.total_outcomes && <div className="card" style={{ padding: 20, marginTop: 12, textAlign: 'center', color: 'var(--text-d)' }}>No outcomes recorded yet. Use <code className="mono" style={{ background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: 4 }}>POST /outcomes</code> to record what happened after a recommendation.</div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   DOCS & DEVELOPER (Public — compact)
   ═══════════════════════════════════════════════════════════════════════ */
function DocsPage() {
  return <div className="container-sm">
    <div className="eyebrow">Documentation</div>
    <h2 style={{ fontSize: 22, marginTop: 6 }}>WebDataOS v3 API Reference</h2>
    <p style={{ color: 'var(--text-d)', fontSize: 13, marginTop: 6, lineHeight: 1.7 }}>All endpoints require <code className="mono" style={{ background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: 4 }}>X-API-Key</code> header. Base URL: <code className="mono" style={{ background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: 4 }}>{API}</code></p>
    <div className="panel-grid" style={{ marginTop: 16 }}>
      {[
        { m:'GET',p:'/health',d:'Health check' },{ m:'GET',p:'/workspaces/packages',d:'List intelligence packages' },
        { m:'POST',p:'/workspaces',d:'Create workspace' },{ m:'GET',p:'/workspaces',d:'List workspaces' },
        { m:'POST',p:'/agent/research',d:'Run LLM-powered research (text/voice/audio)' },
        { m:'POST',p:'/gateway/fetch',d:'Self-healing Bright Data fetch' },
        { m:'POST',p:'/intelligence/topics',d:'Create topic' },
        { m:'POST',p:'/intelligence/topics/{id}/discover',d:'Discover sources via SERP' },
        { m:'POST',p:'/intelligence/topics/{id}/refresh',d:'Refresh topic via gateway' },
        { m:'GET',p:'/intelligence/records',d:'List evidence records' },
        { m:'POST',p:'/intelligence/retrieval/context',d:'Retrieve ranked context' },
        { m:'POST',p:'/transcriptions',d:'Speechmatics transcription' },
        { m:'POST',p:'/memory/upsert',d:'Cognee + self-hosted memory store' },
        { m:'POST',p:'/memory/search',d:'Cognee + self-hosted memory search' },
        { m:'POST',p:'/workflows/trigger',d:'TriggerWare workflow' },
        { m:'GET',p:'/runs',d:'List agent runs' },{ m:'GET',p:'/runs/{id}',d:'Get run + report' },
        { m:'POST',p:'/context',d:'Upsert org context' },{ m:'GET',p:'/context/{ws_id}',d:'Get org context' },
        { m:'GET',p:'/actions/{ws_id}',d:'List autonomous actions' },
        { m:'POST',p:'/actions/{id}/approve',d:'Approve/reject action' },
        { m:'POST',p:'/actions/{id}/execute',d:'Execute action' },
        { m:'POST',p:'/outcomes',d:'Record outcome' },
        { m:'GET',p:'/outcomes/{ws_id}',d:'List outcomes' },
        { m:'GET',p:'/outcomes/{ws_id}/stats',d:'Outcome stats' },
        { m:'GET',p:'/metrics',d:'Prometheus metrics' },
      ].map((ep, i) => <div key={i} style={{ display:'grid', gridTemplateColumns:'60px 280px 1fr', padding:'8px 14px', borderBottom:'1px solid var(--border)', alignItems:'center', fontSize: 12 }}>
        <span className="mono" style={{ fontWeight:700, color: ep.m==='POST' ? 'var(--green)' : 'var(--accent)' }}>{ep.m}</span>
        <span className="mono">{ep.p}</span>
        <span style={{ color:'var(--text-d)' }}>{ep.d}</span>
      </div>)}
    </div>
  </div>;
}

function DeveloperPage() {
  return <div className="container-sm">
    <div className="eyebrow">Developer quickstart</div>
    <h2 style={{ fontSize: 22, marginTop: 6 }}>Python & TypeScript SDKs</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
      {[{lang:'Python',icon:<TerminalSquare size={16}/>,lines:[
        '# pip install webdataos','','client = WebDataOS(api_key="key", workspace_id="ws")','',"# LLM-powered research","brief = client.agent.research(task='Assess risk', input_mode='text')","print(brief.summary)  # contextual LLM analysis","print(brief.key_findings)","print(brief.reasoning)  # materiality assessments + recommendations","print(brief.partner_trace)  # full audit trail",'',"# Memory search","mems = client.memory.search(query='Okta risk')",'',"# Gateway with recovery","result = client.gateway.fetch(url='https://stripe.com/pricing')"
      ]},{lang:'TypeScript',icon:<Code2 size={16}/>,lines:[
        '// npm install webdataos','','const client = new WebDataOS({ apiKey: "key", workspaceId: "ws" });','',"// LLM-powered research","const brief = await client.agent.research({","  task: 'Assess risk', inputMode: 'text'","});","console.log(brief.summary);","console.log(brief.reasoning?.recommendations);",'',"// Gateway fetch","const result = await client.gateway.fetch({","  url: 'https://stripe.com/pricing'","});"
      ]}].map((sdk,i) => <div key={i} className="card-inset" style={{ overflow:'hidden' }}>
        <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:26, height:26, borderRadius:7, background:'rgba(6,182,212,.1)', display:'grid', placeItems:'center', color:'var(--accent)' }}>{sdk.icon}</div>
          <span style={{ fontWeight:600, fontSize:13 }}>{sdk.lang}</span>
        </div>
        <div className="mono" style={{ padding:16, fontSize:11, lineHeight:1.6 }}>
          {sdk.lines.map((l,li) => <div key={li} style={{ color: l.startsWith('#')||l.startsWith('//') ? 'var(--text-d)' : l==='' ? undefined : 'var(--text-m)', minHeight: l===''?8:'auto' }}>{l}</div>)}
        </div>
      </div>)}
    </div>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   MOUNT
   ═══════════════════════════════════════════════════════════════════════ */
createRoot(document.getElementById('root')!).render(<App />);
