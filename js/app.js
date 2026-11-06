import { CONFIG } from '../config.js';
import { store, LIVE } from './store.js';
import { costSheet, inr, lakh, kmFmt, localISO } from './calc.js';
import { ic, esc, photo, toast, compressImage, slugify } from './ui.js';

const $app = document.getElementById('app');
const digits = (s) => String(s || '').replace(/\D/g, '');
const num = (s) => Number(digits(s) || 0);
const carUrl = (slug) => `${location.origin}${location.pathname}#/car/${slug}`;
const ownerLabel = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;
const go = (h) => { location.hash = h; };
const demoBar = () => (LIVE ? '' : '<div class="demo">Demo mode · sample cars saved on this phone only</div>');
const initials = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const ago = (t) => { const h = Math.round((Date.now() - new Date(t)) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h} hr${h > 1 ? 's' : ''} ago` : `${Math.round(h / 24)} day${h >= 48 ? 's' : ''} ago`; };
const left = (t) => { const ms = new Date(t) - Date.now(); if (ms <= 0) return null; const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5); return d ? `${d} day${d > 1 ? 's' : ''} ${h} hrs` : `${h} hrs ${Math.floor((ms % 36e5) / 6e4)} min`; };
function render(html) { $app.innerHTML = html; window.scrollTo(0, 0); }
function fail(e) { console.error(e); toast(e.message || 'Something went wrong. Please try again.'); }

// ═════════════════════════ BUYERS ═════════════════════════
const ui = { q: '', f: 'all' };
const FILTERS = [['all', 'All cars'], ['Diesel', 'Diesel'], ['Petrol', 'Petrol'], ['CNG', 'CNG'], ['u6', 'Under ₹6L'], ['u10', 'Under ₹10L']];

async function showroom() {
  const cars = await store.listCars();
  const draw = () => {
    const q = ui.q.trim().toLowerCase();
    const list = cars.filter((c) => (!q || `${c.name} ${c.year} ${c.fuel}`.toLowerCase().includes(q))
      && (ui.f === 'all' || c.fuel === ui.f || (ui.f === 'u6' && c.price < 600000) || (ui.f === 'u10' && c.price < 1000000)));
    document.getElementById('grid').innerHTML = list.length ? list.map(card).join('')
      : `<div class="empty">No cars match. Try another filter, or WhatsApp us what you are looking for.</div>`;
    document.getElementById('count').textContent = `${list.length} car${list.length === 1 ? '' : 's'}`;
    document.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.f === ui.f));
  };
  render(`${demoBar()}<div class="brand"><div class="l"><img class="mark" src="icons/logo.svg" alt="${esc(CONFIG.businessName)} logo"><div><b>${esc(CONFIG.businessName)}</b><small>${esc(CONFIG.tagline)}</small></div></div><a class="round" href="https://wa.me/${CONFIG.whatsapp}" aria-label="WhatsApp us">${ic('chat')}</a></div>
  <label class="search">${ic('search')}<input id="q" type="search" placeholder="Search Creta, Innova, Swift…" value="${esc(ui.q)}" autocomplete="off"></label>
  <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip" data-f="${k}">${l}</button>`).join('')}</div>
  <div class="sect"><b>Available now</b><small id="count"></small></div><div id="grid"></div>
  <div class="foot">${esc(CONFIG.businessName)} · <a href="#/owner">Owner login</a></div>`);
  document.getElementById('q').addEventListener('input', (e) => { ui.q = e.target.value; draw(); });
  document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { ui.f = b.dataset.f; draw(); }));
  draw();
}
function card(c) {
  return `<a class="car" href="#/car/${esc(c.slug)}"><div class="ph">${photo(c, c.photos[0])}<span class="tag">${ic('fuel', 'sm')}${esc(c.fuel)}</span>${c.status === 'booked' ? '<span class="tag bk">Booked</span>' : ''}</div>
  <div class="bd"><div class="nm">${esc(c.name)}</div><div class="meta"><span>${c.year}</span><span>${kmFmt(c.km)} km</span><span>${ownerLabel(c.owner_no)} owner</span><span>${esc(c.transmission)}</span></div>
  <div class="pr"><b>${lakh(c.price)}</b>${c.interested ? `<small>${ic('users', 'sm')}${c.interested} interested</small>` : ''}</div></div></a>`;
}

async function carPage(slug) {
  const c = await store.getCarBySlug(slug);
  if (!c) return render(`<div class="topbar"><a class="round" href="#/">${ic('back')}</a><b>Car not found</b></div><div class="empty">This car may have been sold. <a href="#/" style="color:var(--p)">See all cars</a></div>`);
  const pics = c.photos.length ? c.photos : [null];
  const open = c.status !== 'sold' && c.offers_open && (!c.offers_close_at || new Date(c.offers_close_at) > new Date());
  const wa = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(`Hi, I am interested in the ${c.name} (${c.year}, ${kmFmt(c.km)} km) listed at ${lakh(c.price)}.\n${carUrl(c.slug)}`)}`;
  document.title = `${c.name} ${c.year} · ${lakh(c.price)} · ${CONFIG.businessName}`;
  render(`${demoBar()}<div class="gallery"><div class="track" id="trk">${pics.map((p) => `<div>${photo(c, p)}</div>`).join('')}</div>
  <a class="gbtn" style="left:16px" href="#/" aria-label="Back">${ic('back')}</a><button class="gbtn" style="right:16px" id="share" aria-label="Share">${ic('share')}</button><span class="cnt" id="cnt">1 / ${pics.length}</span></div>
  <div class="dt"><h1>${esc(c.name)}</h1><div class="row"><span class="price">${lakh(c.price)}</span>${c.interested ? `<span class="interest">${ic('users', 'sm')}${c.interested} ${c.interested === 1 ? 'person' : 'people'} interested</span>` : ''}</div>
  ${c.status === 'booked' ? '<span class="status">Booked · you can still make a backup offer</span>' : ''}${c.status === 'sold' ? '<span class="status">Sold</span>' : ''}</div>
  <div class="specs">${[['cal', 'Year', c.year], ['gauge', 'Driven', kmFmt(c.km) + ' km'], ['fuel', 'Fuel', c.fuel], ['user', 'Owner', ownerLabel(c.owner_no)], ['gear', 'Gearbox', c.transmission], ['shield', 'Insurance', c.insurance_till || '—']]
    .map(([i, l, v]) => `<div class="sp">${ic(i)}<small>${l}</small><b>${esc(v)}</b></div>`).join('')}</div>
  ${c.colour ? `<div class="desc"><b style="color:var(--ink)">Colour:</b> ${esc(c.colour)}</div>` : ''}${c.description ? `<div class="desc">${esc(c.description)}</div>` : ''}
  <div class="bar">${open ? `<button class="b pri" id="offer" style="margin-bottom:10px">${ic('tag')}Make an offer</button>` : ''}
  <div class="btns"><a class="b wa" href="${wa}" target="_blank" rel="noopener">${ic('chat')}WhatsApp</a><a class="b ghost" href="tel:${esc(CONFIG.phone)}">${ic('phone')}Call</a></div></div>`);
  const trk = document.getElementById('trk');
  trk.addEventListener('scroll', () => { document.getElementById('cnt').textContent = `${Math.round(trk.scrollLeft / trk.clientWidth) + 1} / ${pics.length}`; });
  document.getElementById('share').addEventListener('click', async () => {
    const data = { title: `${c.name} ${c.year}`, text: `${c.name} · ${c.year} · ${kmFmt(c.km)} km · ${lakh(c.price)}`, url: carUrl(c.slug) };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text}\n${data.url}`); toast('Link copied. Paste it in WhatsApp.'); } } catch {}
  });
  if (open) document.getElementById('offer').addEventListener('click', () => offerSheet(c));
}

function offerSheet(c) {
  const r5 = (n) => Math.round(n / 5000) * 5000;
  const quick = [r5(c.price * 0.95), r5(c.price * 0.97), c.price];
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="scrim"></div><form class="sheet" novalidate><div class="grab"></div><h2>Make an offer</h2>
  <div class="mini"><div class="th">${photo(c, c.photos[0])}</div><div><b>${esc(c.name)}</b><small>Asking price ${lakh(c.price)}</small></div></div>
  <div class="amt"><small>Your offer (₹)</small><input id="amt" inputmode="numeric" placeholder="₹0" autocomplete="off"></div>
  <div class="quick">${quick.map((v, i) => `<button type="button" data-v="${v}">${i === 2 ? 'Full price' : lakh(v)}</button>`).join('')}</div>
  <div class="fl"><label for="nm">Your name</label><input class="fi" id="nm" autocomplete="name" maxlength="60"></div>
  <div class="fl"><label for="ph">Mobile number</label><input class="fi" id="ph" inputmode="tel" autocomplete="tel" placeholder="10-digit number" maxlength="17"></div>
  <div class="info">${ic('lock', 'sm')}<span>Your offer is private: other buyers never see it. ${esc(CONFIG.businessName)} will call you to confirm.${c.offers_close_at ? ` Offers close <b>${new Date(c.offers_close_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</b>.` : ''}</span></div>
  <div class="err" id="err"></div><button class="b pri" style="margin-top:14px" id="send">Send offer</button></form>`;
  document.body.appendChild(wrap);
  const $ = (id) => wrap.querySelector('#' + id);
  const fmt = () => { const v = num($('amt').value); $('amt').value = v ? '₹' + v.toLocaleString('en-IN') : ''; };
  $('amt').addEventListener('input', fmt);
  wrap.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { $('amt').value = b.dataset.v; fmt(); }));
  wrap.querySelector('.scrim').addEventListener('click', () => wrap.remove());
  wrap.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = num($('amt').value), name = $('nm').value.trim(), phone = digits($('ph').value).replace(/^(91|0)(?=\d{10}$)/, '');
    const err = amount < 10000 ? 'Enter your offer amount.' : name.length < 2 ? 'Enter your name.' : !/^[6-9]\d{9}$/.test(phone) ? 'Enter a valid 10-digit mobile number.' : '';
    if (err) { $('err').textContent = err; return; }
    $('send').disabled = true; $('send').textContent = 'Sending…';
    try {
      await store.sendOffer({ car_id: c.id, name, phone, amount });
      wrap.querySelector('form').innerHTML = `<div class="grab"></div><div style="text-align:center;padding:16px 0 4px"><div class="round" style="margin:0 auto;width:60px;height:60px;background:var(--gbg);color:var(--g)">${ic('check')}</div><h2 style="margin-top:14px">Offer sent</h2><p class="desc" style="margin:8px 0 0">We received your offer of <b>${inr(amount)}</b>. You will get a call on ${phone.slice(0, 5)} ${phone.slice(5)} soon.</p><button type="button" class="b ghost" style="margin-top:18px" id="done">Done</button></div>`;
      wrap.querySelector('#done').addEventListener('click', () => { wrap.remove(); route(); });
    } catch (ex) { $('err').textContent = ex.message; $('send').disabled = false; $('send').textContent = 'Send offer'; }
  });
}

