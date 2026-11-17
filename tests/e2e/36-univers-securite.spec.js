// Univers graphiques, verrouillage Face ID (clé d'accès simulée) avec code de secours, partage du sport
// « tout ou rien » et sauvegarde complète du foyer.
// Tables simulées (faux PostgREST) : compte_preferences tant que la migration 2026-11-16_univers-securite.sql
// n'est pas appliquée, et toujours les tables Forme (séances d'un autre membre du foyer, sans toucher aux vraies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers');
const { installPgMock, realTableExists } = require('./pg-mock');
const { TABLES: FORME_TABLES } = require('./forme-mock');

let mock = null;
let prefsReelles = false;
let ids = {};
const CLES_LOCALES = ['univers', 'securite:appareil', 'securite:echecs', 'securite:cache-le', '__bio_reponse'];
const prefs = (page) => (prefsReelles
  ? page.evaluate(async () => (await db.from('compte_preferences').select('*').eq('user_id', me())).data?.[0] || null)
  : Promise.resolve(mock.compte_preferences.find((r) => r.user_id === ids.moi) || null));
const verrou = (page) => page.$('.us-verrou');
const taper = async (page, code) => { for (const c of code) await page.click(`.us-verrou [data-us="chiffre"][data-c="${c}"]`); await page.waitForTimeout(400); };
const recharger = async (page) => { await page.reload({ waitUntil: 'networkidle' }); await H.waitLoaded(page); await page.waitForTimeout(800); };
const visibilite = (page, etat) => page.evaluate((v) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}, etat);
const avancer = async (page, ms) => { const t = await page.evaluate(() => Date.now()); await page.clock.setFixedTime(new Date(t + ms)); };
const semaine = (page) => page.evaluate(async () => (await Agenda.elements(isoToDate('2026-10-19'), isoToDate('2026-10-25'))).filter((e) => e.source === 'univers-securite').map((e) => e.id));

