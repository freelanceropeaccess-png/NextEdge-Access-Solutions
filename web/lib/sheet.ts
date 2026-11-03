import { createHash } from "node:crypto";
import { sql } from "./db";

export type SheetRow = { id: string; category: string; code: string; name: string; dealer: number; sell: number | null };

/** Minimal CSV parser (handles quotes, commas, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const num = (v: string | undefined) => { const n = Number(String(v ?? "").replace(/[₱,\s]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const CATS: Record<string, string> = { HELMET: "Helmets", "SUSPENSION HARNESS": "Harnesses", "FALL ARREST HARNESS": "Harnesses", ASCENDER: "Ascenders", DESCENDER: "Descenders", COWSTAIL: "Ropes & Cowstails", CARABINER: "Carabiners", "BACK UP DEVICE WITH ABSORBER": "Back-up Devices", "GEAR BAG": "Bags", "TEXTILE ANCHOR": "Anchors & Slings", "FALL ARREST LANYARD": "Lanyards", "POSITIONING LANYARD": "Lanyards", "CABLE FALL ARREST": "Fall Arrest", PULLEY: "Pulleys", SHEILD: "Rope Protection", SHIELD: "Rope Protection" };

/** Reads a KH Trading style sheet: header row with "Item Code", "Item Description", "Dealer Price" and optionally "Selling Price"/"Sell Price (VAT)". Category rows have a description but no price. */
export function rowsFromCsv(text: string): SheetRow[] {
  const rows = parseCsv(text).map((r) => r.map((c) => c.replace(/\s+/g, " ").trim()));
  const hi = rows.findIndex((r) => r.some((c) => /item code/i.test(c)) && r.some((c) => /description/i.test(c)));
  if (hi < 0) throw new Error("Couldn't find the header row (needs 'Item Code' and 'Item Description' columns).");
  const h = rows[hi].map((c) => c.toLowerCase());
  const iCode = h.findIndex((c) => c.includes("item code")), iName = h.findIndex((c) => c.includes("description"));
  let iDealer = h.findIndex((c) => c.includes("dealer"));
  if (iDealer < 0) iDealer = h.findIndex((c) => c.includes("unit price"));
  if (iDealer < 0) throw new Error("Couldn't find a 'Dealer Price' column.");
  const sub = rows[hi + 1]?.map((c) => c.toLowerCase()) ?? [];
  let iSell = h.findIndex((c) => c.includes("selling"));
  if (iSell < 0) iSell = sub.findIndex((c) => c.includes("sell price (vat)"));
  let cat = "Other"; const out: SheetRow[] = []; const seen = new Set<string>();
  for (const r of rows.slice(hi + 1)) {
    const code = r[iCode] ?? "", name = r[iName] ?? "";
    if (!name) continue;
    const dealer = num(r[iDealer]);
    if (dealer === null) {
      if (!code && !/^dealer$/i.test(r[iDealer] ?? "")) { const k = name.toUpperCase(); cat = CATS[k] ?? titleCase(name); }
      continue;
    }
    let c = cat; const n = name.toLowerCase();
    if (n.includes("glove")) c = "Gloves"; else if (n.includes("harness")) c = "Harnesses"; else if (n.includes("carabin")) c = "Carabiners"; else if (/cord\b|rope\b/.test(n) && !n.includes("shield")) c = c === "Other" ? "Ropes & Cowstails" : c;
    const id = "s" + createHash("sha1").update((code + "|" + name).toLowerCase()).digest("hex").slice(0, 10);
    if (seen.has(id)) continue; seen.add(id);
    out.push({ id, category: c, code, name: name.slice(0, 200), dealer, sell: iSell >= 0 ? num(r[iSell]) : null });
  }
  if (!out.length) throw new Error("No priced products found in the sheet.");
  return out;
}

/** Turns any Google Sheets link into its CSV export link. */
export function csvUrl(input: string): string {
  const u = new URL(input.trim());
  if (u.hostname !== "docs.google.com") throw new Error("Use a docs.google.com/spreadsheets link.");
  const id = u.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1];
  if (!id) throw new Error("That doesn't look like a Google Sheets link.");
  const gid = u.searchParams.get("gid") ?? u.hash.match(/gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export async function applyRows(rows: SheetRow[], hideMissing: boolean) {
  return sql.begin(async (tx) => {
    const before = new Set((await tx`select id from products`).map((r) => r.id as string));
    let added = 0, updated = 0;
    for (const [i, p] of rows.entries()) {
      if (before.has(p.id)) updated++; else added++;
      await tx`insert into products (id, category, code, name, dealer_price, sheet_price, active, sort) values (${p.id}, ${p.category}, ${p.code}, ${p.name}, ${p.dealer}, ${p.sell}, true, ${i})
        on conflict (id) do update set category = excluded.category, code = excluded.code, name = excluded.name, dealer_price = excluded.dealer_price, sheet_price = excluded.sheet_price, active = true, sort = excluded.sort`;
    }
    let hidden = 0;
    if (hideMissing) {
      const ids = rows.map((r) => r.id);
      const r = await tx`update products set active = false where active and id not in ${tx(ids)} returning id`;
      hidden = r.length;
    }
    return { added, updated, hidden, total: rows.length };
  });
}
