// Module « Cuisine reliée à Monsieur Cuisine » (onglet Cuisine).
// Monsieur Cuisine fait foi : la fonction serveur « monsieur-cuisine » copie toutes les heures son planning,
// sa liste de courses et ses recettes dans mc_planning, mc_courses et mc_recettes (lecture seule).
// Quand la liaison est active, ce module habille les écrans du cœur « planning » (segment Repas) et
// « courses » (segment Courses) ; sans liaison, ces écrans restent ceux de Miam (planning et liste de la semaine).
//  - Repas : la semaine Monsieur Cuisine, la recette (ingrédients, étapes, portions), les calories de chacun
//    (table Ciqual, ou à défaut les valeurs fournies par Monsieur Cuisine) et « J'ai mangé ça » vers le journal.
//  - Courses : articles Monsieur Cuisine + ajouts à la main (courses_ajouts) + repas Miam de la semaine, rangés
//    dans l'ordre d'un supermarché, doublons fusionnés, matériel retiré, placard mis de côté ; chaque article est
//    modifiable (table courses_modifs, appliquée par-dessus chaque synchro) et le cochage est partagé en direct.
const cache = Modules.cache('cuisine-mc');
const JOUR = 864e5;

let liaison = null;          // ligne mc_connexions du foyer (ou null)
let planning = [];           // lignes mc_planning
let recettes = new Map();    // mc_id → ligne mc_recettes
let coursesMc = [];          // lignes mc_courses
let ajouts = [];             // lignes courses_ajouts encore utiles (non cochées, ou de la semaine)
let modifs = {};             // cle → ligne courses_modifs (surcharges et coches)
let modifsDispo = true;      // faux tant que la migration 2026-11-16_cuisine-mc.sql n'est pas appliquée
let canal = null;            // abonnement temps réel
let canalFoyer = null;
const nutriCache = new Map();

// ---------------------------------------------------------------------------
// Rayons, dans l'ordre d'un supermarché
// ---------------------------------------------------------------------------
const RAYONS = ['Fruits & légumes', 'Boulangerie', 'Boucherie', 'Poissonnerie', 'Crèmerie & œufs', 'Fromages', 'Épicerie salée', 'Herbes & épices',
  'Épicerie sucrée', 'Conserves', 'Surgelés', 'Boissons', 'Hygiène & beauté', 'Entretien & maison', 'Bébé', 'Animaux', 'Autres'];
const POISSON = /\b(poissons?|saumon|cabillaud|thon|crevettes?|moules?|colin|lieu|merlu|dorade|bar|sole|truite|sardines?|maquereau|calamars?|seiche|poulpe|crabe|homard|langoustines?|saint jacques|haddock|surimi|anchois)\b/;
const ANIMAUX = /\b(croquettes?|patee|litiere|chiens?|chats?|os a macher)\b/;
// Rayon d'un article d'après les mots de son nom (rayons du cœur, précisés).
function rayonDuNom(nom) {
  const aisle = guessAisle(nom);
  const s = sansAccents(nom);
  if (aisle === 'Boucherie & poissonnerie') return POISSON.test(s) ? 'Poissonnerie' : 'Boucherie';
  if (aisle === 'Bébé & animaux') return ANIMAUX.test(s) ? 'Animaux' : 'Bébé';
  if (aisle === 'Autres' && ANIMAUX.test(s)) return 'Animaux';
  return RAYONS.includes(aisle) ? aisle : 'Autres';
}
// Catégorie Monsieur Cuisine (« Légumes », « Bœuf », « Produits laitiers »…) → rayon.
function rayonMc(nom) {
  const s = sansAccents(nom);
  if (!s) return null;
  if (/legume|fruit/.test(s)) return 'Fruits & légumes';
  if (/poisson|mer\b|crustace/.test(s)) return 'Poissonnerie';
  if (/boeuf|porc|volaille|viande|agneau|veau|charcuterie|gibier/.test(s)) return 'Boucherie';
  if (/fromage/.test(s)) return 'Fromages';
  if (/laitier|cremerie|oeuf/.test(s)) return 'Crèmerie & œufs';
  if (/pain|boulang/.test(s)) return 'Boulangerie';
  if (/epice|herbe|aromate|condiment/.test(s)) return 'Herbes & épices';
  if (/sucre|patisserie|dessert|chocolat/.test(s)) return 'Épicerie sucrée';
  if (/conserve/.test(s)) return 'Conserves';
  if (/surgele/.test(s)) return 'Surgelés';
  if (/boisson/.test(s)) return 'Boissons';
  if (/riz|cereale|pate|epicerie|huile|farine|legumineuse/.test(s)) return 'Épicerie salée';
  return null;
}
// Rayon retenu : celui du nom quand il est reconnu, sinon celui de Monsieur Cuisine, sinon « Autres ».
// (Monsieur Cuisine range parfois toute une recette dans un seul rayon : persil et bouillon au rayon « Bœuf ».)
function rayonDe(nom, categorieMc) {
  const p = produitDe(nom);
  if (p?.rayon) return p.rayon;
  const parNom = rayonDuNom(nom);
  if (parNom !== 'Autres') return parNom;
  return rayonMc(categorieMc) || 'Autres';
}
const ordreRayon = (r) => { const i = RAYONS.indexOf(r); return i < 0 ? RAYONS.length : i; };

// ---------------------------------------------------------------------------
// Quantités et unités
// ---------------------------------------------------------------------------
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
// « 1 ½ » → 1,5 ; « 1/2 » → 0,5 ; « 2-3 » → 3 (on prend le haut de la fourchette) ; « 2,5 » → 2,5.
// Espace des milliers (« 1 200 », espace fine ou insécable) retirée avant lecture.
const sansMilliers = (s) => String(s ?? '').replace(/(\d)[\s  ](\d{3})(?!\d)/g, '$1$2');
function lireNombre(texte) {
  const s = sansMilliers(texte).trim().replace(/(\d),(\d)/g, '$1.$2');
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|à)\s*(\d+(?:\.\d+)?)/);
  if (m) return Number(m[2]);
  m = s.match(/^(\d+)?\s*([½¼¾⅓⅔])/);
  if (m) return Number(m[1] || 0) + FRACTIONS[m[2]];
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+)\/(\d+)/);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  m = s.match(/^\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
// Sépare « 500 g » en { v: 500, unite: 'g' } (quantités saisies à la main).
function decouperQuantite(texte) {
  const s = sansMilliers(texte).trim();
  const v = lireNombre(s);
  if (v == null) return { v: null, unite: '' };
  const reste = s.replace(/(\d),(\d)/g, '$1.$2').replace(/^(\d+(?:\.\d+)?\s*(?:-|–|à)\s*)?(\d+\s+\d+\/\d+|\d+\/\d+|\d*\s*[½¼¾⅓⅔]|\d+(?:\.\d+)?)/, '').trim();
  return { v, unite: reste };
}
// Unité → unité de base pour additionner : g, ml, cc (cuillère à café ; 1 c. à s. = 3 c. à c.), pièce, ou unité comptée.
const UNITES_BASE = [
  [/^(g|gr|grs|grammes?)$/, 'g', 1], [/^(kg|kilos?|kilogrammes?)$/, 'g', 1000], [/^mg$/, 'g', 0.001],
  [/^ml$/, 'ml', 1], [/^cl$/, 'ml', 10], [/^dl$/, 'ml', 100], [/^(l|litres?)$/, 'ml', 1000],
  [/^(c ?c|cac|c a c|cc|cuill?(?:ere)?s? a (?:cafe|the))$/, 'cc', 1], [/^(c ?s|cas|c a s|cs|cuill?(?:ere)?s? a soupe)$/, 'cc', 3],
  [/^pince(?:e|es|r)?$/, 'pincée', 1], [/^gousses?$/, 'gousse', 1], [/^brins?$/, 'brin', 1], [/^feuilles?$/, 'feuille', 1],
  [/^cubes?$/, 'cube', 1], [/^morceaux?$/, 'morceau', 1], [/^tranches?$/, 'tranche', 1], [/^sachets?$/, 'sachet', 1],
  [/^boites?$/, 'boîte', 1], [/^pots?$/, 'pot', 1], [/^bottes?$/, 'botte', 1], [/^(pieces?|pcs?|x|unites?|)$/, 'pièce', 1],
];
function uniteBase(u) {
  const x = sansAccents(u).replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, base, mult] of UNITES_BASE) if (re.test(x)) return { base, mult };
  return { base: x, mult: 1 };
}
const PLURIELS = { gousse: 'gousses', brin: 'brins', feuille: 'feuilles', cube: 'cubes', morceau: 'morceaux', tranche: 'tranches', sachet: 'sachets', 'boîte': 'boîtes', pot: 'pots', botte: 'bottes', 'pincée': 'pincées' };
const arrondi = (v, pas) => Math.round(v / pas) * pas;
// Une quantité de base → texte lisible (« 1,2 kg », « 2 c. à s. », « 3 gousses »).
function formatQuantite(base, v) {
  if (!(v > 0)) return '';
  if (base === 'g') return v >= 1000 ? `${fmtNum(v / 1000)} kg` : `${fmtNum(v < 10 ? v : arrondi(v, 1))} g`;
  if (base === 'ml') return v >= 1000 ? `${fmtNum(v / 1000)} l` : `${fmtNum(arrondi(v, 1))} ml`;
  if (base === 'cc') return v >= 3 ? `${fmtNum(arrondi(v / 3, 0.5))} c. à s.` : `${fmtNum(arrondi(v, 0.5) || 0.5)} c. à c.`;
  if (base === 'pièce') return String(Math.max(1, Math.ceil(v - 0.01)));
  const n = arrondi(v, 0.5) || 0.5;
  return `${fmtNum(n)} ${n > 1 ? PLURIELS[base] || base : base}`;
}
const ORDRE_BASES = ['g', 'ml', 'pièce', 'cc'];
// { g: 750, pièce: 2 } → « 750 g + 2 ».
function formatQuantites(qtes) {
  return Object.keys(qtes).sort((a, b) => ((ORDRE_BASES.indexOf(a) + 1 || 9) - (ORDRE_BASES.indexOf(b) + 1 || 9)) || a.localeCompare(b))
    .map((b) => formatQuantite(b, qtes[b])).filter(Boolean).join(' + ');
}
// Unité affichée dans une recette (« c.c. » → « c. à c. »).
function uniteLisible(u) {
  const { base, mult } = uniteBase(u);
  if (base === 'cc') return mult === 3 ? 'c. à s.' : 'c. à c.';
  if (base === 'pièce') return '';
  return String(u || '').trim();
}

