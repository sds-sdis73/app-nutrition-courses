// Module « Carnet de la famille » : urgences et contacts (appel en un geste), rendez-vous médicaux dans l'agenda
// et le fil du jour, vaccins, échéances des chiens avec tâche créée, budget du mois, hors ligne et largeur 360 px.
const assert = require('node:assert/strict');
const H = require('../helpers');
const { installPgMock, realTableExists } = require('./pg-mock');

const TABLES = ['carnet_rdv', 'carnet_vaccins', 'carnet_echeances', 'carnet_categories', 'carnet_depenses', 'carnet_abonnements', 'carnet_contacts'];
let mock = null;
// Lignes d'une table (faux PostgREST, ou vraie base si la migration est appliquée).
const lignes = async (page, t) => (mock ? mock[t] : page.evaluate(async (x) => (await db.from(x).select('*').eq('foyer_id', foyer())).data, t));
const vider = (page) => page.evaluate(async (ts) => { for (const t of ts) await db.from(t).delete().eq('foyer_id', foyer()); }, TABLES);
const haut = (page) => page.locator('.sheet-wrap.open').last();
const vue = async (page, v) => { await page.click(`.carnet-onglets [data-vue="${v}"]`); await page.waitForTimeout(250); };

module.exports = {
  name: 'Carnet de la famille',
  async before({ page }) {
    const reel = await realTableExists(page, 'carnet_rdv');
    if (reel) await vider(page);
    else mock = await installPgMock(page, { tables: TABLES, keys: { carnet_vaccins: ['member_id', 'dose'] } });
    await page.evaluate(async () => {
      // Faux module taches : le carnet lui confie les échéances proches.
      window.__taches = [];
      Modules.get('taches').expose = { creerTache: async (t) => { window.__taches.push(t); } };
      localStorage.removeItem('queue');
      store.set('carnet:vue', 'sante');
      await Modules.get('carnet').charger(true, { horsLigne: false });
    });
    console.log(`    (tables du carnet ${reel ? 'réelles' : 'simulées : migration pas encore appliquée'})`);
  },
  async after({ page }) {
    await page.evaluate(() => { delete Modules.get('taches').expose; });
    if (!mock) await vider(page);
  },
  tests: [
    { name: 'Plus › Carnet : quatre volets, numéros d\'urgence en un geste', fn: async ({ page }) => {
      await H.openTab(page, 'plus');
      await page.click('.plus-ligne[data-id="carnet"]');
      await page.waitForTimeout(300);
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Carnet de la famille');
      assert.deepEqual(await page.$$eval('.carnet-onglets .chip', (l) => l.map((b) => b.textContent)), ['Santé', 'Maison & animaux', 'Budget', 'Contacts']);
      assert.doesNotMatch(await page.$eval('#main', (e) => e.textContent), /Bientôt ici|attend sa base/);
      await vue(page, 'contacts');
      const urg = await page.$$eval('.carnet-urgence', (l) => l.map((a) => a.getAttribute('href')));
      for (const n of ['tel:15', 'tel:18', 'tel:17', 'tel:112', 'tel:114', 'tel:0472116911']) assert.ok(urg.includes(n), n);
      assert.match(await page.$eval('.carnet-urgences', (e) => e.textContent), /Centre antipoison de Lyon/);
    } },
    { name: 'contact : la nounou s\'appelle d\'un geste', fn: async ({ page }) => {
      await page.click('[data-act="carnet-contact"][data-groupe="garde"]');
      const f = haut(page).locator('form[data-form="carnet-contacts"]');
      await f.locator('[name="nom"]').fill('Sophie');
      await f.locator('[name="role"]').fill('Nounou');
      await f.locator('[name="telephone"]').fill('06 12 34 56 78');
      await f.locator('button.primary').click();
      await page.waitForSelector('.carnet-appel[href="tel:0612345678"]');
      assert.match(await page.$eval('[data-groupe="garde"]', (e) => e.textContent), /Sophie[\s\S]*Nounou · 06 12 34 56 78/);
      const c = (await lignes(page, 'carnet_contacts')).find((x) => x.nom === 'Sophie');
      assert.equal(c.groupe, 'garde');
      assert.ok(c.foyer_id, 'ligne rattachée au foyer');
    } },
    { name: 'santé : rendez-vous chez le pédiatre, dans l\'agenda et le fil du jour', fn: async ({ page }) => {
      await vue(page, 'sante');
      await page.click('.carnet-titre [data-act="carnet-rdv"]');
      const f = haut(page).locator('form[data-form="carnet-rdv"]');
      await f.locator('[name="titre"]').fill('Pédiatre');
      await f.locator('[name="member_id"]').selectOption({ label: 'Léa' });
      await f.locator('[name="date"]').fill('2026-10-22');
      await f.locator('[name="heure"]').fill('09:30');
      await f.locator('[name="lieu"]').fill('Cabinet du Dr Martin');
      await f.locator('button.primary').click();
      await page.waitForTimeout(500);
      assert.match(await page.$eval('#main', (e) => e.textContent), /Pédiatre[\s\S]*Léa · Cabinet du Dr Martin[\s\S]*demain[\s\S]*9 h 30/);
      const r = await page.evaluate(async () => {
        const ag = await Agenda.elements(isoToDate('2026-10-19'), isoToDate('2026-10-25'));
        const fil = await Accueil.elements({ date: isoToDate('2026-10-22') });
        return { ag: ag.filter((x) => x.source === 'carnet').map((x) => `${x.date} ${x.heure} ${x.titre}`), fil: fil.filter((x) => x.module === 'carnet').map((x) => `${x.heure} ${x.titre}`) };
      });
      assert.ok(r.ag.includes('2026-10-22 09:30 Pédiatre'), r.ag.join(' | '));
      assert.ok(r.fil.includes('09:30 Pédiatre'), r.fil.join(' | '));
    } },
    { name: 'vaccins : doses anciennes notées, rappel des 11 ans coché avec sa date', fn: async ({ page }) => {
      const lea = await page.evaluate(() => state.members.find((m) => m.nom === 'Léa').id);
      const carte = page.locator(`.carnet-vaccin[data-membre="${lea}"]`);
      assert.match(await carte.textContent(), /dTcaP, rappel/);
      await carte.locator('[data-act="carnet-vaccins-anciens"]').click();
      await haut(page).locator('[data-x="yes"]').click();
      await page.waitForTimeout(800);
      const n = (await lignes(page, 'carnet_vaccins')).filter((v) => v.member_id === lea).length;
      assert.ok(n >= 9, `${n} doses notées`);
      assert.equal(await carte.locator('[data-act="carnet-vaccins-anciens"]').count(), 0);
      await carte.locator('[data-act="carnet-vaccins"]').click();
      await haut(page).locator('[data-dose="dtcap-11"]').check();
      await page.waitForTimeout(600);
      const v = (await lignes(page, 'carnet_vaccins')).find((x) => x.member_id === lea && x.dose === 'dtcap-11');
      assert.equal(v.fait_le, '2026-10-21');
      assert.equal(await haut(page).locator('[data-date="dtcap-11"]').inputValue(), '2026-10-21');
      await H.closeSheets(page);
    } },
    { name: 'animaux : vermifuge des chiens, tâche créée à J-7, puis « Fait »', fn: async ({ page }) => {
      await vue(page, 'maison');
      await page.click('[data-act="carnet-echeance"][data-categorie="animal"]');
      const f = haut(page).locator('form[data-form="carnet-echeances"]');
      await f.locator('[data-modele]', { hasText: 'Vermifuge' }).click();
      assert.equal(await f.locator('[name="periode"]').inputValue(), '3:mois');
      await f.locator('[name="sujet"]').fill('Les chiens');
      await f.locator('[name="prochain"]').fill('2026-10-25');
      await f.locator('button.primary').click();
      await page.waitForTimeout(800);
      const taches = await page.evaluate(() => window.__taches);
      assert.equal(taches.length, 1);
      assert.equal(taches[0].titre, 'Vermifuge · Les chiens');
      assert.equal(taches[0].echeance, '2026-10-25');
      let e = (await lignes(page, 'carnet_echeances')).find((x) => x.titre === 'Vermifuge');
      assert.equal(e.tache_pour, '2026-10-25');
      assert.match(await page.$eval('.carnet-echeance', (x) => x.textContent), /Dans 4 jours/);
      await page.click('.carnet-echeance [data-act="carnet-fait"]');
      await page.waitForTimeout(600);
      e = (await lignes(page, 'carnet_echeances')).find((x) => x.titre === 'Vermifuge');
      assert.equal(e.dernier, '2026-10-21');
      assert.equal(e.prochain, '2027-01-21');
      assert.match(await H.toastText(page), /Prochaine fois/);
      assert.equal(await page.evaluate(() => window.__taches.length), 1, 'pas de nouvelle tâche pour une échéance lointaine');
    } },
    { name: 'budget : catégories, dépense, abonnement et total du mois', fn: async ({ page }) => {
      await vue(page, 'budget');
      assert.match(await page.$eval('.carnet-mois', (e) => e.textContent), /octobre 2026/);
      await page.click('[data-act="carnet-categories"]');
      await haut(page).locator('[data-montant]').first().waitFor();
      const courses = (await lignes(page, 'carnet_categories')).find((c) => c.nom === 'Courses');
      await haut(page).locator(`[data-montant="${courses.id}"]`).fill('600');
      await haut(page).locator('button.primary').click();
      await page.waitForTimeout(500);
      await page.click('.carnet-actions [data-act="carnet-depense"]');
      let f = haut(page).locator('form[data-form="carnet-depenses"]');
      await f.locator('[name="montant"]').fill('45,90');
      await f.locator('[name="categorie_id"]').selectOption({ label: 'Courses' });
      await f.locator('[name="libelle"]').fill('Marché');
      await f.locator('button.primary').click();
      await page.waitForTimeout(500);
      await page.click('.carnet-titre [data-act="carnet-abonnement"]');
      f = haut(page).locator('form[data-form="carnet-abonnements"]');
      await f.locator('[name="libelle"]').fill('Netflix');
      await f.locator('[name="montant"]').fill('13,49');
      await f.locator('[name="date_ref"]').fill('2026-10-25');
      await f.locator('button.primary').click();
      await page.waitForTimeout(500);
      assert.match(await page.$eval('[data-total]', (e) => e.textContent), /59,39/);
      const txt = await page.$eval('#main', (e) => e.textContent);
      assert.match(txt, /Netflix[\s\S]*13,49[\s\S]*prévu/);
      assert.match(txt, /Marché[\s\S]*45,90/);
      assert.match(txt, /Courses\s*45,90\s*€\s*\/\s*600,00\s*€/);
      assert.equal((await lignes(page, 'carnet_categories')).find((c) => c.nom === 'Courses').montant, 600);
      await page.click('[data-act="carnet-mois"][data-n="1"]');
      assert.match(await page.$eval('[data-total]', (e) => e.textContent), /13,49/, 'novembre : seul le prélèvement');
      await page.click('[data-act="carnet-mois"][data-n="-1"]');
    } },
    { name: 'hors ligne : dernier état relu, contact mis en file puis envoyé', fn: async ({ page }) => {
      const coupe = (route) => route.abort('internetdisconnected');
      await page.route(/\/rest\/v1\/carnet_/, coupe);
      await page.evaluate(() => Modules.get('carnet').charger(true, { horsLigne: false }));
      await vue(page, 'contacts');
      assert.match(await page.$eval('[data-groupe="garde"]', (e) => e.textContent), /Sophie/, 'contacts relus depuis le cache');
      await page.click('[data-act="carnet-contact"][data-groupe="voisins"]');
      const f = haut(page).locator('form[data-form="carnet-contacts"]');
      await f.locator('[name="nom"]').fill('Famille Dupont');
      await f.locator('[name="telephone"]').fill('04 76 00 00 00');
      await f.locator('button.primary').click();
      await page.waitForTimeout(500);
      assert.match(await page.$eval('[data-groupe="voisins"]', (e) => e.textContent), /Famille Dupont/);
      assert.equal(await page.evaluate(() => Queue.list().filter((o) => o.table === 'carnet_contacts').length), 1);
      await page.unroute(/\/rest\/v1\/carnet_/, coupe);
      await page.evaluate(() => Queue.flush());
      assert.equal(await page.evaluate(() => Queue.size()), 0);
      assert.ok((await lignes(page, 'carnet_contacts')).some((c) => c.nom === 'Famille Dupont' && c.groupe === 'voisins'));
    } },
    { name: '360 px : aucun débordement, ni à l\'écran ni dans les feuilles', fn: async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      for (const v of ['sante', 'maison', 'budget', 'contacts']) {
        await vue(page, v);
        assert.ok(await H.noHorizontalScroll(page), `volet ${v}`);
      }
      await vue(page, 'sante');
      await page.click('.carnet-titre [data-act="carnet-rdv"]');
      await haut(page).locator('form').waitFor();
      assert.ok(await page.evaluate(() => { const s = topSheet(); return s.scrollWidth <= s.clientWidth + 1; }), 'feuille rendez-vous');
      await H.closeSheets(page);
      const lea = await page.evaluate(() => state.members.find((m) => m.nom === 'Léa').id);
      await page.click(`[data-act="carnet-vaccins"][data-membre="${lea}"]`);
      await haut(page).locator('[data-dose]').first().waitFor();
      assert.ok(await page.evaluate(() => { const s = topSheet(); return s.scrollWidth <= s.clientWidth + 1; }), 'feuille vaccins');
      await H.closeSheets(page);
      await page.setViewportSize({ width: 390, height: 844 });
    } },
  ],
};
