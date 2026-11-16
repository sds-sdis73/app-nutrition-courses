// Module « Carnet de la famille » (Famille › Carnet).
// Quatre volets : Santé (rendez-vous, vaccins selon le calendrier vaccinal français, contacts santé),
// Maison et animaux (échéances périodiques, avec une tâche créée à l'approche), Budget du mois
// (catégories, dépenses, abonnements et prélèvements) et Contacts utiles (urgences, appel en un geste).
// Tout est partagé par le foyer. Lecture hors ligne depuis le cache, saisies en file d'attente (Sync).

const cache = Modules.cache('carnet');
const TABLES = {
  rdv: 'carnet_rdv', vaccins: 'carnet_vaccins', echeances: 'carnet_echeances', categories: 'carnet_categories',
  depenses: 'carnet_depenses', abonnements: 'carnet_abonnements', contacts: 'carnet_contacts',
};
const D = { rdv: [], vaccins: [], echeances: [], categories: [], depenses: [], abonnements: [], contacts: [], manque: false };
let vue = store.get('carnet:vue', 'sante');
let moisBudget = null; // 'AAAA-MM' affiché dans Budget (null : mois courant)

const IC = {
  sante: I('<path d="M12 21s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 6c-2.2 4.6-9.2 9-9.2 9z"/><path d="M12 10v4M10 12h4"/>'),
  seringue: I('<path d="m18 2 4 4M17 7l3-3M19 9 9 19l-4 1 1-4L16 6zM14 8l2 2M11 11l2 2"/>'),
  maison: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  voiture: I('<path d="M5 17h14M3 17v-4l2-5h14l2 5v4"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>'),
  patte: I('<circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 3-4 2-2 1-4 0-4-2z"/>'),
  tel: I('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
  euro: I('<path d="M18 7a6.5 6.5 0 1 0 0 10"/><path d="M4 10h9M4 14h9"/>'),
  agenda: I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
};
const VUES = [['sante', 'Santé'], ['maison', 'Maison & animaux'], ['budget', 'Budget'], ['contacts', 'Contacts']];

// ---------------------------------------------------------------------------
// Dates et montants (fonctions pures)
// ---------------------------------------------------------------------------
const pl = (n, un, plusieurs = `${un}s`) => `${n} ${n > 1 || n < -1 ? plusieurs : un}`;
function ajouterMois(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return isoDate(t);
}
function ajouterPeriode(iso, nb, unite) {
  if (unite === 'jour') return isoDate(addDays(isoToDate(iso), nb));
  if (unite === 'semaine') return isoDate(addDays(isoToDate(iso), 7 * nb));
  if (unite === 'an') return ajouterMois(iso, 12 * nb);
  return ajouterMois(iso, nb);
}
// Nombre de jours de a à b (positif si b est après a).
const ecartJours = (a, b) => Math.round((isoToDate(b) - isoToDate(a)) / 864e5);
const finDuMois = (mois) => { const [y, m] = mois.split('-').map(Number); return isoDate(new Date(y, m, 0)); };
const moisDe = (d) => isoDate(d).slice(0, 7);
const decalerMois = (mois, n) => ajouterMois(`${mois}-01`, n).slice(0, 7);
const arrondi = (x) => Math.round(x * 100) / 100;
const fmtEuros = (x) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(arrondi(Number(x) || 0)).replace(/ /g, ' ');
// « 45,90 € », « 1 200 », « 12.5 » → nombre (ou null).
function lireMontant(s) {
  const t = String(s ?? '').replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const v = Number(t);
  return v > 0 ? v : null;
}
const libellePeriode = (nb, unite) => {
  if (!nb || !unite) return 'Une seule fois';
  const u = { jour: ['jour', 'jours'], semaine: ['semaine', 'semaines'], mois: ['mois', 'mois'], an: ['an', 'ans'] }[unite];
  if (nb === 1) return { jour: 'Tous les jours', semaine: 'Toutes les semaines', mois: 'Tous les mois', an: 'Tous les ans' }[unite];
  return `${unite === 'semaine' ? 'Toutes les' : 'Tous les'} ${nb} ${u[1]}`;
};
const nomMois = (mois) => { const [y, m] = mois.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
function fmtDate(iso, aujourdhui = isoDate(new Date())) {
  const d = isoToDate(iso);
  const o = { weekday: 'short', day: 'numeric', month: 'short' };
  if (iso.slice(0, 4) !== aujourdhui.slice(0, 4)) o.year = 'numeric';
  return d.toLocaleDateString('fr-FR', o);
}
// « aujourd'hui », « demain », « dans 3 jours », « il y a 2 jours », sinon la date.
function quand(iso, aujourdhui = isoDate(new Date())) {
  const n = ecartJours(aujourdhui, iso);
  if (n === 0) return 'aujourd\'hui';
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  if (n > 1 && n <= 14) return `dans ${n} jours`;
  if (n < -1 && n >= -14) return `il y a ${-n} jours`;
  return `le ${fmtDate(iso, aujourdhui)}`;
}
// « 09:30:00 » → « 9 h 30 », « 14:00 » → « 14 h ».
const fmtHeure = (h) => { const [hh, mm] = String(h || '').split(':'); return hh ? `${Number(hh)} h${mm && mm !== '00' ? ` ${mm}` : ''}` : ''; };
// Téléphone : lien tel: et affichage par paires (« 06 12 34 56 78 »).
function telHref(num) {
  const t = String(num || '').trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return t.replace('+', '').length >= 2 ? `tel:${t}` : '';
}
function fmtTel(num) {
  const t = String(num || '').replace(/[^\d+]/g, '');
  if (/^0\d{9}$/.test(t)) return t.replace(/(\d{2})(?=\d)/g, '$1 ');
  if (/^\+33\d{9}$/.test(t)) return `+33 ${t.slice(3, 4)} ${t.slice(4).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
  return String(num || '').trim();
}

// ---------------------------------------------------------------------------
// Calendrier vaccinal français (calendrier des vaccinations 2025, en vigueur en 2025-2026).
// mois : âge de la dose ; marge : mois pendant lesquels la dose reste « à faire » avant d'être en retard ;
// limite : âge au-delà duquel la dose ne se fait plus (rotavirus) ; apres + delai : dose suivant une autre.
// nesDepuis / nesAvant : dates de naissance concernées (méningocoques B et ACWY obligatoires pour les nés depuis 2025).
// ---------------------------------------------------------------------------
const HEXA = { nom: 'DTCaP-Hib-HépB', detail: 'Diphtérie, tétanos, coqueluche, polio, Haemophilus b, hépatite B', oblig: true };
const PNEUMO = { nom: 'Pneumocoque', oblig: true };
const ROTA = { nom: 'Rotavirus', detail: 'Par la bouche ; 2 ou 3 doses selon le vaccin', oblig: false, nesDepuis: '2022-01-01' };
const MENB = { nom: 'Méningocoque B', oblig: true, nesDepuis: '2025-01-01' };
const ACWY = { nom: 'Méningocoques ACWY', oblig: true, nesDepuis: '2025-01-01' };
const MENC = { nom: 'Méningocoque C', oblig: true, nesDepuis: '2017-01-01', nesAvant: '2025-01-01' };
const ROR = { nom: 'ROR', detail: 'Rougeole, oreillons, rubéole', oblig: true };
const HPV = { nom: 'Papillomavirus (HPV)', detail: 'Filles et garçons, 2 doses de 11 à 14 ans', oblig: false };
const VACCINS = [
  { code: 'hexa-1', ...HEXA, dose: '1re dose', age: '2 mois', mois: 2, marge: 1 },
  { code: 'pneumo-1', ...PNEUMO, dose: '1re dose', age: '2 mois', mois: 2, marge: 1 },
  { code: 'rota-1', ...ROTA, dose: '1re dose', age: '2 mois', mois: 2, marge: 1, limite: 6 },
  { code: 'menb-1', ...MENB, dose: '1re dose', age: '3 mois', mois: 3, marge: 1 },
  { code: 'rota-2', ...ROTA, dose: '2e dose', age: '3 mois', mois: 3, marge: 1, limite: 6 },
  { code: 'hexa-2', ...HEXA, dose: '2e dose', age: '4 mois', mois: 4, marge: 1 },
  { code: 'pneumo-2', ...PNEUMO, dose: '2e dose', age: '4 mois', mois: 4, marge: 1 },
  { code: 'rota-3', ...ROTA, dose: '3e dose, selon le vaccin', age: '4 mois', mois: 4, marge: 1, limite: 8 },
  { code: 'menb-2', ...MENB, dose: '2e dose', age: '5 mois', mois: 5, marge: 1 },
  { code: 'menc-1', ...MENC, dose: '1re dose', age: '5 mois', mois: 5, marge: 1 },
  { code: 'acwy-1', ...ACWY, dose: '1re dose', age: '6 mois', mois: 6, marge: 1 },
  { code: 'hexa-3', ...HEXA, dose: 'rappel', age: '11 mois', mois: 11, marge: 1 },
  { code: 'pneumo-3', ...PNEUMO, dose: 'rappel', age: '11 mois', mois: 11, marge: 1 },
  { code: 'ror-1', ...ROR, dose: '1re dose', age: '12 mois', mois: 12, marge: 1 },
  { code: 'menb-3', ...MENB, dose: 'rappel', age: '12 mois', mois: 12, marge: 1 },
  { code: 'acwy-2', ...ACWY, dose: 'rappel', age: '12 mois', mois: 12, marge: 1 },
  { code: 'menc-2', ...MENC, dose: 'rappel', age: '12 mois', mois: 12, marge: 1 },
  { code: 'ror-2', ...ROR, dose: '2e dose', age: '16 à 18 mois', mois: 16, marge: 2 },
  { code: 'dtcap-6', nom: 'DTCaP', detail: 'Diphtérie, tétanos, coqueluche, polio', oblig: false, dose: 'rappel', age: '6 ans', mois: 72, marge: 12 },
  { code: 'dtcap-11', nom: 'dTcaP', detail: 'Diphtérie, tétanos, coqueluche, polio', oblig: false, dose: 'rappel', age: '11 à 13 ans', mois: 132, marge: 24 },
  { code: 'hpv-1', ...HPV, dose: '1re dose', age: '11 à 14 ans', mois: 132, marge: 36 },
  { code: 'hpv-2', ...HPV, dose: '2e dose', age: '6 à 13 mois après la 1re', mois: 138, marge: 7, apres: 'hpv-1', delai: 6 },
  { code: 'acwy-ado', ...ACWY, oblig: false, nesDepuis: null, dose: 'rappel de l\'adolescent', age: '11 à 14 ans', mois: 132, marge: 36 },
  { code: 'dtp-25', nom: 'dTcaP', detail: 'Rappel de l\'adulte, avec la coqueluche', oblig: false, dose: 'rappel', age: '25 ans', mois: 300, marge: 12 },
  { code: 'dtp-45', nom: 'dTP', detail: 'Diphtérie, tétanos, polio', oblig: false, dose: 'rappel', age: '45 ans', mois: 540, marge: 12 },
  { code: 'dtp-65', nom: 'dTP', detail: 'Diphtérie, tétanos, polio', oblig: false, dose: 'rappel', age: '65 ans', mois: 780, marge: 12 },
  { code: 'dtp-75', nom: 'dTP', detail: 'Puis tous les 10 ans', oblig: false, dose: 'rappel', age: '75 ans', mois: 900, marge: 12 },
];
// « 11 à 14 ans » → « entre 11 et 14 ans » ; « 2 mois » → « à 2 mois ».
const quandDose = (age) => (/^\d+ à \d+/.test(age) ? age.replace(/^(\d+) à (\d+)/, 'entre $1 et $2') : `à ${age}`);
const concerne = (v, naissance) => (!v.nesDepuis || naissance >= v.nesDepuis) && (!v.nesAvant || naissance < v.nesAvant);
// Doses d'un membre avec leur statut : fait, a_venir, a_faire, retard (moins d'un an de retard),
// ancien (plus d'un an de retard : sans doute fait mais pas noté), expire (rotavirus trop tard).
function vaccinsPour(membre, faits = [], aujourdhui = isoDate(new Date())) {
  if (!membre?.naissance) return [];
  const n = membre.naissance;
  const sienne = (code) => faits.find((f) => f.member_id === membre.id && f.dose === code);
  return VACCINS.filter((v) => concerne(v, n)).map((v) => {
    const fait = sienne(v.code);
    let cible = ajouterMois(n, v.mois);
    const avant = v.apres && sienne(v.apres);
    if (avant?.fait_le) cible = ajouterMois(avant.fait_le, v.delai);
    const limite = ajouterMois(cible, v.marge);
    let statut;
    if (fait) statut = 'fait';
    else if (aujourdhui < cible) statut = 'a_venir';
    else if (v.limite && aujourdhui > ajouterMois(n, v.limite)) statut = 'expire';
    else if (aujourdhui <= limite) statut = 'a_faire';
    else statut = ecartJours(limite, aujourdhui) > 365 ? 'ancien' : 'retard';
    return { ...v, cible, limite, statut, fait_le: fait?.fait_le || null, id: fait?.id || null };
  });
}
function resumeVaccins(doses) {
  const de = (s) => doses.filter((d) => d.statut === s);
  return {
    faits: de('fait').length,
    total: doses.filter((d) => d.statut !== 'expire').length,
    aFaire: [...de('retard'), ...de('a_faire')].sort((a, b) => a.cible.localeCompare(b.cible)),
    // Doses à venir : celles des 5 prochaines années (au moins la suivante), 3 au plus.
    prochains: de('a_venir').sort((a, b) => a.cible.localeCompare(b.cible)).filter((d, i, l) => i === 0 || d.cible <= ajouterMois(l[0].cible, 60)).slice(0, 3),
    anciens: de('ancien'),
  };
}

// ---------------------------------------------------------------------------
// Échéances : maison, véhicules, animaux
// ---------------------------------------------------------------------------
const CATEGORIES = {
  maison: { libelle: 'Maison', icone: IC.maison, sujet: 'Pièce ou appareil (facultatif)' },
  vehicule: { libelle: 'Véhicules', icone: IC.voiture, sujet: 'Véhicule (ex. Clio, vélo cargo)' },
  animal: { libelle: 'Animaux', icone: IC.patte, sujet: 'Animal (ex. prénom du chien, « les chiens »)' },
};
const MODELES = {
  maison: [['Entretien de la chaudière', 1, 'an'], ['Ramonage', 1, 'an'], ['Filtres de la VMC', 6, 'mois'], ['Piles des détecteurs de fumée', 1, 'an'], ['Filtre du lave-vaisselle', 3, 'mois']],
  vehicule: [['Contrôle technique', 2, 'an'], ['Vidange', 1, 'an'], ['Révision', 1, 'an'], ['Pneus hiver (loi Montagne, du 1er novembre au 31 mars)', 1, 'an'], ['Pneus été', 1, 'an']],
  animal: [['Vaccins', 1, 'an'], ['Vermifuge', 3, 'mois'], ['Antiparasitaire (puces, tiques)', 1, 'mois'], ['Visite chez le vétérinaire', 1, 'an'], ['Croquettes à racheter', 4, 'semaine']],
};
const PERIODES = [['', 'Une seule fois'], ['1:semaine', 'Toutes les semaines'], ['2:semaine', 'Toutes les 2 semaines'], ['4:semaine', 'Toutes les 4 semaines'],
  ['1:mois', 'Tous les mois'], ['2:mois', 'Tous les 2 mois'], ['3:mois', 'Tous les 3 mois'], ['6:mois', 'Tous les 6 mois'],
  ['1:an', 'Tous les ans'], ['2:an', 'Tous les 2 ans'], ['3:an', 'Tous les 3 ans'], ['5:an', 'Tous les 5 ans']];
const DELAI_PROCHE = 14; // jours : une échéance « approche »
const DELAI_TACHE = 7;   // jours : une tâche est créée dans le module taches

// Prochaine date d'une échéance : la date saisie, sinon la dernière fois + la périodicité.
function prochaineDate(e) {
  if (e.prochain) return e.prochain;
  if (e.dernier && e.periode_nb && e.periode_unite) return ajouterPeriode(e.dernier, e.periode_nb, e.periode_unite);
  return null;
}
function etatEcheance(e, aujourdhui = isoDate(new Date())) {
  const date = prochaineDate(e);
  if (!date) return { date: null, jours: null, niveau: 'aucune' };
  const jours = ecartJours(aujourdhui, date);
  return { date, jours, niveau: jours < 0 ? 'retard' : jours <= DELAI_PROCHE ? 'proche' : 'ok' };
}
// Marquer « fait » : dernière fois = ce jour, prochaine = ce jour + périodicité (ou plus rien si ponctuelle).
function marquerFait(e, jour = isoDate(new Date())) {
  return { ...e, dernier: jour, prochain: e.periode_nb && e.periode_unite ? ajouterPeriode(jour, e.periode_nb, e.periode_unite) : null, tache_pour: null };
}
const titreEcheance = (e) => (e.sujet ? `${e.titre} · ${e.sujet}` : e.titre);
// Échéances pour lesquelles il faut créer une tâche (à J-7 ou en retard, une seule fois par date).
const tachesACreer = (echeances, aujourdhui = isoDate(new Date()), delai = DELAI_TACHE) => echeances.filter((e) => {
  const d = prochaineDate(e);
  return d && ecartJours(aujourdhui, d) <= delai && e.tache_pour !== d;
});

// Point d'extension vers le module taches : s'il expose creerTache (ou ajouterTache),
// le carnet l'appelle avec { titre, echeance: 'AAAA-MM-JJ', detail, source: 'carnet', cle }.
function apiTaches() {
  const t = Modules.get('taches')?.expose || {};
  if (typeof t.creerTache === 'function') return t.creerTache;
  if (typeof t.ajouterTache === 'function') return t.ajouterTache;
  // API publique du module taches (window.Taches) : la clé sert d'origine, sans doublon d'un téléphone à l'autre.
  if (typeof window.Taches?.creer === 'function') return (d) => window.Taches.creer({ titre: d.titre, echeance: d.echeance, notes: d.detail || null, origine: d.source || 'carnet', origine_id: d.cle });
  return null;
}
async function creerTaches() {
  const api = apiTaches();
  if (!api || state.offline || D.manque) return 0;
  let n = 0;
  for (const e of tachesACreer(D.echeances)) {
    const date = prochaineDate(e);
    try {
      await api({ titre: titreEcheance(e), echeance: date, detail: `Carnet · ${CATEGORIES[e.categorie]?.libelle || ''}`, source: 'carnet', cle: `carnet:${e.id}:${date}` });
      await enregistrer('echeances', { ...e, tache_pour: date });
      n++;
    } catch (err) { console.warn('carnet : tâche non créée', err); }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Budget : prélèvements et total du mois
// ---------------------------------------------------------------------------
const JOURS_UNITE = { jour: 1, semaine: 7, mois: 30.44, an: 365.25 };
// Dates de prélèvement d'un abonnement entre debut et fin (inclus), à partir de sa date de référence.
function occurrences(a, debut, fin) {
  if (!a || a.actif === false || !a.date_ref) return [];
  const nb = a.periode_nb || 1, unite = a.periode_unite || 'mois';
  const pas = nb * JOURS_UNITE[unite];
  let k = Math.floor(ecartJours(a.date_ref, debut) / pas) - 1;
  const out = [];
  for (let i = 0; i < 400; i++, k++) {
    const d = ajouterPeriode(a.date_ref, k * nb, unite);
    if (d > fin) break;
    if (d >= debut && !out.includes(d)) out.push(d);
  }
  return out;
}
function budgetMois(mois, { categories = [], depenses = [], abonnements = [] } = {}, aujourdhui = isoDate(new Date())) {
  const debut = `${mois}-01`, fin = finDuMois(mois);
  const deps = depenses.filter((d) => d.date >= debut && d.date <= fin).sort((a, b) => b.date.localeCompare(a.date));
  const prels = abonnements.flatMap((a) => occurrences(a, debut, fin).map((date) => ({ abonnement: a, date, montant: Number(a.montant) || 0, categorie_id: a.categorie_id || null, passe: date <= aujourdhui })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const somme = (l) => arrondi(l.reduce((s, x) => s + (Number(x.montant) || 0), 0));
  const connues = new Set(categories.map((c) => c.id));
  const ligne = (c, filtre) => {
    const depense = somme([...deps.filter(filtre), ...prels.filter(filtre)]);
    const budget = Number(c.montant) || 0;
    return { id: c.id, nom: c.nom, budget, depense, reste: arrondi(budget - depense), part: budget ? depense / budget : depense ? 1 : 0, depasse: budget > 0 && depense > budget };
  };
  const parCategorie = [...categories].sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((c) => ligne(c, (x) => x.categorie_id === c.id));
  const sans = (x) => !x.categorie_id || !connues.has(x.categorie_id);
  if (deps.some(sans) || prels.some(sans)) parCategorie.push(ligne({ id: null, nom: 'Sans catégorie', montant: 0 }, sans));
  const totalDepenses = somme(deps), totalPrelevements = somme(prels);
  const budget = somme(categories.map((c) => ({ montant: c.montant })));
  const total = arrondi(totalDepenses + totalPrelevements);
  return { mois, debut, fin, depenses: deps, prelevements: prels, aVenir: prels.filter((p) => !p.passe), parCategorie, totalDepenses, totalPrelevements, total, budget, reste: arrondi(budget - total) };
}
const CATEGORIES_BUDGET = ['Courses', 'Maison', 'Transport', 'Santé', 'Enfants', 'Animaux', 'Loisirs', 'Abonnements', 'Divers'];

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
const GROUPES = { sante: 'Santé', garde: 'Garde des enfants', voisins: 'Voisins', autres: 'Autres' };
const ROLES = { sante: ['Médecin traitant', 'Pédiatre', 'Dentiste', 'Pharmacie', 'Kinésithérapeute', 'Vétérinaire'], garde: ['Crèche', 'Nounou', 'Baby-sitter', 'Grands-parents'], voisins: ['Voisin', 'Voisine'], autres: ['École', 'Plombier', 'Électricien', 'Assurance'] };
const URGENCES = [
  ['15', 'SAMU', 'Urgence médicale'],
  ['18', 'Pompiers', 'Incendie, accident, secours'],
  ['17', 'Police secours', 'Agression, danger immédiat'],
  ['112', 'Urgence européenne', 'Depuis n\'importe quel téléphone, en France et en Europe'],
  ['114', 'Urgence par SMS', 'Si tu ne peux pas parler ou entendre'],
  ['0472116911', 'Centre antipoison de Lyon', 'Ingestion ou contact avec un produit toxique'],
  ['3237', 'Pharmacie de garde', 'Service payant, 0,35 € la minute'],
];

// ---------------------------------------------------------------------------
// Sources partagées : fil de l'Accueil et agenda (fonctions pures sur les données)
// ---------------------------------------------------------------------------
const nomMembre = (membres, id) => membres.find((m) => m.id === id)?.nom || '';
function rappelsDuJour(d, iso, membres = []) {
  const out = [];
  for (const r of d.rdv.filter((x) => x.date === iso)) {
    out.push({ heure: r.heure ? r.heure.slice(0, 5) : null, titre: r.titre, detail: [nomMembre(membres, r.member_id), r.lieu].filter(Boolean).join(' · ') || 'Rendez-vous', icone: IC.sante, act: 'carnet-rdv', data: { id: r.id }, priorite: 2 });
  }
  for (const e of d.echeances) {
    const et = etatEcheance(e, iso);
    if (et.date && et.jours <= 0) out.push({ heure: null, titre: titreEcheance(e), detail: et.jours === 0 ? 'À faire aujourd\'hui' : `En retard de ${pl(-et.jours, 'jour')}`, icone: CATEGORIES[e.categorie]?.icone, act: 'carnet-vue', data: { vue: 'maison' }, priorite: et.jours < 0 ? 2 : 1 });
  }
  for (const a of d.abonnements) {
    if (occurrences(a, iso, iso).length) out.push({ heure: null, titre: `Prélèvement : ${a.libelle}`, detail: fmtEuros(a.montant), icone: IC.euro, act: 'carnet-vue', data: { vue: 'budget' }, priorite: 0 });
  }
  for (const m of membres) {
    const r = resumeVaccins(vaccinsPour(m, d.vaccins, iso));
    if (r.aFaire.length) out.push({ heure: null, titre: `Vaccin à faire pour ${m.nom}`, detail: r.aFaire.map((v) => `${v.nom}, ${v.dose}`).join(' ; '), icone: IC.seringue, act: 'carnet-vaccins', data: { membre: m.id }, priorite: 1 });
  }
  return out;
}
function elementsAgenda(d, debut, fin, membres = [], aujourdhui = isoDate(new Date())) {
  const out = [];
  for (const r of d.rdv) {
    if (r.date < debut || r.date > fin) continue;
    out.push({ id: `carnet-rdv:${r.id}`, date: r.date, heure: r.heure ? r.heure.slice(0, 5) : null, titre: r.titre, detail: [nomMembre(membres, r.member_id), r.lieu].filter(Boolean).join(' · ') || null, membres: r.member_id ? [r.member_id] : [], act: 'carnet-rdv', data: { id: r.id } });
  }
  for (const e of d.echeances) {
    const date = prochaineDate(e);
    if (date && date >= debut && date <= fin) out.push({ id: `carnet-echeance:${e.id}`, date, titre: titreEcheance(e), detail: `${CATEGORIES[e.categorie]?.libelle || 'Carnet'} · ${libellePeriode(e.periode_nb, e.periode_unite)}`, act: 'carnet-vue', data: { vue: 'maison' } });
  }
  for (const a of d.abonnements) {
    for (const date of occurrences(a, debut, fin)) out.push({ id: `carnet-prelevement:${a.id}:${date}`, date, titre: `Prélèvement : ${a.libelle}`, detail: fmtEuros(a.montant), act: 'carnet-vue', data: { vue: 'budget' } });
  }
  for (const m of membres) {
    for (const v of vaccinsPour(m, d.vaccins, aujourdhui)) {
      if (!['a_venir', 'a_faire', 'retard'].includes(v.statut) || v.cible < debut || v.cible > fin) continue;
      out.push({ id: `carnet-vaccin:${m.id}:${v.code}`, date: v.cible, titre: `Vaccin : ${v.nom}, ${v.dose}`, detail: `${m.nom} · ${quandDose(v.age)}`, membres: [m.id], act: 'carnet-vaccins', data: { membre: m.id } });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Données : chargement, cache et écriture
// ---------------------------------------------------------------------------
const sauver = () => { for (const k of Object.keys(TABLES)) cache.set(k, D[k]); };
const restaurer = () => { for (const k of Object.keys(TABLES)) D[k] = cache.get(k, []); };
const tableAbsente = (e) => /42P01|PGRST205|does not exist|schema cache/i.test(`${e?.code || ''} ${e?.message || ''}`);
async function charger(force, { horsLigne } = {}) {
  if (horsLigne || !foyer()) { restaurer(); return; }
  try {
    const depuis = `${decalerMois(moisDe(new Date()), -12)}-01`;
    const lots = await Promise.all(Object.entries(TABLES).map(async ([k, t]) => {
      let q = db.from(t).select('*').eq('foyer_id', foyer());
      if (k === 'depenses') q = q.gte('date', depuis);
      const { data, error } = await q;
      if (error) throw error;
      return [k, data || []];
    }));
    for (const [k, l] of lots) D[k] = l;
    D.manque = false;
    sauver();
  } catch (e) {
    restaurer();
    if (tableAbsente(e)) { D.manque = true; return; }
    if (!isNetworkError(e)) throw e;
  }
  creerTaches().catch((e) => console.warn('carnet : tâches', e));
}
async function enregistrer(cle, ligne, options) {
  const r = await Sync.upsert(TABLES[cle], ligne, options);
  const l = D[cle];
  const i = l.findIndex((x) => x.id === r.id || (cle === 'vaccins' && x.member_id === r.member_id && x.dose === r.dose));
  if (i >= 0) l[i] = r; else l.push(r);
  sauver();
  return r;
}
async function retirer(cle, id) {
  await Sync.supprimer(TABLES[cle], id);
  D[cle] = D[cle].filter((x) => x.id !== id);
  sauver();
}
const aujourdhui = () => isoDate(new Date());

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
const champ = (libelle, html, cls = '') => `<label class="field ${cls}"><span>${esc(libelle)}</span>${html}</label>`;
const options = (liste, val) => liste.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
const optMembres = (val, tous = 'Tout le foyer') => options([['', tous], ...state.members.map((m) => [m.id, m.nom])], val);
const badge = (niveau, texte) => `<span class="carnet-badge ${niveau}">${esc(texte)}</span>`;
const titreSection = (titre, bouton = '') => `<div class="carnet-titre"><h3>${esc(titre)}</h3>${bouton}</div>`;
const boutonAjout = (act, libelle, data = '') => `<button class="btn small soft" data-act="${act}" ${data}>${ICON.plus} ${esc(libelle)}</button>`;
function texteEcheance(et) {
  if (et.niveau === 'aucune') return 'Sans date';
  if (et.jours === 0) return 'Aujourd\'hui';
  if (et.jours < 0) return `En retard de ${pl(-et.jours, 'jour')}`;
  if (et.jours <= DELAI_PROCHE) return et.jours === 1 ? 'Demain' : `Dans ${et.jours} jours`;
  return fmtDate(et.date);
}

function vueSante() {
  const auj = aujourdhui();
  const avenir = D.rdv.filter((r) => r.date >= auj).sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
  const passes = D.rdv.filter((r) => r.date < auj).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const ligneRdv = (r) => `<button class="carnet-ligne" data-act="carnet-rdv" data-id="${esc(r.id)}">
      <span class="carnet-ico">${IC.agenda}</span>
      <span class="grow"><b>${esc(r.titre)}</b><span class="muted small carnet-sous">${esc([nomMembre(state.members, r.member_id), r.lieu].filter(Boolean).join(' · ') || 'Tout le foyer')}</span></span>
      <span class="carnet-quand"><b>${esc(quand(r.date, auj))}</b>${r.heure ? `<span class="muted small">${esc(fmtHeure(r.heure))}</span>` : ''}</span></button>`;
  const rdv = `<section class="card carnet-carte">${titreSection('Rendez-vous médicaux', boutonAjout('carnet-rdv', 'Ajouter'))}
    ${avenir.length ? avenir.map(ligneRdv).join('') : '<p class="muted small carnet-vide">Aucun rendez-vous à venir. Ils apparaissent aussi dans l\'agenda de la famille.</p>'}
    ${passes.length ? `<details class="carnet-passes"><summary class="muted small">Rendez-vous passés (${passes.length})</summary>${passes.map(ligneRdv).join('')}</details>` : ''}</section>`;
  const membres = state.members.filter((m) => m.naissance).sort((a, b) => b.naissance.localeCompare(a.naissance));
  const carteVaccins = (m) => {
    const r = resumeVaccins(vaccinsPour(m, D.vaccins, auj));
    const lignes = [
      ...r.aFaire.map((v) => `<li>${badge(v.statut === 'retard' ? 'retard' : 'proche', v.statut === 'retard' ? 'En retard' : 'À faire')} <span><b>${esc(v.nom)}</b>, ${esc(v.dose)} <span class="muted">· ${esc(quandDose(v.age))}</span></span></li>`),
      ...r.prochains.map((v) => `<li>${badge('ok', fmtDate(v.cible, auj))} <span><b>${esc(v.nom)}</b>, ${esc(v.dose)} <span class="muted">· ${esc(quandDose(v.age))}</span></span></li>`),
    ];
    return `<div class="carnet-vaccin" data-membre="${esc(m.id)}">
      <div class="row"><span class="carnet-ico">${IC.seringue}</span><span class="grow"><b>${esc(m.nom)}</b><span class="muted small carnet-sous">${r.faits} dose${r.faits > 1 ? 's' : ''} notée${r.faits > 1 ? 's' : ''} sur ${r.total}</span></span>
      <button class="btn small" data-act="carnet-vaccins" data-membre="${esc(m.id)}">Carnet</button></div>
      <div class="carnet-barre" aria-hidden="true"><i style="width:${r.total ? Math.round((100 * r.faits) / r.total) : 0}%"></i></div>
      ${lignes.length ? `<ul class="carnet-doses">${lignes.join('')}</ul>` : '<p class="muted small">Aucune dose prévue prochainement.</p>'}
      ${r.anciens.length ? `<p class="muted small carnet-anciens">${pl(r.anciens.length, 'dose ancienne non notée', 'doses anciennes non notées')}. <button class="btn small" data-act="carnet-vaccins-anciens" data-membre="${esc(m.id)}">Tout marquer comme fait</button></p>` : ''}
    </div>`;
  };
  const vaccins = `<section class="card carnet-carte">${titreSection('Vaccins')}
    ${membres.length ? membres.map(carteVaccins).join('') : '<p class="muted small carnet-vide">Ajoute les dates de naissance dans Réglages › Mon foyer pour suivre les vaccins.</p>'}
    <p class="muted small carnet-note">D'après le calendrier des vaccinations 2025 (ministère de la Santé). Le médecin reste la référence, notamment pour les rattrapages.</p></section>`;
  return rdv + vaccins + carteContacts('sante');
}

function vueMaison() {
  const auj = aujourdhui();
  const blocs = Object.entries(CATEGORIES).map(([cat, c]) => {
    const liste = D.echeances.filter((e) => e.categorie === cat).map((e) => ({ e, et: etatEcheance(e, auj) }))
      .sort((a, b) => (a.et.date || '9999').localeCompare(b.et.date || '9999'));
    const lignes = liste.map(({ e, et }) => `<div class="carnet-ligne carnet-echeance" data-id="${esc(e.id)}">
        <button class="carnet-ligne-corps" data-act="carnet-echeance" data-id="${esc(e.id)}"><span class="carnet-ico">${c.icone}</span>
        <span class="grow"><b>${esc(e.titre)}</b><span class="muted small carnet-sous">${esc([e.sujet, libellePeriode(e.periode_nb, e.periode_unite)].filter(Boolean).join(' · '))}</span></span></button>
        <span class="carnet-fin">${badge(et.niveau, texteEcheance(et))}<button class="btn small" data-act="carnet-fait" data-id="${esc(e.id)}" aria-label="Marquer « ${esc(e.titre)} » comme fait">${ICON.check} Fait</button></span></div>`).join('');
    return `<section class="card carnet-carte">${titreSection(c.libelle, boutonAjout('carnet-echeance', 'Ajouter', `data-categorie="${cat}"`))}
      ${lignes || `<p class="muted small carnet-vide">${cat === 'animal' ? 'Vaccins, vermifuge, antiparasitaire, croquettes… pour les deux chiens.' : cat === 'vehicule' ? 'Contrôle technique, vidange, pneus…' : 'Chaudière, ramonage, filtres…'}</p>`}</section>`;
  });
  const tache = apiTaches() ? `Une tâche est créée ${DELAI_TACHE} jours avant chaque échéance.` : `Les échéances apparaissent dans l'agenda et dans le fil du jour.`;
  return `${blocs.join('')}<p class="muted small carnet-note">${tache} « Fait » reporte la suivante selon la périodicité.</p>`;
}

function vueBudget() {
  const auj = aujourdhui();
  const mois = moisBudget || moisDe(new Date());
  const b = budgetMois(mois, D, auj);
  const tete = `<div class="carnet-mois"><button class="icon-btn" data-act="carnet-mois" data-n="-1" aria-label="Mois précédent">${ICON.back}</button>
    <b>${esc(nomMois(mois))}</b><button class="icon-btn" data-act="carnet-mois" data-n="1" aria-label="Mois suivant">${ICON.next}</button></div>`;
  const pct = b.budget ? Math.min(100, Math.round((100 * b.total) / b.budget)) : 0;
  const total = `<section class="card carnet-carte carnet-total">${tete}
    <div class="carnet-chiffres"><div><span class="muted small">Total du mois</span><b class="carnet-gros" data-total>${esc(fmtEuros(b.total))}</b></div>
      <div><span class="muted small">${b.budget ? (b.reste >= 0 ? 'Reste' : 'Dépassement') : 'Budget'}</span><b class="${b.reste < 0 && b.budget ? 'carnet-rouge' : ''}">${b.budget ? esc(fmtEuros(Math.abs(b.reste))) : 'à définir'}</b></div></div>
    ${b.budget ? `<div class="carnet-barre ${b.reste < 0 ? 'depasse' : ''}" aria-hidden="true"><i style="width:${pct}%"></i></div><p class="muted small">${esc(fmtEuros(b.totalDepenses))} de dépenses saisies et ${esc(fmtEuros(b.totalPrelevements))} de prélèvements, pour un budget de ${esc(fmtEuros(b.budget))}.</p>` : ''}
    <div class="row wrap carnet-actions">${boutonAjout('carnet-depense', 'Dépense')}<button class="btn small" data-act="carnet-categories">Catégories et budgets</button></div></section>`;
  const cats = b.parCategorie.filter((c) => c.budget || c.depense);
  const categories = cats.length ? `<section class="card carnet-carte">${titreSection('Par catégorie')}${cats.map((c) => `<div class="carnet-cat">
      <div class="row"><span class="grow">${esc(c.nom)}</span><span class="small"><b>${esc(fmtEuros(c.depense))}</b>${c.budget ? ` <span class="muted">/ ${esc(fmtEuros(c.budget))}</span>` : ''}</span></div>
      ${c.budget ? `<div class="carnet-barre fine ${c.depasse ? 'depasse' : ''}" aria-hidden="true"><i style="width:${Math.min(100, Math.round(100 * c.part))}%"></i></div>` : ''}</div>`).join('')}</section>` : '';
  const nomCat = (id) => D.categories.find((c) => c.id === id)?.nom || 'Sans catégorie';
  const aVenir = `<section class="card carnet-carte">${titreSection('Prélèvements du mois', boutonAjout('carnet-abonnement', 'Abonnement'))}
    ${b.prelevements.length ? b.prelevements.map((p) => `<button class="carnet-ligne" data-act="carnet-abonnement" data-id="${esc(p.abonnement.id)}">
        <span class="grow"><b>${esc(p.abonnement.libelle)}</b><span class="muted small carnet-sous">${esc(libellePeriode(p.abonnement.periode_nb, p.abonnement.periode_unite))} · ${esc(nomCat(p.categorie_id))}</span></span>
        <span class="carnet-quand"><b>${esc(fmtEuros(p.montant))}</b><span class="muted small">${p.passe ? 'prélevé' : 'prévu'} ${esc(fmtDate(p.date, auj))}</span></span></button>`).join('')
      : '<p class="muted small carnet-vide">Loyer, électricité, box, assurances, Netflix… Ajoute-les une fois, ils reviennent chaque mois.</p>'}
    ${D.abonnements.some((a) => a.actif === false) ? `<p class="muted small">${pl(D.abonnements.filter((a) => a.actif === false).length, 'abonnement en pause', 'abonnements en pause')}.</p>` : ''}</section>`;
  const deps = `<section class="card carnet-carte">${titreSection('Dépenses saisies')}
    ${b.depenses.length ? b.depenses.map((d) => `<button class="carnet-ligne" data-act="carnet-depense" data-id="${esc(d.id)}">
        <span class="grow"><b>${esc(d.libelle || nomCat(d.categorie_id))}</b><span class="muted small carnet-sous">${esc(fmtDate(d.date, auj))} · ${esc(nomCat(d.categorie_id))}</span></span>
        <b>${esc(fmtEuros(d.montant))}</b></button>`).join('') : '<p class="muted small carnet-vide">Aucune dépense saisie ce mois-ci.</p>'}</section>`;
  return total + categories + aVenir + deps;
}

function carteContacts(groupe) {
  const liste = D.contacts.filter((c) => c.groupe === groupe).sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || a.nom.localeCompare(b.nom));
  const titre = groupe === 'sante' ? 'Contacts santé' : GROUPES[groupe];
  const lignes = liste.map((c) => {
    const href = telHref(c.telephone);
    return `<div class="carnet-ligne carnet-contact" data-id="${esc(c.id)}">
      <button class="carnet-ligne-corps" data-act="carnet-contact" data-id="${esc(c.id)}"><span class="grow"><b>${esc(c.nom)}</b><span class="muted small carnet-sous">${esc([c.role, fmtTel(c.telephone)].filter(Boolean).join(' · '))}</span></span></button>
      ${href ? `<a class="btn small primary carnet-appel" href="${esc(href)}" aria-label="Appeler ${esc(c.nom)}">${IC.tel} Appeler</a>` : ''}</div>`;
  }).join('');
  return `<section class="card carnet-carte" data-groupe="${groupe}">${titreSection(titre, boutonAjout('carnet-contact', 'Ajouter', `data-groupe="${groupe}"`))}
    ${lignes || `<p class="muted small carnet-vide">${groupe === 'sante' ? 'Médecin, pédiatre, dentiste, pharmacie…' : groupe === 'garde' ? 'Crèche, nounou, baby-sitter…' : 'Aucun contact pour l\'instant.'}</p>`}</section>`;
}
function vueContacts() {
  const urgences = `<section class="card carnet-carte carnet-urgences">${titreSection('Urgences')}
    <div class="carnet-urgences-grille">${URGENCES.map(([num, nom, detail]) => `<a class="carnet-urgence" href="${esc(telHref(num))}" aria-label="Appeler ${esc(nom)} (${esc(fmtTel(num))})">
      <b class="carnet-num">${esc(fmtTel(num))}</b><span><b>${esc(nom)}</b><span class="muted small carnet-sous">${esc(detail)}</span></span></a>`).join('')}</div></section>`;
  return urgences + ['garde', 'sante', 'voisins', 'autres'].map(carteContacts).join('');
}

function rendu() {
  const onglets = `<div class="chips carnet-onglets" role="tablist">${VUES.map(([id, l]) => `<button class="chip" role="tab" data-act="carnet-vue" data-vue="${id}" aria-pressed="${vue === id}">${esc(l)}</button>`).join('')}</div>`;
  const manque = D.manque ? `<section class="card carnet-carte carnet-alerte"><b>Le carnet attend sa base de données.</b>
    <p class="muted small">Colle le fichier supabase/migrations/2026-11-16_carnet.sql dans l'éditeur SQL de Supabase, puis recharge l'appli.</p></section>` : '';
  const corps = { sante: vueSante, maison: vueMaison, budget: vueBudget, contacts: vueContacts }[vue] || vueSante;
  return `<div class="carnet">${onglets}${manque}${corps()}</div>`;
}

// ---------------------------------------------------------------------------
// Feuilles de saisie
// ---------------------------------------------------------------------------
// Ouvre une feuille avec un formulaire ; lire(f) → ligne ou message d'erreur (string).
function feuille(titre, html, { cle, ligne, lire, apres, suppression }) {
  const el = openSheet(`${sheetHead(titre)}<form class="stack carnet-form" data-form="carnet-${cle}" novalidate>${html}
    <button class="btn primary block">Enregistrer</button>
    ${ligne?.id && suppression ? `<button type="button" class="btn danger block" data-x="del">${ICON.trash} Supprimer</button>` : ''}</form>`);
  const f = $('form', el);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const r = lire(f);
    if (typeof r === 'string') { toast(r); return; }
    try {
      const enr = await enregistrer(cle, { ...(ligne?.id ? { id: ligne.id } : {}), ...r });
      closeSheet();
      await apres?.(enr);
      render();
    } catch (err) { fail(err, 'Enregistrement impossible'); }
  });
  $('[data-x="del"]', el)?.addEventListener('click', async () => {
    if (!(await confirmSheet(suppression, 'Supprimer'))) return;
    try { await retirer(cle, ligne.id); closeSheet(); render(); } catch (err) { fail(err); }
  });
  return el;
}
const texte = (f, n) => f[n]?.value.trim() || null;

