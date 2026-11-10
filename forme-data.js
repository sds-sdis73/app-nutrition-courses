// Miam & moi – module Forme : bibliothèque d’exercices et pictogrammes animés.
// Script classique (pas de module ES) : déclare uniquement FORME_EXOS et FORME_PICTOS.
// Les animations des pictos sont dans forme-pictos.css (classes « fp- »).

const FORME_EXOS = [
  // ───────────── Poids du corps : pousser ─────────────
  { id: 'pompe-murale', nom: 'Pompe contre un mur', zones: ['pectoraux', 'bras', 'epaules'], materiel: [], formats: ['circuit', 'echauffement'], niveau: 1, unilateral: false, pattern: 'pousser', mode: 'reps', base: 15, picto: 'pompe',
    consignes: ['Pose les mains sur un mur, à hauteur des épaules.', 'Recule les pieds pour incliner le corps.', 'Approche la poitrine du mur puis repousse.'],
    erreurs: ['Cambrer le bas du dos.', 'Ouvrir les coudes à l’horizontale.'], variantes: { facile: null, difficile: 'pompe-genoux' } },
  { id: 'pompe-genoux', nom: 'Pompe sur les genoux', zones: ['pectoraux', 'bras', 'epaules'], materiel: [], formats: ['circuit', 'amrap', 'emom', 'tabata'], niveau: 1, unilateral: false, pattern: 'pousser', mode: 'reps', base: 10, picto: 'pompe',
    consignes: ['Place les mains sous les épaules, genoux au sol.', 'Garde une ligne droite des genoux à la tête.', 'Descends la poitrine près du sol puis pousse.'],
    erreurs: ['Laisser les fesses en l’air.', 'Descendre à moitié.'], variantes: { facile: 'pompe-murale', difficile: 'pompe' } },
  { id: 'pompe', nom: 'Pompe', zones: ['pectoraux', 'bras', 'epaules', 'tronc'], materiel: [], formats: ['circuit', 'amrap', 'emom', 'tabata', 'force'], niveau: 2, unilateral: false, pattern: 'pousser', mode: 'reps', base: 10, picto: 'pompe',
    consignes: ['Place les mains un peu plus larges que les épaules.', 'Serre les fessiers et le ventre, corps gainé.', 'Descends jusqu’à frôler le sol puis repousse.'],
    erreurs: ['Laisser tomber les hanches.', 'Avancer la tête vers le sol.'], variantes: { facile: 'pompe-genoux', difficile: 'pompe-diamant' } },
  { id: 'pompe-large', nom: 'Pompe mains écartées', zones: ['pectoraux', 'epaules'], materiel: [], formats: ['circuit', 'amrap', 'emom'], niveau: 2, unilateral: false, pattern: 'pousser', mode: 'reps', base: 10, picto: 'pompe',
    consignes: ['Écarte les mains bien au-delà des épaules.', 'Garde le corps aligné.', 'Descends lentement, remonte en expirant.'],
    erreurs: ['Hausser les épaules vers les oreilles.'], variantes: { facile: 'pompe-genoux', difficile: 'pompe-spiderman' } },
  { id: 'pompe-diamant', nom: 'Pompe diamant', zones: ['bras', 'pectoraux'], materiel: [], formats: ['circuit', 'force', 'amrap'], niveau: 3, unilateral: false, pattern: 'pousser', mode: 'reps', base: 8, picto: 'pompe',
    consignes: ['Rapproche les mains sous la poitrine, pouces et index en losange.', 'Garde les coudes près du corps.', 'Descends contrôlé puis pousse fort.'],
    erreurs: ['Écarter les coudes.', 'Creuser le dos.'], variantes: { facile: 'pompe', difficile: null } },
  { id: 'pompe-pike', nom: 'Pompe en V (épaules)', zones: ['epaules', 'bras'], materiel: [], formats: ['circuit', 'force', 'emom'], niveau: 2, unilateral: false, pattern: 'pousser', mode: 'reps', base: 8, picto: 'pompe',
    consignes: ['Monte les hanches pour former un V inversé.', 'Plie les coudes pour amener le haut du crâne vers le sol.', 'Repousse jusqu’aux bras tendus.'],
    erreurs: ['Descendre la poitrine au lieu de la tête.', 'Plier le dos en arrondi.'], variantes: { facile: 'pompe-genoux', difficile: 'pompe-hindoue' } },
  { id: 'pompe-spiderman', nom: 'Pompe spiderman', zones: ['pectoraux', 'tronc', 'hanches'], materiel: [], formats: ['circuit', 'amrap'], niveau: 3, unilateral: false, pattern: 'pousser', mode: 'reps', base: 8, picto: 'pompe',
    consignes: ['En descendant, amène un genou vers le coude du même côté.', 'Remonte en reposant le pied.', 'Alterne les côtés à chaque pompe.'],
    erreurs: ['Tourner le bassin.', 'Perdre le gainage.'], variantes: { facile: 'pompe', difficile: null } },
  { id: 'pompe-scapulaire', nom: 'Pompe scapulaire', zones: ['epaules', 'dos'], materiel: [], formats: ['circuit', 'echauffement'], niveau: 1, unilateral: false, pattern: 'pousser', mode: 'reps', base: 12, picto: 'pompe',
    consignes: ['Mets-toi en planche bras tendus.', 'Sans plier les coudes, rapproche puis écarte les omoplates.', 'Garde le cou dans l’axe.'],
    erreurs: ['Plier les coudes.', 'Bouger les hanches.'], variantes: { facile: null, difficile: 'pompe-genoux' } },
  { id: 'pompe-hindoue', nom: 'Pompe hindoue', zones: ['epaules', 'pectoraux', 'mobilite'], materiel: [], formats: ['circuit', 'amrap'], niveau: 3, unilateral: false, pattern: 'pousser', mode: 'reps', base: 8, picto: 'pompe',
    consignes: ['Pars en V inversé, hanches hautes.', 'Plonge la poitrine vers l’avant en rasant le sol.', 'Termine buste relevé puis reviens en V.'],
    erreurs: ['Aller trop vite.', 'Écraser le bas du dos en fin de mouvement.'], variantes: { facile: 'pompe-pike', difficile: null } },

  // ───────────── Poids du corps : tirer (sans barre) ─────────────
  { id: 'superman', nom: 'Superman', zones: ['dos', 'fessiers'], materiel: [], formats: ['circuit', 'amrap', 'emom', 'coureur'], niveau: 1, unilateral: false, pattern: 'tirer', mode: 'reps', base: 12, picto: 'superman',
    consignes: ['Allonge-toi sur le ventre, bras tendus devant.', 'Décolle bras et jambes ensemble, regard vers le sol.', 'Tiens 2 secondes puis repose.'],
    erreurs: ['Lever la tête vers le plafond.', 'Donner des à-coups.'], variantes: { facile: 'retraction-scapulaire-ventre', difficile: 'superman-tirage' } },
  { id: 'superman-tirage', nom: 'Superman avec tirage des coudes', zones: ['dos', 'epaules'], materiel: [], formats: ['circuit', 'amrap', 'emom'], niveau: 2, unilateral: false, pattern: 'tirer', mode: 'reps', base: 10, picto: 'superman',
    consignes: ['En position superman, bras tendus devant.', 'Tire les coudes vers les hanches en serrant les omoplates.', 'Tends à nouveau les bras sans toucher le sol.'],
    erreurs: ['Laisser retomber le buste.', 'Hausser les épaules.'], variantes: { facile: 'superman', difficile: 'nageur-au-sol' } },
  { id: 'nageur-au-sol', nom: 'Nageur au sol', zones: ['dos', 'epaules', 'fessiers'], materiel: [], formats: ['circuit', 'tabata', 'amrap'], niveau: 2, unilateral: false, pattern: 'tirer', mode: 'temps', base: 30, picto: 'superman',
    consignes: ['Allonge-toi sur le ventre, bras et jambes légèrement décollés.', 'Bats des bras et des jambes en alternance, comme en crawl.', 'Respire calmement.'],
    erreurs: ['Cambrer fort le bas du dos.', 'Poser les bras entre deux battements.'], variantes: { facile: 'superman', difficile: null } },
  { id: 'ytw-au-sol', nom: 'Y-T-W au sol', zones: ['dos', 'epaules'], materiel: [], formats: ['circuit', 'echauffement'], niveau: 2, unilateral: false, pattern: 'tirer', mode: 'reps', base: 8, picto: 'superman',
    consignes: ['Allongé sur le ventre, décolle les bras en Y, puis en T, puis en W.', 'Pouces vers le plafond.', 'Serre les omoplates à chaque lettre.'],
    erreurs: ['Lever la tête.', 'Monter les épaules vers les oreilles.'], variantes: { facile: 'anges-inverses', difficile: null } },
  { id: 'anges-inverses', nom: 'Anges inversés au sol', zones: ['dos', 'epaules'], materiel: [], formats: ['circuit', 'echauffement', 'mobilite'], niveau: 1, unilateral: false, pattern: 'tirer', mode: 'reps', base: 10, picto: 'superman',
    consignes: ['Allongé sur le ventre, bras le long du corps, mains décollées.', 'Fais glisser les bras en arc de cercle jusqu’au-dessus de la tête.', 'Reviens lentement le long du corps.'],
    erreurs: ['Toucher le sol avec les mains.', 'Forcer la nuque.'], variantes: { facile: 'retraction-scapulaire-ventre', difficile: 'ytw-au-sol' } },
  { id: 'retraction-scapulaire-ventre', nom: 'Rétraction des omoplates sur le ventre', zones: ['dos'], materiel: [], formats: ['circuit', 'echauffement'], niveau: 1, unilateral: false, pattern: 'tirer', mode: 'reps', base: 12, picto: 'superman',
    consignes: ['Allongé sur le ventre, coudes pliés à 90°, mains au sol.', 'Décolle légèrement les coudes en serrant les omoplates.', 'Relâche sans précipitation.'],
    erreurs: ['Lever le buste avec le bas du dos.'], variantes: { facile: null, difficile: 'superman' } },
  { id: 'planche-inversee', nom: 'Planche inversée', zones: ['dos', 'fessiers', 'epaules'], materiel: [], formats: ['circuit', 'tabata'], niveau: 2, unilateral: false, pattern: 'tirer', mode: 'temps', base: 30, picto: 'pont-fessier',
    consignes: ['Assis, mains au sol derrière les fesses, doigts vers les pieds.', 'Monte le bassin pour aligner épaules, hanches et talons.', 'Garde la poitrine ouverte et tiens.'],
    erreurs: ['Laisser tomber les hanches.', 'Rentrer les épaules.'], variantes: { facile: 'pont-fessier', difficile: null } },

  // ───────────── Poids du corps : genou ─────────────
  { id: 'squat', nom: 'Squat', zones: ['jambes', 'fessiers'], materiel: [], formats: ['circuit', 'amrap', 'emom', 'tabata', 'echauffement'], niveau: 1, unilateral: false, pattern: 'genou', mode: 'reps', base: 15, picto: 'squat',
    consignes: ['Pieds largeur d’épaules, pointes légèrement ouvertes.', 'Descends les fesses en arrière comme pour t’asseoir.', 'Pousse dans les talons pour remonter.'],
    erreurs: ['Laisser les genoux rentrer vers l’intérieur.', 'Décoller les talons.'], variantes: { facile: 'chaise-murale', difficile: 'squat-saute' } },
  { id: 'squat-saute', nom: 'Squat sauté', zones: ['jambes', 'fessiers', 'cardio'], materiel: [], formats: ['circuit', 'tabata', 'amrap'], niveau: 3, unilateral: false, pattern: 'genou', mode: 'reps', base: 10, picto: 'saut',
    consignes: ['Descends en squat.', 'Saute en poussant fort dans le sol.', 'Réceptionne-toi souplement, genoux fléchis.'],
    erreurs: ['Atterrir jambes tendues.', 'Laisser les genoux rentrer à la réception.'], variantes: { facile: 'squat', difficile: null } },
  { id: 'squat-sumo', nom: 'Squat sumo', zones: ['jambes', 'fessiers', 'hanches'], materiel: [], formats: ['circuit', 'amrap', 'emom'], niveau: 1, unilateral: false, pattern: 'genou', mode: 'reps', base: 15, picto: 'squat',
    consignes: ['Écarte les pieds largement, pointes vers l’extérieur.', 'Descends en gardant le buste droit.', 'Pousse les genoux dans l’axe des pieds.'],
    erreurs: ['Pencher le buste en avant.'], variantes: { facile: 'chaise-murale', difficile: 'squat-saute' } },
  { id: 'chaise-murale', nom: 'Chaise contre un mur', zones: ['jambes'], materiel: [], formats: ['circuit', 'tabata', 'coureur'], niveau: 1, unilateral: false, pattern: 'genou', mode: 'temps', base: 40, picto: 'squat',
    consignes: ['Dos contre un mur, descends jusqu’à cuisses presque parallèles au sol.', 'Genoux au-dessus des chevilles.', 'Respire et tiens la position.'],
    erreurs: ['Poser les mains sur les cuisses.', 'Descendre trop bas d’emblée.'], variantes: { facile: null, difficile: 'squat' } },
  { id: 'fente-avant', nom: 'Fente avant', zones: ['jambes', 'fessiers'], materiel: [], formats: ['circuit', 'amrap', 'emom'], niveau: 2, unilateral: true, pattern: 'genou', mode: 'reps', base: 10, picto: 'fente',
    consignes: ['Fais un grand pas en avant.', 'Descends le genou arrière près du sol.', 'Repousse avec la jambe avant pour revenir.'],
    erreurs: ['Pencher le buste.', 'Genou avant qui part vers l’intérieur.'], variantes: { facile: 'fente-arriere', difficile: 'fente-sautee' } },
  { id: 'fente-arriere', nom: 'Fente arrière', zones: ['jambes', 'fessiers'], materiel: [], formats: ['circuit', 'amrap', 'emom', 'coureur'], niveau: 1, unilateral: true, pattern: 'genou', mode: 'reps', base: 10, picto: 'fente',
    consignes: ['Recule une jambe d’un grand pas.', 'Descends à la verticale, buste droit.', 'Ramène la jambe en poussant sur le pied avant.'],
    erreurs: ['Pas trop court.', 'Genou arrière qui tape le sol.'], variantes: { facile: 'squat', difficile: 'fente-marchee' } },
  { id: 'fente-marchee', nom: 'Fente marchée', zones: ['jambes', 'fessiers'], materiel: [], formats: ['circuit', 'amrap'], niveau: 2, unilateral: false, pattern: 'genou', mode: 'reps', base: 12, picto: 'fente',
    consignes: ['Avance en enchaînant les fentes, jambe après jambe.', 'Garde le buste droit et le regard devant.', 'Compte chaque pas.'],
    erreurs: ['Perdre l’équilibre en allant trop vite.'], variantes: { facile: 'fente-arriere', difficile: 'fente-sautee' } },
  { id: 'fente-sautee', nom: 'Fente sautée', zones: ['jambes', 'cardio'], materiel: [], formats: ['tabata', 'amrap', 'circuit'], niveau: 3, unilateral: false, pattern: 'genou', mode: 'reps', base: 10, picto: 'fente',
    consignes: ['Pars en position de fente.', 'Saute et inverse les jambes en l’air.', 'Réceptionne-toi en douceur.'],
    erreurs: ['Atterrir genou tendu.', 'Pas trop serré.'], variantes: { facile: 'fente-avant', difficile: null } },
  { id: 'fente-laterale', nom: 'Fente latérale', zones: ['jambes', 'hanches', 'fessiers'], materiel: [], formats: ['circuit', 'echauffement', 'coureur'], niveau: 2, unilateral: true, pattern: 'genou', mode: 'reps', base: 10, picto: 'fente',
    consignes: ['Fais un grand pas sur le côté.', 'Fléchis cette jambe, l’autre reste tendue.', 'Repousse pour revenir au centre.'],
    erreurs: ['Décoller le talon de la jambe fléchie.', 'Arrondir le dos.'], variantes: { facile: 'squat-sumo', difficile: null } },

  // ───────────── Poids du corps : hanche ─────────────
  { id: 'pont-fessier', nom: 'Pont fessier', zones: ['fessiers', 'hanches'], materiel: [], formats: ['circuit', 'amrap', 'emom', 'coureur', 'echauffement'], niveau: 1, unilateral: false, pattern: 'hanche', mode: 'reps', base: 15, picto: 'pont-fessier',
    consignes: ['Allongé sur le dos, pieds à plat, genoux pliés.', 'Monte le bassin en serrant les fessiers.', 'Redescends lentement sans poser complètement.'],
    erreurs: ['Cambrer le bas du dos en haut.', 'Pousser avec la pointe des pieds.'], variantes: { facile: null, difficile: 'pont-fessier-unipodal' } },
  { id: 'pont-fessier-unipodal', nom: 'Pont fessier sur une jambe', zones: ['fessiers', 'hanches'], materiel: [], formats: ['circuit', 'coureur', 'force'], niveau: 2, unilateral: true, pattern: 'hanche', mode: 'reps', base: 10, picto: 'pont-fessier',
    consignes: ['En pont, tends une jambe dans le prolongement de la cuisse.', 'Monte et descends le bassin sur l’autre pied.', 'Garde le bassin bien horizontal.'],
    erreurs: ['Laisser un côté du bassin tomber.'], variantes: { facile: 'pont-fessier', difficile: null } },
  { id: 'good-morning', nom: 'Good morning au poids du corps', zones: ['dos', 'fessiers', 'jambes'], materiel: [], formats: ['circuit', 'echauffement', 'emom'], niveau: 1, unilateral: false, pattern: 'hanche', mode: 'reps', base: 12, picto: 'souleve-de-terre',
    consignes: ['Mains derrière la tête, genoux légèrement fléchis.', 'Penche le buste en poussant les fesses en arrière, dos droit.', 'Remonte en serrant les fessiers.'],
    erreurs: ['Arrondir le dos.', 'Plier beaucoup les genoux.'], variantes: { facile: null, difficile: 'souleve-de-terre-unipodal' } },
  { id: 'souleve-de-terre-unipodal', nom: 'Soulevé de terre sur une jambe', zones: ['fessiers', 'jambes', 'hanches'], materiel: [], formats: ['circuit', 'coureur', 'force'], niveau: 2, unilateral: true, pattern: 'hanche', mode: 'reps', base: 8, picto: 'souleve-de-terre',
    consignes: ['Debout sur une jambe, genou souple.', 'Penche le buste et tends l’autre jambe en arrière.', 'Reviens debout en contrôlant.'],
    erreurs: ['Ouvrir la hanche de la jambe levée.', 'Arrondir le dos.'], variantes: { facile: 'good-morning', difficile: 'equilibre-avion' } },
  { id: 'ruade-quadrupedie', nom: 'Ruade à quatre pattes', zones: ['fessiers'], materiel: [], formats: ['circuit', 'amrap', 'coureur'], niveau: 1, unilateral: true, pattern: 'hanche', mode: 'reps', base: 12, picto: 'mountain-climber',
    consignes: ['À quatre pattes, mains sous les épaules.', 'Pousse un talon vers le plafond, genou plié à 90°.', 'Redescends sans poser le genou.'],
    erreurs: ['Cambrer le dos pour monter plus haut.'], variantes: { facile: null, difficile: 'pont-fessier-unipodal' } },
  { id: 'pont-fessier-marche', nom: 'Pont fessier en marche', zones: ['fessiers', 'tronc'], materiel: [], formats: ['circuit', 'coureur'], niveau: 2, unilateral: false, pattern: 'hanche', mode: 'reps', base: 12, picto: 'pont-fessier',
    consignes: ['Monte en pont fessier.', 'Décolle un pied puis l’autre, comme une marche lente.', 'Garde le bassin haut et stable.'],
    erreurs: ['Laisser le bassin descendre à chaque pas.'], variantes: { facile: 'pont-fessier', difficile: 'pont-fessier-unipodal' } },

  // ───────────── Poids du corps : tronc ─────────────
  { id: 'planche', nom: 'Planche', zones: ['tronc'], materiel: [], formats: ['circuit', 'tabata', 'emom', 'coureur'], niveau: 1, unilateral: false, pattern: 'tronc', mode: 'temps', base: 40, picto: 'gainage-planche',
    consignes: ['Pose les avant-bras au sol, coudes sous les épaules.', 'Aligne talons, fesses et tête.', 'Serre le ventre et respire.'],
    erreurs: ['Fesses trop hautes.', 'Bas du dos qui s’affaisse.'], variantes: { facile: null, difficile: 'planche-toucher-epaule' } },
  { id: 'planche-laterale', nom: 'Planche latérale', zones: ['tronc', 'hanches'], materiel: [], formats: ['circuit', 'tabata', 'coureur'], niveau: 2, unilateral: true, pattern: 'tronc', mode: 'temps', base: 30, picto: 'gainage-lateral',
    consignes: ['Sur le côté, avant-bras au sol, coude sous l’épaule.', 'Monte le bassin pour aligner le corps.', 'Tiens sans laisser la hanche descendre.'],
    erreurs: ['Bassin qui recule.', 'Épaule tassée.'], variantes: { facile: 'planche', difficile: 'planche-laterale-jambe' } },
  { id: 'planche-toucher-epaule', nom: 'Planche avec touche d’épaule', zones: ['tronc', 'epaules'], materiel: [], formats: ['circuit', 'amrap', 'tabata'], niveau: 2, unilateral: false, pattern: 'tronc', mode: 'reps', base: 16, picto: 'gainage-planche',
    consignes: ['En planche bras tendus, pieds écartés.', 'Touche l’épaule opposée avec une main, puis l’autre.', 'Garde les hanches immobiles.'],
    erreurs: ['Balancer le bassin.'], variantes: { facile: 'planche', difficile: 'planche-dynamique' } },
  { id: 'planche-dynamique', nom: 'Planche montante', zones: ['tronc', 'bras'], materiel: [], formats: ['circuit', 'amrap', 'tabata'], niveau: 3, unilateral: false, pattern: 'tronc', mode: 'reps', base: 10, picto: 'gainage-planche',
    consignes: ['Pars en planche sur les avant-bras.', 'Monte sur une main puis l’autre jusqu’aux bras tendus.', 'Redescends sur les avant-bras et alterne le bras de départ.'],
    erreurs: ['Faire tourner les hanches.'], variantes: { facile: 'planche-toucher-epaule', difficile: null } },
  { id: 'crunch', nom: 'Crunch', zones: ['tronc'], materiel: [], formats: ['circuit', 'amrap', 'emom', 'tabata'], niveau: 1, unilateral: false, pattern: 'tronc', mode: 'reps', base: 15, picto: 'crunch',
    consignes: ['Allongé sur le dos, genoux pliés.', 'Enroule le haut du dos en expirant.', 'Redescends lentement.'],
    erreurs: ['Tirer sur la nuque.', 'Décoller tout le dos.'], variantes: { facile: 'dead-bug', difficile: 'crunch-velo' } },
  { id: 'crunch-velo', nom: 'Crunch vélo', zones: ['tronc'], materiel: [], formats: ['circuit', 'amrap', 'tabata'], niveau: 2, unilateral: false, pattern: 'tronc', mode: 'reps', base: 20, picto: 'crunch',
    consignes: ['Allongé, épaules décollées, jambes en l’air.', 'Amène un coude vers le genou opposé en tendant l’autre jambe.', 'Alterne sans à-coups.'],
    erreurs: ['Aller trop vite.', 'Tirer sur la tête.'], variantes: { facile: 'crunch', difficile: 'position-creuse' } },
  { id: 'dead-bug', nom: 'Dead bug', zones: ['tronc'], materiel: [], formats: ['circuit', 'coureur', 'echauffement'], niveau: 1, unilateral: false, pattern: 'tronc', mode: 'reps', base: 12, picto: 'crunch',
    consignes: ['Sur le dos, bras vers le plafond, genoux pliés à 90°.', 'Tends un bras et la jambe opposée vers le sol.', 'Reviens et alterne, bas du dos plaqué.'],
    erreurs: ['Décoller le bas du dos.', 'Retenir sa respiration.'], variantes: { facile: null, difficile: 'position-creuse' } },
  { id: 'bird-dog', nom: 'Bird dog', zones: ['tronc', 'dos', 'fessiers'], materiel: [], formats: ['circuit', 'coureur', 'echauffement'], niveau: 1, unilateral: false, pattern: 'tronc', mode: 'reps', base: 12, picto: 'superman',
    consignes: ['À quatre pattes, dos plat.', 'Tends un bras devant et la jambe opposée derrière.', 'Tiens une seconde puis alterne.'],
    erreurs: ['Tourner le bassin.', 'Lever la jambe trop haut.'], variantes: { facile: null, difficile: 'planche' } },
  { id: 'position-creuse', nom: 'Position creuse', zones: ['tronc'], materiel: [], formats: ['circuit', 'tabata'], niveau: 3, unilateral: false, pattern: 'tronc', mode: 'temps', base: 25, picto: 'crunch',
    consignes: ['Sur le dos, décolle épaules et jambes tendues.', 'Plaque le bas du dos au sol.', 'Tiens en respirant.'],
    erreurs: ['Bas du dos décollé.'], variantes: { facile: 'dead-bug', difficile: null } },
  { id: 'releve-jambes', nom: 'Relevé de jambes allongé', zones: ['tronc'], materiel: [], formats: ['circuit', 'amrap', 'emom'], niveau: 2, unilateral: false, pattern: 'tronc', mode: 'reps', base: 12, picto: 'crunch',
    consignes: ['Allongé sur le dos, mains sous les fesses.', 'Monte les jambes tendues jusqu’à la verticale.', 'Redescends sans toucher le sol.'],
    erreurs: ['Cambrer le dos en descendant.'], variantes: { facile: 'dead-bug', difficile: 'position-creuse' } },
  { id: 'rotation-russe', nom: 'Rotation russe', zones: ['tronc'], materiel: [], formats: ['circuit', 'amrap', 'tabata'], niveau: 2, unilateral: false, pattern: 'tronc', mode: 'reps', base: 20, picto: 'crunch',
    consignes: ['Assis, buste incliné en arrière, pieds au sol ou décollés.', 'Tourne les épaules d’un côté puis de l’autre.', 'Garde le dos long.'],
    erreurs: ['Arrondir le dos.', 'Bouger seulement les bras.'], variantes: { facile: 'crunch', difficile: null } },

  // ───────────── Poids du corps : cardio ─────────────
  { id: 'jumping-jack', nom: 'Jumping jack', zones: ['cardio', 'jambes'], materiel: [], formats: ['circuit', 'tabata', 'amrap', 'echauffement'], niveau: 1, unilateral: false, pattern: 'cardio', mode: 'temps', base: 40, picto: 'saut',
    consignes: ['Saute en écartant bras et jambes.', 'Reviens pieds joints, bras le long du corps.', 'Garde un rythme régulier.'],
    erreurs: ['Atterrir sur les talons.'], variantes: { facile: 'pas-chasses', difficile: 'burpee' } },
  { id: 'burpee', nom: 'Burpee', zones: ['cardio', 'jambes', 'pectoraux'], materiel: [], formats: ['circuit', 'tabata', 'amrap', 'emom'], niveau: 3, unilateral: false, pattern: 'cardio', mode: 'reps', base: 10, picto: 'saut',
    consignes: ['Pose les mains au sol et lance les pieds en arrière.', 'Ramène les pieds sous toi.', 'Saute bras au-dessus de la tête.'],
    erreurs: ['Laisser tomber le bassin en planche.', 'Atterrir jambes raides.'], variantes: { facile: 'burpee-sans-saut', difficile: null } },
  { id: 'burpee-sans-saut', nom: 'Burpee sans saut', zones: ['cardio', 'jambes'], materiel: [], formats: ['circuit', 'amrap', 'emom'], niveau: 2, unilateral: false, pattern: 'cardio', mode: 'reps', base: 10, picto: 'pompe',
    consignes: ['Pose les mains au sol, recule un pied puis l’autre.', 'Reviens pied après pied.', 'Relève-toi complètement.'],
    erreurs: ['Arrondir le dos en descendant.'], variantes: { facile: 'montees-genoux', difficile: 'burpee' } },
  { id: 'mountain-climber', nom: 'Mountain climber', zones: ['cardio', 'tronc'], materiel: [], formats: ['circuit', 'tabata', 'amrap'], niveau: 2, unilateral: false, pattern: 'cardio', mode: 'temps', base: 30, picto: 'mountain-climber',
    consignes: ['En planche bras tendus, mains sous les épaules.', 'Ramène un genou vers la poitrine puis l’autre, vite.', 'Garde les hanches basses.'],
    erreurs: ['Fesses trop hautes.', 'Mains en avant des épaules.'], variantes: { facile: 'montees-genoux', difficile: 'burpee' } },
  { id: 'montees-genoux', nom: 'Montées de genoux', zones: ['cardio', 'jambes'], materiel: [], formats: ['circuit', 'tabata', 'echauffement', 'coureur'], niveau: 2, unilateral: false, pattern: 'cardio', mode: 'temps', base: 30, picto: 'equilibre-unipodal',
    consignes: ['Cours sur place en montant les genoux à hauteur de hanches.', 'Reste sur l’avant du pied.', 'Accompagne avec les bras.'],
    erreurs: ['Pencher le buste en arrière.'], variantes: { facile: 'talons-fesses', difficile: 'mountain-climber' } },
  { id: 'talons-fesses', nom: 'Talons-fesses', zones: ['cardio', 'jambes'], materiel: [], formats: ['circuit', 'tabata', 'echauffement', 'coureur'], niveau: 1, unilateral: false, pattern: 'cardio', mode: 'temps', base: 30, picto: 'equilibre-unipodal',
    consignes: ['Cours sur place en ramenant les talons vers les fesses.', 'Garde les genoux vers le sol.', 'Pose l’avant du pied.'],
    erreurs: ['Avancer les genoux.'], variantes: { facile: 'pas-chasses', difficile: 'montees-genoux' } },
  { id: 'corde-imaginaire', nom: 'Corde à sauter imaginaire', zones: ['cardio', 'mollets-chevilles'], materiel: [], formats: ['circuit', 'tabata', 'echauffement'], niveau: 1, unilateral: false, pattern: 'cardio', mode: 'temps', base: 40, picto: 'saut',
    consignes: ['Saute à petite hauteur sur l’avant des pieds.', 'Fais tourner les poignets comme avec une corde.', 'Reste détendu des épaules.'],
    erreurs: ['Sauter trop haut.', 'Atterrir sur les talons.'], variantes: { facile: 'pas-chasses', difficile: 'jumping-jack' } },
  { id: 'patineur', nom: 'Patineur (sauts latéraux)', zones: ['cardio', 'jambes', 'hanches'], materiel: [], formats: ['circuit', 'tabata', 'amrap', 'coureur'], niveau: 2, unilateral: false, pattern: 'cardio', mode: 'reps', base: 16, picto: 'fente',
    consignes: ['Bondis sur le côté et réceptionne-toi sur une jambe.', 'Ramène l’autre pied derrière, sans le poser.', 'Repars de l’autre côté.'],
    erreurs: ['Genou qui rentre à la réception.'], variantes: { facile: 'pas-chasses', difficile: 'burpee' } },
  { id: 'pas-chasses', nom: 'Pas chassés', zones: ['cardio', 'jambes'], materiel: [], formats: ['circuit', 'echauffement', 'coureur'], niveau: 1, unilateral: false, pattern: 'cardio', mode: 'temps', base: 30, picto: 'fente',
    consignes: ['Déplace-toi sur le côté, genoux fléchis.', 'Rapproche les pieds sans les croiser.', 'Change de sens toutes les quelques secondes.'],
    erreurs: ['Se redresser complètement.'], variantes: { facile: null, difficile: 'patineur' } },

  // ───────────── Haltères ─────────────
  { id: 'squat-goblet-halteres', nom: 'Squat goblet à l’haltère', zones: ['jambes', 'fessiers'], materiel: ['halteres'], formats: ['circuit', 'force', 'emom'], niveau: 2, unilateral: false, pattern: 'genou', mode: 'reps', base: 12, picto: 'squat',
    consignes: ['Tiens un haltère contre la poitrine.', 'Descends en squat, coudes entre les genoux.', 'Remonte en poussant dans les talons.'],
    erreurs: ['Laisser l’haltère s’éloigner du corps.', 'Arrondir le dos.'], variantes: { facile: 'squat', difficile: 'thruster-halteres' } },
  { id: 'developpe-epaules-halteres', nom: 'Développé épaules aux haltères', zones: ['epaules', 'bras'], materiel: ['halteres'], formats: ['circuit', 'force', 'emom'], niveau: 2, unilateral: false, pattern: 'pousser', mode: 'reps', base: 10, picto: 'developpe-epaules',
    consignes: ['Haltères à hauteur d’épaules, paumes vers l’avant.', 'Pousse vers le haut jusqu’aux bras tendus.', 'Redescends lentement.'],
    erreurs: ['Cambrer le bas du dos.', 'Donner un élan avec les jambes.'], variantes: { facile: 'elevations-laterales', difficile: null } },
  { id: 'rowing-penche-halteres', nom: 'Rowing penché aux haltères', zones: ['dos', 'bras'], materiel: ['halteres'], formats: ['circuit', 'force', 'emom'], niveau: 2, unilateral: false, pattern: 'tirer', mode: 'reps', base: 12, picto: 'rowing',
    consignes: ['Penche le buste, dos plat, genoux fléchis.', 'Tire les haltères vers les hanches.', 'Serre les omoplates puis redescends.'],
    erreurs: ['Arrondir le dos.', 'Tirer avec les épaules.'], variantes: { facile: 'oiseau-halteres', difficile: 'renegade-row' } },
  { id: 'rowing-unilateral-haltere', nom: 'Rowing à un bras', zones: ['dos', 'bras'], materiel: ['halteres'], formats: ['circuit', 'force'], niveau: 2, unilateral: true, pattern: 'tirer', mode: 'reps', base: 10, picto: 'rowing',
    consignes: ['Main libre posée sur le genou, dos plat.', 'Tire l’haltère vers la hanche, coude près du corps.', 'Redescends bras tendu.'],
    erreurs: ['Tourner le buste pour tirer.'], variantes: { facile: 'rowing-penche-halteres', difficile: 'renegade-row' } },
  { id: 'souleve-de-terre-roumain-halteres', nom: 'Soulevé de terre roumain aux haltères', zones: ['fessiers', 'jambes', 'dos'], materiel: ['halteres'], formats: ['circuit', 'force', 'emom', 'coureur'], niveau: 2, unilateral: false, pattern: 'hanche', mode: 'reps', base: 12, picto: 'souleve-de-terre',
    consignes: ['Haltères devant les cuisses, genoux souples.', 'Pousse les fesses en arrière en faisant glisser les haltères le long des jambes.', 'Remonte en serrant les fessiers.'],
    erreurs: ['Arrondir le dos.', 'Plier trop les genoux.'], variantes: { facile: 'good-morning', difficile: null } },
  { id: 'fente-halteres', nom: 'Fente arrière aux haltères', zones: ['jambes', 'fessiers'], materiel: ['halteres'], formats: ['circuit', 'force', 'coureur'], niveau: 2, unilateral: true, pattern: 'genou', mode: 'reps', base: 10, picto: 'fente',
    consignes: ['Un haltère dans chaque main, bras le long du corps.', 'Recule d’un grand pas et descends.', 'Reviens en poussant sur la jambe avant.'],
    erreurs: ['Pencher le buste vers l’avant.'], variantes: { facile: 'fente-arriere', difficile: null } },
  { id: 'curl-biceps', nom: 'Curl biceps', zones: ['bras'], materiel: ['halteres'], formats: ['circuit', 'force', 'emom'], niveau: 1, unilateral: false, pattern: 'tirer', mode: 'reps', base: 12, picto: 'developpe-epaules',
    consignes: ['Debout, coudes collés au corps.', 'Monte les haltères vers les épaules.', 'Redescends lentement.'],
    erreurs: ['Balancer le buste.', 'Avancer les coudes.'], variantes: { facile: null, difficile: 'rowing-penche-halteres' } },
  { id: 'extension-triceps', nom: 'Extension triceps au-dessus de la tête', zones: ['bras'], materiel: ['halteres'], formats: ['circuit', 'emom'], niveau: 1, unilateral: false, pattern: 'pousser', mode: 'reps', base: 12, picto: 'developpe-epaules',
    consignes: ['Tiens un haltère à deux mains au-dessus de la tête.', 'Plie les coudes pour descendre l’haltère derrière la nuque.', 'Tends les bras sans écarter les coudes.'],
    erreurs: ['Cambrer le dos.', 'Ouvrir les coudes.'], variantes: { facile: null, difficile: 'developpe-epaules-halteres' } },
  { id: 'developpe-sol-halteres', nom: 'Développé couché au sol', zones: ['pectoraux', 'bras'], materiel: ['halteres'], formats: ['circuit', 'force', 'emom'], niveau: 2, unilateral: false, pattern: 'pousser', mode: 'reps', base: 12, picto: 'developpe-epaules',
    consignes: ['Allongé sur le dos, genoux pliés, haltères au-dessus de la poitrine.', 'Descends jusqu’à poser les coudes au sol.', 'Pousse vers le plafond.'],
    erreurs: ['Coudes trop écartés.', 'Rebondir sur le sol.'], variantes: { facile: 'pompe-genoux', difficile: null } },
  { id: 'elevations-laterales', nom: 'Élévations latérales', zones: ['epaules'], materiel: ['halteres'], formats: ['circuit', 'emom'], niveau: 1, unilateral: false, pattern: 'pousser', mode: 'reps', base: 12, picto: 'developpe-epaules',
    consignes: ['Bras le long du corps, coudes légèrement pliés.', 'Monte les haltères sur les côtés jusqu’à hauteur d’épaules.', 'Redescends en freinant.'],
    erreurs: ['Prendre de l’élan.', 'Monter les mains plus haut que les coudes.'], variantes: { facile: null, difficile: 'developpe-epaules-halteres' } },
  { id: 'thruster-halteres', nom: 'Thruster aux haltères', zones: ['jambes', 'epaules', 'cardio'], materiel: ['halteres'], formats: ['circuit', 'amrap', 'emom'], niveau: 3, unilateral: false, pattern: 'genou', mode: 'reps', base: 10, picto: 'squat',
    consignes: ['Haltères aux épaules, descends en squat.', 'En remontant, pousse les haltères au-dessus de la tête.', 'Enchaîne sans pause.'],
    erreurs: ['Pousser avant d’être remonté.', 'Cambrer en haut.'], variantes: { facile: 'squat-goblet-halteres', difficile: null } },
  { id: 'renegade-row', nom: 'Rowing en planche', zones: ['dos', 'tronc', 'bras'], materiel: ['halteres'], formats: ['circuit', 'amrap'], niveau: 3, unilateral: false, pattern: 'tirer', mode: 'reps', base: 10, picto: 'pompe',
    consignes: ['En planche, mains sur les haltères, pieds écartés.', 'Tire un haltère vers la hanche sans tourner le bassin.', 'Repose et alterne.'],
    erreurs: ['Pivoter les hanches.'], variantes: { facile: 'rowing-penche-halteres', difficile: null } },
  { id: 'marche-fermier', nom: 'Marche du fermier', zones: ['tronc', 'bras', 'epaules'], materiel: ['halteres'], formats: ['circuit', 'force'], niveau: 1, unilateral: false, pattern: 'tronc', mode: 'temps', base: 40, picto: 'souleve-de-terre',
    consignes: ['Un haltère lourd dans chaque main.', 'Marche à petits pas, épaules basses, buste droit.', 'Pose les haltères en pliant les jambes.'],
    erreurs: ['Pencher d’un côté.', 'Hausser les épaules.'], variantes: { facile: null, difficile: 'marche-valise-kettlebell' } },
  { id: 'pont-fessier-haltere', nom: 'Pont fessier lesté', zones: ['fessiers', 'hanches'], materiel: ['halteres'], formats: ['circuit', 'force'], niveau: 2, unilateral: false, pattern: 'hanche', mode: 'reps', base: 12, picto: 'pont-fessier',
    consignes: ['Pose un haltère sur le bassin, tenu à deux mains.', 'Monte le bassin en serrant les fessiers.', 'Redescends lentement.'],
    erreurs: ['Cambrer en haut.'], variantes: { facile: 'pont-fessier', difficile: null } },
  { id: 'oiseau-halteres', nom: 'Oiseau aux haltères', zones: ['dos', 'epaules'], materiel: ['halteres'], formats: ['circuit', 'emom'], niveau: 1, unilateral: false, pattern: 'tirer', mode: 'reps', base: 12, picto: 'rowing',
    consignes: ['Buste penché, haltères sous les épaules.', 'Écarte les bras sur les côtés, coudes légèrement pliés.', 'Redescends en contrôlant.'],
    erreurs: ['Prendre de l’élan avec le buste.'], variantes: { facile: 'anges-inverses', difficile: 'rowing-penche-halteres' } },

  // ───────────── Kettlebell ─────────────
  { id: 'swing-kettlebell', nom: 'Swing kettlebell', zones: ['fessiers', 'dos', 'cardio'], materiel: ['kettlebell'], formats: ['circuit', 'emom', 'amrap', 'tabata'], niveau: 2, unilateral: false, pattern: 'hanche', mode: 'reps', base: 15, picto: 'kettlebell-swing',
    consignes: ['Pieds un peu plus larges que les hanches, kettlebell à deux mains.', 'Fais passer la kettlebell entre les jambes en poussant les fesses en arrière.', 'Projette les hanches pour l’amener à hauteur de poitrine.'],
    erreurs: ['Lever avec les bras.', 'Faire un squat au lieu d’une charnière de hanche.'], variantes: { facile: 'souleve-de-terre-kettlebell', difficile: 'swing-une-main' } },
  { id: 'swing-une-main', nom: 'Swing à une main', zones: ['fessiers', 'tronc', 'cardio'], materiel: ['kettlebell'], formats: ['circuit', 'emom'], niveau: 3, unilateral: true, pattern: 'hanche', mode: 'reps', base: 10, picto: 'kettlebell-swing',
    consignes: ['Tiens la kettlebell d’une main.', 'Fais le même mouvement de hanches qu’au swing classique.', 'Résiste à la rotation du buste.'],
    erreurs: ['Tourner les épaules.'], variantes: { facile: 'swing-kettlebell', difficile: 'arrache-kettlebell' } },
  { id: 'squat-goblet-kettlebell', nom: 'Squat goblet à la kettlebell', zones: ['jambes', 'fessiers'], materiel: ['kettlebell'], formats: ['circuit', 'force', 'emom'], niveau: 2, unilateral: false, pattern: 'genou', mode: 'reps', base: 12, picto: 'squat',
    consignes: ['Tiens la kettlebell par les cornes, contre la poitrine.', 'Descends en squat, buste fier.', 'Remonte en poussant dans le sol.'],
    erreurs: ['Laisser tomber la poitrine.'], variantes: { facile: 'squat', difficile: null } },
  { id: 'souleve-de-terre-kettlebell', nom: 'Soulevé de terre à la kettlebell', zones: ['fessiers', 'dos', 'jambes'], materiel: ['kettlebell'], formats: ['circuit', 'force', 'emom'], niveau: 1, unilateral: false, pattern: 'hanche', mode: 'reps', base: 12, picto: 'souleve-de-terre',
    consignes: ['Kettlebell entre les pieds.', 'Pousse les fesses en arrière, dos plat, et saisis la poignée.', 'Redresse-toi en poussant les hanches vers l’avant.'],
    erreurs: ['Arrondir le dos.', 'Tirer avec les bras.'], variantes: { facile: 'good-morning', difficile: 'swing-kettlebell' } },
  { id: 'epaule-kettlebell', nom: 'Épaulé à la kettlebell', zones: ['fessiers', 'epaules', 'bras'], materiel: ['kettlebell'], formats: ['circuit', 'emom'], niveau: 3, unilateral: true, pattern: 'hanche', mode: 'reps', base: 8, picto: 'kettlebell-swing',
    consignes: ['Pars comme un swing à une main.', 'Tire le coude près du corps et laisse la kettlebell se poser sur l’avant-bras.', 'Redescends en contrôlant.'],
    erreurs: ['Laisser la kettlebell taper le poignet.'], variantes: { facile: 'swing-une-main', difficile: 'arrache-kettlebell' } },
  { id: 'developpe-kettlebell', nom: 'Développé à la kettlebell', zones: ['epaules', 'bras', 'tronc'], materiel: ['kettlebell'], formats: ['circuit', 'force'], niveau: 2, unilateral: true, pattern: 'pousser', mode: 'reps', base: 8, picto: 'developpe-epaules',
    consignes: ['Kettlebell en position rackée contre l’épaule.', 'Pousse vers le haut jusqu’au bras tendu.', 'Serre les fessiers pour ne pas cambrer.'],
    erreurs: ['Pencher le buste sur le côté.'], variantes: { facile: null, difficile: null } },
  { id: 'rowing-kettlebell', nom: 'Rowing à la kettlebell', zones: ['dos', 'bras'], materiel: ['kettlebell'], formats: ['circuit', 'force'], niveau: 2, unilateral: true, pattern: 'tirer', mode: 'reps', base: 10, picto: 'rowing',
    consignes: ['En fente, buste penché, main libre sur la cuisse.', 'Tire la kettlebell vers la hanche.', 'Redescends bras tendu.'],
    erreurs: ['Arrondir le dos.'], variantes: { facile: null, difficile: 'tirage-haut-kettlebell' } },
  { id: 'halo-kettlebell', nom: 'Halo à la kettlebell', zones: ['epaules', 'mobilite'], materiel: ['kettlebell'], formats: ['echauffement', 'mobilite', 'circuit'], niveau: 1, unilateral: false, pattern: 'mobilite', mode: 'reps', base: 8, picto: 'etirement',
    consignes: ['Tiens la kettlebell à l’envers, devant la poitrine.', 'Fais-la tourner lentement autour de la tête.', 'Change de sens à mi-série.'],
    erreurs: ['Cambrer le dos.', 'Choisir une charge trop lourde.'], variantes: { facile: null, difficile: null } },
  { id: 'releve-turc', nom: 'Relevé turc', zones: ['tronc', 'epaules', 'hanches'], materiel: ['kettlebell'], formats: ['force', 'circuit'], niveau: 3, unilateral: true, pattern: 'tronc', mode: 'reps', base: 3, picto: 'gainage-lateral',
    consignes: ['Allongé, kettlebell bras tendu vers le plafond.', 'Relève-toi étape par étape en gardant le regard sur la kettlebell.', 'Redescends dans l’ordre inverse.'],
    erreurs: ['Plier le bras porteur.', 'Aller trop vite.'], variantes: { facile: 'planche-laterale', difficile: null } },
  { id: 'arrache-kettlebell', nom: 'Arraché à la kettlebell', zones: ['fessiers', 'epaules', 'cardio'], materiel: ['kettlebell'], formats: ['emom', 'circuit'], niveau: 3, unilateral: true, pattern: 'hanche', mode: 'reps', base: 8, picto: 'kettlebell-swing',
    consignes: ['Pars d’un swing à une main.', 'Tire la kettlebell près du corps jusqu’au-dessus de la tête.', 'Termine bras tendu, puis redescends en contrôlant.'],
    erreurs: ['Laisser la kettlebell basculer sur l’avant-bras.'], variantes: { facile: 'swing-une-main', difficile: null } },
  { id: 'marche-valise-kettlebell', nom: 'Marche avec valise', zones: ['tronc', 'hanches'], materiel: ['kettlebell'], formats: ['circuit', 'force', 'coureur'], niveau: 2, unilateral: true, pattern: 'tronc', mode: 'temps', base: 30, picto: 'souleve-de-terre',
    consignes: ['Tiens la kettlebell d’une seule main, bras tendu.', 'Marche en gardant les épaules à l’horizontale.', 'Change de main à mi-temps.'],
    erreurs: ['Pencher du côté de la charge.'], variantes: { facile: 'marche-fermier', difficile: null } },
  { id: 'tirage-haut-kettlebell', nom: 'Tirage haut à la kettlebell', zones: ['dos', 'epaules', 'fessiers'], materiel: ['kettlebell'], formats: ['circuit', 'emom'], niveau: 2, unilateral: false, pattern: 'tirer', mode: 'reps', base: 12, picto: 'kettlebell-swing',
    consignes: ['Pars d’un soulevé de terre.', 'En te redressant, tire la kettlebell jusqu’au menton, coudes hauts.', 'Redescends en contrôlant.'],
    erreurs: ['Tirer seulement avec les bras.'], variantes: { facile: 'souleve-de-terre-kettlebell', difficile: null } },

  // ───────────── Step ─────────────
  { id: 'montee-step', nom: 'Montée sur step', zones: ['jambes', 'fessiers'], materiel: ['step'], formats: ['circuit', 'amrap', 'coureur'], niveau: 1, unilateral: true, pattern: 'genou', mode: 'reps', base: 10, picto: 'step',
    consignes: ['Pose tout le pied sur le step.', 'Monte en poussant sur cette jambe.', 'Redescends en contrôlant.'],
    erreurs: ['Pousser avec la jambe du bas.', 'Genou qui rentre.'], variantes: { facile: 'squat', difficile: 'montee-step-genou' } },
  { id: 'montee-step-genou', nom: 'Montée sur step genou haut', zones: ['jambes', 'fessiers', 'cardio'], materiel: ['step'], formats: ['circuit', 'amrap', 'coureur'], niveau: 2, unilateral: true, pattern: 'genou', mode: 'reps', base: 10, picto: 'step',
    consignes: ['Monte sur le step avec une jambe.', 'Monte l’autre genou à hauteur de hanche en haut.', 'Redescends le pied derrière.'],
    erreurs: ['Pencher le buste en avant.'], variantes: { facile: 'montee-step', difficile: 'saut-step' } },
  { id: 'descente-excentrique-step', nom: 'Descente lente du step', zones: ['jambes', 'mollets-chevilles'], materiel: ['step'], formats: ['coureur', 'force'], niveau: 2, unilateral: true, pattern: 'genou', mode: 'reps', base: 8, picto: 'step',
    consignes: ['Debout sur le step sur une jambe.', 'Descends l’autre talon vers le sol en 3 à 4 secondes.', 'Effleure le sol puis remonte.'],
    erreurs: ['Laisser le genou partir vers l’intérieur.', 'Se laisser tomber.'], variantes: { facile: 'montee-step', difficile: null } },
  { id: 'step-aerobic', nom: 'Pas de base au step', zones: ['cardio', 'jambes'], materiel: ['step'], formats: ['circuit', 'tabata', 'echauffement'], niveau: 1, unilateral: false, pattern: 'cardio', mode: 'temps', base: 45, picto: 'step',
    consignes: ['Monte un pied puis l’autre sur le step.', 'Redescends dans le même ordre.', 'Garde un rythme régulier et change de pied de départ.'],
    erreurs: ['Poser seulement la pointe du pied.'], variantes: { facile: null, difficile: 'saut-step' } },
  { id: 'saut-step', nom: 'Saut sur le step', zones: ['jambes', 'cardio'], materiel: ['step'], formats: ['circuit', 'amrap'], niveau: 3, unilateral: false, pattern: 'cardio', mode: 'reps', base: 8, picto: 'step',
    consignes: ['Pieds largeur de hanches, face au step.', 'Saute à pieds joints et réceptionne-toi en douceur.', 'Redescends en marchant.'],
    erreurs: ['Atterrir sur les talons.', 'Redescendre en sautant.'], variantes: { facile: 'montee-step-genou', difficile: null } },
  { id: 'mollets-step', nom: 'Mollets sur une marche', zones: ['mollets-chevilles'], materiel: ['step'], formats: ['coureur', 'circuit'], niveau: 1, unilateral: false, pattern: 'pieds', mode: 'reps', base: 15, picto: 'mollets',
    consignes: ['Avant des pieds sur le bord du step.', 'Descends les talons sous le niveau de la marche.', 'Monte haut sur la pointe, puis redescends lentement.'],
    erreurs: ['Rebondir en bas.'], variantes: { facile: 'mollets-debout', difficile: 'mollets-unipodal' } },
  { id: 'dips-step', nom: 'Dips sur step', zones: ['bras', 'epaules'], materiel: ['step'], formats: ['circuit', 'emom'], niveau: 2, unilateral: false, pattern: 'pousser', mode: 'reps', base: 10, picto: 'pompe',
    consignes: ['Mains sur le bord du step, dos au step.', 'Plie les coudes vers l’arrière pour descendre.', 'Pousse pour remonter bras tendus.'],
    erreurs: ['Écarter les coudes.', 'Descendre trop bas.'], variantes: { facile: 'pompe-genoux', difficile: null } },
  { id: 'pompe-inclinee-step', nom: 'Pompe mains sur le step', zones: ['pectoraux', 'bras'], materiel: ['step'], formats: ['circuit', 'amrap'], niveau: 1, unilateral: false, pattern: 'pousser', mode: 'reps', base: 12, picto: 'pompe',
    consignes: ['Pose les mains sur le step, corps gainé.', 'Descends la poitrine vers le bord.', 'Repousse jusqu’aux bras tendus.'],
    erreurs: ['Laisser tomber les hanches.'], variantes: { facile: 'pompe-murale', difficile: 'pompe' } },

  // ───────────── Barre de traction ─────────────
  { id: 'suspension-barre', nom: 'Suspension à la barre', zones: ['dos', 'bras', 'epaules'], materiel: ['barre-traction'], formats: ['circuit', 'force', 'mobilite'], niveau: 1, unilateral: false, pattern: 'tirer', mode: 'temps', base: 30, picto: 'traction',
    consignes: ['Agrippe la barre, mains largeur d’épaules.', 'Laisse le corps pendre, épaules légèrement engagées.', 'Respire et tiens.'],
    erreurs: ['Se balancer.'], variantes: { facile: null, difficile: 'traction-scapulaire' } },
  { id: 'traction-scapulaire', nom: 'Traction scapulaire', zones: ['dos', 'epaules'], materiel: ['barre-traction'], formats: ['circuit', 'force', 'echauffement'], niveau: 1, unilateral: false, pattern: 'tirer', mode: 'reps', base: 10, picto: 'traction',
    consignes: ['Suspendu, bras tendus.', 'Monte légèrement le corps en abaissant les épaules.', 'Relâche sans plier les coudes.'],
    erreurs: ['Plier les bras.'], variantes: { facile: 'suspension-barre', difficile: 'traction-negative' } },
  { id: 'traction-negative', nom: 'Traction négative', zones: ['dos', 'bras'], materiel: ['barre-traction'], formats: ['force', 'circuit'], niveau: 2, unilateral: false, pattern: 'tirer', mode: 'reps', base: 5, picto: 'traction',
    consignes: ['Pars menton au-dessus de la barre, en sautant ou avec un appui.', 'Descends le plus lentement possible.', 'Tends complètement les bras en bas.'],
    erreurs: ['Se laisser tomber.'], variantes: { facile: 'traction-scapulaire', difficile: 'traction' } },
  { id: 'traction', nom: 'Traction', zones: ['dos', 'bras'], materiel: ['barre-traction'], formats: ['force', 'emom', 'circuit'], niveau: 3, unilateral: false, pattern: 'tirer', mode: 'reps', base: 6, picto: 'traction',
    consignes: ['Mains en pronation, un peu plus larges que les épaules.', 'Tire jusqu’à passer le menton au-dessus de la barre.', 'Redescends bras tendus.'],
    erreurs: ['Se balancer.', 'Faire des demi-répétitions.'], variantes: { facile: 'traction-negative', difficile: null } },
  { id: 'traction-supination', nom: 'Traction en supination', zones: ['dos', 'bras'], materiel: ['barre-traction'], formats: ['force', 'emom'], niveau: 3, unilateral: false, pattern: 'tirer', mode: 'reps', base: 6, picto: 'traction',
    consignes: ['Mains paumes vers toi, largeur d’épaules.', 'Tire la poitrine vers la barre.', 'Redescends en contrôlant.'],
    erreurs: ['Lancer les jambes.'], variantes: { facile: 'traction-negative', difficile: null } },
  { id: 'releve-genoux-suspendu', nom: 'Relevé de genoux suspendu', zones: ['tronc', 'hanches'], materiel: ['barre-traction'], formats: ['circuit', 'emom'], niveau: 2, unilateral: false, pattern: 'tronc', mode: 'reps', base: 10, picto: 'traction',
    consignes: ['Suspendu, épaules engagées.', 'Monte les genoux vers la poitrine en enroulant le bassin.', 'Redescends sans te balancer.'],
    erreurs: ['Prendre de l’élan.'], variantes: { facile: 'releve-jambes', difficile: null } },

  // ───────────── Machines cardio ─────────────
  { id: 'velo-endurance', nom: 'Vélo en endurance', zones: ['cardio', 'jambes'], materiel: ['velo'], formats: ['circuit', 'echauffement', 'retour-calme', 'coureur'], niveau: 1, unilateral: false, pattern: 'cardio', mode: 'temps', base: 300, picto: 'velo',
    consignes: ['Règle la selle pour garder une légère flexion du genou en bas.', 'Pédale à allure où tu peux parler.', 'Garde les épaules détendues.'],
    erreurs: ['Selle trop basse.'], variantes: { facile: null, difficile: 'velo-cote' } },
  { id: 'velo-cote', nom: 'Vélo en côte (résistance)', zones: ['cardio', 'jambes', 'fessiers'], materiel: ['velo'], formats: ['circuit', 'emom'], niveau: 2, unilateral: false, pattern: 'cardio', mode: 'temps', base: 60, picto: 'velo',
    consignes: ['Augmente nettement la résistance.', 'Pédale plus lentement en poussant fort.', 'Reste assis, buste stable.'],
    erreurs: ['Tirer sur le guidon.'], variantes: { facile: 'velo-endurance', difficile: 'velo-sprints' } },
  { id: 'velo-sprints', nom: 'Sprints à vélo', zones: ['cardio', 'jambes'], materiel: ['velo'], formats: ['tabata', 'emom', 'circuit'], niveau: 3, unilateral: false, pattern: 'cardio', mode: 'temps', base: 20, picto: 'velo',
    consignes: ['Résistance moyenne.', 'Pédale aussi vite que possible pendant le temps indiqué.', 'Récupère en pédalant doucement.'],
    erreurs: ['Rebondir sur la selle.'], variantes: { facile: 'velo-cote', difficile: null } },
  { id: 'rameur-endurance', nom: 'Rameur en endurance', zones: ['cardio', 'dos', 'jambes'], materiel: ['rameur'], formats: ['circuit', 'echauffement', 'retour-calme'], niveau: 1, unilateral: false, pattern: 'cardio', mode: 'temps', base: 300, picto: 'rameur',
    consignes: ['Pousse d’abord avec les jambes, puis bascule le buste, puis tire les bras.', 'Reviens dans l’ordre inverse.', 'Garde un rythme calme.'],
    erreurs: ['Tirer avec les bras avant les jambes.', 'Arrondir le dos.'], variantes: { facile: null, difficile: 'rameur-puissance' } },
  { id: 'rameur-puissance', nom: 'Rameur en puissance', zones: ['cardio', 'dos', 'jambes'], materiel: ['rameur'], formats: ['circuit', 'emom'], niveau: 2, unilateral: false, pattern: 'cardio', mode: 'temps', base: 60, picto: 'rameur',
    consignes: ['Coups de rame amples et puissants.', 'Garde une cadence modérée.', 'Accentue la poussée des jambes.'],
    erreurs: ['Accélérer la cadence au lieu de pousser.'], variantes: { facile: 'rameur-endurance', difficile: 'rameur-intervalles' } },
  { id: 'rameur-intervalles', nom: 'Intervalles au rameur', zones: ['cardio'], materiel: ['rameur'], formats: ['tabata', 'emom', 'circuit'], niveau: 3, unilateral: false, pattern: 'cardio', mode: 'temps', base: 30, picto: 'rameur',
    consignes: ['Rame vite et fort pendant le temps indiqué.', 'Récupère en ramant très doucement.', 'Garde la technique même fatigué.'],
    erreurs: ['Raccourcir les coups.'], variantes: { facile: 'rameur-puissance', difficile: null } },
  { id: 'ski-erg-endurance', nom: 'Ski-erg en endurance', zones: ['cardio', 'dos', 'bras'], materiel: ['ski-erg'], formats: ['circuit', 'echauffement'], niveau: 1, unilateral: false, pattern: 'cardio', mode: 'temps', base: 240, picto: 'ski-erg',
    consignes: ['Bras tendus en haut, tire les poignées vers les hanches.', 'Accompagne avec une légère flexion des hanches.', 'Remonte en te grandissant.'],
    erreurs: ['Plier uniquement les bras.'], variantes: { facile: null, difficile: 'ski-erg-alterne' } },
  { id: 'ski-erg-alterne', nom: 'Ski-erg bras alternés', zones: ['cardio', 'dos', 'tronc'], materiel: ['ski-erg'], formats: ['circuit', 'emom'], niveau: 2, unilateral: false, pattern: 'cardio', mode: 'temps', base: 60, picto: 'ski-erg',
    consignes: ['Tire une poignée puis l’autre, comme en ski de fond.', 'Garde le buste gainé.', 'Cherche un rythme fluide.'],
    erreurs: ['Tourner fortement le buste.'], variantes: { facile: 'ski-erg-endurance', difficile: 'ski-erg-sprints' } },
  { id: 'ski-erg-sprints', nom: 'Sprints au ski-erg', zones: ['cardio'], materiel: ['ski-erg'], formats: ['tabata', 'emom', 'circuit'], niveau: 3, unilateral: false, pattern: 'cardio', mode: 'temps', base: 20, picto: 'ski-erg',
    consignes: ['Tire fort et vite pendant le temps indiqué.', 'Utilise tout le corps.', 'Récupère en tirant très doucement.'],
    erreurs: ['Perdre l’engagement du tronc.'], variantes: { facile: 'ski-erg-alterne', difficile: null } },

  // ───────────── Spécial coureur ─────────────
  { id: 'planche-genou-coude', nom: 'Planche genou-coude', zones: ['tronc', 'hanches'], materiel: [], formats: ['coureur', 'circuit'], niveau: 2, unilateral: false, pattern: 'tronc', mode: 'reps', base: 12, picto: 'gainage-planche',
    consignes: ['En planche sur les avant-bras.', 'Amène un genou vers le coude du même côté.', 'Reviens et alterne sans bouger le bassin.'],
    erreurs: ['Monter les fesses.'], variantes: { facile: 'planche', difficile: 'mountain-climber' } },
  { id: 'planche-laterale-jambe', nom: 'Planche latérale jambe levée', zones: ['tronc', 'hanches', 'fessiers'], materiel: [], formats: ['coureur', 'circuit'], niveau: 3, unilateral: true, pattern: 'tronc', mode: 'temps', base: 25, picto: 'gainage-lateral',
    consignes: ['En planche latérale.', 'Lève la jambe du dessus, tendue.', 'Tiens en gardant le bassin haut.'],
    erreurs: ['Laisser la hanche s’affaisser.'], variantes: { facile: 'planche-laterale', difficile: null } },
  { id: 'coquillage', nom: 'Coquillage', zones: ['hanches', 'fessiers'], materiel: [], formats: ['coureur', 'circuit', 'echauffement'], niveau: 1, unilateral: true, pattern: 'hanche', mode: 'reps', base: 15, picto: 'gainage-lateral',
    consignes: ['Allongé sur le côté, genoux pliés, pieds joints.', 'Ouvre le genou du dessus sans décoller les pieds.', 'Referme lentement.'],
    erreurs: ['Basculer le bassin en arrière.'], variantes: { facile: null, difficile: 'abduction-allongee' } },
  { id: 'abduction-allongee', nom: 'Élévation latérale de jambe allongé', zones: ['hanches', 'fessiers'], materiel: [], formats: ['coureur', 'circuit'], niveau: 1, unilateral: true, pattern: 'hanche', mode: 'reps', base: 15, picto: 'gainage-lateral',
    consignes: ['Allongé sur le côté, jambes tendues.', 'Monte la jambe du dessus, talon légèrement en arrière.', 'Redescends sans la poser.'],
    erreurs: ['Pointer le pied vers le plafond.', 'Rouler en arrière.'], variantes: { facile: 'coquillage', difficile: 'planche-laterale-jambe' } },
  { id: 'bouche-incendie', nom: 'Ouverture de hanche à quatre pattes', zones: ['hanches', 'fessiers'], materiel: [], formats: ['coureur', 'circuit', 'echauffement'], niveau: 1, unilateral: true, pattern: 'hanche', mode: 'reps', base: 12, picto: 'mountain-climber',
    consignes: ['À quatre pattes, dos plat.', 'Ouvre un genou plié sur le côté.', 'Redescends sans poser le genou.'],
    erreurs: ['Pencher tout le corps du côté opposé.'], variantes: { facile: 'coquillage', difficile: null } },
  { id: 'marche-laterale-flechie', nom: 'Marche latérale fléchie', zones: ['hanches', 'fessiers', 'jambes'], materiel: [], formats: ['coureur', 'echauffement', 'circuit'], niveau: 2, unilateral: false, pattern: 'hanche', mode: 'temps', base: 30, picto: 'squat',
    consignes: ['Fléchis légèrement les genoux, buste droit.', 'Fais de petits pas sur le côté sans te relever.', 'Change de sens à mi-temps.'],
    erreurs: ['Laisser les genoux rentrer.', 'Traîner les pieds.'], variantes: { facile: 'coquillage', difficile: null } },
  { id: 'squat-unipodal-assiste', nom: 'Squat sur une jambe assisté', zones: ['jambes', 'fessiers'], materiel: [], formats: ['coureur', 'force'], niveau: 3, unilateral: true, pattern: 'genou', mode: 'reps', base: 6, picto: 'squat',
    consignes: ['Tiens-toi légèrement à un appui stable.', 'Descends sur une jambe, l’autre tendue devant.', 'Remonte en gardant le genou dans l’axe du pied.'],
    erreurs: ['Genou qui part vers l’intérieur.', 'Descendre trop bas trop tôt.'], variantes: { facile: 'fente-excentrique', difficile: null } },
  { id: 'fente-excentrique', nom: 'Fente arrière lente', zones: ['jambes', 'fessiers'], materiel: [], formats: ['coureur', 'force', 'circuit'], niveau: 2, unilateral: true, pattern: 'genou', mode: 'reps', base: 8, picto: 'fente',
    consignes: ['Recule une jambe et descends en 4 secondes.', 'Freine avec la cuisse avant.', 'Remonte normalement.'],
    erreurs: ['Accélérer la fin de la descente.'], variantes: { facile: 'squat-excentrique', difficile: 'squat-unipodal-assiste' } },
  { id: 'squat-excentrique', nom: 'Squat à descente lente', zones: ['jambes'], materiel: [], formats: ['coureur', 'force', 'circuit'], niveau: 1, unilateral: false, pattern: 'genou', mode: 'reps', base: 10, picto: 'squat',
    consignes: ['Descends en squat en comptant 5 secondes.', 'Garde les talons au sol.', 'Remonte en 1 seconde.'],
    erreurs: ['Se laisser tomber en bas.'], variantes: { facile: 'chaise-murale', difficile: 'fente-excentrique' } },
  { id: 'mollets-debout', nom: 'Élévation des mollets', zones: ['mollets-chevilles'], materiel: [], formats: ['coureur', 'circuit', 'echauffement'], niveau: 1, unilateral: false, pattern: 'pieds', mode: 'reps', base: 20, picto: 'mollets',
    consignes: ['Debout, pieds largeur de hanches.', 'Monte sur la pointe des pieds le plus haut possible.', 'Redescends lentement.'],
    erreurs: ['Laisser les chevilles partir vers l’extérieur.'], variantes: { facile: null, difficile: 'mollets-unipodal' } },
  { id: 'mollets-unipodal', nom: 'Mollets sur une jambe', zones: ['mollets-chevilles'], materiel: [], formats: ['coureur', 'circuit', 'force'], niveau: 2, unilateral: true, pattern: 'pieds', mode: 'reps', base: 12, picto: 'mollets',
    consignes: ['Debout sur un pied, une main sur un appui.', 'Monte sur la pointe puis redescends en 3 secondes.', 'Garde le genou tendu.'],
    erreurs: ['Plier le genou pour tricher.'], variantes: { facile: 'mollets-debout', difficile: 'pogo' } },
  { id: 'mollets-genoux-flechis', nom: 'Mollets genoux fléchis', zones: ['mollets-chevilles'], materiel: [], formats: ['coureur', 'circuit'], niveau: 2, unilateral: false, pattern: 'pieds', mode: 'reps', base: 15, picto: 'mollets',
    consignes: ['Fléchis les genoux comme en quart de squat.', 'Monte sur les pointes sans changer la flexion.', 'Redescends lentement.'],
    erreurs: ['Se relever en montant.'], variantes: { facile: 'mollets-debout', difficile: 'mollets-unipodal' } },
  { id: 'marche-pointes', nom: 'Marche sur la pointe des pieds', zones: ['mollets-chevilles'], materiel: [], formats: ['coureur', 'echauffement'], niveau: 1, unilateral: false, pattern: 'pieds', mode: 'temps', base: 30, picto: 'mollets',
    consignes: ['Monte sur la pointe des pieds.', 'Marche à petits pas en restant haut.', 'Garde le buste grand.'],
    erreurs: ['Laisser les talons redescendre.'], variantes: { facile: null, difficile: 'marche-talons' } },
  { id: 'marche-talons', nom: 'Marche sur les talons', zones: ['mollets-chevilles'], materiel: [], formats: ['coureur', 'echauffement'], niveau: 1, unilateral: false, pattern: 'pieds', mode: 'temps', base: 30, picto: 'mollets',
    consignes: ['Relève les pointes de pieds.', 'Marche sur les talons à petits pas.', 'Reste droit.'],
    erreurs: ['Pencher les fesses en arrière.'], variantes: { facile: 'marche-pointes', difficile: null } },
  { id: 'equilibre-unipodal', nom: 'Équilibre sur une jambe', zones: ['mollets-chevilles', 'hanches'], materiel: [], formats: ['coureur', 'echauffement', 'mobilite'], niveau: 1, unilateral: true, pattern: 'pieds', mode: 'temps', base: 30, picto: 'equilibre-unipodal',
    consignes: ['Tiens-toi sur un pied, genou légèrement souple.', 'Monte l’autre genou devant toi.', 'Fixe un point devant et respire.'],
    erreurs: ['Bloquer le genou d’appui.'], variantes: { facile: null, difficile: 'equilibre-yeux-fermes' } },
  { id: 'equilibre-yeux-fermes', nom: 'Équilibre yeux fermés', zones: ['mollets-chevilles'], materiel: [], formats: ['coureur', 'mobilite'], niveau: 2, unilateral: true, pattern: 'pieds', mode: 'temps', base: 20, picto: 'equilibre-unipodal',
    consignes: ['Place-toi près d’un appui.', 'Tiens sur un pied, puis ferme les yeux.', 'Rouvre les yeux si tu perds l’équilibre.'],
    erreurs: ['S’éloigner de l’appui.'], variantes: { facile: 'equilibre-unipodal', difficile: null } },
  { id: 'equilibre-avion', nom: 'Équilibre en avion', zones: ['hanches', 'fessiers', 'mollets-chevilles'], materiel: [], formats: ['coureur', 'circuit'], niveau: 3, unilateral: true, pattern: 'pieds', mode: 'temps', base: 20, picto: 'equilibre-unipodal',
    consignes: ['Sur une jambe, penche le buste en avant.', 'Tends l’autre jambe derrière, bras écartés.', 'Tiens la position, bassin à l’horizontale.'],
    erreurs: ['Ouvrir la hanche de la jambe levée.'], variantes: { facile: 'souleve-de-terre-unipodal', difficile: null } },
  { id: 'pogo', nom: 'Sautillements de cheville', zones: ['mollets-chevilles', 'cardio'], materiel: [], formats: ['coureur', 'echauffement', 'tabata'], niveau: 2, unilateral: false, pattern: 'pieds', mode: 'temps', base: 20, picto: 'saut',
    consignes: ['Sautille vite sur l’avant des pieds.', 'Garde les genoux presque tendus.', 'Cherche un contact au sol très court.'],
    erreurs: ['Atterrir sur les talons.', 'Plier beaucoup les genoux.'], variantes: { facile: 'mollets-debout', difficile: 'saut-reception-unipodale' } },
  { id: 'saut-reception-unipodale', nom: 'Saut avec réception sur une jambe', zones: ['jambes', 'mollets-chevilles'], materiel: [], formats: ['coureur', 'circuit'], niveau: 3, unilateral: true, pattern: 'pieds', mode: 'reps', base: 6, picto: 'saut',
    consignes: ['Fais un petit saut vers l’avant.', 'Réceptionne-toi sur une jambe, genou fléchi.', 'Stabilise 2 secondes avant de recommencer.'],
    erreurs: ['Genou qui rentre à la réception.', 'Sauter trop loin.'], variantes: { facile: 'equilibre-unipodal', difficile: null } },
  { id: 'alphabet-cheville', nom: 'Alphabet de la cheville', zones: ['mollets-chevilles', 'mobilite'], materiel: [], formats: ['coureur', 'echauffement', 'mobilite'], niveau: 1, unilateral: true, pattern: 'pieds', mode: 'temps', base: 40, picto: 'equilibre-unipodal',
    consignes: ['Debout sur une jambe ou assis.', 'Dessine les lettres de l’alphabet avec la pointe du pied.', 'Fais des gestes amples et lents.'],
    erreurs: ['Bouger toute la jambe au lieu de la cheville.'], variantes: { facile: null, difficile: 'equilibre-unipodal' } },

  // ───────────── Mobilité, échauffement, retour au calme ─────────────
  { id: 'cercles-bras', nom: 'Cercles de bras', zones: ['epaules', 'mobilite'], materiel: [], formats: ['echauffement', 'mobilite'], niveau: 1, unilateral: false, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'etirement',
    consignes: ['Bras tendus sur les côtés.', 'Fais des cercles de plus en plus grands.', 'Change de sens à mi-temps.'],
    erreurs: ['Hausser les épaules.'], variantes: { facile: null, difficile: null } },
  { id: 'cercles-hanches', nom: 'Cercles de hanches', zones: ['hanches', 'mobilite'], materiel: [], formats: ['echauffement', 'mobilite'], niveau: 1, unilateral: false, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'etirement',
    consignes: ['Mains sur les hanches, pieds écartés.', 'Dessine de grands cercles avec le bassin.', 'Change de sens à mi-temps.'],
    erreurs: ['Bouger les épaules plutôt que le bassin.'], variantes: { facile: null, difficile: null } },
  { id: 'balancier-jambe-avant', nom: 'Balancier de jambe avant-arrière', zones: ['hanches', 'mobilite'], materiel: [], formats: ['echauffement', 'coureur', 'mobilite'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'reps', base: 12, picto: 'equilibre-unipodal',
    consignes: ['Tiens-toi à un appui.', 'Balance une jambe d’avant en arrière, de plus en plus haut.', 'Garde le buste droit.'],
    erreurs: ['Forcer l’amplitude dès le début.'], variantes: { facile: null, difficile: 'balancier-jambe-lateral' } },
  { id: 'balancier-jambe-lateral', nom: 'Balancier de jambe latéral', zones: ['hanches', 'mobilite'], materiel: [], formats: ['echauffement', 'coureur', 'mobilite'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'reps', base: 12, picto: 'equilibre-unipodal',
    consignes: ['Face à un appui, mains posées.', 'Balance une jambe de gauche à droite devant toi.', 'Garde le bassin face à l’appui.'],
    erreurs: ['Tourner le bassin.'], variantes: { facile: 'balancier-jambe-avant', difficile: null } },
  { id: 'fente-rotation', nom: 'Fente avec rotation du buste', zones: ['hanches', 'dos', 'mobilite'], materiel: [], formats: ['echauffement', 'mobilite', 'coureur'], niveau: 2, unilateral: true, pattern: 'mobilite', mode: 'reps', base: 6, picto: 'fente',
    consignes: ['Fais une grande fente avant, main opposée au sol.', 'Ouvre l’autre bras vers le ciel en tournant le buste.', 'Reviens et change de côté.'],
    erreurs: ['Laisser tomber le genou avant vers l’intérieur.'], variantes: { facile: 'rotation-thoracique', difficile: null } },
  { id: 'chenille', nom: 'Chenille', zones: ['jambes', 'epaules', 'mobilite'], materiel: [], formats: ['echauffement', 'mobilite'], niveau: 2, unilateral: false, pattern: 'mobilite', mode: 'reps', base: 6, picto: 'pompe',
    consignes: ['Debout, penche-toi et pose les mains au sol.', 'Avance les mains jusqu’à la planche.', 'Ramène les pieds vers les mains à petits pas.'],
    erreurs: ['Plier fortement le dos.'], variantes: { facile: 'chat-vache', difficile: null } },
  { id: 'chat-vache', nom: 'Chat-vache', zones: ['dos', 'mobilite'], materiel: [], formats: ['echauffement', 'mobilite', 'retour-calme'], niveau: 1, unilateral: false, pattern: 'mobilite', mode: 'reps', base: 10, picto: 'etirement',
    consignes: ['À quatre pattes, mains sous les épaules.', 'Arrondis le dos en expirant.', 'Creuse doucement le dos en inspirant.'],
    erreurs: ['Forcer sur la nuque.'], variantes: { facile: null, difficile: null } },
  { id: 'rotation-thoracique', nom: 'Rotation du haut du dos à quatre pattes', zones: ['dos', 'mobilite'], materiel: [], formats: ['echauffement', 'mobilite', 'coureur'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'reps', base: 8, picto: 'etirement',
    consignes: ['À quatre pattes, une main derrière la tête.', 'Ouvre le coude vers le plafond en suivant du regard.', 'Ramène le coude vers le bras d’appui.'],
    erreurs: ['Bouger le bassin.'], variantes: { facile: null, difficile: 'fente-rotation' } },
  { id: 'etirement-quadriceps', nom: 'Étirement des quadriceps debout', zones: ['jambes', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite', 'coureur'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'equilibre-unipodal',
    consignes: ['Tiens-toi à un appui si besoin.', 'Attrape la cheville et rapproche le talon de la fesse.', 'Garde les genoux côte à côte.'],
    erreurs: ['Cambrer le bas du dos.'], variantes: { facile: null, difficile: null } },
  { id: 'etirement-ischios', nom: 'Étirement des ischio-jambiers', zones: ['jambes', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite', 'coureur'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'souleve-de-terre',
    consignes: ['Pose un talon devant toi, pointe vers le haut.', 'Penche le buste dos droit, mains sur la cuisse d’appui.', 'Respire et relâche un peu plus à chaque expiration.'],
    erreurs: ['Arrondir le dos.', 'Donner des à-coups.'], variantes: { facile: null, difficile: null } },
  { id: 'etirement-mollets', nom: 'Étirement des mollets au mur', zones: ['mollets-chevilles', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite', 'coureur'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'mollets',
    consignes: ['Mains contre un mur, une jambe tendue en arrière.', 'Pousse le talon arrière vers le sol.', 'Fléchis ensuite un peu le genou pour étirer plus bas.'],
    erreurs: ['Décoller le talon.'], variantes: { facile: null, difficile: null } },
  { id: 'etirement-psoas', nom: 'Étirement du fléchisseur de hanche', zones: ['hanches', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite', 'coureur'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'fente',
    consignes: ['Pose un genou au sol, l’autre pied devant.', 'Avance doucement le bassin en serrant la fesse arrière.', 'Garde le buste droit.'],
    erreurs: ['Cambrer le bas du dos.'], variantes: { facile: null, difficile: null } },
  { id: 'etirement-fessier', nom: 'Étirement du fessier allongé', zones: ['fessiers', 'hanches', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite', 'coureur'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'crunch',
    consignes: ['Sur le dos, pose une cheville sur le genou opposé.', 'Rapproche les jambes de la poitrine.', 'Relâche les épaules au sol.'],
    erreurs: ['Décoller la tête.'], variantes: { facile: null, difficile: null } },
  { id: 'posture-enfant', nom: 'Posture de l’enfant', zones: ['dos', 'hanches', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite'], niveau: 1, unilateral: false, pattern: 'mobilite', mode: 'temps', base: 45, picto: 'etirement',
    consignes: ['À genoux, assieds-toi sur les talons.', 'Allonge les bras devant toi, front vers le sol.', 'Respire lentement dans le dos.'],
    erreurs: ['Forcer sur les genoux.'], variantes: { facile: null, difficile: null } },
  { id: 'torsion-allongee', nom: 'Torsion allongée', zones: ['dos', 'hanches', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'crunch',
    consignes: ['Sur le dos, bras en croix.', 'Laisse tomber les genoux pliés d’un côté.', 'Tourne la tête de l’autre côté et respire.'],
    erreurs: ['Décoller l’épaule opposée.'], variantes: { facile: null, difficile: null } },
  { id: 'etirement-lateral', nom: 'Étirement latéral debout', zones: ['tronc', 'dos', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite', 'echauffement'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'etirement',
    consignes: ['Debout, bras au-dessus de la tête.', 'Penche le buste sur le côté en t’allongeant.', 'Garde le bassin centré.'],
    erreurs: ['Pencher le buste en avant.'], variantes: { facile: null, difficile: null } },
  { id: 'etirement-pectoraux', nom: 'Étirement des pectoraux au mur', zones: ['pectoraux', 'epaules', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite'], niveau: 1, unilateral: true, pattern: 'mobilite', mode: 'temps', base: 30, picto: 'etirement',
    consignes: ['Pose l’avant-bras contre un mur, coude à hauteur d’épaule.', 'Tourne doucement le buste à l’opposé.', 'Respire sans forcer.'],
    erreurs: ['Hausser l’épaule.'], variantes: { facile: null, difficile: null } },
  { id: 'papillon', nom: 'Papillon assis', zones: ['hanches', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite'], niveau: 1, unilateral: false, pattern: 'mobilite', mode: 'temps', base: 40, picto: 'etirement',
    consignes: ['Assis, plantes des pieds l’une contre l’autre.', 'Laisse les genoux descendre vers le sol.', 'Grandis le dos et respire.'],
    erreurs: ['Appuyer fort sur les genoux.'], variantes: { facile: null, difficile: null } },
  { id: 'respiration-allongee', nom: 'Respiration ventrale allongé', zones: ['tronc', 'mobilite'], materiel: [], formats: ['retour-calme', 'mobilite'], niveau: 1, unilateral: false, pattern: 'mobilite', mode: 'temps', base: 60, picto: 'crunch',
    consignes: ['Allonge-toi sur le dos, genoux pliés.', 'Inspire par le nez en gonflant le ventre.', 'Expire lentement par la bouche.'],
    erreurs: ['Gonfler la poitrine au lieu du ventre.'], variantes: { facile: null, difficile: null } }
];

const FORME_PICTOS = (function () {
  // Gabarit commun : traits arrondis épais, tête pleine, accent via --f-accent.
  var ACC = 'var(--f-accent, #dc3a3a)';
  var sa = ' style="stroke:' + ACC + '"';
  var fa = ' style="fill:' + ACC + '" stroke="none"';
  function svg(inner) {
    return '<svg viewBox="0 0 100 100" role="img" xmlns="http://www.w3.org/2000/svg">' +
      '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' + inner + '</g></svg>';
  }
  function p(d, cls) { return '<path' + (cls ? ' class="' + cls + '"' : '') + ' d="' + d + '"/>'; }
  function tete(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="7" fill="currentColor" stroke="none"/>'; }
  function g(cls, inner) { return '<g class="' + cls + '">' + inner + '</g>'; }
  var SOL = '<path d="M8 94H92" stroke-width="4"' + sa + '/>';

  return {
    'squat': svg(SOL + p('M45 90H56') +
      g('fp-sq-tibia', p('M45 90V72') +
        g('fp-sq-cuisse', p('M45 72V54') +
          g('fp-sq-buste', p('M45 54V31') + tete(45, 20) + g('fp-sq-bras', p('M45 33H66')))))),

    'fente': svg(SOL + p('M62 90H72') + p('M34 90L28 87') +
      g('fp-fe-tib2', p('M34 90L43.8 74.9') + g('fp-fe-cui2', p('M43.8 74.9L50 58'))) +
      g('fp-fe-tib1', p('M62 90L61.3 72') +
        g('fp-fe-cui1', p('M61.3 72L50 58') +
          g('fp-fe-buste', p('M50 58V35') + tete(50, 24) + p('M50 37L53 56'))))),

    'pompe': svg(SOL + p('M16 86L13 91') +
      g('fp-po-corps', p('M16 86L66 70') + tete(76.5, 66.6)) +
      g('fp-po-avb', p('M64 90L62 79.7') + g('fp-po-bras', p('M62 79.7L66 70')))),

    'gainage-planche': svg(SOL +
      '<circle cx="22" cy="24" r="11" stroke-width="4"' + sa + '/>' + '<path d="M22 9V11" stroke-width="4"' + sa + '/>' +
      '<path class="fp-chrono" d="M22 24V16" stroke-width="4"' + sa + '/>' +
      g('fp-respire', p('M16 87L13 91') + p('M16 87L68 74') + tete(77.7, 70.6) + p('M68 74L68 89L82 89'))),

    'gainage-lateral': svg(SOL + p('M14 88L62 68') + tete(72.2, 63.8) + p('M62 68V88H74') +
      g('fp-gl-bras', p('M62 68V46'))),

    'pont-fessier': svg(SOL + tete(8, 86) + p('M64 76L70 90H78') +
      g('fp-pf-buste', p('M16 88H42')) +
      g('fp-pf-cuisse', p('M64 76L42 88'))),

    'souleve-de-terre': svg(SOL + p('M40 56L44 73L41 90H51') +
      g('fp-sdt-buste', p('M40 56V31') + tete(41, 20) +
        g('fp-sdt-bras', '<circle cx="40" cy="58" r="7"' + fa + '/>' + p('M40 33V54')))),

    'rowing': svg(SOL + p('M36 58L46 74L40 90H50') + p('M36 58L57 43') + tete(65.5, 37.4) +
      g('fp-ro-bras', p('M57 43V57') +
        g('fp-ro-avb', p('M57 57V69') + '<circle cx="57" cy="72" r="6"' + fa + '/>'))),

    'traction': svg('<path d="M12 10H88" stroke-width="5"' + sa + '/>' +
      g('fp-tr-avd', p('M64 10L63.4 25') + g('fp-tr-brd', p('M63.4 25L58 39'))) +
      g('fp-tr-avg', p('M36 10L36.6 25') +
        g('fp-tr-brg', p('M36.6 25L42 39') +
          g('fp-tr-corps', p('M42 39H58') + p('M50 39V64') + p('M50 64L45 88M50 64L55 88') + tete(50, 30))))),

    'developpe-epaules': svg(SOL + p('M50 62L42 90M50 62L58 90') + p('M50 36V62') + p('M40 37H60') + tete(50, 25) +
      g('fp-de-brg', p('M40 37L28 39') + g('fp-de-avg', p('M28 39V24') + '<path d="M21 24H35" stroke-width="6"' + sa + '/>')) +
      g('fp-de-brd', p('M60 37L72 39') + g('fp-de-avd', p('M72 39V24') + '<path d="M65 24H79" stroke-width="6"' + sa + '/>'))),

    'crunch': svg(SOL + p('M50 88L64 70L76 90H84') +
      g('fp-cr-buste', p('M50 88H28') + tete(19, 86) + p('M30 85L44 80'))),

    'mountain-climber': svg(SOL + p('M72 90V66') + p('M72 66L46 74') + tete(81.4, 62.5) +
      '<g opacity="0.55">' + g('fp-mc-cuisse fp-mc-b', p('M46 74L34.8 78.8') + g('fp-mc-tibia fp-mc-b', p('M34.8 78.8L18 86'))) + '</g>' +
      g('fp-mc-cuisse', p('M46 74L34.8 78.8') + g('fp-mc-tibia', p('M34.8 78.8L18 86')))),

    'saut': svg('<ellipse class="fp-sa-ombre" cx="50" cy="94" rx="16" ry="2.5" opacity="0.6"' + fa + '/>' +
      g('fp-sa-corps', tete(50, 22) + p('M50 33V60') +
        g('fp-sa-brg', p('M50 35L38 56')) + g('fp-sa-brd', p('M50 35L62 56')) +
        g('fp-sa-jg', p('M50 60L44 88')) + g('fp-sa-jd', p('M50 60L56 88')))),

    'mollets': svg(SOL + g('fp-mo-pied', p('M44 90H60')) +
      g('fp-mo-corps', p('M48 87V56') + p('M48 56V31') + tete(49, 20) + p('M48 34L52 54'))),

    'equilibre-unipodal': svg(SOL +
      g('fp-eq-corps', p('M50 60V90') + p('M50 60L62 70L52 78') + p('M50 60V34') + tete(50, 22) + p('M30 41L50 36L70 41'))),

    'etirement': svg(SOL + p('M50 60L40 90M50 60L60 90') +
      g('fp-et-haut', p('M50 60V36') + tete(50, 24) + p('M44 36H56') + p('M44 36L36 22L50 8L64 22L56 36'))),

    'superman': svg(SOL +
      g('fp-su-jambes', p('M48 87H18')) +
      g('fp-su-buste', p('M48 87H66') + tete(74, 79) + p('M66 88H90'))),

    'velo': svg('<path d="M28 92H84" stroke-width="5"' + sa + '/>' +
      '<path d="M46 50L52 90M78 90L70 44M64 44H74M36 50H50" stroke-width="5"' + sa + '/>' +
      '<circle cx="74" cy="76" r="9" stroke-width="4"' + sa + '/>' +
      '<path class="fp-ve-roue" d="M74 69V83M67 76H81" stroke-width="3"' + sa + '/>' +
      '<g opacity="0.55">' + g('fp-ve-cuisse fp-ve-b', p('M46 48L62.8 50.5') + g('fp-ve-tibia fp-ve-b', p('M62.8 50.5L54 65'))) + '</g>' +
      '<path class="fp-ve-pedalier" d="M54 65L54 79" stroke-width="4"' + sa + '/>' +
      p('M46 48L60 30') + tete(66, 22) + p('M60 30L70 44') +
      g('fp-ve-cuisse', p('M46 48L62.8 50.5') + g('fp-ve-tibia', p('M62.8 50.5L54 65')))),

    'rameur': svg('<path d="M6 92H94" stroke-width="4"' + sa + '/>' + '<path d="M80 74L86 92" stroke-width="5"' + sa + '/>' +
      '<rect class="fp-ra-siege" x="55" y="84" width="14" height="5" rx="2"' + fa + '/>' +
      g('fp-ra-tibia', p('M80 82L73.3 63.1') +
        g('fp-ra-cuisse', p('M73.3 63.1L62 82') +
          g('fp-ra-buste', p('M62 82L70.2 59.4') + tete(74, 49) +
            g('fp-ra-bras', p('M70.2 59.4L83 66') + '<path d="M83 61V71" stroke-width="5"' + sa + '/>'))))),

    'ski-erg': svg(SOL + '<path d="M84 6V94M76 94H92" stroke-width="5"' + sa + '/>' + '<circle cx="84" cy="8" r="3"' + fa + '/>' +
      p('M42 58L47 74L42 90H52') +
      g('fp-sk-buste', p('M42 58V33') + tete(43, 22) +
        g('fp-sk-bras', p('M42 35L56 14') + '<path d="M52 11L60 17" stroke-width="5"' + sa + '/>'))),

    'step': svg(SOL + '<rect x="54" y="78" width="32" height="14" rx="2"' + fa + '/>' + p('M64 76H73') +
      g('fp-st-tibia', p('M64 76L70.3 62.4') +
        g('fp-st-cuisse', p('M70.3 62.4L55.8 66.3') +
          g('fp-st-arriere', p('M55.8 66.3L51 78L44 90H50')) +
          g('fp-st-buste', p('M55.8 66.3L60 42.7') + tete(62, 32) + p('M60 45L63 62'))))),

    'kettlebell-swing': svg(SOL + p('M40 56L46 73L42 90H52') +
      g('fp-kb-buste', p('M40 56V31') + tete(41, 20) +
        g('fp-kb-bras', '<circle cx="64" cy="42" r="6"' + fa + '/>' + '<path d="M59 37Q64 30 69 37" stroke-width="3"' + sa + '/>' + p('M40 33L63 33'))))
  };
})();
