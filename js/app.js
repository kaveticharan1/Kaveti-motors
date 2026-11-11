import { CONFIG } from '../config.js';
import { store, LIVE, LS } from './store.js';
import { costSheet, inr, lakh, kmFmt, localISO } from './calc.js';
import { ic, esc, photo, toast, compressImage, slugify, ask } from './ui.js';
import { NATIVE, siteBase, saveFile, initNative, tap } from './native.js';
import { BRANDS, COLOURS, MONTHS, findBrand, findModel, splitName } from './cars-data.js';

const $app = document.getElementById('app');
const digits = (s) => String(s || '').replace(/\D/g, '');
const num = (s) => Number(digits(s) || 0);
// Share links: /car/<slug> on Cloudflare (gives WhatsApp a photo preview), #/car/<slug> elsewhere.
const carUrl = (slug) => (CONFIG.prettyLinks && !NATIVE ? `${location.origin}/car/${slug}` : `${siteBase()}#/car/${slug}`);
const isNew = (c) => c.listed_on && (Date.now() - new Date(c.listed_on + 'T00:00:00')) / 864e5 <= 7;
const dropped = (c) => c.prev_price && c.prev_price > c.price;
const ownerLabel = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;
const go = (h) => { location.hash = h; };
const demoBar = () => (LIVE ? '' : '<div class="demo">Demo mode · sample cars saved on this phone only</div>');
const initials = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const ago = (t) => { const h = Math.round((Date.now() - new Date(t)) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h} hr${h > 1 ? 's' : ''} ago` : `${Math.round(h / 24)} day${h >= 48 ? 's' : ''} ago`; };
const left = (t) => { const ms = new Date(t) - Date.now(); if (ms <= 0) return null; const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5); return d ? `${d} day${d > 1 ? 's' : ''} ${h} hrs` : `${h} hrs ${Math.floor((ms % 36e5) / 6e4)} min`; };
const skeleton = () => `<header class="top"><div class="wrap topin"><span class="brandl"><img class="mark" src="icons/logo.svg" alt=""><div><b>${esc(CONFIG.businessName)}</b><small>${esc(CONFIG.tagline)}</small></div></span></div></header><div class="wrap"><div class="grid skel" style="margin-top:20px">${'<div class="car"><div class="ph sk"></div><div class="bd"><div class="sk l1"></div><div class="sk l2"></div><div class="sk l3"></div></div></div>'.repeat(3)}</div></div>`;
function render(html) { $app.innerHTML = html; window.scrollTo(0, 0); }
function fail(e) { console.error(e); toast(e.message || 'Something went wrong. Please try again.'); }

// ═════════════════════════ BUYER EXTRAS ═════════════════════════
// Favourites, recently viewed and the buyer's own test drives live on this phone only (no login for buyers).
const jget = (k) => { try { const v = JSON.parse(LS.getItem(k)); return Array.isArray(v) ? v : []; } catch { return []; } };
const jset = (k, v) => { try { LS.setItem(k, JSON.stringify(v)); } catch {} };
const favs = () => jget('vm-favs');
const isFav = (slug) => favs().includes(slug);
const toggleFav = (slug) => { const f = favs(), on = !f.includes(slug); jset('vm-favs', on ? [slug, ...f].slice(0, 50) : f.filter((x) => x !== slug)); return on; };
const addRecent = (slug) => jset('vm-recent', [slug, ...jget('vm-recent').filter((x) => x !== slug)].slice(0, 12));
const myDrives = () => jget('vm-drives');
const DEF_SLOTS = ['10:00', '11:00', '12:00', '15:00', '16:00', '17:00'];
const tdSlots = () => (Array.isArray(CONFIG.tdSlots) && CONFIG.tdSlots.length ? [...CONFIG.tdSlots].sort() : DEF_SLOTS);
const tdDays = () => Math.min(30, Math.max(1, Number(CONFIG.tdDaysAhead) || 7));
const slotLabel = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const dayLabel = (iso, long) => { const t = localISO(), tm = localISO(new Date(Date.now() + 864e5)); const d = new Date(iso + 'T00:00:00');
  return iso === t ? 'Today' : iso === tm ? 'Tomorrow' : d.toLocaleDateString('en-IN', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short' }); };
// A slot today is bookable only if it starts at least 1 hour from now.
const slotPassed = (iso, t) => iso === localISO() && new Date(`${iso}T${t}:00`) - Date.now() < 36e5;
const heartBtn = (slug, cls = 'heart') => `<button class="${cls}${isFav(slug) ? ' on' : ''}" data-fav="${esc(slug)}" aria-label="Save car" aria-pressed="${isFav(slug)}">${ic('heart')}</button>`;
function bindHearts(root = document) {
  root.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const on = toggleFav(b.dataset.fav); tap();
    document.querySelectorAll(`[data-fav="${CSS.escape(b.dataset.fav)}"]`).forEach((x) => { x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    const n = document.getElementById('favn'); if (n) { const c = favs().length; n.textContent = c || ''; n.classList.toggle('hide', !c && !myDrives().length); }
    toast(on ? 'Saved. Find it under Saved at the top.' : 'Removed from saved');
  }));
}

// ═════════════════════════ BUYERS ═════════════════════════
const ui = { q: '', fuel: 'all', budget: 'all', sort: 'new' };
const FUELS = [['all', 'All fuels'], ['Diesel', 'Diesel'], ['Petrol', 'Petrol'], ['CNG', 'CNG']];
const BUDGETS = [['all', 'Any budget'], ['u5', 'Under ₹5 lakh'], ['5to10', '₹5 – 10 lakh'], ['a10', 'Above ₹10 lakh']];
const SORTS = [['new', 'Newest first'], ['plh', 'Price: low to high'], ['phl', 'Price: high to low'], ['km', 'Lowest km']];
const CHIPS = [['all', 'All cars'], ['f:Diesel', 'Diesel'], ['f:Petrol', 'Petrol'], ['f:CNG', 'CNG'], ['b:u5', 'Under ₹5L'], ['b:5to10', '₹5–10L']];
const inBudget = (p, b) => b === 'all' || (b === 'u5' && p < 500000) || (b === '5to10' && p >= 500000 && p <= 1000000) || (b === 'a10' && p > 1000000);
const waLink = (text) => `https://wa.me/${CONFIG.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
const logoImg = (cls = 'mark') => `<img class="${cls}" src="icons/logo.svg" alt="${esc(CONFIG.businessName)} logo">`;
const topBar = (withSearch) => `<header class="top"><div class="wrap topin">
  <a class="brandl" href="#/">${logoImg()}<div><b>${esc(CONFIG.businessName)}</b><small>${esc(CONFIG.tagline)}</small></div></a>
  ${withSearch ? `<label class="search">${ic('search')}<input id="q" type="search" placeholder="Search Creta, Innova, Swift…" value="${esc(ui.q)}" autocomplete="off" aria-label="Search cars"></label>` : '<span class="grow"></span>'}
  <a class="topsv" href="#/saved" aria-label="Saved cars and test drives">${ic('heart')}<span>Saved</span><i id="favn" class="${favs().length + myDrives().length ? '' : 'hide'}">${favs().length || ''}</i></a>
  <a class="topwa" href="${waLink()}" target="_blank" rel="noopener" aria-label="WhatsApp us">${ic('chat')}<span>WhatsApp us</span></a></div></header>`;
const siteFoot = () => `<footer class="sfoot"><div class="wrap"><div class="fl1">${logoImg()}<div><b>${esc(CONFIG.businessName)}</b><small>${esc(CONFIG.tagline)}</small></div></div>
  <div class="fl2"><a href="${waLink()}" target="_blank" rel="noopener">${ic('chat', 'sm')}WhatsApp</a><a href="tel:${esc(CONFIG.phone)}">${ic('phone', 'sm')}${esc(CONFIG.phone)}</a><a href="#/owner">${ic('lock', 'sm')}Owner login</a></div></div></footer>`;

async function showroom() {
  const cars = await store.listCars();
  const minPrice = cars.length ? Math.min(...cars.map((c) => c.price)) : 0;
  const draw = () => {
    const q = ui.q.trim().toLowerCase();
    let list = cars.filter((c) => (!q || `${c.name} ${c.year} ${c.fuel} ${c.transmission}`.toLowerCase().includes(q))
      && (ui.fuel === 'all' || c.fuel === ui.fuel) && inBudget(c.price, ui.budget));
    const by = { new: (a, b) => (b.listed_on || '').localeCompare(a.listed_on || ''), plh: (a, b) => a.price - b.price, phl: (a, b) => b.price - a.price, km: (a, b) => a.km - b.km }[ui.sort];
    list = [...list].sort(by);
    document.getElementById('grid').innerHTML = list.length ? list.map(card).join('')
      : `<div class="empty">No cars match these filters. <a href="${waLink('Hi, I am looking for a car. Can you help?')}" target="_blank" rel="noopener" style="color:var(--p);font-weight:700">Tell us on WhatsApp</a> what you want and we will find it.</div>`;
    bindHearts(document.getElementById('grid'));
    document.getElementById('count').textContent = `${list.length} car${list.length === 1 ? '' : 's'}`;
    document.querySelectorAll('.chip').forEach((b) => { const k = b.dataset.k; b.classList.toggle('on', k === 'all' ? ui.fuel === 'all' && ui.budget === 'all' : k === `f:${ui.fuel}` || k === `b:${ui.budget}`); });
    document.querySelectorAll('[data-fuel]').forEach((b) => b.classList.toggle('on', b.dataset.fuel === ui.fuel));
    document.querySelectorAll('[data-budget]').forEach((b) => b.classList.toggle('on', b.dataset.budget === ui.budget));
    document.querySelectorAll('.sortsel').forEach((s) => { s.value = ui.sort; });
    document.getElementById('clear').classList.toggle('hide', ui.fuel === 'all' && ui.budget === 'all' && !ui.q);
  };
  const sortSel = `<select class="sortsel" aria-label="Sort cars">${SORTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>`;
  render(`${demoBar()}${topBar(true)}
  <section class="hero"><div class="wrap"><div class="htx">${CONFIG.heroBadge ? `<span class="eyebrow">${ic('shield', 'sm')}${esc(CONFIG.heroBadge)}</span>` : ''}<h1>Find your next car at ${esc(CONFIG.businessName)}</h1><p>Real photos, clear prices and full details. Chat with us on WhatsApp or send a private offer in seconds.</p></div>
  <div class="stats"><div><b>${cars.length}</b><span>cars available</span></div><div><b>${cars.filter((c) => c.fuel === 'Diesel').length}</b><span>diesel cars</span></div><div><b>${minPrice ? lakh(minPrice) : '—'}</b><span>starting price</span></div></div></div></section>
  <div class="wrap layout"><aside class="side" aria-label="Filters"><div class="sideh"><b>Filters</b><button id="clear" class="linkbtn hide">Clear all</button></div>
  <h3>Fuel</h3>${FUELS.map(([k, l]) => `<button class="opt" data-fuel="${k}">${l}</button>`).join('')}
  <h3>Budget</h3>${BUDGETS.map(([k, l]) => `<button class="opt" data-budget="${k}">${l}</button>`).join('')}
  <h3>Sort by</h3>${sortSel}
  <div class="sidecta"><b>Can't find your car?</b><p>Tell us the model and budget. We buy from trusted sources every week.</p><a class="b wa sm" href="${waLink('Hi, I am looking for a car. Can you help?')}" target="_blank" rel="noopener">${ic('chat', 'sm')}Ask on WhatsApp</a></div></aside>
  <main class="main"><div class="chips">${CHIPS.map(([k, l]) => `<button class="chip" data-k="${k}">${l}</button>`).join('')}</div>
  <div class="sect"><div><b>Available now</b> <small id="count"></small></div><div class="msort">${sortSel}</div></div><div id="grid" class="grid"></div></main></div>${siteFoot()}`);
  document.getElementById('q').addEventListener('input', (e) => { ui.q = e.target.value; draw(); });
  document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.k;
    if (k === 'all') { ui.fuel = 'all'; ui.budget = 'all'; } else if (k[0] === 'f') ui.fuel = ui.fuel === k.slice(2) ? 'all' : k.slice(2); else ui.budget = ui.budget === k.slice(2) ? 'all' : k.slice(2); draw(); }));
  document.querySelectorAll('[data-fuel]').forEach((b) => b.addEventListener('click', () => { ui.fuel = b.dataset.fuel; draw(); }));
  document.querySelectorAll('[data-budget]').forEach((b) => b.addEventListener('click', () => { ui.budget = b.dataset.budget; draw(); }));
  document.querySelectorAll('.sortsel').forEach((s) => s.addEventListener('change', () => { ui.sort = s.value; draw(); }));
  document.getElementById('clear').addEventListener('click', () => { ui.fuel = 'all'; ui.budget = 'all'; ui.q = ''; document.getElementById('q').value = ''; draw(); });
  draw();
}
function card(c) {
  return `<a class="car" href="#/car/${esc(c.slug)}"><div class="ph">${photo(c, c.photos[0])}<span class="tag">${ic('fuel', 'sm')}${esc(c.fuel)}</span>${c.status === 'booked' ? '<span class="tag bk">Booked</span>' : dropped(c) ? `<span class="tag dr">${inr(c.prev_price - c.price)} off</span>` : isNew(c) ? '<span class="tag nw">New</span>' : ''}${c.photos.length > 1 ? `<span class="pc">${ic('camera', 'sm')}${c.photos.length}</span>` : ''}${heartBtn(c.slug)}</div>
  <div class="bd"><div class="nm">${esc(c.name)}</div><div class="meta"><span>${c.year}</span><span>${kmFmt(c.km)} km</span><span>${ownerLabel(c.owner_no)} owner</span><span>${esc(c.transmission)}</span></div>
  <div class="pr"><div><b>${lakh(c.price)}</b>${dropped(c) ? ` <s class="was">${lakh(c.prev_price)}</s>` : ''}<small class="emi">EMI from ${inr(emi(c.price))}/mo</small></div>${c.interested ? `<small class="hot">${ic('users', 'sm')}${c.interested} interested</small>` : ''}</div></div></a>`;
}
// Rough EMI estimate: 80% loan, 11% a year, 5 years. Shown with a clear "estimate" note on the car page.
function emi(price, share = 0.8, rate = 11, months = 60) { const P = price * share, r = rate / 1200; return (P * r * (1 + r) ** months) / ((1 + r) ** months - 1); }

