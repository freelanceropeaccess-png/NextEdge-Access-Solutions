import { sql } from "@/lib/db";
import { originOf } from "@/lib/reset";
import { metaReady, linkedinReady } from "@/lib/social";
import { publishPost, cronToken } from "@/lib/publish";
import { loadInbox, sendReply } from "@/lib/inbox";
import { loadInsights } from "@/lib/insights";
import { autoSettings, sendMail, type AutoSettings } from "@/lib/notify";
import { notifyApproval } from "@/lib/notify";
import { bad, ok } from "@/lib/http";
import { getSetting, setSetting } from "@/lib/settings";
import {
  getMkUser, can, TRANSITIONS, STATUSES, PLATFORMS, ROLES, logActivity, generate, platformStatus,
  DEFAULT_BRAND, cleanUrl, inWs, brandKey, TENANT_DAILY_LIMIT, type Brand, type MkStatus, type MkRole, type MkUser,
} from "@/lib/marketing";

export const dynamic = "force-dynamic";

const aiHits = new Map<number, number[]>();
function aiAllowed(uid: number) {
  const now = Date.now(), w = (aiHits.get(uid) ?? []).filter((t) => now - t < 10 * 60_000);
  if (w.length >= 30) return false;
  w.push(now); aiHits.set(uid, w); return true;
}

