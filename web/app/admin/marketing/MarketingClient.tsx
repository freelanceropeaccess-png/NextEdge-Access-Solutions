"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Role = "viewer" | "editor" | "manager" | "admin";
type Status = "draft" | "pending" | "approved" | "scheduled" | "published" | "failed";
type Post = { id: number; title: string; body: string; platforms: string[]; status: Status; scheduled_at: string | null; media_url: string; campaign: string; notes: string; author: string; created_at: string; updated_at: string };
type Act = { id: number; post_id: number | null; action: string; detail: string; who: string; at: string };
type Link = { id: number; label: string; url: string; sort: number; active: boolean; clicks: number };
type Brand = { voice: string; audience: string; services: string; hashtags: string; avoid: string; languages: string; goal: number };
type State = {
  me: { id: number; name: string; email: string; role: Role };
  posts: Post[]; activity: Act[]; links: Link[]; feeds: { id: number; name: string; url: string }[];
  team: { id: number; name: string; email: string; role: Role }[]; brand: Brand;
  platforms: { id: string; name: string; needs: string; ready: boolean }[]; aiReady: boolean;
  site: { orders30: number; sales30: number; products: number; customers: number };
  accounts?: { id: number; platform: string; name: string; status: string; error: string; expires_at: string | null }[];
  results?: { post_id: number; platform: string; ok: boolean; remote_id: string; error: string; at: string }[];
  connectReady?: { facebook: boolean; linkedin: boolean };
  media?: { id: number; url: string; title: string; width: number | null; height: number | null; at: string }[];
  automation?: { orderAlert: boolean; orderConfirm: boolean; orderStatus: boolean; approval: boolean; publishFail: boolean; alertEmail: string };
  emailReady?: boolean;
  emailLog?: { to: string; subject: string; kind: string; ok: boolean; error: string; at: string }[];
  scheduler?: { url: string; hasCronSecret: boolean; last: { at?: string; published?: number; failed?: number } };
};
type Mod = "dashboard" | "compose" | "calendar" | "inbox" | "analytics" | "brands" | "accounts" | "reports" | "strategy" | "feeds" | "automation" | "studio" | "bio" | "team" | "settings";

const RANK: Record<Role, number> = { viewer: 0, editor: 1, manager: 2, admin: 3 };
const PLAT: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", google_business: "Google Business" };
const STATUS_LABEL: Record<Status, string> = { draft: "Draft", pending: "Pending review", approved: "Approved", scheduled: "Scheduled", published: "Published", failed: "Failed" };
const MOVES: Record<Status, { to: Status; need: Role; label: string }[]> = {
  draft: [{ to: "pending", need: "editor", label: "Submit for review" }],
  pending: [{ to: "approved", need: "manager", label: "Approve" }, { to: "draft", need: "manager", label: "Send back" }],
  approved: [{ to: "scheduled", need: "manager", label: "Schedule" }, { to: "published", need: "manager", label: "Mark published" }, { to: "draft", need: "manager", label: "Back to draft" }],
  scheduled: [{ to: "published", need: "manager", label: "Mark published" }, { to: "failed", need: "manager", label: "Mark failed" }, { to: "approved", need: "manager", label: "Unschedule" }],
  failed: [{ to: "draft", need: "editor", label: "Back to draft" }],
  published: [],
};
const AI_TASKS: [string, string][] = [["facebook", "Facebook post"], ["instagram", "Instagram caption"], ["linkedin", "LinkedIn article"], ["youtube", "YouTube title & description"], ["tiktok", "TikTok script"], ["taglish", "Taglish voice-over"], ["caption", "Short caption"], ["hashtags", "Hashtags"], ["seo", "SEO description"], ["campaign", "Promo campaign"], ["repurpose", "Repurpose content"], ["schedule", "Publishing schedule"]];
const NAV: { group: string; items: [Mod, string, string][] }[] = [
  { group: "Workspace", items: [["dashboard", "Dashboard", "▦"], ["compose", "Compose Post", "✎"], ["calendar", "Content Calendar", "▤"], ["inbox", "Unified Inbox", "✉"], ["analytics", "Analytics", "▮"]] },
  { group: "Management", items: [["brands", "Brands", "◈"], ["accounts", "Social Accounts", "◎"], ["reports", "Reports", "⎙"], ["strategy", "Content Strategy", "✦"], ["feeds", "Feed Reader", "☰"], ["automation", "Automation", "⚡"], ["studio", "AI Creative Studio", "✺"], ["bio", "Link-in-Bio", "🔗"]] },
  { group: "Team", items: [["team", "Team Management", "👥"], ["settings", "Settings & Logs", "⚙"]] },
];

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—";
const peso = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");
const toLocalInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const z = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

async function call(body: unknown) {
  const r = await fetch("/api/admin/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}

export default function MarketingClient() {
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [mod, setMod] = useState<Mod>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<Partial<Post> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/marketing", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || "Couldn't load"); return; }
    setS(j);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { const m = new URLSearchParams(location.search).get("m") as Mod | null; if (m) setMod(m); setCollapsed(localStorage.getItem("mkCollapsed") === "1"); } catch {} }, []);
  const go = (m: Mod) => { setMod(m); setMobileNav(false); try { history.replaceState(null, "", "?m=" + m); } catch {} };
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 3500); };
  const run = async (body: unknown, okMsg: string) => { try { const r = await call(body); flash(okMsg); await load(); return r; } catch (e) { flash("⚠ " + (e as Error).message); return null; } };

  if (err) return <div className="mk"><Style /><div className="mk-main"><div className="mk-card">⚠ {err}</div></div></div>;
  if (!s) return <div className="mk"><Style /><div className="mk-main"><div className="mk-card">Loading Marketing Command Center…</div></div></div>;

  const can = (r: Role) => RANK[s.me.role] >= RANK[r];
  const posts = q ? s.posts.filter((p) => (p.title + " " + p.body + " " + p.campaign).toLowerCase().includes(q.toLowerCase())) : s.posts;
  const openCompose = (p?: Partial<Post>) => { setEditing(p ?? { title: "", body: "", platforms: [], status: "draft", scheduled_at: null, media_url: "", campaign: "", notes: "" }); go("compose"); };
  const pendingN = s.posts.filter((p) => p.status === "pending").length;

  return <div className={"mk" + (collapsed ? " mk-col" : "")}>
    <Style />
    <aside className={"mk-side" + (mobileNav ? " open" : "")}>
      <div className="mk-logo"><img src="/img/logo.png" alt="NEAS" className="mk-logo-img" /><span className="mk-hide"><b>NEAS</b><small>Marketing Command Center</small></span></div>
      <nav>{NAV.map((g) => <div key={g.group}><div className="mk-group mk-hide">{g.group}</div>
        {g.items.map(([id, label, icon]) => <button key={id} type="button" className={"mk-nav" + (mod === id ? " on" : "")} onClick={() => go(id)} title={label}><span className="mk-ic">{icon}</span><span className="mk-hide">{label}</span>{id === "dashboard" && pendingN > 0 && <span className="mk-badge mk-hide">{pendingN}</span>}</button>)}</div>)}</nav>
      <button type="button" className="mk-collapse" onClick={() => { const v = !collapsed; setCollapsed(v); try { localStorage.setItem("mkCollapsed", v ? "1" : "0"); } catch {} }}>{collapsed ? "»" : "« Collapse"}</button>
      <a className="mk-back mk-hide" href="/admin">← Store admin panel</a>
    </aside>
    <div className="mk-body">
      <header className="mk-top">
        <button type="button" className="mk-burger" onClick={() => setMobileNav(!mobileNav)} aria-label="Menu">☰</button>
        <div className="mk-ws">NextEdge Access Solutions</div>
        <input className="mk-search" placeholder="Search posts, campaigns…" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value && mod === "dashboard") go("calendar"); }} />
        <button type="button" className="mk-bell" onClick={() => go("dashboard")} title="Pending approvals">🔔{pendingN > 0 && <span className="mk-dot">{pendingN}</span>}</button>
        <div className="mk-user"><span className="mk-av">{s.me.name.slice(0, 1).toUpperCase()}</span><span className="mk-hide-sm"><b>{s.me.name}</b><small>{s.me.role}</small></span></div>
      </header>
      <main className="mk-main">
        {mod === "dashboard" && <Dashboard s={s} go={go} openCompose={openCompose} can={can} run={run} />}
        {mod === "compose" && <Compose s={s} can={can} post={editing} setPost={setEditing} run={run} />}
        {mod === "calendar" && <Calendar posts={posts} can={can} run={run} openCompose={openCompose} />}
        {mod === "inbox" && <Inbox s={s} go={go} can={can} />}
        {mod === "analytics" && <Analytics s={s} />}
        {mod === "brands" && <Brands s={s} can={can} run={run} />}
        {mod === "accounts" && <Accounts s={s} can={can} />}
        {mod === "reports" && <Reports s={s} />}
        {mod === "strategy" && <Strategy s={s} can={can} openCompose={openCompose} />}
        {mod === "feeds" && <Feeds s={s} can={can} run={run} openCompose={openCompose} />}
        {mod === "automation" && <Automation s={s} can={can} run={run} />}
        {mod === "studio" && <Studio s={s} can={can} run={run} openCompose={openCompose} />}
        {mod === "bio" && <Bio s={s} can={can} run={run} />}
        {mod === "team" && <Team s={s} can={can} run={run} />}
        {mod === "settings" && <Settings s={s} />}
      </main>
    </div>
    {toast && <div className="mk-toast" role="status">{toast}</div>}
  </div>;
}

type Run = (body: unknown, okMsg: string) => Promise<unknown>;
type Can = (r: Role) => boolean;

