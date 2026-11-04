import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "./db";

/** WhatsApp Cloud API (Meta). Incoming messages arrive by webhook and are stored; replies go out through the Graph API.
 *  Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN (any phrase you choose). Signatures are checked with META_APP_SECRET. */
const env = (k: string) => (process.env[k] ?? "").trim().replace(/^["']|["']$/g, "").trim();
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v25.0"}`;
export const waReady = () => !!(env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID"));

export function validSignature(raw: string, header: string | null) {
  const secret = env("META_APP_SECRET");
  if (!secret) return false;
  const want = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(want), b = Buffer.from(header ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

type WaValue = { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: { id: string; from: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } }; timestamp: string }[]; statuses?: { id: string; status: string }[] };
export async function storeWebhook(body: { entry?: { changes?: { value?: WaValue }[] }[] }) {
  for (const e of body.entry ?? []) for (const c of e.changes ?? []) {
    const v = c.value ?? {};
    const names = new Map((v.contacts ?? []).map((x) => [x.wa_id, x.profile?.name ?? ""]));
    for (const m of v.messages ?? []) {
      const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `(${m.type})`;
      await sql`insert into mk_wa_messages (wa_id, name, msg_id, text, mine, created_at)
        values (${m.from}, ${names.get(m.from) ?? ""}, ${m.id}, ${text.slice(0, 4000)}, false, to_timestamp(${Number(m.timestamp) || Date.now() / 1000}))
        on conflict (msg_id) do nothing`;
    }
    for (const s of v.statuses ?? []) await sql`update mk_wa_messages set status = ${s.status} where msg_id = ${s.id}`;
  }
}

export async function waThreads() {
  const rows = await sql`select wa_id, name, msg_id, text, mine, created_at from mk_wa_messages where created_at > now() - interval '60 days' order by created_at`;
  const by = new Map<string, typeof rows>();
  for (const r of rows) { if (!by.has(r.wa_id)) by.set(r.wa_id, [] as unknown as typeof rows); by.get(r.wa_id)!.push(r); }
  return [...by.entries()].map(([wa, ms]) => {
    const name = [...ms].reverse().find((m) => m.name)?.name || "+" + wa, last = ms[ms.length - 1];
    return { key: `w:${wa}`, kind: "whatsapp" as const, accountId: 0, page: "WhatsApp", target: wa, who: name, preview: last.text, at: new Date(last.created_at).toISOString(), unread: !last.mine,
      messages: ms.slice(-30).map((m) => ({ id: m.msg_id ?? "", from: m.mine ? "NEAS" : name, fromId: m.mine ? "" : wa, text: m.text, at: new Date(m.created_at).toISOString(), mine: m.mine })), link: `https://wa.me/${wa}` };
  });
}

/** Free-form replies are allowed (and free) within 24 hours of the customer's last message. */
export async function waReply(to: string, text: string) {
  if (!waReady()) throw new Error("WhatsApp isn't set up yet.");
  const last = (await sql`select max(created_at) t from mk_wa_messages where wa_id = ${to} and not mine`)[0]?.t;
  if (!last || Date.now() - +new Date(last) > 24 * 3600 * 1000) throw new Error("WhatsApp only allows free replies within 24 hours of the customer's last message. Reply from the WhatsApp Business app instead.");
  const r = await fetch(`${GRAPH()}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, { method: "POST", headers: { authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body: text } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `WhatsApp answered ${r.status}`);
  const id = String(j.messages?.[0]?.id ?? "");
  await sql`insert into mk_wa_messages (wa_id, msg_id, text, mine, status) values (${to}, ${id || null}, ${text}, true, 'sent')`;
  return id;
}
