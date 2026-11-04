import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = (await sql`update mk_bio_links set clicks = clicks + 1 where id = ${Number(id) || 0} and active returning url`.catch(() => []))[0];
  return NextResponse.redirect(r && /^https?:\/\//.test(r.url) ? r.url : new URL("/links", req.url), 302);
}