function feuilleRdv(r) {
  const v = r || { titre: '', member_id: '', date: aujourdhui(), heure: '', lieu: '', contact_id: '', note: '' };
  const sante = D.contacts.filter((c) => c.groupe === 'sante');
  return feuille(r ? 'Rendez-vous' : 'Nouveau rendez-vous', `
    ${champ('Rendez-vous', `<input class="input" name="titre" maxlength="80" required value="${esc(v.titre)}" placeholder="Ex. Pédiatre, dentiste, ophtalmo">`)}
    ${champ('Pour', `<select class="input" name="member_id">${optMembres(v.member_id)}</select>`)}
    <div class="grid2">${champ('Date', `<input class="input" type="date" name="date" required value="${esc(v.date)}">`)}${champ('Heure', `<input class="input" type="time" name="heure" value="${esc((v.heure || '').slice(0, 5))}">`)}</div>
    ${sante.length ? champ('Avec', `<select class="input" name="contact_id">${options([['', '—'], ...sante.map((c) => [c.id, `${c.nom}${c.role ? ` (${c.role})` : ''}`])], v.contact_id)}</select>`) : ''}
    ${champ('Lieu', `<input class="input" name="lieu" maxlength="120" value="${esc(v.lieu || '')}" placeholder="Cabinet, hôpital…">`)}
    ${champ('Note', `<input class="input" name="note" maxlength="300" value="${esc(v.note || '')}" placeholder="Ex. apporter le carnet de santé">`)}
    <p class="muted small">Inutile d'écrire des détails médicaux : le carnet sert à ne rien oublier.</p>`, {
    cle: 'rdv', ligne: r, suppression: 'Supprimer ce rendez-vous ?',
    lire: (f) => {
      const titre = texte(f, 'titre');
      if (!titre) return 'Indique le rendez-vous';
      if (!f.date.value) return 'Indique la date';
      const contact = sante.find((c) => c.id === f.contact_id?.value);
      return { titre, member_id: f.member_id.value || null, date: f.date.value, heure: f.heure.value || null, contact_id: contact?.id || null, lieu: texte(f, 'lieu') || contact?.adresse || null, note: texte(f, 'note') };
    },
    apres: () => toast('Rendez-vous enregistré'),
  });
}

