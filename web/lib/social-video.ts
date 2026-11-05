import { sql } from "./db";
import { encrypt, decrypt } from "./social";

/** Google (YouTube + Business Profile) and TikTok: OAuth with refresh tokens, plus publishing.
 *  Tokens are stored encrypted as JSON { a: access, r: refresh, e: expiry ms }. */
const env = (k: string) => (process.env[k] ?? "").trim().replace(/^["']|["']$/g, "").trim();
export const googleReady = () => !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
export const tiktokReady = () => !!(env("TIKTOK_CLIENT_KEY") && env("TIKTOK_CLIENT_SECRET"));
const redirect = (origin: string, p: string) => `${origin}/api/admin/social/callback/${p}`;
type Tok = { a: string; r: string; e: number };

const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/business.manage"];

export function googleAuthUrl(origin: string, state: string) {
  const q = new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: redirect(origin, "google"), response_type: "code", scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
export function tiktokAuthUrl(origin: string, state: string) {
  const q = new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), redirect_uri: redirect(origin, "tiktok"), response_type: "code", scope: "user.info.basic,video.upload", state });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

async function json(r: Response) {
  const b = await r.json().catch(() => ({}));
  if (!r.ok || b?.error?.code && b.error.code !== "ok") throw new Error(b?.error?.message || b?.error_description || b?.error?.code || b?.error || `HTTP ${r.status}`);
  return b;
}
async function save(platform: string, externalId: string, name: string, tok: Tok, userId: number, ws: number | null) {
  await sql`insert into mk_social_accounts (platform, external_id, name, token_enc, expires_at, status, last_error, connected_by, ws)
    values (${platform}, ${externalId}, ${name.slice(0, 200)}, ${encrypt(JSON.stringify(tok))}, null, 'ok', null, ${userId}, ${ws})
    on conflict (platform, external_id) do update set name = excluded.name, token_enc = excluded.token_enc, status = 'ok', last_error = null, connected_by = excluded.connected_by, ws = excluded.ws, updated_at = now()`;
}

export async function connectGoogle(code: string, origin: string, userId: number, ws: number | null) {
  const t = await json(await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: redirect(origin, "google"), grant_type: "authorization_code" }) }));
  if (!t.refresh_token) throw new Error("Google didn't give a long-term permission. Remove NEAS from myaccount.google.com/permissions and connect again.");
  const tok: Tok = { a: t.access_token, r: t.refresh_token, e: Date.now() + (t.expires_in ?? 3600) * 1000 };
  const h = { authorization: `Bearer ${tok.a}` }, done: string[] = [], errs: string[] = [];
  try {
    const ch = await json(await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: h }));
    for (const c of ch.items ?? []) { await save("youtube", c.id, c.snippet?.title ?? "YouTube channel", tok, userId, ws); done.push(`YouTube: ${c.snippet?.title ?? c.id}`); }
    if (!(ch.items ?? []).length) errs.push("No YouTube channel on this Google account");
  } catch (e) { errs.push("YouTube: " + (e as Error).message); }
  try {
    const acc = await json(await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: h }));
    for (const a of acc.accounts ?? []) {
      const loc = await json(await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title&pageSize=100`, { headers: h }));
      for (const l of loc.locations ?? []) { await save("google_business", `${a.name}/${l.name}`, l.title ?? "Business location", tok, userId, ws); done.push(`Business Profile: ${l.title}`); }
    }
  } catch (e) { errs.push("Business Profile: " + (e as Error).message); }
  if (!done.length) throw new Error(errs.join(" · ") || "Nothing to connect on this Google account.");
  return done.join(", ") + " connected" + (errs.length ? ` (${errs.join(" · ")})` : "");
}

export async function connectTikTok(code: string, origin: string, userId: number, ws: number | null) {
  const t = await json(await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), code, grant_type: "authorization_code", redirect_uri: redirect(origin, "tiktok") }) }));
  const tok: Tok = { a: t.access_token, r: t.refresh_token, e: Date.now() + (t.expires_in ?? 86400) * 1000 };
  let name = "TikTok account";
  try { const me = await json(await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: { authorization: `Bearer ${tok.a}` } })); name = me.data?.user?.display_name || name; } catch { /* name is optional */ }
  await save("tiktok", t.open_id, name, tok, userId, ws);
  return `TikTok ${name} connected`;
}

/** Returns a fresh access token, refreshing and saving it when it is about to expire. */
async function access(acc: { id?: number; platform: string; token_enc: string }) {
  const tok: Tok = JSON.parse(decrypt(acc.token_enc));
  if (tok.e - Date.now() > 120_000) return tok.a;
  const google = acc.platform !== "tiktok";
  const t = google
    ? await json(await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: tok.r, grant_type: "refresh_token" }) }))
    : await json(await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), refresh_token: tok.r, grant_type: "refresh_token" }) }));
  const next: Tok = { a: t.access_token, r: t.refresh_token || tok.r, e: Date.now() + (t.expires_in ?? 3600) * 1000 };
  if (acc.id) await sql`update mk_social_accounts set token_enc = ${encrypt(JSON.stringify(next))}, updated_at = now() where id = ${acc.id}`;
  return next.a;
}

const MAX_VIDEO = 250 * 1024 * 1024;
async function getVideo(url: string) {
  if (!/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)) throw new Error("This platform needs a video. Put a direct link to an MP4/MOV/WebM file in the post's media link.");
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Couldn't download the video (${r.status}). The link must be a public, direct file link.`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_VIDEO) throw new Error("Video is larger than 250 MB.");
  return { buf, type: r.headers.get("content-type")?.startsWith("video/") ? r.headers.get("content-type")! : "video/mp4" };
}