function H({ t, sub, children }: { t: string; sub?: string; children?: React.ReactNode }) {
  return <div className="mk-h"><div><h1>{t}</h1>{sub && <p>{sub}</p>}</div><div className="mk-row">{children}</div></div>;
}
function Empty({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return <div className="mk-empty"><div className="mk-empty-ic">{icon}</div><b>{title}</b><div>{children}</div></div>;
}
function Pill({ st }: { st: Status }) { return <span className={"mk-pill st-" + st}>{STATUS_LABEL[st]}</span>; }

function PostActions({ p, can, run, onEdit }: { p: Post; can: Can; run: Run; onEdit?: () => void }) {
  return <div className="mk-row" style={{ gap: 6 }}>
    {onEdit && p.status !== "published" && (can("manager") || ["draft", "failed"].includes(p.status)) && can("editor") && <button type="button" className="mk-btn sm ghost" onClick={onEdit}>Edit</button>}
    {["approved", "scheduled", "failed"].includes(p.status) && can("manager") && p.platforms.some((x) => ["facebook", "instagram", "linkedin"].includes(x)) && <button type="button" className="mk-btn sm" onClick={() => {
      if (!confirm("Publish this post now to " + p.platforms.filter((x) => ["facebook", "instagram", "linkedin"].includes(x)).map((x) => PLAT[x]).join(", ") + "? It goes live on your connected accounts.")) return;
      run({ action: "publishNow", id: p.id }, "Publishing finished — see results on the post");
    }}>🚀 Publish now</button>}
    {MOVES[p.status].filter((m) => can(m.need)).map((m) => <button key={m.to} type="button" className={"mk-btn sm" + (m.to === "draft" || m.to === "failed" ? " ghost" : "")} onClick={() => {
      if (m.to === "published" && !confirm("Mark as published? Do this only after the post is actually live on the platform.")) return;
      const note = m.to === "failed" || (p.status === "pending" && m.to === "draft") ? prompt("Reason (saved in the audit trail):") ?? "" : "";
      run({ action: "transition", id: p.id, to: m.to, note }, `${STATUS_LABEL[m.to]} ✓`);
    }}>{m.label}</button>)}
  </div>;
}

function Dashboard({ s, go, openCompose, can, run }: { s: State; go: (m: Mod) => void; openCompose: (p?: Partial<Post>) => void; can: Can; run: Run }) {
  const now = new Date();
  const today = s.posts.filter((p) => p.scheduled_at && sameDay(new Date(p.scheduled_at), now));
  const pending = s.posts.filter((p) => p.status === "pending");
  const failed = s.posts.filter((p) => p.status === "failed");
  const pubMonth = s.posts.filter((p) => p.status === "published" && new Date(p.updated_at).getMonth() === now.getMonth() && new Date(p.updated_at).getFullYear() === now.getFullYear()).length;
  const hr = now.getHours(); const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const goal = s.brand.goal || 0;
  return <>
    <div className="mk-card mk-hero">
      <div><h1>{greet}, {s.me.name.split(" ")[0]} <span className="mk-tag">{s.me.role.toUpperCase()}</span></h1><p>{now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })} · NextEdge Access Solutions</p></div>
      <div className="mk-row"><button type="button" className="mk-btn ghost" onClick={() => go("calendar")}>View calendar</button>{can("editor") && <button type="button" className="mk-btn" onClick={() => openCompose()}>+ New Post</button>}</div>
      <div className="mk-stats">
        <div className="mk-stat"><small>⚠ Need attention</small><b>{pending.length + failed.length}</b><span>items</span></div>
        <div className="mk-stat"><small>◷ Scheduled today</small><b>{today.length}</b><span>posts</span></div>
        <div className="mk-stat"><small>✉ Unread inbox</small><b>—</b><span>not connected</span></div>
        <div className="mk-stat"><small>⚑ Monthly goal</small><b>{pubMonth}{goal ? ` / ${goal}` : ""}</b><span>published{goal ? "" : " · set a goal in Brands"}</span>{goal > 0 && <div className="mk-bar"><i style={{ width: Math.min(100, (pubMonth / goal) * 100) + "%" }} /></div>}</div>
      </div>
    </div>
    <div className="mk-card"><div className="mk-label">Quick actions</div><div className="mk-row">
      {can("editor") && <button type="button" className="mk-btn ghost" onClick={() => openCompose()}>✎ Compose Post</button>}
      <button type="button" className="mk-btn ghost" onClick={() => go("accounts")}>◎ Connect Account</button>
      <button type="button" className="mk-btn ghost" onClick={() => go("calendar")}>▤ View Calendar</button>
      <button type="button" className="mk-btn ghost" onClick={() => go("reports")}>⎙ Run Report</button>
      <button type="button" className="mk-btn ghost" onClick={() => go("strategy")}>✦ AI Content</button>
    </div></div>
    {(pending.length > 0 || failed.length > 0) && <div className="mk-card"><div className="mk-label">Action items <span className="mk-badge">{pending.length + failed.length}</span></div>
      {[...failed, ...pending].map((p) => <div key={p.id} className={"mk-item " + (p.status === "failed" ? "bad" : "warn")}><div><b>{p.status === "failed" ? "Failed: " : "Waiting for approval: "}{p.title || "Untitled"}</b><small>{p.author} · updated {fmt(p.updated_at)}</small></div><PostActions p={p} can={can} run={run} onEdit={() => openCompose(p)} /></div>)}
    </div>}
    <div className="mk-grid4">
      <div className="mk-card mk-kpi"><small>Posts published · this month</small><b>{pubMonth}</b></div>
      <div className="mk-card mk-kpi"><small>Link-in-bio clicks · all time</small><b>{s.links.reduce((a, l) => a + l.clicks, 0)}</b></div>
      <div className="mk-card mk-kpi"><small>Store orders · last 30 days</small><b>{s.site.orders30}</b><span>{peso(s.site.sales30)}</span></div>
      <div className="mk-card mk-kpi"><small>Social reach · last 7 days</small><b>—</b><span className="mk-na">Needs connected accounts</span></div>
    </div>
    <div className="mk-grid2">
      <div className="mk-card"><div className="mk-label between">Recent posts <button type="button" className="mk-link" onClick={() => go("calendar")}>View all →</button></div>
        {s.posts.length ? s.posts.slice(0, 6).map((p) => <div key={p.id} className="mk-li" onClick={() => openCompose(p)} role="button" tabIndex={0}><Pill st={p.status} /><div><b>{p.title || "Untitled draft"}</b><small>{fmt(p.scheduled_at ?? p.updated_at)} · {p.author}{p.platforms.length ? " · " + p.platforms.map((x) => PLAT[x]).join(", ") : ""}</small></div></div>)
          : <Empty icon="✎" title="No posts yet">Create your first post with Compose.</Empty>}
      </div>
      <div className="mk-card"><div className="mk-label">Today&apos;s schedule</div>
        {today.length ? today.map((p) => <div key={p.id} className="mk-li"><Pill st={p.status} /><div><b>{p.title}</b><small>{new Date(p.scheduled_at!).toLocaleTimeString("en-PH", { timeStyle: "short" })}</small></div></div>) : <Empty icon="◷" title="Nothing scheduled today"><button type="button" className="mk-link" onClick={() => go("calendar")}>Plan ahead →</button></Empty>}
        <div className="mk-label" style={{ marginTop: 16 }}>Pending approvals</div>
        {pending.length ? pending.slice(0, 4).map((p) => <div key={p.id} className="mk-li"><Pill st={p.status} /><div><b>{p.title}</b><small>by {p.author}</small></div></div>) : <Empty icon="✓" title="No pending approvals">You&apos;re all caught up.</Empty>}
      </div>
    </div>
  </>;
}

