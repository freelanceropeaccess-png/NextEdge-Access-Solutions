import type { Metadata } from "next";
import { POLICY_HTML } from "./content";

export const metadata: Metadata = {
  title: "Privacy Policy — NextEdge Access Solutions (NEAS)",
  description: "How NextEdge Access Solutions (NEAS) collects, uses and protects personal information under the Philippine Data Privacy Act of 2012.",
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPolicy() {
  return <div className="wrap" style={{ padding: "40px 20px", maxWidth: 860 }}>
    <div className="eyebrow">Legal</div>
    <h1>Privacy Policy</h1>
    <article className="policy" style={{ lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: POLICY_HTML }} />
  </div>;
}
