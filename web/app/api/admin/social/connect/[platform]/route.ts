import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getMkUser, can } from "@/lib/marketing";
import { originOf } from "@/lib/reset";
import { googleReady, tiktokReady } from "@/lib/social-video";
import { authorizeUrl, linkedinReady, metaReady, SOCIAL_PLATFORMS, type ConnectPlatform } from "@/lib/social";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = (msg: string) => NextResponse.redirect(new URL(`/admin/marketing?m=accounts&msg=${encodeURIComponent(msg)}`, req.url));
  const u = await getMkUser();
  if (!u) return NextResponse.redirect(new URL(u ? "/admin/marketing" : "/login", req.url));
  if (!can(u, "manager")) return back("Only marketing managers and admins can connect accounts.");
  if (!(SOCIAL_PLATFORMS as readonly string[]).includes(platform)) return back("That platform can't be connected yet.");
  const p = platform as ConnectPlatform;
  if ((p === "facebook" && !metaReady()) || (p === "linkedin" && !linkedinReady()) || (p === "google" && !googleReady()) || (p === "tiktok" && !tiktokReady())) return back("Add the app keys in Vercel first.");
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("mk_oauth", JSON.stringify({ state, p }), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(authorizeUrl(p, originOf(req), state, p === "linkedin" && new URL(req.url).searchParams.get("pages") === "1"));
}
