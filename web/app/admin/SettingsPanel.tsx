"use client";
import { useState } from "react";
import type { Seo, Social, Business } from "@/lib/settings";

type Tab = "seo" | "google" | "social";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field" style={{ marginBottom: 10 }}>{label}{children}{hint && <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{hint}</span>}</label>;
}

export default function SettingsPanel(props: { seo: Seo; social: Social; business: Business }) {
  const [tab, setTab] = useState<Tab>("seo");
  const [seo, setSeo] = useState(props.seo);
  const [social, setSocial] = useState(props.social);
  const [biz, setBiz] = useState(props.business);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  async function save(body: unknown) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/site", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    setMsg(r.ok ? "Saved ✓ — live on the homepage within a minute." : ((await r.json().catch(() => ({}))).error || "Save failed"));
  }
  const S = (k: keyof Seo) => ({ value: String(seo[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSeo({ ...seo, [k]: e.target.value }) });
  const So = (k: keyof Social) => ({ value: social[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSocial({ ...social, [k]: e.target.value }), type: "url", placeholder: "https://…" });
  const B = (k: keyof Business) => ({ value: biz[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setBiz({ ...biz, [k]: e.target.value }) });
  const titleLen = seo.title.length, descLen = seo.description.length;

  return <div className="wrap" style={{ padding: "0 20px 40px" }}>
    <div className="eyebrow" style={{ marginTop: 10 }}>Website settings</div>
    <h2 style={{ margin: "4px 0 12px" }}>SEO, Google &amp; Social Media</h2>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      {([["seo", "SEO (advanced)"], ["google", "Google Business"], ["social", "Social media"]] as const).map(([k, l]) => <button key={k} type="button" className={"btn " + (tab === k ? "btn-primary" : "btn-ghost")} onClick={() => { setTab(k); setMsg(""); }}>{l}</button>)}
      {msg && <span className={msg.startsWith("Saved") ? "ok" : "err"} role="status" style={{ alignSelf: "center" }}>{msg}</span>}
    </div>

    {tab === "seo" && <div className="card" style={{ maxWidth: 820 }}>
      <div style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <div className="muted" style={{ fontSize: 12 }}>Google search preview</div>
        <div style={{ color: "#1a0dab", fontSize: 18, marginTop: 4 }}>{seo.title || "Page title"}</div>
        <div style={{ color: "#006621", fontSize: 13 }}>{seo.canonical}</div>
        <div style={{ color: "#4d5156", fontSize: 13 }}>{seo.description}</div>
      </div>
      <Field label={`Page title (${titleLen}/60)`} hint={titleLen > 60 ? "Google may cut titles longer than 60 characters." : "Shown as the blue link in Google."}><input maxLength={70} {...S("title")} /></Field>
      <Field label={`Meta description (${descLen}/160)`} hint="The grey text under your link in Google."><textarea rows={3} maxLength={170} {...S("description")} /></Field>
      <Field label="Keywords" hint="Comma separated. Helps Bing; Google mostly ignores this."><input maxLength={400} {...S("keywords")} /></Field>
      <Field label="Website address (canonical URL)"><input type="url" {...S("canonical")} /></Field>
      <Field label="Share image (Facebook / Messenger / LinkedIn preview)" hint="A full https:// link, or /img/hero-city.jpg."><input {...S("ogImage")} /></Field>
      <Field label="Google Search Console verification code" hint="Search Console → Add property → HTML tag → copy only the content=&quot;…&quot; value."><input {...S("googleVerification")} /></Field>
      <Field label="Google Analytics 4 Measurement ID" hint="Looks like G-XXXXXXXXXX. Leave blank to turn analytics off."><input placeholder="G-XXXXXXXXXX" {...S("gaMeasurementId")} /></Field>
      <Field label="Bing Webmaster verification code"><input {...S("bingVerification")} /></Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, margin: "6px 0 14px" }}><input type="checkbox" checked={seo.robotsIndex} onChange={(e) => setSeo({ ...seo, robotsIndex: e.target.checked })} /> Allow Google and other search engines to list the website</label>
      <p className="muted" style={{ fontSize: 12 }}>Also live automatically: <a href="/sitemap.xml" target="_blank">sitemap.xml</a> and <a href="/robots.txt" target="_blank">robots.txt</a>. Submit the sitemap in Google Search Console.</p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save({ seo })}>Save SEO</button>
    </div>}

    {tab === "google" && <div className="card" style={{ maxWidth: 820 }}>
      <p className="muted" style={{ marginTop: 0 }}>These details are added to the homepage as LocalBusiness data so Google can match your website to your Business Profile and show your phone, address and hours in search and Maps.</p>
      <Field label="Google Business Profile link" hint="From your profile: Share → copy link (e.g. https://g.page/r/… or https://maps.app.goo.gl/…)."><input {...So("googleBusiness")} /></Field>
      <Field label="Google Maps location link"><input {...So("googleMaps")} /></Field>
      <Field label="Google review link" hint="Profile → Ask for reviews → copy link. Adds a ‘Review us on Google’ button to the footer."><input {...So("googleReview")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0 12px" }}>
        <Field label="Business name"><input {...B("name")} /></Field>
        <Field label="Phone"><input {...B("phone")} /></Field>
        <Field label="Email"><input type="email" {...B("email")} /></Field>
        <Field label="Opening hours" hint="e.g. Mo-Sa 08:00-17:00"><input {...B("hours")} /></Field>
        <Field label="Street address"><input {...B("street")} /></Field>
        <Field label="City / Municipality"><input {...B("city")} /></Field>
        <Field label="Province / Region"><input {...B("region")} /></Field>
        <Field label="Postal code"><input {...B("postal")} /></Field>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save({ social, business: biz })}>Save Google Business details</button>
    </div>}

    {tab === "social" && <div className="card" style={{ maxWidth: 820 }}>
      <p className="muted" style={{ marginTop: 0 }}>These links power the social buttons on the side of the homepage. Leave a field blank to hide that button.</p>
      <Field label="Facebook page"><input {...So("facebook")} /></Field>
      <Field label="Instagram"><input {...So("instagram")} /></Field>
      <Field label="LinkedIn"><input {...So("linkedin")} /></Field>
      <Field label="YouTube"><input {...So("youtube")} /></Field>
      <Field label="TikTok"><input {...So("tiktok")} /></Field>
      <Field label="X (Twitter)"><input {...So("x")} /></Field>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save({ social })}>Save social links</button>
    </div>}
  </div>;
}
