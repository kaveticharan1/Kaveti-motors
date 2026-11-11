-- Vahana Motors – database schema and security rules
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
language plpgsql set search_path = public
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
-- 4c. Test drives: buyers REQUEST a slot, only the owner sees and manages bookings
-- ─────────────────────────────────────────────────────────────
alter table public.settings add column if not exists td_slots text[] not null default '{10:00,11:00,12:00,15:00,16:00,17:00}'
  check (cardinality(td_slots) between 1 and 12);
alter table public.settings add column if not exists td_days_ahead int not null default 7 check (td_days_ahead between 1 and 30);

create table if not exists public.test_drives (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  drive_date date not null,
  slot text not null check (slot ~ '^[0-2][0-9]:[0-5][0-9]$'),
  note text check (note is null or char_length(note) <= 200),
  status text not null default 'requested' check (status in ('requested','confirmed','done','cancelled','no_show')),
  created_at timestamptz not null default now()
);
-- One active booking per car per slot (a cancelled booking frees the slot again).
create unique index if not exists test_drives_slot_taken on public.test_drives (car_id, drive_date, slot)
  where status in ('requested', 'confirmed');
alter table public.test_drives enable row level security;

drop policy if exists "buyers request test drives" on public.test_drives;
create policy "buyers request test drives" on public.test_drives
  for insert to anon, authenticated
  with check (
    status = 'requested'
    and exists (select 1 from public.cars c where c.id = car_id and c.status <> 'sold')
  );
drop policy if exists "owner manages test drives" on public.test_drives;
create policy "owner manages test drives" on public.test_drives
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Every new request: the database checks the date and slot, sets the status and limits spam.
create or replace function public.test_drive_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare s public.settings;
begin
  new.created_at := now();
  if public.is_owner() then return new; end if;
  select * into s from public.settings where id = 1;
  new.status := 'requested';
  if new.drive_date < (now() at time zone 'Asia/Kolkata')::date
     or new.drive_date > (now() at time zone 'Asia/Kolkata')::date + s.td_days_ahead then
    raise exception 'td_bad_date' using errcode = 'P0001';
  end if;
  if not (new.slot = any (s.td_slots)) then
    raise exception 'td_bad_slot' using errcode = 'P0001';
  end if;
  if new.drive_date = (now() at time zone 'Asia/Kolkata')::date
     and new.slot::time <= (now() at time zone 'Asia/Kolkata')::time then
    raise exception 'td_slot_passed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.test_drives where phone = new.phone and status in ('requested','confirmed')
        and drive_date >= (now() at time zone 'Asia/Kolkata')::date) >= 3 then
    raise exception 'td_too_many_phone' using errcode = 'P0001';
  end if;
  if (select count(*) from public.test_drives where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'td_too_many_site' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists test_drive_guard on public.test_drives;
create trigger test_drive_guard before insert on public.test_drives
  for each row execute function public.test_drive_guard();
revoke all on function public.test_drive_guard() from public, anon, authenticated;

-- Which slots are already taken for a car (dates and times only, never who booked).
create or replace function public.taken_slots(p_car uuid)
returns table (drive_date date, slot text)
language sql stable security definer set search_path = public
as $$
  select t.drive_date, t.slot from public.test_drives t
  where t.car_id = p_car and t.status in ('requested','confirmed')
    and t.drive_date >= (now() at time zone 'Asia/Kolkata')::date;
$$;
revoke all on function public.taken_slots(uuid) from public;
grant execute on function public.taken_slots(uuid) to anon, authenticated;

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
-- 4d. Team roles and customer accounts
--   Admin  : everything (costs, profit, settings, team, delete)
--   Sales  : cars (no costs), offers, test drives
--   Staff  : cars (no costs), test drives
--   Anyone else who logs in is a customer: they see only their own offers and test drives.
--   A role is given by EMAIL, so the admin can add someone before they ever log in.
--   The email must be verified (login code), so nobody can claim a team email.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.team (
  email text primary key check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  name text not null default '' check (char_length(name) <= 60),
  role text not null check (role in ('admin','sales','staff')),
  added_by text,
  created_at timestamptz not null default now()
);
alter table public.team enable row level security;

-- Earlier owners become admins.
insert into public.team (email, role, added_by)
select lower(u.email), 'admin', 'setup' from public.owners o join auth.users u on u.id = o.user_id
where u.email is not null
on conflict (email) do nothing;

create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
  select t.role from public.team t
  join auth.users u on lower(u.email) = t.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
  limit 1;
$$;
create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'admin', false); $$;
create or replace function public.my_email()
returns text
language sql stable security definer set search_path = public
as $$ select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null; $$;
create or replace function public.is_team()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.my_role() is not null; $$;
create or replace function public.can_see_offers()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin','sales'), false); $$;
revoke all on function public.my_role() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.is_team() from public, anon;
revoke all on function public.can_see_offers() from public, anon;
revoke all on function public.my_email() from public, anon;
grant execute on function public.my_role(), public.my_email(), public.is_owner(), public.is_team(), public.can_see_offers() to authenticated;

-- Team list: the admin manages it; everyone can read their own row.
drop policy if exists "team reads" on public.team;
create policy "team reads" on public.team for select to authenticated
  using (public.is_owner() or email = public.my_email());
