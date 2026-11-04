import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { bad, ok } from "@/lib/http";
import { notifyOrderStatus } from "@/lib/notify";
const STATUSES = ["awaiting_payment", "paid", "processing", "shipped", "completed", "cancelled"];
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return bad("Admin access required.", 403);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (!STATUSES.includes(b.status)) return bad("Unknown status.");
  const prev = (await sql`select status from orders where id = ${Number(id)}`)[0];
  await sql`update orders set status = ${b.status}, updated_at = now() where id = ${Number(id)}`;
  if (prev && prev.status !== b.status) await notifyOrderStatus(Number(id), b.status).catch(() => {});
  return ok();
}
