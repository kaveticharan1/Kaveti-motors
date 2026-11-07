// Cloudflare Pages Function: /car/<slug>
// WhatsApp, Facebook and Google read <meta> tags when a link is shared. The app itself runs in the
// browser, so this function adds the right car's name, price and cover photo to the page before
// sending it. The page then opens the normal app view for that car.
// Runs only on Cloudflare Pages (free plan includes Functions). GitHub Pages ignores this folder.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lakh = (n) => '₹' + (n / 100000).toFixed(2) + ' lakh';

// Read Supabase URL, key and business name from the site's own config.js, so nothing is set up twice.
async function readConfig(env, origin) {
  const res = await env.ASSETS.fetch(new URL('/config.js', origin));
  const js = await res.text();
  const get = (k) => (js.match(new RegExp(`${k}:\\s*'([^']*)'`)) || [])[1] || '';
  return { url: get('supabaseUrl'), key: get('supabaseAnonKey'), name: get('businessName') || 'Used cars', tagline: get('tagline') };
}

export async function onRequestGet({ request, env, params }) {
  const origin = new URL(request.url).origin;
  const page = await env.ASSETS.fetch(new URL('/index.html', origin));
  const cfg = await readConfig(env, origin);

  let car = null;
  if (cfg.url && cfg.key && /^[a-z0-9-]{3,120}$/.test(params.slug)) {
    try {
      const r = await fetch(`${cfg.url}/rest/v1/cars?slug=eq.${params.slug}&select=name,year,km,fuel,price,photos,status`, {
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (r.ok) car = (await r.json())[0] || null;
    } catch { /* show the generic preview */ }
  }

  const title = car ? `${car.name} ${car.year} · ${lakh(car.price)} · ${cfg.name}` : `${cfg.name} · ${cfg.tagline}`;
  const desc = car
    ? `${car.year} · ${Number(car.km).toLocaleString('en-IN')} km · ${car.fuel}${car.status === 'sold' ? ' · Sold' : ''}. See photos and send an offer.`
    : 'See photos, prices and details. Chat on WhatsApp or send a private offer.';
  const image = car && car.photos && car.photos[0] ? car.photos[0] : `${origin}/icons/icon-512.png`;
  const meta = `
    <base href="/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(cfg.name)}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${esc(image)}">
    <meta property="og:url" content="${esc(request.url)}">
    <meta name="twitter:card" content="summary_large_image">`;

  return new HTMLRewriter()
    .on('head', { element: (el) => el.prepend(meta, { html: true }) })
    .on('title', { element: (el) => el.setInnerContent(title) })
    .on('meta[name="description"]', { element: (el) => el.setAttribute('content', desc) })
    .transform(new Response(page.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } }));
}
