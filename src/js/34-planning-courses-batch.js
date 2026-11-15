// ---------------------------------------------------------------------------
// Onglet Planning
// ---------------------------------------------------------------------------
function weekNav({ menu = false } = {}) {
  const end = addDays(state.week, 6);
  return `<div class="week-nav"><button class="icon-btn" data-act="week" data-d="-1" aria-label="Semaine précédente">${ICON.back}</button>
      <strong>${fmtDay(state.week)} – ${fmtDay(end)}</strong>
      <button class="icon-btn" data-act="week" data-d="1" aria-label="Semaine suivante">${ICON.next}</button>
      ${menu ? `<button class="icon-btn" data-act="week-menu" aria-label="Actions de la semaine">${ICON.dots}</button>` : ''}</div>`;
}
const renderPlanning = () => weekNav({ menu: true }) + renderWeek();
const renderCourses = () => weekNav() + renderShopping();
// Texte « x/y articles cochés », recalculé après chaque coche sans redessiner la liste.
function checkedCountText() { const all = [...buildShopping().byAisle.values()].flat(); return `${all.filter(isChecked).length}/${all.length} articles cochés`; }
const renderBatchTab = () => weekNav() + renderBatch();

function renderWeek() {
  const today = isoDate(new Date());
  const mv = state.moving;
  const days = DAYS.map((d, i) => {
    const date = addDays(state.week, i);
    const slots = ['midi', 'soir'].map((slot) => {
      const m = state.plan.find((x) => x.day === i && x.slot === slot);
      const r = m && recipeById(m.recipe_id);
      const isMoving = mv && mv.day === i && mv.slot === slot;
      const cls = `slot ${isMoving ? 'moving' : mv ? 'target' : ''}`;
      if (!r) return `<button class="${cls}" data-act="slot" data-d="${i}" data-s="${slot}"><span class="when">${slot}</span><span class="add">${ICON.plus} Ajouter un repas</span></button>`;
      const img = safeUrl(r.photo_url);
      const cf = mealConflicts(m, r);
      return `<button class="${cls}" data-act="slot" data-d="${i}" data-s="${slot}"><span class="when">${slot}</span>
        ${img ? `<img class="sthumb" src="${esc(img)}" alt="" loading="lazy">` : `<span class="sthumb">${ICON.chef}</span>`}
        <span class="grow"><span class="prod-name" style="font-size:15px">${esc(r.title)}</span><span class="meta">${ICON.users} ${esc(mealWho(m))}${m.reste_id ? '<span class="tag ahead">Reste</span>' : ''}${cf.length ? `<span class="tag warn-tag" title="${esc(conflictText(cf))}">⚠ ${esc(cf.map((c) => c.member.nom).join(', '))}</span>` : ''}</span></span></button>`;
    }).join('');
    return `<div class="day ${isoDate(date) === today ? 'today' : ''}"><h3><span>${d}</span><span class="muted small">${fmtDay(date)}</span></h3>${slots}</div>`;
  }).join('');
  const filled = state.plan.length;
  return `${mv ? `<div class="move-banner">${ICON.move}<span class="grow">Touchez la case de destination</span><button class="btn small" data-act="cancel-move">Annuler</button></div>` : ''}
    <p class="muted small" style="margin:0 0 10px">${filled}/14 repas planifiés${state.recipes.length ? '' : ' · créez d\'abord des recettes dans l\'onglet Recettes'}</p>
    <div class="day-grid">${days}</div>`;
}

function recipePicker(onPick, { title = 'Choisir une recette', eaters = [] } = {}) {
  if (!state.recipes.length) {
    toast('Ajoutez d\'abord des recettes');
    switchTab('recettes');
    return;
  }
  const el = openSheet(`${sheetHead(title)}
    <div class="searchbar" style="margin-bottom:10px">${ICON.search}<input class="input" type="search" placeholder="Rechercher…" data-pick-q aria-label="Rechercher"></div>
    <div id="pick-list"></div>`);
  const draw = (q = '') => {
    const nq = norm(q);
    const list = state.recipes.filter((r) => !nq || norm(r.title + ' ' + (r.tags || []).join(' ')).includes(nq))
      .map((r) => ({ r, cf: conflictsFor(eaters, r) }))
      .sort((a, b) => (a.r.avis === 'jamais') - (b.r.avis === 'jamais') || (a.cf.length > 0) - (b.cf.length > 0));
    $('#pick-list', el).innerHTML = list.map(({ r, cf }) => {
      const img = safeUrl(r.photo_url);
      return `<button class="prod-row" data-pick="${r.id}" style="${r.avis === 'jamais' ? 'opacity:.55' : ''}">${img ? `<img class="thumb" src="${esc(img)}" alt="" style="object-fit:cover">` : `<div class="thumb ph">${ICON.chef}</div>`}
        <div class="grow"><div class="prod-name">${esc(r.title)}</div><div class="meta">${totalMin(r) ? `<span>${ICON.clock} ${totalMin(r)} min</span>` : ''}${r.favorite ? `<span class="fav">${ICON.heartFill}</span>` : ''}${avisBadge(r)}${r.derniere_cuisson ? `<span>cuisinée le ${fmtDay(isoToDate(r.derniere_cuisson))}</span>` : ''}</div>
        ${cf.length ? `<div class="warn small">⚠ ${esc(conflictText(cf))}</div>` : ''}</div></button>`;
    }).join('') || '<p class="muted">Aucune recette.</p>';
  };
  draw();
  $('[data-pick-q]', el).addEventListener('input', (e) => draw(e.target.value));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    closeSheet();
    onPick(b.dataset.pick);
  });
}

