// Agendas reliés : lien privé d'abonnement (export ICS), agenda importé par un lien .ics (lecture seule dans l'agenda),
// iCloud dans les deux sens (CalDAV). Tables simulées (faux PostgREST) et fonction agenda-synchro simulée :
// ni la production ni iCloud ne sont touchés.
const assert = require('node:assert/strict');
const H = require('../helpers');
const { installPgMock } = require('./pg-mock');

let db;
let ids;
const appels = [];
const sheet = '.sheet-wrap.open';
const iso = (a, m, j, h = 0, mi = 0) => new Date(a, m - 1, j, h, mi).toISOString();

// Fausse fonction agenda-synchro : réponses du serveur, avec les mêmes erreurs que la vraie.
async function installFonction(page) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  await page.route((u) => u.pathname.endsWith('/functions/v1/agenda-synchro'), (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    const b = JSON.parse(route.request().postData() || '{}');
    appels.push(b);
    const json = (body, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    if (b.action === 'importer' && b.url) return /introuvable/.test(b.url) ? json({ error: 'Ce lien n\'existe plus (le calendrier a peut-être cessé d\'être partagé).' }, 400) : json({ ok: true, nom: 'Travail', nb: 2 });
    if (b.action === 'importer' && b.id) {
      return json({ ok: true, nom: 'Travail', evenements: [
        { uid: 'r1', rid: null, cle: 'r1', titre: 'Réunion d\'équipe', debut: iso(2026, 10, 19, 9, 30), fin: iso(2026, 10, 19, 10, 30), journee: false, lieu: 'Bureau', notes: 'Point budget', recurrence: { freq: 'hebdo', jours: [1, 3] }, exceptions: [], membres: [], categorie: 'evenement' },
        { uid: 's1', rid: null, cle: 's1', titre: 'Séminaire', debut: iso(2026, 10, 22), fin: iso(2026, 10, 23), journee: true, lieu: null, notes: null, recurrence: null, exceptions: [], membres: [], categorie: 'evenement' },
      ] });
    }
    if (b.action === 'caldav-relier') {
      if (!/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/.test(b.mot_de_passe)) return json({ error: 'Ce n\'est pas un mot de passe d\'application : il fait 16 lettres, sous la forme xxxx-xxxx-xxxx-xxxx.' }, 400);
      db.agenda_caldav.push({ foyer_id: ids.foyer, compte: 'an…@icloud.com', statut: 'choix', calendriers: [{ url: 'https://p1-caldav.icloud.com/1/calendars/famille/', nom: 'Famille', couleur: '#34AADCFF' }] });
      return json({ ok: true, calendriers: [{ url: 'https://p1-caldav.icloud.com/1/calendars/famille/', nom: 'Famille', couleur: '#34AADCFF' }, { url: 'https://p1-caldav.icloud.com/1/calendars/travail/', nom: 'Travail', couleur: null }] });
    }
    if (b.action === 'caldav-choisir' || b.action === 'caldav-synchro') {
      // Le serveur écrit l'événement reçu d'iCloud dans l'agenda du foyer.
      if (!db.evenements.some((e) => e.source_uid === 'dentiste@icloud')) {
        db.evenements.push({ id: 'ev-icloud', foyer_id: ids.foyer, titre: 'Dentiste (iCloud)', categorie: 'evenement', debut: iso(2026, 10, 23, 16), fin: iso(2026, 10, 23, 16, 30), journee: false,
          lieu: null, membres: [], recurrence: null, exceptions: [], rappels: [], source: 'icloud', source_uid: 'dentiste@icloud' });
      }
      Object.assign(db.agenda_caldav[0] || {}, { statut: 'ok', calendrier_url: 'https://p1-caldav.icloud.com/1/calendars/famille/', calendrier_nom: 'Famille', dernier_synchro: new Date(H.FIXED_TIME).toISOString() });
      return json({ ok: true, stats: { recus: 1, supprimes: 0, envoyes: 1, conflits: 0 } });
    }
    if (b.action === 'caldav-deconnecter') { db.agenda_caldav.length = 0; return json({ ok: true }); }
    return json({ error: 'Action inconnue' }, 400);
  });
}

