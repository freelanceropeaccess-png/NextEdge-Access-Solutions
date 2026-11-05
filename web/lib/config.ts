import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sql } from "./db";

/** API keys and integration settings that admins manage in the Marketing Command Center (Settings & Logs).
 *  A value saved by an admin overrides the hosting environment; clearing it falls back to the environment.
 *  Values are encrypted in the database and never sent back to the browser. */
export const CONFIG_KEYS: { key: string; label: string; group: string; secret: boolean; help?: string }[] = [
  { key: "GEMINI_API_KEY", label: "Gemini API key (free AI)", group: "AI", secret: true, help: "aistudio.google.com → Get API key" },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API key (optional)", group: "AI", secret: true },
  { key: "RESEND_API_KEY", label: "Resend API key (emails)", group: "Email", secret: true, help: "resend.com → API Keys" },
  { key: "MAIL_FROM", label: "Sender (e.g. NEAS <no-reply@nextedge-access-solutions.com>)", group: "Email", secret: false },
  { key: "META_APP_ID", label: "Meta App ID (numbers)", group: "Facebook & Instagram", secret: false },
  { key: "META_APP_SECRET", label: "Meta App Secret", group: "Facebook & Instagram", secret: true },
  { key: "META_LOGIN_CONFIG_ID", label: "Facebook Login for Business configuration ID", group: "Facebook & Instagram", secret: false },
  { key: "META_INSTAGRAM", label: "Instagram on (1 = yes)", group: "Facebook & Instagram", secret: false },
  { key: "LINKEDIN_CLIENT_ID", label: "LinkedIn Client ID (profile app)", group: "LinkedIn", secret: false },
  { key: "LINKEDIN_CLIENT_SECRET", label: "LinkedIn Client Secret (profile app)", group: "LinkedIn", secret: true },
  { key: "LINKEDIN_PAGES_CLIENT_ID", label: "LinkedIn Client ID (Company Pages app)", group: "LinkedIn", secret: false },
  { key: "LINKEDIN_PAGES_CLIENT_SECRET", label: "LinkedIn Client Secret (Company Pages app)", group: "LinkedIn", secret: true },
  { key: "GOOGLE_CLIENT_ID", label: "Google OAuth Client ID", group: "YouTube & Google Business", secret: false },
  { key: "GOOGLE_CLIENT_SECRET", label: "Google OAuth Client Secret", group: "YouTube & Google Business", secret: true },
  { key: "YOUTUBE_PRIVACY", label: "YouTube upload privacy (public / unlisted / private)", group: "YouTube & Google Business", secret: false },
  { key: "TIKTOK_CLIENT_KEY", label: "TikTok Client Key", group: "TikTok", secret: false },
  { key: "TIKTOK_CLIENT_SECRET", label: "TikTok Client Secret", group: "TikTok", secret: true },
  { key: "WHATSAPP_TOKEN", label: "WhatsApp permanent access token", group: "WhatsApp", secret: true },
  { key: "WHATSAPP_PHONE_NUMBER_ID", label: "WhatsApp phone number ID", group: "WhatsApp", secret: false },
  { key: "WHATSAPP_VERIFY_TOKEN", label: "WhatsApp webhook verify token (any phrase)", group: "WhatsApp", secret: true },
  { key: "CRON_SECRET", label: "Scheduler secret (16+ characters, optional)", group: "Scheduler", secret: true },
  { key: "MK_MEMBER_FEE", label: "Member monthly fee in ₱ (default 100)", group: "Members", secret: false },
  { key: "MK_MEMBER_DAILY_LIMIT", label: "Member posts per day (default 10)", group: "Members", secret: false },
];
const ALLOWED = new Set(CONFIG_KEYS.map((k) => k.key));
const ORIGINAL: Record<string, string | undefined> = Object.fromEntries(CONFIG_KEYS.map((k) => [k.key, process.env[k.key]]));

function key() {
  const base = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SESSION_SECRET || "neas";
  return createHash("sha256").update("neas-config-v1:" + base).digest();
}
const enc = (s: string) => { const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv); const d = Buffer.concat([c.update(s, "utf8"), c.final()]); return [iv, c.getAuthTag(), d].map((b) => b.toString("base64url")).join("."); };
const dec = (s: string) => { const [iv, t, d] = s.split(".").map((x) => Buffer.from(x, "base64url")); const c = createDecipheriv("aes-256-gcm", key(), iv); c.setAuthTag(t); return Buffer.concat([c.update(d), c.final()]).toString("utf8"); };

let cache: { at: number; vals: Record<string, string> } | null = null;
async function readSaved(): Promise<Record<string, string>> {
  const r = (await sql`select value from settings where key = 'integrations'`.catch(() => []))[0];
  const blob = r?.value as string | undefined;
  if (!blob) return {};
  try { return JSON.parse(dec(blob)); } catch { return {}; }
}
function apply(vals: Record<string, string>) {
  for (const k of ALLOWED) {
    const v = vals[k] ?? ORIGINAL[k];
    if (v === undefined || v === "") delete process.env[k]; else process.env[k] = v;
  }
}
/** Loads admin-saved keys into this server instance (cached for 30 seconds). Call before reading integration env vars. */
export async function loadConfig(force = false) {
  if (!force && cache && Date.now() - cache.at < 30_000) return;
  const vals = await readSaved();
  cache = { at: Date.now(), vals };
  apply(vals);
}
export async function configStatus() {
  await loadConfig(true);
  const saved = cache?.vals ?? {};
  return CONFIG_KEYS.map((k) => ({ ...k, source: saved[k.key] ? "admin" : ORIGINAL[k.key] ? "hosting" : "", preview: !k.secret ? (saved[k.key] ?? ORIGINAL[k.key] ?? "") : (saved[k.key] ?? ORIGINAL[k.key]) ? "••••" + String(saved[k.key] ?? ORIGINAL[k.key]).slice(-4) : "" }));
}
export async function saveConfig(changes: Record<string, string | null>) {
  const vals = await readSaved();
  for (const [k, v] of Object.entries(changes)) {
    if (!ALLOWED.has(k)) continue;
    const clean = typeof v === "string" ? v.trim().replace(/^["']|["']$/g, "").trim() : "";
    if (v === null || clean === "") delete vals[k]; else vals[k] = clean.slice(0, 4000);
  }
  await sql`insert into settings (key, value) values ('integrations', ${enc(JSON.stringify(vals))}) on conflict (key) do update set value = excluded.value`;
  cache = null;
  await loadConfig(true);
}
