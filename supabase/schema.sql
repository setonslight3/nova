-- ============================================================================
-- NOVA DELIVERY PLATFORM — SUPABASE DATABASE, STORAGE & SEED SCHEMA
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
  payment_mode text not null default 'demo' check (payment_mode in ('demo', 'live')),
  bank_name text not null default 'Moniepoint MFB (Nova Campus)',
  account_name text not null default 'NOVA DELIVERY TECHNOLOGIES',
  account_number text not null default '8140029384',
  support_phone text not null default '+234 803 000 6682',
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

-- Idempotent Realtime Publication Registration
do $$
begin
  begin
    alter publication supabase_realtime add table public.orders;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.products;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.platform_settings;
  exception when duplicate_object then null;
  end;
end $$;

-- Row Level Security
alter table public.products enable row level security;
alter table public.laundry_services enable row level security;
alter table public.campus_zones enable row level security;
alter table public.platform_settings enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Public read products" on public.products;
create policy "Public read products" on public.products for select using (true);
drop policy if exists "Admin write products" on public.products;
create policy "Admin write products" on public.products for all using (true) with check (true);

drop policy if exists "Public read laundry_services" on public.laundry_services;
create policy "Public read laundry_services" on public.laundry_services for select using (true);
drop policy if exists "Admin write laundry_services" on public.laundry_services;
create policy "Admin write laundry_services" on public.laundry_services for all using (true) with check (true);

drop policy if exists "Public read campus_zones" on public.campus_zones;
create policy "Public read campus_zones" on public.campus_zones for select using (true);
drop policy if exists "Admin write campus_zones" on public.campus_zones;
create policy "Admin write campus_zones" on public.campus_zones for all using (true) with check (true);

drop policy if exists "Public read platform_settings" on public.platform_settings;
create policy "Public read platform_settings" on public.platform_settings for select using (true);
drop policy if exists "Admin write platform_settings" on public.platform_settings;
create policy "Admin write platform_settings" on public.platform_settings for all using (true) with check (true);

drop policy if exists "Orders read and create" on public.orders;
create policy "Orders read and create" on public.orders for all using (true) with check (true);

-- Storage Bucket for Payment Proofs & Parcel Photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nova-uploads',
  'nova-uploads',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv']
)
on conflict (id) do nothing;

drop policy if exists "Public read nova-uploads" on storage.objects;
create policy "Public read nova-uploads" on storage.objects for select using (bucket_id = 'nova-uploads');
drop policy if exists "Public upload nova-uploads" on storage.objects;
create policy "Public upload nova-uploads" on storage.objects for insert with check (bucket_id = 'nova-uploads');

-- Seed Default Platform Settings
insert into public.platform_settings (id, payment_mode, bank_name, account_name, account_number, support_phone)
values ('default', 'demo', 'Moniepoint MFB (Nova Campus)', 'NOVA DELIVERY TECHNOLOGIES', '8140029384', '+234 803 000 6682')
on conflict (id) do nothing;

-- Seed Campus Zones
insert into public.campus_zones (id, name, food_delivery_fee, laundry_pickup_fee, parcel_base_fee, estimated_eta, active)
values
  ('wigwe', 'Wigwe University', 600, 1000, 700, '15–25 min', true),
  ('uniport', 'University of Port Harcourt', 800, 1000, 900, '25–35 min', true),
  ('rsu', 'Rivers State University', 800, 1200, 900, '25–40 min', true)
on conflict (id) do nothing;

-- Seed Laundry Services
insert into public.laundry_services (id, name, description, price, icon_path, available)
values
  ('wash', 'Wash & Fold', 'Everyday clothes, washed and folded.', 1500, 'M4 3h16v18H4z M4 7h16 M8 5h1 M12 5h1 M17 14a5 5 0 1 1-10 0 5 5 0 0 1 10 0', true),
  ('iron', 'Ironing', 'Professionally pressed, wrinkle-free clothes.', 1000, 'M3 18h18l-3-9H9l-6 9Z M9 9V5h7 M3 21h18 M12 13h4', true),
  ('dry', 'Dry Cleaning', 'Special care for delicate clothing.', 2500, 'm8 3-5 4 3 5 2-1v10h8V11l2 1 3-5-5-4c0 4-8 4-8 0Z', true),
  ('bedding', 'Bedsheet / Duvet', 'Bedding and larger laundry items.', 3000, 'M3 18V7h18v11 M3 12h18 M6 7V4h12v3 M3 18h18 M5 18v3 M19 18v3', true)
on conflict (id) do nothing;

