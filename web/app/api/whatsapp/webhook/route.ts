import { NextRequest, NextResponse } from "next/server";
import { storeWebhook, validSignature } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** Meta calls this once to verify the webhook. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams, want = (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim();
  if (want && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === want) return new NextResponse(q.get("hub.challenge") ?? "", { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new NextResponse("Bad signature", { status: 401 });
  try { await storeWebhook(JSON.parse(raw)); } catch (e) { console.error("[whatsapp] webhook", e); }
  return NextResponse.json({ ok: true });
}