async function carPage(slug) {
  const [c, all] = await Promise.all([store.getCarBySlug(slug), store.listCars()]);
  if (!c) return render(`${topBar(false)}<div class="wrap"><div class="empty">This car may have been sold. <a href="#/" style="color:var(--p);font-weight:700">See all cars</a></div></div>`);
  addRecent(c.slug);
  const pics = c.photos.length ? c.photos : [null];
  const open = c.status !== 'sold' && c.offers_open && (!c.offers_close_at || new Date(c.offers_close_at) > new Date());
  const wa = waLink(`Hi, I am interested in the ${c.name} (${c.year}, ${kmFmt(c.km)} km) listed at ${lakh(c.price)}.\n${carUrl(c.slug)}`);
  const trust = (CONFIG.trustPoints || []).map((t) => `<li>${ic('check', 'sm')}${esc(t)}</li>`).join('');
  document.title = `${c.name} ${c.year} · ${lakh(c.price)} · ${CONFIG.businessName}`;
  render(`${demoBar()}${topBar(false)}<div class="wrap crumbs"><a href="#/">${ic('back', 'sm')}All cars</a><span>/</span><span>${esc(c.name)}</span></div>
  <div class="wrap detail">
  <div class="gal"><div class="gallery"><div class="track" id="trk">${pics.map((p) => `<div>${photo(c, p)}</div>`).join('')}</div>
  <a class="gbtn mback" style="left:16px" href="#/" aria-label="Back">${ic('back')}</a><button class="gbtn mshare" style="right:16px" id="share" aria-label="Share">${ic('share')}</button>${heartBtn(c.slug, 'gbtn gheart')}
  ${pics.length > 1 ? `<button class="arr l" id="prev" aria-label="Previous photo">${ic('back')}</button><button class="arr r" id="next" aria-label="Next photo">${ic('chev')}</button>` : ''}<span class="cnt" id="cnt">1 / ${pics.length}</span></div>
  ${pics.length > 1 ? `<div class="thumbs">${pics.map((p, i) => `<button data-i="${i}" class="${i ? '' : 'on'}" aria-label="Photo ${i + 1}">${photo(c, p)}</button>`).join('')}</div>` : ''}</div>
  <aside class="dinfo"><div class="ibox"><h1>${esc(c.name)}</h1><div class="sub">${c.year} · ${kmFmt(c.km)} km · ${esc(c.fuel)} · ${esc(c.transmission)}</div>
  <div class="row"><span class="price">${lakh(c.price)}${dropped(c) ? ` <s class="was">${lakh(c.prev_price)}</s>` : ''}</span>${c.interested ? `<span class="interest">${ic('users', 'sm')}${c.interested} ${c.interested === 1 ? 'person' : 'people'} interested</span>` : ''}</div>
  ${dropped(c) ? `<div class="dropline">${ic('trend', 'sm')}Price dropped by ${inr(c.prev_price - c.price)}</div>` : ''}<a class="emiline" href="#emi">EMI from <b>${inr(emi(c.price))}/month</b>* · <u>Calculate</u></a>
  ${c.status === 'booked' ? '<span class="status">Booked · you can still make a backup offer</span>' : ''}${c.status === 'sold' ? '<span class="status">Sold</span>' : ''}
  <div class="bar"><div class="duo">${c.status !== 'sold' ? `<button class="b tdb" id="td">${ic('cal')}<span>Test drive</span></button>` : ''}${open ? `<button class="b pri" id="offer">${ic('tag')}Make an offer</button>` : ''}</div>
  <div class="btns"><a class="b wa" href="${wa}" target="_blank" rel="noopener">${ic('chat')}WhatsApp</a><a class="b ghost" href="tel:${esc(CONFIG.phone)}">${ic('phone')}Call</a></div></div>
  <button class="dshare linkbtn" id="share2">${ic('share', 'sm')}Share this car</button>
  ${trust ? `<ul class="trust">${trust}</ul>` : ''}</div></aside>
  <div class="more"><h2 class="h2">Car details</h2><div class="specs">${[['cal', 'Year', c.year], ['gauge', 'Driven', kmFmt(c.km) + ' km'], ['fuel', 'Fuel', c.fuel], ['user', 'Owner', ownerLabel(c.owner_no)], ['gear', 'Gearbox', c.transmission], ['shield', 'Insurance', c.insurance_till || '—'], ...(c.colour ? [['car', 'Colour', c.colour]] : [])]
    .map(([i, l, v]) => `<div class="sp">${ic(i)}<small>${l}</small><b>${esc(v)}</b></div>`).join('')}</div>
  ${c.description ? `<h2 class="h2">From the seller</h2><div class="desc">${esc(c.description)}</div>` : ''}
  ${c.status !== 'sold' ? emiCalc(c) : ''}
  ${(() => { const sim = all.filter((x) => x.id !== c.id && (x.fuel === c.fuel || Math.abs(x.price - c.price) <= c.price * 0.3)).sort((a, b) => Math.abs(a.price - c.price) - Math.abs(b.price - c.price)).slice(0, 3);
    return sim.length ? `<h2 class="h2">Similar cars</h2><div class="grid sim">${sim.map(card).join('')}</div>` : ''; })()}
  <p class="note">*EMI is an estimate (default: 80% loan at 11% a year over 5 years). Your bank's rate and terms decide the actual EMI.</p></div></div>${siteFoot()}`);
  bindHearts(); if (c.status !== 'sold') bindEmi(c);
  document.getElementById('td')?.addEventListener('click', () => driveSheet(c));
  document.querySelector('.emiline')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('emi')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  const trk = document.getElementById('trk');
  const goTo = (i) => trk.scrollTo({ left: i * trk.clientWidth, behavior: 'smooth' });
  const cur = () => Math.round(trk.scrollLeft / trk.clientWidth);
  const cntEl = document.getElementById('cnt'), thumbs = [...document.querySelectorAll('.thumbs button')];
  trk.addEventListener('scroll', () => { if (!trk.isConnected) return; const i = cur(); cntEl.textContent = `${i + 1} / ${pics.length}`; thumbs.forEach((b) => b.classList.toggle('on', +b.dataset.i === i)); });
  document.getElementById('prev')?.addEventListener('click', () => goTo((cur() - 1 + pics.length) % pics.length));
  document.getElementById('next')?.addEventListener('click', () => goTo((cur() + 1) % pics.length));
  document.querySelectorAll('.thumbs button').forEach((b) => b.addEventListener('click', () => goTo(+b.dataset.i)));
  const share = async () => {
    const data = { title: `${c.name} ${c.year}`, text: `${c.name} · ${c.year} · ${kmFmt(c.km)} km · ${lakh(c.price)}`, url: carUrl(c.slug) };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text}\n${data.url}`); toast('Link copied. Paste it in WhatsApp.'); } } catch {}
  };
  document.getElementById('share').addEventListener('click', share); document.getElementById('share2').addEventListener('click', share);
  if (open) document.getElementById('offer').addEventListener('click', () => offerSheet(c));
}

// Interactive EMI calculator on the car page.
function emiCalc(c) {
  const max = Math.round((c.price * 0.9) / 10000) * 10000, dp0 = Math.round((c.price * 0.2) / 10000) * 10000;
  return `<section class="emic" id="emi"><h2 class="h2" style="margin-top:0">EMI calculator</h2>
  <div class="emiv"><small>Your monthly EMI</small><b id="emiv">₹0</b><span id="emis"></span></div>
  <div class="fl"><label for="dp">Down payment <b id="dpv"></b></label><input type="range" id="dp" min="0" max="${max}" step="10000" value="${dp0}"></div>
  <div class="fl"><label>Loan period</label><div class="seg" id="ten">${[3, 4, 5, 7].map((y) => `<button type="button" data-y="${y}" class="${y === 5 ? 'on' : ''}">${y} yrs</button>`).join('')}</div></div>
  <div class="fl"><label for="rt">Interest rate (% a year)</label><div class="stp"><button type="button" data-r="-0.5" aria-label="Lower rate">−</button><input class="fi" id="rt" inputmode="decimal" value="11"><button type="button" data-r="0.5" aria-label="Higher rate">+</button></div></div></section>`;
}
function bindEmi(c) {
  const $ = (id) => document.getElementById(id); let years = 5;
  const calc = () => {
    const dp = Number($('dp').value), rate = Math.min(30, Math.max(0, parseFloat($('rt').value) || 0)), P = Math.max(0, c.price - dp), n = years * 12, r = rate / 1200;
    const m = P ? (r ? (P * r * (1 + r) ** n) / ((1 + r) ** n - 1) : P / n) : 0;
    $('dpv').textContent = inr(dp); $('emiv').textContent = inr(m);
    $('emis').textContent = P ? `Loan ${lakh(P)} · total interest ${inr(Math.max(0, m * n - P))}` : 'No loan needed';
    $('dp').style.setProperty('--fill', `${(dp / (Number($('dp').max) || 1)) * 100}%`);
  };
  $('dp').addEventListener('input', calc); $('rt').addEventListener('input', calc);
  document.querySelectorAll('#ten button').forEach((b) => (b.onclick = () => { years = +b.dataset.y; document.querySelectorAll('#ten button').forEach((x) => x.classList.toggle('on', x === b)); calc(); }));
  document.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { $('rt').value = Math.min(30, Math.max(0, (parseFloat($('rt').value) || 0) + Number(b.dataset.r))).toFixed(1).replace(/\.0$/, ''); calc(); }));
  calc();
}

// Test drive booking: pick a day, then a free time slot.
async function driveSheet(c) {
  const days = Array.from({ length: tdDays() + 1 }, (_, i) => localISO(new Date(Date.now() + i * 864e5)));
  let taken = [];
  try { taken = await store.takenSlots(c.id); } catch {}
  const isTaken = (d, t) => taken.some((x) => x.drive_date === d && String(x.slot).slice(0, 5) === t);
  const free = (d) => tdSlots().filter((t) => !slotPassed(d, t) && !isTaken(d, t));
  let day = days.find((d) => free(d).length) || days[0], slot = '';
  const mine = myDrives().find((x) => x.slug === c.slug && x.drive_date >= localISO());
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="scrim"></div><form class="sheet" novalidate><div class="grab"></div><h2>Book a test drive</h2>
  <div class="mini"><div class="th">${photo(c, c.photos[0])}</div><div><b>${esc(c.name)}</b><small>Free · takes about 30 minutes</small></div></div>
  ${mine ? `<div class="info" style="margin-top:12px">${ic('cal', 'sm')}<span>You already asked for <b>${dayLabel(mine.drive_date, true)}, ${slotLabel(mine.slot)}</b> for this car. You can book another time if you like.</span></div>` : ''}
  <div class="fl"><label>Day</label><div class="days" id="days"></div></div>
  <div class="fl"><label>Time</label><div class="slots" id="slots"></div></div>
  <div class="fl"><label for="nm">Your name</label><input class="fi" id="nm" autocomplete="name" maxlength="60"></div>
  <div class="fl"><label for="ph">Mobile number</label><input class="fi" id="ph" inputmode="tel" autocomplete="tel" placeholder="10-digit number" maxlength="17"></div>
  <div class="fl"><label for="nt">Anything we should know? (optional)</label><input class="fi" id="nt" maxlength="200" placeholder="e.g. I will come with family"></div>
  <div class="info">${ic('lock', 'sm')}<span>Bring your driving licence. ${esc(CONFIG.businessName)} will call you to confirm the time.</span></div>
  <div class="err" id="err"></div><button class="b pri" style="margin-top:14px" id="send">Request test drive</button></form>`;
  document.body.appendChild(wrap);
  const $ = (id) => wrap.querySelector('#' + id);
  const prev = jget('vm-me')[0]; if (prev) { $('nm').value = prev.name || ''; $('ph').value = prev.phone || ''; }
  const draw = () => {
    $('days').innerHTML = days.map((d) => { const n = free(d).length, dt = new Date(d + 'T00:00:00');
      return `<button type="button" data-d="${d}" class="${d === day ? 'on' : ''}" ${n ? '' : 'disabled'}><small>${dayLabel(d)}</small><b>${dt.getDate()}</b><small>${n ? dt.toLocaleDateString('en-IN', { month: 'short' }) : 'Full'}</small></button>`; }).join('');
    $('slots').innerHTML = tdSlots().map((t) => { const tk = isTaken(day, t), off = tk || slotPassed(day, t);
      return `<button type="button" data-t="${t}" class="${t === slot ? 'on' : ''}" ${off ? 'disabled' : ''}>${slotLabel(t)}${tk ? '<small>Booked</small>' : ''}</button>`; }).join('');
    wrap.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { day = b.dataset.d; if (!free(day).includes(slot)) slot = ''; draw(); }));
    wrap.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { slot = b.dataset.t; $('err').textContent = ''; draw(); }));
  };
  draw();
  wrap.querySelector('.scrim').addEventListener('click', () => wrap.remove());
  wrap.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('nm').value.trim(), phone = digits($('ph').value).replace(/^(91|0)(?=\d{10}$)/, ''), note = $('nt').value.trim();
    const err = !slot ? 'Choose a time for your test drive.' : !/\p{L}.*\p{L}/u.test(name) ? 'Enter your name.' : !/^[6-9]\d{9}$/.test(phone) ? 'Enter a valid 10-digit mobile number.' : '';
    if (err) { $('err').textContent = err; return; }
    $('send').disabled = true; $('send').textContent = 'Booking…';
    try {
      await store.requestDrive({ car_id: c.id, name, phone, drive_date: day, slot, note });
      jset('vm-me', [{ name, phone }]);
      jset('vm-drives', [{ slug: c.slug, car: c.name, drive_date: day, slot, booked_at: new Date().toISOString() }, ...myDrives()].slice(0, 20));
      document.getElementById('favn')?.classList.remove('hide');
      const msg = `Hi, I booked a test drive for the ${c.name} on ${dayLabel(day, true)} at ${slotLabel(slot)}. Name: ${name}.`;
      wrap.querySelector('form').innerHTML = `<div class="grab"></div><div style="text-align:center;padding:16px 0 4px"><div class="round" style="margin:0 auto;width:60px;height:60px;background:var(--gbg);color:var(--g)">${ic('check')}</div><h2 style="margin-top:14px">Test drive requested</h2>
      <p class="desc" style="margin:8px 0 0"><b>${dayLabel(day, true)} at ${slotLabel(slot)}</b><br>We will call ${phone.slice(0, 5)} ${phone.slice(5)} to confirm. You can see it any time under <b>Saved</b>.</p>
      <div class="btns" style="margin-top:18px"><a class="b wa" href="${waLink(msg)}" target="_blank" rel="noopener">${ic('chat')}Tell us on WhatsApp</a><button type="button" class="b ghost" id="done">Done</button></div></div>`;
      wrap.querySelector('#done').addEventListener('click', () => wrap.remove());
    } catch (ex) {
      $('err').textContent = ex.message; $('send').disabled = false; $('send').textContent = 'Request test drive';
      if (/booked|slot|time/i.test(ex.message)) { try { taken = await store.takenSlots(c.id); } catch {} slot = ''; draw(); }
    }
  });
}

