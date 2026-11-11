// Android app (Capacitor) extras. On the website none of this runs.
import { CONFIG } from '../config.js';

const Cap = typeof window !== 'undefined' ? window.Capacitor : null;
export const NATIVE = Boolean(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const P = () => (Cap && Cap.Plugins) || {};

// Public address of the website: used for share links and login emails from inside the app.
export const siteBase = () => (NATIVE ? CONFIG.siteUrl : location.origin + location.pathname);

// Save a text file (backup CSV). Website: normal download. App: save to Documents, then open the share sheet.
export async function saveFile(name, text, mime = 'text/csv') {
  if (!NATIVE) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click();
    return 'downloaded';
  }
  const { Filesystem, Share } = P();
  const r = await Filesystem.writeFile({ path: name, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
  try { await Share.share({ title: name, files: [r.uri] }); } catch {}
  return 'saved';
}

export function tap() { if (NATIVE) P().Haptics?.impact({ style: 'LIGHT' }).catch(() => {}); }

export function initNative() {
  if (!NATIVE) return;
  const { App, StatusBar, SplashScreen, Share } = P();
  document.documentElement.classList.add('native');
  StatusBar?.setStyle({ style: 'LIGHT' }).catch(() => {});
  StatusBar?.setBackgroundColor?.({ color: '#FFFFFF' }).catch(() => {});

  // Android WebView has no navigator.share: use the native share sheet instead.
  if (Share) navigator.share = (d) => Share.share({ title: d.title, text: d.text, url: d.url, dialogTitle: 'Share with' });

  // WhatsApp, phone and other outside links open in their own apps.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (/^(tel:|mailto:|https?:\/\/(wa\.me|api\.whatsapp|maps\.))/i.test(href) || (a.target === '_blank' && /^https?:/i.test(href))) {
      e.preventDefault(); window.location.href = href;
    }
  }, true);

  // Android back button: close an open sheet first, then go back, then leave the app from the home screen.
  App?.addListener('backButton', () => {
    const sheet = document.querySelector('.scrim');
    if (sheet) { sheet.parentElement.remove(); return; }
    const h = location.hash || '#/';
    if (h === '#/' || h === '#/owner' || h === '#') App.exitApp(); else history.back();
  });
  // Coming back to the app after a while: refresh so offers and bookings are current.
  let away = 0;
  App?.addListener('appStateChange', ({ isActive }) => { if (!isActive) away = Date.now(); else if (away && Date.now() - away > 5 * 60e3) window.dispatchEvent(new HashChangeEvent('hashchange')); });

  setTimeout(() => SplashScreen?.hide({ fadeOutDuration: 250 }).catch(() => {}), 150);
}
