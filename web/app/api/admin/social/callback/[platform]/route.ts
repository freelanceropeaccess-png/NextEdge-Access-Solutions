import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getMkUser, can, logActivity } from "@/lib/marketing";
import { originOf } from "@/lib/reset";
import { completeConnect, SOCIAL_PLATFORMS, type ConnectPlatform } from "@/lib/social";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const back = (msg: string) => NextResponse.redirect(new URL(`/admin/marketing?m=accounts&msg=${encodeURIComponent(msg)}`, req.url));
  const u = await getMkUser();
  if (!u || !can(u, "manager")) return NextResponse.redirect(new URL(u ? "/admin/marketing" : "/login", req.url));
  const jar = await cookies();
  let saved: { state?: string; p?: string } = {};
  try { saved = JSON.parse(jar.get("mk_oauth")?.value ?? "{}"); } catch {}
  jar.delete("mk_oauth");
  if (url.searchParams.get("error")) return back(/scope/i.test(url.searchParams.get("error") ?? "") ? "LinkedIn hasn't approved Company Page access (Community Management API) for your app yet. Your profile connection still works." : "Connection was cancelled.");
  const code = url.searchParams.get("code");
  if (!(SOCIAL_PLATFORMS as readonly string[]).includes(platform) || !code || !saved.state || saved.state !== url.searchParams.get("state") || saved.p !== platform)
    return back("The connection expired. Please try again.");
  try {
    const summary = await completeConnect(platform as ConnectPlatform, code, originOf(req), u.id, u.ws);
    await logActivity(u.id, "connected account", summary, null, u.ws);
    return back(summary + " ✓");
  } catch (e) {
    return back("Couldn't connect: " + (e as Error).message.slice(0, 200));
  }
}
