#!/usr/bin/env node
// Génère les icônes PNG de l'appli à partir de src/actifs/icone.svg (Chrome piloté par playwright-core).
//   icon-192.png, icon-512.png : coins arrondis ; apple-touch-icon.png (180 px) : carré plein (iOS arrondit lui-même) ;
//   icon-maskable-512.png : dessin réduit à la zone sûre (80 %) sur fond plein.
// Usage : node tools/icones.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('/Users/toutoune/Downloads/atelier/node_modules/playwright-core')); }
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svg = fs.readFileSync(path.join(RACINE, 'src', 'actifs', 'icone.svg'), 'utf8');
const dessin = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const FOND = '#F1FAEE';

const variantes = [
  { fichier: 'icon-192.png', taille: 192, rond: true },
  { fichier: 'icon-512.png', taille: 512, rond: true },
  { fichier: 'apple-touch-icon.png', taille: 180, rond: false },
  { fichier: 'icon-maskable-512.png', taille: 512, rond: false, marge: 0.1 },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const v of variantes) {
    const m = (v.marge || 0) * 100;
    const corps = v.marge ? `<rect width="100" height="100" fill="${FOND}"/><g transform="translate(${m} ${m}) scale(${(100 - 2 * m) / 100})">${dessin}</g>` : dessin;
    const clip = v.rond ? '<defs><clipPath id="c"><rect width="100" height="100" rx="22.4"/></clipPath></defs><g clip-path="url(#c)">' : '<g>';
    await page.setViewportSize({ width: v.taille, height: v.taille });
    await page.setContent(`<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${v.taille}" height="${v.taille}" style="display:block">${clip}${corps}</g></svg></body></html>`);
    await page.screenshot({ path: path.join(RACINE, v.fichier), omitBackground: !!v.rond, clip: { x: 0, y: 0, width: v.taille, height: v.taille } });
    console.log(`${v.fichier} (${v.taille} px)`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
