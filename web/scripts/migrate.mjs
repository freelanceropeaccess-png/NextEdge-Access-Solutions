// Creates tables, seeds the KH Trading catalog once, and bootstraps the first admin.
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.log("[migrate] No DATABASE_URL set — skipping database setup."); process.exit(0); }
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1|host=\/tmp/.test(url) ? false : "require", max: 1 });

await sql`create table if not exists users (
  id serial primary key, email text unique not null, name text not null, phone text,
  password_hash text not null, role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now())`;
await sql`create table if not exists products (
  id text primary key, category text not null, code text not null default '', name text not null,
  dealer_price numeric(12,2) not null, price_override numeric(12,2), active boolean not null default true,
  sort int not null default 0)`;
await sql`create table if not exists settings (key text primary key, value text not null)`;
await sql`create table if not exists orders (
  id serial primary key, reference text unique not null, user_id int not null references users(id),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','paid','processing','shipped','completed','cancelled')),
  total numeric(12,2) not null, delivery_name text not null, delivery_phone text not null, delivery_address text not null,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
await sql`create table if not exists order_items (
  id serial primary key, order_id int not null references orders(id) on delete cascade, product_id text not null,
  name text not null, code text not null default '', unit_price numeric(12,2) not null, quantity int not null check (quantity > 0))`;
await sql`create index if not exists orders_user_idx on orders(user_id)`;
await sql`alter table users alter column password_hash drop not null`;
await sql`alter table users add column if not exists google_id text unique`;
await sql`alter table users add column if not exists facebook_id text unique`;
await sql`alter table orders add column if not exists delivery_email text`;
await sql`alter table orders add column if not exists payment_method text not null default 'bank_transfer'`;
await sql`alter table orders add column if not exists payment_slip_name text`;
await sql`alter table orders add column if not exists payment_slip_type text`;
await sql`alter table orders add column if not exists payment_slip_data text`;
await sql`alter table products add column if not exists sheet_price numeric(12,2)`;
await sql`insert into settings (key, value) values ('markup_percent', '20') on conflict (key) do nothing`;

const [{ count }] = await sql`select count(*)::int as count from products`;
if (count === 0) {
  const catalog = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));
  for (const [i, p] of catalog.entries()) {
    await sql`insert into products (id, category, code, name, dealer_price, sort) values (${p.id}, ${p.cat}, ${p.code}, ${p.name}, ${p.dealer}, ${i})`;
  }
  console.log(`[migrate] Seeded ${catalog.length} products.`);
}

const [{ admins }] = await sql`select count(*)::int as admins from users where role = 'admin'`;
if (admins === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await sql`insert into users (email, name, password_hash, role) values (${process.env.ADMIN_EMAIL.toLowerCase().trim()}, 'NEAS Admin', ${hash}, 'admin')
            on conflict (email) do update set role = 'admin', password_hash = excluded.password_hash`;
  console.log(`[migrate] Admin account ready for ${process.env.ADMIN_EMAIL}.`);
}
console.log("[migrate] Database ready.");
await sql.end();
