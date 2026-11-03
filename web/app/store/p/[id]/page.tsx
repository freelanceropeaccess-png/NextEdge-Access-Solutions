import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listProducts } from "@/lib/db";
import ShareBar from "@/components/ShareBar";

export const dynamic = "force-dynamic";
const ORIGIN = "https://www.nextedge-access-solutions.com";
const peso = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");
async function find(id: string) { return (await listProducts().catch(() => [])).find((p) => p.id === id); }
const abs = (img: string) => (img ? (img.startsWith("/") ? ORIGIN + img : img) : ORIGIN + "/img/hero-city.jpg");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await find((await params).id);
  if (!p) return { title: "Product not found — NEAS" };
  const title = `${p.name} — ${peso(p.price)} | NEAS Online Store`;
  const description = `${p.name}${p.code ? ` (code ${p.code})` : ""} · ${p.category}. Genuine height-safety equipment from NextEdge Access Solutions. Order online, pay by bank transfer.`;
  const url = `${ORIGIN}/store/p/${p.id}`;
  return { title, description, alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "NEAS Online Store", images: [{ url: abs(p.image) }] },
    twitter: { card: "summary_large_image", title, description, images: [abs(p.image)] } };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await find((await params).id);
  if (!p) notFound();
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, sku: p.code || undefined, category: p.category, image: abs(p.image),
    brand: { "@type": "Brand", name: "NEAS" }, offers: { "@type": "Offer", priceCurrency: "PHP", price: p.price, availability: "https://schema.org/InStock", url: `${ORIGIN}/store/p/${p.id}` } };
  return <div className="wrap" style={{ padding: "36px 20px", maxWidth: 980 }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    <a href="/store" className="muted" style={{ fontSize: 14 }}>← Back to Online Store</a>
    <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 28, marginTop: 14 }}>
      <div style={{ background: "#f8fafc", borderRadius: 12, display: "grid", placeItems: "center", minHeight: 280, overflow: "hidden" }}>
        {p.image ? <img src={p.image} alt={p.name} style={{ width: "100%", maxHeight: 420, objectFit: "contain" }} /> : <span style={{ fontSize: 64, opacity: .3 }}>🛡️</span>}
      </div>
      <div>
        <div className="eyebrow">{p.category}</div>
        <h1 style={{ fontSize: 28 }}>{p.name}</h1>
        {p.code && <p className="muted" style={{ margin: "0 0 8px" }}>Item code: {p.code}</p>}
        <div style={{ fontSize: 30, fontWeight: 800, margin: "8px 0 14px" }}>{peso(p.price)}</div>
        <a className="btn btn-primary" href={`/store?p=${p.id}`} style={{ background: "#15803d" }}>Buy now in Online Store</a>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Prices in PHP. Payment by bank transfer to Security Bank. Stock confirmed after payment.</p>
        {p.description && <p style={{ whiteSpace: "pre-line", lineHeight: 1.6 }}>{p.description}</p>}
        {p.features && <><h3 style={{ fontSize: 15, margin: "14px 0 6px" }}>Technical features</h3><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>{p.features.split("\n").filter((l) => l.trim()).map((l, i) => <li key={i}>{l.replace(/^[-•*]\s*/, "")}</li>)}</ul></>}
        {p.specs_url && <p><a className="btn btn-ghost" href={p.specs_url} target="_blank" rel="noopener">📄 View technical specs ↗</a></p>}
        <ShareBar path={`/store/p/${p.id}`} title={p.name} price={peso(p.price)} />
      </div>
    </div>
  </div>;
}