// Saved cars, recently viewed and the buyer's own test drives.
async function savedPage(tab = 'saved') {
  const cars = await store.listCars(), bySlug = (s) => cars.find((c) => c.slug === s);
  const drives = myDrives(), up = drives.filter((d) => d.drive_date >= localISO());
  const draw = () => {
    let body;
    if (tab === 'drives') body = drives.length ? `<div class="list mylist">${drives.map((d) => { const c = bySlug(d.slug), past = d.drive_date < localISO();
      return `<a class="it${past ? ' dim' : ''}" href="#/car/${esc(d.slug)}"><div class="th">${c ? photo(c, c.photos[0]) : ''}</div><div class="m"><b>${esc(d.car)}</b><small>${dayLabel(d.drive_date, true)} · ${slotLabel(d.slot)}${c ? '' : ' · car sold'}</small></div><span class="pill ${past ? 'n' : 'g'}">${past ? 'Past' : 'Upcoming'}</span></a>`; }).join('')}</div>`
      : '<div class="empty">No test drives yet. Open any car and tap <b>Book a free test drive</b>.</div>';
    else {
      const list = (tab === 'saved' ? favs() : jget('vm-recent')).map(bySlug).filter(Boolean);
      body = list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<div class="empty">${tab === 'saved' ? 'Tap the heart on any car to save it here.' : 'Cars you open will show up here.'} <a href="#/" style="color:var(--p);font-weight:700">Browse cars</a></div>`;
    }
    document.getElementById('sv').innerHTML = body; bindHearts(document.getElementById('sv'));
    document.querySelectorAll('#svt button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  };
  document.title = `Saved · ${CONFIG.businessName}`;
  render(`${demoBar()}${topBar(false)}<div class="wrap crumbs"><a href="#/">${ic('back', 'sm')}All cars</a><span>/</span><span>Your cars</span></div>
  <div class="wrap svwrap"><h1 class="h1">Your cars</h1>
  <div class="seg svt" id="svt"><button data-t="saved">Saved</button><button data-t="recent">Recently viewed</button><button data-t="drives">Test drives${up.length ? ` (${up.length})` : ''}</button></div><div id="sv"></div></div>${siteFoot()}`);
  document.querySelectorAll('#svt button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; history.replaceState(null, '', `#/saved/${tab}`); draw(); }));
  draw();
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
  $('amt').focus();
  const fmt = () => { const v = num($('amt').value); $('amt').value = v ? '₹' + v.toLocaleString('en-IN') : ''; };
  $('amt').addEventListener('input', fmt);
  wrap.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { $('amt').value = b.dataset.v; fmt(); }));
  wrap.querySelector('.scrim').addEventListener('click', () => wrap.remove());
  wrap.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = num($('amt').value), name = $('nm').value.trim(), phone = digits($('ph').value).replace(/^(91|0)(?=\d{10}$)/, '');
    const err = amount < 10000 ? 'Enter your offer amount.' : amount > c.price * 3 ? `That is more than 3 times the asking price (${lakh(c.price)}). Please check the amount.` : !/\p{L}.*\p{L}/u.test(name) ? 'Enter your name.' : !/^[6-9]\d{9}$/.test(phone) ? 'Enter a valid 10-digit mobile number.' : '';
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
// Badge on the Leads tab = new offers + test drives waiting for a call.
const leadCount = (d) => (d.offers || []).filter((o) => o.status === 'new').length + (d.drives || []).filter((x) => x.status === 'requested' && x.drive_date >= localISO()).length;
function nav(active, newLeads) {
  const t = (k, h, i, l, extra = '') => `<a href="${h}" class="${active === k ? 'on' : ''}">${ic(i)}${l}${extra}</a>`;
  return `<nav class="nav">${t('home', '#/owner', 'home', 'Home')}${t('stock', '#/owner/stock', 'car', 'Stock')}<a href="#/owner/add" aria-label="Add car"><span class="add">${ic('plus')}</span></a>${t('offers', '#/owner/offers', 'tag', 'Leads', newLeads ? `<span class="nb">${newLeads}</span>` : '')}${t('more', '#/owner/profile', 'user', 'Profile')}</nav>`;
}
const leadTabs = (on) => `<div class="fl" style="margin-top:12px"><div class="seg"><a href="#/owner/offers" class="${on === 'offers' ? 'on' : ''}">Offers</a><a href="#/owner/drives" class="${on === 'drives' ? 'on' : ''}">Test drives</a></div></div>`;

async function drivesPage() {
  if (!(await guard())) return;
  const d = await store.ownerData(), all = enrich(d), t = localISO();
  const carOf = (id) => all.find((c) => c.id === id);
  const drives = (d.drives || []).filter((x) => carOf(x.car_id));
  const isActive = (x) => x.drive_date >= t && ['requested', 'confirmed'].includes(x.status);
  const active = drives.filter(isActive).sort((a, b) => (a.drive_date + a.slot).localeCompare(b.drive_date + b.slot));
  const earlier = drives.filter((x) => !isActive(x)).sort((a, b) => (b.drive_date + b.slot).localeCompare(a.drive_date + a.slot)).slice(0, 30);
  const groups = [...new Set(active.map((x) => x.drive_date))];
  const ST = { requested: ['a', 'Call to confirm'], confirmed: ['g', 'Confirmed'], done: ['n', 'Done'], cancelled: ['n', 'Cancelled'], no_show: ['r', "Didn't come"] };
  const item = (x) => {
    const c = carOf(x.car_id), [cls, lbl] = ST[x.status] || ['n', x.status], sl = String(x.slot).slice(0, 5), open = ['requested', 'confirmed'].includes(x.status);
    const wa = `https://wa.me/91${x.phone}?text=${encodeURIComponent(`Hi ${x.name}, your test drive of the ${c.name} is confirmed for ${dayLabel(x.drive_date, true)} at ${slotLabel(sl)}. Please bring your driving licence. - ${CONFIG.businessName}`)}`;
    return `<div class="off drv${open ? '' : ' dim'}"><div class="top"><div class="who"><div class="when"><b>${slotLabel(sl)}</b><small>${dayLabel(x.drive_date)}</small></div><div><b>${esc(x.name)}</b><small>${esc(c.name)}</small></div></div><span class="pill ${cls}">${lbl}</span></div>
    ${x.note ? `<p class="dnote">“${esc(x.note)}”</p>` : ''}
    <div class="acts">${x.status === 'requested' ? `<button data-ds="confirmed" data-id="${x.id}" style="background:var(--g);color:#fff">${ic('check', 'sm')}Confirm</button>` : x.status === 'confirmed' ? `<button data-ds="done" data-id="${x.id}">${ic('check', 'sm')}Done</button>` : ''}
    <a href="tel:+91${esc(x.phone)}">${ic('phone', 'sm')}Call</a><a href="${wa}" target="_blank" rel="noopener">${ic('chat', 'sm')}WhatsApp</a></div>
    ${open ? `<div class="sub2"><button type="button" data-ds="cancelled" data-id="${x.id}">Cancel</button>${x.drive_date <= t ? `<button type="button" data-ds="no_show" data-id="${x.id}">Didn't come</button>` : ''}</div>` : ''}</div>`;
  };
  render(`${demoBar()}<div class="topbar"><b>Leads</b></div>${leadTabs('drives')}
  ${groups.length ? groups.map((g) => `<div class="sect"><b>${dayLabel(g, true)}</b><small>${active.filter((x) => x.drive_date === g).length} booked</small></div>${active.filter((x) => x.drive_date === g).map(item).join('')}`).join('') : '<div class="empty">No upcoming test drives. Buyers can book one from any car page.</div>'}
  ${earlier.length ? `<div class="sect"><b>Earlier</b></div>${earlier.map(item).join('')}` : ''}${nav('offers', leadCount(d))}`);
  document.querySelectorAll('[data-ds]').forEach((b) => (b.onclick = async () => {
    const s = b.dataset.ds;
    if (s === 'cancelled' && !(await ask('Cancel this test drive?', 'Please call or WhatsApp the buyer to let them know.', 'Cancel it', true))) return;
    try { await store.setDriveStatus(b.dataset.id, s); toast(s === 'confirmed' ? 'Confirmed. Send the buyer a WhatsApp reminder.' : 'Updated'); drivesPage(); } catch (ex) { fail(ex); }
  }));
}

function enrich(d) {
  return d.cars.map((c) => {
    const costs = d.costs.find((x) => x.car_id === c.id), exp = d.expenses.filter((x) => x.car_id === c.id), offers = d.offers.filter((x) => x.car_id === c.id);
    return { ...c, costs, exp, offers, cs: costSheet(c, costs, exp) };
  });
}

// Supabase's free email sender allows only a few login emails per hour; say so plainly.
const codeErr = (m) => /signups? not allowed|otp_disabled|user not found/i.test(m) ? 'This email is not an owner login. Use the owner email, or ask Charan to add this email as an owner.'
  : /rate limit|over_email_send_rate_limit|429/i.test(m) ? 'Too many login emails were sent in the last hour (free email limit). Please try again in about an hour.'
  : /seconds|security purposes/i.test(m) ? 'Please wait a minute before asking for another code.' : m;
async function login() {
  if (await store.session()) return go('#/owner');
  render(`${demoBar()}<div class="login"><img class="mark" src="icons/logo.svg" alt="${esc(CONFIG.businessName)} logo"><h1>Owner login</h1><p>Enter your email. We will send a login code: no password to remember.</p>
  <form id="f1" novalidate><div class="fl"><label for="em">Email</label><input class="fi" id="em" type="email" autocomplete="email" required></div><button class="b pri" id="b1">Send code</button></form>
  <form id="f2" class="hide" novalidate><p class="sentto" id="sent"></p><div class="fl"><label for="cd">Code from the email</label><input class="fi" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="10" style="letter-spacing:.25em;font-size:22px;text-align:center"></div><button class="b pri" id="b2">Log in</button>
  <div class="resend"><button type="button" class="linkbtn" id="rs" disabled>Resend code</button><span id="rst"></span></div>
  <button type="button" class="linkbtn" id="chg" style="margin-top:6px">Use a different email</button></form>
  <div class="err" id="err"></div><div class="foot"><a href="#/">Back to showroom</a></div></div>`);
  const $ = (id) => document.getElementById(id); let email = '', timer;
  // Supabase allows a new code every 60 seconds, so the Resend button counts down.
  const cooldown = (sec = 60) => {
    clearInterval(timer); $('rs').disabled = true; let left = sec;
    const tick = () => { if (!$('rst')) return clearInterval(timer); $('rst').textContent = left > 0 ? ` in ${left}s` : ''; if (left-- <= 0) { clearInterval(timer); $('rs').disabled = false; } };
    tick(); timer = setInterval(tick, 1000);
  };
  const send = async () => {
    await store.sendCode(email);
    $('sent').innerHTML = LIVE ? `We sent a code to <b>${esc(email)}</b>. Check your inbox and spam folder, then type the code here.${NATIVE ? '' : ' Tapping the link in the email also works.'}` : `Demo mode: type any 6 to 10 digits. (Code "sent" to <b>${esc(email)}</b>.)`;
    cooldown();
  };
  $('f1').onsubmit = async (e) => {
    e.preventDefault(); email = $('em').value.trim(); $('err').textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('err').textContent = 'Enter a valid email.'; return; }
    $('b1').disabled = true;
    try { await send(); $('f1').classList.add('hide'); $('f2').classList.remove('hide'); $('cd').focus(); }
    catch (ex) { $('err').textContent = codeErr(ex.message); $('b1').disabled = false; }
  };
  $('f2').onsubmit = async (e) => {
    e.preventDefault(); $('b2').disabled = true; $('err').textContent = '';
    try { await store.verifyCode(email, digits($('cd').value)); clearInterval(timer); go('#/owner'); }
    catch (ex) { $('err').textContent = ex.message; $('b2').disabled = false; $('cd').select(); }
  };
  $('rs').onclick = async () => {
    $('err').textContent = ''; $('rs').disabled = true;
    try { await send(); $('cd').value = ''; $('cd').focus(); toast('New code sent'); }
    catch (ex) { $('err').textContent = codeErr(ex.message); cooldown(30); }
  };
  $('chg').onclick = () => { clearInterval(timer); $('f2').classList.add('hide'); $('f1').classList.remove('hide'); $('b1').disabled = false; $('err').textContent = ''; $('em').focus(); };
}

