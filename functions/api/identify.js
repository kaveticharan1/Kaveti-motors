// Cloudflare Pages Function: POST /api/identify
// Looks at 1–2 car photos and suggests brand, model, variant, colour, fuel and gearbox.
// Uses Cloudflare Workers AI (free daily allowance). Only the logged-in owner can use it.
//
// One-time setup in the Cloudflare dashboard (see README):
//   Pages project → Settings → Bindings → Add → Workers AI → variable name: AI
//
// The owner always checks the result: the form highlights every field that was filled this way.

const MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Read Supabase URL and key from the site's own config.js.
async function readConfig(env, origin) {
  const js = await (await env.ASSETS.fetch(new URL('/config.js', origin))).text();
  const get = (k) => (js.match(new RegExp(`${k}:\\s*'([^']*)'`)) || [])[1] || '';
  return { url: get('supabaseUrl'), key: get('supabaseAnonKey') };
}

// True only for a logged-in team member (admin, sales or staff).
async function isOwner(cfg, token) {
  if (!cfg.url || !cfg.key || !token) return false;
  const h = { apikey: cfg.key, Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const r = await fetch(`${cfg.url}/rest/v1/rpc/my_role`, { method: 'POST', headers: h, body: '{}' });
  if (!r.ok) return false;
  return ['admin', 'sales', 'staff'].includes(await r.json());
}

const PROMPT = `You are helping a used-car dealer in India list a car. Look at the photo and identify the car.
Reply with ONLY a JSON object, no other text, in exactly this shape:
{"brand":"","model":"","variant":"","colour":"","fuel":"","transmission":"","confidence":""}
Rules:
- brand: manufacturer as sold in India, e.g. "Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Toyota", "Honda", "Kia".
- model: model name only, e.g. "Swift", "Creta", "Innova Crysta", "Nexon".
- variant: only if a badge is clearly readable on the car (e.g. "VXI", "SX"), else "".
- colour: one simple word, e.g. "White", "Silver", "Grey", "Black", "Red", "Blue", "Brown".
- fuel: "Diesel", "Petrol", "CNG" or "Electric" only if a badge clearly shows it, else "".
- transmission: "Automatic" only if an AT/AMT/CVT badge or automatic gear lever is visible, else "".
- confidence: "high", "medium" or "low".
- If it is not a car or you are not sure, use "" for that field.
- Never read or mention number plates, people or faces.`;

async function ask(env, image) {
  const run = () => env.AI.run(MODEL, { messages: [{ role: 'user', content: PROMPT }], image, max_tokens: 200, temperature: 0.1 });
  try { return await run(); } catch (e) {
    // First use on a new account: Meta's licence must be accepted once.
    if (/agree|licen/i.test(String(e && e.message))) { await env.AI.run(MODEL, { prompt: 'agree' }); return await run(); }
    throw e;
  }
}

function parse(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const clean = (v, n = 40) => String(v ?? '').replace(/[<>"]/g, '').trim().slice(0, n);
    return { brand: clean(o.brand), model: clean(o.model), variant: clean(o.variant), colour: clean(o.colour, 20), fuel: clean(o.fuel, 10), transmission: clean(o.transmission, 10), confidence: clean(o.confidence, 6) };
  } catch { return null; }
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ error: 'Photo detection is not switched on yet. Add the Workers AI binding named AI (see README).' }, 503);
  const cfg = await readConfig(env, new URL(request.url).origin);
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await isOwner(cfg, token))) return json({ error: 'Please log in as the owner to use photo detection.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const images = (Array.isArray(body.images) ? body.images : []).filter((x) => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 1_500_000).slice(0, 2);
  if (!images.length) return json({ error: 'Add a photo first.' }, 400);

  // Try the cover photo first; use the second photo only if the first was not clear.
  let best = null;
  for (const img of images) {
    try {
      const out = await ask(env, img);
      const r = parse(out && (out.response ?? out.result ?? out));
      if (r && r.brand) { best = r; if (r.confidence !== 'low') break; }
    } catch (e) { if (!best && img === images[images.length - 1]) return json({ error: 'Photo detection is busy. Please try again in a minute.' }, 502); }
  }
  if (!best) return json({ error: 'Could not recognise the car. Try a clear photo of the front or side, or fill the details by hand.' }, 422);
  return json(best);
}