drop policy if exists "admin manages team" on public.team;
create policy "admin manages team" on public.team for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Never leave the business without an admin.
create or replace function public.team_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.email := lower(trim(new.email));
    new.created_at := now();
    new.added_by := (select u.email from auth.users u where u.id = auth.uid());
    return new;
  end if;
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and (select count(*) from public.team where role = 'admin') <= 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then new.email := old.email; return new; end if;
  return old;
end;
$$;
drop trigger if exists team_guard on public.team;
create trigger team_guard before insert or update or delete on public.team
  for each row execute function public.team_guard();
revoke all on function public.team_guard() from public, anon, authenticated;

-- Cars: the whole team adds and edits listings; only the admin deletes or marks sold.
drop policy if exists "owner writes cars" on public.cars;
drop policy if exists "team adds cars" on public.cars;
create policy "team adds cars" on public.cars for insert to authenticated with check (public.is_team());
drop policy if exists "team edits cars" on public.cars;
create policy "team edits cars" on public.cars for update to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "admin deletes cars" on public.cars;
create policy "admin deletes cars" on public.cars for delete to authenticated using (public.is_owner());

create or replace function public.car_role_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_owner() and (new.status = 'sold') is distinct from (old.status = 'sold') then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;
  if not public.is_owner() then new.sold_on := old.sold_on; end if;
  return new;
end;
$$;
drop trigger if exists car_role_guard on public.cars;
create trigger car_role_guard before update on public.cars
  for each row execute function public.car_role_guard();
revoke all on function public.car_role_guard() from public, anon, authenticated;

-- Offers and test drives remember which customer account sent them (if logged in).
alter table public.offers add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.test_drives add column if not exists user_id uuid references auth.users (id) on delete set null;

drop policy if exists "owner manages offers" on public.offers;
drop policy if exists "sales manages offers" on public.offers;
create policy "sales manages offers" on public.offers for all to authenticated
  using (public.can_see_offers()) with check (public.can_see_offers());
drop policy if exists "customer reads own offers" on public.offers;
create policy "customer reads own offers" on public.offers for select to authenticated using (user_id = auth.uid());

drop policy if exists "owner manages test drives" on public.test_drives;
drop policy if exists "team manages test drives" on public.test_drives;
create policy "team manages test drives" on public.test_drives for all to authenticated
  using (public.is_team()) with check (public.is_team());
drop policy if exists "customer reads own test drives" on public.test_drives;
create policy "customer reads own test drives" on public.test_drives for select to authenticated using (user_id = auth.uid());

-- The guards stamp the customer's account and let the team skip the spam limits.
create or replace function public.offer_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.created_at := now();
  new.user_id := auth.uid();
  if not public.can_see_offers() then
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
revoke all on function public.offer_guard() from public, anon, authenticated;

create or replace function public.test_drive_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare s public.settings;
begin
  new.created_at := now();
  new.user_id := auth.uid();
  if public.is_team() then return new; end if;
  select * into s from public.settings where id = 1;
  new.status := 'requested';
  if new.drive_date < (now() at time zone 'Asia/Kolkata')::date
     or new.drive_date > (now() at time zone 'Asia/Kolkata')::date + s.td_days_ahead then
    raise exception 'td_bad_date' using errcode = 'P0001';
  end if;
  if not (new.slot = any (s.td_slots)) then
    raise exception 'td_bad_slot' using errcode = 'P0001';
  end if;
  if new.drive_date = (now() at time zone 'Asia/Kolkata')::date
     and new.slot::time <= (now() at time zone 'Asia/Kolkata')::time then
    raise exception 'td_slot_passed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.test_drives where phone = new.phone and status in ('requested','confirmed')
        and drive_date >= (now() at time zone 'Asia/Kolkata')::date) >= 3 then
    raise exception 'td_too_many_phone' using errcode = 'P0001';
  end if;
  if (select count(*) from public.test_drives where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'td_too_many_site' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.test_drive_guard() from public, anon, authenticated;

-- Photos: the whole team uploads.
drop policy if exists "owner uploads photos" on storage.objects;
drop policy if exists "team uploads photos" on storage.objects;
create policy "team uploads photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'car-photos' and public.is_team());
drop policy if exists "owner changes photos" on storage.objects;
drop policy if exists "team changes photos" on storage.objects;
create policy "team changes photos" on storage.objects
  for update to authenticated using (bucket_id = 'car-photos' and public.is_team());
drop policy if exists "owner deletes photos" on storage.objects;
drop policy if exists "team deletes photos" on storage.objects;
create policy "team deletes photos" on storage.objects
  for delete to authenticated using (bucket_id = 'car-photos' and public.is_team());

-- Function permissions (Supabase security advisor):
--   offer_guard is a trigger only: nobody may call it directly.
--   is_owner is needed by signed-in users' security rules, not by anonymous visitors.
--   offer_counts stays public on purpose: it returns only "N people interested" per car.
revoke all on function public.offer_guard() from public, anon, authenticated;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. FIRST ADMIN: add the owner's email once (afterwards, add people from the app's Team page):
--    insert into public.team (email, name, role) values ('owner@example.com', 'Owner', 'admin');
-- ─────────────────────────────────────────────────────────────