async function dashboard() {
  if (!(await guard())) return;
  const all = enrich(await store.ownerData()), stock = all.filter((c) => c.status !== 'sold').sort((a, b) => b.cs.days - a.cs.days);
  const locked = stock.reduce((a, c) => a + c.cs.total, 0), perDay = stock.reduce((a, c) => a + c.cs.perDay, 0);
  const raw = await store.ownerData(), newOffers = all.flatMap((c) => c.offers).filter((o) => o.status === 'new').length;
  const tdToday = (raw.drives || []).filter((x) => x.drive_date === localISO() && ['requested', 'confirmed'].includes(x.status) && all.some((c) => c.id === x.car_id)).length;
  const tdAsk = (raw.drives || []).filter((x) => x.status === 'requested' && x.drive_date >= localISO() && all.some((c) => c.id === x.car_id)).length;
  const m = localISO().slice(0, 7), soldMonth = all.filter((c) => c.status === 'sold' && (c.sold_on || '').startsWith(m)).length;
  const red = stock.filter((c) => c.cs.age === 'r'), hour = new Date().getHours();
  render(`${demoBar()}<div class="ohead"><div><small>${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}</small><b>Your stock</b></div><a class="round" href="#/" aria-label="Open showroom">${ic('share')}</a></div>
  <div class="hero2"><small>Money in stock · ${stock.length} car${stock.length === 1 ? '' : 's'}</small><div class="v">${lakh(locked)}</div><div class="sub"><div>Interest / day<b>${inr(perDay)}</b></div><div>New offers<b>${newOffers}</b></div><div>Sold this month<b>${soldMonth}</b></div></div></div>
  ${red.map((c) => `<a class="alert" href="#/owner/car/${c.id}"><div class="ic3">${ic('alert')}</div><div><b>${esc(c.name)}: ${c.cs.days} days in stock</b><small>Interest so far ${inr(c.cs.interest)} · tap to review price</small></div></a>`).join('')}
  ${numbersMissing() ? `<a class="alert amb" href="#/owner/profile"><div class="ic3">${ic('phone')}</div><div><b>Add your WhatsApp number</b><small>Buyers can't reach you until it's set. Tap to open Profile.</small></div></a>` : ''}
  ${tdToday || tdAsk ? `<a class="alert grn" href="#/owner/drives"><div class="ic3">${ic('cal')}</div><div><b>${tdToday ? `${tdToday} test drive${tdToday > 1 ? 's' : ''} today` : `${tdAsk} test drive request${tdAsk > 1 ? 's' : ''}`}</b><small>${tdAsk ? `${tdAsk} waiting for your call to confirm` : 'All confirmed. Keep the cars clean and ready.'}</small></div></a>` : ''}
  ${newOffers ? `<a class="alert blu" href="#/owner/offers"><div class="ic3">${ic('tag')}</div><div><b>${newOffers} new offer${newOffers > 1 ? 's' : ''} to call back</b><small>Confirm them by phone to count them</small></div></a>` : ''}
  <div class="sect"><b>Stock, oldest first</b><a href="#/owner/stock">See all</a></div>
  <div class="list">${stock.length ? stock.map(row).join('') : '<div class="empty">No cars yet. Tap + to add your first car.</div>'}</div>${nav('home', newOffers + tdAsk)}`);
}
const nice = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const row = (c) => `<a class="it" href="#/owner/car/${c.id}"><div class="th">${photo(c, c.photos[0])}</div><div class="m"><b>${esc(c.name)}</b><small>${c.status === 'sold' ? `Sold ${nice(c.sold_on)}` : `Cost so far ${inr(c.cs.total)}`}</small></div>${c.status === 'sold' ? '<span class="pill n">Sold</span>' : `<span class="pill ${c.cs.age}">${c.cs.days} days</span>`}</a>`;

