// Module « Tâches et listes » : saisie en phrase libre, récurrence, listes types (lancer, modifier, rétablir),
// mode vacances, cochage en direct, envies de cadeaux (« je m'en occupe » caché), fil de l'Accueil, hors ligne, 360 px.
// Les tables ne sont pas encore créées en production : faux PostgREST en mémoire (tests/e2e/pg-mock.js).
const assert = require('node:assert/strict');
const H = require('../helpers');
const { installPgMock } = require('./pg-mock');

const TABLES = ['taches', 'listes', 'liste_elements', 'envies', 'envies_reservations'];
let mock;
let memoMembre = null;
const main = (page) => page.$eval('#main', (e) => e.textContent.replace(/\s+/g, ' '));
const vue = async (page, v) => { await page.click(`.taches-vues [data-v="${v}"]`); await page.waitForTimeout(200); };
const recharger = (page) => page.evaluate(async () => { await Modules.get('taches').charger(true, { horsLigne: false }); render(); });

module.exports = {
  name: 'Tâches et listes',
  async before({ page }) {
    mock = await installPgMock(page, {
      tables: TABLES,
      keys: { envies_reservations: ['envie_id'] },
      seed: { taches: [] },
    });
    memoMembre = await page.evaluate(() => state.compte?.member_id || null);
    const ids = await page.evaluate(() => Object.fromEntries(state.members.map((m) => [m.nom, m.id])));
    // Une tâche en retard (lundi 19 octobre) confiée à Antoine.
    mock.taches.push({ id: 't-retard', foyer_id: await page.evaluate(() => foyer()), titre: 'Vermifuger les chiens', echeance: '2026-10-19', responsable: ids.Antoine, priorite: 0, fait: false });
    await recharger(page);
    await H.openTab(page, 'taches');
  },
  async after({ page }) {
    await page.evaluate(async (m) => {
      if (state.compte) state.compte.member_id = m;
      for (const x of state.extras.filter((e) => /Eau et goûters pour la route|Petits pots et lait de Zoé|Pique-nique du trajet|^Croquettes$|^Crème solaire$/.test(e.name))) await Data.deleteExtra(x.id);
    }, memoMembre);
  },
  tests: [
    { name: 'Famille › Tâches & listes : trois vues, tâche en retard en tête', fn: async ({ page }) => {
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Tâches et listes');
      assert.equal(await page.$eval('.segbar [aria-pressed="true"]', (b) => b.dataset.tab), 'taches');
      assert.deepEqual(await page.$$eval('.taches-vues button', (l) => l.map((b) => b.dataset.v)), ['taches', 'listes', 'envies']);
      await vue(page, 'taches');
      assert.equal(await page.$eval('.taches-groupe', (e) => e.textContent.trim().replace(/\s+/g, ' ')), 'En retard 1');
      assert.match(await main(page), /Vermifuger les chiens.*Antoine/);
      assert.ok(await page.$('.taches-pastille.retard'), 'pastille rouge : une tâche en retard');
    } },
    { name: 'saisie en une phrase : « appeler le véto avant vendredi Antoine »', fn: async ({ page }) => {
      await page.fill('[data-form="taches-rapide"] [name="texte"]', 'appeler le véto avant vendredi Antoine');
      await page.press('[data-form="taches-rapide"] [name="texte"]', 'Enter');
      await page.waitForTimeout(500);
      assert.match(await H.toastText(page), /Tâche ajoutée · vendredi · Antoine/);
      const t = mock.taches.find((x) => x.titre === 'Appeler le véto');
      assert.ok(t, 'tâche enregistrée');
      assert.equal(t.echeance, '2026-10-23');
      assert.equal(t.responsable, await page.evaluate(() => state.members.find((m) => m.nom === 'Antoine').id));
      assert.match(await main(page), /Cette semaine 1 .*Appeler le véto.*Vendredi.*Antoine/);
    } },
    { name: 'bouton « + » : tâche récurrente, cochée puis décochée (sans rotation)', fn: async ({ page }) => {
      await page.click('.topbar [data-act="ajout-rapide"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="ajout-rapide"]');
      assert.equal(await page.$eval('.sheet-wrap.open [data-t="tache"]', (b) => b.disabled), false, 'le type tâche est actif');
      await page.fill('.sheet-wrap.open [name="txt"]', 'sortir les poubelles tous les mardis');
      await page.waitForSelector('.sheet-wrap.open .ajout-prop');
      assert.match(await page.$eval('.sheet-wrap.open .ajout-prop', (b) => b.textContent), /Tâche · Sortir les poubelles · mardi · chaque semaine/);
      await page.click('.sheet-wrap.open .ajout-prop');
      await page.waitForTimeout(800);
      assert.match(await H.toastText(page), /Tâche ajoutée/);
      const t = mock.taches.find((x) => x.titre === 'Sortir les poubelles');
      assert.deepEqual([t.echeance, t.recurrence], ['2026-10-27', { freq: 'semaine', n: 1 }]);
      await H.openTab(page, 'taches');
      await page.click(`[data-act="taches-cocher"][data-id="${t.id}"]`);
      await page.waitForTimeout(700);
      assert.match(await H.toastText(page), /Prochaine fois : mar\.? 3 nov/);
      const suite = mock.taches.find((x) => x.precedente_id === t.id);
      assert.ok(suite && !suite.fait && suite.echeance === '2026-11-03', 'occurrence suivante créée');
      assert.equal(mock.taches.find((x) => x.id === t.id).fait, true);
      await page.click('[data-act="taches-faites"]');
      await page.click(`[data-act="taches-cocher"][data-id="${t.id}"]`);
      await page.waitForTimeout(700);
      assert.equal(mock.taches.find((x) => x.id === t.id).fait, false);
      assert.ok(!mock.taches.some((x) => x.precedente_id === t.id), 'l\'occurrence suivante disparaît');
    } },
    { name: 'feuille d\'une tâche : importante, notes, répétition', fn: async ({ page }) => {
      const id = mock.taches.find((x) => x.titre === 'Appeler le véto').id;
      await page.click(`[data-act="taches-ouvrir"][data-id="${id}"]`);
      await page.waitForSelector('.sheet-wrap.open [data-form="taches-tache"]');
      await page.check('.sheet-wrap.open [name="priorite"]');
      await page.fill('.sheet-wrap.open [name="notes"]', 'Clinique des Alpes, 04 76 00 00 00');
      await page.selectOption('.sheet-wrap.open [name="recurrence"]', 'an:1');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForTimeout(600);
      const t = mock.taches.find((x) => x.id === id);
      assert.deepEqual([t.priorite, t.notes, t.recurrence], [1, 'Clinique des Alpes, 04 76 00 00 00', { freq: 'an', n: 1 }]);
      assert.match(await main(page), /Importante.*Chaque année/);
    } },
    { name: 'fil de l\'Accueil et agenda : tâches du jour et en retard', fn: async ({ page }) => {
      const r = await page.evaluate(async () => {
        const fil = await Accueil.elements({ date: new Date(), famille: true });
        const ag = await Agenda.elements(new Date(2026, 9, 19), new Date(2026, 9, 25));
        return { fil: fil.filter((e) => e.module === 'taches').map((e) => `${e.titre}|${e.detail}`), ag: ag.filter((e) => e.source === 'taches').map((e) => `${e.date}|${e.titre}`) };
      });
      assert.deepEqual(r.fil, ['Vermifuger les chiens|En retard (lun. 19 oct.) · Antoine']);
      assert.deepEqual(r.ag, ['2026-10-19|Vermifuger les chiens', '2026-10-23|Appeler le véto']);
    } },
    { name: 'API publique : un autre module crée une tâche sans doublon', fn: async ({ page }) => {
      await page.evaluate(async () => {
        await Taches.creer({ titre: 'Entretien de la chaudière', echeance: '2026-11-02', origine: 'carnet', origine_id: 'chaudiere' });
        await Taches.creer({ titre: 'Entretien annuel de la chaudière', echeance: '2026-11-04', origine: 'carnet', origine_id: 'chaudiere' });
      });
      const l = mock.taches.filter((x) => x.origine === 'carnet');
      assert.equal(l.length, 1);
      assert.deepEqual([l[0].titre, l[0].echeance], ['Entretien annuel de la chaudière', '2026-11-04']);
      await page.evaluate(() => Taches.supprimerOrigine('carnet', 'chaudiere'));
      assert.equal(mock.taches.filter((x) => x.origine === 'carnet').length, 0);
    } },
    { name: 'mode vacances : lancé avec les dates, coché, rubrique « Courses de départ » vers les courses', fn: async ({ page }) => {
      await H.openTab(page, 'taches');
      await vue(page, 'listes');
      assert.deepEqual(await page.$$eval('.taches-modele .taches-carte-titre', (l) => l.map((b) => b.textContent)), ['Avant départ', 'Avant nounou', 'Valise ski', 'Valise plage', 'Mode vacances']);
      await page.click('[data-act="taches-lancer"][data-id="modele:vacances"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="taches-lancer"]');
      await page.fill('.sheet-wrap.open [name="debut"]', '2026-12-19');
      await page.fill('.sheet-wrap.open [name="fin"]', '2026-12-26');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForSelector('.taches-detail');
      assert.equal(await page.$eval('.taches-detail-titre', (e) => e.textContent), 'Vacances du 19 au 26 décembre');
      const l = mock.listes.find((x) => x.titre === 'Vacances du 19 au 26 décembre');
      assert.deepEqual([l.est_modele, l.date_debut, l.date_fin], [false, '2026-12-19', '2026-12-26']);
      const els = mock.liste_elements.filter((x) => x.liste_id === l.id);
      assert.equal(els.length, 28);
      assert.deepEqual(await page.$$eval('.taches-section h4', (x) => x.map((h) => h.textContent)), ['Valise', 'Chiens', 'Maison', 'Courses de départ']);
      const volets = els.find((x) => x.texte === 'Fermer les volets');
      await page.click(`[data-act="taches-el-cocher"][data-id="${volets.id}"]`);
      await page.waitForTimeout(400);
      assert.equal(mock.liste_elements.find((x) => x.id === volets.id).coche, true);
      assert.equal(await page.$eval('[data-taches-prog]', (e) => e.textContent), '1/28 coché');
      await page.click('[data-act="taches-vers-courses"]');
      await page.waitForTimeout(1500);
      assert.match(await H.toastText(page), /5 articles ajoutés aux courses/);
      assert.ok(await page.evaluate(() => state.extras.some((e) => e.name === 'Petits pots et lait de Zoé')));
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'cochage en direct : un changement venu de l\'autre téléphone s\'affiche aussitôt', fn: async ({ page }) => {
      const l = mock.listes.find((x) => /^Vacances/.test(x.titre));
      const el = mock.liste_elements.find((x) => x.liste_id === l.id && x.texte === 'Sortir les poubelles');
      await page.evaluate((e) => Taches._recevoir({ table: 'liste_elements', eventType: 'UPDATE', new: { ...e, coche: true, coche_par: 'autre-compte' } }), el);
      await page.waitForTimeout(200);
      assert.equal(await page.$eval(`[data-act="taches-el-cocher"][data-id="${el.id}"]`, (b) => b.getAttribute('aria-checked')), 'true');
      assert.equal(await page.$eval('[data-taches-prog]', (e) => e.textContent), '2/28 cochés');
      await page.evaluate((e) => Taches._recevoir({ table: 'liste_elements', eventType: 'INSERT', new: { ...e, id: 'direct-1', texte: 'Passeport de Zoé', coche: false, ordre: 99 } }), el);
      await page.waitForTimeout(200);
      assert.match(await main(page), /Passeport de Zoé/);
      await page.evaluate(() => Taches._recevoir({ table: 'liste_elements', eventType: 'DELETE', old: { id: 'direct-1' } }));
      await page.waitForTimeout(200);
      assert.doesNotMatch(await main(page), /Passeport de Zoé/);
    } },
    { name: 'liste type modifiée (Valise ski + raquettes), relancée, puis rétablie', fn: async ({ page }) => {
      await page.click('[data-act="taches-liste-retour"]');
      await page.click('[data-act="taches-liste-ouvrir"][data-id="modele:valise-ski"]');
      await page.waitForSelector('.taches-detail');
      await page.fill('[data-form="taches-element"] [name="texte"]', 'Raquettes');
      await page.selectOption('[data-form="taches-element"] [name="section"]', 'Équipement');
      await page.press('[data-form="taches-element"] [name="texte"]', 'Enter');
      await page.waitForTimeout(600);
      const m = mock.listes.find((x) => x.cle === 'valise-ski');
      assert.ok(m && m.est_modele, 'copie du foyer créée');
      assert.ok(mock.liste_elements.some((x) => x.liste_id === m.id && x.texte === 'Raquettes' && x.section === 'Équipement'));
      await page.click(`.taches-entete [data-act="taches-lancer"][data-id="${m.id}"]`);
      await page.waitForSelector('.sheet-wrap.open [data-form="taches-lancer"]');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForTimeout(700);
      const copie = mock.listes.find((x) => !x.est_modele && x.titre === 'Valise ski');
      assert.ok(copie && copie.modele_id === m.id);
      assert.ok(mock.liste_elements.some((x) => x.liste_id === copie.id && x.texte === 'Raquettes'));
      await page.click('[data-act="taches-liste-retour"]');
      await page.click(`[data-act="taches-liste-ouvrir"][data-id="${m.id}"]`);
      await page.click('[data-act="taches-liste-menu"]');
      await page.click('.sheet-wrap.open [data-x="retablir"]');
      await page.waitForSelector('.sheet-wrap.open [data-x="yes"]');
      await page.click('.sheet-wrap.open [data-x="yes"]');
      await page.waitForTimeout(600);
      assert.ok(!mock.listes.some((x) => x.cle === 'valise-ski'), 'copie du foyer supprimée');
      assert.doesNotMatch(await main(page), /Raquettes/);
    } },
    { name: 'liste libre : création, ajout, tout coché, terminée', fn: async ({ page }) => {
      await page.click('[data-act="taches-liste-retour"]');
      await page.click('[data-act="taches-liste-nouvelle"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="taches-liste"]');
      await page.fill('.sheet-wrap.open [name="titre"]', 'Films à voir');
      await page.click('.sheet-wrap.open .taches-genre:has(input[value="films"])');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForSelector('[data-form="taches-element"]');
      for (const f of ['Le Voyage de Chihiro', 'Paddington']) {
        await page.fill('[data-form="taches-element"] [name="texte"]', f);
        await page.press('[data-form="taches-element"] [name="texte"]', 'Enter');
        await page.waitForTimeout(300);
      }
      const l = mock.listes.find((x) => x.titre === 'Films à voir');
      assert.equal(l.genre, 'films');
      for (let i = 0; i < 2; i++) { await page.click('[data-act="taches-el-cocher"][aria-checked="false"]'); await page.waitForTimeout(300); }
      await page.waitForSelector('.taches-bravo');
      await page.click('.taches-bravo [data-act="taches-liste-terminer"]');
      await page.waitForTimeout(400);
      assert.equal(mock.listes.find((x) => x.id === l.id).archivee, true);
      assert.match(await main(page), /Listes terminées \(1\)/);
    } },
    { name: 'envies : « je m\'en occupe » visible des autres, jamais de la personne concernée', fn: async ({ page }) => {
      const ids = await page.evaluate(() => { const m = Object.fromEntries(state.members.map((x) => [x.nom, x.id])); state.compte.member_id = m.Antoine; render(); return m; });
      await vue(page, 'envies');
      await page.click(`[data-act="taches-envies-membre"][data-v="${ids.Julie}"]`);
      await page.click('[data-act="taches-envie-nouvelle"]');
      await page.fill('.sheet-wrap.open [name="titre"]', 'Livre de cuisine italienne');
      await page.fill('.sheet-wrap.open [name="prix"]', '30 €');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForTimeout(500);
      const e = mock.envies.find((x) => x.titre === 'Livre de cuisine italienne');
      assert.equal(e.member_id, ids.Julie);
      await page.click(`[data-act="taches-envie-reserver"][data-id="${e.id}"]`);
      await page.waitForTimeout(500);
      assert.match(await H.toastText(page), /Julie n'en saura rien/);
      assert.deepEqual(mock.envies_reservations.map((r) => [r.envie_id, r.member_id]), [[e.id, ids.Julie]]);
      assert.match(await main(page), /Tu t'en occupes/);
      // Une envie d'Antoine déjà réservée par quelqu'un d'autre : Antoine (le compte courant) ne doit rien voir.
      mock.envies.push({ id: 'env-antoine', foyer_id: e.foyer_id, member_id: ids.Antoine, titre: 'Montre de course', created_at: '2026-10-01' });
      mock.envies_reservations.push({ id: 'resa-x', foyer_id: e.foyer_id, envie_id: 'env-antoine', member_id: ids.Antoine, user_id: 'autre-compte', offert: false });
      await recharger(page);
      await page.click(`[data-act="taches-envies-membre"][data-v="${ids.Antoine}"]`);
      const txt = await main(page);
      assert.match(txt, /Mes envies.*Montre de course/);
      assert.doesNotMatch(txt, /s'en occupe|Je m'en occupe|Offert/);
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'hors ligne : dernier état relu du cache, saisie mise en file', fn: async ({ page }) => {
      await vue(page, 'taches');
      const r = await page.evaluate(async () => {
        await Modules.get('taches').charger(false, { horsLigne: true });
        render();
        return document.querySelector('#main').textContent.includes('Appeler le véto');
      });
      assert.ok(r, 'tâches relues du cache local');
      // Coupure réseau : le faux PostgREST répondrait encore, on fait donc échouer ses requêtes comme un vrai réseau coupé.
      const coupure = (url) => url.pathname.startsWith('/rest/v1/') && TABLES.includes(url.pathname.split('/').pop());
      const echec = (route) => route.abort('internetdisconnected');
      await page.route(coupure, echec);
      await page.context().setOffline(true);
      try {
        await page.fill('[data-form="taches-rapide"] [name="texte"]', 'ranger le garage samedi');
        await page.press('[data-form="taches-rapide"] [name="texte"]', 'Enter');
        await page.waitForTimeout(800);
        assert.match(await main(page), /Ranger le garage/);
        assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('queue') || '[]').some((q) => q.table === 'taches' && q.row.titre === 'Ranger le garage')), 'écriture en file d\'attente');
      } finally {
        await page.evaluate(() => { localStorage.setItem('queue', JSON.stringify(JSON.parse(localStorage.getItem('queue') || '[]').filter((q) => q.table !== 'taches'))); });
        await page.unroute(coupure, echec);
        await page.context().setOffline(false);
        await page.waitForFunction(() => state.loaded && !state.offline, null, { timeout: 30000 });
        await page.waitForTimeout(500);
      }
    } },
    { name: 'mise en page à 360 px : trois vues sans débordement', viewport: { width: 360, height: 740 }, fn: async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      for (const v of ['taches', 'listes', 'envies']) {
        await vue(page, v);
        assert.ok(await H.noHorizontalScroll(page), `débordement dans la vue ${v}`);
      }
      await vue(page, 'listes');
      await page.click('[data-act="taches-liste-ouvrir"]');
      assert.ok(await H.noHorizontalScroll(page), 'débordement dans le détail d\'une liste');
      await page.setViewportSize({ width: 390, height: 844 });
    } },
  ],
};
