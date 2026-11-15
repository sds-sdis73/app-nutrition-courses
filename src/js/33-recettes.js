// ---------------------------------------------------------------------------
// Onglet Recettes
// ---------------------------------------------------------------------------
const totalMin = (r) => (Number(r.prep_min) || 0) + (Number(r.cook_min) || 0);
function recipeFilterList() {
  const q = norm(state.recipeQuery);
  const chip = state.recipeChip;
  return state.recipes.filter((r) => {
    if (q && !norm(`${r.title} ${(r.tags || []).join(' ')} ${(r.ingredients || []).map((i) => i.name).join(' ')}`).includes(q)) return false;
    if (chip === 'favoris') return r.favorite || r.avis === 'adore';
    if (chip === 'a_tester') return r.avis === 'a_tester';
    if (chip === 'rapide') return totalMin(r) > 0 && totalMin(r) <= 30;
    if (chip.startsWith('#')) return (r.tags || []).includes(chip.slice(1));
    return true;
  });
}
function recipeCard(r) {
  const img = safeUrl(r.photo_url);
  return `<button class="recipe-card" data-act="open-recipe" data-id="${r.id}">
    ${img ? `<img class="cover" src="${esc(img)}" alt="" loading="lazy">` : `<div class="cover ph">${ICON.chef}</div>`}
    <div class="body"><h3>${esc(r.title)}</h3><div class="meta">
      ${totalMin(r) ? `<span>${ICON.clock} ${totalMin(r)} min</span>` : ''}<span>${ICON.users} ${r.servings}</span>${CQ.ready ? nsBadge(recipeNutriScore(r), true) : ''}${r.favorite ? `<span class="fav">${ICON.heartFill}</span>` : ''}${avisBadge(r)}</div></div></button>`;
}
const AVIS = { a_tester: ['À tester', 'tag'], adore: ['On adore', 'tag ahead'], jamais: ['Plus jamais', 'tag warn-tag'] };
const avisBadge = (r) => (r.avis && AVIS[r.avis] ? `<span class="${AVIS[r.avis][1]}">${AVIS[r.avis][0]}</span>` : '');
function renderRecipes() {
  const tags = [...new Set(state.recipes.flatMap((r) => r.tags || []))].sort();
  const list = recipeFilterList();
  const chips = [['tous', 'Toutes'], ['favoris', 'On adore'], ['a_tester', 'À tester'], ['rapide', '≤ 30 min'], ...tags.map((t) => [`#${t}`, t])];
  return `
    <div class="row" style="margin-bottom:12px">
      <div class="searchbar grow">${ICON.search}<input class="input" type="search" placeholder="Rechercher une recette, un ingrédient…" value="${esc(state.recipeQuery)}" data-input="recipe-q" aria-label="Rechercher"></div>
      <button class="btn" data-act="cook-with" aria-label="Que cuisiner avec mes ingrédients">${ICON.leaf}</button>
      <button class="btn primary" data-act="new-recipe" aria-label="Nouvelle recette">${ICON.plus}</button>
    </div>
    <div class="chips">${chips.map(([k, l]) => `<button class="chip" aria-pressed="${state.recipeChip === k}" data-act="recipe-chip" data-v="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <div id="recipe-results">${recipeResults(list)}</div>`;
}
function recipeResults(list) {
  if (list.length) return `<div class="recipe-grid">${list.map(recipeCard).join('')}</div>`;
  if (state.recipes.length) return '<div class="empty"><p>Aucune recette ne correspond.</p></div>';
  return `<div class="empty">${ICON.chef}<p>Votre carnet de recettes est vide.</p>
    <div class="stack" style="max-width:320px;margin:0 auto"><button class="btn primary block" data-act="new-recipe">${ICON.plus} Créer une recette</button>
    <button class="btn block" data-act="import-url">${ICON.globe} Importer depuis un site</button>
    <button class="btn block" data-act="seed">${ICON.sparkle} Ajouter 3 recettes d'exemple</button></div></div>`;
}

function scaleQty(qty, factor) {
  const v = parseFloat(String(qty).replace(',', '.'));
  return isFinite(v) ? fmtNum(v * factor) : qty;
}
function recipeScoreAvg(r) {
  const scored = (r.ingredients || []).filter((i) => typeof i.score === 'number');
  if (!scored.length) return null;
  return { avg: Math.round(scored.reduce((a, i) => a + i.score, 0) / scored.length), n: scored.length };
}

