import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { bad, ok } from "@/lib/http";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Set a product photo: multipart "file" upload (≤3 MB) or JSON { url } (https link), or { url: "" } to remove. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return bad("Admin access required.", 403);
  const { id } = await params;
  const exists = await sql`select 1 from products where id = ${id}`;
  if (!exists.length) return bad("Product not found.", 404);
  let url: string | null;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const f = (await req.formData()).get("file");
    if (!(f instanceof File) || !f.size) return bad("Choose a photo to upload.");
    if (!TYPES.includes(f.type)) return bad("Photo must be JPG, PNG, WebP or GIF.");
    if (f.size > 3 * 1024 * 1024) return bad("Photo must be 3 MB or smaller.");
    const key = randomBytes(8).toString("hex");
    await sql`insert into product_images (id, mime, data) values (${key}, ${f.type}, ${Buffer.from(await f.arrayBuffer())})`;
    url = `/api/img/${key}`;
  } else {
    const b = await req.json().catch(() => ({}));
    const raw = typeof b.url === "string" ? b.url.trim() : "";
    if (!raw) url = null;
    else { try { const u = new URL(raw); if (u.protocol !== "https:" && u.protocol !== "http:") throw 0; url = u.toString().slice(0, 1000); } catch { return bad("Enter a full image link starting with https://"); } }
  }
  await sql`update products set image_url = ${url} where id = ${id}`;
  return ok({ image: url ?? "" });
}
