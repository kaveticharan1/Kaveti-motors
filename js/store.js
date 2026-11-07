// Data layer. Two interchangeable back ends with the same functions:
//  • demo: sample data saved in this browser only (when config has no Supabase keys)
//  • live: Supabase database, login and photo storage
import { CONFIG } from '../config.js';
import { localISO } from './calc.js';

// Add ?demo to the address to try the app with sample cars, even when a database is connected.
export const DEMO_FORCED = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
export const LIVE = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) && !DEMO_FORCED;

const iso = (d) => localISO(d);
const MSG = {
  duplicate: 'You have already sent an offer for this car from this number.',
  closed: 'Offers are closed for this car.',
  tooMany: 'This car got many offers in the last hour. Please try again later, or WhatsApp us.',
};
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

// ───────────────────────── DEMO ─────────────────────────
function seed() {
  const mk = (slug, name, year, km, fuel, tr, own, colour, price, days, buy, loan, rate, exp, extra = {}) => {
    const id = uuid();
    return {
      car: { id, slug, name, year, km, fuel, transmission: tr, owner_no: own, colour, insurance_till: 'Mar 2027', description: '', price, status: 'available', photos: [], offers_open: true, offers_close_at: null, listed_on: daysAgo(days), sold_on: null, ...extra },
      costs: { car_id: id, buy_price: buy, loan_amount: loan, interest_rate: rate, bought_on: daysAgo(days), sold_price: null },
      expenses: exp.map(([label, amount]) => ({ id: uuid(), car_id: id, label, amount, spent_on: daysAgo(days) })),
    };
  };
  const rows = [
    mk('hyundai-creta-2018', 'Hyundai Creta 1.6 SX', 2018, 68400, 'Diesel', 'Manual', 1, 'white', 810000, 42, 720000, 600000, 15, [['Polish & detailing', 8000], ['Two new tyres', 18000], ['RC transfer', 6500]]),
    mk('toyota-innova-crysta-2017', 'Toyota Innova Crysta 2.4', 2017, 112000, 'Diesel', 'Manual', 2, 'silver', 1450000, 71, 1320000, 1000000, 14, [['Service', 22000], ['Polish', 9000]], { status: 'booked' }),
    mk('maruti-dzire-vdi-2017', 'Maruti Dzire VDI', 2017, 84000, 'Diesel', 'Manual', 1, 'red', 545000, 12, 490000, 400000, 15, [['Clutch', 9500], ['Polish', 5000]]),
    mk('mahindra-xuv500-2016', 'Mahindra XUV500 W8', 2016, 105000, 'Diesel', 'Manual', 2, 'black', 760000, 38, 690000, 550000, 15, [['Suspension', 16000], ['Polish', 7000]]),
    mk('honda-city-cvt-2019', 'Honda City V CVT', 2019, 52300, 'Petrol', 'Automatic', 1, 'blue', 925000, 19, 850000, 700000, 14, [['Polish', 6000]]),
  ];
  const creta = rows[0].car.id;
  return {
    cars: rows.map((r) => r.car),
    costs: rows.map((r) => r.costs),
    expenses: rows.flatMap((r) => r.expenses),
    offers: [
      { id: uuid(), car_id: creta, name: 'Ravi Kumar', phone: '9848012345', amount: 795000, status: 'confirmed', created_at: new Date(Date.now() - 864e5).toISOString() },
      { id: uuid(), car_id: creta, name: 'Suresh M.', phone: '9000011111', amount: 780000, status: 'new', created_at: new Date(Date.now() - 72e5).toISOString() },
      { id: uuid(), car_id: creta, name: 'Imran S.', phone: '9000022222', amount: 750000, status: 'new', created_at: new Date(Date.now() - 1728e5).toISOString() },
    ],
  };
}
// Browser storage can be blocked (private mode, some in-app browsers). Fall back to memory so the app still works.
const mem = {};
const safe = (area) => ({
  getItem: (k) => { try { return window[area].getItem(k); } catch { return mem[area + k] ?? null; } },
  setItem: (k, v) => { try { window[area].setItem(k, v); } catch { mem[area + k] = String(v); } },
  removeItem: (k) => { try { window[area].removeItem(k); } catch {} delete mem[area + k]; },
});
export const LS = safe('localStorage'), SS = safe('sessionStorage');
const KEY = 'km-demo-v1';
const load = () => { try { const d = JSON.parse(LS.getItem(KEY)); if (d && d.cars) return d; } catch {} const s = seed(); save(s); return s; };
const save = (d) => { try { LS.setItem(KEY, JSON.stringify(d)); } catch (e) { throw new Error('Phone storage is full. Remove some demo photos.'); } };
const confirmedCount = (d, id) => d.offers.filter((o) => o.car_id === id && (o.status === 'confirmed' || o.status === 'accepted')).length;