function feuilleVaccins(membreId) {
  const m = memberById(membreId);
  if (!m) return null;
  const el = openSheet(`${sheetHead(`Vaccins de ${m.nom}`)}
    <button type="button" class="btn small block" data-x="tout">${ICON.check} Tout cocher jusqu'à aujourd'hui (sans date)</button><div data-liste></div>
    <p class="muted small">Coche une dose une fois faite ; la date reste modifiable. Source : calendrier des vaccinations 2025.</p>`, { full: false });
  const dessiner = () => {
    const doses = vaccinsPour(m, D.vaccins, aujourdhui()).filter((d) => d.statut !== 'expire' || d.id);
    const ages = [...new Set(doses.map((d) => d.age))];
    $('[data-liste]', el).innerHTML = ages.map((age) => `<h4 class="carnet-age">${esc(age === '6 à 13 mois après la 1re' ? 'HPV, 2e dose' : quandDose(age).replace(/^./, (x) => x.toUpperCase()))}</h4>${doses.filter((d) => d.age === age).map((d) => `
      <div class="carnet-dose ${d.statut}">
        <label class="check grow"><input type="checkbox" data-dose="${d.code}" ${d.statut === 'fait' ? 'checked' : ''}>
          <span><b>${esc(d.nom)}</b>, ${esc(d.dose)}${d.oblig ? '' : ' <span class="muted small">(recommandé)</span>'}${d.detail ? `<span class="muted small carnet-sous">${esc(d.detail)}</span>` : ''}</span></label>
        ${d.statut === 'fait' ? `<input class="input carnet-date" type="date" data-date="${d.code}" value="${esc(d.fait_le || '')}" aria-label="Date de la dose">`
          : badge(d.statut === 'a_venir' ? 'ok' : d.statut === 'a_faire' ? 'proche' : d.statut === 'retard' ? 'retard' : 'aucune', d.statut === 'a_venir' ? fmtDate(d.cible) : d.statut === 'a_faire' ? 'À faire' : d.statut === 'retard' ? 'En retard' : 'Non notée')}
      </div>`).join('')}`).join('');
  };
  dessiner();
  const ecrire = async (code, faitLe) => {
    const ex = D.vaccins.find((x) => x.member_id === m.id && x.dose === code);
    await enregistrer('vaccins', { ...(ex ? { id: ex.id } : {}), member_id: m.id, dose: code, fait_le: faitLe }, { onConflict: 'member_id,dose' });
  };
  $('[data-x="tout"]', el).addEventListener('click', async () => {
    const a = vaccinsPour(m, D.vaccins, aujourdhui()).filter((d) => ['a_faire', 'retard', 'ancien'].includes(d.statut));
    if (!a.length) { toast('Rien à cocher'); return; }
    try { for (const d of a) await ecrire(d.code, null); dessiner(); render(); toast(`${pl(a.length, 'dose notée', 'doses notées')}`); } catch (err) { fail(err); }
  });
  el.addEventListener('change', async (e) => {
    try {
      const c = e.target.closest('[data-dose]');
      const d = e.target.closest('[data-date]');
      if (c) {
        if (c.checked) await ecrire(c.dataset.dose, aujourdhui());
        else { const ex = D.vaccins.find((x) => x.member_id === m.id && x.dose === c.dataset.dose); if (ex) await retirer('vaccins', ex.id); }
      } else if (d) await ecrire(d.dataset.date, d.value || null);
      else return;
      dessiner();
      render();
    } catch (err) { fail(err); }
  });
  return el;
}

