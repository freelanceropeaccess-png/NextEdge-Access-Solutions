import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { setSetting, getCategoryMarkup } from "@/lib/settings";
import { bad, ok } from "@/lib/http";

/** Bulk pricing actions for the admin control panel. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return bad("Admin access required.", 403);
  const b = await req.json().catch(() => ({}));
  const pct = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 500 ? n : null; };
  switch (b.action) {
    case "allMarkup": {
      const m = pct(b.markupPercent); if (m === null) return bad("Markup must be between 0 and 500%.");
      await sql`insert into settings (key, value) values ('markup_percent', ${String(m)}) on conflict (key) do update set value = excluded.value`;
      if (b.applyToAll) { await setSetting("category_markup", {}); await sql`update products set price_override = null`; }
      return ok({ ok: true });
    }
    case "categoryMarkup": {
      const cat = typeof b.category === "string" ? b.category.slice(0, 80) : "";
      if (!cat) return bad("Choose a category.");
      const cur = await getCategoryMarkup();
      if (b.markupPercent === null || b.markupPercent === "") delete cur[cat];
      else { const m = pct(b.markupPercent); if (m === null) return bad("Markup must be between 0 and 500%."); cur[cat] = m; }
      await setSetting("category_markup", cur);
      if (b.clearOverrides) await sql`update products set price_override = null where category = ${cat}`;
      return ok({ categoryMarkup: cur });
    }
    case "clearOverrides": {
      await sql`update products set price_override = null`;
      return ok({ ok: true });
    }
    case "adjustAll": {
      const p = Number(b.percent);
      if (!Number.isFinite(p) || p < -90 || p > 500) return bad("Adjustment must be between -90% and +500%.");
      const factor = 1 + p / 100;
      await sql`update products set dealer_price = round(dealer_price * ${factor}, 2) ${b.category ? sql`where category = ${String(b.category).slice(0, 80)}` : sql``}`;
      return ok({ ok: true });
    }
    case "showAll": {
      await sql`update products set active = ${Boolean(b.active)} ${b.category ? sql`where category = ${String(b.category).slice(0, 80)}` : sql``}`;
      return ok({ ok: true });
    }
    default: return bad("Unknown action.");
  }
}
