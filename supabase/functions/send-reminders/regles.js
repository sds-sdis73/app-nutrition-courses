// Règles pures des notifications (sans accès réseau), partagées par la fonction send-reminders
// et vérifiées par les tests unitaires (tests/unit/accueil-notifications.test.js).
// Le module client src/js/modules/notifications.js garde une copie de TYPES_NOTIF et de ces règles :
// un test vérifie que les deux restent identiques.

// Types de notifications, dans l'ordre de l'écran Plus › Notifications.
// defaut : valeur quand la personne n'a encore rien choisi (« peu de notifications, regroupées »).
export const TYPES_NOTIF = [
  { type: 'briefing', groupe: 'famille', libelle: 'Briefing du soir', description: 'Demain pour chacun : qui dépose qui, repas, événements, tâches, séance.', defaut: true },
  { type: 'evenements', groupe: 'famille', libelle: 'Rappels d\'événements', description: 'Avant chaque événement de l\'agenda qui te concerne.', defaut: true },
  { type: 'taches', groupe: 'famille', libelle: 'Tâches', description: 'Une tâche t\'est confiée, est faite, ou arrive à échéance.', defaut: true },
  { type: 'messages', groupe: 'famille', libelle: 'Messages', description: 'Un nouveau message de la famille.', defaut: true },
  { type: 'agenda_modifs', groupe: 'famille', libelle: 'Modifications de l\'agenda', description: 'Quelqu\'un d\'autre ajoute, déplace ou supprime un événement.', defaut: false },
  { type: 'courses_modif', groupe: 'cuisine', libelle: 'Liste de courses modifiée', description: 'Quelqu\'un ajoute des articles pendant que tu fais les courses.', defaut: false },
  { type: 'courses', groupe: 'cuisine', libelle: 'Liste de courses prête', description: 'Le jour et l\'heure de ton choix.', defaut: true },
  { type: 'planning', groupe: 'cuisine', libelle: 'Semaine à planifier', description: 'Vendredi 18 h, si la semaine prochaine est encore vide.', defaut: true },
  { type: 'batch', groupe: 'cuisine', libelle: 'Batch cooking', description: 'Samedi 18 h, la session du lendemain.', defaut: true },
  { type: 'congel', groupe: 'cuisine', libelle: 'Sortir du congélateur', description: 'La veille à 19 h, pour un reste prévu le lendemain.', defaut: true },
  { type: 'seance', groupe: 'forme', libelle: 'Séances', description: 'Une heure avant chaque séance prévue.', defaut: true },
  { type: 'dispos', groupe: 'forme', libelle: 'Dispos du dimanche', description: 'Dimanche 18 h, coche tes disponibilités de la semaine.', defaut: true },
  { type: 'bilan', groupe: 'forme', libelle: 'Bilan du soir', description: '20 h, le bilan de la journée avec ton compagnon.', defaut: true },
];

// Réglages par défaut d'une personne (table notif_prefs).
export const PREFS_DEFAUT = {
  silence_actif: true, silence_debut: 22, silence_fin: 7, // heures de silence : de 22 h à 7 h
  briefing_heure: 19, rappel_min: 60, regrouper: true, courses_day: 5, courses_hour: 9,
};

const bool = (v) => (typeof v === 'boolean' ? v : null);
const entier = (v, min, max, def) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : def; };

// Réglages effectifs : la ligne notif_prefs l'emporte, puis les anciens réglages de l'abonnement
// (push_abonnements.prefs, compatibilité), puis les valeurs par défaut.
export function prefsEffectives(ligne, ancien) {
  const l = ligne || {};
  const a = ancien || {};
  const types = {};
  for (const t of TYPES_NOTIF) {
    const v = bool((l.types || {})[t.type]);
    const w = bool(a[t.type]);
    types[t.type] = v ?? w ?? t.defaut;
  }
  for (const [k, v] of Object.entries(l.types || {})) if (!(k in types) && typeof v === 'boolean') types[k] = v; // types déclarés par d'autres modules
  return {
    types,
    silence_actif: bool(l.silence_actif) ?? PREFS_DEFAUT.silence_actif,
    silence_debut: entier(l.silence_debut, 0, 23, PREFS_DEFAUT.silence_debut),
    silence_fin: entier(l.silence_fin, 0, 23, PREFS_DEFAUT.silence_fin),
    briefing_heure: entier(l.briefing_heure, 0, 23, PREFS_DEFAUT.briefing_heure),
    rappel_min: entier(l.rappel_min, 0, 24 * 60, PREFS_DEFAUT.rappel_min),
    regrouper: bool(l.regrouper) ?? PREFS_DEFAUT.regrouper,
    courses_day: entier(l.courses_day ?? a.courses_day, 0, 6, PREFS_DEFAUT.courses_day),
    courses_hour: entier(l.courses_hour ?? a.courses_hour, 0, 23, PREFS_DEFAUT.courses_hour),
  };
}

