// Module « Tâches et listes » (Famille › Tâches & listes).
// - Tâches ponctuelles : responsable, échéance (et heure), « importante », notes.
//   Tâches récurrentes sans rotation : cocher une tâche récurrente crée sa prochaine occurrence.
// - Listes libres partagées (valise, cadeaux, bricolage, films…), cochées en direct (Supabase Realtime).
// - Listes types réutilisables (Avant départ, Avant nounou, Valise ski, Valise plage, Mode vacances) :
//   fournies pré-remplies, modifiables ; « lancer » une liste type crée une copie à cocher.
// - Listes d'envies de cadeaux par membre ; « je m'en occupe » est rangé dans une table à part
//   (envies_reservations) que la personne concernée ne peut pas lire (RLS, voir la migration).
// - Bouton « + » : « sortir les poubelles mardi », « appeler le véto avant vendredi Antoine ».
// - Fil de l'Accueil : tâches du jour et en retard. Agenda : tâches datées.
//
// API publique pour les autres modules (le carnet, par exemple : échéance maison → tâche) :
//   await Taches.creer({ titre, echeance?: 'AAAA-MM-JJ', heure?: 'HH:MM', responsable?: member_id, notes?, priorite?: 0|1,
//                        recurrence?: { freq: 'jour'|'semaine'|'mois'|'an', n: 1 }, origine?: 'carnet', origine_id?: 'chaudiere' })
//     → la tâche enregistrée. Avec origine + origine_id, une tâche ouverte de même origine est mise à jour (pas de doublon).
//   await Taches.terminer(id) ; await Taches.supprimerOrigine(origine, origine_id) ;
//   Taches.liste({ ouvertes: true }) → tâches en mémoire ; Taches.ouvrir(id) → feuille de la tâche ;
//   await Taches.lancerListe(cle, { date_debut, date_fin }) → liste créée depuis une liste type.
// ---------------------------------------------------------------------------
const cache = Modules.cache('taches');
const D = { taches: [], listes: [], elements: [], envies: [], resas: [], ok: false };
const ui = { vue: store.get('taches:vue', 'taches'), filtre: 'tous', faites: false, ouverte: null, membreEnvies: null };
let pretResoudre;
const pret = new Promise((r) => { pretResoudre = r; });

// ---------------------------------------------------------------------------
// Fonctions pures (testées dans tests/unit/taches.test.js)
// ---------------------------------------------------------------------------
const aplatir = (s) => s.split('').map((c) => c.toLowerCase().normalize('NFD')[0] || c).join('');
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const isoVersDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const ecartJours = (a, b) => Math.round((isoVersDate(b) - isoVersDate(a)) / 864e5);
const plusJours = (iso, n) => isoDate(addDays(isoVersDate(iso), n));
const joursDuMois = (an, mois) => new Date(an, mois + 1, 0).getDate();
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Verbes d'action qui annoncent une tâche (forme sans accent, premier mot de la phrase).
const VERBES_TACHE = new Set(['sortir', 'rentrer', 'appeler', 'rappeler', 'telephoner', 'reserver', 'payer', 'regler', 'ranger', 'nettoyer', 'laver', 'faire',
  'envoyer', 'reparer', 'changer', 'vider', 'tondre', 'arroser', 'remplir', 'renouveler', 'deposer', 'recuperer', 'inscrire', 'commander', 'poster',
  'imprimer', 'signer', 'preparer', 'trier', 'passer', 'aller', 'contacter', 'ecrire', 'repondre', 'verifier', 'organiser', 'demander', 'chercher',
  'rendre', 'rapporter', 'installer', 'nourrir', 'promener', 'brosser', 'vacciner', 'vermifuger', 'repasser', 'plier', 'aspirer', 'descendre',
  'monter', 'porter', 'resilier', 'declarer', 'remplacer', 'purger', 'ramoner', 'entretenir', 'emmener', 'amener', 'planter', 'tailler', 'degivrer',
  'detartrer', 'mettre', 'donner', 'finir', 'terminer', 'demonter', 'peindre', 'fixer', 'accrocher', 'jeter', 'recycler', 'relancer', 'confirmer',
  'annuler', 'prevenir', 'inviter', 'souhaiter', 'feter', 'telecharger', 'scanner', 'classer', 'faxer', 'renvoyer', 'retourner', 'echanger', 'recharger']);
