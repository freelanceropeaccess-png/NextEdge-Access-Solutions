import { sql } from "@/lib/db";
import { bad, ok } from "@/lib/http";
import { getSetting, setSetting } from "@/lib/settings";
import {
  getMkUser, can, TRANSITIONS, STATUSES, PLATFORMS, ROLES, logActivity, generate, platformStatus,
  DEFAULT_BRAND, cleanUrl, type Brand, type MkStatus, type MkRole, type MkUser,
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
    sql`select p.*, u.name as author from mk_posts p left join users u on u.id = p.created_by order by coalesce(p.scheduled_at, p.updated_at) desc limit 1000`,
    sql`select a.id, a.post_id, a.action, a.detail, a.created_at, u.name as who from mk_activity a left join users u on u.id = a.user_id order by a.id desc limit 300`,
    sql`select * from mk_bio_links order by sort, id`,
    sql`select * from mk_feeds order by id`,
    sql`select id, name, email, coalesce(marketing_role, 'admin') as marketing_role from users where role = 'admin' order by name`,
    getSetting<Brand>("mk_brand", DEFAULT_BRAND),
    sql`select count(*)::int as n, coalesce(sum(total),0)::float as total from orders where created_at > now() - interval '30 days'`.catch(() => [{ n: 0, total: 0 }]),
    sql`select (select count(*)::int from products where active) as products, (select count(*)::int from users where role='customer') as customers`,
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
        const cur = (await sql`select status from mk_posts where id = ${Number(b.id)}`)[0];
        if (!cur) return bad("Post not found.", 404);
        if (cur.status === "published") return bad("Published posts can't be edited.");
        if (!need("manager") && !["draft", "failed"].includes(cur.status)) return bad("Only drafts can be edited by editors.");
        await sql`update mk_posts set title=${f.title}, body=${f.body}, platforms=${platforms}, scheduled_at=${when}, media_url=${media}, campaign=${f.campaign}, notes=${f.notes}, updated_at=now() where id=${Number(b.id)}`;
        await logActivity(u.id, "edited", f.title, Number(b.id));
        return ok({ id: Number(b.id) });
      }
      const r = await sql`insert into mk_posts (title, body, platforms, scheduled_at, media_url, campaign, notes, created_by) values (${f.title}, ${f.body}, ${platforms}, ${when}, ${media}, ${f.campaign}, ${f.notes}, ${u.id}) returning id`;
      await logActivity(u.id, "created draft", f.title, r[0].id);
      return ok({ id: r[0].id });
    }
    case "transition": {
      const id = Number(b.id), to = String(b.to) as MkStatus;
      if (!(STATUSES as readonly string[]).includes(to)) return bad("Invalid status.");
      const cur = (await sql`select status, scheduled_at, title from mk_posts where id = ${id}`)[0];
      if (!cur) return bad("Post not found.", 404);
      const move = (TRANSITIONS[cur.status] ?? []).find((t) => t.to === to);
      if (!move) return bad(`Can't move a ${cur.status} post to ${to}.`);
      if (!need(move.need)) return deny();
      if (to === "scheduled" && !cur.scheduled_at) return bad("Set a date and time before scheduling.");
      await sql`update mk_posts set status=${to}, updated_at=now() where id=${id}`;
      await logActivity(u.id, `${cur.status} → ${to}`, txt(b.note, 300) || cur.title, id);
      return ok();
    }
    case "reschedule": {
      const id = Number(b.id), when = parseDate(b.scheduled_at);
      if (when === "bad") return bad("Invalid date.");
      const cur = (await sql`select status from mk_posts where id = ${id}`)[0];
      if (!cur) return bad("Post not found.", 404);
      if (cur.status === "published") return bad("Published posts can't be moved.");
      if (!need("manager") && cur.status !== "draft") return deny();
      await sql`update mk_posts set scheduled_at=${when}, updated_at=now() where id=${id}`;
      await logActivity(u.id, "rescheduled", when ? when.toISOString() : "unscheduled", id);
      return ok();
    }
    case "deletePost": {
      if (!need("manager")) return deny();
      const id = Number(b.id);
      const t = (await sql`delete from mk_posts where id = ${id} returning title`)[0];
      if (t) await logActivity(u.id, "deleted post", t.title);
      return ok();
    }
    case "ai": {
      if (!need("editor")) return deny();
      if (!aiAllowed(u.id)) return bad("Too many AI requests. Wait a few minutes.", 429);
      const topic = txt(b.topic, 6000).trim();
      if (!topic) return bad("Describe the topic first.");
      const brand = { ...DEFAULT_BRAND, ...(await getSetting<Brand>("mk_brand", DEFAULT_BRAND)) };
      const r = await generate(String(b.task), topic, { tone: txt(b.tone, 80), brand });
      if ("error" in r) return bad(r.error, 400);
      await logActivity(u.id, "AI generated", `${b.task}: ${topic.slice(0, 80)}`);
      return ok(r);
    }
    case "saveBrand": {
      if (!need("admin")) return deny();
      const x = b.brand ?? {};
      const brand: Brand = { voice: txt(x.voice, 1500), audience: txt(x.audience, 1000), services: txt(x.services, 1500), hashtags: txt(x.hashtags, 500), avoid: txt(x.avoid, 1000), languages: txt(x.languages, 200), goal: Math.max(0, Math.min(500, Math.round(Number(x.goal) || 0))) };
      await setSetting("mk_brand", brand);
      await logActivity(u.id, "updated brand settings");
      return ok();
    }
    case "saveLink": {
      if (!need("manager")) return deny();
      const url = cleanUrl(b.url), label = txt(b.label, 80).trim();
      if (!url || !label) return bad("Enter a label and a link starting with https://");
      if (b.id) await sql`update mk_bio_links set label=${label}, url=${url}, active=${b.active !== false}, sort=${Number(b.sort) || 0} where id=${Number(b.id)}`;
      else await sql`insert into mk_bio_links (label, url, sort) values (${label}, ${url}, ${Number(b.sort) || 0})`;
      await logActivity(u.id, b.id ? "edited bio link" : "added bio link", label);
      return ok();
    }
    case "deleteLink": {
      if (!need("manager")) return deny();
      await sql`delete from mk_bio_links where id=${Number(b.id)}`;
      await logActivity(u.id, "deleted bio link");
      return ok();
    }
    case "saveFeed": {
      if (!need("manager")) return deny();
      const url = cleanUrl(b.url), name = txt(b.name, 80).trim();
      if (!url || !name) return bad("Enter a name and a feed link starting with https://");
      await sql`insert into mk_feeds (name, url) values (${name}, ${url})`;
      return ok();
    }
    case "deleteFeed": {
      if (!need("manager")) return deny();
      await sql`delete from mk_feeds where id=${Number(b.id)}`;
      return ok();
    }
    case "feedItems": {
      const f = (await sql`select url from mk_feeds where id=${Number(b.id)}`)[0];
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
    case "setRole": {
      if (!need("admin")) return deny();
      const role = String(b.role);
      if (!(ROLES as readonly string[]).includes(role)) return bad("Invalid role.");
      if (Number(b.userId) === u.id && role !== "admin") return bad("You can't lower your own role.");
      await sql`update users set marketing_role=${role} where id=${Number(b.userId)} and role='admin'`;
      await logActivity(u.id, "changed team role", `user ${Number(b.userId)} → ${role}`);
      return ok();
    }
    default:
      return bad("Unknown action.");
  }
}