export async function publishVideoPlatform(acc: { id?: number; platform: string; external_id: string; token_enc: string }, text: string, media: string): Promise<string> {
  const token = await access(acc);
  if (acc.platform === "youtube") {
    const v = await getVideo(media);
    const title = (text.split("\n").find((l) => l.trim()) ?? "Video").trim().slice(0, 100);
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": v.type, "x-upload-content-length": String(v.buf.length) },
      body: JSON.stringify({ snippet: { title, description: text.slice(0, 5000), categoryId: "22" }, status: { privacyStatus: env("YOUTUBE_PRIVACY") || "public", selfDeclaredMadeForKids: false } }) });
    if (!init.ok) await json(init);
    const up = await json(await fetch(init.headers.get("location")!, { method: "PUT", headers: { "content-type": v.type, "content-length": String(v.buf.length) }, body: v.buf }));
    return String(up.id);
  }
  if (acc.platform === "google_business") {
    const img = /\.(jpe?g|png|webp)(\?|$)|\/api\/img\//i.test(media) ? media : "";
    const r = await json(await fetch(`https://mybusiness.googleapis.com/v4/${acc.external_id}/localPosts`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ languageCode: "en", topicType: "STANDARD", summary: text.slice(0, 1500), ...(img ? { media: [{ mediaFormat: "PHOTO", sourceUrl: img }] } : {}) }) }));
    return String(r.name ?? "ok");
  }
  if (acc.platform === "tiktok") {
    const v = await getVideo(media);
    if (v.buf.length > 64 * 1024 * 1024) throw new Error("TikTok uploads from here are limited to 64 MB.");
    const init = await json(await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: v.buf.length, chunk_size: v.buf.length, total_chunk_count: 1 } }) }));
    const put = await fetch(init.data.upload_url, { method: "PUT", headers: { "content-type": v.type, "content-range": `bytes 0-${v.buf.length - 1}/${v.buf.length}` }, body: v.buf });
    if (!put.ok) throw new Error(`TikTok upload failed (${put.status}).`);
    return String(init.data.publish_id);
  }
  throw new Error(`Publishing to ${acc.platform} isn't available.`);
}
