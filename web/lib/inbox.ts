import { sql } from "./db";
import { decrypt } from "./social";

/** Facebook Page inbox: Messenger conversations and comments on recent Page posts, read live from the Graph API.
 *  Needs the Page connected with pages_messaging (messages) and pages_read_user_content + pages_manage_engagement (comments). */
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v25.0"}`;

export type InboxMsg = { id: string; from: string; fromId: string; text: string; at: string; mine: boolean };
export type InboxThread = { key: string; kind: "message" | "comment"; accountId: number; page: string; target: string; who: string; preview: string; at: string; unread: boolean; messages: InboxMsg[]; postText?: string; link?: string };

async function g(path: string, token: string) {
  const r = await fetch(`${GRAPH()}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Facebook answered ${r.status}`);
  return j;
}

export async function loadInbox(): Promise<{ threads: InboxThread[]; errors: string[] }> {
  const accounts = await sql`select id, external_id, name, token_enc from mk_social_accounts where platform = 'facebook' and status = 'ok'`;
  const threads: InboxThread[] = [], errors: string[] = [];
  for (const a of accounts) {
    const token = decrypt(a.token_enc);
    try {
      const conv = await g(`${a.external_id}/conversations?platform=messenger&limit=25&fields=id,updated_time,snippet,unread_count,participants,messages.limit(20){id,message,from,created_time}`, token);
      for (const c of conv.data ?? []) {
        const other = (c.participants?.data ?? []).find((p: { id: string }) => p.id !== a.external_id) ?? {};
        const msgs: InboxMsg[] = (c.messages?.data ?? []).map((m: { id: string; message?: string; from?: { name?: string; id?: string }; created_time: string }) => ({ id: m.id, from: m.from?.name ?? "", fromId: m.from?.id ?? "", text: m.message ?? "(attachment)", at: m.created_time, mine: m.from?.id === a.external_id })).reverse();
        threads.push({ key: `m:${c.id}`, kind: "message", accountId: a.id, page: a.name, target: other.id ?? "", who: other.name ?? "Messenger user", preview: c.snippet ?? msgs.at(-1)?.text ?? "", at: c.updated_time, unread: (c.unread_count ?? 0) > 0, messages: msgs, link: `https://business.facebook.com/latest/inbox` });
      }
    } catch (e) { errors.push(`${a.name} messages: ${(e as Error).message}`); }
    try {
      const feed = await g(`${a.external_id}/feed?limit=10&fields=id,message,permalink_url,created_time,comments.limit(25).order(reverse_chronological){id,message,from,created_time,comment_count,comments.limit(10){id,message,from,created_time}}`, token);
      for (const p of feed.data ?? []) for (const c of p.comments?.data ?? []) {
        if (c.from?.id === a.external_id) continue;
        const replies: InboxMsg[] = (c.comments?.data ?? []).map((r: { id: string; message?: string; from?: { name?: string; id?: string }; created_time: string }) => ({ id: r.id, from: r.from?.name ?? "", fromId: r.from?.id ?? "", text: r.message ?? "", at: r.created_time, mine: r.from?.id === a.external_id }));
        const answered = replies.some((r) => r.mine);
        threads.push({ key: `c:${c.id}`, kind: "comment", accountId: a.id, page: a.name, target: c.id, who: c.from?.name ?? "Facebook user", preview: c.message ?? "", at: replies.at(-1)?.at ?? c.created_time, unread: !answered,
          messages: [{ id: c.id, from: c.from?.name ?? "", fromId: c.from?.id ?? "", text: c.message ?? "", at: c.created_time, mine: false }, ...replies], postText: (p.message ?? "").slice(0, 160), link: p.permalink_url });
      }
    } catch (e) { errors.push(`${a.name} comments: ${(e as Error).message}`); }
  }
  const meta = await sql`select thread_key, status, assigned_to, note from mk_inbox_meta`.catch(() => []);
  const m = new Map(meta.map((r) => [r.thread_key, r]));
  threads.sort((x, y) => +new Date(y.at) - +new Date(x.at));
  return { threads: threads.map((t) => ({ ...t, ...(m.get(t.key) ? { status: m.get(t.key)!.status, assignedTo: m.get(t.key)!.assigned_to, note: m.get(t.key)!.note } : {}) })), errors };
}

/** Sends a reply. Messenger replies only work within 24 hours of the customer's last message (Meta's rule). */
export async function sendReply(accountId: number, kind: string, target: string, text: string): Promise<string> {
  const a = (await sql`select external_id, token_enc from mk_social_accounts where id = ${accountId} and platform = 'facebook'`)[0];
  if (!a) throw new Error("That Page is no longer connected.");
  const token = decrypt(a.token_enc);
  const url = kind === "message" ? `${GRAPH()}/${a.external_id}/messages` : `${GRAPH()}/${target}/comments`;
  const body = kind === "message" ? JSON.stringify({ recipient: { id: target }, messaging_type: "RESPONSE", message: { text } }) : JSON.stringify({ message: text });
  const r = await fetch(`${url}?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `Facebook answered ${r.status}`;
    throw new Error(/outside of allowed window|24 hour/i.test(msg) ? "Messenger only allows replies within 24 hours of the customer's last message. Reply from Meta Business Suite instead." : msg);
  }
  return String(j.message_id || j.id || "ok");
}