function recipeNutritionHtml(r) {
  const rn = recipeNutrition(r);
  const p = rn.perPortion;
  const members = state.members.map((m) => {
    const f = memberFactor(m);
    return `<div class="nt-row"><span>${esc(m.nom)} <span class="muted small">· ${fmtPortions(f)}</span></span><b>${Math.round(p.kcal * f)} kcal</b><span class="pct">${Math.round(((p.kcal * f) / kcalNeed(m)) * 100)} %</span></div>`;
  }).join('');
  const ns = CQ.ready ? recipeNutriScore(r) : null;
  return `<h3 style="margin:22px 0 6px">Valeurs nutritionnelles</h3>
    ${ns ? `<div class="row" style="margin-bottom:8px">${nsBadge(ns)}<span class="small"><b>Nutri-Score ${ns.grade}</b> <span class="muted">calculé sur la recette (${ns.score} pt${ns.score > 1 ? 's' : ''})</span></span></div>` : ''}
    <div class="macro-strip">${['kcal', 'prot', 'gluc', 'lip', 'fib'].map((k) => {
      const d = NUTRI_KEYS.find((x) => x.k === k);
      return `<div><b>${fmtN(p[k], d.unit).replace(' ', '&nbsp;')}</b><span>${d.label}</span></div>`;
    }).join('')}</div>
    <p class="muted small" style="margin:6px 0 10px">Par portion standard (adulte à ${REF_KCAL} kcal/jour). La recette fait ${r.servings} portion(s) : ${Math.round(rn.total.kcal)} kcal au total.</p>
    ${state.members.length ? `<div class="ntable"><div class="nt-title">Portion de chaque membre du foyer</div>${members}</div>` : ''}
    <details class="ndetails"><summary>Détail complet par portion</summary>${nutriTable(p)}</details>
    <details class="ndetails"><summary>Détail par ingrédient${rn.missing ? ` · <span style="color:var(--mediocre)">${rn.missing} non calculé(s)</span>` : ''}</summary>
      <ul class="ing-nutri">${rn.lines.map((l) => `<li><div class="row"><b class="grow">${esc(l.ing.name)}</b><span>${l.n ? `${Math.round(l.n.kcal)} kcal` : '—'}</span></div>
        <div class="muted small">${l.g != null ? `${fmtNum(l.g)} g` : 'quantité non précisée'} · ${l.src ? `${l.src.type === 'off' ? 'produit scanné' : `Ciqual : ${esc(l.src.label)}${l.src.auto ? ' (auto)' : ''}`}` : '<span style="color:var(--mediocre)">aliment non reconnu</span>'}</div></li>`).join('')}</ul>
      <p class="muted small">Pour corriger un aliment ou un poids, modifiez la recette. Source : table Ciqual 2025 (Anses).</p></details>`;
}

function openRecipe(id, servingsOverride) {
  const r = recipeById(id);
  if (!r) return;
  let servings = servingsOverride || r.servings;
  const img = safeUrl(r.photo_url);
  const el = openSheet(`<div id="rd"></div>`, { full: true });
  const draw = () => {
    const f = servings / (r.servings || 1);
    const nut = recipeScoreAvg(r);
    $('#rd', el).innerHTML = `
      <div class="sheet-head"><button class="icon-btn" data-act="close-sheet" aria-label="Retour">${ICON.back}</button><h2></h2>
        <button class="icon-btn ${r.favorite ? 'fav' : ''}" data-act="toggle-fav" data-id="${r.id}" aria-label="Favori">${r.favorite ? ICON.heartFill : ICON.heart}</button>
        <button class="icon-btn" data-act="recipe-menu" data-id="${r.id}" aria-label="Plus d'actions">${ICON.dots}</button></div>
      ${img ? `<img class="detail-cover" src="${esc(img)}" alt="">` : ''}
      <h2 style="font-size:24px;margin:0 0 6px">${esc(r.title)}</h2>
      <div class="meta" style="margin-bottom:10px">${r.prep_min ? `<span>${ICON.clock} Prépa ${r.prep_min} min</span>` : ''}${r.cook_min ? `<span>${ICON.flame} Cuisson ${r.cook_min} min</span>` : ''}
        ${(r.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${nut ? `<div class="row small" style="margin-bottom:8px">${scoreHtml(nut.avg)}<span class="muted">moyenne de ${nut.n} ingrédient(s) scanné(s)</span></div>` : ''}
      <div class="chips" style="padding-bottom:4px">${Object.entries(AVIS).map(([k, [l]]) => `<button class="chip" aria-pressed="${r.avis === k}" data-avis="${k}">${l}</button>`).join('')}</div>
      ${recipeWarnings(r)}
      <details class="ndetails" ${r.notes ? 'open' : ''}><summary>Notes${r.derniere_cuisson ? ` · dernière fois : ${fmtDay(isoToDate(r.derniere_cuisson))}` : ''}</summary>
        <textarea class="input" data-notes rows="2" placeholder="Ex. doubler la sauce, 10 min de moins au four…">${esc(r.notes || '')}</textarea></details>
      <button class="btn primary block" data-act="cook-mode" data-id="${r.id}">${ICON.play} Mode cuisine</button>
      <div class="row" style="margin:20px 0 6px"><h3 class="grow" style="margin:0">Ingrédients</h3>
        <div class="stepper"><button data-srv="-1" aria-label="Moins">−</button><span>${fmtPortions(servings)}</span><button data-srv="1" aria-label="Plus">+</button></div></div>
      <ul class="ing-list">${(r.ingredients || []).map((i) => `<li><span class="q">${esc(scaleQty(i.qty, f))} ${esc(i.unit || '')}</span><span class="grow">${esc(i.name)}</span>${typeof i.score === 'number' ? scoreHtml(i.score) : ''}</li>`).join('') || '<li class="muted">Aucun ingrédient</li>'}</ul>
      ${recipeNutritionHtml(r)}
      <h3 style="margin:22px 0 6px">Préparation</h3>
      <ol class="step-list">${(r.steps || []).map((s) => `<li>${esc(s.text)}<div class="meta" style="margin-top:4px">${s.min ? `<span>${ICON.clock} ${s.min} min</span>` : ''}${s.ahead ? '<span class="tag ahead">À l\'avance</span>' : ''}</div></li>`).join('') || '<li class="muted">Aucune étape</li>'}</ol>
      ${safeUrl(r.source_url) ? `<p class="small"><a href="${esc(safeUrl(r.source_url))}" target="_blank" rel="noopener">Source de la recette</a></p>` : ''}`;
  };
  draw();
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-avis]');
    if (a) {
      const avis = r.avis === a.dataset.avis ? null : a.dataset.avis;
      try { Object.assign(r, await Data.saveRecipe({ ...recipeById(r.id), avis })); draw(); render(); } catch (err) { fail(err); }
      return;
    }
    const b = e.target.closest('[data-srv]');
    if (!b) return;
    servings = clamp(Math.round(servings) + Number(b.dataset.srv), 1, 50);
    draw();
  });
  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-notes]')) return;
    const notes = e.target.value.trim() || null;
    try { Object.assign(r, await Data.saveRecipe({ ...recipeById(r.id), notes })); toast('Note enregistrée'); } catch (err) { fail(err); }
  });
}
function recipeWarnings(r) {
  const found = [...recipeAvoids(r)];
  const cf = conflictsFor(state.members, r);
  if (!found.length && !cf.length) return '';
  return `<p class="small" style="margin:0 0 10px"><span class="muted">Contient : ${found.map(eviteLabel).join(', ') || '—'}.</span>${cf.length ? ` <span class="warn">⚠ ${esc(conflictText(cf))}</span>` : ''}</p>`;
}

