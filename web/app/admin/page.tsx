import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql, listProducts, getMarkup } from "@/lib/db";
import AdminClient from "./AdminClient";
import SettingsPanel from "./SettingsPanel";
import SheetSync from "./SheetSync";
import { getSetting, getCategoryMarkup, DEFAULT_SEO, DEFAULT_SOCIAL, DEFAULT_BUSINESS, type Seo, type Social, type Business } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Panel — NEAS" };

export default async function Admin() {
  const user = await getUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") return <div className="wrap" style={{ padding: 50 }}><h1>Admins only</h1><p className="muted">Your account doesn't have admin access. <a href="/admin/login">Log in with an admin account</a>.</p></div>;
  const [products, markup, orders, items, customers, catMarkup, seo, social, business, sheetCfg] = await Promise.all([
    listProducts(true), getMarkup(),
    sql`select o.*, u.email, u.name as customer_name from orders o join users u on u.id = o.user_id order by o.created_at desc limit 500`,
    sql`select order_id, name, code, quantity, unit_price from order_items`,
    sql`select u.id, u.name, u.email, u.phone, u.created_at, count(o.id)::int as orders from users u left join orders o on o.user_id = u.id where u.role = 'customer' group by u.id order by u.created_at desc`,
    getCategoryMarkup(), getSetting<Seo>("seo", DEFAULT_SEO), getSetting<Social>("social", DEFAULT_SOCIAL), getSetting<Business>("business", DEFAULT_BUSINESS),
    getSetting("sheet", { url: "https://docs.google.com/spreadsheets/d/1fl4TGP5Jl-yvVrN2hheb7DMzLVPVKbpfRQEPgC30Vik/edit?gid=1469242798#gid=1469242798", priceSource: "markup" as "markup" | "sheet", hideMissing: true, lastSync: "", lastResult: "" }),
  ]);
  return <>
  <div className="wrap" style={{ padding: "18px 20px 0" }}><a href="/admin/marketing" className="btn" style={{ background: "linear-gradient(135deg,#071D29,#172235)", color: "#EBC07E", border: "1px solid #CA9332", display: "inline-flex", gap: 8 }}>✦ Marketing Command Center →</a></div>
  <AdminClient
    markup={markup}
    categoryMarkup={catMarkup}
    products={products}
    orders={orders.map((o) => ({ id: o.id, reference: o.reference, status: o.status, total: Number(o.total), created_at: String(o.created_at), email: o.email, customer: o.customer_name, delivery: `${o.delivery_name} · ${o.delivery_phone} · ${o.delivery_address}`, notes: o.notes ?? "", items: items.filter((i) => i.order_id === o.id).map((i) => ({ name: i.name, code: i.code, quantity: i.quantity, unit_price: Number(i.unit_price) })) }))}
    customers={customers.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone ?? "", created_at: String(c.created_at), orders: c.orders }))}
  />
  <SheetSync initial={sheetCfg} />
  <SettingsPanel seo={seo} social={social} business={business} />
  </>;
}
