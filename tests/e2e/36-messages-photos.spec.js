// Module « Messages et photos » : discussion de la famille (texte, photo, réactions, lu, hors ligne),
// album (ajout de photos réduites, visionneuse, albums, liens partagés) et gazette imprimable.
// Tables simulées (faux PostgREST) et stockage simulé (faux Supabase Storage) : la production n'est jamais touchée.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers');
const { installPgMock } = require('./pg-mock');

const TABLES = ['messages_famille', 'messages_reactions', 'messages_lus', 'photos_albums', 'photos_famille', 'photos_gazettes'];
const IMAGE = fs.readFileSync(path.join(H.ROOT, 'icon-512.png'));
const fichier = (nom) => ({ name: nom, mimeType: 'image/png', buffer: IMAGE });
let db;
const fichiers = new Map(); // chemin → octets déposés
const notifs = [];

// Faux Supabase Storage : dépôt, adresses signées, lecture, suppression.
async function installStockage(page) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  await page.route((u) => u.pathname.startsWith('/storage/v1/object/'), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    const json = (b, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(b) });
    let m;
    if (req.method() === 'POST' && (m = u.pathname.match(/^\/storage\/v1\/object\/sign\/famille$/))) {
      const { paths } = JSON.parse(req.postData() || '{}');
      return json(paths.map((p) => ({ path: p, signedURL: fichiers.has(p) ? `/object/sign/famille/${p}?token=essai` : null, error: fichiers.has(p) ? null : 'absent' })));
    }
    if (req.method() === 'GET' && (m = u.pathname.match(/^\/storage\/v1\/object\/sign\/famille\/(.+)$/))) {
      const b = fichiers.get(decodeURIComponent(m[1]));
      return b ? route.fulfill({ status: 200, headers: cors, contentType: 'image/jpeg', body: b }) : route.fulfill({ status: 404, headers: cors });
    }
    if (req.method() === 'POST' && (m = u.pathname.match(/^\/storage\/v1\/object\/famille\/(.+)$/))) {
      fichiers.set(decodeURIComponent(m[1]), req.postDataBuffer());
      return json({ Key: `famille/${m[1]}` });
    }
    if (req.method() === 'DELETE' && u.pathname === '/storage/v1/object/famille') {
      for (const p of JSON.parse(req.postData() || '{}').prefixes || []) fichiers.delete(p);
      return json([]);
    }
    return json({ error: 'non simulé' }, 400);
  });
  await page.route((u) => u.pathname.endsWith('/functions/v1/messages-notifier'), (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    notifs.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"ok":true,"sent":1}' });
  });
}

const ilYa = (min) => new Date(new Date(H.FIXED_TIME).getTime() - min * 60000).toISOString();
const recharger = (page) => page.evaluate(async () => { await Modules.get('messages').charger(true, {}); await Modules.get('photos').charger(true, {}); });

