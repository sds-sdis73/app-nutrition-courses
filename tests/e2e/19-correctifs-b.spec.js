const assert = require('node:assert/strict');
const H = require('../helpers');

const today = (page) => page.evaluate(() => state.journal.filter((j) => j.date === isoDate(new Date()) && j.member_id === journalMember().id));

module.exports = {
  name: 'Corriger, ajout rapide, comme hier, texte libre, poids, widget',
  tests: [
    { name: '« Comme hier » reprend le goûter de la veille', fn: async ({ page }) => {
      await page.evaluate(async () => {
        const m = journalMember();
        const { error } = await db.from('journal').insert({ ...own(), date: isoDate(addDays(new Date(), -1)), member_id: m.id, slot: 'gouter', label: 'Compote de la veille', source: 'ciqual', ref: '1', grams: 250, n: { kcal: 120, prot: 4, gluc: 15, suc: 3, lip: 4, ags: 1, fib: 3, sel: 1 } });
        if (error) throw error;
        await Data.loadWeek(); render();
      });
      await page.waitForSelector('.tl-item.repas [data-act="journal-like-yesterday"][data-slot="gouter"]');
      await page.click('.tl-item.repas [data-act="journal-like-yesterday"][data-slot="gouter"]');
      await page.waitForTimeout(1500);
      assert.ok((await today(page)).some((x) => x.label === 'Compote de la veille' && x.slot === 'gouter'));
      assert.equal(await page.$('.tl-item.repas [data-act="journal-like-yesterday"][data-slot="gouter"]'), null, 'bouton masqué une fois le repas noté');
    } },
    { name: 'texte libre : « 2 œufs, une tartine beurrée, un café et un verre d\'eau » → liste à vérifier, puis tout ajouter', fn: async ({ page }) => {
      await page.evaluate(() => journalAdd('petit-dejeuner'));
      await page.fill('[data-form="nlp"] [name="txt"]', '2 œufs, une tartine beurrée, un café et un verre d\'eau');
      await page.click('[data-form="nlp"] button.primary');
      await page.waitForSelector('.nlp-review');
      assert.equal(await page.$$eval('.nlp-line', (l) => l.length), 5);
      // On corrige la quantité d'œufs avant d'ajouter.
      await page.fill('[data-g="0"]', '120');
      await page.dispatchEvent('[data-g="0"]', 'change');
      await page.click('[data-nlp-add]');
      await page.waitForTimeout(2500);
      const j = (await today(page)).filter((x) => x.slot === 'petit-dejeuner');
      assert.equal(j.length, 4);
      assert.equal(j.find((x) => /Oeuf/.test(x.label)).grams, 120);
      assert.equal(await page.evaluate(() => waterTotal(journalMember(), new Date())), 200, 'le verre d\'eau est dans l\'hydratation');
      assert.match(await page.$eval('.timeline', (e) => e.innerText), /Oeuf dur · 120 g/);
    } },
    { name: 'corriger une entrée sans l\'effacer : quantité et repas', fn: async ({ page }) => {
      const before = (await today(page)).find((x) => /Pain blanc/.test(x.label));
      await page.click(`[data-act="journal-edit"][data-id="${before.id}"]`);
      await page.waitForSelector('form[data-form="jedit"]');
      await page.fill('form[data-form="jedit"] [name="qty"]', '80');
      await page.selectOption('form[data-form="jedit"] [name="slot"]', 'gouter');
      await page.click('form[data-form="jedit"] button.primary');
      await page.waitForTimeout(1500);
      const after = (await today(page)).find((x) => x.id === before.id);
      assert.equal(after.grams, 80);
      assert.equal(after.slot, 'gouter');
      assert.equal(Math.round(after.n.kcal), Math.round(before.n.kcal * 2));
    } },
    { name: 'juste les calories : 350 kcal « Sandwich du boulanger »', fn: async ({ page }) => {
      await page.evaluate(() => journalAdd('midi'));
      await page.click('.quickkcal summary');
      await page.fill('[data-form="quick-kcal"] [name="kcal"]', '350');
      await page.fill('[data-form="quick-kcal"] [name="label"]', 'Sandwich du boulanger');
      await page.click('[data-form="quick-kcal"] button');
      await page.waitForTimeout(1500);
      const q = (await today(page)).find((x) => x.label === 'Sandwich du boulanger');
      assert.ok(q && q.n.kcal === 350 && q.slot === 'midi');
      // Une entrée « calories seules » se corrige aussi.
      await page.click(`[data-act="journal-edit"][data-id="${q.id}"]`);
      await page.fill('form[data-form="jedit"] [name="kcal"]', '420');
      await page.click('form[data-form="jedit"] button.primary');
      await page.waitForTimeout(1200);
      assert.equal((await today(page)).find((x) => x.id === q.id).n.kcal, 420);
    } },
    { name: 'poids : carte et pesée si la table existe, sinon fonction masquée sans erreur', fn: async ({ page }) => {
      await H.openTab(page, 'suivi');
      const ok = await page.evaluate(() => state.peseesOk);
      if (!ok) {
        assert.equal(await page.$('.weight'), null);
        await page.evaluate(() => peseeSheet());
        assert.match(await H.toastText(page), /pas encore activé/);
        return;
      }
      await page.waitForSelector('.weight [data-act="pesee"]');
      await page.click('.weight [data-act="pesee"]');
      await page.fill('form[data-form="pesee"] [name="kg"]', '79.4');
      await page.click('form[data-form="pesee"] button.primary');
      await page.waitForTimeout(1500);
      assert.match(await page.$eval('.weight', (e) => e.textContent), /79,4 kg/);
      assert.equal(await page.evaluate(() => Number(journalMember().poids_kg)), 79.4, 'le poids du membre suit la dernière pesée');
      await page.evaluate(async () => { for (const p of state.pesees) await Data.deletePesee(p.id); await Data.saveMember({ ...journalMember(), poids_kg: 80 }); render(); });
    } },
    { name: 'adresse ?action=eau : +250 ml à l\'ouverture (bouton du widget)', fn: async ({ page, env }) => {
      const before = await page.evaluate(() => waterTotal(journalMember(), new Date()));
      await page.goto(`${env.BASE_URL}?action=eau`, { waitUntil: 'networkidle' });
      await H.waitLoaded(page);
      await page.waitForTimeout(2000);
      assert.equal(await page.evaluate(() => waterTotal(journalMember(), new Date())), before + 250);
      assert.doesNotMatch(page.url(), /action=/, 'paramètre retiré de l\'adresse');
      await H.closeSheets(page);
    } },
    { name: 'Paramètres › Widget iPhone : guide et copie du script', fn: async ({ page }) => {
      await page.evaluate(() => { window.__copied = ''; navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
      await page.evaluate(() => widgetSheet());
      await page.waitForSelector('.sheet-wrap.open .steps');
      assert.match(await page.$eval('.sheet-wrap.open', (e) => e.textContent), /Scriptable/);
      await page.click('.sheet-wrap.open [data-x="copy"]');
      await page.waitForTimeout(800);
      assert.match(await page.evaluate(() => window.__copied), /Miam & moi — widget/);
      await H.closeSheets(page);
    } },
  ],
};
