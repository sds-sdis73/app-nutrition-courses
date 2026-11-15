// Accueil et notifications : fil de la famille (couleurs, filtre), bascule moi / famille, briefing du soir,
// bouton « + » flottant, Plus › Notifications (réglages par personne) et file d'envoi (briefing, rappels d'agenda).
// Mercredi 21 octobre 2026 à 18 h 30 : le briefing du lendemain est affiché. Les tables notif_prefs et notif_file
// (migration 2026-11-16_accueil-notifications.sql) sont simulées par le faux PostgREST.
const assert = require('node:assert/strict');
const H = require('../helpers');
const { installPgMock } = require('./pg-mock');

let mock = null;
const texte = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
const attendre = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000 });

module.exports = {
  name: 'Accueil et notifications : fil moi / famille, briefing du soir, réglages par personne',
  clock: '2026-10-21T18:30:00',
  viewport: { width: 360, height: 780 },
  async before({ page }) {
    mock = await installPgMock(page, { tables: ['notif_prefs', 'notif_file'], keys: { notif_prefs: ['user_id'] } });
    // Un module d'essai alimente le fil du jour et l'agenda de demain (comme le feront agenda, tâches, carnet…).
    await page.evaluate(async () => {
      const [a, j, l] = state.members;
      window.__essai = {
        jour: [
          { heure: '17:00', titre: 'Goûter chez mamie', membres: [l.id], icone: '🍪' },
          { heure: '20:30', titre: 'Réunion de crèche', detail: 'Salle des fêtes', membres: [j.id] },
          { heure: null, titre: 'Penser au pain' },
        ],
        agenda: [
          { id: 'd1', date: '2026-10-22', heure: '08:30', titre: `Déposer ${l.nom} à l'école`, membres: [a.id] },
          { id: 'd2', date: '2026-10-22', heure: '14:00', titre: 'Dentiste', membres: [j.id] },
          { id: 'd3', date: '2026-10-21', heure: '20:30', titre: 'Réunion de crèche', membres: [j.id] },
        ],
      };
      if (!Modules.get('essai-af')) {
        Modules.register({ id: 'essai-af', onglet: 'plus', rendu: () => '',
          sourcesAccueil: (ctx) => (ctx.iso === '2026-10-21' ? window.__essai.jour : []),
          agenda: () => window.__essai.agenda });
      }
      await Modules.get('notifications').charger(true, {});
    });
  },
  tests: [
    { name: 'Famille : le fil de tout le foyer, une couleur par membre, filtrable par personne', fn: async ({ page }) => {
      await H.openTab(page, 'accueil-famille');
      await page.waitForSelector('[data-af-fil="famille"] .af-item');
      const fil = await texte(page, '[data-af-fil="famille"]');
      for (const t of ['Goûter chez mamie', 'Réunion de crèche', 'Penser au pain', 'Maintenant']) assert.match(fil, new RegExp(t));
      assert.ok(fil.indexOf('Goûter') < fil.indexOf('Maintenant') && fil.indexOf('Maintenant') < fil.indexOf('Réunion'), 'repère « Maintenant » à 18 h 30');
      assert.equal(await page.$$eval('[data-af-fil="famille"] .af-item.passe', (l) => l.length), 1, 'le goûter de 17 h est passé');
      const couleurs = await page.$$eval('[data-af-fil="famille"] .af-pastille', (l) => l.map((e) => e.getAttribute('style')));
      assert.ok(couleurs.length >= 2 && couleurs.every((c) => /--af-c:var\(--m\d/.test(c)), couleurs.join(' | '));
      const julie = await page.evaluate(() => state.members[1].id);
      await page.click(`.af-membres [data-m="${julie}"]`);
      assert.deepEqual(await page.$$eval('[data-af-fil="famille"] .af-texte b', (l) => l.map((e) => e.textContent)), ['Réunion de crèche']);
      await page.click('.af-membres [data-m=""]');
      assert.ok((await page.$$eval('[data-af-fil="famille"] .af-item', (l) => l.length)) >= 3);
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'Famille : briefing du soir pour chacun (qui dépose qui, événements)', fn: async ({ page }) => {
      await page.waitForSelector('[data-af-briefing="famille"] .af-briefing');
      const b = await texte(page, '[data-af-briefing="famille"]');
      assert.match(b, /Demain\s*jeudi 22 octobre/);
      const [a, j, l] = await page.evaluate(() => state.members.map((m) => m.nom));
      assert.match(b, new RegExp(`(Toi|${a})\\s*🚗\\s*dépose ${l} à 8 h 30`));
      assert.match(b, new RegExp(`${j}\\s*📅\\s*Dentiste à 14 h`));
    } },
    { name: 'Ma journée : la bascule « moi » garde ce qui me concerne, briefing en tête', fn: async ({ page }) => {
      await H.openTab(page, 'aujourdhui');
      await page.waitForSelector('[data-af-fil="moi"] .af-item');
      const fil = await texte(page, '[data-af-fil="moi"]');
      assert.match(fil, /Aussi aujourd'hui/);
      assert.match(fil, /Goûter chez mamie/, 'l\'enfant du foyer me concerne');
      assert.match(fil, /Penser au pain/, 'tout le foyer');
      assert.doesNotMatch(fil, /Réunion de crèche/, 'la réunion de Julie n\'est pas dans ma journée');
      const b = await texte(page, '[data-af-briefing="moi"]');
      assert.match(b, /Toi/);
      assert.doesNotMatch(b, /Dentiste/, 'le briefing « moi » ne montre pas la journée de Julie');
      assert.ok(await page.$eval('[data-af-briefing="moi"]', (e) => !!e.nextElementSibling?.matches('.tl-head')), 'briefing avant le fil de la journée');
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'bouton « + » flottant : phrase libre ou dictée, type proposé', fn: async ({ page }) => {
      await page.click('.af-fab');
      await page.waitForSelector('.sheet-wrap.open [data-form="ajout-rapide"]');
      assert.match(await texte(page, '.sheet-wrap.open .af-dictee'), /micro du clavier/);
      await page.fill('.sheet-wrap.open [name="txt"]', 'acheter du sel d\'essai');
      await page.waitForSelector('.sheet-wrap.open .ajout-prop');
      assert.match(await texte(page, '.sheet-wrap.open .ajout-prop'), /Article · Sel d'essai/);
      await H.closeSheets(page);
    } },
    { name: 'Plus › Notifications : un interrupteur par type, heures de silence, enregistrés pour moi seul', fn: async ({ page }) => {
      await H.openTab(page, 'plus');
      await page.click('.plus-ligne[data-id="notifications"]');
      await page.waitForSelector('.notif [data-notif-type="agenda_modifs"]');
      const types = await page.$$eval('.notif [data-notif-type]', (l) => l.map((e) => e.dataset.notifType));
      for (const t of ['briefing', 'evenements', 'taches', 'messages', 'agenda_modifs', 'courses_modif', 'seance', 'dispos', 'batch', 'congel', 'courses', 'planning', 'bilan']) assert.ok(types.includes(t), t);
      assert.equal(await page.isChecked('[data-notif-type="agenda_modifs"]'), false, 'peu de notifications par défaut');
      await page.click('.notif-ligne:has([data-notif-type="agenda_modifs"])');
      await attendre(page, () => document.querySelector('[data-notif-type="agenda_modifs"]')?.checked);
      await page.selectOption('[data-notif-champ="silence_debut"]', '23');
      await page.waitForFunction(() => /de 23 h à 7 h/.test(document.querySelector('.notif').textContent));
      await page.selectOption('[data-notif-champ="briefing_heure"]', '20');
      await page.waitForTimeout(600);
      const uid = await page.evaluate(() => me());
      assert.equal(mock.notif_prefs.length, 1);
      const l = mock.notif_prefs[0];
      assert.equal(l.user_id, uid);
      assert.equal(l.types.agenda_modifs, true);
      assert.equal(l.silence_debut, 23);
      assert.equal(l.briefing_heure, 20);
      // Relecture depuis le serveur : les réglages reviennent.
      await page.evaluate(async () => { for (const k of Object.keys(localStorage)) if (k.includes(':mod:notifications:')) localStorage.removeItem(k); await Modules.get('notifications').charger(true, {}); render(); });
      assert.equal(await page.isChecked('[data-notif-type="agenda_modifs"]'), true);
      assert.equal(await page.$eval('[data-notif-champ="briefing_heure"]', (s) => s.value), '20');
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'file d\'envoi : briefing de demain à mon heure, rappels des événements, rappel retiré si l\'événement disparaît', fn: async ({ page }) => {
      const uid = await page.evaluate(() => me());
      const r = await page.evaluate(() => Modules.get('accueil-famille').expose.planifier());
      assert.ok(r.briefing && r.rappels >= 3, JSON.stringify(r));
      const b = mock.notif_file.find((x) => x.id === `briefing:${uid}:2026-10-22`);
      assert.ok(b, mock.notif_file.map((x) => x.id).join(', '));
      assert.equal(b.type, 'briefing');
      assert.deepEqual(b.pour_users, [uid]);
      assert.match(b.corps, /^Toi : dépose .* à 8 h 30/);
      assert.equal(new Date(b.envoyer_a).getTime(), new Date('2026-10-21T20:00:00').getTime(), 'à l\'heure choisie (20 h)');
      const ids = mock.notif_file.map((x) => x.id);
      for (const id of ['evt:essai-af:d1:2026-10-22', 'evt:essai-af:d2:2026-10-22', 'evt:essai-af:d3:2026-10-21']) assert.ok(ids.includes(id), id);
      const d3 = mock.notif_file.find((x) => x.id === 'evt:essai-af:d3:2026-10-21');
      assert.equal(d3.corps, 'Aujourd\'hui à 20 h 30');
      assert.equal(new Date(d3.evenement_a).getTime(), new Date('2026-10-21T20:30:00').getTime());
      // Deuxième passage sans changement : rien n'est réécrit.
      assert.deepEqual(await page.evaluate(() => Modules.get('accueil-famille').expose.planifier()), { briefing: false, rappels: 0 });
      await page.evaluate(() => { window.__essai.agenda = window.__essai.agenda.filter((e) => e.id !== 'd2'); });
      await page.evaluate(() => Modules.get('accueil-famille').expose.planifier());
      assert.ok(!mock.notif_file.some((x) => x.id === 'evt:essai-af:d2:2026-10-22'), 'rappel du dentiste retiré');
      const b2 = mock.notif_file.find((x) => x.id === `briefing:${uid}:2026-10-22`);
      assert.doesNotMatch(b2.corps, /Dentiste/, 'briefing mis à jour');
    } },
    { name: 'hors ligne : le réglage part dans la file d\'attente et le fil reste lisible', fn: async ({ page, ctx }) => {
      await H.openTab(page, 'notifications');
      await page.waitForSelector('.notif [data-notif-type="courses_modif"]');
      const avant = await page.evaluate(() => Queue.size());
      // Coupure réseau : le faux PostgREST échoue comme un réseau absent (page.route passe avant setOffline).
      let coupe = true;
      const tables = /\/rest\/v1\/(notif_prefs|notif_file|push_abonnements)/;
      await page.route((u) => tables.test(u.pathname), (route) => (coupe ? route.abort('internetdisconnected') : route.fallback()));
      await ctx.setOffline(true);
      try {
        await page.click('.notif-ligne:has([data-notif-type="courses_modif"])');
        await attendre(page, (n) => Queue.size() > n, avant);
        assert.equal(await page.isChecked('[data-notif-type="courses_modif"]'), true);
        await H.openTab(page, 'accueil-famille');
        await page.waitForSelector('[data-af-fil="famille"] .af-item');
        assert.match(await texte(page, '[data-af-fil="famille"]'), /Réunion de crèche/);
      } finally { coupe = false; await ctx.setOffline(false); }
      await attendre(page, () => !Queue.size() || Queue.list().every((q) => q.table !== 'notif_prefs'));
      assert.equal(mock.notif_prefs[0].types.courses_modif, true, 'réglage rejoué au retour du réseau');
    } },
  ],
};
