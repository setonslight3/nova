-- ============================================================================
-- NOVA DELIVERY PLATFORM — SUPABASE DATABASE & STORAGE SCHEMA
-- Run in Supabase SQL Editor or via Supabase CLI during deployment
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Products Catalog (Food & Groceries)
create table if not exists public.products (
  id text primary key,
  name text not null,
  description text not null,
  serving_size text,
  price integer not null check (price >= 0),
  original_price integer check (original_price is null or original_price >= 0),
  prep_time text not null default '20–30 min',
  category text not null check (category in ('Food', 'Groceries')),
  subcategory text not null,
  image text not null,
  available boolean not null default true,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Laundry Services Catalog
create table if not exists public.laundry_services (
  id text primary key,
  name text not null,
  description text not null,
  price integer not null check (price >= 0),
  icon_path text not null,
  available boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 3. Campus Delivery Zones & Service Fees
create table if not exists public.campus_zones (
  id text primary key,
  name text not null unique,
  food_delivery_fee integer not null default 700,
  laundry_pickup_fee integer not null default 1000,
  parcel_base_fee integer not null default 800,
  estimated_eta text not null default '20–35 min',
  active boolean not null default true
);

-- 4. Platform Payment & Operational Settings (single-row config id = 'default')
create table if not exists public.platform_settings (
  id text primary key default 'default',
  payment_mode text not null default 'live' check (payment_mode in ('demo', 'live')),
  bank_name text not null default 'Moniepoint MFB',
  account_name text not null default 'NOVA CAMPUS LOGISTICS LTD',
  account_number text not null default '8123456789',
  support_phone text not null default '+234 800 NOVA HELP',
  accept_card_paystack boolean not null default false,
  paystack_public_key text default '',
  updated_at timestamptz not null default now()
);

-- 5. Unified Orders Table (Food, Groceries, Laundry, Parcel Pickup)
create table if not exists public.orders (
  id text primary key,
  order_code text not null unique,
  service_type text not null check (service_type in ('Food', 'Groceries', 'Laundry', 'Parcel Pickup')),
  status text not null default 'pending_verification' check (
    status in (
      'pending_verification',
      'confirmed',
      'preparing',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  ),
  payment_method text not null default 'bank_transfer' check (
    payment_method in ('bank_transfer', 'pay_on_delivery', 'card')
  ),
  payment_verified boolean not null default false,
  proof_file_name text,
  proof_data_url text,
  items jsonb not null default '[]'::jsonb,
  subtotal integer not null default 0,
  delivery_fee integer not null default 0,
  total integer not null default 0,
  university text,
  campus_address text,
  pickup_address text,
  dropoff_address text,
  customer_phone text not null,
  secondary_phone text,
  timing text not null default 'ASAP',
  scheduled_time text,
  notes text[] not null default '{}',
  rider_name text,
  rider_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Realtime on orders & catalog
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.platform_settings;

-- Row Level Security (Public read on catalog/zones/settings; orders insert/read; admin full)
alter table public.products enable row level security;
alter table public.laundry_services enable row level security;
alter table public.campus_zones enable row level security;
alter table public.platform_settings enable row level security;
alter table public.orders enable row level security;

create policy "Public read products" on public.products for select using (true);
create policy "Admin write products" on public.products for all using (true) with check (true);

create policy "Public read laundry_services" on public.laundry_services for select using (true);
create policy "Admin write laundry_services" on public.laundry_services for all using (true) with check (true);

create policy "Public read campus_zones" on public.campus_zones for select using (true);
create policy "Admin write campus_zones" on public.campus_zones for all using (true) with check (true);

create policy "Public read platform_settings" on public.platform_settings for select using (true);
create policy "Admin write platform_settings" on public.platform_settings for all using (true) with check (true);

create policy "Orders read and create" on public.orders for all using (true) with check (true);

-- Storage Bucket for Payment Proofs & Parcel/Item Photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nova-uploads',
  'nova-uploads',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv']
)
on conflict (id) do nothing;
