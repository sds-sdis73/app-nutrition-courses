// ---------------------------------------------------------------------------
// Suivi nutritionnel (jour / semaine, par membre ou pour tout le foyer)
// ---------------------------------------------------------------------------
const SLOTS = [['petit-dejeuner', 'Petit-déjeuner'], ['midi', 'Déjeuner'], ['gouter', 'Goûter'], ['soir', 'Dîner'], ['collation', 'Collation']];
const slotLabel = (k) => SLOTS.find(([s]) => s === k)?.[1] || k;
const nutriCache = new Map();
function portionN(r) {
  const key = `${r.id}|${r.updated_at}|${CQ.ready}`;
  if (!nutriCache.has(key)) nutriCache.set(key, recipeNutrition(r).perPortion);
  return nutriCache.get(key);
}
const dayIndex = (d) => Math.round((mondayOf(d) - state.week) / 864e5) === 0 ? (d.getDay() + 6) % 7 : -1;

// Ce qu'un membre a mangé un jour donné : repas planifiés (sa part) + journal.
function memberDay(member, date) {
  const iso = isoDate(date);
  const di = dayIndex(date);
  const entries = [];
  if (di >= 0) {
    for (const meal of state.plan.filter((x) => x.day === di)) {
      const r = recipeById(meal.recipe_id);
      if (!r || !mealEaters(meal).some((x) => x.id === member.id)) continue;
      const f = memberFactor(member);
      entries.push({ type: 'plan', slot: meal.slot, label: r.title, detail: `planning · ${fmtPortions(f)}`, n: scaleN(portionN(r), f), member, recipeId: r.id });
    }
  }
  for (const j of state.journal.filter((x) => x.date === iso && x.member_id === member.id)) {
    entries.push({ type: 'journal', id: j.id, slot: j.slot, label: j.label, detail: j.grams ? `${fmtNum(Number(j.grams))} g` : j.portions ? fmtPortions(Number(j.portions)) : '', n: { ...zeroN(), ...j.n }, member });
  }
  const total = entries.reduce((t, e) => addN(t, e.n), zeroN());
  return { entries, total };
}
function suiviMembers() {
  const id = state.suiviMember;
  if (id === 'foyer') return state.members;
  const m = memberById(id) || state.members[0];
  return m ? [m] : [];
}
function groupDay(members, date) {
  const days = members.map((m) => memberDay(m, date));
  const need = members.reduce((t, m) => addN(t, needs(m, date)), zeroN());
  return { entries: days.flatMap((d) => d.entries), total: days.reduce((t, d) => addN(t, d.total), zeroN()), need };
}

function bar(value, target, { max = false } = {}) {
  const pct = target ? (value / target) * 100 : 0;
  const cls = max ? (pct > 100 ? 'over' : 'ok') : pct >= 90 && pct <= 115 ? 'ok' : pct > 115 ? 'over' : 'low';
  return `<div class="bar ${cls}"><i style="width:${clamp(pct, 0, 100)}%"></i></div>`;
}
function macroBars(total, need) {
  return NUTRI_KEYS.filter((d) => d.k !== 'kcal').map((d) => `<div class="mbar ${d.sub ? 'sub' : ''}"><div class="row"><span class="grow">${d.label}</span>
    <b>${fmtNum(total[d.k])}</b><span class="muted small">&nbsp;/ ${d.max ? '≤ ' : ''}${fmtNum(need[d.k])} ${d.unit}</span></div>${bar(total[d.k], need[d.k], { max: d.max })}</div>`).join('');
}
function kcalCard(total, need, sub) {
  const left = Math.round(need.kcal - total.kcal);
  return `<div class="kcal-card"><div class="row"><div class="grow"><div class="muted small">${esc(sub)}</div>
      <div><b class="big">${Math.round(total.kcal)}</b> <span class="muted">/ ${Math.round(need.kcal)} kcal</span></div></div>
      <div class="left ${left < 0 ? 'neg' : ''}"><b>${Math.abs(left)}</b><span>${left < 0 ? 'kcal en trop' : 'kcal restantes'}</span></div></div>
    ${bar(total.kcal, need.kcal)}</div>`;
}

function renderSuivi() {
  if (!state.members.length) {
    return `<div class="empty">${ICON.users}<p>Ajoutez les membres de votre foyer (âge, sexe, poids, taille, activité) pour calculer les besoins de chacun et suivre calories et nutriments.</p>
      <button class="btn primary" data-act="foyer">${ICON.plus} Configurer le foyer</button></div>`;
  }
  if (!CQ.ready) return CQ.failed ? `<div class="empty"><p>La table des aliments n'a pas pu être chargée.</p><button class="btn primary" data-act="cq-retry">Réessayer</button></div>` : '<div class="spinner"></div>';
  const sel = state.suiviMember === 'foyer' ? 'foyer' : (memberById(state.suiviMember) || state.members[0]).id;
  const chips = [...state.members.map((m) => [m.id, m.nom]), ['foyer', 'Tout le foyer']]
    .map(([k, l]) => `<button class="chip" aria-pressed="${sel === k}" data-act="suivi-member" data-v="${k}">${esc(l)}</button>`).join('');
  const seg = `<div class="seg" role="group" style="grid-template-columns:1fr 1fr">${[['jour', 'Jour'], ['semaine', 'Semaine']].map(([k, l]) => `<button aria-pressed="${state.suiviView === k}" data-act="suivi-view" data-v="${k}">${l}</button>`).join('')}</div>`;
  return `<div class="chips">${chips}</div>${seg}${state.suiviView === 'jour' ? renderSuiviDay() : renderSuiviWeek()}`;
}

