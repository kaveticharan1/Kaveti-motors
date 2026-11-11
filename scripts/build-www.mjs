// Copies the web app into www/ for the Android app (Capacitor).
// The website itself is served straight from the repo root; this script only feeds the app.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'www';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of ['index.html', 'config.js', 'styles.css', 'manifest.webmanifest', 'js', 'icons']) cpSync(f, `${OUT}/${f}`, { recursive: true });

// Inside the app, Android keeps the content below the status bar, so no edge-to-edge layout is needed.
let html = readFileSync(`${OUT}/index.html`, 'utf8');
html = html.replace(',viewport-fit=cover', '').replace('<html', '<html data-native="1"');
writeFileSync(`${OUT}/index.html`, html);
console.log('www/ ready');