// ═════════════════════════ OWNER ═════════════════════════
async function guard() {
  const s = await store.session();
  if (!s) { go('#/owner/login'); return false; }
  if (!(await store.isOwner())) {
    render(`<div class="login"><img class="mark" src="icons/logo.svg" alt="${esc(CONFIG.businessName)} logo"><h1>Almost there</h1><p>You are logged in as <b>${esc(s.email)}</b>, but this account is not set as the owner yet. Run the last step of the setup guide (make this email the owner), then reopen the app.</p><button class="b ghost" id="out">Log out</button></div>`);
    document.getElementById('out').onclick = async () => { await store.signOut(); go('#/'); };
    return false;
  }
  return true;
}
function nav(active, newOffers) {
  const t = (k, h, i, l, extra = '') => `<a href="${h}" class="${active === k ? 'on' : ''}">${ic(i)}${l}${extra}</a>`;
  return `<nav class="nav">${t('home', '#/owner', 'home', 'Home')}${t('stock', '#/owner/stock', 'car', 'Stock')}<a href="#/owner/add" aria-label="Add car"><span class="add">${ic('plus')}</span></a>${t('offers', '#/owner/offers', 'tag', 'Offers', newOffers ? `<span class="nb">${newOffers}</span>` : '')}${t('more', '#/owner/more', 'user', 'More')}</nav>`;
}
function enrich(d) {
  return d.cars.map((c) => {
    const costs = d.costs.find((x) => x.car_id === c.id), exp = d.expenses.filter((x) => x.car_id === c.id), offers = d.offers.filter((x) => x.car_id === c.id);
    return { ...c, costs, exp, offers, cs: costSheet(c, costs, exp) };
  });
}

