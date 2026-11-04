import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { BANK } from "@/lib/http";
import OrderActions from "./OrderActions";
import ChangePassword from "./ChangePassword";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Account — NEAS" };
const peso = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");
const label: Record<string, string> = { awaiting_payment: "Awaiting payment", paid: "Paid", processing: "Processing", shipped: "Shipped", completed: "Completed", cancelled: "Cancelled" };

export default async function Account() {
  const user = await getUser();
  if (!user) redirect("/login?next=/account");
  const orders = await sql`select id, reference, status, total, created_at from orders where user_id = ${user.id} order by created_at desc`;
  const items = orders.length ? await sql`select order_id, name, quantity, unit_price from order_items where order_id in ${sql(orders.map((o) => o.id))}` : [];
  return <div className="wrap" style={{ padding: "40px 20px", display: "grid", gap: 20 }}>
    <div><div className="eyebrow">My account</div><h1>Hello, {user.name}</h1><p className="muted">{user.email}{user.phone ? " · " + user.phone : ""}</p></div>
    <ChangePassword />
    <div className="card">
      <h2 style={{ marginTop: 0 }}>My orders</h2>
      {!orders.length ? <p className="muted">No orders yet. <a href="/store">Visit the Online Store</a>.</p> :
        <table className="t"><thead><tr><th>Reference</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {orders.map((o) => <tr key={o.id}><td><b>{o.reference}</b></td><td>{new Date(o.created_at).toLocaleDateString("en-PH")}</td>
            <td style={{ fontSize: 13 }}>{items.filter((i) => i.order_id === o.id).map((i) => `${i.quantity} × ${i.name}`).join(", ")}</td>
            <td>{peso(Number(o.total))}</td><td><span className={"badge b-" + o.status}>{label[o.status] ?? o.status}</span></td><td><OrderActions id={Number(o.id)} status={o.status} /></td></tr>)}
        </tbody></table>}
    </div>
    <div className="card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
      <h3 style={{ marginTop: 0, color: "#15803d" }}>Payment details · Bank transfer</h3>
      <p style={{ margin: 0, lineHeight: 1.8 }}>Account Name: <b>{BANK.accountName}</b><br />Account Number: <b>{BANK.accountNumber}</b><br />SWIFT Code: {BANK.swift}<br />Bank: {BANK.bank}</p>
      <p className="muted" style={{ fontSize: 13 }}>Use your order reference on the deposit, then email the slip to sales@nextedge-access-solutions.com.</p>
    </div>
  </div>;
}