function feuilleEcheance(e, categorie = 'maison') {
  const cat = e?.categorie || categorie;
  const v = e || { titre: '', sujet: '', periode_nb: null, periode_unite: null, dernier: '', prochain: '', note: '' };
  const per = v.periode_nb && v.periode_unite ? `${v.periode_nb}:${v.periode_unite}` : '';
  const modeles = e ? '' : `<div class="field"><span>Modèles</span><div class="chips carnet-modeles">${MODELES[cat].map(([t, nb, u], i) => `<button type="button" class="chip" data-modele="${i}">${esc(t.replace(/ \(.*\)$/, ''))}</button>`).join('')}</div></div>`;
  const el = feuille(e ? titreEcheance(e) : `Nouvelle échéance · ${CATEGORIES[cat].libelle}`, `${modeles}
    ${champ('Quoi', `<input class="input" name="titre" maxlength="80" required value="${esc(v.titre)}" placeholder="Ex. Entretien de la chaudière">`)}
    ${champ(CATEGORIES[cat].sujet, `<input class="input" name="sujet" maxlength="60" value="${esc(v.sujet || '')}">`)}
    ${champ('Périodicité', `<select class="input" name="periode">${options(PERIODES, per)}</select>`)}
    <div class="grid2">${champ('Dernière fois', `<input class="input" type="date" name="dernier" value="${esc(v.dernier || '')}">`)}${champ('Prochaine fois', `<input class="input" type="date" name="prochain" value="${esc(v.prochain || '')}">`)}</div>
    <p class="muted small" data-calc></p>
    ${champ('Note', `<input class="input" name="note" maxlength="300" value="${esc(v.note || '')}" placeholder="Ex. société, référence du filtre, marque des croquettes">`)}`, {
    cle: 'echeances', ligne: e, suppression: 'Supprimer cette échéance ?',
    lire: (f) => {
      const titre = texte(f, 'titre');
      if (!titre) return 'Indique ce qu\'il faut faire';
      const [nb, unite] = f.periode.value ? f.periode.value.split(':') : [null, null];
      const base = { categorie: cat, titre, sujet: texte(f, 'sujet'), periode_nb: nb ? Number(nb) : null, periode_unite: unite, dernier: f.dernier.value || null, prochain: f.prochain.value || null, note: texte(f, 'note') };
      if (!base.prochain) base.prochain = prochaineDate(base);
      if (!base.prochain && !base.dernier) return 'Indique la prochaine date (ou la dernière fois)';
      if (e && base.prochain !== prochaineDate(e)) base.tache_pour = null; else if (e) base.tache_pour = e.tache_pour || null;
      return base;
    },
    apres: async () => { toast('Échéance enregistrée'); await creerTaches(); },
  });
  const f = $('form', el);
  const calc = () => {
    const [nb, unite] = f.periode.value ? f.periode.value.split(':') : [null, null];
    const p = !f.prochain.value && f.dernier.value && nb ? ajouterPeriode(f.dernier.value, Number(nb), unite) : null;
    $('[data-calc]', el).textContent = p ? `Prochaine fois calculée : ${fmtDate(p)}.` : '';
  };
  f.addEventListener('input', calc);
  f.addEventListener('change', calc);
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-modele]');
    if (!b) return;
    const [t, nb, u] = MODELES[cat][Number(b.dataset.modele)];
    f.titre.value = t;
    f.periode.value = `${nb}:${u}`;
    $$('[data-modele]', el).forEach((x) => x.setAttribute('aria-pressed', x === b));
    calc();
  });
  return el;
}