// ---------------------------------------------------------------------------
// Noms d'articles : nettoyage, clé de fusion, matériel
// ---------------------------------------------------------------------------
const UNITE_EN_TETE = /^(brins?|gousses?|feuilles?|tranches?|pinc[ée]es?|cubes?|morceaux?|sachets?|bottes?|bo[iî]tes?|pots?)\s+(?:de\s+|d['’]\s*)(.+)$/i;
// « yaourt nature, grec (10 % M.G.) » → « yaourt nature » ; « Sucre à volonté » → « Sucre ».
function nettoyerNom(nom) {
  let s = String(nom ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.split(',')[0].trim();
  s = s.replace(/\s+(?:à|a) volont[ée]$/i, '').replace(/\s+(?:\(?facultatif\)?|selon (?:le |votre )?go[uû]t)$/i, '')
    .replace(/\s+pour (?:le|la|les) (?:plat|moule|plaque|cuisson|service|d[ée]cor\w*|finition)$/i, '').trim();
  return s;
}
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const cleArticle = (nom) => analyserLigne({ nom }).cle;
// Ustensiles cités dans les listes de Monsieur Cuisine (« plat à gratin (20 x 35 cm) ») : rien à acheter.
const MATERIEL = /^(?:(?:plats?|moules?) (?:a|en|pour|rond|carre|rectangulaire|allant|demontable|silicone)\b|(?:cercles? a patisserie|cercle|ramequins?|poche a douille|douille|emporte[- ]pieces?|cocotte|casserole|poele|saladier|fouet|spatule|thermometre|planche a decouper|couteau|pinceau|rouleau a patisserie|tamis|grille du four|plaque (?:de cuisson|du four|a patisserie)|bol mixeur|gobelet doseur|panier (?:vapeur|de cuisson)|varoma|mixeur|robot|cul de poule|cuillere en bois|louche|film etirable)\b)/;
const estMateriel = (nom) => MATERIEL.test(sansAccents(String(nom ?? '').replace(/\([^)]*\)/g, ' ')).replace(/\s+/g, ' ').trim());

// ---------------------------------------------------------------------------
// Produits : un même produit écrit de dix façons par les recettes (« Gousses d’ail », « Gousse ail », « ail »,
// « huile d‘olive », « Huile olive »…) est ramené à un seul nom, un seul rayon et une seule unité d'achat.
// re : testé sur le nom aplati (minuscules, sans accents ni ponctuation, précisions comprises).
// piece : poids moyen d'une pièce en g (les grammes et les pièces s'additionnent : « 1,2 kg (≈ 12) ») ;
// unite + par : unité d'achat et contenance (bouillon : 1 cube pour 500 ml) ; basique : sel, poivre… mis de côté
// (« Déjà au placard », bouton « Le racheter ») ; ignorer : jamais acheté (eau du robinet).
// ---------------------------------------------------------------------------
const FL = 'Fruits & légumes', BO = 'Boucherie', CR = 'Crèmerie & œufs', FR = 'Fromages', ES = 'Épicerie salée', SU = 'Épicerie sucrée', HE = 'Herbes & épices', CO = 'Conserves', BL = 'Boulangerie', BS = 'Boissons';
const P = (re, nom, rayon, o = {}) => ({ re, nom, rayon, ...o });
const PRODUITS = [
  P(/^eau( (du robinet|froide|chaude|tiede|bouillante|tres chaude))?$|^eau (pour|a temperature)/, 'Eau', null, { ignorer: true }),
  P(/^sel aux herbes/, 'Sel aux herbes', HE),
  P(/^(gros |fin )?sel\b/, 'Sel', HE, { basique: true }),
  P(/^poivre\b/, 'Poivre', HE, { basique: true }),
  P(/^matiere grasse/, 'Matière grasse', CR, { basique: true }),
  P(/^ail\b|^tetes? d ail\b/, 'Ail', FL, { ail: true }),
  P(/^echalotes?\b/, 'Échalotes', FL, { piece: 30 }),
  P(/^oignons? (nouveaux?|verts?|cebettes?|botte)\b/, 'Oignons nouveaux', FL),
  P(/^oignons?\b/, 'Oignons', FL, { piece: 100 }),
  P(/^(grosses? |petites? )?carottes?\b/, 'Carottes', FL, { piece: 100 }),
  P(/^(grosses? |petites? )?pommes? de terre\b/, 'Pommes de terre', FL, { piece: 150 }),
  P(/^patates? douces?\b/, 'Patates douces', FL, { piece: 300 }),
  P(/^(courge )?butternut\b/, 'Butternut', FL),
  P(/^potimarrons?\b/, 'Potimarron', FL),
  P(/^(petits? )?champignons?\b/, 'Champignons de Paris', FL),
  P(/^poireaux?\b/, 'Poireaux', FL),
  P(/^poivrons?\b/, 'Poivrons', FL, { piece: 150 }),
  P(/^aubergines?\b/, 'Aubergines', FL, { piece: 250 }),
  P(/^courgettes?\b/, 'Courgettes', FL, { piece: 200 }),
  P(/^brocolis?\b/, 'Brocoli', FL),
  P(/^celeri\b/, 'Céleri', FL),
  P(/^concombres?\b/, 'Concombre', FL, { piece: 300 }),
  P(/^(jus de |zeste de )?citrons? verts?\b|^(jus|zeste) de citron vert/, 'Citrons verts', FL, { jus: 30 }),
  P(/^(jus de |zeste de )?citrons?\b/, 'Citrons', FL, { jus: 40 }),
  P(/^(jus d ?|jus de )?oranges?\b/, 'Oranges', FL, { jus: 80 }),
  P(/^gingembre\b/, 'Gingembre', FL, { morceau: 20 }),
  P(/^(chou )?pak ?cho/, 'Pak choï', FL),
  P(/^tomates?( |,)*(concassees|pelees|en des|en boite)|^tomates? concass/, 'Tomates concassées (boîte)', CO, { boite: 400 }),
  P(/^tomates?( |,)*coulis|^coulis de tomates?|^passata|^sauce tomate\b/, 'Coulis de tomates', CO, { boite: 500 }),
  P(/^concentre de tomates?/, 'Concentré de tomates', CO, { cs: 15 }),
  P(/^tomates?( cerises?)?\b/, 'Tomates', FL),
  P(/^(pois|haricots?) (kidney|rouges?)/, 'Haricots rouges (boîte)', CO, { boite: 400 }),
  P(/^mais\b/, 'Maïs (boîte)', CO, { boite: 285 }),
  P(/^(blancs?|escalopes?|filets?|aiguillettes?) de poulet/, 'Blancs de poulet', BO),
  P(/^(cuisses?|hauts? de cuisses?|pilons?) de poulet/, 'Cuisses de poulet', BO),
  P(/^viande hachee|^(steaks? )?hache/, 'Viande hachée', BO),
  P(/^boeuf a braiser|^paleron\b|^joue de boeuf|^macreuse/, 'Bœuf à braiser', BO),
  P(/^filets? mignons? de porc/, 'Filet mignon de porc', BO),
  P(/^lard(ons?)?\b|^lard de jambon/, 'Lardons', BO),
  P(/^chorizo/, 'Chorizo', BO),
  P(/^(bouillon|kub)\b.*\bboeuf\b|^fond de boeuf/, 'Bouillon de bœuf', ES, { unite: 'cube', par: 500 }),
  P(/^(bouillon|kub)\b.*\b(volaille|poulet)\b|^fond de volaille/, 'Bouillon de volaille', ES, { unite: 'cube', par: 500 }),
  P(/^(bouillon|kub)\b/, 'Bouillon de légumes', ES, { unite: 'cube', par: 500 }),
  P(/^huiles? (d ?)?olive/, 'Huile d\'olive', ES, { liquide: true }),
  P(/^huiles? (vegetale|de tournesol|neutre|de colza|de pepins de raisin)/, 'Huile végétale', ES, { liquide: true }),
  P(/^sauce soja/, 'Sauce soja', ES, { liquide: true }),
  P(/^moutarde\b/, 'Moutarde', ES),
  P(/^(feuilles? de |plaques? de )?lasagnes?\b/, 'Lasagnes (feuilles)', ES),
  P(/^beurre\b(?! de cacahu)/, 'Beurre', CR),
  P(/^creme (liquide|legere|fleurette|fouettee|entiere liquide|semi epaisse)/, 'Crème liquide', CR, { liquide: true }),
  P(/^creme (fraiche|epaisse)|^creme$/, 'Crème fraîche', CR),
  P(/^creme de coco/, 'Crème de coco', ES),
  P(/^lait de (noix de )?coco/, 'Lait de coco', ES, { liquide: true, boite: 400 }),
  P(/^lait\b(?! de)/, 'Lait', CR, { liquide: true }),
  P(/^(yaourts?|yogourts?)\b.*\bgrec/, 'Yaourt à la grecque', CR),
  P(/^(oeufs?)\b/, 'Œufs', CR),
  P(/^mozzarella/, 'Mozzarella', FR),
  P(/^parmesan/, 'Parmesan', FR),
  P(/^farine\b/, 'Farine', SU, { cs: 10 }),
  P(/^sucre\b(?! glace)/, 'Sucre', SU),
  P(/^(petits? )?pains? rassis/, 'Pain rassis', BL),
  P(/^vin rouge/, 'Vin rouge', BS, { liquide: true }),
  P(/^vin blanc/, 'Vin blanc', BS, { liquide: true }),
  P(/^cumin\b/, 'Cumin', HE), P(/^paprika\b/, 'Paprika', HE), P(/^curcuma\b/, 'Curcuma', HE), P(/^(noix de )?muscade\b/, 'Muscade', HE),
  P(/^cannelle\b/, 'Cannelle', HE), P(/^piment d espelette/, 'Piment d\'Espelette', HE), P(/^(piment|flocons de piment)\b.*(poudre|flocons|fort)|^flocons de piment/, 'Piment en poudre', HE),
  P(/^garam masala/, 'Garam masala', HE), P(/^laurier\b/, 'Laurier', HE), P(/^origan\b/, 'Origan', HE), P(/^marjolaine\b/, 'Marjolaine', HE),
  P(/^herbes?\b.*(italien|provence)/, 'Herbes de Provence', HE), P(/^thym\b/, 'Thym', HE), P(/^romarin\b/, 'Romarin', HE),
  // Rayon seul (le nom reste celui de la recette).
  P(/^huiles?\b/, null, ES, { liquide: true }), P(/^fond de (veau|volaille|boeuf)|^fumet/, null, ES), P(/^bouquet garni/, null, HE),
  P(/^(cacahuetes?|arachides?|noix de cajou|amandes?|noisettes?|pignons?|graines? de|sesame)\b/, null, ES),
  P(/^(nouilles?|vermicelles?|pates?\b|spaghettis?|tagliatelles?|riz\b|semoule|boulgour|quinoa|lentilles?|pois chiches?)/, null, ES),
  P(/^(sauce|tabasco|vinaigre|ketchup|mayonnaise|nuoc|pate (a curry|de curry))/, null, ES), P(/^croutons?\b|^chapelure/, null, ES),
  P(/^(cassonade|vergeoise|miel|sucre (glace|vanille|roux))\b/, null, SU),
  P(/^piments?\b/, null, FL),
  P(/^basilic\b/, 'Basilic', HE), P(/^menthe\b/, 'Menthe', HE), P(/^persil\b/, 'Persil', HE), P(/^coriandre\b/, 'Coriandre', HE), P(/^ciboulette\b/, 'Ciboulette', HE),
];
// Nom aplati pour la reconnaissance : sans parenthèses ni accents, apostrophes et virgules en espaces.
const aplatir = (s) => norm(String(s ?? '').replace(/\([^)]*\)/g, ' '));
const PAR_CLE = new Map(PRODUITS.filter((p) => p.nom).map((p) => [ingKey(p.nom), p]));
// Produit reconnu d'après le nom complet (« tomates, concassées en boîte » ≠ « tomates »), puis le nom nettoyé.
function produitDe(nomComplet, nomCourt = nomComplet) {
  for (const s of [aplatir(nomComplet), aplatir(nomCourt)]) { if (!s) continue; const p = PRODUITS.find((x) => x.re.test(s)); if (p) return p; }
  return null;
}
const produitParCle = (cle) => PAR_CLE.get(cle) || null;

// Unité écrite devant le nom : « c.s. de concentré de tomates », « cac curcuma », « Pincée de thym », « Gousse ail ».
const UNITE_DEVANT = /^(c\.\s?[sc]\.?|c\s[sc]|cac|cas|cuill[eè]res? [àa] (?:soupe|caf[ée])|pinc[ée]es?|gousses?|brins?|feuilles?|cubes?|morceaux?|tranches?|sachets?|bottes?|bo[iî]tes?|pots?)\s+(?:de\s+|d['’‘]\s*)?(.+)$/i;

// Une ligne brute (Monsieur Cuisine, ajout, repas Miam) → nom affiché, clé, quantité de base.
function analyserLigne({ nom, quantite, unite }) {
  const brut = String(nom ?? '').replace(/[’‘`]/g, '\'').trim();
  let n = nettoyerNom(brut);
  let complet = brut;
  let u = String(unite ?? '').trim();
  let v = lireNombre(quantite);
  if (v != null && !u) { const d = decouperQuantite(quantite); u = d.unite; }
  const t = n.match(UNITE_EN_TETE) || n.match(UNITE_DEVANT);
  if (t) {
    if (!u) u = t[1];
    n = t[2].trim();
    const tc = complet.match(UNITE_DEVANT) || complet.match(UNITE_EN_TETE);
    if (tc) complet = tc[2];
  }
  const p = produitDe(complet, n);
  if (p?.nom) n = p.nom;
  const { base, mult } = uniteBase(u);
  return { nom: majuscule(n), cle: ingKey(n), base, v: v == null ? null : v * mult };
}

// Quantités d'un produit ramenées à son unité d'achat : pièces et grammes additionnés, liquides en ml,
// cuillères converties en grammes, bouillon en cubes, ail en gousses, jus en fruits entiers.
function quantitesProduit(qtes, p) {
  const q = { ...qtes };
  if (!p) return q;
  const prendre = (k) => { const v = q[k] || 0; delete q[k]; return v; };
  if (p.unite) {
    const n = prendre(p.unite) + prendre('pièce') + (prendre('g') + prendre('ml')) / p.par;
    const autres = Object.keys(q).length;
    for (const k of Object.keys(q)) delete q[k];
    if (n > 0 || autres) q[p.unite] = Math.max(1, Math.ceil(n - 0.01));
    return q;
  }
  if (p.ail) {
    const n = prendre('gousse') + prendre('pièce') + prendre('g') / 5;
    if (n > 0) q.gousse = Math.ceil(n - 0.01);
    return q;
  }
  if (p.jus) {
    const n = prendre('pièce') + Math.ceil((prendre('g') + prendre('ml') + prendre('cc') * 5) / p.jus - 0.01);
    const autres = Object.keys(q).length;
    for (const k of Object.keys(q)) delete q[k];
    if (n > 0 || autres) q['pièce'] = Math.max(1, n);
    return q;
  }
  if (p.liquide && (q.g || q.cc || q.ml)) { const ml = prendre('ml') + prendre('g') + prendre('cc') * 5; if (ml > 0) q.ml = ml; }
  if (p.cs && q.cc && q.g) q.g += prendre('cc') * p.cs / 3;
  if (p.morceau && q.morceau && q.g) q.g += prendre('morceau') * p.morceau;
  if (p.piece && q['pièce'] && q.g) q.g += prendre('pièce') * p.piece;
  return q;
}
function formatProduit(qtes, p) {
  const seul = Object.keys(qtes).length === 1;
  if (p?.ail && qtes.gousse >= 6) {
    const tetes = Math.ceil(qtes.gousse / 10);
    return `${formatQuantite('gousse', qtes.gousse)} (≈ ${tetes} tête${tetes > 1 ? 's' : ''})`;
  }
  if (p?.boite && seul && (qtes.g || qtes.ml)) {
    const n = Math.max(1, Math.round((qtes.g || qtes.ml) / p.boite));
    return `${formatQuantites(qtes)} (≈ ${n} boîte${n > 1 ? 's' : ''})`;
  }
  if (p?.boite && !qtes.g && !qtes.ml && Object.keys(qtes).length) return '1 boîte';
  if (p?.piece && seul && qtes.g) return `${formatQuantite('g', qtes.g)} (≈ ${Math.max(1, Math.round(qtes.g / p.piece))})`;
  return formatQuantites(qtes);
}

// ---------------------------------------------------------------------------
// Construction de la liste (fonction pure)
// ---------------------------------------------------------------------------
// Une coche est valable 7 jours : une liste oubliée ne reste pas cochée pour les courses suivantes.
const cocheActive = (m, maintenant = new Date()) => !!m?.coche && (!m.coche_le || maintenant - new Date(m.coche_le) < 7 * JOUR);

// lignes : [{ nom, quantite, unite, categorie?, recette?, source: 'mc'|'ajout'|'miam', ajoutId?, aisle? }]
// modifs : { cle: ligne courses_modifs } ; placard(cle) → ligne placard | null.
function construireListe(lignes, { modifs: mods = {}, placard = () => null, maintenant = new Date() } = {}) {
  const par = new Map();
  const materiel = [];
  for (const l of lignes) {
    if (!String(l.nom || '').trim()) continue;
    if (estMateriel(l.nom)) { if (!materiel.includes(nettoyerNom(l.nom))) materiel.push(nettoyerNom(l.nom)); continue; }
    const a = analyserLigne(l);
    if (!a.cle || produitParCle(a.cle)?.ignorer) continue;
    const art = par.get(a.cle) || { cle: a.cle, nom: a.nom, qtes: {}, sansQte: false, recettes: [], categories: [], sources: [], ajoutIds: [] };
    if (a.v != null && a.v > 0) art.qtes[a.base] = (art.qtes[a.base] || 0) + a.v; else art.sansQte = true;
    if (l.recette && !art.recettes.includes(l.recette)) art.recettes.push(l.recette);
    if (l.categorie) art.categories.push(l.categorie);
    if (!art.sources.includes(l.source)) art.sources.push(l.source);
    if (l.ajoutId) art.ajoutIds.push(l.ajoutId);
    par.set(a.cle, art);
  }
  const visibles = [];
  const auPlacard = [];
  const masques = [];
  for (const art of par.values()) {
    const m = mods[art.cle] || null;
    const prod = produitParCle(art.cle);
    art.qtes = quantitesProduit(art.qtes, prod);
    const origine = formatProduit(art.qtes, prod);
    const quantite = m?.quantite ? `${m.quantite}${m.unite ? ` ${m.unite}` : ''}` : origine;
    const x = {
      ...art, modif: m, origine, quantite, nom: m?.nom || art.nom, precision: m?.precision || '',
      rayon: m?.rayon && RAYONS.includes(m.rayon) ? m.rayon : rayonDe(art.nom, art.categories[0]),
      coche: cocheActive(m, maintenant), modifie: !!(m && (m.nom || m.quantite || m.precision || m.rayon)),
    };
    if (m?.masque) { masques.push(x); continue; }
    const pl = !m?.forcer && !art.sources.every((s) => s === 'ajout') ? (placard(art.cle) || (prod?.basique ? { type: 'basique' } : null)) : null;
    if (pl) { auPlacard.push({ ...x, placard: pl }); continue; }
    visibles.push(x);
  }
  const tri = (a, b) => a.nom.localeCompare(b.nom, 'fr');
  const groupes = new Map();
  for (const x of visibles.sort(tri)) { if (!groupes.has(x.rayon)) groupes.set(x.rayon, []); groupes.get(x.rayon).push(x); }
  const rayons = [...groupes.entries()].map(([nom, articles]) => ({ nom, articles, restants: articles.filter((a) => !a.coche).length }))
    .sort((a, b) => ordreRayon(a.nom) - ordreRayon(b.nom));
  // Rayon courant en haut : les rayons terminés passent à la fin.
  const enCours = rayons.filter((r) => r.restants);
  const finis = rayons.filter((r) => !r.restants);
  return {
    rayons: enCours, finis, placard: auPlacard.sort(tri), masques: masques.sort(tri), materiel,
    total: visibles.length, coches: visibles.filter((a) => a.coche).length, courant: enCours[0]?.nom || null,
  };
}
// Texte de la liste (copier, partager) : articles restants, rayon par rayon.
function texteListe(liste, titre = 'Liste de courses') {
  const lignes = [titre, ''];
  for (const r of liste.rayons) {
    const reste = r.articles.filter((a) => !a.coche);
    if (!reste.length) continue;
    lignes.push(r.nom.toUpperCase());
    for (const a of reste) lignes.push(`- ${a.nom}${a.quantite ? ` : ${a.quantite}` : ''}${a.precision ? ` (${a.precision})` : ''}`);
    lignes.push('');
  }
  return lignes.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Recettes Monsieur Cuisine : ingrédients, nutrition
// ---------------------------------------------------------------------------
// Monsieur Cuisine ne transmet pas toujours le nom des ingrédients dans le détail des recettes :
// on reprend alors les lignes de sa liste de courses pour cette recette.
function ingredientsRecette(r, courses = []) {
  const nommes = (r?.ingredients || []).filter((i) => String(i.nom || '').trim());
  if (nommes.length) return { source: 'recette', lignes: nommes.map((i) => ({ nom: i.nom, quantite: i.quantite, unite: i.unite, groupe: i.groupe || '' })) };
  const k = sansAccents(r?.titre).trim();
  const depuis = courses.filter((c) => c.recette && sansAccents(c.recette).trim() === k);
  if (depuis.length) return { source: 'courses', lignes: depuis.map((c) => ({ nom: c.nom, quantite: c.quantite, unite: c.unite, groupe: '' })) };
  return { source: null, lignes: [] };
}
// Ligne d'ingrédient → ingrédient au format du cœur (recipeNutrition, table Ciqual).
function versIngredientCoeur(l) {
  const a = analyserLigne(l);
  if (!a.cle) return null;
  const q = a.v == null ? '' : String(Math.round(a.v * 100) / 100);
  const parBase = { g: ['g', 1], ml: ['ml', 1], cc: ['c. à c.', 1], brin: ['g', 1], feuille: ['g', 0.5], cube: ['g', 10] };
  const [unit, f] = parBase[a.base] || (['pincée', 'gousse', 'tranche', 'sachet', 'boîte', 'pot', 'botte'].includes(a.base) ? [a.base, 1] : ['pièce', 1]);
  return { name: a.nom, qty: q && f !== 1 ? String(Math.round(Number(q) * f * 100) / 100) : q, unit };
}
// Valeurs par portion données par Monsieur Cuisine ([{ name: 'Calories', amount }…]) → nutriments du cœur.
function nutrimentsMc(liste) {
  if (!Array.isArray(liste)) return null;
  const n = zeroN();
  const champ = { kcal: /calor|energ/i, prot: /prot/i, gluc: /carbo|glucid/i, lip: /^fat|lipid|graisse/i, fib: /fib/i, suc: /sugar|sucre/i };
  for (const x of liste) {
    const v = Number(x?.amountFloat ?? x?.amount);
    if (!isFinite(v)) continue;
    for (const [k, re] of Object.entries(champ)) if (re.test(String(x?.name || ''))) { n[k] = v; break; }
  }
  return n.kcal > 0 ? n : null;
}
// Étapes à afficher : le texte, sinon le titre s'il fait une phrase (les étapes « Mode » du robot n'ont pas de texte).
const etapesLisibles = (liste) => (liste || []).map((e) => String(e?.texte || '').trim() || (String(e?.titre || '').trim().split(/\s+/).length >= 3 ? String(e.titre).trim() : ''))
  .filter((t, i, a) => t && a.indexOf(t) === i);
// Nutrition d'une portion standard : calculée avec Ciqual si assez d'ingrédients sont reconnus, sinon valeurs Monsieur Cuisine.
function nutritionRecette(r) {
  if (!r) return null;
  const cle = `${r.mc_id}:${r.updated_at || ''}:${CQ.ready ? 1 : 0}`;
  if (nutriCache.has(cle)) return nutriCache.get(cle);
  let res = null;
  const ing = ingredientsRecette(r, coursesMc);
  if (CQ.ready && ing.lignes.length) {
    const ings = ing.lignes.filter((l) => !estMateriel(l.nom)).map(versIngredientCoeur).filter(Boolean);
    const rn = recipeNutrition({ ingredients: ings, servings: Number(r.portions) || 4 });
    if (ings.length && rn.missing <= ings.length / 2 && rn.total.kcal > 0) res = { n: rn.perPortion, source: 'ciqual', manquants: rn.missing, total: ings.length };
  }
  if (!res) { const n = nutrimentsMc(r.nutriments); if (n) res = { n, source: 'mc' }; }
  nutriCache.set(cle, res);
  return res;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------
const ordreRepas = (a, b) => a.date.localeCompare(b.date) || (Number(a.data?.order) || 0) - (Number(b.data?.order) || 0);
// Repas d'une semaine, par jour (0 = lundi).
function repasDeLaSemaine(liste, lundi) {
  const jours = Array.from({ length: 7 }, () => []);
  const debut = isoDate(lundi);
  const fin = isoDate(addDays(lundi, 6));
  for (const p of [...liste].sort(ordreRepas)) {
    if (p.date < debut || p.date > fin) continue;
    jours[Math.round((isoToDate(p.date) - lundi) / JOUR)]?.push(p);
  }
  return jours;
}
// Prochain repas à partir d'un instant : celui du jour (le premier avant 14 h, le dernier ensuite), sinon le suivant.
function prochainRepas(liste, maintenant = new Date()) {
  const iso = isoDate(maintenant);
  const tries = [...liste].sort(ordreRepas);
  const jour = tries.filter((p) => p.date === iso);
  if (jour.length) return { repas: maintenant.getHours() < 14 ? jour[0] : jour[jour.length - 1], aujourdhui: true };
  const suivant = tries.find((p) => p.date > iso);
  return suivant ? { repas: suivant, aujourdhui: false } : null;
}
// « il y a 12 min », « il y a 3 h », « hier », « le 3 nov. ».
function ilYa(date, maintenant = new Date()) {
  if (!date) return 'jamais';
  const d = new Date(date);
  const min = Math.round((maintenant - d) / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 24 * 60 && isoDate(d) === isoDate(maintenant)) return `il y a ${Math.floor(min / 60)} h`;
  if (isoDate(d) === isoDate(addDays(maintenant, -1))) return 'hier';
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

// ---------------------------------------------------------------------------
// Données : chargement, cache, temps réel
// ---------------------------------------------------------------------------
const lie = () => !!liaison && ['ok', 'erreur'].includes(liaison.statut);
const actif = () => lie() || planning.length > 0 || coursesMc.length > 0;
const absente = (e) => /does not exist|schema cache|PGRST205|42P01|relation/i.test(String(e?.message || e?.code || ''));
function sauverCache() {
  cache.set('donnees', { liaison, planning, recettes: [...recettes.values()], coursesMc, ajouts, modifs, modifsDispo });
}
function lireCache() {
  const c = cache.get('donnees', null);
  if (!c) return false;
  liaison = c.liaison; planning = c.planning || []; recettes = new Map((c.recettes || []).map((r) => [Number(r.mc_id), r]));
  coursesMc = c.coursesMc || []; ajouts = c.ajouts || []; modifs = c.modifs || {}; modifsDispo = c.modifsDispo !== false;
  nutriCache.clear();
  return true;
}
const lundiCourant = () => mondayOf(new Date());
async function charger(force, { horsLigne } = {}) {
  if (horsLigne) { lireCache(); return; }
  const f = foyer();
  if (!f) return;
  const q = (p) => Promise.resolve(p).then((r) => r, (error) => ({ error }));
  const [c, p, r, k, a, m] = await Promise.all([
    q(db.from(T.mc_connexions).select('*').eq('foyer_id', f).maybeSingle()),
    q(db.from(T.mc_planning).select('mc_id,date,recette_mc_id,titre,portions,duree_min,image,data').eq('foyer_id', f).order('date')),
    q(db.from(T.mc_recettes).select('mc_id,titre,perso,favori,portions,unite_portion,duree_min,preparation_min,image,ingredients,etapes,nutriments,updated_at').eq('foyer_id', f)),
    q(db.from(T.mc_courses).select('*').eq('foyer_id', f)),
    q(db.from(T.extras).select('*').eq('foyer_id', f).or(`checked.eq.false,week.gte.${isoDate(addDays(lundiCourant(), -7))}`).order('created_at')),
    q(db.from(T.courses_modifs).select('*').eq('foyer_id', f)),
  ]);
  if ([c, p, r, k, a, m].some((x) => x.error && isNetworkError(x.error))) { lireCache(); return; }
  liaison = c.error ? null : c.data;
  planning = p.error ? [] : p.data || [];
  recettes = new Map((r.error ? [] : r.data || []).map((x) => [Number(x.mc_id), x]));
  coursesMc = k.error ? [] : k.data || [];
  ajouts = a.error ? [] : a.data || [];
  modifsDispo = !(m.error && absente(m.error));
  modifs = Object.fromEntries((m.error ? [] : m.data || []).map((x) => [x.cle, x]));
  nutriCache.clear();
  sauverCache();
  batchParDefaut();
  ecouter();
  if (!CQ.ready) CQ.load().then(() => { nutriCache.clear(); if (['planning', 'cuisine-mc'].includes(state.tab) && !sheets.length) render(); }).catch(() => {});
}
// Changement reçu en direct (autre téléphone du foyer) : coche, modification ou ajout.
function recevoir(table, p) {
  const n = p?.new && Object.keys(p.new).length ? p.new : null;
  const o = p?.old || {};
  if (table === 'modifs') {
    if (p.eventType === 'DELETE') { for (const [cle, x] of Object.entries(modifs)) if (x.id === o.id) delete modifs[cle]; }
    else if (n?.cle) modifs[n.cle] = n;
  } else if (table === 'ajouts') {
    if (p.eventType === 'DELETE') ajouts = ajouts.filter((x) => x.id !== o.id);
    else if (n?.id) { const i = ajouts.findIndex((x) => x.id === n.id); if (i >= 0) ajouts[i] = n; else ajouts.push(n); }
    // L'écran Miam (sans liaison) lit state.extras pour la semaine affichée.
    if (n?.week === isoDate(state.week) && !state.extras.some((x) => x.id === n.id)) state.extras.push(n);
    if (p.eventType === 'DELETE') state.extras = state.extras.filter((x) => x.id !== o.id);
  }
  sauverCache();
  if (state.tab === 'courses' && !sheets.length) render();
}
function ecouter() {
  if (!modifsDispo || !db.channel || canalFoyer === foyer()) return;
  try {
    if (canal) db.removeChannel?.(canal);
    const filtre = `foyer_id=eq.${foyer()}`;
    canal = db.channel(`cuisine-mc-${foyer()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: T.courses_modifs, filter: filtre }, (p) => recevoir('modifs', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: T.extras, filter: filtre }, (p) => recevoir('ajouts', p))
      .subscribe();
    canalFoyer = foyer();
  } catch (e) { console.warn('temps réel des courses', e); }
}
// Batch cooking masqué par défaut quand le foyer suit Monsieur Cuisine sans l'utiliser (une seule fois par appareil).
function batchParDefaut() {
  if (!lie() || store.get('cmc:batch-auto', false)) return;
  let usage = state.restes.length > 0;
  try { usage = usage || computeBatch().stepsCount > 0; } catch { /* planning Miam indisponible */ }
  if (!usage) Modules.masquer('batch', true);
  store.set('cmc:batch-auto', true);
}

// ---------------------------------------------------------------------------
// Lignes de la liste et écritures
// ---------------------------------------------------------------------------
function lignesCourses() {
  const lignes = coursesMc.map((c) => ({ nom: c.nom, quantite: c.quantite, unite: c.unite, categorie: c.rayon, recette: c.recette, source: 'mc' }));
  for (const x of ajouts) {
    if (x.checked && !cocheActive(modifs[cleArticle(x.name)])) continue;
    lignes.push({ nom: x.name, quantite: x.qty || '', unite: '', source: 'ajout', ajoutId: x.id });
  }
  // Repas Miam planifiés cette semaine (les recettes Miam restent utilisables à côté de Monsieur Cuisine).
  if (isoDate(state.week) === isoDate(lundiCourant())) {
    for (const meal of state.plan) {
      const rec = meal.reste_id ? null : recipeById(meal.recipe_id);
      if (!rec) continue;
      const f = mealServings(meal) / (rec.servings || 1);
      for (const ing of rec.ingredients || []) {
        const v = lireNombre(ing.qty);
        lignes.push({ nom: ing.name, quantite: v == null ? '' : String(v * f), unite: ing.unit, source: 'miam', recette: rec.title });
      }
    }
  }
  return lignes;
}
const listeActuelle = () => construireListe(lignesCourses(), { modifs, placard: (k) => inPlacard(k), maintenant: new Date() });
const trouverArticle = (liste, cle) => [...liste.rayons, ...liste.finis].flatMap((r) => r.articles).concat(liste.placard, liste.masques).find((a) => a.cle === cle);

async function ecrireModif(cle, patch) {
  if (!modifsDispo) { toast('Modifications partagées pas encore activées : migration 2026-11-16_cuisine-mc.sql à appliquer'); throw new Error('courses_modifs absente'); }
  const avant = modifs[cle] || null;
  const ligne = { ...(avant || {}), cle, ...patch, updated_at: new Date().toISOString() };
  modifs[cle] = ligne;
  sauverCache();
  try {
    modifs[cle] = await Sync.upsert(T.courses_modifs, ligne, { onConflict: 'foyer_id,cle' });
    sauverCache();
    return modifs[cle];
  } catch (e) {
    if (avant) modifs[cle] = avant; else delete modifs[cle];
    sauverCache();
    throw e;
  }
}
// Ajout à la main (formulaire, bouton « + ») : table courses_ajouts du cœur, semaine en cours.
async function ajouterArticle(nom, qte = '') {
  const name = majuscule(String(nom).trim());
  const row = await Sync.upsert(T.extras, { week: isoDate(lundiCourant()), name, qty: qte || null, aisle: guessAisle(name), checked: false });
  if (!ajouts.some((x) => x.id === row.id)) ajouts.push(row);
  if (row.week === isoDate(state.week) && !state.extras.some((x) => x.id === row.id)) state.extras.push(row);
  sauverCache();
  return row;
}

// ---------------------------------------------------------------------------
// Rendu : liaison
// ---------------------------------------------------------------------------
const ICO_SYNC = I('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>');
// État de la liaison → { etat, texte (HTML), jamais } ; jamais : rien n'a encore été reçu du robot.
function etatLiaison(l, donnees, ilYaTxt = ilYa) {
  const etat = !l ? 'attente' : l.statut;
  const actif = !!l && ['ok', 'erreur'].includes(l.statut);
  const jamais = !donnees && !l?.derniere_synchro;
  let texte;
  if (actif && l.derniere_synchro) texte = `Synchronisé ${esc(ilYaTxt(l.derniere_synchro))}${l.statut === 'erreur' ? ' · <span class="cmc-alerte">dernière synchro en échec</span>' : ''}`;
  else if (actif) texte = 'Relié · en attente de la première synchronisation';
  else if (jamais) texte = 'Pas encore relié : la liste et le planning arriveront après la première synchronisation.';
  else if (etat === 'deconnecte') texte = '<span class="cmc-alerte">Liaison à refaire</span> · dernières données conservées';
  else texte = 'Liaison coupée · dernières données conservées';
  return { etat: jamais && !actif ? 'attente' : etat, texte, jamais };
}
function carteLiaison() {
  const { etat, texte, jamais } = etatLiaison(liaison, planning.length > 0 || coursesMc.length > 0 || recettes.size > 0);
  return `<div class="cmc-liaison card"><span class="cmc-pastille" data-etat="${esc(etat)}" aria-hidden="true"></span>
    <div class="grow"><b>Monsieur Cuisine</b><div class="muted small">${texte}</div></div>
    ${lie() ? `<button class="btn small" data-act="cmc-synchro" aria-label="Synchroniser maintenant">${ICO_SYNC}<span>Synchroniser</span></button>` : ''}
    ${jamais && !lie() ? '<button class="btn small" data-act="mc-sheet">Comment relier ?</button>' : `<button class="icon-btn" data-act="mc-sheet" aria-label="État de la liaison Monsieur Cuisine">${ICON.info}</button>`}</div>`;
}
function choixSource() {
  const src = store.get('cmc:source', 'mc');
  return `<div class="cmc-sources" role="group" aria-label="Planning affiché">
    <button data-act="cmc-source" data-v="mc" aria-pressed="${src !== 'miam'}">${ICON.chef} Monsieur Cuisine</button>
    <button data-act="cmc-source" data-v="miam" aria-pressed="${src === 'miam'}">Mes repas Miam</button></div>`;
}

// ---------------------------------------------------------------------------
// Rendu : Repas (semaine Monsieur Cuisine)
// ---------------------------------------------------------------------------
const kcalTxt = (r) => { const n = nutritionRecette(r); return n ? `${Math.round(n.n.kcal)} kcal/portion` : ''; };
const imageRepas = (p, r) => safeUrl(p.image || r?.image || p.data?.recipe?.thumbnail?.landscape || '');
function carteRepas(p) {
  const r = recettes.get(Number(p.recette_mc_id));
  const img = imageRepas(p, r);
  const duree = Number(p.duree_min || r?.duree_min) || 0;
  const meta = [duree ? `${ICON.clock}<span>${duree} min</span>` : '', r ? `<span>${esc(kcalTxt(r))}</span>` : ''].filter(Boolean).join('');
  return `<button class="cmc-repas" data-act="cmc-recette" data-id="${esc(p.mc_id)}">
    ${img ? `<img class="cmc-vignette" src="${esc(img)}" alt="" loading="lazy">` : `<span class="cmc-vignette">${ICON.chef}</span>`}
    <span class="grow"><b class="cmc-repas-titre">${esc(p.titre)}</b><span class="cmc-meta">${meta}</span></span>${ICON.next}</button>`;
}
function renduRepas(renduMiam) {
  if (!actif()) return renduMiam();
  if (store.get('cmc:source', 'mc') === 'miam') return choixSource() + renduMiam();
  const jours = repasDeLaSemaine(planning, state.week);
  const auj = isoDate(new Date());
  const vide = jours.every((j) => !j.length);
  const html = jours.map((liste, i) => {
    const date = addDays(state.week, i);
    const iso = isoDate(date);
    return `<section class="cmc-jour ${iso === auj ? 'cmc-auj' : ''} ${liste.length ? '' : 'cmc-jour-vide'}">
      <h3><span>${DAYS[i]} <span class="muted">${esc(fmtDay(date))}</span></span>${iso === auj ? '<span class="cmc-badge">Aujourd\'hui</span>' : ''}</h3>
      ${liste.length ? liste.map(carteRepas).join('') : '<p class="muted small">Rien de prévu</p>'}</section>`;
  }).join('');
  return `${choixSource()}${weekNav()}${carteLiaison()}
    ${vide ? `<div class="empty">${ICON.chef}<p>Rien de prévu dans Monsieur Cuisine cette semaine.</p><p class="small">Planifie tes recettes dans l'appli Monsieur Cuisine : elles arrivent ici à la synchronisation suivante.</p></div>` : `<div class="cmc-semaine">${html}</div>`}
    ${carteReglages()}`;
}
function carteReglages() {
  const batch = Modules.get('batch');
  return `<section class="card cmc-reglages"><h3>Réglages de la cuisine</h3>
    ${batch ? `<label class="check"><input type="checkbox" data-cmc-batch ${Modules.masques().includes('batch') ? '' : 'checked'}> Afficher le batch cooking</label>` : ''}
    <p class="muted small">Le planning et la liste de courses viennent de Monsieur Cuisine (lecture seule). Tes modifications de la liste restent dans Tribu &amp; Toutous, même après une synchronisation.</p></section>`;
}
// Feuille d'une recette : portions, calories de chacun, « J'ai mangé ça », ingrédients, étapes.
function ouvrirRecette(id) {
  const p = planning.find((x) => String(x.mc_id) === String(id));
  const r = p ? recettes.get(Number(p.recette_mc_id)) : recettes.get(Number(id));
  const titre = p?.titre || r?.titre || 'Recette';
  const base = Number(r?.portions) || 4;
  let portions = Number(p?.portions) || base;
  const ing = ingredientsRecette(r || { titre }, coursesMc);
  const url = safeUrl(p?.data?.recipe?.url || '');
  const img = imageRepas(p || {}, r);
  const el = openSheet('<div data-cmc-recette></div>', { full: true });
  const dessiner = () => {
    const f = portions / base;
    const nut = nutritionRecette(r);
    const groupes = new Map();
    for (const l of ing.lignes) { if (!groupes.has(l.groupe)) groupes.set(l.groupe, []); groupes.get(l.groupe).push(l); }
    const ligneIng = (l) => {
      const v = lireNombre(l.quantite);
      const q = v == null ? String(l.quantite || '') : fmtNum(v * f);
      const u = uniteLisible(l.unite);
      return `<li${estMateriel(l.nom) ? ' class="muted"' : ''}><span class="cmc-q">${esc([q, u].filter(Boolean).join(' '))}</span>${esc(nettoyerNom(l.nom) || l.nom)}</li>`;
    };
    const etapes = etapesLisibles(r?.etapes);
    const membres = state.members.map((m) => {
      const k = nut ? Math.round(nut.n.kcal * memberFactor(m)) : null;
      return `<div class="cmc-membre"><span class="grow"><b>${esc(m.nom)}</b> <span class="muted small">· ${esc(fmtPortions(memberFactor(m)))}${k != null ? ` · ${k} kcal` : ''}</span></span>
        <button class="btn small" data-x="mange" data-m="${esc(m.id)}">J'ai mangé ça</button></div>`;
    }).join('');
    $('[data-cmc-recette]', el).innerHTML = `
      <div class="sheet-head"><button class="icon-btn" data-act="close-sheet" aria-label="Retour">${ICON.back}</button><h2>${esc(titre)}</h2></div>
      ${img ? `<img class="detail-cover" src="${esc(img)}" alt="">` : ''}
      <div class="meta cmc-recette-meta">${r?.duree_min ? `<span>${ICON.clock} ${r.duree_min} min</span>` : ''}${r?.preparation_min ? `<span>Prépa ${r.preparation_min} min</span>` : ''}${p ? `<span>${esc(fmtDay(isoToDate(p.date)))}</span>` : ''}</div>
      <div class="cmc-portions"><span class="grow"><b>${fmtNum(portions)}</b> ${esc(r?.unite_portion || 'portions')}</span>
        <button class="icon-btn" data-x="moins" aria-label="Une portion de moins">−</button><button class="icon-btn" data-x="plus" aria-label="Une portion de plus">${ICON.plus}</button></div>
      <h3>Pour chacun</h3>
      ${nut ? `<p class="muted small">${Math.round(nut.n.kcal)} kcal par portion standard (adulte à ${REF_KCAL} kcal/jour) · ${nut.source === 'ciqual' ? `calculé avec la table Ciqual${nut.manquants ? ` (${nut.manquants} ingrédient${nut.manquants > 1 ? 's' : ''} non reconnu${nut.manquants > 1 ? 's' : ''})` : ''}` : 'valeur donnée par Monsieur Cuisine'}.</p>` : '<p class="muted small">Calories indisponibles pour cette recette.</p>'}
      ${state.members.length ? `<div class="cmc-membres">${membres}</div>` : ''}
      <h3>Ingrédients</h3>
      ${ing.lignes.length ? [...groupes.entries()].map(([g, l]) => `${g ? `<div class="cmc-groupe">${esc(majuscule(g.toLowerCase()))}</div>` : ''}<ul class="cmc-ings">${l.map(ligneIng).join('')}</ul>`).join('')
        : '<p class="muted small">Monsieur Cuisine n\'a pas transmis les ingrédients de cette recette.</p>'}
      ${ing.source === 'courses' ? '<p class="muted small">Ingrédients repris de la liste de courses Monsieur Cuisine.</p>' : ''}
      ${etapes.length ? `<h3>Étapes</h3><ol class="cmc-etapes">${etapes.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
      ${url ? `<a class="btn block" href="${esc(url)}" target="_blank" rel="noopener">${ICON.ext} Ouvrir dans Monsieur Cuisine</a>` : ''}`;
  };
  dessiner();
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'moins') { portions = Math.max(1, portions - 1); dessiner(); }
    if (b.dataset.x === 'plus') { portions = Math.min(30, portions + 1); dessiner(); }
    if (b.dataset.x === 'mange') {
      const nut = nutritionRecette(r);
      if (!nut) { toast('Calories indisponibles : ajoute ce repas au journal à la main'); return; }
      quantitySheet({ label: titre, per100: nut.n, source: 'recette', ref: `mc:${r?.mc_id || p?.recette_mc_id || id}`, portions: true, memberId: b.dataset.m, slot: defaultSlot() });
    }
  });
}

// ---------------------------------------------------------------------------
// Rendu : Courses
// ---------------------------------------------------------------------------
const ICO_CASE = I('<path d="M20 6 9 17l-5-5"/>');
function ligneArticle(a) {
  const detail = [a.precision ? `<span class="cmc-prec">${esc(a.precision)}</span>` : '', a.recettes.length ? esc(a.recettes.join(', ')) : a.sources.includes('ajout') ? 'Ajouté à la main' : '']
    .filter(Boolean).join(' · ');
  return `<div class="cmc-art ${a.coche ? 'cmc-fait' : ''}">
    <button class="cmc-cocher" data-act="cmc-cocher" data-cle="${esc(a.cle)}" aria-pressed="${a.coche}" aria-label="${esc(a.nom)}${a.quantite ? `, ${esc(a.quantite)}` : ''}">
      <span class="cmc-case">${ICO_CASE}</span>
      <span class="cmc-art-txt"><span class="cmc-art-nom">${esc(a.nom)}${a.quantite ? ` <span class="cmc-qte">${esc(a.quantite)}</span>` : ''}${a.modifie ? ' <span class="cmc-modifie">modifié</span>' : ''}</span>
      ${detail ? `<span class="cmc-art-detail">${detail}</span>` : ''}</span></button>
    <button class="icon-btn cmc-art-menu" data-act="cmc-modifier" data-cle="${esc(a.cle)}" aria-label="Modifier « ${esc(a.nom)} »">${ICON.dots}</button></div>`;
}
const blocRayon = (r) => `<section class="cmc-rayon"><h3 class="cmc-rayon-titre"><span class="grow">${esc(r.nom)}</span><span class="cmc-compte">${r.restants ? `${r.restants} à prendre` : 'fait'}</span></h3>
  ${r.articles.map(ligneArticle).join('')}</section>`;
function renduCourses(renduMiam) {
  if (!actif()) return renduMiam();
  const l = listeActuelle();
  const pct = l.total ? Math.round((l.coches / l.total) * 100) : 0;
  const form = `<form class="card cmc-ajout" data-form="cmc-ajout">
    <input class="input" name="xname" placeholder="Ajouter un article (lessive, café…)" aria-label="Article à ajouter" required autocomplete="off" maxlength="80">
    <input class="input cmc-ajout-qte" name="xqty" placeholder="Qté" aria-label="Quantité" maxlength="20">
    <button class="icon-btn cmc-ajout-ok" aria-label="Ajouter l'article">${ICON.plus}</button></form>`;
  const entete = `<section class="card cmc-magasin">
    <div class="row"><div class="grow"><div class="muted small">${l.courant ? 'Rayon en cours' : l.total ? 'Tout est dans le caddie' : 'Liste vide'}</div><b class="cmc-courant">${esc(l.courant || (l.total ? 'Bravo !' : '—'))}</b></div>
      <div class="cmc-progres-txt"><b>${l.coches}</b>/${l.total}</div></div>
    <div class="cmc-progres" role="progressbar" aria-valuemin="0" aria-valuemax="${l.total}" aria-valuenow="${l.coches}" aria-label="Articles dans le caddie"><span style="width:${pct}%"></span></div>
    <div class="cmc-actions">
      <a class="btn small" href="${esc(cuStore())}" target="_blank" rel="noopener">${ICON.store} Courses U</a>
      <button class="btn small" data-act="cmc-copier">${ICON.copy} Copier</button>
      <button class="btn small" data-act="cmc-partager">${ICON.share} Partager</button>
      ${l.coches ? `<button class="btn small primary" data-act="cmc-terminer">${ICON.check} Terminer</button>` : ''}</div></section>`;
  const finis = l.finis.length ? `<details class="cmc-plie" ${l.rayons.length ? '' : 'open'}><summary>Rayons terminés (${l.finis.length})</summary>${l.finis.map(blocRayon).join('')}</details>` : '';
  const placard = l.placard.length ? `<details class="cmc-plie"><summary>Déjà au placard (${l.placard.length})</summary>
    ${l.placard.map((a) => `<div class="cmc-mini"><span class="grow">${esc(a.nom)}${a.quantite ? ` <span class="muted small">${esc(a.quantite)}</span>` : ''}<span class="muted small"> · ${a.placard.type === 'basique' ? 'basique' : 'en stock'}</span></span>
      <button class="btn small" data-act="cmc-forcer" data-cle="${esc(a.cle)}">Le racheter</button></div>`).join('')}</details>` : '';
  const masques = l.masques.length ? `<details class="cmc-plie"><summary>Articles masqués (${l.masques.length})</summary>
    ${l.masques.map((a) => `<div class="cmc-mini"><span class="grow">${esc(a.nom)}</span><button class="btn small" data-act="cmc-reafficher" data-cle="${esc(a.cle)}">Réafficher</button></div>`).join('')}</details>` : '';
  const materiel = l.materiel.length ? `<p class="muted small cmc-note">Matériel retiré de la liste : ${esc(l.materiel.join(', '))}.</p>` : '';
  const corps = l.total ? l.rayons.map(blocRayon).join('') + finis
    : `<div class="empty">${ICON.cart}<p>Aucun article à acheter.</p><p class="small">Ajoute des recettes à ta liste dans Monsieur Cuisine, ou un article ci-dessus.</p></div>`;
  return `${carteLiaison()}${form}${entete}${corps}${placard}${masques}${materiel}
    ${modifsDispo ? '' : '<p class="muted small cmc-note">Cochage partagé et modifications : migration 2026-11-16_cuisine-mc.sql à appliquer.</p>'}`;
}
const UNITES_CHOIX = ['', 'g', 'kg', 'ml', 'cl', 'l', 'pièce', 'c. à s.', 'c. à c.', 'pincée', 'gousse', 'botte', 'sachet', 'boîte', 'pot', 'tranche', 'barquette', 'paquet', 'filet'];
// Feuille de modification d'un article (nom, quantité, unité, précision, rayon, masquer, j'en ai, Courses U).
function modifierArticle(cle) {
  const a = trouverArticle(listeActuelle(), cle);
  if (!a) return;
  const m = modifs[cle] || {};
  const d = m.quantite ? { v: m.quantite, unite: m.unite || '' } : { v: '', unite: '' };
  const lien = state.links[cle];
  const el = openSheet(`${sheetHead(a.nom)}
    <form class="stack" data-form="cmc-modif">
      <label class="field"><span>Nom</span><input class="input" name="nom" value="${esc(m.nom || '')}" placeholder="${esc(a.modif?.nom ? '' : a.nom)}" maxlength="80"></label>
      <div class="cmc-grille2"><label class="field"><span>Quantité</span><input class="input" name="quantite" value="${esc(d.v)}" placeholder="${esc(a.origine || 'à volonté')}" maxlength="20" inputmode="decimal"></label>
        <label class="field"><span>Unité</span><select class="input" name="unite">${[...new Set([...UNITES_CHOIX, d.unite])].map((u) => `<option value="${esc(u)}" ${u === d.unite ? 'selected' : ''}>${esc(u || '—')}</option>`).join('')}</select></label></div>
      <label class="field"><span>Précision</span><input class="input" name="precision" value="${esc(m.precision || '')}" placeholder="bio, marque, calibre…" maxlength="60"></label>
      <label class="field"><span>Rayon</span><select class="input" name="rayon"><option value="">Automatique (${esc(rayonDe(a.nom, a.categories[0]))})</option>${RAYONS.map((r) => `<option ${r === m.rayon ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
      ${a.recettes.length ? `<p class="muted small">Pour : ${esc(a.recettes.join(', '))}${a.origine ? ` · quantité d'origine ${esc(a.origine)}` : ''}</p>` : ''}
      <button class="btn primary block">Enregistrer</button>
    </form>
    <div class="cmc-feuille-actions">
      ${a.modifie ? '<button class="btn block" data-x="origine">Revenir à l\'article d\'origine</button>' : ''}
      <button class="btn block" data-x="placard">${ICON.check} J'en ai déjà</button>
      <button class="btn block" data-x="masquer">Masquer de la liste</button>
      <div class="cmc-grille2"><a class="btn" href="${esc(lien?.url ? safeUrl(lien.url) : cuSearch(a.nom))}" target="_blank" rel="noopener">${lien ? 'Produit U' : `${ICON.search} Courses U`}</a>
        <button class="btn" data-x="lien">${ICON.link} Mémoriser</button></div>
      ${a.ajoutIds.length ? '<button class="btn danger block" data-x="supprimer">Supprimer l\'article ajouté</button>' : ''}
    </div>`);
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const val = (k) => f[k].value.trim() || null;
    try {
      await ecrireModif(cle, { nom: val('nom'), quantite: val('quantite'), unite: val('quantite') ? val('unite') : null, precision: val('precision'), rayon: val('rayon') });
      closeSheet(); render(); toast('Article modifié');
    } catch (err) { if (modifsDispo) fail(err); }
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    try {
      if (b.dataset.x === 'origine') { await ecrireModif(cle, { nom: null, quantite: null, unite: null, precision: null, rayon: null }); toast('Article d\'origine rétabli'); }
      if (b.dataset.x === 'masquer') { await ecrireModif(cle, { masque: true }); toast('Article masqué'); }
      if (b.dataset.x === 'placard') { await Data.addPlacard({ name: a.nom, ing_key: cle, type: 'stock', until: isoDate(addDays(lundiCourant(), 6)) }); toast('Mis de côté : tu l\'as déjà'); }
      if (b.dataset.x === 'lien') { closeSheet(); linkItem(cle, a.nom); return; }
      if (b.dataset.x === 'supprimer') {
        for (const id of a.ajoutIds) await Sync.supprimer(T.extras, id);
        ajouts = ajouts.filter((x) => !a.ajoutIds.includes(x.id));
        state.extras = state.extras.filter((x) => !a.ajoutIds.includes(x.id));
        sauverCache(); toast('Article supprimé');
      }
      closeSheet(); render();
    } catch (err) { if (modifsDispo) fail(err); }
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const actions = {
  'cmc-source': (b) => { store.set('cmc:source', b.dataset.v); render(); },
  'cmc-recette': (b) => ouvrirRecette(b.dataset.id),
  'cmc-synchro': async (b) => {
    if (!navigator.onLine) { toast('Hors ligne : synchronisation impossible'); return; }
    b.disabled = true;
    const lib = b.querySelector('span');
    if (lib) lib.textContent = 'Synchronisation…';
    try {
      const r = await Foyer.invoke('monsieur-cuisine', { action: 'synchro' });
      await charger(true, {});
      toast(`Synchronisé : ${r?.stats?.planning ?? 0} repas, ${r?.stats?.courses ?? 0} articles`);
    } catch (e) { fail(e, 'Synchronisation impossible'); await charger(true, {}).catch(() => {}); }
    render();
  },
  'cmc-cocher': async (b) => {
    const cle = b.dataset.cle;
    const oui = !cocheActive(modifs[cle]);
    b.closest('.cmc-art')?.classList.toggle('cmc-fait', oui);
    b.setAttribute('aria-pressed', String(oui));
    navigator.vibrate?.(8);
    try {
      await ecrireModif(cle, { coche: oui, coche_le: oui ? new Date().toISOString() : null, coche_par: oui ? me() : null });
      // Les ajouts à la main gardent aussi leur coche (écran Miam sans liaison).
      const a = trouverArticle(listeActuelle(), cle);
      for (const id of a?.ajoutIds || []) { const x = ajouts.find((y) => y.id === id); if (x) { x.checked = oui; Sync.upsert(T.extras, x).catch(() => {}); } }
    } catch (e) { if (modifsDispo) fail(e); }
    render();
  },
  'cmc-modifier': (b) => modifierArticle(b.dataset.cle),
  'cmc-forcer': async (b) => { try { await ecrireModif(b.dataset.cle, { forcer: true }); render(); } catch (e) { if (modifsDispo) fail(e); } },
  'cmc-reafficher': async (b) => { try { await ecrireModif(b.dataset.cle, { masque: false }); render(); } catch (e) { if (modifsDispo) fail(e); } },
  'cmc-copier': async () => { try { await navigator.clipboard.writeText(texteListe(listeActuelle())); toast('Liste copiée'); } catch { toast('Copie impossible sur ce navigateur'); } },
  'cmc-partager': async () => {
    const text = texteListe(listeActuelle());
    if (navigator.share) { try { await navigator.share({ title: 'Liste de courses', text }); } catch { /* partage annulé */ } }
    else { try { await navigator.clipboard.writeText(text); toast('Partage indisponible : liste copiée'); } catch { toast('Partage indisponible'); } }
  },
  'cmc-terminer': async () => {
    const l = listeActuelle();
    const faits = [...l.rayons, ...l.finis].flatMap((r) => r.articles).filter((a) => a.coche);
    if (!faits.length || !(await confirmSheet(`Ranger les ${faits.length} article${faits.length > 1 ? 's' : ''} cochés et repartir d'une liste propre ?`, 'Terminer', false))) return;
    try {
      for (const a of faits) {
        await ecrireModif(a.cle, { coche: false, coche_le: null, coche_par: null });
        for (const id of a.ajoutIds) await Sync.supprimer(T.extras, id);
        ajouts = ajouts.filter((x) => !a.ajoutIds.includes(x.id));
        state.extras = state.extras.filter((x) => !a.ajoutIds.includes(x.id));
      }
      sauverCache();
      toast('Courses terminées : la liste est prête pour la prochaine fois');
    } catch (e) { fail(e); }
    render();
  },
};

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f?.dataset?.form !== 'cmc-ajout') return;
  e.preventDefault();
  const nom = f.xname.value.trim();
  if (!nom) return;
  try {
    await ajouterArticle(nom, f.xqty.value.trim());
    render();
    toast(`Ajouté au rayon ${rayonDuNom(nom)}`);
    $('[data-form="cmc-ajout"] [name="xname"]')?.focus();
  } catch (err) { fail(err); }
});
document.addEventListener('change', (e) => {
  if (!e.target?.matches?.('[data-cmc-batch]')) return;
  Modules.masquer('batch', !e.target.checked);
  store.set('cmc:batch-auto', true);
  render();
});

// ---------------------------------------------------------------------------
// Enregistrement : les écrans Repas et Courses du cœur sont habillés quand la liaison est active.
// ---------------------------------------------------------------------------
function habiller(id, rendu) {
  const m = Modules.get(id);
  if (!m || m.cuisineMc) return;
  const renduMiam = m.rendu;
  m.rendu = () => rendu(renduMiam);
  Object.defineProperty(m, 'cuisineMc', { value: true });
}
habiller('planning', renduRepas);
habiller('courses', renduCourses);

Modules.register({
  id: 'cuisine-mc',
  onglet: 'cuisine',
  libelle: 'Cuisine et Monsieur Cuisine',
  // Écran sans segment : état de la liaison et réglages (ouvert par switchTab('cuisine-mc')).
  rendu: () => `${carteLiaison()}${carteReglages()}`,
  tables: { mc_connexions: 'mc_connexions', mc_planning: 'mc_planning', mc_courses: 'mc_courses', mc_recettes: 'mc_recettes', courses_modifs: 'courses_modifs' },
  charger,
  actions,
  sourcesAccueil: (ctx) => {
    const repas = planning.filter((p) => p.date === ctx.iso).sort(ordreRepas);
    if (!repas.length) return [];
    const maintenant = ctx.iso === isoDate(new Date()) ? new Date() : ctx.date;
    const pr = prochainRepas(repas, maintenant)?.repas || repas[0];
    const r = recettes.get(Number(pr.recette_mc_id));
    const soir = repas.length === 1 || pr === repas[repas.length - 1];
    const duree = Number(pr.duree_min || r?.duree_min) || 0;
    return [{ heure: soir ? SLOT_TIME.soir : SLOT_TIME.midi, titre: `Au menu : ${pr.titre}`, detail: [duree ? `${duree} min` : '', r ? kcalTxt(r) : '', 'Monsieur Cuisine'].filter(Boolean).join(' · '), icone: ICON.chef, act: 'cmc-recette', data: { id: pr.mc_id } }];
  },
  agenda: (debut, fin) => planning.filter((p) => p.date >= isoDate(debut) && p.date <= isoDate(fin))
    .map((p) => ({ id: `mc:${p.mc_id}`, date: p.date, heure: null, titre: p.titre, detail: 'Repas · Monsieur Cuisine', act: 'cmc-recette', data: { id: p.mc_id } })),
  ajoutRapide: {
    type: 'article',
    libelle: 'Article',
    analyser(texte) {
      const { verbe, items } = analyseArticles(texte);
      if (!items.length) return null;
      return { score: verbe ? 0.81 : 0.26, resume: items.map((a) => (a.qte ? `${a.qte} ${a.nom}` : a.nom)).join(', '), donnees: items };
    },
    async enregistrer(items) {
      for (const a of items) await ajouterArticle(a.nom, a.qte);
      return items.length > 1 ? `${items.length} articles ajoutés aux courses` : 'Ajouté aux courses';
    },
    ouvrir(texte) {
      switchTab('courses');
      setTimeout(() => { const c = $('[data-form="cmc-ajout"] [name="xname"]') || $('[data-form="extra"] [name="xname"]'); if (c) { c.value = texte || ''; c.focus(); } }, 100);
    },
  },
  expose: {
    RAYONS, rayonDe, rayonMc, lireNombre, decouperQuantite, uniteBase, formatQuantite, formatQuantites, uniteLisible, nettoyerNom, cleArticle, estMateriel,
    analyserLigne, construireListe, produitDe, quantitesProduit, formatProduit, cocheActive, texteListe, ingredientsRecette, etapesLisibles, versIngredientCoeur, nutrimentsMc, repasDeLaSemaine, prochainRepas, ilYa, etatLiaison,
    // Pour les tests de bout en bout : simule un changement reçu en direct d'un autre téléphone.
    recevoir,
  },
});
