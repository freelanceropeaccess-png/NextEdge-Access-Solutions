import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { bad, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A member asks for Marketing Command Center access after paying the ₱100 monthly fee. A NEAS admin approves it. */
export async function POST(req: Request) {
  const u = await getUser();
  if (!u) return bad("Please log in.", 401);
  if (u.role === "admin") return bad("Staff already have access.");
  const b = await req.json().catch(() => ({}));
  const ref = String(b.ref ?? "").trim().slice(0, 120);
  if (ref.length < 4) return bad("Enter the reference number of your ₱100 payment.");
  // New members become "requested"; active members renewing keep access while the admin confirms (ref is shown for checking).
  await sql`update users set mk_access = case when mk_access = 'approved' and mk_access_until > now() then 'approved' else 'requested' end, mk_access_ref = ${ref}, mk_access_at = now() where id = ${u.id}`;
  return ok();
}