async function preparerCategories() {
  if (D.categories.length) return;
  for (const [i, nom] of CATEGORIES_BUDGET.entries()) await enregistrer('categories', { nom, montant: 0, ordre: i });
}
function feuilleCategories() {
  const el = openSheet(`${sheetHead('Catégories et budgets')}<form class="stack" data-form="carnet-categories" novalidate>
    <p class="muted small">Montant prévu chaque mois pour chaque catégorie ; laisse 0 pour suivre sans plafond.</p>
    <div data-liste class="stack"></div>
    <div class="row"><input class="input grow" name="nouvelle" maxlength="40" placeholder="Nouvelle catégorie" aria-label="Nouvelle catégorie"><button type="button" class="btn" data-x="ajouter">${ICON.plus}</button></div>
    <button class="btn primary block">Enregistrer</button></form>`);
  const f = $('form', el);
  const dessiner = () => {
    $('[data-liste]', el).innerHTML = [...D.categories].sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((c) => `<div class="row carnet-cat-ligne">
      <input class="input grow" data-nom="${esc(c.id)}" maxlength="40" value="${esc(c.nom)}" aria-label="Nom de la catégorie">
      <input class="input carnet-montant" data-montant="${esc(c.id)}" inputmode="decimal" value="${c.montant ? esc(String(c.montant).replace('.', ',')) : ''}" placeholder="0" aria-label="Budget mensuel de ${esc(c.nom)}">
      <span class="muted">€</span><button type="button" class="icon-btn" data-suppr="${esc(c.id)}" aria-label="Supprimer ${esc(c.nom)}">${ICON.trash}</button></div>`).join('');
  };
  dessiner();
  el.addEventListener('click', async (ev) => {
    try {
      if (ev.target.closest('[data-x="ajouter"]')) {
        const nom = f.nouvelle.value.trim();
        if (!nom) return;
        await enregistrer('categories', { nom, montant: 0, ordre: D.categories.length });
        f.nouvelle.value = '';
        dessiner();
      }
      const s = ev.target.closest('[data-suppr]');
      if (s && (await confirmSheet('Supprimer cette catégorie ? Ses dépenses passeront « sans catégorie ».', 'Supprimer'))) { await retirer('categories', s.dataset.suppr); dessiner(); }
    } catch (err) { fail(err); }
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      for (const c of D.categories) {
        const nom = $(`[data-nom="${c.id}"]`, el)?.value.trim() || c.nom;
        const brut = $(`[data-montant="${c.id}"]`, el)?.value.trim() || '';
        const montant = brut ? lireMontant(brut) : 0;
        if (montant === null) { toast(`Montant illisible pour « ${nom} »`); return; }
        if (nom !== c.nom || Number(c.montant) !== montant) await enregistrer('categories', { ...c, nom, montant });
      }
      closeSheet(); render(); toast('Budgets enregistrés');
    } catch (err) { fail(err); }
  });
  return el;
}
const optCategories = (val) => options([['', 'Sans catégorie'], ...[...D.categories].sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((c) => [c.id, c.nom])], val);

