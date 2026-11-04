"use client";
import { useState } from "react";
export default function ResetForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [role, setRole] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr("");
    const f = new FormData(e.currentTarget); const p = String(f.get("password")), p2 = String(f.get("password2"));
    if (p !== p2) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    const r = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: p }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok) setRole(j.role || "customer"); else setErr(j.error || "Something went wrong. Please try again.");
  }
  if (role) return <div className="card"><h3 style={{ marginTop: 0 }}>Password changed ✓</h3><p>You can now log in with your new password.</p><a className="btn btn-primary" href={role === "admin" ? "/admin/login" : "/login"}>Log in</a></div>;
  return <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
    <label className="field">New password<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
    <label className="field">Repeat new password<input name="password2" type="password" required minLength={8} autoComplete="new-password" /></label>
    <span className="muted" style={{ fontSize: 12 }}>At least 8 characters.</span>
    {err && <span className="err">{err} {err.includes("Request") && <a href="/forgot-password">Request a new link</a>}</span>}
    <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
  </form>;
}