-- Seed Products Catalog
insert into public.products (id, name, description, serving_size, price, original_price, prep_time, category, subcategory, image, available, tags)
values
  ('jollof', 'Jollof rice & chicken', 'Smoky party jollof rice with grilled spiced chicken', '1 hearty plate · grilled chicken', 3500, 4000, '25–35 min', 'Food', 'Ready-Made Dishes', 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=420&q=75', true, array['jollof','rice','chicken','lunch','dinner','meal']),
  ('fried', 'Fried rice & chicken', 'Golden vegetable fried rice served with peppered chicken', '1 full plate · chicken thigh', 3200, null, '20–30 min', 'Food', 'Ready-Made Dishes', 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=420&q=75', true, array['fried rice','rice','chicken','vegetable']),
  ('spaghetti', 'Jollof spaghetti', 'Stir-fried spaghetti in rich tomato pepper sauce and veggies', '1 regular pack', 2800, null, '20–30 min', 'Food', 'Ready-Made Dishes', 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=420&q=75', true, array['spaghetti','pasta','noodles']),
  ('rice', 'White rice & stew', 'Fluffy steamed white rice with rich beef & tomato stew', '1 plate · assorted stew', 2500, null, '15–25 min', 'Food', 'Ready-Made Dishes', 'https://images.unsplash.com/photo-1516714435131-44d6b64dc6a2?auto=format&fit=crop&w=420&q=75', true, array['white rice','stew','rice']),
  ('shawarma', 'Chicken shawarma wrap', 'Double-sausage creamy spicy chicken shawarma wrap', 'Large wrap · double sausage', 3000, 3400, '15–25 min', 'Food', 'Fast Food', 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=420&q=75', true, array['shawarma','wrap','fast food','chicken']),
  ('burger', 'Classic beef burger & fries', 'Grilled beef patty, cheddar cheese, lettuce & crispy fries', 'Burger + regular fries', 4200, null, '20–30 min', 'Food', 'Fast Food', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=420&q=75', true, array['burger','fries','chips','beef','fast food']),
  ('meatpie', 'Warm Nigerian meat pie (2 pcs)', 'Flaky golden pastry filled with minced beef, potatoes & carrots', 'Pack of 2 pies', 1600, null, '10–20 min', 'Food', 'Snacks & Pastries', 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=420&q=75', true, array['meat pie','pie','pastry','snack']),
  ('smoothie', 'Tropical mango-pineapple smoothie', 'Chilled fresh fruit blend with Greek yogurt drizzle', '500 ml chilled cup', 2200, null, '10–15 min', 'Food', 'Smoothies & Drinks', 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=420&q=75', true, array['smoothie','juice','drink','mango','pineapple']),
  ('eggs', 'Eggs · 6 pack', 'Fresh farm eggs for everyday campus breakfast', null, 1800, null, '15–25 min', 'Groceries', 'Foodstuffs', 'https://images.unsplash.com/photo-1518569656558-1f25e69d93d7?auto=format&fit=crop&w=420&q=75', true, array['eggs','egg','breakfast','crate']),
  ('bread', 'Sliced bread', 'One fresh soft family-sized sliced loaf', null, 1500, null, '15–25 min', 'Groceries', 'Foodstuffs', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=420&q=75', true, array['bread','loaf','toast','breakfast']),
  ('noodles', 'Instant noodles · 5 pack', 'Quick late-night hostel study pack (chicken flavour)', null, 2000, null, '15–25 min', 'Groceries', 'Foodstuffs', 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=420&q=75', true, array['noodles','indomie','ramen','pack']),
  ('milk', 'Milk · 1 litre', 'Full cream UHT liquid milk for cereal, tea & coffee', null, 2200, null, '15–25 min', 'Groceries', 'Beverages', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=420&q=75', true, array['milk','dairy','beverage','cereal']),
  ('water', 'Bottled water · 12 pack (75cl)', 'Pure table water shrink-pack delivered to your hostel door', null, 2400, null, '15–30 min', 'Groceries', 'Beverages', 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=420&q=75', true, array['water','bottled water','drink','pack']),
  ('plantain_chips', 'Crunchy plantain chips & peanuts', 'Lightly salted ripe plantain chips + roasted groundnuts combo', null, 1200, null, '15–20 min', 'Groceries', 'Snacks', 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=420&q=75', true, array['chips','plantain','snacks','peanuts','biscuits']),
  ('detergent', 'Laundry detergent & tissue pack', '900g washing powder + 4-roll soft bathroom tissue bundle', null, 3400, null, '20–30 min', 'Groceries', 'Household Essentials', 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=420&q=75', true, array['detergent','soap','tissue','toiletries','household']),
  ('care_kit', 'Body wash & toothpaste essentials', 'Refreshing moisturizing shower gel + fluoride toothpaste', null, 3800, null, '20–30 min', 'Groceries', 'Personal Care', 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=420&q=75', true, array['body wash','toothpaste','soap','personal care','hygiene'])
on conflict (id) do nothing;