// Suivi du poids : dernière pesée, tendance, courbe, conseil d'ajustement de l'objectif.
// Poids à 0,1 kg près (fmtNum arrondit à l'unité au-delà de 10).
const fmtKg = (n) => String(Math.round(Number(n) * 10) / 10).replace('.', ',');
function weightCard(m) {
  if (!state.peseesOk || !m) return '';
  const list = state.pesees.filter((x) => x.member_id === m.id);
  const t = weightTrend(list);
  if (!t) return `<div class="ntable weight"><div class="row"><div class="nt-title grow" style="margin:0">⚖️ Poids</div><button class="btn small primary" data-act="pesee">Me peser</button></div>
    <p class="muted small" style="margin:6px 0 0">Une pesée par semaine suffit : la courbe montre la tendance et l'objectif s'ajuste en douceur si besoin.</p></div>`;
  const pts = t.points.slice(-30);
  const lo = Math.min(...pts.map((p) => Math.min(p.kg, p.trend))) - 0.5;
  const hi = Math.max(...pts.map((p) => Math.max(p.kg, p.trend))) + 0.5;
  const W = 300; const H = 70;
  const x = (i) => (pts.length === 1 ? W / 2 : 8 + (i * (W - 16)) / (pts.length - 1));
  const y = (v) => 6 + ((hi - v) * (H - 12)) / (hi - lo || 1);
  const spark = `<svg class="wspark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <polyline fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ')}"/>
    ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3" fill="var(--mango-strong)" stroke="var(--ink)" stroke-width="1"/>`).join('')}</svg>`;
  const s = t.slopeWeek;
  const trendTxt = s == null ? `Tendance après 2 semaines et 4 pesées (${t.n} pour l'instant)` : `${s > 0 ? '+' : ''}${fmtNum(s)} kg/semaine sur 4 semaines`;
  const adv = weightAdvice(m, list);
  const later = store.get(`weightLater:${m.id}`, null);
  const showAdv = adv && !(later && (Date.now() - isoToDate(later).getTime()) / 864e5 < 14) && Number(m.kcal_perso) !== adv.kcal;
  return `<div class="ntable weight"><div class="row"><div class="nt-title grow" style="margin:0">⚖️ Poids</div><button class="btn small primary" data-act="pesee">Me peser</button></div>
    <div class="row" style="margin-top:6px;align-items:baseline"><b style="font-size:24px">${fmtKg(t.last)} kg</b><span class="muted small grow">&nbsp;le ${fmtDay(isoToDate(t.lastDate))}</span><span class="small">tendance <b>${fmtKg(t.trend)} kg</b></span></div>
    ${spark}<p class="muted small" style="margin:2px 0 0">${trendTxt}</p>
    ${showAdv ? `<div class="advice"><p class="small" style="margin:0">${esc(adv.why)} On peut ajuster l'objectif de ${adv.delta > 0 ? '+' : ''}${adv.delta} kcal, sans rien changer d'autre.</p>
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn small primary" data-act="weight-apply" data-m="${m.id}" data-kcal="${adv.kcal}">Passer à ${adv.kcal} kcal/jour</button><button class="btn small" data-act="weight-later" data-m="${m.id}">Plus tard</button></div></div>` : ''}</div>`;
}
function peseeSheet() {
  const m = journalMember();
  if (!m) return;
  if (!state.peseesOk) { toast('Le suivi du poids n\'est pas encore activé sur ce foyer'); return; }
  const el = openSheet(`${sheetHead(`Pesée · ${m.nom}`)}<div data-body></div>`);
  const draw = () => {
    const list = state.pesees.filter((x) => x.member_id === m.id).slice(-6).reverse();
    $('[data-body]', el).innerHTML = `<form class="stack" data-form="pesee"><div class="grid2">
        <label class="field"><span>Poids (kg)</span><input class="input" type="number" name="kg" min="2" max="400" step="0.1" inputmode="decimal" value="${esc(list[0]?.poids_kg ?? m.poids_kg ?? '')}" required></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${isoDate(new Date())}" required></label></div>
        <button class="btn primary block">Enregistrer</button></form>
      ${list.length ? `<div class="ntable" style="margin-top:12px">${list.map((x) => `<div class="nt-row"><span>${fmtDay(isoToDate(x.date))}</span><b>${fmtNum(Number(x.poids_kg))} kg</b><button class="icon-btn" data-del="${x.id}" aria-label="Supprimer">${ICON.trash}</button></div>`).join('')}</div>` : ''}
      <p class="muted small">Conseil : même balance, le matin à jeun. Les variations d'un jour à l'autre sont normales ; seule la tendance compte.</p>`;
  };
  draw();
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await Data.addPesee(m.id, f.date.value, Math.round(parseFloat(f.kg.value) * 10) / 10); toast('Pesée enregistrée'); closeSheet(); render(); } catch (err) { fail(err); }
  });
  el.addEventListener('click', async (e) => { const b = e.target.closest('[data-del]'); if (!b) return; try { await Data.deletePesee(b.dataset.del); draw(); render(); } catch (err) { fail(err); } });
}
function renderSuiviDay() {
  const members = suiviMembers();
  const d = state.day;
  const isToday = isoDate(d) === isoDate(new Date());
  const g = groupDay(members, d);
  const foyer = members.length > 1;
  const nav = `<div class="week-nav"><button class="icon-btn" data-act="suivi-day" data-d="-1" aria-label="Jour précédent">${ICON.back}</button>
    <strong>${isToday ? 'Aujourd\'hui' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
    <button class="icon-btn" data-act="suivi-day" data-d="1" aria-label="Jour suivant">${ICON.next}</button>
    ${isToday ? '' : '<button class="btn small" data-act="suivi-day" data-d="0">Auj.</button>'}
    <button class="icon-btn" data-act="journal-copy" aria-label="Copier le journal de la veille" title="Copier hier">${ICON.copy}</button></div>`;
  const perMember = foyer ? `<div class="ntable"><div class="nt-title">Par membre</div>${members.map((m) => {
    const md = memberDay(m, d); const nd = needs(m, d);
    return `<div class="mbar"><div class="row"><span class="grow">${esc(m.nom)}</span><b>${Math.round(md.total.kcal)}</b><span class="muted small">&nbsp;/ ${nd.kcal} kcal</span></div>${bar(md.total.kcal, nd.kcal)}</div>`;
  }).join('')}</div>` : '';
  const slots = SLOTS.map(([k, label]) => {
    const list = g.entries.filter((e) => e.slot === k);
    const kcal = list.reduce((s, e) => s + e.n.kcal, 0);
    const habits = members.reduce((t, m) => t + state.favoris.filter((x) => x.slot === k && (!x.member_id || x.member_id === m.id)).length, 0);
    return `<div class="slot-block"><div class="row"><h3 class="grow">${label}</h3>${list.length ? `<span class="muted small">${Math.round(kcal)} kcal</span>` : ''}
        ${!list.length && habits ? `<button class="btn small soft" data-act="journal-habits" data-slot="${k}">Mes habituels (${habits})</button>` : ''}
        <button class="icon-btn" data-act="journal-add" data-slot="${k}" aria-label="Ajouter au ${label}">${ICON.plus}</button></div>
      ${list.map((e) => `<div class="entry"><div class="grow">${e.type === 'journal' ? `<button class="nm tl-edit" data-act="journal-edit" data-id="${e.id}">${esc(e.label)}</button>` : `<div class="nm">${esc(e.label)}</div>`}<div class="muted small">${foyer ? `${esc(e.member.nom)} · ` : ''}${esc(e.detail)}</div></div>
        <span class="small"><b>${Math.round(e.n.kcal)}</b> kcal</span>
        ${e.type === 'journal' ? `<button class="icon-btn" data-act="journal-del" data-id="${e.id}" aria-label="Supprimer">${ICON.trash}</button>` : `<button class="icon-btn" data-act="open-recipe" data-id="${e.recipeId}" aria-label="Voir la recette">${ICON.chef}</button>`}</div>`).join('')}</div>`;
  }).join('');
  return `${nav}${kcalCard(g.total, g.need, foyer ? 'Total du foyer' : esc(members[0].nom))}
    ${foyer ? '' : weightCard(members[0])}
    ${expenseBlock(members, d)}
    <div class="ntable">${macroBars(g.total, g.need)}</div>${perMember}${slots}
    <p class="muted small">Les repas du planning sont comptés automatiquement selon la part de chacun. Repères : 15 % de protéines, 50 % de glucides, 35 % de lipides (ANSES).</p>`;
}

