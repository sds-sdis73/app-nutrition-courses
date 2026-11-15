// ---------------------------------------------------------------------------
// Rendu et navigation
// ---------------------------------------------------------------------------
// state.tab est l'écran affiché (identifiant de module : 'planning', 'agenda'…) ; son onglet vient du registre.
function render() {
  const main = $('#main');
  let m = Modules.get(state.tab);
  if (!m || !m.rendu || !Modules.visible(m)) { state.tab = 'aujourdhui'; m = Modules.get('aujourdhui'); }
  $('#title').textContent = Modules.titre(m);
  Nav.marquer(m.onglet);
  if (m.onglet !== 'plus') store.set(`vue:${m.onglet}`, m.id);
  Pet.queue.length && setTimeout(() => Pet.flush(), 0);
  let vue;
  try { vue = m.rendu(); } catch (e) { console.error(`écran ${m.id}`, e); vue = `<div class="empty"><p>Cet écran n'a pas pu s'afficher.</p></div>`; }
  main.innerHTML = (state.offline ? `<div class="offline-banner">${ICON.info} Hors ligne : données du dernier chargement${Queue.size() ? ` · ${Queue.size()} saisie(s) en attente` : ''}</div>` : '') + Nav.segments(m) + vue;
}
// Ouvre un écran ou un onglet (dans ce cas, son dernier écran affiché).
function switchTab(tab) {
  state.tab = Nav.resoudre(tab);
  state.moving = null;
  store.set('tab', state.tab);
  render();
  window.scrollTo({ top: 0 });
}

const ACTIONS = {
  tab: (b) => { while (sheets.length) closeSheet(); if (Nav.resoudre(b.dataset.tab) === 'aujourdhui') { state.tab = 'aujourdhui'; state.moving = null; store.set('tab', 'aujourdhui'); goToDay(new Date()).then(() => window.scrollTo({ top: 0 })); } else switchTab(b.dataset.tab); },
  'plus-ouvrir': (b) => { const m = Modules.get(b.dataset.id); if (!m) return; if (m.ouvrir) m.ouvrir(); else switchTab(m.id); },
  'ajout-rapide': () => { while (sheets.length) closeSheet(); AjoutRapide.ouvrir(); },
  rappels: () => openRappels(),
  'export-data': () => exportData(),
  suggest: () => suggestSheet(),
  'push-test': async () => { try { const r = await Foyer.invoke('send-reminders', { test: true }); toast(r.sent ? 'Notification de test envoyée' : 'Aucun appareil abonné'); } catch (e) { toast(e.message); } },
  'close-sheet': () => closeSheet(),
  settings: () => openSettings(),
  scan: () => Scanner.open((code) => showProduct(code)),
  'open-product': (b) => showProduct(b.dataset.ean, { record: false }),
  'open-alt': (b) => showProduct(b.dataset.ean, { record: false, compareTo: compareBase }),
  'retry-product': (b) => { closeSheet(); showProduct(b.dataset.ean); },
  'scan-filter': (b) => { state.scanFilter = b.dataset.v; render(); },
  'clear-scans': async () => { if (await confirmSheet('Effacer tout l\'historique des scans ?', 'Effacer')) { try { await Data.clearScans(); render(); } catch (e) { fail(e); } } },
  'new-recipe': () => openEditor(null),
  'import-url': () => importFromUrl(),
  seed: () => seedRecipes(),
  'recipe-chip': (b) => { state.recipeChip = b.dataset.v; render(); },
  'open-recipe': (b) => openRecipe(b.dataset.id),
  'recipe-menu': (b) => recipeMenu(b.dataset.id),
  'cook-mode': (b) => cookMode(b.dataset.id),
  'toggle-fav': async (b) => {
    const r = recipeById(b.dataset.id);
    if (!r) return;
    try {
      await Data.saveRecipe({ ...r, favorite: !r.favorite });
      b.classList.toggle('fav', !r.favorite);
      b.innerHTML = !r.favorite ? ICON.heartFill : ICON.heart;
      render();
      closeSheet();
      openRecipe(r.id);
    } catch (e) { fail(e); }
  },
  week: async (b) => {
    state.week = addDays(state.week, 7 * Number(b.dataset.d));
    state.day = addDays(state.day, 7 * Number(b.dataset.d));
    state.moving = null;
    try { await Data.loadWeek(); } catch (e) { if (isNetworkError(e)) { state.offline = true; Offline.restoreWeek(); } else fail(e); }
    render();
  },
  'week-menu': () => weekMenu(),
  foyer: () => openFoyer(),
  'suivi-member': (b) => { state.suiviMember = b.dataset.v; store.set('suiviMember', b.dataset.v); render(); },
  'suivi-view': (b) => { state.suiviView = b.dataset.v; render(); },
  'suivi-day': (b) => goToDay(b.dataset.d === '0' ? new Date() : addDays(state.day, Number(b.dataset.d))),
  'suivi-open-day': (b) => { state.suiviView = 'jour'; goToDay(addDays(state.week, Number(b.dataset.i))); },
  'journal-add': (b) => journalAdd(b.dataset.slot),
  'journal-copy': () => copyYesterday(),
  'activite-add': (b) => activiteSheet(null, b.dataset.heure ? { heure: b.dataset.heure } : null),
  'activite-done': async (b) => { try { await Data.updateActivite(b.dataset.id, { statut: 'fait' }); toast('Bravo, activité faite !'); render(); } catch (e) { fail(e); } },
  'eau-sheet': () => eauSheet(),
  'eau-add': (b) => addWater(Number(b.dataset.ml)),
  adopt: () => adoptSheet(journalMember()),
  boutique: () => boutiqueSheet(journalMember(), 'accessoires'),
  nourrir: () => boutiqueSheet(journalMember(), 'friandises'),
  pet: () => Pet.pet(),
  compagnon: () => compagnonSettings(),
  famille: (b) => { state.suiviMember = b.dataset.m; store.set('suiviMember', b.dataset.m); render(); },
  'activite-del': async (b) => { try { await Data.deleteActivite(b.dataset.id); render(); } catch (e) { fail(e); } },
  'journal-habits': (b) => addHabits(b.dataset.slot),
  'cq-retry': () => { CQ.failed = false; render(); CQ.load().then(() => render()).catch(() => render()); },
  'journal-edit': (b) => journalEdit(b.dataset.id),
  'journal-like-yesterday': (b) => likeYesterday(b.dataset.slot),
  'pesee': () => peseeSheet(),
  'weight-apply': async (b) => { const m = memberById(b.dataset.m); if (!m) return; try { await Data.saveMember({ ...m, kcal_perso: Number(b.dataset.kcal) }); toast(`Objectif ajusté : ${b.dataset.kcal} kcal/jour`); render(); } catch (e) { fail(e); } },
  'weight-later': (b) => { store.set(`weightLater:${b.dataset.m}`, isoDate(new Date())); render(); },
  'widget-help': () => widgetSheet(),
  'mc-sheet': () => mcSheet(),
  'journal-del': async (b) => { try { await Data.deleteJournal(b.dataset.id); render(); } catch (e) { fail(e); } },
  'have-item': async (b) => {
    try { await Data.addPlacard({ name: b.dataset.n, ing_key: b.dataset.k, type: 'stock', until: isoDate(addDays(state.week, 6)) }); render(); toast('Mis de côté : vous l\'avez déjà'); } catch (e) { fail(e); }
  },
  unstock: async (b) => { try { await Data.deletePlacard(b.dataset.id); render(); } catch (e) { fail(e); } },
  basiques: () => openBasiques(),
  'cook-with': () => cookWithSheet(),
  'reste-del': async (b) => { if (await confirmSheet('Retirer ce reste (mangé ou jeté) ?', 'Retirer')) { try { await Data.deleteReste(b.dataset.id); render(); } catch (e) { fail(e); } } },
  'del-extra': async (b) => { try { await Data.deleteExtra(b.dataset.id); render(); } catch (e) { fail(e); } },
  slot: (b) => onSlot(Number(b.dataset.d), b.dataset.s),
  'cancel-move': () => { state.moving = null; render(); },
  'link-item': (b) => linkItem(b.dataset.k, b.dataset.n),
  'copy-list': async () => {
    try { await navigator.clipboard.writeText(shoppingText()); toast('Liste copiée'); } catch { toast('Copie impossible sur ce navigateur'); }
  },
  'share-list': async () => {
    const text = shoppingText();
    if (navigator.share) { try { await navigator.share({ title: 'Liste de courses', text }); } catch { /* partage annulé */ } }
    else { try { await navigator.clipboard.writeText(text); toast('Partage indisponible : liste copiée'); } catch { toast('Partage indisponible'); } }
  },
};