async function login() {
  if (await store.session()) return go('#/owner');
  render(`${demoBar()}<div class="login"><img class="mark" src="icons/logo.svg" alt="${esc(CONFIG.businessName)} logo"><h1>Owner login</h1><p>Enter your email. We will send a 6-digit code: no password to remember.</p>
  <form id="f1"><div class="fl"><label for="em">Email</label><input class="fi" id="em" type="email" autocomplete="email" required></div><button class="b pri" id="b1">Send code</button></form>
  <form id="f2" class="hide"><div class="fl"><label for="cd">6-digit code</label><input class="fi" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="letter-spacing:.3em;font-size:22px;text-align:center"></div><button class="b pri" id="b2">Log in</button><p class="hint" id="sent"></p></form>
  <div class="err" id="err"></div><div class="foot"><a href="#/">Back to showroom</a></div></div>`);
  const $ = (id) => document.getElementById(id); let email = '';
  $('f1').onsubmit = async (e) => { e.preventDefault(); email = $('em').value.trim(); $('b1').disabled = true; $('err').textContent = '';
    try { await store.sendCode(email); $('f1').classList.add('hide'); $('f2').classList.remove('hide'); $('sent').textContent = LIVE ? `Code sent to ${email}. Check your inbox and spam folder.` : 'Demo mode: type any 6 digits.'; $('cd').focus(); }
    catch (ex) { $('err').textContent = ex.message; $('b1').disabled = false; } };
  $('f2').onsubmit = async (e) => { e.preventDefault(); $('b2').disabled = true; $('err').textContent = '';
    try { await store.verifyCode(email, digits($('cd').value)); go('#/owner'); } catch (ex) { $('err').textContent = ex.message; $('b2').disabled = false; } };
}

async function dashboard() {
  if (!(await guard())) return;
  const all = enrich(await store.ownerData()), stock = all.filter((c) => c.status !== 'sold').sort((a, b) => b.cs.days - a.cs.days);
  const locked = stock.reduce((a, c) => a + c.cs.total, 0), perDay = stock.reduce((a, c) => a + c.cs.perDay, 0);
  const newOffers = all.flatMap((c) => c.offers).filter((o) => o.status === 'new').length;
  const m = localISO().slice(0, 7), soldMonth = all.filter((c) => c.status === 'sold' && (c.sold_on || '').startsWith(m)).length;
  const red = stock.filter((c) => c.cs.age === 'r'), hour = new Date().getHours();
  render(`${demoBar()}<div class="ohead"><div><small>${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}</small><b>Your stock</b></div><a class="round" href="#/" aria-label="Open showroom">${ic('share')}</a></div>
  <div class="hero2"><small>Money in stock · ${stock.length} car${stock.length === 1 ? '' : 's'}</small><div class="v">${lakh(locked)}</div><div class="sub"><div>Interest / day<b>${inr(perDay)}</b></div><div>New offers<b>${newOffers}</b></div><div>Sold this month<b>${soldMonth}</b></div></div></div>
  ${red.map((c) => `<a class="alert" href="#/owner/car/${c.id}"><div class="ic3">${ic('alert')}</div><div><b>${esc(c.name)}: ${c.cs.days} days in stock</b><small>Interest so far ${inr(c.cs.interest)} · tap to review price</small></div></a>`).join('')}
  ${newOffers ? `<a class="alert blu" href="#/owner/offers"><div class="ic3">${ic('tag')}</div><div><b>${newOffers} new offer${newOffers > 1 ? 's' : ''} to call back</b><small>Confirm them by phone to count them</small></div></a>` : ''}
  <div class="sect"><b>Stock, oldest first</b><a href="#/owner/stock">See all</a></div>
  <div class="list">${stock.length ? stock.map(row).join('') : '<div class="empty">No cars yet. Tap + to add your first car.</div>'}</div>${nav('home', newOffers)}`);
}
const nice = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const row = (c) => `<a class="it" href="#/owner/car/${c.id}"><div class="th">${photo(c, c.photos[0])}</div><div class="m"><b>${esc(c.name)}</b><small>${c.status === 'sold' ? `Sold ${nice(c.sold_on)}` : `Cost so far ${inr(c.cs.total)}`}</small></div>${c.status === 'sold' ? '<span class="pill n">Sold</span>' : `<span class="pill ${c.cs.age}">${c.cs.days} days</span>`}</a>`;

