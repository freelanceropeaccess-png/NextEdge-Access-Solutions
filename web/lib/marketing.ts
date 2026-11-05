import { sql } from "./db";
import { getUser } from "./auth";

export const ROLES = ["viewer", "editor", "manager", "admin"] as const;
export type MkRole = (typeof ROLES)[number];
export const STATUSES = ["draft", "pending", "approved", "scheduled", "published", "failed"] as const;
export type MkStatus = (typeof STATUSES)[number];
export const PLATFORMS = ["facebook", "instagram", "linkedin", "youtube", "tiktok", "google_business"] as const;

export type MkUser = { id: number; name: string; email: string; role: MkRole; ws: number | null; tenant: boolean };
/** Self-serve members may publish this many posts per day (Philippine time). NEAS staff are unlimited. */
export const TENANT_DAILY_LIMIT = Number(process.env.MK_MEMBER_DAILY_LIMIT) || 10;
/** SQL condition for "rows in this workspace". */
export const inWs = (ws: number | null) => (ws == null ? sql`ws is null` : sql`ws = ${ws}`);
export const brandKey = (ws: number | null) => (ws == null ? "mk_brand" : `mk_brand_ws${ws}`);

/** Reuses the existing NEAS admin login. Only staff accounts (role=admin) can enter;
 *  marketing_role narrows what they may do inside the module (default: admin). */
export async function getMkUser(): Promise<MkUser | null> {
  const u = await getUser();
  if (!u) return null;
  // Any signed-in website member gets a private workspace of their own (turn off with MK_MEMBERS=0).
  if (u.role !== "admin") {
    if (process.env.MK_MEMBERS === "0") return null;
    const a = (await sql`select mk_access, mk_access_until from users where id = ${u.id}`)[0];
    // ₱100 monthly subscription: approved and paid up to a date in the future.
    return a?.mk_access === "approved" && a.mk_access_until && +new Date(a.mk_access_until) > Date.now() ? { id: u.id, name: u.name, email: u.email, role: "admin", ws: u.id, tenant: true } : null;
  }
  const r = (await sql`select marketing_role from users where id = ${u.id}`)[0];
  const role = (ROLES as readonly string[]).includes(r?.marketing_role) ? (r.marketing_role as MkRole) : "admin";
  return { id: u.id, name: u.name, email: u.email, role, ws: null, tenant: false };
}

const rank = (r: MkRole) => ROLES.indexOf(r);
export const can = (u: MkUser, need: MkRole) => rank(u.role) >= rank(need);

/** Allowed workflow moves and the minimum role for each. */
export const TRANSITIONS: Record<string, { to: MkStatus; need: MkRole; label: string }[]> = {
  draft: [{ to: "pending", need: "editor", label: "Submit for review" }],
  pending: [{ to: "approved", need: "manager", label: "Approve" }, { to: "draft", need: "manager", label: "Send back to draft" }],
  approved: [{ to: "scheduled", need: "manager", label: "Schedule" }, { to: "published", need: "manager", label: "Mark as published" }, { to: "draft", need: "manager", label: "Back to draft" }],
  scheduled: [{ to: "published", need: "manager", label: "Mark as published" }, { to: "failed", need: "manager", label: "Mark as failed" }, { to: "approved", need: "manager", label: "Unschedule" }],
  failed: [{ to: "draft", need: "editor", label: "Back to draft" }],
  published: [],
};

export async function logActivity(userId: number, action: string, detail = "", postId: number | null = null, ws: number | null = null) {
  await sql`insert into mk_activity (post_id, user_id, action, detail, ws) values (${postId}, ${userId}, ${action}, ${detail.slice(0, 500)}, ${ws})`;
}

export type Brand = { company?: string; contact?: string; voice: string; audience: string; services: string; hashtags: string; avoid: string; languages: string; goal: number };
export const DEFAULT_BRAND: Brand = {
  voice: "Professional, safety-first, confident and approachable. IRATA-certified experts who explain clearly.",
  audience: "Facility managers, wind and telecom asset owners, contractors and safety officers in the Philippines and Asia.",
  services: "Rope Access; Wind Turbine Maintenance; Renewable Energy; Offshore and Onshore Operations; Met Mast and Telecom Towers; Facade Cleaning and Maintenance; Industrial Maintenance; Work at Height; Safety and Rescue; Training and Consultancy; PPE and Equipment",
  hashtags: "#NEAS #RopeAccess #IRATA #WorkAtHeight #SafetyFirst #Philippines",
  avoid: "Unverified safety claims, competitor names, prices not on the website.",
  languages: "English, Taglish",
  goal: 12,
};

