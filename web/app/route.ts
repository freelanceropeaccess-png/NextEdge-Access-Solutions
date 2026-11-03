import { renderHomepage } from "@/lib/homepage";
export const dynamic = "force-dynamic";
export async function GET() {
  return new Response(await renderHomepage(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } });
}
