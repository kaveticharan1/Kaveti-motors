-- Kaveti Motors – database schema and security rules
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe rule of thumb: buyers (anonymous visitors) can only READ the showroom
-- and SEND offers. Everything else is for the owner only.

-- ─────────────────────────────────────────────────────────────
-- 1. Owners: who is allowed into the owner area
-- ─────────────────────────────────────────────────────────────
create table if not exists public.owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.owners enable row level security;

-- An owner can see their own row (used by the app to check "am I the owner?").
drop policy if exists "owner reads self" on public.owners;
create policy "owner reads self" on public.owners
  for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies: owners are added only from the SQL editor.

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.owners where user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Cars: the public showroom information only (no costs here)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 80),
  brand text check (brand is null or char_length(brand) <= 40),
  model text check (model is null or char_length(model) <= 40),
  variant text check (variant is null or char_length(variant) <= 40),
  year int not null check (year between 1990 and 2100),
  km int not null check (km >= 0),
  fuel text not null check (fuel in ('Diesel','Petrol','CNG','Electric','Hybrid')),
  transmission text not null default 'Manual' check (transmission in ('Manual','Automatic')),
  owner_no int not null default 1 check (owner_no between 1 and 9),
  colour text,
  insurance_till text,
  description text,
  price int not null check (price > 0),
  prev_price int check (prev_price is null or prev_price > 0),   -- old price, shown struck through after a price drop
  status text not null default 'available' check (status in ('available','booked','sold')),
  photos text[] not null default '{}',
  offers_open boolean not null default true,
  offers_close_at timestamptz,
  listed_on date not null default current_date,
  sold_on date,
  created_at timestamptz not null default now()
);
alter table public.cars add column if not exists prev_price int check (prev_price is null or prev_price > 0);
alter table public.cars add column if not exists brand text check (brand is null or char_length(brand) <= 40);
alter table public.cars add column if not exists model text check (model is null or char_length(model) <= 40);
alter table public.cars add column if not exists variant text check (variant is null or char_length(variant) <= 40);
alter table public.cars enable row level security;

drop policy if exists "anyone reads showroom" on public.cars;
create policy "anyone reads showroom" on public.cars
  for select to anon, authenticated using (true);

drop policy if exists "owner writes cars" on public.cars;
create policy "owner writes cars" on public.cars
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ─────────────────────────────────────────────────────────────
-- 3. Private money data: owner only
-- ─────────────────────────────────────────────────────────────
create table if not exists public.car_costs (
  car_id uuid primary key references public.cars (id) on delete cascade,
  buy_price int not null default 0 check (buy_price >= 0),
  loan_amount int not null default 0 check (loan_amount >= 0),
  interest_rate numeric(5,2) not null default 0 check (interest_rate between 0 and 60),
  bought_on date not null default current_date,
  sold_price int check (sold_price is null or sold_price > 0)
);
alter table public.car_costs enable row level security;
drop policy if exists "owner only costs" on public.car_costs;
create policy "owner only costs" on public.car_costs
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  amount int not null check (amount >= 0),
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
drop policy if exists "owner only expenses" on public.expenses;
create policy "owner only expenses" on public.expenses
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ─────────────────────────────────────────────────────────────
-- 4. Offers: buyers can SEND, only the owner can READ
-- ─────────────────────────────────────────────────────────────
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  amount int not null check (amount between 10000 and 100000000),
  status text not null default 'new' check (status in ('new','confirmed','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (car_id, phone)               -- one offer per phone number per car
);
alter table public.offers enable row level security;

drop policy if exists "buyers send offers" on public.offers;
create policy "buyers send offers" on public.offers
  for insert to anon, authenticated
  with check (
    status = 'new'
    and exists (
      select 1 from public.cars c
      where c.id = car_id
        and c.status <> 'sold'
        and c.offers_open
        and (c.offers_close_at is null or now() < c.offers_close_at)
    )
  );

drop policy if exists "owner manages offers" on public.offers;
create policy "owner manages offers" on public.offers
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Public "N people interested" count, without exposing any offer details.
-- Only offers the owner has confirmed by phone are counted, so the number cannot be faked.
create or replace function public.offer_counts()
returns table (car_id uuid, interested int)
language sql stable security definer set search_path = public
as $$
  select o.car_id, count(*)::int
  from public.offers o
  where o.status in ('confirmed', 'accepted')
  group by o.car_id;
$$;
revoke all on function public.offer_counts() from public;
grant execute on function public.offer_counts() to anon, authenticated;


-- Every new offer: the database sets the date and status itself, and limits spam.
--   • at most 5 offers per car per hour
--   • at most 30 offers across the whole showroom per 10 minutes
create or replace function public.offer_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.created_at := now();
  if not public.is_owner() then
    new.status := 'new';
    if (select count(*) from public.offers where car_id = new.car_id and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'too_many_offers_car' using errcode = 'P0001';
    end if;
    if (select count(*) from public.offers where created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'too_many_offers_site' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists offer_guard on public.offers;
create trigger offer_guard before insert on public.offers
  for each row execute function public.offer_guard();

-- Remember the old price when the owner lowers it (for the "price dropped" badge).
create or replace function public.price_drop()
returns trigger
language plpgsql
as $$
begin
  if new.price < old.price then
    new.prev_price := coalesce(old.prev_price, old.price);
  elsif new.price > old.price then
    new.prev_price := null;
  end if;
  return new;
end;
$$;
drop trigger if exists price_drop on public.cars;
create trigger price_drop before update of price on public.cars
  for each row execute function public.price_drop();


-- ─────────────────────────────────────────────────────────────
-- 4b. Business settings (Profile tab): everyone can read, only the owner can change
-- ─────────────────────────────────────────────────────────────
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),          -- exactly one row
  business_name text not null default 'Vahana Motors' check (char_length(business_name) between 2 and 40),
  tagline text not null default 'Quality used cars' check (char_length(tagline) <= 60),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[6-9][0-9]{9}$'),
  phone text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  hero_badge text not null default '' check (char_length(hero_badge) <= 60),
  trust_points text[] not null default '{}' check (cardinality(trust_points) <= 6),
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;
alter table public.settings enable row level security;
drop policy if exists "anyone reads settings" on public.settings;
create policy "anyone reads settings" on public.settings for select to anon, authenticated using (true);
drop policy if exists "owner updates settings" on public.settings;
create policy "owner updates settings" on public.settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- ─────────────────────────────────────────────────────────────
-- 5. Photo storage: anyone can view, only the owner can upload/delete
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-photos', 'car-photos', true, 1048576, array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;

drop policy if exists "owner uploads photos" on storage.objects;
create policy "owner uploads photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'car-photos' and public.is_owner());
drop policy if exists "owner changes photos" on storage.objects;
create policy "owner changes photos" on storage.objects
  for update to authenticated using (bucket_id = 'car-photos' and public.is_owner());
drop policy if exists "owner deletes photos" on storage.objects;
create policy "owner deletes photos" on storage.objects
  for delete to authenticated using (bucket_id = 'car-photos' and public.is_owner());

-- ─────────────────────────────────────────────────────────────
-- 6. LAST STEP (after your father has logged in once in the app):
--    make his account the owner. Replace the email and run:
--
--    insert into public.owners (user_id)
--    select id from auth.users where email = 'father@example.com';
-- ─────────────────────────────────────────────────────────────
