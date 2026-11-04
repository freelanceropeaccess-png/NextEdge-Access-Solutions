import { randomBytes } from "node:crypto";
import { sql, listProducts } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { bad, ok, str, BANK } from "@/lib/http";
import { notifyNewOrder } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return bad("Please log in.", 401);
  const orders = await sql`select id, reference, status, total, created_at from orders where user_id = ${user.id} order by created_at desc`;
  return ok(orders);
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return bad("Please log in to place an order.", 401);
  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  const form = isMultipart ? await req.formData() : null;
  const b = form ? Object.fromEntries(form.entries()) : await req.json().catch(() => ({}));
  const items = form ? JSON.parse(String(form.get("items") || "[]")) : b.items;
  const name = str(b.deliveryName, 160), phone = str(b.deliveryPhone, 40), address = str(b.deliveryAddress, 600);
  const email = str(b.deliveryEmail, 320)?.toLowerCase() ?? null;
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 1000) : null;
  const paymentMethod = str(b.paymentMethod, 40) || "bank_transfer";
  if (!name || !phone || !email || !address) return bad("Enter your name, mobile number, email and address.");
  if (paymentMethod !== "bank_transfer") return bad("Online card payment is not available yet.");
  const slip = form?.get("paymentSlip");
  if (!(slip instanceof File) || !slip.size) return bad("Upload your payment slip before sending the order.");
  if (slip.size > 5 * 1024 * 1024 || !(slip.type.startsWith("image/") || slip.type === "application/pdf")) return bad("Payment slip must be an image or PDF no larger than 5 MB.");
  const slipData = `data:${slip.type};base64,${Buffer.from(await slip.arrayBuffer()).toString("base64")}`;
  if (!Array.isArray(items) || !items.length || items.length > 100) return bad("Your cart is empty.");
  const catalog = new Map((await listProducts()).map((p) => [p.id, p]));
  const lines: { id: string; name: string; code: string; price: number; qty: number }[] = [];
  for (const it of items) {
    const p = catalog.get(String(it?.id));
    const qty = Number(it?.quantity);
    if (!p || !Number.isInteger(qty) || qty < 1 || qty > 999) return bad("An item in your cart is no longer available. Please refresh.");
    lines.push({ id: p.id, name: p.name, code: p.code, price: p.price, qty });
  }
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const d = new Date();
  const reference = `NEAS-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const order = await sql.begin(async (tx) => {
    const [o] = await tx`insert into orders (reference, user_id, total, delivery_name, delivery_phone, delivery_email, delivery_address, payment_method, payment_slip_name, payment_slip_type, payment_slip_data, notes)
      values (${reference}, ${user.id}, ${total}, ${name}, ${phone}, ${email}, ${address}, ${paymentMethod}, ${slip.name || "payment-slip"}, ${slip.type}, ${slipData}, ${notes}) returning id, reference, total, status`;
    for (const l of lines) await tx`insert into order_items (order_id, product_id, name, code, unit_price, quantity) values (${o.id}, ${l.id}, ${l.name}, ${l.code}, ${l.price}, ${l.qty})`;
    return o;
  });
  await notifyNewOrder(order.id).catch(() => {});
  return ok({ order, bank: BANK });
}
