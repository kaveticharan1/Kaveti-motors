\set ON_ERROR_STOP 0
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','father@x.com'),('22222222-2222-2222-2222-222222222222','stranger@x.com');
insert into public.owners values ('11111111-1111-1111-1111-111111111111');
insert into cars(id,slug,name,year,km,fuel,price) values ('aaaaaaaa-0000-0000-0000-000000000001','creta-2018','Hyundai Creta',2018,68400,'Diesel',810000);
insert into cars(id,slug,name,year,km,fuel,price,status) values ('aaaaaaaa-0000-0000-0000-000000000002','city-2019','Honda City',2019,52300,'Petrol',925000,'sold');
insert into car_costs(car_id,buy_price,loan_amount,interest_rate) values ('aaaaaaaa-0000-0000-0000-000000000001',720000,600000,15);
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','9848012345',795000);
\echo '--- AS BUYER (anon) ---'
set role anon;
\echo 'T1 read showroom (expect 2):'
select count(*) from cars;
\echo 'T2 read costs (expect 0 rows):'
select count(*) from car_costs;
\echo 'T3 read offers (expect 0 rows):'
select count(*) from offers;
\echo 'T4 public count, unconfirmed offers are not counted (expect 0 rows):'
select interested from offer_counts();
\echo 'T5 send valid offer (expect INSERT 0 1):'
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Suresh','9000011111',780000);
\echo 'T6 same phone again (expect unique error):'
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000001','Suresh','9000011111',790000);
\echo 'T7 offer on sold car (expect RLS error):'
insert into offers(car_id,name,phone,amount) values ('aaaaaaaa-0000-0000-0000-000000000002','X','9000022222',800000);
\echo 'T8 fake status accepted (expect INSERT ok but status forced to new):'
insert into offers(car_id,name,phone,amount,status) values ('aaaaaaaa-0000-0000-0000-000000000001','Xavier','9000033333',800000,'accepted');
\echo 'T9 change price (expect UPDATE 0):'
update cars set price=1 where true;
\echo 'T10 delete car (expect DELETE 0):'
delete from cars where true;
\echo 'T11 add car (expect RLS error):'
insert into cars(slug,name,year,km,fuel,price) values ('x','Hack car',2020,1,'Diesel',1);
\echo 'T12 upload photo (expect RLS error):'
insert into storage.objects(bucket_id,name) values ('car-photos','x.jpg');
\echo 'T13 make self owner (expect RLS error):'
insert into owners values ('22222222-2222-2222-2222-222222222222');
reset role;
\echo '--- AS LOGGED-IN STRANGER (not owner) ---'
set role authenticated; set request.jwt.sub='22222222-2222-2222-2222-222222222222';
\echo 'T14 read costs (expect 0):'
select count(*) from car_costs;
\echo 'T15 read offers (expect 0):'
select count(*) from offers;
\echo 'T16 make self owner (expect RLS error):'
insert into owners values ('22222222-2222-2222-2222-222222222222');
\echo 'T17 change price (expect UPDATE 0):'
update cars set price=1 where true;
reset role;
\echo '--- AS OWNER ---'
set role authenticated; set request.jwt.sub='11111111-1111-1111-1111-111111111111';
\echo 'T18 read costs (expect 1):'
select count(*) from car_costs;
\echo 'T19 read offers (expect 3):'
select count(*) from offers;
\echo 'T20 mark confirmed (expect UPDATE 1):'
update offers set status='confirmed' where phone='9848012345';
\echo 'T21 upload photo (expect INSERT 0 1):'
insert into storage.objects(bucket_id,name) values ('car-photos','creta/1.jpg');
\echo 'T22 add car (expect INSERT 0 1):'
insert into cars(slug,name,year,km,fuel,price) values ('dzire-2017','Maruti Dzire',2017,84000,'Diesel',545000);
reset role;
\echo 'T23 status of the fake accepted offer (expect new):'
select status from offers where phone='9000033333';
\echo 'T24 price drop remembered (expect 810000 then 780000):'
update cars set price=780000 where slug='creta-2018';
select prev_price, price from cars where slug='creta-2018';
\echo '--- SETTINGS ---'
set role anon;
\echo 'T25 buyer reads business settings (expect 1 row):'
select business_name from settings;
\echo 'T26 buyer changes WhatsApp number (expect UPDATE 0):'
update settings set whatsapp='9000000000' where true;
\echo 'T27 buyer adds a second settings row (expect RLS error):'
insert into settings (id) values (2);
reset role;
set role authenticated; set request.jwt.sub='22222222-2222-2222-2222-222222222222';
\echo 'T28 logged-in stranger changes settings (expect UPDATE 0):'
update settings set whatsapp='9000000000' where true;
reset role;
set role authenticated; set request.jwt.sub='11111111-1111-1111-1111-111111111111';
\echo 'T29 owner changes WhatsApp number (expect UPDATE 1):'
update settings set whatsapp='9848012345', updated_at=now() where id=1;
\echo 'T30 owner saves invalid number (expect check error):'
update settings set whatsapp='12345' where id=1;
reset role;
\echo '--- TEST DRIVES ---'
set request.jwt.sub = '';   -- a buyer is not logged in
set role anon;
\echo 'T31 buyer requests a test drive tomorrow 10:00 (expect INSERT 0 1):'
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','9848012345',(now() at time zone 'Asia/Kolkata')::date+1,'10:00');
\echo 'T32 same slot again by someone else (expect unique error):'
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Suresh','9848012346',(now() at time zone 'Asia/Kolkata')::date+1,'10:00');
\echo 'T33 slot not offered 03:00 (expect td_bad_slot):'
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Suresh','9848012346',(now() at time zone 'Asia/Kolkata')::date+1,'03:00');
\echo 'T34 date in the past (expect td_bad_date):'
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Suresh','9848012346',(now() at time zone 'Asia/Kolkata')::date-1,'11:00');
\echo 'T35 date 60 days ahead (expect td_bad_date):'
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Suresh','9848012346',(now() at time zone 'Asia/Kolkata')::date+60,'11:00');
\echo 'T36 buyer forges status confirmed (expect INSERT ok, forced to requested):'
insert into test_drives(car_id,name,phone,drive_date,slot,status) values ('aaaaaaaa-0000-0000-0000-000000000001','Kiran','9848012347',(now() at time zone 'Asia/Kolkata')::date+2,'11:00','confirmed');
\echo 'T37 buyer reads bookings (expect 0):'
select count(*) from test_drives;
\echo 'T38 buyer sees taken slots, no names (expect 2 rows):'
select * from taken_slots('aaaaaaaa-0000-0000-0000-000000000001');
\echo 'T39 buyer cancels a booking (expect UPDATE 0):'
update test_drives set status='cancelled' where true;
\echo 'T40 4th active booking from one phone (expect td_too_many_phone on the 4th):'
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','9848012345',(now() at time zone 'Asia/Kolkata')::date+3,'11:00');
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','9848012345',(now() at time zone 'Asia/Kolkata')::date+3,'12:00');
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Ravi','9848012345',(now() at time zone 'Asia/Kolkata')::date+3,'15:00');
reset role;
\echo 'T41 forged status stored as (expect requested):'
select status from test_drives where phone='9848012347';
set role authenticated; set request.jwt.sub='11111111-1111-1111-1111-111111111111';
\echo 'T42 owner reads bookings (expect 4):'
select count(*) from test_drives;
\echo 'T43 owner cancels tomorrow 10:00 (expect UPDATE 1):'
update test_drives set status='cancelled' where slot='10:00';
reset role;
set request.jwt.sub = '';
set role anon;
\echo 'T44 cancelled slot can be booked again (expect INSERT 0 1):'
insert into test_drives(car_id,name,phone,drive_date,slot) values ('aaaaaaaa-0000-0000-0000-000000000001','Suresh','9848012346',(now() at time zone 'Asia/Kolkata')::date+1,'10:00');
reset role;