async function loadState(u: MkUser) {
  const [posts, activity, links, feeds, team, brand, orders, counts] = await Promise.all([
    sql`select p.*, u.name as author from mk_posts p left join users u on u.id = p.created_by where ${inWs(u.ws)} order by coalesce(p.scheduled_at, p.updated_at) desc limit 1000`,
    sql`select a.id, a.post_id, a.action, a.detail, a.created_at, u.name as who from mk_activity a left join users u on u.id = a.user_id where ${inWs(u.ws)} order by a.id desc limit 300`,
    sql`select * from mk_bio_links where ${inWs(u.ws)} order by sort, id`,
    sql`select * from mk_feeds where ${inWs(u.ws)} order by id`,
    u.tenant ? Promise.resolve([{ id: u.id, name: u.name, email: u.email, marketing_role: "admin" }]) : sql`select id, name, email, coalesce(marketing_role, 'admin') as marketing_role from users where role = 'admin' order by name`,
    getSetting<Brand>(brandKey(u.ws), u.tenant ? { ...DEFAULT_BRAND, voice: "", audience: "", services: "", hashtags: "", avoid: "", goal: 0 } : DEFAULT_BRAND),
    u.tenant ? Promise.resolve([{ n: 0, total: 0 }]) : sql`select count(*)::int as n, coalesce(sum(total),0)::float as total from orders where created_at > now() - interval '30 days'`.catch(() => [{ n: 0, total: 0 }]),
    u.tenant ? Promise.resolve([{ products: 0, customers: 0 }]) : sql`select (select count(*)::int from products where active) as products, (select count(*)::int from users where role='customer') as customers`,
  ]);
  return {
    me: u,
    posts: posts.map((p) => ({ id: p.id, title: p.title, body: p.body, platforms: p.platforms ?? [], status: p.status, scheduled_at: p.scheduled_at ? new Date(p.scheduled_at).toISOString() : null, media_url: p.media_url ?? "", campaign: p.campaign ?? "", notes: p.notes ?? "", author: p.author ?? "—", created_at: new Date(p.created_at).toISOString(), updated_at: new Date(p.updated_at).toISOString() })),
    activity: activity.map((a) => ({ id: a.id, post_id: a.post_id, action: a.action, detail: a.detail ?? "", who: a.who ?? "—", at: new Date(a.created_at).toISOString() })),
    links: links.map((l) => ({ id: l.id, label: l.label, url: l.url, sort: l.sort, active: l.active, clicks: l.clicks })),
    feeds: feeds.map((f) => ({ id: f.id, name: f.name, url: f.url })),
    team: team.map((t) => ({ id: t.id, name: t.name, email: t.email, role: t.marketing_role })),
    brand: { ...DEFAULT_BRAND, ...brand },
    platforms: platformStatus(),
    accounts: (await sql`select id, platform, name, status, last_error, expires_at, updated_at from mk_social_accounts where ${inWs(u.ws)} order by platform, name`.catch(() => [])).map((a) => ({ id: a.id, platform: a.platform, name: a.name, status: a.status, error: a.last_error ?? "", expires_at: a.expires_at ? new Date(a.expires_at).toISOString() : null })),
    results: (await sql`select post_id, platform, ok, remote_id, error, created_at from mk_post_results where post_id in (select id from mk_posts where ${inWs(u.ws)}) order by id desc limit 500`.catch(() => [])).map((r) => ({ post_id: r.post_id, platform: r.platform, ok: r.ok, remote_id: r.remote_id ?? "", error: r.error ?? "", at: new Date(r.created_at).toISOString() })),
    connectReady: { facebook: metaReady(), linkedin: linkedinReady() },
    automation: await autoSettings(),
    reach7: await getSetting<{ fetchedAt?: string; pages?: { reached: number | null; views: number | null }[] }>(u.ws == null ? "mk_insights_7" : `mk_insights_7_ws${u.ws}`, {}).then((r) => (r.pages?.length ? { fetchedAt: r.fetchedAt, reached: r.pages.reduce((a, p) => a + (p.reached ?? 0), 0), views: r.pages.reduce((a, p) => a + (p.views ?? 0), 0) } : null)),
    emailReady: !!process.env.RESEND_API_KEY,
    waReady: !u.tenant && !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    emailLog: (await sql`select recipient, subject, kind, ok, error, created_at from mk_email_log where ${!u.tenant} order by id desc limit 40`.catch(() => [])).map((e) => ({ to: e.recipient, subject: e.subject, kind: e.kind, ok: e.ok, error: e.error ?? "", at: new Date(e.created_at).toISOString() })),
    media: (await sql`select id, url, title, width, height, created_at from mk_media where ${inWs(u.ws)} order by id desc limit 200`.catch(() => [])).map((m) => ({ id: m.id, url: m.url, title: m.title, width: m.width, height: m.height, at: new Date(m.created_at).toISOString() })),
    scheduler: { url: u.role === "admin" && !u.tenant ? `${process.env.SITE_URL?.replace(/\/$/, "") || "https://www.nextedge-access-solutions.com"}/api/cron/publish?token=${cronToken()}` : "", hasCronSecret: !!process.env.CRON_SECRET, last: await getSetting<{ at?: string; published?: number; failed?: number }>("mk_cron_last", {}) },
    tenant: u.tenant,
    dailyLimit: u.tenant ? TENANT_DAILY_LIMIT : null,
    publishedToday: u.tenant ? (await sql`select count(distinct r.post_id)::int n from mk_post_results r join mk_posts p on p.id = r.post_id where p.ws = ${u.ws} and r.ok and r.created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')`)[0].n : null,
    members: u.tenant ? [] : (await sql`select id, name, email, mk_access, mk_access_ref, mk_access_at, mk_access_until from users where mk_access is not null and role <> 'admin' order by mk_access_at desc nulls last limit 200`).map((m) => ({ id: m.id, name: m.name, email: m.email, status: m.mk_access, ref: m.mk_access_ref ?? "", at: m.mk_access_at ? new Date(m.mk_access_at).toISOString() : null, until: m.mk_access_until ? new Date(m.mk_access_until).toISOString() : null })),
    aiReady: !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY),
    site: { orders30: orders[0].n, sales30: orders[0].total, products: counts[0].products, customers: counts[0].customers },
  };
}

export async function GET() {
  const u = await getMkUser();
  if (!u) return bad("Admin access required.", 403);
  return ok(await loadState(u));
}

const txt = (v: unknown, max: number) => String(v ?? "").slice(0, max);
function parseDate(v: unknown): Date | null | "bad" {
  if (v === null || v === "" || v === undefined) return null;
  const d = new Date(String(v));
  return isNaN(+d) ? "bad" : d;
}

