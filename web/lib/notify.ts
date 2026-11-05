import { sql } from "./db";
import { loadConfig } from "./config";
import { getSetting, DEFAULT_BUSINESS, type Business } from "./settings";

/** Email automations (Resend). Every send is logged in mk_email_log; failures never break the action that triggered them. */
export type AutoSettings = { orderAlert: boolean; orderConfirm: boolean; orderStatus: boolean; approval: boolean; publishFail: boolean; alertEmail: string };
export const DEFAULT_AUTO: AutoSettings = { orderAlert: true, orderConfirm: true, orderStatus: true, approval: true, publishFail: true, alertEmail: "" };
const FROM = () => process.env.MAIL_FROM || "NEAS <no-reply@nextedge-access-solutions.com>";
const SITE = () => (process.env.SITE_URL || "https://www.nextedge-access-solutions.com").replace(/\/$/, "");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const peso = (n: number) => "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function autoSettings(): Promise<AutoSettings> { return { ...DEFAULT_AUTO, ...(await getSetting<AutoSettings>("mk_auto", DEFAULT_AUTO)) }; }
async function alertTo(a: AutoSettings) {
  if (a.alertEmail) return a.alertEmail;
  const biz = await getSetting<Business>("business", DEFAULT_BUSINESS);
  return biz.email || DEFAULT_BUSINESS.email;
}

function layout(title: string, body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6fa;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<div style="background:#071D29;padding:18px 22px;color:#EBC07E;font-weight:800;letter-spacing:.06em">NEXTEDGE ACCESS SOLUTIONS</div>
<div style="padding:22px;color:#0f172a;font-size:14px;line-height:1.55"><h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${body}</div>
<div style="padding:14px 22px;background:#f8fafc;color:#64748b;font-size:12px">NextEdge Access Solutions (NEAS) OPC · +63 991 426 5886 · ${esc(SITE().replace(/^https?:\/\//, ""))}</div></div></div>`;
}

export async function sendMail(to: string, subject: string, html: string, kind: string): Promise<boolean> {
  await loadConfig().catch(() => {});
  const key = process.env.RESEND_API_KEY;
  let ok = false, error: string | null = null;
  if (!key) error = "RESEND_API_KEY not set";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) error = "Invalid recipient";
  else {
    try {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ from: FROM(), to, subject, html }) });
      ok = r.ok; if (!ok) error = ((await r.json().catch(() => ({}))) as { message?: string }).message || `Resend answered ${r.status}`;
    } catch (e) { error = (e as Error).message; }
  }
  await sql`insert into mk_email_log (recipient, subject, kind, ok, error) values (${to.slice(0, 320)}, ${subject.slice(0, 300)}, ${kind}, ${ok}, ${error})`.catch(() => {});
  return ok;
}

async function orderWithItems(id: number) {
  const o = (await sql`select o.*, u.email as account_email, u.name as account_name from orders o join users u on u.id = o.user_id where o.id = ${id}`)[0];
  if (!o) return null;
  const items = await sql`select name, code, quantity, unit_price from order_items where order_id = ${id}`;
  return { o, items };
}
const itemsTable = (items: { name: string; code: string; quantity: number; unit_price: string | number }[], total: number) =>
  `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0">${items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eef2f7">${esc(i.name)}${i.code ? ` <span style="color:#64748b">(${esc(i.code)})</span>` : ""}</td><td style="padding:6px;text-align:center;border-bottom:1px solid #eef2f7">×${i.quantity}</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #eef2f7">${peso(Number(i.unit_price) * i.quantity)}</td></tr>`).join("")}
<tr><td colspan="2" style="padding:8px 0;font-weight:700">Total</td><td style="padding:8px 0;text-align:right;font-weight:700">${peso(total)}</td></tr></table>`;

export async function notifyNewOrder(orderId: number) {
  const a = await autoSettings(); const d = await orderWithItems(orderId); if (!d) return;
  const { o, items } = d, total = Number(o.total);
  if (a.orderAlert) await sendMail(await alertTo(a), `New order ${o.reference} · ${peso(total)}`, layout(`New order ${o.reference}`,
    `<p><b>${esc(o.delivery_name)}</b> · ${esc(o.delivery_phone)} · ${esc(o.delivery_email || o.account_email)}<br>${esc(o.delivery_address)}</p>${itemsTable(items as never, total)}