async function onSlot(day, slot) {
  const m = state.plan.find((x) => x.day === day && x.slot === slot);
  if (state.moving) {
    const src = state.moving;
    state.moving = null;
    if (src.day === day && src.slot === slot) return render();
    const a = state.plan.find((x) => x.day === src.day && x.slot === src.slot);
    try {
      const ids = [a?.id, m?.id].filter(Boolean);
      const aData = a && { ...a };
      const bData = m && { ...m };
      await Data.removeMeals(ids, { keepRestes: true });
      if (aData) await Data.setMeal(day, slot, aData.recipe_id, aData.servings, aData);
      if (bData) await Data.setMeal(src.day, src.slot, bData.recipe_id, bData.servings, bData);
      toast(m ? 'Repas échangés' : 'Repas déplacé');
    } catch (err) { fail(err); }
    return render();
  }
  if (!m) {
    const date = addDays(state.week, day);
    const pick = () => recipePicker(async (rid) => {
      try { await Data.setMeal(day, slot, rid, state.settings.default_servings); render(); } catch (err) { fail(err); }
    }, { title: `${DAYS[day]} ${slot}`, eaters: state.members });
    const dispo = restesFor(date);
    if (!dispo.length) return pick();
    // Des restes existent : on les propose avant le choix d'une recette.
    const el = openSheet(`${sheetHead(`${DAYS[day]} ${slot}`)}<h3 style="margin:0 0 6px">Utiliser un reste</h3>
      ${dispo.map((x) => { const r = recipeById(x.recipe_id); return r ? `<button class="prod-row" data-reste="${x.id}"><div class="thumb ph">${ICON.flame}</div><div class="grow"><div class="prod-name">${esc(r.title)}</div><div class="muted small">${esc(resteLabel(x))}</div></div></button>` : ''; }).join('')}
      <button class="btn primary block" style="margin-top:12px" data-x="pick">${ICON.chef} Choisir une recette</button>`);
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-x="pick"]')) { closeSheet(); return pick(); }
      const b = e.target.closest('[data-reste]');
      if (!b) return;
      const x = state.restes.find((y) => y.id === b.dataset.reste);
      closeSheet();
      try {
        await Data.setMeal(day, slot, x.recipe_id, state.settings.default_servings, { reste_id: x.id });
        const meal = state.plan.find((y) => y.day === day && y.slot === slot);
        await Data.updateReste(x.id, { portions: Math.max(0, Math.round((Number(x.portions) - mealServings(meal)) * 100) / 100) });
        render();
        toast('Reste placé dans le planning');
      } catch (err) { fail(err); }
    });
    return;
  }
  const r = recipeById(m.recipe_id);
  const hasMembers = state.members.length > 0;
  const eatersHtml = () => {
    const ids = mealEaters(m).map((x) => x.id);
    return `<div class="ntable"><div class="nt-title">Qui mange ? <span class="muted small">· ${fmtPortions(mealServings(m))}</span></div>
      ${state.members.map((x) => { const hits = r ? memberConflicts(x, r) : []; return `<label class="check" style="display:flex;padding:4px 0"><input type="checkbox" data-eater="${x.id}" ${ids.includes(x.id) ? 'checked' : ''}>
        <span class="grow">${esc(x.nom)}${hits.length ? ` <span class="warn small">⚠ évite ${esc(hits.join(', '))}</span>` : ''}</span><span class="muted small">${fmtPortions(memberFactor(x))}</span></label>`; }).join('')}
      <div class="row" style="margin-top:6px"><span class="grow small"><b>Invités</b> <span class="muted">(1 portion chacun)</span></span>
        <div class="stepper"><button data-g="-1" aria-label="Moins">−</button><span>${m.guests || 0}</span><button data-g="1" aria-label="Plus">+</button></div></div></div>`;
  };
  const el = openSheet(`${sheetHead(`${DAYS[day]} ${slot}`)}
    <div class="row" style="margin-bottom:10px"><b class="grow">${esc(r?.title || 'Recette supprimée')}</b>
      ${hasMembers ? '' : `<div class="stepper"><button data-p="-1" aria-label="Moins">−</button><span id="srv">${m.servings} pers.</span><button data-p="1" aria-label="Plus">+</button></div>`}</div>
    ${hasMembers ? `<div id="eaters">${eatersHtml()}</div>` : ''}
    ${m.reste_id ? '<p class="small"><span class="tag ahead">Reste</span> <span class="muted">Ce repas utilise des portions déjà cuisinées : rien à acheter ni à préparer.</span></p>' : ''}
    <div class="menu-list">
      <button data-m="view">${ICON.chef} Voir la recette</button>
      ${m.reste_id ? '' : `<button data-m="reste">${ICON.flame} Il en reste ? Mettre des portions de côté</button>`}
      <button data-m="change">${ICON.swap} Changer de recette</button>
      <button data-m="move">${ICON.move} Déplacer / échanger</button>
      <button data-m="del" style="color:var(--danger)">${ICON.trash} Retirer du planning</button></div>`);
  const saveEaters = async (patch) => {
    try {
      await Data.updateMeal(m.id, patch);
      Object.assign(m, state.plan.find((x) => x.id === m.id));
      $('#eaters', el).innerHTML = eatersHtml();
      render();
    } catch (err) { fail(err); }
  };
  el.addEventListener('change', (e) => {
    if (!e.target.dataset.eater) return;
    const ids = $$('[data-eater]', el).filter((c) => c.checked).map((c) => c.dataset.eater);
    saveEaters({ eaters: ids.length === state.members.length ? null : ids });
  });
  el.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-p]');
    if (p) {
      const n = clamp(m.servings + Number(p.dataset.p), 1, 50);
      try { await Data.updateMeal(m.id, { servings: n }); m.servings = n; $('#srv', el).textContent = `${n} pers.`; render(); } catch (err) { fail(err); }
      return;
    }
    const g = e.target.closest('[data-g]');
    if (g) return saveEaters({ guests: clamp((m.guests || 0) + Number(g.dataset.g), 0, 30) });
    const act = e.target.closest('[data-m]')?.dataset.m;
    if (!act) return;
    closeSheet();
    if (act === 'view' && r) openRecipe(r.id, Math.round(mealServings(m) * 10) / 10);
    if (act === 'reste' && r) { markCooked(r.id, isoDate(addDays(state.week, day))).then(() => render()).catch(() => {}); resteSheet({ recipeId: r.id, faitLe: isoDate(addDays(state.week, day)), mealId: m.id }); }
    if (act === 'change') recipePicker(async (rid) => {
      try {
        if (m.reste_id) { const x = state.restes.find((y) => y.id === m.reste_id); if (x) await Data.updateReste(x.id, { portions: Math.round((Number(x.portions) + mealServings(m)) * 100) / 100 }).catch(() => {}); }
        await Data.setMeal(day, slot, rid, m.servings, { ...m, reste_id: null }); render();
      } catch (err) { fail(err); }
    }, { eaters: mealEaters(m) });
    if (act === 'move') { state.moving = { day, slot }; render(); }
    if (act === 'del') { try { await Data.removeMeals([m.id]); render(); } catch (err) { fail(err); } }
  });
}

