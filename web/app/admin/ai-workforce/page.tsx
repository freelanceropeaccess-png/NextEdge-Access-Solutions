import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import AIWorkforceClient from "./AIWorkforceClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "NEAS AI Workforce — Admin", robots: { index: false, follow: false } };

export default async function AIWorkforcePage() {
  const user = await getUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") return <div className="wrap" style={{padding:50}}><h1>Admins only</h1><p className="muted">Your account does not have AI Workforce access.</p></div>;
  return <div className="wrap" style={{maxWidth:1600,padding:"20px 14px 50px"}}><AIWorkforceClient /></div>;
}