async function stockPage() {
  if (!(await guard())) return;
  const raw = await store.ownerData(), all = enrich(raw); let tab = 'stock';
  const draw = () => {
    const list = all.filter((c) => (tab === 'sold' ? c.status === 'sold' : c.status !== 'sold')).sort((a, b) => b.cs.days - a.cs.days);
    document.getElementById('lst').innerHTML = list.length ? list.map(row).join('') : '<div class="empty">Nothing here yet.</div>';
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  };
  render(`${demoBar()}<div class="topbar"><b>All cars</b></div><div class="fl"><div class="seg"><button data-t="stock">In stock</button><button data-t="sold">Sold</button></div></div><div class="sect" style="padding-top:14px"></div><div class="list" id="lst"></div>${nav('stock', leadCount(raw))}`);
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
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (await ask('Remove expense?', 'This expense will be removed from the cost sheet.', 'Remove', true)) { try { await store.deleteExpense(b.dataset.del); costPage(id); } catch (ex) { fail(ex); } } }));
  document.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => { try { await store.updateCar(c.id, { status: b.dataset.st, ...(b.dataset.st === 'available' ? { sold_on: null } : {}) }); costPage(id); } catch (ex) { fail(ex); } }));
  document.getElementById('sold')?.addEventListener('click', () => soldSheet(c));
  document.getElementById('del').onclick = async () => { if (await ask(`Delete ${c.name}?`, 'The car, its costs and all its offers will be deleted. This cannot be undone.', 'Delete car', true)) { try { await store.deleteCar(c.id); toast('Car deleted'); go('#/owner'); } catch (ex) { fail(ex); } } };
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
  const raw = await store.ownerData(), all = enrich(raw), newCount = leadCount(raw);
  if (!id) {
    const withOffers = all.filter((c) => c.offers.length).sort((a, b) => b.offers.filter((o) => o.status === 'new').length - a.offers.filter((o) => o.status === 'new').length);
    return render(`${demoBar()}<div class="topbar"><b>Leads</b></div>${leadTabs('offers')}<div class="sect" style="padding-top:14px"><b>Cars with offers</b></div><div class="list">${withOffers.length ? withOffers.map((c) => {
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
  const today = localISO(), yNow = new Date().getFullYear();
  // Brand / model: use saved fields, or split an older car's name.
  const sp = d ? (d.brand ? { brand: findBrand(d.brand, true), model: d.model, variant: d.variant || '' } : splitName(d.name)) : {};
  const bIn = d ? (sp.brand || 'Other') : '', bOther = d && !sp.brand ? (d.brand || '') : '';
  const mListed = sp.brand && sp.model && BRANDS[sp.brand].includes(sp.model);
  const ins = d && d.insurance_till ? String(d.insurance_till).split(' ') : [];
  const colKnown = d && COLOURS.includes(d.colour);
  const f = {
    brand: bIn, brandOther: bOther, model: d ? (mListed ? sp.model : 'Other') : '', modelOther: d ? (mListed ? '' : (sp.model || sp.modelText || '')) : '', variant: d ? (sp.variant || '') : '',
    year: d ? d.year : '', km: d ? d.km : '', fuel: d ? d.fuel : 'Diesel', transmission: d ? d.transmission : 'Manual', owner_no: d ? d.owner_no : 1,
    colourSel: d ? (d.colour ? (colKnown ? d.colour : 'Other') : '') : '', colourOther: d && d.colour && !colKnown ? d.colour : '',
    insM: MONTHS.includes(ins[0]) ? ins[0] : (d && d.insurance_till === 'Not available' ? 'NA' : ''), insY: ins[1] || '',
    price: d ? d.price : '', description: d ? d.description || '' : '',
    buy_price: d && d.costs ? d.costs.buy_price : '', bought_on: d && d.costs ? d.costs.bought_on : today, loan_amount: d && d.costs ? d.costs.loan_amount || '' : '', interest_rate: d && d.costs ? d.costs.interest_rate || '' : '',
    offers_open: d ? d.offers_open : true, offers_close_at: d ? d.offers_close_at || '' : '', pics: d ? d.photos.map((u) => ({ url: u })) : [],
  };
  const aiSet = new Set();
  let step = 1;
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map((o) => `<button type="button" data-v="${o}" class="${String(f[k]) === String(o) ? 'on' : ''}">${o}</button>`).join('')}</div>`;
  const ai = (k) => (aiSet.has(k) ? ' ai' : '');
  const moneyHint = (k) => `<p class="hint" data-h="${k}">${num(f[k]) ? lakh(num(f[k])) : ''}</p>`;
  // Number box with − / + buttons; typing is still allowed.
  const stepper = (k, label, stepBy, attrs = '', hint = '') => `<div class="fl"><label for="${k}">${label}</label><div class="stp"><button type="button" data-stp="${k}" data-d="-${stepBy}" aria-label="Decrease ${label}">−</button><input class="fi${ai(k)}" id="${k}" value="${esc(f[k] ?? '')}" ${attrs}><button type="button" data-stp="${k}" data-d="${stepBy}" aria-label="Increase ${label}">+</button></div>${hint}</div>`;
  const carName = () => [f.brand === 'Other' ? f.brandOther.trim() : f.brand, f.model === 'Other' || f.brand === 'Other' ? f.modelOther.trim() : f.model, f.variant.trim()].filter(Boolean).join(' ');
  const draw = () => {
    const pics = f.pics, models = f.brand && f.brand !== 'Other' ? BRANDS[f.brand] : [];
    const body = step === 1 ? `<div class="slabel">Step 1 of 3</div><div class="stitle">Photos and details</div>
      <div class="pg">${pics.map((p, i) => `<div class="${i ? '' : 'cover'}"><img src="${esc(p.url)}" alt="">${i ? `<button type="button" class="mkcover" data-cover="${i}">${ic('check', 'sm')}Cover</button>` : '<span class="covtag">Cover photo</span>'}<button type="button" data-rm="${i}" aria-label="Remove photo">${ic('x', 'sm')}</button></div>`).join('')}</div>
      <label class="cam">${ic('camera')}${pics.length ? 'Add more photos' : 'Add photos'}<input type="file" id="pick" accept="image/*" multiple hidden></label>
      ${pics.length ? `<button type="button" class="aibtn" id="aifill">${ic('spark')}Fill details from photos</button><p class="hint" id="aimsg" style="margin:6px 20px 0">${aiSet.size ? 'Filled from your photos. Please check the highlighted fields: photo detection can make mistakes.' : 'Reads the brand, model and colour from your photos.'}</p>` : ''}
      ${pics.length < 6 ? `<p class="hint" style="margin:8px 20px 0">Tip: 6–10 bright daylight photos sell faster: front corner, side, back, dashboard showing km, front and back seats, tyres.</p>` : ''}
      <div class="fl two"><div><label for="brand">Brand</label><select class="fi${ai('brand')}" id="brand"><option value="">Choose brand</option>${Object.keys(BRANDS).map((b) => opt(b, b, f.brand)).join('')}${opt('Other', 'Other (type it)', f.brand)}</select></div>
      <div><label for="model">Model</label><select class="fi${ai('model')}" id="model" ${f.brand ? '' : 'disabled'}><option value="">${f.brand ? 'Choose model' : 'Choose brand first'}</option>${models.map((m) => opt(m, m, f.model)).join('')}${f.brand ? opt('Other', 'Other (type it)', f.model) : ''}</select></div></div>
      ${f.brand === 'Other' ? `<div class="fl"><label for="brandOther">Brand name</label><input class="fi${ai('brandOther')}" id="brandOther" maxlength="40" value="${esc(f.brandOther)}" placeholder="e.g. Premier"></div>` : ''}
      ${f.model === 'Other' || f.brand === 'Other' ? `<div class="fl"><label for="modelOther">Model name</label><input class="fi${ai('modelOther')}" id="modelOther" maxlength="40" value="${esc(f.modelOther)}" placeholder="e.g. Padmini"></div>` : ''}
      <div class="fl"><label for="variant">Variant (optional)</label><input class="fi${ai('variant')}" id="variant" maxlength="40" value="${esc(f.variant)}" placeholder="e.g. VDI, 1.6 SX, ZX CVT"></div>
      <p class="hint" id="npv" style="margin:6px 20px 0">${carName() ? `Shown to buyers as <b>${esc(carName())}</b>` : ''}</p>
      <div class="pair">${stepper('year', 'Year', 1, `inputmode="numeric" maxlength="4" placeholder="${yNow - 5}"`)}${stepper('km', 'KM driven', 1000, 'inputmode="numeric" placeholder="e.g. 45000"')}</div>
      <div class="fl"><label>Fuel</label>${seg('fuel', ['Diesel', 'Petrol', 'CNG', 'Electric'])}</div>
      <div class="fl"><label>Gearbox</label>${seg('transmission', ['Manual', 'Automatic'])}</div>
      <div class="fl"><label>Owner</label>${seg('owner_no', [1, 2, 3, 4])}</div>
      <div class="pair"><div class="fl"><label for="colourSel">Colour</label><select class="fi${ai('colourSel')}" id="colourSel"><option value="">Choose colour</option>${COLOURS.map((c) => opt(c, c, f.colourSel)).join('')}${opt('Other', 'Other (type it)', f.colourSel)}</select></div>
      <div class="fl"><label for="insM">Insurance valid till</label><div class="two" style="gap:8px"><select class="fi" id="insM"><option value="">Month</option>${MONTHS.map((m) => opt(m, m, f.insM)).join('')}${opt('NA', 'None', f.insM)}</select><select class="fi" id="insY" ${f.insM === 'NA' ? 'disabled' : ''}><option value="">Year</option>${[yNow - 1, yNow, yNow + 1, yNow + 2, yNow + 3].map((y) => opt(y, y, f.insY)).join('')}</select></div></div></div>
      ${f.colourSel === 'Other' ? `<div class="fl"><label for="colourOther">Colour name</label><input class="fi${ai('colourOther')}" id="colourOther" maxlength="20" value="${esc(f.colourOther)}" placeholder="e.g. Pearl white"></div>` : ''}
      ${stepper('price', 'Asking price (₹)', 5000, 'inputmode="numeric" placeholder="e.g. 525000"', moneyHint('price'))}
      <div class="fl"><label for="description">Notes for buyers (optional)</label><textarea class="fi" id="description" maxlength="500" placeholder="Single owner, all service records, new tyres…">${esc(f.description || '')}</textarea></div>`
      : step === 2 ? `<div class="slabel">Step 2 of 3</div><div class="stitle">Buying cost</div><p class="desc">Only you can see this. Add repair and other expenses later on the cost sheet.</p>
      ${stepper('buy_price', 'Bought for (₹)', 5000, 'inputmode="numeric"', moneyHint('buy_price'))}<div class="fl"><label for="bought_on">Bought on</label><input class="fi" id="bought_on" type="date" value="${esc(f.bought_on)}" max="${today}"></div>`
      : `<div class="slabel">Step 3 of 3</div><div class="stitle">Loan and offers</div><p class="desc">Interest is counted every day from the date you bought the car. Leave empty if there is no loan.</p>
      ${stepper('loan_amount', 'Loan amount (₹)', 10000, 'inputmode="numeric"', moneyHint('loan_amount'))}${stepper('interest_rate', 'Interest rate (% per year)', 0.5, 'inputmode="decimal" placeholder="e.g. 15"')}
      <div class="fl"><label>Accept offers from buyers?</label>${seg('offers_open', ['Yes', 'No']).replace(/data-v="(Yes|No)" class="[^"]*"/g, (m, v) => `data-v="${v}" class="${(v === 'Yes') === !!f.offers_open ? 'on' : ''}"`)}</div>
      <div class="fl"><label for="offers_close_at">Offers close on (optional)</label><input class="fi" id="offers_close_at" type="datetime-local"><p class="hint">Use this when several buyers are interested.</p></div>`;
    render(`<div class="topbar"><button class="round" id="cancel" aria-label="${step === 1 ? 'Close' : 'Back'}">${ic(step === 1 ? 'x' : 'back')}</button><b>${d ? 'Edit car' : 'Add a car'}</b></div><div class="steps">${[1, 2, 3].map((x) => `<span class="${x <= step ? 'on' : ''}"></span>`).join('')}</div>${body}
    <div class="err" id="err" style="margin:10px 20px 0"></div><div class="bar"><button class="b pri" id="next">${step < 3 ? `Next: ${step === 1 ? 'buying cost' : 'loan and offers'}` : d ? 'Save changes' : 'Save and publish'}</button></div>`);
    const $ = (x) => document.getElementById(x);
    if (f.offers_close_at && $('offers_close_at')) { const t = new Date(f.offers_close_at); $('offers_close_at').value = isNaN(t) ? f.offers_close_at : new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
    document.querySelectorAll('.seg').forEach((sg) => sg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      const k = sg.dataset.k; f[k] = k === 'owner_no' ? Number(b.dataset.v) : k === 'offers_open' ? b.dataset.v === 'Yes' : b.dataset.v; aiSet.delete(k);
      sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); })));
    // Dropdowns that change what else is shown redraw the form.
    ['brand', 'model', 'colourSel', 'insM'].forEach((k) => $(k)?.addEventListener('change', () => { collect(); aiSet.delete(k); if (k === 'brand') { f.model = ''; f.modelOther = ''; } if (k === 'insM' && f.insM === 'NA') f.insY = ''; draw(); $(k === 'brand' ? 'model' : k)?.focus(); }));
    // Typing in these boxes only updates the name preview, so the cursor never jumps.
    ['variant', 'brandOther', 'modelOther'].forEach((k) => $(k)?.addEventListener('input', () => { collect(); aiSet.delete(k); $(k).classList.remove('ai'); const n = carName(); $('npv').innerHTML = n ? `Shown to buyers as <b>${esc(n)}</b>` : ''; }));
    document.querySelectorAll('[data-stp]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.stp, el = $(k), dv = Number(b.dataset.d), cur = k === 'interest_rate' ? parseFloat(el.value) || 0 : num(el.value);
      let v = k === 'year' && !cur ? yNow : Math.max(0, Math.round((cur + dv) * 100) / 100);
      if (k === 'year') v = Math.min(yNow + 1, Math.max(1990, v));
      el.value = v; el.dispatchEvent(new Event('input')); aiSet.delete(k);
    }));
    document.querySelectorAll('[data-h]').forEach((h) => $(h.dataset.h).addEventListener('input', (e) => { h.textContent = num(e.target.value) ? lakh(num(e.target.value)) : ''; }));
    $('pick')?.addEventListener('change', async (e) => {
      for (const file of e.target.files) { try { const blob = await compressImage(file, LIVE ? 1280 : 640, LIVE ? 0.72 : 0.6); f.pics.push({ blob, url: URL.createObjectURL(blob) }); } catch (ex) { fail(ex); } }
      collect(); draw();
    });
    document.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { collect(); f.pics.splice(+b.dataset.rm, 1); draw(); }));
    document.querySelectorAll('[data-cover]').forEach((b) => (b.onclick = () => { collect(); const [p] = f.pics.splice(+b.dataset.cover, 1); f.pics.unshift(p); draw(); toast('Cover photo changed'); }));
    $('aifill')?.addEventListener('click', () => fillFromPhotos($('aifill'), $('aimsg')));
    $('cancel').onclick = () => { collect(); if (step > 1) { step--; draw(); } else history.back(); };
    $('next').onclick = async () => {
      collect(); const err = validate(); if (err) { $('err').textContent = err; return; }
      for (const [t, m] of warnings()) { if (!(await ask(t, m, 'Yes, it is correct'))) return; }
      if (step < 3) { step++; return draw(); }
      $('next').disabled = true; $('next').textContent = 'Saving…';
      try {
        const name = carName(), slug = d ? d.slug : slugify(name, f.year);
        const fresh = f.pics.filter((p) => p.blob), up = fresh.length ? await store.uploadPhotos(slug, fresh.map((p) => p.blob)) : [];
        const photos = f.pics.map((p) => (p.blob ? up[fresh.indexOf(p)] : p.url));
        const colour = f.colourSel === 'Other' ? f.colourOther.trim() : f.colourSel;
        const car = { name, brand: f.brand === 'Other' ? f.brandOther.trim() || null : f.brand, model: f.model === 'Other' || f.brand === 'Other' ? f.modelOther.trim() || null : f.model, variant: f.variant.trim() || null,
          year: num(f.year), km: num(f.km), fuel: f.fuel, transmission: f.transmission, owner_no: Number(f.owner_no), colour: colour || null,
          insurance_till: f.insM === 'NA' ? 'Not available' : f.insM && f.insY ? `${f.insM} ${f.insY}` : null,
          description: f.description.trim() || null, price: num(f.price), photos, offers_open: !!f.offers_open, offers_close_at: f.offers_close_at ? new Date(f.offers_close_at).toISOString() : null };
        if (d) car.id = d.id; else car.slug = slug;
        const costs = { buy_price: num(f.buy_price), bought_on: f.bought_on || today, loan_amount: num(f.loan_amount), interest_rate: Number(String(f.interest_rate || 0).replace(/[^\d.]/g, '')) || 0 };
        const newId = await store.saveCar(car, costs);
        toast(d ? 'Changes saved' : 'Car added to the showroom'); go(`#/owner/car/${newId}`);
      } catch (ex) { fail(ex); $('next').disabled = false; $('next').textContent = 'Try again'; }
    };
  };
  // Photo auto-fill: sends up to 2 small copies of the photos, then fills only what it recognised.
  async function fillFromPhotos(btn, msg) {
    collect(); btn.disabled = true; btn.innerHTML = `${ic('spark')}Reading photos…`;
    try {
      const imgs = [];
      for (const p of f.pics.slice(0, 2)) {
        const blob = p.blob || (await (await fetch(p.url)).blob());
        const small = await compressImage(blob, 640, 0.7);
        imgs.push(await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(small); }));
      }
      const r = await store.identify(imgs);
      const set = (k, v) => { if (v !== undefined && v !== null && v !== '') { f[k] = v; aiSet.add(k); } };
      const b = findBrand(r.brand || '');
      if (b) { set('brand', b); const m = findModel(b, r.model || ''); if (m) set('model', m); else if (r.model) { set('model', 'Other'); set('modelOther', String(r.model).slice(0, 40)); } }
      else if (r.brand) { set('brand', 'Other'); set('brandOther', String(r.brand).slice(0, 40)); if (r.model) set('modelOther', String(r.model).slice(0, 40)); }
      if (r.variant && !f.variant) set('variant', String(r.variant).slice(0, 40));
      const col = COLOURS.find((c) => c.toLowerCase() === String(r.colour || '').toLowerCase());
      if (col) set('colourSel', col); else if (r.colour) { set('colourSel', 'Other'); set('colourOther', String(r.colour).slice(0, 20)); }
      if (['Diesel', 'Petrol', 'CNG', 'Electric'].includes(r.fuel)) set('fuel', r.fuel);
      if (['Manual', 'Automatic'].includes(r.transmission)) set('transmission', r.transmission);
      if (!aiSet.size) throw new Error('Could not recognise the car. Try a clear photo of the front or side, or fill the details by hand.');
      draw(); toast('Details filled from photos. Please check them.');
    } catch (ex) { btn.disabled = false; btn.innerHTML = `${ic('spark')}Fill details from photos`; msg.textContent = ex.message; msg.classList.add('err'); }
  }
  const collect = () => { document.querySelectorAll('.fi').forEach((el) => { if (el.id && el.id in f) f[el.id] = el.value; }); };
  // "Are you sure?" checks for likely typos (extra zeros) and selling at a loss.
  const warnings = () => {
    const w = [], p = num(f.price), k = num(f.km), b = num(f.buy_price);
    if (step === 1 && p > 10000000) w.push(['Check the price', `The asking price is ${lakh(p)} (${inr(p)}). Is that correct?`]);
    if (step === 1 && k > 500000) w.push(['Check the KM', `KM driven is ${kmFmt(k)} km. Is that correct?`]);
    if (step === 2 && b > 10000000) w.push(['Check the price', `You bought it for ${inr(b)}. Is that correct?`]);
    if (step === 2 && b && p && b > p) w.push(['Asking price is below cost', `You bought it for ${inr(b)} but the asking price is ${inr(p)}, a loss of ${inr(b - p)} before expenses. Continue?`]);
    return w;
  };
  const validate = () => {
    if (step === 1) {
      if (!f.brand) return 'Choose the brand.';
      if (f.brand === 'Other' && f.brandOther.trim().length < 2) return 'Type the brand name.';
      if (f.brand !== 'Other' && !f.model) return 'Choose the model.';
      if ((f.model === 'Other' || f.brand === 'Other') && f.modelOther.trim().length < 1) return 'Type the model name.';
      const y = num(f.year); if (y < 1990 || y > yNow + 1) return 'Enter a valid year.';
      if (!digits(f.km)) return 'Enter KM driven.';
      if (num(f.price) < 10000) return 'Enter the asking price.';
      if (f.insM && f.insM !== 'NA' && !f.insY) return 'Choose the insurance year.';
    }
    if (step === 2 && !num(f.buy_price)) return 'Enter the price you bought it for.';
    if (step === 3) { const r = Number(String(f.interest_rate || 0).replace(/[^\d.]/g, '')); if (num(f.loan_amount) && !(r > 0 && r <= 60)) return 'Enter the interest rate, e.g. 15.'; }
    return '';
  };
  draw();
}