async function stockPage() {
  if (!(await guard())) return;
  const all = enrich(await store.ownerData()); let tab = 'stock';
  const draw = () => {
    const list = all.filter((c) => (tab === 'sold' ? c.status === 'sold' : c.status !== 'sold')).sort((a, b) => b.cs.days - a.cs.days);
    document.getElementById('lst').innerHTML = list.length ? list.map(row).join('') : '<div class="empty">Nothing here yet.</div>';
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  };
  render(`${demoBar()}<div class="topbar"><b>All cars</b></div><div class="fl"><div class="seg"><button data-t="stock">In stock</button><button data-t="sold">Sold</button></div></div><div class="sect" style="padding-top:14px"></div><div class="list" id="lst"></div>${nav('stock', all.flatMap((c) => c.offers).filter((o) => o.status === 'new').length)}`);
  document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
  draw();
}

async function costPage(id) {
  if (!(await guard())) return;
  const all = enrich(await store.ownerData()), c = all.find((x) => x.id === id);
  if (!c) return go('#/owner');
  const s = c.cs, max = CONFIG.redAfter * 1.5, pos = Math.min(100, (s.days / max) * 100);
  const a1 = (CONFIG.amberAfter / max) * 100, a2 = (CONFIG.redAfter / max) * 100;
  const live = c.offers.filter((o) => o.status !== 'rejected').length;
  render(`${demoBar()}<div class="topbar"><a class="round" href="#/owner">${ic('back')}</a><b>Cost sheet</b><a class="round" href="#/owner/edit/${c.id}" aria-label="Edit">${ic('edit')}</a></div>
  <div class="ocar"><div class="th">${photo(c, c.photos[0])}</div><div><b>${esc(c.name)}</b><small>${c.costs?.loan_amount ? `Loan ${lakh(c.costs.loan_amount)} at ${c.costs.interest_rate}% a year` : 'No loan on this car'}</small></div></div>
  <div class="big"><small>${c.status === 'sold' ? 'Total cost' : 'No-loss price today'}</small><div class="v">${inr(s.total)}</div>
  <div class="track2" style="background:linear-gradient(90deg,#22C55E 0 ${a1}%,#F59E0B ${a1}% ${a2}%,#EF4444 ${a2}%)"><i style="left:${pos}%"></i></div><div class="tl"><span>0</span><span>${CONFIG.amberAfter} days</span><span>${CONFIG.redAfter} days</span><span>${max}</span></div>
  <div style="font-size:13.5px;margin-top:10px;color:var(--ink2)"><b style="color:var(--ink)">${s.days} days in stock.</b>${s.perDay ? ` Each extra day adds <b style="color:var(--r)">${inr(s.perDay)}</b>.` : ''}</div></div>
  <div class="kv"><div><small>Asking price</small><b>${inr(c.price)}</b></div><div><small>${c.status === 'sold' ? 'Profit on sale' : 'Profit if sold today'}</small><b style="color:${(c.status === 'sold' ? (c.costs?.sold_price || 0) - s.total : s.profit) >= 0 ? 'var(--g)' : 'var(--r)'}">${inr(c.status === 'sold' ? (c.costs?.sold_price || 0) - s.total : s.profit)}</b></div></div>
  <div class="rows"><div class="rw"><span>Bought for</span><span>${inr(c.costs?.buy_price || 0)}</span></div>
  ${c.exp.map((e) => `<div class="rw"><span>${esc(e.label)}</span><span>${inr(e.amount)}<button class="x" data-del="${e.id}" aria-label="Remove">${ic('x', 'sm')}</button></span></div>`).join('')}
  <div class="rw"><span>Interest, ${s.days} days</span><span>${inr(s.interest)}</span></div><div class="rw t"><span>Total cost</span><span>${inr(s.total)}</span></div></div>
  <form id="ex" class="fl"><label>Add an expense</label><div class="two" style="grid-template-columns:1.4fr 1fr auto;display:grid;gap:8px"><input class="fi" id="el" placeholder="e.g. Tyres" maxlength="60"><input class="fi" id="ea" inputmode="numeric" placeholder="₹ amount"><button class="b pri" style="width:50px;padding:0" aria-label="Add">${ic('plus')}</button></div></form>
  <div class="actions"><a class="b ghost sm" href="#/owner/offers/${c.id}">${ic('tag', 'sm')}Offers (${live})</a><a class="b ghost sm" href="#/car/${esc(c.slug)}">${ic('car', 'sm')}Showroom page</a>
  ${c.status === 'sold' ? `<button class="b ghost sm" data-st="available">Mark available</button>` : `<button class="b ghost sm" data-st="${c.status === 'booked' ? 'available' : 'booked'}">${c.status === 'booked' ? 'Unbook' : 'Mark booked'}</button><button class="b green sm" id="sold">${ic('check', 'sm')}Mark sold</button>`}
  </div><div class="actions" style="grid-template-columns:1fr"><button class="b red sm" id="del">${ic('trash', 'sm')}Delete car</button></div>${nav('', 0)}`);
  document.getElementById('ex').onsubmit = async (e) => { e.preventDefault(); const l = document.getElementById('el').value.trim(), a = num(document.getElementById('ea').value);
    if (!l || !a) return toast('Enter what it was for and the amount.'); try { await store.addExpense(c.id, l, a); toast('Expense added'); costPage(id); } catch (ex) { fail(ex); } };
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Remove this expense?')) { try { await store.deleteExpense(b.dataset.del); costPage(id); } catch (ex) { fail(ex); } } }));
  document.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => { try { await store.updateCar(c.id, { status: b.dataset.st, ...(b.dataset.st === 'available' ? { sold_on: null } : {}) }); costPage(id); } catch (ex) { fail(ex); } }));
  document.getElementById('sold')?.addEventListener('click', () => soldSheet(c));
  document.getElementById('del').onclick = async () => { if (confirm(`Delete ${c.name} and all its costs and offers? This cannot be undone.`)) { try { await store.deleteCar(c.id); toast('Car deleted'); go('#/owner'); } catch (ex) { fail(ex); } } };
}

