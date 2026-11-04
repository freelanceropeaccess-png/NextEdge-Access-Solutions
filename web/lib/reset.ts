import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "./db";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** One-time reset token, valid for `hours`. Only its SHA-256 hash is stored. */
export async function createResetLink(userId: number, origin: string, hours = 1): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await sql`delete from password_resets where user_id = ${userId} and (used_at is not null or expires_at < now())`;
  await sql`insert into password_resets (token_hash, user_id, expires_at) values (${hash(token)}, ${userId}, now() + make_interval(hours => ${hours}))`;
  return `${origin}/reset-password?token=${token}`;
}

export async function useResetToken(token: string, password: string): Promise<{ ok: true; role: string } | { error: string }> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return { error: "This reset link is invalid." };
  if (password.length < 8 || password.length > 200) return { error: "Password must be at least 8 characters." };
  const r = (await sql`select r.user_id, r.expires_at, r.used_at, u.role from password_resets r join users u on u.id = r.user_id where r.token_hash = ${hash(token)}`)[0];
  if (!r || r.used_at) return { error: "This reset link was already used or is invalid. Request a new one." };
  if (new Date(r.expires_at) < new Date()) return { error: "This reset link has expired. Request a new one." };
  const ph = await bcrypt.hash(password, 12);
  await sql`update users set password_hash = ${ph} where id = ${r.user_id}`;
  await sql`update password_resets set used_at = now() where user_id = ${r.user_id} and used_at is null`;
  return { ok: true, role: r.role };
}

/** Sends email through Resend when RESEND_API_KEY and MAIL_FROM are set. Returns false if email isn't configured or failed. */
export async function sendResetEmail(to: string, link: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject: "Reset your NEAS password",
        html: `<p>Hello,</p><p>Someone asked to reset the password for your NEAS account. Click the link below within 1 hour to choose a new password:</p><p><a href="${link}">Reset my password</a></p><p>If you didn't ask for this, you can ignore this email.</p><p>NextEdge Access Solutions</p>` }),
    });
    return r.ok;
  } catch { return false; }
}

export const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export function originOf(req: Request) {
  const env = process.env.SITE_URL?.replace(/\/$/, "");
  if (env && /^https:\/\//.test(env)) return env;
  return new URL(req.url).origin;
}
