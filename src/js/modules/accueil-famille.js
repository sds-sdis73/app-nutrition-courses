// Module « Accueil » : le fil de la journée qui réunit tous les modules (Accueil.sources), avec la bascule
// « moi / famille » des segments Ma journée et Famille, le briefing du soir et le bouton « + » flottant.
//  - Ma journée (écran du cœur) garde repas, eau, activités et compagnon ; ce module y ajoute le briefing
//    du soir (à partir de 18 h) et « Aussi aujourd'hui » : ce que les autres modules disent de ma journée.
//  - Famille (cet écran) : le fil de tout le foyer, une couleur par membre, filtrable par personne.
//  - Le briefing de demain est aussi préparé pour la notification du soir (file notif_file du module notifications),
//    avec les rappels des événements des deux prochains jours.
// Les éléments des modules peuvent porter `membres: [member_id]` (couleurs, filtre) et `trajet: { sens: 'depot' | 'retour',
// qui: [member_id], pour: [member_id] }` (« qui dépose Zoé ? ») ; sans `trajet`, le titre suffit (« Déposer Zoé à la crèche »).
const cache = Modules.cache('accueil-famille');

// ---------------------------------------------------------------------------
// Fonctions pures (testées)
// ---------------------------------------------------------------------------
// Couleur d'un membre selon sa place dans le foyer : jetons de l'univers (--m1…), sinon couleurs du thème.
const COULEURS = ['var(--m1, var(--primary))', 'var(--m2, var(--sky))', 'var(--m3, var(--mango-strong))', 'var(--m4, var(--mint))', 'var(--m5, var(--sage-light))'];
const couleurMembre = (index) => COULEURS[((Number(index) || 0) % COULEURS.length + COULEURS.length) % COULEURS.length];

// Un élément me concerne s'il n'a pas de membre (tout le foyer), s'il me cite ou cite un enfant du foyer.
function concerne(e, moi, enfants = []) {
  const ids = e.membres || [];
  return !ids.length || ids.includes(moi) || ids.some((id) => enfants.includes(id));
}
// Fil filtré : mode 'moi' (ce qui me concerne) ou 'famille' (tout, ou un membre choisi).
function filtrerFil(elements, { mode = 'famille', moi = null, enfants = [], filtre = null } = {}) {
  if (mode === 'moi') return elements.filter((e) => concerne(e, moi, enfants));
  if (filtre) return elements.filter((e) => (e.membres || []).includes(filtre));
  return elements;
}
// Le briefing du soir s'affiche à partir de 18 h.
const briefingVisible = (d) => d.getHours() >= 18;