const demo = {
  async listCars() {
    const d = load();
    return d.cars.filter((c) => c.status !== 'sold').map((c) => ({ ...c, interested: confirmedCount(d, c.id) }));
  },
  async getCarBySlug(slug) {
    const d = load(); const c = d.cars.find((x) => x.slug === slug); if (!c) return null;
    return { ...c, interested: confirmedCount(d, c.id) };
  },
  async sendOffer(o) {
    const d = load(); const c = d.cars.find((x) => x.id === o.car_id);
    if (!c || c.status === 'sold' || !c.offers_open || (c.offers_close_at && new Date() > new Date(c.offers_close_at))) throw new Error(MSG.closed);
    if (d.offers.some((x) => x.car_id === o.car_id && x.phone === o.phone)) throw new Error(MSG.duplicate);
    if (d.offers.filter((x) => x.car_id === o.car_id && Date.now() - new Date(x.created_at) < 36e5).length >= 5) throw new Error(MSG.tooMany);
    d.offers.push({ car_id: o.car_id, name: o.name, phone: o.phone, amount: o.amount, id: uuid(), status: 'new', created_at: new Date().toISOString() }); save(d);
  },
  async session() { return SS.getItem('km-demo-login') ? { email: SS.getItem('km-demo-login') } : null; },
  async sendCode(email) { SS.setItem('km-demo-pending', email); },
  async verifyCode(email, code) { if (!/^\d{6,10}$/.test(code)) throw new Error('Enter the code from the email (6 to 10 digits).'); SS.setItem('km-demo-login', email); },
  async isOwner() { return !!SS.getItem('km-demo-login'); },
  async signOut() { SS.removeItem('km-demo-login'); },
  async ownerData() { return load(); },
  async saveCar(car, costs) {
    const d = load();
    if (car.id) { const old = d.cars.find((c) => c.id === car.id); if (car.price < old.price) car.prev_price = old.prev_price || old.price; else if (car.price > old.price) car.prev_price = null; Object.assign(old, car); Object.assign(d.costs.find((c) => c.car_id === car.id), costs); }
    else { car.id = uuid(); car.listed_on = iso(new Date()); car.status = 'available'; car.offers_open = car.offers_open ?? true; d.cars.unshift(car); d.costs.push({ ...costs, car_id: car.id, sold_price: null }); }
    save(d); return car.id;
  },
  async updateCar(id, patch) { const d = load(); Object.assign(d.cars.find((c) => c.id === id), patch); save(d); },
  async markSold(id, price) { const d = load(); Object.assign(d.cars.find((c) => c.id === id), { status: 'sold', sold_on: iso(new Date()) }); d.costs.find((c) => c.car_id === id).sold_price = price; save(d); },
  async deleteCar(id) { const d = load(); for (const k of ['cars']) d[k] = d[k].filter((c) => c.id !== id); for (const k of ['costs', 'expenses', 'offers']) d[k] = d[k].filter((c) => c.car_id !== id); save(d); },
  async addExpense(car_id, label, amount) { const d = load(); d.expenses.push({ id: uuid(), car_id, label, amount, spent_on: iso(new Date()) }); save(d); },
  async deleteExpense(id) { const d = load(); d.expenses = d.expenses.filter((e) => e.id !== id); save(d); },
  async setOfferStatus(id, status) { const d = load(); d.offers.find((o) => o.id === id).status = status; save(d); },
  async uploadPhotos(carId, blobs) {
    const urls = [];
    for (const b of blobs) urls.push(await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }));
    return urls;
  },
  async resetDemo() { LS.removeItem(KEY); LS.removeItem('km-settings'); },
  async getSettings() { try { return JSON.parse(LS.getItem('km-settings')) || null; } catch { return null; } },
  async saveSettings(v) { LS.setItem('km-settings', JSON.stringify(v)); },
  async changeEmail(email) { SS.setItem('km-demo-login', email); return 'changed'; },
  async identify(images) { return identifyCall(images, null); },
};

// ───────────────────────── LIVE (Supabase) ─────────────────────────
// Plain-language messages for database errors, so buyers never see technical text.
function friendly(e) {
  const m = `${e.code || ''} ${e.message || ''}`;
  if (m.includes('23505')) return MSG.duplicate;
  if (m.includes('42501')) return MSG.closed;
  if (m.includes('too_many_offers')) return MSG.tooMany;
  if (m.includes('offers_amount_check')) return 'Please check the offer amount.';
  if (m.includes('offers_phone_check')) return 'Enter a valid 10-digit mobile number.';
  if (m.includes('offers_name_check')) return 'Enter your name.';
  if (/fetch|network/i.test(m)) return 'No internet connection. Please try again.';
  return 'Something went wrong. Please try again, or WhatsApp us.';
}
let sbp;
const sb = () => (sbp ||= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(({ createClient }) =>
  createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storage: LS } })));
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const PUBLIC_COLS = 'id,slug,name,year,km,fuel,transmission,owner_no,colour,insurance_till,description,price,prev_price,status,photos,offers_open,offers_close_at,listed_on,sold_on';