function Compose({ s, can, post, setPost, run }: { s: State; can: Can; post: Partial<Post> | null; setPost: (p: Partial<Post> | null) => void; run: Run }) {
  const p = post ?? { title: "", body: "", platforms: [], status: "draft" as Status, scheduled_at: null, media_url: "", campaign: "", notes: "" };
  const set = (k: keyof Post, v: unknown) => setPost({ ...p, [k]: v });
  const locked = p.status === "published" || (!can("manager") && !!p.id && !["draft", "failed"].includes(p.status as string)) || !can("editor");
  const history = p.id ? s.activity.filter((a) => a.post_id === p.id) : [];
  const limits: Record<string, number> = { instagram: 2200, linkedin: 3000, tiktok: 2200, facebook: 63206, youtube: 5000, google_business: 1500 };
  const over = (p.platforms ?? []).filter((x) => (p.body ?? "").length > limits[x]);
  async function save(submit = false) {
    const r = (await run({ action: "savePost", id: p.id, title: p.title, body: p.body, platforms: p.platforms, scheduled_at: p.scheduled_at || null, media_url: p.media_url, campaign: p.campaign, notes: p.notes }, submit ? "Saved" : "Saved ✓")) as { id?: number } | null;
    if (r?.id && submit) await run({ action: "transition", id: r.id, to: "pending" }, "Submitted for review ✓");
    if (r?.id) setPost(null);
  }
  return <>
    <H t={p.id ? "Edit post" : "Compose post"} sub="Write once, tailor per platform. Posts follow Draft → Pending review → Approved → Scheduled → Published.">
      {p.id && <Pill st={p.status as Status} />}<button type="button" className="mk-btn ghost" onClick={() => setPost({ title: "", body: "", platforms: [], status: "draft", scheduled_at: null, media_url: "", campaign: "", notes: "" })}>New blank post</button>
    </H>
    <div className="mk-grid2 wide">
      <div className="mk-card">
        {locked && <div className="mk-note">{p.status === "published" ? "Published posts are read-only." : "Your role can view this post but not change it at this stage."}</div>}
        <label className="mk-f">Title (internal)<input value={p.title ?? ""} disabled={locked} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Facade cleaning promo – November" /></label>
        <label className="mk-f">Post text<textarea rows={10} value={p.body ?? ""} disabled={locked} onChange={(e) => set("body", e.target.value)} placeholder="Write your post, or generate one with AI on the right →" /></label>
        <div className="mk-mini">{(p.body ?? "").length} characters{over.length > 0 && <span className="mk-warn"> · too long for {over.map((x) => PLAT[x]).join(", ")}</span>}</div>
        <div className="mk-f">Platforms<div className="mk-row">{Object.entries(PLAT).map(([id, name]) => <label key={id} className={"mk-chip" + ((p.platforms ?? []).includes(id) ? " on" : "")}><input type="checkbox" disabled={locked} checked={(p.platforms ?? []).includes(id)} onChange={(e) => set("platforms", e.target.checked ? [...(p.platforms ?? []), id] : (p.platforms ?? []).filter((x) => x !== id))} />{name}</label>)}</div></div>
        <div className="mk-grid2">
          <label className="mk-f">Publish date &amp; time (PH)<input type="datetime-local" disabled={locked} value={toLocalInput(p.scheduled_at ?? null)} onChange={(e) => set("scheduled_at", e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
          <label className="mk-f">Campaign<input value={p.campaign ?? ""} disabled={locked} onChange={(e) => set("campaign", e.target.value)} placeholder="e.g. Q4 Wind Services" /></label>
        </div>
        <label className="mk-f">Image / video link<input value={p.media_url ?? ""} disabled={locked} onChange={(e) => set("media_url", e.target.value)} placeholder="https://…" /></label>
        {p.media_url && /^https?:|^\/api\/img\//.test(p.media_url) && <img src={p.media_url} alt="" className="mk-prev" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
        <label className="mk-f">Internal notes<textarea rows={2} value={p.notes ?? ""} disabled={locked} onChange={(e) => set("notes", e.target.value)} /></label>
        {!locked && <div className="mk-row"><button type="button" className="mk-btn ghost" onClick={() => save(false)}>Save draft</button>{(!p.id || p.status === "draft" || p.status === "failed") && <button type="button" className="mk-btn" onClick={() => save(true)}>Save &amp; submit for review</button>}</div>}
        {p.id && <div style={{ marginTop: 12 }}><PostActions p={p as Post} can={can} run={async (b, m) => { const r = await run(b, m); setPost(null); return r; }} />{can("manager") && <button type="button" className="mk-btn sm ghost danger" style={{ marginTop: 8 }} onClick={() => { if (confirm("Delete this post?")) run({ action: "deletePost", id: p.id }, "Deleted").then(() => setPost(null)); }}>Delete post</button>}</div>}
        {p.id && (s.results ?? []).some((r) => r.post_id === p.id) && <><div className="mk-label" style={{ marginTop: 16 }}>Publishing results</div>{(s.results ?? []).filter((r) => r.post_id === p.id).map((r, i) => <div key={i} className="mk-log">{r.ok ? "✅" : "❌"} <b>{PLAT[r.platform] ?? r.platform}</b> · {fmt(r.at)}{r.error && <div className="mk-warn">{r.error}</div>}</div>)}</>}
        {history.length > 0 && <><div className="mk-label" style={{ marginTop: 16 }}>Audit trail</div>{history.map((a) => <div key={a.id} className="mk-log"><b>{a.action}</b> · {a.who} · {fmt(a.at)}{a.detail && <div className="mk-mini">{a.detail}</div>}</div>)}</>}
      </div>
      <AiPanel s={s} can={can} onUse={(t) => set("body", (p.body ? p.body + "\n\n" : "") + t)} seed={p.title || ""} />
    </div>
  </>;
}

function AiPanel({ s, can, onUse, seed, defaultTask = "facebook" }: { s: State; can: Can; onUse?: (t: string) => void; seed?: string; defaultTask?: string }) {
  const [task, setTask] = useState(defaultTask); const [topic, setTopic] = useState(seed ?? ""); const [tone, setTone] = useState("");
  const [out, setOut] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function gen() {
    setBusy(true); setMsg("");
    try { const r = await call({ action: "ai", task, topic, tone }); setOut(r.text); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  return <div className="mk-card">
    <div className="mk-label">✦ AI content generator</div>
    {!s.aiReady && <div className="mk-note">AI is off: add a free <code>GEMINI_API_KEY</code> (from aistudio.google.com) or an <code>ANTHROPIC_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy. Nothing is generated until then.</div>}
    <label className="mk-f">Create<select value={task} onChange={(e) => setTask(e.target.value)}>{AI_TASKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label className="mk-f">Topic, service or content to repurpose<textarea rows={4} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Wind turbine blade inspection by IRATA rope access team in Ilocos Norte" /></label>
    <label className="mk-f">Tone (optional)<input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. urgent, friendly, technical" /></label>
    <button type="button" className="mk-btn" disabled={busy || !can("editor") || !s.aiReady} onClick={gen}>{busy ? "Generating…" : "Generate"}</button>
    {msg && <div className="mk-warn" style={{ marginTop: 8 }}>{msg}</div>}
    {out && <><label className="mk-f" style={{ marginTop: 12 }}>Result (editable)<textarea rows={12} value={out} onChange={(e) => setOut(e.target.value)} /></label>
      <div className="mk-row">{onUse && <button type="button" className="mk-btn" onClick={() => onUse(out)}>Use in post</button>}<button type="button" className="mk-btn ghost" onClick={() => navigator.clipboard?.writeText(out)}>Copy</button></div></>}
    <p className="mk-mini" style={{ marginTop: 10 }}>Uses your brand voice from Brands. Always review facts before publishing.</p>
  </div>;
}

function Calendar({ posts, can, run, openCompose }: { posts: Post[]; can: Can; run: Run; openCompose: (p?: Partial<Post>) => void }) {
  const [view, setView] = useState<"month" | "week" | "day" | "list">("month");
  const [cur, setCur] = useState(() => new Date());
  const [filter, setFilter] = useState<Status | "">("");
  const list = posts.filter((p) => !filter || p.status === filter);
  const days = useMemo(() => {
    if (view === "day") return [new Date(cur)];
    if (view === "week") { const st = new Date(cur); st.setDate(st.getDate() - st.getDay()); return Array.from({ length: 7 }, (_, i) => { const d = new Date(st); d.setDate(st.getDate() + i); return d; }); }
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1); const st = new Date(first); st.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(st); d.setDate(st.getDate() + i); return d; });
  }, [view, cur]);
  const shift = (n: number) => { const d = new Date(cur); if (view === "month") d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + n * (view === "week" ? 7 : 1)); setCur(d); };
  function drop(e: React.DragEvent, day: Date) {
    e.preventDefault(); const id = Number(e.dataTransfer.getData("text/plain")); const p = posts.find((x) => x.id === id); if (!p) return;
    const t = p.scheduled_at ? new Date(p.scheduled_at) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
    const n = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.getHours(), t.getMinutes());
    run({ action: "reschedule", id, scheduled_at: n.toISOString() }, "Moved to " + n.toLocaleDateString("en-PH"));
  }
  const unscheduled = list.filter((p) => !p.scheduled_at && p.status !== "published");
  const title = view === "month" ? cur.toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : view === "day" ? cur.toLocaleDateString("en-PH", { dateStyle: "full" }) : `Week of ${days[0].toLocaleDateString("en-PH", { dateStyle: "medium" })}`;
  return <>
    <H t="Content calendar" sub="Drag a post onto a day to reschedule it. Click a post to open it.">
      <select className="mk-sel" value={filter} onChange={(e) => setFilter(e.target.value as Status | "")}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {(["month", "week", "day", "list"] as const).map((v) => <button key={v} type="button" className={"mk-btn sm" + (view === v ? "" : " ghost")} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
      {can("editor") && <button type="button" className="mk-btn sm" onClick={() => openCompose()}>+ New</button>}
    </H>
    {view === "list" ? <div className="mk-card"><table className="mk-t"><thead><tr><th>Status</th><th>Post</th><th>Platforms</th><th>When</th><th>Author</th></tr></thead><tbody>
      {list.map((p) => <tr key={p.id} onClick={() => openCompose(p)} style={{ cursor: "pointer" }}><td><Pill st={p.status} /></td><td>{p.title || "Untitled"}</td><td>{p.platforms.map((x) => PLAT[x]).join(", ") || "—"}</td><td>{fmt(p.scheduled_at)}</td><td>{p.author}</td></tr>)}
    </tbody></table>{!list.length && <Empty icon="▤" title="No posts match" />}</div> : <div className="mk-card">
      <div className="mk-row between" style={{ marginBottom: 10 }}><button type="button" className="mk-btn sm ghost" onClick={() => shift(-1)}>‹</button><b>{title}</b><div className="mk-row"><button type="button" className="mk-btn sm ghost" onClick={() => setCur(new Date())}>Today</button><button type="button" className="mk-btn sm ghost" onClick={() => shift(1)}>›</button></div></div>
      <div className={"mk-cal v-" + view}>
        {view !== "day" && ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="mk-dow">{d}</div>)}
        {days.map((d) => { const items = list.filter((p) => p.scheduled_at && sameDay(new Date(p.scheduled_at), d)); const out = view === "month" && d.getMonth() !== cur.getMonth();
          return <div key={d.toISOString()} className={"mk-day" + (out ? " out" : "") + (sameDay(d, new Date()) ? " today" : "")} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d)}>
            <div className="mk-dnum">{d.getDate()}</div>
            {items.map((p) => <div key={p.id} className={"mk-ev st-" + p.status} draggable={p.status !== "published"} onDragStart={(e) => e.dataTransfer.setData("text/plain", String(p.id))} onClick={() => openCompose(p)} title={p.title}>{new Date(p.scheduled_at!).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })} {p.title || "Untitled"}</div>)}
          </div>; })}
      </div>
      {unscheduled.length > 0 && <><div className="mk-label" style={{ marginTop: 14 }}>Not scheduled yet — drag onto a day</div><div className="mk-row">{unscheduled.map((p) => <div key={p.id} className={"mk-ev st-" + p.status} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(p.id))} onClick={() => openCompose(p)}>{p.title || "Untitled"}</div>)}</div></>}
    </div>}
  </>;
}

type Thread = { key: string; kind: "message" | "comment"; accountId: number; page: string; target: string; who: string; preview: string; at: string; unread: boolean; messages: { id: string; from: string; text: string; at: string; mine: boolean }[]; postText?: string; link?: string; status?: string; assignedTo?: number | null; note?: string | null };