module.exports = {
  name: 'Agendas reliés',
  async before({ page }) {
    ids = await page.evaluate(() => ({ foyer: state.foyer.id, moi: me(), ...Object.fromEntries(state.members.map((m) => [m.nom, m.id])) }));
    db = await installPgMock(page, {
      tables: ['agenda_export', 'agenda_abonnements', 'agenda_caldav', 'evenements', 'agenda_couleurs'],
      keys: { agenda_caldav: ['foyer_id'] },
      defaults: () => ({ foyer_id: ids.foyer, user_id: ids.moi, created_at: new Date(H.FIXED_TIME).toISOString() }),
    });
    await installFonction(page);
    await page.evaluate(async () => {
      localStorage.removeItem('agenda:vue');
      for (const k of Object.keys(localStorage)) if (k.includes('agenda-synchro')) localStorage.removeItem(k);
      await Modules.get('agenda').charger(true, {});
      await Modules.get('agenda-synchro').charger(true, {});
    });
  },
  tests: [
    { name: 'Plus › Agendas reliés : trois rubriques, aussi depuis les réglages de l\'agenda', fn: async ({ page }) => {
      await H.openTab(page, 'plus');
      await page.click('.plus-ligne[data-id="agenda-synchro"]');
      await page.waitForSelector('.async');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Agendas reliés');
      assert.deepEqual(await page.$$eval('.async-titre', (l) => l.map((e) => e.textContent)), ['L\'agenda de la famille ailleurs', 'D\'autres agendas dans l\'appli', 'iCloud dans les deux sens']);
      await H.openTab(page, 'agenda');
      await page.click('[data-act="agenda-reglages"]');
      await page.click(`${sheet} [data-act="agenda-synchro-ouvrir"]`);
      await page.waitForSelector('.async');
      assert.equal(await page.evaluate(() => sheets.length), 0, 'feuille des réglages fermée');
    } },
    { name: 'lien privé : créé, copié dans un lien webcal://, puis remplacé par un nouveau', fn: async ({ page }) => {
      await page.click('[data-act="agenda-synchro-creer-lien"]');
      await page.waitForSelector('[data-async-lien]');
      const jeton = db.agenda_export[0].jeton;
      assert.match(jeton, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(await page.$eval('[data-async-lien]', (e) => e.textContent), `webcal://svugddkrptqpjmywhorb.supabase.co/functions/v1/agenda-ics?t=${jeton}`);
      assert.match(await page.$eval('.async a.btn', (e) => e.getAttribute('href')), /^webcal:\/\//);
      await page.click('[data-act="agenda-synchro-regenerer"]');
      await page.click(`${sheet} [data-x="yes"]`);
      await page.waitForFunction((j) => !document.querySelector('[data-async-lien]').textContent.includes(j), jeton);
      assert.equal(db.agenda_export.length, 1, 'un seul lien par foyer');
      assert.notEqual(db.agenda_export[0].jeton, jeton);
    } },
    { name: 'lien .ics : un lien qui n\'existe plus est refusé, un bon lien est ajouté et lu', fn: async ({ page }) => {
      await page.click('[data-act="agenda-synchro-ajouter"]');
      await page.fill(`${sheet} [name="url"]`, 'https://calendar.google.com/introuvable/basic.ics');
      await page.click(`${sheet} button[type="submit"]`);
      await page.waitForSelector(`${sheet} [data-async-msg]:not([hidden])`);
      assert.match(await page.$eval(`${sheet} [data-async-msg]`, (e) => e.textContent), /n'existe plus/);
      await page.fill(`${sheet} [name="url"]`, 'webcal://calendar.google.com/calendar/ical/antoine/basic.ics');
      await page.fill(`${sheet} [name="nom"]`, 'Travail d\'Antoine');
      await page.selectOption(`${sheet} [name="membre"]`, ids.Antoine);
      await page.click(`${sheet} button[type="submit"]`);
      await page.waitForFunction(() => /2 événements/.test(document.querySelector('.async-abo')?.textContent || ''));
      assert.equal(db.agenda_abonnements[0].url, 'https://calendar.google.com/calendar/ical/antoine/basic.ics');
      assert.equal(db.agenda_abonnements[0].member_id, ids.Antoine);
      assert.match(await page.$eval('.async-abo', (e) => e.textContent), /Travail d'Antoine.*Antoine/s);
    } },
    { name: 'agenda : les événements importés en pointillés, en lecture seule, masquables', fn: async ({ page }) => {
      await H.openTab(page, 'agenda');
      await page.evaluate(() => { localStorage.setItem('agenda:vue', '"semaine"'); });
      await page.click('.agenda-modes [data-mode="semaine"]');
      await page.waitForFunction(() => [...document.querySelectorAll('.agenda-item.externe')].some((e) => /Réunion d'équipe/.test(e.textContent)));
      const items = await page.$$eval('.agenda-item.externe', (l) => l.map((e) => e.textContent.replace(/\s+/g, ' ')));
      assert.equal(items.filter((t) => /Réunion d'équipe/.test(t)).length, 2, 'lundi et mercredi');
      assert.equal(items.filter((t) => /Séminaire/.test(t)).length, 2, 'jeudi et vendredi');
      assert.ok(items.filter((t) => /Réunion|Séminaire/.test(t)).every((t) => /Agendas reliés/.test(t) && /Travail d'Antoine/.test(t)), 'étiquette de la source et nom de l\'agenda');
      await page.click('.agenda-item.externe[data-act="agenda-synchro-voir"]');
      await page.waitForSelector(sheet);
      assert.match(await page.$eval(sheet, (e) => e.textContent), /lecture seule/);
      await H.closeSheets(page);
      // Agenda masqué : ses événements disparaissent.
      await H.openTab(page, 'agenda-synchro');
      await page.click('[data-async-actif]');
      for (let i = 0; i < 30 && db.agenda_abonnements[0].actif !== false; i++) await page.waitForTimeout(100);
      assert.equal(db.agenda_abonnements[0].actif, false);
      await H.openTab(page, 'agenda');
      await page.waitForTimeout(600);
      assert.equal(await page.$$eval('.agenda-item.externe', (l) => l.filter((e) => /Réunion/.test(e.textContent)).length), 0);
      await H.openTab(page, 'agenda-synchro');
      await page.click('[data-async-actif]');
      for (let i = 0; i < 30 && db.agenda_abonnements[0].actif !== true; i++) await page.waitForTimeout(100);
      assert.equal(db.agenda_abonnements[0].actif, true);
    } },
    { name: 'iCloud : aide pas à pas, mot de passe refusé, calendrier choisi, événement reçu dans l\'agenda', fn: async ({ page }) => {
      await page.click('[data-act="agenda-synchro-aide"]');
      await page.waitForSelector(`${sheet} .async-etapes`);
      assert.match(await page.$eval(`${sheet} .async-etapes`, (e) => e.textContent), /appleid\.apple\.com.*Mots de passe pour app/s);
      await page.click(`${sheet} [data-act="agenda-synchro-icloud"]`);
      await page.waitForSelector(`${sheet} [data-form="agenda-synchro-icloud"]`);
      assert.equal(await page.evaluate(() => sheets.length), 1, 'l\'aide laisse place au formulaire');
      await page.fill(`${sheet} [name="identifiant"]`, 'antoine@icloud.com');
      await page.fill(`${sheet} [name="mdp"]`, 'MonVraiMotDePasse');
      await page.click(`${sheet} button[type="submit"]`);
      await page.waitForSelector(`${sheet} [data-async-msg]:not([hidden])`);
      assert.match(await page.$eval(`${sheet} [data-async-msg]`, (e) => e.textContent), /16 lettres/);
      await page.fill(`${sheet} [name="mdp"]`, 'abcd-efgh-ijkl-mnop');
      await page.click(`${sheet} button[type="submit"]`);
      await page.waitForSelector(`${sheet} .async-cal`);
      assert.deepEqual(await page.$$eval(`${sheet} .async-cal`, (l) => l.map((e) => e.textContent.trim())), ['Famille', 'Travail']);
      await page.click(`${sheet} .async-cal[data-url$="/famille/"]`);
      await page.waitForFunction(() => /Famille · synchronisé/.test(document.querySelector('.async')?.textContent || ''));
      assert.deepEqual(appels.filter((a) => a.action?.startsWith('caldav')).map((a) => a.action), ['caldav-relier', 'caldav-relier', 'caldav-choisir']);
      assert.equal(appels.find((a) => a.action === 'caldav-relier' && a.mot_de_passe === 'abcd-efgh-ijkl-mnop').identifiant, 'antoine@icloud.com');
      await H.openTab(page, 'agenda');
      await page.waitForFunction(() => /Dentiste \(iCloud\)/.test(document.querySelector('#main').textContent));
    } },
    { name: 'iCloud : synchroniser maintenant, puis délier', fn: async ({ page }) => {
      await H.openTab(page, 'agenda-synchro');
      await page.click('[data-act="agenda-synchro-icloud-synchro"]');
      await page.waitForFunction(() => /synchronisé/.test(document.querySelector('.async')?.textContent || '') && !document.querySelector('[data-act="agenda-synchro-icloud-synchro"]')?.disabled);
      assert.equal(appels.at(-1).action, 'caldav-synchro');
      await page.click('[data-act="agenda-synchro-icloud-delier"]');
      await page.click(`${sheet} [data-x="yes"]`);
      await page.waitForSelector('[data-act="agenda-synchro-icloud"]');
      assert.equal(appels.at(-1).action, 'caldav-deconnecter');
    } },
    { name: 'hors ligne : écran lisible, boutons désactivés, agendas importés toujours affichés', fn: async ({ page, ctx }) => {
      await ctx.setOffline(true);
      await page.evaluate(() => { state.offline = true; render(); });
      await H.openTab(page, 'agenda-synchro');
      assert.match(await page.$eval('.async', (e) => e.textContent), /Hors ligne/);
      assert.equal(await page.$eval('[data-act="agenda-synchro-ajouter"]', (e) => e.disabled), true);
      await H.openTab(page, 'agenda');
      await page.waitForFunction(() => /Réunion d'équipe/.test(document.querySelector('#main').textContent));
      await ctx.setOffline(false);
      await page.evaluate(() => { state.offline = false; render(); });
    } },
    { name: 'mise en page à 360 px : écran et feuilles sans débordement', fn: async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await H.openTab(page, 'agenda-synchro');
      assert.ok(await H.noHorizontalScroll(page));
      await page.click('[data-act="agenda-synchro-ajouter"]');
      await page.waitForSelector(sheet);
      assert.ok(await page.$eval(`${sheet} .sheet`, (e) => e.scrollWidth <= e.clientWidth + 1));
      await H.closeSheets(page);
      await page.click('[data-act="agenda-synchro-aide"]');
      await page.waitForSelector(sheet);
      assert.ok(await page.$eval(`${sheet} .sheet`, (e) => e.scrollWidth <= e.clientWidth + 1));
      await H.closeSheets(page);
      await page.setViewportSize({ width: 390, height: 844 });
    } },
  ],
};