function soldSheet(c) {
  const best = c.offers.find((o) => o.status === 'accepted') || c.offers.filter((o) => o.status !== 'rejected').sort((a, b) => b.amount - a.amount)[0];
  const w = document.createElement('div');
  w.innerHTML = `<div class="scrim"></div><form class="sheet"><div class="grab"></div><h2>Mark as sold</h2><div class="mini"><div class="th">${photo(c, c.photos[0])}</div><div><b>${esc(c.name)}</b><small>No-loss price ${inr(c.cs.total)}</small></div></div>
  <div class="amt"><small>Sold for (₹)</small><input id="sp" inputmode="numeric" value="₹${(best ? best.amount : c.price).toLocaleString('en-IN')}"></div><p class="hint" id="pf" style="text-align:center;margin-top:10px"></p>
  <button class="b green" style="margin-top:16px">Confirm sale</button></form>`;
  document.body.appendChild(w);
  const sp = w.querySelector('#sp'), pf = w.querySelector('#pf');
  const upd = () => { const v = num(sp.value); sp.value = v ? '₹' + v.toLocaleString('en-IN') : ''; const p = v - c.cs.total; pf.innerHTML = v ? `<b style="color:${p >= 0 ? 'var(--g)' : 'var(--r)'};font-size:14px">${p >= 0 ? 'Profit' : 'Loss'} ${inr(Math.abs(p))}</b>` : ''; };
  sp.oninput = upd; upd();
  w.querySelector('.scrim').onclick = () => w.remove();
  w.querySelector('form').onsubmit = async (e) => { e.preventDefault(); const v = num(sp.value); if (!v) return;
    try { await store.markSold(c.id, v); w.remove(); toast('Marked as sold. Well done!'); costPage(c.id); } catch (ex) { fail(ex); } };
}

