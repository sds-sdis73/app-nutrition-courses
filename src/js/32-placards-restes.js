// ---------------------------------------------------------------------------
// Placards, aversions, restes
// ---------------------------------------------------------------------------
const DEFAULT_BASIQUES = ['Sel', 'Poivre', 'Huile d\'olive', 'Huile de tournesol', 'Vinaigre', 'Sucre', 'Farine', 'Moutarde', 'Herbes de Provence', 'Thym', 'Laurier', 'Cumin', 'Curry', 'Paprika', 'Bouillon'];
const keyMatches = (k, p) => !!k && !!p && (k === p || k.startsWith(`${p} `) || p.startsWith(`${k} `));
const basiques = () => state.placards.filter((x) => x.type === 'basique' && x.ing_key !== '__init__');
const stocks = () => state.placards.filter((x) => x.type === 'stock' && (!x.until || x.until >= isoDate(state.week)));
const inPlacard = (k) => basiques().find((p) => keyMatches(k, p.ing_key)) || stocks().find((p) => keyMatches(k, p.ing_key)) || null;

// Familles d'aliments à éviter (allergies, régimes, dégoûts), détectées dans les noms d'ingrédients.
const EVITE = {
  gluten: { label: 'Gluten', words: 'ble farine pain pate pates spaghetti semoule boulgour couscous seigle orge epeautre chapelure biscotte brioche pizza tortilla wrap' },
  lactose: { label: 'Lactose / lait', words: 'lait creme beurre fromage yaourt emmental gruyere comte parmesan mozzarella feta chevre reblochon raclette mascarpone ricotta cheddar skyr' },
  oeuf: { label: 'Œufs', words: 'oeuf oeufs mayonnaise' },
  arachide: { label: 'Arachide', words: 'cacahuete arachide' },
  noix: { label: 'Fruits à coque', words: 'noix noisette amande pistache cajou pecan macadamia' },
  poisson: { label: 'Poisson', words: 'poisson saumon cabillaud thon sardine maquereau truite colin lieu merlu dorade bar sole' },
  crustaces: { label: 'Crustacés / fruits de mer', words: 'crevette crabe homard langoustine moule huitre calamar seiche poulpe coquille saint jacques' },
  soja: { label: 'Soja', words: 'soja tofu tempeh edamame' },
  sesame: { label: 'Sésame', words: 'sesame tahini' },
  porc: { label: 'Porc', words: 'porc lardon jambon chorizo saucisson saucisse bacon' },
  boeuf: { label: 'Bœuf / veau', words: 'boeuf veau steak hache' },
  viande: { label: 'Viande (végétarien)', words: 'boeuf veau porc poulet dinde canard agneau steak hache viande escalope lardon jambon chorizo saucisse bacon merguez' },
  champignon: { label: 'Champignons', words: 'champignon cepe girolle shiitake' },
  piment: { label: 'Piment / épicé', words: 'piment harissa tabasco' },
  alcool: { label: 'Alcool', words: 'vin biere rhum cognac pastis' },
};
function ingredientAvoids(name) {
  const words = ingKey(name).split(' ');
  const out = new Set();
  for (const [k, def] of Object.entries(EVITE)) if (def.words.split(' ').some((w) => words.includes(w))) out.add(k);
  return out;
}
function recipeAvoids(r) {
  const out = new Set();
  for (const ing of r.ingredients || []) ingredientAvoids(ing.name).forEach((k) => out.add(k));
  return out;
}
const memberAvoids = (m) => m.evite || [];
// Mots libres saisis par le membre (préfixe « mot: »), comparés aux noms d'ingrédients.
function memberConflicts(m, r) {
  const av = memberAvoids(m);
  const found = recipeAvoids(r);
  const hits = av.filter((k) => found.has(k)).map((k) => EVITE[k]?.label || k);
  const free = av.filter((k) => k.startsWith('mot:')).map((k) => k.slice(4));
  for (const w of free) if ((r.ingredients || []).some((i) => ingKey(i.name).includes(ingKey(w)))) hits.push(w);
  return hits;
}
function mealConflicts(meal, recipe = recipeById(meal.recipe_id)) {
  if (!recipe) return [];
  return mealEaters(meal).map((m) => ({ member: m, hits: memberConflicts(m, recipe) })).filter((x) => x.hits.length);
}
const conflictsFor = (members, recipe) => members.map((m) => ({ member: m, hits: memberConflicts(m, recipe) })).filter((x) => x.hits.length);
const conflictText = (list) => list.map((c) => `${c.member.nom} évite ${c.hits.join(', ')}`).join(' · ');
const eviteLabel = (k) => (k.startsWith('mot:') ? k.slice(4) : EVITE[k]?.label || k);

