"use client";
import { useRef, useState } from "react";

export default function ImageCell({ id, name, initial }: { id: string; name: string; initial: string }) {
  const [img, setImg] = useState(initial); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  async function send(body: BodyInit, json: boolean) {
    setBusy(true); setErr("");
    const r = await fetch(`/api/admin/products/${id}/image`, { method: "POST", body, ...(json ? { headers: { "content-type": "application/json" } } : {}) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) setErr(d.error || "Failed"); else setImg(d.image);
  }
  function upload(f?: File | null) { if (!f) return; const fd = new FormData(); fd.append("file", f); send(fd, false); }
  function byUrl() { const u = prompt(`Image link for ${name} (https://…)`, img.startsWith("http") ? img : ""); if (u !== null) send(JSON.stringify({ url: u }), true); }
  return <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ width: 52, height: 52, borderRadius: 8, background: "#f1f5f9", overflow: "hidden", flex: "0 0 auto", display: "grid", placeItems: "center" }}>
      {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span className="muted" style={{ fontSize: 11 }}>No photo</span>}
    </div>
    <div style={{ display: "grid", gap: 4 }}>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }} disabled={busy} onClick={() => file.current?.click()}>{busy ? "…" : "Upload"}</button>
      <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }} disabled={busy} onClick={byUrl}>Link</button>
      {img && <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }} disabled={busy} onClick={() => send(JSON.stringify({ url: "" }), true)} aria-label={"Remove photo of " + name}>Remove</button>}
    </div>
    {err && <span className="err" style={{ fontSize: 12 }}>{err}</span>}
  </div>;
}
