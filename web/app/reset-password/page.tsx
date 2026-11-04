import ResetForm from "./ResetForm";
export const metadata = { title: "Set a new password — NEAS", robots: { index: false } };
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <div className="wrap" style={{ padding: "50px 20px", maxWidth: 480 }}>
    <div style={{ textAlign: "center", marginBottom: 22 }}><div className="eyebrow">Account help</div><h1>Set a new password</h1></div>
    {token ? <ResetForm token={token} /> : <div className="card"><p>This link is missing its code. <a href="/forgot-password">Request a new reset link</a>.</p></div>}
  </div>;
}
