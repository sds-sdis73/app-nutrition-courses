// Module Forme : onglet fusionné Courses/Batch, questionnaire, plan de la semaine, check-in, minuteur, saisie GPX,
// suivi, réglages, intégration (activités, budget, coquillages, fil du jour) et hors ligne.
const assert = require('node:assert/strict');
const H = require('../helpers');
const { installFormeMock } = require('./forme-mock');

const gpx = () => {
  const pts = [];
  const t0 = Date.UTC(2026, 9, 20, 16, 0, 0);
  for (let i = 0; i <= 600; i++) pts.push(`<trkpt lat="${(45.5 + i * 0.0001).toFixed(6)}" lon="5.9"><ele>${(300 + i * 0.5).toFixed(1)}</ele><time>${new Date(t0 + i * 6000).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`);
  return `<?xml version="1.0"?><gpx version="1.1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><type>running</type><trkseg>${pts.join('')}</trkseg></trkseg></trk></gpx>`.replace('</trkseg></trkseg>', '</trkseg>');
};
const skipToEnd = async (page) => { for (let k = 0; k < 400 && !(await page.$('.fplayer [data-x="end"]')); k++) { const s = await page.$('.fplayer [data-p="serie"]'); await (s || await page.$('.fplayer [data-p="next"]')).click(); } };
const forme = (page) => page.evaluate(() => JSON.parse(JSON.stringify({ ok: state.forme.ok, profil: state.forme.profil, lieux: state.forme.lieux, seances: state.forme.seances, mens: state.forme.mens })));