// La personne veut-elle ce type ? (un type inconnu est accepté ; « test » toujours.)
export function veut(prefs, type) {
  if (type === 'test') return true;
  const v = prefs?.types?.[type];
  return v !== false;
}

// Heure (0-23) dans les heures de silence ? Plage qui passe minuit comprise (22 h → 7 h). Début inclus, fin exclue.
export function enSilence(prefs, heure) {
  if (!prefs?.silence_actif) return false;
  const d = prefs.silence_debut, f = prefs.silence_fin;
  if (d === f) return false;
  return d < f ? heure >= d && heure < f : heure >= d || heure < f;
}

// Texte de la plage de silence : « de 22 h à 7 h ».
export const libelleSilence = (p) => `de ${p.silence_debut} h à ${p.silence_fin} h`;

// Un rappel d'événement est-il dû ? (cron toutes les `pas` minutes : on prévient au plus tôt d'un pas,
// pour ne jamais prévenir trop tard.) Les minutes sont comptées depuis une même origine.
export function rappelDu(minutesEvenement, minutesMaintenant, rappelMin, pas = 60) {
  const reste = minutesEvenement - minutesMaintenant;
  return reste > 0 && reste <= rappelMin + pas - 1;
}

// Regroupe les notifications d'un même passage pour un appareil : une seule si plusieurs.
export function regrouper(messages, actif = true) {
  if (!messages.length) return [];
  if (!actif || messages.length === 1) return messages.map((m) => ({ title: m.title, body: m.body, url: m.url, tag: m.tag || m.type }));
  const lignes = messages.map((m) => `• ${m.title} : ${m.body}`);
  let body = lignes.join('\n');
  if (body.length > 360) body = `${body.slice(0, 357)}…`;
  return [{ title: `Tribu & Toutous · ${messages.length} nouvelles`, body, url: messages[0].url || './', tag: 'groupe' }];
}

// ---------------------------------------------------------------------------
// Briefing du soir : composé à partir d'éléments déjà classés.
// elements : [{ type: 'trajet'|'evenement'|'tache'|'repas'|'seance', titre, heure?, membres?: [id], pour?: [id], sens?: 'depot'|'retour', creneau? }]
// membres : [{ id, nom }] ; moi : id du membre de la personne (ou null pour la vue famille).
// ---------------------------------------------------------------------------
const ICONES = { trajet: '🚗', evenement: '📅', tache: '✅', repas: '🍽️', seance: '🏃' };
const ORDRE = { trajet: 0, evenement: 1, seance: 2, tache: 3, repas: 4 };
export const heureFr = (h) => { if (!h) return ''; const [hh, mm] = String(h).split(':'); return `${Number(hh)} h${mm && mm !== '00' ? ` ${mm}` : ''}`; };
const nomsDe = (ids, membres) => (ids || []).map((id) => membres.find((m) => m.id === id)?.nom).filter(Boolean);
const liste = (noms) => (noms.length < 2 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`);

// Phrase d'un élément dans le groupe du membre `chez` : « dépose Léa à 8 h 30 », « Dentiste à 14 h ».
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

export function composerBriefing({ elements = [], membres = [], moi = null } = {}) {
  const tri = (x, y) => (x.heure || '99:99').localeCompare(y.heure || '99:99') || ORDRE[x.type] - ORDRE[y.type];
  const vus = new Set();
  const uniques = elements.filter((e) => { const k = `${e.type}|${e.titre}|${e.heure || ''}|${(e.membres || []).join(',')}`; if (vus.has(k)) return false; vus.add(k); return true; });
  const groupes = [];
  const pris = new Set();
  // Un groupe par membre, dans l'ordre du foyer (le membre « moi » d'abord) ; les éléments sans membre vont au foyer.
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

// Texte court de la notification : d'abord ce qui me concerne, puis le reste du foyer.
export function resumeBriefing(groupes, moi = null) {
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