const REG_DEPOT = /\b(depose|deposer|deposes|depot|emmene|emmener|emmenes|amene|amener|accompagne|accompagner)\b/;
const REG_RETOUR = /\b(recupere|recuperer|recuperes|recup|cherche|chercher|retour)\b/;
// Trajet d'enfant (« qui dépose Zoé ? ») : champ trajet du module, sinon déduit du titre.
function detecterTrajet(e, membres = [], enfants = []) {
  if (e.trajet) return { sens: e.trajet.sens === 'retour' ? 'retour' : 'depot', qui: e.trajet.qui || [], pour: e.trajet.pour || [] };
  const t = ` ${sansAccents(e.titre)} `;
  const sens = REG_DEPOT.test(t) ? 'depot' : REG_RETOUR.test(t) ? 'retour' : null;
  if (!sens) return null;
  const cites = membres.filter((m) => enfants.includes(m.id) && new RegExp(`\\b${sansAccents(m.nom).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)).map((m) => m.id);
  const pour = [...new Set([...cites, ...(e.membres || []).filter((id) => enfants.includes(id))])];
  if (!pour.length) return null;
  return { sens, qui: (e.membres || []).filter((id) => !enfants.includes(id)), pour };
}
const creneau = (h) => (!h ? '' : h < '11:00' ? 'matin' : h < '15:00' ? 'midi' : 'soir');
// Éléments du briefing de demain, classés, à partir de l'agenda et du fil des modules.
// agenda : Agenda.elements(demain, demain) ; accueil : Accueil.elements({ date: demain, famille: true }) ; seances : séances prévues.
function classerBriefing({ agenda = [], accueil = [], seances = [], membres = [], enfants = [] } = {}) {
  const out = [];
  const de = (e, source) => {
    const base = { titre: e.titre, heure: e.heure || null, membres: e.membres || [] };
    if (source === 'planning' || e.type === 'repas') return { ...base, type: 'repas', creneau: creneau(e.heure), membres: [] };
    if (source === 'taches' || e.type === 'tache') return { ...base, type: 'tache' };
    if (source === 'forme' || e.type === 'seance') return { ...base, type: 'seance' };
    const tr = detecterTrajet(e, membres, enfants);
    if (tr) return { ...base, type: 'trajet', sens: tr.sens, membres: tr.qui, pour: tr.pour };
    return { ...base, type: 'evenement' };
  };
  // Les repas restent dans Cuisine : jamais dans le briefing.
  for (const e of agenda) { const x = de(e, e.source); if (x.type !== 'repas') out.push(x); }
  const deja = new Set(out.map((x) => `${sansAccents(x.titre)}|${x.heure || ''}`));
  for (const e of accueil) {
    if (['accueil-famille', 'agenda', 'planning'].includes(e.module)) continue;
    const x = de(e, e.module);
    if (x.type === 'repas') continue;
    const k = `${sansAccents(x.titre)}|${x.heure || ''}`;
    if (!deja.has(k)) { deja.add(k); out.push(x); }
  }
  for (const s of seances) out.push({ type: 'seance', titre: s.titre, heure: s.heure || null, membres: s.membres || [] });
  return out;
}
// Composition du briefing : même règle que la fonction send-reminders (supabase/functions/send-reminders/regles.js).
const ICONES = { trajet: '🚗', evenement: '📅', tache: '✅', repas: '🍽️', seance: '🏃' };
const ORDRE = { trajet: 0, evenement: 1, seance: 2, tache: 3, repas: 4 };
const heureFr = (h) => { if (!h) return ''; const [hh, mm] = String(h).split(':'); return `${Number(hh)} h${mm && mm !== '00' ? ` ${mm}` : ''}`; };
const nomsDe = (ids, membres) => (ids || []).map((id) => membres.find((m) => m.id === id)?.nom).filter(Boolean);
const liste = (noms) => (noms.length < 2 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`);
function phrase(e, membres, chez = null) {
  const a = e.heure ? ` à ${heureFr(e.heure)}` : '';
  if (e.type === 'trajet') {
    const enfants = liste(nomsDe(e.pour, membres));
    const verbe = e.sens === 'retour' ? 'récupère' : 'dépose';
    const qui = liste(nomsDe((e.membres || []).filter((id) => id !== chez), membres));
    if (!(e.membres || []).length) return `${e.sens === 'retour' ? 'Retour' : 'Dépôt'}${enfants ? ` de ${enfants}` : ''}${a} : personne n'est désigné`;
    return `${qui ? `${qui} ` : ''}${verbe}${enfants ? ` ${enfants}` : ''}${a}`;
  }
  if (e.type === 'repas') return `${({ midi: 'Midi', soir: 'Soir', matin: 'Matin' })[e.creneau] || 'Au menu'} : ${e.titre}`;
  return `${e.titre}${a}`;
}
function composerBriefing({ elements = [], membres = [], moi = null } = {}) {
  const tri = (x, y) => (x.heure || '99:99').localeCompare(y.heure || '99:99') || ORDRE[x.type] - ORDRE[y.type];
  const vus = new Set();
  const uniques = elements.filter((e) => { const k = `${e.type}|${e.titre}|${e.heure || ''}|${(e.membres || []).join(',')}`; if (vus.has(k)) return false; vus.add(k); return true; });
  const groupes = [];
  const pris = new Set();
  const ordre = moi ? [...membres.filter((m) => m.id === moi), ...membres.filter((m) => m.id !== moi)] : membres;
  for (const m of ordre) {
    const siens = uniques.filter((e) => e.type !== 'repas' && !pris.has(e) && ((e.membres || []).includes(m.id) || (e.type === 'trajet' && !(e.membres || []).length && (e.pour || []).includes(m.id))));
    siens.forEach((e) => pris.add(e));
    if (siens.length) groupes.push({ membre: { id: m.id, nom: m.nom }, lignes: siens.sort(tri).map((e) => ({ type: e.type, icone: ICONES[e.type] || '•', heure: e.heure || null, texte: phrase(e, membres, m.id) })) });
  }
  const reste = uniques.filter((e) => !pris.has(e)).sort(tri);
  if (reste.length) groupes.push({ membre: null, lignes: reste.map((e) => ({ type: e.type, icone: ICONES[e.type] || '•', heure: e.heure || null, texte: phrase(e, membres) })) });
  const nb = groupes.reduce((t, g) => t + g.lignes.length, 0);
  return { groupes, nb, resume: resumeBriefing(groupes, moi) };
}
function resumeBriefing(groupes, moi = null) {
  if (!groupes.length) return 'Rien de prévu demain : une journée tranquille.';
  const parts = [];
  for (const g of groupes) {
    const textes = g.lignes.map((l) => l.texte);
    if (!g.membre) parts.push(textes.join(' · '));
    else if (g.membre.id === moi) parts.unshift(`Toi : ${textes.join(' · ')}`);
    else parts.push(`${g.membre.nom} : ${textes.join(' · ')}`);
  }
  const t = parts.join('\n');
  return t.length > 300 ? `${t.slice(0, 297)}…` : t;
}
// Vue « moi » du briefing : mon groupe, ceux des enfants et ce qui concerne tout le foyer.
const briefingPourMoi = (b, moi, enfants = []) => ({ ...b, groupes: b.groupes.filter((g) => !g.membre || g.membre.id === moi || enfants.includes(g.membre.id)) });

// Date et heure locales d'un élément d'agenda → Date.
const dateLocale = (iso, heure = '00:00') => { const [a, m, j] = iso.split('-').map(Number); const [h, mi] = String(heure).split(':').map(Number); return new Date(a, m - 1, j, h || 0, mi || 0); };
// Rappels à programmer pour les éléments d'agenda à venir (événements avec heure ; tâches datées le matin même).
function rappelsAgenda(elements, maintenant) {
  const out = [];
  for (const e of elements) {
    if (!e.date || ['planning', 'forme'].includes(e.source)) continue;
    if (e.source === 'taches') {
      const quand = dateLocale(e.date, '08:00');
      const fin = dateLocale(e.date, '21:00');
      if (fin <= maintenant) continue;
      out.push({ id: `tache:${e.id}:${e.date}`, type: 'taches', titre: 'À faire aujourd\'hui', corps: e.titre, url: './#taches', pour_membres: e.membres || [], envoyer_a: quand, expire_a: fin });
      continue;
    }
    if (!e.heure) continue;
    const debut = dateLocale(e.date, e.heure);
    if (debut <= maintenant) continue;
    const jour = isoDate(maintenant) === e.date ? 'Aujourd\'hui' : isoDate(addDays(maintenant, 1)) === e.date ? 'Demain' : `Le ${e.date.split('-').reverse().slice(0, 2).join('/')}`;
    out.push({ id: `evt:${e.source || 'agenda'}:${e.id}:${e.date}`, type: 'evenements', titre: e.titre, corps: `${jour} à ${heureFr(e.heure)}${e.detail ? ` · ${e.detail}` : ''}`, url: './#agenda',
      pour_membres: e.membres || [], envoyer_a: addDays(debut, -1), evenement_a: debut, expire_a: debut });
  }
  return out;
}

// Rappels choisis pour une personne dans la fiche d'un événement (« Antoine : la veille »), venus de rappelsPeriode
// de l'agenda : [{ evenement_id, member_id, minutes, quand, debut, titre }]. Un rappel par personne et par occurrence,
// à l'heure choisie (pas d'evenement_a : le délai général de chacun ne s'applique pas).
function rappelsPersonnes(rappels, maintenant) {
  const out = [];
  for (const r of rappels || []) {
    if (!r.member_id || !(r.debut > maintenant)) continue;
    const jourEv = isoDate(r.debut);
    const jour = isoDate(maintenant) === jourEv ? 'Aujourd\'hui' : isoDate(addDays(maintenant, 1)) === jourEv ? 'Demain' : `Le ${jourEv.split('-').reverse().slice(0, 2).join('/')}`;
    const heure = `${String(r.debut.getHours()).padStart(2, '0')}:${String(r.debut.getMinutes()).padStart(2, '0')}`;
    out.push({ id: `evr:${r.evenement_id}:${r.member_id}:${r.minutes}:${jourEv}:${isoDate(r.quand)}`, type: 'evenements', titre: r.titre, corps: `${jour} à ${heureFr(heure)}`, url: './#agenda',
      pour_membres: [r.member_id], envoyer_a: r.quand, expire_a: r.debut });
  }
  return out;
}

// ---------------------------------------------------------------------------
// État et données
// ---------------------------------------------------------------------------
const vues = { moi: cache.get('vue:moi', null), famille: cache.get('vue:famille', null) }; // { cle, elements, briefing }
let filtre = null; // membre choisi dans le fil de la famille
const sequence = { moi: 0, famille: 0 }; // le dernier calcul lancé l'emporte

const moiCompte = () => memberById(state.compte?.member_id) || state.members[0] || null;
const enfantsDuFoyer = () => state.members.filter((m) => m.naissance && ageOf(m) < 15).map((m) => m.id);
const indexMembre = (id) => state.members.findIndex((m) => m.id === id);


// Données du briefing de demain (fil des modules, agenda, séances prévues).
async function donneesBriefing(date = new Date()) {
  const demain = addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), 1);
  const membres = state.members.map((m) => ({ id: m.id, nom: m.nom }));
  const enfants = enfantsDuFoyer();
  const moi = moiCompte();
  const [agenda, accueil] = await Promise.all([Agenda.elements(demain, demain), Accueil.elements({ date: demain, iso: isoDate(demain), membre: moi, famille: true })]);
  const seances = moi ? dayActs(moi.id, isoDate(demain)).filter((a) => a.kind === 'seance' && a.statut === 'prevu').map((a) => ({ titre: a.label || 'Séance', heure: a.heure || null, membres: [moi.id] })) : [];
  const elements = classerBriefing({ agenda, accueil, seances, membres, enfants });
  return { date: isoDate(demain), libelle: demain.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), ...composerBriefing({ elements, membres, moi: moi?.id || null }) };
}