function weekMenu() {
  const el = openSheet(`${sheetHead('Actions de la semaine')}<div class="menu-list">
    <button data-m="dup">${ICON.copy} Copier la semaine précédente</button>
    <button data-m="random">${ICON.shuffle} Remplir les cases vides au hasard</button>
    <button data-m="today">${ICON.clock} Revenir à cette semaine</button>
    <button data-m="clear" style="color:var(--danger)">${ICON.trash} Vider la semaine</button></div>`);
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-m]')?.dataset.m;
    if (!act) return;
    closeSheet();
    try {
      if (act === 'today') { state.week = mondayOf(new Date()); state.day = new Date(); await Data.loadWeek(); }
      if (act === 'dup') {
        const { data, error } = await db.from(T.plan).select('*').eq('foyer_id', foyer()).eq('week', isoDate(addDays(state.week, -7)));
        if (error) throw error;
        if (!data.length) { toast('La semaine précédente est vide'); return; }
        for (const m of data) if (!state.plan.some((x) => x.day === m.day && x.slot === m.slot)) await Data.setMeal(m.day, m.slot, m.recipe_id, m.servings, m);
        toast('Semaine précédente copiée dans les cases vides');
      }
      if (act === 'random') {
        if (!state.recipes.length) { toast('Ajoutez d\'abord des recettes'); return; }
        const used = new Map();
        state.plan.forEach((m) => used.set(m.recipe_id, (used.get(m.recipe_id) || 0) + 1));
        let n = 0;
        for (let d = 0; d < 7; d++) for (const slot of ['midi', 'soir']) {
          if (state.plan.some((x) => x.day === d && x.slot === slot)) continue;
          const ok = state.recipes.filter((r) => r.avis !== 'jamais' && !conflictsFor(state.members, r).length);
          const pool = [...(ok.length ? ok : state.recipes)].sort((a, b) => (used.get(a.id) || 0) - (used.get(b.id) || 0) || (a.derniere_cuisson || '').localeCompare(b.derniere_cuisson || '') || Math.random() - 0.5);
          const r = pool[0];
          used.set(r.id, (used.get(r.id) || 0) + 1);
          await Data.setMeal(d, slot, r.id, state.settings.default_servings);
          n++;
        }
        toast(n ? `${n} repas ajoutés` : 'La semaine est déjà complète');
      }
      if (act === 'clear') {
        if (!state.plan.length) return;
        if (!(await confirmSheet('Vider tous les repas de cette semaine ?', 'Vider'))) return;
        await Data.removeMeals(state.plan.map((m) => m.id));
      }
      render();
    } catch (err) { fail(err); }
  });
}

