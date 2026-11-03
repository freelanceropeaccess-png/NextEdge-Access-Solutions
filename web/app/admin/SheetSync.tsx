"use client";
import { useState } from "react";

type Cfg = { url: string; priceSource: "markup" | "sheet"; hideMissing: boolean; lastSync: string; lastResult: string };
type Row = { code: string; name: string; category: string; dealer: number; sell: number | null };
const peso = (n: number | null) => (n == null ? "—" : "₱" + Math.round(n).toLocaleString("en-PH"));

export default function SheetSync({ initial }: { initial: Cfg }) {
  const [cfg, setCfg] = useState(initial);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ rows: Row[]; total: number } | null>(null);
  const [csv, setCsv] = useState("");

  async function call(action: string) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/sheet-sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, url: cfg.url, priceSource: cfg.priceSource, hideMissing: cfg.hideMissing, csv: csv || undefined }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg("⚠ " + (d.error || "Failed")); return; }
    if (action === "preview") { setPreview({ rows: d.preview, total: d.total }); setMsg(`Found ${d.total} products. Check the preview, then press Update store.`); }
    else if (action === "save") setMsg("Settings saved ✓");
    else { setCfg(d.cfg); setPreview(null); setMsg(`✓ Store updated — ${d.cfg.lastResult}. Reloading…`); setTimeout(() => location.reload(), 1200); }
  }

  return <div className="wrap" style={{ padding: "0 20px 30px" }}>
    <div className="eyebrow" style={{ marginTop: 10 }}>Product catalog</div>
    <h2 style={{ margin: "4px 0 12px" }}>Google Sheet price updater</h2>
    <div className="card" style={{ maxWidth: 900 }}>
      <label className="field">Google Sheet link (the KH Trading tab with Item Code, Item Description, Dealer Price)
        <input className="input" type="url" value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…" />
        <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>In Google Sheets: Share → General access → <b>Anyone with the link · Viewer</b>. Copy the link while the right tab is open.</span>
      </label>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "12px 0", fontSize: 14 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={cfg.priceSource === "markup"} onChange={() => setCfg({ ...cfg, priceSource: "markup" })} /> Store price = Dealer price + my markup %</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={cfg.priceSource === "sheet"} onChange={() => setCfg({ ...cfg, priceSource: "sheet" })} /> Store price = sheet&apos;s “Selling Price (VAT)” column</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={cfg.hideMissing} onChange={(e) => setCfg({ ...cfg, hideMissing: e.target.checked })} /> Hide store items that are no longer in the sheet</label>
      </div>
      <details style={{ marginBottom: 12 }}><summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Can&apos;t share the sheet publicly? Paste it instead</summary>
        <p className="muted" style={{ fontSize: 12 }}>In Google Sheets: File → Download → CSV, open it, copy everything and paste here.</p>
        <textarea className="input" rows={4} style={{ width: "100%" }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="No.,Item Code,Item Description,Image,QTY,Dealer Price,…" />
      </details>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => call("preview")}>{busy ? "Working…" : "1 · Preview from sheet"}</button>
        <button type="button" className="btn btn-primary" disabled={busy || !preview} onClick={() => call("sync")}>2 · Update store prices</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => call("save")}>Save settings</button>
      </div>
      {msg && <p className={msg.startsWith("⚠") ? "err" : "ok"} role="status" style={{ marginTop: 10 }}>{msg}</p>}
      {cfg.lastSync && <p className="muted" style={{ fontSize: 12 }}>Last update: {new Date(cfg.lastSync).toLocaleString("en-PH")} — {cfg.lastResult}</p>}
      {preview && <div style={{ overflowX: "auto", marginTop: 10 }}><table className="t"><thead><tr><th>Code</th><th>Item</th><th>Category</th><th>Dealer</th><th>Sheet sell (VAT)</th></tr></thead><tbody>
        {preview.rows.map((r, i) => <tr key={i}><td>{r.code}</td><td>{r.name}</td><td>{r.category}</td><td>{peso(r.dealer)}</td><td>{peso(r.sell)}</td></tr>)}
        <tr><td colSpan={5} className="muted">…showing first {preview.rows.length} of {preview.total}</td></tr></tbody></table></div>}
    </div>
  </div>;
}
