import { sql } from "@/lib/db";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) return new Response("Not found", { status: 404 });
  const [r] = await sql`select mime, data from product_images where id = ${id}`;
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(r.data), { headers: { "content-type": r.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