Forme.install();
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const fn = ACTIONS[b.dataset.act];
  if (fn) { e.preventDefault(); fn(b, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.dataset.form === 'extra') {
    e.preventDefault();
    const raw = f.xname.value.trim();
    if (!raw) return;
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    const aisle = f.xaisle.value || guessAisle(name);
    Data.addExtra(name, f.xqty.value.trim(), aisle)
      .then(() => { render(); toast(`Ajouté au rayon ${aisle}`); $('[data-form="extra"] [name="xname"]')?.focus(); })
      .catch((err) => fail(err));
    return;
  }
  if (f.dataset.form === 'ean-inline') {
    e.preventDefault();
    const code = f.ean.value.trim();
    if (!/^\d{8,14}$/.test(code)) { toast('Code-barres invalide (8 à 14 chiffres)'); return; }
    f.reset();
    showProduct(code);
  }
});
document.addEventListener('input', (e) => {
  if (e.target.dataset.input === 'recipe-q') {
    state.recipeQuery = e.target.value;
    $('#recipe-results').innerHTML = recipeResults(recipeFilterList());
  }
});
document.addEventListener('change', (e) => {
  // Menu « Plus » : afficher ou masquer un écran facultatif (batch cooking…).
  if (e.target.dataset.afficher) { Modules.masquer(e.target.dataset.afficher, !e.target.checked); return; }
  if (e.target.matches('[data-import-data]') && e.target.files[0]) importData(e.target.files[0]);
});
document.addEventListener('change', async (e) => {
  const k = e.target.dataset.check;
  if (k == null) return;
  const row = e.target.closest('.shop-item');
  row?.classList.toggle('done', e.target.checked);
  try {
    if (k.startsWith('extra:')) await Data.setExtraChecked(k.slice(6), e.target.checked);
    else await Data.setCheck(k, e.target.checked);
    $$('[data-checked-count]').forEach((el) => { el.textContent = checkedCountText(); });
  } catch (err) { e.target.checked = !e.target.checked; row?.classList.toggle('done', e.target.checked); fail(err); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const cook = $('.cook');
  if (cook) $('[data-c="close"]', cook)?.click();
  else if (Scanner.el) Scanner.close();
  else if (sheets.length) closeSheet();
});

