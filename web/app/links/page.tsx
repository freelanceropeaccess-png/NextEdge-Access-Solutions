import { sql } from "@/lib/db";
import { getSetting, DEFAULT_SOCIAL, DEFAULT_BUSINESS, type Social, type Business } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "NextEdge Access Solutions — Links", description: "IRATA rope access & height safety in the Philippines. Online Store, services and contact." };

export default async function Links() {
  const [links, social, biz] = await Promise.all([
    sql`select id, label from mk_bio_links where active order by sort, id`.catch(() => []),
    getSetting<Social>("social", DEFAULT_SOCIAL), getSetting<Business>("business", DEFAULT_BUSINESS),
  ]);
  const logo = (biz as Business & { logo?: string }).logo;
  const socials = Object.entries(social).filter(([, v]) => typeof v === "string" && /^https?:\/\//.test(v)) as [string, string][];
  return <div style={{ minHeight: "100vh", background: "#071D29", color: "#fff", display: "grid", placeItems: "start center", padding: "48px 16px" }}>
    <div style={{ width: "100%", maxWidth: 440, display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
      {logo ? <img src={logo} alt="NEAS" style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", background: "#fff" }} /> : <div style={{ width: 88, height: 88, borderRadius: "50%", background: "linear-gradient(135deg,#CA9332,#EBC07E)", color: "#071D29", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 36 }}>N</div>}
      <h1 style={{ margin: "6px 0 0", fontSize: 22 }}>NextEdge Access Solutions</h1>
      <p style={{ margin: 0, color: "#94A3B8" }}>IRATA Rope Access · Height Safety · PPE</p>
      <div style={{ display: "grid", gap: 10, width: "100%", marginTop: 12 }}>
        {links.map((l) => <a key={l.id} href={`/links/go/${l.id}`} style={{ display: "block", border: "1px solid #CA9332", borderRadius: 999, padding: "14px 18px", color: "#fff", textDecoration: "none", fontWeight: 700, background: "rgba(202,147,50,.1)" }}>{l.label}</a>)}
        <a href="https://wa.me/639914265886" style={{ display: "block", borderRadius: 999, padding: "14px 18px", color: "#fff", textDecoration: "none", fontWeight: 700, background: "#16a34a" }}>WhatsApp +63 991 426 5886</a>
      </div>
      {socials.length > 0 && <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginTop: 10 }}>{socials.map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener" style={{ color: "#EBC07E", fontSize: 13, textTransform: "capitalize" }}>{k.replace(/([A-Z])/g, " $1")}</a>)}</div>}
      <a href="/" style={{ color: "#94A3B8", fontSize: 12, marginTop: 16 }}>www.nextedge-access-solutions.com</a>
    </div>
  </div>;
}