function recipeMenu(id) {
  const r = recipeById(id);
  if (!r) return;
  const el = openSheet(`${sheetHead(r.title)}<div class="menu-list">
    <button data-m="edit">${ICON.edit} Modifier</button>
    <button data-m="dup">${ICON.copy} Dupliquer</button>
    <button data-m="plan">${ICON.plus} Ajouter au planning</button>
    <button data-m="del" style="color:var(--danger)">${ICON.trash} Supprimer</button></div>`);
  el.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-m]')?.dataset.m;
    if (!m) return;
    closeSheet();
    if (m === 'edit') { closeSheet(); openEditor(r); }
    if (m === 'dup') {
      try {
        const copy = await Data.saveRecipe({ ...structuredClone(r), id: uid(), title: `${r.title} (copie)`, created_at: undefined, favorite: false });
        closeSheet(); render(); openRecipe(copy.id); toast('Recette dupliquée');
      } catch (err) { fail(err); }
    }
    if (m === 'plan') pickSlotFor(r.id);
    if (m === 'del') {
      if (!(await confirmSheet(`Supprimer « ${r.title} » ? Elle sera aussi retirée du planning.`, 'Supprimer'))) return;
      try { await Data.deleteRecipe(r.id); closeSheet(); render(); toast('Recette supprimée'); } catch (err) { fail(err); }
    }
  });
}

