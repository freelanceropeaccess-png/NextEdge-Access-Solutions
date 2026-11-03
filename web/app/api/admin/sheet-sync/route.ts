import { requireAdmin } from "@/lib/admin";
import { applyRows, csvUrl, rowsFromCsv } from "@/lib/sheet";
import { getSetting, setSetting } from "@/lib/settings";
import { bad, ok } from "@/lib/http";

type SheetCfg = { url: string; priceSource: "markup" | "sheet"; hideMissing: boolean; lastSync: string; lastResult: string };
const DEF: SheetCfg = { url: "", priceSource: "markup", hideMissing: true, lastSync: "", lastResult: "" };

export async function POST(req: Request) {
  if (!(await requireAdmin())) return bad("Admin access required.", 403);
  const b = await req.json().catch(() => ({}));
  const cfg = await getSetting<SheetCfg>("sheet", DEF);
  if (typeof b.url === "string") cfg.url = b.url.trim().slice(0, 500);
  if (b.priceSource === "markup" || b.priceSource === "sheet") cfg.priceSource = b.priceSource;
  if (typeof b.hideMissing === "boolean") cfg.hideMissing = b.hideMissing;
  if (b.action === "save") { await setSetting("sheet", cfg); return ok(cfg); }
  let text: string;
  if (typeof b.csv === "string" && b.csv.trim()) text = b.csv.slice(0, 2_000_000);
  else {
    if (!cfg.url) return bad("Add your Google Sheet link first.");
    let url: string; try { url = csvUrl(cfg.url); } catch (e) { return bad((e as Error).message); }
    const r = await fetch(url, { redirect: "follow", cache: "no-store" });
    const ct = r.headers.get("content-type") ?? "";
    if (!r.ok || ct.includes("text/html")) return bad("Google didn't share the sheet. In Google Sheets: Share → General access → 'Anyone with the link' → Viewer, then try again.");
    text = await r.text();
  }
  let rows; try { rows = rowsFromCsv(text); } catch (e) { return bad((e as Error).message); }
  if (b.action === "preview") return ok({ preview: rows.slice(0, 15), total: rows.length });
  const res = await applyRows(rows, cfg.hideMissing);
  cfg.lastSync = new Date().toISOString();
  cfg.lastResult = `${res.total} products: ${res.added} new, ${res.updated} updated, ${res.hidden} hidden`;
  await setSetting("sheet", cfg);
  return ok({ ...res, cfg });
}