function feuilleDepense(d) {
  const v = d || { date: aujourdhui(), montant: '', categorie_id: '', libelle: '' };
  return feuille(d ? 'Dépense' : 'Nouvelle dépense', `
    <div class="grid2">${champ('Montant (€)', `<input class="input" name="montant" inputmode="decimal" required value="${v.montant ? esc(String(v.montant).replace('.', ',')) : ''}" placeholder="0,00">`)}${champ('Date', `<input class="input" type="date" name="date" required value="${esc(v.date)}">`)}</div>
    ${champ('Catégorie', `<select class="input" name="categorie_id">${optCategories(v.categorie_id)}</select>`)}
    ${champ('Libellé', `<input class="input" name="libelle" maxlength="80" value="${esc(v.libelle || '')}" placeholder="Ex. marché, pharmacie, plein d'essence">`)}`, {
    cle: 'depenses', ligne: d, suppression: 'Supprimer cette dépense ?',
    lire: (f) => {
      const montant = lireMontant(f.montant.value);
      if (!montant) return 'Montant illisible (ex. 12,50)';
      if (!f.date.value) return 'Indique la date';
      return { montant, date: f.date.value, categorie_id: f.categorie_id.value || null, libelle: texte(f, 'libelle') };
    },
    apres: (r) => { moisBudget = r.date.slice(0, 7); toast('Dépense enregistrée'); },
  });
}