// Business settings saved from the Profile tab override config.js everywhere in the app.
const PLACEHOLDER = '9999999999';
const ten = (v) => digits(v).replace(/^(91|0)(?=\d{10}$)/, '');
function applySettings(st) {
  if (!st) return;
  if (st.business_name) CONFIG.businessName = st.business_name;
  if (st.tagline !== undefined) CONFIG.tagline = st.tagline;
  if (st.whatsapp) CONFIG.whatsapp = '91' + st.whatsapp;
  if (st.phone) CONFIG.phone = '+91' + st.phone;
  if (st.hero_badge !== undefined) CONFIG.heroBadge = st.hero_badge;
  if (Array.isArray(st.trust_points) && st.trust_points.length) CONFIG.trustPoints = st.trust_points;
  if (Array.isArray(st.td_slots) && st.td_slots.length) CONFIG.tdSlots = st.td_slots.map((t) => String(t).slice(0, 5));
  if (st.td_days_ahead) CONFIG.tdDaysAhead = st.td_days_ahead;
}
const numbersMissing = () => ten(CONFIG.whatsapp) === PLACEHOLDER || !/^[6-9]\d{9}$/.test(ten(CONFIG.whatsapp));

async function profile() {
  if (!(await guard())) return;
  const sess = await store.session(), data = await store.ownerData();
  const ALL_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
  const v = { td_slots: [...tdSlots()], td_days_ahead: tdDays(), business_name: CONFIG.businessName, tagline: CONFIG.tagline || '', whatsapp: ten(CONFIG.whatsapp) === PLACEHOLDER ? '' : ten(CONFIG.whatsapp),
    phone: ten(CONFIG.phone) === PLACEHOLDER ? '' : ten(CONFIG.phone), hero_badge: CONFIG.heroBadge || '', trust_points: [...(CONFIG.trustPoints || [])] };
  let same = !v.phone || v.phone === v.whatsapp;
  const draw = () => {
    render(`${demoBar()}<div class="topbar"><b>Profile</b></div>
    <div class="ocar"><img class="th" src="icons/logo.svg" alt="" style="object-fit:contain"><div><b>${esc(v.business_name)}</b><small>Logged in as ${esc(sess.email)}</small></div></div>
    <form id="pf" novalidate>
    <h3 class="psec">Business details</h3>
    <div class="fl"><label for="business_name">Business name</label><input class="fi" id="business_name" maxlength="40" value="${esc(v.business_name)}"></div>
    <div class="fl"><label for="tagline">Tagline</label><input class="fi" id="tagline" maxlength="60" value="${esc(v.tagline)}" placeholder="e.g. Quality used cars"></div>
    <h3 class="psec">Contact numbers <small>shown to buyers</small></h3>
    <div class="fl"><label for="whatsapp">WhatsApp number</label><div class="pre"><span>+91</span><input class="fi" id="whatsapp" inputmode="tel" maxlength="17" value="${esc(v.whatsapp)}" placeholder="10-digit mobile number"></div></div>
    <label class="chk"><input type="checkbox" id="same" ${same ? 'checked' : ''}> Calls go to the same number</label>
    ${same ? '' : `<div class="fl"><label for="phone">Number for calls</label><div class="pre"><span>+91</span><input class="fi" id="phone" inputmode="tel" maxlength="17" value="${esc(v.phone)}" placeholder="10-digit mobile number"></div></div>`}
    <h3 class="psec">Showroom text</h3>
    <div class="fl"><label for="hero_badge">Badge at the top of the showroom (optional)</label><input class="fi" id="hero_badge" maxlength="60" value="${esc(v.hero_badge)}"></div>
    <div class="fl"><label>Promises shown on every car page <small class="hint">only what is true for your business</small></label>
    ${v.trust_points.map((t, i) => `<div class="tp"><input class="fi tpi" data-i="${i}" maxlength="80" value="${esc(t)}"><button type="button" class="round" data-tprm="${i}" aria-label="Remove">${ic('x', 'sm')}</button></div>`).join('')}
    ${v.trust_points.length < 6 ? `<button type="button" class="linkbtn" id="tpadd" style="margin-top:8px">${ic('plus', 'sm')}Add a promise</button>` : ''}</div>
    <h3 class="psec">Test drive times <small>buyers can pick these</small></h3>
    <div class="fl"><div class="slots" id="tds">${ALL_SLOTS.map((t) => `<button type="button" data-ts="${t}" class="${v.td_slots.includes(t) ? 'on' : ''}">${slotLabel(t)}</button>`).join('')}</div></div>
    <div class="fl"><label for="td_days_ahead">How many days ahead can buyers book?</label><div class="stp"><button type="button" data-tdd="-1" aria-label="Fewer days">−</button><input class="fi" id="td_days_ahead" inputmode="numeric" value="${v.td_days_ahead}"><button type="button" data-tdd="1" aria-label="More days">+</button></div></div>
    <div class="err" id="err" style="margin:12px 20px 0"></div>
    <div class="fl"><button class="b pri" id="save">Save profile</button></div></form>
    <h3 class="psec">Login email</h3>
    <form id="ef" class="fl" novalidate><label for="email">Email used to log in</label><div class="two" style="grid-template-columns:1fr auto;gap:8px"><input class="fi" id="email" type="email" value="${esc(sess.email)}"><button class="b ghost" style="width:auto">Change</button></div><p class="hint" id="emsg">${LIVE ? 'We send a confirmation link to the new email before the change happens.' : ''}</p></form>
    <h3 class="psec">More</h3>
    <div class="actions" style="grid-template-columns:1fr"><button class="b ghost" id="csv">${ic('download')}Download backup (Excel / CSV)</button><button class="b ghost" id="link">${ic('share')}Share showroom link</button>
    ${LIVE ? '' : `<button class="b ghost" id="reset">Reset demo data</button>`}<button class="b red" id="out">${ic('logout')}Log out</button></div>
    <p class="foot">Tip: download a backup once a week and keep it in Google Drive.</p>${nav('more', leadCount(data))}`);
    const $ = (id) => document.getElementById(id);
    document.querySelectorAll('[data-ts]').forEach((b) => (b.onclick = () => { const t = b.dataset.ts; v.td_slots = v.td_slots.includes(t) ? v.td_slots.filter((x) => x !== t) : [...v.td_slots, t].sort(); b.classList.toggle('on', v.td_slots.includes(t)); }));
    document.querySelectorAll('[data-tdd]').forEach((b) => (b.onclick = () => { $('td_days_ahead').value = Math.min(30, Math.max(1, (num($('td_days_ahead').value) || 7) + Number(b.dataset.tdd))); }));
    const grab = () => { ['business_name', 'tagline', 'whatsapp', 'phone', 'hero_badge'].forEach((k) => { if ($(k)) v[k] = $(k).value; }); if ($('td_days_ahead')) v.td_days_ahead = num($('td_days_ahead').value); document.querySelectorAll('.tpi').forEach((el) => { v.trust_points[+el.dataset.i] = el.value; }); };
    $('same').onchange = (e) => { grab(); same = e.target.checked; draw(); };
    $('tpadd')?.addEventListener('click', () => { grab(); v.trust_points.push(''); draw(); document.querySelector('.tpi:last-of-type')?.focus(); });
    document.querySelectorAll('[data-tprm]').forEach((b) => (b.onclick = () => { grab(); v.trust_points.splice(+b.dataset.tprm, 1); draw(); }));
    $('pf').onsubmit = async (e) => {
      e.preventDefault(); grab();
      const wa = ten(v.whatsapp), ph = same ? wa : ten(v.phone), tps = v.trust_points.map((t) => t.trim()).filter(Boolean);
      const err = !v.td_slots.length ? 'Choose at least one test drive time.' : !(v.td_days_ahead >= 1 && v.td_days_ahead <= 30) ? 'Test drive days ahead must be between 1 and 30.' : v.business_name.trim().length < 2 ? 'Enter the business name.' : !/^[6-9]\d{9}$/.test(wa) ? 'Enter a valid 10-digit WhatsApp number.' : !/^[6-9]\d{9}$/.test(ph) ? 'Enter a valid 10-digit number for calls.' : '';
      if (err) { $('err').textContent = err; return; }
      const st = { business_name: v.business_name.trim(), tagline: v.tagline.trim(), whatsapp: wa, phone: ph, hero_badge: v.hero_badge.trim(), trust_points: tps, td_slots: v.td_slots, td_days_ahead: v.td_days_ahead };
      $('save').disabled = true; $('save').textContent = 'Saving…';
      try { await store.saveSettings(st); applySettings(st); if (!tps.length) CONFIG.trustPoints = []; toast('Profile saved'); profile(); }
      catch (ex) { fail(ex); $('save').disabled = false; $('save').textContent = 'Save profile'; }
    };
    $('ef').onsubmit = async (e) => {
      e.preventDefault(); const em = $('email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { $('emsg').textContent = 'Enter a valid email.'; $('emsg').classList.add('err'); return; }
      if (em === sess.email) { $('emsg').textContent = 'That is already your login email.'; return; }
      try { const r = await store.changeEmail(em); $('emsg').classList.remove('err'); $('emsg').textContent = r === 'confirm' ? `Check ${em} and click the confirmation link to finish the change.` : 'Login email changed.'; if (r !== 'confirm') sess.email = em; }
      catch (ex) { $('emsg').textContent = ex.message; $('emsg').classList.add('err'); }
    };
    $('csv').onclick = () => {
      // Cells starting with = + - @ would run as formulas in Excel: prefix them with ' so they stay plain text.
      const q = (x) => { let t = String(x ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
      const cars = enrich(data).map((c) => [c.name, c.year, c.km, c.fuel, c.status, c.price, c.costs?.buy_price, c.cs.spent, Math.round(c.cs.interest), Math.round(c.cs.total), c.costs?.sold_price ?? '', c.costs?.bought_on, c.sold_on ?? '', c.offers.length]);
      const offers = enrich(data).flatMap((c) => c.offers.map((o) => [c.name, o.name, o.phone, o.amount, o.status, o.created_at]));
      const csv = [['Car', 'Year', 'KM', 'Fuel', 'Status', 'Asking price', 'Bought for', 'Expenses', 'Interest', 'Total cost', 'Sold for', 'Bought on', 'Sold on', 'Offers'], ...cars, [], ['OFFERS'], ['Car', 'Buyer', 'Phone', 'Amount', 'Status', 'Received'], ...offers, [], ['TEST DRIVES'], ['Car', 'Buyer', 'Phone', 'Date', 'Time', 'Status', 'Note'], ...(data.drives || []).map((x) => [enrich(data).find((c) => c.id === x.car_id)?.name || '', x.name, x.phone, x.drive_date, String(x.slot).slice(0, 5), x.status, x.note || ''])].map((r) => r.map(q).join(',')).join('\n');
      saveFile(`vahana-motors-backup-${localISO()}.csv`, '﻿' + csv).then((r) => { if (r === 'saved') toast('Backup saved in Documents'); }).catch(fail);
    };
    $('link').onclick = async () => { const url = `${siteBase()}#/`; try { if (navigator.share) await navigator.share({ title: CONFIG.businessName, url }); else { await navigator.clipboard.writeText(url); toast('Showroom link copied'); } } catch {} };
    $('reset')?.addEventListener('click', async () => { if (await ask('Reset demo?', 'All demo cars, offers and profile changes go back to the sample data.', 'Reset', true)) { await store.resetDemo(); location.reload(); } });
    $('out').onclick = async () => { await store.signOut(); go('#/'); };
  };
  draw();
}

// ═════════════════════════ ROUTER ═════════════════════════
async function route() {
  document.querySelectorAll('.scrim,.sheet').forEach((n) => n.parentElement.remove());
  document.title = `${CONFIG.businessName} · ${CONFIG.tagline}`;
  const h = location.hash.slice(1) || '/', p = h.split('/').filter(Boolean);
  document.body.dataset.area = p[0] === 'owner' ? 'owner' : 'buyer';
  try {
    if (p[0] !== 'owner' && !$app.querySelector('.top')) render(skeleton());
    if (!p.length) return await showroom();
    if (p[0] === 'car') return await carPage(decodeURIComponent(p[1] || ''));
    if (p[0] === 'saved') return await savedPage(['saved', 'recent', 'drives'].includes(p[1]) ? p[1] : 'saved');
    if (p[0] === 'owner') {
      const [, page, id] = p;
      if (!page) return await dashboard();
      if (page === 'login') return await login();
      if (page === 'stock') return await stockPage();
      if (page === 'car') return await costPage(id);
      if (page === 'offers') return await offersPage(id);
      if (page === 'drives') return await drivesPage();
      if (page === 'add') return await carForm();
      if (page === 'edit') return await carForm(id);
      if (page === 'more' || page === 'profile') return await profile();
    }
    go('#/');
  } catch (e) {
    fail(e);
    render(`<div class="empty">Could not load. Check your internet and try again.<br><br><button class="b ghost sm" onclick="location.reload()">Retry</button></div>`);
  }
}
// Arrived from a shared /car/<slug> link (Cloudflare): switch to the in-app address.
{ const m = location.pathname.match(/\/car\/([^/]+)\/?$/); if (m) history.replaceState(null, '', `/#/car/${m[1]}`); }
// Optional free Cloudflare Web Analytics (no cookies). Add the token in config.js to turn it on.
if (CONFIG.cfAnalyticsToken) { const sc = document.createElement('script'); sc.defer = true; sc.src = 'https://static.cloudflareinsights.com/beacon.min.js'; sc.dataset.cfBeacon = JSON.stringify({ token: CONFIG.cfAnalyticsToken }); document.head.appendChild(sc); }
// Arrived from the login link in the email: let Supabase read the session, then open the owner area.
async function authRedirect() {
  const h = location.hash, q = location.search;
  if (!LIVE || !(/access_token|error_description/.test(h) || /[?&]code=/.test(q))) return;
  const err = new URLSearchParams(h.replace(/^#\/?/, '')).get('error_description');
  try { await store.session(); } catch {}
  history.replaceState(null, '', location.pathname + (err ? '#/owner/login' : '#/owner'));
  if (err) setTimeout(() => toast(/expired|invalid/i.test(err) ? 'That login link has expired. Send a new code.' : err), 400);
}
addEventListener('hashchange', route);
initNative();
authRedirect().then(() => store.getSettings()).then(applySettings).catch(() => {}).finally(route);
