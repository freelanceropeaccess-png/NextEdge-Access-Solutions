"use client";
import { useEffect, useState } from "react";

export type AdminSection = "orders" | "products" | "customers" | "sheet" | "website";
type Item = { id: AdminSection; label: string; icon: string; badge?: number; hint: string };

export default function AdminShell({ counts, sections, adminName }: { counts: { awaiting: number; customers: number; products: number }; adminName: string; sections: Record<AdminSection, React.ReactNode> }) {
  const [sec, setSec] = useState<AdminSection>("orders");
  useEffect(() => {
    try { const s = new URLSearchParams(location.search).get("s") as AdminSection | null; if (s && ["orders", "products", "customers", "sheet", "website"].includes(s)) setSec(s); } catch {}
  }, []);
  const go = (s: AdminSection) => { setSec(s); try { history.replaceState(null, "", "?s=" + s); } catch {} window.scrollTo({ top: 0 }); };
  const groups: { title: string; items: Item[] }[] = [
    { title: "Store", items: [
      { id: "orders", label: "Orders", icon: "🧾", badge: counts.awaiting, hint: "Payments, status, delivery" },
      { id: "products", label: "Products & prices", icon: "🏷️", hint: `${counts.products} items · markup · photos · specs` },
      { id: "customers", label: "Customers", icon: "👤", hint: `${counts.customers} accounts` },
      { id: "sheet", label: "Google Sheet updater", icon: "📄", hint: "Sync prices & photos" },
    ] },
    { title: "Website", items: [
      { id: "website", label: "SEO, Google & Social", icon: "🌐", hint: "Logo, SEO, Business Profile, social links" },
    ] },
  ];
  const all = groups.flatMap((g) => g.items);
  const cur = all.find((i) => i.id === sec)!;
  return <div className="adm">
    <aside className="adm-side" aria-label="Admin menu">
      <div className="adm-who"><span className="adm-av">{adminName.slice(0, 1).toUpperCase()}</span><div><b>Admin panel</b><small>{adminName}</small></div></div>
      {groups.map((g) => <div key={g.title} className="adm-group"><div className="adm-gt">{g.title}</div>
        {g.items.map((i) => <button key={i.id} type="button" className={"adm-item" + (sec === i.id ? " on" : "")} onClick={() => go(i.id)} aria-current={sec === i.id ? "page" : undefined}>
          <span className="adm-ic" aria-hidden>{i.icon}</span><span className="adm-lb">{i.label}</span>{!!i.badge && <span className="adm-badge">{i.badge}</span>}
        </button>)}</div>)}
      <div className="adm-group"><div className="adm-gt">Marketing</div>
        <a className="adm-item mk" href="/admin/marketing"><span className="adm-ic" aria-hidden>✦</span><span className="adm-lb">Marketing Command Center</span></a>
        <a className="adm-item" href="/links" target="_blank" rel="noopener"><span className="adm-ic" aria-hidden>🔗</span><span className="adm-lb">Link-in-Bio page ↗</span></a>
      </div>
      <div className="adm-group"><div className="adm-gt">Quick links</div>
        <a className="adm-item" href="/" target="_blank" rel="noopener"><span className="adm-ic" aria-hidden>🏠</span><span className="adm-lb">View website ↗</span></a>
        <a className="adm-item" href="/store" target="_blank" rel="noopener"><span className="adm-ic" aria-hidden>🛒</span><span className="adm-lb">View Online Store ↗</span></a>
      </div>
    </aside>
    <section className="adm-main">
      <div className="adm-head"><div className="eyebrow">Admin control panel</div><h1>{cur.icon} {cur.label}</h1><p className="muted">{cur.hint}</p></div>
      {(Object.keys(sections) as AdminSection[]).map((k) => <div key={k} hidden={k !== sec}>{sections[k]}</div>)}
    </section>
  </div>;
}
