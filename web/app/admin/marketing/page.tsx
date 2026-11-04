import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import MarketingClient from "./MarketingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing Command Center — NEAS Admin", robots: { index: false } };

export default async function MarketingPage() {
  const user = await getUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") return <div className="wrap" style={{ padding: 50 }}><h1>Admins only</h1><p className="muted"><a href="/admin/login">Log in with an admin account</a>.</p></div>;
  return <MarketingClient />;
}
