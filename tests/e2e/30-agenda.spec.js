// Agenda familial : vues semaine, jour, mois et par personne ; vacances de la zone A et jours fériés (API publiques simulées) ;
// ajout par le « + » en phrase libre ; formulaire avec récurrence ; suppression d'une seule fois ; couleurs ; hors ligne.
// Les tables evenements et agenda_couleurs sont simulées (faux PostgREST) : la migration 2026-11-16_agenda.sql n'est pas encore appliquée.
const assert = require('node:assert/strict');
const H = require('../helpers');
const { installPgMock } = require('./pg-mock');

const FERIES = { '2026-11-01': 'Toussaint', '2026-11-11': '11 novembre', '2026-12-25': 'Jour de Noël' };
const VACANCES = { total_count: 2, results: [
  { description: 'Vacances de la Toussaint', start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00', population: '-' },
  { description: 'Vacances de Noël', start_date: '2026-12-18T23:00:00+00:00', end_date: '2027-01-03T23:00:00+00:00', population: '-' },
] };
let mock;
let ids;
const main = (page) => page.$eval('#main', (e) => e.textContent);
const mode = async (page, m) => { await page.click(`.agenda-modes [data-mode="${m}"]`); await page.waitForTimeout(250); };
const sheet = '.sheet-wrap.open';

module.exports = {
  name: 'Agenda familial',
  async before({ page }) {
    const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    await page.route((u) => u.hostname === 'calendrier.api.gouv.fr', (r) => json(r, FERIES));
    await page.route((u) => u.hostname === 'data.education.gouv.fr', (r) => json(r, VACANCES));
    ids = await page.evaluate(() => ({ foyer: state.foyer.id, ...Object.fromEntries(state.members.map((m) => [m.nom, m.id])) }));
    mock = await installPgMock(page, { tables: ['evenements', 'agenda_couleurs'], seed: { evenements: [{
      id: 'ev-judo', foyer_id: ids.foyer, titre: 'Judo', categorie: 'activite', debut: new Date(2026, 9, 7, 14, 0).toISOString(), fin: new Date(2026, 9, 7, 15, 0).toISOString(),
      journee: false, lieu: 'Gymnase', membres: [ids['Léa']], responsable: ids.Antoine, responsable_retour: null, recurrence: { freq: 'hebdo', jours: [3] }, exceptions: [], rappels: [{ member_id: ids.Julie, minutes: 30 }] }] } });
    await page.evaluate(async () => {
      localStorage.removeItem('agenda:public'); localStorage.removeItem('agenda:vue'); localStorage.removeItem('agenda:affichage');
      await Modules.get('agenda').charger(true, {});
      for (let i = 0; i < 40 && !JSON.parse(localStorage.getItem('agenda:public') || '{}').maj; i++) await new Promise((r) => setTimeout(r, 100));
    });
  },
  tests: [
    { name: 'Famille › Agenda : semaine en cours, vacances de la Toussaint, judo du mercredi', fn: async ({ page }) => {
      await page.click('.tabbar [data-tab="famille"]');
      await page.waitForSelector('.agenda');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Agenda familial');
      assert.equal(await page.$eval('.agenda-periode', (e) => e.textContent), 'Du 19 au 25 octobre');
      const mercredi = await page.$eval('.agenda-jour.auj', (e) => e.textContent);
      assert.match(mercredi, /Mercredi 21 octobre/);
      assert.match(mercredi, /Aujourd'hui/);
      assert.match(mercredi, /Vacances/);
      assert.match(mercredi, /14 h.*Judo.*Gymnase · Léa · Antoine s'en occupe/s);
      assert.equal(await page.$$eval('.agenda-jour', (l) => l.length), 7);
      // Mercredi : la semaine commence par aujourd'hui ; lundi et mardi sont repliés au-dessus.
      assert.ok(await page.$eval('.agenda > .agenda-jour', (e) => e.classList.contains('auj')), 'premier jour affiché = aujourd\'hui');
      assert.equal(await page.$$eval('details.agenda-passes .agenda-jour', (l) => l.length), 2);
      assert.equal(await page.$eval('details.agenda-passes', (d) => d.open), false);
      assert.match(await page.$eval('details.agenda-passes summary', (e) => e.textContent), /Début de semaine \(lundi → mardi\)/);
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'vue jour : bandeau des vacances, fiche de l\'événement récurrent', fn: async ({ page }) => {
      await mode(page, 'jour');
      assert.equal(await page.$eval('.agenda-periode', (e) => e.textContent), 'Mercredi 21 octobre');
      assert.match(await page.$eval('.agenda-bandeau', (e) => e.textContent), /Vacances de la Toussaint · zone A, du sam\. 17 oct\. au dim\. 1 nov\./);
      await page.click('.agenda-item:has-text("Judo")');
      await page.waitForSelector(`${sheet} .agenda-fiche`);
      const fiche = await page.$eval(`${sheet} .agenda-fiche`, (e) => e.textContent);
      assert.match(fiche, /Mercredi 21 octobre, 14 h – 15 h/);
      assert.match(fiche, /Tous les mercredis/);
      assert.match(fiche, /S'en occupe : Antoine/);
      assert.match(fiche, /Julie : 30 min avant/);
      await H.closeSheets(page);
      const fil = await page.evaluate(async () => (await Accueil.elements({ date: new Date(), famille: true })).filter((e) => e.module === 'agenda').map((e) => `${e.heure} ${e.titre}`));
      assert.deepEqual(fil, ['14:00 Judo']);
    } },
    { name: 'bouton « + » : « dentiste Julie le 3 novembre à 9h30 » devient un rendez-vous', fn: async ({ page }) => {
      await page.click('.topbar [data-act="ajout-rapide"]');
      await page.waitForSelector(`${sheet} [data-form="ajout-rapide"]`);
      assert.equal(await page.$eval(`${sheet} [data-t="evenement"]`, (b) => b.disabled), false);
      await page.fill(`${sheet} [name="txt"]`, 'dentiste Julie le 3 novembre à 9h30');
      await page.waitForSelector(`${sheet} .ajout-prop`);
      assert.match(await page.$eval(`${sheet} .ajout-prop`, (b) => b.textContent), /Événement · Dentiste · mar\. 3 nov\. à 9 h 30 · Julie/);
      await page.click(`${sheet} .ajout-prop`);
      await page.waitForTimeout(900);
      assert.match(await H.toastText(page), /Ajouté à l'agenda : Dentiste, mar\. 3 nov\. à 9 h 30/);
      const r = mock.evenements.find((e) => e.titre === 'Dentiste');
      assert.ok(r, 'ligne enregistrée');
      assert.deepEqual([r.categorie, r.journee, r.membres, r.foyer_id], ['rdv', false, [ids.Julie], ids.foyer]);
      assert.equal(new Date(r.debut).getTime(), new Date(2026, 10, 3, 9, 30).getTime());
    } },
    { name: 'vue mois : novembre, points de couleur, jours fériés et vacances', fn: async ({ page }) => {
      await H.openTab(page, 'agenda');
      await mode(page, 'mois');
      assert.equal(await page.$eval('.agenda-periode', (e) => e.textContent), 'Novembre 2026');
      assert.equal(await page.$$eval('.agenda-case', (l) => l.length), 42);
      assert.ok(await page.$('.agenda-case[data-date="2026-11-11"].ferie'));
      assert.ok(await page.$('.agenda-case[data-date="2026-11-01"].vac'));
      assert.equal(await page.$('.agenda-case[data-date="2026-11-02"].vac'), null);
      assert.ok(await page.$('.agenda-case[data-date="2026-11-03"] .agenda-pastille'));
      await page.click('.agenda-case[data-date="2026-11-03"]');
      assert.match(await main(page), /Mardi 3 novembre.*9 h 30.*Dentiste/s);
      await page.setViewportSize({ width: 360, height: 760 });
      assert.ok(await H.noHorizontalScroll(page), 'mois à 360 px');
    } },
    { name: 'formulaire : piscine tous les mardis à 18 h, 3 fois', fn: async ({ page }) => {
      await mode(page, 'semaine');
      await page.click('[data-act="agenda-nouveau"]');
      await page.waitForSelector(`${sheet} [data-form="agenda-evenement"]`);
      assert.ok(await H.noHorizontalScroll(page), 'formulaire à 360 px');
      const f = `${sheet} [data-form="agenda-evenement"]`;
      await page.fill(`${f} [name="titre"]`, 'Piscine');
      await page.click(`${f} [data-cat="activite"]`);
      await page.fill(`${f} [name="date"]`, '2026-10-27');
      await page.fill(`${f} [name="heure"]`, '18:00');
      await page.fill(`${f} [name="heure_fin"]`, '19:00');
      await page.click(`${f} [data-membre="${ids.Julie}"]`);
      await page.click(`${f} [data-membre="${ids['Léa']}"]`);
      await page.selectOption(`${f} [name="responsable"]`, ids.Julie);
      await page.selectOption(`${f} [name="freq"]`, 'hebdo');
      assert.equal(await page.$eval(`${f} [data-jour="2"]`, (b) => b.getAttribute('aria-pressed')), 'true');
      await page.selectOption(`${f} [name="fin_type"]`, 'nombre');
      await page.fill(`${f} [name="nombre"]`, '3');
      assert.equal(await page.$eval(`${f} [data-regle]`, (e) => e.textContent), 'Tous les mardis, 3 fois');
      await page.click(`${f} button.primary`);
      await page.waitForTimeout(800);
      assert.match(await H.toastText(page), /Événement ajouté/);
      const r = mock.evenements.find((e) => e.titre === 'Piscine');
      assert.deepEqual(r.recurrence, { freq: 'hebdo', jours: [2], nombre: 3 });
      assert.equal(r.responsable, ids.Julie);
      assert.equal(await page.$eval('.agenda-periode', (e) => e.textContent), 'Du 26 octobre au 1er novembre');
      assert.match(await page.$eval('.agenda-jour:nth-of-type(2)', (e) => e.textContent), /18 h.*Piscine.*Julie et Léa · Julie s'en occupe/s);
      const piscines = [];
      for (let i = 0; i < 4; i++) { piscines.push((await main(page)).includes('Piscine')); await page.click('[data-act="agenda-pas"][data-pas="1"]'); await page.waitForTimeout(150); }
      assert.deepEqual(piscines, [true, true, true, false]);
      await page.click('[data-act="agenda-auj"]');
    } },
    { name: 'supprimer une seule fois du judo, la série continue', fn: async ({ page }) => {
      await page.click('[data-act="agenda-pas"][data-pas="1"]');
      await page.waitForTimeout(150);
      await page.click('.agenda-item:has-text("Judo")');
      await page.waitForSelector(`${sheet} [data-x="suppr"]`);
      await page.click(`${sheet} [data-x="suppr"]`);
      await page.waitForSelector(`${sheet} [data-p="une"]`);
      await page.click(`${sheet} [data-p="une"]`);
      await page.waitForTimeout(800);
      assert.match(await H.toastText(page), /Cette fois est retirée de la série/);
      assert.deepEqual(mock.evenements.find((e) => e.id === 'ev-judo').exceptions, ['2026-10-28']);
      assert.ok(!(await main(page)).includes('Judo'), 'plus de judo le 28 octobre');
      await page.click('[data-act="agenda-pas"][data-pas="1"]');
      await page.waitForTimeout(150);
      assert.ok((await main(page)).includes('Judo'), 'judo le 4 novembre');
      await page.click('[data-act="agenda-auj"]');
    } },
    { name: 'par personne et filtre : Léa a le judo, Antoine s\'en occupe', fn: async ({ page }) => {
      await mode(page, 'personnes');
      const blocs = await page.$$eval('.agenda-personne', (l) => l.map((b) => b.textContent));
      assert.match(blocs.find((b) => b.includes('Léa')), /Judo/);
      assert.match(blocs.find((b) => b.includes('Antoine')), /Judo/);
      assert.ok(!blocs.find((b) => b.includes('Julie')).includes('Judo'));
      await page.click(`[data-act="agenda-filtre"][data-id="${ids.Julie}"]`);
      assert.equal(await page.$$eval('.agenda-personne', (l) => l.length), 1);
      await page.click('[data-act="agenda-filtre"][data-id=""]');
      await mode(page, 'semaine');
    } },
    { name: 'réglages : couleur de Léa, vacances masquées', fn: async ({ page }) => {
      await page.click('[data-act="agenda-reglages"]');
      await page.waitForSelector(`${sheet} .agenda-nuancier`);
      await page.click(`${sheet} [data-m="${ids['Léa']}"][data-c="m4"]`);
      await page.waitForTimeout(600);
      assert.equal(mock.agenda_couleurs.find((c) => c.id === ids['Léa'])?.couleur, 'm4');
      assert.equal(await page.$eval(`${sheet} [data-m="${ids['Léa']}"][data-c="m4"]`, (b) => b.getAttribute('aria-checked')), 'true');
      await page.uncheck(`${sheet} [data-aff="vacances"]`);
      await H.closeSheets(page);
      assert.match(await page.$eval('.agenda-item:has-text("Judo")', (b) => b.getAttribute('style')), /--m4/);
      assert.ok(!(await main(page)).includes('Vacances'));
      await page.evaluate(() => localStorage.removeItem('agenda:affichage'));
    } },
    { name: 'hors ligne : l\'ajout part dans la file et s\'envoie au retour du réseau', fn: async ({ page }) => {
      const coupure = (route) => (route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.fallback());
      await page.route('**/rest/v1/evenements*', coupure);
      const avant = await page.evaluate(() => Queue.size());
      await page.click('[data-act="agenda-nouveau"]');
      await page.waitForSelector(`${sheet} [data-form="agenda-evenement"]`);
      await page.fill(`${sheet} [name="titre"]`, 'Réunion de crèche');
      await page.fill(`${sheet} [name="heure"]`, '17:30');
      await page.fill(`${sheet} [name="heure_fin"]`, '18:30');
      await page.click(`${sheet} button.primary`);
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => Queue.size()), avant + 1);
      assert.ok((await main(page)).includes('Réunion de crèche'), 'visible tout de suite');
      assert.ok(!mock.evenements.some((e) => e.titre === 'Réunion de crèche'));
      await page.unroute('**/rest/v1/evenements*', coupure);
      await page.evaluate(() => Queue.flush());
      assert.ok(mock.evenements.some((e) => e.titre === 'Réunion de crèche'), 'envoyé au retour du réseau');
      const lu = await page.evaluate(async () => { await Modules.get('agenda').charger(true, { horsLigne: true }); render(); return document.querySelector('#main').textContent.includes('Réunion de crèche'); });
      assert.ok(lu, 'relu depuis le cache local');
    } },
  ],
};