function feuilleAbonnement(a) {
  const v = a || { libelle: '', montant: '', categorie_id: D.categories.find((c) => c.nom === 'Abonnements')?.id || '', date_ref: aujourdhui(), periode_nb: 1, periode_unite: 'mois', actif: true };
  const pers = PERIODES.filter(([p]) => /semaine|mois|an/.test(p));
  return feuille(a ? a.libelle : 'Nouvel abonnement', `
    ${champ('Abonnement ou prélèvement', `<input class="input" name="libelle" maxlength="60" required value="${esc(v.libelle)}" placeholder="Ex. électricité, box, assurance auto">`)}
    <div class="grid2">${champ('Montant (€)', `<input class="input" name="montant" inputmode="decimal" required value="${v.montant ? esc(String(v.montant).replace('.', ',')) : ''}" placeholder="0,00">`)}${champ('Prochain prélèvement', `<input class="input" type="date" name="date_ref" required value="${esc(v.date_ref)}">`)}</div>
    ${champ('Périodicité', `<select class="input" name="periode">${options(pers, `${v.periode_nb}:${v.periode_unite}`)}</select>`)}
    ${champ('Catégorie', `<select class="input" name="categorie_id">${optCategories(v.categorie_id)}</select>`)}
    <label class="check"><input type="checkbox" name="actif" ${v.actif !== false ? 'checked' : ''}> Actif (décoche pour le mettre en pause)</label>`, {
    cle: 'abonnements', ligne: a, suppression: 'Supprimer cet abonnement ?',
    lire: (f) => {
      const libelle = texte(f, 'libelle');
      const montant = lireMontant(f.montant.value);
      if (!libelle) return 'Indique le nom de l\'abonnement';
      if (!montant) return 'Montant illisible (ex. 13,49)';
      if (!f.date_ref.value) return 'Indique la date du prochain prélèvement';
      const [nb, unite] = f.periode.value.split(':');
      return { libelle, montant, date_ref: f.date_ref.value, periode_nb: Number(nb), periode_unite: unite, categorie_id: f.categorie_id.value || null, actif: f.actif.checked };
    },
    apres: () => toast('Abonnement enregistré'),
  });
}