// Restes utilisables pour une date donnée (frigo : avant la DLC ; congélateur : toujours).
const restesFor = (date) => state.restes.filter((x) => Number(x.portions) > 0 && (x.stockage === 'congel' || x.dlc >= isoDate(date)));
const resteLabel = (x) => `${fmtPortions(Number(x.portions))} · ${x.stockage === 'congel' ? 'congélateur' : 'frigo'} · ${x.stockage === 'congel' ? 'jusqu\'au' : 'à manger avant le'} ${fmtDay(isoToDate(x.dlc))}`;

// Déclarer des portions restantes (depuis un repas du planning ou la fin du mode cuisine).
function resteSheet({ recipeId, faitLe, mealId, ask = false }) {
  const r = recipeById(recipeId);
  if (!r) return;
  let portions = 1;
  let stockage = 'frigo';
  const fait = faitLe || isoDate(new Date());
  const dlc = () => isoDate(addDays(isoToDate(fait), stockage === 'congel' ? 90 : 3));
  const el = openSheet(`${sheetHead(ask ? 'Il en reste ?' : 'Portions restantes')}
    <p class="muted small" style="margin-top:0"><b>${esc(r.title)}</b> — les portions mises de côté seront proposées pour remplir le planning.</p>
    <div class="row" style="margin-bottom:10px"><span class="grow">Portions restantes</span><div class="stepper"><button data-r="-0.5" aria-label="Moins">−</button><span data-portions>1</span><button data-r="0.5" aria-label="Plus">+</button></div></div>
    <div class="seg" role="group" style="grid-template-columns:1fr 1fr"><button aria-pressed="true" data-st="frigo">Réfrigérateur</button><button aria-pressed="false" data-st="congel">Congélateur</button></div>
    <p class="muted small" data-dlc></p>
    <button class="btn primary block" data-x="save">Enregistrer</button>
    ${ask ? '<button class="btn block" data-x="no" style="border:0;margin-top:6px">Non, rien ne reste</button>' : ''}`);
  const draw = () => {
    $('[data-portions]', el).textContent = fmtPortions(portions);
    $$('[data-st]', el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.st === stockage));
    $('[data-dlc]', el).textContent = stockage === 'congel' ? `À consommer de préférence avant le ${fmtDay(isoToDate(dlc()))} (3 mois). Pensez à sortir la boîte la veille.` : `À consommer avant le ${fmtDay(isoToDate(dlc()))} (3 jours au réfrigérateur).`;
  };
  draw();
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-r],[data-st],[data-x]');
    if (!b) return;
    if (b.dataset.r) { portions = clamp(portions + Number(b.dataset.r), 0.5, 30); draw(); }
    if (b.dataset.st) { stockage = b.dataset.st; draw(); }
    if (b.dataset.x === 'no') closeSheet();
    if (b.dataset.x === 'save') {
      try {
        await Data.addReste({ recipe_id: r.id, portions, stockage, fait_le: fait, dlc: dlc(), source_meal_id: mealId || null });
        closeSheet();
        toast(`${fmtPortions(portions)} de « ${r.title} » mise(s) de côté`);
        render();
      } catch (err) { fail(err); }
    }
  });
}
async function markCooked(recipeId, date = isoDate(new Date())) {
  const r = recipeById(recipeId);
  if (!r || r.derniere_cuisson === date) return;
  try { await Data.saveRecipe({ ...r, derniere_cuisson: date }); } catch (e) { console.warn(e); }
}

