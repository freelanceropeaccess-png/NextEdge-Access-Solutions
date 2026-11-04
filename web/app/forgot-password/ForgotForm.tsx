"use client";
import { useState } from "react";
export default function ForgotForm({ emailOn }: { emailOn: boolean }) {
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: new FormData(e.currentTarget).get("email") }) });
    setBusy(false);
    if (r.ok) setDone(true); else setErr((await r.json().catch(() => ({}))).error || "Something went wrong. Please try again.");
  }
  const help = <p className="muted" style={{ fontSize: 13 }}>No email? Message us on <a href="https://wa.me/639914265886?text=Hi%20NEAS%2C%20please%20help%20me%20reset%20my%20website%20password." target="_blank" rel="noopener">WhatsApp +63 991 426 5886</a> and we&apos;ll send you a reset link.</p>;
  if (done) return <div className="card"><h3 style={{ marginTop: 0 }}>Check your email</h3><p>If an account exists for that address, a reset link is on its way. It works for 1 hour. Check your Spam folder too.</p>{help}<a className="btn btn-ghost" href="/login">Back to log in</a></div>;
  return <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
    <label className="field">Email<input name="email" type="email" required autoComplete="email" /></label>
    {err && <span className="err">{err}</span>}
    <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
    {!emailOn && help}
    <a href="/login" style={{ fontSize: 13, textAlign: "center" }}>Back to log in</a>
  </form>;
}
