import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { bad, ok } from "@/lib/http";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Staff-only image upload (logo, marketing media). Returns a site-relative URL. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return bad("Admin access required.", 403);
  const f = (await req.formData().catch(() => null))?.get("file");
  if (!(f instanceof File) || !f.size) return bad("Choose an image to upload.");
  if (!TYPES.includes(f.type)) return bad("Image must be JPG, PNG, WebP or GIF.");
  if (f.size > 3 * 1024 * 1024) return bad("Image must be 3 MB or smaller.");
  const key = randomBytes(8).toString("hex");
  await sql`insert into product_images (id, mime, data) values (${key}, ${f.type}, ${Buffer.from(await f.arrayBuffer())})`;
  return ok({ url: `/api/img/${key}` });
}
