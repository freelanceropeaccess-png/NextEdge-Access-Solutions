import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { DEFAULT_BRAND, generate } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const stages = ["new","qualified","discovery","proposal","negotiation","won","lost"] as const;
const channels = ["email","call","linkedin"] as const;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0,max);
async function admin() { const user = await getUser(); return user?.role === "admin" ? user : null; }

export async function GET() {
  const user = await admin();
  if (!user) return json({ error: "Admin access required." }, 403);
  try {
    const [leads,drafts,runs,metrics] = await Promise.all([
      sql\`select id, company, contact, email, phone, service, source, stage, estimated_value, next_step, created_at from aiw_leads order by created_at desc limit 500\`,
      sql\`select d.id, d.lead_id, d.channel, d.subject, d.body, d.status, d.created_at, l.company from aiw_outreach_drafts d join aiw_leads l on l.id=d.lead_id order by d.created_at desc limit 200\`,
      sql\`select id, workflow, status, summary, created_at from aiw_workflow_runs order by created_at desc limit 50\`,
      sql\`select count(*)::int as leads,
        count(*) filter (where stage in ('qualified','discovery','proposal','negotiation','won'))::int as qualified,
        count(*) filter (where stage in ('proposal','negotiation','won'))::int as proposals,
        coalesce(sum(estimated_value) filter (where stage not in ('lost','won')),0)::float as pipeline,
        (select count(*)::int from aiw_outreach_drafts where status in ('draft','reviewed')) as drafts
        from aiw_leads\`
    ]);
    return json({
      leads: leads.map(x=>({...x,id:Number(x.id),value:Number(x.estimated_value),estimated_value:undefined,created_at:new Date(x.created_at).toISOString()})),
      drafts: drafts.map(x=>({...x,id:Number(x.id),lead_id:Number(x.lead_id),created_at:new Date(x.created_at).toISOString()})),
      runs: runs.map(x=>({...x,id:Number(x.id),created_at:new Date(x.created_at).toISOString()})),
      metrics: metrics[0]
    });
  } catch (e) {
    return json({ error: "AI Workforce data is not ready. Database migration may be pending.", detail: process.env.NODE_ENV === "development" ? String(e) : undefined }, 503);
  }
}

export async function POST(req: Request) {
  const user = await admin();
  if (!user) return json({ error: "Admin access required." }, 403);
  const origin = req.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== new URL(req.url).host) return json({ error: "Bad origin." }, 403); } catch { return json({ error: "Bad origin." }, 403); } }
  const b = await req.json().catch(()=>null);
  if (!b || typeof b !== "object") return json({ error: "Invalid request." }, 400);
  try {
    if (b.action === "createLead") {
      const company=text(b.company,160), contact=text(b.contact,120), email=text(b.email,240), phone=text(b.phone,60);
      const service=text(b.service,180), source=text(b.source,100) || "Manual entry";
      const value=Number(b.value)||0;
      if (!company || !service || value < 0 || !Number.isFinite(value)) return json({error:"Company, service and a valid non-negative opportunity value are required."},400);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:"Enter a valid business email."},400);
      const row=await sql\`insert into aiw_leads(company,contact,email,phone,service,source,estimated_value,created_by) values(\${company},\${contact},\${email},\${phone},\${service},\${source},\${value},\${user.id}) returning id\`;
      await sql\`insert into aiw_workflow_runs(workflow,status,summary,lead_id,actor_id) values('Lead capture','completed',\${"Opportunity captured: "+company},\${row[0].id},\${user.id})\`;
      return json({ok:true,id:Number(row[0].id)});
    }
    if (b.action === "updateStage") {
      const id=Number(b.id), stage=String(b.stage);
      if (!Number.isSafeInteger(id) || !(stages as readonly string[]).includes(stage)) return json({error:"Invalid lead stage."},400);
      const row=await sql\`update aiw_leads set stage=\${stage},updated_at=now() where id=\${id} returning company\`;
      if (!row.length) return json({error:"Lead not found."},404);
      await sql\`insert into aiw_workflow_runs(workflow,status,summary,lead_id,actor_id) values('Pipeline progression','completed',\${row[0].company+" moved to "+stage},\${id},\${user.id})\`;
      return json({ok:true});
    }
    if (b.action === "draftOutreach") {
      const leadId=Number(b.leadId), channel=String(b.channel);
      if (!Number.isSafeInteger(leadId) || !(channels as readonly string[]).includes(channel)) return json({error:"Select a valid lead and outreach channel."},400);
      const lead=(await sql\`select * from aiw_leads where id=\${leadId}\`)[0];
      if (!lead) return json({error:"Lead not found."},404);
      if (lead.contact_status === "opted_out") return json({error:"This contact has opted out. Outreach is blocked."},409);
      const goal=text(b.goal,500) || "Arrange an introductory discussion";
      const context=\`Channel: \${channel}. Prospect company: \${lead.company}. Contact name/role: \${lead.contact || "not supplied"}. Service interest: \${lead.service}. Source: \${lead.source}. Business email: \${lead.email || "not supplied"}. Goal: \${goal}. Write only what is supported by this information. Do not invent research or a prior relationship. NEAS identity: NextEdge Access Solutions (NEAS) OPC, Philippines. Website: https://www.nextedge-access-solutions.com. WhatsApp: +63 991 426 5886.\`;
      let subject="", body="";
      if (channel === "call") {
        subject="Discovery call guide";
        body=\`OPENING
Good day, may I speak with \${lead.contact || "the person responsible for maintenance or operations"}?

INTRODUCTION
I'm reaching out from NextEdge Access Solutions (NEAS). We support organizations with \${String(lead.service).toLowerCase()}.

RELEVANCE
I wanted to understand whether you have any upcoming maintenance, access, inspection or work-at-height requirements where a specialist contractor may be useful.

DISCOVERY QUESTIONS
1. Are there any planned projects or maintenance windows in the next 3–6 months?
2. What scope or site constraints should a contractor understand?
3. Who is the right person to coordinate a technical discussion?

NEXT STEP
Would a short introductory call or capability briefing be useful?

If this is not relevant, I will respect that and won't continue contacting you.

CALL NOTES
Record only factual answers, objections, requested follow-up and contact preferences.\`;
      } else {
        const result=await generate("outreach",context,{brand:DEFAULT_BRAND});
        if ("error" in result) return json({error:result.error},503);
        body=result.text;
        subject=channel==="linkedin"?"Introduction | NEAS capability overview":\`Introduction | NEAS \${lead.service}\`;
      }
      const saved=await sql\`insert into aiw_outreach_drafts(lead_id,channel,subject,body,created_by) values(\${leadId},\${channel},\${subject},\${body},\${user.id}) returning id,created_at\`;
      await sql\`insert into aiw_workflow_runs(workflow,status,summary,lead_id,actor_id) values('Personalized outreach draft','needs_review',\${channel+" draft created for "+lead.company},\${leadId},\${user.id})\`;
      return json({ok:true,draft:{id:Number(saved[0].id),lead_id:leadId,channel,subject,body,status:"draft",created_at:new Date(saved[0].created_at).toISOString(),company:lead.company}});
    }
    return json({error:"Unknown action."},400);
  } catch (e) {
    return json({error:"Unable to complete the requested action.",detail:process.env.NODE_ENV==="development"?String(e):undefined},500);
  }
}
