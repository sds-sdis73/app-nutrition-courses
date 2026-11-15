// Module « Notifications » (Plus › Notifications) : chacun choisit, une par une, les notifications qu'il reçoit,
// ses heures de silence, l'heure du briefing du soir et le délai des rappels d'événements.
// Tables (migration 2026-11-16_accueil-notifications.sql) :
//   notif_prefs : une ligne par compte (RLS propriétaire) ;
//   notif_file  : file des notifications à envoyer, partagée par le foyer, vidée par la fonction send-reminders.
// Pour les autres modules (tâche confiée, nouveau message, agenda ou courses modifiés…) :
//   Modules.get('notifications').expose.programmer({ id, type, titre, corps, url, pour_membres | pour_users, sauf_auteur, envoyer_a })
//   type : un des TYPES_NOTIF ci-dessous ou un type déclaré par le module (champ notifications).
// Sans la migration, les réglages restent sur l'appareil et dans push_abonnements.prefs (ancienne fonction).
const cache = Modules.cache('notifications');

// Copie de supabase/functions/send-reminders/regles.js (un test vérifie qu'elles restent identiques).
const TYPES_NOTIF = [
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
const PREFS_DEFAUT = {
  silence_actif: true, silence_debut: 22, silence_fin: 7,
  briefing_heure: 19, rappel_min: 60, regrouper: true, courses_day: 5, courses_hour: 9,
};
const GROUPES = [['famille', 'Famille'], ['cuisine', 'Cuisine'], ['forme', 'Forme et compagnon'], ['autres', 'Autres']];
// Clés reprises par l'ancienne fonction send-reminders (push_abonnements.prefs).
const CLES_ANCIENNES = ['batch', 'congel', 'courses', 'planning', 'bilan', 'seance', 'dispos'];

const bool = (v) => (typeof v === 'boolean' ? v : null);
const entier = (v, min, max, def) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : def; };
// Réglages effectifs : la ligne notif_prefs, puis les anciens réglages de l'abonnement, puis les valeurs par défaut.
function prefsEffectives(ligne, ancien) {
  const l = ligne || {};
  const a = ancien || {};
  const types = {};
  for (const t of TYPES_NOTIF) {
    const v = bool((l.types || {})[t.type]);
    const w = bool(a[t.type]);
    types[t.type] = v ?? w ?? t.defaut;
  }
  for (const [k, v] of Object.entries(l.types || {})) if (!(k in types) && typeof v === 'boolean') types[k] = v;
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
const veut = (prefs, type) => type === 'test' || prefs?.types?.[type] !== false;
function enSilence(prefs, heure) {
  if (!prefs?.silence_actif) return false;
  const d = prefs.silence_debut, f = prefs.silence_fin;
  if (d === f) return false;
  return d < f ? heure >= d && heure < f : heure >= d || heure < f;
}
const libelleSilence = (p) => `de ${p.silence_debut} h à ${p.silence_fin} h`;
// Liste affichée : types de base, puis ceux que d'autres modules déclarent (champ notifications).
function typesAffiches(declares = []) {
  const base = TYPES_NOTIF.map((t) => ({ ...t }));
  for (const d of declares) if (!base.some((t) => t.type === d.type)) base.push({ groupe: 'autres', defaut: true, ...d });
  return base;
}
// Réglages repris par l'ancienne fonction (tant que la nouvelle n'est pas déployée).
function prefsAnciennes(p) {
  return { ...Object.fromEntries(CLES_ANCIENNES.map((k) => [k, p.types[k] !== false])), courses_day: p.courses_day, courses_hour: p.courses_hour };
}

let ligne = null; // ligne notif_prefs du compte
let absente = false; // migration pas encore appliquée
let appareil = 'inconnu'; // 'oui' | 'non' | 'indispo' | 'inconnu'
const prefs = () => prefsEffectives(ligne, state.push?.prefs);
const tableAbsente = (e) => /relation|does not exist|schema cache/i.test(e?.message || '');

async function enregistrer(patch) {
  ligne = { ...(ligne || {}), ...patch, user_id: me(), foyer_id: foyer(), updated_at: new Date().toISOString() };
  cache.set('prefs', ligne);
  const p = prefs();
  const anciennes = prefsAnciennes(p);
  if (state.push) state.push.prefs = { ...(state.push.prefs || {}), ...anciennes };
  db.from('push_abonnements').update({ prefs: { ...(state.push?.prefs || {}), ...anciennes } }).eq('user_id', me()).then(() => {}, () => {});
  if (absente) return;
  const r = await Sync.upsert(T.notif_prefs, ligne, { onConflict: 'user_id' });
  ligne = { ...ligne, id: r.id };
  cache.set('prefs', ligne);
}

// File d'envoi : une ligne par notification (identifiant stable pour la remplacer ou l'annuler).
async function programmer(n) {
  if (absente || !n?.id || !n.type || !n.titre) return null;
  const iso = (d) => (d instanceof Date ? d.toISOString() : d || null);
  return Sync.upsert(T.notif_file, {
    id: n.id, type: n.type, titre: n.titre, corps: n.corps || '', url: n.url || './',
    pour_users: n.pour_users?.length ? n.pour_users : null, pour_membres: n.pour_membres?.length ? n.pour_membres : null,
    sauf_auteur: !!n.sauf_auteur, envoyer_a: iso(n.envoyer_a) || new Date().toISOString(), evenement_a: iso(n.evenement_a), expire_a: iso(n.expire_a),
  });
}
async function annuler(id) { if (!absente && id) await Sync.supprimer(T.notif_file, id); }

// État de l'abonnement push de cet appareil (avec délai : le service worker peut être absent).
async function verifierAppareil() {
  if (!Push.supported()) { appareil = 'indispo'; return; }
  try {
    const r = await Promise.race([Push.current(), new Promise((_, ko) => setTimeout(() => ko(new Error('délai')), 3000))]);
    appareil = r ? 'oui' : 'non';
  } catch { appareil = 'non'; }
}

const sw = (attrs, on, label) => `<input type="checkbox" role="switch" class="notif-switch" ${attrs} ${on ? 'checked' : ''} aria-label="${esc(label)}">`;
const options = (liste, val) => liste.map(([v, l]) => `<option value="${v}" ${Number(val) === Number(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const HEURES = Array.from({ length: 24 }, (_, h) => [h, `${h} h`]);
const DELAIS = [[60, '1 h avant'], [120, '2 h avant'], [180, '3 h avant'], [1440, 'la veille']];

// Réglage complémentaire d'un type (heure du briefing, délai des rappels, jour des courses).
function extra(t, p) {
  if (t.type === 'briefing') return `<label class="notif-extra"><span>Vers</span><select class="input" data-notif-champ="briefing_heure" aria-label="Heure du briefing">${options(HEURES.filter(([h]) => h >= 16 && h <= 22), p.briefing_heure)}</select></label>`;
  if (t.type === 'evenements') return `<label class="notif-extra"><span>Prévenir</span><select class="input" data-notif-champ="rappel_min" aria-label="Délai des rappels">${options(DELAIS, p.rappel_min)}</select></label>`;
  if (t.type === 'courses') return `<div class="notif-extra"><select class="input" data-notif-champ="courses_day" aria-label="Jour de la liste de courses">${options(DAYS.map((d, i) => [i, d]), p.courses_day)}</select><select class="input" data-notif-champ="courses_hour" aria-label="Heure de la liste de courses">${options(HEURES.filter(([h]) => h >= 7 && h <= 21), p.courses_hour)}</select></div>`;
  return '';
}

function blocAppareil() {
  if (appareil === 'indispo') return '<p class="muted small">Les notifications ne sont pas disponibles dans ce navigateur. Sur iPhone, installe l\'appli sur l\'écran d\'accueil (Partager › Sur l\'écran d\'accueil), puis ouvre-la depuis son icône.</p>';
  const hint = Push.standaloneHint() ? '<p class="small notif-alerte">Sur iPhone, les notifications ne fonctionnent qu\'avec l\'appli installée sur l\'écran d\'accueil (Partager › Sur l\'écran d\'accueil), ouverte depuis son icône.</p>' : '';
  return `${hint}<label class="notif-ligne"><span class="grow"><b>Recevoir sur cet appareil</b><span class="muted small">${appareil === 'oui' ? 'Activé : les notifications arrivent même appli fermée.' : appareil === 'inconnu' ? 'Vérification…' : 'Désactivé sur cet appareil.'}</span></span>${sw('data-notif-appareil', appareil === 'oui', 'Recevoir sur cet appareil')}</label>
    ${appareil === 'oui' ? `<button class="btn small block" data-act="push-test">${ICON.sparkle} M'envoyer une notification de test</button>` : ''}`;
}

function rendu() {
  const p = prefs();
  const types = typesAffiches(Modules.notifications());
  const groupes = GROUPES.map(([g, titre]) => {
    const liste = types.filter((t) => t.groupe === g);
    if (!liste.length) return '';
    return `<h3 class="notif-titre">${esc(titre)}</h3><section class="card notif-carte">${liste.map((t) => {
      const on = p.types[t.type] ?? t.defaut;
      return `<div class="notif-bloc ${on ? '' : 'off'}"><label class="notif-ligne"><span class="grow"><b>${esc(t.libelle)}</b>${t.description ? `<span class="muted small">${esc(t.description)}</span>` : ''}</span>${sw(`data-notif-type="${esc(t.type)}"`, on, t.libelle)}</label>${on ? extra(t, p) : ''}</div>`;
    }).join('')}</section>`;
  }).join('');
  if (appareil === 'inconnu') verifierAppareil().then(() => { const z = $('[data-notif-appareil-zone]'); if (z) z.innerHTML = blocAppareil(); });
  return `<div class="notif">
    <p class="muted small notif-intro">Ces réglages sont les tiens : chaque membre du foyer choisit les siens.${absente ? ' Ils sont gardés sur cet appareil en attendant la mise à jour du serveur.' : ''}</p>
    <section class="card notif-carte" data-notif-appareil-zone>${blocAppareil()}</section>
    <h3 class="notif-titre">Heures de silence</h3>
    <section class="card notif-carte">
      <label class="notif-ligne"><span class="grow"><b>Silence la nuit</b><span class="muted small">${p.silence_actif ? `Rien ${esc(libelleSilence(p))} : ce qui arrive attend la fin du silence.` : 'Les notifications peuvent arriver à toute heure.'}</span></span>${sw('data-notif-champ="silence_actif"', p.silence_actif, 'Heures de silence')}</label>
      ${p.silence_actif ? `<div class="notif-extra notif-silence"><span>De</span><select class="input" data-notif-champ="silence_debut" aria-label="Début du silence">${options(HEURES, p.silence_debut)}</select><span>à</span><select class="input" data-notif-champ="silence_fin" aria-label="Fin du silence">${options(HEURES, p.silence_fin)}</select></div>` : ''}
      <label class="notif-ligne"><span class="grow"><b>Regrouper</b><span class="muted small">Plusieurs notifications de la même heure arrivent en une seule.</span></span>${sw('data-notif-champ="regrouper"', p.regrouper, 'Regrouper les notifications')}</label>
    </section>
    ${groupes}
  </div>`;
}

const majEcran = () => { if (state.tab === 'notifications') render(); };
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (!t.closest || !t.closest('.notif')) return;
  try {
    if (t.matches('[data-notif-appareil]')) {
      if (t.checked) await Push.subscribe(); else await Push.unsubscribe();
      appareil = t.checked ? 'oui' : 'non';
      toast(t.checked ? 'Notifications activées sur cet appareil' : 'Notifications coupées sur cet appareil');
      return majEcran();
    }
    if (t.dataset.notifType) {
      await enregistrer({ types: { ...(ligne?.types || {}), [t.dataset.notifType]: t.checked } });
      return majEcran();
    }
    if (t.dataset.notifChamp) {
      const v = t.type === 'checkbox' ? t.checked : Number(t.value);
      await enregistrer({ [t.dataset.notifChamp]: v });
      return majEcran();
    }
  } catch (err) { fail(err, 'Réglage non enregistré'); majEcran(); }
});

Modules.register({
  id: 'notifications',
  onglet: 'plus',
  segment: 'Notifications',
  ordre: 30,
  libelle: 'Notifications',
  icone: I('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  description: 'Une par une, et tes heures de silence',
  tables: { notif_prefs: 'notif_prefs', notif_file: 'notif_file' },
  async charger(force, { horsLigne } = {}) {
    if (horsLigne || !me()) { ligne = cache.get('prefs', null); return; }
    const { data, error } = await db.from(T.notif_prefs).select('*').eq('user_id', me()).maybeSingle();
    if (error) {
      if (!tableAbsente(error)) throw error;
      absente = true;
      ligne = cache.get('prefs', null);
      return;
    }
    absente = false;
    ligne = data || cache.get('prefs', null);
    if (data) cache.set('prefs', data);
  },
  rendu,
  expose: { TYPES_NOTIF, PREFS_DEFAUT, prefsEffectives, veut, enSilence, libelleSilence, typesAffiches, prefsAnciennes, prefs, programmer, annuler },
});
