import { bad, ok } from "@/lib/http";
import { useResetToken } from "@/lib/reset";
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await useResetToken(String(b.token ?? ""), typeof b.password === "string" ? b.password : "");
  return "error" in r ? bad(r.error) : ok({ ok: true, role: r.role });
}