async function offersPage(id) {
  if (!(await guard())) return;
  const all = enrich(await store.ownerData()), newCount = all.flatMap((c) => c.offers).filter((o) => o.status === 'new').length;
  if (!id) {
    const withOffers = all.filter((c) => c.offers.length).sort((a, b) => b.offers.filter((o) => o.status === 'new').length - a.offers.filter((o) => o.status === 'new').length);
    return render(`${demoBar()}<div class="topbar"><b>Offers</b></div><div class="sect" style="padding-top:14px"><b>Cars with offers</b></div><div class="list">${withOffers.length ? withOffers.map((c) => {
      const top = Math.max(...c.offers.filter((o) => o.status !== 'rejected').map((o) => o.amount), 0), n = c.offers.filter((o) => o.status === 'new').length;
      return `<a class="it" href="#/owner/offers/${c.id}"><div class="th">${photo(c, c.photos[0])}</div><div class="m"><b>${esc(c.name)}</b><small>${c.offers.length} offer${c.offers.length > 1 ? 's' : ''}${top ? ` · best ${inr(top)}` : ''}</small></div>${n ? `<span class="pill a">${n} new</span>` : ''}</a>`; }).join('') : '<div class="empty">No offers yet. Share your car links on WhatsApp to get buyers.</div>'}</div>${nav('offers', newCount)}`);
  }
  const c = all.find((x) => x.id === id); if (!c) return go('#/owner/offers');
  const offers = [...c.offers].sort((a, b) => (a.status === 'rejected') - (b.status === 'rejected') || b.amount - a.amount);
  const tl = c.offers_close_at && left(c.offers_close_at);
  render(`${demoBar()}<div class="topbar"><a class="round" href="#/owner/offers">${ic('back')}</a><b>Offers</b></div>
  <a class="ocar" href="#/owner/car/${c.id}"><div class="th">${photo(c, c.photos[0])}</div><div><b>${esc(c.name)}</b><small>Asking ${lakh(c.price)} · No-loss price ${inr(c.cs.total)}</small></div></a>
  <div class="timer">${ic('clock', 'sm')}${!c.offers_open ? 'Offers are closed for this car' : tl ? `Offers close in ${tl}` : c.offers_close_at ? 'Offer deadline has passed' : 'Offers open, no deadline'}</div>
  ${offers.length ? offers.map((o, i) => {
    const pf = o.amount - c.cs.total, best = i === 0 && o.status !== 'rejected';
    const main = o.status === 'new' ? `<button data-s="confirmed" data-id="${o.id}">${ic('check', 'sm')}Called</button>` : o.status === 'confirmed' ? `<button data-s="accepted" data-id="${o.id}" style="background:var(--g);color:#fff">${ic('check', 'sm')}Accept</button>` : o.status === 'accepted' ? `<span style="background:var(--gbg);color:var(--g)">Accepted</span>` : `<button data-s="new" data-id="${o.id}">Restore</button>`;
    return `<div class="off ${best ? 'best' : ''} ${o.status === 'rejected' ? 'dim' : ''}">${best ? '<span class="ribbon">BEST OFFER</span>' : ''}<div class="top"><div class="who"><div class="ava">${esc(initials(o.name))}</div><div><b>${esc(o.name)}</b><small>${o.status === 'new' ? 'Not called yet' : o.status === 'confirmed' ? 'Called · confirmed' : o.status === 'accepted' ? 'Accepted' : 'Rejected'} · ${ago(o.created_at)}</small></div></div>
    <div class="amt2"><b>${inr(o.amount)}</b><small style="color:${pf >= 0 ? 'var(--g)' : 'var(--r)'}">${pf >= 0 ? 'Profit ' : 'Loss '}${inr(Math.abs(pf))}</small></div></div>
    <div class="acts">${main}<a href="tel:+91${esc(o.phone)}">${ic('phone', 'sm')}Call</a><a href="https://wa.me/91${esc(o.phone)}" target="_blank" rel="noopener">${ic('chat', 'sm')}WhatsApp</a></div>
    ${o.status !== 'rejected' && o.status !== 'accepted' ? `<button class="hint" data-s="rejected" data-id="${o.id}" style="margin-top:10px;color:var(--r);font-weight:600">Reject this offer</button>` : ''}</div>`; }).join('') : '<div class="empty">No offers yet for this car.</div>'}
  ${nav('offers', newCount)}`);
  document.querySelectorAll('[data-s]').forEach((b) => (b.onclick = async () => {
    try {
      await store.setOfferStatus(b.dataset.id, b.dataset.s);
      if (b.dataset.s === 'accepted' && c.status === 'available') await store.updateCar(c.id, { status: 'booked' });
      toast(b.dataset.s === 'accepted' ? 'Offer accepted. Car marked as booked.' : b.dataset.s === 'confirmed' ? 'Marked as called' : 'Updated');
      offersPage(id);
    } catch (ex) { fail(ex); }
  }));
}

