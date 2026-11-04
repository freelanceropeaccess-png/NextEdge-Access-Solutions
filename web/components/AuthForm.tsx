"use client";
import { useState } from "react";

export default function AuthForm({ portal, next, social = { google: false, facebook: false }, initialError = "" }: { portal: "customer" | "admin"; next: string; social?: { google: boolean; facebook: boolean }; initialError?: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [err, setErr] = useState(initialError); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(""); setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, portal }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Something went wrong. Please try again."); return; }
    location.href = data.role === "admin" && portal === "admin" ? "/admin" : next;
  }
  return (
    <div className="card" style={{ maxWidth: 440, margin: "0 auto" }}>
      {portal === "customer" && <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["login", "signup"] as const).map((m) => <button key={m} type="button" onClick={() => { setMode(m); setErr(""); }} className={"btn " + (mode === m ? "btn-primary" : "btn-ghost")} style={{ flex: 1 }}>{m === "login" ? "Log in" : "Create account"}</button>)}
      </div>}
      {portal === "customer" && (social.google || social.facebook) && <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        {social.google && <a className="sso sso-g" href={`/api/auth/oauth/google?next=${encodeURIComponent(next)}`}><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</a>}
        {social.facebook && <a className="sso sso-f" href={`/api/auth/oauth/facebook?next=${encodeURIComponent(next)}`}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>Continue with Facebook</a>}
        <div className="sso-or"><span>or use email</span></div>
      </div>}
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        {mode === "signup" && <>
          <label className="field">Full name / Company<input name="name" required maxLength={160} autoComplete="name" /></label>
          <label className="field">Mobile number<input name="phone" maxLength={40} autoComplete="tel" /></label>
        </>}
        <label className="field">Email<input name="email" type="email" required autoComplete="email" /></label>
        <label className="field">Password<input name="password" type="password" required minLength={mode === "signup" ? 8 : 1} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>
        {mode === "signup" && <span className="muted" style={{ fontSize: 12 }}>At least 8 characters.</span>}
        {mode === "login" && <a href="/forgot-password" style={{ fontSize: 13, justifySelf: "end", marginTop: -4 }}>Forgot password?</a>}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? (portal === "admin" ? "Log in to Admin" : "Log in") : "Create account"}</button>
      </form>
    </div>
  );
}
