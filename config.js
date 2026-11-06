// ─────────────────────────────────────────────────────────────
// Vahana Motors – settings. This is the only file you need to edit.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Business details shown in the app
  businessName: 'Vahana Motors',
  tagline: 'Quality used cars',
  // WhatsApp and phone number with country code, digits only (91 + 10 digits)
  whatsapp: '919999999999',
  phone: '+919999999999',

  // Supabase project (Dashboard → Project Settings → API).
  // Leave both empty to run in DEMO MODE with sample cars saved on this phone only.
  // The anon key is safe to publish: the database security rules decide what it can do.
  supabaseUrl: '',
  supabaseAnonKey: '',

  // Small badge at the top of the showroom. Leave '' to hide it.
  heroBadge: 'Handpicked · checked · fairly priced',

  // Short promises shown on every car page. Keep only what is TRUE for your business.
  trustPoints: [
    'Every car personally checked by us',
    'Help with RC transfer and insurance',
    'Test drive before you decide',
  ],

  // Ageing alert limits in days: green below amberAfter, red above redAfter
  amberAfter: 30,
  redAfter: 60,
};