async function carForm(id) {
  if (!(await guard())) return;
  const d = id ? enrich(await store.ownerData()).find((x) => x.id === id) : null;
  if (id && !d) return go('#/owner');
  const today = localISO();
  const f = d ? { ...d, ...(d.costs || {}), photos: [...d.photos], newPhotos: [] }
    : { name: '', year: '', km: '', fuel: 'Diesel', transmission: 'Manual', owner_no: 1, colour: '', insurance_till: '', price: '', description: '', buy_price: '', bought_on: today, loan_amount: '', interest_rate: '', offers_open: true, offers_close_at: '', photos: [], newPhotos: [] };
  let step = 1;
  const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map((o) => `<button type="button" data-v="${o}" class="${String(f[k]) === String(o) ? 'on' : ''}">${o}</button>`).join('')}</div>`;
  const inp = (k, l, attrs = '', hint = '') => `<div class="fl"><label for="${k}">${l}</label><input class="fi" id="${k}" value="${esc(f[k] ?? '')}" ${attrs}>${hint}</div>`;
  const moneyHint = (k) => `<p class="hint" data-h="${k}">${num(f[k]) ? lakh(num(f[k])) : ''}</p>`;
  const draw = () => {
    const pics = [...f.photos.map((u, i) => ({ u, i, old: true })), ...f.newPhotos.map((p, i) => ({ u: p.url, i, old: false }))];
    const body = step === 1 ? `<div class="slabel">Step 1 of 3</div><div class="stitle">Photos and details</div>
      <div class="pg">${pics.map((p) => `<div><img src="${esc(p.u)}" alt=""><button type="button" data-rm="${p.old ? 'o' : 'n'}${p.i}" aria-label="Remove photo">${ic('x', 'sm')}</button></div>`).join('')}</div>
      <label class="cam">${ic('camera')}${pics.length ? 'Add more photos' : 'Add photos'}<input type="file" id="pick" accept="image/*" multiple hidden></label>
      ${inp('name', 'Car name and model', 'maxlength="80" placeholder="e.g. Maruti Swift VDI"')}
      <div class="fl two"><div><label for="year">Year</label><input class="fi" id="year" inputmode="numeric" maxlength="4" value="${esc(f.year)}"></div><div><label for="km">KM driven</label><input class="fi" id="km" inputmode="numeric" value="${esc(f.km)}"></div></div>
      <div class="fl"><label>Fuel</label>${seg('fuel', ['Diesel', 'Petrol', 'CNG'])}</div>
      <div class="fl"><label>Gearbox</label>${seg('transmission', ['Manual', 'Automatic'])}</div>
      <div class="fl"><label>Owner</label>${seg('owner_no', [1, 2, 3, 4])}</div>
      <div class="fl two"><div><label for="colour">Colour</label><input class="fi" id="colour" value="${esc(f.colour || '')}" maxlength="20"></div><div><label for="insurance_till">Insurance till</label><input class="fi" id="insurance_till" value="${esc(f.insurance_till || '')}" placeholder="e.g. Mar 2027" maxlength="20"></div></div>
      ${inp('price', 'Asking price (₹)', 'inputmode="numeric"', moneyHint('price'))}
      <div class="fl"><label for="description">Notes for buyers (optional)</label><textarea class="fi" id="description" maxlength="500" placeholder="Single owner, all service records, new tyres…">${esc(f.description || '')}</textarea></div>`
      : step === 2 ? `<div class="slabel">Step 2 of 3</div><div class="stitle">Buying cost</div><p class="desc">Only you can see this. Add repair and other expenses later on the cost sheet.</p>
      ${inp('buy_price', 'Bought for (₹)', 'inputmode="numeric"', moneyHint('buy_price'))}${inp('bought_on', 'Bought on', 'type="date"')}`
      : `<div class="slabel">Step 3 of 3</div><div class="stitle">Loan and offers</div><p class="desc">Interest is counted every day from the date you bought the car. Leave empty if there is no loan.</p>
      ${inp('loan_amount', 'Loan amount (₹)', 'inputmode="numeric"', moneyHint('loan_amount'))}${inp('interest_rate', 'Interest rate (% per year)', 'inputmode="decimal" placeholder="e.g. 15"')}
      <div class="fl"><label>Accept offers from buyers?</label>${seg('offers_open', ['Yes', 'No']).replace(/data-v="(Yes|No)" class="[^"]*"/g, (m, v) => `data-v="${v}" class="${(v === 'Yes') === !!f.offers_open ? 'on' : ''}"`)}</div>
      ${inp('offers_close_at', 'Offers close on (optional)', `type="datetime-local"`, '<p class="hint">Use this when several buyers are interested.</p>')}`;
    render(`<div class="topbar"><button class="round" id="cancel">${ic(step === 1 ? 'x' : 'back')}</button><b>${d ? 'Edit car' : 'Add a car'}</b></div><div class="steps">${[1, 2, 3].map((s) => `<span class="${s <= step ? 'on' : ''}"></span>`).join('')}</div>${body}
    <div class="err" id="err" style="margin:10px 20px 0"></div><div class="bar"><button class="b pri" id="next">${step < 3 ? `Next: ${step === 1 ? 'buying cost' : 'loan and offers'}` : d ? 'Save changes' : 'Save and publish'}</button></div>`);
    const $ = (s) => document.getElementById(s);
    if (f.offers_close_at && $('offers_close_at')) { const t = new Date(f.offers_close_at); if (!isNaN(t)) $('offers_close_at').value = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); else $('offers_close_at').value = f.offers_close_at; }
    document.querySelectorAll('.seg').forEach((s) => s.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      const k = s.dataset.k; f[k] = k === 'owner_no' ? Number(b.dataset.v) : k === 'offers_open' ? b.dataset.v === 'Yes' : b.dataset.v;
      s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); })));
    document.querySelectorAll('[data-h]').forEach((h) => $(h.dataset.h).addEventListener('input', (e) => { h.textContent = num(e.target.value) ? lakh(num(e.target.value)) : ''; }));
    $('pick')?.addEventListener('change', async (e) => {
      for (const file of e.target.files) { try { const blob = await compressImage(file, LIVE ? 1280 : 640, LIVE ? 0.72 : 0.6); f.newPhotos.push({ blob, url: URL.createObjectURL(blob) }); } catch (ex) { fail(ex); } }
      collect(); draw();
    });
    document.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { collect(); const t = b.dataset.rm[0], i = +b.dataset.rm.slice(1); (t === 'o' ? f.photos : f.newPhotos).splice(i, 1); draw(); }));
    $('cancel').onclick = () => { collect(); if (step > 1) { step--; draw(); } else history.back(); };
    $('next').onclick = async () => {
      collect(); const err = validate(); if (err) { $('err').textContent = err; return; }
      if (step < 3) { step++; return draw(); }
      $('next').disabled = true; $('next').textContent = 'Saving…';
      try {
        const slug = d ? d.slug : slugify(f.name, f.year);
        const uploaded = f.newPhotos.length ? await store.uploadPhotos(slug, f.newPhotos.map((p) => p.blob)) : [];
        const car = { name: f.name.trim(), year: num(f.year), km: num(f.km), fuel: f.fuel, transmission: f.transmission, owner_no: Number(f.owner_no), colour: f.colour.trim() || null, insurance_till: f.insurance_till.trim() || null,
          description: f.description.trim() || null, price: num(f.price), photos: [...f.photos, ...uploaded], offers_open: !!f.offers_open, offers_close_at: f.offers_close_at ? new Date(f.offers_close_at).toISOString() : null };
        if (d) car.id = d.id; else car.slug = slug;
        const costs = { buy_price: num(f.buy_price), bought_on: f.bought_on || today, loan_amount: num(f.loan_amount), interest_rate: Number(String(f.interest_rate || 0).replace(/[^\d.]/g, '')) || 0 };
        const newId = await store.saveCar(car, costs);
        toast(d ? 'Changes saved' : 'Car added to the showroom'); go(`#/owner/car/${newId}`);
      } catch (ex) { fail(ex); $('next').disabled = false; $('next').textContent = 'Try again'; }
    };
  };
  const collect = () => { document.querySelectorAll('.fi').forEach((el) => { if (el.id && el.id in f) f[el.id] = el.value; }); };
  const validate = () => {
    if (step === 1) {
      if (f.name.trim().length < 2) return 'Enter the car name.';
      const y = num(f.year); if (y < 1990 || y > new Date().getFullYear() + 1) return 'Enter a valid year.';
      if (!digits(f.km)) return 'Enter KM driven.';
      if (num(f.price) < 10000) return 'Enter the asking price.';
    }
    if (step === 2 && !num(f.buy_price)) return 'Enter the price you bought it for.';
    if (step === 3) { const r = Number(String(f.interest_rate || 0).replace(/[^\d.]/g, '')); if (num(f.loan_amount) && !(r > 0 && r <= 60)) return 'Enter the interest rate, e.g. 15.'; }
    return '';
  };
  draw();
}