module.exports = {
  name: 'Module Forme',
  async before({ page }) {
    const real = await page.evaluate(async () => { const { error } = await db.from('forme_seances').select('id').limit(1); return !error; });
    if (!real) await installFormeMock(page);
    else await page.evaluate(async () => { const m = memberById(state.compte?.member_id); if (m) for (const t of Object.values(Forme.TABLES)) await db.from(t).delete().eq('member_id', m.id); });
    await page.evaluate(async () => {
      // Le compte de test est le premier membre du foyer (« je suis »).
      if (!state.compte.member_id) { const m = state.members[0]; await db.from('foyer_comptes').update({ member_id: m.id }).eq('user_id', me()); state.compte.member_id = m.id; }
      await Data.saveMember({ ...memberById(state.compte.member_id), objectif: 'perte' });
      localStorage.removeItem('queue');
      await Forme.load(true);
    });
    console.log(`    (tables Forme ${real ? 'réelles' : 'simulées : migration pas encore appliquée'})`);
  },
  async after({ page }) {
    await page.evaluate(async () => { const m = memberById(state.compte.member_id); await db.from('activites').delete().eq('member_id', m.id).eq('source', 'forme'); await Data.saveMember({ ...m, objectif: 'maintien' }); });
  },
  tests: [
    { name: 'barre : Forme remplace Batch, Courses et Batch partagent un onglet avec un segment', fn: async ({ page }) => {
      assert.deepEqual(await page.$$eval('.tabbar button', (b) => b.map((x) => x.dataset.tab)), ['aujourdhui', 'scan', 'recettes', 'planning', 'suivi', 'courses', 'forme']);
      await H.openTab(page, 'courses');
      await page.click('.seg2 [data-v="batch"]');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Batch cooking');
      await H.openTab(page, 'batch');
      assert.equal(await page.evaluate(() => state.tab), 'courses');
      await page.click('.seg2 [data-v="courses"]');
      assert.equal(await page.$eval('#title', (e) => e.textContent), 'Liste de courses');
    } },
    { name: 'compte sans « je suis » : choix du membre directement dans Forme', fn: async ({ page }) => {
      const id = await page.evaluate(() => state.compte.member_id);
      await page.evaluate(() => { state.compte.member_id = null; state.forme = Forme.blank(); });
      await H.openTab(page, 'forme');
      await page.waitForSelector('[data-form="forme-moi"]');
      await page.selectOption('[data-form="forme-moi"] [name="m"]', id);
      await page.click('[data-form="forme-moi"] button.primary');
      await page.waitForSelector('[data-form="forme-q"]');
      assert.equal(await page.evaluate(() => state.compte.member_id), id);
      const { data } = await page.evaluate(async () => db.from('foyer_comptes').select('member_id').eq('user_id', me()).single());
      assert.equal(data.member_id, id, 'lien enregistré côté serveur');
    } },
    { name: 'questionnaire de départ en 3 écrans (cas type : reprise, montagne, matériel à la maison)', fn: async ({ page }) => {
      await H.openTab(page, 'forme');
      await page.waitForSelector('[data-form="forme-q"]');
      await page.click('[name="niveau"][value="reprise"] + span');
      await page.click('[name="objectif_forme"][value="perte"] + span');
      await page.click('[name="terrain"][value="montagne"] + span');
      await page.click('[data-form="forme-q"] button.primary');
      await page.selectOption('[name="course"]', '1');
      await page.fill('[name="longue_km"]', '10');
      await page.click('[data-form="forme-q"] button.primary');
      for (const m of ['halteres', 'kettlebell', 'velo']) await page.click(`[name="materiel"][value="${m}"] + span`);
      await page.click('[data-form="forme-q"] button.primary');
      await page.waitForSelector('[data-form="forme-dispos"]');
      const F = await forme(page);
      assert.equal(F.profil.niveau, 'reprise');
      assert.equal(F.profil.depart.longue_km, 10);
      assert.deepEqual(F.lieux.map((l) => l.nom), ['Maison', 'Extérieur', 'Hôtel']);
      assert.deepEqual(F.lieux[0].materiel, ['halteres', 'kettlebell', 'velo']);
    } },
    { name: 'disponibilités → plan de la semaine (sortie longue samedi, D+), écrit dans les activités', fn: async ({ page }) => {
      await page.click('[data-form="forme-dispos"] button.primary');
      await page.waitForSelector('.f-card');
      const F = await forme(page);
      const sl = F.seances.find((s) => s.prevu.sous === 'sl');
      assert.ok(sl && sl.date === '2026-10-24', JSON.stringify(F.seances.map((s) => [s.date, s.prevu.sous])));
      assert.ok(sl.dplus_m > 0);
      assert.ok(F.seances.every((s) => s.date >= '2026-10-21'), 'aucune séance dans le passé');
      const acts = await page.evaluate(() => state.activites.filter((a) => a.source === 'forme').map((a) => a.ref));
      assert.equal(acts.length, F.seances.length);
      assert.equal(await page.$$eval('.f-card', (c) => c.length), F.seances.length);
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'séance du jour dans le fil Aujourd\'hui, check-in allégé puis minuteur jusqu\'à la fin', fn: async ({ page }) => {
      await page.click('[data-act="forme-add"]');
      await page.selectOption('.sheet-wrap.open [name="sous"]', 'ef');
      await page.fill('.sheet-wrap.open [name="duree"]', '30');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForTimeout(800);
      await H.openTab(page, 'aujourdhui');
      await page.waitForSelector('.tl-item.sport [data-act="forme-go"]');
      const before = await page.evaluate(() => companionOf(journalMember())?.coquillages || 0);
      const kcal0 = await page.evaluate(() => needs(journalMember(), new Date()).kcal);
      await page.click('.tl-item.sport [data-act="forme-go"]');
      await page.waitForSelector('.sheet-wrap.open .f-scale');
      await page.click('.sheet-wrap.open [name="fatigue"][value="4"] + span');
      assert.match(await page.$eval('[data-x="dec"]', (e) => e.textContent), /allégée/);
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForSelector('.fplayer .f-p-ring');
      await skipToEnd(page);
      await page.fill('.fplayer [name="km"]', '4.2');
      await page.click('.fplayer [data-x="end"] button.primary');
      await page.waitForTimeout(1800);
      const s = (await forme(page)).seances.find((x) => x.date === '2026-10-21' && x.type === 'course');
      assert.equal(s.statut, 'fait');
      assert.equal(s.duree_min >= 1, true);
      assert.equal(s.distance_m, 4200);
      assert.equal(s.checkin.decision, 'alleger');
      assert.equal(s.prevu.duree_min, 21, 'allégée de 30 %');
      const act = await page.evaluate((id) => state.activites.find((a) => a.ref === `forme:${id}`), s.id);
      assert.equal(act.statut, 'fait');
      assert.ok(await page.evaluate(() => companionOf(journalMember())?.coquillages || 0) > before, 'coquillages gagnés');
      assert.equal(await page.evaluate(() => needs(journalMember(), new Date()).kcal), kcal0 + Math.round(act.kcal * 0.5), 'budget : +50 % des kcal en perte de poids');
    } },
    { name: 'renfo maintenant : tirage sans matériel, remplacer un exercice, lecteur avec séries', fn: async ({ page }) => {
      await page.evaluate(() => { state.forme.view = 'seance'; switchTab('forme'); });
      const lieu = await page.evaluate(() => state.forme.lieux.find((l) => l.nom === 'Extérieur').id);
      await page.selectOption('[data-form="forme-gen"] [name="lieu"]', lieu);
      await page.fill('[data-form="forme-gen"] [name="duree"]', '20');
      await page.click('[data-form="forme-gen"] [name="format"][value="force"] + span');
      await page.click('[data-form="forme-gen"] button.primary');
      await page.waitForSelector('.f-draft');
      const exos = await page.evaluate(() => state.forme.draft.blocs.flatMap((b) => b.items.map((i) => formeExo(i.exo))));
      assert.ok(exos.every((e) => !e.materiel.length), 'que des exercices sans matériel');
      const first = await page.evaluate(() => state.forme.draft.blocs.find((b) => b.kind === 'force').items[0].exo);
      const bi = await page.evaluate(() => state.forme.draft.blocs.findIndex((b) => b.kind === 'force'));
      await page.click(`[data-act="forme-swap"][data-b="${bi}"][data-i="0"]`);
      assert.notEqual(await page.evaluate((b) => state.forme.draft.blocs[b].items[0].exo, bi), first);
      await page.click('[data-act="forme-play"]');
      await page.waitForSelector('.fplayer');
      await skipToEnd(page);
      await page.click('.fplayer [data-x="end"] button.primary');
      await page.waitForTimeout(1500);
      const r = (await forme(page)).seances.find((x) => x.type === 'renfo' && x.statut === 'fait');
      assert.ok(r && r.realise.items.length >= 2 && r.realise.items[0].reps.length >= 3, JSON.stringify(r?.realise));
    } },
    { name: 'saisie d\'une sortie par import GPX : distance, D+, FC, profil', fn: async ({ page }) => {
      await page.click('[data-act="forme-log"]');
      await page.setInputFiles('.sheet-wrap.open [data-x="file"]', { name: 'sortie.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx()) });
      await page.waitForFunction(() => /km/.test(document.querySelector('[data-x="fileinfo"]')?.textContent || ''));
      assert.equal(await page.$eval('.sheet-wrap.open [name="date"]', (e) => e.value), '2026-10-20');
      assert.equal(await page.$eval('.sheet-wrap.open [name="fc"]', (e) => e.value), '140');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForTimeout(1500);
      const s = (await forme(page)).seances.find((x) => x.date === '2026-10-20');
      assert.ok(s.distance_m > 6000 && s.distance_m < 7000, `${s.distance_m}`);
      assert.ok(s.dplus_m > 250 && s.dplus_m < 330, `${s.dplus_m}`);
      assert.ok(s.realise.profil.length > 10);
    } },
    { name: 'suivi : volume km/D+, charge, régularité, mensurations', fn: async ({ page }) => {
      await page.click('[data-act="forme-view"][data-v="suivi"]');
      await page.waitForSelector('.f-bars');
      await page.click('[data-act="forme-mens"]');
      await page.fill('.sheet-wrap.open [name="tour_taille_cm"]', '88.5');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForTimeout(900);
      assert.match(await page.$eval('.f-mens', (e) => e.textContent), /88,5 cm/);
      assert.ok(await page.$$eval('.f-cal-w i.fait', (l) => l.length) >= 2);
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'réglages : repères FC/VMA affichés en allure, budget désactivable, ambiance', fn: async ({ page }) => {
      await page.click('[data-act="forme-view"][data-v="reglages"]');
      await page.fill('[name="fc_repos"]', '50');
      await page.fill('[name="fc_max"]', '190');
      await page.fill('[name="vma_kmh"]', '15');
      await page.click('[name="modes"][value="allure"] + span');
      await page.click('[data-form="forme-reperes"] button.primary');
      await page.waitForTimeout(800);
      assert.match(await page.$eval('[data-form="forme-reperes"]', (e) => e.textContent), /Endurance 5:33–6:27 \/km/);
      await page.click('[name="ambiance"][value="lauze"] + span');
      await page.click('[data-form="forme-prefs"] [name="budget"]');
      await page.click('[data-form="forme-prefs"] button.primary');
      await page.waitForTimeout(800);
      assert.equal(await page.$eval('.forme', (e) => e.dataset.amb), 'lauze');
      const bonus = await page.evaluate(() => activeBonus(journalMember(), new Date()));
      assert.equal(bonus, 0, 'budget qui ne suit plus les séances');
    } },
    { name: 'hors ligne : séance saisie mise en file, puis envoyée au retour', fn: async ({ page, ctx }) => {
      await ctx.setOffline(true);
      await page.evaluate(() => { state.forme.view = 'semaine'; render(); });
      await page.evaluate(() => fLogSheet());
      await page.fill('.sheet-wrap.open [name="duree"]', '25');
      await page.selectOption('.sheet-wrap.open [name="sous"]', 'mobilite');
      await page.click('.sheet-wrap.open button.primary');
      await page.waitForTimeout(600);
      assert.ok(await page.evaluate(() => Queue.size()) >= 1);
      await ctx.setOffline(false);
      await page.waitForFunction(() => state.loaded && Queue.size() === 0, null, { timeout: 30000 });
      await page.waitForTimeout(800);
      assert.ok((await forme(page)).seances.some((s) => s.type === 'mobilite' && s.statut === 'fait'));
    } },
  ],
};