function pickSlotFor(recipeId) {
  const days = DAYS.map((d, i) => {
    const date = addDays(state.week, i);
    return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="grow"><b>${d}</b> <span class="muted small">${fmtDay(date)}</span></span>
      ${['midi', 'soir'].map((slot) => { const taken = state.plan.find((m) => m.day === i && m.slot === slot); return `<button class="btn small ${taken ? '' : 'soft'}" data-d="${i}" data-s="${slot}">${slot === 'midi' ? 'Midi' : 'Soir'}${taken ? ' ✓' : ''}</button>`; }).join('')}</div>`;
  }).join('');
  const el = openSheet(`${sheetHead(`Semaine du ${fmtDay(state.week)}`)}<p class="muted small" style="margin-top:0">Choisissez un repas (✓ = déjà rempli, sera remplacé).</p>${days}`);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    try {
      await Data.setMeal(Number(b.dataset.d), b.dataset.s, recipeId, state.settings.default_servings);
      closeSheet(); toast('Ajouté au planning'); if (state.tab === 'planning') render();
    } catch (err) { fail(err); }
  });
}

// --- Éditeur de recette ---
let editing = null;
function blankRecipe() {
  return { id: uid(), title: '', photo_url: null, servings: state.settings.default_servings || 2, prep_min: 0, cook_min: 0, tags: [], ingredients: [], steps: [], favorite: false, source_url: null };
}
function openEditor(r, { fromImport = false } = {}) {
  editing = structuredClone(r || blankRecipe());
  const isNew = !state.recipes.some((x) => x.id === editing.id);
  const el = openSheet(`<div class="sheet-head"><button class="icon-btn" data-act="close-sheet" aria-label="Annuler">${ICON.close}</button>
      <h2>${isNew ? 'Nouvelle recette' : 'Modifier la recette'}</h2><button class="btn primary small" data-ed="save">Enregistrer</button></div>
    <div id="ed" class="stack"></div>`, { full: true, onClose: () => { editing = null; } });
  drawEditor(el);
  if (fromImport) toast('Recette importée : vérifiez les quantités');
  el.addEventListener('click', (e) => onEditorClick(e, el));
  el.addEventListener('input', (e) => onEditorInput(e));
  el.addEventListener('change', (e) => onEditorChange(e, el));
}
function drawEditor(el) {
  const r = editing;
  const img = safeUrl(r.photo_url);
  const datalist = [...new Set(state.recipes.flatMap((x) => (x.ingredients || []).map((i) => i.name)))].sort();
  $('#ed', el).innerHTML = `
    ${isNewRecipe() ? `<button class="btn soft block" data-ed="import">${ICON.globe} Importer depuis un site (Marmiton, 750g…)</button>` : ''}
    <label class="photo-pick">${img ? `<img src="${esc(img)}" alt="">` : `<span class="row">${ICON.camera} Ajouter une photo</span>`}
      <input type="file" accept="image/*" data-ed="photo" aria-label="Photo de la recette"></label>
    ${img ? '<button class="btn small" data-ed="photo-del" style="border:0;color:var(--danger)">Retirer la photo</button>' : ''}
    <label class="field"><span>Titre</span><input class="input" data-f="title" value="${esc(r.title)}" placeholder="Ex. Curry de pois chiches" required></label>
    <div class="grid3">
      <label class="field"><span>Personnes</span><input class="input" type="number" min="1" max="50" inputmode="numeric" data-f="servings" value="${r.servings}"></label>
      <label class="field"><span>Prépa (min)</span><input class="input" type="number" min="0" inputmode="numeric" data-f="prep_min" value="${r.prep_min || 0}"></label>
      <label class="field"><span>Cuisson (min)</span><input class="input" type="number" min="0" inputmode="numeric" data-f="cook_min" value="${r.cook_min || 0}"></label>
    </div>
    <label class="field"><span>Étiquettes (séparées par des virgules)</span><input class="input" data-f="tags" value="${esc((r.tags || []).join(', '))}" placeholder="végétarien, rapide, hiver"></label>

    <h3 style="margin:22px 0 0">Ingrédients <span class="muted small">(${r.ingredients.length})</span></h3>
    <div class="ed-block">
      <div id="ed-ings">${r.ingredients.map((i, k) => `<div class="ed-ing" data-i="${k}">
        <input class="input" data-g="qty" value="${esc(i.qty)}" inputmode="decimal" placeholder="Qté" aria-label="Quantité">
        <select class="input" data-g="unit" aria-label="Unité">${UNITS.map((u) => `<option ${u === (i.unit || '') ? 'selected' : ''} value="${esc(u)}">${u || '—'}</option>`).join('')}</select>
        <input class="input" data-g="name" value="${esc(i.name)}" placeholder="Ingrédient" aria-label="Nom" list="ing-names">
        <button class="icon-btn" data-ed="ing-del" data-i="${k}" aria-label="Supprimer">${ICON.trash}</button>
        <select class="input aisle" data-g="aisle" aria-label="Rayon">${AISLES.map((a) => `<option ${a === i.aisle ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <span class="score">${typeof i.score === 'number' ? `<span class="lvl-${scoreLevel(i.score).lvl}" title="${i.score}/100"><span class="dot"></span></span>` : ''}</span>
        ${ingNutriLink(i, k)}
      </div>`).join('')}</div>
      <datalist id="ing-names">${datalist.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <form class="stack" data-ed-form="ing" style="margin-top:10px">
        <div class="ed-ing" style="border:0;padding:0">
          <input class="input" name="qty" inputmode="decimal" placeholder="Qté" aria-label="Quantité">
          <select class="input" name="unit" aria-label="Unité">${UNITS.map((u) => `<option value="${esc(u)}" ${u === 'g' ? 'selected' : ''}>${u || '—'}</option>`).join('')}</select>
          <input class="input" name="ingname" placeholder="Nouvel ingrédient" aria-label="Nom de l'ingrédient" list="ing-names" required>
          <button class="icon-btn" style="background:var(--primary);color:var(--on-primary)" aria-label="Ajouter l'ingrédient">${ICON.plus}</button>
        </div>
      </form>
      <button class="btn small block" data-ed="ing-scan" style="margin-top:8px">${ICON.barcode} Ajouter en scannant un produit</button>
    </div>

    <h3 style="margin:22px 0 0">Étapes <span class="muted small">(${r.steps.length})</span></h3>
    <p class="muted small" style="margin:0">Cochez « À l'avance » pour les étapes à faire pendant la session de batch cooking.</p>
    <div class="ed-block">
      <div id="ed-steps">${r.steps.map((s, k) => `<div class="ed-step" data-s="${k}">
        <div class="handle" data-handle aria-label="Déplacer l'étape">${ICON.grip}<b class="small">${k + 1}</b></div>
        <div><textarea class="input" data-h="text" rows="2" placeholder="Décrivez l'étape…">${esc(s.text)}</textarea>
          <div class="opts">
            <input class="input" style="width:76px" type="number" min="0" inputmode="numeric" data-h="min" value="${s.min || ''}" placeholder="min" aria-label="Durée en minutes">
            <label class="check"><input type="checkbox" data-h="ahead" ${s.ahead ? 'checked' : ''}> À l'avance</label>
            <select class="input" data-h="action" aria-label="Type d'étape">${Object.entries(STEP_ACTIONS).map(([k2, l]) => `<option value="${k2}" ${k2 === s.action ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <button class="icon-btn" data-ed="step-del" data-s="${k}" aria-label="Supprimer l'étape" style="margin-left:auto">${ICON.trash}</button>
          </div></div></div>`).join('')}</div>
      <button class="btn small block soft" data-ed="step-add" style="margin-top:10px">${ICON.plus} Ajouter une étape</button>
    </div>
    <button class="btn primary block" data-ed="save" style="margin-top:20px">Enregistrer la recette</button>`;
  setupStepDrag(el);
}
const isNewRecipe = () => editing && !state.recipes.some((x) => x.id === editing.id);

function onEditorInput(e) {
  const t = e.target;
  if (!editing) return;
  if (t.dataset.f) {
    const f = t.dataset.f;
    if (f === 'tags') editing.tags = t.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    else if (['servings', 'prep_min', 'cook_min'].includes(f)) editing[f] = Math.max(0, parseInt(t.value, 10) || 0);
    else editing[f] = t.value;
  }
  const ingRow = t.closest('[data-i]');
  if (t.dataset.g && ingRow) {
    const ing = editing.ingredients[Number(ingRow.dataset.i)];
    ing[t.dataset.g] = t.value;
    if (t.dataset.g === 'name' && !ing.aisleManual) {
      ing.aisle = guessAisle(t.value);
      const sel = $('[data-g="aisle"]', ingRow);
      if (sel) sel.value = ing.aisle;
    }
    if (t.dataset.g === 'aisle') ing.aisleManual = true;
  }
  const stepRow = t.closest('[data-s]');
  if (t.dataset.h && stepRow) {
    const s = editing.steps[Number(stepRow.dataset.s)];
    if (t.dataset.h === 'text') {
      s.text = t.value;
      if (!s.actionManual) {
        s.action = detectAction(t.value);
        const sel = $('[data-h="action"]', stepRow);
        if (sel) sel.value = s.action;
        if (!s.aheadManual) {
          s.ahead = AHEAD_DEFAULT.has(s.action) && s.action !== 'cuisson';
          const cb = $('[data-h="ahead"]', stepRow);
          if (cb) cb.checked = s.ahead;
        }
      }
    }
    if (t.dataset.h === 'min') s.min = Math.max(0, parseInt(t.value, 10) || 0);
  }
}
function onEditorChange(e, el) {
  const t = e.target;
  if (!editing) return;
  const stepRow = t.closest('[data-s]');
  if (t.dataset.h === 'ahead' && stepRow) { const s = editing.steps[Number(stepRow.dataset.s)]; s.ahead = t.checked; s.aheadManual = true; }
  if (t.dataset.h === 'action' && stepRow) { const s = editing.steps[Number(stepRow.dataset.s)]; s.action = t.value; s.actionManual = true; }
  if (t.dataset.g === 'aisle' || t.dataset.g === 'unit') onEditorInput(e);
  if (t.dataset.ed === 'photo' && t.files?.[0]) uploadPhoto(t.files[0], el);
}
async function onEditorClick(e, el) {
  const b = e.target.closest('[data-ed]');
  if (!b || !editing) return;
  const act = b.dataset.ed;
  if (act === 'photo') return;
  e.preventDefault();
  if (act === 'save') return saveEditor(b);
  if (act === 'import') return importFromUrl();
  if (act === 'photo-del') { editing.photo_url = null; drawEditor(el); }
  if (act === 'ing-del') { editing.ingredients.splice(Number(b.dataset.i), 1); drawEditor(el); }
  if (act === 'ing-nutri') pickIngredientFood(editing.ingredients[Number(b.dataset.i)], () => drawEditor(el));
  if (act === 'step-del') { editing.steps.splice(Number(b.dataset.s), 1); drawEditor(el); }
  if (act === 'step-add') {
    editing.steps.push({ text: '', min: 0, ahead: false, action: 'autre' });
    drawEditor(el);
    const areas = $$('[data-h="text"]', el);
    areas[areas.length - 1]?.focus();
  }
  if (act === 'ing-scan') {
    Scanner.open((code) => showProduct(code, {
      record: true,
      onPick: (p, score) => {
        if (!editing) return;
        const name = p.product_name_fr || p.product_name || code;
        const grams = Number(p.serving_quantity) || null;
        editing.ingredients.push({ name, qty: grams ? String(grams) : '', unit: grams ? 'g' : 'pièce', aisle: guessAisle(name), ean: p.code, score: score ?? undefined, n: offPer100(p), src: 'off' });
        drawEditor(el);
        toast('Ingrédient ajouté : indiquez la quantité');
      },
    }));
  }
}
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.dataset.edForm === 'ing' && editing) {
    e.preventDefault();
    const name = f.ingname.value.trim();
    if (!name) return;
    editing.ingredients.push({ name: name.charAt(0).toUpperCase() + name.slice(1), qty: f.qty.value.trim().replace(',', '.'), unit: f.unit.value, aisle: guessAisle(name) });
    const el = f.closest('.sheet');
    const unit = f.unit.value;
    drawEditor(el);
    const nf = $('[data-ed-form="ing"]', el);
    nf.unit.value = unit;
    nf.qty.focus();
  }
});

function ingNutriLink(i, k) {
  if (!CQ.ready) return '';
  const src = ingSource(i);
  const g = ingGrams(i);
  const what = src ? (src.type === 'off' ? 'Produit scanné' : `${esc(src.label)}${src.auto ? ' <i>(auto)</i>' : ''}`) : '<span class="warn">Aliment non reconnu : choisir</span>';
  return `<button type="button" class="nutri-link" data-ed="ing-nutri" data-i="${k}">${ICON.leaf}<span>${what}${g != null ? ` · ${fmtNum(g)} g` : ''}${src && g != null ? ` · <b>${Math.round((src.n.kcal * g) / 100)} kcal</b>` : ''}</span></button>`;
}

// Recherche d'un aliment Ciqual dans une feuille ; onPick(aliment).
function foodSearchList(el, q, onPick) {
  const box = $('[data-food-results]', el);
  const list = CQ.search(q, 40);
  box.innerHTML = list.map((a) => `<button class="food-row" data-code="${a.code}"><span class="grow"><b>${esc(a.nom)}</b><span class="muted small">${esc(a.groupe)}</span></span><span class="small">${Math.round(a.n.kcal)} kcal<span class="muted"> /100 g</span></span></button>`).join('')
    || '<p class="muted">Aucun aliment trouvé. Essayez un mot plus simple (ex. « riz », « poulet »).</p>';
  box.onclick = (e) => { const b = e.target.closest('[data-code]'); if (b) onPick(CQ.byCode.get(Number(b.dataset.code))); };
}

function pickIngredientFood(ing, done) {
  const massUnit = ing.unit in MASS_UNITS;
  const unitLabel = ing.unit && ing.unit !== 'pièce' ? ing.unit : 'pièce';
  const src = ingSource(ing);
  const el = openSheet(`${sheetHead(ing.name || 'Ingrédient')}
    <p class="muted small" style="margin-top:0">Actuellement : ${src ? (src.type === 'off' ? 'valeurs du produit scanné' : `Ciqual « ${esc(src.label)} »${src.auto ? ' (choisi automatiquement)' : ''}`) : 'aucun aliment reconnu'}.</p>
    ${massUnit ? '' : `<label class="field"><span>Poids d'une ${esc(unitLabel)} (g)</span><input class="input" type="number" min="0.1" step="0.1" inputmode="decimal" data-gpu value="${esc(ing.gpu || defaultUnitGrams(ing.unit || '', ing.name))}"></label>`}
    ${ing.n ? `<button class="btn soft block" style="margin-top:10px" data-x="off">${ICON.barcode} Utiliser les valeurs du produit scanné</button>` : ''}
    <div class="searchbar" style="margin:12px 0 8px">${ICON.search}<input class="input" type="search" data-food-q value="${esc(ing.name)}" placeholder="Rechercher un aliment (Ciqual)"></div>
    <div data-food-results class="food-results"></div>
    ${massUnit ? '' : '<button class="btn primary block" data-x="save" style="margin-top:10px">Enregistrer le poids</button>'}`);
  const saveGpu = () => { const v = parseFloat($('[data-gpu]', el)?.value); if (v > 0) ing.gpu = v; };
  const finish = () => { closeSheet(); done(); };
  foodSearchList(el, ing.name, (a) => { saveGpu(); ing.cq = a.code; ing.src = 'ciqual'; finish(); });
  $('[data-food-q]', el).addEventListener('input', (e) => foodSearchList(el, e.target.value, (a) => { saveGpu(); ing.cq = a.code; ing.src = 'ciqual'; finish(); }));
  $('[data-x="off"]', el)?.addEventListener('click', () => { saveGpu(); ing.src = 'off'; finish(); });
  $('[data-x="save"]', el)?.addEventListener('click', () => { saveGpu(); finish(); });
}

async function saveEditor(btn) {
  const r = editing;
  if (!r.title.trim()) { toast('Donnez un titre à la recette'); $('[data-f="title"]', topSheet())?.focus(); return; }
  btn.disabled = true;
  try {
    const clean = {
      ...r,
      title: r.title.trim(),
      servings: clamp(r.servings || 1, 1, 50),
      ingredients: r.ingredients.filter((i) => i.name.trim()).map(({ aisleManual, ...i }) => ({ ...i, name: i.name.trim() })),
      steps: r.steps.filter((s) => s.text.trim()).map(({ actionManual, aheadManual, ...s }) => ({ ...s, text: s.text.trim() })),
    };
    delete clean.created_at;
    const saved = await Data.saveRecipe(clean);
    editing = null;
    closeSheet();
    render();
    if (!sheets.length) openRecipe(saved.id);
    else { closeSheet(); openRecipe(saved.id); }
    toast('Recette enregistrée');
  } catch (err) {
    btn.disabled = false;
    fail(err, 'Enregistrement impossible');
  }
}

async function uploadPhoto(file, el) {
  toast('Envoi de la photo…');
  try {
    const blob = await resizeImage(file, 1280);
    const path = `${me()}/${uid()}.jpg`;
    const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    editing.photo_url = db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    drawEditor(el);
    toast('Photo ajoutée');
  } catch (err) { fail(err, 'Photo non envoyée'); }
}
function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion impossible'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}

function setupStepDrag(el) {
  const box = $('#ed-steps', el);
  if (!box) return;
  box.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-handle]');
    if (!h) return;
    e.preventDefault();
    const row = h.closest('.ed-step');
    row.classList.add('dragging');
    h.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const rows = $$('.ed-step', box).filter((r) => r !== row);
      const after = rows.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (after) box.insertBefore(row, after); else box.append(row);
    };
    const up = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      const order = $$('.ed-step', box).map((r) => Number(r.dataset.s));
      if (order.some((v, i) => v !== i)) {
        editing.steps = order.map((i) => editing.steps[i]);
        drawEditor(el);
      }
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  });
}

function importFromUrl() {
  const el = openSheet(`${sheetHead('Importer une recette')}
    <p class="muted small" style="margin-top:0">Collez le lien d'une page de recette (Marmiton, 750g, Cuisine AZ, Jow, etc.).</p>
    <form class="stack" data-form="import"><input class="input" name="url" type="url" inputmode="url" placeholder="https://www.marmiton.org/recettes/…" required>
    <button class="btn primary block">Importer</button></form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    btn.disabled = true;
    btn.textContent = 'Import en cours…';
    try {
      const { data, error } = await db.functions.invoke('import-recipe', { body: { url: e.target.url.value.trim() } });
      if (error) {
        let msg = 'Import impossible';
        try { msg = (await error.context.json()).error || msg; } catch { /* réponse non JSON */ }
        throw new Error(msg);
      }
      const r = editing || blankRecipe();
      r.title = data.title || r.title;
      r.photo_url = data.image || r.photo_url;
      r.servings = data.servings || r.servings;
      r.prep_min = data.prep_min || 0;
      r.cook_min = data.cook_min || 0;
      r.source_url = data.source_url;
      r.ingredients = (data.ingredients || []).map(parseIngredientLine);
      r.steps = (data.steps || []).map((text) => { const action = detectAction(text); return { text, min: 0, action, ahead: AHEAD_DEFAULT.has(action) && action !== 'cuisson' }; });
      closeSheet();
      if (editing) { drawEditor(topSheet()); toast('Recette importée : vérifiez les quantités'); }
      else openEditor(r, { fromImport: true });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Importer';
      toast(err.message || 'Import impossible');
    }
  });
}

// --- Mode cuisine ---
async function cookMode(id) {
  const r = recipeById(id);
  if (!r?.steps?.length) { toast('Cette recette n\'a pas d\'étapes'); return; }
  let i = 0;
  let timer = null;
  let remaining = 0;
  let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch { /* non supporté */ }
  const el = document.createElement('div');
  el.className = 'cook';
  document.body.append(el);
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const beep = () => {
    navigator.vibrate?.([300, 150, 300]);
    try {
      const ctx = new AudioContext();
      [0, 0.35, 0.7].forEach((t) => { const o = ctx.createOscillator(); o.frequency.value = 880; o.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2); });
    } catch { /* audio indisponible */ }
  };
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const draw = () => {
    const s = r.steps[i];
    el.innerHTML = `<div class="row"><button class="icon-btn" data-c="close" aria-label="Quitter">${ICON.close}</button><b class="grow">${esc(r.title)}</b><span class="muted">${i + 1}/${r.steps.length}</span></div>
      <div class="progress"><i style="width:${((i + 1) / r.steps.length) * 100}%"></i></div>
      <div class="step-text">${esc(s.text)}</div>
      ${s.min ? `<div class="timer" id="tm">${fmt(remaining || s.min * 60)}</div><button class="btn soft block" data-c="timer" style="margin-bottom:12px">${timer ? 'Arrêter le minuteur' : `Lancer le minuteur (${s.min} min)`}</button>` : ''}
      <div class="nav"><button class="btn" data-c="prev" ${i === 0 ? 'disabled' : ''}>${ICON.back} Précédent</button>
      <button class="btn primary" data-c="next">${i === r.steps.length - 1 ? 'Terminer' : `Suivant ${ICON.next}`}</button></div>`;
  };
  const close = () => { stopTimer(); try { lock?.release(); } catch { /* déjà libéré */ } el.remove(); };
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (!c) return;
    if (c === 'close') return close();
    if (c === 'prev' && i > 0) { stopTimer(); remaining = 0; i--; }
    if (c === 'next') { if (i === r.steps.length - 1) { close(); markCooked(r.id).then(() => render()).catch(() => {}); resteSheet({ recipeId: r.id, ask: true }); return; } stopTimer(); remaining = 0; i++; }
    if (c === 'timer') {
      if (timer) { stopTimer(); remaining = 0; }
      else {
        remaining = r.steps[i].min * 60;
        timer = setInterval(() => {
          remaining--;
          const tm = $('#tm', el);
          if (tm) tm.textContent = fmt(Math.max(0, remaining));
          if (remaining <= 0) { stopTimer(); beep(); toast('Minuteur terminé'); draw(); }
        }, 1000);
      }
    }
    draw();
  });
  draw();
}