// Dépense du jour : pas, kcal actives, total, solde ; séances avec suppression ; ajout manuel.
function expenseBlock(members, date) {
  const total = members.reduce((t, m) => t + expense(m, date).total, 0);
  const active = members.reduce((t, m) => t + expense(m, date).active, 0);
  const activeGoal = members.reduce((t, m) => t + (Number(m.objectif_kcal_actives) || 300), 0);
  const eaten = members.reduce((t, m) => t + memberDay(m, date).total.kcal, 0);
  const water = members.reduce((t, m) => t + waterTotal(m, date), 0);
  const waterG = members.reduce((t, m) => t + waterGoal(m, date), 0);
  const solde = Math.round(eaten - total);
  const seances = members.flatMap((m) => dayActs(m.id, isoDate(date)).filter((a) => a.kind === 'seance').map((a) => ({ ...a, who: m.nom })));
  return `<div class="ntable"><div class="row"><div class="nt-title grow" style="margin:0">Activité & hydratation</div>
      <button class="btn small soft" data-act="eau-sheet">💧 Eau</button><button class="btn small soft" data-act="activite-add">${ICON.plus} Activité</button></div>
    <div class="macro-strip" style="grid-template-columns:repeat(4,1fr);margin:8px 0">
      <div><b>${Math.round(total)}</b><span>kcal dépensées</span></div><div><b>${active}</b><span>kcal actives</span></div><div><b>${fmtL(water)}</b><span>bu</span></div>
      <div style="${solde > 0 ? 'background:#fdebd0' : ''}"><b>${solde > 0 ? '+' : ''}${solde}</b><span>solde</span></div></div>
    <div class="mbar"><div class="row"><span class="grow">Calories actives</span><b>${active}</b><span class="muted small">&nbsp;/ ${activeGoal} kcal</span></div>${bar(active, activeGoal)}</div>
    <div class="mbar"><div class="row"><span class="grow">Hydratation</span><b>${fmtL(water)}</b><span class="muted small">&nbsp;/ ${fmtL(waterG)}</span></div>${bar(water, waterG)}</div>
    ${seances.map((a) => `<div class="entry"><div class="grow"><div class="nm">${esc(a.label || 'Activité')}${a.statut === 'prevu' ? ' <span class="tag">prévue</span>' : ''}</div><div class="muted small">${members.length > 1 ? `${esc(a.who)} · ` : ''}${a.heure ? `${a.heure} · ` : ''}${a.minutes ? `${a.minutes} min` : ''}</div></div><span class="small"><b>${Math.round(Number(a.kcal) || 0)}</b> kcal</span>${a.statut === 'prevu' ? `<button class="btn small soft" data-act="activite-done" data-id="${a.id}">Faite</button>` : ''}<button class="icon-btn" data-act="activite-del" data-id="${a.id}" aria-label="Supprimer">${ICON.trash}</button></div>`).join('')}
    <p class="muted small" style="margin:6px 0 0">Dépense estimée : métabolisme de base × 1,2 + activités faites (les activités prévues ne comptent qu'une fois validées).</p></div>`;
}
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
// Hydratation : ajout rapide et liste des boissons du jour.
async function addWater(ml, member = journalMember()) {
  if (!member) { toast('Ajoutez d\'abord un membre'); return; }
  try { await Data.addEau({ member_id: member.id, date: isoDate(new Date()), heure: nowHM(), ml }); toast(`+${ml} ml 💧`); render(); } catch (e) { fail(e); }
}
function eauSheet() {
  const m = journalMember();
  if (!m) return;
  const el = openSheet(`${sheetHead(`Hydratation · ${m.nom}`)}<div data-body></div>`);
  const draw = () => {
    const list = waterDay(m, new Date());
    const tot = waterTotal(m, new Date());
    const goal = waterGoal(m);
    $('[data-body]', el).innerHTML = `<div class="mbar"><div class="row"><span class="grow">Aujourd'hui</span><b>${fmtL(tot)}</b><span class="muted small">&nbsp;/ ${fmtL(goal)}</span></div>${bar(tot, goal)}</div>
      <div class="grid3" style="margin:10px 0">${[[150, 'Tasse'], [250, 'Verre'], [500, 'Bouteille']].map(([ml, l]) => `<button class="btn" data-ml="${ml}">${l}<br><span class="muted small">${ml} ml</span></button>`).join('')}</div>
      <form class="row" data-form="eau" style="gap:6px"><input class="input grow" type="number" name="ml" min="10" max="3000" step="10" inputmode="numeric" placeholder="Autre (ml)"><input class="input" type="time" name="heure" value="${nowHM()}" style="width:110px"><button class="btn primary" aria-label="Ajouter">${ICON.plus}</button></form>
      <div class="ntable" style="margin-top:10px">${list.map((x) => `<div class="nt-row"><span>${x.heure}</span><b>${x.ml} ml</b><button class="icon-btn" data-del="${x.id}" aria-label="Supprimer">${ICON.trash}</button></div>`).join('') || '<p class="muted small" style="margin:0">Aucune boisson notée aujourd\'hui.</p>'}</div>
      <p class="muted small">Eau, thé, café, lait, soupe comptent. L'objectif augmente les jours d'activité.</p>`;
  };
  draw();
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ml],[data-del]');
    if (!b) return;
    try {
      if (b.dataset.ml) await Data.addEau({ member_id: m.id, date: isoDate(new Date()), heure: nowHM(), ml: Number(b.dataset.ml) });
      else await Data.deleteEau(b.dataset.del);
      draw(); render();
    } catch (err) { fail(err); }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const ml = parseInt(f.ml.value, 10);
    if (!(ml > 0)) return;
    try { await Data.addEau({ member_id: m.id, date: isoDate(new Date()), heure: f.heure.value || nowHM(), ml }); f.ml.value = ''; draw(); render(); } catch (err) { fail(err); }
  });
}
function activiteSheet(member, prefill) {
  const m = member || journalMember();
  if (!m) { toast('Ajoutez d\'abord un membre'); return; }
  const el = openSheet(`${sheetHead('Ajouter une activité')}
    <form class="stack" data-form="activite">
      <div class="grid2"><label class="field"><span>Pour</span><select class="input" name="member">${state.members.map((x) => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${isoDate(state.tab === 'suivi' ? state.day : new Date())}" required></label></div>
      <label class="field"><span>Activité</span><select class="input" name="type">${Object.keys(MET_CATS).map((cat) => `<optgroup label="${esc(cat)}">${MET.map(([l, , c], i) => (c === cat ? `<option value="${i}">${esc(l)}</option>` : '')).join('')}</optgroup>`).join('')}</select></label>
      <div class="grid2"><label class="field"><span>Durée (min)</span><input class="input" type="number" name="minutes" min="1" max="600" inputmode="numeric" value="30" required></label>
        <label class="field"><span>Intensité</span><select class="input" name="intensite"><option value="0.8">Tranquille</option><option value="1" selected>Normale</option><option value="1.25">Soutenue</option></select></label></div>
      <div class="grid2"><label class="field"><span>Heure</span><input class="input" type="time" name="heure" value="${nowHM()}" required></label>
        <label class="field"><span>Calories (calculées)</span><input class="input" type="number" name="kcal" min="0" inputmode="numeric"></label></div>
      <div class="seg" role="group" style="grid-template-columns:1fr 1fr;margin:0"><button type="button" data-st="fait" aria-pressed="true">Déjà faite</button><button type="button" data-st="prevu" aria-pressed="false">Prévue</button></div>
      <button class="btn primary block">Enregistrer</button></form>`);
  const f = $('form', el);
  let kcalManual = false;
  const calc = () => {
    if (kcalManual) return;
    const mm = memberById(f.member.value) || m;
    const met = MET[Number(f.type.value)][1] * Number(f.intensite.value);
    f.kcal.value = Math.round(met * (Number(mm.poids_kg) || 70) * (Number(f.minutes.value) || 0) / 60);
  };
  let statut = 'fait';
  let manual = false;
  const autoStatut = () => {
    if (manual) return;
    const future = f.date.value > isoDate(new Date()) || (f.date.value === isoDate(new Date()) && f.heure.value > nowHM());
    statut = future ? 'prevu' : 'fait';
    $$('[data-st]', el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.st === statut));
  };
  if (prefill?.heure) f.heure.value = prefill.heure;
  calc();
  autoStatut();
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; statut = b.dataset.st; manual = true; $$('[data-st]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
  f.addEventListener('input', (e) => {
    if (e.target.name === 'kcal') kcalManual = f.kcal.value !== '';
    else if (['type', 'minutes', 'intensite', 'member'].includes(e.target.name)) { kcalManual = false; calc(); }
    if (['date', 'heure'].includes(e.target.name)) autoStatut();
  });
  f.addEventListener('change', (e) => { if (['type', 'intensite', 'member'].includes(e.target.name)) { kcalManual = false; calc(); } });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Data.addActivite({ member_id: f.member.value, date: f.date.value, heure: f.heure.value, statut, source: 'manuel', kind: 'seance', ref: uid(), label: MET[Number(f.type.value)][0], kcal: Number(f.kcal.value) || 0, minutes: Number(f.minutes.value) || null });
      closeSheet(); toast(statut === 'prevu' ? 'Activité prévue' : `${f.kcal.value} kcal dépensées ajoutées`); render();
    } catch (err) { fail(err); }
  });
}

