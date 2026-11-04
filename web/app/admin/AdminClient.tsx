"use client";
import { useState } from "react";
import ImageCell from "./ImageCell";

type Prod = { id: string; category: string; code: string; name: string; dealer_price: number; price_override: number | null; active: boolean; price: number; image: string; description: string; features: string; specs_url: string };
type Order = { id: number; reference: string; status: string; total: number; created_at: string; email: string; customer: string; delivery: string; notes: string; items: { name: string; code: string; quantity: number; unit_price: number }[] };
type Cust = { id: number; name: string; email: string; phone: string; created_at: string; orders: number };
const peso = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");
const STATUSES = [["awaiting_payment", "Awaiting payment"], ["paid", "Paid"], ["processing", "Processing"], ["shipped", "Shipped"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
const sell = (d: number, o: number | null, m: number) => (o != null ? o : Math.ceil((d * (1 + m / 100)) / 5) * 5);

async function api(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Save failed");
}

export default function AdminClient(props: { markup: number; categoryMarkup: Record<string, number>; products: Prod[]; orders: Order[]; customers: Cust[]; view?: "orders" | "products" | "customers" }) {
  const [ownTab, setTab] = useState<"orders" | "products" | "customers">("orders");
  const tab = props.view ?? ownTab;
  const [markup, setMarkup] = useState(props.markup);
  const [products, setProducts] = useState(props.products);
  const [orders, setOrders] = useState(props.orders);
  const [msg, setMsg] = useState(""); const [q, setQ] = useState("");
  const [catMk, setCatMk] = useState<Record<string, number>>(props.categoryMarkup);
  const [bulkCat, setBulkCat] = useState(""); const [bulkPct, setBulkPct] = useState("");
  const cats = Array.from(new Set(products.map((p) => p.category)));
  const mkFor = (c: string) => catMk[c] ?? markup;
  async function bulk(body: Record<string, unknown>, done: string) { try { await api("/api/admin/pricing", "POST", body); flash(done); setTimeout(() => location.reload(), 600); } catch (e) { flash((e as Error).message); } }
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };
  const pending = orders.filter((o) => o.status === "awaiting_payment").length;

  async function saveMarkup() { try { await api("/api/admin/settings", "PUT", { markupPercent: markup }); flash("Markup saved ✓"); } catch (e) { flash((e as Error).message); } }
  async function saveCatMarkup(c: string, raw: string) { const v = raw.trim() === "" ? null : Number(raw); try { await api("/api/admin/pricing", "POST", { action: "categoryMarkup", category: c, markupPercent: v }); setCatMk((m) => { const x = { ...m }; if (v === null) delete x[c]; else x[c] = v; return x; }); flash(`${c} markup saved ✓`); } catch (e) { flash((e as Error).message); } }
  async function savePrice(p: Prod, raw: string) {
    const v = raw.trim() === "" ? null : Number(raw.replace(/[₱,\s]/g, ""));
    if (v !== null && !Number.isFinite(v)) return flash("Not a number");
    try { await api(`/api/admin/products/${p.id}`, "PATCH", { priceOverride: v }); setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, price_override: v } : x))); flash("Price saved ✓"); } catch (e) { flash((e as Error).message); }
  }
  async function toggle(p: Prod) { try { await api(`/api/admin/products/${p.id}`, "PATCH", { active: !p.active }); setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x))); } catch (e) { flash((e as Error).message); } }
  async function setStatus(o: Order, status: string) { try { await api(`/api/admin/orders/${o.id}`, "PATCH", { status }); setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status } : x))); flash(`${o.reference} → ${status.replace("_", " ")}`); } catch (e) { flash((e as Error).message); } }

  return <div className={props.view ? "" : "wrap"} style={{ padding: props.view ? 0 : "34px 20px" }}>
    {!props.view && <><div className="eyebrow">Admin control panel</div><h1>NEAS Store Admin</h1></>}
    <div style={{ display: props.view ? "none" : "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
      {([["orders", `Orders (${pending} awaiting payment)`], ["products", "Products & prices"], ["customers", `Customers (${props.customers.length})`]] as const).map(([k, l]) => <button key={k} type="button" className={"btn " + (tab === k ? "btn-primary" : "btn-ghost")} onClick={() => setTab(k)}>{l}</button>)}
      {msg && <span className="ok" role="status" style={{ alignSelf: "center" }}>{msg}</span>}
    </div>
    {props.view && msg && <div className="admin-toast" role="status">{msg}</div>}

    {tab === "orders" && <div className="card" style={{ overflowX: "auto" }}>
      {!orders.length ? <p className="muted">No orders yet.</p> : <table className="t"><thead><tr><th>Reference</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>
        {orders.map((o) => <tr key={o.id}><td><b>{o.reference}</b></td><td>{new Date(o.created_at).toLocaleString("en-PH")}</td>
          <td style={{ fontSize: 13 }}><b>{o.customer}</b><br />{o.email}<br /><span className="muted">{o.delivery}</span>{o.notes && <><br /><i>{o.notes}</i></>}</td>
          <td style={{ fontSize: 13 }}>{o.items.map((i, k) => <div key={k}>{i.quantity} × {i.name} @ {peso(i.unit_price)}</div>)}</td>
          <td><b>{peso(o.total)}</b></td>
          <td><select className="input" value={o.status} onChange={(e) => setStatus(o, e.target.value)} aria-label={"Status of " + o.reference}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td></tr>)}
      </tbody></table>}
    </div>}

    {tab === "products" && <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 12 }}>
        <b>Markup on dealer price</b>
        <input className="input" type="number" min={0} max={500} value={markup} onChange={(e) => setMarkup(Number(e.target.value))} style={{ width: 90 }} aria-label="Markup percent" /> %
        <button type="button" className="btn btn-primary" onClick={saveMarkup}>Save markup</button>
        <span className="muted" style={{ fontSize: 13 }}>Applies to every item without its own price. Prices round up to the nearest ₱5.</span>
      </div>
      <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <b>Markup for ALL products</b>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => { if (confirm(`Set ${markup}% on every product and remove all category markups and custom prices?`)) bulk({ action: "allMarkup", markupPercent: markup, applyToAll: true }, "All products now use " + markup + "% ✓"); }}>Apply {markup}% to every product (reset custom prices)</button>
          <button type="button" className="btn btn-ghost" onClick={() => { if (confirm("Remove every custom price?")) bulk({ action: "clearOverrides" }, "Custom prices cleared ✓"); }}>Clear all custom prices</button>
          <button type="button" className="btn btn-ghost" onClick={() => bulk({ action: "showAll", active: true }, "All products shown ✓")}>Show all products</button>
        </div>
        <b style={{ display: "block", marginTop: 14 }}>Markup by category</b>
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>Leave blank to use the main markup ({markup}%).</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 8 }}>
          {cats.map((c) => <label key={c} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13, background: "#f8fafc", borderRadius: 8, padding: "6px 10px" }}>{c}<span><input className="input" style={{ width: 70, padding: 6 }} type="number" min={0} max={500} placeholder={String(markup)} defaultValue={catMk[c] ?? ""} onBlur={(e) => { if (e.target.value !== String(catMk[c] ?? "")) saveCatMarkup(c, e.target.value); }} aria-label={"Markup for " + c} /> %</span></label>)}
        </div>
        <b style={{ display: "block", marginTop: 14 }}>Update dealer prices (supplier price change)</b>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <select className="input" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} aria-label="Category to adjust"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <input className="input" style={{ width: 90 }} type="number" placeholder="e.g. 5" value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} aria-label="Percent change" /> %
          <button type="button" className="btn btn-primary" disabled={!bulkPct} onClick={() => { if (confirm(`Change dealer prices of ${bulkCat || "ALL categories"} by ${bulkPct}%?`)) bulk({ action: "adjustAll", percent: Number(bulkPct), category: bulkCat || undefined }, "Dealer prices updated ✓"); }}>Apply change</button>
          <span className="muted" style={{ fontSize: 12 }}>Use a negative number to lower prices.</span>
        </div>
      </div>
      <input className="input" placeholder="Filter products…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
      <table className="t"><thead><tr><th>Photo</th><th>Item</th><th>Details &amp; specs</th><th>Dealer</th><th>Selling price</th><th>Own price (override)</th><th>Shown</th></tr></thead><tbody>
        {products.filter((p) => !q || (p.name + p.code + p.category).toLowerCase().includes(q.toLowerCase())).map((p) => <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
          <td><ImageCell id={p.id} name={p.name} initial={p.image} /></td>
          <td><b>{p.name}</b><br /><span className="muted" style={{ fontSize: 12 }}>{p.category}{p.code && " · " + p.code}</span></td>
          <td style={{ minWidth: 300 }}><DetailsEditor p={p} /></td>
          <td>{peso(p.dealer_price)}</td>
          <td><b>{peso(sell(p.dealer_price, p.price_override, mkFor(p.category)))}</b>{p.price_override != null && <span className="badge" style={{ marginLeft: 6 }}>custom</span>}</td>
          <td><input className="input" style={{ width: 120 }} placeholder="auto" defaultValue={p.price_override ?? ""} onBlur={(e) => { const v = e.target.value; if (v !== String(p.price_override ?? "")) savePrice(p, v); }} aria-label={"Own price for " + p.name} /></td>
          <td><input type="checkbox" checked={p.active} onChange={() => toggle(p)} aria-label={"Show " + p.name + " in store"} /></td></tr>)}
      </tbody></table>
    </div>}

    {tab === "customers" && <div className="card" style={{ overflowX: "auto" }}>
      {!props.customers.length ? <p className="muted">No customer accounts yet.</p> : <table className="t"><thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Joined</th><th>Orders</th></tr></thead><tbody>
        {props.customers.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.email}</td><td>{c.phone}</td><td>{new Date(c.created_at).toLocaleDateString("en-PH")}</td><td>{c.orders}</td></tr>)}
      </tbody></table>}
    </div>}
  </div>;
}

