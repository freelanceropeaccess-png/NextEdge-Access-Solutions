import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { bad, ok } from "@/lib/http";
import { createResetLink, sendResetEmail, originOf } from "@/lib/reset";
/** Staff create a 24-hour reset link for a customer, to send by WhatsApp/Viber; also emailed if email is configured. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return bad("Admin access required.", 403);
  const { id } = await params;
  const u = (await sql`select id, email from users where id = ${Number(id) || 0}`)[0];
  if (!u) return bad("User not found.", 404);
  const link = await createResetLink(u.id, originOf(req), 24);
  const emailed = await sendResetEmail(u.email, link);
  return ok({ link, emailed });
}
