import { createHash } from "node:crypto";
import { sql } from "./db";
import { publishTo } from "./social";
import { logActivity, inWs, TENANT_DAILY_LIMIT } from "./marketing";
import { notifyApproval } from "./notify";

export type PublishResult = { platform: string; name: string; ok: boolean; error?: string };
const AUTO = ["facebook", "instagram", "linkedin"];

/** Publishes one post to every connected account for its chosen platforms.
 *  Marked "published" only when every platform confirms; otherwise "failed" with reasons.
 *  Accounts that already succeeded for this post are skipped, so retries never double-post. */
export async function publishPost(id: number, userId: number | null, origin: string): Promise<{ allOk: boolean; results: PublishResult[] } | { error: string; retry?: boolean }> {
  const post = (await sql`select * from mk_posts where id = ${id}`)[0];
  if (!post) return { error: "Post not found." };
  if (!["approved", "scheduled", "failed"].includes(post.status)) return { error: "Only approved or scheduled posts can be published." };
  const wanted: string[] = (post.platforms ?? []).filter((x: string) => AUTO.includes(x));
  if (!wanted.length) return { error: "Pick Facebook, Instagram or LinkedIn on this post first. Other platforms can't publish automatically yet." };
  if (post.ws != null) {
    const n = (await sql`select count(distinct r.post_id)::int n from mk_post_results r join mk_posts p on p.id = r.post_id
      where p.ws = ${post.ws} and r.ok and r.post_id <> ${id} and r.created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')`)[0].n;
    if (n >= TENANT_DAILY_LIMIT) return { error: `Daily limit reached: ${TENANT_DAILY_LIMIT} posts per day. Try again tomorrow (Philippine time).`, retry: true };
  }
  const accounts = await sql`select * from mk_social_accounts where platform in ${sql(wanted)} and status = 'ok' and ${inWs(post.ws)}`;
  const done = new Set((await sql`select account_id from mk_post_results where post_id = ${id} and ok`).map((r) => r.account_id));
  const out: PublishResult[] = [];
  for (const pl of wanted) if (!accounts.some((a) => a.platform === pl)) out.push({ platform: pl, name: "", ok: false, error: "No connected account" });
  for (const a of accounts) {
    if (done.has(a.id)) { out.push({ platform: a.platform, name: a.name, ok: true }); continue; }
    try {
      const rid = await publishTo(a as unknown as { platform: string; external_id: string; token_enc: string }, String(post.body || post.title), String(post.media_url || ""), origin);
      await sql`insert into mk_post_results (post_id, account_id, platform, ok, remote_id) values (${id}, ${a.id}, ${a.platform}, true, ${rid})`;
      out.push({ platform: a.platform, name: a.name, ok: true });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 400);
      await sql`insert into mk_post_results (post_id, account_id, platform, ok, error) values (${id}, ${a.id}, ${a.platform}, false, ${msg})`;
      if (/token|session|expired|OAuth|permission/i.test(msg)) await sql`update mk_social_accounts set status = 'error', last_error = ${msg} where id = ${a.id}`;
      out.push({ platform: a.platform, name: a.name, ok: false, error: msg });
    }
  }
  const allOk = out.length > 0 && out.every((r) => r.ok);
  await sql`update mk_posts set status = ${allOk ? "published" : "failed"}, updated_at = now() where id = ${id}`;
  await logActivity(userId as number, (userId ? "" : "auto-") + (allOk ? "published" : "publish failed"), out.map((r) => `${r.platform}${r.name ? " (" + r.name + ")" : ""}: ${r.ok ? "ok" : r.error}`).join("; "), id, post.ws);
  if (!allOk && post.ws == null) await notifyApproval(id, "failed", out.filter((r) => !r.ok).map((r) => `${r.platform}: ${r.error}`).join("; ")).catch(() => {});
  return { allOk, results: out };
}

/** Secret for the scheduler URL. Uses CRON_SECRET when set; otherwise derived from the session secret. */
export function cronToken() {
  if (process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16) return process.env.CRON_SECRET;
  const base = process.env.SESSION_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  return createHash("sha256").update("neas-cron-v1:" + base).digest("hex").slice(0, 40);
}