function renderSuiviWeek() {
  const members = suiviMembers();
  const days = [...Array(7)].map((_, i) => { const date = addDays(state.week, i); return { date, ...groupDay(members, date) }; });
  const need = days[0].need;
  const top = Math.max(need.kcal * 1.3, ...days.map((d) => d.total.kcal));
  const avg = scaleN(days.reduce((t, d) => addN(t, d.total), zeroN()), 1 / 7);
  const today = isoDate(new Date());
  return `${weekNav()}
    ${members.length === 1 ? weightCard(members[0]) : ''}
    <div class="week-chart">${days.map((d, i) => `<button class="wc-col ${isoDate(d.date) === today ? 'today' : ''}" data-act="suivi-open-day" data-i="${i}">
      <span class="wc-val">${state.bilans.some((b) => b.date === isoDate(d.date) && b.criteres?.cible && members.some((m) => m.id === b.member_id)) ? '⭐' : d.total.kcal ? Math.round(d.total.kcal) : ''}</span>
      <span class="wc-bar"><i class="${d.total.kcal > need.kcal * 1.15 ? 'over' : d.total.kcal >= need.kcal * 0.9 ? 'ok' : 'low'}" style="height:${(d.total.kcal / top) * 100}%"></i>
        <em style="bottom:${(need.kcal / top) * 100}%"></em></span>
      <span class="wc-day">${DAYS[i].slice(0, 3)}</span><span class="wc-exp">${(() => { const e = members.reduce((t, m) => t + expense(m, d.date).total, 0); return e ? `−${Math.round(e)}` : ''; })()}</span></button>`).join('')}</div>
    <p class="muted small" style="margin:4px 0 12px">Trait horizontal : besoin quotidien (${Math.round(need.kcal)} kcal) ; sous chaque jour, la dépense. Touchez un jour pour le détail.</p>
    ${(() => { const dep = days.reduce((t, d) => t + members.reduce((u, m) => u + expense(m, d.date).total, 0), 0) / 7; const sol = Math.round(avg.kcal - dep); return `<div class="ntable"><div class="nt-row"><span>Dépense moyenne par jour</span><b>${Math.round(dep)} kcal</b><span class="pct"></span></div><div class="nt-row"><span>Solde moyen (mangé − dépensé)</span><b class="${sol > 0 ? 'warn' : ''}">${sol > 0 ? '+' : ''}${sol} kcal</b><span class="pct"></span></div></div>`; })()}
    ${kcalCard(avg, need, 'Moyenne par jour sur la semaine')}
    <div class="ntable">${macroBars(avg, need)}</div>
    ${(() => { const all = [...buildShopping().byAisle.values()].flat(); let t = 0; let n = 0; for (const it of all) { const pr = Prices.of(it); if (pr) { t += pr.price; n++; } } return n ? `<div class="ntable"><div class="nt-row"><span>Coût estimé des courses de la semaine</span><b>${fmtEur(t)}</b><span class="pct">${n}/${all.length} art.</span></div></div>` : ''; })()}
    ${(() => { const bl = state.bilans.filter((b) => members.some((m) => m.id === b.member_id) && b.date >= isoDate(state.week) && b.date <= isoDate(addDays(state.week, 6))); if (!bl.length) return ''; const cible = bl.filter((b) => b.criteres?.cible).length; const keys = ['cible', 'proteines', 'fibres', 'sucres', 'sel', 'journal', 'bouge', 'eau']; const labels = { cible: 'calories dans la cible', proteines: 'protéines', fibres: 'fibres', sucres: 'sucres maîtrisés', sel: 'sel maîtrisé', journal: 'journée renseignée', bouge: 'activité', eau: 'hydratation' }; const top = keys.map((k) => [k, bl.filter((b) => b.criteres?.[k]).length]).sort((a, b) => b[1] - a[1]).slice(0, 3); const best = Math.max(0, ...members.map((m) => companionOf(m)?.meilleure_serie || 0)); return `<div class="ntable victoires"><div class="nt-title">🏅 Petites victoires</div><div class="nt-row"><span>Jours dans la cible cette semaine</span><b>${cible} / ${bl.length}</b></div><div class="nt-row"><span>Meilleure série</span><b>${best} jour${best > 1 ? 's' : ''}</b></div><div class="nt-row"><span>Points forts</span><b class="small">${top.filter((t) => t[1]).map((t) => labels[t[0]]).join(', ') || '—'}</b></div></div>`; })()}
    <div class="ntable"><div class="nt-title">Total de la semaine</div>
      ${NUTRI_KEYS.filter((x) => x.main).map((x) => `<div class="nt-row"><span>${x.label}</span><b>${fmtN(avg[x.k] * 7, x.unit)}</b><span class="pct">${Math.round((avg[x.k] / need[x.k]) * 100)} %</span></div>`).join('')}</div>`;
}

