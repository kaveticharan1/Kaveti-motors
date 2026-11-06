// ─────────────────────────────────────────────────────────────
// Kaveti Motors – settings. This is the only file you need to edit.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Business details shown in the app
  businessName: 'Kaveti Motors',
  tagline: 'Quality used cars',
  // WhatsApp and phone number with country code, digits only (91 + 10 digits)
  whatsapp: '919999999999',
  phone: '+919999999999',

  // Supabase project (Dashboard → Project Settings → API).
  // Leave both empty to run in DEMO MODE with sample cars saved on this phone only.
  // The anon key is safe to publish: the database security rules decide what it can do.
  supabaseUrl: '',
  supabaseAnonKey: '',

  // Ageing alert limits in days: green below amberAfter, red above redAfter
  amberAfter: 30,
  redAfter: 60,
};
