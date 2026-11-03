"use client";
import { useState } from "react";

/** Share buttons for one product. `path` like /store/p/abc. */
export default function ShareBar({ path, title, price, compact = false }: { path: string; title: string; price: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const url = (typeof window !== "undefined" ? window.location.origin : "https://www.nextedge-access-solutions.com") + path;
  const text = `${title} — ${price} at NEAS Online Store`;
  const u = encodeURIComponent(url), t = encodeURIComponent(text);
  const links: [string, string, string][] = [
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`, "#1877f2"],
    ["Messenger", `fb-messenger://share/?link=${u}`, "#0084ff"],
    ["WhatsApp", `https://wa.me/?text=${t}%20${u}`, "#16a34a"],
    ["Viber", `viber://forward?text=${t}%20${u}`, "#7360f2"],
    ["X", `https://twitter.com/intent/tweet?text=${t}&url=${u}`, "#0f172a"],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, "#0a66c2"],
    ["Email", `mailto:?subject=${encodeURIComponent(title + " — NEAS")}&body=${t}%0A%0A${u}`, "#64748b"],
  ];
  async function copy() {
    try { await navigator.clipboard.writeText(url); } catch { prompt("Copy this link:", url); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  async function native() { try { await navigator.share({ title, text, url }); } catch {} }
  if (compact) return <div className="share-wrap">
    <button type="button" className="share-main" aria-expanded={open} aria-haspopup="true" onClick={async () => { if (typeof navigator !== "undefined" && "share" in navigator && window.matchMedia("(pointer:coarse)").matches) { try { await navigator.share({ title, text, url }); return; } catch {} } setOpen((o) => !o); }}>⤴ Share</button>
    {open && <div className="share-pop" role="menu">
      {links.map(([n, href, c]) => <a key={n} role="menuitem" className="share-btn" style={{ background: c }} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => setOpen(false)}>{n}</a>)}
      <button type="button" role="menuitem" className="share-btn" style={{ background: "#334155" }} onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
    </div>}
  </div>;
  return <div className="share">
    <span className="share-lbl">Share</span>
    {typeof navigator !== "undefined" && "share" in navigator && <button type="button" className="share-btn" style={{ background: "#f97316" }} onClick={native}>Share…</button>}
    {links.map(([n, href, c]) => <a key={n} className="share-btn" style={{ background: c }} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" aria-label={`Share ${title} on ${n}`}>{n}</a>)}
    <button type="button" className="share-btn" style={{ background: "#334155" }} onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
  </div>;
}