export const AI_TASKS: Record<string, string> = {
  caption: "a short marketing caption",
  seo: "an SEO-friendly website description (meta title under 60 characters, meta description under 160 characters, then a 120-word paragraph)",
  hashtags: "15 relevant hashtags, mixing broad and niche, one line",
  facebook: "a Facebook post (hook, 3 short paragraphs, call to action with phone/WhatsApp, hashtags)",
  instagram: "an Instagram caption (hook line, line breaks, emojis used sparingly, call to action, 10 hashtags)",
  linkedin: "a LinkedIn article (title, 4-6 short sections with headings, professional tone, closing call to action)",
  youtube: "a YouTube video title (under 70 characters), description (150 words with timestamps placeholders) and 10 tags",
  tiktok: "a 30-45 second TikTok script with scene-by-scene shots, on-screen text and voice-over",
  taglish: "a 45-second Taglish (Tagalog-English) voice-over script, natural and conversational",
  campaign: "a 4-week promotional campaign plan: objective, key message, weekly themes, post ideas per platform, and KPIs",
  repurpose: "versions of the given content for Facebook, Instagram, LinkedIn and TikTok",
  reply: "a short, friendly customer-service reply (2-4 sentences) to the customer message below, in the same language they used (English, Tagalog or Taglish). Answer what you can, invite them to WhatsApp +63 991 426 5886 for quotes, and never invent prices or availability",
  schedule: "a recommended 2-week publishing schedule (day, time in Philippine time, platform, post idea) with reasons",
};

export async function generate(task: string, topic: string, extra: { tone?: string; brand: Brand; tenant?: boolean }): Promise<{ text: string } | { error: string }> {
  const key = process.env.ANTHROPIC_API_KEY, gkey = process.env.GEMINI_API_KEY;
  if (!key && !gkey) return { error: "AI is not switched on yet. Add a free GEMINI_API_KEY (or an ANTHROPIC_API_KEY) in Vercel → Settings → Environment Variables, then redeploy." };
  const what = AI_TASKS[task];
  if (!what) return { error: "Unknown content type." };
  const b = extra.brand;
  const who = extra.tenant
    ? `You write marketing content for this business: ${b.company || "[business name not set — use a placeholder]"}. Contact details: ${b.contact || "[contact placeholder]"}.`
    : `You write marketing content for NextEdge Access Solutions (NEAS) OPC, an IRATA-certified rope access and height-safety company in Marilao, Bulacan, Philippines. Phone/WhatsApp/Viber: +63 991 426 5886. Website: www.nextedge-access-solutions.com.`;
  const system = `${who}
Brand voice: ${b.voice}
Audience: ${b.audience}
Services: ${b.services}
Preferred hashtags: ${b.hashtags}
Avoid: ${b.avoid}
Never invent certifications, project names, client names, statistics or prices. If a fact is needed and not given, leave a clear [placeholder].`;
  const user = `Write ${(extra.tenant ? what.replace("invite them to WhatsApp +63 991 426 5886 for quotes", "invite them to contact the business for quotes") : what)}.\nTopic / source content:\n${topic.slice(0, 6000)}${extra.tone ? `\nTone: ${extra.tone}` : ""}\nReturn only the content, ready to edit.`;
  if (!key && gkey) {
    const models = [process.env.MK_GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest"].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);
    let last = "";
    for (const model of models) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": gkey },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: 2000 } }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const text = (j.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("").trim();
          if (text) return { text };
          last = "The AI returned no text. Try again.";
          continue;
        }
        last = `AI request failed (${r.status}): ${j?.error?.message ?? "unknown error"}`;
        if (![404, 429, 500, 503].includes(r.status)) break; // key or request problem: don't try other models
      } catch (e) { last = "Could not reach the AI service: " + (e as Error).message; }
    }
    return { error: last || "AI is busy. Please try again in a minute." };
  }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key as string, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.MK_AI_MODEL || "claude-sonnet-5-5", max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: `AI request failed (${r.status}): ${j?.error?.message ?? "unknown error"}` };
    const text = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
    return text ? { text } : { error: "The AI returned no text. Try again." };
  } catch (e) {
    return { error: "Could not reach the AI service: " + (e as Error).message };
  }
}

/** Which social platforms have app credentials configured. Connecting accounts (OAuth) needs these first. */
export function platformStatus() {
  const has = (...k: string[]) => k.every((x) => !!process.env[x]);
  return [
    { id: "facebook", name: "Facebook Pages", needs: "META_APP_ID, META_APP_SECRET", ready: has("META_APP_ID", "META_APP_SECRET") },
    { id: "instagram", name: "Instagram Business", needs: "META_APP_ID, META_APP_SECRET (via a linked Facebook Page)", ready: has("META_APP_ID", "META_APP_SECRET") },
    { id: "whatsapp", name: "WhatsApp Business (Cloud API inbox)", needs: "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN · webhook URL: /api/whatsapp/webhook", ready: has("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID") },
    { id: "linkedin", name: "LinkedIn Page", needs: "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET", ready: has("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET") },
    { id: "youtube", name: "YouTube", needs: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (YouTube Data API enabled)", ready: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") },
    { id: "tiktok", name: "TikTok", needs: "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET", ready: has("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET") },
    { id: "google_business", name: "Google Business Profile", needs: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Business Profile API access approved by Google)", ready: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") },
  ];
}

export function cleanUrl(u: unknown): string | null {
  const s = String(u ?? "").trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(s) && s.length <= 1000 ? s : null;
}