// --- Recettes d'exemple ---
async function seedRecipes() {
  const mk = (title, tags, servings, prep, cook, ings, steps) => ({
    ...blankRecipe(), title, tags, servings, prep_min: prep, cook_min: cook,
    ingredients: ings.map(parseIngredientLine),
    steps: steps.map(([text, min]) => { const action = detectAction(text); return { text, min, action, ahead: AHEAD_DEFAULT.has(action) && action !== 'cuisson' }; }),
  });
  const samples = [
    mk('Curry de pois chiches et épinards', ['végétarien', 'batch'], 4, 15, 25,
      ['2 oignons', '2 gousses d\'ail', '1 c. à s. de curry', '400 g de pois chiches', '400 ml de lait de coco', '200 g d\'épinards', '250 g de riz basmati'],
      [['Éplucher et émincer les oignons et l\'ail.', 10], ['Cuire le riz basmati dans l\'eau bouillante salée.', 12], ['Faire revenir les oignons et l\'ail avec le curry.', 5], ['Ajouter les pois chiches et le lait de coco, mijoter 15 min.', 15], ['Incorporer les épinards juste avant de servir.', 2]]),
    mk('Poulet rôti aux légumes', ['viande', 'four'], 4, 20, 50,
      ['800 g de cuisses de poulet', '4 carottes', '2 courgettes', '2 oignons', '2 c. à s. d\'huile d\'olive', '1 c. à c. de thym'],
      [['Éplucher et couper les carottes, les courgettes et les oignons en morceaux.', 15], ['Préparer une marinade avec l\'huile d\'olive et le thym.', 3], ['Enfourner le poulet et les légumes 50 min à 200 °C.', 50], ['Servir chaud.', 0]]),
    mk('Salade de quinoa, feta et tomates', ['végétarien', 'rapide'], 2, 15, 12,
      ['150 g de quinoa', '200 g de tomates cerises', '1 concombre', '100 g de feta', '2 c. à s. d\'huile d\'olive', '1 citron'],
      [['Cuire le quinoa dans l\'eau bouillante 12 min, puis égoutter.', 12], ['Couper les tomates, le concombre et la feta en dés.', 8], ['Préparer la vinaigrette citron-huile d\'olive.', 3], ['Mélanger le tout au moment de servir.', 2]]),
  ];
  try {
    for (const s of samples) await Data.saveRecipe(s);
    render();
    toast('3 recettes ajoutées');
  } catch (err) { fail(err); }
}