export async function POST(req: Request) {
  const u = await getMkUser();
  if (!u) return bad("Admin access required.", 403);
  // Same-origin check (CSRF defence on top of the SameSite session cookie).
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && new URL(origin).host !== req.headers.get("host")) return bad("Bad origin.", 403);
  const b = await req.json().catch(() => ({}));
  const need = (r: MkRole) => can(u, r);
  const log = (action: string, detail = "", postId: number | null = null) => logActivity(u.id, action, detail, postId, u.ws);
  const staffOnly = () => bad("This part is for the NEAS team only.", 403);
  const deny = () => bad("Your marketing role doesn't allow this.", 403);

  switch (b.action) {
    case "savePost": {
      if (!need("editor")) return deny();
      const platforms = (Array.isArray(b.platforms) ? b.platforms : []).filter((p: string) => (PLATFORMS as readonly string[]).includes(p));
      const when = parseDate(b.scheduled_at); if (when === "bad") return bad("Invalid date.");
      const media = b.media_url ? cleanUrl(b.media_url) ?? (String(b.media_url).startsWith("/api/img/") ? String(b.media_url) : null) : null;
      if (b.media_url && !media) return bad("Media link must start with https://");
      const f = { title: txt(b.title, 200), body: txt(b.body, 20000), campaign: txt(b.campaign, 120), notes: txt(b.notes, 2000) };
      if (b.id) {
        const cur = (await sql`select status from mk_posts where id = ${Number(b.id)} and ${inWs(u.ws)}`)[0];
        if (!cur) return bad("Post not found.", 404);
        if (cur.status === "published") return bad("Published posts can't be edited.");
        if (!need("manager") && !["draft", "failed"].includes(cur.status)) return bad("Only drafts can be edited by editors.");
        await sql`update mk_posts set title=${f.title}, body=${f.body}, platforms=${platforms}, scheduled_at=${when}, media_url=${media}, campaign=${f.campaign}, notes=${f.notes}, updated_at=now() where id=${Number(b.id)} and ${inWs(u.ws)}`;
        await log("edited", f.title, Number(b.id));
        return ok({ id: Number(b.id) });
      }
      const r = await sql`insert into mk_posts (title, body, platforms, scheduled_at, media_url, campaign, notes, created_by, ws) values (${f.title}, ${f.body}, ${platforms}, ${when}, ${media}, ${f.campaign}, ${f.notes}, ${u.id}, ${u.ws}) returning id`;
      await log("created draft", f.title, r[0].id);
      return ok({ id: r[0].id });
    }
    case "transition": {
      const id = Number(b.id), to = String(b.to) as MkStatus;
      if (!(STATUSES as readonly string[]).includes(to)) return bad("Invalid status.");
      const cur = (await sql`select status, scheduled_at, title from mk_posts where id = ${id} and ${inWs(u.ws)}`)[0];
      if (!cur) return bad("Post not found.", 404);
      const move = (TRANSITIONS[cur.status] ?? []).find((t) => t.to === to);
      if (!move) return bad(`Can't move a ${cur.status} post to ${to}.`);
      if (!need(move.need)) return deny();
      if (to === "scheduled" && !cur.scheduled_at) return bad("Set a date and time before scheduling.");
      await sql`update mk_posts set status=${to}, updated_at=now() where id=${id} and ${inWs(u.ws)}`;
      await log(`${cur.status} → ${to}`, txt(b.note, 300) || cur.title, id);
      const ev = to === "pending" ? "pending" : cur.status === "pending" && to === "approved" ? "approved" : cur.status === "pending" && to === "draft" ? "sent_back" : null;
      if (ev && !u.tenant) await notifyApproval(id, ev, txt(b.note, 300)).catch(() => {});
      return ok();
    }
    case "reschedule": {
      const id = Number(b.id), when = parseDate(b.scheduled_at);
      if (when === "bad") return bad("Invalid date.");
      const cur = (await sql`select status from mk_posts where id = ${id} and ${inWs(u.ws)}`)[0];
      if (!cur) return bad("Post not found.", 404);
      if (cur.status === "published") return bad("Published posts can't be moved.");
      if (!need("manager") && cur.status !== "draft") return deny();
      await sql`update mk_posts set scheduled_at=${when}, updated_at=now() where id=${id} and ${inWs(u.ws)}`;
      await log("rescheduled", when ? when.toISOString() : "unscheduled", id);
      return ok();
    }
    case "deletePost": {
      if (!need("manager")) return deny();
      const id = Number(b.id);
      const t = (await sql`delete from mk_posts where id = ${id} and ${inWs(u.ws)} returning title`)[0];
      if (t) await log("deleted post", t.title);
      return ok();
    }
    case "ai": {
      if (!need("editor")) return deny();
      if (!aiAllowed(u.id)) return bad("Too many AI requests. Wait a few minutes.", 429);
      const topic = txt(b.topic, 6000).trim();
      if (!topic) return bad("Describe the topic first.");
      const brand = { ...DEFAULT_BRAND, ...(await getSetting<Brand>(brandKey(u.ws), DEFAULT_BRAND)) };
      const r = await generate(String(b.task), topic, { tone: txt(b.tone, 80), brand, tenant: u.tenant });
      if ("error" in r) return bad(r.error, 400);
      await log("AI generated", `${b.task}: ${topic.slice(0, 80)}`);
      return ok(r);
    }
    case "saveBrand": {
      if (!need("admin")) return deny();
      const x = b.brand ?? {};
      const brand: Brand = { company: txt(x.company, 200), contact: txt(x.contact, 300), voice: txt(x.voice, 1500), audience: txt(x.audience, 1000), services: txt(x.services, 1500), hashtags: txt(x.hashtags, 500), avoid: txt(x.avoid, 1000), languages: txt(x.languages, 200), goal: Math.max(0, Math.min(500, Math.round(Number(x.goal) || 0))) };
      await setSetting(brandKey(u.ws), brand);
      await log("updated brand settings");
      return ok();
    }
    case "saveLink": {
      if (!need("manager")) return deny();
      const url = cleanUrl(b.url), label = txt(b.label, 80).trim();
      if (!url || !label) return bad("Enter a label and a link starting with https://");
      if (b.id) await sql`update mk_bio_links set label=${label}, url=${url}, active=${b.active !== false}, sort=${Number(b.sort) || 0} where id=${Number(b.id)} and ${inWs(u.ws)}`;
      else await sql`insert into mk_bio_links (label, url, sort, ws) values (${label}, ${url}, ${Number(b.sort) || 0}, ${u.ws})`;
      await log(b.id ? "edited bio link" : "added bio link", label);
      return ok();
    }
    case "deleteLink": {
      if (!need("manager")) return deny();
      await sql`delete from mk_bio_links where id=${Number(b.id)} and ${inWs(u.ws)}`;
      await log("deleted bio link");
      return ok();
    }
    case "saveFeed": {
      if (!need("manager")) return deny();
      const url = cleanUrl(b.url), name = txt(b.name, 80).trim();
      if (!url || !name) return bad("Enter a name and a feed link starting with https://");
      await sql`insert into mk_feeds (name, url, ws) values (${name}, ${url}, ${u.ws})`;
      return ok();
    }
    case "deleteFeed": {
      if (!need("manager")) return deny();
      await sql`delete from mk_feeds where id=${Number(b.id)} and ${inWs(u.ws)}`;
      return ok();
    }
    case "feedItems": {
      const f = (await sql`select url from mk_feeds where id=${Number(b.id)} and ${inWs(u.ws)}`)[0];
      if (!f) return bad("Feed not found.", 404);
      try {
        const r = await fetch(f.url, { headers: { "user-agent": "NEAS-FeedReader/1.0" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return bad(`The feed answered ${r.status}.`);
        const xml = (await r.text()).slice(0, 2_000_000);
        const strip = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
        const items = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)].slice(0, 25).map((m) => {
          const x = m[0];
          const title = strip(x.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "");
          const link = x.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? strip(x.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] ?? "");
          const summary = strip(x.match(/<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/)?.[2] ?? "").slice(0, 400);
          return { title, link: /^https?:\/\//.test(link) ? link : "", summary };
        }).filter((i) => i.title);
        return ok({ items });
      } catch (e) { return bad("Couldn't read that feed: " + (e as Error).message); }
    }
    case "saveMedia": {
      if (!need("editor")) return deny();
      const url = String(b.url ?? "");
      if (!/^\/api\/img\/[a-f0-9]{16}$/.test(url)) return bad("Upload the image first.");
      await sql`insert into mk_media (url, title, width, height, created_by, ws) values (${url}, ${txt(b.title, 160)}, ${Number(b.width) || null}, ${Number(b.height) || null}, ${u.id}, ${u.ws})`;
      await log("created graphic", txt(b.title, 160));
      return ok();
    }
    case "deleteMedia": {
      if (!need("manager")) return deny();
      await sql`delete from mk_media where id = ${Number(b.id)} and ${inWs(u.ws)}`;
      return ok();
    }
    case "insights": {
      const days = [7, 28, 90].includes(Number(b.days)) ? Number(b.days) : 28;
      return ok(await loadInsights(days, !!b.refresh, u.ws));
    }
    case "inbox": {
      return ok(await loadInbox(u.ws));
    }
    case "inboxReply": {
      if (!need("editor")) return deny();
      const text = txt(b.text, 2000).trim();
      if (!text) return bad("Write a reply first.");
      try {
        await sendReply(Number(b.accountId), String(b.kind), String(b.target), text, u.ws);
        await log("replied in inbox", `${b.kind}: ${text.slice(0, 120)}`);
        return ok();
      } catch (e) { return bad((e as Error).message); }
    }
    case "inboxMeta": {
      if (!need("editor")) return deny();
      const key = txt(b.key, 200);
      if (!/^[mcw]:[\w.-]+$/.test(key)) return bad("Invalid conversation.");
      const status = ["open", "done"].includes(b.status) ? b.status : "open";
      const assigned = b.assignedTo ? Number(b.assignedTo) : null;
      await sql`insert into mk_inbox_meta (thread_key, status, assigned_to, note, updated_by) values (${key}, ${status}, ${assigned}, ${txt(b.note, 2000) || null}, ${u.id})
        on conflict (thread_key) do update set status = excluded.status, assigned_to = excluded.assigned_to, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()`;
      return ok();
    }
    case "saveAutomation": {
      if (!need("admin")) return deny();
      if (u.tenant) return staffOnly();
      const x = b.automation ?? {};
      const email = txt(x.alertEmail, 320).trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Enter a valid alert email, or leave it empty to use your business email.");
      const v: AutoSettings = { orderAlert: !!x.orderAlert, orderConfirm: !!x.orderConfirm, orderStatus: !!x.orderStatus, approval: !!x.approval, publishFail: !!x.publishFail, alertEmail: email };
      await setSetting("mk_auto", v);
      await log("updated email automations");
      return ok();
    }
    case "testEmail": {
      if (!need("admin")) return deny();
      if (u.tenant) return staffOnly();
      const sent = await sendMail(u.email, "NEAS email automations test", `<p>This is a test from your Marketing Command Center. Email automations are working.</p>`, "test");
      return sent ? ok() : bad("The test email couldn't be sent. See the email log below for the reason.");
    }
    case "disconnect": {
      if (!need("manager")) return deny();
      const a = (await sql`delete from mk_social_accounts where id = ${Number(b.id)} and ${inWs(u.ws)} returning platform, name`)[0];
      if (a) await log("disconnected account", `${a.platform}: ${a.name}`);
      return ok();
    }
    case "publishNow": {
      if (!need("manager")) return deny();
      const r = await publishPost(Number(b.id), u.id, originOf(req));
      return "error" in r ? bad(r.error) : ok(r);
    }
    case "memberAccess": {
      if (u.tenant || !need("admin")) return deny();
      const st = ["approved", "rejected", "revoked"].includes(b.status) ? b.status : null;
      if (!st) return bad("Invalid status.");
      const m = (await sql`update users set mk_access = ${st === "revoked" ? "rejected" : st}, mk_access_until = ${st === "approved" ? sql`greatest(coalesce(mk_access_until, now()), now()) + interval '1 month'` : st === "revoked" ? sql`now()` : sql`mk_access_until`}, mk_access_ref = ${st === "approved" ? null : sql`mk_access_ref`} where id = ${Number(b.userId)} and role <> 'admin' returning email, name, mk_access_until, (select mk_access_ref from users x where x.id = users.id) as old_ref`)[0];
      if (!m) return bad("Member not found.", 404);
      await log(`member access ${st}`, `${m.email}${m.old_ref ? " · ref " + m.old_ref : ""}${m.mk_access_until ? " · until " + new Date(m.mk_access_until).toISOString().slice(0, 10) : ""}`);
      if (st === "approved") await sendMail(m.email, "Your NEAS Marketing Command Center is ready", `<p>Hi ${String(m.name).replace(/[<>&]/g, "")},</p><p>Your payment is confirmed and your Marketing Command Center workspace is switched on until ${new Date(m.mk_access_until).toLocaleDateString("en-PH", { dateStyle: "long" })}. Renew with ₱100 each month from My Account.</p><p><a href="${originOf(req)}/admin/marketing">Open it here</a> (log in with your NEAS account).</p>`, "member").catch(() => false);
      return ok();
    }
    case "setRole": {
      if (!need("admin")) return deny();
      if (u.tenant) return staffOnly();
      const role = String(b.role);
      if (!(ROLES as readonly string[]).includes(role)) return bad("Invalid role.");
      if (Number(b.userId) === u.id && role !== "admin") return bad("You can't lower your own role.");
      await sql`update users set marketing_role=${role} where id=${Number(b.userId)} and role='admin'`;
      await log("changed team role", `user ${Number(b.userId)} → ${role}`);
      return ok();
    }
    default:
      return bad("Unknown action.");
  }
}
