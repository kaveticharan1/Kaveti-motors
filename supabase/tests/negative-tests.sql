\set ON_ERROR_STOP 0
\set VERBOSITY terse
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','father@x.com');
insert into public.owners values ('11111111-1111-1111-1111-111111111111');
insert into cars(id,slug,name,year,km,fuel,price) values ('aaaaaaaa-0000-0000-0000-000000000001','creta','Hyundai Creta',2018,68400,'Diesel',810000);
insert into cars(id,slug,name,year,km,fuel,price,offers_open) values ('aaaaaaaa-0000-0000-0000-000000000003','closed','Closed car',2018,1,'Diesel',500000,false);
insert into cars(id,slug,name,year,km,fuel,price,offers_close_at) values ('aaaaaaaa-0000-0000-0000-000000000004','expired','Expired car',2018,1,'Diesel',500000,now()-interval '1 hour');
set role anon;
\echo DB01 amount 9999
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','9848012345',9999);
\echo DB02 amount 20 crore
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','9848012345',200000000);
\echo DB03 negative amount
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','9848012345',-500000);
\echo DB04 phone starting 5
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','5848012345',700000);
\echo DB05 phone 9 digits
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','984801234',700000);
\echo DB06 phone with +91
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','+919848012345',700000);
\echo DB07 name 1 char
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','R','9848012345',700000);
\echo DB08 name 61 chars
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001',repeat('a',61),'9848012345',700000);
\echo DB09 SQL injection text in name (should store as text)
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','x''); drop table cars;--','9848012345',700000);
\echo DB10 offers closed
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000003','Ravi','9848012346',700000);
\echo DB11 deadline passed
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000004','Ravi','9848012346',700000);
\echo DB12 non-existent car
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-00000000dead','Ravi','9848012346',700000);
\echo DB13 backdate created_at
insert into offers(car_id,name,phone,amount,created_at) values ('aaaaaaaa-0000-0000-0000-000000000001','Old','9848012399',700000,'2020-01-01');
\echo DB14 spam 50 offers
insert into offers(car_id,name,phone,amount) select 'aaaaaaaa-0000-0000-0000-000000000001','Bot '||g,(9000000000+g)::text,700000 from generate_series(1,50) g;
\echo DB15 anon reads owners
select count(*) from owners;
\echo DB16 anon updates offers
update offers set status='accepted' where true;
\echo DB17 anon is_owner
select public.is_owner();
\echo DB18 anon insert car
insert into cars(slug,name,year,km,fuel,price) values ('neg','Neg',2018,1,'Diesel',1);
reset role;
\echo --- stored ---
select count(*) as total_offers, min(created_at)::date as oldest, count(*) filter (where status='accepted') accepted from offers;
select interested from offer_counts();
select count(*) cars from cars;