const live = {
  async counts(c) { const rows = ok(await c.rpc('offer_counts')) || []; return Object.fromEntries(rows.map((r) => [r.car_id, r.interested])); },
  async listCars() {
    const c = await sb();
    const cars = ok(await c.from('cars').select(PUBLIC_COLS).neq('status', 'sold').order('listed_on', { ascending: false }));
    const n = await this.counts(c); return cars.map((x) => ({ ...x, interested: n[x.id] || 0 }));
  },
  async getCarBySlug(slug) {
    const c = await sb(); const car = ok(await c.from('cars').select(PUBLIC_COLS).eq('slug', slug).maybeSingle()); if (!car) return null;
    const n = await this.counts(c); return { ...car, interested: n[car.id] || 0 };
  },
  async sendOffer(o) {
    const c = await sb(); const { error } = await c.from('offers').insert(o); // no .select(): buyers cannot read offers back
    if (error) throw new Error(friendly(error));
  },
  async session() { const c = await sb(); const { data } = await c.auth.getSession(); return data.session ? { email: data.session.user.email } : null; },
  async sendCode(email) { const c = await sb(); ok(await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } })); },
  async verifyCode(email, token) { if (!/^\d{6,10}$/.test(token)) throw new Error('Enter the code from the email (6 to 10 digits).'); const c = await sb(); const { error } = await c.auth.verifyOtp({ email, token, type: 'email' }); if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Tap "Send code" again for a new one.' : error.message); },
  async getSettings() { const c = await sb(); return ok(await c.from('settings').select('business_name,tagline,whatsapp,phone,hero_badge,trust_points').eq('id', 1).maybeSingle()); },
  async saveSettings(v) { const c = await sb(); ok(await c.from('settings').update({ ...v, updated_at: new Date().toISOString() }).eq('id', 1)); },
  async changeEmail(email) { const c = await sb(); ok(await c.auth.updateUser({ email })); return 'confirm'; },
  async identify(images) { const c = await sb(); const { data } = await c.auth.getSession(); return identifyCall(images, data.session?.access_token); },
  async isOwner() { const c = await sb(); const rows = ok(await c.from('owners').select('user_id').limit(1)); return rows.length > 0; },
  async signOut() { const c = await sb(); await c.auth.signOut(); },
  async ownerData() {
    const c = await sb();
    const [cars, costs, expenses, offers] = await Promise.all([
      c.from('cars').select('*').order('listed_on', { ascending: false }), c.from('car_costs').select('*'),
      c.from('expenses').select('*').order('spent_on'), c.from('offers').select('*').order('amount', { ascending: false })]);
    return { cars: ok(cars), costs: ok(costs), expenses: ok(expenses), offers: ok(offers) };
  },
  async saveCar(car, costs) {
    const c = await sb();
    if (car.id) { const { id, ...rest } = car; ok(await c.from('cars').update(rest).eq('id', id)); ok(await c.from('car_costs').upsert({ ...costs, car_id: id })); return id; }
    const row = ok(await c.from('cars').insert(car).select('id').single());
    ok(await c.from('car_costs').insert({ ...costs, car_id: row.id })); return row.id;
  },
  async updateCar(id, patch) { const c = await sb(); ok(await c.from('cars').update(patch).eq('id', id)); },
  async markSold(id, price) { const c = await sb(); ok(await c.from('cars').update({ status: 'sold', sold_on: iso(new Date()) }).eq('id', id)); ok(await c.from('car_costs').update({ sold_price: price }).eq('car_id', id)); },
  async deleteCar(id) { const c = await sb(); ok(await c.from('cars').delete().eq('id', id)); },
  async addExpense(car_id, label, amount) { const c = await sb(); ok(await c.from('expenses').insert({ car_id, label, amount })); },
  async deleteExpense(id) { const c = await sb(); ok(await c.from('expenses').delete().eq('id', id)); },
  async setOfferStatus(id, status) { const c = await sb(); ok(await c.from('offers').update({ status }).eq('id', id)); },
  async uploadPhotos(carId, blobs) {
    const c = await sb(); const urls = [];
    for (const b of blobs) {
      const path = `${carId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      ok(await c.storage.from('car-photos').upload(path, b, { contentType: 'image/jpeg', cacheControl: '31536000' }));
      urls.push(c.storage.from('car-photos').getPublicUrl(path).data.publicUrl);
    }
    return urls;
  },
};

// Photo auto-fill: calls the Cloudflare function /api/identify (owner only on the live site).
async function identifyCall(images, token) {
  let r;
  try {
    r = await fetch('api/identify', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ images }) });
  } catch { throw new Error('No internet connection. Please try again.'); }
  if ([404, 405, 501].includes(r.status)) throw new Error('Photo detection starts working after the app moves to Cloudflare (see README).');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Could not read the photo. Please fill the details by hand.');
  return j;
}

export const store = LIVE ? live : demo;