module.exports = {
  name: 'Messages et photos de la famille',
  async before({ page }) {
    const moi = await page.evaluate(() => ({ id: me(), foyer: foyer() }));
    db = await installPgMock(page, {
      tables: TABLES,
      keys: { messages_lus: ['user_id'], photos_gazettes: ['foyer_id', 'mois'] },
      seed: {
        messages_famille: [
          { id: 'm1', foyer_id: moi.foyer, user_id: 'u-manon', auteur: 'Manon', texte: 'Coucou, la nounou est passée ?', created_at: ilYa(60 * 24) },
          { id: 'm2', foyer_id: moi.foyer, user_id: moi.id, auteur: 'Moi', texte: 'Oui, tout va bien', created_at: ilYa(60 * 24 - 5) },
          { id: 'm3', foyer_id: moi.foyer, user_id: 'u-manon', auteur: 'Manon', texte: 'Qui prend le pain ce soir ?', created_at: ilYa(15) },
          { id: 'm4', foyer_id: moi.foyer, user_id: 'u-manon', auteur: 'Manon', texte: 'Et les croquettes des toutous', created_at: ilYa(14) },
        ],
        messages_lus: [
          { id: 'l1', foyer_id: moi.foyer, user_id: moi.id, lu_jusqu_a: ilYa(60 * 24) },
          { id: 'l2', foyer_id: moi.foyer, user_id: 'u-manon', lu_jusqu_a: ilYa(60) },
        ],
      },
      defaults: () => ({ user_id: moi.id, foyer_id: moi.foyer }),
    });
    await installStockage(page);
    await recharger(page);
    await H.openTab(page, 'aujourdhui');
  },
  async after({ page }) { await page.evaluate(() => { window.print = window.__printOrig || window.print; }); },
  tests: [
    { name: 'non lus : pastille sur Famille et élément du fil de l\'Accueil', fn: async ({ page }) => {
      assert.equal(await page.$eval('.tabbar [data-tab="famille"] .mp-pastille', (e) => e.textContent), '2');
      const el = await page.evaluate(async () => (await Accueil.elements({})).filter((x) => x.module === 'messages').map((x) => ({ titre: x.titre, detail: x.detail, heure: x.heure })));
      assert.deepEqual(el, [{ titre: '2 messages non lus', detail: 'Manon : Et les croquettes des toutous', heure: '11:51' }]);
    } },
    { name: 'discussion : jours, auteurs, repère « Nouveaux messages », « Lu par », marquée comme lue', fn: async ({ page }) => {
      await H.openTab(page, 'messages');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Messages');
      assert.deepEqual(await page.$$eval('.mp-jour span', (l) => l.map((e) => e.textContent)), ['Hier', 'Aujourd\'hui']);
      assert.equal(await page.$$eval('.mp-msg.mp-moi', (l) => l.length), 1);
      assert.match(await page.$eval('.mp-nouveaux', (e) => e.nextElementSibling.textContent), /Qui prend le pain/);
      assert.equal(await page.$eval('.mp-msg[data-id="m4"]', (e) => e.classList.contains('mp-suite')), true, 'second message de Manon groupé');
      assert.match(await page.$eval('.mp-msg[data-id="m2"] .mp-etat', (e) => e.textContent), /Lu par Manon/);
      await page.waitForFunction(() => !document.querySelector('.tabbar .mp-pastille'), null, { timeout: 5000 });
      // L'écriture du repère de lecture peut arriver juste après la disparition de la pastille.
      const attendu = db.messages_famille.find((m) => m.id === 'm4').created_at;
      for (let i = 0; i < 30 && db.messages_lus.find((l) => l.id === 'l1').lu_jusqu_a !== attendu; i++) await page.waitForTimeout(100);
      assert.equal(db.messages_lus.find((l) => l.id === 'l1').lu_jusqu_a, attendu);
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'envoyer un message : bulle, ligne enregistrée, notification aux autres', fn: async ({ page }) => {
      await page.fill('[data-form="messages-envoyer"] textarea', 'Je m\'occupe du pain 🥖');
      await page.click('.mp-envoyer');
      await page.waitForFunction(() => [...document.querySelectorAll('.mp-moi .mp-texte')].some((e) => /occupe du pain/.test(e.textContent)));
      await page.waitForTimeout(500);
      const row = db.messages_famille.find((m) => /occupe du pain/.test(m.texte || ''));
      assert.ok(row && row.auteur, 'message enregistré avec son auteur');
      assert.deepEqual(notifs.at(-1), { type: 'message', id: row.id });
      assert.equal(await page.$eval('[data-form="messages-envoyer"] textarea', (e) => e.value), '', 'champ vidé');
    } },
    { name: 'réagir à un message puis retirer sa réaction', fn: async ({ page }) => {
      await page.click('.mp-msg[data-id="m3"] .mp-bulle');
      await page.waitForSelector('.sheet-wrap.open .mp-emoji');
      await page.click('.sheet-wrap.open .mp-emoji[data-emoji="❤️"]');
      await page.waitForSelector('.mp-msg[data-id="m3"] .mp-reac[aria-pressed="true"]');
      await page.waitForTimeout(400);
      assert.deepEqual(db.messages_reactions.map((r) => [r.message_id, r.emoji]), [['m3', '❤️']]);
      await page.click('.mp-msg[data-id="m3"] .mp-reac');
      await page.waitForFunction(() => !document.querySelector('.mp-msg[data-id="m3"] .mp-reac'));
      await page.waitForTimeout(400);
      assert.equal(db.messages_reactions.length, 0);
    } },
    { name: 'envoyer une photo : réduite, déposée (grande et miniature), affichée', fn: async ({ page }) => {
      await page.setInputFiles('[data-mp-joindre]', fichier('zoe.png'));
      await page.waitForSelector('[data-mp-piece]:not([hidden]) img');
      await page.fill('[data-form="messages-envoyer"] textarea', 'Regardez !');
      await page.click('.mp-envoyer');
      await page.waitForFunction(() => document.querySelector('.mp-moi .mp-photo img[src]'), null, { timeout: 10000 });
      const row = db.messages_famille.find((m) => m.texte === 'Regardez !');
      assert.ok(row?.photo?.chemin && row.photo.mini, 'chemins de la photo');
      assert.match(row.photo.chemin, /\/messages\/.+\.jpg$/);
      assert.ok(fichiers.has(row.photo.chemin) && fichiers.has(row.photo.mini), 'deux fichiers déposés');
      assert.ok(fichiers.get(row.photo.chemin).length < 300 * 1024, 'grande image allégée');
      assert.ok(row.photo.l <= 1600 && row.photo.h <= 1600);
      await page.click('.mp-moi .mp-photo');
      await page.waitForSelector('.sheet-wrap.open .mp-visu img[src]');
      await page.click('.sheet-wrap.open [data-x="album"]');
      await page.waitForTimeout(600);
      assert.ok(db.photos_famille.some((p) => p.chemin === row.photo.chemin), 'photo reprise dans l\'album');
    } },
    { name: 'hors ligne : le message attend dans la file puis part au retour du réseau', fn: async ({ page, ctx }) => {
      await H.openTab(page, 'messages');
      // Le faux PostgREST répond même hors ligne : on coupe aussi ses routes, comme le ferait le réseau.
      const coupe = (u) => u.pathname.startsWith('/rest/v1/') || u.pathname.startsWith('/storage/v1/');
      const couper = (route) => route.abort('internetdisconnected');
      await page.route(coupe, couper);
      await ctx.setOffline(true);
      await page.waitForFunction(() => !navigator.onLine);
      await page.fill('[data-form="messages-envoyer"] textarea', 'Message écrit dans le tunnel');
      await page.click('.mp-envoyer');
      await page.waitForFunction(() => [...document.querySelectorAll('.mp-moi')].some((e) => /tunnel/.test(e.textContent) && /En attente d'envoi/.test(e.textContent)));
      assert.ok(!db.messages_famille.some((m) => /tunnel/.test(m.texte || '')));
      await page.unroute(coupe, couper);
      await ctx.setOffline(false);
      await page.waitForFunction(() => Queue.size() === 0 && state.loaded && !state.offline, null, { timeout: 30000 });
      await page.waitForTimeout(800);
      const row = db.messages_famille.find((m) => /tunnel/.test(m.texte || ''));
      assert.ok(row, 'envoyé au retour du réseau');
      for (let i = 0; i < 20 && !notifs.some((n) => n.id === row.id); i++) await page.waitForTimeout(250);
      assert.ok(notifs.some((n) => n.type === 'message' && n.id === row.id), 'les autres sont prévenus une fois le message arrivé');
    } },
    { name: 'album : ajout de deux photos avec légende, date et album', fn: async ({ page }) => {
      await H.openTab(page, 'photos');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Album de famille');
      await page.setInputFiles('[data-mp-fichiers]', [fichier('a.png'), fichier('b.png')]);
      await page.waitForSelector('.sheet-wrap.open [name="legende"]');
      await page.fill('.sheet-wrap.open [name="legende"]', 'Balade au Vercors');
      await page.fill('.sheet-wrap.open [name="date"]', '2026-10-12');
      await page.click('.sheet-wrap.open [data-x="ok"]');
      await page.waitForFunction(() => /2 photos ajoutées/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
      const nouvelles = db.photos_famille.filter((p) => p.legende === 'Balade au Vercors');
      assert.equal(nouvelles.length, 2);
      assert.ok(nouvelles.every((p) => p.prise_le === '2026-10-12' && fichiers.has(p.chemin) && fichiers.has(p.miniature)));
      assert.deepEqual(notifs.filter((n) => n.type === 'photo').at(-1), { type: 'photo', ids: nouvelles.map((p) => p.id) });
      await page.waitForFunction(() => document.querySelectorAll('.mp-vignette img[src]').length >= 3, null, { timeout: 10000 });
      assert.match(await page.$eval('.mp-mois', (e) => e.textContent), /octobre 2026/i);
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'visionneuse : légende, modification, choix pour la gazette', fn: async ({ page }) => {
      const id = db.photos_famille.find((p) => p.legende === 'Balade au Vercors').id;
      await page.click(`.mp-vignette[data-id="${id}"]`);
      await page.waitForSelector('.sheet-wrap.open .mp-visu img[src]');
      assert.match(await page.$eval('.sheet-wrap.open .mp-meta', (e) => e.textContent), /12 octobre 2026/);
      await page.click('.sheet-wrap.open [data-x="modif"]');
      await page.fill('.sheet-wrap.open:last-of-type [name="legende"]', 'Balade au col de Rousset');
      await page.click('.sheet-wrap.open:last-of-type .btn.primary');
      await page.waitForTimeout(600);
      assert.equal(db.photos_famille.find((p) => p.id === id).legende, 'Balade au col de Rousset');
      const avant = await page.$eval('.sheet-wrap.open [data-x="gazette"]', (b) => b.getAttribute('aria-pressed'));
      await page.click('.sheet-wrap.open [data-x="gazette"]');
      assert.notEqual(await page.$eval('.sheet-wrap.open [data-x="gazette"]', (b) => b.getAttribute('aria-pressed')), avant, 'choix pour la gazette basculé');
      await page.click('.sheet-wrap.open [data-x="gazette"]');
      assert.equal(await page.$eval('.sheet-wrap.open [data-x="gazette"]', (b) => b.getAttribute('aria-pressed')), avant);
      await H.closeSheets(page);
    } },
    { name: 'albums : album de l\'appli et lien Google Photos partagé', fn: async ({ page }) => {
      await page.click('.mp-chips [data-v="albums"]');
      await page.click('[data-act="photos-album-nouveau"]:not([data-lien])');
      await page.fill('.sheet-wrap.open [name="titre"]', 'Les toutous');
      await page.click('.sheet-wrap.open .btn.primary');
      await page.waitForSelector('.mp-album');
      await page.click('[data-act="photos-album-nouveau"][data-lien]');
      await page.fill('.sheet-wrap.open [name="titre"]', 'Photos de l\'été');
      await page.fill('.sheet-wrap.open [name="lien"]', 'https://photos.app.goo.gl/Essai123');
      await page.click('.sheet-wrap.open .btn.primary');
      await page.waitForSelector('.mp-lien');
      assert.match(await page.$eval('.mp-lien', (e) => e.textContent), /Google Photos/);
      assert.equal(await page.$eval('.mp-lien a', (a) => a.getAttribute('href')), 'https://photos.app.goo.gl/Essai123');
      assert.deepEqual(db.photos_albums.map((a) => a.titre), ['Les toutous', 'Photos de l\'été']);
      await page.click('.mp-album');
      assert.match(await page.$eval('.mp-filtre', (e) => e.textContent), /Les toutous · 0 photo/);
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'gazette : photos du mois, nouvelles proposées, enregistrement, impression', fn: async ({ page }) => {
      await page.click('.mp-chips [data-v="gazette"]');
      await page.waitForSelector('#mp-gz-apercu .mp-gz');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Gazette des grands-parents');
      assert.match(await page.$eval('.mp-gz-mois', (e) => e.textContent), /Gazette d'octobre 2026/);
      assert.match(await page.$eval('[data-mp-gz="nouvelles"]', (e) => e.value), /photos ajoutées à l'album ce mois-ci/);
      assert.ok((await page.$$('.mp-vignette.mp-pris')).length >= 2, 'photos du mois choisies par défaut');
      await page.fill('[data-mp-gz="mot"]', 'Chers grands-parents, voici notre mois d\'octobre.');
      await page.waitForFunction(() => /Chers grands-parents/.test(document.querySelector('#mp-gz-apercu').textContent));
      await page.click('[data-act="photos-gazette-enregistrer"]');
      await page.waitForTimeout(600);
      const g = db.photos_gazettes.find((x) => x.mois === '2026-10');
      assert.ok(g && g.photos.length >= 2 && /Chers grands-parents/.test(g.mot));
      await page.evaluate(() => { window.__printOrig = window.print; window.print = () => { window.__imprime = { classe: document.body.classList.contains('mp-imprime'), html: document.querySelector('#mp-impression').innerHTML }; }; });
      await page.click('[data-act="photos-gazette-imprimer"]');
      await page.waitForFunction(() => window.__imprime, null, { timeout: 15000 });
      const imp = await page.evaluate(() => window.__imprime);
      assert.equal(imp.classe, true, 'page réservée à la gazette pendant l\'impression');
      assert.match(imp.html, /La Gazette de la Tribu/);
      assert.match(imp.html, /<img src="[^"]+"/);
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(() => document.body.classList.contains('mp-imprime')), false);
      assert.ok(db.photos_gazettes.find((x) => x.mois === '2026-10').imprimee_le);
    } },
    { name: 'mise en page à 360 px : discussion, album et gazette sans débordement', fn: async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      for (const [tab, vue] of [['messages', null], ['photos', 'photos'], ['photos', 'albums'], ['photos', 'gazette']]) {
        await H.openTab(page, tab);
        if (vue) { await page.click(`.mp-chips [data-v="${vue}"]`); await page.waitForTimeout(300); }
        assert.ok(await H.noHorizontalScroll(page), `${tab} ${vue || ''}`);
        await page.screenshot({ path: path.join(H.ROOT, 'tests', '.out', `mp-360-${vue || tab}.png`), fullPage: true });
        const large = await page.evaluate(() => [...document.querySelectorAll('#main *')].filter((e) => !e.ownerSVGElement && e.getBoundingClientRect().right > document.documentElement.clientWidth + 2 && !e.closest('.chips, .segbar')).map((e) => e.className).slice(0, 3));
        assert.deepEqual(large, [], `${tab} ${vue || ''}`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    } },
  ],
};