function feuilleContact(c, groupe = 'autres') {
  const v = c || { nom: '', groupe, role: '', telephone: '', adresse: '', note: '' };
  const el = feuille(c ? c.nom : 'Nouveau contact', `
    ${champ('Nom', `<input class="input" name="nom" maxlength="60" required value="${esc(v.nom)}" placeholder="Ex. Dr Martin, crèche Les Lutins">`)}
    <div class="grid2">${champ('Groupe', `<select class="input" name="groupe">${options(Object.entries(GROUPES), v.groupe)}</select>`)}${champ('Rôle', `<input class="input" name="role" maxlength="40" list="carnet-roles" value="${esc(v.role || '')}" placeholder="Ex. Pédiatre">`)}</div>
    <datalist id="carnet-roles">${Object.values(ROLES).flat().map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
    ${champ('Téléphone', `<input class="input" type="tel" name="telephone" maxlength="30" value="${esc(v.telephone || '')}" placeholder="06 12 34 56 78">`)}
    ${champ('Adresse', `<input class="input" name="adresse" maxlength="160" value="${esc(v.adresse || '')}">`)}
    ${champ('Note', `<input class="input" name="note" maxlength="300" value="${esc(v.note || '')}" placeholder="Horaires, code de la porte…">`)}`, {
    cle: 'contacts', ligne: c, suppression: 'Supprimer ce contact ?',
    lire: (f) => {
      const nom = texte(f, 'nom');
      if (!nom) return 'Indique le nom';
      const tel = texte(f, 'telephone');
      if (tel && !telHref(tel)) return 'Numéro de téléphone illisible';
      return { nom, groupe: f.groupe.value, role: texte(f, 'role'), telephone: tel, adresse: texte(f, 'adresse'), note: texte(f, 'note'), ordre: c?.ordre ?? D.contacts.length };
    },
    apres: () => toast('Contact enregistré'),
  });
  return el;
}

// ---------------------------------------------------------------------------
// Enregistrement du module
// ---------------------------------------------------------------------------
const ouvrirCarnet = (v) => { vue = v; store.set('carnet:vue', v); if (state.tab !== 'carnet') switchTab('carnet'); else render(); };
Modules.register({
  id: 'carnet',
  // Dans Plus (consulté moins souvent) : l'onglet Famille garde quatre sous-menus qui tiennent sur une ligne.
  onglet: 'plus',
  segment: 'Carnet de la famille',
  ordre: 5,
  icone: I('<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h12"/><path d="M11 7.5v4M9 9.5h4"/>'),
  description: 'Santé, vaccins, maison, animaux, contacts',
  libelle: 'Carnet de la famille',
  tables: Object.fromEntries(Object.values(TABLES).map((t) => [t, t])),
  charger,
  rendu,
  actions: {
    'carnet-vue': (b) => ouvrirCarnet(b.dataset.vue || 'sante'),
    'carnet-rdv': (b) => feuilleRdv(D.rdv.find((r) => r.id === b.dataset.id) || null),
    'carnet-vaccins': (b) => { if (state.tab !== 'carnet' || vue !== 'sante') ouvrirCarnet('sante'); feuilleVaccins(b.dataset.membre); },
    'carnet-vaccins-anciens': async (b) => {
      const m = memberById(b.dataset.membre);
      const anciens = resumeVaccins(vaccinsPour(m, D.vaccins, aujourdhui())).anciens;
      if (!anciens.length || !(await confirmSheet(`Marquer ${pl(anciens.length, 'dose ancienne', 'doses anciennes')} de ${m.nom} comme faite${anciens.length > 1 ? 's' : ''}, sans date ?`, 'Marquer', false))) return;
      try { for (const v of anciens) await enregistrer('vaccins', { member_id: m.id, dose: v.code, fait_le: null }, { onConflict: 'member_id,dose' }); render(); toast('Doses notées'); } catch (e) { fail(e); }
    },
    'carnet-echeance': (b) => feuilleEcheance(D.echeances.find((e) => e.id === b.dataset.id) || null, b.dataset.categorie),
    'carnet-fait': async (b) => {
      const e = D.echeances.find((x) => x.id === b.dataset.id);
      if (!e) return;
      try {
        const r = await enregistrer('echeances', marquerFait(e, aujourdhui()));
        render();
        toast(r.prochain ? `C'est noté. Prochaine fois : ${fmtDate(r.prochain)}` : 'C\'est noté');
      } catch (err) { fail(err); }
    },
    'carnet-mois': (b) => { moisBudget = decalerMois(moisBudget || moisDe(new Date()), Number(b.dataset.n)); render(); },
    'carnet-depense': async (b) => { try { if (!b.dataset.id) await preparerCategories(); } catch (e) { fail(e); return; } feuilleDepense(D.depenses.find((d) => d.id === b.dataset.id) || null); },
    'carnet-categories': async () => { try { await preparerCategories(); } catch (e) { fail(e); return; } feuilleCategories(); },
    'carnet-abonnement': (b) => feuilleAbonnement(D.abonnements.find((a) => a.id === b.dataset.id) || null),
    'carnet-contact': (b) => feuilleContact(D.contacts.find((c) => c.id === b.dataset.id) || null, b.dataset.groupe),
  },
  sourcesAccueil: (ctx) => rappelsDuJour(D, ctx.iso, state.members),
  agenda: (debut, fin) => elementsAgenda(D, isoDate(debut), isoDate(fin), state.members),
  notifications: [
    { type: 'carnet-rdv', libelle: 'Rendez-vous médicaux', description: 'La veille de chaque rendez-vous.' },
    { type: 'carnet-vaccins', libelle: 'Vaccins à faire', description: 'Quand une dose du calendrier vaccinal arrive.' },
    { type: 'carnet-echeances', libelle: 'Échéances de la maison et des animaux', description: 'Chaudière, contrôle technique, vermifuge, croquettes…' },
    { type: 'carnet-prelevements', libelle: 'Prélèvements à venir', description: 'La veille d\'un prélèvement.', defaut: false },
  ],
  expose: {
    VACCINS, ajouterMois, fmtHeure, quandDose, ajouterPeriode, ecartJours, lireMontant, fmtEuros, libellePeriode, telHref, fmtTel, quand,
    vaccinsPour, resumeVaccins, prochaineDate, etatEcheance, marquerFait, tachesACreer, occurrences, budgetMois, rappelsDuJour, elementsAgenda,
  },
});