async function goToDay(date) {
  state.day = date;
  if (mondayOf(date).getTime() !== state.week.getTime()) {
    state.week = mondayOf(date);
    try { await Data.loadWeek(); } catch (e) { if (isNetworkError(e)) { state.offline = true; Offline.restoreWeek(); } else fail(e); }
  }
  render();
}

// Ajout au journal : aliment Ciqual, produit scanné ou recette.
const journalMember = () => (state.suiviMember !== 'foyer' && memberById(state.suiviMember)) || memberById(state.compte?.member_id) || state.members[0];
const favKey = (r) => `${r.source}|${r.ref || ''}|${r.label}`;
function journalAdd(slot) {
  if (!journalMember()) { toast('Ajoutez d\'abord les membres du foyer'); openFoyer(); return; }
  const el = openSheet(`${sheetHead(`Ajouter · ${slotLabel(slot)}`)}
    <form class="nlp" data-form="nlp"><textarea class="input" name="txt" rows="2" placeholder="Décris ton repas : 2 œufs, une tartine beurrée et un café" aria-label="Décrire le repas"></textarea>
      <div class="row" style="gap:6px;margin-top:6px"><button class="btn primary grow">${ICON.sparkle} Analyser</button><button class="btn" type="button" data-scan-top aria-label="Scanner un code-barres">${ICON.barcode} Scanner</button></div></form>
    <div data-nlp-review></div>
    <details class="quickkcal"><summary>Juste les calories</summary><form class="row" data-form="quick-kcal" style="gap:6px;margin-top:8px">
      <input class="input" name="kcal" type="number" min="1" max="5000" inputmode="numeric" placeholder="kcal" style="width:96px" required>
      <input class="input grow" name="label" maxlength="80" placeholder="Libellé (facultatif)"><button class="btn primary">Ajouter</button></form></details>
    <div class="seg seg5" role="group" style="grid-template-columns:repeat(5,1fr)">${[['recents', 'Récents'], ['plat', 'Plats'], ['aliment', 'Aliment'], ['produit', 'Produit'], ['recette', 'Recette']].map(([k, l], i) => `<button aria-pressed="${i === 0}" data-mode="${k}">${l}</button>`).join('')}</div>
    <div data-pane></div>`);
  const opts = { slot };
  const pane = $('[data-pane]', el);
  const member = journalMember();
  const quickAdd = async (r) => {
    const date = state.tab === 'suivi' ? state.day : new Date();
    try {
      await Data.addJournal({ date: isoDate(date), member_id: member.id, slot, label: r.label, source: r.source, ref: r.ref || null, grams: r.grams ?? null, portions: r.portions ?? null, n: r.n || {} });
      closeSheet(); toast(`Ajouté : ${Math.round(Number(r.n?.kcal) || 0)} kcal`); render();
    } catch (err) { fail(err); }
  };
  const fromPerso = (x) => quantitySheet({ ...opts, label: x.name, per100: offPer100(persoToProduct(x)), source: 'off', ref: `perso:${x.id}`, defaultGrams: Number(x.serving_g) || 100 });
  // Code-barres scanné ou saisi : fiche perso d'abord, sinon Open Food Facts, sinon création d'une fiche à partir de l'étiquette.
  const fromEan = async (ean) => {
    const perso = state.perso.find((x) => x.ean === ean);
    if (perso) { closeSheet(); return fromPerso(perso); }
    try {
      const p = await fetchProduct(ean);
      if (!p || !offPer100(p).kcal) {
        toast(p ? 'Valeurs nutritionnelles absentes : recopiez l\'étiquette' : 'Produit inconnu : recopiez l\'étiquette en 30 secondes');
        return persoSheet({ ean, name: p?.product_name_fr || p?.product_name || '' }, (x) => { closeSheet(); fromPerso(x); });
      }
      closeSheet();
      quantitySheet({ ...opts, label: p.product_name_fr || p.product_name || ean, per100: offPer100(p), source: 'off', ref: ean, defaultGrams: Number(p.serving_quantity) || 100 });
    } catch (e) { fail(e, 'Open Food Facts ne répond pas'); }
  };
  $('[data-scan-top]', el).addEventListener('click', () => Scanner.open(fromEan));
  const date = () => isoDate(state.tab === 'suivi' ? state.day : new Date());
  // Ajout rapide : seulement des calories (macros inconnues).
  $('[data-form="quick-kcal"]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const kcal = parseInt(f.kcal.value, 10);
    if (!(kcal > 0)) return;
    try {
      await Data.addJournal({ date: date(), member_id: member.id, slot, label: f.label.value.trim() || 'Ajout rapide', source: 'ciqual', ref: 'rapide', grams: null, portions: null, n: { ...zeroN(), kcal } });
      closeSheet(); toast(`Ajouté : ${kcal} kcal`); render();
    } catch (err) { fail(err); }
  });
  // Texte libre : analyse puis liste à vérifier.
  const review = $('[data-nlp-review]', el);
  let lines = [];
  const nOf = (l) => scaleN(l.food.n, l.grams / 100);
  const drawReview = () => {
    if (!lines.length) { review.innerHTML = ''; return; }
    const total = lines.filter((l) => l.food).reduce((t, l) => t + nOf(l).kcal, 0);
    review.innerHTML = `<div class="ntable nlp-review">${lines.map((l, i) => l.kind === 'eau'
      ? `<div class="nlp-line"><span class="grow">💧 <b>Eau</b> <span class="muted small">« ${esc(l.text)} » · ajoutée à l'hydratation</span></span><input class="input" type="number" data-ml="${i}" value="${l.ml}" min="10" max="3000" aria-label="Millilitres"><span class="small">ml</span><button class="icon-btn" type="button" data-rm="${i}" aria-label="Retirer">${ICON.trash}</button></div>`
      : `<div class="nlp-line"><div class="grow" style="min-width:0"><div class="muted small">« ${esc(l.text)} »</div>
          <select class="input" data-pick="${i}" aria-label="Aliment reconnu">${l.food ? '' : '<option value="">— non reconnu, choisir —</option>'}${(l.alts.length ? l.alts : l.food ? [{ kind: l.kind, food: l.food }] : []).map((a, j) => `<option value="${j}" ${l.food && a.food === l.food ? 'selected' : ''}>${a.kind === 'plat' ? '🍽️ ' : ''}${esc(a.food.nom)}</option>`).join('')}</select></div>
        <input class="input" type="number" data-g="${i}" value="${l.grams || ''}" min="1" max="3000" inputmode="numeric" aria-label="Grammes" ${l.food ? '' : 'disabled'}><span class="small">g</span>
        <b class="small" data-k="${i}" style="width:44px;text-align:right">${l.food ? Math.round(nOf(l).kcal) : '—'}</b><button class="icon-btn" type="button" data-rm="${i}" aria-label="Retirer">${ICON.trash}</button></div>`).join('')}
      <div class="row" style="margin-top:8px"><span class="grow small">Total <b data-total>${Math.round(total)} kcal</b> · <span class="muted">estimation à vérifier</span></span><button class="btn primary" type="button" data-nlp-add ${lines.some((l) => l.food || l.kind === 'eau') ? '' : 'disabled'}>Tout ajouter</button></div></div>`;
  };
  $('[data-form="nlp"]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const txt = e.target.txt.value.trim();
    if (!txt) return;
    review.innerHTML = '<div class="spinner"></div>';
    try { await Promise.all([CQ.load(), PL.load().catch(() => {})]); } catch { review.innerHTML = '<p class="muted small">La table des aliments n\'a pas pu être chargée.</p>'; return; }
    lines = parseMeal(txt).map((l) => (l.kind === 'inconnu' ? { ...l, food: null, grams: null } : l));
    if (!lines.length) { review.innerHTML = '<p class="muted small">Rien reconnu. Essaie avec des mots simples, séparés par des virgules.</p>'; return; }
    drawReview();
  });
  review.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.pick != null) {
      const l = lines[Number(t.dataset.pick)];
      const a = l.alts[Number(t.value)];
      if (!a) return;
      const wasPlat = l.kind === 'plat';
      l.kind = a.kind; l.food = a.food;
      if (!l.grams || wasPlat !== (a.kind === 'plat')) l.grams = a.kind === 'plat' ? a.food.portion : nlpDefaultGrams(a, l.text);
      drawReview();
    }
    // Quantité modifiée : mise à jour sur place (redessiner pendant la perte de focus ferait perdre le toucher sur « Tout ajouter »).
    if (t.dataset.g != null) {
      const i = Number(t.dataset.g);
      lines[i].grams = Math.max(1, parseInt(t.value, 10) || 1);
      const k = $(`[data-k="${i}"]`, review); if (k) k.textContent = Math.round(nOf(lines[i]).kcal);
      const tot = $('[data-total]', review); if (tot) tot.textContent = `${Math.round(lines.filter((l) => l.food).reduce((s2, l) => s2 + nOf(l).kcal, 0))} kcal`;
    }
    if (t.dataset.ml != null) { lines[Number(t.dataset.ml)].ml = Math.max(10, parseInt(t.value, 10) || 10); }
  });
  review.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { lines.splice(Number(rm.dataset.rm), 1); drawReview(); return; }
    if (!e.target.closest('[data-nlp-add]')) return;
    try {
      let n = 0;
      for (const l of lines) {
        if (l.kind === 'eau') { await Data.addEau({ member_id: member.id, date: date(), heure: nowHM(), ml: l.ml }); n++; continue; }
        if (!l.food) continue;
        await Data.addJournal({ date: date(), member_id: member.id, slot, label: l.food.nom, source: 'ciqual', ref: l.kind === 'plat' ? `plat:${l.food.id}` : String(l.food.code), grams: l.grams, portions: null, n: nOf(l) });
        n++;
      }
      closeSheet(); toast(`${n} élément${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}`); render();
    } catch (err) { fail(err); }
  });
  const show = (mode) => {
    $$('[data-mode]', el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    if (mode === 'recents') {
      pane.innerHTML = '<div class="spinner"></div>';
      Data.recentJournal(member.id).then((rows) => {
        const seen = new Map();
        for (const r of rows) { const k = favKey(r); const e = seen.get(k) || { ...r, count: 0 }; e.count++; seen.set(k, e); }
        const favs = state.favoris.filter((f) => !f.member_id || f.member_id === member.id);
        const favOf = (r) => favs.find((f) => favKey(f) === favKey(r));
        const recents = [...seen.values()].filter((r) => !favOf(r)).sort((a, b) => b.count - a.count).slice(0, 25);
        const rowHtml = (r, i, kind) => `<div class="prod-row" style="cursor:default;padding:6px 10px"><button class="grow" data-${kind}="${i}" style="border:0;background:none;text-align:left;padding:4px 0;min-height:44px">
            <div class="prod-name">${esc(r.label)}</div><div class="muted small">${r.grams ? `${fmtNum(Number(r.grams))} g` : r.portions ? fmtPortions(Number(r.portions)) : ''} · ${Math.round(Number(r.n?.kcal) || 0)} kcal${r.count > 1 ? ` · ${r.count} fois` : ''}${kind === 'fav' && r.slot ? ` · ${slotLabel(r.slot)}` : ''}</div></button>
            <button class="icon-btn ${kind === 'fav' ? 'fav' : ''}" data-star-${kind}="${i}" aria-label="Favori">${kind === 'fav' ? ICON.heartFill : ICON.heart}</button></div>`;
        pane.innerHTML = `${favs.length ? `<h3 class="section-title" style="margin-top:4px">Mes habituels</h3>${favs.map((r, i) => rowHtml(r, i, 'fav')).join('')}` : ''}
          <h3 class="section-title" style="margin-top:8px">Récents de ${esc(member.nom)}</h3>${recents.map((r, i) => rowHtml(r, i, 'rec')).join('') || '<p class="muted small">Rien pour l\'instant : les aliments ajoutés apparaîtront ici en un tap.</p>'}`;
        pane.onclick = async (e) => {
          const b = e.target.closest('[data-rec],[data-fav],[data-star-rec],[data-star-fav]');
          if (!b) return;
          if (b.dataset.rec != null) return quickAdd(recents[Number(b.dataset.rec)]);
          if (b.dataset.fav != null) return quickAdd(favs[Number(b.dataset.fav)]);
          try {
            if (b.dataset.starFav != null) await Data.deleteFavori(favs[Number(b.dataset.starFav)].id);
            else { const r = recents[Number(b.dataset.starRec)]; await Data.addFavori({ member_id: member.id, slot, label: r.label, source: r.source, ref: r.ref || null, grams: r.grams ?? null, portions: r.portions ?? null, n: r.n || {} }); }
            show('recents');
          } catch (err) { fail(err); }
        };
      }).catch((e) => { fail(e); show('aliment'); });
    }
    if (mode === 'plat') {
      let cat = platCatFor(slot);
      pane.innerHTML = `<div class="searchbar" style="margin-bottom:8px">${ICON.search}<input class="input" type="search" data-plat-q placeholder="Ex. lasagnes, poke bowl, croque-monsieur…"></div>
        <div class="chips plat-cats">${PLAT_CATS.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === cat}">${esc(c)}</button>`).join('')}</div><div data-plat-results class="food-results"><div class="spinner"></div></div>`;
      const box = $('[data-plat-results]', pane);
      const draw = () => {
        const q = $('[data-plat-q]', pane).value;
        const list = PL.search(q, q.trim() ? null : cat);
        box.innerHTML = list.map((a) => `<button class="food-row" data-plat="${esc(a.id)}"><span class="grow"><b>${esc(a.nom)}</b><span class="muted small">${esc(a.cat)} · 1 portion = ${a.portion} g</span></span><span class="small"><b>${Math.round((a.n.kcal * a.portion) / 100)}</b> kcal<span class="muted"> /portion</span></span></button>`).join('')
          || '<p class="muted">Aucun plat trouvé. Essayez un autre mot, ou l\'onglet Aliment pour les ingrédients.</p>';
      };
      const loadPlats = () => { box.innerHTML = '<div class="spinner"></div>'; PL.failed = false; PL.load().then(draw).catch(() => { box.innerHTML = '<p class="muted">La liste des plats n\'a pas pu être chargée.</p><button class="btn block" type="button" data-pl-retry>Réessayer</button>'; }); };
      loadPlats();
      pane.addEventListener('click', (e) => { if (e.target.closest('[data-pl-retry]')) loadPlats(); });
      $('[data-plat-q]', pane).addEventListener('input', () => PL.ready && draw());
      pane.onclick = (e) => {
        const c = e.target.closest('[data-cat]');
        if (c) { cat = c.dataset.cat; $('[data-plat-q]', pane).value = ''; $$('[data-cat]', pane).forEach((x) => x.setAttribute('aria-pressed', x === c)); draw(); return; }
        const b = e.target.closest('[data-plat]');
        if (!b) return;
        const a = PL.list.find((x) => x.id === b.dataset.plat);
        closeSheet();
        quantitySheet({ ...opts, label: a.nom, per100: a.n, source: 'ciqual', ref: `plat:${a.id}`, defaultGrams: a.portion, portionG: a.portion });
      };
    }
    if (mode === 'aliment') {
      if (!CQ.ready) {
        pane.innerHTML = CQ.failed ? '<p class="muted">La table des aliments n\'a pas pu être chargée.</p><button class="btn block" type="button" data-cq-retry>Réessayer</button>' : '<div class="spinner"></div>';
        pane.onclick = (e) => { if (e.target.closest('[data-cq-retry]')) { CQ.failed = false; show('aliment'); CQ.load().then(() => show('aliment')).catch(() => show('aliment')); } };
        if (!CQ.failed) CQ.load().then(() => show('aliment')).catch(() => show('aliment'));
        return;
      }
      pane.innerHTML = `<div class="searchbar" style="margin-bottom:8px">${ICON.search}<input class="input" type="search" data-food-q placeholder="Ex. pomme, pain complet, yaourt nature…" autofocus></div><div data-food-results class="food-results"></div>`;
      const pick = (a) => { closeSheet(); quantitySheet({ ...opts, label: a.nom, per100: a.n, source: 'ciqual', ref: String(a.code), defaultGrams: 100 }); };
      $('[data-food-q]', pane).addEventListener('input', (e) => foodSearchList(pane, e.target.value, pick));
      setTimeout(() => $('[data-food-q]', pane)?.focus(), 250);
    }
    if (mode === 'produit') {
      pane.innerHTML = `<button class="btn primary block" data-scan>${ICON.barcode} Scanner un produit</button>
        ${state.perso.length ? `<h3 class="section-title">Mes fiches produit</h3>${state.perso.map((x) => `<button class="prod-row" data-perso="${x.id}"><div class="thumb ph">${ICON.edit}</div><div class="grow"><div class="prod-name">${esc(x.name)}</div><div class="muted small">${esc(x.brand || '')} · ${Math.round(Number(x.n?.kcal) || 0)} kcal/100 g</div></div></button>`).join('')}` : ''}
        <button class="btn block" data-new-perso style="margin-top:8px">${ICON.plus} Nouvelle fiche produit (étiquette)</button>
        ${state.scans.length ? `<h3 class="section-title">Produits scannés récemment</h3>${state.scans.slice(0, 12).map((s) => `<button class="prod-row" data-ean="${esc(s.ean)}">${safeUrl(s.image_url) ? `<img class="thumb" src="${esc(safeUrl(s.image_url))}" alt="">` : `<div class="thumb ph">${ICON.barcode}</div>`}<div class="grow"><div class="prod-name">${esc(s.name || s.ean)}</div><div class="muted small">${esc((s.brand || '').split(',')[0])}</div></div></button>`).join('')}` : ''}`;
      $('[data-scan]', pane).addEventListener('click', () => Scanner.open(fromEan));
      $('[data-new-perso]', pane).addEventListener('click', () => persoSheet({}, (x) => { closeSheet(); quantitySheet({ ...opts, label: x.name, per100: offPer100(persoToProduct(x)), source: 'off', ref: `perso:${x.id}`, defaultGrams: Number(x.serving_g) || 100 }); }));
      pane.onclick = (e) => {
        const pp = e.target.closest('[data-perso]');
        if (pp) { const x = state.perso.find((y) => y.id === pp.dataset.perso); closeSheet(); return quantitySheet({ ...opts, label: x.name, per100: offPer100(persoToProduct(x)), source: 'off', ref: `perso:${x.id}`, defaultGrams: Number(x.serving_g) || 100 }); }
        const b = e.target.closest('[data-ean]'); if (b) fromEan(b.dataset.ean);
      };
    }
    if (mode === 'recette') {
      pane.innerHTML = state.recipes.length ? state.recipes.map((r) => `<button class="prod-row" data-rid="${r.id}"><div class="grow"><div class="prod-name">${esc(r.title)}</div>
        <div class="muted small">${Math.round(portionN(r).kcal)} kcal par portion standard</div></div></button>`).join('') : '<p class="muted">Aucune recette.</p>';
      pane.onclick = (e) => {
        const b = e.target.closest('[data-rid]');
        if (!b) return;
        const r = recipeById(b.dataset.rid);
        closeSheet();
        quantitySheet({ ...opts, label: r.title, per100: portionN(r), source: 'recette', ref: r.id, portions: true });
      };
    }
  };
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) show(b.dataset.mode); });
  show('recents');
}
// Corriger une entrée du journal : quantité, repas, date (valeurs recalculées à partir de la quantité d'origine).
function journalEdit(id) {
  if (String(id).startsWith('local:')) { toast('Modification possible après la synchronisation'); return; }
  const j = state.journal.find((x) => x.id === id);
  if (!j) return;
  const isPortion = j.portions != null && j.grams == null;
  const base = Number(isPortion ? j.portions : j.grams) || null;
  const el = openSheet(`${sheetHead('Corriger l\'entrée')}
    <form class="stack" data-form="jedit"><p style="margin:0"><b>${esc(j.label)}</b></p>
      <div class="grid2"><label class="field"><span>Repas</span><select class="input" name="slot">${SLOTS.map(([k, l]) => `<option value="${k}" ${k === j.slot ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${esc(j.date)}" required></label></div>
      ${base ? `<label class="field"><span>Quantité (${isPortion ? 'portions' : 'g'})</span><input class="input" type="number" name="qty" min="0.1" step="any" inputmode="decimal" value="${base}" required></label>`
        : `<label class="field"><span>Calories</span><input class="input" type="number" name="kcal" min="1" max="5000" inputmode="numeric" value="${Math.round(Number(j.n?.kcal) || 0)}" required></label>`}
      <div data-preview class="muted small"></div>
      <button class="btn primary block">Enregistrer</button>
      <button type="button" class="btn danger block" data-x="del">Supprimer l'entrée</button></form>`);
  const f = $('form', el);
  const newN = () => (base ? scaleN({ ...zeroN(), ...j.n }, (parseFloat(f.qty.value) || 0) / base) : { ...zeroN(), ...j.n, kcal: parseInt(f.kcal.value, 10) || 0 });
  const prev = () => { $('[data-preview]', el).textContent = `${Math.round(newN().kcal)} kcal · ${fmtNum(newN().prot)} g de protéines`; };
  prev();
  f.addEventListener('input', prev);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = { slot: f.slot.value, date: f.date.value, n: newN() };
    if (base) patch[isPortion ? 'portions' : 'grams'] = parseFloat(f.qty.value);
    try { await Data.updateJournal(id, patch); closeSheet(); toast('Entrée corrigée'); render(); } catch (err) { fail(err); }
  });
  $('[data-x="del"]', el).addEventListener('click', async () => { try { await Data.deleteJournal(id); closeSheet(); render(); } catch (err) { fail(err); } });
}
// « Comme hier » : recopie ce que le membre a noté hier au même repas.
async function likeYesterday(slot) {
  const m = journalMember();
  if (!m) return;
  const today = isoDate(new Date());
  const y = isoDate(addDays(new Date(), -1));
  try {
    const rows = (await Data.journalOn(y, [m.id])).filter((r) => r.slot === slot);
    if (!rows.length) { toast(`Rien de noté hier au ${slotLabel(slot).toLowerCase()}`); return; }
    for (const r of rows) await Data.addJournal({ date: today, member_id: m.id, slot, label: r.label, source: r.source, ref: r.ref, grams: r.grams, portions: r.portions, n: r.n });
    toast(`${rows.length} élément${rows.length > 1 ? 's' : ''} repris d'hier`);
    render();
  } catch (e) { fail(e); }
}
// Copie les entrées de la veille (membres affichés) sur le jour sélectionné.
async function copyYesterday() {
  const members = suiviMembers();
  const y = isoDate(addDays(state.day, -1));
  try {
    const rows = await Data.journalOn(y, members.map((m) => m.id));
    if (!rows.length) { toast('Rien dans le journal de la veille'); return; }
    for (const r of rows) await Data.addJournal({ date: isoDate(state.day), member_id: r.member_id, slot: r.slot, label: r.label, source: r.source, ref: r.ref, grams: r.grams, portions: r.portions, n: r.n });
    toast(`${rows.length} entrée${rows.length > 1 ? 's' : ''} copiée${rows.length > 1 ? 's' : ''}`);
    render();
  } catch (e) { fail(e); }
}
async function addHabits(slot) {
  const members = suiviMembers();
  let n = 0;
  try {
    for (const m of members) {
      for (const f of state.favoris.filter((x) => x.slot === slot && (!x.member_id || x.member_id === m.id))) {
        await Data.addJournal({ date: isoDate(state.day), member_id: m.id, slot, label: f.label, source: f.source, ref: f.ref, grams: f.grams, portions: f.portions, n: f.n });
        n++;
      }
    }
    toast(n ? `${n} habituel${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}` : 'Aucun habituel pour ce repas');
    render();
  } catch (e) { fail(e); }
}