// Recalcule le fil (et le briefing) d'un mode, puis met à jour l'écran affiché sans tout redessiner.
async function rafraichir(mode) {
  const n = ++sequence[mode];
  const maintenant = new Date();
  const membre = mode === 'moi' ? journalMember() : moiCompte();
  try {
    const els = (await Accueil.elements({ date: maintenant, membre, famille: mode === 'famille' })).filter((e) => mode === 'famille' || e.module !== 'accueil-famille');
    const briefing = briefingVisible(maintenant) ? await donneesBriefing(maintenant) : null;
    if (n !== sequence[mode]) return;
    const v = { cle: `${isoDate(maintenant)}:${membre?.id || ''}`, elements: els, briefing };
    const avant = JSON.stringify(vues[mode]);
    vues[mode] = v;
    if (JSON.stringify(v) !== avant) {
      cache.set(`vue:${mode}`, v);
      const fil = $(`[data-af-fil="${mode}"]`);
      if (fil) fil.innerHTML = filHtml(mode);
      const b = $(`[data-af-briefing="${mode}"]`);
      if (b) b.innerHTML = briefingHtml(mode);
    }
    planifierPlusTard();
  } catch (e) { console.warn('fil de l\'Accueil', e); }
}

// Briefing du soir et rappels d'agenda déposés dans la file d'envoi (module notifications), au plus toutes les 4 s.
let minuterie = null;
function planifierPlusTard(delai = 4000) { clearTimeout(minuterie); minuterie = setTimeout(() => planifier().catch((e) => console.warn('notifications programmées', e)), delai); }
async function planifier() {
  const N = Modules.get('notifications')?.expose;
  if (!N?.programmer || state.offline || !me() || !state.members.length) return { briefing: false, rappels: 0 };
  const p = N.prefs();
  const maintenant = new Date();
  const faits = cache.get('programmes', {}); // id → signature déjà envoyée
  let briefing = false;
  if (N.veut(p, 'briefing')) {
    const b = await donneesBriefing(maintenant);
    const minuit = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate(), 23, 59);
    const ligne = { id: `briefing:${me()}:${b.date}`, type: 'briefing', titre: `Demain, ${b.libelle}`, corps: b.resume, url: './#aujourdhui', pour_users: [me()],
      envoyer_a: new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate(), p.briefing_heure), expire_a: minuit };
    const sig = `${ligne.corps}|${p.briefing_heure}`;
    if (faits[ligne.id] !== sig) { await N.programmer(ligne); faits[ligne.id] = sig; briefing = true; }
  }
  const parPersonne = Modules.get('agenda')?.expose?.rappelsPersonnes?.(maintenant, addDays(maintenant, 2)) || [];
  const rappels = [...rappelsAgenda(await Agenda.elements(maintenant, addDays(maintenant, 2)), maintenant), ...rappelsPersonnes(parPersonne, maintenant)];
  const ids = new Set(rappels.map((r) => r.id));
  let nb = 0;
  for (const r of rappels) {
    const sig = `${r.titre}|${r.corps}|${r.evenement_a?.getTime?.() || r.envoyer_a.getTime()}|${(r.pour_membres || []).join(',')}`;
    if (faits[r.id] === sig) continue;
    await N.programmer(r);
    faits[r.id] = sig;
    nb++;
  }
  // Événements supprimés ou déplacés : leur rappel est retiré de la file.
  for (const id of Object.keys(faits)) {
    if (!/^(evt|evr|tache):/.test(id) || ids.has(id)) continue;
    const date = id.split(':').pop();
    if (date >= isoDate(maintenant)) await N.annuler(id).catch(() => {});
    delete faits[id];
  }
  for (const id of Object.keys(faits)) if (id.startsWith('briefing:') && id.split(':').pop() < isoDate(maintenant)) delete faits[id];
  cache.set('programmes', faits);
  return { briefing, rappels: nb };
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------
const pastilles = (ids) => (ids || []).filter((id) => indexMembre(id) >= 0).map((id) => `<span class="af-pastille" style="--af-c:${couleurMembre(indexMembre(id))}" title="${esc(memberById(id)?.nom || '')}"></span>`).join('');
const attrsData = (data) => Object.entries(data || {}).map(([k, v]) => `data-${esc(String(k).replace(/[^a-z0-9-]/gi, '').toLowerCase())}="${esc(String(v))}"`).join(' ');

