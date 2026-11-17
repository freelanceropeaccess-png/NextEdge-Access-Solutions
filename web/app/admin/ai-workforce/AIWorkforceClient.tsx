"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Agent = { id: string; name: string; lane: string; role: string; status: "ready" | "standby" | "review"; metric: string; color: string; };
type Lead = { id: number; company: string; contact: string; email: string; phone: string; service: string; source: string; stage: string; value: number; next_step: string; created_at: string; };
type Draft = { id: number; lead_id: number; channel: string; subject: string; body: string; status: string; created_at: string; company: string; };
type Run = { id: number; workflow: string; status: string; summary: string; created_at: string; };
type State = { leads: Lead[]; drafts: Draft[]; runs: Run[]; metrics: { leads: number; qualified: number; proposals: number; pipeline: number; drafts: number }; };
type Tab = "command" | "agents" | "leads" | "outreach" | "approvals" | "performance";

const AGENTS: Agent[] = [
  { id:"JARVIS",name:"JARVIS Orchestrator",lane:"COMMAND",role:"Plans work, delegates specialists and checks permissions",status:"ready",metric:"Orchestration",color:"#d6a84f" },
  { id:"SALES",name:"Sales & CRM",lane:"REVENUE",role:"Qualifies prospects, plans follow-ups and advances deals",status:"ready",metric:"Lead conversion",color:"#e4b65d" },
  { id:"MARKETING",name:"Marketing Growth",lane:"REVENUE",role:"SEO, campaigns, channel strategy and demand generation",status:"ready",metric:"Qualified demand",color:"#9bc4b2" },
  { id:"CONTENT",name:"Creative Studio",lane:"REVENUE",role:"Builds campaign assets, post copy, scripts and repurposed content",status:"ready",metric:"Content throughput",color:"#b3a2dc" },
  { id:"QUALIFY",name:"Tender & Qualification",lane:"COMMERCIAL",role:"Screens requirements, deadlines and evidence gaps",status:"standby",metric:"Bid readiness",color:"#a7b8d4" },
  { id:"FINANCE",name:"Finance & Commercial",lane:"COMMERCIAL",role:"Checks costing, margin, assumptions and proposal risk",status:"standby",metric:"Margin integrity",color:"#df9b83" },
  { id:"CUSTOMER",name:"Customer Experience",lane:"RELATIONSHIPS",role:"Handles first response, case routing and customer follow-up",status:"standby",metric:"Response SLA",color:"#9ac9d1" },
  { id:"PROJECTS",name:"Project Delivery",lane:"DELIVERY",role:"Checks delivery capacity, schedule and mobilization readiness",status:"standby",metric:"Delivery confidence",color:"#a9c28b" },
  { id:"ENGINEERING",name:"Engineering & HSE Review",lane:"DELIVERY",role:"Prepares technical review packs for competent human approval",status:"standby",metric:"Technical completeness",color:"#d2a5a5" },
  { id:"AUDIT",name:"Integrity & QA",lane:"GOVERNANCE",role:"Reviews evidence, policy compliance and output quality",status:"standby",metric:"First-pass quality",color:"#c2b5a0" },
];

const STAGES = ["new","qualified","discovery","proposal","negotiation","won","lost"];
const peso = (n:number) => "₱" + Math.round(n || 0).toLocaleString("en-PH");
const dt = (s:string) => new Date(s).toLocaleDateString("en-PH",{day:"2-digit",month:"short"});
async function request(action:string, payload:Record<string,unknown> = {}) {
  const r = await fetch("/api/admin/ai-workforce",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...payload})});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error || "Request failed");
  return j;
}

