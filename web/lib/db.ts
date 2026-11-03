import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const g = globalThis as unknown as { __neasSql?: ReturnType<typeof postgres> };
export const sql = g.__neasSql ?? postgres(url, {
  ssl: /localhost|127\.0\.0\.1|host=\/tmp/.test(url) ? false : "require",
  max: 5, idle_timeout: 20,
});
if (process.env.NODE_ENV !== "production") g.__neasSql = sql;

export type Product = { id: string; category: string; code: string; name: string; dealer_price: number; price_override: number | null; active: boolean; price: number; image: string; description: string; features: string; specs_url: string };

export async function getMarkup(): Promise<number> {
  const rows = await sql`select value from settings where key = 'markup_percent'`;
  const n = Number(rows[0]?.value);
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

export function sellPrice(dealer: number, override: number | null, markup: number): number {
  if (override != null) return Number(override);
  return Math.ceil((Number(dealer) * (1 + markup / 100)) / 5) * 5;
}

export async function listProducts(includeInactive = false): Promise<Product[]> {
  const markup = await getMarkup();
  const { getCategoryMarkup } = await import("./settings");
  const catMarkup = await getCategoryMarkup();
  const { getSetting } = await import("./settings");
  const sheetCfg = await getSetting<{ priceSource: string }>("sheet", { priceSource: "markup" });
  const useSheet = sheetCfg.priceSource === "sheet";
  const rows = includeInactive
    ? await sql`select * from products order by active desc, sort`
    : await sql`select * from products where active order by sort`;
  return rows.map((r) => {
    const dealer = Number(r.dealer_price);
    const override = r.price_override == null ? null : Number(r.price_override);
    return { id: r.id, category: r.category, code: r.code, name: r.name, dealer_price: dealer, price_override: override, active: r.active, image: r.image_url ?? "", description: r.description ?? "", features: r.features ?? "", specs_url: r.specs_url ?? "", price: useSheet && r.sheet_price != null && override == null ? Math.ceil(Number(r.sheet_price)) : sellPrice(dealer, override, catMarkup[r.category] ?? markup) };
  });
}