module.exports = {
  name: 'Univers, sécurité, partage du sport, sauvegarde',
  async before({ page }) {
    // Clé d'accès simulée (WebAuthn) : navigateur de test sans Face ID ; la réponse se règle par localStorage.
    await page.addInitScript(() => {
      window.__bio = { cree: 0, demandes: 0, options: null };
      const rawId = new Uint8Array([7, 1, 2, 3, 4, 5, 6, 8]).buffer;
      if (!window.PublicKeyCredential) window.PublicKeyCredential = function PublicKeyCredential() {};
      Object.defineProperty(window.PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable', { configurable: true, value: async () => true });
      navigator.credentials.create = async (o) => { window.__bio.cree++; window.__bio.options = JSON.parse(JSON.stringify({ sel: o.publicKey.authenticatorSelection })); return { rawId, type: 'public-key' }; };
      navigator.credentials.get = async (o) => {
        window.__bio.demandes++;
        if ((localStorage.getItem('__bio_reponse') || 'ok') !== 'ok' || o.publicKey.userVerification !== 'required') throw new DOMException('refusé', 'NotAllowedError');
        const a = new Uint8Array(37); a[32] = 0x05;
        return { rawId, type: 'public-key', response: { authenticatorData: a.buffer } };
      };
    });
    await page.evaluate((cles) => { for (const k of cles) localStorage.removeItem(k); for (const k of Object.keys(localStorage)) if (/^prefs-compte:|^sauvegarde:/.test(k)) localStorage.removeItem(k); }, CLES_LOCALES);
    prefsReelles = await realTableExists(page, 'compte_preferences');
    ids = await page.evaluate(async () => {
      if (!state.compte.member_id) { const m = state.members[0]; await db.from('foyer_comptes').update({ member_id: m.id }).eq('user_id', me()); state.compte.member_id = m.id; }
      return { moi: me(), foyer: foyer(), membre: state.compte.member_id, autre: state.members.find((m) => m.id !== state.compte.member_id)?.id || null, autreNom: state.members.find((m) => m.id !== state.compte.member_id)?.nom || null };
    });
    const autre = ids.autre || 'membre-fictif';
    mock = await installPgMock(page, {
      tables: [...FORME_TABLES, ...(prefsReelles ? [] : ['compte_preferences'])],
      keys: { forme_profil: ['member_id'], compte_preferences: ['user_id'] },
      seed: {
        forme_profil: [{ member_id: ids.membre, foyer_id: ids.foyer, user_id: ids.moi, niveau: 'regulier', objectif_forme: 'forme', terrain: 'montagne', questionnaire_fait_le: '2026-10-01', depart: {}, genes: {}, modes_intensite: ['rpe'], regle_budget: { perte: 0.5, maintien: 1, prise: 1 }, prefs: {} }],
        forme_seances: [
          { id: 'seance-moi', foyer_id: ids.foyer, user_id: ids.moi, member_id: ids.membre, date: '2026-10-22', heure: '18:30', type: 'course', statut: 'prevu', prevu: { sous: 'ef' }, duree_min: 45 },
          { id: 'seance-autre', foyer_id: ids.foyer, user_id: 'compte-autre', member_id: autre, date: '2026-10-23', heure: '07:00', type: 'renfo', statut: 'fait', prevu: { titre: 'Renfo coureur' }, duree_min: 30 },
        ],
      },
    });
    if (prefsReelles) await page.evaluate(async () => { await db.from('compte_preferences').delete().eq('user_id', me()); });
    await page.evaluate(async () => { localStorage.removeItem('queue'); await Forme.load(true); await Modules.charger(true, { horsLigne: false }); });
    console.log(`    (préférences ${prefsReelles ? 'réelles' : 'simulées : migration pas encore appliquée'})`);
  },
  async after({ page }) {
    await page.evaluate((cles) => { for (const k of cles) localStorage.removeItem(k); delete document.documentElement.dataset.univers; }, CLES_LOCALES).catch(() => {});
    if (prefsReelles) await page.evaluate(async () => { await db.from('compte_preferences').delete().eq('user_id', me()); }).catch(() => {});
  },
  tests: [
    { name: 'Plus › Univers : 6 vignettes, choix appliqué à toute l\'appli et enregistré pour le compte', fn: async ({ page }) => {
      await H.openTab(page, 'plus');
      assert.match(await page.$eval('.plus-ligne[data-id="univers"]', (b) => b.textContent), /Couleurs, polices et motifs/);
      await page.click('.plus-ligne[data-id="univers"]');
      await page.waitForSelector('.us-grille');
      assert.deepEqual(await page.$$eval('.us-apercu', (l) => l.map((b) => b.dataset.id)), ['classique', 'carnet', 'washi', 'herbier', 'cocon', 'kermesse']);
      assert.equal(await page.$eval('.us-apercu[aria-pressed="true"]', (b) => b.dataset.id), 'classique');
      // Chaque vignette montre déjà son univers (ses propres jetons).
      const fonds = await page.$$eval('.us-apercu', (l) => l.map((b) => getComputedStyle(b).backgroundColor));
      assert.equal(new Set(fonds).size, 6, fonds.join(' | '));
      await page.click('.us-apercu[data-id="herbier"]');
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.univers), 'herbier');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(233, 238, 223)');
      assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /Karla/);
      assert.ok(await page.$('link#us-polices-herbier'), 'polices de l\'univers chargées');
      assert.match(await H.toastText(page), /Univers « Herbier » choisi/);
      assert.equal((await prefs(page))?.univers, 'herbier');
      assert.match(await page.$eval('.us-detail', (e) => e.textContent), /Fraunces et Karla/);
      // Le module Forme suit l'univers.
      await H.openTab(page, 'forme');
      await page.waitForSelector('.forme .f-hero');
      assert.equal(await page.$eval('.forme', (e) => getComputedStyle(e).getPropertyValue('--f-accent').trim()), '#2F5D3A');
    } },
    { name: 'kermesse : en-tête opaque (confettis jamais derrière les titres), aucun débordement à 360 px', fn: async ({ page }) => {
      await H.openTab(page, 'univers');
      await page.click('.us-apercu[data-id="kermesse"]');
      await page.waitForTimeout(500);
      const entete = await page.$eval('.topbar', (e) => ({ fond: getComputedStyle(e).backgroundColor, motif: getComputedStyle(e).backgroundImage }));
      assert.deepEqual(entete, { fond: 'rgb(255, 230, 238)', motif: 'none' });
      assert.match(await page.evaluate(() => getComputedStyle(document.body).backgroundImage), /svg/);
      await page.setViewportSize({ width: 360, height: 740 });
      for (const ecran of ['univers', 'aujourdhui', 'planning', 'courses', 'forme', 'plus', 'securite', 'sauvegarde']) {
        await H.openTab(page, ecran);
        assert.ok(await H.noHorizontalScroll(page), `débordement horizontal : ${ecran}`);
      }
      await page.setViewportSize({ width: 390, height: 664 });
      // Captures de contrôle (tests/.out) : Accueil et Plus › Univers dans chaque univers.
      for (const id of ['carnet', 'washi', 'herbier', 'cocon', 'kermesse']) {
        await page.evaluate((u) => { document.documentElement.dataset.univers = u; }, id);
        for (const ecran of ['aujourdhui', 'univers', 'forme']) {
          await H.openTab(page, ecran);
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(__dirname, '..', '.out', `univers-${id}-${ecran}.png`) });
        }
      }
      await page.evaluate(() => { document.documentElement.dataset.univers = 'kermesse'; });
    } },
    { name: 'univers retrouvé dès le lancement, avant la connexion ; retour au Classique', fn: async ({ page }) => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.univers), 'kermesse');
      await H.waitLoaded(page);
      await page.waitForTimeout(600);
      await H.openTab(page, 'univers');
      await page.click('.us-apercu[data-id="classique"]');
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.univers ?? null), null);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 243, 209)');
      assert.equal((await prefs(page))?.univers, 'classique');
    } },
    { name: 'Sécurité : activation avec Face ID et un code de secours refusé puis accepté', fn: async ({ page }) => {
      await recharger(page);
      await H.openTab(page, 'securite');
      await page.waitForSelector('[data-act="securite-activer"]');
      assert.match(await page.$eval('#main', (e) => e.textContent), /Verrouillage désactivé/);
      await page.click('[data-act="securite-activer"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="securite-activer"]');
      assert.match(await page.$eval('.sheet-wrap.open [data-x="ok"]', (b) => b.textContent), /Continuer avec Face ID/);
      await page.fill('.sheet-wrap.open [name="c1"]', '1234');
      await page.fill('.sheet-wrap.open [name="c2"]', '1234');
      await page.click('.sheet-wrap.open [data-x="ok"]');
      await page.waitForTimeout(300);
      assert.match(await page.$eval('.sheet-wrap.open [data-msg]', (e) => e.textContent), /suite de chiffres/);
      await page.fill('.sheet-wrap.open [name="c1"]', '4826');
      await page.fill('.sheet-wrap.open [name="c2"]', '4862');
      await page.click('.sheet-wrap.open [data-x="ok"]');
      await page.waitForTimeout(300);
      assert.match(await page.$eval('.sheet-wrap.open [data-msg]', (e) => e.textContent), /pas identiques/);
      await page.fill('.sheet-wrap.open [name="c2"]', '4826');
      await page.click('.sheet-wrap.open [data-x="ok"]');
      await page.waitForSelector('.us-etat >> text=Verrouillage activé');
      assert.match(await H.toastText(page), /Verrouillage activé avec Face ID/);
      const r = await page.evaluate(() => ({ cfg: JSON.parse(localStorage.getItem('securite:appareil')), bio: window.__bio }));
      assert.equal(r.bio.cree, 1);
      assert.deepEqual(r.bio.options.sel, { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' });
      assert.equal(r.cfg.bio, true);
      assert.equal(r.cfg.code.len, 4);
      assert.match(r.cfg.code.hash, /^[0-9a-f]{64}$/);
      assert.ok(!JSON.stringify(r.cfg).includes('4826'), 'le code n\'est jamais stocké en clair');
    } },
    { name: 'écran verrouillé : mauvais code, bon code, puis Face ID', fn: async ({ page }) => {
      await page.click('[data-act="securite-verrouiller"]');
      await page.waitForSelector('.us-verrou');
      assert.equal(await page.$eval('#main', (e) => e.inert), true, 'le reste de la page est inerte');
      await taper(page, '1111');
      assert.match(await page.$eval('.us-verrou [data-msg]', (e) => e.textContent), /Code incorrect/);
      assert.ok(await verrou(page));
      await taper(page, '4826');
      assert.equal(await verrou(page), null, 'déverrouillé par le code');
      assert.equal(await page.$eval('#main', (e) => e.inert), false);
      await page.click('[data-act="securite-verrouiller"]');
      await page.waitForSelector('.us-verrou [data-us="bio"]');
      await page.click('.us-verrou [data-us="bio"]');
      await page.waitForTimeout(400);
      assert.equal(await verrou(page), null, 'déverrouillé par Face ID');
      assert.ok(await page.evaluate(() => window.__bio.demandes) >= 1);
    } },
    { name: 'retour après 5 min en arrière-plan : verrouillé ; après 2 min : non ; au lancement : verrouillé', fn: async ({ page }) => {
      await page.evaluate(() => localStorage.setItem('__bio_reponse', 'refus'));
      await visibilite(page, 'hidden');
      await avancer(page, 2 * 60000);
      await visibilite(page, 'visible');
      await page.waitForTimeout(400);
      assert.equal(await verrou(page), null, 'pas de verrou après 2 minutes');
      await visibilite(page, 'hidden');
      await avancer(page, 6 * 60000);
      await visibilite(page, 'visible');
      await page.waitForSelector('.us-verrou');
      await page.waitForTimeout(500);
      assert.ok(await verrou(page), 'Face ID refusé : le verrou reste');
      await taper(page, '4826');
      assert.equal(await verrou(page), null);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.us-verrou');
      await H.waitLoaded(page);
      await page.waitForTimeout(800);
      assert.ok(await verrou(page), 'toujours verrouillé une fois les données chargées');
      await taper(page, '4826');
      assert.equal(await verrou(page), null);
    } },
    { name: 'trop d\'essais : pause de 30 s, puis déverrouillage ; désactivation avec le code actuel', fn: async ({ page }) => {
      await H.openTab(page, 'securite');
      await page.click('[data-act="securite-verrouiller"]');
      await page.waitForSelector('.us-verrou');
      for (let i = 0; i < 5; i++) await taper(page, '9999');
      assert.match(await page.$eval('.us-verrou [data-msg]', (e) => e.textContent), /Patiente 30 s/);
      await taper(page, '4826');
      assert.match(await page.$eval('.us-verrou [data-msg]', (e) => e.textContent), /Trop d'essais/);
      assert.ok(await verrou(page));
      await avancer(page, 31000);
      await taper(page, '4826');
      assert.equal(await verrou(page), null);
      await page.click('[data-act="securite-desactiver"]');
      await page.waitForSelector('.sheet-wrap.open [data-form="securite-desactiver"]');
      await page.fill('.sheet-wrap.open [name="actuel"]', '0000');
      await page.click('.sheet-wrap.open [data-x="ok"]');
      await page.waitForTimeout(300);
      assert.match(await page.$eval('.sheet-wrap.open [data-msg]', (e) => e.textContent), /Code actuel incorrect/);
      await page.fill('.sheet-wrap.open [name="actuel"]', '4826');
      await page.click('.sheet-wrap.open [data-x="ok"]');
      await page.waitForTimeout(500);
      assert.match(await H.toastText(page), /Verrouillage désactivé/);
      assert.equal(await page.evaluate(() => localStorage.getItem('securite:appareil')), 'null');
      await recharger(page);
      assert.equal(await verrou(page), null, 'plus de verrou au lancement');
    } },
    { name: 'partage du sport « tout ou rien » : réglage dans Forme, séances dans l\'agenda familial', fn: async ({ page }) => {
      assert.deepEqual(await semaine(page), ['seance:seance-autre'], 'avant : seulement la séance partagée par l\'autre membre');
      await H.openTab(page, 'forme');
      await page.click('[data-act="forme-view"][data-v="reglages"]');
      await page.waitForSelector('[data-partage-carte]');
      const carte = await page.$eval('[data-partage-carte]', (e) => e.textContent);
      assert.match(carte, /Tout ou rien/);
      assert.match(carte, /mensurations restent privées/);
      if (ids.autreNom) assert.match(carte, new RegExp(`Partagent leur sport avec toi : ${ids.autreNom}`));
      await page.check('[data-partage-sport]');
      await page.waitForSelector('.sheet-wrap.open [data-x="yes"]');
      await page.click('.sheet-wrap.open [data-x="yes"]');
      await page.waitForTimeout(800);
      assert.match(await H.toastText(page), /partagé avec la famille/);
      assert.equal((await prefs(page))?.partage_sport, true);
      assert.deepEqual(await semaine(page), ['seance:seance-moi', 'seance:seance-autre']);
      const e = await page.evaluate(async () => (await Agenda.elements(isoToDate('2026-10-22'), isoToDate('2026-10-22'))).find((x) => x.id === 'seance:seance-moi'));
      assert.equal(e.titre, 'Footing en endurance');
      assert.equal(e.heureFin, '19:15');
      // Fiche d'une séance partagée : lecture seule.
      await H.openTab(page, 'univers-securite');
      await page.click('[data-act="partage-sport-voir"][data-id="seance-autre"]');
      await page.waitForSelector('.sheet-wrap.open .us-seance');
      assert.match(await page.$eval('.sheet-wrap.open .us-seance', (x) => x.textContent), /lecture seule/);
      await H.closeSheets(page);
      // Retour en arrière : plus rien de partagé, sans confirmation.
      await H.openTab(page, 'forme');
      await page.click('[data-act="forme-view"][data-v="reglages"]');
      await page.waitForSelector('[data-partage-sport]');
      await page.uncheck('[data-partage-sport]');
      await page.waitForTimeout(800);
      assert.equal((await prefs(page))?.partage_sport, false);
      assert.deepEqual(await semaine(page), ['seance:seance-autre']);
    } },
    { name: 'Plus › Sauvegarde : fichier JSON de tout le foyer, rappel mensuel sur l\'Accueil', fn: async ({ page }) => {
      const rappel = () => page.evaluate(async () => (await Accueil.elements({ date: new Date() })).some((e) => e.module === 'sauvegarde'));
      assert.equal(await rappel(), true, 'jamais sauvegardé : rappel affiché');
      await H.openTab(page, 'sauvegarde');
      assert.match(await page.$eval('[data-sauvegarde-quand]', (e) => e.textContent), /Aucune sauvegarde/);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-act="sauvegarde-exporter"]')]);
      assert.equal(dl.suggestedFilename(), 'tribu-sauvegarde-2026-10-21.json');
      const d = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      assert.equal(d.format, 'tribu-et-toutous/sauvegarde');
      for (const t of ['foyer_membres', 'recettes', 'planning_repas', 'journal', 'forme_seances', 'activites']) assert.ok(Array.isArray(d.tables[t]), `table ${t}`);
      for (const t of ['mc_secrets', 'push_abonnements']) assert.ok(!(t in d.tables), `${t} jamais exportée`);
      assert.ok(d.tables.foyer_membres.length >= 1);
      assert.deepEqual(d.tables.forme_seances.map((s) => s.id), ['seance-moi'], 'seulement le sport du compte qui exporte');
      assert.ok(Array.isArray(d.recipes) && d.recipes.length === d.tables.recettes.length, 'importable par « Importer »');
      await page.waitForTimeout(600);
      assert.match(await H.toastText(page), /Sauvegarde téléchargée/);
      assert.ok((await prefs(page))?.sauvegarde_le, 'date de la sauvegarde enregistrée');
      assert.match(await page.$eval('[data-sauvegarde-quand]', (e) => e.textContent), /Dernière sauvegarde le 21 octobre 2026/);
      assert.equal(await rappel(), false, 'rappel retiré pour le mois');
      assert.ok(await page.$('[data-import-data]'), 'import toujours possible');
    } },
  ],
};