function DetailsEditor({ p }: { p: Prod }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ description: p.description, features: p.features, specsUrl: p.specs_url });
  const [msg, setMsg] = useState("");
  async function save() {
    setMsg("Saving…");
    const r = await fetch(`/api/admin/products/${p.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
    setMsg(r.ok ? "Saved ✓" : ((await r.json().catch(() => ({}))).error || "Save failed"));
  }
  const filled = !!(d.description || d.features || d.specsUrl);
  return <div>
    <button type="button" className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setOpen(!open)}>{open ? "Close details" : (filled ? "✎ Edit details" : "+ Description & specs")}</button>
    {!open && filled && <div className="muted" style={{ fontSize: 12, marginTop: 4, maxWidth: 300 }}>{d.description && <div>📝 {d.description.slice(0, 70)}{d.description.length > 70 ? "…" : ""}</div>}{d.features && <div>✔ {d.features.split("\n").filter((l) => l.trim()).length} technical features</div>}{d.specsUrl && <div>📄 Specs link set</div>}</div>}
    {open && <div style={{ display: "grid", gap: 6, marginTop: 6, minWidth: 280 }}>
      <label className="field" style={{ fontSize: 12 }}>Description<textarea rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder={p.name} /></label>
      <label className="field" style={{ fontSize: 12 }}>Technical features (one per line)<textarea rows={5} value={d.features} onChange={(e) => setD({ ...d, features: e.target.value })} placeholder={"EN 361 / EN 813 certified\nWeight: 1.9 kg\nSizes: S-M"} /></label>
      <label className="field" style={{ fontSize: 12 }}>Technical specs link (PDF / datasheet)<input type="url" value={d.specsUrl} onChange={(e) => setD({ ...d, specsUrl: e.target.value })} placeholder="https://…" /></label>
      <div><button type="button" className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={save}>Save details</button> <span className="muted" style={{ fontSize: 12 }}>{msg}</span></div>
    </div>}
  </div>;
}