// Basiques permanents (exclus de la liste de courses).
function openBasiques() {
  const el = openSheet(`${sheetHead('Basiques du placard')}
    <p class="muted small" style="margin-top:0">Ces produits sont considérés comme toujours disponibles : ils n'apparaissent pas dans la liste de courses.</p>
    <form class="row" data-form="basique" style="margin-bottom:10px"><input class="input grow" name="name" placeholder="Ajouter un basique (ex. huile de colza)" required><button class="btn primary">${ICON.plus}</button></form>
    <div class="chips wrap" data-list style="flex-wrap:wrap"></div>`);
  const draw = () => {
    $('[data-list]', el).innerHTML = basiques().map((b) => `<span class="chip">${esc(b.name)} <button type="button" class="icon-btn" style="width:28px;height:28px;margin:-6px -10px -6px 0" data-del="${b.id}" aria-label="Retirer">${ICON.close}</button></span>`).join('') || '<p class="muted">Aucun basique.</p>';
  };
  draw();
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    try { await Data.addPlacard({ name: name.charAt(0).toUpperCase() + name.slice(1), ing_key: ingKey(name), type: 'basique' }); e.target.reset(); draw(); if (state.tab === 'courses') render(); } catch (err) { fail(err); }
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    try { await Data.deletePlacard(b.dataset.del); draw(); if (state.tab === 'courses') render(); } catch (err) { fail(err); }
  });
}

// « Que cuisiner avec… » : recettes classées par ingrédients couverts.
function cookWithSheet() {
  const el = openSheet(`${sheetHead('Que cuisiner avec…')}
    <textarea class="input" data-ings rows="2" placeholder="Ingrédients disponibles, séparés par des virgules (ex. courgettes, riz, œufs)"></textarea>
    <label class="check" style="margin:8px 0"><input type="checkbox" data-use-stock checked> Inclure mes stocks et basiques</label>
    <div data-results></div>`);
  const draw = () => {
    const typed = $('[data-ings]', el).value.split(/[,\n;]+/).map((x) => ingKey(x)).filter(Boolean);
    const keys = [...typed];
    if ($('[data-use-stock]', el).checked) keys.push(...basiques().map((b) => b.ing_key), ...stocks().map((b) => b.ing_key));
    if (!typed.length) { $('[data-results]', el).innerHTML = '<p class="muted small">Saisissez au moins un ingrédient.</p>'; return; }
    const scored = state.recipes.map((r) => {
      const ings = (r.ingredients || []).map((i) => ingKey(i.name)).filter(Boolean);
      const have = ings.filter((k) => keys.some((p) => keyMatches(k, p) || k.split(' ').some((w) => w.length > 3 && p.split(' ').includes(w))));
      const typedHit = ings.filter((k) => typed.some((p) => keyMatches(k, p) || k.split(' ').some((w) => w.length > 3 && p.split(' ').includes(w)))).length;
      return { r, cover: ings.length ? have.length / ings.length : 0, typedHit, missing: (r.ingredients || []).filter((i) => !have.includes(ingKey(i.name))).map((i) => i.name) };
    }).filter((x) => x.typedHit > 0).sort((a, b) => b.typedHit - a.typedHit || b.cover - a.cover);
    $('[data-results]', el).innerHTML = scored.slice(0, 20).map(({ r, cover, missing }) => `<button class="prod-row" data-act="open-recipe" data-id="${r.id}"><div class="grow"><div class="prod-name">${esc(r.title)}</div>
      <div class="muted small">${Math.round(cover * 100)} % des ingrédients${missing.length ? ` · il manque : ${esc(missing.slice(0, 4).join(', '))}${missing.length > 4 ? '…' : ''}` : ' · tout est là'}</div></div></button>`).join('')
      || '<p class="muted">Aucune recette ne contient ces ingrédients.</p>';
  };
  el.addEventListener('input', draw);
  el.addEventListener('change', draw);
  draw();
  setTimeout(() => $('[data-ings]', el)?.focus(), 250);
}

