// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------
function openSettings() {
  const s = state.settings;
  const el = openSheet(`${sheetHead('Paramètres')}
    <div class="card row" style="padding:12px;margin-bottom:16px;box-shadow:none;background:var(--surface-2)">
      <div class="grow"><div class="muted small">Connecté en tant que</div><b style="word-break:break-all">${esc(state.user?.email || '')}</b></div>
      <button class="btn small" data-x="logout">Se déconnecter</button></div>
    <button class="btn block" data-act="basiques" style="margin-bottom:10px">${ICON.cart} Basiques du placard · ${basiques().length}</button>
    <button class="btn block" data-x="rappels" style="margin-bottom:10px">${ICON.clock} Rappels (notifications)</button>
    <button class="btn block" data-act="widget-help" style="margin-bottom:10px">📱 Widget iPhone</button>
    <button class="btn block" data-act="mc-sheet" style="margin-bottom:10px">🍲 Monsieur Cuisine</button>
    <button class="btn block" data-act="compagnon" style="margin-bottom:10px">${ICON.sparkle} Mon compagnon</button>
    <button class="btn soft block" data-x="foyer" style="margin-bottom:16px">${ICON.users} Mon foyer · ${state.members.length ? `${state.members.length} membre${state.members.length > 1 ? 's' : ''}` : 'à configurer'}</button>
    <form class="stack" data-form="settings">
      <h3 style="margin:0">Supermarché</h3>
      <label class="field"><span>Nom du magasin</span><input class="input" name="store_name" value="${esc(s.store_name)}" placeholder="Ex. Super U de ma ville"></label>
      <label class="field"><span>Adresse Courses U du magasin</span><input class="input" name="store_slug" value="${esc(s.store_slug ? `https://www.coursesu.com/drive-${s.store_slug}` : '')}" placeholder="https://www.coursesu.com/drive-…"></label>
      <p class="muted small" style="margin:0">Pour changer de magasin : sur coursesu.com, choisissez votre magasin, puis copiez l'adresse de sa page (elle commence par <code>coursesu.com/drive-</code>).</p>
      <h3 style="margin:16px 0 0">Repas</h3>
      <label class="field"><span>Nombre de personnes par défaut</span><input class="input" type="number" min="1" max="20" name="default_servings" value="${s.default_servings}"></label>
      <button class="btn primary block">Enregistrer</button>
    </form>
    <h3 style="margin:22px 0 8px">Sauvegarde</h3>
    <div class="grid2"><button class="btn" data-x="export">${ICON.download} Exporter</button>
      <label class="btn">${ICON.upload} Importer<input type="file" accept="application/json" data-x="import" hidden></label></div>
    <p class="muted small">Données nutritionnelles : Open Food Facts. Vos recettes, plannings et listes sont privés et liés à votre compte.</p>`);
  $('[data-x="foyer"]', el).addEventListener('click', () => { closeSheet(); openFoyer(); });
  $('[data-x="rappels"]', el).addEventListener('click', () => openRappels());
  $('[data-x="logout"]', el).addEventListener('click', async () => {
    while (sheets.length) closeSheet();
    await db.auth.signOut({ scope: 'local' }); // cet appareil seulement : les autres téléphones du foyer restent connectés
  });
  const form = $('form', el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = form.store_slug.value.trim();
    const slug = raw ? slugMagasin(raw) : '';
    if (raw && !slug) { toast('Adresse du magasin invalide'); return; }
    try {
      await Data.saveSettings({ store_name: form.store_name.value.trim() || (slug ? nomMagasin(slug) : ''), store_slug: slug, default_servings: clamp(parseInt(form.default_servings.value, 10) || 2, 1, 20) });
      closeSheet(); render(); toast('Paramètres enregistrés');
    } catch (err) { fail(err); }
  });
  $('[data-x="export"]', el).addEventListener('click', exportData);
  $('[data-x="import"]', el).addEventListener('change', (e) => e.target.files[0] && importData(e.target.files[0]));
}
async function exportData() {
  try {
    const [plan] = await Promise.all([db.from(T.plan).select('*').eq('foyer_id', foyer())]);
    if (plan.error) throw plan.error;
    const data = { app: APP_NAME, version: 1, exported_at: new Date().toISOString(), settings: state.settings, recipes: state.recipes, meal_plan: plan.data, product_links: Object.values(state.links) };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `sauvegarde-${isoDate(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (err) { fail(err, 'Export impossible'); }
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.recipes)) throw new Error('Fichier non reconnu');
    if (!(await confirmSheet(`Importer ${d.recipes.length} recette(s) et le planning ? Les éléments existants avec le même identifiant seront remplacés.`, 'Importer', false))) return;
    // Les éléments importés sont rattachés au compte connecté ; les recettes reçoivent de nouveaux identifiants.
    const ids = new Map(d.recipes.map((r) => [r.id, uid()]));
    if (d.recipes.length) { const r = await db.from(T.recipes).insert(d.recipes.map((x) => ({ ...x, id: ids.get(x.id), ...own() }))); if (r.error) throw r.error; }
    if (d.product_links?.length) { const r = await db.from(T.links).upsert(d.product_links.map(({ id, ...l }) => ({ ...l, ...own() }))); if (r.error) throw r.error; }
    const plan = (d.meal_plan || []).filter((m) => ids.has(m.recipe_id)).map(({ id, ...m }) => ({ ...m, recipe_id: ids.get(m.recipe_id), ...own() }));
    if (plan.length) { const r = await db.from(T.plan).upsert(plan, { onConflict: 'foyer_id,week,day,slot' }); if (r.error) throw r.error; }
    if (d.settings) { const { id, user_id, updated_at, ...s } = d.settings; await Data.saveSettings(s); }
    await Data.loadAll();
    await Data.loadWeek();
    closeSheet(); render(); toast('Import terminé');
  } catch (err) { fail(err, 'Import impossible'); }
}

