// Revue sur iPhone (390 px) : segment actif toujours visible, champs en 16 px (pas d'agrandissement de Safari),
// cibles tactiles de 44 px, champ du scan lisible, couleurs des membres distinctes et choix de Forme lisibles
// dans les univers.
const assert = require('node:assert/strict');
const H = require('../helpers');

const univers = (page, id) => page.evaluate((u) => { if (u) document.documentElement.dataset.univers = u; else delete document.documentElement.dataset.univers; }, id);
// Contraste WCAG entre deux couleurs calculées « rgb(…) ».
const CONTRASTE = `(a, b) => {
  const l = (c) => { const v = c.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map((x) => Number(x) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const x = l(a), y = l(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}`;

module.exports = {
  name: 'Revue mobile : segments, champs, cibles tactiles, univers',
  async after({ page }) { await univers(page, null); await H.closeSheets(page); },
  tests: [
    { name: 'barre de segments : tient sur une ligne à 390 px, segment touché visible', fn: async ({ page }) => {
      await H.openTab(page, 'agenda');
      await page.click('.segbar [data-tab="photos"]');
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const bar = document.querySelector('.segbar'), b = bar.querySelector('[aria-pressed="true"]');
        const rb = b.getBoundingClientRect(), rr = bar.getBoundingClientRect();
        return { tab: b.dataset.tab, dedans: rb.left >= rr.left - 1 && rb.right <= rr.right + 1, deborde: bar.scrollWidth > bar.clientWidth, classes: bar.className, h: rb.height };
      });
      assert.equal(r.tab, 'photos');
      assert.ok(r.dedans, 'segment actif hors de la barre');
      assert.ok(!r.deborde, 'la barre ne doit plus défiler');
      assert.ok(r.h >= 44, `hauteur des segments : ${r.h}`);
      // Retour dans l'onglet Famille : le dernier écran rouvert est montré dans la barre.
      await H.openTab(page, 'accueil');
      await page.click('.tabbar [data-tab="famille"]');
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => { const bar = document.querySelector('.segbar'); const rb = bar.querySelector('[aria-pressed="true"]').getBoundingClientRect(); const rr = bar.getBoundingClientRect(); return rb.left >= rr.left - 1 && rb.right <= rr.right + 1; }));
      assert.ok(await H.noHorizontalScroll(page));
    } },
    { name: 'champs et menus en 16 px au moins (Safari n\'agrandit pas la page)', fn: async ({ page }) => {
      await H.openTab(page, 'agenda');
      await page.evaluate(() => ACTIONS['agenda-nouveau']());
      await page.waitForSelector('.sheet-wrap.open [name="intervalle"]', { state: 'attached' });
      const tailles = await page.evaluate(() => {
        const f = document.querySelector('.sheet-wrap.open form');
        // Même structure que Plus › Notifications (menus du silence, du briefing…).
        const ex = document.createElement('div'); ex.className = 'notif-extra'; ex.innerHTML = '<select class="input"><option>22 h</option></select>'; f.append(ex);
        return [...f.querySelectorAll('input:not([type=checkbox]), select, textarea')].map((e) => [e.name || e.className, parseFloat(getComputedStyle(e).fontSize)]);
      });
      const petits = tailles.filter(([, t]) => t < 16);
      assert.deepEqual(petits, []);
      assert.ok(tailles.some(([n]) => n === 'intervalle'));
      await H.closeSheets(page);
    } },
    { name: 'agenda : en-têtes de jour et pastilles de couleur assez grands pour le doigt', fn: async ({ page }) => {
      await H.openTab(page, 'agenda');
      await page.evaluate(() => { store.set('agenda:vue', 'semaine'); switchTab('agenda'); });
      await page.waitForTimeout(300);
      const titres = await page.$$eval('.agenda-jour-titre', (l) => l.map((b) => b.getBoundingClientRect().height));
      if (titres.length) assert.ok(Math.min(...titres) >= 44, `en-tête de jour : ${Math.min(...titres)} px`);
      await page.evaluate(() => ACTIONS['agenda-reglages']());
      await page.waitForTimeout(300);
      const nuances = await page.$$eval('.sheet-wrap.open .agenda-nuance', (l) => l.map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
      if (nuances.length) assert.ok(Math.min(...nuances) >= 40, `pastilles : ${Math.min(...nuances)} px`);
      assert.ok(await H.noHorizontalScroll(page));
      await H.closeSheets(page);
    } },
    { name: 'Scan : le code saisi à la main se lit dans chaque univers', fn: async ({ page }) => {
      await H.openTab(page, 'scan');
      for (const u of ['carnet', 'washi', 'herbier', 'cocon', 'kermesse']) {
        await univers(page, u);
        const r = await page.evaluate((c) => {
          const e = document.querySelector('.manual .input');
          const s = getComputedStyle(e);
          return eval(c)(s.color, s.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : s.backgroundColor);
        }, CONTRASTE);
        assert.ok(r >= 4.5, `${u} : contraste ${r.toFixed(2)}`);
      }
      await univers(page, null);
    } },
    { name: 'univers : six couleurs de membres distinctes ; choix cochés de Forme lisibles', fn: async ({ page }) => {
      for (const u of ['carnet', 'washi', 'herbier', 'cocon', 'kermesse']) {
        await univers(page, u);
        const r = await page.evaluate((c) => {
          const box = document.createElement('div');
          box.innerHTML = [1, 2, 3, 4, 5, 6].map((i) => `<i style="background:var(--m${i}, red)"></i>`).join('')
            + '<div class="forme"><label class="f-chip"><input type="checkbox" checked><span>Reprise</span></label></div>';
          document.body.append(box);
          const couleurs = [...box.querySelectorAll('i')].map((i) => getComputedStyle(i).backgroundColor);
          const span = box.querySelector('.f-chip span');
          const s = getComputedStyle(span);
          const contraste = eval(c)(s.color, s.backgroundColor);
          box.remove();
          return { couleurs, contraste };
        }, CONTRASTE);
        assert.equal(new Set(r.couleurs).size, 6, `${u} : ${r.couleurs.join(' ')}`);
        assert.ok(!r.couleurs.includes('rgb(255, 0, 0)'), `${u} : jeton --m manquant`);
        assert.ok(r.contraste >= 4.5, `${u} : pastille Forme cochée à ${r.contraste.toFixed(2)}`);
      }
      await univers(page, null);
    } },
  ],
};