function Inbox({ s, go, can }: { s: State; go: (m: Mod) => void; can: Can }) {
  const connected = (s.accounts ?? []).some((a) => a.platform === "facebook" && a.status === "ok");
  const [data, setData] = useState<{ threads: Thread[]; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false); const [sel, setSel] = useState(""); const [filter, setFilter] = useState<"open" | "mine" | "done" | "all">("open");
  const [reply, setReply] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setData(await call({ action: "inbox" })); } catch (e) { setMsg((e as Error).message); } setLoading(false); }, []);
  useEffect(() => { if (connected) load(); }, [connected, load]);
  const threads = (data?.threads ?? []).filter((t) => filter === "all" || (filter === "done" ? t.status === "done" : filter === "mine" ? t.assignedTo === s.me.id && t.status !== "done" : t.status !== "done"));
  const t = (data?.threads ?? []).find((x) => x.key === sel) ?? null;
  useEffect(() => { setNote(t?.note ?? ""); setReply(""); setMsg(""); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  async function meta(patch: { status?: string; assignedTo?: number | null; note?: string }) {
    if (!t) return; const body = { action: "inboxMeta", key: t.key, status: patch.status ?? t.status ?? "open", assignedTo: "assignedTo" in patch ? patch.assignedTo : t.assignedTo ?? null, note: patch.note ?? t.note ?? "" };
    try { await call(body); setData((d) => d && { ...d, threads: d.threads.map((x) => x.key === t.key ? { ...x, status: body.status, assignedTo: body.assignedTo ?? null, note: body.note } : x) }); setMsg("Saved ✓"); } catch (e) { setMsg((e as Error).message); }
  }
  async function suggest() {
    if (!t) return; setBusy(true); setMsg("");
    const last = [...t.messages].reverse().find((m) => !m.mine)?.text ?? t.preview;
    try { const r = await call({ action: "ai", task: "reply", topic: `Customer (${t.kind === "comment" ? "Facebook comment" : "Messenger"}): ${last}` }); setReply(String(r.text).trim()); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  async function send() {
    if (!t || !reply.trim()) return; setBusy(true); setMsg("");
    try { await call({ action: "inboxReply", accountId: t.accountId, kind: t.kind, target: t.target, text: reply }); setMsg("Sent ✓"); setReply(""); await meta({ status: "done" }); await load(); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  if (!connected) return <><H t="Unified inbox" sub="Messenger chats and comments from your Facebook Page." />
    <div className="mk-card"><Empty icon="✉" title="Connect your Facebook Page first">The inbox reads messages directly from Facebook. Nothing here is simulated.<br /><br /><button type="button" className="mk-btn" onClick={() => go("accounts")}>Go to Social Accounts →</button></Empty></div></>;
  return <><H t="Unified inbox" sub="Messenger chats and comments on your recent Page posts, live from Facebook.">
    {(["open", "mine", "done", "all"] as const).map((f) => <button key={f} type="button" className={"mk-btn sm" + (filter === f ? "" : " ghost")} onClick={() => setFilter(f)}>{{ open: "Open", mine: "Assigned to me", done: "Done", all: "All" }[f]}</button>)}
    <button type="button" className="mk-btn sm ghost" onClick={load} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button>
  </H>
    {(data?.errors ?? []).length > 0 && <div className="mk-note">{data!.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}<div style={{ marginTop: 6 }}>If this says a permission is missing: in your Meta app's Facebook Login for Business configuration, add <code>pages_messaging</code>, <code>pages_read_user_content</code> and <code>pages_manage_engagement</code>, then click Reconnect on Social Accounts.</div></div>}
    <div className="mk-inbox">
      <div className="mk-card mk-ilist">{!data && loading && <p className="mk-mini">Loading conversations…</p>}
        {threads.map((x) => <button key={x.key} type="button" className={"mk-ithread" + (x.key === sel ? " sel" : "")} onClick={() => setSel(x.key)}>
          <div className="mk-row between"><b>{x.who}</b><small>{new Date(x.at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</small></div>
          <div className="mk-mini" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.kind === "comment" ? "💬 " : "✉ "}{x.preview}</div>
          <div className="mk-row" style={{ gap: 4 }}>{x.unread && x.status !== "done" && <span className="mk-pill st-pending">Needs reply</span>}{x.status === "done" && <span className="mk-pill st-published">Done</span>}{x.assignedTo && <span className="mk-pill">{s.team.find((m) => m.id === x.assignedTo)?.name ?? "Assigned"}</span>}</div>
        </button>)}
        {data && !threads.length && <Empty icon="✓" title="Nothing here">No conversations in this view.</Empty>}
      </div>
      <div className="mk-card">{!t ? <Empty icon="✉" title="Pick a conversation">Messages and comments appear on the left.</Empty> : <>
        <div className="mk-row between"><div><b>{t.who}</b><div className="mk-mini">{t.kind === "comment" ? "Comment on your post" : "Messenger"} · {t.page}{t.link && <> · <a className="mk-link" href={t.link} target="_blank" rel="noopener">Open on Facebook ↗</a></>}</div></div>
          <div className="mk-row">{can("editor") && <select className="mk-sel" value={t.assignedTo ?? ""} onChange={(e) => meta({ assignedTo: e.target.value ? Number(e.target.value) : null })}><option value="">Unassigned</option>{s.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
            {can("editor") && <button type="button" className="mk-btn sm ghost" onClick={() => meta({ status: t.status === "done" ? "open" : "done" })}>{t.status === "done" ? "Reopen" : "Mark done"}</button>}</div></div>
        {t.postText && <div className="mk-mini" style={{ margin: "8px 0" }}>On post: “{t.postText}”</div>}
        <div className="mk-chat">{t.messages.map((m) => <div key={m.id} className={"mk-bubble" + (m.mine ? " mine" : "")}><div>{m.text}</div><small>{m.mine ? "NEAS" : m.from} · {new Date(m.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</small></div>)}</div>
        {can("editor") && <>
          <label className="mk-f">Reply{t.kind === "message" && <span className="mk-mini">Facebook allows Messenger replies within 24 hours of the customer's last message.</span>}<textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" /></label>
          <div className="mk-row"><button type="button" className="mk-btn" disabled={busy || !reply.trim()} onClick={send}>Send reply</button><button type="button" className="mk-btn ghost" disabled={busy || !s.aiReady} onClick={suggest}>✦ Suggest reply</button>{msg && <span className="mk-mini">{msg}</span>}</div>
          <label className="mk-f" style={{ marginTop: 12 }}>Internal note (staff only)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (t.note ?? "") && meta({ note })} placeholder="e.g. Sent quote for 10 harnesses" /></label>
        </>}
      </>}</div>
    </div></>;
}

function Analytics({ s }: { s: State }) {
  const byStatus = (Object.keys(STATUS_LABEL) as Status[]).map((k) => [k, s.posts.filter((p) => p.status === k).length] as const);
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return d; });
  const perMonth = months.map((m) => s.posts.filter((p) => p.status === "published" && new Date(p.updated_at).getMonth() === m.getMonth() && new Date(p.updated_at).getFullYear() === m.getFullYear()).length);
  const max = Math.max(1, ...perMonth);
  const plat = Object.keys(PLAT).map((k) => [k, s.posts.filter((p) => p.platforms.includes(k)).length] as const);
  return <><H t="Analytics" sub="Real numbers only. Social metrics appear once accounts are connected." />
    <div className="mk-grid4">
      <div className="mk-card mk-kpi"><small>Total posts</small><b>{s.posts.length}</b><span className="mk-src">Source: NEAS database</span></div>
      <div className="mk-card mk-kpi"><small>Bio link clicks</small><b>{s.links.reduce((a, l) => a + l.clicks, 0)}</b><span className="mk-src">Source: NEAS link-in-bio</span></div>
      <div className="mk-card mk-kpi"><small>Store orders · 30 days</small><b>{s.site.orders30}</b><span className="mk-src">{peso(s.site.sales30)} · NEAS store</span></div>
      <div className="mk-card mk-kpi"><small>Store customers</small><b>{s.site.customers}</b><span className="mk-src">Source: NEAS store</span></div>
    </div>
    <div className="mk-grid2">
      <div className="mk-card"><div className="mk-label">Published posts · last 6 months</div><div className="mk-bars">{perMonth.map((n, i) => <div key={i} className="mk-bcol"><div className="mk-bval">{n}</div><div className="mk-b" style={{ height: (n / max) * 120 + 4 }} /><small>{months[i].toLocaleDateString("en-PH", { month: "short" })}</small></div>)}</div></div>
      <div className="mk-card"><div className="mk-label">Pipeline by status</div>{byStatus.map(([k, n]) => <div key={k} className="mk-hb"><Pill st={k} /><div className="mk-hbar"><i style={{ width: (n / Math.max(1, s.posts.length)) * 100 + "%" }} /></div><b>{n}</b></div>)}
        <div className="mk-label" style={{ marginTop: 14 }}>Posts planned per platform</div>{plat.map(([k, n]) => <div key={k} className="mk-hb"><span style={{ width: 120 }}>{PLAT[k]}</span><div className="mk-hbar"><i style={{ width: (n / Math.max(1, s.posts.length)) * 100 + "%" }} /></div><b>{n}</b></div>)}</div>
    </div>
    <div className="mk-card"><div className="mk-label">Social metrics</div><table className="mk-t"><thead><tr><th>Metric</th><th>Value</th><th>Status</th></tr></thead><tbody>
      {["Reach", "Impressions", "Engagement", "Followers", "Profile visits", "Click-through rate", "Video views"].map((m) => <tr key={m}><td>{m}</td><td>—</td><td className="mk-na">Unavailable: no connected account</td></tr>)}
    </tbody></table></div></>;
}

function Brands({ s, can, run }: { s: State; can: Can; run: Run }) {
  const [b, setB] = useState(s.brand); const ro = !can("admin");
  const F = (k: keyof Brand, label: string, rows = 3, hint = "") => <label className="mk-f">{label}{hint && <span className="mk-mini">{hint}</span>}<textarea rows={rows} disabled={ro} value={String(b[k])} onChange={(e) => setB({ ...b, [k]: e.target.value })} /></label>;
  return <><H t="Brands" sub="Brand voice and guidelines the AI follows for every piece of content." />
    <div className="mk-card" style={{ maxWidth: 860 }}>
      <div className="mk-brandhead"><span className="mk-logo-mark">N</span><div><b>NextEdge Access Solutions (NEAS) OPC</b><small>IRATA rope access & height safety · Marilao, Bulacan</small></div><div className="mk-swatches">{["#071D29", "#101827", "#172235", "#CA9332", "#EBC07E"].map((c) => <span key={c} style={{ background: c }} title={c} />)}</div></div>
      {ro && <div className="mk-note">Only marketing admins can change brand settings.</div>}
      {F("voice", "Brand voice")}{F("audience", "Target audience")}{F("services", "Services / industries covered", 4, "Separate with semicolons")}{F("hashtags", "Preferred hashtags", 2)}{F("avoid", "Things the AI must avoid", 2)}{F("languages", "Languages", 1)}
      <label className="mk-f">Monthly publishing goal (posts)<input type="number" min={0} max={500} disabled={ro} value={b.goal} onChange={(e) => setB({ ...b, goal: Number(e.target.value) })} /></label>
      {!ro && <button type="button" className="mk-btn" onClick={() => run({ action: "saveBrand", brand: b }, "Brand saved ✓")}>Save brand settings</button>}
    </div></>;
}

function Accounts({ s, can }: { s: State; can: Can }) {
  const [msg] = useState(() => { try { return new URLSearchParams(location.search).get("msg") ?? ""; } catch { return ""; } });
  const [busy, setBusy] = useState(0);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const accs = s.accounts ?? [];
  const cards: { id: string; name: string; connect?: "facebook" | "linkedin"; ready: boolean; needs: string; note: string }[] = [
    { id: "facebook", name: "Facebook Pages", connect: "facebook", ready: !!s.connectReady?.facebook, needs: "META_APP_ID, META_APP_SECRET", note: "Connecting Facebook also adds any Instagram Business account linked to your Page." },
    { id: "instagram", name: "Instagram Business", connect: "facebook", ready: !!s.connectReady?.facebook, needs: "META_APP_ID, META_APP_SECRET", note: "Connect through Facebook. Instagram posts need an image." },
    { id: "linkedin", name: "LinkedIn (your profile)", connect: "linkedin", ready: !!s.connectReady?.linkedin, needs: "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET", note: "Posts to your personal LinkedIn. Company Page posting needs LinkedIn's Community Management approval." },
    { id: "youtube", name: "YouTube", ready: false, needs: "", note: "Video uploads: later phase." },
    { id: "tiktok", name: "TikTok", ready: false, needs: "", note: "Video uploads: later phase." },
    { id: "google_business", name: "Google Business Profile", ready: false, needs: "", note: "Needs Google's Business Profile API approval: later phase." },
  ];
  return <><H t="Social accounts" sub="Connect with each platform's official login. Access tokens are encrypted on the server and never shown in the browser." />
    {msg && <div className={"mk-note"} role="status">{msg}</div>}
    <div className="mk-grid3">{cards.map((c) => { const mine = accs.filter((a) => a.platform === c.id);
      return <div key={c.id} className="mk-card mk-acc">
        <div className="mk-row between"><b>{c.name}</b><span className={"mk-pill " + (mine.some((a) => a.status === "ok") ? "st-published" : c.ready ? "st-approved" : "st-draft")}>{mine.some((a) => a.status === "ok") ? "Connected" : c.ready ? "Ready to connect" : c.needs ? "Not set up" : "Later phase"}</span></div>
        {mine.map((a) => <div key={a.id} className="mk-li" style={{ cursor: "default" }}><div style={{ flex: 1 }}><b>{a.name}</b><small>{a.status === "ok" ? "Healthy" + (a.expires_at ? " · token renews by reconnecting before " + new Date(a.expires_at).toLocaleDateString("en-PH") : "") : "⚠ " + a.error}</small></div>
          {can("manager") && <button type="button" className="mk-btn sm ghost danger" disabled={busy === a.id} onClick={async () => { if (!confirm(`Disconnect ${a.name}?`)) return; setBusy(a.id); await call({ action: "disconnect", id: a.id }).catch(() => {}); location.reload(); }}>Disconnect</button>}</div>)}
        <p className="mk-mini">{c.note}{!c.ready && c.needs ? <><br />Needs: <code>{c.needs}</code></> : null}</p>
        {c.connect && (c.ready && can("manager") ? <a className="mk-btn sm" href={`/api/admin/social/connect/${c.connect}`}>{mine.length ? "Reconnect" : "Connect"}</a> : <button type="button" className="mk-btn sm ghost" disabled>Connect</button>)}
      </div>; })}</div>
    <div className="mk-card"><div className="mk-label">App settings to copy into each developer app</div>
      <table className="mk-t"><tbody>
        <tr><td>Facebook / Instagram: Valid OAuth Redirect URI</td><td><code>{origin}/api/admin/social/callback/facebook</code></td></tr>
        <tr><td>LinkedIn: Authorized redirect URL</td><td><code>{origin}/api/admin/social/callback/linkedin</code></td></tr>
        <tr><td>Meta app: use case to add</td><td><b>Manage everything on your Page</b> → Customize → Add <code>pages_show_list, pages_read_engagement, pages_manage_posts, business_management</code></td></tr>
        <tr><td>Meta app: Instagram (optional)</td><td>Add the Instagram use case with <code>instagram_basic, instagram_content_publish</code>, then set <code>META_INSTAGRAM</code> = <code>1</code> in Vercel</td></tr>
        <tr><td>Meta "Facebook Login for Business" apps</td><td>Create a Configuration (User access token, Pages assets, the permissions above) and set its ID as <code>META_LOGIN_CONFIG_ID</code></td></tr>
        <tr><td>LinkedIn products to add</td><td>"Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn"</td></tr>
      </tbody></table>
      <p className="mk-mini">A post is marked Published only after every chosen platform confirms it. If one fails, the post is marked Failed with the platform's reason, and pressing Publish now again only retries the ones that failed, so nothing is posted twice.</p></div></>;
}

function csv(rows: (string | number)[][]) { return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n"); }
function download(name: string, text: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

function Reports({ s }: { s: State }) {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year">("month");
  const since = useMemo(() => { const d = new Date(); ({ day: () => d.setDate(d.getDate() - 1), week: () => d.setDate(d.getDate() - 7), month: () => d.setMonth(d.getMonth() - 1), quarter: () => d.setMonth(d.getMonth() - 3), year: () => d.setFullYear(d.getFullYear() - 1) })[period](); return d; }, [period]);
  const posts = s.posts.filter((p) => new Date(p.updated_at) >= since);
  const acts = s.activity.filter((a) => new Date(a.at) >= since);
  const label = { day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Annual" }[period];
  return <><H t="Reports" sub="Export to Excel (CSV) or save as PDF.">
    <select className="mk-sel" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Annual</option></select>
    <button type="button" className="mk-btn ghost" onClick={() => download(`NEAS-${label}-posts.csv`, csv([["Status", "Title", "Platforms", "Scheduled", "Campaign", "Author", "Updated"], ...posts.map((p) => [STATUS_LABEL[p.status], p.title, p.platforms.map((x) => PLAT[x]).join("; "), fmt(p.scheduled_at), p.campaign, p.author, fmt(p.updated_at)])]))}>⬇ Excel (CSV)</button>
    <button type="button" className="mk-btn" onClick={() => window.print()}>⎙ Save as PDF</button>
  </H>
    <div className="mk-card mk-print"><h2 style={{ marginTop: 0 }}>NEAS {label} Marketing Report</h2><p className="mk-mini">{since.toLocaleDateString("en-PH", { dateStyle: "medium" })} – {new Date().toLocaleDateString("en-PH", { dateStyle: "medium" })}</p>
      <div className="mk-grid4">{(Object.keys(STATUS_LABEL) as Status[]).filter((k) => k !== "approved").map((k) => <div key={k} className="mk-kpi"><small>{STATUS_LABEL[k]}</small><b>{posts.filter((p) => p.status === k).length}</b></div>)}</div>
      <p className="mk-mini">Store (last 30 days): {s.site.orders30} orders, {peso(s.site.sales30)}. Bio link clicks (all time): {s.links.reduce((a, l) => a + l.clicks, 0)}. Social reach and engagement: unavailable until accounts are connected.</p>
      <table className="mk-t"><thead><tr><th>Status</th><th>Post</th><th>Platforms</th><th>When</th></tr></thead><tbody>{posts.map((p) => <tr key={p.id}><td>{STATUS_LABEL[p.status]}</td><td>{p.title}</td><td>{p.platforms.map((x) => PLAT[x]).join(", ")}</td><td>{fmt(p.scheduled_at)}</td></tr>)}</tbody></table>
      {!posts.length && <p className="mk-mini">No post activity in this period.</p>}
      <div className="mk-label" style={{ marginTop: 14 }}>Activity ({acts.length})</div>{acts.slice(0, 40).map((a) => <div key={a.id} className="mk-log">{fmt(a.at)} · {a.who} · <b>{a.action}</b> {a.detail}</div>)}
    </div></>;
}

function Strategy({ s, can, openCompose }: { s: State; can: Can; openCompose: (p?: Partial<Post>) => void }) {
  const pillars = s.brand.services.split(/;|\n/).map((x) => x.trim()).filter(Boolean);
  return <><H t="Content strategy" sub="Your content pillars and an AI planner for campaigns and schedules." />
    <div className="mk-grid2 wide">
      <div className="mk-card"><div className="mk-label">Content pillars (from Brands)</div><div className="mk-row">{pillars.map((x) => <span key={x} className="mk-chip on">{x}</span>)}</div>
        <div className="mk-label" style={{ marginTop: 16 }}>Suggested weekly mix</div>
        <table className="mk-t"><tbody><tr><td>Mon</td><td>Project showcase (before/after photos)</td></tr><tr><td>Wed</td><td>Safety tip or myth-busting</td></tr><tr><td>Fri</td><td>Equipment / PPE spotlight linking to the Online Store</td></tr><tr><td>Sat</td><td>Team, training or behind-the-scenes (Taglish works well)</td></tr></tbody></table>
        {can("editor") && <button type="button" className="mk-btn ghost" style={{ marginTop: 10 }} onClick={() => openCompose()}>✎ Start a post</button>}
      </div>
      <AiPanel s={s} can={can} defaultTask="campaign" />
    </div></>;
}

function Feeds({ s, can, run, openCompose }: { s: State; can: Can; run: Run; openCompose: (p?: Partial<Post>) => void }) {
  const [name, setName] = useState(""); const [url, setUrl] = useState("");
  const [sel, setSel] = useState<number | null>(null); const [items, setItems] = useState<{ title: string; link: string; summary: string }[]>([]); const [msg, setMsg] = useState("");
  async function open(id: number) { setSel(id); setItems([]); setMsg("Loading…"); try { const r = await call({ action: "feedItems", id }); setItems(r.items); setMsg(r.items.length ? "" : "No items found."); } catch (e) { setMsg((e as Error).message); } }
  return <><H t="Feed reader" sub="Follow industry news (RSS/Atom) and turn articles into draft posts." />
    <div className="mk-grid2 wide">
      <div className="mk-card"><div className="mk-label">Your feeds</div>
        {s.feeds.map((f) => <div key={f.id} className={"mk-li" + (sel === f.id ? " sel" : "")}><button type="button" className="mk-link" onClick={() => open(f.id)}>{f.name}</button>{can("manager") && <button type="button" className="mk-x" onClick={() => run({ action: "deleteFeed", id: f.id }, "Removed")}>×</button>}</div>)}
        {!s.feeds.length && <p className="mk-mini">No feeds yet. Add an industry news RSS link below.</p>}
        {can("manager") && <><label className="mk-f">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wind energy news" /></label><label className="mk-f">RSS / Atom link<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/feed" /></label><button type="button" className="mk-btn" onClick={() => run({ action: "saveFeed", name, url }, "Feed added ✓").then(() => { setName(""); setUrl(""); })}>Add feed</button></>}
      </div>
      <div className="mk-card"><div className="mk-label">Articles</div>{msg && <p className="mk-mini">{msg}</p>}
        {items.map((it, i) => <div key={i} className="mk-feeditem"><b>{it.title}</b><p className="mk-mini">{it.summary}</p><div className="mk-row">{it.link && <a className="mk-link" href={it.link} target="_blank" rel="noopener">Open ↗</a>}{can("editor") && <button type="button" className="mk-btn sm ghost" onClick={() => openCompose({ title: it.title.slice(0, 180), body: `${it.title}\n\n${it.summary}\n\nSource: ${it.link}`, platforms: [], status: "draft", scheduled_at: null, media_url: "", campaign: "Industry news", notes: "From feed reader" })}>Create draft</button>}</div></div>)}
        {!sel && <Empty icon="☰" title="Pick a feed">Articles appear here.</Empty>}
      </div>
    </div></>;
}

function Automation({ s, can, run }: { s: State; can: Can; run: Run }) {
  const sc = s.scheduler; const connected = (s.accounts ?? []).some((a) => a.status === "ok");
  const due = s.posts.filter((p) => p.status === "scheduled").length;
  const [copied, setCopied] = useState(false);
  const autoCard = <div className="mk-card"><div className="mk-row between"><div className="mk-label" style={{ margin: 0 }}>Publish scheduled posts automatically</div>
      <span className={"mk-pill " + (connected && sc?.last?.at ? "st-published" : connected ? "st-approved" : "st-draft")}>{connected && sc?.last?.at ? "Active" : connected ? "Ready: start the scheduler" : "Waiting for a connected account"}</span></div>
    <p className="mk-mini">Posts set to <b>Scheduled</b> with a date and time are published when that time arrives, using the same rules as Publish now: marked Published only when every platform confirms, never posted twice. {due} post(s) currently scheduled.</p>
    <table className="mk-t"><tbody>
      <tr><td>Last run</td><td>{sc?.last?.at ? `${fmt(sc.last.at)} · ${sc.last.published ?? 0} published, ${sc.last.failed ?? 0} failed` : "Not run yet"}</td></tr>
      <tr><td>Daily run (free, built in)</td><td>Every day at 9:00 AM PH via Vercel Cron. {sc?.hasCronSecret ? "✅ CRON_SECRET is set." : <>Add a <code>CRON_SECRET</code> setting in Vercel (any 32+ random characters), then Redeploy, to switch it on.</>}</td></tr>
      <tr><td>On-time runs (free, recommended)</td><td>Create a free job at <b>cron-job.org</b> that opens the address below every 5 minutes. Posts then go out within 5 minutes of their time.</td></tr>
    </tbody></table>
    {sc?.url ? <div className="mk-row" style={{ marginTop: 8 }}><code style={{ wordBreak: "break-all", fontSize: 12, flex: 1, minWidth: 0 }}>{sc.url}</code><button type="button" className="mk-btn sm ghost" onClick={() => { navigator.clipboard?.writeText(sc.url).then(() => setCopied(true)).catch(() => {}); }}>{copied ? "Copied ✓" : "Copy"}</button></div>
      : <p className="mk-mini">Only marketing admins can see the scheduler address.</p>}
    <p className="mk-mini">Keep this address private: anyone with it can trigger publishing of posts that are already scheduled.</p>
  </div>;
  const rules = [
    ["Weekly marketing report by email", "Needs an email provider key and Vercel Cron."],
    ["RSS-to-social drafts", "Available now manually in Feed Reader; automatic mode needs Vercel Cron."],
    ["Webhooks (n8n / Zapier)", "Needs a webhook URL to send events to."],
  ];
  return <><H t="Automation" sub="Each rule will have on/off control, an execution log and failure handling." />
    {autoCard}
    <EmailAutomations s={s} can={can} run={run} />
    <div className="mk-card"><table className="mk-t"><thead><tr><th>Rule</th><th>Status</th><th>What it needs</th></tr></thead><tbody>
      {rules.map(([r, n]) => <tr key={r}><td>{r}</td><td><span className="mk-pill st-draft">Not active</span></td><td className="mk-mini">{n}</td></tr>)}
    </tbody></table><p className="mk-mini">These aren't built yet. Recent manual workflow actions are in Settings &amp; Logs ({s.activity.length}).</p></div></>;
}

function EmailAutomations({ s, can, run }: { s: State; can: Can; run: Run }) {
  const [a, setA] = useState(s.automation ?? { orderAlert: true, orderConfirm: true, orderStatus: true, approval: true, publishFail: true, alertEmail: "" });
  const ro = !can("admin");
  const rows: [keyof typeof a, string, string][] = [
    ["orderAlert", "New store order → email the sales team", "Customer, items, total and a link to the order. Sent to the alert email below."],
    ["orderConfirm", "Order confirmation → email the customer", "Order reference, items, total and delivery address."],
    ["orderStatus", "Order status updates → email the customer", "When you mark an order Paid, Processing, Shipped, Completed or Cancelled."],
    ["approval", "Post approvals → email managers and authors", "Managers hear when a post needs review; the author hears when it's approved or sent back."],
    ["publishFail", "Failed publishing → email the alert address", "Includes the platform's reason so you can fix and retry."],
  ];
  return <div className="mk-card"><div className="mk-row between"><div className="mk-label" style={{ margin: 0 }}>Email automations</div>
      <span className={"mk-pill " + (s.emailReady ? "st-published" : "st-failed")}>{s.emailReady ? "Email connected (Resend)" : "Needs RESEND_API_KEY"}</span></div>
    <table className="mk-t" style={{ marginTop: 8 }}><tbody>{rows.map(([k, t, d]) => <tr key={k}><td style={{ width: 56 }}><label className="mk-switch"><input type="checkbox" disabled={ro} checked={!!a[k]} onChange={(e) => setA({ ...a, [k]: e.target.checked })} /><span /></label></td><td><b>{t}</b><div className="mk-mini">{d}</div></td></tr>)}</tbody></table>
    <label className="mk-f" style={{ marginTop: 10 }}>Alert email (sales team)<input type="email" disabled={ro} value={a.alertEmail} onChange={(e) => setA({ ...a, alertEmail: e.target.value })} placeholder="Empty = your business email from Website settings" /></label>
    {!ro && <div className="mk-row"><button type="button" className="mk-btn" onClick={() => run({ action: "saveAutomation", automation: a }, "Automations saved ✓")}>Save</button><button type="button" className="mk-btn ghost" onClick={() => run({ action: "testEmail" }, "Test email sent to you ✓")}>Send me a test email</button></div>}
    <div className="mk-label" style={{ marginTop: 16 }}>Email log (last 40)</div>
    {(s.emailLog ?? []).length ? <div className="mk-scroll" style={{ maxHeight: 260 }}><table className="mk-t"><tbody>{(s.emailLog ?? []).map((e, i) => <tr key={i}><td>{e.ok ? "✅" : "❌"}</td><td>{fmt(e.at)}</td><td>{e.subject}<div className="mk-mini">to {e.to}{e.error && <span className="mk-warn"> · {e.error}</span>}</div></td></tr>)}</tbody></table></div> : <p className="mk-mini">No emails sent yet.</p>}
  </div>;
}

const SIZES: [string, number, number][] = [["Facebook post", 1080, 1080], ["Instagram post (4:5)", 1080, 1350], ["Story / Reel", 1080, 1920], ["LinkedIn post", 1200, 627], ["Facebook cover", 1640, 624], ["YouTube thumbnail", 1280, 720], ["Google Business photo", 720, 720]];
const TEMPLATES: [string, string][] = [["band", "Photo + headline band"], ["bold", "Bold headline"], ["spot", "Product spotlight"]];

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/)) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out.filter((l, i, a) => l || i < a.length - 1);
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function drawGraphic(c: HTMLCanvasElement, o: { W: number; H: number; tpl: string; head: string; sub: string; cta: string; logo: boolean }, img: HTMLImageElement | null, logo: HTMLImageElement | null) {
  const { W, H } = o; c.width = W; c.height = H; const ctx = c.getContext("2d")!;
  const u = Math.min(W, H) / 100, pad = 6 * u, NAVY = "#071D29", GOLD = "#CA9332", SAND = "#EBC07E", ORANGE = "#F97316";
  const font = (wt: number, px: number) => `${wt} ${px}px Inter, "Segoe UI", Arial, sans-serif`;
  const text = (t: string, x: number, y: number, maxW: number, px: number, wt: number, color: string, lh = 1.15, align: CanvasTextAlign = "left") => {
    ctx.font = font(wt, px); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "top";
    const lines = wrap(ctx, t, maxW); lines.forEach((l, i) => ctx.fillText(l, x, y + i * px * lh)); return y + lines.length * px * lh;
  };
  const ctaPill = (x: number, y: number, align: "left" | "center" = "left") => {
    if (!o.cta) return; ctx.font = font(800, 3.6 * u); const tw = ctx.measureText(o.cta).width, h = 7.5 * u, w = tw + 6 * u, px = align === "center" ? x - w / 2 : x;
    ctx.fillStyle = ORANGE; rr(ctx, px, y, w, h, h / 2); ctx.fill(); ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(o.cta, px + 3 * u, y + h / 2 + 1);
  };
  const drawLogo = (x: number, y: number, size: number) => { if (!o.logo || !logo) return; ctx.save(); ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill(); ctx.clip(); ctx.drawImage(logo, x, y, size, size); ctx.restore(); };
  const wide = W / H > 1.6;
  if (o.tpl === "spot") {
    ctx.fillStyle = "#F7F4EE"; ctx.fillRect(0, 0, W, H);
    const ih = wide ? H - 2 * pad : H * 0.58, iw = wide ? W * 0.5 : W - 2 * pad;
    ctx.save(); rr(ctx, pad, pad, iw, ih, 3 * u); ctx.clip(); if (img) cover(ctx, img, pad, pad, iw, ih); else { ctx.fillStyle = "#E7E0D3"; ctx.fillRect(pad, pad, iw, ih); } ctx.restore();
    const tx = wide ? pad * 2 + iw : pad, ty = wide ? pad * 1.5 : pad * 1.6 + ih, tw = wide ? W - tx - pad : W - 2 * pad;
    ctx.fillStyle = GOLD; ctx.fillRect(tx, ty, 10 * u, 0.9 * u);
    let y = text(o.head, tx, ty + 2.5 * u, tw, (wide ? 6 : 6.4) * u, 800, NAVY);
    if (o.sub) y = text(o.sub, tx, y + 1.5 * u, tw, 3.4 * u, 500, "#3b4a5a", 1.3);
    ctaPill(tx, Math.min(y + 3 * u, H - pad - 7.5 * u));
    drawLogo(W - pad - 11 * u, H - pad - 11 * u, 11 * u);
    return;
  }
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  if (img) { if (o.tpl === "bold") ctx.globalAlpha = 0.28; cover(ctx, img, 0, 0, W, H); ctx.globalAlpha = 1; }
  if (o.tpl === "bold") {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(7,29,41,.55)"); g.addColorStop(1, "rgba(7,29,41,.92)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.font = font(900, 8 * u); const lines = wrap(ctx, o.head, W - 2 * pad), hh = lines.length * 8 * u * 1.1, total = hh + (o.sub ? 12 * u : 0) + (o.cta ? 12 * u : 0);
    let y = (H - total) / 2;
    y = text(o.head, W / 2, y, W - 2 * pad, 8 * u, 900, "#fff", 1.1, "center");
    ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 8 * u, y + 2 * u, 16 * u, 0.9 * u);
    if (o.sub) y = text(o.sub, W / 2, y + 5 * u, W - 3 * pad, 3.6 * u, 500, SAND, 1.3, "center");
    ctaPill(W / 2, y + 4 * u, "center");
    drawLogo(pad, pad, 12 * u);
    return;
  }
  // band
  const bandTop = wide ? 0 : H * 0.5;
  const g = wide ? ctx.createLinearGradient(0, 0, W, 0) : ctx.createLinearGradient(0, bandTop - 15 * u, 0, H);
  g.addColorStop(0, wide ? "rgba(7,29,41,.95)" : "rgba(7,29,41,0)"); g.addColorStop(wide ? 0.55 : 0.25, "rgba(7,29,41,.88)"); g.addColorStop(1, wide ? "rgba(7,29,41,0)" : "rgba(7,29,41,.97)");
  ctx.fillStyle = g; ctx.fillRect(0, wide ? 0 : bandTop - 15 * u, W, wide ? H : H - bandTop + 15 * u);
  const tw = wide ? W * 0.55 : W - 2 * pad;
  ctx.font = font(800, 7 * u); const hl = wrap(ctx, o.head, tw).length;
  const blockH = hl * 7 * u * 1.12 + (o.sub ? 10 * u : 0) + (o.cta ? 11 * u : 0);
  let y = wide ? (H - blockH) / 2 : H - pad - blockH;
  ctx.fillStyle = GOLD; ctx.fillRect(pad, y - 3 * u, 12 * u, 0.9 * u);
  y = text(o.head, pad, y, tw, 7 * u, 800, "#fff", 1.12);
  if (o.sub) y = text(o.sub, pad, y + 1.5 * u, tw, 3.4 * u, 500, SAND, 1.3);
  ctaPill(pad, y + 3 * u);
  drawLogo(W - pad - 12 * u, pad, 12 * u);
}

function Studio({ s, can, run, openCompose }: { s: State; can: Can; run: Run; openCompose: (p?: Partial<Post>) => void }) {
  const [size, setSize] = useState(0); const [tpl, setTpl] = useState("band");
  const [head, setHead] = useState("Safe, certified rope access for high-rise facades");
  const [sub, setSub] = useState("IRATA-certified technicians · Metro Manila & nationwide");
  const [cta, setCta] = useState("WhatsApp +63 991 426 5886"); const [useLogo, setUseLogo] = useState(true);
  const [img, setImg] = useState<HTMLImageElement | null>(null); const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [topic, setTopic] = useState("");
  const ref = useRef<HTMLCanvasElement>(null);
  const [, W, GH] = SIZES[size];
  useEffect(() => { const l = new Image(); l.onload = () => setLogo(l); l.src = "/img/logo.png"; }, []);
  useEffect(() => { if (ref.current) drawGraphic(ref.current, { W, H: GH, tpl, head, sub, cta, logo: useLogo }, img, logo); }, [W, GH, tpl, head, sub, cta, useLogo, img, logo]);
  const loadFile = (f?: File) => { if (!f) return; if (!/^image\//.test(f.type)) { setMsg("Choose a JPG or PNG photo."); return; } const im = new Image(); im.onload = () => setImg(im); im.src = URL.createObjectURL(f); };
  const pickExisting = (url: string) => { const im = new Image(); im.onload = () => setImg(im); im.onerror = () => setMsg("That image can't be used here."); im.src = url; };
  async function suggest() {
    if (!topic.trim()) { setMsg("Type a topic for the AI first."); return; }
    setBusy(true); setMsg("");
    try { const r = await call({ action: "ai", task: "caption", topic: `Write ONE punchy headline (max 9 words) and, on a second line, ONE supporting line (max 12 words) for a social graphic about: ${topic}. No hashtags, no emojis, no labels.` });
      const lines = String(r.text).split("\n").map((x: string) => x.replace(/^[-*#\d.\s"]+|["*]+$/g, "").trim()).filter(Boolean); if (lines[0]) setHead(lines[0]); if (lines[1]) setSub(lines[1]);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  async function save(andUse: boolean) {
    const c = ref.current; if (!c) return; setBusy(true); setMsg("Saving…");
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
    if (!blob) { setBusy(false); setMsg("Couldn't create the image."); return; }
    const fd = new FormData(); fd.append("file", new File([blob], "graphic.jpg", { type: "image/jpeg" }));
    const r = await fetch("/api/admin/upload", { method: "POST", body: fd }); const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setMsg(j.error || "Upload failed."); return; }
    await run({ action: "saveMedia", url: j.url, title: head.slice(0, 150), width: W, height: GH }, "Saved to media library ✓");
    setBusy(false); setMsg("");
    if (andUse) openCompose({ title: head.slice(0, 180), body: [head, sub, cta].filter(Boolean).join("\n\n"), platforms: [], status: "draft", scheduled_at: null, media_url: j.url, campaign: "", notes: "Graphic from Creative Studio" });
  }
  function download() { const c = ref.current; if (!c) return; const a = document.createElement("a"); a.href = c.toDataURL("image/jpeg", 0.92); a.download = `NEAS-${SIZES[size][0].replace(/\W+/g, "-")}.jpg`; a.click(); }
  const library = [...(s.media ?? []).map((m) => ({ url: m.url, title: m.title, id: m.id })), ...s.posts.filter((p) => p.media_url && !(s.media ?? []).some((m) => m.url === p.media_url)).map((p) => ({ url: p.media_url, title: p.title, id: 0 }))];
  return <><H t="Creative Studio" sub="Make branded graphics in exact platform sizes. Runs in your browser, free." />
    <div className="mk-grid2 wide">
      <div className="mk-card">
        <div className="mk-studio-stage"><canvas ref={ref} className="mk-canvas" style={{ aspectRatio: `${W} / ${GH}` }} aria-label="Graphic preview" /></div>
        <div className="mk-row" style={{ marginTop: 12 }}>
          {can("editor") && <><button type="button" className="mk-btn" disabled={busy} onClick={() => save(true)}>Save & use in new post</button><button type="button" className="mk-btn ghost" disabled={busy} onClick={() => save(false)}>Save to library</button></>}
          <button type="button" className="mk-btn ghost" onClick={download}>⬇ Download JPG</button>
          {msg && <span className="mk-mini">{msg}</span>}
        </div>
      </div>
      <div className="mk-card">
        <div className="mk-grid2"><label className="mk-f">Size<select value={size} onChange={(e) => setSize(Number(e.target.value))}>{SIZES.map(([n, w, h], i) => <option key={n} value={i}>{n} · {w}×{h}</option>)}</select></label>
          <label className="mk-f">Layout<select value={tpl} onChange={(e) => setTpl(e.target.value)}>{TEMPLATES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label></div>
        <label className="mk-f">Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => loadFile(e.target.files?.[0])} /></label>
        {img && <button type="button" className="mk-btn sm ghost" style={{ marginBottom: 10 }} onClick={() => setImg(null)}>Remove photo</button>}
        <label className="mk-f">Headline<textarea rows={2} value={head} onChange={(e) => setHead(e.target.value)} /></label>
        <label className="mk-f">Supporting line<input value={sub} onChange={(e) => setSub(e.target.value)} /></label>
        <label className="mk-f">Button text<input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Leave empty to hide" /></label>
        <label className="mk-chip on" style={{ marginBottom: 12 }}><input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} style={{ display: "inline" }} /> Show NEAS logo</label>
        <div className="mk-label">✦ Headline from AI</div>
        <div className="mk-row"><input className="mk-sel" style={{ flex: 1, minWidth: 0 }} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. wind turbine blade inspection in Ilocos" /><button type="button" className="mk-btn sm" disabled={busy || !s.aiReady} onClick={suggest}>Suggest</button></div>
        {!s.aiReady && <p className="mk-mini">Add GEMINI_API_KEY to use AI headlines.</p>}
        <p className="mk-mini" style={{ marginTop: 10 }}>AI-generated photos need a paid image API; this studio uses your own photos instead.</p>
      </div>
    </div>
    <div className="mk-card"><div className="mk-label">Media library ({library.length})</div>
      {library.length ? <div className="mk-media">{library.map((m, i) => <div key={i} className="mk-mitem"><img src={m.url} alt={m.title} loading="lazy" /><div className="mk-row" style={{ gap: 4 }}>
        <button type="button" className="mk-btn sm ghost" onClick={() => openCompose({ title: m.title.slice(0, 180), body: "", platforms: [], status: "draft", scheduled_at: null, media_url: m.url, campaign: "", notes: "" })}>Use</button>
        {m.url.startsWith("/api/img/") && <button type="button" className="mk-btn sm ghost" onClick={() => pickExisting(m.url)}>Edit</button>}
        {m.id > 0 && can("manager") && <button type="button" className="mk-x" onClick={() => { if (confirm("Remove from library?")) run({ action: "deleteMedia", id: m.id }, "Removed"); }}>×</button>}</div></div>)}</div>
        : <Empty icon="✺" title="No graphics yet">Make one above and click Save.</Empty>}
    </div></>;
}

function Bio({ s, can, run }: { s: State; can: Can; run: Run }) {
  const [label, setLabel] = useState(""); const [url, setUrl] = useState("");
  return <><H t="Link-in-Bio" sub="One link for your Instagram/TikTok bio, with click tracking."><a className="mk-btn ghost" href="/links" target="_blank" rel="noopener">Open public page ↗</a></H>
    <div className="mk-grid2 wide">
      <div className="mk-card"><div className="mk-label">Links ({s.links.length})</div>
        <p className="mk-mini">Your bio link: <b>www.nextedge-access-solutions.com/links</b></p>
        {s.links.map((l) => <div key={l.id} className="mk-li"><div style={{ flex: 1 }}><b style={{ opacity: l.active ? 1 : .5 }}>{l.label}</b><small>{l.url}</small></div><span className="mk-tag">{l.clicks} clicks</span>
          {can("manager") && <><button type="button" className="mk-btn sm ghost" onClick={() => run({ action: "saveLink", id: l.id, label: l.label, url: l.url, sort: l.sort, active: !l.active }, l.active ? "Hidden" : "Shown")}>{l.active ? "Hide" : "Show"}</button><button type="button" className="mk-x" onClick={() => { if (confirm("Delete this link?")) run({ action: "deleteLink", id: l.id }, "Deleted"); }}>×</button></>}</div>)}
        {!s.links.length && <Empty icon="🔗" title="No links yet">Add your first link below.</Empty>}
        {can("manager") && <><label className="mk-f">Button text<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Shop PPE online" /></label><label className="mk-f">Link<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.nextedge-access-solutions.com/store" /></label>
          <button type="button" className="mk-btn" onClick={() => run({ action: "saveLink", label, url, sort: s.links.length }, "Link added ✓").then(() => { setLabel(""); setUrl(""); })}>Add link</button></>}
      </div>
      <div className="mk-card"><div className="mk-label">Preview</div><div className="mk-phone"><div className="mk-logo-mark big">N</div><b>NextEdge Access Solutions</b><small>IRATA Rope Access · Height Safety</small>{s.links.filter((l) => l.active).map((l) => <span key={l.id} className="mk-biobtn">{l.label}</span>)}</div></div>
    </div></>;
}

function Team({ s, can, run }: { s: State; can: Can; run: Run }) {
  return <><H t="Team management" sub="Uses your existing NEAS staff (admin) accounts. Roles apply inside the Marketing Command Center only." />
    <div className="mk-card"><table className="mk-t"><thead><tr><th>Name</th><th>Email</th><th>Marketing role</th></tr></thead><tbody>
      {s.team.map((t) => <tr key={t.id}><td>{t.name}{t.id === s.me.id && " (you)"}</td><td>{t.email}</td><td>{can("admin") && t.id !== s.me.id ? <select className="mk-sel" value={t.role} onChange={(e) => run({ action: "setRole", userId: t.id, role: e.target.value }, "Role updated ✓")}>{(["admin", "manager", "editor", "viewer"] as Role[]).map((r) => <option key={r} value={r}>{r}</option>)}</select> : <span className="mk-tag">{t.role}</span>}</td></tr>)}
    </tbody></table></div>
    <div className="mk-card"><div className="mk-label">What each role can do</div><table className="mk-t"><tbody>
      <tr><td><b>Viewer</b></td><td>See everything, change nothing.</td></tr>
      <tr><td><b>Editor</b></td><td>Write and edit drafts, use AI, submit for review.</td></tr>
      <tr><td><b>Manager</b></td><td>Approve, schedule, mark published/failed, reschedule, delete, manage bio links and feeds.</td></tr>
      <tr><td><b>Admin</b></td><td>Everything, plus brand settings and team roles.</td></tr>
    </tbody></table><p className="mk-mini">To add a person, create a staff (admin) account for them first; they appear here automatically.</p></div></>;
}

function Settings({ s }: { s: State }) {
  return <><H t="Settings & logs" sub="System status and the full activity audit trail." />
    <div className="mk-grid2">
      <div className="mk-card"><div className="mk-label">System status</div><table className="mk-t"><tbody>
        <tr><td>Login &amp; permissions</td><td><span className="mk-pill st-approved">Existing NEAS admin login</span></td></tr>
        <tr><td>Database</td><td><span className="mk-pill st-approved">Connected</span></td></tr>
        <tr><td>AI generator</td><td><span className={"mk-pill " + (s.aiReady ? "st-approved" : "st-failed")}>{s.aiReady ? "On" : "Needs GEMINI_API_KEY (free)"}</span></td></tr>
        {s.platforms.map((p) => <tr key={p.id}><td>{p.name}</td><td><span className={"mk-pill " + (p.ready ? "st-approved" : "st-draft")}>{p.ready ? "App ready" : "Not set up"}</span></td></tr>)}
      </tbody></table></div>
      <div className="mk-card"><div className="mk-label">Activity log ({s.activity.length})</div><div className="mk-scroll">{s.activity.map((a) => <div key={a.id} className="mk-log">{fmt(a.at)} · {a.who} · <b>{a.action}</b> {a.detail}</div>)}{!s.activity.length && <p className="mk-mini">No activity yet.</p>}</div></div>
    </div></>;
}

function Style() {
  return <style>{`
.mk{--bg:#071D29;--bg2:#101827;--card:#172235;--gold:#CA9332;--sand:#EBC07E;--tx:#fff;--tx2:#94A3B8;--ln:rgba(148,163,184,.16);display:flex;min-height:100vh;background:var(--bg);color:var(--tx);font-family:Inter,system-ui,sans-serif;position:relative}
.mk *{box-sizing:border-box}
.mk-side{width:248px;flex:none;background:var(--bg2);border-right:1px solid var(--ln);position:sticky;top:0;height:100vh;overflow-y:auto;display:flex;flex-direction:column;padding:14px 10px;z-index:40}
.mk-col .mk-side{width:68px}.mk-col .mk-hide{display:none}
.mk-logo{display:flex;align-items:center;gap:10px;padding:4px 6px 14px;border-bottom:1px solid var(--ln);margin-bottom:8px}
.mk-logo b{display:block;letter-spacing:.06em}.mk-logo small{display:block;color:var(--sand);font-size:11px}
.mk-logo-img{width:38px;height:38px;flex:none;border-radius:50%;object-fit:cover}
.mk-logo-mark{width:36px;height:36px;flex:none;border-radius:10px;background:linear-gradient(135deg,var(--gold),var(--sand));color:#071D29;display:grid;place-items:center;font-weight:900}
.mk-logo-mark.big{width:64px;height:64px;font-size:28px;border-radius:50%}
.mk-group{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--tx2);padding:12px 10px 4px}
.mk-nav{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border-radius:9px;color:#cbd5e1;cursor:pointer;font-size:14px}
.mk-nav:hover{background:rgba(255,255,255,.05)}.mk-nav.on{background:rgba(202,147,50,.18);color:var(--sand);font-weight:700}
.mk-ic{width:20px;text-align:center;flex:none}
.mk-badge{margin-left:auto;background:#e11d48;color:#fff;border-radius:999px;font-size:11px;padding:1px 7px;font-weight:700}
.mk-collapse{all:unset;cursor:pointer;color:var(--tx2);font-size:12px;text-align:center;padding:10px;margin-top:auto}
.mk-back{color:var(--tx2);font-size:12px;text-align:center;padding:4px;text-decoration:none}
.mk-body{flex:1;min-width:0;display:flex;flex-direction:column}
.mk-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:12px;padding:10px 20px;background:rgba(7,29,41,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--ln)}
.mk-ws{border:1px solid var(--ln);border-radius:9px;padding:7px 12px;font-weight:600;font-size:13px;white-space:nowrap}
.mk-search{flex:1;max-width:460px;margin:0 auto;background:var(--bg2);border:1px solid var(--ln);border-radius:9px;padding:9px 12px;color:var(--tx);font:inherit;font-size:13px}
.mk-bell{all:unset;cursor:pointer;position:relative;font-size:18px}.mk-dot{position:absolute;top:-6px;right:-10px;background:#e11d48;color:#fff;font-size:10px;border-radius:999px;padding:0 5px}
.mk-user{display:flex;align-items:center;gap:8px}.mk-user b{display:block;font-size:13px}.mk-user small{display:block;color:var(--sand);font-size:11px;text-transform:uppercase}
.mk-av{width:32px;height:32px;border-radius:50%;background:var(--gold);color:#071D29;display:grid;place-items:center;font-weight:800}
.mk-burger{all:unset;display:none;cursor:pointer;font-size:20px}
.mk-main{padding:22px;display:grid;gap:16px;align-content:start;max-width:1500px;width:100%}
.mk-card{background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:18px;min-width:0}
.mk-h{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}.mk-h h1{margin:0;font-size:24px}.mk-h p{margin:4px 0 0;color:var(--tx2);font-size:14px}
.mk-hero{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}.mk-hero h1{margin:0;font-size:22px}.mk-hero p{margin:4px 0 0;color:var(--tx2)}
.mk-tag{display:inline-block;border:1px solid var(--ln);border-radius:6px;padding:2px 7px;font-size:11px;color:var(--sand);font-weight:700;vertical-align:middle}
.mk-stats{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.mk-stat{background:var(--bg2);border-radius:10px;padding:12px}.mk-stat small{display:block;color:var(--tx2);font-size:12px}.mk-stat b{font-size:22px;margin-right:6px}.mk-stat span{color:var(--tx2);font-size:12px}
.mk-bar{height:5px;background:rgba(255,255,255,.08);border-radius:5px;margin-top:6px}.mk-bar i{display:block;height:100%;background:var(--gold);border-radius:5px}
.mk-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.mk-row.between,.between{justify-content:space-between;display:flex;align-items:center}
.mk-btn{border:0;background:linear-gradient(135deg,#f97316,var(--gold));color:#fff;font-weight:700;border-radius:9px;padding:9px 14px;cursor:pointer;font:inherit;font-weight:700;font-size:13px;text-decoration:none;display:inline-block}
.mk-btn.ghost{background:transparent;border:1px solid var(--ln);color:var(--tx)}.mk-btn.sm{padding:5px 10px;font-size:12px}.mk-btn:disabled{opacity:.45;cursor:not-allowed}.mk-btn.danger{color:#fda4af}
.mk-label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--tx2);font-weight:700;margin-bottom:10px}
.mk-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border-radius:10px;padding:10px 12px;margin-bottom:8px;flex-wrap:wrap}.mk-item.bad{background:rgba(225,29,72,.14);border:1px solid rgba(225,29,72,.4)}.mk-item.warn{background:rgba(202,147,50,.12);border:1px solid rgba(202,147,50,.4)}
.mk-item small,.mk-li small{display:block;color:var(--tx2);font-size:12px}
.mk-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.mk-grid2.wide{grid-template-columns:3fr 2fr}.mk-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.mk-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.mk-kpi small{display:block;color:var(--tx2);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.mk-kpi b{display:block;font-size:30px;margin:6px 0 2px}.mk-kpi span{font-size:12px;color:var(--tx2)}
.mk-na{color:#fbbf24!important;font-size:12px}.mk-src{color:var(--tx2);font-size:11px}
.mk-li{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--ln);cursor:pointer}.mk-li:last-child{border:0}.mk-li.sel b{color:var(--sand)}
.mk-pill{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;border-radius:6px;padding:3px 7px;white-space:nowrap;background:#334155;color:#e2e8f0}
.st-pending{background:#78350f;color:#fde68a}.st-approved{background:#14532d;color:#bbf7d0}.st-scheduled{background:#1e3a8a;color:#bfdbfe}.st-published{background:#065f46;color:#a7f3d0}.st-failed{background:#881337;color:#fecdd3}
.mk-empty{border:1px dashed var(--ln);border-radius:12px;padding:26px;text-align:center;color:var(--tx2);font-size:13px;display:grid;gap:6px;justify-items:center}.mk-empty b{color:var(--tx);font-size:15px}
.mk-empty-ic{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#f97316,var(--gold));display:grid;place-items:center;color:#fff;font-size:20px}
.mk-link{all:unset;cursor:pointer;color:#fb923c;font-weight:700;font-size:13px}
.mk-f{display:grid;gap:5px;font-size:12px;color:var(--tx2);font-weight:600;margin-bottom:12px}
.mk-f input,.mk-f textarea,.mk-f select,.mk-sel{background:var(--bg2);border:1px solid var(--ln);border-radius:8px;padding:9px 11px;color:var(--tx);font:inherit;font-size:14px;font-weight:400}
.mk-f input:disabled,.mk-f textarea:disabled{opacity:.6}
.mk-chip{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--ln);border-radius:999px;padding:5px 11px;font-size:12px;color:#cbd5e1;cursor:pointer}.mk-chip.on{border-color:var(--gold);background:rgba(202,147,50,.15);color:var(--sand)}.mk-chip input{display:none}
.mk-mini{font-size:12px;color:var(--tx2)}.mk-warn{color:#fda4af;font-size:12px}
.mk-note{background:rgba(202,147,50,.12);border:1px solid rgba(202,147,50,.35);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--sand);margin-bottom:12px}
.mk-note code,.mk-acc code{color:#fff}
.mk-prev{max-width:100%;max-height:220px;border-radius:10px;margin-bottom:12px}
.mk-log{font-size:12px;color:#cbd5e1;padding:6px 0;border-bottom:1px solid var(--ln)}
.mk-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.mk-cal.v-day{grid-template-columns:1fr}
.mk-dow{font-size:11px;color:var(--tx2);text-align:center;padding:4px;text-transform:uppercase}
.mk-day{background:var(--bg2);border-radius:8px;min-height:96px;padding:5px;display:flex;flex-direction:column;gap:3px}.mk-cal.v-week .mk-day,.mk-cal.v-day .mk-day{min-height:300px}
.mk-day.out{opacity:.4}.mk-day.today{outline:2px solid var(--gold)}.mk-dnum{font-size:11px;color:var(--tx2)}
.mk-ev{font-size:11px;border-radius:5px;padding:3px 6px;cursor:grab;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:#334155;color:#e2e8f0;max-width:100%}
.mk-t{width:100%;border-collapse:collapse;font-size:13px}.mk-t th,.mk-t td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--ln)}.mk-t th{color:var(--tx2);font-size:11px;text-transform:uppercase}
.mk-ul{color:#cbd5e1;font-size:14px;line-height:1.8;margin:0;padding-left:20px}
.mk-bars{display:flex;gap:10px;align-items:flex-end;height:170px}.mk-bcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}.mk-b{width:100%;max-width:46px;background:linear-gradient(180deg,var(--sand),var(--gold));border-radius:6px 6px 0 0}.mk-bval{font-size:12px}.mk-bcol small{color:var(--tx2);font-size:11px}
.mk-hb{display:flex;gap:10px;align-items:center;margin-bottom:8px;font-size:13px}.mk-hbar{flex:1;height:8px;background:var(--bg2);border-radius:8px}.mk-hbar i{display:block;height:100%;background:var(--gold);border-radius:8px}
.mk-brandhead{display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap}.mk-brandhead small{display:block;color:var(--tx2)}
.mk-swatches{display:flex;gap:6px;margin-left:auto}.mk-swatches span{width:26px;height:26px;border-radius:6px;border:1px solid var(--ln)}
.mk-swatches.big{margin:0;flex-wrap:wrap}.mk-swatches.big span{width:84px;height:60px;display:flex;align-items:flex-end;padding:4px}.mk-swatches.big small{font-size:10px;background:rgba(0,0,0,.5);padding:1px 4px;border-radius:4px}
.mk-grid2>*,.mk-grid3>*,.mk-grid4>*{min-width:0}.mk-f select,.mk-f input,.mk-f textarea{width:100%;min-width:0;box-sizing:border-box}
.mk-inbox{display:grid;grid-template-columns:340px 1fr;gap:16px;align-items:start}.mk-ilist{padding:8px;max-height:70vh;overflow:auto}.mk-ithread{all:unset;box-sizing:border-box;display:grid;gap:4px;width:100%;padding:10px;border-radius:9px;cursor:pointer;border-bottom:1px solid var(--ln)}.mk-ithread:hover{background:rgba(255,255,255,.04)}.mk-ithread.sel{background:rgba(202,147,50,.15)}.mk-ithread small{color:var(--tx2);font-size:11px}
.mk-chat{display:grid;gap:8px;margin:12px 0;max-height:46vh;overflow:auto;padding:4px}.mk-bubble{max-width:80%;background:var(--bg2);border-radius:12px;padding:9px 12px;font-size:14px;white-space:pre-wrap}.mk-bubble.mine{justify-self:end;background:rgba(202,147,50,.2)}.mk-bubble small{display:block;color:var(--tx2);font-size:11px;margin-top:4px}
@media (max-width:900px){.mk-inbox{grid-template-columns:1fr}}
.mk-switch{position:relative;display:inline-block;width:40px;height:22px}.mk-switch input{opacity:0;width:0;height:0}.mk-switch span{position:absolute;inset:0;background:#334155;border-radius:22px;cursor:pointer;transition:.2s}.mk-switch span:before{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}.mk-switch input:checked+span{background:var(--gold)}.mk-switch input:checked+span:before{transform:translateX(18px)}.mk-switch input:focus-visible+span{outline:2px solid var(--sand)}
.mk-studio-stage{background:var(--bg2);border-radius:10px;padding:12px;display:grid;place-items:center}.mk-canvas{width:100%;max-width:100%;max-height:70vh;height:auto;object-fit:contain;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.4)}.mk-mitem{display:grid;gap:6px}
.mk-media{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}.mk-media img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}
.mk-x{all:unset;cursor:pointer;color:#fda4af;font-size:18px;padding:0 6px}
.mk-feeditem{border-bottom:1px solid var(--ln);padding:10px 0}
.mk-phone{max-width:300px;margin:0 auto;background:var(--bg);border:1px solid var(--ln);border-radius:28px;padding:28px 18px;display:grid;gap:10px;justify-items:center;text-align:center}.mk-phone small{color:var(--tx2)}
.mk-biobtn{width:100%;border:1px solid var(--gold);border-radius:999px;padding:10px;font-weight:700;font-size:13px}
.mk-scroll{max-height:480px;overflow:auto}
.mk-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0b1220;border:1px solid var(--gold);color:#fff;padding:10px 16px;border-radius:10px;z-index:100;font-size:14px}
@media (max-width:1100px){.mk-grid4{grid-template-columns:1fr 1fr}.mk-grid3{grid-template-columns:1fr 1fr}.mk-grid2,.mk-grid2.wide{grid-template-columns:1fr}}
@media (max-width:760px){.mk-side{position:fixed;left:-260px;transition:left .2s;width:248px!important}.mk-side.open{left:0}.mk-col .mk-hide{display:initial}.mk-burger{display:block}.mk-ws,.mk-hide-sm{display:none}
 .mk-main{padding:14px}.mk-stats,.mk-grid4,.mk-grid3{grid-template-columns:1fr 1fr}.mk-hero{grid-template-columns:1fr}.mk-cal.v-month .mk-day{min-height:58px}.mk-ev{font-size:10px}}
@media print{.mk-side,.mk-top,.mk-h .mk-row,.mk-toast{display:none!important}.mk,.mk-card{background:#fff!important;color:#000!important;border:0}.mk *{color:#000!important}.mk-main>*:not(.mk-print){display:none}}
`}</style>;
}