<p>Payment slip uploaded. Check the deposit, then mark it <b>Paid</b>.</p>${o.notes ? `<p><b>Notes:</b> ${esc(o.notes)}</p>` : ""}<p><a href="${SITE()}/admin?s=orders" style="background:#F97316;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open orders in admin</a></p>`), "order_alert");
  const to = o.delivery_email || o.account_email;
  if (a.orderConfirm && to) await sendMail(to, `We received your order ${o.reference}`, layout("Thank you for your order",
    `<p>Hi ${esc(o.delivery_name)},</p><p>We received your order <b>${esc(o.reference)}</b> and your payment slip. We'll confirm your payment and stock, then arrange delivery.</p>${itemsTable(items as never, total)}
<p>Delivery to: ${esc(o.delivery_address)}</p><p>Track your order anytime in <a href="${SITE()}/account">My Account</a>. Questions? WhatsApp or call +63 991 426 5886.</p>`), "order_confirm");
}

const STATUS_TEXT: Record<string, [string, string]> = {
  paid: ["Payment confirmed", "We've confirmed your payment. We're preparing your items now."],
  processing: ["Your order is being prepared", "Your items are being prepared for delivery."],
  shipped: ["Your order is on the way", "Your order has been shipped. We'll contact you about delivery."],
  completed: ["Order completed", "Your order is complete. Thank you for choosing NEAS!"],
  cancelled: ["Order cancelled", "Your order has been cancelled. If you have questions or already paid, please contact us and we'll sort it out."],
};
export async function notifyOrderStatus(orderId: number, status: string) {
  const a = await autoSettings(); if (!a.orderStatus || !STATUS_TEXT[status]) return;
  const d = await orderWithItems(orderId); if (!d) return; const to = d.o.delivery_email || d.o.account_email; if (!to) return;
  const [title, line] = STATUS_TEXT[status];
  await sendMail(to, `${title} · ${d.o.reference}`, layout(title, `<p>Hi ${esc(d.o.delivery_name)},</p><p>${line}</p><p>Order <b>${esc(d.o.reference)}</b> · ${peso(Number(d.o.total))}</p><p><a href="${SITE()}/account">View your order</a> · WhatsApp +63 991 426 5886</p>`), "order_status");
}

export async function notifyApproval(postId: number, event: "pending" | "approved" | "sent_back" | "failed", note = "") {
  const a = await autoSettings();
  const p = (await sql`select p.id, p.title, p.created_by, u.email as author_email, u.name as author from mk_posts p left join users u on u.id = p.created_by where p.id = ${postId}`)[0];
  if (!p) return;
  const link = `${SITE()}/admin/marketing?m=calendar`;
  if (event === "pending" && a.approval) {
    const managers = await sql`select email from users where role = 'admin' and coalesce(marketing_role, 'admin') in ('manager', 'admin') and id <> ${p.created_by ?? 0}`;
    for (const m of managers) await sendMail(m.email, `Post waiting for approval: ${p.title || "Untitled"}`, layout("A post needs your approval", `<p><b>${esc(p.author || "A team member")}</b> submitted “${esc(p.title || "Untitled")}” for review.</p><p><a href="${link}">Review it in the Marketing Command Center</a></p>`), "approval");
  } else if ((event === "approved" || event === "sent_back") && a.approval && p.author_email) {
    await sendMail(p.author_email, `${event === "approved" ? "Approved" : "Sent back"}: ${p.title || "Untitled"}`, layout(event === "approved" ? "Your post was approved" : "Your post was sent back", `<p>“${esc(p.title || "Untitled")}” was ${event === "approved" ? "approved" : "sent back to draft"}.</p>${note ? `<p><b>Note:</b> ${esc(note)}</p>` : ""}<p><a href="${link}">Open it</a></p>`), "approval");
  } else if (event === "failed" && a.publishFail) {
    await sendMail(await alertTo(a), `Publishing failed: ${p.title || "Untitled"}`, layout("A post failed to publish", `<p>“${esc(p.title || "Untitled")}” could not be published.</p><p><b>Reason:</b> ${esc(note)}</p><p><a href="${link}">Open it to fix and retry</a></p>`), "publish_fail");
  }
}