// --- Batch cooking ---
const BATCH_PHASES = [
  { key: 'prep', title: 'Mise en place : épluchage & découpe', tip: 'Préchauffez le four dès maintenant si une cuisson au four est prévue.' },
  { key: 'four', title: 'Lancer les cuissons au four', tip: 'Enfournez tout ce qui peut cuire ensemble, puis enchaînez sur les étapes suivantes pendant la cuisson.' },
  { key: 'feculent', title: 'Féculents & céréales', tip: 'Cuisez-les en grande quantité dans une seule casserole quand c\'est possible.' },
  { key: 'cuisson', title: 'Cuissons à la poêle / casserole', tip: '' },
  { key: 'sauce', title: 'Sauces, marinades & assaisonnements', tip: 'Gardez les sauces à part pour que les plats restent croquants.' },
  { key: 'autre', title: 'Autres préparations', tip: '' },
];
function computeBatch() {
  const meals = [...state.plan].sort((a, b) => a.day - b.day || (a.slot === 'midi' ? -1 : 1));
  const byRecipe = new Map();
  for (const m of meals) {
    const r = recipeById(m.recipe_id);
    if (!r || m.reste_id) continue;
    const e = byRecipe.get(r.id) || { r, servings: 0, meals: [] };
    e.servings += mealServings(m);
    e.meals.push(m);
    byRecipe.set(r.id, e);
  }
  const phases = Object.fromEntries(BATCH_PHASES.map((p) => [p.key, []]));
  const sameDay = [];
  const mergedIng = new Map();
  for (const { r, servings } of byRecipe.values()) {
    const steps = (r.steps || []).filter((s) => s.ahead);
    if (!steps.length) { sameDay.push(r.title); continue; }
    const f = servings / (r.servings || 1);
    for (const s of steps) {
      phases[s.action in phases ? s.action : 'autre'].push({ recipe: r.title, text: s.text, min: Number(s.min) || 0, servings });
      if (s.action === 'prep') {
        const t = ` ${ingKey(s.text)} `;
        for (const ing of r.ingredients || []) {
          const k = ingKey(ing.name);
          const first = k.split(' ')[0];
          if (!first || !(t.includes(` ${k}`) || t.includes(` ${first}`))) continue;
          const { base, mult } = unitBase(ing.unit);
          const key = `${k}|${base}`;
          const cur = mergedIng.get(key) || { name: ing.name, base, qty: 0, recipes: new Set(), noQty: false };
          const q = parseFloat(String(ing.qty).replace(',', '.'));
          if (isFinite(q)) cur.qty += q * mult * f; else cur.noQty = true;
          cur.recipes.add(r.title);
          mergedIng.set(key, cur);
        }
      }
    }
  }
  const sum = (k) => phases[k].reduce((a, s) => a + (s.min || 5), 0);
  const ovenMax = Math.max(0, ...phases.four.map((s) => s.min || 30));
  const parallel = sum('feculent') + sum('cuisson') + sum('sauce') + sum('autre');
  const stepsCount = Object.values(phases).reduce((a, l) => a + l.length, 0);
  const total = stepsCount ? sum('prep') + Math.max(ovenMax, parallel) + 15 : 0;
  return { meals, byRecipe, phases, sameDay, mergedIng: [...mergedIng.values()], total, stepsCount };
}
function restesCard() {
  const list = state.restes.filter((x) => Number(x.portions) > 0);
  if (!list.length) return '';
  const today = isoDate(new Date());
  const planned = state.plan.filter((m) => m.reste_id).map((m) => ({ m, x: state.restes.find((y) => y.id === m.reste_id) })).filter((o) => o.x?.stockage === 'congel');
  return `<div class="phase" style="margin-bottom:12px"><h3>${ICON.flame} Restes à consommer</h3>
    <ul>${list.map((x) => { const r = recipeById(x.recipe_id); const late = x.stockage === 'frigo' && x.dlc < today; return r ? `<li class="row"><span class="grow"><b>${esc(r.title)}</b> <span class="muted small">${esc(resteLabel(x))}</span>${late ? ' <span class="warn small">dépassé</span>' : ''}</span><button class="icon-btn" data-act="reste-del" data-id="${x.id}" aria-label="Retirer">${ICON.trash}</button></li>` : ''; }).join('')}</ul>
    ${planned.length ? `<p class="muted small" style="margin:6px 0 0">À sortir du congélateur la veille : ${esc(planned.map(({ m }) => `${DAYS[m.day]} ${m.slot}`).join(', '))}.</p>` : ''}
    <p class="muted small" style="margin:6px 0 0">Dans le planning, une case vide propose d'abord ces restes.</p></div>`;
}
function renderBatch() {
  const restes = restesCard();
  if (!state.plan.filter((m) => !m.reste_id).length) return restes + (restes ? '' : `<div class="empty">${ICON.flame}<p>Planifiez des repas pour générer votre session de batch cooking.</p><button class="btn primary" data-act="tab" data-tab="planning">Remplir la semaine</button></div>`);
  const b = computeBatch();
  if (!b.stepsCount) return `<div class="empty">${ICON.flame}<p>Aucune étape n'est marquée « À l'avance » dans les recettes de la semaine.</p><p class="small">Modifiez vos recettes et cochez « À l'avance » sur les étapes à préparer pendant la session.</p></div>`;
  let n = 0;
  const h = Math.floor(b.total / 60);
  const phasesHtml = BATCH_PHASES.filter((p) => b.phases[p.key].length).map((p) => {
    n++;
    const merged = p.key === 'prep' && b.mergedIng.length
      ? `<div class="ed-block small" style="margin-top:8px"><b>À préparer en une seule fois :</b><ul style="margin-top:4px">${b.mergedIng.map((m) => `<li>${esc(m.name)}${m.qty ? ` : ${esc(fmtQtyBase(m.qty, m.base))}` : ''} <span class="muted">(${esc([...m.recipes].join(', '))})</span></li>`).join('')}</ul></div>`
      : '';
    return `<div class="phase"><h3><span class="num">${n}</span>${esc(p.title)}</h3>${p.tip ? `<p class="muted small" style="margin:0">${esc(p.tip)}</p>` : ''}${merged}
      <ul>${b.phases[p.key].map((s) => `<li><span class="rec">${esc(s.recipe)}</span>${esc(s.text)}${s.min ? ` <span class="muted small">· ${s.min} min</span>` : ''}</li>`).join('')}</ul></div>`;
  }).join('');
  const storage = b.meals.map((m) => {
    const r = recipeById(m.recipe_id);
    if (!r || !(r.steps || []).some((s) => s.ahead)) return '';
    const freeze = m.day >= 3;
    return `<li><b>${DAYS[m.day]} ${m.slot}</b> — ${esc(r.title)} (${esc(mealWho(m))}) : ${freeze ? 'au <b>congélateur</b>, à sortir la veille au réfrigérateur' : 'au <b>réfrigérateur</b>, en boîte hermétique (3 jours max)'}</li>`;
  }).join('');
  return `${restes}
    <div class="summary-box"><div><strong>${h ? `${h} h ${String(b.total % 60).padStart(2, '0')}` : `${b.total} min`}</strong><span>durée estimée</span></div>
      <div><strong>${b.byRecipe.size}</strong><span>recettes</span></div><div><strong>${b.meals.length}</strong><span>repas couverts</span></div></div>
    <p class="muted small" style="margin:0 0 12px">Session à faire le dimanche (ou la veille du premier repas). Les étapes de toutes les recettes sont regroupées par type pour enchaîner sans temps mort.</p>
    ${phasesHtml}
    <div class="phase"><h3><span class="num">${n + 1}</span>Refroidir, portionner, stocker</h3>
      <p class="muted small" style="margin:0">Laissez refroidir moins de 2 h avant de fermer les boîtes. Étiquetez chaque boîte avec le jour et le repas.</p>
      <ul>${storage}</ul></div>
    ${b.sameDay.length ? `<div class="phase"><h3>À cuisiner le jour même</h3><ul>${b.sameDay.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}`;
}

// --- Liste de courses ---
function unitBase(u) {
  switch (u) {
    case 'kg': return { base: 'g', mult: 1000 };
    case 'g': return { base: 'g', mult: 1 };
    case 'l': return { base: 'ml', mult: 1000 };
    case 'cl': return { base: 'ml', mult: 10 };
    case 'ml': return { base: 'ml', mult: 1 };
    default: return { base: u || '', mult: 1 };
  }
}
const COUNTABLE = new Set(['pièce', 'gousse', 'tranche', 'botte', 'sachet', 'boîte', 'pot', '']);
function fmtQtyBase(q, base) {
  if (base === 'g' && q >= 1000) return `${fmtNum(q / 1000)} kg`;
  if (base === 'ml' && q >= 1000) return `${fmtNum(q / 1000)} l`;
  if (COUNTABLE.has(base)) return `${Math.ceil(q - 0.01)}${base && base !== 'pièce' ? ` ${base}${Math.ceil(q - 0.01) > 1 && !base.endsWith('s') ? 's' : ''}` : ''}`;
  return `${fmtNum(q)} ${base}`;
}
function buildShopping() {
  const items = new Map();
  for (const m of state.plan) {
    const r = recipeById(m.recipe_id);
    if (!r || m.reste_id) continue;
    const f = mealServings(m) / (r.servings || 1);
    for (const ing of r.ingredients || []) {
      const { base, mult } = unitBase(ing.unit);
      const k = ingKey(ing.name);
      const key = `${k}|${base}`;
      const it = items.get(key) || { key, ingKey: k, name: ing.name, base, qty: 0, noQty: false, aisle: ing.aisle || guessAisle(ing.name), recipes: new Set(), ean: ing.ean || null };
      const q = parseFloat(String(ing.qty).replace(',', '.'));
      if (isFinite(q) && q > 0) it.qty += q * mult * f; else it.noQty = true;
      it.recipes.add(r.title);
      items.set(key, it);
    }
  }
  for (const e of state.extras) {
    items.set(`extra:${e.id}`, { key: `extra:${e.id}`, extraId: e.id, ingKey: ingKey(e.name), name: e.name, qtyText: e.qty || '', aisle: e.aisle, recipes: new Set(), checked: e.checked });
  }
  // Placards : les basiques sont exclus, les stocks « j'en ai » mis de côté pour la semaine.
  const skippedBasics = [];
  const inStock = [];
  for (const it of [...items.values()]) {
    if (it.extraId) continue;
    const pl = inPlacard(it.ingKey);
    if (!pl) continue;
    items.delete(it.key);
    (pl.type === 'basique' ? skippedBasics : inStock).push({ ...it, placard: pl });
  }
  const byAisle = new Map(AISLES.map((a) => [a, []]));
  for (const it of items.values()) (byAisle.get(it.aisle) || byAisle.get('Autres')).push(it);
  for (const l of byAisle.values()) l.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return { byAisle, count: items.size, skippedBasics, inStock };
}
const qtyLabel = (it) => (it.extraId ? it.qtyText : it.qty ? fmtQtyBase(it.qty, it.base) : '');
const isChecked = (it) => (it.extraId ? !!it.checked : !!state.checks[it.key]);
const cuSearch = (name) => `https://www.coursesu.com/recherche?q=${encodeURIComponent(name)}`;
const cuStore = () => `https://www.coursesu.com/drive-${encodeURIComponent(state.settings.store_slug)}`;

function renderShopping() {
  const addForm = `<form class="card extra-form" style="padding:12px;margin-bottom:12px" data-form="extra">
      <input class="input" name="xname" placeholder="Ajouter un article (lessive, café…)" aria-label="Article à ajouter" required autocomplete="off">
      <input class="input" name="xqty" placeholder="Qté" aria-label="Quantité">
      <button class="icon-btn" style="background:var(--primary);color:var(--on-primary)" aria-label="Ajouter l'article">${ICON.plus}</button>
      <select class="input" name="xaisle" aria-label="Rayon"><option value="">Rayon : automatique</option>${AISLES.map((a) => `<option>${a}</option>`).join('')}</select>
    </form>`;
  if (!state.plan.length && !state.extras.length) return `${addForm}<div class="empty">${ICON.cart}<p>La liste se remplit automatiquement avec les ingrédients des repas planifiés. Vous pouvez aussi ajouter vos propres articles ci-dessus.</p><button class="btn primary" data-act="tab" data-tab="planning">Remplir la semaine</button></div>`;
  const { byAisle, count, skippedBasics, inStock } = buildShopping();
  const all = [...byAisle.values()].flat();
  const done = all.filter(isChecked).length;
  Prices.warm(all);
  let total = 0;
  let priced = 0;
  for (const it of all) { const pr = Prices.of(it); if (pr) { total += pr.price; priced++; } }
  const budgetHtml = `<div class="card" style="padding:12px;margin-bottom:12px"><div class="row"><div class="grow"><div class="muted small">Budget estimé de la semaine</div><b style="font-size:22px">${priced ? fmtEur(total) : '—'}</b></div>
      <div class="muted small" style="text-align:right">${priced}/${count} article${count > 1 ? 's' : ''} chiffré${priced > 1 ? 's' : ''}${count - priced ? `<br>${count - priced} sans prix` : ''}</div></div>
      <p class="muted small" style="margin:6px 0 0">Prix mémorisés via ${ICON.link.replace('<svg', '<svg width="12" height="12" style="vertical-align:-2px"')}, sinon prix moyens relevés par la communauté Open Prices pour les produits à code-barres.</p></div>`;
  const stockHtml = inStock.length ? `<details class="ndetails"><summary>Déjà en stock cette semaine (${inStock.length})</summary>
      ${inStock.map((it) => `<div class="shop-item done"><span></span><div><div class="nm">${qtyLabel(it) ? `${esc(qtyLabel(it))} · ` : ''}${esc(it.name)}</div><div class="for">${esc([...it.recipes].join(', '))}</div></div>
        <div class="acts"><button data-act="unstock" data-id="${it.placard.id}">Remettre dans la liste</button></div></div>`).join('')}</details>` : '';
  const basicsHtml = `<p class="muted small" style="margin:14px 0 0">Basiques non listés${skippedBasics.length ? ` (${esc(skippedBasics.map((x) => x.name).join(', '))})` : ''} · <button class="btn small" data-act="basiques" style="border:0;padding:0 4px;min-height:0;color:var(--primary-strong)">modifier les basiques</button></p>`;
  return `${addForm}${budgetHtml}
    <div class="card" style="padding:12px;margin-bottom:12px">
      <div class="row"><span style="color:#e30613">${ICON.store}</span><div class="grow"><b>${esc(state.settings.store_name)}</b><div class="muted small">Courses U · <span data-checked-count>${checkedCountText()}</span></div></div></div>
      <a class="btn soft block" style="margin-top:10px" href="${esc(cuStore())}" target="_blank" rel="noopener">${ICON.ext} 1. Ouvrir mon magasin sur Courses U</a>
      <p class="muted small" style="margin:8px 0 0">Puis, pour chaque article : <b>U</b> ouvre le produit mémorisé, la loupe lance une recherche, et ${ICON.link.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} mémorise le produit choisi pour les prochaines fois.</p>
      <div class="grid2" style="margin-top:10px"><button class="btn" data-act="copy-list">${ICON.copy} Copier</button><button class="btn" data-act="share-list">${ICON.share} Partager</button></div>
    </div>
    ${[...byAisle.entries()].filter(([, l]) => l.length).map(([aisle, list]) => { const sub = list.reduce((t, it) => t + (Prices.of(it)?.price || 0), 0); return `<div class="aisle"><h3>${esc(aisle)}${sub ? ` <span class="muted" style="float:right;text-transform:none;letter-spacing:0">${fmtEur(sub)}</span>` : ''}</h3>
      ${list.map((it) => {
        const link = state.links[it.ingKey];
        const checked = isChecked(it);
        const pr = Prices.of(it);
        const origin = it.extraId ? '<span class="badge-extra">Ajouté</span>' : esc([...it.recipes].join(', '));
        return `<div class="shop-item ${checked ? 'done' : ''}"><input type="checkbox" ${checked ? 'checked' : ''} data-check="${esc(it.key)}" aria-label="${esc(it.name)}">
          <div><div class="nm">${qtyLabel(it) ? `${esc(qtyLabel(it))} · ` : ''}${esc(it.name)}${pr ? ` <span class="price" title="${PRICE_SRC[pr.source] || ''}">${fmtEur(pr.price)}</span>` : ''}</div><div class="for">${link ? `${esc(link.label || 'Produit mémorisé')} · ` : ''}${origin}</div></div>
          <div class="acts">${link ? `<a class="linked" href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener" aria-label="Ouvrir le produit Courses U">U</a>` : ''}
            <a href="${esc(cuSearch(it.name))}" target="_blank" rel="noopener" aria-label="Rechercher sur Courses U">${ICON.search}</a>
            <button data-act="link-item" data-k="${esc(it.ingKey)}" data-n="${esc(it.name)}" aria-label="Mémoriser un produit">${ICON.link}</button>
            ${it.extraId ? `<button data-act="del-extra" data-id="${esc(it.extraId)}" aria-label="Retirer l'article">${ICON.trash}</button>` : `<button data-act="have-item" data-k="${esc(it.ingKey)}" data-n="${esc(it.name)}" title="J'en ai déjà">${ICON.check} J'en ai</button>`}</div></div>`;
      }).join('')}</div>`; }).join('')}${stockHtml}${basicsHtml}`;
}
function shoppingText() {
  const { byAisle } = buildShopping();
  const lines = [`Liste de courses – semaine du ${fmtDay(state.week)}`, `Magasin : ${state.settings.store_name}`, ''];
  for (const [aisle, list] of byAisle) {
    const todo = list.filter((it) => !isChecked(it));
    if (!todo.length) continue;
    lines.push(aisle.toUpperCase());
    for (const it of todo) {
      const link = state.links[it.ingKey];
      const pr = Prices.of(it);
      lines.push(`- ${qtyLabel(it) ? `${qtyLabel(it)} ` : ''}${it.name}${pr ? ` (${fmtEur(pr.price)})` : ''}${link ? ` → ${link.url}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
function linkItem(k, name) {
  const cur = state.links[k];
  const el = openSheet(`${sheetHead(`Produit pour « ${name} »`)}
    <ol class="muted small" style="margin-top:0;padding-left:18px"><li>Ouvrez la recherche Courses U et choisissez le produit.</li><li>Copiez l'adresse de sa page (elle contient <code>/p/</code>).</li><li>Collez-la ci-dessous : elle sera réutilisée à chaque liste.</li></ol>
    <a class="btn soft block" href="${esc(cuSearch(name))}" target="_blank" rel="noopener">${ICON.search} Rechercher « ${esc(name)} » sur Courses U</a>
    <form class="stack" style="margin-top:12px" data-form="link">
      <label class="field"><span>Lien du produit Courses U</span><input class="input" name="url" type="url" inputmode="url" required placeholder="https://www.coursesu.com/p/…" value="${esc(cur?.url || '')}"></label>
      <label class="field"><span>Nom du produit (facultatif)</span><input class="input" name="label" placeholder="Ex. Oignons jaunes U 1 kg" value="${esc(cur?.label || '')}"></label>
      <div class="grid2"><label class="field"><span>Prix (€, facultatif)</span><input class="input" name="prix" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(cur?.prix ?? '')}" placeholder="${cur?.prix_source === 'openprices' ? 'auto' : 'ex. 1,89'}"></label>
        <label class="field"><span>Code-barres (facultatif)</span><input class="input" name="ean" inputmode="numeric" value="${esc(cur?.ean || '')}" placeholder="pour le prix moyen"></label></div>
      ${cur?.prix ? `<p class="muted small" style="margin:0">Prix actuel : ${fmtEur(Number(cur.prix))} (${PRICE_SRC[cur.prix_source] || 'mémorisé'}${cur.prix_date ? `, ${fmtDay(isoToDate(cur.prix_date))}` : ''}).</p>` : ''}
      <button class="btn primary block">Mémoriser</button>
      ${cur ? '<button type="button" class="btn danger block" data-x="del">Oublier ce produit</button>' : ''}
    </form>`);
  const form = $('form', el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = safeUrl(form.url.value.trim());
    if (!url || !/(^|\.)coursesu\.com$/.test(new URL(url).hostname)) { toast('Collez un lien coursesu.com'); return; }
    let label = form.label.value.trim();
    if (!label) { const m = url.match(/\/p\/([^/]+)\//); label = m ? decodeURIComponent(m[1]).replace(/-+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : ''; }
    const manual = parseFloat(form.prix.value.replace(',', '.'));
    const ean = form.ean.value.trim() || null;
    const pid = url.match(/\/(\d+)\.html/)?.[1] || null;
    const extra = { ean, pid };
    if (manual > 0 && manual !== Number(cur?.prix)) Object.assign(extra, { prix: manual, prix_source: 'manuel', prix_date: isoDate(new Date()) });
    try {
      await Data.saveLink(k, url, label, extra);
      closeSheet(); render(); toast('Produit mémorisé');
      // En arrière-plan : prix Courses U si possible, sinon prix moyen Open Prices.
      if (!(manual > 0)) {
        const cu = await Prices.coursesU(url);
        if (cu?.price) await Data.saveLink(k, url, label, { prix: cu.price, prix_source: 'coursesu', prix_date: isoDate(new Date()) });
        else if (ean) await Prices.open(ean);
        if (state.tab === 'courses') render();
      }
    } catch (err) { fail(err); }
  });
  $('[data-x="del"]', el)?.addEventListener('click', async () => {
    try { await Data.deleteLink(k); closeSheet(); render(); } catch (err) { fail(err); }
  });
}

