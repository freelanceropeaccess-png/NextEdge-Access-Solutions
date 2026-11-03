"use client";
import "./store.css";
import { useEffect, useMemo, useState } from "react";
import ShareBar from "@/components/ShareBar";

type P = { id: string; category: string; code: string; name: string; price: number; image?: string };
type Bank = { accountName: string; accountNumber: string; swift: string; bank: string };
const peso = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");

function BankBox({ bank }: { bank: Bank }) {
  const [copied, setCopied] = useState(false);
  return <div className="bank"><h4>Payment Mode · Bank Transfer</h4><p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Use your order reference as the transfer note. Online card payment will be enabled after the payment gateway is connected.</p><table className="t"><tbody>
    <tr><th>Account Name</th><td>{bank.accountName}</td></tr>
    <tr><th>Account Number</th><td><b>{bank.accountNumber}</b> <button type="button" className="copy" onClick={() => navigator.clipboard?.writeText(bank.accountNumber).then(() => setCopied(true))}>{copied ? "Copied ✓" : "Copy"}</button></td></tr>
    <tr><th>SWIFT Code</th><td>{bank.swift}</td></tr><tr><th>Bank</th><td>{bank.bank}</td></tr></tbody></table></div>;
}

export default function StoreClient({ products, user, bank }: { products: P[]; user: { name: string; phone: string | null; email: string } | null; bank: Bank }) {
  const [cat, setCat] = useState("All"); const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({}); const [qty, setQty] = useState<Record<string, number>>({});
  const [wish, setWish] = useState<Record<string, 1>>({});
  const [modal, setModal] = useState<{ kind: "spec"; p: P } | { kind: "checkout" } | { kind: "done"; ref: string; total: number } | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => { const id = new URLSearchParams(location.search).get("p"); const p = id && products.find((x) => x.id === id); if (p) setModal({ kind: "spec", p }); }, [products]);
  useEffect(() => { try { setCart(JSON.parse(localStorage.getItem("neasCart") || "{}")); setWish(JSON.parse(localStorage.getItem("neasWish") || "{}")); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("neasCart", JSON.stringify(cart)); } catch {} }, [cart]);
  useEffect(() => { try { localStorage.setItem("neasWish", JSON.stringify(wish)); } catch {} }, [wish]);
  useEffect(() => { document.body.style.overflow = modal ? "hidden" : ""; const k = (e: KeyboardEvent) => e.key === "Escape" && setModal(null); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [modal]);

  const cats = ["All", "♥ Wishlist", ...Array.from(new Set(products.map((p) => p.category)))];
  const list = products.filter((p) => (cat === "All" || (cat === "♥ Wishlist" ? wish[p.id] : p.category === cat)) && (!q || (p.name + " " + p.code).toLowerCase().includes(q.toLowerCase())));
  const lines = Object.entries(cart).filter(([id]) => byId.has(id)).map(([id, n]) => ({ p: byId.get(id)!, n }));
  const count = lines.reduce((s, l) => s + l.n, 0), total = lines.reduce((s, l) => s + l.n * l.p.price, 0);
  const add = (id: string, n: number) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + n }));
  const setLine = (id: string, n: number) => setCart((c) => { const x = { ...c }; if (n <= 0) delete x[id]; else x[id] = n; return x; });
  const checkout = (persist?: Record<string, number>) => { if (!user) { try { localStorage.setItem("neasCart", JSON.stringify(persist ?? cart)); } catch {} location.href = "/login?next=/store"; return; } setErr(""); setModal({ kind: "checkout" }); };

  async function placeOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(""); setBusy(true);
    const form = new FormData(e.currentTarget);
    form.append("items", JSON.stringify(lines.map((l) => ({ id: l.p.id, quantity: l.n }))));
    const res = await fetch("/api/orders", { method: "POST", body: form });
    const data = await res.json().catch(() => ({})); setBusy(false);
    if (res.status === 401) { location.href = "/login?next=/store"; return; }
    if (!res.ok) { setErr(data.error || "Order could not be placed."); return; }
    setCart({}); setModal({ kind: "done", ref: data.order.reference, total: Number(data.order.total) });
  }

  return <>
    <div className="sbar">
      <input className="input" type="search" placeholder="Search item or code…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
      <div className="cats">{cats.map((c) => <button key={c} type="button" className={c === cat ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div>
    </div>
    <div className="grid">
      {!list.length && <p className="muted">{cat === "♥ Wishlist" ? "Your wishlist is empty — tap ♥ on any item." : "No items match."}</p>}
      {list.map((p) => { const n = qty[p.id] || 1; return <article key={p.id} className="sp">
        <div className="sp-top"><span className="eyebrow" style={{ fontSize: 10 }}>{p.category}</span><button type="button" className={"wish" + (wish[p.id] ? " on" : "")} aria-label="Wishlist" aria-pressed={!!wish[p.id]} onClick={() => setWish((w) => { const x = { ...w }; if (x[p.id]) delete x[p.id]; else x[p.id] = 1; return x; })}>♥</button></div>
        <button type="button" className="sp-img" onClick={() => setModal({ kind: "spec", p })} aria-label={"View " + p.name}>{p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : <span>🛡️</span>}</button>
        <button type="button" className="sp-name" onClick={() => setModal({ kind: "spec", p })}>{p.name}</button>
        <div className="sp-code">{p.code && "Code: " + p.code}</div>
        <div className="sp-price">{peso(p.price)}</div>
        <div className="qty"><button type="button" className="minus" aria-label="Less" onClick={() => setQty((x) => ({ ...x, [p.id]: Math.max(1, n - 1) }))}>−</button><span>{n}</span><button type="button" className="plus" aria-label="More" onClick={() => setQty((x) => ({ ...x, [p.id]: n + 1 }))}>+</button>{cart[p.id] ? <em>{cart[p.id]} in cart</em> : null}</div>
        <div className="btns"><button type="button" className="buy" onClick={() => { setCart({ [p.id]: n }); setQty((x) => ({ ...x, [p.id]: 1 })); checkout({ [p.id]: n }); }}>BUY NOW</button><button type="button" className="add" onClick={() => { add(p.id, n); setQty((x) => ({ ...x, [p.id]: 1 })); }}>ADD TO CART</button></div>
      </article>; })}
    </div>
    {count > 0 && <div className="cartbar"><div>🛒 <b>{count}</b> item(s) · <b>{peso(total)}</b></div><div style={{ display: "flex", gap: 8 }}><button type="button" className="ghost" onClick={() => setCart({})}>Clear</button><button type="button" className="go" onClick={() => checkout()}>{user ? "Checkout" : "Log in to checkout"}</button></div></div>}

    {modal && <div className="ov" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setModal(null)}><div className="mbox">
      <button type="button" className="x" aria-label="Close" onClick={() => setModal(null)}>×</button>
      {modal.kind === "spec" && <>
        {modal.p.image && <img src={modal.p.image} alt={modal.p.name} style={{ width: "100%", maxHeight: 320, objectFit: "contain", background: "#f8fafc", borderRadius: 12, marginBottom: 10 }} />}<div className="eyebrow">{modal.p.category}</div><h2>{modal.p.name}</h2><div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}><div className="big">{peso(modal.p.price)}</div><ShareBar compact path={`/store/p/${modal.p.id}`} title={modal.p.name} price={peso(modal.p.price)} /></div>
        <h4>Product Specification</h4>
        <table className="t"><tbody><tr><th>Item Code</th><td>{modal.p.code || "—"}</td></tr><tr><th>Category</th><td>{modal.p.category}</td></tr><tr><th>Description</th><td>{modal.p.name}</td></tr><tr><th>Unit Price</th><td>{peso(modal.p.price)} (PHP)</td></tr><tr><th>Availability</th><td>Subject to stock confirmation</td></tr></tbody></table>
        <a href={`/store/p/${modal.p.id}`} className="muted" style={{ fontSize: 12 }}>Open product page ↗</a>
        <BankBox bank={bank} />
        <div className="btns" style={{ marginTop: 16 }}><button type="button" className="buy" onClick={() => { setCart({ [modal.p.id]: 1 }); checkout({ [modal.p.id]: 1 }); }}>BUY NOW</button><button type="button" className="add" onClick={() => { add(modal.p.id, 1); setModal(null); }}>ADD TO CART</button></div>
      </>}
      {modal.kind === "checkout" && <>
        <h2>Checkout</h2>
        <table className="t"><thead><tr><th>Item</th><th>Qty</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead><tbody>
          {lines.map((l) => <tr key={l.p.id}><td>{l.p.name}<small className="sp-code" style={{ display: "block" }}>{l.p.code}</small></td><td><input className="input" style={{ width: 64, padding: 6 }} type="number" min={0} value={l.n} onChange={(e) => setLine(l.p.id, Math.floor(Number(e.target.value) || 0))} aria-label={"Quantity of " + l.p.name} /></td><td style={{ textAlign: "right" }}>{peso(l.n * l.p.price)}</td></tr>)}
          <tr><td><b>Total</b></td><td><b>{count}</b></td><td style={{ textAlign: "right" }}><b>{peso(total)}</b></td></tr></tbody></table>
        <BankBox bank={bank} />
        <form onSubmit={placeOrder} style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <label className="field">Payment method<select name="paymentMethod" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="card" disabled>Online card payment (coming soon)</option></select></label>
          <label className="field">Delivery name / Company<input name="deliveryName" required defaultValue={user?.name} maxLength={160} /></label>
          <label className="field">Mobile number<input name="deliveryPhone" required defaultValue={user?.phone ?? ""} maxLength={40} /></label>
          <label className="field">Email<input name="deliveryEmail" type="email" required defaultValue={user?.email ?? ""} maxLength={320} /></label>
          <label className="field">Delivery address<textarea name="deliveryAddress" required rows={2} maxLength={600} /></label>
          <label className="field">Upload payment slip <span className="muted">(photo or PDF, max 5 MB)</span><input name="paymentSlip" type="file" accept="image/*,.pdf,application/pdf" required /></label>
          <label className="field">Notes (optional)<input name="notes" maxLength={1000} /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn btn-primary" disabled={busy || !count}>{busy ? "Placing order…" : "Place order · " + peso(total)}</button>
        </form>
      </>}
      {modal.kind === "done" && <>
        <h2>✓ Order placed</h2>
        <p>Your order reference is <b>{modal.ref}</b>. Please transfer <b>{peso(modal.total)}</b> and use the reference on your deposit.</p>
        <BankBox bank={bank} />
        <ol className="muted" style={{ fontSize: 14 }}><li>Pay by bank transfer using reference <b>{modal.ref}</b>.</li><li>Email your deposit slip to sales@nextedge-access-solutions.com or Viber +63 991 426 5886.</li><li>We confirm payment, stock and delivery. Track it under <a href="/account">My Account</a>.</li></ol>
      </>}
    </div></div>}
  </>;
}
