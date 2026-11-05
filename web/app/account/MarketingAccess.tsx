"use client";
import { useState } from "react";

/** ₱100/month subscription for a private Marketing Command Center workspace. Payment is checked and approved by a NEAS admin. */
export default function MarketingAccess({ status, until, renewing, fee }: { status: string | null; until: string | null; renewing: boolean; fee: number }) {
  const [ref, setRef] = useState(""), [st, setSt] = useState(status), [sent, setSent] = useState(renewing), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const active = st === "approved" && !!until && +new Date(until) > Date.now();
  const left = until ? Math.ceil((+new Date(until) - Date.now()) / 86400000) : 0;
  async function send() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/account/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setSent(true); if (!active) setSt("requested"); setRef(""); } else setMsg(j.error || "Something went wrong.");
    setBusy(false);
  }
  const form = <>
    <ol style={{ lineHeight: 1.8 }}><li>Pay <b>₱{fee}</b> for one month to the bank account shown below.</li><li>Enter the payment reference number here and send.</li><li>A NEAS admin confirms it and adds one month of access.</li></ol>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Payment reference number" style={{ flex: "1 1 220px" }} /><button className="btn" type="button" disabled={busy} onClick={send}>{busy ? "Sending…" : active ? "Renew 1 month" : "Request access"}</button></div>
    {msg && <p style={{ color: "#b91c1c" }}>{msg}</p>}
  </>;
  return <div className="card">
    <h2 style={{ marginTop: 0 }}>Marketing Command Center · ₱{fee}/month</h2>
    <p className="muted">Your own private workspace: connect your Facebook Pages and LinkedIn, write posts with AI, schedule and auto-publish (up to 10 posts per day), plus inbox and analytics.</p>
    {active ? <>
        <p><a className="btn" href="/admin/marketing">Open Marketing Command Center →</a></p>
        <p className="muted">Active until <b>{new Date(until!).toLocaleDateString("en-PH", { dateStyle: "long" })}</b> ({left} day{left === 1 ? "" : "s"} left).</p>
        {sent ? <p><b>Renewal payment received.</b> We'll confirm it and add one month.</p> : left <= 7 && form}
      </>
      : st === "requested" || sent ? <p><b>Request received.</b> We'll check your ₱{fee} payment and switch on your access, usually within one business day.</p>
      : <>
        {st === "approved" && <p style={{ color: "#b45309" }}>Your access ended on {until ? new Date(until).toLocaleDateString("en-PH", { dateStyle: "long" }) : "—"}. Pay ₱{fee} to renew; your posts and connected accounts are kept.</p>}
        {st === "rejected" && <p style={{ color: "#b91c1c" }}>Your last request couldn't be confirmed. Check the reference and send it again, or email sales@nextedge-access-solutions.com.</p>}
        {form}
      </>}
  </div>;
}