function defaultSlot() {
  const h = new Date().getHours();
  return h < 10 ? 'petit-dejeuner' : h < 14 ? 'midi' : h < 18 ? 'gouter' : 'soir';
}
// Saisie de la quantité. Pour une recette, per100 = valeurs d'une portion standard et la quantité est en portions.
function quantitySheet(o) {
  const member = (o.memberId && memberById(o.memberId)) || journalMember();
  if (!member) { toast('Ajoutez d\'abord les membres du foyer'); openFoyer(); return; }
  const isRecipe = !!o.portions;
  const unit = isRecipe ? 'portion(s)' : 'g';
  const def = isRecipe ? Math.round(memberFactor(member) * 100) / 100 : o.defaultGrams || 100;
  const quick = isRecipe ? [0.5, 1, 1.5, 2] : o.portionG ? [0.5, 1, 1.5, 2].map((k) => Math.round(o.portionG * k)) : [...new Set([50, 100, 150, 200, o.defaultGrams].filter(Boolean))].sort((a, b) => a - b);
  const chipLabel = (q) => (isRecipe ? fmtNum(q) : o.portionG ? `${{ 0.5: '½ portion', 1: '1 portion', 1.5: '1,5 portion', 2: '2 portions' }[Math.round((q / o.portionG) * 2) / 2] || ''} <span class="muted">${q} g</span>` : `${fmtNum(q)} g`);
  const date = state.tab === 'suivi' ? state.day : new Date();
  const el = openSheet(`${sheetHead(o.label)}
    <form class="stack" data-form="qty">
      <div class="grid2">
        <label class="field"><span>Pour</span><select class="input" name="member">${state.members.map((m) => `<option value="${m.id}" ${m.id === member.id ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></label>
        <label class="field"><span>Repas</span><select class="input" name="slot">${SLOTS.map(([k, l]) => `<option value="${k}" ${k === (o.slot || defaultSlot()) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${isoDate(date)}" required></label>
      <label class="field"><span>Quantité (${unit})</span><input class="input" type="number" name="qty" min="0.1" step="any" inputmode="decimal" value="${def}" required></label>
      <div class="chips${o.portionG ? ' wrap' : ''}">${quick.map((q) => `<button type="button" class="chip" data-q="${q}">${chipLabel(q)}</button>`).join('')}</div>
      <div data-preview></div>
      <label class="check"><input type="checkbox" name="fav"> Ajouter à mes habituels (${slotLabel(o.slot || defaultSlot())})</label>
      <button class="btn primary block">Ajouter au journal</button>
    </form>`);
  const f = $('form', el);
  const preview = () => {
    const q = parseFloat(f.qty.value) || 0;
    const n = scaleN(o.per100, isRecipe ? q : q / 100);
    $('[data-preview]', el).innerHTML = `<div class="macro-strip">${['kcal', 'prot', 'gluc', 'lip', 'fib'].map((k) => { const d = NUTRI_KEYS.find((x) => x.k === k); return `<div><b>${fmtN(n[k], d.unit).replace(' ', '&nbsp;')}</b><span>${d.label}</span></div>`; }).join('')}</div>`;
    return { q, n };
  };
  preview();
  f.addEventListener('input', preview);
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) { f.qty.value = b.dataset.q; preview(); } });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { q, n } = preview();
    if (!(q > 0)) return;
    try {
      await Data.addJournal({ date: f.date.value, member_id: f.member.value, slot: f.slot.value, label: o.label, source: o.source, ref: o.ref || null, grams: isRecipe ? null : q, portions: isRecipe ? q : null, n });
      if (f.fav.checked) await Data.addFavori({ member_id: f.member.value, slot: f.slot.value, label: o.label, source: o.source, ref: o.ref || null, grams: isRecipe ? null : q, portions: isRecipe ? q : null, n }).catch(() => {});
      closeSheet();
      toast(`Ajouté : ${Math.round(n.kcal)} kcal`);
      render();
    } catch (err) { fail(err); }
  });
}