async function more() {
  if (!(await guard())) return;
  const s = await store.session(), data = await store.ownerData();
  render(`${demoBar()}<div class="topbar"><b>More</b></div><div class="ocar"><img class="th" src="icons/logo.svg" alt="" style="object-fit:contain"><div><b>${esc(CONFIG.businessName)}</b><small>${esc(s.email)}</small></div></div>
  <div class="actions" style="grid-template-columns:1fr"><button class="b ghost" id="csv">${ic('download')}Download backup (Excel / CSV)</button><button class="b ghost" id="link">${ic('share')}Share showroom link</button>
  ${LIVE ? '' : `<button class="b ghost" id="reset">Reset demo data</button>`}<button class="b red" id="out">${ic('logout')}Log out</button></div>
  <p class="foot">Tip: download a backup once a week and keep it in Google Drive.</p>${nav('more', data.offers.filter((o) => o.status === 'new').length)}`);
  const $ = (id) => document.getElementById(id);
  $('csv').onclick = () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cars = enrich(data).map((c) => [c.name, c.year, c.km, c.fuel, c.status, c.price, c.costs?.buy_price, c.cs.spent, Math.round(c.cs.interest), Math.round(c.cs.total), c.costs?.sold_price ?? '', c.costs?.bought_on, c.sold_on ?? '', c.offers.length]);
    const offers = enrich(data).flatMap((c) => c.offers.map((o) => [c.name, o.name, o.phone, o.amount, o.status, o.created_at]));
    const csv = [['Car', 'Year', 'KM', 'Fuel', 'Status', 'Asking price', 'Bought for', 'Expenses', 'Interest', 'Total cost', 'Sold for', 'Bought on', 'Sold on', 'Offers'], ...cars, [], ['OFFERS'], ['Car', 'Buyer', 'Phone', 'Amount', 'Status', 'Received'], ...offers].map((r) => r.map(q).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `kaveti-motors-backup-${localISO()}.csv`; a.click();
  };
  $('link').onclick = async () => { const url = `${location.origin}${location.pathname}#/`; try { if (navigator.share) await navigator.share({ title: CONFIG.businessName, url }); else { await navigator.clipboard.writeText(url); toast('Showroom link copied'); } } catch {} };
  $('reset')?.addEventListener('click', async () => { if (confirm('Reset all demo cars and offers?')) { await store.resetDemo(); toast('Demo data reset'); go('#/owner'); } });
  $('out').onclick = async () => { await store.signOut(); go('#/'); };
}

// ═════════════════════════ ROUTER ═════════════════════════
async function route() {
  document.querySelectorAll('.scrim,.sheet').forEach((n) => n.parentElement.remove());
  document.title = `${CONFIG.businessName} · ${CONFIG.tagline}`;
  const h = location.hash.slice(1) || '/', p = h.split('/').filter(Boolean);
  try {
    if (!p.length) return await showroom();
    if (p[0] === 'car') return await carPage(decodeURIComponent(p[1] || ''));
    if (p[0] === 'owner') {
      const [, page, id] = p;
      if (!page) return await dashboard();
      if (page === 'login') return await login();
      if (page === 'stock') return await stockPage();
      if (page === 'car') return await costPage(id);
      if (page === 'offers') return await offersPage(id);
      if (page === 'add') return await carForm();
      if (page === 'edit') return await carForm(id);
      if (page === 'more') return await more();
    }
    go('#/');
  } catch (e) {
    fail(e);
    render(`<div class="empty">Could not load. Check your internet and try again.<br><br><button class="b ghost sm" onclick="location.reload()">Retry</button></div>`);
  }
}
addEventListener('hashchange', route);
route();
