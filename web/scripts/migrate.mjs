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
await sql`alter table products add column if not exists image_url text`;
await sql`alter table products add column if not exists description text`;
await sql`alter table products add column if not exists features text`;
await sql`alter table products add column if not exists specs_url text`;
await sql`create table if not exists product_images (id text primary key, mime text not null, data bytea not null, created_at timestamptz not null default now())`;
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
await sql`create table if not exists password_resets (
  token_hash text primary key, user_id int not null references users(id) on delete cascade,
  expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now())`;
// ---- Marketing Command Center (additive only) ----
await sql`alter table users add column if not exists marketing_role text`;
await sql`create table if not exists mk_posts (
  id serial primary key, title text not null default '', body text not null default '',
  platforms text[] not null default '{}', status text not null default 'draft'
    check (status in ('draft','pending','approved','scheduled','published','failed')),
  scheduled_at timestamptz, media_url text, campaign text, notes text,
  created_by int references users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
await sql`create table if not exists mk_activity (
  id serial primary key, post_id int references mk_posts(id) on delete set null,
  user_id int references users(id) on delete set null, action text not null, detail text,
  created_at timestamptz not null default now())`;
await sql`create table if not exists mk_bio_links (
  id serial primary key, label text not null, url text not null, sort int not null default 0,
  active boolean not null default true, clicks int not null default 0, created_at timestamptz not null default now())`;
await sql`create table if not exists mk_feeds (
  id serial primary key, name text not null, url text not null, created_at timestamptz not null default now())`;
await sql`create table if not exists mk_social_accounts (
  id serial primary key, platform text not null, external_id text not null, name text not null default '',
  token_enc text not null, expires_at timestamptz, status text not null default 'ok', last_error text,
  connected_by int references users(id) on delete set null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (platform, external_id))`;
await sql`create table if not exists mk_post_results (
  id serial primary key, post_id int references mk_posts(id) on delete cascade, account_id int references mk_social_accounts(id) on delete set null,
  platform text not null, ok boolean not null, remote_id text, error text, created_at timestamptz not null default now())`;
await sql`create table if not exists mk_media (
  id serial primary key, url text not null, title text not null default '', kind text not null default 'graphic',
  width int, height int, created_by int references users(id) on delete set null, created_at timestamptz not null default now())`;
await sql`create table if not exists mk_inbox_meta (
  thread_key text primary key, status text not null default 'open', assigned_to int references users(id) on delete set null,
  note text, updated_by int references users(id) on delete set null, updated_at timestamptz not null default now())`;
await sql`create table if not exists mk_email_log (
  id serial primary key, recipient text not null, subject text not null, kind text not null, ok boolean not null, error text, created_at timestamptz not null default now())`;
console.log("[migrate] Database ready.");
await sql.end();