export default function AIWorkforceClient(){
  const [tab,setTab]=useState<Tab>("command");
  const [data,setData]=useState<State|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [company,setCompany]=useState("");
  const [contact,setContact]=useState("");
  const [email,setEmail]=useState("");
  const [phone,setPhone]=useState("");
  const [service,setService]=useState("Rope Access & Industrial Services");
  const [source,setSource]=useState("Website inquiry");
  const [value,setValue]=useState("");
  const [selectedLead,setSelectedLead]=useState<number| "">("");
  const [channel,setChannel]=useState("email");
  const [draft,setDraft]=useState<Draft|null>(null);
  const [goal,setGoal]=useState("Generate qualified leads and book discovery calls for NEAS rope access, renewable and industrial services.");
  const [query,setQuery]=useState("");
  const [expanded,setExpanded]=useState<string|null>("JARVIS");

  const load=useCallback(async()=>{
    try{const r=await fetch("/api/admin/ai-workforce",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to load workforce");setData(j);}catch(e){setError((e as Error).message);}
  },[]);
  useEffect(()=>{load();},[load]);
  const flash=(s:string)=>{setNotice(s);window.setTimeout(()=>setNotice(""),4000);};
  const run=async(action:string,payload:Record<string,unknown>={},success="Saved")=>{
    setBusy(true);setError("");
    try{const r=await request(action,payload);if(r.draft)setDraft(r.draft);flash(success);await load();return r;}
    catch(e){setError((e as Error).message);return null;}finally{setBusy(false);}
  };
  const filtered=useMemo(()=> (data?.leads||[]).filter(l=>(l.company+" "+l.contact+" "+l.service+" "+l.stage).toLowerCase().includes(query.toLowerCase())),[data,query]);
  const lead=data?.leads.find(l=>l.id===Number(selectedLead));
  const nav:[Tab,string,string][]=[["command","Command graph","◈"],["agents","Agent matrix","⌘"],["leads","Lead pipeline","↗"],["outreach","Human outreach","✉"],["approvals","Human approvals","◉"],["performance","Performance","▥"]];

  return <div className="wf">
    <style jsx global>{`
      .wf{--ink:#e7edf4;--muted:#8292a5;--line:rgba(164,185,205,.14);--panel:rgba(12,24,37,.88);--gold:#ca9332;--sand:#ebc07e;color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui;background:radial-gradient(ellipse at 48% -20%,rgba(202,147,50,.13),transparent 48%),#07111b;border:1px solid #203346;border-radius:18px;min-height:780px;overflow:hidden;box-shadow:0 24px 70px rgba(2,8,15,.35)}
      .wf *{box-sizing:border-box}.wf button,.wf input,.wf textarea,.wf select{font:inherit}.wf button{cursor:pointer}
      .wf-shell{display:grid;grid-template-columns:224px minmax(0,1fr);min-height:780px}
      .wf-side{background:rgba(4,13,22,.8);border-right:1px solid var(--line);padding:20px 14px;display:flex;flex-direction:column;gap:22px}
      .wf-brand{display:flex;align-items:center;gap:10px;padding:4px 7px 18px;border-bottom:1px solid var(--line)}.wf-mark{width:35px;height:35px;border-radius:11px;display:grid;place-items:center;color:#07111b;background:linear-gradient(145deg,#f0d39a,#b47b26);font-weight:900;font-size:18px;box-shadow:0 0 24px #ca933244}.wf-brand b{letter-spacing:.12em;font-size:13px}.wf-brand small{display:block;color:var(--muted);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
      .wf-navlabel{font-size:9px;color:#71869a;letter-spacing:.18em;text-transform:uppercase;padding:0 9px 6px}.wf-nav{display:grid;gap:4px}.wf-nav button{display:flex;gap:10px;align-items:center;text-align:left;width:100%;border:1px solid transparent;border-radius:9px;padding:10px;color:#a9b8c7;background:transparent;font-size:12px}.wf-nav button:hover,.wf-nav button.on{color:#f1d8a9;background:linear-gradient(90deg,#ca93321d,#ca933207);border-color:#ca933244}.wf-nav button span:first-child{width:18px;color:#d4ac67;font-size:16px}
      .wf-sidefoot{margin-top:auto;border:1px solid var(--line);border-radius:12px;padding:12px;background:#0b1a28}.wf-sidefoot small{color:var(--muted);display:block;font-size:10px}.wf-sidefoot b{font-size:12px;color:#e9c98e}
      .wf-main{min-width:0;padding:22px 24px 28px}.wf-top{display:flex;justify-content:space-between;gap:14px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:20px}.wf-kicker{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#d2aa68}.wf-title{font-size:25px;letter-spacing:-.04em;margin:2px 0 3px;font-weight:650}.wf-sub{color:var(--muted);font-size:12px}.wf-live{display:flex;align-items:center;gap:7px;border:1px solid #43856b55;color:#9ad0b2;background:#17392a44;border-radius:99px;padding:6px 10px;font-size:10px;white-space:nowrap}.wf-dot{width:6px;height:6px;border-radius:50%;background:#6bd19b;box-shadow:0 0 10px #6bd19b}
      .wf-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.wf-stat{background:linear-gradient(145deg,#122538,#0b1926);border:1px solid var(--line);border-radius:12px;padding:13px 14px}.wf-stat label{font-size:9px;letter-spacing:.13em;color:#91a4b6;text-transform:uppercase}.wf-stat strong{display:block;font-size:23px;letter-spacing:-.04em;margin-top:5px;color:#f0d5a4}.wf-stat small{font-size:10px;color:#7f91a3}
      .wf-card{background:linear-gradient(145deg,rgba(18,36,53,.92),rgba(9,22,34,.94));border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}.wf-card h3{font-size:13px;margin:0 0 4px;letter-spacing:.01em}.wf-card p{color:var(--muted);font-size:11px;margin:0 0 12px}.wf-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.wf-button{border:1px solid #ca933255;background:#ca933219;color:#f1d7a7;border-radius:9px;padding:9px 12px;font-size:11px;font-weight:650}.wf-button:hover{background:#ca933233}.wf-button:disabled{opacity:.5;cursor:not-allowed}.wf-button.ghost{border-color:var(--line);background:#ffffff08;color:#c4d0db}.wf-button.danger{border-color:#b65c5c55;color:#f0aaaa;background:#7d25251c}
      .wf-columns{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(270px,.85fr);gap:12px}.wf-graph{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;align-items:stretch}.wf-node{border:1px solid var(--line);border-radius:11px;padding:11px;background:#091725;position:relative;min-height:94px}.wf-node:after{content:"";position:absolute;right:-8px;top:50%;width:7px;height:1px;background:#ca933288}.wf-node:nth-child(3n):after{display:none}.wf-node small{font-size:8px;color:#d4ad6b;letter-spacing:.15em}.wf-node b{display:block;font-size:11px;margin:5px 0}.wf-node span{display:block;font-size:9px;color:#8498aa}.wf-node.active{border-color:#ca9332a8;box-shadow:inset 0 0 24px #ca93320d,0 0 18px #ca93320b}
      .wf-list{display:grid;gap:8px}.wf-item{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--line);border-radius:10px;background:#091725}.wf-item b{font-size:11px;display:block}.wf-item small{font-size:10px;color:var(--muted)}.wf-pill{font-size:9px;color:#d7bd8d;border:1px solid #c9a76b44;border-radius:99px;padding:3px 7px;white-space:nowrap}
      .wf-tablewrap{overflow:auto;border:1px solid var(--line);border-radius:12px}.wf table{width:100%;border-collapse:collapse;min-width:680px}.wf th,.wf td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);font-size:11px}.wf th{font-size:9px;color:#8297aa;text-transform:uppercase;letter-spacing:.13em;background:#0a1927}.wf td{color:#d4dee8}.wf tr:last-child td{border:0}
      .wf-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wf-field{display:grid;gap:5px;color:#a7b6c5;font-size:10px}.wf-field input,.wf-field textarea,.wf-field select,.wf-search{width:100%;border:1px solid #30475a;background:#071522;color:#e4edf5;border-radius:8px;padding:10px 11px;outline:none}.wf-field input:focus,.wf-field textarea:focus,.wf-field select:focus,.wf-search:focus{border-color:#ca9332}.wf-field textarea{min-height:110px;resize:vertical}.wf-span{grid-column:1/-1}.wf-agentgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.wf-agent{border:1px solid var(--line);background:#0a1a29;border-radius:12px;padding:13px;text-align:left;color:var(--ink)}.wf-agent:hover,.wf-agent.selected{border-color:#ca9332aa;background:#102438}.wf-agenthead{display:flex;align-items:center;gap:9px}.wf-orb{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:800;border:1px solid #ca933255;color:#e6c48c;background:radial-gradient(circle at 35% 30%,#ca933255,#091725)}.wf-agent b{font-size:11px}.wf-agent p{margin:8px 0 0;color:#8fa1b2;font-size:10px}.wf-agent small{font-size:8px;color:#c5a46b;letter-spacing:.14em}
      .wf-empty{color:#8498aa;text-align:center;padding:25px 10px;font-size:11px}.wf-note{border:1px solid #ca933244;background:#ca93320d;color:#d9c49f;padding:10px 12px;border-radius:10px;font-size:10px;margin-bottom:12px}.wf-error{border:1px solid #a94f4f66;background:#62252522;color:#ffc0b5;padding:10px;border-radius:9px;margin-bottom:12px;font-size:11px}.wf-success{color:#a9d6b9;font-size:10px}
      .wf-kanban{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:9px;overflow:auto}.wf-lane{background:#071522;border:1px solid var(--line);border-radius:11px;padding:10px;min-height:170px}.wf-lane h4{font-size:9px;letter-spacing:.14em;color:#c9aa72;text-transform:uppercase;margin:0 0 9px}.wf-lead{border:1px solid var(--line);background:#102235;border-radius:8px;padding:9px;margin-bottom:7px}.wf-lead b{display:block;font-size:10px}.wf-lead small{font-size:9px;color:#91a3b4}
      @media(max-width:900px){.wf-shell{grid-template-columns:1fr}.wf-side{border-right:0;border-bottom:1px solid var(--line);padding:12px;gap:10px}.wf-brand{padding:0 4px 10px}.wf-nav{display:flex;overflow:auto}.wf-navlabel,.wf-sidefoot{display:none}.wf-nav button{white-space:nowrap;width:auto}.wf-main{padding:16px 12px}.wf-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wf-columns{grid-template-columns:1fr}}
      @media(max-width:580px){.wf-title{font-size:21px}.wf-top{align-items:flex-start;flex-direction:column}.wf-agentgrid{grid-template-columns:1fr}.wf-graph{grid-template-columns:repeat(2,minmax(0,1fr))}.wf-node:nth-child(3n):after{display:block}.wf-node:nth-child(2n):after{display:none}.wf-form{grid-template-columns:1fr}.wf-span{grid-column:auto}}
    `}</style>
    <div className="wf-shell">
      <aside className="wf-side">
        <div className="wf-brand"><div className="wf-mark">N</div><div><b>NEAS INTELLIGENCE</b><small>Human + AI workforce</small></div></div>
        <div><div className="wf-navlabel">Command workspace</div><nav className="wf-nav">{nav.map(([id,label,icon])=><button key={id} className={tab===id?"on":""} onClick={()=>setTab(id)}><span>{icon}</span>{label}</button>)}</nav></div>
        <div className="wf-sidefoot"><small>OPERATING MODE</small><b>HYBRID · HUMAN-GOVERNED</b><small style={{marginTop:8}}>AI prepares. Humans authorize.</small></div>
      </aside>
      <main className="wf-main">
        <header className="wf-top"><div><div className="wf-kicker">NextEdge Access Solutions · Business OS</div><h1 className="wf-title">{nav.find(n=>n[0]===tab)?.[1] || "Command"}</h1><div className="wf-sub">One coordinated workforce. Every action traceable. Every result measurable.</div></div><div className="wf-live"><span className="wf-dot"/>{data?"CONTROL PLANE CONNECTED":"CONNECTING"}</div></header>
        {error&&<div className="wf-error">{error}</div>}{notice&&<div className="wf-success">{notice}</div>}
        {!data?<div className="wf-card wf-empty">Loading NEAS workforce intelligence…</div>:<>
        {tab==="command"&&<>
          <div className="wf-grid">
            <div className="wf-stat"><label>Active leads</label><strong>{data.metrics.leads}</strong><small>Tracked opportunities</small></div>
            <div className="wf-stat"><label>Qualified pipeline</label><strong>{data.metrics.qualified}</strong><small>Qualification stage and beyond</small></div>
            <div className="wf-stat"><label>Pipeline value</label><strong>{peso(data.metrics.pipeline)}</strong><small>Entered opportunity values</small></div>
            <div className="wf-stat"><label>Outreach drafts</label><strong>{data.metrics.drafts}</strong><small>Awaiting human review</small></div>
          </div>
          <div className="wf-columns">
            <section className="wf-card"><div className="wf-row"><div><h3>Human-matrix workflow</h3><p>Business process graph · specialist hand-offs · approval gates</p></div><span className="wf-pill">LIVE DATA</span></div>
              <div className="wf-graph">
                {["Lead capture","JARVIS triage","Sales qualification","Service specialist","Finance & costing","Proposal review","Human approval","Client follow-up","Won / delivery"].map((n,i)=><div key={n} className={"wf-node "+([0,1,2].includes(i)?"active":"")}><small>STAGE 0{i+1}</small><b>{n}</b><span>{["Intake","Orchestrate","Qualify","Assess fit","Protect margin","Verify scope","Owner sign-off","Relationship","Measure outcome"][i]}</span></div>)}
              </div>
              <div className="wf-note" style={{marginTop:12}}>External actions remain gated: no proposal issue, email send, purchase commitment, contract acceptance or safety authorization without the required human approval.</div>
            </section>
            <section className="wf-card"><h3>Executive priorities</h3><p>Business-first operating queue</p><div className="wf-list">
              {[["01","Respond to new inquiries","Sales Agent · qualify and assign"],["02","Prepare high-fit proposals","Finance + service specialists"],["03","Create authority-building content","Marketing + Creative Studio"],["04","Follow up open opportunities","Human-reviewed outreach"]].map(x=><div className="wf-item" key={x[0]}><span className="wf-pill">{x[0]}</span><div><b>{x[1]}</b><small>{x[2]}</small></div></div>)}
            </div><button className="wf-button" style={{marginTop:12}} onClick={()=>setTab("leads")}>Open lead pipeline →</button></section>
          </div>
          <section className="wf-card" style={{marginTop:12}}><div className="wf-row"><div><h3>Latest opportunities</h3><p>Real records entered in this portal</p></div><button className="wf-button" onClick={()=>setTab("leads")}>Manage leads</button></div>{data.leads.length?<div className="wf-tablewrap"><table><thead><tr><th>Company</th><th>Service</th><th>Stage</th><th>Value</th><th>Added</th></tr></thead><tbody>{data.leads.slice(0,6).map(l=><tr key={l.id}><td>{l.company}</td><td>{l.service}</td><td>{l.stage}</td><td>{peso(l.value)}</td><td>{dt(l.created_at)}</td></tr>)}</tbody></table></div>:<div className="wf-empty">No leads yet. Add your first opportunity in Lead Pipeline.</div>}</section>
        </>}
        {tab==="agents"&&<>
          <div className="wf-note">The matrix below shows the designed specialist workforce and current portal readiness. Only JARVIS, Sales, Marketing and Creative are enabled as initial business-workflow modules; other specialists are staged until their data, skills and controls are implemented.</div>
          <div className="wf-agentgrid">{AGENTS.map(a=><button key={a.id} className={"wf-agent "+(expanded===a.id?"selected":"")} onClick={()=>setExpanded(expanded===a.id?null:a.id)}><div className="wf-agenthead"><span className="wf-orb" style={{borderColor:a.color+"88",color:a.color}}>{a.id.slice(0,2)}</span><div><b>{a.name}</b><small style={{display:"block"}}>{a.lane} · {a.status.toUpperCase()}</small></div></div><p>{a.role}</p>{expanded===a.id&&<p style={{color:"#e1c58e"}}>Primary KPI: {a.metric}. Execution rights are limited to assigned skills and approved workflows.</p>}</button>)}</div>
        </>}
        {tab==="leads"&&<>
          <div className="wf-columns">
            <section className="wf-card"><h3>Capture a new opportunity</h3><p>Record a real prospect. Avoid storing sensitive personal information that is not needed.</p>
              <form className="wf-form" onSubmit={async e=>{e.preventDefault();const r=await run("createLead",{company,contact,email,phone,service,source,value:Number(value)||0},"Lead captured");if(r){setCompany("");setContact("");setEmail("");setPhone("");setValue("");}}}>
                <label className="wf-field">Company / organization<input required maxLength={160} value={company} onChange={e=>setCompany(e.target.value)} placeholder="Company name"/></label>
                <label className="wf-field">Contact person<input maxLength={120} value={contact} onChange={e=>setContact(e.target.value)} placeholder="Name / role"/></label>
                <label className="wf-field">Business email<input type="email" maxLength={240} value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com"/></label>
                <label className="wf-field">Business phone<input maxLength={60} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+63…"/></label>
                <label className="wf-field">Service interest<select value={service} onChange={e=>setService(e.target.value)}>{["Rope Access & Industrial Services","Wind Turbine / Renewable Energy","Met Mast & Telecom Towers","Offshore / Onshore / Power Plant","Facade / Waterproofing / Cleaning","NDT / Inspection / Welding","Training / Consultancy / PPE"].map(x=><option key={x}>{x}</option>)}</select></label>
                <label className="wf-field">Lead source<select value={source} onChange={e=>setSource(e.target.value)}>{["Website inquiry","Referral","LinkedIn","Email research","Industry event","Existing client","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
                <label className="wf-field wf-span">Estimated opportunity value (PHP)<input type="number" min="0" step="1000" value={value} onChange={e=>setValue(e.target.value)} placeholder="Optional"/></label>
                <div className="wf-span"><button className="wf-button" disabled={busy||!company.trim()}>+ Save opportunity</button></div>
              </form>
            </section>
            <section className="wf-card"><h3>Pipeline board</h3><p>Move deals only when the stage is supported by a real client interaction.</p><div className="wf-kanban">{STAGES.slice(0,4).map(stage=><div className="wf-lane" key={stage}><h4>{stage}</h4>{data.leads.filter(l=>l.stage===stage).map(l=><div className="wf-lead" key={l.id}><b>{l.company}</b><small>{l.service}<br/>{peso(l.value)}</small><select aria-label={"Stage for "+l.company} value={l.stage} onChange={e=>run("updateStage",{id:l.id,stage:e.target.value},"Pipeline updated")} style={{marginTop:7,width:"100%",background:"#071522",color:"#e4edf5",border:"1px solid #30475a",borderRadius:6,padding:5,fontSize:10}}>{STAGES.map(s=><option key={s} value={s}>{s}</option>)}</select><button className="wf-button ghost" style={{marginTop:7,width:"100%"}} onClick={()=>{setSelectedLead(l.id);setTab("outreach")}}>Prepare outreach</button></div>)}</div>)}</div></section>
          </div>
          <section className="wf-card" style={{marginTop:12}}><div className="wf-row"><div><h3>All opportunities</h3><p>Search and track every prospect</p></div><input className="wf-search" style={{maxWidth:250}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search company / service"/></div><div className="wf-tablewrap"><table><thead><tr><th>Company</th><th>Contact</th><th>Service</th><th>Stage</th><th>Value</th><th>Source</th><th>Action</th></tr></thead><tbody>{filtered.map(l=><tr key={l.id}><td>{l.company}</td><td>{l.contact||"—"}<br/>{l.email}</td><td>{l.service}</td><td>{l.stage}</td><td>{peso(l.value)}</td><td>{l.source}</td><td><button className="wf-button ghost" onClick={()=>{setSelectedLead(l.id);setTab("outreach")}}>Outreach</button></td></tr>)}</tbody></table></div></section>
        </>}
        {tab==="outreach"&&<>
          <div className="wf-note">Human-led relationship development: create tailored drafts, review the recipient and business relevance, then send from your own approved business mailbox or use the call script. The system does not impersonate a person or auto-send cold outreach.</div>
          <div className="wf-columns"><section className="wf-card"><h3>Prepare a personal client approach</h3><p>Natural, relevant, professional communication with a clear next step.</p>
            <div className="wf-form">
              <label className="wf-field wf-span">Select lead<select value={selectedLead} onChange={e=>setSelectedLead(e.target.value?Number(e.target.value):"")}><option value="">Choose a prospect</option>{data.leads.map(l=><option key={l.id} value={l.id}>{l.company} · {l.service}</option>)}</select></label>
              <label className="wf-field">Contact channel<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="email">Email introduction</option><option value="call">Cold-call / discovery script</option><option value="linkedin">LinkedIn connection note</option></select></label>
              <label className="wf-field">Desired outcome<select value={goal} onChange={e=>setGoal(e.target.value)}><option>Generate qualified leads and book discovery calls for NEAS rope access, renewable and industrial services.</option><option>Arrange a technical discovery meeting and request scope documents.</option><option>Re-engage an existing client and identify upcoming maintenance requirements.</option><option>Introduce NEAS training, work-at-height and rope rescue capabilities.</option></select></label>
              <div className="wf-span"><button className="wf-button" disabled={busy||!lead} onClick={()=>run("draftOutreach",{leadId:Number(selectedLead),channel,goal},"Outreach draft prepared")}>✦ Generate tailored {channel} draft</button></div>
            </div>
            {draft&&<div style={{marginTop:14}} className="wf-card"><div className="wf-row"><h3>{draft.channel==="call"?"Call guide":"Outreach draft"}</h3><span className="wf-pill">{draft.status}</span></div><b style={{display:"block",fontSize:12,margin:"10px 0"}}>{draft.subject}</b><textarea readOnly value={draft.body} className="wf-field" style={{width:"100%",minHeight:220,background:"#071522",color:"#e4edf5",border:"1px solid #30475a",borderRadius:8,padding:12}}/><div className="wf-row" style={{marginTop:10}}><button className="wf-button ghost" onClick={()=>navigator.clipboard.writeText(draft.body)}>Copy draft</button>{draft.channel==="email"&&lead?.email&&<a className="wf-button" href={"mailto:"+encodeURIComponent(lead.email)+"?subject="+encodeURIComponent(draft.subject)+"&body="+encodeURIComponent(draft.body)}>Open in email app →</a>}</div></div>}
          </section><section className="wf-card"><h3>Human interaction principles</h3><p>Be credible, relevant and respectful. No fake familiarity or fabricated relationship.</p><div className="wf-list">{[["Research before reaching out","Use public company context and a relevant service reason."],["Personalize honestly","Use the recipient's actual role and company; no invented referrals."],["Offer value first","Share a capability, checklist or useful technical insight."],["Ask for a small next step","Request a short discovery call or scope review."],["Respect preferences","Record opt-outs and suppress future contact where requested."],["Track the outcome","Log response, meeting, proposal and next action."]].map((x,i)=><div className="wf-item" key={x[0]}><span className="wf-pill">0{i+1}</span><div><b>{x[0]}</b><small>{x[1]}</small></div></div>)}</div></section></div>
        </>}
        {tab==="approvals"&&<>
          <div className="wf-note">Approvals are a separate human authority layer. No external email, quotation, campaign publication, purchase or contract commitment should be issued by an agent without the required authorized approval.</div>
          <section className="wf-card"><h3>Drafts awaiting review</h3><p>Review outreach and proposed actions before they leave NEAS systems.</p>{data.drafts.length?<div className="wf-tablewrap"><table><thead><tr><th>Company</th><th>Channel</th><th>Subject / purpose</th><th>Status</th><th>Created</th></tr></thead><tbody>{data.drafts.map(d=><tr key={d.id}><td>{d.company}</td><td>{d.channel}</td><td>{d.subject}</td><td>{d.status}</td><td>{dt(d.created_at)}</td></tr>)}</tbody></table></div>:<div className="wf-empty">No outreach drafts are waiting for review.</div>}</section>
          <section className="wf-card" style={{marginTop:12}}><h3>Authority matrix</h3><div className="wf-tablewrap"><table><thead><tr><th>Action</th><th>AI authority</th><th>Human control</th></tr></thead><tbody>{[["Research / classify / summarize","Autonomous within access","Audit sampling"],["Draft posts, emails and proposals","Prepare draft only","Review and approve before issue"],["Update internal lead stage","Authorized internal update","Audit trail and role check"],["Send external email / cold outreach","No autonomous send","Explicit human send action"],["Publish social campaigns / paid ads","Prepare and schedule proposal","Manager approval"],["Prices, contracts, purchase and payment","No autonomous commitment","Owner / delegated authority"],["Safety plans, anchor or engineering sign-off","Assistive drafting only","Competent person approval"]].map(x=><tr key={x[0]}><td>{x[0]}</td><td>{x[1]}</td><td>{x[2]}</td></tr>)}</tbody></table></div></section>
        </>}
        {tab==="performance"&&<>
          <div className="wf-grid"><div className="wf-stat"><label>Lead records</label><strong>{data.metrics.leads}</strong><small>All tracked sources</small></div><div className="wf-stat"><label>Qualified</label><strong>{data.metrics.qualified}</strong><small>Qualified + later stages</small></div><div className="wf-stat"><label>Proposal stage</label><strong>{data.metrics.proposals}</strong><small>Proposal, negotiation and won</small></div><div className="wf-stat"><label>Pipeline amount</label><strong>{peso(data.metrics.pipeline)}</strong><small>Manually entered estimates</small></div></div>
          <section className="wf-card"><h3>Business outcome ledger</h3><p>These metrics are derived from the NEAS AI Workforce lead records, not from external CRM or accounting systems.</p><div className="wf-tablewrap"><table><thead><tr><th>Workflow</th><th>Status</th><th>Latest event</th><th>Recorded result</th></tr></thead><tbody>{data.runs.map(r=><tr key={r.id}><td>{r.workflow}</td><td>{r.status}</td><td>{dt(r.created_at)}</td><td>{r.summary}</td></tr>)}</tbody></table></div>{!data.runs.length&&<div className="wf-empty">No workflow runs recorded yet. New lead and outreach actions will appear here.</div>}</section>
        </>}
        </>}
      </main>
    </div>
  </div>;
}
