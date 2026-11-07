// Small UI helpers: icons, placeholder car art, escaping, toast, photo compression.

const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v14"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  fuel: '<path d="M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M3 22h12M3 10h12"/><path d="M15 13h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h0"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  car: '<path d="M5 17h14M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4a1 1 0 0 1-1 1h-1M3 13v4a1 1 0 0 0 1 1h1M3 13h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  trend: '<path d="m23 18-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
};
export const ic = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Placeholder drawing used until real photos are added.
const PAL = { white: ['#F4F6F9', '#D9DEE6'], silver: ['#C9CFD8', '#9AA3B0'], red: ['#C8372D', '#8E1F18'], black: ['#2B3038', '#14171C'], blue: ['#2D5BA6', '#1B3C74'], grey: ['#7B828E', '#525865'], brown: ['#9A6B4B', '#6B4430'] };
let uid = 0;
export function carArt(colour = 'silver', suv = false) {
  const [a, b] = PAL[(colour || '').toLowerCase()] || PAL.silver;
  const id = 'ca' + uid++;
  const body = suv
    ? 'M38 128 L40 104 Q42 94 54 92 L86 88 L112 62 Q118 56 130 56 L214 56 Q226 56 232 62 L258 88 L292 92 Q306 94 308 106 L310 124 Q310 132 302 132 L44 132 Q38 132 38 128Z'
    : 'M30 128 L34 110 Q38 100 52 98 L92 94 L124 70 Q132 64 146 64 L206 64 Q220 64 230 72 L258 94 L296 98 Q312 100 314 112 L316 124 Q316 132 308 132 L38 132 Q30 132 30 128Z';
  const glass = suv
    ? 'M120 66 Q124 62 132 62 L168 62 L168 88 L98 88Z M174 62 L212 62 Q222 62 228 68 L248 88 L174 88Z'
    : 'M132 74 Q138 70 148 70 L176 70 L176 94 L104 94Z M182 70 L204 70 Q216 70 224 77 L240 94 L182 94Z';
  return `<svg class="art" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E7EDF6"/><stop offset="1" stop-color="#F8FAFD"/></linearGradient><linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="340" height="190" fill="url(#${id}b)"/><rect y="150" width="340" height="40" fill="#E6EAF1"/><ellipse cx="172" cy="148" rx="150" ry="9" fill="rgba(15,23,42,.18)"/><path d="${body}" fill="url(#${id}c)"/><path d="${glass}" fill="#4A5D7A" opacity=".9"/><rect x="296" y="104" width="12" height="6" rx="2" fill="#FDE68A"/>${[90, 254].map((x) => `<circle cx="${x}" cy="132" r="21" fill="#1A1D23"/><circle cx="${x}" cy="132" r="11" fill="#B9C0CB"/>`).join('')}</svg>`;
}
const SUV_WORDS = /creta|innova|xuv|scorpio|ertiga|fortuner|brezza|seltos|venue|nexon|thar|bolero|safari|hector|harrier|sonet|kiger|magnite|xylo|marazzo|carens|crysta/i;
export const isSuv = (name) => SUV_WORDS.test(name || '');

export function photo(car, url) {
  if (url) return `<img src="${esc(url)}" alt="${esc(car.name)}" loading="lazy">`;
  return carArt(car.colour, isSuv(car.name));
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

// Shrinks a camera photo to max 1280px wide JPEG (~150 KB) before upload.
export function compressImage(file, max = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read photo'))), 'image/jpeg', quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Could not read photo'));
    img.src = URL.createObjectURL(file);
  });
}

export const slugify = (name, year) =>
  `${name}-${year}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);

// In-app "Are you sure?" dialog. Resolves true (OK) or false (Cancel / Esc / tap outside).
export function ask(title, message, okLabel = 'Yes, continue', danger = false) {
  return new Promise((resolve) => {
    const w = document.createElement('div');
    w.innerHTML = `<div class="scrim"></div><div class="sheet ask" role="alertdialog" aria-modal="true" aria-labelledby="askt"><div class="grab"></div><h2 id="askt">${esc(title)}</h2><p class="askm">${esc(message)}</p>
      <div class="btns" style="margin-top:18px"><button class="b ghost" data-v="0">Cancel</button><button class="b ${danger ? 'red' : 'pri'}" data-v="1">${esc(okLabel)}</button></div></div>`;
    const done = (v) => { w.remove(); resolve(v); };
    w.querySelector('.scrim').onclick = () => done(false);
    w.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => done(b.dataset.v === '1')));
    w._close = () => done(false);
    document.body.appendChild(w);
    w.querySelector('[data-v="1"]').focus();
  });
}

// Keyboard: Esc closes the top dialog; Tab stays inside it.
document.addEventListener('keydown', (e) => {
  const sheets = [...document.querySelectorAll('.sheet')];
  const top = sheets[sheets.length - 1];
  if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); const w = top.parentElement; if (w._close) w._close(); else w.remove(); return; }
  if (e.key === 'Tab') {
    const f = [...top.querySelectorAll('button,input,select,textarea,a[href]')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!top.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
});
