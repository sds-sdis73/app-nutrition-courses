// ---------------------------------------------------------------------------
// Foyer : membres et besoins
// ---------------------------------------------------------------------------
function openFoyer() {
  const el = openSheet(`${sheetHead('Mon foyer')}
    <button class="btn soft block" data-x="comptes" style="margin-bottom:12px">${ICON.link} Partage du foyer : code d'invitation, comptes, « je suis… »</button>
    <h3 style="margin:0 0 6px">Membres</h3><div data-list></div>
    <button class="btn primary block" data-x="add" style="margin-top:12px">${ICON.plus} Ajouter un membre</button>
    <p class="muted small">Besoins calculés avec la formule de Mifflin-St Jeor (adultes) et les équations EER de l'IOM (enfants), ajustés selon l'activité et l'objectif. Une « portion standard » de recette correspond à un adulte à ${REF_KCAL} kcal/jour : chacun reçoit une part proportionnelle à ses besoins.</p>`);
  const draw = () => {
    $('[data-list]', el).innerHTML = state.members.length ? state.members.map((m) => `<button class="prod-row" data-id="${m.id}">
      <div class="thumb ph" style="border-radius:50%;font-weight:800;color:var(--primary-strong)">${esc(m.nom.charAt(0).toUpperCase())}</div>
      <div class="grow"><div class="prod-name">${esc(m.nom)}</div><div class="muted small">${m.sexe === 'F' ? 'Femme' : 'Homme'}${ageOf(m) < 18 ? ' (enfant)' : ''} · ${Math.floor(ageOf(m))} ans · ${ACTIVITY[m.activite]?.label || ''}</div></div>
      <div style="text-align:right"><b>${kcalNeed(m)}</b><div class="muted small">kcal/j · ${fmtPortions(memberFactor(m))}</div></div></button>`).join('')
      : '<p class="muted">Aucun membre pour l\'instant.</p>';
  };
  draw();
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-x="add"]')) return memberSheet(null, draw);
    if (e.target.closest('[data-x="comptes"]')) return openFoyerComptes();
    const b = e.target.closest('[data-id]');
    if (b) memberSheet(memberById(b.dataset.id), draw);
  });
}
function memberSheet(m, onDone) {
  const v = m || { nom: '', sexe: 'F', naissance: '', poids_kg: '', taille_cm: '', activite: 'leger', objectif: 'maintien', kcal_perso: null };
  const el = openSheet(`${sheetHead(m ? m.nom : 'Nouveau membre')}
    <form class="stack" data-form="member">
      <label class="field"><span>Prénom</span><input class="input" name="nom" value="${esc(v.nom)}" required maxlength="60"></label>
      <div class="grid2">
        <label class="field"><span>Sexe</span><select class="input" name="sexe"><option value="F" ${v.sexe === 'F' ? 'selected' : ''}>Femme / fille</option><option value="H" ${v.sexe === 'H' ? 'selected' : ''}>Homme / garçon</option></select></label>
        <label class="field"><span>Date de naissance</span><input class="input" type="date" name="naissance" value="${esc(v.naissance)}" max="${isoDate(new Date())}" required></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Poids (kg)</span><input class="input" type="number" name="poids_kg" min="2" max="300" step="0.1" inputmode="decimal" value="${esc(v.poids_kg)}" required></label>
        <label class="field"><span>Taille (cm)</span><input class="input" type="number" name="taille_cm" min="40" max="250" step="0.5" inputmode="decimal" value="${esc(v.taille_cm)}" required></label>
      </div>
      <label class="field"><span>Activité physique</span><select class="input" name="activite">${Object.entries(ACTIVITY).map(([k, a]) => `<option value="${k}" ${k === v.activite ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>
      <label class="field"><span>Objectif</span><select class="input" name="objectif">${Object.entries(OBJECTIF).map(([k, o]) => `<option value="${k}" ${k === v.objectif ? 'selected' : ''}>${o.label}</option>`).join('')}</select></label>
      <div class="kcal-card" data-calc></div>
      <div class="field"><span>Évite (allergies, régime, dégoûts)</span>
        <div class="chips" style="flex-wrap:wrap">${Object.entries(EVITE).map(([k, d]) => `<button type="button" class="chip" aria-pressed="${(v.evite || []).includes(k)}" data-evite="${k}">${d.label}</button>`).join('')}</div>
        <input class="input" name="evite_libre" placeholder="Autres, séparés par des virgules (ex. coriandre, olives)" value="${esc((v.evite || []).filter((k) => k.startsWith('mot:')).map((k) => k.slice(4)).join(', '))}"></div>
      <div class="grid2"><label class="field"><span>Objectif kcal actives / jour</span><input class="input" type="number" name="objectif_kcal_actives" min="50" max="3000" step="50" inputmode="numeric" value="${esc(v.objectif_kcal_actives ?? 300)}"></label>
        <label class="field"><span>Objectif d'eau (ml, vide = auto)</span><input class="input" type="number" name="objectif_eau_ml" min="300" max="5000" step="50" inputmode="numeric" value="${esc(v.objectif_eau_ml ?? '')}" placeholder="auto"></label></div>
      <label class="field"><span>Besoin personnalisé (kcal/jour, facultatif)</span><input class="input" type="number" name="kcal_perso" min="500" max="6000" inputmode="numeric" value="${esc(v.kcal_perso ?? '')}" placeholder="Laisser vide pour le calcul automatique"></label>
      <button class="btn primary block">Enregistrer</button>
      ${m ? '<button type="button" class="btn danger block" data-x="del">Retirer du foyer</button>' : ''}
    </form>`);
  const f = $('form', el);
  const read = () => ({ ...(m ? { id: m.id } : {}), nom: f.nom.value.trim(), sexe: f.sexe.value, naissance: f.naissance.value, poids_kg: parseFloat(f.poids_kg.value), taille_cm: parseFloat(f.taille_cm.value), activite: f.activite.value, objectif: f.objectif.value, kcal_perso: parseInt(f.kcal_perso.value, 10) || null,
    objectif_kcal_actives: parseInt(f.objectif_kcal_actives.value, 10) || 300, objectif_eau_ml: parseInt(f.objectif_eau_ml.value, 10) || null,
    evite: [...$$('[data-evite][aria-pressed="true"]', f).map((b) => b.dataset.evite), ...f.evite_libre.value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => `mot:${x}`)] });
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-evite]'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); });
  const calc = () => {
    const x = read();
    const box = $('[data-calc]', el);
    if (!x.naissance || !(x.poids_kg > 0) || !(x.taille_cm > 0)) { box.innerHTML = '<span class="muted small">Renseignez date de naissance, poids et taille pour calculer les besoins.</span>'; return; }
    const nd = needs(x);
    box.innerHTML = `<div class="row"><div class="grow"><div class="muted small">Besoin estimé${x.kcal_perso ? ' (personnalisé)' : ''}</div><b class="big">${nd.kcal}</b> kcal/jour</div>
      <div class="left"><b>${fmtNum(nd.kcal / REF_KCAL)}</b><span>portion standard</span></div></div>
      <div class="muted small" style="margin-top:6px">Protéines ${nd.prot} g · Glucides ${nd.gluc} g · Lipides ${nd.lip} g · Fibres ${nd.fib} g</div>
      ${x.kcal_perso ? `<div class="muted small">Calcul automatique : ${computedKcal(x)} kcal</div>` : ''}`;
  };
  calc();
  f.addEventListener('input', calc);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Data.saveMember({ ...read(), ordre: m ? m.ordre : state.members.length });
      closeSheet(); onDone?.(); render(); toast('Membre enregistré');
    } catch (err) { fail(err, 'Enregistrement impossible'); }
  });
  $('[data-x="del"]', el)?.addEventListener('click', async () => {
    if (!(await confirmSheet(`Retirer ${m.nom} du foyer ? Son journal sera supprimé.`, 'Retirer'))) return;
    try { await Data.deleteMember(m.id); closeSheet(); onDone?.(); render(); } catch (err) { fail(err); }
  });
}

