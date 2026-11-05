import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sql } from "./db";
import { googleAuthUrl, tiktokAuthUrl, connectGoogle, connectTikTok, publishVideoPlatform } from "./social-video";

/** Social connections (official OAuth) and publishing for Facebook Pages, Instagram Business and LinkedIn.
 *  Tokens are encrypted at rest (AES-256-GCM) and never sent to the browser. */

export const SOCIAL_PLATFORMS = ["facebook", "linkedin", "google", "tiktok"] as const; // connect flows (Instagram comes through Facebook)
export type ConnectPlatform = (typeof SOCIAL_PLATFORMS)[number];
/** Env values with stray spaces/quotes removed (common copy-paste issue). */
const env = (k: string) => (process.env[k] ?? "").trim().replace(/^["']|["']$/g, "").trim();
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v25.0"}`;
const LI_VERSION = () => process.env.LINKEDIN_API_VERSION || "202608";

function encKey() {
  const base = process.env.TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!base) throw new Error("No secret available to encrypt tokens.");
  return createHash("sha256").update("neas-token-v1:" + base).digest();
}
export function encrypt(text: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
export function decrypt(blob: string) {
  const [iv, tag, data] = blob.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", encKey(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/** Page permissions by default; Instagram ones only when META_INSTAGRAM=1 (after that use case is added). META_SCOPES overrides all. */
export function metaScopes() {
  if (process.env.META_SCOPES) return process.env.META_SCOPES.replace(/\s+/g, "");
  const pages = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"];
  return (process.env.META_INSTAGRAM === "1" ? [...pages, "instagram_basic", "instagram_content_publish"] : pages).join(",");
}
/** LINKEDIN_PAGES=1 also asks for Company Page access (needs the Community Management API product on the LinkedIn app). */
const liScopes = (pages = false) => "openid profile w_member_social" + (pages || process.env.LINKEDIN_PAGES === "1" ? " rw_organization_admin w_organization_social" : "");
export const metaReady = () => !!(process.env.META_APP_ID && env("META_APP_SECRET"));
/** LinkedIn requires the Community Management API to live in its own app; when LINKEDIN_PAGES_CLIENT_ID is set, Page connections use that app. */
const pagesApp = (pages: boolean) => pages && !!env("LINKEDIN_PAGES_CLIENT_ID");
const liId = (pages: boolean) => env(pagesApp(pages) ? "LINKEDIN_PAGES_CLIENT_ID" : "LINKEDIN_CLIENT_ID");
const liSecret = (pages: boolean) => env(pagesApp(pages) ? "LINKEDIN_PAGES_CLIENT_SECRET" : "LINKEDIN_CLIENT_SECRET");
export const linkedinReady = () => !!(process.env.LINKEDIN_CLIENT_ID && env("LINKEDIN_CLIENT_SECRET"));
export const redirectUri = (origin: string, p: ConnectPlatform) => `${origin}/api/admin/social/callback/${p}`;

export function authorizeUrl(p: ConnectPlatform, origin: string, state: string, pages = false) {
  if (p === "google") return googleAuthUrl(origin, state);
  if (p === "tiktok") return tiktokAuthUrl(origin, state);
  if (p === "facebook") {
    const q = new URLSearchParams({ client_id: env("META_APP_ID"), redirect_uri: redirectUri(origin, p), state, response_type: "code" });
    // Facebook Login for Business apps use a saved configuration; classic Facebook Login uses a scope list.
    if (env("META_LOGIN_CONFIG_ID")) q.set("config_id", env("META_LOGIN_CONFIG_ID"));
    else q.set("scope", metaScopes());
    return `https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v25.0"}/dialog/oauth?${q}`;
  }
  const q = new URLSearchParams({ response_type: "code", client_id: liId(pages), redirect_uri: redirectUri(origin, p), state, scope: pagesApp(pages) ? "rw_organization_admin w_organization_social" : liScopes(pages) });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

async function j(r: Response) {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || body?.error_description || body?.message || `HTTP ${r.status}`);
  return body;
}

async function saveAccount(platform: string, externalId: string, name: string, token: string, expiresAt: Date | null, userId: number, ws: number | null) {
  await sql`insert into mk_social_accounts (platform, external_id, name, token_enc, expires_at, status, last_error, connected_by, ws)
    values (${platform}, ${externalId}, ${name.slice(0, 200)}, ${encrypt(token)}, ${expiresAt}, 'ok', null, ${userId}, ${ws})
    on conflict (platform, external_id) do update set name = excluded.name, token_enc = excluded.token_enc, expires_at = excluded.expires_at,
      status = 'ok', last_error = null, connected_by = excluded.connected_by, ws = excluded.ws, updated_at = now()`;
}

/** Exchanges the OAuth code and stores every account it grants. Returns a short summary. */
export async function completeConnect(p: ConnectPlatform, code: string, origin: string, userId: number, ws: number | null = null, pages = false): Promise<string> {
  if (p === "google") return connectGoogle(code, origin, userId, ws);
  if (p === "tiktok") return connectTikTok(code, origin, userId, ws);
  if (p === "facebook") {
    const base = { client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET") };
    const short = await j(await fetch(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ ...base, redirect_uri: redirectUri(origin, p), code })}`));
    const long = await j(await fetch(`${GRAPH()}/oauth/access_token?${new URLSearchParams({ ...base, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`));
    const pages = await j(await fetch(`${GRAPH()}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100", access_token: long.access_token })}`));
    let fb = 0, ig = 0;
    for (const pg of pages.data ?? []) {
      await saveAccount("facebook", pg.id, pg.name, pg.access_token, null, userId, ws); fb++;
      const iga = pg.instagram_business_account;
      if (iga?.id) { await saveAccount("instagram", iga.id, iga.username ? "@" + iga.username : pg.name + " (Instagram)", pg.access_token + "|" + pg.id, null, userId, ws); ig++; }
    }
    if (!fb) throw new Error("No Facebook Pages were shared. Reconnect and tick your NEAS Page when Facebook asks.");
    return `${fb} Facebook Page(s)${ig ? ` and ${ig} Instagram account(s)` : ""} connected`;
  }
  const tok = await j(await fetch("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin, p), client_id: liId(pages), client_secret: liSecret(pages) }) }));
  const me = pagesApp(pages) ? { sub: "", name: "" } : await j(await fetch("https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${tok.access_token}` } }));
  if (me.sub) await saveAccount("linkedin", me.sub, me.name || "LinkedIn profile", tok.access_token, tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null, userId, ws);
  let orgs = 0;
  if (process.env.LINKEDIN_PAGES === "1" || /w_organization_social/.test(String(tok.scope ?? ""))) {
    const h = { authorization: `Bearer ${tok.access_token}`, "LinkedIn-Version": LI_VERSION(), "X-Restli-Protocol-Version": "2.0.0" };
    const exp = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null;
    const acl = await j(await fetch("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED", { headers: h }));
    for (const e of acl.elements ?? []) {
      const id = String(e.organization ?? "").split(":").pop(); if (!id) continue;
      const org = await fetch(`https://api.linkedin.com/rest/organizations/${id}`, { headers: h }).then((r) => r.json()).catch(() => ({}));
      await saveAccount("linkedin", "org:" + id, (org.localizedName || "LinkedIn Page " + id) + " (Page)", tok.access_token, exp, userId, ws); orgs++;
    }
  }
  if (!me.sub && !orgs) throw new Error("No LinkedIn Pages found where you are an admin.");
  return `${me.sub ? `LinkedIn profile ${me.name ?? ""}` : ""}${me.sub && orgs ? " and " : ""}${orgs ? `${orgs} LinkedIn Page(s)` : ""} connected`.replace(/\s+/g, " ");
}

const absolute = (u: string, origin: string) => (u.startsWith("/") ? origin + u : u);
const liEscape = (t: string) => t.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => "\\" + c);

/** Publishes one post to one account. Returns the platform's post id, or throws with the platform's error. */
export async function publishTo(acc: { id?: number; platform: string; external_id: string; token_enc: string }, text: string, mediaUrl: string, origin: string): Promise<string> {
  if (["youtube", "tiktok", "google_business"].includes(acc.platform)) return publishVideoPlatform(acc, text, mediaUrl ? absolute(mediaUrl, origin) : "");
  const token = decrypt(acc.token_enc);
  const img = mediaUrl && /\.(jpe?g|png|webp|gif)(\?|$)|^\/api\/img\//i.test(mediaUrl) ? absolute(mediaUrl, origin) : "";
  if (acc.platform === "facebook") {
    const r = img
      ? await j(await fetch(`${GRAPH()}/${acc.external_id}/photos`, { method: "POST", body: new URLSearchParams({ url: img, caption: text, access_token: token }) }))
      : await j(await fetch(`${GRAPH()}/${acc.external_id}/feed`, { method: "POST", body: new URLSearchParams({ message: text, ...(mediaUrl && !img ? { link: absolute(mediaUrl, origin) } : {}), access_token: token }) }));
    return String(r.post_id || r.id);
  }
  if (acc.platform === "instagram") {
    if (!img) throw new Error("Instagram needs an image. Add an image link (JPG/PNG) to the post.");
    const pageToken = token.split("|")[0];
    const c = await j(await fetch(`${GRAPH()}/${acc.external_id}/media`, { method: "POST", body: new URLSearchParams({ image_url: img, caption: text, access_token: pageToken }) }));
    const pub = await j(await fetch(`${GRAPH()}/${acc.external_id}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.id, access_token: pageToken }) }));
    return String(pub.id);
  }
  if (acc.platform === "linkedin") {
    const r = await fetch("https://api.linkedin.com/rest/posts", { method: "POST",
      headers: { authorization: `Bearer ${token}`, "LinkedIn-Version": LI_VERSION(), "X-Restli-Protocol-Version": "2.0.0", "content-type": "application/json" },
      body: JSON.stringify({ author: acc.external_id.startsWith("org:") ? `urn:li:organization:${acc.external_id.slice(4)}` : `urn:li:person:${acc.external_id}`, commentary: liEscape(text + (mediaUrl ? `\n\n${absolute(mediaUrl, origin)}` : "")), visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.message || `LinkedIn answered ${r.status}`); }
    return r.headers.get("x-restli-id") || "ok";
  }
  throw new Error(`Publishing to ${acc.platform} isn't available yet.`);
}
