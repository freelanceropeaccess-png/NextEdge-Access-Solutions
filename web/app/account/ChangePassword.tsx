"use client";
import { useState } from "react";
export default function ChangePassword() {
  const [open, setOpen] = useState(false); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    if (f.get("password") !== f.get("password2")) { setMsg("The new passwords don't match."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: f.get("current"), password: f.get("password") }) });
    setBusy(false);
    if (r.ok) { setMsg("Password changed ✓"); form.reset(); } else setMsg((await r.json().catch(() => ({}))).error || "Something went wrong. Please try again.");
  }
  return <div className="card" style={{ maxWidth: 520 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><h3 style={{ margin: 0 }}>Password</h3><button type="button" className="btn btn-ghost" onClick={() => setOpen(!open)}>{open ? "Close" : "Change password"}</button></div>
    {open && <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
      <label className="field">Current password<input name="current" type="password" autoComplete="current-password" /></label>
      <label className="field">New password<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
      <label className="field">Repeat new password<input name="password2" type="password" required minLength={8} autoComplete="new-password" /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      {msg && <span className={msg.endsWith("✓") ? "ok" : "err"}>{msg}</span>}
      <a href="/forgot-password" style={{ fontSize: 13 }}>Forgot your current password?</a>
    </form>}
  </div>;
}
