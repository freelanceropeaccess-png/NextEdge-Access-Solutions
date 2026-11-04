import { sql } from "@/lib/db";
import { bad, ok, str } from "@/lib/http";
import { createResetLink, sendResetEmail, originOf } from "@/lib/reset";

const hits = new Map<string, number[]>();
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = str(b.email, 320)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Enter a valid email address.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "x";
  const now = Date.now(), w = (hits.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  if (w.length >= 5) return bad("Too many requests. Please wait 15 minutes.", 429);
  w.push(now); hits.set(ip, w);
  const u = (await sql`select id from users where email = ${email}`)[0];
  if (u) { const link = await createResetLink(u.id, originOf(req)); await sendResetEmail(email, link); }
  // Same answer whether or not the account exists, so emails can't be discovered.
  return ok({ ok: true });
}