function itemHtml(e, passe) {
  const corps = `<span class="af-ico" aria-hidden="true">${e.icone || '•'}</span><span class="grow af-texte"><b>${esc(e.titre)}</b>${e.detail ? `<span class="muted small">${esc(e.detail)}</span>` : ''}</span>${e.membres?.length ? `<span class="af-qui">${pastilles(e.membres)}</span>` : ''}`;
  return `<li class="af-item${passe ? ' passe' : ''}"><span class="af-heure">${e.heure ? esc(heureFr(e.heure)) : ''}</span>${e.act ? `<button class="af-carte" data-act="${esc(e.act)}" ${attrsData(e.data)}>${corps}</button>` : `<div class="af-carte">${corps}</div>`}</li>`;
}

function filHtml(mode) {
  const v = vues[mode];
  if (!v) return '<div class="spinner"></div>';
  const moi = (mode === 'moi' ? journalMember() : moiCompte())?.id || null;
  const els = filtrerFil(v.elements, { mode, moi, enfants: enfantsDuFoyer(), filtre: mode === 'famille' ? filtre : null });
  if (!els.length) {
    if (mode === 'moi') return '';
    return `<div class="card af-vide"><p><b>${filtre ? `Rien de prévu aujourd'hui pour ${esc(memberById(filtre)?.nom || '')}.` : 'Rien de prévu aujourd\'hui pour la famille.'}</b></p><p class="muted small">Touche « + » pour ajouter un événement, une tâche ou un article.</p></div>`;
  }
  const now = nowHM();
  const avecHeure = els.filter((e) => e.heure);
  const sansHeure = els.filter((e) => !e.heure);
  const idx = avecHeure.findIndex((e) => e.heure > now);
  const marque = '<li class="af-maintenant"><span>Maintenant</span></li>';
  const lignes = avecHeure.map((e, i) => (i === idx ? marque : '') + itemHtml(e, e.heure <= now)).join('') + (idx < 0 && avecHeure.length ? marque : '');
  return `${mode === 'moi' ? '<h3 class="tl-head">Aussi aujourd\'hui</h3>' : ''}<ol class="af-fil">${lignes}${sansHeure.map((e) => itemHtml(e, false)).join('')}</ol>`;
}

function briefingHtml(mode) {
  const b0 = vues[mode]?.briefing;
  if (!b0 || !briefingVisible(new Date())) return '';
  const moi = moiCompte()?.id || null;
  const b = mode === 'moi' ? briefingPourMoi(b0, moi, enfantsDuFoyer()) : b0;
  const groupes = b.groupes.map((g) => `<div class="af-b-groupe">
      <div class="af-b-qui">${g.membre ? `<span class="af-pastille" style="--af-c:${couleurMembre(indexMembre(g.membre.id))}"></span><b>${g.membre.id === moi ? 'Toi' : esc(g.membre.nom)}</b>` : '<b>Le foyer</b>'}</div>
      <ul>${g.lignes.map((l) => `<li><span aria-hidden="true">${l.icone}</span> ${esc(l.texte)}</li>`).join('')}</ul></div>`).join('');
  return `<section class="card af-briefing" aria-label="Briefing du soir">
    <div class="af-b-tete"><span class="af-b-lune" aria-hidden="true">🌙</span><div class="grow"><h3>Demain</h3><span class="muted small">${esc(b0.libelle)}</span></div></div>
    ${groupes || '<p class="muted small af-b-calme">Rien de prévu demain : une journée tranquille.</p>'}
  </section>`;
}

const fab = () => `<button class="af-fab" data-act="accueil-ajout" aria-label="Ajouter : phrase libre ou dictée"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button><div class="af-fab-espace" aria-hidden="true"></div>`;

// Ma journée (écran du cœur) : briefing du soir avant le fil, « Aussi aujourd'hui » après, et le « + » flottant.
function augmenterJournee(html) {
  if (!journalMember()) return html;
  rafraichir('moi');
  const brief = `<div data-af-briefing="moi">${briefingHtml('moi')}</div>`;
  const i = html.indexOf('<h3 class="tl-head">');
  const avec = i >= 0 ? html.slice(0, i) + brief + html.slice(i) : html + brief;
  return `${avec}<div data-af-fil="moi">${vues.moi?.cle?.startsWith(isoDate(new Date())) ? filHtml('moi') : ''}</div>${fab()}`;
}
const vueJour = Modules.get('aujourdhui');
if (vueJour) { const base = vueJour.rendu; vueJour.rendu = () => augmenterJournee(base()); }

// « En un coup d'œil » : une tuile par module (agenda, tâches, courses, messages, moi ; les repas restent dans Cuisine), qui mène à son écran.
function tuilesHtml() {
  const t = Accueil.resumes();
  if (!t.length) return '';
  return `<section class="af-tuiles" aria-label="En un coup d'œil">${t.map((r) => `<button class="af-tuile" data-act="${esc(r.act || 'tab')}" ${attrsData(r.data)}>
      <span class="af-tuile-tete"><span class="af-tuile-ico" aria-hidden="true">${r.icone || '•'}</span><span class="af-tuile-titre">${esc(r.titre)}</span></span>
      <b class="af-tuile-valeur">${esc(r.valeur || '')}</b>${r.detail ? `<span class="af-tuile-detail">${esc(r.detail)}</span>` : ''}</button>`).join('')}</section>`;
}

function renduFamille() {
  rafraichir('famille');
  const d = new Date();
  const membres = state.members;
  if (!membres.length) return `<div class="card af-vide"><p class="muted small">Ajoute les membres du foyer pour voir la journée de chacun.</p><button class="btn primary small" data-act="foyer">${ICON.users} Configurer le foyer</button></div>`;
  if (filtre && !memberById(filtre)) filtre = null;
  const chips = `<div class="chips af-membres" role="group" aria-label="Afficher">
    <button class="chip" data-act="af-filtre" data-m="" aria-pressed="${!filtre}">Tout le monde</button>
    ${membres.map((m, i) => `<button class="chip" data-act="af-filtre" data-m="${m.id}" aria-pressed="${filtre === m.id}"><span class="af-pastille" style="--af-c:${couleurMembre(i)}"></span>${esc(m.nom)}</button>`).join('')}</div>`;
  const aJour = vues.famille?.cle?.startsWith(isoDate(d));
  const nom = moiCompte()?.nom;
  return `<p class="muted af-date">${d.getHours() < 12 ? 'Bonjour' : d.getHours() < 18 ? 'Bon après-midi' : 'Bonsoir'}${nom ? ` ${esc(nom)}` : ''} · ${esc(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
    ${tuilesHtml()}
    <div data-af-briefing="famille">${aJour ? briefingHtml('famille') : ''}</div>
    ${chips}
    <h3 class="tl-head">Aujourd'hui</h3>
    <div data-af-fil="famille">${aJour ? filHtml('famille') : '<div class="spinner"></div>'}</div>
    ${fab()}`;
}

Modules.register({
  id: 'accueil-famille',
  onglet: 'accueil',
  // Écran d'ouverture de l'appli : la journée de toute la famille, pas seulement la nutrition.
  segment: 'Aujourd\'hui',
  ordre: 10,
  libelle: () => APP_NAME,
  rendu: renduFamille,
  async charger(force, { horsLigne } = {}) { if (!horsLigne) planifierPlusTard(6000); },
  actions: {
    'af-filtre': (b) => { filtre = b.dataset.m || null; $$('.af-membres .chip').forEach((c) => c.setAttribute('aria-pressed', String((c.dataset.m || null) === filtre))); const f = $('[data-af-fil="famille"]'); if (f) f.innerHTML = filHtml('famille'); },
    'accueil-ajout': () => {
      while (sheets.length) closeSheet();
      const el = AjoutRapide.ouvrir();
      const champ = el && $('[name="txt"]', el);
      if (champ) champ.insertAdjacentHTML('afterend', '<p class="muted small af-dictee"><span aria-hidden="true">🎙️</span> Pour dicter, touche le micro du clavier.</p>');
    },
  },
  expose: { couleurMembre, concerne, filtrerFil, briefingVisible, detecterTrajet, classerBriefing, composerBriefing, resumeBriefing, briefingPourMoi, rappelsAgenda, rappelsPersonnes, heureFr, planifier },
});