const RE_INTRO = /^(?:il faut |faut |penser a |pense a |ne pas oublier (?:de |d['’])|n['’]oublie pas (?:de |d['’])|rappel ?: ?|tache ?: ?|todo ?: ?|a faire ?: ?)/;
const RE_REC = / (?:tous les|toutes les|chaque) (?:(\d{1,3}) )?(jours?|semaines?|mois|ans|annees?|matins?|soirs?|lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?)(?= )/;
const RE_LIMITE = / (?:avant|d['’]ici|au plus tard|pour)(?= (?:le |ce )?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apres|aujourd|ce soir|ce midi|ce matin|1er|\d))/;
const RE_PRIORITE = / (?:urgent|urgente|important|importante|prioritaire)(?= )/;

// Analyse d'une phrase libre en tâche : titre, échéance, heure, responsable, priorité, récurrence et score (0-1).
// analyseTache('appeler le véto avant vendredi Antoine', { maintenant, membres })
//   → { titre: 'Appeler le véto', echeance: '2026-10-23', heure: null, responsable: idAntoine, priorite: 0, recurrence: null, score: 0.85 }
function analyseTache(texte, { maintenant = new Date(), membres = [] } = {}) {
  let t = ` ${String(texte || '').replace(/\s+/g, ' ').trim()} `;
  const couper = (m) => { t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`; };
  const aujourdhui = isoDate(maintenant);
  let recurrence = null;
  let jourSemaine = null;
  let priorite = 0;
  let limite = false;
  let m = aplatir(t).match(RE_REC);
  if (m) {
    const n = Math.max(1, Number(m[1] || 1));
    const u = m[2];
    if (/^(jour|matin|soir)/.test(u)) recurrence = { freq: 'jour', n };
    else if (/^semaine/.test(u)) recurrence = { freq: 'semaine', n };
    else if (u === 'mois') recurrence = { freq: 'mois', n };
    else if (/^(an|annee)/.test(u)) recurrence = { freq: 'an', n };
    else { recurrence = { freq: 'semaine', n }; jourSemaine = JOURS.indexOf(u.replace(/s$/, '')); }
    couper(m);
  }
  if (/!/.test(t)) { priorite = 1; t = t.replace(/!+/g, ' '); }
  if ((m = aplatir(t).match(RE_PRIORITE))) { priorite = 1; couper(m); }
  if ((m = aplatir(t).match(RE_LIMITE))) { limite = true; couper(m); }
  const p = analysePhrase(t, { maintenant, membres });
  let echeance = p.date;
  if (!echeance && jourSemaine != null) echeance = plusJours(aujourdhui, (jourSemaine - maintenant.getDay() + 7) % 7);
  if (recurrence?.freq === 'mois' && echeance) recurrence.jour = isoVersDate(echeance).getDate();
  let titre = p.texte;
  const intro = aplatir(titre).match(RE_INTRO);
  if (intro) titre = titre.slice(intro[0].length);
  for (let i = 0; i < 3; i++) titre = titre.replace(/[\s,;:.–-]+$/, '').replace(/\s+(?:le|la|les|de|du|des|d['’]|a|à|au|et|pour|avec)$/i, '');
  titre = majuscule(titre.replace(/^[\s,;:.–-]+/, '').trim());
  const premier = aplatir(titre).split(/[\s'’]/)[0];
  const verbe = VERBES_TACHE.has(premier);
  const rdv = /^prendre (?:un )?(?:rendez-vous|rdv)\b/.test(aplatir(titre));
  let score;
  if (!titre) score = 0;
  else if (intro || rdv || (verbe && (limite || recurrence))) score = 0.85;
  else if (verbe) score = 0.75;
  else if (limite) score = 0.6;
  else if (recurrence) score = 0.45;
  else if (/[,;+]/.test(titre)) score = 0.1;
  else if (echeance) score = 0.4;
  else score = 0.2;
  return { titre, echeance, heure: p.heure, responsable: p.membres[0] || null, priorite, recurrence, score };
}

// Date suivante d'une récurrence, toujours après aujourd'hui (une tâche en retard reprend au prochain créneau).
function prochaineEcheance(echeance, rec, aujourdhui) {
  if (!rec || !rec.freq) return null;
  const n = Math.max(1, Number(rec.n) || 1);
  let d = echeance || aujourdhui;
  const jourRef = rec.jour || isoVersDate(d).getDate();
  const avancer = (iso) => {
    const x = isoVersDate(iso);
    if (rec.freq === 'jour') return plusJours(iso, n);
    if (rec.freq === 'semaine') return plusJours(iso, 7 * n);
    const an = x.getFullYear() + (rec.freq === 'an' ? n : 0);
    const mois = x.getMonth() + (rec.freq === 'mois' ? n : 0);
    const cible = new Date(an, mois, 1);
    cible.setDate(Math.min(rec.freq === 'mois' ? jourRef : x.getDate(), joursDuMois(cible.getFullYear(), cible.getMonth())));
    if (rec.freq === 'an') cible.setDate(Math.min(jourRef, joursDuMois(cible.getFullYear(), cible.getMonth())));
    return isoDate(cible);
  };
  for (let i = 0; i < 5000; i++) { d = avancer(d); if (d > aujourdhui) return d; }
  return d;
}

function libelleRecurrence(rec) {
  if (!rec || !rec.freq) return '';
  const n = Math.max(1, Number(rec.n) || 1);
  const L = { jour: ['Chaque jour', `Tous les ${n} jours`], semaine: ['Chaque semaine', `Toutes les ${n} semaines`], mois: ['Chaque mois', `Tous les ${n} mois`], an: ['Chaque année', `Tous les ${n} ans`] }[rec.freq];
  return L ? L[n === 1 ? 0 : 1] : '';
}

// Échéance lisible : « Aujourd'hui », « Demain », « Hier », « Vendredi » (dans la semaine) ou « ven. 23 oct. ».
function libelleEcheance(iso, aujourdhui) {
  if (!iso) return '';
  const e = ecartJours(aujourdhui, iso);
  if (e === 0) return 'Aujourd\'hui';
  if (e === 1) return 'Demain';
  if (e === -1) return 'Hier';
  const d = isoVersDate(iso);
  if (e > 1 && e < 7) return majuscule(JOURS[d.getDay()]);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== isoVersDate(aujourdhui).getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('fr-FR', opts);
}

const trierTaches = (a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999') || (a.heure || '99').localeCompare(b.heure || '99')
  || (b.priorite || 0) - (a.priorite || 0) || String(a.titre).localeCompare(String(b.titre), 'fr');

// Tâches ouvertes rangées : En retard, Aujourd'hui, Demain, Cette semaine, Plus tard, Sans échéance (groupes vides omis).
function groupesTaches(taches, aujourdhui) {
  const G = [['retard', 'En retard'], ['jour', 'Aujourd\'hui'], ['demain', 'Demain'], ['semaine', 'Cette semaine'], ['tard', 'Plus tard'], ['sans', 'Sans échéance']];
  const cle = (t) => {
    if (!t.echeance) return 'sans';
    const e = ecartJours(aujourdhui, t.echeance);
    return e < 0 ? 'retard' : e === 0 ? 'jour' : e === 1 ? 'demain' : e < 7 ? 'semaine' : 'tard';
  };
  return G.map(([c, titre]) => ({ cle: c, titre, taches: taches.filter((t) => !t.fait && cle(t) === c).sort(trierTaches) })).filter((g) => g.taches.length);
}

const progression = (elements) => {
  const total = elements.length;
  const faits = elements.filter((e) => e.coche).length;
  return { faits, total, pct: total ? Math.round((100 * faits) / total) : 0 };
};

// Sections d'une liste, dans l'ordre de leur premier élément (les éléments sans section d'abord).
function sectionsDe(elements) {
  const tri = [...elements].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const out = [];
  for (const e of tri) {
    const s = e.section || '';
    let g = out.find((x) => x.section === s);
    if (!g) { g = { section: s, elements: [] }; out.push(g); }
    g.elements.push(e);
  }
  return out.sort((a, b) => (a.section ? 1 : 0) - (b.section ? 1 : 0));
}

const fmtJourMois = (iso) => isoVersDate(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
// « Vacances du 19 au 26 décembre », « Vacances du 30 décembre au 4 janvier ».
function titreVacances(debut, fin, base = 'Vacances') {
  if (!debut) return base;
  if (!fin || fin === debut) return `${base} du ${fmtJourMois(debut)}`;
  const a = isoVersDate(debut), b = isoVersDate(fin);
  const memeMois = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const jourA = a.getDate() === 1 ? '1er' : String(a.getDate());
  return `${base} du ${memeMois ? jourA : fmtJourMois(debut).replace(/^1 /, '1er ')} au ${fmtJourMois(fin).replace(/^1 /, '1er ')}`;
}

// Copie d'une liste type en liste à cocher : nouvelle liste et ses éléments décochés.
function copieModele(modele, elements, { titre, date_debut = null, date_fin = null, nouvelId = uid } = {}) {
  const id = nouvelId();
  const t = titre || (modele.genre === 'vacances' && date_debut ? titreVacances(date_debut, date_fin) : modele.titre);
  const liste = { id, titre: t, genre: modele.genre || 'libre', est_modele: false, cle: null, modele_id: modele.id && !String(modele.id).startsWith('modele:') ? modele.id : null,
    date_debut, date_fin, archivee: false };
  const els = [...elements].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map((e, i) => ({ id: nouvelId(), liste_id: id, texte: e.texte, section: e.section || null, coche: false, coche_par: null, coche_le: null, ordre: i }));
  return { liste, elements: els };
}

// Réservation d'une envie visible par le compte courant ? Jamais pour la personne concernée (double sécurité, la RLS filtre déjà),
// ni pour un compte pas encore relié à son profil : il pourrait être la personne concernée.
const reservationVisible = (envie, resa, monMembre) => !!monMembre && !!resa && resa.envie_id === envie.id && envie.member_id !== monMembre;

// Éléments du fil de l'Accueil : tâches du jour et en retard (pour la personne, ou pour toute la famille).
function elementsAccueil(taches, { iso, membre = null, famille = false, nom = () => '' } = {}) {
  return taches.filter((t) => !t.fait && t.echeance && t.echeance <= iso && (famille || !membre || !t.responsable || t.responsable === membre.id))
    .sort(trierTaches).map((t) => {
      const retard = t.echeance < iso;
      const qui = t.responsable ? nom(t.responsable) : '';
      return { heure: t.heure || null, titre: t.titre, detail: [retard ? `En retard (${libelleEcheance(t.echeance, iso).toLowerCase()})` : 'À faire aujourd\'hui', qui].filter(Boolean).join(' · '),
        icone: ICON.check, act: 'taches-ouvrir', data: { id: t.id }, priorite: retard ? 2 : t.priorite ? 1 : 0 };
    });
}

// ---------------------------------------------------------------------------
// Listes types fournies (modifiables : la première modification en garde une copie pour le foyer)
// ---------------------------------------------------------------------------
const MODELES = [
  { cle: 'avant-depart', titre: 'Avant départ', genre: 'depart', description: 'Pour partir l\'esprit tranquille, même pour un week-end.', sections: {
    Maison: ['Fermer les fenêtres et les volets', 'Baisser le chauffage', 'Éteindre les lumières', 'Débrancher les appareils en veille', 'Vider la poubelle', 'Fermer la porte à clé'],
    Affaires: ['Clés, papiers et cartes bancaires', 'Chargeurs de téléphone', 'Doudou et tétines de Zoé', 'Couches et lingettes', 'Médicaments', 'Eau et goûters pour la route'],
    Chiens: ['Laisses et colliers', 'Croquettes et gamelles', 'Sacs à crottes'],
    Voiture: ['Siège auto de Zoé', 'Faire le plein'],
  } },
  { cle: 'avant-nounou', titre: 'Avant nounou', genre: 'nounou', description: 'Tout ce que la nounou doit trouver en arrivant.', sections: {
    Zoé: ['Repas et goûter préparés', 'Gourde d\'eau remplie', 'Couches et lingettes en place', 'Un change complet', 'Doudou et tétine', 'Médicaments et posologie notés si besoin'],
    Consignes: ['Horaires de la journée notés', 'Heure de retour prévue indiquée', 'Allergies et consignes rappelées', 'Numéros d\'urgence affichés', 'Carnet de santé à portée de main', 'Clés ou code d\'entrée transmis'],
    Chiens: ['Chiens sortis et nourris', 'Consignes pour les chiens laissées'],
  } },
  { cle: 'valise-ski', titre: 'Valise ski', genre: 'ski', description: 'Pour la montagne en hiver, avec Zoé et les chiens.', sections: {
    Vêtements: ['Combinaison de ski de Zoé', 'Vestes de ski', 'Pantalons de ski', 'Sous-vêtements thermiques', 'Polaires', 'Chaussettes de ski', 'Gants et moufles', 'Bonnets et cache-cous', 'Après-skis', 'Pyjamas'],
    Équipement: ['Casques', 'Masques et lunettes de soleil', 'Forfaits', 'Luge', 'Porte-bébé'],
    Soins: ['Crème solaire haute protection', 'Stick à lèvres', 'Crème hydratante', 'Trousse à pharmacie'],
    Chiens: ['Croquettes', 'Manteaux des chiens', 'Serviette pour les chiens'],
  } },
  { cle: 'valise-plage', titre: 'Valise plage', genre: 'plage', description: 'Pour la mer ou le lac en été.', sections: {
    Vêtements: ['Maillots de bain', 'Maillot couche de Zoé', 'T-shirts anti-UV', 'Chapeaux et casquettes', 'Shorts et robes légères', 'Sandales', 'Pyjamas'],
    Plage: ['Serviettes de plage', 'Tente anti-UV ou parasol', 'Seau, pelle et râteau', 'Brassards', 'Glacière'],
    Soins: ['Crème solaire', 'Après-soleil', 'Lunettes de soleil', 'Anti-moustiques', 'Trousse à pharmacie'],
    Chiens: ['Gamelle pliable et eau', 'Croquettes', 'Laisses'],
  } },
  { cle: 'vacances', titre: 'Mode vacances', genre: 'vacances', description: 'Valise, maison et courses de départ, avec les dates du séjour.', sections: {
    Valise: ['Vêtements pour tout le séjour', 'Pyjamas', 'Affaires de toilette', 'Médicaments et ordonnances', 'Papiers d\'identité et cartes Vitale', 'Chargeurs', 'Doudou et tétines de Zoé', 'Couches et lingettes', 'Jouets et livres pour la route'],
    Chiens: ['Garde des chiens organisée ou affaires prêtes', 'Croquettes pour tout le séjour', 'Carnets de santé des chiens', 'Laisses et gamelles'],
    Maison: ['Fermer les volets', 'Arroser les plantes ou les confier', 'Sortir les poubelles', 'Faire suivre ou relever le courrier', 'Vider le réfrigérateur', 'Couper l\'eau', 'Mettre le chauffage en hors-gel', 'Débrancher les appareils', 'Prévenir un voisin', 'Fermer à clé'],
    'Courses de départ': ['Eau et goûters pour la route', 'Petits pots et lait de Zoé', 'Pique-nique du trajet', 'Croquettes', 'Crème solaire'],
  } },
];
const elementsModele = (m) => Object.entries(m.sections).flatMap(([section, l]) => l.map((texte) => ({ texte, section })))
  .map((e, i) => ({ ...e, id: `m:${m.cle}:${i}`, liste_id: `modele:${m.cle}`, ordre: i, coche: false }));

const GENRES = {
  libre: { libelle: 'Liste', icone: I('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>') },
  valise: { libelle: 'Valise', icone: I('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>') },
  cadeaux: { libelle: 'Cadeaux', icone: I('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5"/>') },
  bricolage: { libelle: 'Bricolage', icone: I('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>') },
  films: { libelle: 'Films', icone: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>') },
  vacances: { libelle: 'Vacances', icone: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>') },
  depart: { libelle: 'Départ', icone: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>') },
  nounou: { libelle: 'Nounou', icone: ICON.heart },
  ski: { libelle: 'Ski', icone: I('<path d="m3 20 6.5-11 4 6.5L16 12l5 8z"/>') },
  plage: { libelle: 'Plage', icone: I('<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9zM12 12v7a2 2 0 0 0 4 0"/>') },
};
const GENRES_LIBRES = ['libre', 'valise', 'cadeaux', 'bricolage', 'films', 'vacances'];
const iconeGenre = (g) => (GENRES[g] || GENRES.libre).icone;
const REC_CHOIX = [['', 'Une seule fois'], ['jour:1', 'Chaque jour'], ['semaine:1', 'Chaque semaine'], ['semaine:2', 'Toutes les 2 semaines'], ['mois:1', 'Chaque mois'],
  ['mois:3', 'Tous les 3 mois'], ['mois:6', 'Tous les 6 mois'], ['an:1', 'Chaque année']];

// ---------------------------------------------------------------------------
// Données : chargement, cache hors ligne, écritures (Sync et lots)
// ---------------------------------------------------------------------------
const aujourdhui = () => isoDate(new Date());
const maintenantIso = () => new Date().toISOString();
const monMembre = () => state.compte?.member_id || null;
const nomMembre = (id) => memberById(id)?.nom || '';
function nomCompte(userId) {
  if (!userId) return '';
  if (userId === me()) return 'toi';
  const c = state.comptes.find((x) => x.user_id === userId);
  return nomMembre(c?.member_id) || (c?.email ? c.email.split('@')[0] : 'quelqu\'un');
}
const sauverCache = () => cache.set('donnees', { taches: D.taches, listes: D.listes, elements: D.elements, envies: D.envies, resas: D.resas });
const remplacer = (tab, ligne) => { const i = tab.findIndex((x) => x.id === ligne.id); if (i >= 0) tab[i] = { ...tab[i], ...ligne }; else tab.push(ligne); return ligne; };

async function enregistrer(table, tab, ligne, opts) {
  const l = await Sync.upsert(table, { ...ligne, updated_at: maintenantIso() }, opts);
  remplacer(tab, l);
  sauverCache();
  return l;
}
async function retirer(table, tab, id) {
  await Sync.supprimer(table, id);
  const i = tab.findIndex((x) => x.id === id);
  if (i >= 0) tab.splice(i, 1);
  sauverCache();
}
// Écriture groupée (lancer une liste type : une seule requête) ; hors ligne, chaque ligne part dans la file.
async function ecrireLot(table, lignes) {
  if (!lignes.length) return [];
  const rows = lignes.map((l) => ({ ...own(), ...l, updated_at: maintenantIso() }));
  try {
    const { data, error } = await db.from(table).upsert(rows, { onConflict: 'id' }).select();
    if (error) throw error;
    return data;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    for (const row of rows) Queue.push({ type: 'upsert', table, row, onConflict: 'id' });
    return rows;
  }
}

async function charger(force, { horsLigne } = {}) {
  if (horsLigne) {
    Object.assign(D, cache.get('donnees', {}), { ok: true });
    pretResoudre();
    return;
  }
  try {
    const depuis = new Date(Date.now() - 30 * 864e5).toISOString();
    const [t, l, e, v, r] = await Promise.all([
      db.from(T.taches).select('*').eq('foyer_id', foyer()).or(`fait.eq.false,fait_le.gte.${depuis}`),
      db.from(T.listes).select('*').eq('foyer_id', foyer()),
      db.from(T.liste_elements).select('*').eq('foyer_id', foyer()),
      db.from(T.envies).select('*').eq('foyer_id', foyer()),
      db.from(T.envies_reservations).select('*').eq('foyer_id', foyer()),
    ]);
    for (const x of [t, l, e, v, r]) if (x.error) throw x.error;
    Object.assign(D, { taches: t.data, listes: l.data, elements: e.data, envies: v.data, resas: r.data, ok: true });
    sauverCache();
    if (!state.comptes.length) Foyer.loadComptes().catch(() => {});
    TempsReel.abonner();
  } catch (err) {
    if (isNetworkError(err)) Object.assign(D, cache.get('donnees', {}), { ok: true });
    throw err;
  } finally {
    pretResoudre();
  }
}

// Cochage en direct : changements des autres téléphones reçus par Supabase Realtime.
const TempsReel = {
  canal: null,
  foyer: null,
  tableaux: () => ({ [T.taches]: D.taches, [T.listes]: D.listes, [T.liste_elements]: D.elements, [T.envies]: D.envies }),
  abonner() {
    if (typeof db.channel !== 'function' || !foyer()) return;
    if (this.canal && this.foyer === foyer()) return;
    this.desabonner();
    try {
      this.foyer = foyer();
      this.canal = db.channel(`taches-${foyer()}`);
      for (const table of Object.keys(this.tableaux())) {
        this.canal.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => this.recevoir({ table, eventType: p.eventType, new: p.new, old: p.old }));
      }
      this.canal.subscribe();
    } catch (e) { console.warn('temps réel des listes', e); this.canal = null; }
  },
  desabonner() { if (this.canal) { try { db.removeChannel(this.canal); } catch { /* déjà fermé */ } } this.canal = null; },
  recevoir({ table, eventType, new: nouveau, old }) {
    const tab = this.tableaux()[table];
    if (!tab) return;
    if (eventType === 'DELETE') {
      const i = tab.findIndex((x) => x.id === old?.id);
      if (i >= 0) tab.splice(i, 1);
      if (table === T.listes) D.elements = D.elements.filter((x) => x.liste_id !== old?.id);
    } else if (nouveau?.id && (!nouveau.foyer_id || nouveau.foyer_id === foyer())) remplacer(tab, nouveau);
    sauverCache();
    rafraichir();
  },
};

// Nouveau rendu de l'écran sans perdre une saisie en cours : on ne retouche alors que les cases à cocher.
function rafraichir() {
  if (state.tab !== 'taches' || sheets.length) return;
  const actif = document.activeElement;
  if (actif && actif.closest?.('#main') && /^(INPUT|TEXTAREA|SELECT)$/.test(actif.tagName)) {
    for (const e of D.elements) {
      const b = document.querySelector(`[data-act="taches-el-cocher"][data-id="${e.id}"]`);
      if (!b) continue;
      b.setAttribute('aria-checked', String(!!e.coche));
      b.closest('.taches-el')?.classList.toggle('fait', !!e.coche);
    }
    return;
  }
  render();
}
let dernierRafraichissement = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.loaded || !navigator.onLine || Date.now() - dernierRafraichissement < 30000) return;
  dernierRafraichissement = Date.now();
  charger(true, { horsLigne: false }).then(rafraichir).catch(() => {});
});

// ---------------------------------------------------------------------------
// Tâches : création, cochage (récurrence), feuille d'édition
// ---------------------------------------------------------------------------
const champsTache = (t) => ({ id: t.id, titre: String(t.titre || '').trim().slice(0, 200), notes: t.notes || null, responsable: t.responsable || null, echeance: t.echeance || null,
  heure: t.heure || null, priorite: t.priorite ? 1 : 0, recurrence: t.recurrence || null, fait: !!t.fait, fait_le: t.fait_le || null, fait_par: t.fait_par || null,
  precedente_id: t.precedente_id || null, origine: t.origine || null, origine_id: t.origine_id != null ? String(t.origine_id) : null });

async function creerTache(donnees) {
  await pret;
  if (!String(donnees.titre || '').trim()) throw new Error('tâche sans titre');
  let base = null;
  if (donnees.origine && donnees.origine_id != null) base = D.taches.find((t) => !t.fait && t.origine === donnees.origine && t.origine_id === String(donnees.origine_id));
  const avant = base || D.taches.find((t) => t.id === donnees.id) || null;
  const t = await enregistrer(T.taches, D.taches, champsTache({ ...(base || {}), ...donnees, id: base?.id || donnees.id }));
  prevenirResponsable(t, avant).catch(() => {});
  return t;
}
// Notification « tâche confiée » (module notifications) : seulement quand le responsable change et n'est pas soi.
// Chaque attribution a son identifiant (une tâche peut revenir plus tard à la même personne).
const idConfiee = (t, quand = Date.now()) => `tache-confiee:${t.id}:${t.responsable}:${quand.toString(36)}`;
async function prevenirResponsable(t, avant) {
  const N = Modules.get('notifications')?.expose;
  if (!N?.programmer || !t.responsable || t.fait || avant?.responsable === t.responsable || t.responsable === monMembre()) return;
  const qui = nomMembre(state.compte?.member_id) || 'Quelqu\'un';
  await N.programmer({ id: idConfiee(t), type: 'taches', titre: 'Une tâche pour toi', corps: `${qui} : ${t.titre}${t.echeance ? ` (${libelleEcheance(t.echeance, aujourdhui()).toLowerCase()})` : ''}`, url: './#taches', pour_membres: [t.responsable], sauf_auteur: true });
}

async function basculerTache(t) {
  if (!t.fait) {
    await enregistrer(T.taches, D.taches, champsTache({ ...t, fait: true, fait_le: maintenantIso(), fait_par: me() }));
    if (t.recurrence) {
      const suivante = prochaineEcheance(t.echeance, t.recurrence, aujourdhui());
      await enregistrer(T.taches, D.taches, champsTache({ ...t, id: uid(), echeance: suivante, fait: false, fait_le: null, fait_par: null, precedente_id: t.id }));
      return `Faite. Prochaine fois : ${libelleEcheance(suivante, aujourdhui()).toLowerCase()}`;
    }
    return 'Tâche faite';
  }
  await enregistrer(T.taches, D.taches, champsTache({ ...t, fait: false, fait_le: null, fait_par: null }));
  // Une tâche récurrente décochée reprend sa place : l'occurrence suivante créée au cochage disparaît.
  for (const s of D.taches.filter((x) => x.precedente_id === t.id && !x.fait)) await retirer(T.taches, D.taches, s.id);
  return 'Tâche à refaire';
}

const optionsMembres = (choisi, vide = 'Personne en particulier') => `<option value="">${esc(vide)}</option>${state.members.map((m) => `<option value="${m.id}" ${m.id === choisi ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}`;
const cleRec = (r) => (r?.freq ? `${r.freq}:${Math.max(1, Number(r.n) || 1)}` : '');

function feuilleTache(t = {}) {
  const neuve = !t.id || !D.taches.some((x) => x.id === t.id);
  const rc = cleRec(t.recurrence);
  const choix = REC_CHOIX.some(([v]) => v === rc) ? REC_CHOIX : [...REC_CHOIX, [rc, libelleRecurrence(t.recurrence)]];
  const el = openSheet(`${sheetHead(neuve ? 'Nouvelle tâche' : 'Tâche')}
    <form data-form="taches-tache" class="stack taches-form">
      <label class="field"><span>Quoi ?</span><input class="input" name="titre" required maxlength="200" value="${esc(t.titre || '')}" placeholder="Appeler le vétérinaire"></label>
      <label class="field"><span>Qui s'en charge ?</span><select class="input" name="responsable">${optionsMembres(t.responsable)}</select></label>
      <div class="grid2">
        <label class="field"><span>Échéance</span><input class="input" type="date" name="echeance" value="${esc(t.echeance || '')}"></label>
        <label class="field"><span>Heure</span><input class="input" type="time" name="heure" value="${esc(t.heure || '')}"></label>
      </div>
      <label class="field"><span>Répétition</span><select class="input" name="recurrence">${choix.map(([v, l]) => `<option value="${v}" ${v === rc ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="priorite" ${t.priorite ? 'checked' : ''}> Importante</label>
      <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="2" maxlength="2000" placeholder="Numéro, adresse, détails…">${esc(t.notes || '')}</textarea></label>
      <p class="muted small taches-aide">Une tâche répétée revient d'elle-même quand tu la coches : la suivante est créée à la bonne date.</p>
      <div class="grid2">${neuve ? '<button type="button" class="btn" data-x="annuler">Annuler</button>' : '<button type="button" class="btn danger" data-x="supprimer">Supprimer</button>'}
        <button class="btn primary">${neuve ? 'Ajouter' : 'Enregistrer'}</button></div>
    </form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const [freq, n] = f.recurrence.value.split(':');
    const recurrence = freq ? { freq, n: Number(n) } : null;
    if (recurrence?.freq === 'mois' && f.echeance.value) recurrence.jour = isoVersDate(f.echeance.value).getDate();
    try {
      await creerTache({ ...t, id: neuve ? undefined : t.id, titre: f.titre.value, responsable: f.responsable.value || null, echeance: f.echeance.value || null,
        heure: f.heure.value || null, recurrence, priorite: f.priorite.checked ? 1 : 0, notes: f.notes.value.trim() || null });
      closeSheet();
      toast(neuve ? 'Tâche ajoutée' : 'Tâche enregistrée');
      render();
    } catch (err) { fail(err); }
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'annuler') closeSheet();
    if (b.dataset.x === 'supprimer') {
      closeSheet();
      if (!(await confirmSheet(`Supprimer la tâche « ${t.titre} » ?`, 'Supprimer'))) return;
      try { await retirer(T.taches, D.taches, t.id); toast('Tâche supprimée'); render(); } catch (err) { fail(err); }
    }
  });
  return el;
}

// ---------------------------------------------------------------------------
// Listes et listes types
// ---------------------------------------------------------------------------
const elementsDe = (listeId) => {
  if (String(listeId).startsWith('modele:')) { const m = MODELES.find((x) => `modele:${x.cle}` === listeId); return m ? elementsModele(m) : []; }
  return D.elements.filter((e) => e.liste_id === listeId);
};
// Listes types : celles du foyer (modifiées ou créées), puis les listes fournies pas encore modifiées.
function modeles() {
  const perso = D.listes.filter((l) => l.est_modele);
  const fournis = MODELES.filter((m) => !perso.some((l) => l.cle === m.cle)).map((m) => ({ id: `modele:${m.cle}`, titre: m.titre, genre: m.genre, cle: m.cle, est_modele: true, virtuel: true }));
  const ordre = (l) => { const i = MODELES.findIndex((m) => m.cle === l.cle); return i < 0 ? 99 : i; };
  return [...perso, ...fournis].sort((a, b) => ordre(a) - ordre(b) || String(a.titre).localeCompare(String(b.titre), 'fr'));
}
const listeParId = (id) => (String(id).startsWith('modele:') ? modeles().find((m) => m.id === id) : D.listes.find((l) => l.id === id)) || null;
const descriptionModele = (l) => MODELES.find((m) => m.cle === l.cle)?.description || '';

// Première modification d'une liste type fournie : le foyer en garde sa propre copie (même clé).
async function materialiser(listeId) {
  if (!String(listeId).startsWith('modele:')) return listeId;
  const m = MODELES.find((x) => `modele:${x.cle}` === listeId);
  const liste = await enregistrer(T.listes, D.listes, { id: uid(), titre: m.titre, genre: m.genre, est_modele: true, cle: m.cle, archivee: false });
  const els = elementsModele(m).map((e) => ({ id: uid(), liste_id: liste.id, texte: e.texte, section: e.section, coche: false, ordre: e.ordre }));
  D.elements.push(...await ecrireLot(T.liste_elements, els));
  sauverCache();
  if (ui.ouverte === listeId) ui.ouverte = liste.id;
  return liste.id;
}

async function lancerListe(modeleId, { titre, date_debut = null, date_fin = null } = {}) {
  await pret;
  const id = MODELES.some((m) => m.cle === modeleId) ? (D.listes.find((l) => l.est_modele && l.cle === modeleId)?.id || `modele:${modeleId}`) : modeleId;
  const modele = listeParId(id);
  if (!modele) throw new Error(`liste type inconnue : ${modeleId}`);
  const copie = copieModele(modele, elementsDe(id), { titre, date_debut, date_fin });
  const l = await enregistrer(T.listes, D.listes, copie.liste);
  D.elements.push(...await ecrireLot(T.liste_elements, copie.elements));
  sauverCache();
  return l;
}

async function basculerElement(e) {
  const coche = !e.coche;
  return enregistrer(T.liste_elements, D.elements, { ...e, coche, coche_par: coche ? me() : null, coche_le: coche ? maintenantIso() : null });
}

async function ajouterElement(listeId, texte, section) {
  const id = await materialiser(listeId);
  const ordre = Math.max(-1, ...elementsDe(id).map((e) => e.ordre ?? 0)) + 1;
  return enregistrer(T.liste_elements, D.elements, { id: uid(), liste_id: id, texte: texte.slice(0, 200), section: section || null, coche: false, ordre });
}

function feuilleNouvelleListe() {
  const el = openSheet(`${sheetHead('Nouvelle liste')}
    <form data-form="taches-liste" class="stack taches-form">
      <label class="field"><span>Nom</span><input class="input" name="titre" required maxlength="120" placeholder="Films à voir, cadeaux de Noël…"></label>
      <fieldset class="taches-genres"><legend class="muted small">Genre</legend>
        ${GENRES_LIBRES.map((g, i) => `<label class="chip taches-genre"><input type="radio" name="genre" value="${g}" ${i === 0 ? 'checked' : ''}>${GENRES[g].icone}${esc(GENRES[g].libelle)}</label>`).join('')}</fieldset>
      <div class="grid2">
        <label class="field"><span>Du (facultatif)</span><input class="input" type="date" name="debut"></label>
        <label class="field"><span>Au</span><input class="input" type="date" name="fin"></label>
      </div>
      <label class="check"><input type="checkbox" name="modele"> C'est une liste type (à relancer plusieurs fois)</label>
      <button class="btn primary block">Créer la liste</button>
    </form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const l = await enregistrer(T.listes, D.listes, { id: uid(), titre: f.titre.value.trim().slice(0, 120), genre: f.genre.value, est_modele: f.modele.checked,
        date_debut: f.debut.value || null, date_fin: f.fin.value || f.debut.value || null, archivee: false });
      closeSheet();
      ui.ouverte = l.id;
      render();
      setTimeout(() => $('[data-form="taches-element"] [name="texte"]')?.focus(), 80);
    } catch (err) { fail(err); }
  });
  setTimeout(() => $('[name="titre"]', el)?.focus(), 60);
}

function feuilleLancer(modeleId) {
  const m = listeParId(modeleId);
  if (!m) return;
  const vac = m.genre === 'vacances';
  const n = elementsDe(modeleId).length;
  const el = openSheet(`${sheetHead(`Lancer « ${m.titre} »`)}
    <form data-form="taches-lancer" class="stack taches-form">
      <p class="muted small" style="margin:0">Une copie de ${n} élément${n > 1 ? 's' : ''} à cocher ; la liste type reste intacte pour la prochaine fois.</p>
      <label class="field"><span>Nom</span><input class="input" name="titre" maxlength="120" value="${esc(vac ? '' : m.titre)}" placeholder="${vac ? 'Vacances du… (rempli avec les dates)' : ''}"></label>
      <div class="grid2">
        <label class="field"><span>${vac ? 'Départ' : 'Le (facultatif)'}</span><input class="input" type="date" name="debut" ${vac ? 'required' : ''}></label>
        <label class="field"><span>${vac ? 'Retour' : 'Jusqu\'au'}</span><input class="input" type="date" name="fin"></label>
      </div>
      <button class="btn primary block">${ICON.play} Lancer la liste</button>
    </form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const debut = f.debut.value || null;
    const fin = f.fin.value || null;
    if (debut && fin && fin < debut) { toast('Le retour doit suivre le départ'); return; }
    try {
      const l = await lancerListe(modeleId, { titre: f.titre.value.trim() || null, date_debut: debut, date_fin: fin || debut });
      closeSheet();
      ui.ouverte = l.id;
      toast('Liste lancée : à toi de cocher');
      render();
      window.scrollTo({ top: 0 });
    } catch (err) { fail(err); }
  });
}

function feuilleElement(e) {
  const liste = listeParId(e.liste_id);
  const sections = [...new Set(elementsDe(e.liste_id).map((x) => x.section).filter(Boolean))];
  const el = openSheet(`${sheetHead('Élément de la liste')}
    <form data-form="taches-el" class="stack taches-form">
      <label class="field"><span>Texte</span><input class="input" name="texte" required maxlength="200" value="${esc(e.texte)}"></label>
      <label class="field"><span>Rubrique</span><input class="input" name="section" maxlength="60" list="taches-sections" value="${esc(e.section || '')}" placeholder="Sans rubrique">
        <datalist id="taches-sections">${sections.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <div class="grid2"><button type="button" class="btn danger" data-x="supprimer">Retirer</button><button class="btn primary">Enregistrer</button></div>
    </form>`);
  $('form', el).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    try {
      const id = await materialiser(e.liste_id);
      const cible = id === e.liste_id ? e : D.elements.find((x) => x.liste_id === id && x.ordre === e.ordre) || e;
      await enregistrer(T.liste_elements, D.elements, { ...cible, texte: f.texte.value.trim().slice(0, 200), section: f.section.value.trim() || null });
      closeSheet();
      render();
    } catch (err) { fail(err); }
  });
  el.addEventListener('click', async (ev) => {
    if (!ev.target.closest('[data-x="supprimer"]')) return;
    try {
      const id = await materialiser(e.liste_id);
      const cible = id === e.liste_id ? e : D.elements.find((x) => x.liste_id === id && x.ordre === e.ordre);
      if (cible) await retirer(T.liste_elements, D.elements, cible.id);
      closeSheet();
      toast(`Retiré de « ${liste?.titre || 'la liste'} »`);
      render();
    } catch (err) { fail(err); }
  });
}

function feuilleMenuListe(l) {
  const els = elementsDe(l.id);
  const options = l.est_modele
    ? [['lancer', ICON.play, 'Lancer cette liste'], ['renommer', ICON.edit, 'Renommer'],
      ...(l.virtuel ? [] : l.cle ? [['retablir', ICON.swap, 'Rétablir la liste d\'origine']] : [['supprimer', ICON.trash, 'Supprimer la liste type']])]
    : [['renommer', ICON.edit, 'Renommer et dates'], ['decocher', ICON.swap, 'Tout décocher'], ['modele', ICON.copy, 'Enregistrer comme liste type'],
      [l.archivee ? 'reprendre' : 'archiver', ICON.check, l.archivee ? 'Remettre en cours' : 'Terminer la liste'], ['supprimer', ICON.trash, 'Supprimer la liste']];
  const el = openSheet(`${sheetHead(l.titre)}<div class="stack">${options.map(([x, ic, t]) => `<button class="btn block taches-menu ${x === 'supprimer' ? 'danger' : ''}" data-x="${x}">${ic}<span class="grow">${esc(t)}</span></button>`).join('')}</div>`);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const x = b.dataset.x;
    closeSheet();
    try {
      if (x === 'lancer') return feuilleLancer(l.id);
      if (x === 'renommer') return feuilleRenommer(l);
      if (x === 'decocher') {
        await ecrireLot(T.liste_elements, els.filter((y) => y.coche).map((y) => ({ ...y, coche: false, coche_par: null, coche_le: null })));
        els.forEach((y) => { y.coche = false; y.coche_par = null; y.coche_le = null; });
        sauverCache();
        toast('Tout est décoché');
      }
      if (x === 'modele') {
        const id = uid();
        await enregistrer(T.listes, D.listes, { id, titre: l.titre, genre: l.genre, est_modele: true, archivee: false });
        D.elements.push(...await ecrireLot(T.liste_elements, copieModele(l, els, { nouvelId: uid }).elements.map((y) => ({ ...y, liste_id: id }))));
        sauverCache();
        toast('Liste type enregistrée');
      }
      if (x === 'archiver' || x === 'reprendre') {
        await enregistrer(T.listes, D.listes, { ...l, archivee: x === 'archiver' });
        if (x === 'archiver') { ui.ouverte = null; toast('Liste terminée, bravo !'); }
      }
      if (x === 'retablir') {
        if (!(await confirmSheet(`Rétablir « ${l.titre} » telle qu'elle était fournie ? Tes modifications seront perdues.`, 'Rétablir'))) return;
        await retirer(T.listes, D.listes, l.id);
        D.elements = D.elements.filter((y) => y.liste_id !== l.id);
        sauverCache();
        ui.ouverte = `modele:${l.cle}`;
        toast('Liste type rétablie');
      }
      if (x === 'supprimer') {
        if (!(await confirmSheet(`Supprimer « ${l.titre} » et ses ${els.length} élément${els.length > 1 ? 's' : ''} ?`, 'Supprimer'))) return;
        await retirer(T.listes, D.listes, l.id);
        D.elements = D.elements.filter((y) => y.liste_id !== l.id);
        sauverCache();
        ui.ouverte = null;
        toast('Liste supprimée');
      }
      render();
    } catch (err) { fail(err); }
  });
}

function feuilleRenommer(l) {
  const el = openSheet(`${sheetHead('Renommer')}
    <form class="stack taches-form">
      <label class="field"><span>Nom</span><input class="input" name="titre" required maxlength="120" value="${esc(l.titre)}"></label>
      ${l.est_modele ? '' : `<div class="grid2"><label class="field"><span>Du</span><input class="input" type="date" name="debut" value="${esc(l.date_debut || '')}"></label>
        <label class="field"><span>Au</span><input class="input" type="date" name="fin" value="${esc(l.date_fin || '')}"></label></div>`}
      <button class="btn primary block">Enregistrer</button>
    </form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const id = await materialiser(l.id);
      const base = D.listes.find((x) => x.id === id) || l;
      await enregistrer(T.listes, D.listes, { ...base, titre: f.titre.value.trim().slice(0, 120), ...(l.est_modele ? {} : { date_debut: f.debut.value || null, date_fin: f.fin.value || null }) });
      closeSheet();
      render();
    } catch (err) { fail(err); }
  });
}

// ---------------------------------------------------------------------------
// Envies de cadeaux
// ---------------------------------------------------------------------------
const resaDe = (envie) => D.resas.find((r) => reservationVisible(envie, r, monMembre())) || null;

function feuilleEnvie(envie = {}) {
  const neuve = !envie.id;
  const pour = envie.member_id || ui.membreEnvies || state.members[0]?.id;
  const el = openSheet(`${sheetHead(neuve ? 'Nouvelle envie' : 'Envie')}
    <form class="stack taches-form">
      <label class="field"><span>Pour</span><select class="input" name="pour" ${neuve ? '' : 'disabled'}>${state.members.map((m) => `<option value="${m.id}" ${m.id === pour ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></label>
      <label class="field"><span>Envie</span><input class="input" name="titre" required maxlength="160" value="${esc(envie.titre || '')}" placeholder="Un livre, un jeu, une sortie…"></label>
      <label class="field"><span>Précisions</span><input class="input" name="detail" maxlength="300" value="${esc(envie.detail || '')}" placeholder="Taille, couleur, édition…"></label>
      <div class="grid2">
        <label class="field"><span>Lien</span><input class="input" name="lien" type="url" inputmode="url" maxlength="500" value="${esc(envie.lien || '')}" placeholder="https://…"></label>
        <label class="field"><span>Prix indicatif</span><input class="input" name="prix" maxlength="30" value="${esc(envie.prix || '')}" placeholder="25 €"></label>
      </div>
      <div class="grid2">${neuve ? '<button type="button" class="btn" data-x="annuler">Annuler</button>' : '<button type="button" class="btn danger" data-x="supprimer">Retirer</button>'}
        <button class="btn primary">${neuve ? 'Ajouter' : 'Enregistrer'}</button></div>
    </form>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const lien = f.lien.value.trim();
    if (lien && !safeUrl(lien)) { toast('Lien invalide : il doit commencer par https://'); return; }
    try {
      await enregistrer(T.envies, D.envies, { ...(neuve ? { id: uid(), member_id: f.pour.value } : envie), titre: f.titre.value.trim().slice(0, 160), detail: f.detail.value.trim() || null,
        lien: lien ? safeUrl(lien) : null, prix: f.prix.value.trim() || null });
      if (neuve) ui.membreEnvies = f.pour.value;
      closeSheet();
      toast(neuve ? 'Envie ajoutée' : 'Envie enregistrée');
      render();
    } catch (err) { fail(err); }
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'annuler') closeSheet();
    if (b.dataset.x === 'supprimer') {
      try { await retirer(T.envies, D.envies, envie.id); D.resas = D.resas.filter((r) => r.envie_id !== envie.id); sauverCache(); closeSheet(); toast('Envie retirée'); render(); } catch (err) { fail(err); }
    }
  });
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
const avatar = (id) => { const n = nomMembre(id); return n ? `<span class="taches-avatar" aria-hidden="true">${esc(n.charAt(0).toUpperCase())}</span>` : ''; };

function ligneTache(t, auj) {
  const retard = !t.fait && t.echeance && t.echeance < auj;
  const meta = [
    t.priorite ? '<span class="taches-badge">Importante</span>' : '',
    t.echeance ? `<span class="${retard ? 'taches-retard' : ''}">${ICON.clock}${esc(libelleEcheance(t.echeance, auj))}${t.heure ? ` à ${esc(t.heure.replace(':', ' h '))}` : ''}</span>` : '',
    t.recurrence ? `<span>${ICON.swap}${esc(libelleRecurrence(t.recurrence))}</span>` : '',
    t.responsable && nomMembre(t.responsable) ? `<span>${avatar(t.responsable)}${esc(nomMembre(t.responsable))}</span>` : '',
    t.notes ? `<span>${ICON.edit}Notes</span>` : '',
  ].filter(Boolean).join('');
  return `<div class="taches-ligne ${t.fait ? 'fait' : ''} ${retard ? 'en-retard' : ''}">
    <button class="taches-coche" role="checkbox" aria-checked="${!!t.fait}" data-act="taches-cocher" data-id="${t.id}" aria-label="${t.fait ? 'Décocher' : 'Cocher'} « ${esc(t.titre)} »">${ICON.check}</button>
    <button class="taches-corps" data-act="taches-ouvrir" data-id="${t.id}"><span class="taches-titre">${esc(t.titre)}</span>${meta ? `<span class="taches-meta">${meta}</span>` : ''}</button>
  </div>`;
}

function vueTaches() {
  const auj = aujourdhui();
  const filtre = (t) => ui.filtre === 'tous' || (ui.filtre === 'aucun' ? !t.responsable : t.responsable === ui.filtre);
  const liste = D.taches.filter(filtre);
  const groupes = groupesTaches(liste, auj);
  const faites = liste.filter((t) => t.fait).sort((a, b) => String(b.fait_le || '').localeCompare(String(a.fait_le || '')));
  const chips = [['tous', 'Tout le monde'], ...state.members.map((m) => [m.id, m.nom]), ['aucun', 'Sans responsable']]
    .map(([v, l]) => `<button class="chip" data-act="taches-filtre" data-v="${v}" aria-pressed="${ui.filtre === v}">${esc(l)}</button>`).join('');
  const corps = groupes.length
    ? groupes.map((g) => `<h3 class="section-title taches-groupe ${g.cle === 'retard' ? 'retard' : ''}">${esc(g.titre)} <span class="taches-compte">${g.taches.length}</span></h3>
      <div class="card taches-liste">${g.taches.map((t) => ligneTache(t, auj)).join('')}</div>`).join('')
    : `<div class="empty taches-vide">${ICON.check}<p><b>Rien à faire${ui.filtre !== 'tous' ? ' de ce côté' : ''} !</b><br>Écris une tâche ci-dessus, ou touche le « + » en haut de l'écran.</p></div>`;
  const blocFaites = faites.length ? `<button class="btn block taches-voir-faites" data-act="taches-faites" aria-expanded="${ui.faites}">${ui.faites ? 'Masquer' : 'Voir'} les tâches faites (${faites.length})</button>
    ${ui.faites ? `<div class="card taches-liste">${faites.slice(0, 40).map((t) => ligneTache(t, auj)).join('')}</div>` : ''}` : '';
  return `<form data-form="taches-rapide" class="card taches-saisie" autocomplete="off">
      <input class="input" name="texte" maxlength="200" placeholder="Poubelles mardi, véto…" aria-label="Nouvelle tâche en une phrase">
      <button class="btn primary" aria-label="Ajouter la tâche">${ICON.plus}</button>
      <button type="button" class="btn" data-act="taches-nouvelle" aria-label="Nouvelle tâche détaillée">${ICON.edit}</button>
    </form>
    <div class="chips taches-chips">${chips}</div>${corps}${blocFaites}`;
}

function carteListe(l) {
  const p = progression(elementsDe(l.id));
  const dates = l.date_debut ? (l.date_fin && l.date_fin !== l.date_debut ? `${fmtJourMois(l.date_debut)} → ${fmtJourMois(l.date_fin)}` : fmtJourMois(l.date_debut)) : '';
  return `<button class="card taches-carte" data-act="taches-liste-ouvrir" data-id="${l.id}">
    <span class="taches-carte-ico">${iconeGenre(l.genre)}</span>
    <span class="grow"><b class="taches-carte-titre">${esc(l.titre)}</b>
      <span class="muted small">${l.est_modele ? `${p.total} élément${p.total > 1 ? 's' : ''}${l.virtuel ? '' : ' · modifiée'}` : `${p.faits}/${p.total} coché${p.faits > 1 ? 's' : ''}`}${dates ? ` · ${esc(dates)}` : ''}</span>
      ${l.est_modele ? `<span class="muted small taches-carte-desc">${esc(descriptionModele(l))}</span>` : `<span class="taches-barre" aria-hidden="true"><i style="width:${p.pct}%"></i></span>`}</span>
    ${ICON.next}</button>`;
}

function vueListes() {
  if (ui.ouverte && listeParId(ui.ouverte)) return vueListe(listeParId(ui.ouverte));
  ui.ouverte = null;
  const enCours = D.listes.filter((l) => !l.est_modele && !l.archivee).sort((a, b) => String(a.date_debut || '9').localeCompare(String(b.date_debut || '9')) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const finies = D.listes.filter((l) => !l.est_modele && l.archivee);
  return `<div class="row taches-entete"><h3 class="section-title grow">En cours</h3><button class="btn small" data-act="taches-liste-nouvelle">${ICON.plus} Nouvelle liste</button></div>
    ${enCours.length ? `<div class="taches-cartes">${enCours.map(carteListe).join('')}</div>` : '<p class="muted taches-vide-court">Aucune liste en cours. Crée une liste libre, ou lance une liste type ci-dessous.</p>'}
    <h3 class="section-title">Listes types</h3>
    <p class="muted small taches-aide">Lance une liste type : elle crée une copie à cocher, et le modèle reste prêt pour la prochaine fois. Touche une liste type pour la modifier.</p>
    <div class="taches-cartes">${modeles().map((m) => `<div class="taches-modele">${carteListe(m)}<button class="btn small primary taches-lancer" data-act="taches-lancer" data-id="${m.id}">${ICON.play} Lancer</button></div>`).join('')}</div>
    ${finies.length ? `<details class="taches-finies"><summary class="section-title">Listes terminées (${finies.length})</summary><div class="taches-cartes">${finies.map(carteListe).join('')}</div></details>` : ''}`;
}

function vueListe(l) {
  const els = elementsDe(l.id);
  const p = progression(els);
  const groupes = sectionsDe(els);
  const sections = groupes.map((g) => g.section).filter(Boolean);
  const dates = l.date_debut ? `${fmtJourMois(l.date_debut)}${l.date_fin && l.date_fin !== l.date_debut ? ` → ${fmtJourMois(l.date_fin)}` : ''}` : '';
  const ligne = (e) => {
    const par = e.coche && e.coche_par && e.coche_par !== me() ? nomCompte(e.coche_par) : '';
    return `<div class="taches-el ${e.coche ? 'fait' : ''}">
      ${l.est_modele ? `<span class="taches-puce" aria-hidden="true"></span>` : `<button class="taches-coche" role="checkbox" aria-checked="${!!e.coche}" data-act="taches-el-cocher" data-id="${e.id}" aria-label="${esc(e.texte)}">${ICON.check}</button>`}
      <button class="taches-el-texte" data-act="taches-el-modifier" data-id="${e.id}" data-liste="${l.id}"><span>${esc(e.texte)}</span>${par ? `<span class="muted small"> · ${esc(par)}</span>` : ''}</button>
    </div>`;
  };
  const versCourses = (s) => (!l.est_modele && /courses/i.test(s) ? `<button class="btn small soft" data-act="taches-vers-courses" data-id="${l.id}" data-section="${esc(s)}">${ICON.cart} Ajouter aux courses</button>` : '');
  const fini = !l.est_modele && p.total && p.faits === p.total;
  return `<div class="row taches-entete"><button class="btn small" data-act="taches-liste-retour">${ICON.back} Listes</button><span class="grow"></span>
      ${l.est_modele ? `<button class="btn small primary" data-act="taches-lancer" data-id="${l.id}">${ICON.play} Lancer</button>` : ''}
      <button class="icon-btn" data-act="taches-liste-menu" data-id="${l.id}" aria-label="Actions de la liste">${ICON.dots}</button></div>
    <section class="card taches-detail">
      <div class="row"><span class="taches-carte-ico">${iconeGenre(l.genre)}</span><div class="grow"><h2 class="taches-detail-titre">${esc(l.titre)}</h2>
        <div class="muted small">${l.est_modele ? `Liste type · ${p.total} élément${p.total > 1 ? 's' : ''}` : `<span data-taches-prog>${p.faits}/${p.total} coché${p.faits > 1 ? 's' : ''}</span>`}${dates ? ` · ${esc(dates)}` : ''}</div></div></div>
      ${l.est_modele ? `<p class="muted small taches-aide">${esc(descriptionModele(l) || 'Liste type du foyer.')} Les modifications servent aux prochains lancements.</p>` : `<span class="taches-barre" aria-hidden="true"><i style="width:${p.pct}%"></i></span>`}
      ${fini ? `<div class="taches-bravo">${ICON.sparkle}<span class="grow">Tout est coché !</span><button class="btn small primary" data-act="taches-liste-terminer" data-id="${l.id}">Terminer la liste</button></div>` : ''}
      ${groupes.map((g) => `<div class="taches-section">${g.section ? `<div class="row taches-section-titre"><h4 class="grow">${esc(g.section)}</h4>${versCourses(g.section)}</div>` : ''}${g.elements.map(ligne).join('')}</div>`).join('')
        || '<p class="muted taches-vide-court">La liste est vide : ajoute un premier élément.</p>'}
      <form data-form="taches-element" data-liste="${l.id}" class="taches-ajout" autocomplete="off">
        <input class="input" name="texte" maxlength="200" placeholder="Ajouter un élément" aria-label="Nouvel élément">
        ${sections.length ? `<select class="input" name="section" aria-label="Rubrique"><option value="">Sans rubrique</option>${sections.map((s) => `<option ${s === ui.derniereSection ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
        <button class="btn primary" aria-label="Ajouter">${ICON.plus}</button>
      </form>
    </section>`;
}

function vueEnvies() {
  const membres = state.members;
  if (!membres.length) return '<div class="empty"><p>Ajoute d\'abord les membres du foyer (Réglages › Foyer).</p></div>';
  if (!memberById(ui.membreEnvies)) ui.membreEnvies = membres.find((m) => m.id !== monMembre())?.id || membres[0].id;
  const m = memberById(ui.membreEnvies);
  const moi = m.id === monMembre();
  const envies = D.envies.filter((e) => e.member_id === m.id).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const carte = (e) => {
    const r = moi ? null : resaDe(e);
    let etat = '';
    if (!moi && monMembre()) {
      if (!r) etat = `<button class="btn small primary" data-act="taches-envie-reserver" data-id="${e.id}">Je m'en occupe</button>`;
      else if (r.user_id === me()) {
        etat = `<span class="taches-pris moi">${r.offert ? 'Offert par toi' : 'Tu t\'en occupes'}</span>${r.offert ? '' : `<button class="btn small" data-act="taches-envie-offert" data-id="${e.id}">Offert</button>`}
          <button class="btn small" data-act="taches-envie-liberer" data-id="${e.id}">Annuler</button>`;
      } else etat = `<span class="taches-pris">${esc(majuscule(nomCompte(r.user_id)))} ${r.offert ? 'l\'a offert' : 's\'en occupe'}</span>`;
    }
    const lien = e.lien && safeUrl(e.lien) ? `<a class="taches-lien" href="${esc(safeUrl(e.lien))}" target="_blank" rel="noopener noreferrer">${ICON.link} Voir le lien</a>` : '';
    return `<div class="card taches-envie ${r ? 'prise' : ''}">
      <button class="taches-envie-corps" data-act="taches-envie-modifier" data-id="${e.id}"><span><b>${esc(e.titre)}</b>${e.prix ? `<span class="muted small"> · ${esc(e.prix)}</span>` : ''}</span>
        ${e.detail ? `<span class="muted small taches-envie-detail">${esc(e.detail)}</span>` : ''}</button>
      ${lien || etat ? `<div class="row wrap taches-envie-actions">${lien}<span class="grow"></span>${etat}</div>` : ''}
    </div>`;
  };
  const note = moi
    ? `<p class="muted small taches-aide">C'est ta liste : les autres voient qui s'occupe de quoi, toi non. La surprise reste entière.</p>`
    : monMembre() ? `<p class="muted small taches-aide">« Je m'en occupe » reste invisible pour ${esc(m.nom)}.</p>`
      : `<p class="muted small taches-aide">Pour réserver un cadeau, relie d'abord ton compte à ton profil (Plus › Mon foyer › « Je suis… ») : la surprise reste ainsi gardée pour chacun.</p>`;
  return `<div class="chips taches-chips">${membres.map((x) => `<button class="chip" data-act="taches-envies-membre" data-v="${x.id}" aria-pressed="${x.id === m.id}">${esc(x.nom)}${x.id === monMembre() ? ' (moi)' : ''}</button>`).join('')}</div>
    <div class="row taches-entete"><h3 class="section-title grow">${moi ? 'Mes envies' : `Les envies de ${esc(m.nom)}`}</h3><button class="btn small" data-act="taches-envie-nouvelle">${ICON.plus} Ajouter</button></div>
    ${note}
    ${envies.length ? `<div class="taches-envies">${envies.map(carte).join('')}</div>` : `<div class="empty taches-vide">${GENRES.cadeaux.icone}<p>Pas encore d'envie pour ${esc(m.nom)}.</p></div>`}`;
}

function rendu() {
  if (!D.ok) return '<div class="spinner"></div>';
  const ouvertes = D.taches.filter((t) => !t.fait);
  const retard = ouvertes.filter((t) => t.echeance && t.echeance < aujourdhui()).length;
  const vues = [['taches', 'Tâches', ouvertes.length ? `<span class="taches-pastille ${retard ? 'retard' : ''}">${ouvertes.length}</span>` : ''], ['listes', 'Listes', ''], ['envies', 'Envies', '']];
  const corps = ui.vue === 'listes' ? vueListes() : ui.vue === 'envies' ? vueEnvies() : vueTaches();
  return `<div class="taches">
    <div class="seg taches-vues" role="tablist" aria-label="Tâches, listes et envies">${vues.map(([v, l, b]) => `<button role="tab" data-act="taches-vue" data-v="${v}" aria-pressed="${ui.vue === v}" aria-selected="${ui.vue === v}">${l}${b}</button>`).join('')}</div>
    ${corps}</div>`;
}

// ---------------------------------------------------------------------------
// Formulaires de l'écran
// ---------------------------------------------------------------------------
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.dataset?.form === 'taches-rapide') {
    e.preventDefault();
    const texte = f.texte.value.trim();
    if (!texte) { feuilleTache({}); return; }
    const a = analyseTache(texte, { maintenant: new Date(), membres: state.members });
    if (!a.titre) return;
    try {
      const t = await creerTache(a);
      toast(`Tâche ajoutée${t.echeance ? ` · ${libelleEcheance(t.echeance, aujourdhui()).toLowerCase()}` : ''}${t.responsable ? ` · ${nomMembre(t.responsable)}` : ''}`);
      render();
      $('[data-form="taches-rapide"] [name="texte"]')?.focus();
    } catch (err) { fail(err); }
  }
  if (f.dataset?.form === 'taches-element') {
    e.preventDefault();
    const texte = f.texte.value.trim();
    if (!texte) return;
    const section = f.section?.value || null;
    ui.derniereSection = section;
    try {
      const el = await ajouterElement(f.dataset.liste, texte, section);
      ui.ouverte = el.liste_id;
      render();
      $('[data-form="taches-element"] [name="texte"]')?.focus();
    } catch (err) { fail(err); }
  }
});

const tache = (id) => D.taches.find((t) => t.id === id);
const actions = {
  'taches-vue': (b) => { ui.vue = b.dataset.v; store.set('taches:vue', ui.vue); if (ui.vue !== 'listes') ui.ouverte = null; render(); },
  'taches-filtre': (b) => { ui.filtre = b.dataset.v; render(); },
  'taches-faites': () => { ui.faites = !ui.faites; render(); },
  'taches-nouvelle': () => { const v = $('[data-form="taches-rapide"] [name="texte"]')?.value.trim(); feuilleTache(v ? analyseTache(v, { maintenant: new Date(), membres: state.members }) : {}); },
  'taches-ouvrir': (b) => {
    const t = tache(b.dataset.id);
    if (!t) { toast('Cette tâche n\'existe plus'); return; }
    if (state.tab !== 'taches') { ui.vue = 'taches'; switchTab('taches'); }
    feuilleTache(t);
  },
  'taches-cocher': async (b) => {
    const t = tache(b.dataset.id);
    if (!t) return;
    b.setAttribute('aria-checked', String(!t.fait));
    b.closest('.taches-ligne')?.classList.toggle('fait', !t.fait);
    try { const msg = await basculerTache(t); toast(msg); setTimeout(() => { if (state.tab === 'taches') render(); }, 350); } catch (err) { fail(err); render(); }
  },
  'taches-liste-nouvelle': () => feuilleNouvelleListe(),
  'taches-liste-ouvrir': (b) => { ui.ouverte = b.dataset.id; render(); window.scrollTo({ top: 0 }); },
  // Depuis l'Accueil : ouvre directement une liste.
  'taches-liste-ouvrir-tab': (b) => { ui.vue = 'listes'; ui.ouverte = b.dataset.id; switchTab('taches'); },
  'taches-liste-retour': () => { ui.ouverte = null; render(); },
  'taches-liste-menu': (b) => { const l = listeParId(b.dataset.id); if (l) feuilleMenuListe(l); },
  'taches-liste-terminer': async (b) => {
    const l = listeParId(b.dataset.id);
    if (!l) return;
    try { await enregistrer(T.listes, D.listes, { ...l, archivee: true }); ui.ouverte = null; toast('Liste terminée, bravo !'); render(); } catch (err) { fail(err); }
  },
  'taches-lancer': (b) => feuilleLancer(b.dataset.id),
  'taches-el-cocher': async (b) => {
    const e = D.elements.find((x) => x.id === b.dataset.id);
    if (!e) return;
    b.setAttribute('aria-checked', String(!e.coche));
    b.closest('.taches-el')?.classList.toggle('fait', !e.coche);
    try { await basculerElement(e); render(); } catch (err) { fail(err); render(); }
  },
  'taches-el-modifier': (b) => { const e = elementsDe(b.dataset.liste).find((x) => x.id === b.dataset.id); if (e) feuilleElement(e); },
  'taches-vers-courses': async (b) => {
    const els = elementsDe(b.dataset.id).filter((e) => e.section === b.dataset.section && !e.coche);
    if (!els.length) { toast('Tout est déjà coché dans cette rubrique'); return; }
    try {
      for (const e of els) await Data.addExtra(e.texte, '', guessAisle(e.texte));
      toast(`${els.length} article${els.length > 1 ? 's' : ''} ajouté${els.length > 1 ? 's' : ''} aux courses`);
    } catch (err) { fail(err); }
  },
  'taches-envies-membre': (b) => { ui.membreEnvies = b.dataset.v; render(); },
  'taches-envie-nouvelle': () => feuilleEnvie({}),
  'taches-envie-modifier': (b) => { const e = D.envies.find((x) => x.id === b.dataset.id); if (e) feuilleEnvie(e); },
  'taches-envie-reserver': async (b) => {
    const e = D.envies.find((x) => x.id === b.dataset.id);
    if (!e || !monMembre() || e.member_id === monMembre()) return;
    try { await enregistrer(T.envies_reservations, D.resas, { envie_id: e.id, member_id: e.member_id, offert: false }, { onConflict: 'envie_id' }); toast(`C'est noté : ${nomMembre(e.member_id)} n'en saura rien`); render(); } catch (err) { fail(err); }
  },
  'taches-envie-offert': async (b) => {
    const r = D.resas.find((x) => x.envie_id === b.dataset.id);
    if (!r) return;
    try { await enregistrer(T.envies_reservations, D.resas, { ...r, offert: true }, { onConflict: 'envie_id' }); toast('Marqué comme offert'); render(); } catch (err) { fail(err); }
  },
  'taches-envie-liberer': async (b) => {
    const r = D.resas.find((x) => x.envie_id === b.dataset.id);
    if (!r) return;
    try { await retirer(T.envies_reservations, D.resas, r.id); toast('Envie de nouveau libre'); render(); } catch (err) { fail(err); }
  },
};

// ---------------------------------------------------------------------------
// API publique (autres modules) et enregistrement
// ---------------------------------------------------------------------------
const Taches = {
  pret,
  creer: creerTache,
  async terminer(id) { await pret; const t = tache(id); if (t && !t.fait) await basculerTache(t); return tache(id) || null; },
  async supprimerOrigine(origine, origineId) { await pret; for (const t of D.taches.filter((x) => !x.fait && x.origine === origine && x.origine_id === String(origineId))) await retirer(T.taches, D.taches, t.id); },
  liste: ({ ouvertes = false } = {}) => D.taches.filter((t) => !ouvertes || !t.fait).map((t) => ({ ...t })),
  ouvrir(id) { const t = tache(id); if (t) { ui.vue = 'taches'; switchTab('taches'); feuilleTache(t); } },
  lancerListe,
  // Réception d'un changement en direct (utilisé aussi par les tests de bout en bout).
  _recevoir: (p) => TempsReel.recevoir(p),
};
window.Taches = Taches;

Modules.register({
  id: 'taches',
  onglet: 'famille',
  segment: 'Tâches & listes',
  ordre: 20,
  libelle: 'Tâches et listes',
  tables: { taches: 'taches', listes: 'listes', liste_elements: 'liste_elements', envies: 'envies', envies_reservations: 'envies_reservations' },
  charger,
  rendu,
  actions,
  sourcesAccueil: (ctx) => {
    const out = elementsAccueil(D.taches, { iso: ctx.iso, membre: ctx.membre, famille: ctx.famille, nom: nomMembre });
    // Listes datées qui commencent dans les 3 jours (vacances, départ) : à préparer.
    for (const l of D.listes.filter((x) => !x.est_modele && !x.archivee && x.date_debut && ecartJours(ctx.iso, x.date_debut) >= 0 && ecartJours(ctx.iso, x.date_debut) <= 3)) {
      const p = progression(elementsDe(l.id));
      if (p.faits < p.total) out.push({ heure: null, titre: l.titre, detail: `${p.faits}/${p.total} cochés · départ ${libelleEcheance(l.date_debut, ctx.iso).toLowerCase()}`, icone: iconeGenre(l.genre), act: 'taches-liste-ouvrir-tab', data: { id: l.id }, priorite: 1 });
    }
    return out;
  },
  agenda: (debut, fin) => {
    const a = isoDate(debut), b = isoDate(fin);
    return D.taches.filter((t) => !t.fait && t.echeance && t.echeance >= a && t.echeance <= b)
      .map((t) => ({ id: `tache:${t.id}`, date: t.echeance, heure: t.heure || null, titre: t.titre, detail: ['Tâche', nomMembre(t.responsable)].filter(Boolean).join(' · '),
        membres: t.responsable ? [t.responsable] : [], act: 'taches-ouvrir', data: { id: t.id } }));
  },
  ajoutRapide: {
    type: 'tache',
    libelle: 'Tâche',
    analyser(texte, ctx) {
      const a = analyseTache(texte, ctx);
      if (!a.titre || !a.score) return null;
      const iso = isoDate(ctx.maintenant || new Date());
      const resume = [a.titre, a.echeance ? libelleEcheance(a.echeance, iso).toLowerCase() : '', a.recurrence ? libelleRecurrence(a.recurrence).toLowerCase() : '',
        a.responsable ? (ctx.membres || []).find((m) => m.id === a.responsable)?.nom : ''].filter(Boolean).join(' · ');
      return { score: a.score, resume, donnees: a };
    },
    async enregistrer(a) { const t = await creerTache(a); return `Tâche ajoutée${t.responsable ? ` pour ${nomMembre(t.responsable)}` : ''}`; },
    ouvrir(texte, ctx) {
      ui.vue = 'taches';
      switchTab('taches');
      feuilleTache(texte ? analyseTache(texte, ctx) : {});
    },
  },
  notifications: [
    { type: 'taches', libelle: 'Tâches', description: 'Une tâche t\'est confiée, est faite, ou arrive à échéance.' },
    { type: 'liste-depart', libelle: 'Listes de départ', description: 'La veille d\'un départ, ce qui reste à cocher', defaut: false },
  ],
  expose: { idConfiee, analyseTache, prochaineEcheance, libelleRecurrence, libelleEcheance, groupesTaches, progression, sectionsDe, titreVacances, copieModele, reservationVisible, elementsAccueil, MODELES, elementsModele },
});
